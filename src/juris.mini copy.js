"use strict";
let jurisLinesOfCode = 2600
  , jurisVersion = "0.91.0"
  , jurisMinifiedSize = "38kB, 12kB gzipped"
  , isValidPath = e => "string" == typeof e && e.trim().length > 0 && !e.includes("..")
  , getPathParts = e => e.split(".").filter(Boolean)
  , deepEquals = (e, t) => {
    if (e === t)
        return !0;
    if (null == e || null == t || typeof e != typeof t)
        return !1;
    if ("object" == typeof e) {
        if (Array.isArray(e) !== Array.isArray(t))
            return !1;
        let s = Object.keys(e)
          , i = Object.keys(t);
        return s.length === i.length && s.every((s => i.includes(s) && deepEquals(e[s], t[s])))
    }
    return !1
}
  , createLogger = () => {
    let e = []
      , t = (t, s, i) => {
        let r = {
            formatted: `${i ? `[${i}] ` : ""}${t}${s ? ` ${JSON.stringify(s)}` : ""}`,
            message: t,
            context: s,
            category: i,
            timestamp: Date.now()
        };
        return setTimeout(( () => e.forEach((e => e(r)))), 0),
        r
    }
    ;
    return {
        log: {
            l: t,
            w: t,
            e: t,
            i: t,
            d: t,
            ei: !0,
            ee: !0,
            el: !0,
            ew: !0,
            ed: !0
        },
        sub: t => e.push(t),
        unsub: t => e.splice(e.indexOf(t), 1)
    }
}
  , {log: log, sub: logSub, unsub: logUnsub} = createLogger()
  , createPromisify = () => {
    let e = new Set
      , t = !1
      , s = new Set
      , i = () => {
        0 === e.size && s.size > 0 && s.forEach((e => e()))
    }
    ;
    return {
        promisify: s => {
            let r = "function" == typeof s?.then ? s : Promise.resolve(s);
            return t && r !== s && (e.add(r),
            r.finally(( () => {
                e.delete(r),
                setTimeout(i, 0)
            }
            ))),
            r
        }
        ,
        startTracking: () => {
            t = !0,
            e.clear()
        }
        ,
        stopTracking: () => {
            t = !1,
            s.clear()
        }
        ,
        onAllComplete: t => (s.add(t),
        0 === e.size && setTimeout(t, 0),
        () => s.delete(t))
    }
}
  , {promisify: promisify, startTracking: startTracking, stopTracking: stopTracking, onAllComplete: onAllComplete} = createPromisify();
class StateManager {
    constructor(e={}, t=[]) {
        this.state = {
            ...e
        },
        this.middleware = [...t],
        this.subscribers = new Map,
        this.extSubs = new Map,
        this.deps = null,
        this.isUpdating = !1,
        this.initialState = JSON.parse(JSON.stringify(e)),
        this.maxUpdateDepth = 50,
        this.updateDepth = 0,
        this.newSubs = new Set,
        this.isBatching = !1,
        this.batchQueue = [],
        this.batchedPaths = new Set,
        this.pathCache = new Map,
        this.maxCacheSize = 500,
        this.plugins = new Map
    }
    addPlugin(e, t) {
        return this.plugins.set(e, t),
        t.initialize && "function" == typeof t.initialize && t.initialize(this),
        t
    }
    getPlugin(e) {
        return this.plugins.get(e)
    }
    hasPlugin(e) {
        return this.plugins.has(e)
    }
    removePlugin(e) {
        let t = this.plugins.get(e);
        return t && t.destroy && "function" == typeof t.destroy && t.destroy(),
        this.plugins.delete(e)
    }
    destroy() {
        this.plugins.forEach(( (e, t) => {
            this.removePlugin(t)
        }
        )),
        this.plugins.clear()
    }
    compute(e, t, s={}) {
        let i = this.getPlugin("compute");
        if (!i)
            throw new Error("Compute plugin not available. Add ComputePlugin via features.compute in Juris config.");
        return i.compute(e, t, s)
    }
    configureCompute(e) {
        let t = this.getPlugin("compute");
        if (!t)
            throw new Error("Compute plugin not available.");
        return t.configureCompute(e)
    }
    getComputeStats(e=null) {
        let t = this.getPlugin("compute");
        return t ? t.getComputeStats(e) : null
    }
    clearCompute(e=null) {
        let t = this.getPlugin("compute");
        t && t.clearCompute(e)
    }
    #e(e) {
        let t = this.pathCache.get(e);
        if (t)
            return t;
        if (t = e.split(".").filter(Boolean),
        this.pathCache.size >= this.maxCacheSize) {
            let e = this.pathCache.keys().next().value;
            this.pathCache.delete(e)
        }
        return this.pathCache.set(e, t),
        t
    }
    track(e, t=!1) {
        let s, i = this.deps, r = t ? null : this.deps = new Set;
        try {
            s = e()
        } finally {
            this.deps = i
        }
        return {
            result: s,
            deps: r ? [...r] : []
        }
    }
    reset() {
        this.isBatching && (this.batchQueue = [],
        this.batchedPaths.clear(),
        this.isBatching = !1),
        this.state = JSON.parse(JSON.stringify(this.initialState)),
        this.pathCache.clear(),
        this.plugins.forEach((e => {
            e.reset && "function" == typeof e.reset && e.reset()
        }
        ))
    }
    getState(e, t=null, s=!0) {
        if (!isValidPath(e))
            return t;
        if (s && this.deps && this.deps.add(e),
        -1 === e.indexOf(".")) {
            let s = this.state[e];
            return void 0 !== s ? s : t
        }
        let i = this.pathCache.get(e);
        i || (i = e.split("."),
        this.pathCache.size >= this.maxCacheSize && this.pathCache.delete(this.pathCache.keys().next().value),
        this.pathCache.set(e, i));
        let r = this.state;
        for (let e = 0; e < i.length; e++)
            if (r = r?.[i[e]],
            void 0 === r)
                return t;
        return r
    }
    setState(e, t, s={}) {
        return !!isValidPath(e) && !this.#t(e) && (!this.#s(e, t) || this.#i(e) !== t) && void (this.isBatching ? this.#r(e, t, s) : this.#n(e, t, s))
    }
    #s(e, t) {
        return ("string" == typeof t || "number" == typeof t || "boolean" == typeof t) && -1 === e.indexOf(".") && 0 === this.middleware.length
    }
    #i(e) {
        return this.state[e]
    }
    executeBatch(e) {
        if (this.isBatching)
            return e();
        this.#o();
        try {
            let t = e();
            return t && "function" == typeof t.then ? t.then((e => (this.#a(),
            e))).catch((e => {
                throw this.#a(),
                e
            }
            )) : (this.#a(),
            t)
        } catch (e) {
            throw this.#a(),
            e
        }
    }
    #o() {
        this.isBatching = !0,
        this.batchQueue = [],
        this.batchedPaths.clear()
    }
    #a() {
        this.isBatching ? (this.isBatching = !1,
        0 !== this.batchQueue.length && this.#l()) : log.ew && console.warn(log.w("endBatch() called without beginBatch()", {}, "framework"))
    }
    isBatchingActive() {
        return this.isBatching
    }
    getBatchQueueSize() {
        return this.batchQueue.length
    }
    clearBatch() {
        this.isBatching && (this.batchQueue = [],
        this.batchedPaths.clear())
    }
    #r(e, t, s) {
        this.batchQueue = this.batchQueue.filter((t => t.path !== e)),
        this.batchQueue.push({
            path: e,
            value: t,
            context: s,
            timestamp: Date.now()
        }),
        this.batchedPaths.add(e)
    }
    #l() {
        let e = [...this.batchQueue];
        this.batchQueue = [],
        this.batchedPaths.clear();
        let t = new Map;
        e.forEach((e => t.set(e.path, e)));
        let s = this.isUpdating;
        this.isUpdating = !0;
        let i = [];
        t.forEach((e => {
            let t = this.getState(e.path, null, !1)
              , s = e.value;
            for (let i of this.middleware)
                try {
                    let r = i({
                        path: e.path,
                        oldValue: t,
                        newValue: s,
                        context: e.context,
                        state: this.state
                    });
                    void 0 !== r && (s = r)
                } catch (t) {
                    log.ee && console.error(log.e("Middleware error in batch", {
                        path: e.path,
                        error: t.message
                    }, "application"))
                }
            deepEquals(t, s) || (this.#h(e.path, s),
            i.push({
                path: e.path,
                oldValue: t,
                newValue: s
            }))
        }
        )),
        this.isUpdating = s;
        let r = new Set;
        i.forEach(( ({path: e}) => {
            let t = this.#e(e);
            for (let e = 1; e <= t.length; e++)
                r.add(t.slice(0, e).join("."))
        }
        )),
        r.forEach((e => {
            this.subscribers.has(e) && this.#c(e),
            this.extSubs.has(e) && this.extSubs.get(e).forEach(( ({callback: t, hierarchical: s}) => {
                try {
                    t(this.getState(e, null, !1), null, e)
                } catch (e) {
                    log.ee && console.error(log.e("External subscriber error:", e), "application")
                }
            }
            ))
        }
        ))
    }
    #n(e, t, s={}) {
        let i = this.getState(e, null, !1)
          , r = t;
        if (this.middleware.length > 0)
            for (let n = 0; n < this.middleware.length; n++)
                try {
                    let t = this.middleware[n]({
                        path: e,
                        oldValue: i,
                        newValue: r,
                        context: s,
                        state: this.state
                    });
                    void 0 !== t && (r = t)
                } catch (t) {
                    log.ee && console.error(log.e("Middleware error", {
                        path: e,
                        error: t.message,
                        middlewareName: middleware.name || "anonymous"
                    }, "application"))
                }
        deepEquals(i, r) ? log.ed && console.debug(log.d("State unchanged, skipping update", {
            path: e
        }, "framework")) : (this.#h(e, r),
        this.isUpdating || (this.isUpdating = !0,
        this.newSubs = this.newSubs || new Set,
        this.newSubs.add(e),
        this.#u(e, r, i),
        this.#p(e, r, i),
        this.newSubs.delete(e),
        this.isUpdating = !1))
    }
    #h(e, t) {
        if (-1 === e.indexOf("."))
            return void (this.state[e] = t);
        let s = this.pathCache.get(e);
        s || (s = e.split("."),
        this.pathCache.size >= this.maxCacheSize && this.pathCache.delete(this.pathCache.keys().next().value),
        this.pathCache.set(e, s));
        let i = this.state
          , r = s.length - 1;
        for (let e = 0; e < r; e++) {
            let t = s[e];
            null != i[t] && "object" == typeof i[t] || (i[t] = {}),
            i = i[t]
        }
        i[s[r]] = t
    }
    subscribe(e, t, s=!0) {
        this.extSubs.has(e) || this.extSubs.set(e, new Set);
        let i = {
            callback: t,
            hierarchical: s
        };
        return this.extSubs.get(e).add(i),
        () => {
            let t = this.extSubs.get(e);
            t && (t.delete(i),
            0 === t.size && this.extSubs.delete(e))
        }
    }
    subscribeExact(e, t) {
        return this.subscribe(e, t, !1)
    }
    subscribeInternal(e, t) {
        return this.subscribers.has(e) || this.subscribers.set(e, new Set),
        this.subscribers.get(e).add(t),
        () => {
            let s = this.subscribers.get(e);
            s && (s.delete(t),
            0 === s.size && this.subscribers.delete(e))
        }
    }
    #u(e, t, s) {
        this.#c(e);
        let i = this.#e(e);
        for (let e = i.length - 1; e > 0; e--)
            this.#c(i.slice(0, e).join("."));
        let r = e ? e + "." : "";
        new Set([...this.subscribers.keys(), ...this.extSubs.keys()]).forEach((t => {
            t.startsWith(r) && t !== e && this.#c(t)
        }
        ))
    }
    #p(e, t, s) {
        this.extSubs.forEach(( (i, r) => {
            i.forEach(( ({callback: i, hierarchical: n}) => {
                if (n ? e === r || e.startsWith(r + ".") : e === r)
                    try {
                        i(t, s, e)
                    } catch (e) {
                        log.ee && console.error(log.e("External subscriber error:", e), "application")
                    }
            }
            ))
        }
        ))
    }
    #c(e) {
        let t = this.subscribers.get(e);
        t && 0 !== t.size && new Set(t).forEach((e => {
            try {
                let {result: t, deps: s} = this.track(( () => e()));
                s.forEach((t => {
                    let s = this.subscribers.get(t);
                    s || (s = new Set,
                    this.subscribers.set(t, s)),
                    s.has(e) || s.add(e)
                }
                ))
            } catch (e) {
                log.ee && console.error(log.e("Subscriber error:", e), "application")
            }
        }
        ))
    }
    #t(e) {
        return this.newSubs || (this.newSubs = new Set),
        !!this.newSubs.has(e) && (log.ew && console.warn(log.w("Circular dependency detected", {
            path: e
        }, "framework")),
        !0)
    }
    startTracking() {
        let e = new Set;
        return this.deps = e,
        e
    }
    endTracking() {
        let e = this.deps;
        return this.deps = null,
        e || new Set
    }
}
class ComponentManager {
    constructor(e) {
        this.juris = e,
        this.components = new Map,
        this.insts = new Map,
        this.namedComps = new Map,
        this.comps = new Map,
        this.componentStates = new Map,
        this.placeholders = new Map,
        this.asyncPropsCache = new Map
    }
    register(e, t) {
        this.components.set(e, t)
    }
    getAsyncStats() {
        return {
            placeholders: this.placeholders.size,
            cachedAsyncProps: this.asyncPropsCache.size
        }
    }
    create(e, t={}, s=null) {
        let i = this.components.get(e);
        if (!i)
            return log.ee && console.error(log.e("Component not found", {
                name: e
            }, "application")),
            null;
        try {
            if (this.juris.getDR()._hasAsyncProps(t))
                return this.#d(e, i, t, s);
            let {comptId: r, componentStates: n, context: o} = this.#g(e)
              , a = this.#m(i, t, o);
            return a?.then ? this.#f(promisify(a), e, t, n, s) : this.#y(a, e, t, n, s)
        } catch (t) {
            return log.ee && console.error(log.e("Component creation failed!", {
                name: e,
                error: t.message
            }, "application")),
            this.#b(e, t)
        }
    }
    #m(e, t, s) {
        let i = e.toString().match(/^[^(]*\(([^)]*)\)/);
        if (!i || !i[1].trim())
            return e();
        let r = i[1].split(",").map((e => e.trim()));
        if (1 === r.length) {
            let i = r[0];
            return i.startsWith("{") && i.includes("}") || "props" === i || "prp" === i ? e(t) : e(s)
        }
        return e(t, s)
    }
    #g(e) {
        let {comptId: t, componentStates: s} = this.#C(e);
        return {
            comptId: t,
            componentStates: s,
            context: this.#S(t, s)
        }
    }
    #C(e) {
        this.comps.has(e) || this.comps.set(e, 0);
        let t = this.comps.get(e) + 1;
        return this.comps.set(e, t),
        {
            comptId: `${e}#${t}`,
            componentStates: new Set
        }
    }
    #S(e, t) {
        const s = this.juris.createContext();
        return s.newState = (s, i) => {
            const r = `##local.${e}.${s}`;
            return null === this.juris.stateManager.getState(r) && this.juris.stateManager.setState(r, i),
            t.add(r),
            [ () => this.juris.stateManager.getState(r, i), e => this.juris.stateManager.setState(r, e), e => this.juris.stateManager.subscribe(r, e)]
        }
        ,
        s
    }
    #d(e, t, s, i=null) {
        let r = i || this.#w(e, "async-props-loading");
        return this.placeholders.set(r, {
            name: e,
            props: s,
            type: "async-props"
        }),
        this.#v(s).then((s => {
            try {
                let n = this.#x(e, t, s, i);
                i ? (i.innerHTML = "",
                n !== i && i.appendChild(n)) : this.#M(r, n)
            } catch (e) {
                this.#E(r, e)
            }
        }
        )).catch((e => this.#E(r, e))),
        r
    }
    async #v(e) {
        let t = this.#k(e)
          , s = this.asyncPropsCache.get(t);
        if (s && Date.now() - s.timestamp < 5e3)
            return s.props;
        let i = {}
          , r = Object.keys(e);
        for (let t = 0; t < r.length; t++) {
            let s = r[t]
              , n = e[s];
            if (n?.then)
                try {
                    i[s] = await n
                } catch (e) {
                    i[s] = {
                        __asyncError: e.message
                    }
                }
            else
                i[s] = n
        }
        return this.asyncPropsCache.set(t, {
            props: i,
            timestamp: Date.now()
        }),
        i
    }
    #x(e, t, s, i=null) {
        let {comptId: r, componentStates: n, context: o} = this.#g(e)
          , a = this.#m(t, s, o);
        return a?.then ? this.#f(promisify(a), e, s, n, i) : this.#y(a, e, s, n, i)
    }
    #f(e, t, s, i, r=null) {
        let n = r || this.#w(t, "async-loading");
        return this.placeholders.set(n, {
            name: t,
            props: s,
            states: i
        }),
        e.then((e => {
            try {
                let o = this.#y(e, t, s, i, r);
                r ? (r.innerHTML = "",
                o !== r && r.appendChild(o)) : this.#M(n, o)
            } catch (e) {
                log.ee && console.error(log.e("Async component failed", {
                    name: t,
                    error: e.message
                }, "application")),
                this.#E(n, e)
            }
        }
        )).catch((e => this.#E(n, e))),
        n
    }
    #y(e, t, s, i, r=null) {
        if (Array.isArray(e))
            return this.#T(e, t, s, i);
        if (!e || "object" != typeof e) {
            let s = this.juris.getDR().render(e, t);
            return this.#j(s, t, i, e)
        }
        if (this.#A(e) || "function" == typeof e.render)
            return this.#_(e, t, s, i, r);
        let n = Object.keys(e);
        if (1 === n.length && "string" == typeof n[0] && n[0].length > 0) {
            let s = this.juris.getDR().render(e, t);
            return this.#j(s, t, i, e)
        }
        let o = this.juris.getDR().render(e, t);
        return this.#j(o, t, i, e)
    }
    #_(e, t, s, i, r=null) {
        let n = this.#N(e, t, s)
          , o = document.createElement("div")
          , a = !!r;
        a || (o.setAttribute("data-juris-component", t),
        o.setAttribute("data-juris-rendertime", Date.now()));
        let l = () => {
            o._reactiveSubscriptions && (o._reactiveSubscriptions.forEach((e => e())),
            o._reactiveSubscriptions = []);
            let {result: s, deps: i} = this.juris.getSM().track(( () => n.render ? n.render(o) : e));
            s?.then ? (o.innerHTML = '<div class="juris-loading">Loading...</div>',
            promisify(s).then((e => {
                this.#P(o, e, t, a)
            }
            )).catch((e => {
                log.ee && console.error(`Async render error for ${t}:`, e),
                o.innerHTML = `<div class="juris-error">Render Error: ${e.message}</div>`
            }
            ))) : s ? this.#P(o, s, t, a) : o.appendChild(this.#b(t, {
                message: "Component cannot return empty"
            })),
            i.forEach((e => {
                let t = this.juris.getSM().subscribeInternal(e, l);
                o._reactiveSubscriptions || (o._reactiveSubscriptions = []),
                o._reactiveSubscriptions.push(t)
            }
            ))
        }
        ;
        return l(),
        this.#H(o, n, i, t, a),
        o
    }
    #P(e, t, s, i) {
        Array.from(e.children).forEach((e => this.cleanup(e))),
        e.innerHTML = "";
        let r = this.juris.getDR().render(t);
        e.appendChild(r)
    }
    #H(e, t, s, i, r=!1) {
        t.isExternalContainer = r,
        this.insts.set(e, t),
        s?.size > 0 && this.componentStates.set(e, s),
        t.api && "object" == typeof t.api && (e.api = t.api,
        this.namedComps.set(i, {
            elm: e,
            instance: t
        }));
        let n = t.hooks || {};
        if (n.onMount || t.onMount) {
            let s = n.onMount || t.onMount;
            setTimeout(( () => this.#O(s, e, i, "onMount")), 0)
        }
    }
    #j(e, t, s, i) {
        return e && s.size > 0 && this.componentStates.set(e, s),
        i.api && "object" == typeof i.api && e && (e.api = i.api),
        e && e.setAttribute && (e.setAttribute("data-juris-component", t),
        e._jurisComponent = t),
        e
    }
    #T(e, t, s, i, r) {
        let n = r || document.createDocumentFragment()
          , o = this.#L(n, t, s)
          , a = [];
        return this.juris.getDR()._handleChildren(o, e, a),
        n._jurisComponent = {
            name: t,
            props: s,
            virtual: o,
            cleanup: () => {
                a.forEach((e => {
                    try {
                        e()
                    } catch (e) {}
                }
                ))
            }
        },
        i?.size > 0 && (n._juriscomponentStates = i),
        n
    }
    #N(e, t, s) {
        return {
            name: t,
            props: s,
            hooks: e.hooks || {
                onMount: e.onMount,
                onUpdate: e.onUpdate,
                onUnmount: e.onUnmount
            },
            api: e.api || {},
            render: e.render
        }
    }
    #O(e, t, s, i) {
        try {
            let r = Array.isArray(t) ? e(...t) : e(t);
            r?.then && promisify(r).catch((e => log.ee && console.error(log.e(`Async ${i} error in ${s}:`, e), "application")))
        } catch (e) {
            log.ee && console.error(log.e(`${i} error in ${s}:`, e), "application")
        }
    }
    #L(e, t, s) {
        let i = {
            _isVirtual: !0,
            _fragment: e,
            _componentName: t,
            _componentProps: s,
            appendChild: t => e.appendChild(t),
            removeChild: t => {
                t.parentNode === e && e.removeChild(t)
            }
            ,
            replaceChild: (t, s) => {
                s.parentNode === e && e.replaceChild(t, s)
            }
            ,
            get children() {
                return Array.from(e.childNodes)
            },
            get parentNode() {
                return null
            },
            textContent: ""
        };
        return Object.defineProperty(i, "textContent", {
            set(t) {
                for (; e.firstChild; )
                    e.removeChild(e.firstChild);
                t && e.appendChild(document.createTextNode(t))
            },
            get: () => ""
        }),
        i
    }
    #w(e, t) {
        let s = document.createElement("div");
        return s.id = e.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        this._createPlaceholder(`Loading ${e}...`, t, s)
    }
    #M(e, t) {
        t && e.parentNode && e.parentNode.replaceChild(t, e),
        this.placeholders.delete(e)
    }
    #E(e, t) {
        let s = this.#b(e._jurisComponent?.name || "Unknown Component", t);
        e.parentNode && e.parentNode.replaceChild(s, e),
        this.placeholders.delete(e)
    }
    #b(e, t) {
        let s = document.createElement("div");
        return s.style.cssText = "color: red; border: 1px solid red; padding: 8px; background: #ffe6e6; font-family: monospace;",
        s.textContent = `Component Error in ${e}: ${t.message}`,
        s
    }
    #A(e) {
        return e.hooks && (e.hooks.onMount || e.hooks.onUpdate || e.hooks.onUnmount) || e.onMount || e.onUpdate || e.onUnmount
    }
    #k(e) {
        return JSON.stringify(e, ( (e, t) => t?.then ? "[Promise]" : t))
    }
    cleanup(e) {
        if (e instanceof DocumentFragment)
            return void this.#R(e);
        let t = this.insts.get(e);
        if (t?.hooks?.onUnmount && this.#O(t.hooks.onUnmount, e, t.name, "onUnmount"),
        e._reactiveSubscriptions && (e._reactiveSubscriptions.forEach((e => {
            try {
                e()
            } catch (e) {
                log.ew && console.warn("Error cleaning up reactive subscription:", e)
            }
        }
        )),
        e._reactiveSubscriptions = []),
        t?.isExternalContainer) {
            let t = this.componentStates.get(e);
            t && (this.#D(t),
            this.componentStates.delete(e))
        } else
            this.#I(e);
        this.placeholders.has(e) && this.placeholders.delete(e),
        this.insts.delete(e)
    }
    #R(e) {
        e._jurisComponent?.cleanup && e._jurisComponent.cleanup(),
        e._juriscomponentStates && this.#D(e._juriscomponentStates)
    }
    #I(e) {
        let t = this.componentStates.get(e);
        t && (this.#D(t),
        this.componentStates.delete(e))
    }
    #D(e) {
        e.forEach((e => {
            let t = e.split(".")
              , s = this.juris.getSM().state;
            for (let e = 0; e < t.length - 1; e++) {
                if (!s[t[e]])
                    return;
                s = s[t[e]]
            }
            delete s[t[t.length - 1]]
        }
        ))
    }
    getComponent(e) {
        return this.namedComps.get(e)?.instance || null
    }
    getComponentAPI(e) {
        return this.namedComps.get(e)?.instance?.api || null
    }
    getComponentElement(e) {
        return this.namedComps.get(e)?.elm || null
    }
    getNamedComponents() {
        return Array.from(this.namedComps.keys())
    }
    clearAsyncPropsCache() {
        this.asyncPropsCache.clear()
    }
    _createPlaceholder(e, t, s=null) {
        let i = this.juris.getDR()._getPlaceholderConfig(s)
          , r = document.createElement("div");
        return r.className = i.className,
        r.textContent = i.text,
        i.style && (r.style.cssText = i.style),
        r
    }
}
class DOMRenderer {
    constructor(e) {
        this.juris = e,
        this.subscriptions = new WeakMap,
        this.keyedNodes = new WeakMap,
        this.nodeKeys = new WeakMap,
        this.placeholders = new WeakMap,
        this.placeholderConfigs = new Map,
        this.componentStack = [],
        this.objTreeAnalyzer = null,
        this.SKIP_ATTRS = new Set(["children", "key"]),
        this.BOOLEAN_ATTRS = new Set(["autofocus", "autoplay", "checked", "controls", "defer", "disabled", "hidden", "loop", "multiple", "muted", "open", "readonly", "required", "reversed", "selected"]),
        this.elementTypeCache = new Map,
        this.defaultPlaceholder = {
            className: "juris-async-loading",
            style: "padding: 8px; background: #f0f0f0; border: 1px dashed #ccc; opacity: 0.7;",
            text: "Loading...",
            children: null,
            errorClassName: "juris-async-error",
            errorStyle: "color: red; padding: 8px; background: #ffe6e6;"
        },
        this.TOUCH_CONFIG = {
            moveThreshold: 10,
            timeThreshold: 300,
            touchAction: "manipulation",
            tapHighlight: "transparent",
            touchCallout: "none"
        },
        this.cleanupTimeout = null,
        this._testMode = !1,
        this._lastObjectTree = null
    }
    #z = (e, t={}, s={}) => {
        if (!this.#U(e))
            throw new Error("handleAsync called with non-promise value. Use #isPromiseLike check first.");
        let {onStart: i=( () => {}
        ), onResolved: r=( () => {}
        ), onError: n=(e => {
            log.ee && console.error(log.e("Async operation failed:", e), "application")
        }
        ), onFinally: o=( () => {}
        )} = t;
        return s.elm && s.type && this.#$(s.elm, s.type, s),
        i(),
        promisify(e).then((e => (s.elm && s.type && this.#B(s.elm),
        r(e),
        e))).catch((e => {
            throw s.elm && s.type && this.#F(s.elm, s.type, e, s),
            n(e),
            e
        }
        )).finally(( () => {
            o()
        }
        ))
    }
    ;
    #$(e, t, s={}) {
        let i = this._getPlaceholderConfig(e);
        switch (t) {
        case "children":
        case "reactive-children":
        case "fragment-child":
            this.#W(e, i);
            break;
        case "text":
            this.#V(e, i);
            break;
        case "attribute":
            this.#Q(e, i, s.attributeName);
            break;
        case "style":
            this.#q(e, i);
            break;
        case "component":
            return this.#J(i, s.componentName)
        }
    }
    #W(e, t) {
        let s;
        e.innerHTML = "",
        t.children ? s = this.render(t.children) : (s = document.createElement("div"),
        s.className = t.className,
        s.textContent = t.text,
        t.style && (s.style.cssText = t.style)),
        e.appendChild(s),
        this.placeholders.set(e, {
            type: "children",
            placeholder: s,
            originalContent: e._jurisLastChildren
        })
    }
    #V(e, t) {
        let s = e.textContent;
        e.textContent = t.text,
        e.classList.add(t.className),
        t.style && (e.setAttribute("data-juris-original-style", e.style.cssText),
        e.style.cssText = t.style),
        this.placeholders.set(e, {
            type: "text",
            originalText: s,
            hadStyle: !!t.style
        })
    }
    #Q(e, t, s) {
        if (e.classList.add(t.className),
        s) {
            let t = e.getAttribute(s);
            e.setAttribute(s, "loading"),
            this.placeholders.set(e, {
                type: "attribute",
                attributeName: s,
                originalValue: t
            })
        }
    }
    #q(e, t) {
        e.classList.add(t.className);
        let s = e.style.cssText;
        t.style && (e.style.cssText = t.style),
        this.placeholders.set(e, {
            type: "style",
            originalStyle: s
        })
    }
    #J(e, t) {
        let s = document.createElement("div");
        return s.className = e.className,
        s.textContent = t ? `Loading ${t}...` : e.text,
        e.style && (s.style.cssText = e.style),
        s.setAttribute("data-juris-placeholder", "component"),
        s
    }
    #B(e) {
        let t = this.placeholders.get(e);
        if (!t)
            return;
        let s = this._getPlaceholderConfig(e);
        switch (e.classList.remove(s.className),
        t.type) {
        case "children":
            t.placeholder && t.placeholder.parentNode === e && e.removeChild(t.placeholder);
            break;
        case "text":
            if (t.hadStyle) {
                let t = e.getAttribute("data-juris-original-style");
                e.style.cssText = t || "",
                e.removeAttribute("data-juris-original-style")
            }
            break;
        case "style":
            e.style.cssText = t.originalStyle || ""
        }
        this.placeholders.delete(e)
    }
    #F(e, t, s, i={}) {
        let r = this._getPlaceholderConfig(e);
        this.#B(e);
        let n = `Error: ${s.message}`;
        switch (t) {
        case "children":
        case "reactive-children":
        case "fragment-child":
            e.innerHTML = `<div class="${r.errorClassName}" style="${r.errorStyle}">${n}</div>`;
            break;
        case "text":
            e.textContent = n,
            e.classList.add(r.errorClassName),
            r.errorStyle && (e.style.cssText = r.errorStyle);
            break;
        case "attribute":
            e.classList.add(r.errorClassName),
            i.attributeName && (e.setAttribute(i.attributeName, "error"),
            e.setAttribute("data-juris-error", n));
            break;
        case "style":
            e.classList.add(r.errorClassName),
            r.errorStyle && (e.style.cssText = r.errorStyle)
        }
    }
    #K(e, t, s, i={}) {
        let r = i.trackChanges ? null : void 0
          , n = !1;
        return () => {
            try {
                let o = t();
                if (!this.#U(o))
                    return i.trackChanges && n && deepEquals(o, r) || (s(o),
                    i.trackChanges && (r = o,
                    n = !0)),
                    o;
                let a = {
                    elm: e,
                    type: i.type || "generic",
                    attributeName: i.attributeName
                };
                return this.#z(o, {
                    onResolved: e => {
                        i.trackChanges && n && deepEquals(e, r) || (s(e),
                        i.trackChanges && (r = e,
                        n = !0))
                    }
                    ,
                    onError: e => {
                        i.onError ? i.onError(e) : log.ee && console.error(log.e(`Error in reactive ${i.name}:`, e), "application")
                    }
                }, a)
            } catch (e) {
                i.onError ? i.onError(e) : log.ee && console.error(log.e(`Error in reactive ${i.name}:`, e), "application")
            }
        }
    }
    #G(e, t) {
        if ("string" == typeof e || "number" == typeof e || !e)
            return null;
        if (Array.isArray(e))
            return null;
        if ("object" == typeof e) {
            let t = e[Object.keys(e)[0]];
            return t?.key ?? null
        }
        return null
    }
    #X(e, t, s) {
        if (0 === t.length && 0 === s.length)
            return;
        let i = []
          , r = new Map
          , n = new Map
          , o = new Set;
        Array.from(e.childNodes).forEach(( (e, t) => {
            let s = this.nodeKeys.get(e);
            void 0 !== s ? r.set(s, {
                node: e,
                index: t
            }) : r.set(`__index_${t}`, {
                node: e,
                index: t
            })
        }
        ));
        for (let t = 0; t < s.length; t++) {
            let a = s[t]
              , l = this.#G(a, t) ?? `__index_${t}`;
            if (o.has(l) && !l.startsWith("__index_")) {
                log.ew && console.warn(log.w(`Duplicate key "${l}" detected. Keys must be unique among siblings.`, {
                    parent: e.tagName,
                    key: l
                }, "framework"));
                let s = `__index_${t}`;
                n.set(s, {
                    child: a,
                    index: t
                }),
                i.push({
                    type: "create",
                    child: a,
                    index: t,
                    key: s
                })
            } else if (o.add(l),
            n.set(l, {
                child: a,
                index: t
            }),
            r.has(l)) {
                let e = r.get(l);
                this.#Y(e.node, a) && i.push({
                    type: "update",
                    node: e.node,
                    child: a,
                    index: t,
                    key: l
                }),
                e.index !== t && i.push({
                    type: "move",
                    node: e.node,
                    from: e.index,
                    to: t,
                    key: l
                })
            } else
                i.push({
                    type: "create",
                    child: a,
                    index: t,
                    key: l
                })
        }
        r.forEach(( (e, t) => {
            n.has(t) || i.push({
                type: "remove",
                node: e.node,
                key: t
            })
        }
        )),
        this.#Z(e, i, s)
    }
    #Y(e, t) {
        return e.nodeType === Node.TEXT_NODE ? e.textContent !== String(t) : e.nodeType === Node.ELEMENT_NODE
    }
    #Z(e, t, s) {
        t.filter((e => "remove" === e.type)).forEach((t => {
            t.node.parentNode === e && (e.removeChild(t.node),
            this.nodeKeys.delete(t.node),
            this.cleanup(t.node))
        }
        ));
        let i = new Map;
        t.filter((e => "create" === e.type)).forEach((e => {
            let t = this.#ee(e.child);
            t && (i.set(e.key, t),
            e.key && "string" == typeof e.key && !e.key.startsWith("__") && this.nodeKeys.set(t, e.key))
        }
        )),
        t.filter((e => "update" === e.type)).forEach((e => {
            this.#te(e.node, e.child)
        }
        ));
        let r = [];
        s.forEach(( (e, s) => {
            let n = this.#G(e, s) ?? `__index_${s}`
              , o = t.find((e => e.key === n && ("update" === e.type || "move" === e.type)));
            o ? r.push(o.node) : i.has(n) && r.push(i.get(n))
        }
        )),
        this.#se(e, r)
    }
    #te(e, t) {
        if (e.nodeType !== Node.TEXT_NODE) {
            if (e.nodeType === Node.ELEMENT_NODE && "object" == typeof t && !Array.isArray(t)) {
                let s = t[Object.keys(t)[0]] || {}
                  , i = [];
                for (let t in s) {
                    if ("key" === t)
                        continue;
                    let r = this.applyProp(e, t, s[t]);
                    r && "function" == typeof r && i.push(r)
                }
                if (i.length > 0) {
                    let t = this.subscriptions.get(e) || {
                        subscriptions: [],
                        eventListeners: []
                    };
                    t.subscriptions.push(...i),
                    this.subscriptions.set(e, t)
                }
            }
        } else {
            let s = String(t);
            e.textContent !== s && (e.textContent = s)
        }
    }
    #se(e, t) {
        let s = null;
        for (let i = t.length - 1; i >= 0; i--) {
            let r = t[i];
            r && (r.parentNode === e ? s && r.nextSibling !== s ? e.insertBefore(r, s) : s || r === e.lastChild || e.appendChild(r) : s ? e.insertBefore(r, s) : e.appendChild(r),
            s = r)
        }
    }
    render(e, t=null, s=!1, i=null) {
        return "string" == typeof e || "number" == typeof e ? document.createTextNode(String(e)) : this._testMode && s && this.objTreeAnalyzer ? this.objTreeAnalyzer.buildObjectTree(e, t) : this._renderToDOM(e, t, i)
    }
    _renderToDOM(e, t=null, s=null) {
        if ("string" == typeof e || "number" == typeof e)
            return document.createTextNode(String(e));
        if (!e || "object" != typeof e)
            return null;
        if (Array.isArray(e))
            return this.#ie(e, t);
        let i = Object.keys(e)[0]
          , r = e[i] || {};
        if (this.componentStack.includes(i))
            return this.#b("recursion", [...this.componentStack, i].join(" → "));
        if (this.juris.getCM().components.has(i))
            return this.#re(i, r, s);
        if (/^[A-Z]/.test(i))
            return this.#b("component", `Component "${i}" not registered`);
        if ("string" != typeof i || 0 === i.length)
            return null;
        let n = r;
        if (r.style && this.cssExtractor) {
            let e = t || i;
            n = this.cssExtractor.processProps(r, e, this)
        }
        return this.#ne(i, n, t)
    }
    #ne(e, t, s=null) {
        let i = this.#oe(e)
          , r = [];
        for (let e in t) {
            if (!t.hasOwnProperty(e) || "key" === e)
                continue;
            let n = this.applyProp(i, e, t[e], s);
            n && "function" == typeof n && r.push(n)
        }
        if (r.length > 0) {
            let e = this.subscriptions.get(i) || {
                subscriptions: [],
                eventListeners: []
            };
            e.subscriptions.push(...r),
            this.subscriptions.set(i, e)
        }
        return i
    }
    #oe(e) {
        let t = this.elementTypeCache.get(e);
        if (void 0 === t)
            try {
                let s = document.createElementNS("http://www.w3.org/2000/svg", e);
                t = !["a", "script", "style", "title"].includes(e) && s.constructor !== SVGElement,
                this.elementTypeCache.set(e, t)
            } catch {
                t = !1,
                this.elementTypeCache.set(e, !1)
            }
        return t ? document.createElementNS("http://www.w3.org/2000/svg", e) : document.createElement(e)
    }
    #ie(e, t) {
        let s = e.some((e => "function" == typeof e))
          , i = e.some((e => null !== this.#G(e)));
        if (s || i) {
            let r = document.createDocumentFragment()
              , n = [];
            if (i && !s)
                for (let s = 0; s < e.length; s++) {
                    let i = e[s]
                      , n = this.render(i, t);
                    if (n) {
                        let e = this.#G(i, s);
                        e && this.nodeKeys.set(n, e),
                        r.appendChild(n)
                    }
                }
            else
                this.#ae(r, e, n, t);
            return n.length > 0 && (r._jurisCleanup = () => {
                n.forEach((e => {
                    try {
                        e()
                    } catch (e) {}
                }
                ))
            }
            ),
            r
        }
        let r = document.createDocumentFragment();
        for (let s = 0; s < e.length; s++) {
            let i = this.render(e[s], t);
            i && r.appendChild(i)
        }
        return r
    }
    #re(e, t, s=null) {
        if (!this.juris.getCM().components.get(e))
            return log.ee && console.error(log.e("Component not found", {
                name: e
            }, "application")),
            null;
        if (this.componentStack.includes(e))
            return this.#b("recursion", [...this.componentStack, e].join(" → "));
        this.componentStack.push(e);
        let {result: i, deps: r} = this.juris.getSM().track(( () => this.juris.getCM().create(e, t, s)), !0);
        return this.componentStack.pop(),
        i
    }
    #b(e, t) {
        let s = document.createElement("div");
        return s.style.cssText = "color: red; border: 1px solid red; padding: 8px; background: #ffe6e6; font-family: monospace;",
        s.textContent = t,
        s.setAttribute("data-juris-error", e),
        s
    }
    applyProp(e, t, s, i=null) {
        let r = []
          , n = [];
        if ("children" === t ? this._handleChildren(e, s, r, i) : "text" === t ? this._handleText(e, s, r) : "style" === t ? this._handleStyle(e, s, r) : t.startsWith("on") ? this._handleEvent(e, t, s, n) : "function" == typeof s ? this._handleReactiveAttribute(e, t, s, r) : this.#U(s) ? this.#le(e, t, s) : this._setStaticAttribute(e, t, s),
        r.length > 0 || n.length > 0) {
            let t = this.subscriptions.get(e) || {
                subscriptions: [],
                eventListeners: []
            };
            t.subscriptions.push(...r),
            t.eventListeners.push(...n),
            this.subscriptions.set(e, t)
        }
        return () => {
            r.forEach((e => {
                try {
                    e()
                } catch (e) {}
            }
            )),
            n.forEach(( ({eventName: t, handler: s}) => {
                try {
                    e.removeEventListener(t, s)
                } catch (e) {}
            }
            ))
        }
    }
    #le(e, t, s) {
        let i = {
            elm: e,
            type: "attribute",
            attributeName: t
        };
        return "innerHTML" === t ? (i.type = "children",
        this.#z(s, {
            onResolved: t => {
                e.innerHTML = t
            }
        }, i)) : this.#z(s, {
            onResolved: s => {
                this._setStaticAttribute(e, t, s)
            }
        }, i)
    }
    _handleText(e, t, s) {
        if ("function" == typeof t) {
            let i = this.#K(e, ( () => t(e)), (t => {
                e.textContent = t
            }
            ), {
                trackChanges: !0,
                name: "text",
                type: "text"
            });
            this._createReactiveUpdate(e, i, s)
        } else if (this.#U(t)) {
            let s = {
                elm: e,
                type: "text"
            };
            this.#z(t, {
                onResolved: t => {
                    e.textContent = t
                }
            }, s)
        } else
            e.textContent = t
    }
    _handleStyle(e, t, s) {
        if ("function" == typeof t) {
            let i = this.#K(e, ( () => {
                let s = t.length > 0 ? t(e) : t();
                return this.cssExtractor?.postProcessReactiveResult && "object" == typeof s && (s = this.cssExtractor.postProcessReactiveResult(s, "reactive", e)),
                s
            }
            ), (t => {
                "object" == typeof t && Object.assign(e.style, t)
            }
            ), {
                trackChanges: !0,
                name: "style",
                type: "style"
            });
            this._createReactiveUpdate(e, i, s)
        } else if (this.#U(t)) {
            let s = {
                elm: e,
                type: "style"
            };
            this.#z(t, {
                onResolved: t => {
                    "object" == typeof t && Object.assign(e.style, t)
                }
            }, s)
        } else if ("object" == typeof t)
            for (let i in t)
                if (t.hasOwnProperty(i)) {
                    let r = t[i];
                    "function" == typeof r ? this.#he(e, i, r, s) : this.#ce(e, i, r)
                }
    }
    #he(e, t, s, i) {
        let r = this.#K(e, ( () => s(e)), (s => this.#ce(e, t, s)), {
            trackChanges: !0,
            name: `style.${t}`,
            type: "style"
        });
        this._createReactiveUpdate(e, r, i)
    }
    _handleReactiveAttribute(e, t, s, i) {
        let r = this.#K(e, ( () => s(e)), (s => this._setStaticAttribute(e, t, s)), {
            trackChanges: !0,
            name: `attribute '${t}'`,
            type: "attribute",
            attributeName: t
        });
        this._createReactiveUpdate(e, r, i)
    }
    _handleChildren(e, t, s, i=null) {
        if ("function" == typeof t) {
            let r = this.#K(e, ( () => {
                let s = t(e);
                return Array.isArray(s) ? s : [s]
            }
            ), (t => {
                "ignore" !== t && ("string" == typeof t || "number" == typeof t ? e.textContent = String(t) : this.#ue(e, t, i))
            }
            ), {
                trackChanges: !1,
                name: "children",
                type: "reactive-children"
            });
            this._createReactiveUpdate(e, r, s)
        } else if (this.#U(t)) {
            let s = {
                elm: e,
                type: "children"
            };
            this.#z(t, {
                onResolved: t => {
                    this.#ue(e, t, i)
                }
            }, s)
        } else
            this.#ue(e, t, i)
    }
    #ue(e, t, s=null) {
        if ("ignore" === t)
            return;
        Array.isArray(t) || (t = [t]);
        let i = e._jurisLastChildren;
        i !== t && (e._jurisChildrenKeyed || (e._jurisChildrenKeyed = t.some((e => null !== this.#G(e)))),
        e._jurisChildrenKeyed && i && Array.isArray(i) ? this.#X(e, i, t) : this.#pe(e, t, s),
        e._jurisLastChildren = t)
    }
    #ae(e, t, s, i) {
        for (let r = 0; r < t.length; r++) {
            let n = t[r];
            if ("function" == typeof n) {
                let {node: t, cleanup: o} = this.#de(n, r, i, e);
                t && (e.appendChild(t),
                s.push(o))
            } else if (null != n) {
                let t = this.#ee(n, i);
                if (t) {
                    let s = this.#G(n, r);
                    s && this.nodeKeys.set(t, s),
                    e.appendChild(t)
                }
            }
        }
    }
    #de(e, t, s, i) {
        let r = this._getPlaceholderConfig(i)
          , n = document.createTextNode("")
          , o = []
          , a = () => {
            o.forEach((e => {
                try {
                    e()
                } catch (e) {}
            }
            )),
            o = [];
            let {result: t, deps: l} = this.juris.getSM().track(( () => e(i)));
            if (this.#U(t))
                this.#z(t, {
                    onStart: () => {
                        let e = document.createElement("span");
                        e.textContent = r.text,
                        e.className = r.className,
                        r.style && (e.style.cssText = r.style),
                        n.parentNode && n.parentNode.replaceChild(e, n),
                        n = e
                    }
                    ,
                    onResolved: e => {
                        let t = this.#ee(e, s) || document.createTextNode("");
                        n.parentNode && n.parentNode.replaceChild(t, n),
                        n = t
                    }
                    ,
                    onError: e => {
                        let t = document.createElement("span");
                        t.className = r.errorClassName,
                        t.textContent = `Error: ${e.message}`,
                        n.parentNode && n.parentNode.replaceChild(t, n),
                        n = t
                    }
                });
            else
                try {
                    let e = this.#ee(t, s) || document.createTextNode("");
                    n.parentNode && n.parentNode.replaceChild(e, n),
                    n = e
                } catch (e) {
                    let t = document.createElement("span");
                    t.className = r.errorClassName,
                    t.textContent = `Error: ${e.message}`,
                    n.parentNode && n.parentNode.replaceChild(t, n),
                    n = t
                }
            l.forEach((e => {
                let t = this.juris.getSM().subscribeInternal(e, a);
                o.push(t)
            }
            ))
        }
        ;
        return a(),
        {
            node: n,
            cleanup: () => {
                o.forEach((e => {
                    try {
                        e()
                    } catch (e) {}
                }
                )),
                o = []
            }
        }
    }
    #ee(e, t) {
        if (null == e)
            return null;
        if ("string" == typeof e || "number" == typeof e)
            return document.createTextNode(String(e));
        if (Array.isArray(e)) {
            let s = document.createDocumentFragment();
            for (let i = 0; i < e.length; i++) {
                let r = this.#ee(e[i], t);
                r && s.appendChild(r)
            }
            return s.hasChildNodes() ? s : null
        }
        if ("object" == typeof e && null !== e) {
            let s = Object.keys(e)[0]
              , i = e[s] || {};
            if (this.juris.getCM().components.has(s)) {
                let e = document.createElement("div")
                  , t = this.#re(s, i, e);
                if (e.firstChild) {
                    let t = document.createDocumentFragment();
                    for (; e.firstChild; )
                        t.appendChild(e.firstChild);
                    return t
                }
                return t || null
            }
            return this.render(e, t)
        }
        return null
    }
    #pe(e, t, s) {
        e.textContent = "";
        let i = document.createDocumentFragment()
          , r = [];
        for (let n = 0; n < t.length; n++) {
            let o = t[n];
            if ("function" == typeof o) {
                let {node: t, cleanup: a} = this.#de(o, n, s, e);
                t && (i.appendChild(t),
                r.push(a))
            } else if (null != o) {
                let e = this.#ee(o, s);
                if (e) {
                    let t = this.#G(o, n);
                    t && this.nodeKeys.set(e, t),
                    i.appendChild(e)
                }
            }
        }
        i.hasChildNodes() && e.appendChild(i),
        r.length > 0 && (e._reactiveCleanup = () => {
            r.forEach((e => {
                try {
                    e()
                } catch (e) {}
            }
            ))
        }
        )
    }
    #ce(e, t, s) {
        t.startsWith("--") ? e.style.setProperty(t, s) : e.style[t] = s
    }
    _setStaticAttribute(e, t, s) {
        if (this.SKIP_ATTRS.has(t))
            return;
        if (this.BOOLEAN_ATTRS.has(t)) {
            let i = s && "false" !== s;
            return i ? e.setAttribute(t, "") : e.removeAttribute(t),
            void (t in e && (e[t] = i))
        }
        if ("http://www.w3.org/2000/svg" === e.namespaceURI)
            return void e.setAttribute(t, s);
        if (new Set(["list", "form", "labels"]).has(t))
            return void e.setAttribute(t, s);
        let i = t.charCodeAt(0);
        if (100 === i && 45 === t.charCodeAt(4) || 97 === i && 45 === t.charCodeAt(4) || -1 !== t.indexOf("-") || -1 !== t.indexOf(":"))
            e.setAttribute(t, s);
        else if (t in e && "function" != typeof e[t])
            try {
                e[t] = s
            } catch (i) {
                e.setAttribute(t, s)
            }
        else
            e.setAttribute(t, s)
    }
    _handleEvent(e, t, s, i) {
        let r = "onclick" === (t = t.toLowerCase()) ? "click" : "ondoubleclick" === t ? "dblclick" : t.slice(2);
        e.addEventListener(r, s),
        i.push({
            eventName: r,
            handler: s
        }),
        "onclick" === t && this.#ge(e, s, i)
    }
    #ge(e, t, s) {
        if (!/Mobi|Android/i.test(navigator.userAgent))
            return;
        let i = {
            startTime: 0,
            moved: !1,
            startX: 0,
            startY: 0
        };
        [{
            name: "touchstart",
            handler: e => {
                i.startTime = Date.now(),
                i.moved = !1,
                e.touches?.[0] && (i.startX = e.touches[0].clientX,
                i.startY = e.touches[0].clientY)
            }
            ,
            options: {
                passive: !0
            }
        }, {
            name: "touchmove",
            handler: e => {
                if (e.touches?.[0]) {
                    let t = Math.abs(e.touches[0].clientX - i.startX)
                      , s = Math.abs(e.touches[0].clientY - i.startY);
                    (t > this.TOUCH_CONFIG.moveThreshold || s > this.TOUCH_CONFIG.moveThreshold) && (i.moved = !0)
                }
            }
            ,
            options: {
                passive: !0
            }
        }, {
            name: "touchend",
            handler: e => {
                !i.moved && Date.now() - i.startTime < this.TOUCH_CONFIG.timeThreshold && (e.preventDefault(),
                t(e))
            }
            ,
            options: {
                passive: !1
            }
        }].forEach(( ({name: t, handler: i, options: r}) => {
            e.addEventListener(t, i, r),
            s.push({
                eventName: t,
                handler: i
            })
        }
        ))
    }
    _createReactiveUpdate(e, t, s) {
        let {deps: i} = this.juris.getSM().track(( () => t(e)));
        i.forEach((e => {
            let i = this.juris.getSM().subscribeInternal(e, t);
            s.push(i)
        }
        ))
    }
    updateElementContent(e, t) {
        this.#ue(e, [t])
    }
    setupIndicators(e, t) {
        this.placeholderConfigs.set(e, {
            ...this.defaultPlaceholder,
            ...t
        })
    }
    _hasAsyncProps(e) {
        for (let t in e)
            if (e.hasOwnProperty(t) && !t.startsWith("on") && this.#U(e[t]))
                return !0;
        return !1
    }
    _getPlaceholderConfig(e) {
        if (e?.id && this.placeholderConfigs.has(e.id))
            return this.placeholderConfigs.get(e.id);
        let t = e?.parentElement;
        for (; t; ) {
            if (t.id && this.placeholderConfigs.has(t.id))
                return this.placeholderConfigs.get(t.id);
            t = t.parentElement
        }
        return this.defaultPlaceholder
    }
    #U(e) {
        return e?.then
    }
    cleanup(e) {
        this.juris.getCM().cleanup(e),
        this.nodeKeys.delete(e),
        this.keyedNodes.has(e) && this.keyedNodes.delete(e);
        let t = this.subscriptions.get(e);
        if (t && (t.subscriptions && t.subscriptions.forEach((e => {
            try {
                e()
            } catch (e) {}
        }
        )),
        t.eventListeners && t.eventListeners.forEach(( ({eventName: t, handler: s}) => {
            try {
                e.removeEventListener(t, s)
            } catch (e) {}
        }
        )),
        this.subscriptions.delete(e)),
        e._reactiveCleanup) {
            try {
                e._reactiveCleanup()
            } catch (e) {}
            e._reactiveCleanup = null
        }
        this.placeholders.has(e) && this.placeholders.delete(e);
        try {
            let t = e.children;
            for (let s = 0; s < t.length; s++)
                try {
                    this.cleanup(t[s])
                } catch (e) {}
        } catch (e) {}
    }
    clearCSSCache() {
        this.cssExtractor && "function" == typeof this.cssExtractor.clearCache && this.cssExtractor.clearCache()
    }
    attachObjectTreeAnalyzer(e) {
        return this.objTreeAnalyzer = e,
        this.objTreeAnalyzer
    }
    setTestMode(e=!0) {
        return this._testMode = e,
        this._testMode
    }
    isTestMode() {
        return this._testMode
    }
    getObjectTree() {
        return this.objTreeAnalyzer?.getObjectTree() || null
    }
}
class Juris {
    static #me = !1;
    constructor(e={}) {
        e.logLevel && this.setupLogging(e.logLevel),
        this.contextTemplate = null,
        this.contextCache = new Map,
        this.services = e.services || {},
        this.layout = e.layout,
        this.stateManager = new StateManager(e.states || {},e.middleware || []),
        this.componentManager = new ComponentManager(this),
        this.domRenderer = new DOMRenderer(this),
        this.armedElements = new Map;
        let t = e.features || {};
        if (t.headless && (this.headlessManager = new t.headless(this,log),
        this.headlessAPIs = {}),
        t.enhance && (this.domEnhancer = new t.enhance(this)),
        t.template && (this.templateCompiler = new t.template,
        e.autoCompileTemplates && this.compileTemplates()),
        t.webComponentFactory && (this.webComponentFactory = new t.webComponentFactory(this)),
        t.cssExtractor && (this.getDR().cssExtractor = new t.cssExtractor),
        t.compute) {
            let s = e.computeOptions || {}
              , i = new t.compute(this.stateManager,s);
            this.stateManager.addPlugin("compute", i),
            log.ei && console.info(log.i("Compute plugin initialized", {
                options: s
            }, "framework"))
        }
        if (e.headlessComponents && this.getHM() && Object.keys(e.headlessComponents).forEach((t => {
            const s = e.headlessComponents[t];
            "function" == typeof s ? this.getHM().register(t, s) : this.getHM().register(t, s.fn, s.options)
        }
        )),
        e.placeholders) {
            const t = Object.keys(e.placeholders);
            for (let s = 0; s < t.length; s++) {
                const i = t[s]
                  , r = e.placeholders[i];
                this.getDR().setupIndicators(i, r)
            }
        }
        e.defaultPlaceholder && (this.getDR().defaultPlaceholder = {
            ...this.getDR().defaultPlaceholder,
            ...e.defaultPlaceholder
        }),
        this.getHM() && this.getHM().initializeQueued(),
        e.components && Object.keys(e.components).forEach((t => {
            this.getCM().register(t, e.components[t])
        }
        )),
        e.webComponents && this.webComponentFactory && this.webComponentFactory.createMultiple(e.webComponents, e.webComponentOptions || {}),
        "undefined" == typeof requestIdleCallback && (window.requestIdleCallback = function(e, t) {
            let s = Date.now();
            return setTimeout((function() {
                e({
                    didTimeout: !1,
                    timeRemaining: function() {
                        return Math.max(0, 50 - (Date.now() - s))
                    }
                })
            }
            ), 1)
        }
        ),
        this.#fe()
    }
    getDR() {
        return this.domRenderer
    }
    getSM() {
        return this.stateManager
    }
    getHM() {
        return this.headlessManager
    }
    getCM() {
        return this.componentManager
    }
    getComponentAPI(e) {
        return this.getCM().getComponentAPI(e)
    }
    getComponentElement(e) {
        return this.getCM().getComponentElement(e)
    }
    getNamedComponents() {
        return this.getCM().getNamedComponents()
    }
    compileTemplates(e=null) {
        if (!this.templateCompiler)
            return void (log.ew && console.warn(log.w("Template compilation requested but templateCompiler not available"), "framework"));
        let t = e || document.querySelectorAll("template[data-component]")
          , s = this.templateCompiler.compileTemplates(t);
        Object.keys(s).forEach((e => {
            this.registerComponent(e, s[e])
        }
        ))
    }
    setupLogging(e) {
        log.ei = !0,
        log.ed = !0,
        log.el = !0,
        log.ew = !0,
        log.ee = !0;
        let t = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        }[e] ?? 1;
        t > 0 && (log.ed = !1),
        t > 1 && (log.el && console.log("Juris logging initialized at level:", e),
        log.el && console.log('To change log level, use juris.setupLogging("newLevel") or set logLevel in config'),
        log.el = !1,
        log.ei = !1)
    }
    setupIndicators(e, t) {
        this.getDR().setupIndicators(e, t)
    }
    #fe() {
        Juris._done || (requestIdleCallback || setTimeout)(( () => {
            if (!Juris.#me) {
                Juris.#me = !0;
                for (let e in globalThis)
                    globalThis[e]instanceof Juris && log.ew && console.warn(`JURIS GLOBAL: '${e}'`)
            }
        }
        ))
    }
    #ye() {
        return this.contextTemplate || (this.contextTemplate = {
            getState: (e, t, s) => this.getSM().getState(e, t, s),
            setState: (e, t, s) => this.getSM().setState(e, t, s),
            executeBatch: e => this.executeBatch(e),
            subscribe: (e, t) => this.getSM().subscribe(e, t),
            effect: e => {
                const {result: t, deps: s} = this.getSM().track(e)
                  , i = [];
                return s.forEach((t => {
                    const s = this.getSM().subscribeInternal(t, e);
                    i.push(s)
                }
                )),
                () => i.forEach((e => e()))
            }
            ,
            compute: (e, t, s) => this.getSM().compute(e, t, s),
            services: this.services,
            ...this.services || {},
            ...this.headlessAPIs || {},
            headless: this.getHM()?.context,
            isSSR: "undefined" == typeof window,
            components: {
                register: (e, t) => this.getCM().register(e, t),
                registerHeadless: (e, t, s) => this.getHM()?.register(e, t, s),
                get: e => this.getCM().components.get(e),
                getHeadless: e => this.getHM()?.getInstance(e),
                initHeadless: (e, t) => this.getHM()?.initialize(e, t),
                reinitHeadless: (e, t) => this.getHM()?.reinitialize(e, t),
                getComponentAPI: e => this.getComponentAPI(e),
                getHeadlessAPI: e => this.getHM()?.getAPI(e),
                getComponentElement: e => this.getComponentElement(e),
                getNamedComponents: () => this.getCM().getNamedComponents()
            },
            utils: {
                render: e => this.render(e),
                cleanup: () => this.cleanup(),
                forceRender: () => this.render(),
                getHeadlessStatus: () => this.getHM()?.getStatus(),
                objectToHtml: e => this.objectToHtml(e)
            },
            objectToHtml: e => this.objectToHtml(e),
            setupIndicators: (e, t) => this.setupIndicators(e, t),
            juris: this,
            logger: {
                warn: log.w,
                error: log.e,
                info: log.i,
                debug: log.d,
                subscribe: logSub,
                unsubscribe: logUnsub
            }
        }),
        this.contextTemplate
    }
    createHeadlessContext(e=null) {
        return this.createContext(e)
    }
    executeBatch(e) {
        return this.getSM().executeBatch(e)
    }
    createWebComponent(e, t, s={}) {
        return this.webComponentFactory ? this.webComponentFactory.createWebComponent(e, t, s) : (log.ee && console.error(log.e("WebComponent not available"), "application"),
        null)
    }
    createWebComponents(e, t={}) {
        return this.webComponentFactory ? this.webComponentFactory.createMultiple(e, t) : (log.ee && console.error(log.e("WebComponents not available"), "application"),
        {})
    }
    createContext(e=null) {
        let t = {
            ...this.#ye()
        };
        if (this.getHM()) {
            let e = this.getHM().getAllAPIs();
            Object.assign(t, e)
        }
        return e && (t.element = e),
        t
    }
    promisify(e) {
        return promisify(e)
    }
    getState(e, t, s) {
        return this.getSM().getState(e, t, s)
    }
    setState(e, t, s) {
        return this.getSM().setState(e, t, s)
    }
    subscribe(e, t, s=!0) {
        return this.getSM().subscribe(e, t, s)
    }
    subscribeExact(e, t) {
        return this.getSM().subscribeExact(e, t)
    }
    registerComponent(e, t) {
        return this.getCM().register(e, t)
    }
    registerHeadlessComponent(e, t, s) {
        return this.getHM().register(e, t, s)
    }
    initializeQueuedHeadlessComponent() {
        this.getHM().initializeQueued()
    }
    initializeHeadlessComponent(e, t) {
        return this.getHM().initialize(e, t)
    }
    getHeadlessComponent(e) {
        return this.getHM().getInstance(e)
    }
    getHeadlessAPI(e) {
        return this.getHM()?.getAPI(e)
    }
    getComponent(e) {
        return this.getCM().components.get(e)
    }
    registerAndInitHeadless(e, t, s={}) {
        return this.getHM().register(e, t, s),
        this.getHM().initialize(e, s)
    }
    getHeadlessStatus() {
        return this.getHM().getStatus()
    }
    objectToHtml(e) {
        return this.getDR().render(e)
    }
    render(e="#app", t=null) {
        let s = performance.now()
          , i = "string" == typeof e ? document.querySelector(e) : e;
        if (!i)
            return void (log.ee && console.error(log.e("Render container not found", {
                container: e
            }, "application")));
        let r = this.getState("isHydration", !1);
        try {
            if (null !== t) {
                this.#be(i, t);
                let e = performance.now() - s;
                return log.ei && console.info(log.i("Direct VDOM render completed", {
                    duration: `${e.toFixed(2)}ms`
                }, "application")),
                i
            }
            if (Array.isArray(this.layout) && this.layout.some((e => "function" == typeof e))) {
                i.innerHTML = "";
                let e = [];
                return this.getDR()._handleChildren(i, this.layout, e),
                e.length > 0 && this.getDR().subscriptions.set(i, {
                    subscriptions: e,
                    eventListeners: []
                }),
                void performance.now()
            }
            r ? this.#Ce(i, t) : this.#be(i, t);
            let e = performance.now() - s;
            log.ei && console.info(log.i("Render completed", {
                duration: `${e.toFixed(2)}ms`,
                isHydration: r
            }, "application"))
        } catch (t) {
            log.ee && console.error(log.e("Render failed", {
                error: t.message,
                container: e
            }, "application")),
            this.#Se(i, t)
        }
    }
    #be(e, t=null) {
        this.getDR().cleanup(e),
        e.innerHTML = "";
        let s = null !== t ? t : this.layout
          , i = this.getDR().render(s, null, !1, e);
        i && i !== e && e.appendChild(i)
    }
    async #Ce(e, t=null) {
        let s = document.createElement("div");
        s.style.cssText = "position: absolute; left: -9999px; visibility: hidden;",
        document.body.appendChild(s);
        try {
            startTracking();
            let i = null !== t ? t : this.layout
              , r = this.getDR().render(i);
            for (r && s.appendChild(r),
            await onAllComplete(),
            this.getDR().cleanup(e),
            e.innerHTML = ""; s.firstChild; )
                e.appendChild(s.firstChild);
            this.getHM()?.initializeQueued()
        } finally {
            stopTracking(),
            document.body.removeChild(s)
        }
    }
    #Se(e, t) {
        let s = document.createElement("div");
        s.style.cssText = "color: red; border: 2px solid red; padding: 16px; margin: 8px; background: #ffe6e6;",
        s.innerHTML = `\n            <h3>Render Error</h3>\n            <p><strong>Message:</strong> ${t.message}</p>\n            <pre style="background: #f5f5f5; padding: 8px; overflow: auto;">${t.stack || ""}</pre>\n        `,
        e.appendChild(s)
    }
    enhance(e, t, s) {
        return this.domEnhancer.enhance(e, t, s)
    }
    configureEnhancement(e) {
        if (this.domEnhancer)
            return this.domEnhancer.configure(e);
        log.ew && console.warn(log.w("Enhancement configuration requested but domEnhancer not available"), "framework")
    }
    arm(e, t) {
        if (null == t || "function" != typeof t)
            return log.ew && console.warn(log.w("arm() called without valid handler function"), "framework"),
            null;
        let s = this.createContext(e)
          , i = t(s)
          , r = []
          , n = this;
        for (let t in i) {
            let s;
            s = t.startsWith("on-") || t.startsWith("on:") ? t.slice(3) : t.slice(2).toLowerCase();
            let n = i[t];
            "function" == typeof n && (e.addEventListener(s, n),
            r.push({
                original: t,
                actual: s,
                handler: n
            }))
        }
        let o = {
            events: r.map((e => ({
                name: e.original,
                actualEvent: e.actual,
                handler: e.handler
            }))),
            trigger(t, s={}) {
                let i = r.find((e => e.original === t || e.actual === t));
                if (i) {
                    let t = {
                        type: i.actual,
                        target: e,
                        preventDefault: () => {}
                        ,
                        stopPropagation: () => {}
                        ,
                        ...s
                    };
                    return i.handler.call(e, t),
                    !0
                }
                return !1
            },
            cleanup: () => (r.forEach(( ({actual: t, handler: s}) => {
                e.removeEventListener(t, s)
            }
            )),
            n.armedElements.delete(e),
            !0)
        };
        return n.armedElements.set(e, {
            listeners: r,
            context: s,
            instance: o
        }),
        o
    }
    cleanup() {
        this.armedElements = new Map,
        this.getHM()?.cleanup()
    }
    destroy() {
        this.cleanup(),
        this.domEnhancer && this.domEnhancer.destroy(),
        this.getSM().subscribers.clear(),
        this.getSM().extSubs.clear(),
        this.getCM().components.clear(),
        this.getHM() && this.getHM().components.clear(),
        this.armedElements = new Map
    }
}

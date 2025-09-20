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
          , r = Object.keys(t);
        return s.length === r.length && s.every((s => r.includes(s) && deepEquals(e[s], t[s])))
    }
    return !1
}
  , createLogger = () => {
    let e = []
      , t = (t, s, r) => {
        let n = {
            formatted: `${r ? `[${r}] ` : ""}${t}${s ? ` ${JSON.stringify(s)}` : ""}`,
            message: t,
            context: s,
            category: r,
            timestamp: Date.now()
        };
        return setTimeout(( () => e.forEach((e => e(n)))), 0),
        n
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
      , r = () => {
        0 === e.size && s.size > 0 && s.forEach((e => e()))
    }
    ;
    return {
        promisify: s => {
            let n = "function" == typeof s?.then ? s : Promise.resolve(s);
            return t && n !== s && (e.add(n),
            n.finally(( () => {
                e.delete(n),
                setTimeout(r, 0)
            }
            ))),
            n
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
        this.plugins = new Map,
        this.isDeferringSubscriptions = !1,
        this.deferredSubscriptions = []
    }
    startDeferringSubscriptions() {
        this.isDeferringSubscriptions = !0,
        this.deferredSubscriptions = []
    }
    processDeferredSubscriptions() {
        if (!this.isDeferringSubscriptions)
            return;
        this.isDeferringSubscriptions;
        this.isDeferringSubscriptions = !1,
        this.deferredSubscriptions.forEach(( ({path: e, callback: t, unsubscriber: s}) => {
            let r = this.subscribeInternal(e, t);
            s.fn = r
        }
        )),
        this.deferredSubscriptions = [],
        this.isDeferringSubscriptions = !1
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
        let r = this.getPlugin("compute");
        if (!r)
            throw new Error("Compute plugin not available. Add ComputePlugin via features.compute in Juris config.");
        return r.compute(e, t, s)
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
        let s, r = this.deps, n = t ? null : this.deps = new Set;
        try {
            s = e()
        } finally {
            this.deps = r
        }
        return {
            result: s,
            deps: n ? [...n] : []
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
        let r = this.pathCache.get(e);
        r || (r = e.split("."),
        this.pathCache.size >= this.maxCacheSize && this.pathCache.delete(this.pathCache.keys().next().value),
        this.pathCache.set(e, r));
        let n = this.state;
        for (let e = 0; e < r.length; e++)
            if (n = n?.[r[e]],
            void 0 === n)
                return t;
        return n
    }
    setState(e, t, s={}) {
        if (!isValidPath(e))
            return !1;
        if (this.#t(e))
            return !1;
        if (this.#s(e, t)) {
            if (this.#r(e) === t)
                return !1
        }
        this.isBatching ? this.#n(e, t, s) : this.#i(e, t, s)
    }
    #s(e, t) {
        return ("string" == typeof t || "number" == typeof t || "boolean" == typeof t) && -1 === e.indexOf(".") && 0 === this.middleware.length
    }
    #r(e) {
        return this.state[e]
    }
    executeBatch(e) {
        if (this.isBatching)
            return e();
        this.#a();
        try {
            let t = e();
            return t && "function" == typeof t.then ? t.then((e => (this.#o(),
            e))).catch((e => {
                throw this.#o(),
                e
            }
            )) : (this.#o(),
            t)
        } catch (e) {
            throw this.#o(),
            e
        }
    }
    #a() {
        this.isBatching = !0,
        this.batchQueue = [],
        this.batchedPaths.clear()
    }
    #o() {
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
    #n(e, t, s) {
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
        let r = [];
        t.forEach((e => {
            let t = this.getState(e.path, null, !1)
              , s = e.value;
            for (let r of this.middleware)
                try {
                    let n = r({
                        path: e.path,
                        oldValue: t,
                        newValue: s,
                        context: e.context,
                        state: this.state
                    });
                    void 0 !== n && (s = n)
                } catch (t) {
                    log.ee && console.error(log.e("Middleware error in batch", {
                        path: e.path,
                        error: t.message
                    }, "application"))
                }
            deepEquals(t, s) || (this.#c(e.path, s),
            r.push({
                path: e.path,
                oldValue: t,
                newValue: s
            }))
        }
        )),
        this.isUpdating = s;
        let n = new Set;
        r.forEach(( ({path: e}) => {
            let t = this.#e(e);
            for (let e = 1; e <= t.length; e++)
                n.add(t.slice(0, e).join("."))
        }
        )),
        n.forEach((e => {
            this.subscribers.has(e) && this.#h(e),
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
    #i(e, t, s={}) {
        let r = this.getState(e, null, !1)
          , n = t;
        if (this.middleware.length > 0)
            for (let t = 0; t < this.middleware.length; t++)
                try {
                    let i = this.middleware[t]({
                        path: e,
                        oldValue: r,
                        newValue: n,
                        context: s,
                        state: this.state
                    });
                    void 0 !== i && (n = i)
                } catch (t) {
                    log.ee && console.error(log.e("Middleware error", {
                        path: e,
                        error: t.message,
                        middlewareName: middleware.name || "anonymous"
                    }, "application"))
                }
        deepEquals(r, n) ? log.ed && console.debug(log.d("State unchanged, skipping update", {
            path: e
        }, "framework")) : (this.#c(e, n),
        this.isUpdating || (this.isUpdating = !0,
        this.newSubs = this.newSubs || new Set,
        this.newSubs.add(e),
        this.#p(e, n, r),
        this.#d(e, n, r),
        this.newSubs.delete(e),
        this.isUpdating = !1))
    }
    #c(e, t) {
        if (-1 === e.indexOf("."))
            return void (this.state[e] = t);
        let s = this.pathCache.get(e);
        s || (s = e.split("."),
        this.pathCache.size >= this.maxCacheSize && this.pathCache.delete(this.pathCache.keys().next().value),
        this.pathCache.set(e, s));
        let r = this.state
          , n = s.length - 1;
        for (let e = 0; e < n; e++) {
            let t = s[e];
            null != r[t] && "object" == typeof r[t] || (r[t] = {}),
            r = r[t]
        }
        r[s[n]] = t
    }
    subscribe(e, t, s=!0) {
        this.extSubs.has(e) || this.extSubs.set(e, new Set);
        let r = {
            callback: t,
            hierarchical: s
        };
        return this.extSubs.get(e).add(r),
        () => {
            let t = this.extSubs.get(e);
            t && (t.delete(r),
            0 === t.size && this.extSubs.delete(e))
        }
    }
    subscribeExact(e, t) {
        return this.subscribe(e, t, !1)
    }
    subscribeInternal(e, t) {
        if (this.isDeferringSubscriptions) {
            let s = {
                fn: null
            };
            return this.deferredSubscriptions.push({
                path: e,
                callback: t,
                unsubscriber: s
            }),
            () => {
                if (s.fn)
                    s.fn();
                else {
                    let r = this.deferredSubscriptions.findIndex((r => r.path === e && r.callback === t && r.unsubscriber === s));
                    -1 !== r && this.deferredSubscriptions.splice(r, 1)
                }
            }
        }
        return this.subscribers.has(e) || this.subscribers.set(e, new Set),
        this.subscribers.get(e).add(t),
        () => {
            let s = this.subscribers.get(e);
            s && (s.delete(t),
            0 === s.size && this.subscribers.delete(e))
        }
    }
    #p(e, t, s) {
        this.#h(e);
        let r = this.#e(e);
        for (let e = r.length - 1; e > 0; e--)
            this.#h(r.slice(0, e).join("."));
        let n = e ? e + "." : "";
        new Set([...this.subscribers.keys(), ...this.extSubs.keys()]).forEach((t => {
            t.startsWith(n) && t !== e && this.#h(t)
        }
        ))
    }
    #d(e, t, s) {
        this.extSubs.forEach(( (r, n) => {
            r.forEach(( ({callback: r, hierarchical: i}) => {
                if (i ? e === n || e.startsWith(n + ".") : e === n)
                    try {
                        r(t, s, e)
                    } catch (e) {
                        log.ee && console.error(log.e("External subscriber error:", e), "application")
                    }
            }
            ))
        }
        ))
    }
    #h(e) {
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
        let r = this.components.get(e);
        if (!r)
            return log.ee && console.error(log.e("Component not found", {
                name: e
            }, "application")),
            null;
        try {
            let n = t.ref;
            if (delete {
                ...t
            }.ref,
            this.juris.getDR()._hasAsyncProps(t))
                return this.#u(e, r, t, s, n);
            let {comptId: i, componentStates: a, context: o} = this.#g(e)
              , l = this.#m(r, t, o);
            return l?.then ? this.#f(promisify(l), e, t, a, s, n) : this.#y(l, e, t, a, s, n)
        } catch (t) {
            return log.ee && console.error(log.e("Component creation failed!", {
                name: e,
                error: t.message
            }, "application")),
            this.#C(e, t)
        }
    }
    #m(e, t, s) {
        let r = e.toString().match(/^[^(]*\(([^)]*)\)/);
        if (!r || !r[1].trim())
            return e();
        let n = r[1].split(",").map((e => e.trim()));
        if (1 === n.length) {
            let r = n[0];
            return r.startsWith("{") && r.includes("}") || "props" === r || "prp" === r ? e(t) : e(s)
        }
        return e(t, s)
    }
    #g(e) {
        let {comptId: t, componentStates: s} = this.#b(e);
        return {
            comptId: t,
            componentStates: s,
            context: this.#S(t, s)
        }
    }
    #b(e) {
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
        return s.newState = (s, r) => {
            const n = `##local.${e}.${s}`;
            return null === this.juris.stateManager.getState(n) && this.juris.stateManager.setState(n, r),
            t.add(n),
            [ () => this.juris.stateManager.getState(n, r), e => this.juris.stateManager.setState(n, e), e => this.juris.stateManager.subscribe(n, e)]
        }
        ,
        s
    }
    #u(e, t, s, r=null, n=null) {
        let i = r || this.#w(e, "async-props-loading");
        return this.placeholders.set(i, {
            name: e,
            props: s,
            type: "async-props"
        }),
        this.#x(s).then((s => {
            try {
                let a = this.#E(e, t, s, r, n);
                r ? (r.innerHTML = "",
                a !== r && r.appendChild(a)) : this.#v(i, a)
            } catch (e) {
                this.#k(i, e)
            }
        }
        )).catch((e => this.#k(i, e))),
        i
    }
    async #x(e) {
        let t = this.#M(e)
          , s = this.asyncPropsCache.get(t);
        if (s && Date.now() - s.timestamp < 5e3)
            return s.props;
        let r = {}
          , n = Object.keys(e);
        for (let t = 0; t < n.length; t++) {
            let s = n[t]
              , i = e[s];
            if (i?.then)
                try {
                    r[s] = await i
                } catch (e) {
                    r[s] = {
                        __asyncError: e.message
                    }
                }
            else
                r[s] = i
        }
        return this.asyncPropsCache.set(t, {
            props: r,
            timestamp: Date.now()
        }),
        r
    }
    #E(e, t, s, r=null, n=null) {
        let {comptId: i, componentStates: a, context: o} = this.#g(e)
          , l = this.#m(t, s, o);
        return l?.then ? this.#f(promisify(l), e, s, a, r, n) : this.#y(l, e, s, a, r, n)
    }
    #f(e, t, s, r, n=null, i=null) {
        let a = n || this.#w(t, "async-loading");
        return this.placeholders.set(a, {
            name: t,
            props: s,
            states: r
        }),
        e.then((e => {
            try {
                let o = this.#y(e, t, s, r, n, i);
                n ? (n.innerHTML = "",
                o !== n && n.appendChild(o)) : this.#v(a, o)
            } catch (e) {
                log.ee && console.error(log.e("Async component failed", {
                    name: t,
                    error: e.message
                }, "application")),
                this.#k(a, e)
            }
        }
        )).catch((e => this.#k(a, e))),
        a
    }
    #y(e, t, s, r, n=null, i=null) {
        if (Array.isArray(e))
            return this.#P(e, t, s, r);
        if (e && "object" == typeof e && (this.#A(e) || "function" == typeof e.render))
            return this.#T(e, t, s, r, n, i);
        let a = this.juris.getDR().render(e, t)
          , o = this.#j(a, t, r, e);
        return this.#N(o, i),
        o
    }
    #N(e, t) {
        if (t && "function" == typeof t)
            try {
                let s = t(e);
                "function" == typeof s && (e._jurisRefCleanup = s)
            } catch (e) {
                log.ee && console.error(log.e("Component ref callback error:", e), "application")
            }
    }
    #T(e, t, s, r, n=null, i=null) {
        let a = this.#_(e, t, s)
          , o = document.createElement("div")
          , l = !!n;
        l || (o.setAttribute("data-juris-component", t),
        o.setAttribute("data-juris-rendertime", Date.now()));
        let c = () => {
            o._reactiveSubscriptions && (o._reactiveSubscriptions.forEach((e => e())),
            o._reactiveSubscriptions = []);
            let {result: s, deps: r} = this.juris.getSM().track(( () => a.render ? a.render(o) : e));
            s?.then ? (o.innerHTML = '<div class="juris-loading">Loading...</div>',
            promisify(s).then((e => {
                this.#R(o, e, t, l)
            }
            )).catch((e => {
                log.ee && console.error(`Async render error for ${t}:`, e),
                o.innerHTML = `<div class="juris-error">Render Error: ${e.message}</div>`
            }
            ))) : s ? this.#R(o, s, t, l) : o.appendChild(this.#C(t, {
                message: "Component cannot return empty"
            })),
            r.forEach((e => {
                let t = this.juris.getSM().subscribeInternal(e, c);
                o._reactiveSubscriptions || (o._reactiveSubscriptions = []),
                o._reactiveSubscriptions.push(t)
            }
            ))
        }
        ;
        return c(),
        this.#H(o, a, r, t, l),
        this.#N(o, i),
        o
    }
    #R(e, t, s, r) {
        Array.from(e.children).forEach((e => this.cleanup(e))),
        e.innerHTML = "";
        let n = this.juris.getDR().render(t);
        e.appendChild(n)
    }
    #H(e, t, s, r, n=!1) {
        t.isExternalContainer = n,
        this.insts.set(e, t),
        s?.size > 0 && this.componentStates.set(e, s),
        t.api && "object" == typeof t.api && (e.api = t.api,
        this.namedComps.set(r, {
            elm: e,
            instance: t
        }));
        let i = t.hooks || {};
        if (i.onMount || t.onMount) {
            let s = i.onMount || t.onMount;
            setTimeout(( () => this.#O(s, e, r, "onMount")), 0)
        }
    }
    #j(e, t, s, r) {
        return e && s.size > 0 && this.componentStates.set(e, s),
        r.api && "object" == typeof r.api && e && (e.api = r.api),
        e && e.setAttribute && (e.setAttribute("data-juris-component", t),
        e._jurisComponent = t),
        e
    }
    #P(e, t, s, r, n) {
        let i = n || document.createDocumentFragment()
          , a = this.#L(i, t, s)
          , o = [];
        return this.juris.getDR()._handleChildren(a, e, o),
        i._jurisComponent = {
            name: t,
            props: s,
            virtual: a,
            cleanup: () => {
                o.forEach((e => {
                    try {
                        e()
                    } catch (e) {}
                }
                ))
            }
        },
        r?.size > 0 && (i._juriscomponentStates = r),
        i
    }
    #_(e, t, s) {
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
    #O(e, t, s, r) {
        try {
            let n = Array.isArray(t) ? e(...t) : e(t);
            n?.then && promisify(n).catch((e => log.ee && console.error(log.e(`Async ${r} error in ${s}:`, e), "application")))
        } catch (e) {
            log.ee && console.error(log.e(`${r} error in ${s}:`, e), "application")
        }
    }
    #L(e, t, s) {
        let r = {
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
        return Object.defineProperty(r, "textContent", {
            set(t) {
                for (; e.firstChild; )
                    e.removeChild(e.firstChild);
                t && e.appendChild(document.createTextNode(t))
            },
            get: () => ""
        }),
        r
    }
    #w(e, t) {
        let s = document.createElement("div");
        return s.id = e.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        this._createPlaceholder(`Loading ${e}...`, t, s)
    }
    #v(e, t) {
        t && e.parentNode && e.parentNode.replaceChild(t, e),
        this.placeholders.delete(e)
    }
    #k(e, t) {
        let s = this.#C(e._jurisComponent?.name || "Unknown Component", t);
        e.parentNode && e.parentNode.replaceChild(s, e),
        this.placeholders.delete(e)
    }
    #C(e, t) {
        let s = document.createElement("div");
        return s.style.cssText = "color: red; border: 1px solid red; padding: 8px; background: #ffe6e6; font-family: monospace;",
        s.textContent = `Component Error in ${e}: ${t.message}`,
        s
    }
    #A(e) {
        return e.hooks && (e.hooks.onMount || e.hooks.onUpdate || e.hooks.onUnmount) || e.onMount || e.onUpdate || e.onUnmount
    }
    #M(e) {
        return JSON.stringify(e, ( (e, t) => t?.then ? "[Promise]" : t))
    }
    cleanup(e) {
        if (e instanceof DocumentFragment)
            return void this.#D(e);
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
            t && (this.#I(t),
            this.componentStates.delete(e))
        } else
            this.#z(e);
        if (e._jurisRefCleanup && "function" == typeof e._jurisRefCleanup) {
            try {
                e._jurisRefCleanup()
            } catch (e) {
                log.ew && console.warn("Error cleaning up component ref callback:", e)
            }
            delete e._jurisRefCleanup
        }
        this.placeholders.has(e) && this.placeholders.delete(e),
        this.insts.delete(e)
    }
    #D(e) {
        e._jurisComponent?.cleanup?.(),
        e._juriscomponentStates && this.#I(e._juriscomponentStates)
    }
    #z(e) {
        let t = this.componentStates.get(e);
        t && (this.#I(t),
        this.componentStates.delete(e))
    }
    #I(e) {
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
        let r = this.juris.getDR()._getPlaceholderConfig(s)
          , n = document.createElement("div");
        return n.className = r.className,
        n.textContent = r.text,
        r.style && (n.style.cssText = r.style),
        n
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
        this.SKIP_ATTRS = new Set(["children", "key", "ref"]),
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
        this._lastObjectTree = null,
        this.pendingConnectedCallbacks = new Set
    }
    #$ = (e, t={}, s={}) => {
        let {onStart: r=( () => {}
        ), onResolved: n=( () => {}
        ), onError: i=(e => {
            log.ee && console.error(log.e("Async operation failed:", e), "application")
        }
        ), onFinally: a=( () => {}
        )} = t;
        return s.elm && s.type && this.#B(s.elm, s.type, s),
        r(),
        promisify(e).then((e => (s.elm && s.type && this.#U(s.elm),
        n(e),
        e))).catch((e => {
            throw s.elm && s.type && this.#F(s.elm, s.type, e, s),
            i(e),
            e
        }
        )).finally(( () => {
            a()
        }
        ))
    }
    ;
    #B(e, t, s={}) {
        let r = this._getPlaceholderConfig(e);
        switch (t) {
        case "children":
        case "reactive-children":
        case "fragment-child":
            this.#W(e, r);
            break;
        case "text":
            this.#K(e, r);
            break;
        case "attribute":
            this.#Q(e, r, s.attributeName);
            break;
        case "style":
            this.#q(e, r);
            break;
        case "component":
            return this.#V(r, s.componentName)
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
    #K(e, t) {
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
    #V(e, t) {
        let s = document.createElement("div");
        return s.className = e.className,
        s.textContent = t ? `Loading ${t}...` : e.text,
        e.style && (s.style.cssText = e.style),
        s.setAttribute("data-juris-placeholder", "component"),
        s
    }
    #U(e) {
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
    #F(e, t, s, r={}) {
        let n = this._getPlaceholderConfig(e);
        this.#U(e);
        let i = `Error: ${s.message}`;
        switch (t) {
        case "children":
        case "reactive-children":
        case "fragment-child":
            e.innerHTML = `<div class="${n.errorClassName}" style="${n.errorStyle}">${i}</div>`;
            break;
        case "text":
            e.textContent = i,
            e.classList.add(n.errorClassName),
            n.errorStyle && (e.style.cssText = n.errorStyle);
            break;
        case "attribute":
            e.classList.add(n.errorClassName),
            r.attributeName && (e.setAttribute(r.attributeName, "error"),
            e.setAttribute("data-juris-error", i));
            break;
        case "style":
            e.classList.add(n.errorClassName),
            n.errorStyle && (e.style.cssText = n.errorStyle)
        }
    }
    #J(e, t, s, r={}) {
        let n = r.trackChanges ? null : void 0
          , i = !1;
        return () => {
            try {
                let a = t();
                if (!this.#G(a))
                    return r.trackChanges && i && deepEquals(a, n) || (s(a),
                    r.trackChanges && (n = a,
                    i = !0)),
                    a;
                let o = {
                    elm: e,
                    type: r.type || "generic",
                    attributeName: r.attributeName
                };
                return this.#$(a, {
                    onResolved: e => {
                        r.trackChanges && i && deepEquals(e, n) || (s(e),
                        r.trackChanges && (n = e,
                        i = !0))
                    }
                    ,
                    onError: e => {
                        r.onError ? r.onError(e) : log.ee && console.error(log.e(`Error in reactive ${r.name}:`, e), "application")
                    }
                }, o)
            } catch (e) {
                r.onError ? (r.onError(e),
                log.ee && console.error(log.e(`Error in reactive ${r.name}:`, e), "application")) : log.ee && console.error(log.e(`Error in reactive ${r.name}:`, e), "application")
            }
        }
    }
    #X(e, t) {
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
    #Y(e, t, s) {
        if (0 === t.length && 0 === s.length)
            return;
        let r = []
          , n = new Map
          , i = new Map
          , a = new Set;
        Array.from(e.childNodes).forEach(( (e, t) => {
            let s = this.nodeKeys.get(e);
            void 0 !== s ? n.set(s, {
                node: e,
                index: t
            }) : n.set(`__index_${t}`, {
                node: e,
                index: t
            })
        }
        ));
        for (let t = 0; t < s.length; t++) {
            let o = s[t]
              , l = this.#X(o, t) ?? `__index_${t}`;
            if (a.has(l) && !l.startsWith("__index_")) {
                log.ew && console.warn(log.w(`Duplicate key "${l}" detected. Keys must be unique among siblings.`, {
                    parent: e.tagName,
                    key: l
                }, "framework"));
                let s = `__index_${t}`;
                i.set(s, {
                    child: o,
                    index: t
                }),
                r.push({
                    type: "create",
                    child: o,
                    index: t,
                    key: s
                })
            } else if (a.add(l),
            i.set(l, {
                child: o,
                index: t
            }),
            n.has(l)) {
                let e = n.get(l);
                this.#Z(e.node, o) && r.push({
                    type: "update",
                    node: e.node,
                    child: o,
                    index: t,
                    key: l
                }),
                e.index !== t && r.push({
                    type: "move",
                    node: e.node,
                    from: e.index,
                    to: t,
                    key: l
                })
            } else
                r.push({
                    type: "create",
                    child: o,
                    index: t,
                    key: l
                })
        }
        n.forEach(( (e, t) => {
            i.has(t) || r.push({
                type: "remove",
                node: e.node,
                key: t
            })
        }
        )),
        this.#ee(e, r, s)
    }
    #Z(e, t) {
        return e.nodeType === Node.TEXT_NODE ? e.textContent !== String(t) : e.nodeType === Node.ELEMENT_NODE
    }
    #ee(e, t, s) {
        t.filter((e => "remove" === e.type)).forEach((t => {
            t.node.parentNode === e && (e.removeChild(t.node),
            this.nodeKeys.delete(t.node),
            this.cleanup(t.node))
        }
        ));
        let r = new Map;
        t.filter((e => "create" === e.type)).forEach((e => {
            let t = this.#te(e.child);
            t && (r.set(e.key, t),
            e.key && "string" == typeof e.key && !e.key.startsWith("__") && this.nodeKeys.set(t, e.key))
        }
        )),
        t.filter((e => "update" === e.type)).forEach((e => {
            this.#se(e.node, e.child)
        }
        ));
        let n = [];
        s.forEach(( (e, s) => {
            let i = this.#X(e, s) ?? `__index_${s}`
              , a = t.find((e => e.key === i && ("update" === e.type || "move" === e.type)));
            a ? n.push(a.node) : r.has(i) && n.push(r.get(i))
        }
        )),
        this.#re(e, n)
    }
    #se(e, t) {
        if (e.nodeType !== Node.TEXT_NODE) {
            if (e.nodeType === Node.ELEMENT_NODE && "object" == typeof t && !Array.isArray(t)) {
                let s = t[Object.keys(t)[0]] || {}
                  , r = [];
                for (let t in s) {
                    if ("key" === t)
                        continue;
                    let n = this.applyProp(e, t, s[t]);
                    n && "function" == typeof n && r.push(n)
                }
                if (r.length > 0) {
                    let t = this.subscriptions.get(e) || {
                        subscriptions: [],
                        eventListeners: []
                    };
                    t.subscriptions.push(...r),
                    this.subscriptions.set(e, t)
                }
            }
        } else {
            let s = String(t);
            e.textContent !== s && (e.textContent = s)
        }
    }
    #re(e, t) {
        let s = null;
        for (let r = t.length - 1; r >= 0; r--) {
            let n = t[r];
            n && (n.parentNode === e ? s && n.nextSibling !== s ? e.insertBefore(n, s) : s || n === e.lastChild || e.appendChild(n) : s ? e.insertBefore(n, s) : e.appendChild(n),
            s = n)
        }
    }
    render(e, t=null, s=!1, r=null) {
        return "string" == typeof e || "number" == typeof e ? document.createTextNode(String(e)) : this._testMode && s && this.objTreeAnalyzer ? this.objTreeAnalyzer.buildObjectTree(e, t) : this._renderToDOM(e, t, r)
    }
    _renderToDOM(e, t=null, s=null) {
        if ("string" == typeof e || "number" == typeof e)
            return document.createTextNode(String(e));
        if (!e || "object" != typeof e)
            return null;
        if (Array.isArray(e))
            return this.#ne(e, t);
        let r = Object.keys(e)[0]
          , n = e[r] || {};
        if (this.componentStack.includes(r))
            return this.#C("recursion", [...this.componentStack, r].join(" → "));
        if (this.juris.getCM().components.has(r))
            return this.#ie(r, n, s);
        if (/^[A-Z]/.test(r))
            return this.#C("component", `Component "${r}" not registered`);
        if ("string" != typeof r || 0 === r.length)
            return null;
        let i = n;
        if (n.style && this.cssExtractor) {
            let e = t || r;
            i = this.cssExtractor.processProps(n, e, this)
        }
        return this.#ae(r, i, t)
    }
    #ae(e, t, s=null) {
        let r = this.#oe(e)
          , n = [];
        for (let e in t) {
            if (!t.hasOwnProperty(e) || "key" === e)
                continue;
            let i = this.applyProp(r, e, t[e], s);
            i && "function" == typeof i && n.push(i)
        }
        if (n.length > 0) {
            let e = this.subscriptions.get(r) || {
                subscriptions: [],
                eventListeners: []
            };
            e.subscriptions.push(...n),
            this.subscriptions.set(r, e)
        }
        return r
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
    #ne(e, t) {
        let s = e.some((e => "function" == typeof e))
          , r = e.some((e => null !== this.#X(e)));
        if (s || r) {
            let n = document.createDocumentFragment()
              , i = [];
            if (r && !s)
                for (let s = 0; s < e.length; s++) {
                    let r = e[s]
                      , i = this.render(r, t);
                    if (i) {
                        let e = this.#X(r, s);
                        e && this.nodeKeys.set(i, e),
                        n.appendChild(i)
                    }
                }
            else
                this.#le(n, e, i, t);
            return i.length > 0 && (n._jurisCleanup = () => {
                i.forEach((e => {
                    try {
                        e()
                    } catch (e) {}
                }
                ))
            }
            ),
            n
        }
        let n = document.createDocumentFragment();
        for (let s = 0; s < e.length; s++) {
            let r = this.render(e[s], t);
            r && n.appendChild(r)
        }
        return n
    }
    #ie(e, t, s=null) {
        if (!this.juris.getCM().components.get(e))
            return log.ee && console.error(log.e("Component not found", {
                name: e
            }, "application")),
            null;
        if (this.componentStack.includes(e))
            return this.#C("recursion", [...this.componentStack, e].join(" → "));
        this.componentStack.push(e);
        let {result: r, deps: n} = this.juris.getSM().track(( () => this.juris.getCM().create(e, t, s)), !0);
        return this.componentStack.pop(),
        r
    }
    #C(e, t) {
        let s = document.createElement("div");
        return s.style.cssText = "color: red; border: 1px solid red; padding: 8px; background: #ffe6e6; font-family: monospace;",
        s.textContent = t,
        s.setAttribute("data-juris-error", e),
        s
    }
    applyProp(e, t, s, r=null) {
        let n = []
          , i = [];
        if ("onconnected" === t)
            return e._jurisOnConnected = s,
            this.pendingConnectedCallbacks.add(e),
            () => {
                this.pendingConnectedCallbacks.delete(e),
                e._jurisOnConnected && delete e._jurisOnConnected
            }
            ;
        if ("children" === t ? this._handleChildren(e, s, n, r) : "text" === t ? this.#ce(e, s, n) : "style" === t ? this.#he(e, s, n) : t.startsWith("on") ? this.#pe(e, t, s, i) : "function" == typeof s ? this.#de(e, t, s, n) : this.#G(s) ? this.#ue(e, t, s) : this.#ge(e, t, s),
        n.length > 0 || i.length > 0) {
            let t = this.subscriptions.get(e) || {
                subscriptions: [],
                eventListeners: []
            };
            t.subscriptions.push(...n),
            t.eventListeners.push(...i),
            this.subscriptions.set(e, t)
        }
        return () => {
            n.forEach((e => {
                try {
                    e()
                } catch (e) {}
            }
            )),
            i.forEach(( ({eventName: t, handler: s}) => {
                try {
                    e.removeEventListener(t, s)
                } catch (e) {}
            }
            ))
        }
    }
    _processPendingConnectedCallbacks() {
        this.pendingConnectedCallbacks.forEach((e => {
            if (e.isConnected && e._jurisOnConnected)
                try {
                    e._jurisOnConnected.call(e, {
                        type: "connected",
                        target: e,
                        timeStamp: Date.now()
                    })
                } catch (e) {
                    log.ee && console.error(log.e("onconnected callback error:", e), "application")
                }
        }
        )),
        this.pendingConnectedCallbacks.clear()
    }
    #ue(e, t, s) {
        let r = {
            elm: e,
            type: "attribute",
            attributeName: t
        };
        return "innerHTML" === t ? (r.type = "children",
        this.#$(s, {
            onResolved: t => {
                e.innerHTML = t
            }
        }, r)) : this.#$(s, {
            onResolved: s => {
                this.#ge(e, t, s)
            }
        }, r)
    }
    #me(e, t, s, r) {
        if (e.$ || (e.$ = {}),
        t.startsWith("style_")) {
            e.$.style || (e.$.style = {});
            let n = t.substring(6);
            e.$.style[n] = (t={}) => {
                let n = s(e, t);
                return r(n),
                n
            }
        } else
            e.$[t] = (t={}) => {
                let n = s(e, t);
                return r(n),
                n
            }
    }
    #ce(e, t, s) {
        if ("function" == typeof t)
            try {
                let {result: r, deps: n} = this.juris.getSM().track(( () => t(e)));
                if (e.textContent = r,
                this.#me(e, "text", t, (t => {
                    e.textContent = t
                }
                )),
                0 === n.size)
                    return;
                let i = this.#J(e, ( () => t(e)), (t => {
                    e.textContent = t
                }
                ), {
                    trackChanges: !0,
                    name: "text",
                    type: "text"
                });
                this._createReactiveUpdate(e, i, s, n)
            } catch (t) {
                log.ee && console.error(log.e("Reactive text function error:", t), "application"),
                e.textContent = t.message
            }
        else if (this.#G(t)) {
            let s = {
                elm: e,
                type: "text"
            };
            this.#$(t, {
                onResolved: t => {
                    e.textContent = t
                }
            }, s)
        } else
            e.textContent = t
    }
    #he(e, t, s) {
        if ("function" == typeof t) {
            let {result: r, deps: n} = this.juris.getSM().track(( () => {
                let s = t.length > 0 ? t(e) : t();
                return this.cssExtractor?.postProcessReactiveResult && "object" == typeof s && (s = this.cssExtractor.postProcessReactiveResult(s, "reactive", e)),
                s
            }
            ));
            if ("object" == typeof r && Object.assign(e.style, r),
            this.#me(e, "style", t, (t => {
                "object" == typeof t && Object.assign(e.style, t)
            }
            )),
            0 === n.size)
                return;
            let i = this.#J(e, ( () => {
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
            this._createReactiveUpdate(e, i, s, n)
        } else if (this.#G(t)) {
            let s = {
                elm: e,
                type: "style"
            };
            this.#$(t, {
                onResolved: t => {
                    "object" == typeof t && Object.assign(e.style, t)
                }
            }, s)
        } else if ("object" == typeof t)
            for (let r in t)
                if (t.hasOwnProperty(r)) {
                    let n = t[r];
                    "function" == typeof n ? this.#fe(e, r, n, s) : this.#ye(e, r, n)
                }
    }
    #fe(e, t, s, r) {
        let {result: n, deps: i} = this.juris.getSM().track(( () => s(e)));
        if (this.#ye(e, t, n),
        this.#me(e, `style_${t}`, s, (s => {
            this.#ye(e, t, s)
        }
        )),
        0 === i.size)
            return;
        let a = this.#J(e, ( () => s(e)), (s => this.#ye(e, t, s)), {
            trackChanges: !0,
            name: `style.${t}`,
            type: "style"
        });
        this._createReactiveUpdate(e, a, r, i)
    }
    #de(e, t, s, r) {
        let {result: n, deps: i} = this.juris.getSM().track(( () => s(e)));
        if (this.#ge(e, t, n),
        this.#me(e, t, s, (s => {
            this.#ge(e, t, s)
        }
        )),
        0 === i.size)
            return;
        let a = this.#J(e, ( () => s(e)), (s => this.#ge(e, t, s)), {
            trackChanges: !0,
            name: `attribute '${t}'`,
            type: "attribute",
            attributeName: t
        });
        this._createReactiveUpdate(e, a, r, i)
    }
    _handleChildren(e, t, s, r=null) {
        if ("function" == typeof t) {
            let {result: n, deps: i} = this.juris.getSM().track(( () => {
                let s = t(e);
                return Array.isArray(s) ? s : [s]
            }
            ));
            if ("ignore" !== n && ("string" == typeof n || "number" == typeof n ? e.textContent = String(n) : this.#Ce(e, n, r)),
            this.#me(e, "children", t, (t => {
                "ignore" !== t && ("string" == typeof t || "number" == typeof t ? e.textContent = String(t) : this.#Ce(e, t, r))
            }
            )),
            0 === i.size)
                return;
            let a = this.#J(e, ( () => {
                let s = t(e);
                return Array.isArray(s) ? s : [s]
            }
            ), (t => {
                "ignore" !== t && ("string" == typeof t || "number" == typeof t ? e.textContent = String(t) : this.#Ce(e, t, r))
            }
            ), {
                trackChanges: !1,
                name: "children",
                type: "reactive-children"
            });
            this._createReactiveUpdate(e, a, s, i)
        } else if (this.#G(t)) {
            let s = {
                elm: e,
                type: "children"
            };
            this.#$(t, {
                onResolved: t => {
                    this.#Ce(e, t, r)
                }
            }, s)
        } else
            this.#Ce(e, t, r)
    }
    #Ce(e, t, s=null) {
        if ("ignore" === t)
            return;
        Array.isArray(t) || (t = [t]);
        let r = e._jurisLastChildren;
        r !== t && (e._jurisChildrenKeyed || (e._jurisChildrenKeyed = t.some((e => null !== this.#X(e)))),
        e._jurisChildrenKeyed && r && Array.isArray(r) ? this.#Y(e, r, t) : this.#be(e, t, s),
        e._jurisLastChildren = t)
    }
    #le(e, t, s, r) {
        for (let n = 0; n < t.length; n++) {
            let i = t[n];
            if ("function" == typeof i) {
                let {node: t, cleanup: a} = this.#Se(i, n, r, e);
                t && (e.appendChild(t),
                s.push(a))
            } else if (null != i) {
                let t = this.#te(i, r);
                if (t) {
                    let s = this.#X(i, n);
                    s && this.nodeKeys.set(t, s),
                    e.appendChild(t)
                }
            }
        }
    }
    #Se(e, t, s, r) {
        let n = this._getPlaceholderConfig(r)
          , i = document.createTextNode("")
          , a = []
          , o = () => {
            a.forEach((e => {
                try {
                    e()
                } catch (e) {}
            }
            )),
            a = [];
            let {result: t, deps: l} = this.juris.getSM().track(( () => e(r)));
            if (this.#G(t))
                this.#$(t, {
                    onStart: () => {
                        let e = document.createElement("span");
                        e.textContent = n.text,
                        e.className = n.className,
                        n.style && (e.style.cssText = n.style),
                        i.parentNode && i.parentNode.replaceChild(e, i),
                        i = e
                    }
                    ,
                    onResolved: e => {
                        let t = this.#te(e, s) || document.createTextNode("");
                        i.parentNode && i.parentNode.replaceChild(t, i),
                        i = t
                    }
                    ,
                    onError: e => {
                        let t = document.createElement("span");
                        t.className = n.errorClassName,
                        t.textContent = `Error: ${e.message}`,
                        i.parentNode && i.parentNode.replaceChild(t, i),
                        i = t
                    }
                });
            else
                try {
                    let e = this.#te(t, s) || document.createTextNode("");
                    i.parentNode && i.parentNode.replaceChild(e, i),
                    i = e
                } catch (e) {
                    let t = document.createElement("span");
                    t.className = n.errorClassName,
                    t.textContent = `Error: ${e.message}`,
                    i.parentNode && i.parentNode.replaceChild(t, i),
                    i = t
                }
            l.forEach((e => {
                let t = this.juris.getSM().subscribeInternal(e, o);
                a.push(t)
            }
            ))
        }
        ;
        return o(),
        {
            node: i,
            cleanup: () => {
                a.forEach((e => {
                    try {
                        e()
                    } catch (e) {}
                }
                )),
                a = []
            }
        }
    }
    #te(e, t) {
        if (null == e)
            return null;
        if ("string" == typeof e || "number" == typeof e)
            return document.createTextNode(String(e));
        if (Array.isArray(e)) {
            let s = document.createDocumentFragment();
            for (let r = 0; r < e.length; r++) {
                let n = this.#te(e[r], t);
                n && s.appendChild(n)
            }
            return s.hasChildNodes() ? s : null
        }
        if ("object" == typeof e && null !== e) {
            let s = Object.keys(e)[0]
              , r = e[s] || {};
            if (this.juris.getCM().components.has(s)) {
                let e = document.createElement("div")
                  , t = this.#ie(s, r, e);
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
    #be(e, t, s) {
        e.textContent = "";
        let r = document.createDocumentFragment()
          , n = [];
        for (let i = 0; i < t.length; i++) {
            let a = t[i];
            if ("function" == typeof a) {
                let {node: t, cleanup: o} = this.#Se(a, i, s, e);
                t && (r.appendChild(t),
                n.push(o))
            } else if (null != a) {
                let e = this.#te(a, s);
                if (e) {
                    let t = this.#X(a, i);
                    t && this.nodeKeys.set(e, t),
                    r.appendChild(e)
                }
            }
        }
        r.hasChildNodes() && e.appendChild(r),
        n.length > 0 && (e._reactiveCleanup = () => {
            n.forEach((e => {
                try {
                    e()
                } catch (e) {}
            }
            ))
        }
        )
    }
    #ye(e, t, s) {
        t.startsWith("--") ? e.style.setProperty(t, s) : e.style[t] = s
    }
    #ge(e, t, s) {
        if (this.SKIP_ATTRS.has(t))
            return;
        if (this.BOOLEAN_ATTRS.has(t)) {
            let r = s && "false" !== s;
            return r ? e.setAttribute(t, "") : e.removeAttribute(t),
            void (t in e && (e[t] = r))
        }
        if ("http://www.w3.org/2000/svg" === e.namespaceURI)
            return void e.setAttribute(t, s);
        if (new Set(["list", "form", "labels"]).has(t))
            return void e.setAttribute(t, s);
        let r = t.charCodeAt(0);
        if (100 === r && 45 === t.charCodeAt(4) || 97 === r && 45 === t.charCodeAt(4) || -1 !== t.indexOf("-") || -1 !== t.indexOf(":"))
            e.setAttribute(t, s);
        else if (t in e && "function" != typeof e[t])
            try {
                e[t] = s
            } catch (r) {
                e.setAttribute(t, s)
            }
        else
            e.setAttribute(t, s)
    }
    #pe(e, t, s, r) {
        if ("onconnected" === t)
            return void (e._jurisOnConnected = s);
        let n = "onclick" === (t = t.toLowerCase()) ? "click" : "ondoubleclick" === t ? "dblclick" : t.slice(2);
        e.addEventListener(n, s),
        r.push({
            eventName: n,
            handler: s
        }),
        "onclick" === t && this.#we(e, s, r)
    }
    #we(e, t, s) {
        if (!/Mobi|Android/i.test(navigator.userAgent))
            return;
        let r = {
            startTime: 0,
            moved: !1,
            startX: 0,
            startY: 0
        };
        [{
            name: "touchstart",
            handler: e => {
                r.startTime = Date.now(),
                r.moved = !1,
                e.touches?.[0] && (r.startX = e.touches[0].clientX,
                r.startY = e.touches[0].clientY)
            }
            ,
            options: {
                passive: !0
            }
        }, {
            name: "touchmove",
            handler: e => {
                if (e.touches?.[0]) {
                    let t = Math.abs(e.touches[0].clientX - r.startX)
                      , s = Math.abs(e.touches[0].clientY - r.startY);
                    (t > this.TOUCH_CONFIG.moveThreshold || s > this.TOUCH_CONFIG.moveThreshold) && (r.moved = !0)
                }
            }
            ,
            options: {
                passive: !0
            }
        }, {
            name: "touchend",
            handler: e => {
                !r.moved && Date.now() - r.startTime < this.TOUCH_CONFIG.timeThreshold && (e.preventDefault(),
                t(e))
            }
            ,
            options: {
                passive: !1
            }
        }].forEach(( ({name: t, handler: r, options: n}) => {
            e.addEventListener(t, r, n),
            s.push({
                eventName: t,
                handler: r
            })
        }
        ))
    }
    _createReactiveUpdate(e, t, s, r=null) {
        (r || this.juris.getSM().track(( () => t(e))).deps).forEach((e => {
            let r = this.juris.getSM().subscribeInternal(e, t);
            s.push(r)
        }
        ))
    }
    updateElementContent(e, t) {
        this.#Ce(e, [t])
    }
    setupIndicators(e, t) {
        this.placeholderConfigs.set(e, {
            ...this.defaultPlaceholder,
            ...t
        })
    }
    _hasAsyncProps(e) {
        for (let t in e)
            if (e.hasOwnProperty(t) && !t.startsWith("on") && this.#G(e[t]))
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
    #G(e) {
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
            for (let e = 0; e < t.length; e++)
                try {
                    this.cleanup(t[e])
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
    static #xe = !1;
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
              , r = new t.compute(this.stateManager,s);
            this.stateManager.addPlugin("compute", r),
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
                const r = t[s]
                  , n = e.placeholders[r];
                this.getDR().setupIndicators(r, n)
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
        this.#Ee()
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
    #Ee() {
        Juris._done || (requestIdleCallback || setTimeout)(( () => {
            if (!Juris.#xe) {
                Juris.#xe = !0;
                for (let e in globalThis)
                    globalThis[e]instanceof Juris && log.ew && console.warn(`JURIS GLOBAL: '${e}'`)
            }
        }
        ))
    }
    #ve() {
        return this.contextTemplate || (this.contextTemplate = {
            getState: (e, t, s) => this.getSM().getState(e, t, s),
            setState: (e, t, s) => this.getSM().setState(e, t, s),
            executeBatch: e => this.executeBatch(e),
            subscribe: (e, t) => this.getSM().subscribe(e, t),
            effect: e => {
                const {result: t, deps: s} = this.getSM().track(e)
                  , r = [];
                return s.forEach((t => {
                    const s = this.getSM().subscribeInternal(t, e);
                    r.push(s)
                }
                )),
                () => r.forEach((e => e()))
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
            ...this.#ve()
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
          , r = "string" == typeof e ? document.querySelector(e) : e;
        if (r)
            try {
                this.getSM().startDeferringSubscriptions();
                let e = null !== t ? t : this.layout
                  , n = this.getState("isHydration", !1);
                n ? this.#ke(r, e) : this.#Me(r, e),
                this.getSM().processDeferredSubscriptions();
                let i = performance.now() - s;
                return log.ei && console.info(log.i("Render completed", {
                    duration: `${i.toFixed(2)}ms`,
                    isHydration: n
                }, "application")),
                r
            } catch (t) {
                return this.getSM().processDeferredSubscriptions(),
                log.ee && console.error(log.e("Render failed", {
                    error: t.message,
                    container: e
                }, "application")),
                this.#Pe(r, t),
                r
            }
        else
            log.ee && console.error(log.e("Render container not found", {
                container: e
            }, "application"))
    }
    #Me(e, t) {
        this.getDR().cleanup(e),
        e.innerHTML = "";
        let s = this.getDR().render(t, null, !1, e);
        s && s !== e && e.appendChild(s),
        this.getDR()._processPendingConnectedCallbacks()
    }
    async #ke(e, t=null) {
        let s = document.createElement("div");
        s.style.cssText = "position: absolute; left: -9999px; visibility: hidden;",
        document.body.appendChild(s);
        try {
            startTracking();
            let r = null !== t ? t : this.layout
              , n = this.getDR().render(r);
            for (n && s.appendChild(n),
            await onAllComplete(),
            this.getDR().cleanup(e),
            e.innerHTML = ""; s.firstChild; )
                e.appendChild(s.firstChild);
            this.getDR()._processPendingConnectedCallbacks(),
            this.getHM()?.initializeQueued()
        } finally {
            stopTracking(),
            document.body.removeChild(s)
        }
    }
    #Pe(e, t) {
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
          , r = t(s)
          , n = []
          , i = this;
        for (let t in r) {
            let s;
            s = t.startsWith("on-") || t.startsWith("on:") ? t.slice(3) : t.slice(2).toLowerCase();
            let i = r[t];
            "function" == typeof i && (e.addEventListener(s, i),
            n.push({
                original: t,
                actual: s,
                handler: i
            }))
        }
        let a = {
            events: n.map((e => ({
                name: e.original,
                actualEvent: e.actual,
                handler: e.handler
            }))),
            trigger(t, s={}) {
                let r = n.find((e => e.original === t || e.actual === t));
                if (r) {
                    let t = {
                        type: r.actual,
                        target: e,
                        preventDefault: () => {}
                        ,
                        stopPropagation: () => {}
                        ,
                        ...s
                    };
                    return r.handler.call(e, t),
                    !0
                }
                return !1
            },
            cleanup: () => (n.forEach(( ({actual: t, handler: s}) => {
                e.removeEventListener(t, s)
            }
            )),
            i.armedElements.delete(e),
            !0)
        };
        return i.armedElements.set(e, {
            listeners: n,
            context: s,
            instance: a
        }),
        a
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

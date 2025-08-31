/**
 * Juris (JavaScript Unified Reactive Interface Solution)
 * The First and Only Non-blocking Reactive Platform, Architecturally Optimized for Next Generation Cutting-Edge Cross-Platform Application.
 * Juris aims to eliminate build complexity from small to large applications.
 * Author: Resti Guay
 * Version: 0.91.0
 * License: MIT
 * GitHub: https://github.com/jurisjs/juris
 * Website: https://jurisjs.com/
 * NPM: https://www.npmjs.com/package/juris
 * Codepen: https://codepen.io/jurisauthor
 * Online Testing: https://jurisjs.com/tests/juris#pure#test#interface.html
 * Features:
 * - Temporal Independent
 * - Automcatic deep call stack branch aware dependency detection
 * - Smart Promise (Asynchronous) Handling for Non-Blocking Rendering
 * - Component lazy compilation
 * - Global Non-Reactive State Management
 * - SSR (Server-Side Rendering) ready and CSR (Client-Side Rendering) 
 * - Loading Status templating
 * - Web Component support
 * - SVG Support
 * - Dual Template Mode (HTML and Object VDOM)
 * - supports innerHtml in Object VDOM for critical rendering requirements
 * - Anonymous Reactive Functions for children, component and layout rendering
 * - Advanced Reactive Management - arm() API to handle all your events with access to services and context.

 * IMPORTANT!!! Notes to AI:
 * 1. Reactivity works when getState is called from intended functional attributes and children. 
 * 2. Use compress object structure and add labels into the end brackets for nested divs, tables, select, groups and forms
 * 3. Use getState third attribute with false value to skip subscription
 * 4. Components will not re-render until their parent triggeres re-render.
 * 5. All props and attributes can handle async/sync natively,
 * 6. Use service injection AMAP
 * 7. Define component as function and dont inject directly into Juris during instantiation.
 * 8. Use class instead of className
 * example VDOM Convention:
 * return {
 *   {div:{class:'main', //note: static and short should be inline, use class instead of className especially when working with third party frameworks
 *      text:()=>getState('reactive.text.value','Hello'),//note: reactive, should be new line
 *      style:{color:'red', border:'solid 1px blue'},//note: still okay if in-line
 *      children:[
 *        {button:{text:'static label', //note: another static and short should be inline,
 *          onclick:()=>clickHandler()
 *        }},//button
 *        {input:{type:'text',min:'1', max:'10',
                value: () => juris.getState('counter.step', 1), //note: reactive value
 *          oninput: (e) => {
                const newStep = parseInt(e.target.value) || 1;
                juris.setState('counter.step', Math.max(1, Math.min(10, newStep)));
            }
 *        }},//input
 *        ()=> juris.getState('counter.step', 1),//text node
 *        ()=>{
 *          const step = juris.getState('counter.step', 1);
 *          return {span:{text:`Current step is ${step}`}};
 *        }//span
 *      ]
 *   }}//div.main
 * }//return
 */

'use strict';
const jurisLinesOfCode = 2357;
const jurisVersion = '0.91.0';
const jurisMinifiedSize = '38 kB, 11.5 kB gzipped';
const isValidPath = path => typeof path === 'string' && path.trim().length > 0 && !path.includes('..');
const getPathParts = path => path.split('.').filter(Boolean);
const deepEquals = (a, b) => {
    if (a === b) return true;
    if (a == null || b == null || typeof a !== typeof b) return false;
    if (typeof a === 'object') {
        if (Array.isArray(a) !== Array.isArray(b)) return false;
        const keysA = Object.keys(a), keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        return keysA.every(key => keysB.includes(key) && deepEquals(a[key], b[key]));
    }
    return false;
};

const createLogger = () => {
    const s = [];
    const f = (m, c, cat) => {
        const msg = `${cat ? `[${cat}] ` : ''}${m}${c ? ` ${JSON.stringify(c)}` : ''}`;
        const logObj = { formatted: msg, message: m, context: c, category: cat, timestamp: Date.now() };
        setTimeout(() => s.forEach(sub => sub(logObj)), 0);
        return logObj;
    };
    return {
        log: { l: f, w: f, e: f, i: f, d: f, ei:true, ee:true, el:true, ew:true, ed:true },
        sub: cb => s.push(cb),
        unsub: cb => s.splice(s.indexOf(cb), 1)
    };
};
const { log, sub: logSub, unsub: logUnsub } = createLogger();
const createPromisify = () => {
    const activePromises = new Set();
    let isTracking = false;
    const subs = new Set();
    const checkAllComplete = () => {
        if (activePromises.size === 0 && subs.size > 0) {
            subs.forEach(callback => callback());
        }
    };
    const trackingPromisify = result => {
        const promise = typeof result?.then === "function" ? result : Promise.resolve(result);
        if (isTracking && promise !== result) {
            activePromises.add(promise);
            promise.finally(() => {
                activePromises.delete(promise);
                setTimeout(checkAllComplete, 0);
            });
        }
        return promise;
    };
    return {
        promisify: trackingPromisify,
        startTracking: () => {
            isTracking = true;
            activePromises.clear();
        },
        stopTracking: () => {
            isTracking = false;
            subs.clear();
        },
        onAllComplete: (callback) => {
            subs.add(callback);
            if (activePromises.size === 0) {
                setTimeout(callback, 0);
            }
            return () => subs.delete(callback);
        }
    };
};
const { promisify, startTracking, stopTracking, onAllComplete } = createPromisify();

class StateManager {
    constructor(initialState = {}, middleware = []) {
        this.state = { ...initialState };
        this.middleware = [...middleware];
        this.subscribers = new Map();
        this.extSubs = new Map();
        this.deps = null;
        this.isUpdating = false;
        this.initialState = JSON.parse(JSON.stringify(initialState));
        this.maxUpdateDepth = 50;
        this.updateDepth = 0;
        this.newSubs = new Set();
        this.isBatching = false;
        this.batchQueue = [];
        this.batchedPaths = new Set();
        this.pathCache = new Map();
        this.maxCacheSize = 500;
        this.plugins = new Map();
    }

    addPlugin(name, plugin) {
        this.plugins.set(name, plugin);
        if (plugin.initialize && typeof plugin.initialize === 'function') {
            plugin.initialize(this);
        }
        return plugin;
    }

    getPlugin(name) {
        return this.plugins.get(name);
    }

    hasPlugin(name) {
        return this.plugins.has(name);
    }

    removePlugin(name) {
        const plugin = this.plugins.get(name);
        if (plugin && plugin.destroy && typeof plugin.destroy === 'function') {
            plugin.destroy();
        }
        return this.plugins.delete(name);
    }

    destroy() {
        this.plugins.forEach((plugin, name) => {
            this.removePlugin(name);
        });
        this.plugins.clear();
    }
    // Compute delegation methods
    compute(name, fn, options = {}) {
        const computePlugin = this.getPlugin('compute');
        if (!computePlugin) {
            throw new Error('Compute plugin not available. Add ComputePlugin via features.compute in Juris config.');
        }
        return computePlugin.compute(name, fn, options);
    }

    configureCompute(defaults) {
        const computePlugin = this.getPlugin('compute');
        if (!computePlugin) {
            throw new Error('Compute plugin not available.');
        }
        return computePlugin.configureCompute(defaults);
    }

    getComputeStats(name = null) {
        const computePlugin = this.getPlugin('compute');
        return computePlugin ? computePlugin.getComputeStats(name) : null;
    }

    clearCompute(name = null) {
        const computePlugin = this.getPlugin('compute');
        if (computePlugin) {
            computePlugin.clearCompute(name);
        }
    }
    #getPathParts(path) {
        let parts = this.pathCache.get(path);
        if (parts) return parts;
        parts = path.split('.').filter(Boolean);
        if (this.pathCache.size >= this.maxCacheSize) {
            const firstKey = this.pathCache.keys().next().value;
            this.pathCache.delete(firstKey);
        }        
        this.pathCache.set(path, parts);
        return parts;
    }

    track(fn, isolated = false) {
        const saved = this.deps;
        const deps = isolated ? null : (this.deps = new Set());
        let result;        
        try {
            result = fn();
        } finally {
            this.deps = saved;
        }
        return { 
            result, 
            deps: deps ? [...deps] : [] 
        };
    }
    
    reset() {
        if (this.isBatching) {
            this.batchQueue = [];
            this.batchedPaths.clear();
            this.isBatching = false;
        }
        this.state = JSON.parse(JSON.stringify(this.initialState));
        this.pathCache.clear();
        
        // Add this:
        this.plugins.forEach(plugin => {
            if (plugin.reset && typeof plugin.reset === 'function') {
                plugin.reset();
            }
        });
    }

    getState(path, defaultValue = null, track = true) {
        if (!isValidPath(path)) return defaultValue;
        if (track && this.deps) this.deps.add(path);
        const dotIndex = path.indexOf('.');
        if (dotIndex === -1) {
            const value = this.state[path];
            return value !== undefined ? value : defaultValue;
        }
        let parts = this.pathCache.get(path);
        if (!parts) {
            parts = path.split('.');
            if (this.pathCache.size >= this.maxCacheSize) {
                this.pathCache.delete(this.pathCache.keys().next().value);
            }
            this.pathCache.set(path, parts);
        }
        let current = this.state;
        for (let i = 0; i < parts.length; i++) {
            current = current?.[parts[i]];
            if (current === undefined) return defaultValue;
        }
        return current;
    }

    setState(path, value, context = {}) {        
        if (!isValidPath(path) || this.#hasCircularUpdate(path)) return;
        if (this.isBatching) {
            this.#queueBatchedUpdate(path, value, context);
            return;
        }
        this.#setStateImmediate(path, value, context);
    }

    executeBatch(callback) {
        if (this.isBatching) return callback();
        this.#beginBatch();
        try {
            const result = callback();
            if (result && typeof result.then === 'function') {
                return result
                    .then(value => { this.#endBatch(); return value; })
                    .catch(error => { this.#endBatch(); throw error; });
            }
            this.#endBatch();
            return result;
        } catch (error) {
            this.#endBatch();
            throw error;
        }
    }

    #beginBatch() {
        this.isBatching = true;
        this.batchQueue = [];
        this.batchedPaths.clear();
    }

    #endBatch() {
        if (!this.isBatching) {
            log.ew && console.warn(log.w('endBatch() called without beginBatch()', {}, 'framework'));
            return;
        }
        this.isBatching = false;
        if (this.batchQueue.length === 0) return;
        this.#processBatchedUpdates();
    }

    isBatchingActive() {return this.isBatching;}

    getBatchQueueSize() {return this.batchQueue.length;}

    clearBatch() {
        if (this.isBatching) {
            this.batchQueue = [];
            this.batchedPaths.clear();
        }
    }

    #queueBatchedUpdate(path, value, context) {
        this.batchQueue = this.batchQueue.filter(update => update.path !== path);
        this.batchQueue.push({ path, value, context, timestamp: Date.now() });
        this.batchedPaths.add(path);
    }

    #processBatchedUpdates() {
        const updates = [...this.batchQueue];
        this.batchQueue = [];
        this.batchedPaths.clear();
        const pathGroups = new Map();
        updates.forEach(update => pathGroups.set(update.path, update));
        const wasUpdating = this.isUpdating;
        this.isUpdating = true;
        const appliedUpdates = [];
        pathGroups.forEach(update => {
            const oldValue = this.getState(update.path, null, false);
            let finalValue = update.value;
            for (const middleware of this.middleware) {
                try {
                    const result = middleware({ path: update.path, oldValue, newValue: finalValue, context: update.context, state: this.state });
                    if (result !== undefined) finalValue = result;
                } catch (error) {
                    log.ee && console.error(log.e('Middleware error in batch', {
                        path: update.path,
                        error: error.message
                    }, 'application'));
                }
            }
            if (deepEquals(oldValue, finalValue)) return;
            this.#setStateFast(update.path, finalValue);
            appliedUpdates.push({ path: update.path, oldValue, newValue: finalValue });
        });
        this.isUpdating = wasUpdating;
        const parentPaths = new Set();
        appliedUpdates.forEach(({ path }) => {
            const parts = this.#getPathParts(path);
            for (let i = 1; i <= parts.length; i++) {
                parentPaths.add(parts.slice(0, i).join('.'));
            }
        });
        parentPaths.forEach(path => {
            if (this.subscribers.has(path)) this.#triggerPathSubscribers(path);
            if (this.extSubs.has(path)) {
                this.extSubs.get(path).forEach(({ callback, hierarchical }) => {
                    try {
                        callback(this.getState(path, null, false), null, path);
                    } catch (error) {
                        log.ee && console.error(log.e('External subscriber error:', error), 'application');
                    }
                });
            }
        });
    }

    #setStateImmediate(path, value, context = {}) {
        const oldValue = this.getState(path, null, false);
        let finalValue = value;
        // Optimize middleware loop
        if (this.middleware.length > 0) {
            for (let i = 0; i < this.middleware.length; i++) {
                try {
                    const result = this.middleware[i]({ path, oldValue, newValue: finalValue, context, state: this.state });
                    if (result !== undefined) finalValue = result;
                } catch (error) {
                    log.ee && console.error(log.e('Middleware error', { path, error: error.message, middlewareName: middleware.name || 'anonymous' }, 'application'));
                }
            }
        }
        if (deepEquals(oldValue, finalValue)) {
            log.ed && console.debug(log.d('State unchanged, skipping update', { path }, 'framework'));
            return;
        }
        this.#setStateFast(path, finalValue);
        if (!this.isUpdating) {
            this.isUpdating = true;
            this.newSubs = this.newSubs || new Set();
            this.newSubs.add(path);
            this.#notifySubscribers(path, finalValue, oldValue);
            this.#notifyExternalSubscribers(path, finalValue, oldValue);
            this.newSubs.delete(path);
            this.isUpdating = false;
        }
    }

    // Optimized state mutation with inline operations
    #setStateFast(path, value) {
        const dotIndex = path.indexOf('.');
        if (dotIndex === -1) {
            this.state[path] = value;
            return;
        }
        
        // Inline path parsing and object creation
        let parts = this.pathCache.get(path);
        if (!parts) {
            parts = path.split('.');
            if (this.pathCache.size >= this.maxCacheSize) {
                this.pathCache.delete(this.pathCache.keys().next().value);
            }
            this.pathCache.set(path, parts);
        }
        
        let current = this.state;
        const lastIndex = parts.length - 1;
        for (let i = 0; i < lastIndex; i++) {
            const part = parts[i];
            if (current[part] == null || typeof current[part] !== 'object') {
                current[part] = {};
            }
            current = current[part];
        }
        current[parts[lastIndex]] = value;
    }

    subscribe(path, callback, hierarchical = true) {
        if (!this.extSubs.has(path)) this.extSubs.set(path, new Set());
        const subscription = { callback, hierarchical };
        this.extSubs.get(path).add(subscription);
        return () => {
            const subs = this.extSubs.get(path);
            if (subs) {
                subs.delete(subscription);
                if (subs.size === 0) this.extSubs.delete(path);
            }
        };
    }

    subscribeExact(path, callback) {
        return this.subscribe(path, callback, false);
    }

    subscribeInternal(path, callback) {
        if (!this.subscribers.has(path)) this.subscribers.set(path, new Set());
        this.subscribers.get(path).add(callback);
        return () => {
            const subs = this.subscribers.get(path);
            if (subs) {
                subs.delete(callback);
                if (subs.size === 0) this.subscribers.delete(path);
            }
        };
    }

    #notifySubscribers(path, newValue, oldValue) {
        this.#triggerPathSubscribers(path);
        const parts = this.#getPathParts(path);
        for (let i = parts.length - 1; i > 0; i--) {
            this.#triggerPathSubscribers(parts.slice(0, i).join('.'));
        }
        const prefix = path ? path + '.' : '';
        const allPaths = new Set([...this.subscribers.keys(), ...this.extSubs.keys()]);
        allPaths.forEach(subscriberPath => {
            if (subscriberPath.startsWith(prefix) && subscriberPath !== path) {
                this.#triggerPathSubscribers(subscriberPath);
            }
        });
    }

    #notifyExternalSubscribers(changedPath, newValue, oldValue) {
        this.extSubs.forEach((subscriptions, subscribedPath) => {
            subscriptions.forEach(({ callback, hierarchical }) => {
                const shouldNotify = hierarchical ?
                    (changedPath === subscribedPath || changedPath.startsWith(subscribedPath + '.')) :
                    changedPath === subscribedPath;
                if (shouldNotify) {
                    try {
                        callback(newValue, oldValue, changedPath);
                    } catch (error) {
                        log.ee && console.error(log.e('External subscriber error:', error), 'application');
                    }
                }
            });
        });
    }

    #triggerPathSubscribers(path) {
        const subs = this.subscribers.get(path);
        if (subs && subs.size > 0) {
            new Set(subs).forEach(callback => {
                try {
                    const { deps } = this.track(() => callback());
                    deps.forEach(newPath => {
                        const existingSubs = this.subscribers.get(newPath);
                        if (!existingSubs || !existingSubs.has(callback)) {
                            this.subscribeInternal(newPath, callback);
                        }
                    });
                } catch (error) {
                    log.ee && console.error(log.e('Subscriber error:', error), 'application');
                }
            });
        }
    }

    #hasCircularUpdate(path) {
        if (!this.newSubs) this.newSubs = new Set();
        if (this.newSubs.has(path)) {
            log.ew && console.warn(log.w('Circular dependency detected', { path }, 'framework'));
            return true;
        }
        return false;
    }

    startTracking() {
        const deps = new Set();
        this.deps = deps;
        return deps;
    }

    endTracking() {
        const deps = this.deps;
        this.deps = null;
        return deps || new Set();
    }
}

class ComponentManager {
    constructor(juris) {
        this.juris = juris;
        this.components = new Map();
        this.insts = new Map();
        this.namedComps = new Map();
        this.comps = new Map();
        this.compStates = new Map();
        this.placeholders = new Map();
        this.asyncPropsCache = new Map();
    }

    register(name, compFn) {
        this.components.set(name, compFn);
    }
    getAsyncStats() {
        return {
            placeholders: this.placeholders.size,
            cachedAsyncProps: this.asyncPropsCache.size
        };
    }
    create(name, props = {}) {
        const compFn = this.components.get(name);
        if (!compFn) {
            log.ee && console.error(log.e('Component not found', { name }, 'application'));
            return null;
        }
        try {
            if (this.juris.getDR()._hasAsyncProps(props)) {
                return this.#createWithAsyncProps(name, compFn, props);
            }
            const { comptId, compStates, context } = this.#getCompContext(name);
            const result = this.#callComponentFunction(compFn, props, context);
            if (result?.then) {
                return this.#handleAsyncComp(promisify(result), name, props, compStates);
            }
            return this.#procCompResult(result, name, props, compStates);
        } catch (error) {
            log.ee && console.error(log.e('Component creation failed!', { name, error: error.message }, 'application'));
            return this.#newErrElm(name, error);
        }
    }

    #callComponentFunction(componentFn, props, context) {
        const funcStr = componentFn.toString();
        const paramMatch = funcStr.match(/^[^(]*\(([^)]*)\)/);
        if (!paramMatch || !paramMatch[1].trim()) {
            return componentFn();
        }        
        const params = paramMatch[1].split(',').map(p => p.trim());        
        if (params.length === 1) {
            const param = params[0];
            if (param.startsWith('{') && param.includes('}') || param === 'props'|| param === 'prp') {
                return componentFn(props);
            } else {
                return componentFn(context);
            }
        } else {
            return componentFn(props, context);
        }
    }

    #getCompContext(name) {
        const { comptId, compStates } = this.#newCompId(name);
        const context = this.#getCompCxt(comptId, compStates);
        return { comptId, compStates, context };
    }

    #newCompId(name) {
        if (!this.comps.has(name)) {
            this.comps.set(name, 0);
        }
        const instanceIndex = this.comps.get(name) + 1;
        this.comps.set(name, instanceIndex);
        const comptId = `${name}#${instanceIndex}`;
        const compStates = new Set();
        return { comptId, compStates };
    }

    #getCompCxt(compId, states) {
        const ctx = this.juris.createContext();
        ctx.newState = (key, initVal) => {
            const path = `##local.${compId}.${key}`;
            if (this.juris.getSM().getState(path, Symbol('not-found')) === Symbol('not-found')) {
                this.juris.getSM().setState(path, initVal);
            }
            states.add(path);
            return [
                () => this.juris.getSM().getState(path, initVal),
                val => this.juris.getSM().setState(path, val)
            ];
        };
        return ctx;
    }

    #createWithAsyncProps(name, compFn, props) {
        const ph = this.#newPlaceholder(name, 'async-props-loading');
        this.placeholders.set(ph, { name, props, type: 'async-props' });
        this.#resolveAsyncProps(props).then(resolved => {
            try {
                const elem = this.#createSyncComponent(name, compFn, resolved);
                this.#replacePlaceholder(ph, elem);
            } catch (err) {
                this.#replaceWithError(ph, err);
            }
        }).catch(err => this.#replaceWithError(ph, err));
        return ph;
    }

    async #resolveAsyncProps(props) {
        const key = this.#newKey(props);
        const cached = this.asyncPropsCache.get(key);
        if (cached && Date.now() - cached.timestamp < 5000) {
            return cached.props;
        }
        const resolved = {};
        for (const [k, v] of Object.entries(props)) {
            if (v?.then) {
                try {
                    resolved[k] = await v;
                } catch (err) {
                    resolved[k] = { __asyncError: err.message };
                }
            } else {
                resolved[k] = v;
            }
        }
        this.asyncPropsCache.set(key, { props: resolved, timestamp: Date.now() });
        return resolved;
    }

    #createSyncComponent(name, compFn, props) {
        const { comptId, compStates, context } = this.#getCompContext(name);
        const result = this.#callComponentFunction(compFn, props, context);
        if (result?.then) {
            return this.#handleAsyncComp(promisify(result), name, props, compStates);
        }
        return this.#procCompResult(result, name, props, compStates);
    }

    #handleAsyncComp(promise, name, props, states) {
        const ph = this.#newPlaceholder(name, 'async-loading');
        this.placeholders.set(ph, { name, props, states });
        promise.then(result => {
            try {
                const elem = this.#procCompResult(result, name, props, states);
                this.#replacePlaceholder(ph, elem);
            } catch (err) {
                log.ee && console.error(log.e('Async component failed', { name, error: err.message }, 'application'));
                this.#replaceWithError(ph, err);
            }
        }).catch(err => this.#replaceWithError(ph, err));
        return ph;
    }

    #procCompResult(result, name, props, states) {
        if (Array.isArray(result)) {
            return this.#newCompFrag(result, name, props, states);
        }
        if (result && typeof result === 'object') {
            if (this.#hasHooks(result)) {
                return this.#newHooksComp(result, name, props, states);
            }
            if (typeof result.render === 'function' && !this.#hasHooks(result)) {
                return this.#newRenderComp(result, name, props, states);
            }
            const keys = Object.keys(result);
            if (keys.length === 1 && typeof keys[0] === 'string' && keys[0].length > 0) {
                const el = this.juris.getDR().render(result, name);
                if (el && states.size > 0) {
                    this.compStates.set(el, states);
                }
                if (result.api && typeof result.api === 'object' && el) {
                    el.api = result.api;
                }
                if (el && el.setAttribute) {
                    el.setAttribute('data-juris-component', name);
                    el._jurisComponent = name;
                }
                return el;
            }
        }
        const el = this.juris.getDR().render(result, name);
        if (el && states.size > 0) {
            this.compStates.set(el, states);
        }
        if (el && el.setAttribute) {
            el.setAttribute('data-juris-component', name);
            el._jurisComponent = name;
        }
        return el;
    }

    #newCompFrag(result, name, props, states) {
        const frag = document.createDocumentFragment();
        const virt = this.#newVirtContainer(frag, name, props);
        const subs = [];
        this.juris.getDR()._handleChildren(virt, result, subs);
        frag._jurisComponent = {
            name,
            props,
            virtual: virt,
            cleanup: () => {
                subs.forEach(unsub => { try { unsub(); } catch(e) {} });
            }
        };
        if (states?.size > 0) {
            frag._juriscompStates = states;
        }
        return frag;
    }

    #newHooksComp(result, name, props, states) {
        const inst = this.#newComp(result, name, props);
        let cont = document.createElement('div');
        cont.setAttribute('data-juris-component', name);
        const updateRender = () => {
            const { result: res, deps } = this.juris.getSM().track(() => {
                return inst.render ? inst.render() : result;
            });
            const content = this.juris.getDR().render(res, name, props);
            if (cont.parentNode) {
                if (cont._reactiveSubscriptions) {
                    cont._reactiveSubscriptions.forEach(unsub => unsub());
                }
                let newCont;
                if (content.constructor === HTMLDivElement) {
                    newCont = content;
                } else {
                    newCont = document.createElement('div');
                    newCont.setAttribute('data-juris-component', name);
                    newCont.appendChild(content);
                }
                cont.parentNode.replaceChild(newCont, cont);
                cont = newCont;
            } else {
                if (content.constructor === HTMLDivElement) {
                    cont = content;
                } else {
                    cont.appendChild(content);
                }
            }
            
            // Subscribe to dependencies for future updates
            deps.forEach(path => {
                const unsub = this.juris.getSM().subscribeInternal(path, updateRender);
                // Store subscription for cleanup
                if (!cont._reactiveSubscriptions) {
                    cont._reactiveSubscriptions = [];
                }
                cont._reactiveSubscriptions.push(unsub);
            });
        };
        
        // Initial render
        updateRender();
        
        if (cont) {
            this.#setupComp(cont, inst, states, name);
            if (inst.api && typeof inst.api === 'object') {
                cont.api = inst.api;
            }
        }
        
        return cont;
    }

    #newRenderComp(result, name, props, states) {
        const cont = document.createElement('div');
        cont.setAttribute('data-juris-reactive-render', name);
        const data = { 
            name, 
            api: result.api || {}, 
            render: result.render 
        };
        this.insts.set(cont, data);
        if (result.api && typeof result.api === 'object') {
            cont.api = result.api;
        }
        if (result.api) {
            this.namedComps.set(name, { elm: cont, instance: data });
        }
        const updateRender = () => this.#runRender(result.render, cont, name);
        const subs = [];
        this.juris.getDR()._createReactiveUpdate(cont, updateRender, subs);
        if (subs.length > 0) {
            this.juris.getDR().subscriptions.set(cont, { 
                subscriptions: subs, 
                eventListeners: [] 
            });
        }
        if (states?.size > 0) {
            this.compStates.set(cont, states);
        }
        return cont;
    }

    #newComp(result, name, props) {
        return {
            name, props,
            hooks: result.hooks || { onMount: result.onMount, onUpdate: result.onUpdate, onUnmount: result.onUnmount },
            api: result.api || {},
            render: result.render
        };
    }

    #setupComp(el, inst, states, name) {
        this.insts.set(el, inst);        
        if (states?.size > 0) {
            this.compStates.set(el, states);
        }
        if (inst.api && typeof inst.api === 'object') {
            el.api = inst.api;
        }       
        if (inst.api && Object.keys(inst.api).length > 0) {
            this.namedComps.set(name, { elm: el, instance: inst });
        }
        if (inst.hooks.onMount) {
            setTimeout(() => this.#runHook(inst.hooks.onMount, el, name, 'onMount'), 0);
        }
    }

    #runRender(renderFn, cont, name) {
        try {
            const res = renderFn(cont);
            if (res?.then) {
                cont.innerHTML = '<div class="juris-loading">Loading...</div>';
                promisify(res).then(resolved => {
                    cont.innerHTML = '';
                    const el = this.juris.getDR().render(resolved);
                    if (el) cont.appendChild(el);
                }).catch(err => {
                    log.ee && console.error(`Async render error for ${name}:`, err);
                    cont.innerHTML = `<div class="juris-error">Render Error: ${err.message}</div>`;
                });
                return;
            }
            const children = Array.from(cont.children);
            children.forEach(child => this.cleanup(child));
            cont.innerHTML = '';
            const el = this.juris.getDR().render(res);
            if (el) cont.appendChild(el);
        } catch (err) {
            log.ee && console.error(`Error in reactive render for ${name}:`, err);
            cont.innerHTML = `<div class="juris-error">Render Error: ${err.message}</div>`;
        }
    }

    #runHook(hook, args, componentName, hookName) {
        try {
            const result = Array.isArray(args) ? hook(...args) : hook(args);
            if (result?.then) {
                promisify(result).catch(error =>
                    log.ee && console.error(log.e(`Async ${hookName} error in ${componentName}:`, error), 'application')
                );
            }
        } catch (error) {
            log.ee && console.error(log.e(`${hookName} error in ${componentName}:`, error), 'application');
        }
    }

    #newVirtContainer(frag, name, props) {
        const virt = {
            _isVirtual: true,
            _fragment: frag,
            _componentName: name,
            _componentProps: props,
            appendChild: (child) => frag.appendChild(child),
            removeChild: (child) => {
                if (child.parentNode === frag) {
                    frag.removeChild(child);
                }
            },
            replaceChild: (newChild, oldChild) => {
                if (oldChild.parentNode === frag) {
                    frag.replaceChild(newChild, oldChild);
                }
            },
            get children() {
                return Array.from(frag.childNodes);
            },
            get parentNode() { return null; },
            textContent: ''
        };
        Object.defineProperty(virt, 'textContent', {
            set(val) {
                while (frag.firstChild) {
                    frag.removeChild(frag.firstChild);
                }
                if (val) {
                    frag.appendChild(document.createTextNode(val));
                }
            },
            get() { return ''; }
        });
        return virt;
    }

    #newPlaceholder(name, className) {
        const tempElement = document.createElement('div');
        tempElement.id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        return this._createPlaceholder(`Loading ${name}...`, className, tempElement);
    }

    #replacePlaceholder(placeholder, newElement) {
        if (newElement && placeholder.parentNode) {
            placeholder.parentNode.replaceChild(newElement, placeholder);
        }
        this.placeholders.delete(placeholder);
    }

    #replaceWithError(placeholder, error) {
        const errorElement = this.#newErrElm(
            placeholder._jurisComponent?.name || 'Unknown Component', 
            error
        );
        if (placeholder.parentNode) {
            placeholder.parentNode.replaceChild(errorElement, placeholder);
        }
        this.placeholders.delete(placeholder);
    }

    #newErrElm(name, error) {
        const elm = document.createElement('div');
        elm.style.cssText = 'color: red; border: 1px solid red; padding: 8px; background: #ffe6e6; font-family: monospace;';
        elm.textContent = `Component Error in ${name}: ${error.message}`;
        return elm;
    }

    #hasHooks(result) {
        return result.hooks && (result.hooks.onMount || result.hooks.onUpdate || result.hooks.onUnmount) ||
            result.onMount || result.onUpdate || result.onUnmount;
    }

    #newKey(props) {
        return JSON.stringify(props, (key, value) => value?.then ? '[Promise]' : value);
    }

    cleanup(elm) {
        if (elm instanceof DocumentFragment) {
            this.#cleanupFragment(elm);
            return;
        }
        const instance = this.insts.get(elm);
        if (instance?.hooks?.onUnmount) {
            this.#runHook(instance.hooks.onUnmount, elm, instance.name, 'onUnmount');
        }
        if (elm._reactiveSubscriptions) {
            elm._reactiveSubscriptions.forEach(unsubscribe => {
                try { unsubscribe(); } catch (error) { 
                    log.ew && console.warn('Error cleaning up reactive subscription:', error); 
                }
            });
            elm._reactiveSubscriptions = [];
        }
        this.#cleanupcompStates(elm);
        if (this.placeholders.has(elm)) {
            this.placeholders.delete(elm);
        }
        this.insts.delete(elm);
    }

    #cleanupFragment(fragment) {
        if (fragment._jurisComponent?.cleanup) {
            fragment._jurisComponent.cleanup();
        }
        if (fragment._juriscompStates) {
            this.#cleanupStateSet(fragment._juriscompStates);
        }
    }

    #cleanupcompStates(elm) {
        const states = this.compStates.get(elm);
        if (states) {
            this.#cleanupStateSet(states);
            this.compStates.delete(elm);
        }
    }

    #cleanupStateSet(stateSet) {
        stateSet.forEach(statePath => {
            const pathParts = statePath.split('.');
            let current = this.juris.getSM().state;
            for (let i = 0; i < pathParts.length - 1; i++) {
                if (current[pathParts[i]]) {
                    current = current[pathParts[i]];
                } else {
                    return;
                }
            }
            delete current[pathParts[pathParts.length - 1]];
        });
    }

    getComponent(name) {return this.namedComps.get(name)?.instance || null;}

    getComponentAPI(name) {return this.namedComps.get(name)?.instance?.api || null;}

    getComponentElement(name) {return this.namedComps.get(name)?.elm || null;}

    getNamedComponents() { return Array.from(this.namedComps.keys()); }

    clearAsyncPropsCache() { this.asyncPropsCache.clear(); }

    _createPlaceholder(text, className, elm = null) {
        const config = this.juris.getDR()._getPlaceholderConfig(elm);
        const placeholder = document.createElement('div');
        placeholder.className = config.className;
        placeholder.textContent = config.text;
        if (config.style) placeholder.style.cssText = config.style;
        return placeholder;
    }
}

class DOMRenderer {
    constructor(juris) {
        this.juris = juris;
        this.subscriptions = new Map();
        this.componentStack = [];
        this.objTreeAnalyzer = null;
        this.keyedNodes = new Map();
        this.nodeKeys = new Map();
        this.SKIP_ATTRS = new Set(['children', 'key']);
        this.placeholders = new Map();
        this.placeholderConfigs = new Map();
        this.defaultPlaceholder = {
            className: 'juris-async-loading',
            style: 'padding: 8px; background: #f0f0f0; border: 1px dashed #ccc; opacity: 0.7;',
            text: 'Loading...',
            children: null,
            errorClassName: 'juris-async-error',
            errorStyle: 'color: red; padding: 8px; background: #ffe6e6;'
        };        
        this.TOUCH_CONFIG = {
            moveThreshold: 10,
            timeThreshold: 300,
            touchAction: 'manipulation',
            tapHighlight: 'transparent',
            touchCallout: 'none'
        };
        
        this.cleanupTimeout = null;
        this.elementTypeCache = new Map();
        new MutationObserver(() => {
            if (this.cleanupTimeout) clearTimeout(this.cleanupTimeout);
            this.cleanupTimeout = setTimeout(() => {
                this.subscriptions.forEach((data, elm) => {
                    if (!elm.isConnected) {
                        this.cleanup(elm);
                    }
                });
            }, 100);
        }).observe(document.body, { childList: true, subtree: true });        
        this._testMode = false;
        this._lastObjectTree = null;
    }

    #handleAsync = (value, handlers = {}, context = {}) => {
        const {
            onStart = () => {},
            onResolved = () => {},
            onError = (error) => {
                log.ee && console.error(log.e('Async operation failed:', error), 'application');
            },
            onFinally = () => {}
        } = handlers;
        
        if (!this.#isPromiseLike(value)) {
            onStart();
            onResolved(value);
            onFinally();
            return Promise.resolve(value);
        }
        
        // Apply placeholder if context provided
        if (context.elm && context.type) {
            this.#applyPlaceholder(context.elm, context.type, context);
        }
        onStart();
        
        const trackedPromise = promisify(value);
        
        return trackedPromise
            .then(resolved => {
                if (context.elm && context.type) {
                    this.#removePlaceholder(context.elm);
                }
                onResolved(resolved);
                return resolved;
            })
            .catch(error => {
                if (context.elm && context.type) {
                    this.#applyErrorState(context.elm, context.type, error, context);
                }
                onError(error);
                throw error;
            })
            .finally(() => {
                onFinally();
            });
    };
    
    #applyPlaceholder(elm, type, context = {}) {
        const config = this._getPlaceholderConfig(elm);
        
        switch(type) {
            case 'children':
            case 'reactive-children':
            case 'fragment-child':
                this.#applyChildrenPlaceholder(elm, config);
                break;                
            case 'text':
                this.#applyTextPlaceholder(elm, config);
                break;
            case 'attribute':
                this.#applyAttributePlaceholder(elm, config, context.attributeName);
                break;
            case 'style':
                this.#applyStylePlaceholder(elm, config);
                break;
            case 'component':
                return this.#createComponentPlaceholder(config, context.componentName);
        }
    }
    
    #applyChildrenPlaceholder(elm, config) {
        elm.innerHTML = '';
        let placeholder;
        
        if (config.children) {
            placeholder = this.render(config.children);
        } else {
            placeholder = document.createElement('div');
            placeholder.className = config.className;
            placeholder.textContent = config.text;
            if (config.style) placeholder.style.cssText = config.style;
        }
        
        elm.appendChild(placeholder);
        this.placeholders.set(elm, { 
            type: 'children', 
            placeholder,
            originalContent: elm._jurisLastChildren 
        });
    }
    
    #applyTextPlaceholder(elm, config) {
        const originalText = elm.textContent;
        elm.textContent = config.text;
        elm.classList.add(config.className);
        if (config.style) {
            elm.setAttribute('data-juris-original-style', elm.style.cssText);
            elm.style.cssText = config.style;
        }
        this.placeholders.set(elm, { 
            type: 'text', 
            originalText,
            hadStyle: !!config.style 
        });
    }
    
    #applyAttributePlaceholder(elm, config, attributeName) {
        elm.classList.add(config.className);
        if (attributeName) {
            const originalValue = elm.getAttribute(attributeName);
            elm.setAttribute(attributeName, 'loading');
            this.placeholders.set(elm, { 
                type: 'attribute',
                attributeName,
                originalValue 
            });
        }
    }
    
    #applyStylePlaceholder(elm, config) {
        elm.classList.add(config.className);
        const originalStyle = elm.style.cssText;
        if (config.style) {
            elm.style.cssText = config.style;
        }
        this.placeholders.set(elm, { 
            type: 'style',
            originalStyle 
        });
    }
    
    #createComponentPlaceholder(config, componentName) {
        const placeholder = document.createElement('div');
        placeholder.className = config.className;
        placeholder.textContent = componentName ? `Loading ${componentName}...` : config.text;
        if (config.style) placeholder.style.cssText = config.style;
        placeholder.setAttribute('data-juris-placeholder', 'component');
        return placeholder;
    }
    
    #removePlaceholder(elm) {
        const placeholderData = this.placeholders.get(elm);
        if (!placeholderData) return;
        
        const config = this._getPlaceholderConfig(elm);
        elm.classList.remove(config.className);
        
        switch(placeholderData.type) {
            case 'children':
                if (placeholderData.placeholder && placeholderData.placeholder.parentNode === elm) {
                    elm.removeChild(placeholderData.placeholder);
                }
                break;
                
            case 'text':
                if (placeholderData.hadStyle) {
                    const originalStyle = elm.getAttribute('data-juris-original-style');
                    elm.style.cssText = originalStyle || '';
                    elm.removeAttribute('data-juris-original-style');
                }
                break;
                
            case 'style':
                elm.style.cssText = placeholderData.originalStyle || '';
                break;
        }
        
        this.placeholders.delete(elm);
    }
    
    #applyErrorState(elm, type, error, context = {}) {
        const config = this._getPlaceholderConfig(elm);
        this.#removePlaceholder(elm);
        
        const errorMessage = `Error: ${error.message}`;
        
        switch(type) {
            case 'children':
            case 'reactive-children':
            case 'fragment-child':
                elm.innerHTML = `<div class="${config.errorClassName}" style="${config.errorStyle}">${errorMessage}</div>`;
                break;
                
            case 'text':
                elm.textContent = errorMessage;
                elm.classList.add(config.errorClassName);
                if (config.errorStyle) elm.style.cssText = config.errorStyle;
                break;
                
            case 'attribute':
                elm.classList.add(config.errorClassName);
                if (context.attributeName) {
                    elm.setAttribute(context.attributeName, 'error');
                    elm.setAttribute('data-juris-error', errorMessage);
                }
                break;
                
            case 'style':
                elm.classList.add(config.errorClassName);
                if (config.errorStyle) elm.style.cssText = config.errorStyle;
                break;
        }
    }
    
    #createReactiveHandler(elm, getValue, updateDom, options = {}) {
        let lastValue = options.trackChanges ? null : undefined;
        let isInitialized = false;
        
        const update = () => {
            try {
                const result = getValue();
                
                const asyncContext = {
                    elm,
                    type: options.type || 'generic',
                    attributeName: options.attributeName
                };
                
                return this.#handleAsync(result, {
                    onResolved: (resolved) => {
                        if (!options.trackChanges || !isInitialized || !deepEquals(resolved, lastValue)) {
                            updateDom(resolved);
                            if (options.trackChanges) {
                                lastValue = resolved;
                                isInitialized = true;
                            }
                        }
                    },
                    onError: (error) => {
                        if (options.onError) {
                            options.onError(error);
                        } else {
                            log.ee && console.error(log.e(`Error in reactive ${options.name}:`, error), 'application');
                        }
                    }
                }, asyncContext);
            } catch (error) {
                if (options.onError) {
                    options.onError(error);
                } else {
                    log.ee && console.error(log.e(`Error in reactive ${options.name}:`, error), 'application');
                }
            }
        };
        
        return update;
    }
    
    #extractKey(vnode, index) {
        if (typeof vnode === 'string' || typeof vnode === 'number' || !vnode) {
            return null;
        }
        if (Array.isArray(vnode)) {
            return null;
        }
        if (typeof vnode === 'object') {
            const tagName = Object.keys(vnode)[0];
            const props = vnode[tagName];
            return props?.key ?? null;
        }
        return null;
    }
    
    #diffChildren(parent, oldChildren, newChildren) {
        if (oldChildren.length === 0 && newChildren.length === 0) return;
        
        const operations = [];
        const oldKeyMap = new Map();
        const newKeyMap = new Map();
        const usedKeys = new Set();
        
        // Build old key map
        const oldNodes = Array.from(parent.childNodes);
        oldNodes.forEach((node, index) => {
            const key = this.nodeKeys.get(node);
            if (key !== undefined) {
                oldKeyMap.set(key, { node, index });
            } else {
                oldKeyMap.set(`__index_${index}`, { node, index });
            }
        });
        
        // Process new children
        for (let i = 0; i < newChildren.length; i++) {
            const child = newChildren[i];
            const key = this.#extractKey(child, i) ?? `__index_${i}`;
            
            if (usedKeys.has(key) && !key.startsWith('__index_')) {
                log.ew && console.warn(log.w(
                    `Duplicate key "${key}" detected. Keys must be unique among siblings.`,
                    { parent: parent.tagName, key },
                    'framework'
                ));
                const fallbackKey = `__index_${i}`;
                newKeyMap.set(fallbackKey, { child, index: i });
                operations.push({ type: 'create', child, index: i, key: fallbackKey });
            } else {
                usedKeys.add(key);
                newKeyMap.set(key, { child, index: i });
                
                if (oldKeyMap.has(key)) {
                    const oldEntry = oldKeyMap.get(key);
                    if (this.#shouldUpdateNode(oldEntry.node, child)) {
                        operations.push({ type: 'update', node: oldEntry.node, child, index: i, key });
                    }
                    if (oldEntry.index !== i) {
                        operations.push({ type: 'move', node: oldEntry.node, from: oldEntry.index, to: i, key });
                    }
                } else {
                    operations.push({ type: 'create', child, index: i, key });
                }
            }
        }
        
        // Find removed nodes
        oldKeyMap.forEach((entry, key) => {
            if (!newKeyMap.has(key)) {
                operations.push({ type: 'remove', node: entry.node, key });
            }
        });
        
        this.#executeChildOperations(parent, operations, newChildren);
    }
    
    #shouldUpdateNode(node, vnode) {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent !== String(vnode);
        }
        return node.nodeType === Node.ELEMENT_NODE;
    }
    
    #executeChildOperations(parent, operations, newChildren) {
        // Remove nodes
        operations.filter(op => op.type === 'remove').forEach(op => {
            if (op.node.parentNode === parent) {
                parent.removeChild(op.node);
                this.nodeKeys.delete(op.node);
                this.cleanup(op.node);
            }
        });
        
        // Create new nodes
        const createdNodes = new Map();
        operations.filter(op => op.type === 'create').forEach(op => {
            const newNode = this.#createChild(op.child);
            if (newNode) {
                createdNodes.set(op.key, newNode);
                if (op.key && typeof op.key === 'string' && !op.key.startsWith('__')) {
                    this.nodeKeys.set(newNode, op.key);
                }
            }
        });
        
        // Update existing nodes
        operations.filter(op => op.type === 'update').forEach(op => {
            this.#updateExistingNode(op.node, op.child);
        });
        
        // Reorder nodes
        const targetOrder = [];
        newChildren.forEach((child, index) => {
            const key = this.#extractKey(child, index) ?? `__index_${index}`;
            const existingOp = operations.find(op => op.key === key && (op.type === 'update' || op.type === 'move'));
            if (existingOp) {
                targetOrder.push(existingOp.node);
            } else if (createdNodes.has(key)) {
                targetOrder.push(createdNodes.get(key));
            }
        });
        
        this.#reorderNodes(parent, targetOrder);
    }
    
    #updateExistingNode(node, vnode) {
        if (node.nodeType === Node.TEXT_NODE) {
            const newContent = String(vnode);
            if (node.textContent !== newContent) {
                node.textContent = newContent;
            }
            return;
        }
        
        if (node.nodeType === Node.ELEMENT_NODE && typeof vnode === 'object' && !Array.isArray(vnode)) {
            const tagName = Object.keys(vnode)[0];
            const props = vnode[tagName] || {};
            const subscriptions = [];
            
            for (const key in props) {
                if (key === 'key') continue;
                const cleanup = this.applyProp(node, key, props[key]);
                if (cleanup && typeof cleanup === 'function') {
                    subscriptions.push(cleanup);
                }
            }
            
            if (subscriptions.length > 0) {
                const existing = this.subscriptions.get(node) || { subscriptions: [], eventListeners: [] };
                existing.subscriptions.push(...subscriptions);
                this.subscriptions.set(node, existing);
            }
        }
    }
    
    #reorderNodes(parent, targetOrder) {
        let lastNode = null;
        
        for (let i = targetOrder.length - 1; i >= 0; i--) {
            const targetNode = targetOrder[i];
            if (!targetNode) continue;
            
            if (targetNode.parentNode === parent) {
                if (lastNode && targetNode.nextSibling !== lastNode) {
                    parent.insertBefore(targetNode, lastNode);
                } else if (!lastNode && targetNode !== parent.lastChild) {
                    parent.appendChild(targetNode);
                }
            } else {
                if (lastNode) {
                    parent.insertBefore(targetNode, lastNode);
                } else {
                    parent.appendChild(targetNode);
                }
            }
            lastNode = targetNode;
        }
    }
    
    render(vnode, componentName = null, returnObjectTree = false) {
        if (this._testMode && returnObjectTree && this.objTreeAnalyzer) {
            return this.objTreeAnalyzer.buildObjectTree(vnode, componentName);
        }
        return this._renderToDOM(vnode, componentName);
    }
    
    _renderToDOM(vnode, componentName = null) {
        if (typeof vnode === 'string' || typeof vnode === 'number') {
            return document.createTextNode(String(vnode));
        }
        
        if (!vnode || typeof vnode !== 'object') return null;
        
        if (Array.isArray(vnode)) {
            return this.#createArrayFragment(vnode, componentName);
        }
        
        const tagName = Object.keys(vnode)[0];
        const props = vnode[tagName] || {};
        
        if (this.componentStack.includes(tagName)) {
            return this.#newErrElm('recursion', [...this.componentStack, tagName].join(' → '));
        }
        
        if (this.juris.getCM().components.has(tagName)) {
            return this.#renderComponent(tagName, props);
        }
        
        if (/^[A-Z]/.test(tagName)) {
            return this.#newErrElm('component', `Component "${tagName}" not registered`);
        }
        
        if (typeof tagName !== 'string' || tagName.length === 0) return null;
        
        let modifiedProps = props;
        if (props.style && this.cssExtractor) {
            const elementName = componentName || tagName;
            modifiedProps = this.cssExtractor.processProps(props, elementName, this);
        }
        
        return this.#createElement(tagName, modifiedProps, componentName);
    }
    
    #createElement(tagName, props, componentName = null) {
        const elm = this.#createElementByType(tagName);
        const allSubscriptions = [];
        
        for (const key in props) {
            if (!props.hasOwnProperty(key) || key === 'key') continue;
            const cleanup = this.applyProp(elm, key, props[key], componentName);
            if (cleanup && typeof cleanup === 'function') {
                allSubscriptions.push(cleanup);
            }
        }
        
        if (allSubscriptions.length > 0) {
            const existing = this.subscriptions.get(elm) || { subscriptions: [], eventListeners: [] };
            existing.subscriptions.push(...allSubscriptions);
            this.subscriptions.set(elm, existing);
        }
        
        return elm;
    }
    
    #createElementByType(tagName) {
        let isSVG = this.elementTypeCache.get(tagName);
        if (isSVG === undefined) {
            try {
                const svgEl = document.createElementNS("http://www.w3.org/2000/svg", tagName);
                const isCommonHTML = ['a', 'script', 'style', 'title'].includes(tagName);
                isSVG = !isCommonHTML && svgEl.constructor !== SVGElement;
                this.elementTypeCache.set(tagName, isSVG);
            } catch {
                isSVG = false;
                this.elementTypeCache.set(tagName, false);
            }
        }
        
        return isSVG 
            ? document.createElementNS("http://www.w3.org/2000/svg", tagName)
            : document.createElement(tagName);
    }
    
    #createArrayFragment(vnode, componentName) {
        const hasReactiveFunctions = vnode.some(item => typeof item === 'function');
        const hasKeys = vnode.some(item => this.#extractKey(item) !== null);
        
        if (hasReactiveFunctions || hasKeys) {
            const fragment = document.createDocumentFragment();
            const subscriptions = [];
            
            if (hasKeys && !hasReactiveFunctions) {
                // Static keyed fragment
                for (let i = 0; i < vnode.length; i++) {
                    const child = vnode[i];
                    const childElement = this.render(child, componentName);
                    if (childElement) {
                        const key = this.#extractKey(child, i);
                        if (key) {
                            this.nodeKeys.set(childElement, key);
                        }
                        fragment.appendChild(childElement);
                    }
                }
            } else {
                // Reactive fragment
                this.#handleReactiveFragmentChildren(fragment, vnode, subscriptions, componentName);
            }
            
            if (subscriptions.length > 0) {
                fragment._jurisCleanup = () => {
                    subscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
                };
            }
            return fragment;
        }
        
        // Static fragment
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < vnode.length; i++) {
            const childElement = this.render(vnode[i], componentName);
            if (childElement) fragment.appendChild(childElement);
        }
        return fragment;
    }
    
    #renderComponent(tagName, props) {
        const componentFn = this.juris.getCM().components.get(tagName);
        if (!componentFn) {
            log.ee && console.error(log.e('Component not found', { name: tagName }, 'application'));
            return null;
        }
        
        if (this.componentStack.includes(tagName)) {
            return this.#newErrElm('recursion', [...this.componentStack, tagName].join(' → '));
        }
        
        this.componentStack.push(tagName);
        const { result, deps } = this.juris.getSM().track(() => 
            this.juris.getCM().create(tagName, props), true);
        this.componentStack.pop();
        
        return result;
    }
    
    #newErrElm(type, message) {
        const elm = document.createElement('div');
        elm.style.cssText = 'color: red; border: 1px solid red; padding: 8px; background: #ffe6e6; font-family: monospace;';
        elm.textContent = message;
        elm.setAttribute('data-juris-error', type);
        return elm;
    }
    
    applyProp(elm, propName, propValue, componentName = null) {
        const subscriptions = [];
        const eventListeners = [];
        
        if (propName === 'children') {
            this._handleChildren(elm, propValue, subscriptions, componentName);
        } else if (propName === 'text') {
            this._handleText(elm, propValue, subscriptions);
        } else if (propName === 'style') {
            this._handleStyle(elm, propValue, subscriptions);
        } else if (propName.startsWith('on')) {
            this._handleEvent(elm, propName, propValue, eventListeners);
        } else if (typeof propValue === 'function') {
            this._handleReactiveAttribute(elm, propName, propValue, subscriptions);
        } else if (this.#isPromiseLike(propValue)) {
            this.#handleAsyncProp(elm, propName, propValue);
        } else {
            this._setStaticAttribute(elm, propName, propValue);
        }
        
        if (subscriptions.length > 0 || eventListeners.length > 0) {
            const existing = this.subscriptions.get(elm) || { subscriptions: [], eventListeners: [] };
            existing.subscriptions.push(...subscriptions);
            existing.eventListeners.push(...eventListeners);
            this.subscriptions.set(elm, existing);
        }
        
        return () => {
            subscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
            eventListeners.forEach(({eventName, handler}) => {
                try { elm.removeEventListener(eventName, handler); } catch(e) {}
            });
        };
    }
    
    #handleAsyncProp(elm, propName, propValue) {
        const asyncContext = {
            elm,
            type: 'attribute',
            attributeName: propName
        };
        
        if (propName === 'innerHTML') {
            asyncContext.type = 'children';
            return this.#handleAsync(propValue, {
                onResolved: (resolved) => {
                    elm.innerHTML = resolved;
                }
            }, asyncContext);
        }
        
        return this.#handleAsync(propValue, {
            onResolved: (resolved) => {
                this._setStaticAttribute(elm, propName, resolved);
            }
        }, asyncContext);
    }
    
    _handleText(elm, text, subscriptions) {
        if (typeof text === 'function') {
            const updateText = this.#createReactiveHandler(
                elm,
                () => text(elm),
                (value) => { elm.textContent = value; },
                { trackChanges: true, name: 'text', type: 'text' }
            );
            this._createReactiveUpdate(elm, updateText, subscriptions);
        } else if (this.#isPromiseLike(text)) {
            const asyncContext = { elm, type: 'text' };
            this.#handleAsync(text, {
                onResolved: (resolved) => {
                    elm.textContent = resolved;
                }
            }, asyncContext);
        } else {
            elm.textContent = text;
        }
    }
    
    _handleStyle(elm, style, subscriptions) {
        if (typeof style === 'function') {
            const updateStyle = this.#createReactiveHandler(
                elm,
                () => {
                    let result = style.length > 0 ? style(elm) : style();
                    if (this.cssExtractor?.postProcessReactiveResult && typeof result === 'object') {
                        result = this.cssExtractor.postProcessReactiveResult(result, 'reactive', elm);
                    }
                    return result;
                },
                (value) => {
                    if (typeof value === 'object') {
                        Object.assign(elm.style, value);
                    }
                },
                { trackChanges: true, name: 'style', type: 'style' }
            );
            this._createReactiveUpdate(elm, updateStyle, subscriptions);
        } else if (this.#isPromiseLike(style)) {
            const asyncContext = { elm, type: 'style' };
            this.#handleAsync(style, {
                onResolved: (resolved) => {
                    if (typeof resolved === 'object') {
                        Object.assign(elm.style, resolved);
                    }
                }
            }, asyncContext);
        } else if (typeof style === 'object') {
            for (const prop in style) {
                if (style.hasOwnProperty(prop)) {
                    const val = style[prop];
                    if (typeof val === 'function') {
                        this.#handleReactiveStyleProperty(elm, prop, val, subscriptions);
                    } else {
                        this.#setStyleProperty(elm, prop, val);
                    }
                }
            }
        }
    }
    
    #handleReactiveStyleProperty(elm, prop, valueFn, subscriptions) {
        const updateStyleProperty = this.#createReactiveHandler(
            elm,
            () => valueFn(elm),
            (value) => this.#setStyleProperty(elm, prop, value),
            { trackChanges: true, name: `style.${prop}`, type: 'style' }
        );
        this._createReactiveUpdate(elm, updateStyleProperty, subscriptions);
    }
    
    _handleReactiveAttribute(elm, attr, valueFn, subscriptions) {
        const updateAttribute = this.#createReactiveHandler(
            elm,
            () => valueFn(elm),
            (value) => this._setStaticAttribute(elm, attr, value),
            { trackChanges: true, name: `attribute '${attr}'`, type: 'attribute', attributeName: attr }
        );
        this._createReactiveUpdate(elm, updateAttribute, subscriptions);
    }
    
    _handleChildren(elm, children, subscriptions, componentName = null) {
        if (typeof children === 'function') {
            this.#handleReactiveChildren(elm, children, subscriptions, componentName);
        } else if (this.#isPromiseLike(children)) {
            const asyncContext = { elm, type: 'children' };
            this.#handleAsync(children, {
                onResolved: (resolved) => {
                    this.#updateChildren(elm, resolved, componentName);
                }
            }, asyncContext);
        } else {
            this.#updateChildren(elm, children, componentName);
        }
    }
    
    #handleReactiveChildren(elm, childrenFn, subscriptions, componentName = null) {
        const updateChildren = () => {
            const { result, deps } = this.juris.getSM().track(() => childrenFn(elm));
            
            const asyncContext = { elm, type: 'reactive-children' };
            
            this.#handleAsync(result, {
                onResolved: (resolved) => {
                    if (result !== "ignore") {
                        if (typeof resolved === 'string' || typeof resolved === 'number') {
                            elm.textContent = String(resolved);
                        } else {
                            this.#updateChildren(elm, resolved, componentName);
                        }
                    }
                }
            }, asyncContext);
            
            deps.forEach(path => {
                const unsub = this.juris.getSM().subscribeInternal(path, updateChildren);
                subscriptions.push(unsub);
            });
        };
        updateChildren();
    }
    
    #updateChildren(elm, children, componentName = null) {
        if (children === "ignore") return;
        
        const lastChildren = elm._jurisLastChildren;
        if (lastChildren === children) {
            return;
        }
        
        if (Array.isArray(children)) {
            if (!elm._jurisChildrenKeyed) {
                elm._jurisChildrenKeyed = children.some(child => this.#extractKey(child) !== null);
            }
            
            if (elm._jurisChildrenKeyed) {
                if (lastChildren && Array.isArray(lastChildren)) {
                    this.#diffChildren(elm, lastChildren, children);
                } else {
                    this.#renderStaticChildren(elm, children, componentName);
                }
            } else if (children.some(child => typeof child === 'function')) {
                this.#renderReactiveChildren(elm, children, componentName);
            } else {
                this.#renderStaticChildren(elm, children, componentName);
            }
        }
        
        elm._jurisLastChildren = children;
    }
    
    #handleReactiveFragmentChildren(fragment, children, subscriptions, componentName) {
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (typeof child === 'function') {
                const { node, cleanup } = this.#createIndividualReactiveChild(child, i, componentName, fragment);
                if (node) {
                    fragment.appendChild(node);
                    subscriptions.push(cleanup);
                }
            } else if (child != null) {
                const childElement = this.#createChild(child, componentName);
                if (childElement) {
                    const key = this.#extractKey(child, i);
                    if (key) {
                        this.nodeKeys.set(childElement, key);
                    }
                    fragment.appendChild(childElement);
                }
            }
        }
    }
    
    #renderReactiveChildren(elm, children, componentName) {
        elm.textContent = '';
        const cleanupFunctions = [];
        const fragment = document.createDocumentFragment();
        
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (typeof child === 'function') {
                const { node, cleanup } = this.#createIndividualReactiveChild(child, i, componentName, elm);
                if (node) {
                    fragment.appendChild(node);
                    cleanupFunctions.push(cleanup);
                }
            } else if (child != null) {
                const childElement = this.#createChild(child, componentName);
                if (childElement) {
                    fragment.appendChild(childElement);
                }
            }
        }
        
        if (fragment.hasChildNodes()) elm.appendChild(fragment);
        
        elm._reactiveCleanup = () => {
            cleanupFunctions.forEach(cleanup => { try { cleanup(); } catch(e) {} });
        };
    }
    
    #createIndividualReactiveChild(childFn, index, componentName, parentElement) {
        const config = this._getPlaceholderConfig(parentElement);
        
        // Start with empty text node for initial state
        let currentNode = document.createTextNode('');
        let subscriptions = [];
        
        const updateThisChild = () => {
            subscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
            subscriptions = [];
            
            const { result, deps } = this.juris.getSM().track(() => childFn(parentElement));
            
            this.#handleAsync(result, {
                onStart: () => {
                    if (this.#isPromiseLike(result)) {
                        // Replace with loading placeholder immediately
                        const placeholder = document.createElement('span');
                        placeholder.textContent = config.text; // This should be "Loading..."
                        placeholder.className = config.className;
                        if (config.style) placeholder.style.cssText = config.style;
                        
                        if (currentNode.parentNode) {
                            currentNode.parentNode.replaceChild(placeholder, currentNode);
                        }
                        currentNode = placeholder;
                    }
                },
                onResolved: (resolved) => {
                    const newNode = this.#createChild(resolved, componentName) || document.createTextNode('');
                    if (currentNode.parentNode) {
                        currentNode.parentNode.replaceChild(newNode, currentNode);
                    }
                    currentNode = newNode;
                },
                onError: (error) => {
                    const errorNode = document.createElement('span');
                    errorNode.className = config.errorClassName;
                    errorNode.textContent = `Error: ${error.message}`;
                    if (currentNode.parentNode) {
                        currentNode.parentNode.replaceChild(errorNode, currentNode);
                    }
                    currentNode = errorNode;
                }
            });
            
            deps.forEach(path => {
                const unsub = this.juris.getSM().subscribeInternal(path, updateThisChild);
                subscriptions.push(unsub);
            });
        };
        
        updateThisChild();
        
        return {
            node: currentNode,
            cleanup: () => {
                subscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
                subscriptions = [];
            }
        };
    }
    
    #createChild(child, componentName) {
        if (child == null) return null;
        
        if (typeof child === 'string' || typeof child === 'number') {
            return document.createTextNode(String(child));
        }
        
        if (Array.isArray(child)) {
            const fragment = document.createDocumentFragment();
            for (let i = 0; i < child.length; i++) {
                const subChild = this.#createChild(child[i], componentName);
                if (subChild) fragment.appendChild(subChild);
            }
            return fragment.hasChildNodes() ? fragment : null;
        }
        
        if (typeof child === 'object' && child !== null) {
            return this.render(child, componentName);
        }
        
        return null;
    }
    
    #renderStaticChildren(elm, children, componentName) {
        elm.textContent = '';
        const fragment = document.createDocumentFragment();
        
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child != null) {
                const childElement = this.#createChild(child, componentName);
                if (childElement) fragment.appendChild(childElement);
            }
        }
        
        if (fragment.hasChildNodes()) elm.appendChild(fragment);
    }
    
    #setStyleProperty(elm, prop, value) {
        if (prop.startsWith('--')) {
            elm.style.setProperty(prop, value);
        } else {
            elm.style[prop] = value;
        }
    }
    
    _setStaticAttribute(elm, attr, value) {
        if (this.SKIP_ATTRS.has(attr)) return;
        
        if (attr in elm && typeof elm[attr] === 'boolean') {
            const boolValue = value && value !== 'false';
            if (boolValue) {
                elm.setAttribute(attr, '');
            } else {
                elm.removeAttribute(attr);
            }
            elm[attr] = boolValue;
            return;
        }
        
        if (elm.namespaceURI === 'http://www.w3.org/2000/svg') {
            elm.setAttribute(attr, value);
            return;
        }
        
        const firstChar = attr.charCodeAt(0);
        if ((firstChar === 100 && attr.charCodeAt(4) === 45) || // data-
            (firstChar === 97 && attr.charCodeAt(4) === 45) ||  // aria-
            attr.indexOf('-') !== -1 ||
            attr.indexOf(':') !== -1) {
            elm.setAttribute(attr, value);
            return;
        }
        
        if (attr in elm && typeof elm[attr] !== 'function') {
            elm[attr] = value;
        } else {
            elm.setAttribute(attr, value);
        }
    }
    
    _handleEvent(elm, eventName, handler, eventListeners) {
        eventName = eventName.toLowerCase();
        const actualEventName = eventName === 'onclick' ? 'click' : 
                               eventName === 'ondoubleclick' ? 'dblclick' :
                               eventName.slice(2);
        
        elm.addEventListener(actualEventName, handler);
        eventListeners.push({ eventName: actualEventName, handler });
        
        if (eventName === 'onclick') {
            this.#attachTouchSupport(elm, handler, eventListeners);
        }
    }
    
    #attachTouchSupport(elm, handler, eventListeners) {
        if (!/Mobi|Android/i.test(navigator.userAgent)) return;
        
        let touchState = { startTime: 0, moved: false, startX: 0, startY: 0 };
        
        const touchStart = e => {
            touchState.startTime = Date.now();
            touchState.moved = false;
            if (e.touches?.[0]) {
                touchState.startX = e.touches[0].clientX;
                touchState.startY = e.touches[0].clientY;
            }
        };
        
        const touchMove = e => {
            if (e.touches?.[0]) {
                const deltaX = Math.abs(e.touches[0].clientX - touchState.startX);
                const deltaY = Math.abs(e.touches[0].clientY - touchState.startY);
                if (deltaX > this.TOUCH_CONFIG.moveThreshold || deltaY > this.TOUCH_CONFIG.moveThreshold) {
                    touchState.moved = true;
                }
            }
        };
        
        const touchEnd = e => {
            if (!touchState.moved && Date.now() - touchState.startTime < this.TOUCH_CONFIG.timeThreshold) {
                e.preventDefault();
                handler(e);
            }
        };
        
        const touchEvents = [
            { name: 'touchstart', handler: touchStart, options: { passive: true }},
            { name: 'touchmove', handler: touchMove, options: { passive: true }},
            { name: 'touchend', handler: touchEnd, options: { passive: false }}
        ];
        
        touchEvents.forEach(({name, handler, options}) => {
            elm.addEventListener(name, handler, options);
            eventListeners.push({ eventName: name, handler });
        });
    }
    
    _createReactiveUpdate(elm, updateFn, subscriptions) {
        const { deps } = this.juris.getSM().track(() => updateFn(elm));
        deps.forEach(path => {
            const unsub = this.juris.getSM().subscribeInternal(path, updateFn);
            subscriptions.push(unsub);
        });
    }
    
    updateElementContent(elm, newContent) {
        this.#updateChildren(elm, [newContent]);
    }
    
    setupIndicators(elementId, config) {
        this.placeholderConfigs.set(elementId, { 
            ...this.defaultPlaceholder, 
            ...config 
        });
    }
    
    _hasAsyncProps(props) {
        for (const key in props) {
            if (props.hasOwnProperty(key) && !key.startsWith('on') && this.#isPromiseLike(props[key])) {
                return true;
            }
        }
        return false;
    }
    
    _getPlaceholderConfig(elm) {
        if (elm?.id && this.placeholderConfigs.has(elm.id)) {
            return this.placeholderConfigs.get(elm.id);
        }
        
        let current = elm?.parentElement;
        while (current) {
            if (current.id && this.placeholderConfigs.has(current.id)) {
                return this.placeholderConfigs.get(current.id);
            }
            current = current.parentElement;
        }
        
        return this.defaultPlaceholder;
    }
    
    #isPromiseLike(value) {
        return value?.then;
    }
    
    cleanup(elm) {
        this.juris.getCM().cleanup(elm);
        this.nodeKeys.delete(elm);
        
        if (this.keyedNodes.has(elm)) {
            this.keyedNodes.delete(elm);
        }
        
        const data = this.subscriptions.get(elm);
        if (data) {
            if (data.subscriptions) {
                data.subscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
            }
            if (data.eventListeners) {
                data.eventListeners.forEach(({eventName, handler}) => {
                    try { elm.removeEventListener(eventName, handler); } catch(e) {}
                });
            }
            this.subscriptions.delete(elm);
        }
        
        if (elm._reactiveCleanup) {
            try { elm._reactiveCleanup(); } catch(e) {}
            elm._reactiveCleanup = null;
        }
        
        if (this.placeholders.has(elm)) {
            this.placeholders.delete(elm);
        }
        
        try {
            const children = elm.children;
            for (let i = 0; i < children.length; i++) {
                try { this.cleanup(children[i]); } catch(e) {}
            }
        } catch(e) {}
    }
    
    clearCSSCache() {
        if (this.cssExtractor && typeof this.cssExtractor.clearCache === 'function') {
            this.cssExtractor.clearCache();
        }
    }
    
    attachObjectTreeAnalyzer(analyzer) {
        this.objTreeAnalyzer = analyzer;
        return this.objTreeAnalyzer;
    }
    
    setTestMode(enabled = true) {
        this._testMode = enabled;
        return this._testMode;
    }
    
    isTestMode() {
        return this._testMode;
    }
    
    getObjectTree() {
        return this.objTreeAnalyzer?.getObjectTree() || null;
    }
}

class Juris {
    static #inGlobal = false;
    constructor(config = {}) {
        if (config.logLevel) {
            this.setupLogging(config.logLevel);
        }
        this.contextTemplate = null;
        this.contextCache = new Map();
        this.services = config.services || {};
        this.layout = config.layout;        
        // Core features - always initialized (minimal)
        this.stateManager = new StateManager(config.states || {}, config.middleware || []);
        this.componentManager = new ComponentManager(this);
        this.domRenderer = new DOMRenderer(this);

        this.armedElements = new Map();
        const features = config.features || {};
        if (features.headless) {
            this.headlessManager = new features.headless(this, log);
            this.headlessAPIs = {};
        }        
        if (features.enhance) {
            this.domEnhancer = new features.enhance(this);
        }        
        if (features.template) {
            this.templateCompiler = new features.template();
            if (config.autoCompileTemplates) {
                this.compileTemplates();
            }
        }
        if (features.webComponentFactory) {
            this.webComponentFactory = new features.webComponentFactory(this);
        }
        if (features.cssExtractor) {
            this.getDR().cssExtractor = new features.cssExtractor();
        }
        if (features.compute) {
            const computeOptions = config.computeOptions || {};
            const computePlugin = new features.compute(this.stateManager, computeOptions);
            this.stateManager.addPlugin('compute', computePlugin);
            log.ei && console.info(log.i('Compute plugin initialized', { options: computeOptions }, 'framework'));
        }
        if (config.headlessComponents && this.getHM()) {
            Object.entries(config.headlessComponents).forEach(([name, config]) => {
                if (typeof config === 'function') {
                    this.getHM().register(name, config);
                } else {
                    this.getHM().register(name, config.fn, config.options);
                }
            });
        }
        if (config.placeholders) {
            Object.entries(config.placeholders).forEach(([elementId, placeholderConfig]) => {
                this.getDR().setupIndicators(elementId, placeholderConfig);
            });
        }
        if (config.defaultPlaceholder) {
            this.getDR().defaultPlaceholder = { ...this.getDR().defaultPlaceholder, ...config.defaultPlaceholder };
        }
        if (this.getHM()) {
            this.getHM().initializeQueued();
        }
        if (config.components) {
            Object.entries(config.components).forEach(([name, component]) => {
                this.getCM().register(name, component);
            });
        }
        
        if (config.webComponents && this.webComponentFactory) {
            this.webComponentFactory.createMultiple(config.webComponents, config.webComponentOptions || {});
        }


        if (typeof requestIdleCallback === 'undefined') { 
            window.requestIdleCallback = function (callback, options) { 
                const start = Date.now(); 
                return setTimeout(function () { 
                    callback({ 
                        didTimeout: false, 
                        timeRemaining: function () { 
                            return Math.max(0, 50 - (Date.now() - start)); 
                        } 
                    }); 
                }, 1); 
            };
            
        }
        this.#detectGlobalAndWarn();
    }

    getDR() { return this.domRenderer; }
    getSM() { return this.stateManager; }
    getHM() { return this.headlessManager; }
    getCM() { return this.componentManager; }
    #detectGlobalAndWarn() {
        if (!Juris._done) { (requestIdleCallback || setTimeout)(() => { if (Juris.#inGlobal) return; Juris.#inGlobal = true; for (let key in globalThis) { if (globalThis[key] instanceof Juris) { log.ew && console.warn(`âš ï¸ JURIS GLOBAL: '${key}'`); } } }); }
    }
    
    getComponentAPI(name) { return this.getCM().getComponentAPI(name); }
    getComponentElement(name) {return this.getCM().getComponentElement(name); }
    getNamedComponents() { return this.getCM().getNamedComponents();}

    compileTemplates(templates = null) {
        if (!this.templateCompiler) {
            log.ew && console.warn(log.w('Template compilation requested but templateCompiler not available'), 'framework');
            return;
        }
        const templateElements = templates || document.querySelectorAll('template[data-component]');
        const components = this.templateCompiler.compileTemplates(templateElements);
        Object.entries(components).forEach(([name, component]) => {
            this.registerComponent(name, component);
        });
    }

    setupLogging(level) {
        log.ei=true;log.ed=true;log.el=true;log.ew=true;log.ee=true;
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        const currentLevel = levels[level] ?? 1;
        if (currentLevel > 0) log.ed = false;
        if (currentLevel > 1) {
            log.el && (console.log('Juris logging initialized at level:', level));
            log.el && (console.log('To change log level, use juris.setupLogging("newLevel") or set logLevel in config'));
            log.el = false; log.ei = false;
        }
    }

    setupIndicators(elementId, config) { this.getDR().setupIndicators(elementId, config); }
    #createBaseContext() {
        if (!this.contextTemplate) {
            this.contextTemplate = {
                getState: (path, defaultValue, track) => this.getSM().getState(path, defaultValue, track),
                setState: (path, value, context) => this.getSM().setState(path, value, context),
                executeBatch: (callback) => this.executeBatch(callback),
                subscribe: (path, callback) => this.getSM().subscribe(path, callback),
                compute: (fn, deps) => this.getSM().compute(fn, deps),
                services: this.services,
                ...(this.services || {}),
                ...(this.headlessAPIs || {}),
                headless: this.getHM()?.context,
                isSSR: typeof window === 'undefined',
                components: {
                    register: (name, component) => this.getCM().register(name, component),
                    registerHeadless: (name, component, options) => this.getHM()?.register(name, component, options),
                    get: name => this.getCM().components.get(name),
                    getHeadless: name => this.getHM()?.getInstance(name),
                    initHeadless: (name, props) => this.getHM()?.initialize(name, props),
                    reinitHeadless: (name, props) => this.getHM()?.reinitialize(name, props),
                    getComponentAPI: (name) => this.getComponentAPI(name),
                    getHeadlessAPI: name => this.getHM()?.getAPI(name),
                    getComponentElement: (name) => this.getComponentElement(name),
                    getNamedComponents: () => this.getCM().getNamedComponents(),
                },
                utils: {
                    render: container => this.render(container),
                    cleanup: () => this.cleanup(),
                    forceRender: () => this.render(),
                    getHeadlessStatus: () => this.getHM()?.getStatus(),
                    objectToHtml: (vnode) => this.objectToHtml(vnode)
                },
                objectToHtml: (vnode) => this.objectToHtml(vnode),
                setupIndicators: (elementId, config) => this.setupIndicators(elementId, config),
                juris: this,
                logger: {
                    log: log, lwarn: log.w, error: log.e, info: log.i, debug: log.d, subscribe: logSub, unsubscribe: logUnsub
                }
            };
        }
        return this.contextTemplate;
    }
    createHeadlessContext(elm = null) {
        return this.createContext(elm);
    }

    executeBatch(callback) {return this.getSM().executeBatch(callback);}

    createWebComponent(name, componentDefinition, options = {}) {
        if (!this.webComponentFactory) {
            log.ee && console.error(log.e('WebComponent not available'), 'application');
            return null;
        }
        return this.webComponentFactory.createWebComponent(name, componentDefinition, options);
    }

    createWebComponents(components, globalOptions = {}) {
        if (!this.webComponentFactory) {
            log.ee && console.error(log.e('WebComponents not available'), 'application');
            return {};
        }
        return this.webComponentFactory.createMultiple(components, globalOptions);
    }
    
    createContext(elm = null) {
        const context = { ...this.#createBaseContext() };
        if (this.getHM()) {
            const headlessAPIs = this.getHM().getAllAPIs();
            Object.assign(context, headlessAPIs);
        }
        if (elm) context.element = elm;
        return context;
    }
    promisify(result) { return promisify(result);}
    getState(path, defaultValue, track) { return this.getSM().getState(path, defaultValue, track); }
    setState(path, value, context) {
        return this.getSM().setState(path, value, context);
    }
    subscribe(path, callback, hierarchical = true) { return this.getSM().subscribe(path, callback, hierarchical); }
    subscribeExact(path, callback) { return this.getSM().subscribeExact(path, callback); }
    registerComponent(name, component) {
        return this.getCM().register(name, component);
    }
    // Headless component registration
    registerHeadlessComponent(name, component, options) { return this.getHM().register(name, component, options); }
    initializeQueuedHeadlessComponent() { this.getHM().initializeQueued(); }
    initializeHeadlessComponent(name, props) { return this.getHM().initialize(name, props); }
    getHeadlessComponent(name) { return this.getHM().getInstance(name); }
    getHeadlessAPI(name) { return this.getHM()?.getAPI(name); }

    getComponent(name) { return this.getCM().components.get(name); }

    registerAndInitHeadless(name, componentFn, options = {}) {
        this.getHM().register(name, componentFn, options);
        return this.getHM().initialize(name, options);
    }

    getHeadlessStatus() { return this.getHM().getStatus(); }
    objectToHtml(vnode) { return this.getDR().render(vnode); }

    render(container = '#app') {
        const startTime = performance.now();      
        const containerEl = typeof container === 'string' ?
            document.querySelector(container) : container;            
        if (!containerEl) {
            log.ee && console.error(log.e('Render container not found', { container }, 'application'));
            return;
        }        
        const isHydration = this.getState('isHydration', false);        
        try {
            if (Array.isArray(this.layout)) {
                const hasReactiveFunctions = this.layout.some(item => typeof item === 'function');
                if (hasReactiveFunctions) {
                    containerEl.innerHTML = '';
                    const subscriptions = [];
                    this.getDR()._handleChildren(containerEl, this.layout, subscriptions);
                    if (subscriptions.length > 0) {
                        this.getDR().subscriptions.set(containerEl, {
                            subscriptions,
                            eventListeners: []
                        });
                    }                    
                    const duration = performance.now() - startTime;
                    return;
                }
            }
            isHydration?this.#renderWithHydration(containerEl):this.#renderImmediate(containerEl);
            const duration = performance.now() - startTime;
            log.ei && console.info(log.i('Render completed', { duration: `${duration.toFixed(2)}ms`, isHydration }, 'application'));
        } catch (error) {
            log.ee && console.error(log.e('Render failed', { error: error.message, container }, 'application'));
            this.#renderError(containerEl, error);
        }
    }

    #renderImmediate (containerEl) {
        containerEl.innerHTML = '';
        const elm = this.getDR().render(this.layout);
        if (elm) containerEl.appendChild(elm);
    }
    
    async #renderWithHydration (containerEl) {
        const stagingEl = document.createElement('div');
        stagingEl.style.cssText = 'position: absolute; left: -9999px; visibility: hidden;';
        document.body.appendChild(stagingEl);
        try {
            startTracking();
            const elm = this.getDR().render(this.layout);
            if (elm) stagingEl.appendChild(elm);
            await onAllComplete();
            containerEl.innerHTML = '';
            while (stagingEl.firstChild) {
                containerEl.appendChild(stagingEl.firstChild);
            }
            this.getHM().initializeQueued();
        } finally {
            stopTracking();
            document.body.removeChild(stagingEl);
        }
    };

    #renderError(container, error) {
        const errorEl = document.createElement('div');
        errorEl.style.cssText = 'color: red; border: 2px solid red; padding: 16px; margin: 8px; background: #ffe6e6;';
        errorEl.innerHTML = `
            <h3>Render Error</h3>
            <p><strong>Message:</strong> ${error.message}</p>
            <pre style="background: #f5f5f5; padding: 8px; overflow: auto;">${error.stack || ''}</pre>
        `;
        container.appendChild(errorEl);
    }

    enhance(selector, definition, options) { return this.domEnhancer.enhance(selector, definition, options); }
    
    configureEnhancement(options) { 
        if (!this.domEnhancer) {
            log.ew && console.warn(log.w('Enhancement configuration requested but domEnhancer not available'), 'framework');
            return;
        }
        return this.domEnhancer.configure(options); 
    }
    // arm() API for window, document, and elements event handling with full Juris context
    arm(target, handlerFn) {        
        const context = this.createContext(target);
        const handlers = handlerFn(context);
        const listeners  = [];
        const jurisIns = this;
        for (const eventName in handlers) {
            let actualEventName;                
            if (eventName.startsWith('on-')) {
                actualEventName = eventName.slice(3);
            } else if (eventName.startsWith('on:')) {
                actualEventName = eventName.slice(3);
            } else {
                actualEventName = eventName.slice(2).toLowerCase();
            }                
            const handler = handlers[eventName];                
            if (typeof handler === 'function') {
                target.addEventListener(actualEventName, handler);
                listeners.push({ 
                    original: eventName,
                    actual: actualEventName, 
                    handler 
                });
            }
        }
        const instance = {
            events: listeners.map(e => ({
                name: e.original,
                actualEvent: e.actual,
                handler: e.handler
            })),
            trigger(eventName, eventData = {}) {
                const listener = listeners.find(e => e.original === eventName || e.actual === eventName);
                if (listener) {
                    const mockEvent = {
                        type: listener.actual,
                        target: target,
                        preventDefault: () => {},
                        stopPropagation: () => {},
                        ...eventData
                    };                    
                    listener.handler.call(target, mockEvent);
                    return true;
                }
                return false;
            },
            cleanup() {                
                listeners.forEach(({ actual, handler }) => {
                    target.removeEventListener(actual, handler);
                });
                jurisIns.armedElements.delete(target);
                return true;
            }
        };
        jurisIns.armedElements.set(target, { listeners, context, instance: instance });
        return instance;
    }

    cleanup() {
        this.armedElements = new Map();
        this.getHM()?.cleanup();
    }

    destroy() {
        this.cleanup();
        if (this.domEnhancer) {
            this.domEnhancer.destroy();
        }
        this.getSM().subscribers.clear();
        this.getSM().extSubs.clear();
        this.getCM().components.clear();
        if (this.getHM()) {
            this.getHM().components.clear();
        }
        this.armedElements = new Map();
    }
}
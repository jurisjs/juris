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
                let newStep = parseInt(e.target.value) || 1;
                juris.setState('counter.step', Math.max(1, Math.min(10, newStep)));
            }
 *        }},//input
 *        ()=> juris.getState('counter.step', 1),//text node
 *        ()=>{
 *          let step = juris.getState('counter.step', 1);
 *          return {span:{text:`Current step is ${step}`}};
 *        }//span
 *      ]
 *   }}//div.main
 * }//return
 */

'use strict';
let jurisLinesOfCode = 2600;
let jurisVersion = '0.91.0';
let jurisMinifiedSize = '38kB, 12kB gzipped';
let isValidPath = path => typeof path === 'string' && path.trim().length > 0 && !path.includes('..');
let getPathParts = path => path.split('.').filter(Boolean);
let deepEquals = (a, b) => {
    if (a === b) return true;
    if (a == null || b == null || typeof a !== typeof b) return false;
    if (typeof a === 'object') {
        if (Array.isArray(a) !== Array.isArray(b)) return false;
        let keysA = Object.keys(a), keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        return keysA.every(key => keysB.includes(key) && deepEquals(a[key], b[key]));
    }
    return false;
};

let createLogger = () => {
    let s = [];
    let f = (m, c, cat) => {
        let msg = `${cat ? `[${cat}] ` : ''}${m}${c ? ` ${JSON.stringify(c)}` : ''}`;
        let logObj = { formatted: msg, message: m, context: c, category: cat, timestamp: Date.now() };
        setTimeout(() => s.forEach(sub => sub(logObj)), 0);
        return logObj;
    };
    return {
        log: { l: f, w: f, e: f, i: f, d: f, ei:true, ee:true, el:true, ew:true, ed:true },
        sub: cb => s.push(cb),
        unsub: cb => s.splice(s.indexOf(cb), 1)
    };
};
let { log, sub: logSub, unsub: logUnsub } = createLogger();
let createPromisify = () => {
    let activePromises = new Set();
    let isTracking = false;
    let subs = new Set();
    let checkAllComplete = () => {
        if (activePromises.size === 0 && subs.size > 0) {
            subs.forEach(callback => callback());
        }
    };
    let trackingPromisify = result => {
        let promise = typeof result?.then === "function" ? result : Promise.resolve(result);
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
let { promisify, startTracking, stopTracking, onAllComplete } = createPromisify();

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
        let plugin = this.plugins.get(name);
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
        let computePlugin = this.getPlugin('compute');
        if (!computePlugin) {
            throw new Error('Compute plugin not available. Add ComputePlugin via features.compute in Juris config.');
        }
        return computePlugin.compute(name, fn, options);
    }

    configureCompute(defaults) {
        let computePlugin = this.getPlugin('compute');
        if (!computePlugin) {
            throw new Error('Compute plugin not available.');
        }
        return computePlugin.configureCompute(defaults);
    }

    getComputeStats(name = null) {
        let computePlugin = this.getPlugin('compute');
        return computePlugin ? computePlugin.getComputeStats(name) : null;
    }

    clearCompute(name = null) {
        let computePlugin = this.getPlugin('compute');
        if (computePlugin) {
            computePlugin.clearCompute(name);
        }
    }
    #getPathParts(path) {
        let parts = this.pathCache.get(path);
        if (parts) return parts;
        parts = path.split('.').filter(Boolean);
        if (this.pathCache.size >= this.maxCacheSize) {
            let firstKey = this.pathCache.keys().next().value;
            this.pathCache.delete(firstKey);
        }        
        this.pathCache.set(path, parts);
        return parts;
    }

    track(fn, isolated = false) {
        let saved = this.deps;
        let deps = isolated ? null : (this.deps = new Set());
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
        let dotIndex = path.indexOf('.');
        if (dotIndex === -1) {
            let value = this.state[path];
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
        if (!isValidPath(path)) return false;
        if (this.#hasCircularUpdate(path)) return false;
        if (this.#canQuickCompare(path, value)) {
            let currentValue = this.#getValueFast(path);
            if (currentValue === value) return false;
        }
        if (this.isBatching) {
            this.#queueBatchedUpdate(path, value, context);
            return;
        }
        this.#setStateImmediate(path, value, context);
    }
    #canQuickCompare(path, value) {
        return (
            (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') &&
            path.indexOf('.') === -1 &&
            this.middleware.length === 0
        );
    }

    #getValueFast(path) {
        return this.state[path];
    }
    executeBatch(callback) {
        if (this.isBatching) return callback();
        this.#beginBatch();
        try {
            let result = callback();
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
        let updates = [...this.batchQueue];
        this.batchQueue = [];
        this.batchedPaths.clear();
        let pathGroups = new Map();
        updates.forEach(update => pathGroups.set(update.path, update));
        let wasUpdating = this.isUpdating;
        this.isUpdating = true;
        let appliedUpdates = [];
        pathGroups.forEach(update => {
            let oldValue = this.getState(update.path, null, false);
            let finalValue = update.value;
            for (let middleware of this.middleware) {
                try {
                    let result = middleware({ path: update.path, oldValue, newValue: finalValue, context: update.context, state: this.state });
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
        let parentPaths = new Set();
        appliedUpdates.forEach(({ path }) => {
            let parts = this.#getPathParts(path);
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
        let oldValue = this.getState(path, null, false);
        let finalValue = value;
        // Optimize middleware loop
        if (this.middleware.length > 0) {
            for (let i = 0; i < this.middleware.length; i++) {
                try {
                    let result = this.middleware[i]({ path, oldValue, newValue: finalValue, context, state: this.state });
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
        let dotIndex = path.indexOf('.');
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
        let lastIndex = parts.length - 1;
        for (let i = 0; i < lastIndex; i++) {
            let part = parts[i];
            if (current[part] == null || typeof current[part] !== 'object') {
                current[part] = {};
            }
            current = current[part];
        }
        current[parts[lastIndex]] = value;
    }

    subscribe(path, callback, hierarchical = true) {
        if (!this.extSubs.has(path)) this.extSubs.set(path, new Set());
        let subscription = { callback, hierarchical };
        this.extSubs.get(path).add(subscription);
        return () => {
            let subs = this.extSubs.get(path);
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
            let subs = this.subscribers.get(path);
            if (subs) {
                subs.delete(callback);
                if (subs.size === 0) this.subscribers.delete(path);
            }
        };
    }

    #notifySubscribers(path, newValue, oldValue) {
        this.#triggerPathSubscribers(path);
        let parts = this.#getPathParts(path);
        for (let i = parts.length - 1; i > 0; i--) {
            this.#triggerPathSubscribers(parts.slice(0, i).join('.'));
        }
        let prefix = path ? path + '.' : '';
        let allPaths = new Set([...this.subscribers.keys(), ...this.extSubs.keys()]);
        allPaths.forEach(subscriberPath => {
            if (subscriberPath.startsWith(prefix) && subscriberPath !== path) {
                this.#triggerPathSubscribers(subscriberPath);
            }
        });
    }

    #notifyExternalSubscribers(changedPath, newValue, oldValue) {
        this.extSubs.forEach((subscriptions, subscribedPath) => {
            subscriptions.forEach(({ callback, hierarchical }) => {
                let shouldNotify = hierarchical ?
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
        let subs = this.subscribers.get(path);
        if (subs && subs.size > 0) {
            new Set(subs).forEach(callback => {
                try {
                    let { deps } = this.track(() => callback());
                    deps.forEach(newPath => {
                        let existingSubs = this.subscribers.get(newPath);
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
        let deps = new Set();
        this.deps = deps;
        return deps;
    }

    endTracking() {
        let deps = this.deps;
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
        let compFn = this.components.get(name);
        if (!compFn) {
            log.ee && console.error(log.e('Component not found', { name }, 'application'));
            return null;
        }
        try {
            if (this.juris.getDR()._hasAsyncProps(props)) {
                return this.#createWithAsyncProps(name, compFn, props);
            }
            let { comptId, compStates, context } = this.#getCompContext(name);
            let result = this.#callComponentFunction(compFn, props, context);
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
        let funcStr = componentFn.toString();
        let paramMatch = funcStr.match(/^[^(]*\(([^)]*)\)/);
        if (!paramMatch || !paramMatch[1].trim()) {
            return componentFn();
        }        
        let params = paramMatch[1].split(',').map(p => p.trim());        
        if (params.length === 1) {
            let param = params[0];
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
        let { comptId, compStates } = this.#newCompId(name);
        let context = this.#getCompCxt(comptId, compStates);
        return { comptId, compStates, context };
    }

    #newCompId(name) {
        if (!this.comps.has(name)) {
            this.comps.set(name, 0);
        }
        let instanceIndex = this.comps.get(name) + 1;
        this.comps.set(name, instanceIndex);
        let comptId = `${name}#${instanceIndex}`;
        let compStates = new Set();
        return { comptId, compStates };
    }

    #getCompCxt(compId, states) {
        let ctx = this.juris.createContext();
        ctx.newState = (key, initVal) => {
            let path = `##local.${compId}.${key}`;
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
        let ph = this.#newPlaceholder(name, 'async-props-loading');
        this.placeholders.set(ph, { name, props, type: 'async-props' });
        this.#resolveAsyncProps(props).then(resolved => {
            try {
                let elem = this.#createSyncComponent(name, compFn, resolved);
                this.#replacePlaceholder(ph, elem);
            } catch (err) {
                this.#replaceWithError(ph, err);
            }
        }).catch(err => this.#replaceWithError(ph, err));
        return ph;
    }

    async #resolveAsyncProps(props) {
        let key = this.#newKey(props);
        let cached = this.asyncPropsCache.get(key);
        if (cached && Date.now() - cached.timestamp < 5000) {
            return cached.props;
        }
        let resolved = {};
        let keys = Object.keys(props);
        for (let i = 0; i < keys.length; i++) {
            let k = keys[i];
            let v = props[k];
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
        let { comptId, compStates, context } = this.#getCompContext(name);
        let result = this.#callComponentFunction(compFn, props, context);
        if (result?.then) {
            return this.#handleAsyncComp(promisify(result), name, props, compStates);
        }
        return this.#procCompResult(result, name, props, compStates);
    }

    #handleAsyncComp(promise, name, props, states) {
        let ph = this.#newPlaceholder(name, 'async-loading');
        this.placeholders.set(ph, { name, props, states });
        promise.then(result => {
            try {
                let elem = this.#procCompResult(result, name, props, states);
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
            let keys = Object.keys(result);
            if (keys.length === 1 && typeof keys[0] === 'string' && keys[0].length > 0) {
                let el = this.juris.getDR().render(result, name);
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
        let el = this.juris.getDR().render(result, name);
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
        let frag = document.createDocumentFragment();
        let virt = this.#newVirtContainer(frag, name, props);
        let subs = [];
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
        let inst = this.#newComp(result, name, props);
        let cont = document.createElement('div');
        cont.setAttribute('data-juris-component', name);
        let updateRender = () => {
            let { result: res, deps } = this.juris.getSM().track(() => {
                return inst.render ? inst.render() : result;
            });
            let content = this.juris.getDR().render(res, name, props);
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
                let unsub = this.juris.getSM().subscribeInternal(path, updateRender);
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
        let cont = document.createElement('div');
        cont.setAttribute('data-juris-reactive-render', name);
        let data = { 
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
        let updateRender = () => this.#runRender(result.render, cont, name);
        let subs = [];
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
            let res = renderFn(cont);
            if (res?.then) {
                cont.innerHTML = '<div class="juris-loading">Loading...</div>';
                promisify(res).then(resolved => {
                    cont.innerHTML = '';
                    let el = this.juris.getDR().render(resolved);
                    if (el) this.#smartAppend(cont, el);
                }).catch(err => {
                    log.ee && console.error(`Async render error for ${name}:`, err);
                    cont.innerHTML = `<div class="juris-error">Render Error: ${err.message}</div>`;
                });
                return;
            }
            let children = Array.from(cont.children);
            children.forEach(child => this.cleanup(child));
            cont.innerHTML = '';
            let el = this.juris.getDR().render(res);
            if (el) this.#smartAppend(cont, el);
        } catch (err) {
            log.ee && console.error(`Error in reactive render for ${name}:`, err);
            cont.innerHTML = `<div class="juris-error">Render Error: ${err.message}</div>`;
        }
    }

    #smartAppend(cont, el) {
        if (el.nodeType === Node.ELEMENT_NODE && el.hasAttribute('data-juris-reactive-render')) {
            while (el.firstChild) {
                cont.appendChild(el.firstChild);
            }
            this.cleanup(el);
        } else {
            cont.appendChild(el);
        }
    }

    #runHook(hook, args, componentName, hookName) {
        try {
            let result = Array.isArray(args) ? hook(...args) : hook(args);
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
        let virt = {
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
        let tempElement = document.createElement('div');
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
        let errorElement = this.#newErrElm(
            placeholder._jurisComponent?.name || 'Unknown Component', 
            error
        );
        if (placeholder.parentNode) {
            placeholder.parentNode.replaceChild(errorElement, placeholder);
        }
        this.placeholders.delete(placeholder);
    }

    #newErrElm(name, error) {
        let elm = document.createElement('div');
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
        let instance = this.insts.get(elm);
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
        let states = this.compStates.get(elm);
        if (states) {
            this.#cleanupStateSet(states);
            this.compStates.delete(elm);
        }
    }

    #cleanupStateSet(stateSet) {
        stateSet.forEach(statePath => {
            let pathParts = statePath.split('.');
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
        let config = this.juris.getDR()._getPlaceholderConfig(elm);
        let placeholder = document.createElement('div');
        placeholder.className = config.className;
        placeholder.textContent = config.text;
        if (config.style) placeholder.style.cssText = config.style;
        return placeholder;
    }
}

class DOMRenderer {
  constructor(juris) {
    this.juris = juris;
    this.subscriptions = new WeakMap();
    this.keyedNodes = new WeakMap();
    this.nodeKeys = new WeakMap();
    this.placeholders = new WeakMap();
    this.placeholderConfigs = new Map();
    this.componentStack = [];
    this.objTreeAnalyzer = null;
    this.SKIP_ATTRS = new Set(['children', 'key']);
    this.elementTypeCache = new Map();
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
    this._testMode = false;
    this._lastObjectTree = null;
  }

  #handleAsync = (promise, handlers = {}, context = {}) => {
    if (!this.#isPromiseLike(promise)) {
      throw new Error('handleAsync called with non-promise value. Use #isPromiseLike check first.');
    }
    
    let {
      onStart = () => {},
      onResolved = () => {},
      onError = (error) => {
        log.ee && console.error(log.e('Async operation failed:', error), 'application');
      },
      onFinally = () => {}
    } = handlers;
    
    if (context.elm && context.type) {
      this.#applyPlaceholder(context.elm, context.type, context);
    }
    
    onStart();
    
    let trackedPromise = promisify(promise);
    
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
    let config = this._getPlaceholderConfig(elm);
    
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
    let originalText = elm.textContent;
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
      let originalValue = elm.getAttribute(attributeName);
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
    let originalStyle = elm.style.cssText;
    if (config.style) {
      elm.style.cssText = config.style;
    }
    this.placeholders.set(elm, { 
      type: 'style',
      originalStyle 
    });
  }
  
  #createComponentPlaceholder(config, componentName) {
    let placeholder = document.createElement('div');
    placeholder.className = config.className;
    placeholder.textContent = componentName ? `Loading ${componentName}...` : config.text;
    if (config.style) placeholder.style.cssText = config.style;
    placeholder.setAttribute('data-juris-placeholder', 'component');
    return placeholder;
  }
  
  #removePlaceholder(elm) {
    let placeholderData = this.placeholders.get(elm);
    if (!placeholderData) return;
    
    let config = this._getPlaceholderConfig(elm);
    elm.classList.remove(config.className);
    
    switch(placeholderData.type) {
      case 'children':
        if (placeholderData.placeholder && placeholderData.placeholder.parentNode === elm) {
          elm.removeChild(placeholderData.placeholder);
        }
        break;
        
      case 'text':
        if (placeholderData.hadStyle) {
          let originalStyle = elm.getAttribute('data-juris-original-style');
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
    let config = this._getPlaceholderConfig(elm);
    this.#removePlaceholder(elm);
    
    let errorMessage = `Error: ${error.message}`;
    
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
    
    let update = () => {
      try {
        let result = getValue();
        if (!this.#isPromiseLike(result)) {
          if (!options.trackChanges || !isInitialized || !deepEquals(result, lastValue)) {
            updateDom(result);
            if (options.trackChanges) {
              lastValue = result;
              isInitialized = true;
            }
          }
          return result;
        }
        let asyncContext = {
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
      let tagName = Object.keys(vnode)[0];
      let props = vnode[tagName];
      return props?.key ?? null;
    }
    return null;
  }
  
  #diffChildren(parent, oldChildren, newChildren) {
    if (oldChildren.length === 0 && newChildren.length === 0) return;
    
    let operations = [];
    let oldKeyMap = new Map();
    let newKeyMap = new Map();
    let usedKeys = new Set();
    
    let oldNodes = Array.from(parent.childNodes);
    oldNodes.forEach((node, index) => {
      let key = this.nodeKeys.get(node);
      if (key !== undefined) {
        oldKeyMap.set(key, { node, index });
      } else {
        oldKeyMap.set(`__index_${index}`, { node, index });
      }
    });
    
    for (let i = 0; i < newChildren.length; i++) {
      let child = newChildren[i];
      let key = this.#extractKey(child, i) ?? `__index_${i}`;
      
      if (usedKeys.has(key) && !key.startsWith('__index_')) {
        log.ew && console.warn(log.w(
          `Duplicate key "${key}" detected. Keys must be unique among siblings.`,
          { parent: parent.tagName, key },
          'framework'
        ));
        let fallbackKey = `__index_${i}`;
        newKeyMap.set(fallbackKey, { child, index: i });
        operations.push({ type: 'create', child, index: i, key: fallbackKey });
      } else {
        usedKeys.add(key);
        newKeyMap.set(key, { child, index: i });
        
        if (oldKeyMap.has(key)) {
          let oldEntry = oldKeyMap.get(key);
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
    operations.filter(op => op.type === 'remove').forEach(op => {
      if (op.node.parentNode === parent) {
        parent.removeChild(op.node);
        this.nodeKeys.delete(op.node);
        this.cleanup(op.node);
      }
    });
    
    let createdNodes = new Map();
    operations.filter(op => op.type === 'create').forEach(op => {
      let newNode = this.#createChild(op.child);
      if (newNode) {
        createdNodes.set(op.key, newNode);
        if (op.key && typeof op.key === 'string' && !op.key.startsWith('__')) {
          this.nodeKeys.set(newNode, op.key);
        }
      }
    });
    operations.filter(op => op.type === 'update').forEach(op => {
      this.#updateExistingNode(op.node, op.child);
    });
    let targetOrder = [];
    newChildren.forEach((child, index) => {
      let key = this.#extractKey(child, index) ?? `__index_${index}`;
      let existingOp = operations.find(op => op.key === key && (op.type === 'update' || op.type === 'move'));
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
      let newContent = String(vnode);
      if (node.textContent !== newContent) {
        node.textContent = newContent;
      }
      return;
    }
    
    if (node.nodeType === Node.ELEMENT_NODE && typeof vnode === 'object' && !Array.isArray(vnode)) {
      let tagName = Object.keys(vnode)[0];
      let props = vnode[tagName] || {};
      let subscriptions = [];            
      for (let key in props) {
        if (key === 'key') continue;
        let cleanup = this.applyProp(node, key, props[key]);
        if (cleanup && typeof cleanup === 'function') {
          subscriptions.push(cleanup);
        }
      }            
      if (subscriptions.length > 0) {
        let existing = this.subscriptions.get(node) || { subscriptions: [], eventListeners: [] };
        existing.subscriptions.push(...subscriptions);
        this.subscriptions.set(node, existing);
      }
    }
  }
  
  #reorderNodes(parent, targetOrder) {
    let lastNode = null;        
    for (let i = targetOrder.length - 1; i >= 0; i--) {
      let targetNode = targetOrder[i];
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
    let tagName = Object.keys(vnode)[0];
    let props = vnode[tagName] || {};        
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
      let elementName = componentName || tagName;
      modifiedProps = this.cssExtractor.processProps(props, elementName, this);
    }        
    return this.#createElement(tagName, modifiedProps, componentName);
  }
  
  #createElement(tagName, props, componentName = null) {
    let elm = this.#createElementByType(tagName);
    let allSubscriptions = [];        
    for (let key in props) {
      if (!props.hasOwnProperty(key) || key === 'key') continue;
      let cleanup = this.applyProp(elm, key, props[key], componentName);
      if (cleanup && typeof cleanup === 'function') {
        allSubscriptions.push(cleanup);
      }
    }        
    if (allSubscriptions.length > 0) {
      let existing = this.subscriptions.get(elm) || { subscriptions: [], eventListeners: [] };
      existing.subscriptions.push(...allSubscriptions);
      this.subscriptions.set(elm, existing);
    }        
    return elm;
  }
  
  #createElementByType(tagName) {
    let isSVG = this.elementTypeCache.get(tagName);
    if (isSVG === undefined) {
      try {
        let svgEl = document.createElementNS("http://www.w3.org/2000/svg", tagName);
        let isCommonHTML = ['a', 'script', 'style', 'title'].includes(tagName);
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
    let hasReactiveFunctions = vnode.some(item => typeof item === 'function');
    let hasKeys = vnode.some(item => this.#extractKey(item) !== null);        
    if (hasReactiveFunctions || hasKeys) {
      let fragment = document.createDocumentFragment();
      let subscriptions = [];            
      if (hasKeys && !hasReactiveFunctions) {
        for (let i = 0; i < vnode.length; i++) {
          let child = vnode[i];
          let childElement = this.render(child, componentName);
          if (childElement) {
            let key = this.#extractKey(child, i);
            if (key) {
              this.nodeKeys.set(childElement, key);
            }
            fragment.appendChild(childElement);
          }
        }
      } else {
        this.#handleReactiveFragmentChildren(fragment, vnode, subscriptions, componentName);
      }
      if (subscriptions.length > 0) {
        fragment._jurisCleanup = () => {
          subscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
        };
      }
      return fragment;
    }
    let fragment = document.createDocumentFragment();
    for (let i = 0; i < vnode.length; i++) {
      let childElement = this.render(vnode[i], componentName);
      if (childElement) fragment.appendChild(childElement);
    }
    return fragment;
  }
  
  #renderComponent(tagName, props) {
    let componentFn = this.juris.getCM().components.get(tagName);
    if (!componentFn) {
      log.ee && console.error(log.e('Component not found', { name: tagName }, 'application'));
      return null;
    }
    
    if (this.componentStack.includes(tagName)) {
      return this.#newErrElm('recursion', [...this.componentStack, tagName].join(' → '));
    }
    
    this.componentStack.push(tagName);
    let { result, deps } = this.juris.getSM().track(() => 
      this.juris.getCM().create(tagName, props), true);
    this.componentStack.pop();
    
    return result;
  }
  
  #newErrElm(type, message) {
    let elm = document.createElement('div');
    elm.style.cssText = 'color: red; border: 1px solid red; padding: 8px; background: #ffe6e6; font-family: monospace;';
    elm.textContent = message;
    elm.setAttribute('data-juris-error', type);
    return elm;
  }
  
  applyProp(elm, propName, propValue, componentName = null) {
    let subscriptions = [];
    let eventListeners = [];
    
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
      let existing = this.subscriptions.get(elm) || { subscriptions: [], eventListeners: [] };
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
    let asyncContext = {
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
      let updateText = this.#createReactiveHandler(
        elm,
        () => text(elm),
        (value) => { elm.textContent = value; },
        { trackChanges: true, name: 'text', type: 'text' }
      );
      this._createReactiveUpdate(elm, updateText, subscriptions);
    } else if (this.#isPromiseLike(text)) {
      let asyncContext = { elm, type: 'text' };
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
      let updateStyle = this.#createReactiveHandler(
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
      let asyncContext = { elm, type: 'style' };
      this.#handleAsync(style, {
        onResolved: (resolved) => {
          if (typeof resolved === 'object') {
            Object.assign(elm.style, resolved);
          }
        }
      }, asyncContext);
    } else if (typeof style === 'object') {
      for (let prop in style) {
        if (style.hasOwnProperty(prop)) {
          let val = style[prop];
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
    let updateStyleProperty = this.#createReactiveHandler(
      elm,
      () => valueFn(elm),
      (value) => this.#setStyleProperty(elm, prop, value),
      { trackChanges: true, name: `style.${prop}`, type: 'style' }
    );
    this._createReactiveUpdate(elm, updateStyleProperty, subscriptions);
  }
  
  _handleReactiveAttribute(elm, attr, valueFn, subscriptions) {
    let updateAttribute = this.#createReactiveHandler(
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
      let asyncContext = { elm, type: 'children' };
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
    let updateChildren = () => {
      let { result, deps } = this.juris.getSM().track(() => childrenFn(elm));
      if (this.#isPromiseLike(result)) {
        let asyncContext = { elm, type: 'reactive-children' };
        this.#handleAsync(result, {
          onResolved: (resolved) => {
            if (resolved !== "ignore") {
              if (typeof resolved === 'string' || typeof resolved === 'number') {
                elm.textContent = String(resolved);
              } else {
                this.#updateChildren(elm, resolved, componentName);
              }
            }
          }
        }, asyncContext);
      } else {
        if (result !== "ignore") {
          if (typeof result === 'string' || typeof result === 'number') {
            elm.textContent = String(result);
          } else {
            this.#updateChildren(elm, result, componentName);
          }
        }
      }
      deps.forEach(path => {
        let unsub = this.juris.getSM().subscribeInternal(path, updateChildren);
        subscriptions.push(unsub);
      });
    };
    
    updateChildren();
  }
  
  #updateChildren(elm, children, componentName = null) {
    if (children === "ignore") return;
    
    let lastChildren = elm._jurisLastChildren;
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
      let child = children[i];
      if (typeof child === 'function') {
        let { node, cleanup } = this.#createIndividualReactiveChild(child, i, componentName, fragment);
        if (node) {
          fragment.appendChild(node);
          subscriptions.push(cleanup);
        }
      } else if (child != null) {
        let childElement = this.#createChild(child, componentName);
        if (childElement) {
          let key = this.#extractKey(child, i);
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
    let cleanupFunctions = [];
    let fragment = document.createDocumentFragment();
    
    for (let i = 0; i < children.length; i++) {
      let child = children[i];
      if (typeof child === 'function') {
        let { node, cleanup } = this.#createIndividualReactiveChild(child, i, componentName, elm);
        if (node) {
          fragment.appendChild(node);
          cleanupFunctions.push(cleanup);
        }
      } else if (child != null) {
        let childElement = this.#createChild(child, componentName);
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
    let config = this._getPlaceholderConfig(parentElement);
    let currentNode = document.createTextNode('');
    let subscriptions = [];        
    let updateThisChild = () => {
      subscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
      subscriptions = [];            
      let { result, deps } = this.juris.getSM().track(() => childFn(parentElement));
      if (this.#isPromiseLike(result)) {
        this.#handleAsync(result, {
          onStart: () => {
            let placeholder = document.createElement('span');
            placeholder.textContent = config.text;
            placeholder.className = config.className;
            if (config.style) placeholder.style.cssText = config.style;
            
            if (currentNode.parentNode) {
              currentNode.parentNode.replaceChild(placeholder, currentNode);
            }
            currentNode = placeholder;
          },
          onResolved: (resolved) => {
            let newNode = this.#createChild(resolved, componentName) || document.createTextNode('');
            if (currentNode.parentNode) {
              currentNode.parentNode.replaceChild(newNode, currentNode);
            }
            currentNode = newNode;
          },
          onError: (error) => {
            let errorNode = document.createElement('span');
            errorNode.className = config.errorClassName;
            errorNode.textContent = `Error: ${error.message}`;
            if (currentNode.parentNode) {
              currentNode.parentNode.replaceChild(errorNode, currentNode);
            }
            currentNode = errorNode;
          }
        });
      } else {
        try {
          let newNode = this.#createChild(result, componentName) || document.createTextNode('');
          if (currentNode.parentNode) {
            currentNode.parentNode.replaceChild(newNode, currentNode);
          }
          currentNode = newNode;
        } catch (error) {
          let errorNode = document.createElement('span');
          errorNode.className = config.errorClassName;
          errorNode.textContent = `Error: ${error.message}`;
          if (currentNode.parentNode) {
            currentNode.parentNode.replaceChild(errorNode, currentNode);
          }
          currentNode = errorNode;
        }
      }
      deps.forEach(path => {
        let unsub = this.juris.getSM().subscribeInternal(path, updateThisChild);
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
      let fragment = document.createDocumentFragment();
      for (let i = 0; i < child.length; i++) {
        let subChild = this.#createChild(child[i], componentName);
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
    let fragment = document.createDocumentFragment();        
    for (let i = 0; i < children.length; i++) {
      let child = children[i];
      if (child != null) {
        let childElement = this.#createChild(child, componentName);
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
      let boolValue = value && value !== 'false';
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
    let firstChar = attr.charCodeAt(0);
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
    let actualEventName = eventName === 'onclick' ? 'click' : 
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
    
    let touchStart = e => {
      touchState.startTime = Date.now();
      touchState.moved = false;
      if (e.touches?.[0]) {
        touchState.startX = e.touches[0].clientX;
        touchState.startY = e.touches[0].clientY;
      }
    };
    
    let touchMove = e => {
      if (e.touches?.[0]) {
        let deltaX = Math.abs(e.touches[0].clientX - touchState.startX);
        let deltaY = Math.abs(e.touches[0].clientY - touchState.startY);
        if (deltaX > this.TOUCH_CONFIG.moveThreshold || deltaY > this.TOUCH_CONFIG.moveThreshold) {
          touchState.moved = true;
        }
      }
    };
    
    let touchEnd = e => {
      if (!touchState.moved && Date.now() - touchState.startTime < this.TOUCH_CONFIG.timeThreshold) {
        e.preventDefault();
        handler(e);
      }
    };
    
    let touchEvents = [
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
    let { deps } = this.juris.getSM().track(() => updateFn(elm));
    deps.forEach(path => {
      let unsub = this.juris.getSM().subscribeInternal(path, updateFn);
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
    for (let key in props) {
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
    
    let data = this.subscriptions.get(elm);
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
      let children = elm.children;
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
        let features = config.features || {};
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
            let computeOptions = config.computeOptions || {};
            let computePlugin = new features.compute(this.stateManager, computeOptions);
            this.stateManager.addPlugin('compute', computePlugin);
            log.ei && console.info(log.i('Compute plugin initialized', { options: computeOptions }, 'framework'));
        }
        if (config.headlessComponents && this.getHM()) {
            Object.keys(config.headlessComponents).forEach(name => {
                const componentConfig = config.headlessComponents[name];
                if (typeof componentConfig === 'function') {
                    this.getHM().register(name, componentConfig);
                } else {
                    this.getHM().register(name, componentConfig.fn, componentConfig.options);
                }
            });
        }
        if (config.placeholders) {
            const elementIds = Object.keys(config.placeholders);
            for (let i = 0; i < elementIds.length; i++) {
                const elementId = elementIds[i];
                const placeholderConfig = config.placeholders[elementId];
                this.getDR().setupIndicators(elementId, placeholderConfig);
            }
        }
        if (config.defaultPlaceholder) {
            this.getDR().defaultPlaceholder = { ...this.getDR().defaultPlaceholder, ...config.defaultPlaceholder };
        }
        if (this.getHM()) {
            this.getHM().initializeQueued();
        }
        if (config.components) {
            Object.keys(config.components).forEach(name => {
                this.getCM().register(name, config.components[name]);
            });
        }
        
        if (config.webComponents && this.webComponentFactory) {
            this.webComponentFactory.createMultiple(config.webComponents, config.webComponentOptions || {});
        }


        if (typeof requestIdleCallback === 'undefined') { 
            window.requestIdleCallback = function (callback, options) { 
                let start = Date.now(); 
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
        if (!Juris._done) { (requestIdleCallback || setTimeout)(() => { if (Juris.#inGlobal) return; Juris.#inGlobal = true; for (let key in globalThis) { if (globalThis[key] instanceof Juris) { log.ew && console.warn(`JURIS GLOBAL: '${key}'`); } } }); }
    }
    
    getComponentAPI(name) { return this.getCM().getComponentAPI(name); }
    getComponentElement(name) {return this.getCM().getComponentElement(name); }
    getNamedComponents() { return this.getCM().getNamedComponents();}

    compileTemplates(templates = null) {
        if (!this.templateCompiler) {
            log.ew && console.warn(log.w('Template compilation requested but templateCompiler not available'), 'framework');
            return;
        }
        let templateElements = templates || document.querySelectorAll('template[data-component]');
        let components = this.templateCompiler.compileTemplates(templateElements);
        Object.keys(components).forEach(name => {
            this.registerComponent(name, components[name]);
        });
    }

    setupLogging(level) {
        log.ei=true;log.ed=true;log.el=true;log.ew=true;log.ee=true;
        let levels = { debug: 0, info: 1, warn: 2, error: 3 };
        let currentLevel = levels[level] ?? 1;
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
                    warn: log.w, error: log.e, info: log.i, debug: log.d, subscribe: logSub, unsubscribe: logUnsub
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
        let context = { ...this.#createBaseContext() };
        if (this.getHM()) {
            let headlessAPIs = this.getHM().getAllAPIs();
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
        let startTime = performance.now();      
        let containerEl = typeof container === 'string' ?
            document.querySelector(container) : container;            
        if (!containerEl) {
            log.ee && console.error(log.e('Render container not found', { container }, 'application'));
            return;
        }        
        let isHydration = this.getState('isHydration', false);        
        try {
            if (Array.isArray(this.layout)) {
                let hasReactiveFunctions = this.layout.some(item => typeof item === 'function');
                if (hasReactiveFunctions) {
                    containerEl.innerHTML = '';
                    let subscriptions = [];
                    this.getDR()._handleChildren(containerEl, this.layout, subscriptions);
                    if (subscriptions.length > 0) {
                        this.getDR().subscriptions.set(containerEl, {
                            subscriptions,
                            eventListeners: []
                        });
                    }                    
                    let duration = performance.now() - startTime;
                    return;
                }
            }
            isHydration?this.#renderWithHydration(containerEl):this.#renderImmediate(containerEl);
            let duration = performance.now() - startTime;
            log.ei && console.info(log.i('Render completed', { duration: `${duration.toFixed(2)}ms`, isHydration }, 'application'));
        } catch (error) {
            log.ee && console.error(log.e('Render failed', { error: error.message, container }, 'application'));
            this.#renderError(containerEl, error);
        }
    }

    #renderImmediate (containerEl) {
        containerEl.innerHTML = '';
        let elm = this.getDR().render(this.layout);
        if (elm) containerEl.appendChild(elm);
    }
    
    async #renderWithHydration (containerEl) {
        let stagingEl = document.createElement('div');
        stagingEl.style.cssText = 'position: absolute; left: -9999px; visibility: hidden;';
        document.body.appendChild(stagingEl);
        try {
            startTracking();
            let elm = this.getDR().render(this.layout);
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
        let errorEl = document.createElement('div');
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
        let context = this.createContext(target);
        let handlers = handlerFn(context);
        let listeners  = [];
        let jurisIns = this;
        for (let eventName in handlers) {
            let actualEventName;                
            if (eventName.startsWith('on-')) {
                actualEventName = eventName.slice(3);
            } else if (eventName.startsWith('on:')) {
                actualEventName = eventName.slice(3);
            } else {
                actualEventName = eventName.slice(2).toLowerCase();
            }                
            let handler = handlers[eventName];                
            if (typeof handler === 'function') {
                target.addEventListener(actualEventName, handler);
                listeners.push({ 
                    original: eventName,
                    actual: actualEventName, 
                    handler 
                });
            }
        }
        let instance = {
            events: listeners.map(e => ({
                name: e.original,
                actualEvent: e.actual,
                handler: e.handler
            })),
            trigger(eventName, eventData = {}) {
                let listener = listeners.find(e => e.original === eventName || e.actual === eventName);
                if (listener) {
                    let mockEvent = {
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
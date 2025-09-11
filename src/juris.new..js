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
 * - Automatic deep call stack branch aware dependency detection
 * - Smart Promise (Asynchronous) Handling for Non-Blocking Rendering
 * - Component lazy compilation
 * - Global Non-Reactive State Management
 * - SSR (Server-Side Rendering) ready and CSR (Client-Side Rendering) 
 * - Loading Status templating
 * - Web Component support
 * - SVG Support
 * - Dual rendering mode, fine-grained or batch rendering
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
const jurisLinesOfCode = 2250;
const jurisVersion = '0.91.0';
const jurisMinifiedSize = '34 kB';
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
        this.externalSubscribers = new Map();
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
        log.ed && console.debug(log.d('State change initiated', { path, hasValue: value !== undefined }, 'application'));
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
            if (this.externalSubscribers.has(path)) {
                this.externalSubscribers.get(path).forEach(({ callback, hierarchical }) => {
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
        if (!this.externalSubscribers.has(path)) this.externalSubscribers.set(path, new Set());
        const subscription = { callback, hierarchical };
        this.externalSubscribers.get(path).add(subscription);
        return () => {
            const subs = this.externalSubscribers.get(path);
            if (subs) {
                subs.delete(subscription);
                if (subs.size === 0) this.externalSubscribers.delete(path);
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
        const allPaths = new Set([...this.subscribers.keys(), ...this.externalSubscribers.keys()]);
        allPaths.forEach(subscriberPath => {
            if (subscriberPath.startsWith(prefix) && subscriberPath !== path) {
                this.#triggerPathSubscribers(subscriberPath);
            }
        });
    }

    #notifyExternalSubscribers(changedPath, newValue, oldValue) {
        this.externalSubscribers.forEach((subscriptions, subscribedPath) => {
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
            log.ed && console.debug(log.d('Triggering subscribers', { path, subscriberCount: subs.size }, 'framework'));
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
        this.instances = new Map();
        this.namedComponents = new Map();
        this.comps = new Map();
        this.compStates = new Map();
        this.placeholders = new Map();
        this.asyncPropsCache = new Map();
    }

    register(name, compFn) {
        this.components.set(name, compFn);
    }

    create(name, props = {}) {
        const compFn = this.components.get(name);
        if (!compFn) {
            log.ee && console.error(log.e('Component not found', { name }, 'application'));
            return null;
        }
        try {
            if (this.juris.domRenderer._hasAsyncProps(props)) {
                return this.#createWithAsyncProps(name, compFn, props);
            }
            const { comptId, compStates, context } = this.#setupComponentContext(name);
            const result = compFn(props, context);
            if (result?.then) {
                return this.#handleAsyncComponent(promisify(result), name, props, compStates);
            }
            return this.#processComponentResult(result, name, props, compStates);
        } catch (error) {
            log.ee && console.error(log.e('Component creation failed!', { name, error: error.message }, 'application'));
            return this.#createErrorElement(name, error);
        }
    }

    #setupComponentContext(name) {
        const { comptId, compStates } = this.#generatecomptId(name);
        const context = this.#createComponentContext(comptId, compStates);
        return { comptId, compStates, context };
    }

    #generatecomptId(name) {
        if (!this.comps.has(name)) {
            this.comps.set(name, 0);
        }
        const instanceIndex = this.comps.get(name) + 1;
        this.comps.set(name, instanceIndex);
        const comptId = `${name}#${instanceIndex}`;
        const compStates = new Set();
        return { comptId, compStates };
    }

    #createComponentContext(comptId, compStates) {
        const context = this.juris.createContext();
        context.newState = (key, initialValue) => {
            const statePath = `##local.${comptId}.${key}`;
            if (this.juris.stateManager.getState(statePath, Symbol('not-found')) === Symbol('not-found')) {
                this.juris.stateManager.setState(statePath, initialValue);
            }
            compStates.add(statePath);
            return [
                () => this.juris.stateManager.getState(statePath, initialValue),
                value => this.juris.stateManager.setState(statePath, value)
            ];
        };
        return context;
    }

    #createWithAsyncProps(name, componentFn, props) {
        const placeholder = this.#createAsyncPlaceholder(name, 'async-props-loading');
        this.placeholders.set(placeholder, { name, props, type: 'async-props' });
        this.#resolveAsyncProps(props).then(resolvedProps => {
            try {
                const realElement = this.#createSyncComponent(name, componentFn, resolvedProps);
                this.#replacePlaceholder(placeholder, realElement);
            } catch (error) {
                this.#replaceWithError(placeholder, error);
            }
        }).catch(error => this.#replaceWithError(placeholder, error));
        return placeholder;
    }

    async #resolveAsyncProps(props) {
        const cacheKey = this.#generateCacheKey(props);
        const cached = this.asyncPropsCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 5000) {
            return cached.props;
        }
        const resolved = {};
        for (const [key, value] of Object.entries(props)) {
            if (value?.then) {
                try {
                    resolved[key] = await value;
                } catch (error) {
                    resolved[key] = { __asyncError: error.message };
                }
            } else {
                resolved[key] = value;
            }
        }
        this.asyncPropsCache.set(cacheKey, { props: resolved, timestamp: Date.now() });
        return resolved;
    }

    #createSyncComponent(name, componentFn, props) {
        const { comptId, compStates, context } = this.#setupComponentContext(name);
        const result = componentFn(props, context);        
        if (result?.then) {
            return this.#handleAsyncComponent(promisify(result), name, props, compStates);
        }
        return this.#processComponentResult(result, name, props, compStates);
    }

    #handleAsyncComponent(resultPromise, name, props, compStates) {
        const placeholder = this.#createAsyncPlaceholder(name, 'async-loading');
        this.placeholders.set(placeholder, { name, props, compStates });
        resultPromise.then(result => {
            try {
                const realElement = this.#processComponentResult(result, name, props, compStates);
                this.#replacePlaceholder(placeholder, realElement);
            } catch (error) {
                log.ee && console.error(log.e('Async component failed', { name, error: error.message }, 'application'));
                this.#replaceWithError(placeholder, error);
            }
        }).catch(error => this.#replaceWithError(placeholder, error));
        return placeholder;
    }

    #processComponentResult(result, name, props, compStates) {
        if (Array.isArray(result)) {
            return this.#createComponentFragment(result, name, props, compStates);
        }
        if (result && typeof result === 'object') {
            // Lifecycle component
            if (this.#hasLifecycleHooks(result)) {
                return this.#createLifecycleComponent(result, name, props, compStates);
            }
            if (typeof result.render === 'function' && !this.#hasLifecycleHooks(result)) {
                return this.#createReactiveRenderComponent(result, name, props, compStates);
            }
            const keys = Object.keys(result);
            if (keys.length === 1 && typeof keys[0] === 'string' && keys[0].length > 0) {
                const element = this.juris.domRenderer.render(result, false, name);
                if (element && compStates.size > 0) {
                    this.compStates.set(element, compStates);
                }
                return element;
            }
        }
        const element = this.juris.domRenderer.render(result);
        if (element && compStates.size > 0) {
            this.compStates.set(element, compStates);
        }
        return element;
    }

    #createComponentFragment(result, name, props, compStates) {
        const fragment = document.createDocumentFragment();
        const virtualContainer = this.#createVirtualContainer(fragment, name, props);
        const subscriptions = [];
        this.juris.domRenderer._handleChildren(virtualContainer, result, subscriptions);
        fragment._jurisComponent = {
            name,
            props,
            virtual: virtualContainer,
            cleanup: () => {
                subscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
            }
        };
        if (compStates?.size > 0) {
            fragment._juriscompStates = compStates;
        }
        return fragment;
    }

    #createLifecycleComponent(result, name, props, compStates) {
        const instance = this.#createComponentInstance(result, name, props);
        const renderResult = instance.render ? instance.render() : result;
        if (renderResult?.then) {
            return this.#handleAsyncLifecycleRender(promisify(renderResult), instance, compStates);
        }
        const element = this.juris.domRenderer.render(renderResult, false, name);
        if (element) {
            this.#setupComponentInstance(element, instance, compStates, name);
        }
        return element;
    }

    #createReactiveRenderComponent(result, name, props, compStates) {
        const container = document.createElement('div');
        container.setAttribute('data-juris-reactive-render', name);
        container.style.display = 'contents';
        const componentData = { 
            name, 
            api: result.api || {}, 
            render: result.render 
        };
        this.instances.set(container, componentData);
        if (result.api) {
            this.namedComponents.set(name, { element: container, instance: componentData });
        }
        const updateRender = () => this.#executeReactiveRender(result.render, container, name);
        const subscriptions = [];
        this.juris.domRenderer._createReactiveUpdate(container, updateRender, subscriptions);
        if (subscriptions.length > 0) {
            this.juris.domRenderer.subscriptions.set(container, { 
                subscriptions, 
                eventListeners: [] 
            });
        }
        if (compStates?.size > 0) {
            this.compStates.set(container, compStates);
        }
        return container;
    }

    #createComponentInstance(result, name, props) {
        return {
            name, props,
            hooks: result.hooks || { onMount: result.onMount, onUpdate: result.onUpdate, onUnmount: result.onUnmount },
            api: result.api || {},
            render: result.render
        };
    }

    #setupComponentInstance(element, instance, compStates, name) {
        this.instances.set(element, instance);        
        if (compStates?.size > 0) {
            this.compStates.set(element, compStates);
        }        
        if (instance.api && Object.keys(instance.api).length > 0) {
            this.namedComponents.set(name, { element, instance });
        }        
        if (instance.hooks.onMount) {
            setTimeout(() => this.#executeLifecycleHook(instance.hooks.onMount, element, name, 'onMount'), 0);
        }
    }

    #handleAsyncLifecycleRender(renderPromise, instance, compStates) {
        const placeholder = this.#createAsyncPlaceholder(instance.name, 'async-lifecycle');
        renderPromise.then(renderResult => {
            try {
                const element = this.juris.domRenderer.render(renderResult);
                if (element) {
                    this.#setupComponentInstance(element, instance, compStates, instance.name);
                    this.#replacePlaceholder(placeholder, element);
                }
            } catch (error) {
                this.#replaceWithError(placeholder, error);
            }
        }).catch(error => this.#replaceWithError(placeholder, error));
        return placeholder;
    }

    #executeReactiveRender(renderFn, container, name) {
        try {
            const renderResult = renderFn();
            if (renderResult?.then) {
                container.innerHTML = '<div class="juris-loading">Loading...</div>';
                promisify(renderResult).then(resolvedResult => {
                    container.innerHTML = '';
                    const element = this.juris.domRenderer.render(resolvedResult);
                    if (element) container.appendChild(element);
                }).catch(error => {
                    log.ee && console.error(`Async render error for ${name}:`, error);
                    container.innerHTML = `<div class="juris-error">Render Error: ${error.message}</div>`;
                });
                return;
            }
            const children = Array.from(container.children);
            children.forEach(child => this.cleanup(child));
            container.innerHTML = '';
            const element = this.juris.domRenderer.render(renderResult);
            if (element) container.appendChild(element);
        } catch (error) {
            log.ee && console.error(`Error in reactive render for ${name}:`, error);
            container.innerHTML = `<div class="juris-error">Render Error: ${error.message}</div>`;
        }
    }

    #executeLifecycleHook(hook, args, componentName, hookName) {
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

    #createVirtualContainer(fragment, name, props) {
        const virtualContainer = {
            _isVirtual: true,
            _fragment: fragment,
            _componentName: name,
            _componentProps: props,
            appendChild: (child) => fragment.appendChild(child),
            removeChild: (child) => {
                if (child.parentNode === fragment) {
                    fragment.removeChild(child);
                }
            },
            replaceChild: (newChild, oldChild) => {
                if (oldChild.parentNode === fragment) {
                    fragment.replaceChild(newChild, oldChild);
                }
            },
            get children() {
                return Array.from(fragment.childNodes);
            },
            get parentNode() { return null; },
            textContent: ''
        };
        Object.defineProperty(virtualContainer, 'textContent', {
            set(value) {
                while (fragment.firstChild) {
                    fragment.removeChild(fragment.firstChild);
                }
                if (value) {
                    fragment.appendChild(document.createTextNode(value));
                }
            },
            get() { return ''; }
        });
        return virtualContainer;
    }

    #createAsyncPlaceholder(name, className) {
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
        const errorElement = this.#createErrorElement(
            placeholder._jurisComponent?.name || 'Unknown Component', 
            error
        );
        if (placeholder.parentNode) {
            placeholder.parentNode.replaceChild(errorElement, placeholder);
        }
        this.placeholders.delete(placeholder);
    }

    #createErrorElement(name, error) {
        const element = document.createElement('div');
        element.style.cssText = 'color: red; border: 1px solid red; padding: 8px; background: #ffe6e6; font-family: monospace;';
        element.textContent = `Component Error in ${name}: ${error.message}`;
        return element;
    }

    #hasLifecycleHooks(result) {
        return result.hooks && (result.hooks.onMount || result.hooks.onUpdate || result.hooks.onUnmount) ||
            result.onMount || result.onUpdate || result.onUnmount;
    }

    #generateCacheKey(props) {
        return JSON.stringify(props, (key, value) => value?.then ? '[Promise]' : value);
    }

    cleanup(element) {
        if (element instanceof DocumentFragment) {
            this.#cleanupFragment(element);
            return;
        }
        const instance = this.instances.get(element);
        if (instance?.hooks?.onUnmount) {
            this.#executeLifecycleHook(instance.hooks.onUnmount, element, instance.name, 'onUnmount');
        }
        if (element._reactiveSubscriptions) {
            element._reactiveSubscriptions.forEach(unsubscribe => {
                try { unsubscribe(); } catch (error) { 
                    log.ew && console.warn('Error cleaning up reactive subscription:', error); 
                }
            });
            element._reactiveSubscriptions = [];
        }
        this.#cleanupcompStates(element);
        if (this.placeholders.has(element)) {
            this.placeholders.delete(element);
        }
        this.instances.delete(element);
    }

    #cleanupFragment(fragment) {
        if (fragment._jurisComponent?.cleanup) {
            fragment._jurisComponent.cleanup();
        }
        if (fragment._juriscompStates) {
            this.#cleanupStateSet(fragment._juriscompStates);
        }
    }

    #cleanupcompStates(element) {
        const states = this.compStates.get(element);
        if (states) {
            this.#cleanupStateSet(states);
            this.compStates.delete(element);
        }
    }

    #cleanupStateSet(stateSet) {
        stateSet.forEach(statePath => {
            const pathParts = statePath.split('.');
            let current = this.juris.stateManager.state;
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

    getComponent(name) {return this.namedComponents.get(name)?.instance || null;}

    getComponentAPI(name) {return this.namedComponents.get(name)?.instance?.api || null;}

    getComponentElement(name) {return this.namedComponents.get(name)?.element || null;}

    getNamedComponents() { return Array.from(this.namedComponents.keys()); }

    clearAsyncPropsCache() { this.asyncPropsCache.clear(); }

    _createPlaceholder(text, className, element = null) {
        const config = this.juris.domRenderer._getPlaceholderConfig(element);
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
        this.objectTreeAnalyzer = null;
        this.eventMap = {
            ondoubleclick: 'dblclick', onmousedown: 'mousedown', onmouseup: 'mouseup',
            onmouseover: 'mouseover', onmouseout: 'mouseout', onmousemove: 'mousemove',
            onkeydown: 'keydown', onkeyup: 'keyup', onkeypress: 'keypress',
            onfocus: 'focus', onblur: 'blur', onchange: 'change', oninput: 'input',
            onsubmit: 'submit', onload: 'load', onresize: 'resize', onscroll: 'scroll'
        };
        this.BOOLEAN_ATTRS = new Set(['disabled', 'checked', 'selected', 'readonly', 'multiple', 'autofocus', 'autoplay', 'controls', 'hidden', 'loop', 'open', 'required', 'reversed', 'itemscope']);
        this.PRESERVED_ATTRIBUTES = new Set(['viewBox', 'preserveAspectRatio', 'textLength', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'patternUnits', 'patternContentUnits', 'patternTransform', 'clipPath', 'crossOrigin', 'xmlns', 'xmlns:xlink', 'xlink:href']);
        this.SVG_ELEMENTS = new Set([
            'svg', 'g', 'defs', 'desc', 'metadata', 'title', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'rect',
            'path', 'text', 'tspan', 'textPath', 'marker', 'pattern', 'clipPath', 'mask', 'image', 'switch', 'foreignObject',
            'linearGradient', 'radialGradient', 'stop', 'animate', 'animateMotion', 'animateTransform', 'set', 'use', 'symbol'
        ]);
        this.SKIP_ATTRS = new Set(['children', 'key']);
        this.placeholders = new Map();
        this.placeholderConfigs = new Map();
        this.defaultPlaceholder = {
            className: 'juris-async-loading',
            style: 'padding: 8px; background: #f0f0f0; border: 1px dashed #ccc; opacity: 0.7;',
            text: 'Loading...',
            children: null
        };
        this.TOUCH_CONFIG = {
            moveThreshold: 10,
            timeThreshold: 300,
            touchAction: 'manipulation',
            tapHighlight: 'transparent',
            touchCallout: 'none'
        };
        this.cleanupTimeout = null;
        new MutationObserver(() => {
            if (this.cleanupTimeout) clearTimeout(this.cleanupTimeout);
            this.cleanupTimeout = setTimeout(() => {
                this.subscriptions.forEach((data, element) => {
                    if (!element.isConnected) {
                        this.cleanup(element);
                    }
                });
            }, 100);
        }).observe(document.body, { childList: true, subtree: true });       
            
            this._testMode = false;
            this._lastObjectTree = null;
    }

    attachObjectTreeAnalyzer(analyzer) {
        this.objectTreeAnalyzer = analyzer;
        return this.objectTreeAnalyzer;
    }
    setTestMode(enabled = true) {
        this._testMode = enabled;
        return this._testMode;
    }
   
    isTestMode() {
        return this._testMode;
    }

    getObjectTree() {
        return this.objectTreeAnalyzer?.getObjectTree() || null;
    }

    render(vnode, componentName = null, returnObjectTree = false) {
        if (this._testMode && returnObjectTree && this.objectTreeAnalyzer) {
            return this.objectTreeAnalyzer.buildObjectTree(vnode, componentName);
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
            return this.#createErrorElement('recursion', [...this.componentStack, tagName].join(' → '));
        }       
        if (this.juris.componentManager.components.has(tagName)) {
            return this.#renderComponent(tagName, props);
        }       
        if (/^[A-Z]/.test(tagName)) {
            return this.#createErrorElement('component', `Component "${tagName}" not registered`);
        }
        if (typeof tagName !== 'string' || tagName.length === 0) return null;
        let modifiedProps = props;
        if (props.style && this.customCSSExtractor) {
            const elementName = componentName || tagName;
            modifiedProps = this.customCSSExtractor.processProps(props, elementName, this);
        }
        return this.#createElement(tagName, modifiedProps, componentName);
    }

    #createElement(tagName, props, componentName = null) {
        const element = this.#createElementByType(tagName);
        const allSubscriptions = [];
        for (const key in props) {
            if (!props.hasOwnProperty(key) || key === 'key') continue;
            const cleanup = this.applyProp(element, key, props[key], componentName);
            if (cleanup && typeof cleanup === 'function') {
                allSubscriptions.push(cleanup);
            }
        }
        const elementSubscriptions = this.subscriptions.get(element);
        if (elementSubscriptions && allSubscriptions.length > 0) {
            elementSubscriptions.subscriptions.push(...allSubscriptions);
        } else if (allSubscriptions.length > 0) {
            this.subscriptions.set(element, {
                subscriptions: allSubscriptions,
                eventListeners: []
            });
        }
        return element;
    }

    #createReactiveHandler(element, getValue, updateDom, options = {}) {
        let lastValue = options.trackChanges ? null : undefined;
        let isInitialized = false;
        const update = () => {
            try {
                const result = getValue();
                if (this.#isPromiseLike(result)) {
                    promisify(result)
                        .then(resolved => {
                            if (!options.trackChanges || !isInitialized || !deepEquals(resolved, lastValue)) {
                                updateDom(resolved);
                                if (options.trackChanges) {
                                    lastValue = resolved;
                                    isInitialized = true;
                                }
                            }
                        })
                        .catch(error => {
                            if (options.onError) {
                                options.onError(error);
                            } else {
                                log.ee && console.error(log.e(`Error in async reactive ${options.name}:`, error), 'application');
                            }
                        });
                } else {
                    if (!options.trackChanges || !isInitialized || !deepEquals(result, lastValue)) {
                        updateDom(result);
                        if (options.trackChanges) {
                            lastValue = result;
                            isInitialized = true;
                        }
                    }
                }
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

    applyProp(element, propName, propValue, componentName = null) {
       const subscriptions = [];
        const eventListeners = [];    
        if (propName === 'children') {
            this._handleChildren(element, propValue, subscriptions, componentName);
        } else if (propName === 'text') {
            this._handleText(element, propValue, subscriptions);
        } else if (propName === 'style') {
            this._handleStyle(element, propValue, subscriptions);
        } else if (propName.startsWith('on')) {
            this._handleEvent(element, propName, propValue, eventListeners);
        } else if (typeof propValue === 'function') {
            this._handleReactiveAttribute(element, propName, propValue, subscriptions);
        } else if (this.#isPromiseLike(propValue)) {
            // Handle async props directly - no need for separate method
            if (propName === 'innerHTML') {
                this.#handleAsync(element, propName, propValue, {
                    setLoading: (el, config) => el.innerHTML = `<span class="${config.className}">${config.text}</span>`,
                    setResolved: (el, resolved) => el.innerHTML = resolved,
                    setError: (el, error) => el.innerHTML = `<span class="juris-async-error">Error: ${error.message}</span>`
                });
            } else {
                this.#handleAsync(element, propName, propValue);
            }
        } else {
            this._setStaticAttribute(element, propName, propValue);
        }   
        if (subscriptions.length > 0 || eventListeners.length > 0) {
            const existing = this.subscriptions.get(element) || { subscriptions: [], eventListeners: [] };
            existing.subscriptions.push(...subscriptions);
            existing.eventListeners.push(...eventListeners);
            this.subscriptions.set(element, existing);
        }       
        return () => {
            subscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
            eventListeners.forEach(({eventName, handler}) => {
                try { element.removeEventListener(eventName, handler); } catch(e) {}
            });
        };
    }

    _handleText(element, text, subscriptions) {
        if (typeof text === 'function') {
            const updateText = this.#createReactiveHandler(
                element,
                () => text(element),
                (value) => { element.textContent = value; },
                { trackChanges: true, name: 'text' }
            );
            this._createReactiveUpdate(element, updateText, subscriptions);
        } else if (this.#isPromiseLike(text)) {
                this.#handleAsync(element, 'text', text, {
                    setLoading: (el, config) => {
                        el.textContent = config.text;
                        el.className = config.className;
                        if (config.style) el.style.cssText = config.style;
                    },
                    setResolved: (el, resolved, config) => {
                        el.textContent = resolved;
                        el.classList.remove(config.className);
                        if (config.style) el.style.cssText = '';
                    },
                    setError: (el, error) => {
                        el.textContent = `Error: ${error.message}`;
                        el.classList.add('juris-async-error');
                    }
                });
            } else {
                element.textContent = text;
            }
    }
   
    #handleAsync(element, key, value, handlers = {}) {
        const config = this._getPlaceholderConfig(element);
        if (handlers.setLoading) {
            handlers.setLoading(element, config);
        } else {
            this.#setPlaceholder(element, key);
        }
        promisify(value)
            .then(resolved => {
                if (handlers.setResolved) {
                    handlers.setResolved(element, resolved, config);
                } else {
                    element.classList.remove(config.className);
                    this._setStaticAttribute(element, key, resolved);
                }
            })
            .catch(error => {
                if (handlers.setError) {
                    handlers.setError(element, error, config);
                } else {
                    this.#setErrorState(element, key, error.message);
                }
            });
    }

    _handleStyle(element, style, subscriptions) {
        if (typeof style === 'function') {
            const updateStyle = this.#createReactiveHandler(
                element,
                () => {
                    let result = style.length > 0 ? style(element) : style();
                    if (this.customCSSExtractor?.postProcessReactiveResult && typeof result === 'object') {
                        result = this.customCSSExtractor.postProcessReactiveResult(result, 'reactive', element);
                    }
                    return result;
                },
                (value) => {
                    if (typeof value === 'object') {
                        Object.assign(element.style, value);
                    }
                },
                { trackChanges: true, name: 'style' }
            );
            this._createReactiveUpdate(element, updateStyle, subscriptions);
        } else if (this.#isPromiseLike(style)) {
            this.#handleAsync(element, 'style', style, {
                setLoading: (el, config) => {
                    el.classList.add(config.className);
                    if (config.style) {
                        const loadingStyles = config.style.split(';').filter(s => s.trim());
                        loadingStyles.forEach(styleRule => {
                            const [prop, value] = styleRule.split(':').map(s => s.trim());
                            if (prop && value) {
                                this.#setStyleProperty(el, prop, value);
                            }
                        });
                    }
                },
                setResolved: (el, resolved, config) => {
                    el.classList.remove(config.className);
                    if (typeof resolved === 'object') {
                        if (config.style) {
                            const loadingProps = config.style.split(';')
                                .map(s => s.split(':')[0].trim())
                                .filter(p => p);
                            loadingProps.forEach(prop => el.style.removeProperty(prop));
                        }
                        Object.assign(el.style, resolved);
                    }
                }
            });
        } else if (typeof style === 'object') {
            for (const prop in style) {
                if (style.hasOwnProperty(prop)) {
                    const val = style[prop];
                    if (typeof val === 'function') {
                        this.#handleReactiveStyleProperty(element, prop, val, subscriptions);
                    } else {
                        this.#setStyleProperty(element, prop, val);
                    }
                }
            }
        }
    }

    #handleReactiveStyleProperty(element, prop, valueFn, subscriptions) {
        const updateStyleProperty = this.#createReactiveHandler(
            element,
            () => valueFn(element),
            (value) => this.#setStyleProperty(element, prop, value),
            { trackChanges: true, name: `style property '${prop}'` }
        );
        this._createReactiveUpdate(element, updateStyleProperty, subscriptions);
    }

    _handleReactiveAttribute(element, attr, valueFn, subscriptions) {
        const updateAttribute = this.#createReactiveHandler(
            element,
            () => valueFn(element),
            (value) => this._setStaticAttribute(element, attr, value),
            { trackChanges: true, name: `attribute '${attr}'` }
        );
        this._createReactiveUpdate(element, updateAttribute, subscriptions);
    }
    
    _handleChildren(element, children, subscriptions, componentName = null) {
        if (typeof children === 'function') {
            this.#handleReactiveChildren(element, children, subscriptions);
        } else if (this.#isPromiseLike(children)) {
            this.#handleAsync(element, 'children', children, {
                setLoading: (el, config) => {
                    let placeholder;
                    if (config.children) {
                        placeholder = this.render(config.children);
                    } else {
                        placeholder = document.createElement('div');
                        placeholder.className = config.className;
                        placeholder.textContent = config.text;
                        if (config.style) placeholder.style.cssText = config.style;
                    }
                    el.appendChild(placeholder);
                    this.placeholders.set(el, { type: 'children', placeholder });
                },
                setResolved: (el, resolved) => {
                    const asyncData = this.placeholders.get(el);
                    if (asyncData?.placeholder?.parentNode) {
                        el.removeChild(asyncData.placeholder);
                    }
                    this.#updateChildren(el, resolved);
                    this.placeholders.delete(el);
                },
                setError: (el, error) => {
                    const asyncData = this.placeholders.get(el);
                    if (asyncData?.placeholder) {
                        asyncData.placeholder.textContent = `Error loading content: ${error.message}`;
                        asyncData.placeholder.className = 'juris-async-error';
                    }
                }
            });
        } else {
            this.#updateChildren(element, children, componentName);
        }
    }

   #handleReactiveChildren(element, childrenFn, subscriptions) {
        const updateChildren = () => {
            const { result, deps } = this.juris.stateManager.track(() => childrenFn(element));
            if (this.#isPromiseLike(result)) {
                element.textContent = 'Loading...';
                promisify(result).then(resolved => {
                    if (typeof resolved === 'string' || typeof resolved === 'number') {
                        element.textContent = String(resolved);
                    } else {
                        this.#updateChildren(element, resolved);
                    }
                }).catch(error => {
                    element.textContent = `Error: ${error.message}`;
                });
            } else {
                if (result !== "ignore") {
                    if (typeof result === 'string' || typeof result === 'number') {
                        element.textContent = String(result);
                    } else {
                        this.#updateChildren(element, result);
                    }
                }
            }
            deps.forEach(path => {
                const unsub = this.juris.stateManager.subscribeInternal(path, updateChildren);
                subscriptions.push(unsub);
            });
        };
        updateChildren();
    }

    #updateChildren(element, children, componentName = null) {
        if (children === "ignore") return;        
        if (Array.isArray(children)) {
            const hasReactiveFunctions = children.some(child => typeof child === 'function');
            if (hasReactiveFunctions) {
                this.#renderReactiveChildren(element, children, componentName);
            } else {
                this.#renderStaticChildren(element, children, componentName);
            }
        } else if (children) {
            element.textContent = '';
            if (typeof children === 'function') {
                this.#setupSingleReactiveChild(element, children, componentName);
            } else {
                const childElement = this.#createChild(children, componentName);
                if (childElement) element.appendChild(childElement);
            }
        } else {
            element.textContent = '';
        }
    }

    #createElementByType(tagName) {
        return this.SVG_ELEMENTS.has(tagName.toLowerCase())
            ? document.createElementNS("http://www.w3.org/2000/svg", tagName)
            : document.createElement(tagName);
    }

    #createArrayFragment(vnode, componentName) {
        const hasReactiveFunctions = vnode.some(item => typeof item === 'function');
        if (hasReactiveFunctions) {
            const fragment = document.createDocumentFragment();
            const subscriptions = [];
            this.#handleReactiveFragmentChildren(fragment, vnode, subscriptions);
            if (subscriptions.length > 0) {
                fragment._jurisCleanup = () => {
                    subscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
                };
            }
            return fragment;
        }       
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < vnode.length; i++) {
            const childElement = this.render(vnode[i], componentName);
            if (childElement) fragment.appendChild(childElement);
        }
        return fragment;
    }

    #renderComponent(tagName, props) {
        const componentFn = this.juris.componentManager.components.get(tagName);
        if (!componentFn) {
            log.ee && console.error(log.e('Component not found', { name: tagName }, 'application'));
            return null;
        }
        if (this.componentStack.includes(tagName)) {
            return this.#createErrorElement('recursion', [...this.componentStack, tagName].join(' → '));
        }
        this.componentStack.push(tagName);
        const { result } = this.juris.stateManager.track(() => 
            this.juris.componentManager.create(tagName, props), true);
        this.componentStack.pop();
        return result;
    }

    #setStyleProperty(element, prop, value) {
        if (prop.startsWith('--')) {
            element.style.setProperty(prop, value);
        } else {
            element.style[prop] = value;
        }
    }

    #createErrorElement(type, message) {
        const element = document.createElement('div');
        element.style.cssText = 'color: red; border: 1px solid red; padding: 8px; background: #ffe6e6; font-family: monospace;';
        element.textContent = message;
        return element;
    }

    _handleEvent(element, eventName, handler, eventListeners) {
        eventName = eventName.toLowerCase();
        const actualEventName = eventName === 'onclick' ? 'click' : this.eventMap[eventName] || eventName.slice(2);    
        element.addEventListener(actualEventName, handler);
        eventListeners.push({ eventName: actualEventName, handler });    
        if (eventName === 'onclick') {
            this.#attachTouchSupport(element, handler, eventListeners);
        }
    }

    #attachTouchSupport(element, handler, eventListeners) {
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
            element.addEventListener(name, handler, options);
            eventListeners.push({ eventName: name, handler });
        });
    }

    #handleReactiveFragmentChildren(fragment, children, subscriptions) {
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (typeof child === 'function') {
                let currentNode = document.createTextNode('');
                let childSubscriptions = [];
                const updateChild = () => {
                    childSubscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
                    childSubscriptions = [];
                    
                    const { result, deps } = this.juris.stateManager.track(() => child());
                    
                    if (this.#isPromiseLike(result)) {
                        const placeholder = document.createTextNode('Loading...');
                        if (currentNode.parentNode) {
                            currentNode.parentNode.replaceChild(placeholder, currentNode);
                        }
                        currentNode = placeholder;                       
                        promisify(result).then(resolved => {
                            const newNode = this.#createChild(resolved, null, false) || document.createTextNode('');
                            if (currentNode.parentNode) {
                                currentNode.parentNode.replaceChild(newNode, currentNode);
                            }
                            currentNode = newNode;
                        }).catch(err => {
                            const errorNode = document.createTextNode(`Error: ${err.message}`);
                            if (currentNode.parentNode) {
                                currentNode.parentNode.replaceChild(errorNode, currentNode);
                            }
                            currentNode = errorNode;
                        });
                    } else {
                        const newNode = this.#createChild(result, null, false) || document.createTextNode('');
                        if (currentNode.parentNode) {
                            currentNode.parentNode.replaceChild(newNode, currentNode);
                        }
                        currentNode = newNode;
                    }
                    
                    deps.forEach(path => {
                        const unsub = this.juris.stateManager.subscribeInternal(path, updateChild);
                        childSubscriptions.push(unsub);
                    });
                };
                updateChild();
                fragment.appendChild(currentNode);
                subscriptions.push(() => {
                    childSubscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
                });
            } else if (child != null) {
                const childElement = this.#createChild(child, null, false);
                if (childElement) {
                    fragment.appendChild(childElement);
                }
            }
        }
    }

    #setupSingleReactiveChild(element, childFn, componentName) {
        let subscription = null;
        const update = () => {
            if (subscription) {
                try { subscription(); } catch(e) {}
            }            
            const { result, deps } = this.juris.stateManager.track(() => childFn(element));            
            if (this.#isPromiseLike(result)) {
                element.textContent = 'Loading...';
                promisify(result).then(resolved => {
                    element.textContent = '';
                    const childElement = this.#createChild(resolved, componentName, false);
                    if (childElement) element.appendChild(childElement);
                }).catch(err => {
                    element.textContent = `Error: ${err.message}`;
                });
            } else {
                element.textContent = '';
                const childElement = this.#createChild(result, componentName, false);
                if (childElement) element.appendChild(childElement);
            }
            
            if (deps.length > 0) {
                const subscriptions = deps.map(path => 
                    this.juris.stateManager.subscribeInternal(path, update));
                subscription = () => subscriptions.forEach(unsub => {
                    try { unsub(); } catch(e) {}
                });
            }
        };
        element._reactiveCleanup = subscription;
        update();
    }

    #renderReactiveChildren(element, children, componentName) {
        element.textContent = '';
        const cleanupFunctions = [];
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (typeof child === 'function') {
                const { node, cleanup } = this.#createIndividualReactiveChild(child, i, componentName, element);
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
        if (fragment.hasChildNodes()) element.appendChild(fragment);
        element._reactiveCleanup = () => {
            cleanupFunctions.forEach(cleanup => { try { cleanup(); } catch(e) {} });
        };
    }

    #createIndividualReactiveChild(childFn, index, componentName, parentElement) {
        let currentNode = document.createTextNode('');
        let subscriptions = [];
        const updateThisChild = () => {
            subscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
            subscriptions = [];
            
            const { result, deps } = this.juris.stateManager.track(() => childFn(parentElement));
            
            if (this.#isPromiseLike(result)) {
                const placeholder = document.createTextNode('Loading...');
                if (currentNode.parentNode) {
                    currentNode.parentNode.replaceChild(placeholder, currentNode);
                }
                currentNode = placeholder;
                promisify(result).then(resolved => {
                    const newNode = this.#createChild(resolved, componentName) || document.createTextNode('');
                    if (currentNode.parentNode) {
                        currentNode.parentNode.replaceChild(newNode, currentNode);
                    }
                    currentNode = newNode;
                }).catch(err => {
                    const errorNode = document.createTextNode(`Error: ${err.message}`);
                    if (currentNode.parentNode) {
                        currentNode.parentNode.replaceChild(errorNode, currentNode);
                    }
                    currentNode = errorNode;
                });
            } else {
                const newNode = this.#createChild(result, componentName) || document.createTextNode('');
                if (currentNode.parentNode) {
                    currentNode.parentNode.replaceChild(newNode, currentNode);
                }
                currentNode = newNode;
            }
            
            deps.forEach(path => {
                const unsub = this.juris.stateManager.subscribeInternal(path, updateThisChild);
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

    #renderStaticChildren(element, children, componentName) {
        element.textContent = '';
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child != null) {
                const childElement = this.#createChild(child, componentName);
                if (childElement) fragment.appendChild(childElement);
            }
        }
        if (fragment.hasChildNodes()) element.appendChild(fragment);
    }

    _setStaticAttribute(element, attr, value) {
        if (this.SKIP_ATTRS.has(attr)) return;
        if (this.BOOLEAN_ATTRS.has(attr)) {
            const boolValue = value && value !== 'false';
            if (boolValue) {
                element.setAttribute(attr, '');
            } else {
                element.removeAttribute(attr);
            }
            if (attr === 'checked' && (element.type === 'checkbox' || element.type === 'radio')) {
                element.checked = boolValue;
            } else if (attr === 'selected' && element.tagName === 'OPTION') {
                element.selected = boolValue;
            } else if (attr === 'multiple' && element.tagName === 'SELECT') {
                element.multiple = boolValue;
            } else {
                element[attr] = boolValue;
            }
            return;
        }    
        if (element.namespaceURI === 'http://www.w3.org/2000/svg') {
            element.setAttribute(attr, value);
            return;
        }
        switch (attr) {
            case 'htmlFor':
                element.setAttribute('for', value);
                return;
            case 'className':
                element.className = value;
                return;
        }    
        const firstChar = attr.charCodeAt(0);
        if (this.PRESERVED_ATTRIBUTES.has(attr) ||
            (firstChar === 100 && attr.charCodeAt(4) === 45) || // data-
            (firstChar === 97 && attr.charCodeAt(4) === 45) ||  // aria-
            attr.indexOf('-') !== -1 ||
            attr.indexOf(':') !== -1) {
            element.setAttribute(attr, value);
            return;
        }    
        if (attr in element && typeof element[attr] !== 'function') {
            element[attr] = value;
        } else {
            element.setAttribute(attr, value);
        }
    }

    _createReactiveUpdate(element, updateFn, subscriptions) {
        const { deps } = this.juris.stateManager.track(() => updateFn(element));
        deps.forEach(path => {
            const unsub = this.juris.stateManager.subscribeInternal(path, updateFn);
            subscriptions.push(unsub);
        });
    }

    updateElementContent(element, newContent) {
        this.#updateChildren(element, [newContent]);
    }

    setupIndicators(elementId, config) {
        this.placeholderConfigs.set(elementId, { ...this.defaultPlaceholder, ...config });
    }

    _hasAsyncProps(props) {
        for (const key in props) {
            if (props.hasOwnProperty(key) && !key.startsWith('on') && this.#isPromiseLike(props[key])) {
                return true;
            }
        }
        return false;
    }

    _getPlaceholderConfig(element) {
        if (element?.id && this.placeholderConfigs.has(element.id)) {
            return this.placeholderConfigs.get(element.id);
        }
        let current = element?.parentElement;
        while (current) {
            if (current.id && this.placeholderConfigs.has(current.id)) {
                return this.placeholderConfigs.get(current.id);
            }
            current = current.parentElement;
        }
        return this.defaultPlaceholder;
    }

    #setPlaceholder(element, key) {
        const config = this._getPlaceholderConfig(element);
        const placeholders = {
            text: () => {
                element.textContent = config.text;
                element.className = config.className;
                if (config.style) element.style.cssText = config.style;
            },
            children: () => {
                if (config.children) {
                    const customPlaceholder = this.render(config.children);
                    if (customPlaceholder) {
                        element.appendChild(customPlaceholder);
                        return;
                    }
                }
                const placeholder = document.createElement('span');
                placeholder.textContent = config.text;
                placeholder.className = config.className;
                if (config.style) placeholder.style.cssText = config.style;
                element.appendChild(placeholder);
            },
            className: () => element.classList.add(config.className),
            style: () => {
                if (config.style) element.style.cssText = config.style;
                element.classList.add(config.className);
            }
        };
        (placeholders[key] || (() => {
            element.setAttribute(key, 'loading');
            element.classList.add(config.className);
        }))();
    }

    #setErrorState(element, key, error) {
        element.classList.add('juris-async-error');
        if (key === 'text') {
            element.textContent = `Error: ${error}`;
        } else if (key === 'children') {
            element.innerHTML = `<span class="juris-async-error">Error: ${error}</span>`;
        }
    }

    #isPromiseLike(value) {
        return value?.then;
    }

    cleanup(element) {
        this.juris.componentManager.cleanup(element);
        const data = this.subscriptions.get(element);
        if (data) {
            if (data.subscriptions) {
                data.subscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
            }
            if (data.eventListeners) {
                data.eventListeners.forEach(({eventName, handler}) => {
                    try { element.removeEventListener(eventName, handler); } catch(e) {}
                });
            }
            this.subscriptions.delete(element);
        }
        if (element._reactiveCleanup) {
            try { element._reactiveCleanup(); } catch(e) {}
            element._reactiveCleanup = null;
        }
        if (this.placeholders.has(element)) {
            this.placeholders.delete(element);
        }
        try {
            const children = element.children;
            for (let i = 0; i < children.length; i++) {
                try { this.cleanup(children[i]); } catch(e) {}
            }
        } catch(e) {}
    }

    clearCSSCache() {
        if (this.customCSSExtractor && typeof this.customCSSExtractor.clearCache === 'function') {
            this.customCSSExtractor.clearCache();
        }       
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
            this.domRenderer.customCSSExtractor = new features.cssExtractor();
        }
        if (config.headlessComponents && this.headlessManager) {
            Object.entries(config.headlessComponents).forEach(([name, config]) => {
                if (typeof config === 'function') {
                    this.headlessManager.register(name, config);
                } else {
                    this.headlessManager.register(name, config.fn, config.options);
                }
            });
        }
        if (config.placeholders) {
            Object.entries(config.placeholders).forEach(([elementId, placeholderConfig]) => {
                this.domRenderer.setupIndicators(elementId, placeholderConfig);
            });
        }
        if (config.defaultPlaceholder) {
            this.domRenderer.defaultPlaceholder = { ...this.domRenderer.defaultPlaceholder, ...config.defaultPlaceholder };
        }
        if (this.headlessManager) {
            this.headlessManager.initializeQueued();
        }
        if (config.components) {
            Object.entries(config.components).forEach(([name, component]) => {
                this.componentManager.register(name, component);
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

    #detectGlobalAndWarn() {
        if (!Juris._done) { (requestIdleCallback || setTimeout)(() => { if (Juris.#inGlobal) return; Juris.#inGlobal = true; for (let key in globalThis) { if (globalThis[key] instanceof Juris) { log.ew && console.warn(`âš ï¸ JURIS GLOBAL: '${key}'`); } } }); }
    }
    
    getComponentAPI(name) { return this.componentManager.getComponentAPI(name); }
    getComponentElement(name) {return this.componentManager.getComponentElement(name); }
    getNamedComponents() { return this.componentManager.getNamedComponents();}

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

    setupIndicators(elementId, config) { this.domRenderer.setupIndicators(elementId, config); }
    #createBaseContext() {
        if (!this.contextTemplate) {
            this.contextTemplate = {
                getState: (path, defaultValue, track) => this.stateManager.getState(path, defaultValue, track),
                setState: (path, value, context) => this.stateManager.setState(path, value, context),
                executeBatch: (callback) => this.executeBatch(callback),
                subscribe: (path, callback) => this.stateManager.subscribe(path, callback),
                services: this.services,
                ...(this.services || {}),
                ...(this.headlessAPIs || {}),
                headless: this.headlessManager?.context,
                isSSR: typeof window === 'undefined',
                components: {
                    register: (name, component) => this.componentManager.register(name, component),
                    registerHeadless: (name, component, options) => this.headlessManager?.register(name, component, options),
                    get: name => this.componentManager.components.get(name),
                    getHeadless: name => this.headlessManager?.getInstance(name),
                    initHeadless: (name, props) => this.headlessManager?.initialize(name, props),
                    reinitHeadless: (name, props) => this.headlessManager?.reinitialize(name, props),
                    getComponentAPI: (name) => this.getComponentAPI(name),
                    getHeadlessAPI: name => this.headlessManager?.getAPI(name),
                    getComponentElement: (name) => this.getComponentElement(name),
                    getNamedComponents: () => this.componentManager.getNamedComponents(),
                },
                utils: {
                    render: container => this.render(container),
                    cleanup: () => this.cleanup(),
                    forceRender: () => this.render(),
                    getHeadlessStatus: () => this.headlessManager?.getStatus(),
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
    createHeadlessContext(element = null) {
        return this.createContext(element);
    }

    executeBatch(callback) {return this.stateManager.executeBatch(callback);}

    createWebComponent(name, componentDefinition, options = {}) {
        if (!this.webComponentFactory) {
            log.ee && console.error(log.e('WebComponent creation requested but webComponentFactory not available'), 'application');
            return null;
        }
        return this.webComponentFactory.createWebComponent(name, componentDefinition, options);
    }

    createWebComponents(components, globalOptions = {}) {
        if (!this.webComponentFactory) {
            log.ee && console.error(log.e('WebComponents creation requested but webComponentFactory not available'), 'framework');
            return {};
        }
        return this.webComponentFactory.createMultiple(components, globalOptions);
    }

    
    createContext(element = null) {
        const context = { ...this.#createBaseContext() };
        if (this.headlessManager) {
            const headlessAPIs = this.headlessManager.getAllAPIs();
            Object.assign(context, headlessAPIs);
        }
        if (element) context.element = element;
        return context;
    }

    getState(path, defaultValue, track) { return this.stateManager.getState(path, defaultValue, track); }
    setState(path, value, context) {
        return this.stateManager.setState(path, value, context);
    }
    subscribe(path, callback, hierarchical = true) { return this.stateManager.subscribe(path, callback, hierarchical); }
    subscribeExact(path, callback) { return this.stateManager.subscribeExact(path, callback); }
    registerComponent(name, component) {
        return this.componentManager.register(name, component);
    }
    // Headless component registration
    registerHeadlessComponent(name, component, options) { return this.headlessManager.register(name, component, options); }
    initializeQueuedHeadlessComponent() { this.headlessManager.initializeQueued(); }
    initializeHeadlessComponent(name, props) { return this.headlessManager.initialize(name, props); }
    getHeadlessComponent(name) { return this.headlessManager.getInstance(name); }
    getHeadlessAPI(name) { return this.headlessManager?.getAPI(name); }

    getComponent(name) { return this.componentManager.components.get(name); }

    registerAndInitHeadless(name, componentFn, options = {}) {
        this.headlessManager.register(name, componentFn, options);
        return this.headlessManager.initialize(name, options);
    }

    getHeadlessStatus() { return this.headlessManager.getStatus(); }
    objectToHtml(vnode) { return this.domRenderer.render(vnode); }

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
                    this.domRenderer._handleChildren(containerEl, this.layout, subscriptions);
                    if (subscriptions.length > 0) {
                        this.domRenderer.subscriptions.set(containerEl, {
                            subscriptions,
                            eventListeners: []
                        });
                    }                    
                    const duration = performance.now() - startTime;
                    log.ei && console.info(log.i('Render completed (reactive array)', { 
                        duration: `${duration.toFixed(2)}ms` 
                    }, 'application'));
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
        const element = this.domRenderer.render(this.layout);
        if (element) containerEl.appendChild(element);
    }
    
    async #renderWithHydration (containerEl) {
        const stagingEl = document.createElement('div');
        stagingEl.style.cssText = 'position: absolute; left: -9999px; visibility: hidden;';
        document.body.appendChild(stagingEl);
        try {
            startTracking();
            const element = this.domRenderer.render(this.layout);
            if (element) stagingEl.appendChild(element);
            await onAllComplete();
            containerEl.innerHTML = '';
            while (stagingEl.firstChild) {
                containerEl.appendChild(stagingEl.firstChild);
            }
            this.headlessManager.initializeQueued();
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
                const listener = listeners.find(e =>
                    e.original === eventName || e.actual === eventName
                );                
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
        this.headlessManager?.cleanup();
    }

    destroy() {
        this.cleanup();
        if (this.domEnhancer) {
            this.domEnhancer.destroy();
        }
        this.stateManager.subscribers.clear();
        this.stateManager.externalSubscribers.clear();
        this.componentManager.components.clear();
        if (this.headlessManager) {
            this.headlessManager.components.clear();
        }
        this.armedElements = new Map();
    }
}
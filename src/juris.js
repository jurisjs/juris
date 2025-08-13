/**
 * Juris (JavaScript Unified Reactive Interface Solution)
 * The First and Only Non-blocking Reactive Platform, Architecturally Optimized for Next Generation Cutting-Edge Cross-Platform Application.
 * Juris aims to eliminate build complexity from small to large applications.
 * Author: Resti Guay
 * Version: 0.88.2
 * License: MIT
 * GitHub: https://github.com/jurisjs/juris
 * Website: https://jurisjs.com/
 * NPM: https://www.npmjs.com/package/juris
 * Codepen: https://codepen.io/jurisauthor
 * Online Testing: https://jurisjs.com/tests/juris_pure_test_interface.html
 * Features:
 * - Temporal Independent
 * - Automcatic deep call stack branch aware dependency detection
 * - Smart Promise (Asynchronous) Handling
 * - Component lazy compilation
 * - Non-Blocking Rendering
 * - Global Non-Reactive State Management
 * - SSR (Server-Side Rendering) and CSR (Client-Side Rendering) ready
 * - Loading Status templating
 * - Web Component support
 * - SVG Support
 * - Dual rendering mode, fine-grained or batch rendering
 * - Dual Template Mode (HTML and Object VDOM)
 * - supports innerHtml in Object VDOM for critical rendering requirements
 *
 * Performance:
 * - Sub 3ms render on simple apps
 * - Sub 10ms render on complex or large apps
 * - Sub 20ms render on very complex or large apps
 * IMPORTANT!!! Notes to AI:
 * 1. Reactivity works when getState is called from intended functional attributes and children. 
 * 2. Use compress object structure and add labels into the end brackets for nested divs, tables, select, groups and forms
 * 3. Use getState third attribute with false value to skip subscription
 * 4. Components will not re-render until their parent triggeres re-render.
 * 5. All props and attributes can handle async/sync natively,
 * 6. Use service injection AMAP
 * 7. Define component as function and dont inject directly into Juris during instantiation.
 * example VDOM Convention:
 * return {
 *   {div:{className:'main', //note: static and short should be inline,
 *      text:()=>getState('reactive.text.value','Hello'),//note: reactive, should be new line
 *      style:{color:'red', border:'solid 1px blue'},//note: still okay if in-line
 *      children:[
 *        {button:{text:'static label', //note: another static and short should be inline,
 *          onClick:()=>clickHandler()
 *        }}//button
 *        {input:{type:'text',min:'1', max:'10',
                value: () => juris.getState('counter.step', 1), //note: reactive value
 *          oninput: (e) => {
                const newStep = parseInt(e.target.value) || 1;
                juris.setState('counter.step', Math.max(1, Math.min(10, newStep)));
            }
 *        }}//input
 *      ]
 *   }}//div.main
 * }//return
 */

'use strict';
const jurisLinesOfCode = 3796; // Total lines of code in Juris
const jurisVersion = '0.88.2'; // Current version of Juris
const jurisMinifiedSize = '75.11 kB'; // Minified version of Juris
// Utilities
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
// the leanest and sophisticated logger
const createLogger = () => {
    const s = [];
    const f = (m, c, cat) => {
        const msg = `${cat ? `[${cat}] ` : ''}${m}${c ? ` ${JSON.stringify(c)}` : ''}`;
        const logObj = { formatted: msg, message: m, context: c, category: cat, timestamp: Date.now() };
        setTimeout(() => s.forEach(sub => sub(logObj)), 0);
        return logObj;
    };
    return {
        log: { l: f, w: f, e: f, i: f, d: f },
        sub: cb => s.push(cb),
        unsub: cb => s.splice(s.indexOf(cb), 1)
    };
};
const { log, sub: logSub, unsub: logUnsub } = createLogger();
const createPromisify = () => {
    const activePromises = new Set();
    let isTracking = false;
    const subscribers = new Set();
    const checkAllComplete = () => {
        if (activePromises.size === 0 && subscribers.size > 0) {
            subscribers.forEach(callback => callback());
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
            subscribers.clear();
        },
        onAllComplete: (callback) => {
            subscribers.add(callback);
            if (activePromises.size === 0) {
                setTimeout(callback, 0);
            }
            return () => subscribers.delete(callback);
        }
    };
};
const { promisify, startTracking, stopTracking, onAllComplete } = createPromisify();
// State Manager
class StateManager {
    constructor(initialState = {}, middleware = []) {
        console.info(log.i('StateManager initialized', {
            initialStateKeys: Object.keys(initialState),
            middlewareCount: middleware.length
        }, 'framework'));
        this.state = { ...initialState };
        this.middleware = [...middleware];
        this.subscribers = new Map();
        this.externalSubscribers = new Map();
        this.currentTracking = null;
        this.isUpdating = false;
        this.initialState = JSON.parse(JSON.stringify(initialState));
        this.maxUpdateDepth = 50;
        this.updateDepth = 0;
        this.currentlyUpdating = new Set();

        // Manual batching properties
        this.isBatching = false;
        this.batchQueue = [];
        this.batchedPaths = new Set();
    }
    reset() {
        console.info(log.i('State reset to initial state', {}, 'framework'));
        if (this.isBatching) {
            this.batchQueue = [];
            this.batchedPaths.clear();
            this.isBatching = false;
        }
        this.state = JSON.parse(JSON.stringify(this.initialState));
    }
    getState(path, defaultValue = null, track = true) {
        if (!isValidPath(path)) return defaultValue;
        if (track) this.currentTracking?.add(path);
        const parts = getPathParts(path);
        let current = this.state;
        for (const part of parts) {
            if (current?.[part] === undefined) return defaultValue;
            current = current[part];
        }
        return current;
    }
    setState(path, value, context = {}) {
        console.debug(log.d('State change initiated', { path, hasValue: value !== undefined }, 'application'));
        if (!isValidPath(path) || this._hasCircularUpdate(path)) return;
        if (this.isBatching) {
            this._queueBatchedUpdate(path, value, context);
            return;
        }
        this._setStateImmediate(path, value, context);
    }

    executeBatch(callback) {
        if (this.isBatching) {
            // Already in a batch, just execute callback
            return callback();
        }
        this.beginBatch();
        try {
            const result = callback();
            // Handle Promise-returning callbacks
            if (result && typeof result.then === 'function') {
                return result
                    .then(value => {
                        this.endBatch();
                        return value;
                    })
                    .catch(error => {
                        this.endBatch();
                        throw error;
                    });
            }
            // Synchronous callback
            this.endBatch();
            return result;
        } catch (error) {
            this.endBatch();
            throw error;
        }
    }

    beginBatch() {
        console.debug(log.d('Manual batch started', {}, 'framework'));
        this.isBatching = true;
        this.batchQueue = [];
        this.batchedPaths.clear();
    }

    endBatch() {
        if (!this.isBatching) {
            console.warn(log.w('endBatch() called without beginBatch()', {}, 'framework'));
            return;
        }
        console.debug(log.d('Manual batch ending', { queuedUpdates: this.batchQueue.length }, 'framework'));
        this.isBatching = false;
        if (this.batchQueue.length === 0) return;
        this._processBatchedUpdates();
    }

    isBatchingActive() {
        return this.isBatching;
    }

    getBatchQueueSize() {
        return this.batchQueue.length;
    }

    clearBatch() {
        if (this.isBatching) {
            console.info(log.i('Clearing current batch', { clearedUpdates: this.batchQueue.length }, 'framework'));
            this.batchQueue = [];
            this.batchedPaths.clear();
        }
    }

    _queueBatchedUpdate(path, value, context) {
        this.batchQueue = this.batchQueue.filter(update => update.path !== path);
        this.batchQueue.push({ path, value, context, timestamp: Date.now() });
        this.batchedPaths.add(path);
    }

    _processBatchedUpdates() {
        const updates = [...this.batchQueue];
        this.batchQueue = [];
        this.batchedPaths.clear();
        const pathGroups = new Map();
        updates.forEach(update => pathGroups.set(update.path, update));
        const wasUpdating = this.isUpdating;
        this.isUpdating = true;
        const appliedUpdates = [];
        pathGroups.forEach(update => {
            const oldValue = this.getState(update.path);
            let finalValue = update.value;
            for (const middleware of this.middleware) {
                try {
                    const result = middleware({ path: update.path, oldValue, newValue: finalValue, context: update.context, state: this.state });
                    if (result !== undefined) finalValue = result;
                } catch (error) {
                    console.error(log.e('Middleware error in batch', {
                        path: update.path,
                        error: error.message
                    }, 'application'));
                }
            }
            if (deepEquals(oldValue, finalValue)) return;
            const parts = getPathParts(update.path);
            let current = this.state;
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (current[part] == null || typeof current[part] !== 'object') {
                    current[part] = {};
                }
                current = current[part];
            }
            current[parts[parts.length - 1]] = finalValue;

            appliedUpdates.push({ path: update.path, oldValue, newValue: finalValue });
        });
        this.isUpdating = wasUpdating;
        // Collect all parent paths that need notification
        const parentPaths = new Set();
        appliedUpdates.forEach(({ path }) => {
            const parts = getPathParts(path);
            for (let i = 1; i <= parts.length; i++) {
                parentPaths.add(parts.slice(0, i).join('.'));
            }
        });
        // Notify each parent path only if it has subscribers
        parentPaths.forEach(path => {
            if (this.subscribers.has(path)) this._triggerPathSubscribers(path);
            if (this.externalSubscribers.has(path)) {
                this.externalSubscribers.get(path).forEach(({ callback, hierarchical }) => {
                    try {
                        callback(this.getState(path), null, path);
                    } catch (error) {
                        console.error(log.e('External subscriber error:', error), 'application');
                    }
                });
            }
        });
    }

    _setStateImmediate(path, value, context = {}) {
        const oldValue = this.getState(path);
        let finalValue = value;
        for (const middleware of this.middleware) {
            try {
                const result = middleware({ path, oldValue, newValue: finalValue, context, state: this.state });
                if (result !== undefined) finalValue = result;
            } catch (error) {
                console.error(log.e('Middleware error', { path, error: error.message, middlewareName: middleware.name || 'anonymous' }, 'application'));
            }
        }
        if (deepEquals(oldValue, finalValue)) {
            console.debug(log.d('State unchanged, skipping update', { path }, 'framework'));
            return;
        }
        console.debug(log.d('State updated', { path, oldValue: typeof oldValue, newValue: typeof finalValue }, 'application'));
        const parts = getPathParts(path);
        let current = this.state;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (current[part] == null || typeof current[part] !== 'object') current[part] = {};
            current = current[part];
        }
        current[parts[parts.length - 1]] = finalValue;
        if (!this.isUpdating) {
            this.isUpdating = true;
            if (!this.currentlyUpdating) this.currentlyUpdating = new Set();
            this.currentlyUpdating.add(path);
            this._notifySubscribers(path, finalValue, oldValue);
            this._notifyExternalSubscribers(path, finalValue, oldValue);
            this.currentlyUpdating.delete(path);
            this.isUpdating = false;
        }
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

    _notifySubscribers(path, newValue, oldValue) {
        this._triggerPathSubscribers(path);
        const parts = getPathParts(path);
        for (let i = parts.length - 1; i > 0; i--) {
            this._triggerPathSubscribers(parts.slice(0, i).join('.'));
        }
        const prefix = path ? path + '.' : '';
        const allPaths = new Set([...this.subscribers.keys(), ...this.externalSubscribers.keys()]);
        allPaths.forEach(subscriberPath => {
            if (subscriberPath.startsWith(prefix) && subscriberPath !== path) {
                this._triggerPathSubscribers(subscriberPath);
            }
        });
    }

    _notifyExternalSubscribers(changedPath, newValue, oldValue) {
        this.externalSubscribers.forEach((subscriptions, subscribedPath) => {
            subscriptions.forEach(({ callback, hierarchical }) => {
                const shouldNotify = hierarchical ?
                    (changedPath === subscribedPath || changedPath.startsWith(subscribedPath + '.')) :
                    changedPath === subscribedPath;
                if (shouldNotify) {
                    try {
                        callback(newValue, oldValue, changedPath);
                    } catch (error) {
                        console.error(log.e('External subscriber error:', error), 'application');
                    }
                }
            });
        });
    }

    _triggerPathSubscribers(path) {
        const subs = this.subscribers.get(path);
        if (subs && subs.size > 0) {
            console.debug(log.d('Triggering subscribers', { path, subscriberCount: subs.size }, 'framework'));

            new Set(subs).forEach(callback => {
                let oldTracking
                try {
                    oldTracking = this.currentTracking;
                    const newTracking = new Set();
                    this.currentTracking = newTracking;
                    callback();
                    this.currentTracking = oldTracking;
                    newTracking.forEach(newPath => {
                        const existingSubs = this.subscribers.get(newPath);
                        if (!existingSubs || !existingSubs.has(callback)) {
                            this.subscribeInternal(newPath, callback);
                        }
                    });
                } catch (error) {
                    console.error(log.e('Subscriber error:', error), 'application');
                    this.currentTracking = oldTracking;
                }
            });
        }
    }

    _hasCircularUpdate(path) {
        if (!this.currentlyUpdating) this.currentlyUpdating = new Set();
        if (this.currentlyUpdating.has(path)) {
            console.warn(log.w('Circular dependency detected', { path }, 'framework'));
            return true;
        }
        return false;
    }

    startTracking() {
        const dependencies = new Set();
        this.currentTracking = dependencies;
        return dependencies;
    }

    endTracking() {
        const tracking = this.currentTracking;
        this.currentTracking = null;
        return tracking || new Set();
    }
}

// Headless Manager
class HeadlessManager {
    constructor(juris) {
        console.info(log.i('HeadlessManager initialized', {}, 'framework'));
        this.juris = juris;
        this.components = new Map();
        this.instances = new Map();
        this.context = {};
        this.initQueue = new Set();
        this.lifecycleHooks = new Map();
    }

    register(name, componentFn, options = {}) {
        console.info(log.i('Headless component registered', { name, hasOptions: Object.keys(options).length > 0 }, 'framework'));
        this.components.set(name, { fn: componentFn, options });
        if (options.autoInit) this.initQueue.add(name);
    }

    initialize(name, props = {}) {
        console.debug(log.d('Initializing headless component', { name, propsKeys: Object.keys(props) }, 'framework'));
        const component = this.components.get(name);
        if (!component) {
            console.error(log.e('Headless component not found', { name }, 'framework'));
            return null;
        }
        try {
            const context = this.juris.createHeadlessContext();
            const instance = component.fn(props, context);
            if (!instance || typeof instance !== 'object') {
                console.error(log.e('Invalid headless component instance', { name }, 'framework'));
                return null;
            }
            console.info(log.i('Headless component initialized', { name, hasAPI: !!instance.api, hasHooks: !!instance.hooks }, 'framework'));
            this.instances.set(name, instance);
            if (instance.hooks) this.lifecycleHooks.set(name, instance.hooks);
            if (instance.api) {
                this.context[name] = instance.api;
                if (!this.juris.headlessAPIs) this.juris.headlessAPIs = {};
                this.juris.headlessAPIs[name] = instance.api;
                this.juris._updateComponentContexts();
            }
            instance.hooks?.onRegister?.();
            return instance;
        } catch (error) {
            console.error(log.e('Headless component initialization failed', { name, error: error.message }, 'framework'));
            return null;
        }
    }

    initializeQueued() {
        this.initQueue.forEach(name => {
            if (!this.instances.has(name)) {
                const component = this.components.get(name);
                this.initialize(name, component.options || {});
            }
        });
        this.initQueue.clear();
    }

    getInstance(name) { return this.instances.get(name); }
    getAPI(name) { return this.context[name]; }
    getAllAPIs() { return { ...this.context }; }

    reinitialize(name, props = {}) {
        const instance = this.instances.get(name);
        if (instance?.hooks?.onUnregister) {
            try { instance.hooks.onUnregister(); } catch (error) { console.error(log.e(`Error in onUnregister for '${name}':`, error), 'framework'); }
        }
        if (this.context[name]) delete this.context[name];
        if (this.juris.headlessAPIs?.[name]) delete this.juris.headlessAPIs[name];
        this.instances.delete(name);
        this.lifecycleHooks.delete(name);
        return this.initialize(name, props);
    }

    cleanup() {
        console.info(log.i('Cleaning up headless components', { instanceCount: this.instances.size }, 'framework'));
        this.instances.forEach((instance, name) => {
            if (instance.hooks?.onUnregister) {
                try { instance.hooks.onUnregister(); } catch (error) { console.error(log.e(`Error in onUnregister for '${name}':`, error), 'framework'); }
            }
        });
        this.instances.clear();
        this.context = {};
        this.lifecycleHooks.clear();
        if (this.juris.headlessAPIs) this.juris.headlessAPIs = {};
    }

    getStatus() {
        return {
            registered: Array.from(this.components.keys()),
            initialized: Array.from(this.instances.keys()),
            queued: Array.from(this.initQueue),
            apis: Object.keys(this.context)
        };
    }
}

// Component Manager
class ComponentManager {
    constructor(juris) {
        console.info(log.i('ComponentManager initialized', {}, 'framework'));
        this.juris = juris;
        this.components = new Map();
        this.instances = new WeakMap();
        this.componentCounters = new Map();
        this.componentStates = new WeakMap();
        this.asyncPlaceholders = new WeakMap();
        this.asyncPropsCache = new Map();
    }

    register(name, componentFn) {
        console.info(log.i('Component registered', { name }, 'application'));
        this.components.set(name, componentFn);
    }

    create(name, props = {}) {
        const componentFn = this.components.get(name);
        if (!componentFn) {
            console.error(log.e('Component not found', { name }, 'application'));
            return null;
        }
        try {
            if (this._hasAsyncProps(props)) {
                console.debug(log.d('Component has async props', { name }, 'framework'));
                return this._createWithAsyncProps(name, componentFn, props);
            }
            const { componentId, componentStates } = this._setupComponent(name);
            console.debug(log.d('Component setup complete', { name, componentId, stateCount: componentStates.size }, 'framework'));
            const context = this._createComponentContext(componentId, componentStates);
            const result = componentFn(props, context);
            if (result?.then) return this._handleAsyncComponent(promisify(result), name, props, componentStates);
            return this._processComponentResult(result, name, props, componentStates);
        } catch (error) {
            console.error(log.e('Component creation failed. Did you forgot to use children:?', { name, error: error.message }, 'application'));
            return this._createErrorElement(new Error(error.message + ' Did you forgot to use children:[]?'));
        }
    }

    _setupComponent(name) {
        if (!this.componentCounters.has(name)) this.componentCounters.set(name, 0);
        const instanceIndex = this.componentCounters.get(name) + 1;
        this.componentCounters.set(name, instanceIndex);
        const componentId = `${name}_${instanceIndex}`;
        const componentStates = new Set();
        return { componentId, componentStates };
    }

    _createComponentContext(componentId, componentStates) {
        const context = this.juris.createContext();
        context.newState = (key, initialValue) => {
            const statePath = `__local.${componentId}.${key}`;
            if (this.juris.stateManager.getState(statePath, Symbol('not-found')) === Symbol('not-found')) {
                this.juris.stateManager.setState(statePath, initialValue);
            }
            componentStates.add(statePath);
            return [
                () => this.juris.stateManager.getState(statePath, initialValue),
                value => this.juris.stateManager.setState(statePath, value)
            ];
        };
        return context;
    }

    _hasAsyncProps(props) {
        return Object.values(props).some(value => value?.then);
    }

    _createWithAsyncProps(name, componentFn, props) {
        console.debug(log.d('Creating component with async props', { name }, 'framework'));
        // Create a temporary element with the component name as ID for config lookup
        const tempElement = document.createElement('div');
        tempElement.id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const placeholder = this._createPlaceholder(`Loading ${name}...`, 'juris-async-props-loading', tempElement);
        this.asyncPlaceholders.set(placeholder, { name, props, type: 'async-props' });
        this._resolveAsyncProps(props).then(resolvedProps => {
            try {
                const realElement = this._createSyncComponent(name, componentFn, resolvedProps);
                if (realElement && placeholder.parentNode) {
                    placeholder.parentNode.replaceChild(realElement, placeholder);
                }
                this.asyncPlaceholders.delete(placeholder);
            } catch (error) {
                this._replaceWithError(placeholder, error);
            }
        }).catch(error => this._replaceWithError(placeholder, error));

        return placeholder;
    }

    async _resolveAsyncProps(props) {
        const cacheKey = this._generateCacheKey(props);
        const cached = this.asyncPropsCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 5000) return cached.props;
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

    _generateCacheKey(props) {
        return JSON.stringify(props, (key, value) => value?.then ? '[Promise]' : value);
    }

    _createSyncComponent(name, componentFn, props) {
        const { componentId, componentStates } = this._setupComponent(name);
        const context = this._createComponentContext(componentId, componentStates);
        const result = componentFn(props, context);
        if (result?.then) return this._handleAsyncComponent(promisify(result), name, props, componentStates);
        return this._processComponentResult(result, name, props, componentStates);
    }

    _handleAsyncComponent(resultPromise, name, props, componentStates) {
        console.debug(log.d('Handling async component', { name }, 'framework'));
        const tempElement = document.createElement('div');
        tempElement.id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const placeholder = this._createPlaceholder(`Loading ${name}...`, 'juris-async-loading', tempElement);
        this.asyncPlaceholders.set(placeholder, { name, props, componentStates });
        resultPromise.then(result => {
            console.debug(log.d('Async component resolved', { name }, 'framework'));
            try {
                const realElement = this._processComponentResult(result, name, props, componentStates);
                if (realElement && placeholder.parentNode) {
                    placeholder.parentNode.replaceChild(realElement, placeholder);
                }
                this.asyncPlaceholders.delete(placeholder);
            } catch (error) {
                console.error(log.e('Async component failed', { name, error: error.message }, 'application'));
                this._replaceWithError(placeholder, error);
            }
        }).catch(error => this._replaceWithError(placeholder, error));

        return placeholder;
    }

    _processComponentResult(result, name, props, componentStates) {
        if (result && typeof result === 'object') {
            if (this._hasLifecycleHooks(result)) {
                return this._createLifecycleComponent(result, name, props, componentStates);
            }
            if (typeof result.render === 'function' && !this._hasLifecycleHooks(result)) {
                const container = document.createElement('div');
                container.setAttribute('data-juris-reactive-render', name);
                const updateRender = () => {
                    try {
                        const renderResult = result.render();
                        if (renderResult?.then) {
                            container.innerHTML = '<div class="juris-loading">Loading...</div>';
                            promisify(renderResult).then(resolvedResult => {
                                container.innerHTML = '';
                                const element = this.juris.domRenderer.render(resolvedResult);
                                if (element) container.appendChild(element);
                            }).catch(error => {
                                console.error(`Async render error for ${name}:`, error);
                                container.innerHTML = `<div class="juris-error">Error: ${error.message}</div>`;
                            });
                            return;
                        }
                        const children = Array.from(container.children);
                        children.forEach(child => this.cleanup(child));
                        container.innerHTML = '';
                        const element = this.juris.domRenderer.render(renderResult);
                        if (element) container.appendChild(element);                            
                    } catch (error) {
                        console.error(`Error in reactive render for ${name}:`, error);
                        container.innerHTML = `<div class="juris-error">Render Error: ${error.message}</div>`;
                    }
                };                    
                const subscriptions = [];
                this.juris.domRenderer._createReactiveUpdate(container, updateRender, subscriptions);
                if (subscriptions.length > 0) {
                    this.juris.domRenderer.subscriptions.set(container, { 
                        subscriptions, 
                        eventListeners: [] 
                    });
                }                    
                if (componentStates?.size > 0) {
                    this.componentStates.set(container, componentStates);
                }                    
                return container;
            }
            const keys = Object.keys(result);
            if (keys.length === 1 && typeof keys[0] === 'string' && keys[0].length > 0) {
                const element = this.juris.domRenderer.render(result, false, name);
                if (element && componentStates.size > 0) this.componentStates.set(element, componentStates);
                return element;
            }
        }
        const element = this.juris.domRenderer.render(result);
        if (element && componentStates.size > 0) this.componentStates.set(element, componentStates);
        return element;
    }

    _hasLifecycleHooks(result) {
        return result.hooks && (result.hooks.onMount || result.hooks.onUpdate || result.hooks.onUnmount) ||
            result.onMount || result.onUpdate || result.onUnmount;
    }

    _handleAsyncRender(renderPromise, name, componentStates, indicator = null) {
        const tempElement = document.createElement('div');
        tempElement.id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const placeholder = indicator ?
            this.juris.domRenderer.render(indicator) :
            this._createPlaceholder(`Loading ${name}...`, 'juris-async-loading', tempElement);
        renderPromise.then(renderResult => {
            try {
                const element = this.juris.domRenderer.render(renderResult);
                if (element && componentStates.size > 0) this.componentStates.set(element, componentStates);
                if (placeholder.parentNode) placeholder.parentNode.replaceChild(element, placeholder);
            } catch (error) {
                this._replaceWithError(placeholder, error);
            }
        }).catch(error => this._replaceWithError(placeholder, error));
        return placeholder;
    }

    _createLifecycleComponent(componentResult, name, props, componentStates) {
        const instance = {
            name, props,
            hooks: componentResult.hooks || {},
            api: componentResult.api || {},
            render: componentResult.render
        };
        const renderResult = instance.render();
        if (renderResult?.then) return this._handleAsyncLifecycleRender(promisify(renderResult), instance, componentStates);
        const element = this.juris.domRenderer.render(renderResult);
        if (element) {
            this.instances.set(element, instance);
            if (componentStates?.size > 0) this.componentStates.set(element, componentStates);
            if (instance.hooks.onMount) {
                setTimeout(() => {
                    try {
                        const mountResult = instance.hooks.onMount();
                        if (mountResult?.then) {
                            promisify(mountResult).catch(error => console.error(log.e(`Async onMount error in ${name}:`, error), 'application'));
                        }
                    } catch (error) {
                        console.error(log.e(`onMount error in ${name}:`, error), 'application');
                    }
                }, 0);
            }
        }
        return element;
    }

    _handleAsyncLifecycleRender(renderPromise, instance, componentStates) {
        const tempElement = document.createElement('div');
        tempElement.id = instance.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const placeholder = this._createPlaceholder(`Loading ${instance.name}...`, 'juris-async-lifecycle', tempElement);
        renderPromise.then(renderResult => {
            try {
                const element = this.juris.domRenderer.render(renderResult);
                if (element) {
                    this.instances.set(element, instance);
                    if (componentStates?.size > 0) {
                        this.componentStates.set(element, componentStates);
                    }
                    if (placeholder.parentNode) {
                        placeholder.parentNode.replaceChild(element, placeholder);
                    }
                    if (instance.hooks.onMount) {
                        setTimeout(() => {
                            try {
                                const mountResult = instance.hooks.onMount();
                                if (mountResult?.then) {
                                    promisify(mountResult).catch(error =>
                                        console.error(log.e(`Async onMount error in ${instance.name}:`, error), 'application')
                                    );
                                }
                            } catch (error) {
                                console.error(log.e(`onMount error in ${instance.name}:`, error), 'application');
                            }
                        }, 0);
                    }
                }
            } catch (error) {
                this._replaceWithError(placeholder, error);
            }
        }).catch(error => this._replaceWithError(placeholder, error));
        return placeholder;
    }

    updateInstance(element, newProps) {
        const instance = this.instances.get(element);
        if (!instance) return;
        const oldProps = instance.props;
        if (deepEquals(oldProps, newProps)) return;
        if (this._hasAsyncProps(newProps)) {
            this._resolveAsyncProps(newProps).then(resolvedProps => {
                instance.props = resolvedProps;
                this._performUpdate(instance, element, oldProps, resolvedProps);
            }).catch(error => console.error(log.e(`Error updating async props for ${instance.name}:`, error), 'application'));
        } else {
            instance.props = newProps;
            this._performUpdate(instance, element, oldProps, newProps);
        }
    }

    _performUpdate(instance, element, oldProps, newProps) {
        if (instance.hooks.onUpdate) {
            try {
                const updateResult = instance.hooks.onUpdate(oldProps, newProps);
                if (updateResult?.then) {
                    promisify(updateResult).catch(error => console.error(log.e(`Async onUpdate error in ${instance.name}:`, error), 'application'));
                }
            } catch (error) {
                console.error(log.e(`onUpdate error in ${instance.name}:`, error), 'application');
            }
        }
        try {
            const renderResult = instance.render();
            const normalizedRenderResult = promisify(renderResult);
            if (normalizedRenderResult !== renderResult) {
                normalizedRenderResult.then(newContent => {
                    this.juris.domRenderer.updateElementContent(element, newContent);
                }).catch(error => console.error(log.e(`Async re-render error in ${instance.name}:`, error), 'application'));
            } else {
                this.juris.domRenderer.updateElementContent(element, renderResult);
            }
        } catch (error) {
            console.error(log.e(`Re-render error in ${instance.name}:`, error), 'application');
        }
    }

    cleanup(element) {
        const instance = this.instances.get(element);
        if (instance) console.debug(log.d('Cleaning up component', { name: instance.name }, 'framework'));
        if (instance?.hooks?.onUnmount) {
            try {
                const unmountResult = instance.hooks.onUnmount();
                if (unmountResult?.then) {
                    promisify(unmountResult).catch(error => console.error(log.e(`Async onUnmount error in ${instance.name}:`, error), 'application'));
                }
            } catch (error) {
                console.error(log.e(`onUnmount error in ${instance.name}:`, error), 'application');
            }
        }
        if (element._reactiveSubscriptions) {
            element._reactiveSubscriptions.forEach(unsubscribe => {
                try { unsubscribe(); } catch (error) { 
                    console.warn('Error cleaning up reactive subscription:', error); 
                }
            });
            element._reactiveSubscriptions = [];
        }
        const states = this.componentStates.get(element);
        if (states) {
            states.forEach(statePath => {
                const pathParts = statePath.split('.');
                let current = this.juris.stateManager.state;
                for (let i = 0; i < pathParts.length - 1; i++) {
                    if (current[pathParts[i]]) current = current[pathParts[i]];
                    else return;
                }
                delete current[pathParts[pathParts.length - 1]];
            });
            this.componentStates.delete(element);
        }

        if (this.asyncPlaceholders.has(element)) this.asyncPlaceholders.delete(element);
        this.instances.delete(element);
    }

    _createPlaceholder(text, className, element = null) {
        const config = this.juris.domRenderer._getPlaceholderConfig(element);
        const placeholder = document.createElement('div');
        placeholder.className = config.className;
        placeholder.textContent = config.text;
        if (config.style) placeholder.style.cssText = config.style;
        return placeholder;
    }

    _createErrorElement(error) {
        const element = document.createElement('div');
        element.style.cssText = 'color: red; border: 1px solid red; padding: 8px; background: #ffe6e6;';
        element.textContent = `Component Error: ${error.message}`;
        return element;
    }

    _replaceWithError(placeholder, error) {
        const errorElement = this._createErrorElement(error);
        if (placeholder.parentNode) placeholder.parentNode.replaceChild(errorElement, placeholder);
        this.asyncPlaceholders.delete(placeholder);
    }

    clearAsyncPropsCache() { this.asyncPropsCache.clear(); }

    getAsyncStats() {
        return {
            registeredComponents: this.components.size,
            cachedAsyncProps: this.asyncPropsCache.size
        };
    }
}

// Enhanced DOMRenderer v0.87.0 with CSS Extraction
// Based on your existing code with CSS extraction seamlessly integrated
class DOMRenderer {
    constructor(juris) {
        console.info(log.i('DOMRenderer initialized', { renderMode: 'fine-grained' }, 'framework'));
        this.juris = juris;
        this.subscriptions = new WeakMap();
        this.componentStack = [];
        // CSS Extraction System - NEW
        this.cssCache = new Map();          // styleHash -> { css, className }
        this.injectedCSS = new Set();       // Track injected CSS rules
        this.styleSheet = null;             // Single stylesheet for extracted CSS
        this.camelCaseRegex = /([A-Z])/g;   // Pre-compiled for performance

        this.eventMap = {
            ondoubleclick: 'dblclick', onmousedown: 'mousedown', onmouseup: 'mouseup',
            onmouseover: 'mouseover', onmouseout: 'mouseout', onmousemove: 'mousemove',
            onkeydown: 'keydown', onkeyup: 'keyup', onkeypress: 'keypress',
            onfocus: 'focus', onblur: 'blur', onchange: 'change', oninput: 'input',
            onsubmit: 'submit', onload: 'load', onresize: 'resize', onscroll: 'scroll'
        };

        this.BOOLEAN_ATTRS = new Set(['disabled', 'checked', 'selected', 'readonly', 'multiple', 'autofocus', 'autoplay', 'controls', 'hidden', 'loop', 'open', 'required', 'reversed', 'itemScope']);
        this.PRESERVED_ATTRIBUTES = new Set(['viewBox', 'preserveAspectRatio', 'textLength', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'patternUnits', 'patternContentUnits', 'patternTransform', 'clipPath', 'crossOrigin', 'xmlns', 'xmlns:xlink', 'xlink:href']);
        this.SVG_ELEMENTS = new Set([
            'svg', 'g', 'defs', 'desc', 'metadata', 'title', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'rect',
            'path', 'text', 'tspan', 'textPath', 'marker', 'pattern', 'clipPath', 'mask', 'image', 'switch', 'foreignObject',
            'linearGradient', 'radialGradient', 'stop', 'animate', 'animateMotion', 'animateTransform', 'set', 'use', 'symbol'
        ]);

        this.KEY_PROPS = ['id', 'className', 'text'];
        this.SKIP_ATTRS = new Set(['children', 'key']);
        this.ATTRIBUTES_TO_KEEP = new Set(['id', 'data-juris-key']);

        this.elementCache = new Map();
        this.recyclePool = new Map();
        this.renderMode = 'fine-grained';
        this.failureCount = 0;
        this.maxFailures = 3;
        this.asyncCache = new Map();
        this.asyncPlaceholders = new WeakMap();
        this.placeholderConfigs = new Map();
        this.defaultPlaceholder = {
            className: 'juris-async-loading',
            style: 'padding: 8px; background: #f0f0f0; border: 1px dashed #ccc; opacity: 0.7;',
            text: 'Loading...',
            children: null
        };

        // Pre-allocated reusable objects/arrays for hot paths
        this.tempArray = [];
        this.tempKeyParts = [];

        // Touch handling constants
        this.TOUCH_CONFIG = {
            moveThreshold: 10,
            timeThreshold: 300,
            touchAction: 'manipulation',
            tapHighlight: 'transparent',
            touchCallout: 'none'
        };

        // Recycling configuration
        this.RECYCLE_POOL_SIZE = 100;
    }

    setRenderMode(mode) {
        if (['fine-grained', 'batch'].includes(mode)) {
            this.renderMode = mode;
            console.info(log.i('Render mode changed', { mode }, 'framework'));
        } else {
            console.warn(log.w('Invalid render mode', { mode }, 'application'));
        }
    }

    getRenderMode() { return this.renderMode; }
    isFineGrained() { return this.renderMode === 'fine-grained'; }
    isBatchMode() { return this.renderMode === 'batch'; }

    // Enhanced render method with CSS extraction
    render(vnode, staticMode = false, componentName = null) {
        // Handle primitives
        if (typeof vnode === 'string' || typeof vnode === 'number') {
            return document.createTextNode(String(vnode));
        }
        if (!vnode || typeof vnode !== 'object') return null;

        if (Array.isArray(vnode)) {
            const fragment = document.createDocumentFragment();
            for (let i = 0; i < vnode.length; i++) {
                const childElement = this.render(vnode[i], staticMode, componentName);
                if (childElement) fragment.appendChild(childElement);
            }
            return fragment;
        }

        const tagName = Object.keys(vnode)[0];
        const props = vnode[tagName] || {};

        if (!staticMode && this.componentStack.includes(tagName)) {
            return this._createDeepRecursionErrorElement(tagName, this.componentStack);
        }

        if (!staticMode && this.juris.componentManager.components.has(tagName)) {
            const parentTracking = this.juris.stateManager.currentTracking;
            this.juris.stateManager.currentTracking = null;
            
            this.componentStack.push(tagName);
            const result = this.juris.componentManager.create(tagName, props);
            this.componentStack.pop();
            
            this.juris.stateManager.currentTracking = parentTracking;
            return result;
        }

        if (!staticMode && /^[A-Z]/.test(tagName)) {
            return this._createComponentErrorElement(tagName);
        }

        if (typeof tagName !== 'string' || tagName.length === 0) return null;

        let modifiedProps = props;
        if (props.style && !staticMode && this.cssExtraction) {
            const elementName = componentName || tagName;
            const extraction = this.extractCSS(elementName, props.style);
            if (extraction.className) {
                modifiedProps = { ...props };
                modifiedProps.className = this.combineClassNames(props.className, extraction.className);
                
                if (extraction.reactiveStyle) {
                    modifiedProps.style = extraction.reactiveStyle;
                } else {
                    delete modifiedProps.style;
                }
            }
        }

        const inheritedComponentName = componentName || (props.style ? tagName : null);

        if (staticMode) {
            return this._createElementStatic(tagName, modifiedProps, inheritedComponentName);
        }

        if (this.renderMode === 'fine-grained') {
            return this._createElementFineGrained(tagName, modifiedProps, inheritedComponentName);
        }

        try {
            const key = modifiedProps.key || this._generateKey(tagName, modifiedProps);
            const cachedElement = this.elementCache.get(key);
            if (cachedElement && this._canReuseElement(cachedElement, tagName, modifiedProps)) {
                this._updateElementProperties(cachedElement, modifiedProps);
                return cachedElement;
            }
            return this._createElementOptimized(tagName, modifiedProps, key, inheritedComponentName);
        } catch (error) {
            this.failureCount++;
            if (this.failureCount >= this.maxFailures) this.renderMode = 'fine-grained';
            return this._createElementFineGrained(tagName, modifiedProps, inheritedComponentName);
        }
    }

    _createComponentErrorElement(tagName) {
        const errorElement = document.createElement('div');
        errorElement.style.cssText = 'color: red; border: 1px solid red; padding: 8px; background: #ffe6e6; font-family: monospace;';
        errorElement.textContent = `Component "${tagName}" not registered`;
        return errorElement;
    }

    _createDeepRecursionErrorElement(tagName, callStack) {
        const errorElement = document.createElement('div');
        errorElement.style.cssText = 'color: red; border: 1px solid red; padding: 8px; background: #ffe6e6; font-family: monospace;';
        const chain = [...callStack, tagName].join(' → ');
        errorElement.textContent = `Recursion detected: ${chain}`;
        return errorElement;
    }
    // CSS Extraction with intelligent caching - NEW
    extractCSS(componentName, styleObj) {
        if (!this.cssExtraction) return { reactiveStyle: styleObj };
        const { staticStyles, reactiveStyles } = this.separateStyles(styleObj);
        
        if (Object.keys(staticStyles).length === 0) {
            return { 
                reactiveStyle: Object.keys(reactiveStyles).length ? reactiveStyles : null 
            };
        }
        
        // Generate deterministic hash from static styles
        const styleHash = this.hashStyles(staticStyles);
        const cacheKey = `${componentName}-${styleHash}`;
        
        // Check cache first for reuse
        if (!this.cssCache.has(cacheKey)) {
            const className = `j-${componentName.replace(/[^a-zA-Z0-9]/g, '')}-${styleHash}`;
            const css = this.generateCSS(className, staticStyles);
            this.cssCache.set(cacheKey, { css, className });
        }
        
        const cached = this.cssCache.get(cacheKey);
        
        // Inject CSS if not already done
        if (!this.injectedCSS.has(cacheKey)) {
            this.injectCSS(cached.css);
            this.injectedCSS.add(cacheKey);
        }
        
        return {
            className: cached.className,
            reactiveStyle: Object.keys(reactiveStyles).length ? reactiveStyles : null
        };
    }

    // Separate static styles from reactive functions - NEW
    separateStyles(styleObj) {
        const staticStyles = {};
        const reactiveStyles = {};
        
        for (const [key, value] of Object.entries(styleObj)) {
            if (typeof value === 'function') {
                reactiveStyles[key] = value;
            } else {
                staticStyles[key] = value;
            }
        }
        
        return { staticStyles, reactiveStyles };
    }

    // Fast deterministic hashing for style objects - NEW
    hashStyles(styles) {
        const sortedEntries = Object.entries(styles).sort(([a], [b]) => a.localeCompare(b));
        const str = JSON.stringify(sortedEntries);
        
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash + str.charCodeAt(i)) & 0x7fffffff;
        }
        
        return hash.toString(36);
    }

    // Generate CSS rule from className and styles - NEW
    generateCSS(className, styles) {
        const rules = Object.entries(styles)
            .map(([prop, value]) => {
                const cssProp = prop.replace(this.camelCaseRegex, '-$1').toLowerCase();
                return `  ${cssProp}: ${value};`;
            })
            .join('\n');
        
        return `.${className} {\n${rules}\n}`;
    }

    // Inject CSS into document stylesheet - NEW
    injectCSS(css) {
        if (!this.styleSheet) {
            const style = document.createElement('style');
            style.setAttribute('data-juris-extracted', '');
            document.head.appendChild(style);
            this.styleSheet = style.sheet;
        }
        
        try {
            this.styleSheet.insertRule(css, this.styleSheet.cssRules.length);
            console.debug(log.d('CSS injected', { css }, 'framework'));
        } catch (error) {
            console.warn('CSS injection failed:', error);
            // Fallback: append to style element
            this.styleSheet.ownerNode.textContent += css + '\n';
        }
    }

    // Combine multiple class names safely - NEW
    combineClassNames(...classNames) {
        return classNames.filter(Boolean).join(' ');
    }

    _createElementStatic(tagName, props, componentName = null) {
        const element = this.SVG_ELEMENTS.has(tagName.toLowerCase())
            ? document.createElementNS("http://www.w3.org/2000/svg", tagName)
            : document.createElement(tagName);

        for (const key in props) {
            if (!props.hasOwnProperty(key)) continue;

            const value = props[key];
            if (key === 'children') {
                this._updateChildrenStatic(element, value, componentName); // Pass context
            } else if (key === 'text') {
                element.textContent = value;
            } else if (key === 'style' && typeof value === 'object') {
                Object.assign(element.style, value);
            } else if (key.startsWith('on')) {
                const eventName = key === 'onclick' ? 'click' : key.slice(2).toLowerCase();
                element.addEventListener(eventName, value);
            } else if (key !== 'key') {
                this._setStaticAttributeFast(element, key, value);
            }
        }

        return element;
    }

    _setStaticAttributeFast(element, attr, value) {
        if (this.PRESERVED_ATTRIBUTES.has(attr) || attr.includes('-') || attr.includes(':')) {
            element.setAttribute(attr, value);
        } else if (attr === 'className') {
            element.className = value;
        } else if (attr === 'htmlFor') {
            element.setAttribute('for', value);
        } else if (attr === 'tabIndex') {
            element.tabIndex = value;
        } else if (attr in element && typeof element[attr] !== 'function') {
            element[attr] = value;
        } else {
            element.setAttribute(attr, value);
        }
    }

    _updateChildrenStatic(element, children, componentName = null) {
        if (children === "ignore") return;
        element.textContent = '';
        const fragment = document.createDocumentFragment();
        if (Array.isArray(children)) {
            let actualChildren = children;
            let childStaticMode = false;
            if (children.length > 0 && children[0]?.config?.staticMode) {
                childStaticMode = true;
                actualChildren = children.slice(1);
            }
            for (let i = 0; i < actualChildren.length; i++) {
                const child = actualChildren[i];
                let childElement;
                if (typeof child === 'string' || typeof child === 'number') {
                    childElement = document.createTextNode(String(child));
                } else {
                    childElement = this.render(child, childStaticMode, componentName);
                }
                if (childElement) fragment.appendChild(childElement);
            }
        } else if (children) {
            let childElement;
            if (typeof children === 'string' || typeof children === 'number') {
                childElement = document.createTextNode(String(children));
            } else {
                childElement = this.render(children, false, componentName);
            }
            if (childElement) fragment.appendChild(childElement);
        }
        if (fragment.hasChildNodes()) element.appendChild(fragment);
    }

    _createElementFineGrained(tagName, props, componentName = null) {
        const element = this.SVG_ELEMENTS.has(tagName.toLowerCase())
            ? document.createElementNS("http://www.w3.org/2000/svg", tagName)
            : document.createElement(tagName);
        this.tempArray.length = 0;
        const subscriptions = this.tempArray;
        const eventListeners = [];
        for (const key in props) {
            if (!props.hasOwnProperty(key)) continue;
            const value = props[key];
            if (key === 'children') {
                this._handleChildren(element, value, subscriptions, componentName); // Pass context
            } else if (key === 'text') {
                this._handleText(element, value, subscriptions);
            } else if (key === 'style') {
                this._handleStyle(element, value, subscriptions);
            } else if (key.startsWith('on')) {
                this._handleEvent(element, key, value, eventListeners);
            } else if (typeof value === 'function') {
                this._handleReactiveAttribute(element, key, value, subscriptions);
            } else if (this._isPromiseLike(value)) {
                this._handleAsyncProp(element, key, value, subscriptions);
            } else if (key !== 'key') {
                this._setStaticAttribute(element, key, value);
            }
        }
        if (subscriptions.length > 0 || eventListeners.length > 0) {
            this.subscriptions.set(element, {
                subscriptions: [...subscriptions],
                eventListeners
            });
        }
        return element;
    }

    _handleChildren(element, children, subscriptions) {
        if (this.renderMode === 'fine-grained') {
            this._handleChildrenFineGrained(element, children, subscriptions);
        } else {
            this._handleChildrenOptimized(element, children, subscriptions);
        }
    }

    _handleChildrenFineGrained(element, children, subscriptions) {
        if (Array.isArray(children) && children.length > 0 && children[0]?.config?.staticMode) {
            return this._updateChildrenStatic(element, children);
        }
        if (typeof children === 'function') {
            this._handleReactiveChildren(element, children, subscriptions);
        } else if (this._isPromiseLike(children)) {
            this._handleAsyncChildrenDirect(element, children);
        } else {
            this._updateChildren(element, children);
        }
    }

    _handleChildrenOptimized(element, children, subscriptions) {
        if (Array.isArray(children) && children.length > 0 && children[0]?.config?.staticMode) {
            return this._updateChildrenStatic(element, children);
        }
        if (typeof children === 'function') {
            let lastChildrenState = null;
            let childElements = [];
            let useOptimizedPath = true;
            const updateChildren = () => {
                try {
                    const newChildren = children(element);
                    if (this._isPromiseLike(newChildren)) {
                        promisify(newChildren)
                            .then(resolvedChildren => {
                                if (resolvedChildren !== "ignore" && !this._childrenEqual(lastChildrenState, resolvedChildren)) {
                                    if (useOptimizedPath) {
                                        try {
                                            childElements = this._reconcileChildren(element, childElements, resolvedChildren);
                                            lastChildrenState = resolvedChildren;
                                        } catch (error) {
                                            console.warn(log.w('Reconciliation failed, falling back to safe rendering:', error.message), 'framework');
                                            useOptimizedPath = false;
                                            this._updateChildren(element, resolvedChildren);
                                            lastChildrenState = resolvedChildren;
                                        }
                                    } else {
                                        this._updateChildren(element, resolvedChildren);
                                        lastChildrenState = resolvedChildren;
                                    }
                                }
                            })
                            .catch(error => {
                                console.error(log.e('Error in async children function:', error), 'framework');
                                useOptimizedPath = false;
                            });
                    } else {
                        if (newChildren !== "ignore" && !this._childrenEqual(lastChildrenState, newChildren)) {
                            if (useOptimizedPath) {
                                try {
                                    childElements = this._reconcileChildren(element, childElements, newChildren);
                                    lastChildrenState = newChildren;
                                } catch (error) {
                                    console.warn(log.w('Reconciliation failed, falling back to safe rendering:', error.message), 'framework');
                                    useOptimizedPath = false;
                                    this._updateChildren(element, newChildren);
                                    lastChildrenState = newChildren;
                                }
                            } else {
                                this._updateChildren(element, newChildren);
                                lastChildrenState = newChildren;
                            }
                        }
                    }
                } catch (error) {
                    console.error(log.e('Error in children function:', error), 'application');
                    useOptimizedPath = false;
                    try {
                        this._updateChildren(element, []);
                    } catch (fallbackError) {
                        console.error(log.e('Even safe fallback failed:', fallbackError), 'application');
                    }
                }
            };
            this._createReactiveUpdate(element, updateChildren, subscriptions);
            try {
                const initialChildren = children();
                if (this._isPromiseLike(initialChildren)) {
                    promisify(initialChildren)
                        .then(resolvedInitial => {
                            childElements = this._reconcileChildren(element, [], resolvedInitial);
                            lastChildrenState = resolvedInitial;
                        })
                        .catch(error => {
                            console.warn(log.w('Initial async children failed, using safe method:', error.message), 'framework');
                            useOptimizedPath = false;
                            this._updateChildren(element, []);
                        });
                } else {
                    childElements = this._reconcileChildren(element, [], initialChildren);
                    lastChildrenState = initialChildren;
                }
            } catch (error) {
                console.warn(log.w('Initial reconciliation failed, using safe method:', error.message), 'framework');
                useOptimizedPath = false;
                const initialChildren = children();
                this._updateChildren(element, initialChildren);
                lastChildrenState = initialChildren;
            }
        } else if (this._isPromiseLike(children)) {
            this._handleAsyncChildrenDirect(element, children);
        } else {
            try {
                this._reconcileChildren(element, [], children);
            } catch (error) {
                console.warn(log.w('Static reconciliation failed, using safe method:', error.message), 'framework');
                this._updateChildren(element, children);
            }
        }
    }

    _handleAsyncProp(element, key, value, subscriptions) {
        if (key === 'text') {
            this._handleAsyncTextDirect(element, value);
        } else if (key === 'children') {
            this._handleAsyncChildrenDirect(element, value);
        } else if (key === 'style') {
            this._handleAsyncStyleDirect(element, value);
        } else if (key === 'innerHTML') {
            this._handleAsyncInnerHTMLDirect(element, value);
        } else {
            this._setPlaceholder(element, key);
            promisify(value)
                .then(resolvedValue => {
                    const config = this._getPlaceholderConfig(element);
                    element.classList.remove(config.className);
                    this._setStaticAttribute(element, key, resolvedValue);
                })
                .catch(error => {
                    console.error(log.e(`Async prop '${key}' failed:`, error), 'application');
                    this._setErrorState(element, key, error.message);
                });
        }
    }

    _handleAsyncInnerHTMLDirect(element, htmlPromise) {
        const config = this._getPlaceholderConfig(element);
        element.innerHTML = `<span class="${config.className}">${config.text}</span>`;
        promisify(htmlPromise)
            .then(resolvedHTML => {
                element.innerHTML = resolvedHTML;
            })
            .catch(error => {
                console.error(log.e('Async innerHTML failed:', error), 'application');
                element.innerHTML = `<span class="juris-async-error">Error: ${error.message}</span>`;
            });
    }

    _hasAsyncProps(props) {
        for (const key in props) {
            if (props.hasOwnProperty(key) && !key.startsWith('on') && this._isPromiseLike(props[key])) {
                return true;
            }
        }
        return false;
    }

    _isPromiseLike(value) {
        return value?.then;
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

    _setPlaceholder(element, key) {
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

    _setErrorState(element, key, error) {
        element.classList.add('juris-async-error');
        if (key === 'text') {
            element.textContent = `Error: ${error}`;
        } else if (key === 'children') {
            element.innerHTML = `<span class="juris-async-error">Error: ${error}</span>`;
        }
    }

    _childrenEqual(oldChildren, newChildren) {
        if (oldChildren === newChildren) return true;
        if (Array.isArray(oldChildren) !== Array.isArray(newChildren)) return false;
        if (Array.isArray(oldChildren) && oldChildren.length !== newChildren.length) return false;
        return deepEquals && deepEquals(oldChildren, newChildren);
    }

    _reconcileChildren(parent, oldChildren, newChildren) {
        console.debug(log.d('Reconciling children', { parentTag: parent.tagName, oldCount: oldChildren.length, newCount: Array.isArray(newChildren) ? newChildren.length : (newChildren ? 1 : 0) }, 'framework'));
        if (!Array.isArray(newChildren)) {
            newChildren = newChildren ? [newChildren] : [];
        }
        const newChildElements = [];
        const fragment = document.createDocumentFragment();
        const oldChildrenByKey = new Map();
        for (let i = 0; i < oldChildren.length; i++) {
            const child = oldChildren[i];
            const key = child._jurisKey || `auto-${i}`;
            oldChildrenByKey.set(key, child);
        }
        const usedElements = new Set();
        for (let i = 0; i < newChildren.length; i++) {
            const newChild = newChildren[i];
            if (!newChild || typeof newChild !== 'object') continue;
            const tagName = Object.keys(newChild)[0];
            const props = newChild[tagName] || {};
            const key = props.key || this._generateKey(tagName, props);
            const existingElement = oldChildrenByKey.get(key);
            if (existingElement &&
                !usedElements.has(existingElement) &&
                this._canReuseElement(existingElement, tagName, props) &&
                !this._wouldCreateCircularReference(parent, existingElement)) {
                if (existingElement.parentNode) {
                    existingElement.parentNode.removeChild(existingElement);
                }
                this._updateElementProperties(existingElement, props);
                newChildElements.push(existingElement);
                fragment.appendChild(existingElement);
                usedElements.add(existingElement);
                oldChildrenByKey.delete(key);
            } else {
                const newElement = this.render(newChild);
                if (newElement && !this._wouldCreateCircularReference(parent, newElement)) {
                    newElement._jurisKey = key;
                    newChildElements.push(newElement);
                    fragment.appendChild(newElement);
                }
            }
        }

        oldChildrenByKey.forEach(unusedChild => {
            if (!usedElements.has(unusedChild)) {
                this._recycleElement(unusedChild);
            }
        });

        try {
            parent.textContent = '';
            if (fragment.hasChildNodes()) {
                parent.appendChild(fragment);
            }
        } catch (error) {
            console.error(log.e('Error in reconcileChildren:', error), 'framework');
            parent.textContent = '';
            for (let i = 0; i < newChildElements.length; i++) {
                const child = newChildElements[i];
                try {
                    if (child && !this._wouldCreateCircularReference(parent, child)) {
                        parent.appendChild(child);
                    }
                } catch (e) {
                    console.error(log.e('Reconciliation failed', { parentTag: parent.tagName, error: e.message }, 'framework'));
                }
            }
        }

        return newChildElements;
    }

    _wouldCreateCircularReference(parent, child) {
        if (!parent || !child) return false;
        if (parent === child) return true;
        try {
            let current = parent.parentNode;
            while (current) {
                if (current === child) return true;
                current = current.parentNode;
            }
            if (child.contains && child.contains(parent)) return true;
            if (child.children) {
                for (let i = 0; i < child.children.length; i++) {
                    if (this._wouldCreateCircularReference(parent, child.children[i])) {
                        return true;
                    }
                }
            }
        } catch (error) {
            console.warn(log.w('Error checking circular reference, assuming unsafe:', error), 'application');
            return true;
        }
        return false;
    }

    _recycleElement(element) {
        if (!element || !element.tagName) return;
        const tagName = element.tagName.toLowerCase();
        if (element.parentNode) {
            element.parentNode.removeChild(element);
        }
        if (!this.recyclePool.has(tagName)) {
            this.recyclePool.set(tagName, []);
        }
        const pool = this.recyclePool.get(tagName);
        if (pool.length < this.RECYCLE_POOL_SIZE) {
            this.cleanup(element);
            this._resetElement(element);
            pool.push(element);
        }
    }

    _handleAsyncChildrenDirect(element, childrenPromise) {
        const config = this._getPlaceholderConfig(element);
        let placeholder;
        if (config.children) {
            placeholder = this.render(config.children);
        } else {
            placeholder = document.createElement('div');
            placeholder.className = config.className;
            placeholder.textContent = config.text;
            if (config.style) placeholder.style.cssText = config.style;
        }
        element.appendChild(placeholder);
        this.asyncPlaceholders.set(element, { type: 'children', placeholder });
        promisify(childrenPromise)
            .then(resolvedChildren => {
                if (placeholder.parentNode) element.removeChild(placeholder);
                this._updateChildren(element, resolvedChildren);
                this.asyncPlaceholders.delete(element);
            })
            .catch(error => {
                console.error(log.e('Async children failed:', error), 'application');
                placeholder.textContent = `Error loading content: ${error.message}`;
                placeholder.className = 'juris-async-error';
            });
    }

    _handleReactiveChildren(element, childrenFn, subscriptions) {
        let lastChildrenResult = null, isInitialized = false;
        const updateChildren = () => {
            try {
                const result = childrenFn(element);
                if (this._isPromiseLike(result)) {
                    promisify(result)
                        .then(resolvedResult => {
                            if (resolvedResult !== "ignore" && (!isInitialized || !deepEquals(resolvedResult, lastChildrenResult))) {
                                if (typeof resolvedResult === 'string' || typeof resolvedResult === 'number') {
                                    element.textContent = String(resolvedResult);
                                } else {
                                    this._updateChildren(element, resolvedResult);
                                }
                                lastChildrenResult = resolvedResult;
                                isInitialized = true;
                            }
                        })
                        .catch(error => console.error(log.e('Error in async reactive children:', error), 'application'));
                } else {
                    if (result !== "ignore" && (!isInitialized || !deepEquals(result, lastChildrenResult))) {
                        if (typeof result === 'string' || typeof result === 'number') {
                            element.textContent = String(result);
                        } else {
                            this._updateChildren(element, result);
                        }
                        lastChildrenResult = result;
                        isInitialized = true;
                    }
                }
            } catch (error) {
                console.error(log.e('Error in reactive children function:', error), 'application');
            }
        };
        this._createReactiveUpdate(element, updateChildren, subscriptions);
    }

    _updateChildren(element, children, componentName = null) {
        if (children === "ignore") return;
        element.textContent = '';
        const fragment = document.createDocumentFragment();
        
        if (Array.isArray(children)) {
            let actualChildren = children;
            let childStaticMode = false;
            if (children.length > 0 && children[0]?.config?.staticMode) {
                childStaticMode = true;
                actualChildren = children.slice(1);
            }
            for (let i = 0; i < actualChildren.length; i++) {
                const child = actualChildren[i];
                if (child === null || child === undefined) continue;
                let childElement;
                if (typeof child === 'string' || typeof child === 'number') {
                    childElement = document.createTextNode(String(child));
                } else {
                    childElement = this.render(child, childStaticMode, componentName);
                }
                if (childElement) fragment.appendChild(childElement);
            }
        } else if (children) {
            let childElement;
            if (typeof children === 'string' || typeof children === 'number') {
                childElement = document.createTextNode(String(children));
            } else {
                childElement = this.render(children, false, componentName);
            }
            if (childElement) fragment.appendChild(childElement);
        }
        if (fragment.hasChildNodes()) element.appendChild(fragment);
    }

    _handleText(element, text, subscriptions) {
        if (typeof text === 'function') {
            this._handleReactiveText(element, text, subscriptions);
        } else if (this._isPromiseLike(text)) {
            this._handleAsyncTextDirect(element, text);
        } else {
            element.textContent = text;
        }
    }

    _handleAsyncTextDirect(element, textPromise) {
        const config = this._getPlaceholderConfig(element);
        element.textContent = config.text;
        element.className = config.className;
        if (config.style) element.style.cssText = config.style;
        promisify(textPromise)
            .then(resolvedText => {
                element.textContent = resolvedText;
                element.classList.remove(config.className);
                if (config.style) element.style.cssText = '';
            })
            .catch(error => {
                console.error(log.e('Async text failed:', error), 'application');
                element.textContent = `Error: ${error.message}`;
                element.classList.add('juris-async-error');
            });
    }

    _handleReactiveText(element, textFn, subscriptions) {
        let lastTextValue = null, isInitialized = false;
        const updateText = () => {
            try {
                const result = textFn(element);
                if (this._isPromiseLike(result)) {
                    promisify(result)
                        .then(resolvedText => {
                            if (!isInitialized || resolvedText !== lastTextValue) {
                                element.textContent = resolvedText;
                                lastTextValue = resolvedText;
                                isInitialized = true;
                            }
                        })
                        .catch(error => console.error(log.e('Error in async reactive text:', error), 'application'));
                } else {
                    if (!isInitialized || result !== lastTextValue) {
                        element.textContent = result;
                        lastTextValue = result;
                        isInitialized = true;
                    }
                }
            } catch (error) {
                console.error(log.e('Error in reactive text function:', error), 'application');
            }
        };
        this._createReactiveUpdate(element, updateText, subscriptions);
    }

    _handleStyle(element, style, subscriptions) {
        if (typeof style === 'function') {
            this._handleReactiveStyle(element, style, subscriptions);
        } else if (this._isPromiseLike(style)) {
            this._handleAsyncStyleDirect(element, style);
        } else if (typeof style === 'object') {
            for (const prop in style) {
                if (style.hasOwnProperty(prop)) {
                    const val = style[prop];
                    if (typeof val === 'function') {
                        this._handleReactiveStyleProperty(element, prop, val, subscriptions);
                    } else {
                        element.style[prop] = val;
                    }
                }
            }
        }
    }

    _handleReactiveStyleProperty(element, prop, valueFn, subscriptions) {
        let lastValue = null, isInitialized = false;
        const updateStyleProperty = () => {
            try {
                const result = valueFn(element);
                if (this._isPromiseLike(result)) {
                    promisify(result)
                        .then(resolvedValue => {
                            if (!isInitialized || resolvedValue !== lastValue) {
                                element.style[prop] = resolvedValue;
                                lastValue = resolvedValue;
                                isInitialized = true;
                            }
                        })
                        .catch(error => console.error(`Error in async reactive style property '${prop}':`, error));
                } else {
                    if (!isInitialized || result !== lastValue) {
                        element.style[prop] = result;
                        lastValue = result;
                        isInitialized = true;
                    }
                }
            } catch (error) {
                console.error(`Error in reactive style property '${prop}':`, error);
            }
        };
        this._createReactiveUpdate(element, updateStyleProperty, subscriptions);
    }

    _handleAsyncStyleDirect(element, stylePromise) {
        const config = this._getPlaceholderConfig(element);
        element.classList.add(config.className);
        if (config.style) {
            const loadingStyles = config.style.split(';').filter(s => s.trim());
            for (let i = 0; i < loadingStyles.length; i++) {
                const styleRule = loadingStyles[i];
                const [prop, value] = styleRule.split(':').map(s => s.trim());
                if (prop && value) {
                    element.style[prop] = value;
                }
            }
        }
        promisify(stylePromise)
            .then(resolvedStyle => {
                element.classList.remove(config.className);
                if (typeof resolvedStyle === 'object') {
                    if (config.style) {
                        const loadingProps = config.style.split(';')
                            .map(s => s.split(':')[0].trim())
                            .filter(p => p);
                        for (let i = 0; i < loadingProps.length; i++) {
                            element.style.removeProperty(loadingProps[i]);
                        }
                    }
                    Object.assign(element.style, resolvedStyle);
                }
            })
            .catch(error => console.error(log.e('Async style failed:', error), 'application'));
    }

    _handleReactiveStyle(element, styleFn, subscriptions) {
        let lastStyleValue = null, isInitialized = false;
        const updateStyle = () => {
            try {
                const result = styleFn(element);
                if (this._isPromiseLike(result)) {
                    promisify(result)
                        .then(resolvedStyle => {
                            if (!isInitialized || !deepEquals(resolvedStyle, lastStyleValue)) {
                                if (typeof resolvedStyle === 'object') {
                                    Object.assign(element.style, resolvedStyle);
                                    lastStyleValue = { ...resolvedStyle };
                                    isInitialized = true;
                                }
                            }
                        })
                        .catch(error => console.error(log.e('Error in async reactive style:', error), 'application'));
                } else {
                    if (!isInitialized || !deepEquals(result, lastStyleValue)) {
                        if (typeof result === 'object') {
                            Object.assign(element.style, result);
                            lastStyleValue = { ...result };
                            isInitialized = true;
                        }
                    }
                }
            } catch (error) {
                console.error(log.e('Error in reactive style function:', error), 'application');
            }
        };
        this._createReactiveUpdate(element, updateStyle, subscriptions);
    }

    _createElementOptimized(tagName, props, key) {
        let element = this._getRecycledElement(tagName);
        if (!element) {
            element = this.SVG_ELEMENTS.has(tagName.toLowerCase())
                ? document.createElementNS("http://www.w3.org/2000/svg", tagName)
                : document.createElement(tagName);
        }
        if (key) {
            this.elementCache.set(key, element);
            element._jurisKey = key;
        }
        const subscriptions = [], eventListeners = [];
        this._processProperties(element, props, subscriptions, eventListeners);
        if (subscriptions.length > 0 || eventListeners.length > 0) {
            this.subscriptions.set(element, { subscriptions, eventListeners });
        }
        return element;
    }

    _processProperties(element, props, subscriptions, eventListeners) {
        for (const key in props) {
            if (!props.hasOwnProperty(key) || key === 'key') continue;
            const value = props[key];
            switch (key) {
                case 'children':
                    this._handleChildren(element, value, subscriptions);
                    break;
                case 'text':
                    this._handleText(element, value, subscriptions);
                    break;
                case 'innerHTML':
                    if (typeof value === 'function') {
                        this._handleReactiveAttribute(element, key, value, subscriptions);
                    } else {
                        element.innerHTML = value;
                    }
                    break;
                case 'style':
                    this._handleStyle(element, value, subscriptions);
                    break;
                default:
                    if (key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110) {
                        this._handleEvent(element, key, value, eventListeners);
                    } else if (typeof value === 'function') {
                        this._handleReactiveAttribute(element, key, value, subscriptions);
                    } else {
                        this._setStaticAttribute(element, key, value);
                    }
            }
        }
    }

    _handleEvent(element, eventName, handler, eventListeners) {
        console.debug(log.d('Event handler attached', { tagName: element.tagName, eventName }, 'framework'));
        if (eventName === 'onclick') {
            const config = this.TOUCH_CONFIG;
            element.style.touchAction = config.touchAction;
            element.style.webkitTapHighlightColor = config.tapHighlight;
            element.style.webkitTouchCallout = config.touchCallout;
            element.addEventListener('click', handler);
            eventListeners.push({ eventName: 'click', handler });
            let touchStartTime = 0, touchMoved = false, startX = 0, startY = 0;
            const touchStart = e => {
                touchStartTime = Date.now();
                touchMoved = false;
                if (e.touches?.[0]) {
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                }
            };
            const touchMove = e => {
                if (e.touches?.[0]) {
                    const deltaX = Math.abs(e.touches[0].clientX - startX);
                    const deltaY = Math.abs(e.touches[0].clientY - startY);
                    if (deltaX > config.moveThreshold || deltaY > config.moveThreshold) {
                        touchMoved = true;
                    }
                }
            };
            const touchEnd = e => {
                const touchDuration = Date.now() - touchStartTime;
                if (!touchMoved && touchDuration < config.timeThreshold) {
                    e.preventDefault();
                    e.stopPropagation();
                    handler(e);
                }
            };
            element.addEventListener('touchstart', touchStart, { passive: true });
            element.addEventListener('touchmove', touchMove, { passive: true });
            element.addEventListener('touchend', touchEnd, { passive: false });
            eventListeners.push(
                { eventName: 'touchstart', handler: touchStart },
                { eventName: 'touchmove', handler: touchMove },
                { eventName: 'touchend', handler: touchEnd }
            );
        } else {
            const lowerEventName = eventName.toLowerCase();
            const actualEventName = this.eventMap[lowerEventName] || lowerEventName.slice(2);

            element.addEventListener(actualEventName, handler);
            eventListeners.push({ eventName: actualEventName, handler });
        }
    }

    _handleReactiveAttribute(element, attr, valueFn, subscriptions) {
        let lastValue = null, isInitialized = false;
        const updateAttribute = () => {
            try {
                const result = valueFn(element);
                if (this._isPromiseLike(result)) {
                    promisify(result)
                        .then(resolvedValue => {
                            if (!isInitialized || !deepEquals(resolvedValue, lastValue)) {
                                this._setStaticAttribute(element, attr, resolvedValue);
                                lastValue = resolvedValue;
                                isInitialized = true;
                            }
                        })
                        .catch(error => console.error(log.e(`Error in async reactive attribute '${attr}':`, error), 'application'));
                } else {
                    if (!isInitialized || !deepEquals(result, lastValue)) {
                        this._setStaticAttribute(element, attr, result);
                        lastValue = result;
                        isInitialized = true;
                    }
                }
            } catch (error) {
                console.error(log.e(`Error in reactive attribute '${attr}':`, error), 'application');
            }
        };
        this._createReactiveUpdate(element, updateAttribute, subscriptions);
    }

    _setStaticAttribute(element, attr, value) {
        if (this.SKIP_ATTRS.has(attr)) return;
        if (typeof value === 'function') {
            if (attr === 'value' && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT')) {
                element.value = value(element);
                return;
            }
            console.warn(log.w(`Function value for attribute '${attr}' should be handled reactively`), 'application');
            return;
        }
        if (this.BOOLEAN_ATTRS.has(attr)) {
            if (value && value !== 'false') element.setAttribute(attr, '');
            else element.removeAttribute(attr);
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
        const dependencies = this.juris.stateManager.startTracking();
        const originalTracking = this.juris.stateManager.currentTracking;
        this.juris.stateManager.currentTracking = dependencies;
        try {
            updateFn(element);
        } catch (error) {
            console.error(log.e('Error capturing dependencies:', error), 'application');
        } finally {
            this.juris.stateManager.currentTracking = originalTracking;
        }
        const dependencyArray = Array.from(dependencies);
        for (let i = 0; i < dependencyArray.length; i++) {
            const path = dependencyArray[i];
            const unsubscribe = this.juris.stateManager.subscribeInternal(path, updateFn);
            subscriptions.push(unsubscribe);
        }
    }

    updateElementContent(element, newContent) {
        this._updateChildren(element, [newContent]);
    }

    setupIndicators(elementId, config) {
        this.placeholderConfigs.set(elementId, { ...this.defaultPlaceholder, ...config });
    }

    cleanup(element) {
        console.debug(log.d('Cleaning up element', { tagName: element.tagName, hasSubscriptions: this.subscriptions.has(element) }, 'framework'));
        this.juris.componentManager.cleanup(element);
        const data = this.subscriptions.get(element);
        if (data) {
            if (data.subscriptions) {
                for (let i = 0; i < data.subscriptions.length; i++) {
                    try {
                        data.subscriptions[i]();
                    } catch (error) {
                        console.warn(log.w('Error during subscription cleanup:', error), 'framework');
                    }
                }
            }
            if (data.eventListeners) {
                for (let i = 0; i < data.eventListeners.length; i++) {
                    const { eventName, handler } = data.eventListeners[i];
                    try {
                        element.removeEventListener(eventName, handler);
                    } catch (error) {
                        console.warn(log.w('Error during event listener cleanup:', error), 'framework');
                    }
                }
            }

            this.subscriptions.delete(element);
        }
        if (element._jurisKey) this.elementCache.delete(element._jurisKey);
        if (this.asyncPlaceholders.has(element)) this.asyncPlaceholders.delete(element);
        try {
            const children = element.children;
            for (let i = 0; i < children.length; i++) {
                try {
                    this.cleanup(children[i]);
                } catch (error) {
                    console.warn(log.w('Error cleaning up child element:', error), 'framework');
                }
            }
        } catch (error) {
            console.warn(log.w('Error during children cleanup:', error), 'framework');
        }
    }

    _generateKey(tagName, props) {
        if (props.key) return props.key;

        let key = tagName;

        for (let i = 0; i < this.KEY_PROPS.length; i++) {
            const prop = this.KEY_PROPS[i];
            if (props[prop] && typeof props[prop] !== 'function') {
                key += `|${prop}:${props[prop]}`;
            }
        }

        key += `|hash:${this._hashProps(props)}`;
        return key;
    }

    _hashProps(props) {
        const str = JSON.stringify(props, (key, value) => typeof value === 'function' ? '[function]' : value);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    _getRecycledElement(tagName) {
        const pool = this.recyclePool.get(tagName);
        if (pool?.length > 0) {
            const element = pool.pop();
            this._resetElement(element);
            return element;
        }
        return null;
    }

    _resetElement(element) {
        element.textContent = '';
        element.className = '';
        element.removeAttribute('style');
        const attrs = Array.from(element.attributes);
        for (let i = 0; i < attrs.length; i++) {
            const attr = attrs[i];
            if (!this.ATTRIBUTES_TO_KEEP.has(attr.name)) {
                element.removeAttribute(attr.name);
            }
        }
    }

    _canReuseElement(element, tagName, props) {
        return element.tagName.toLowerCase() === tagName.toLowerCase();
    }

    _updateElementProperties(element, props) {
        for (const key in props) {
            if (props.hasOwnProperty(key) && !['key', 'children', 'text', 'style'].includes(key)) {
                const value = props[key];
                if (typeof value !== 'function') {
                    this._setStaticAttribute(element, key, value);
                }
            }
        }
    }

    clearAsyncCache() {
        this.asyncCache.clear();
    }

    // Enhanced stats with CSS extraction info - NEW
    getAsyncStats() {
        return { 
            cachedAsyncProps: this.asyncCache.size,
            cachedCSS: this.cssCache.size,
            injectedCSS: this.injectedCSS.size
        };
    }

    // Clear CSS cache (for development) - NEW
    clearCSSCache() {
        this.cssCache.clear();
        this.injectedCSS.clear();            
        if (this.styleSheet) {
            try {
                this.styleSheet.ownerNode.remove();
            } catch (e) { /* ignore */ }
            this.styleSheet = null;
        }
    }

    // Get comprehensive stats - NEW
    getStats() {
        return {
            cssCache: this.cssCache.size,
            injectedCSS: this.injectedCSS.size,
            estimatedSubscriptions: this.cssCache.size * 2,
            elementCache: this.elementCache.size,
            recyclePoolSize: Array.from(this.recyclePool.values()).reduce((total, pool) => total + pool.length, 0),
            renderMode: this.renderMode,
            failureCount: this.failureCount
        };
    }
}

class TemplateCompiler {
    parseTemplate(template) {
        const name = template.getAttribute('data-component');
        const contextConfig = template.getAttribute('data-context');
        const content = template.content;
        const script = content.querySelector('script')?.textContent.trim() || '';
        const div = document.createElement('div');
        div.appendChild(content.cloneNode(true));
        div.querySelector('script')?.remove();
        const html = div.innerHTML.trim();
        return { name, script, html, contextConfig };
    }

    htmlToObject(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return this.convertElement(div.firstElementChild);
    }

    convertElement(element) {
        const obj = {};
        const tag = element.tagName.toLowerCase();
        obj[tag] = {};
        for (const attr of element.attributes) {
            let value = attr.value;
            if (value.startsWith('{') && value.endsWith('}')) {
                const expr = value.slice(1, -1);
                obj[tag][attr.name] = { __FUNCTION__: expr };
            } else {
                obj[tag][attr.name] = value;
            }
        }
        // Process children
        const children = Array.from(element.childNodes);
        const processedChildren = children
            .map(child => this.convertNode(child))
            .filter(child => child !== null);
        if (processedChildren.length === 1) {
            const child = processedChildren[0];
            if (child && child.__REACTIVE_CHILDREN__) {
                obj[tag].children = { __FUNCTION__: child.__REACTIVE_CHILDREN__ };
            } else if (child && child.__REACTIVE_TEXT__) {
                obj[tag].text = { __FUNCTION__: child.__REACTIVE_TEXT__ };
            } else if (typeof child === 'string') {
                obj[tag].text = child;
            } else if (child) {
                obj[tag].children = [child];
            }
        } else if (processedChildren.length > 0) {
            obj[tag].children = processedChildren;
        }
        return obj;
    }

    convertNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim();
            if (!text) return null;
            // Handle {children:()=>[...]} syntax
            const childrenMatch = text.match(/^\{children:(.+)\}$/s);
            if (childrenMatch) {
                return { __REACTIVE_CHILDREN__: childrenMatch[1] };
            }
            // Handle {text:()=>...} syntax
            const textMatch = text.match(/^\{text:(.+)\}$/s);
            if (textMatch) {
                return { __REACTIVE_TEXT__: textMatch[1] };
            }
            // Handle generic {expression} syntax for text
            const expressionMatch = text.match(/^\{(.+)\}$/s);
            if (expressionMatch) {
                return { __REACTIVE_TEXT__: expressionMatch[1] };
            }
            return text;
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
            return this.convertElement(node);
        }
        return null;
    }

    generateContextDestructuring(contextConfig) {
        if (!contextConfig) return '';
        // Parse the context configuration
        const contextVars = contextConfig.split(',').map(v => v.trim());
        // Generate destructuring assignment
        return `const { ${contextVars.join(', ')} } = context;`;
    }

    generateComponent(parsed) {
        const objStr = this.objectToString(this.htmlToObject(parsed.html));
        // Generate context destructuring if specified
        const contextDestructuring = this.generateContextDestructuring(parsed.contextConfig);
        // Combine context destructuring with user script
        const combinedScript = contextDestructuring ?
            `${contextDestructuring}\n${parsed.script}` :
            parsed.script;

        return `(props, context) => {
${combinedScript}
return ${objStr};
}`;
    }

    objectToString(obj, indent = 0) {
        const spaces = '  '.repeat(indent);
        if (obj && obj.__FUNCTION__) {
            return obj.__FUNCTION__;
        }
        if (typeof obj === 'string') {
            return `'${obj.replace(/'/g, "\\'")}'`;
        }
        if (typeof obj === 'number' || typeof obj === 'boolean') {
            return String(obj);
        }
        if (Array.isArray(obj)) {
            if (obj.length === 0) return '[]';
            const items = obj.map(item =>
                spaces + '  ' + this.objectToString(item, indent + 1)
            ).join(',\n');
            return '[\n' + items + '\n' + spaces + ']';
        }
        if (typeof obj === 'object' && obj !== null) {
            const keys = Object.keys(obj);
            if (keys.length === 0) return '{}';
            const pairs = keys.map(key => {
                const value = this.objectToString(obj[key], indent + 1);
                // Handle property names that need quotes
                const keyStr = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
                return spaces + '  ' + keyStr + ': ' + value;
            }).join(',\n');

            return '{\n' + pairs + '\n' + spaces + '}';
        }
        return 'null';
    }
}

// DOM Enhancer
// Complete Rewritten DOMEnhancer - Unified Observer System
// Maintains 100% backward compatibility while reducing complexity and improving performance

class DOMEnhancer {
    constructor(juris) {
        console.info(log.i('DOMEnhancer initialized', {}, 'framework'));
        this.juris = juris;
        this.enhancedElements = new WeakSet();
        this.containerEnhancements = new WeakMap();
        this.options = {
            debounceMs: 5,
            batchUpdates: true,
            observeSubtree: true,
            observeChildList: true,
            observeNewElements: true,                
            viewportAware: false,
            viewportMargin: '50px'
        };
        this.enhancementRegistry = new Map();
        this.unifiedObserver = null;
        this.observerRefCount = 0;
        this.pendingEnhancements = new Set();
        this.enhancementTimer = null;
        this.intersectionObserver = null;
        this.viewportElements = new WeakMap();
    }

    enhance(selectorOrElement, definition, options = {}) {
        if (typeof MutationObserver === 'undefined') {
            return () => {};
        }        
        const config = { ...this.options, ...options };         
        if (config.viewportAware) {
            return this._enhanceViewportAware(selectorOrElement, definition, config);
        }
        if (selectorOrElement instanceof Element) {
            if (this.enhancedElements.has(selectorOrElement)) return () => { };
            const enhancementType = this._determineEnhancementType('', definition);
            if (enhancementType === 'selectors') {
                this._enhanceContainer(selectorOrElement, definition, config);
            } else {
                this._enhanceElement(selectorOrElement, definition, config);
            }            
            return () => this._cleanupElement(selectorOrElement);
        }        
        const selector = selectorOrElement;
        const enhancementType = this._determineEnhancementType(selector, definition);                
        console.info(log.i('Enhancement registered', {
            selector,
            type: enhancementType,
            viewportAware: config.viewportAware,
            optionKeys: Object.keys(options)
        }, 'framework'));
        this.enhancementRegistry.set(selector, { definition, config, type: enhancementType });
        this._enhanceExistingElements(selector, definition, config, enhancementType);                
        if (config.observeNewElements !== false) {
            this._ensureUnifiedObserver(config);
            this.observerRefCount++;
        }
        return () => this._unenhance(selector);
    }

    _enhanceViewportAware(selectorOrElement, definition, config) {
        console.debug(log.d('Viewport-aware enhancement starting', {
            selector: typeof selectorOrElement === 'string' ? selectorOrElement : 'element',
            margin: config.viewportMargin
        }, 'framework'));
        // Following existing element vs selector handling pattern
        if (selectorOrElement instanceof Element) {
            this._setupViewportObserver(config);
            this._observeElementForViewport(selectorOrElement, definition, config);
            return () => this._cleanupViewportElement(selectorOrElement);
        }
        const selector = selectorOrElement;
        const elements = document.querySelectorAll(selector);            
        this._setupViewportObserver(config);            
        elements.forEach(element => {
            this._observeElementForViewport(element, definition, config);
        });
        return () => {
            elements.forEach(element => this._cleanupViewportElement(element));
            this._cleanupViewportObserver();
        };
    }

    _determineEnhancementType(selector, definition) {
        if (this._hasSelectorsCategory(definition)) return 'selectors';
        if (typeof selector === 'string' && /^#[a-zA-Z][\w-]*$/.test(selector)) return 'id';
        return 'simple';
    }

    _hasSelectorsCategory(definition) {
        if (definition?.selectors) return true;
        if (typeof definition === 'function') {
            try {
                const result = definition(this.juris.createContext());
                return result?.selectors;
            } catch (error) {
                return false;
            }
        }
        return false;
    }

    _setupViewportObserver(config) {
        if (this.intersectionObserver) return;
        this.intersectionObserver = new IntersectionObserver(entries => {
            if (config.debounceMs > 0) {
                this._debouncedProcessViewportChanges(entries);
            } else {
                this._processViewportChanges(entries);
            }
        }, {
            root: null,
            rootMargin: config.viewportMargin,
            threshold: 0
        });
        console.debug(log.d('IntersectionObserver created', {margin: config.viewportMargin}, 'framework'));
    }

    _processViewportChanges(entries) {
        entries.forEach(entry => {
            const element = entry.target;
            const viewportData = this.viewportElements.get(element);
            
            if (!viewportData) return;

            console.debug(log.d('Viewport visibility changed', {
                element: element.tagName,
                isVisible: entry.isIntersecting
            }, 'framework'));

            if (entry.isIntersecting) {
                this._enhanceElement(element, viewportData.definition, viewportData.config);
            } else {
                this._cleanupElement(element);
                if (viewportData.minimal) {
                    this._enhanceElement(element, viewportData.minimal, viewportData.config);
                }
            }
        });
    }

    _debouncedProcessViewportChanges(entries) {
        entries.forEach(entry => {
            this.pendingEnhancements.add({
                entry,
                timestamp: Date.now(),
                type: 'viewport'
            });
        });
        if (this.enhancementTimer) clearTimeout(this.enhancementTimer);
        this.enhancementTimer = setTimeout(() => {
            this._processPendingViewportChanges();
            this.enhancementTimer = null;
        }, this.options.debounceMs);
    }
    _processPendingViewportChanges() {
        const viewportChanges = Array.from(this.pendingEnhancements)
            .filter(item => item.type === 'viewport')
            .map(item => item.entry);
        this.pendingEnhancements = new Set(
            Array.from(this.pendingEnhancements).filter(item => item.type !== 'viewport')
        );
        
        this._processViewportChanges(viewportChanges);
    }

    _observeElementForViewport(element, definition, config) {
        // Following existing element data storage pattern (like componentStates)
        const minimal = config.minimal || this._createMinimalDefinition(definition);
        
        this.viewportElements.set(element, {
            definition,
            config,
            minimal
        });

        this.intersectionObserver.observe(element);

        // Following existing initial state handling pattern
        const rect = element.getBoundingClientRect();
        const isInitiallyVisible = (
            rect.top < window.innerHeight &&
            rect.bottom > 0 &&
            rect.left < window.innerWidth &&
            rect.right > 0
        );

        if (isInitiallyVisible) {
            this._enhanceElement(element, definition, config);
        } else if (minimal) {
            this._enhanceElement(element, minimal, config);
        }
    }
    _createMinimalDefinition(definition) {
        // Following existing property checking pattern
        if (typeof definition !== 'object' || !definition) return null;

        const minimal = {};

        // Following existing style handling pattern
        if (definition.style) {
            minimal.style = {};
            // Preserve layout-affecting properties
            const layoutProps = ['height', 'width', 'display', 'position'];
            layoutProps.forEach(prop => {
                if (definition.style[prop]) {
                    minimal.style[prop] = definition.style[prop];
                }
            });
        }

        // Following existing className preservation pattern
        if (definition.className) {
            minimal.className = definition.className;
        }

        return Object.keys(minimal).length > 0 ? minimal : null;
    }

    _cleanupViewportElement(element) {
        if (this.intersectionObserver) {
            this.intersectionObserver.unobserve(element);
        }
        
        this.viewportElements.delete(element);
        this._cleanupElement(element);
    }
    _cleanupViewportObserver() {
        if (this.intersectionObserver && this.viewportElements.size === 0) {
            this.intersectionObserver.disconnect();
            this.intersectionObserver = null;
            console.debug(log.d('IntersectionObserver disconnected', {}, 'framework'));
        }
    }
    _enhanceExistingElements(selector, definition, config, type) {
        if (type === 'selectors') {
            this._enhanceExistingContainers(selector, definition, config);
        } else {
            const elements = document.querySelectorAll(selector);
            if (config.batchUpdates && elements.length > 1) {
                this._batchEnhanceElements(Array.from(elements), definition, config);
            } else {
                elements.forEach(element => this._enhanceElement(element, definition, config));
            }
        }
    }

    _enhanceExistingContainers(containerSelector, definition, config) {
        document.querySelectorAll(containerSelector).forEach(container =>
            this._enhanceContainer(container, definition, config)
        );
    }

    _batchEnhanceElements(elements, definition, config) {
        elements.filter(element => !this.enhancedElements.has(element))
            .forEach(element => this._enhanceElement(element, definition, config));
    }

    _ensureUnifiedObserver(config) {
        if (!this.unifiedObserver) {
            this.unifiedObserver = new MutationObserver(mutations => {
                if (config.debounceMs > 0) {
                    this._debouncedProcessMutations(mutations);
                } else {
                    this._processUnifiedMutations(mutations);
                }
            });
            this.unifiedObserver.observe(document.body, {
                childList: config.observeChildList,
                subtree: config.observeSubtree
            });
        }
    }

    _processUnifiedMutations(mutations) {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        this._processNodeForAllEnhancements(node);
                    }
                });
            }
        });
    }

    _processNodeForAllEnhancements(node) {
        this.enhancementRegistry.forEach(({ definition, config, type }, selector) => {
            try {
                switch (type) {
                    case 'id':
                        this._processIdEnhancement(node, selector, definition, config);
                        break;
                    case 'simple':
                        this._processSimpleEnhancement(node, selector, definition, config);
                        break;
                    case 'selectors':
                        this._processSelectorsEnhancement(node, selector, definition, config);
                        break;
                }
            } catch (error) {
                console.error(log.e('Error processing enhancement:', error), 'framework');
            }
        });
    }

    _processIdEnhancement(node, selector, definition, config) {
        const id = selector.slice(1); // Remove # prefix
        if (node.id === id) {
            this._enhanceElement(node, definition, config);
        } else if (node.querySelector) {
            const found = node.querySelector(selector);
            if (found) this._enhanceElement(found, definition, config);
        }
    }

    _processSimpleEnhancement(node, selector, definition, config) {
        if (node.matches && node.matches(selector)) {
            this._enhanceElement(node, definition, config);
        }
        if (node.querySelectorAll) {
            node.querySelectorAll(selector).forEach(element => {
                this._enhanceElement(element, definition, config);
            });
        }
    }

    _processSelectorsEnhancement(node, selector, definition, config) {
        if (node.matches && node.matches(selector)) {
            this._enhanceContainer(node, definition, config);
        }
        if (node.querySelectorAll) {
            node.querySelectorAll(selector).forEach(container => {
                this._enhanceContainer(container, definition, config);
            });
        }
        this._enhanceNewElementsInContainers(node);
    }

    _debouncedProcessMutations(mutations) {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        this.pendingEnhancements.add({
                            node,
                            timestamp: Date.now(),
                            type: 'unified'
                        });
                    }
                });
            }
        });

        if (this.enhancementTimer) clearTimeout(this.enhancementTimer);
        this.enhancementTimer = setTimeout(() => {
            this._processPendingEnhancements();
            this.enhancementTimer = null;
        }, this.options.debounceMs);
    }

    _processPendingEnhancements() {
        const enhancements = Array.from(this.pendingEnhancements);
        this.pendingEnhancements.clear();
        enhancements.forEach(({ node }) => {
            this._processNodeForAllEnhancements(node);
        });
    }

    _enhanceNewElementsInContainers(node) {
        document.querySelectorAll('[data-juris-enhanced-container]').forEach(container => {
            if (!container.contains(node)) return;
            const containerData = this.containerEnhancements.get(container);
            if (!containerData) return;
            containerData.forEach((selectorData, selector) => {
                const { definition, enhancedElements } = selectorData;
                if (node.matches && node.matches(selector)) {
                    this._enhanceSelectorElement(node, definition, container, selector);
                    enhancedElements.add(node);
                }
                if (node.querySelectorAll) {
                    node.querySelectorAll(selector).forEach(element => {
                        if (!this.enhancedElements.has(element)) {
                            this._enhanceSelectorElement(element, definition, container, selector);
                            enhancedElements.add(element);
                        }
                    });
                }
            });
        });
    }

    _enhanceContainer(container, definition, config) {
        if (this.enhancedElements.has(container)) return;
        try {
            this.enhancedElements.add(container);
            container.setAttribute('data-juris-enhanced', Date.now());
            let actualDefinition = definition;
            if (typeof definition === 'function') {
                const context = this.juris.createContext(container);
                actualDefinition = definition(context);
            }
            if (!actualDefinition?.selectors) {
                console.warn(log.w('Selectors enhancement must have a "selectors" property'), 'framework');
                return;
            }
            const containerData = new Map();
            this.containerEnhancements.set(container, containerData);
            this._applyContainerProperties(container, actualDefinition);
            Object.entries(actualDefinition.selectors).forEach(([selector, selectorDefinition]) => {
                this._enhanceSelector(container, selector, selectorDefinition, containerData, config);
            });
        } catch (error) {
            console.error(log.e('Error enhancing container:', error), 'application');
            this.enhancedElements.delete(container);
        }
    }

    _applyContainerProperties(container, definition) {
        const containerProps = { ...definition };
        delete containerProps.selectors;
        if (Object.keys(containerProps).length > 0) {
            this._applyEnhancements(container, containerProps);
        }
    }

    _enhanceSelector(container, selector, definition, containerData, config) {
        const elements = container.querySelectorAll(selector);
        const enhancedElements = new Set();
        elements.forEach(element => {
            if (!this.enhancedElements.has(element)) {
                this._enhanceSelectorElement(element, definition, container, selector);
                enhancedElements.add(element);
            }
        });
        containerData.set(selector, { definition, enhancedElements });
    }

    _enhanceSelectorElement(element, definition, container, selector) {
        try {
            this.enhancedElements.add(element);
            element.setAttribute('data-juris-enhanced-selector', Date.now());
            let actualDefinition = definition;
            if (typeof definition === 'function') {
                const context = this.juris.createContext(element);
                actualDefinition = definition(context);
                if (!actualDefinition || typeof actualDefinition !== 'object') {
                    console.warn(log.w(`Selector '${selector}' function must return a definition object`), 'framework');
                    this.enhancedElements.delete(element);
                    return;
                }
            }
            const processedDefinition = this._processElementAwareFunctions(element, actualDefinition);
            this._applyEnhancements(element, processedDefinition);
        } catch (error) {
            console.error(log.e('Error enhancing selector element:', error), 'application');
            this.enhancedElements.delete(element);
        }
    }

    _processElementAwareFunctions(element, definition) {
        const processed = {};
        Object.entries(definition).forEach(([key, value]) => {
            if (typeof value === 'function') {
                if (key.startsWith('on')) {
                    processed[key] = value;
                } else if (value.length > 0) {
                    try {
                        const context = this.juris.createContext(element);
                        const result = value(context);
                        processed[key] = result && typeof result === 'object' ? result : value;
                    } catch (error) {
                        console.warn(log.w(`Error processing element-aware function '${key}':`, error), 'framework');
                        processed[key] = value;
                    }
                } else {
                    processed[key] = value;
                }
            } else {
                processed[key] = value;
            }
        });
        return processed;
    }

    _enhanceElement(element, definition, config) {
        if (this.enhancedElements.has(element)) {
            console.debug(log.d('Element already enhanced', { tagName: element.tagName }, 'framework'));
            return;
        }
        try {
            console.debug(log.d('Enhancing element', { tagName: element.tagName, definitionKeys: Object.keys(definition) }, 'framework'));
            this.enhancedElements.add(element);
            element.setAttribute('data-juris-enhanced', Date.now());
            let actualDefinition = definition;
            if (typeof definition === 'function') {
                const context = this.juris.createContext(element);
                actualDefinition = definition(context);
                if (!actualDefinition || typeof actualDefinition !== 'object') {
                    console.warn(log.w('Enhancement function must return a definition object'), 'framework');
                    this.enhancedElements.delete(element);
                    return;
                }
            }
            this._applyEnhancements(element, actualDefinition);
            config.onEnhanced?.(element, this.juris.createContext(element));
        } catch (error) {
            console.error(log.e('Element enhancement failed', {
                tagName: element.tagName,
                error: error.message
            }, 'framework'));
            this.enhancedElements.delete(element);
        }
    }

    _applyEnhancements(element, definition) {
        const subscriptions = [], eventListeners = [];
        const renderer = this.juris.domRenderer;
        Object.keys(definition).forEach(key => {
            const value = definition[key];
            try {
                if (key === 'children') {
                    this._handleChildren(element, value, subscriptions, renderer);
                } else if (key === 'text') {
                    renderer._handleText(element, value, subscriptions);
                } else if (key === 'innerHTML') {
                    this._handleInnerHTML(element, value, subscriptions, renderer);
                } else if (key === 'style') {
                    renderer._handleStyle(element, value, subscriptions);
                } else if (key.startsWith('on')) {
                    renderer._handleEvent(element, key, value, eventListeners);
                } else if (typeof value === 'function') {
                    renderer._handleReactiveAttribute(element, key, value, subscriptions);
                } else {
                    renderer._setStaticAttribute(element, key, value);
                }
            } catch (error) {
                console.error(log.e(`Error processing enhancement property '${key}':`, error), 'framework');
            }
        });
        if (subscriptions.length > 0 || eventListeners.length > 0) {
            this.juris.domRenderer.subscriptions.set(element, { subscriptions, eventListeners });
        }
    }

    _handleChildren(element, children, subscriptions, renderer) {
        if (renderer.isFineGrained()) {
            renderer._handleChildrenFineGrained(element, children, subscriptions);
        } else {
            renderer._handleChildrenOptimized(element, children, subscriptions);
        }
    }

    _handleInnerHTML(element, innerHTML, subscriptions, renderer) {
        if (typeof innerHTML === 'function') {
            renderer._handleReactiveAttribute(element, 'innerHTML', innerHTML, subscriptions);
        } else {
            element.innerHTML = innerHTML;
        }
    }

    _unenhance(selector) {
        const enhancement = this.enhancementRegistry.get(selector);
        if (!enhancement) return;
        // Cleanup observer reference
        this.observerRefCount--;
        if (this.observerRefCount === 0 && this.unifiedObserver) {
            this.unifiedObserver.disconnect();
            this.unifiedObserver = null;
        }
        // Remove from registry
        this.enhancementRegistry.delete(selector);
        // Clean up enhanced elements
        if (enhancement.type === 'selectors') {
            document.querySelectorAll(`${selector}[data-juris-enhanced-container]`).forEach(container => {
                this._cleanupContainer(container);
            });
        } else {
            document.querySelectorAll(`${selector}[data-juris-enhanced]`).forEach(element => {
                this._cleanupElement(element);
            });
        }
    }

    _cleanupContainer(container) {
        const containerData = this.containerEnhancements.get(container);
        if (containerData) {
            containerData.forEach(selectorData => {
                selectorData.enhancedElements.forEach(element => this._cleanupElement(element));
            });
            this.containerEnhancements.delete(container);
        }
        this._cleanupElement(container);
        container.removeAttribute('data-juris-enhanced-container');
    }

    _cleanupElement(element) {
        this.juris.domRenderer.cleanup(element);
        this.enhancedElements.delete(element);
        element.removeAttribute('data-juris-enhanced');
        element.removeAttribute('data-juris-enhanced-selector');
    }

    configure(options) {
        Object.assign(this.options, options);
    }

    getStats() {
        const enhancedElements = document.querySelectorAll('[data-juris-enhanced]').length;
        const enhancedContainers = document.querySelectorAll('[data-juris-enhanced-container]').length;
        const enhancedSelectors = document.querySelectorAll('[data-juris-enhanced-selector]').length;            
        return {
            enhancementRules: this.enhancementRegistry.size,
            activeObserver: this.unifiedObserver ? 1 : 0,
            activeIntersectionObserver: this.intersectionObserver ? 1 : 0, // NEW
            observerRefCount: this.observerRefCount,
            pendingEnhancements: this.pendingEnhancements.size,
            viewportElements: this.viewportElements.size || 0, // NEW
            enhancedElements,
            enhancedContainers,
            enhancedSelectors,
            totalEnhanced: enhancedElements + enhancedSelectors
        };
    }

    destroy() {
        // Existing cleanup
        if (this.unifiedObserver) {
            this.unifiedObserver.disconnect();
            this.unifiedObserver = null;
        }
        this.enhancementRegistry.clear();
        this.observerRefCount = 0;
        if (this.enhancementTimer) {
            clearTimeout(this.enhancementTimer);
            this.enhancementTimer = null;
        }
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
            this.intersectionObserver = null;
        }
        this.viewportElements = new WeakMap();
        // Existing element cleanup
        document.querySelectorAll('[data-juris-enhanced], [data-juris-enhanced-selector]').forEach(element => {
            this._cleanupElement(element);
        });
        document.querySelectorAll('[data-juris-enhanced-container]').forEach(container => {
            this._cleanupContainer(container);
        });
        this.pendingEnhancements.clear();
    }
}

class WebComponentFactory {
    constructor(jurisInstance) {
        this.juris = jurisInstance;
    }

    create(name, componentDefinition, options = {}) {
        console.info(log.i('Creating WebComponent', { name, hasOptions: Object.keys(options).length > 0 }, 'framework'));
        if (!name.includes('-')) {
            throw new Error(`WebComponent name "${name}" must contain a hyphen (-)`);
        }
        if (customElements.get(name)) {
            console.warn(log.w('WebComponent already registered', { name }, 'framework'));
            return customElements.get(name);
        }
        const WebComponentClass = this._createWebComponentClass(name, componentDefinition, options);
        customElements.define(name, WebComponentClass);
        console.info(log.i('WebComponent registered', { name, className: WebComponentClass.name }, 'framework'));
        return WebComponentClass;
    }

    createMultiple(components, globalOptions = {}) {
        const registeredComponents = {};
        Object.entries(components).forEach(([name, definition]) => {
            const options = definition.options ?
                { ...globalOptions, ...definition.options } :
                globalOptions;
            const componentFn = definition.component || definition.render || definition;
            registeredComponents[name] = this.create(name, componentFn, options);
        });
        return registeredComponents;
    }

    _createWebComponentClass(name, componentDefinition, options) {
        const jurisInstance = this.juris;
        const {
            shadowMode = 'open',
            attributes = [],
            styles = '',
            enhanceMode = false,
            autoConnect = true,
            stateNamespace = null,
            contextProvider = null
        } = options;

        return class JurisWebComponent extends HTMLElement {
            static get observedAttributes() {
                return attributes;
            }

            constructor() {
                super();
                this.componentName = name;
                this.componentId = `${name}-${Math.random().toString(36).substr(2, 9)}`;
                this.isJurisComponent = true;
                this._mounted = false;
                this._unsubscribes = [];
                
                if (typeof componentDefinition === 'function') {
                    this.componentFn = componentDefinition;
                } else if (typeof componentDefinition === 'object') {
                    this.componentConfig = componentDefinition;
                    this.componentFn = componentDefinition.render || componentDefinition.component;
                }
                console.debug(log.d('WebComponent instance created', { name, componentId: this.componentId }, 'framework'));
            }

            connectedCallback() {
                if (!autoConnect) return;
                console.debug(log.d('WebComponent connecting', { name, componentId: this.componentId }, 'framework'));
                this._setupShadowDOM();
                this._setupJurisIntegration();
                this._setupAttributes();
                this._setupStyles();

                if (this.componentConfig?.hooks?.onConnect) {
                    this.componentConfig.hooks.onConnect.call(this, this.jurisContext);
                }
                this.render();
                this._mounted = true;
                if (this.componentConfig?.hooks?.onMount) {
                    requestAnimationFrame(() => {
                        this.componentConfig.hooks.onMount.call(this, this.jurisContext);
                    });
                }
            }

            disconnectedCallback() {
                console.debug(log.d('WebComponent disconnecting', { name, componentId: this.componentId }, 'framework'));
                this._mounted = false;
                this._unsubscribes.forEach(unsubscribe => {
                    try { unsubscribe(); } catch (error) {
                        console.warn(log.w('Error during subscription cleanup:', error), 'framework');
                    }
                });
                this._unsubscribes = [];
                if (this.componentConfig?.hooks?.onUnmount) {
                    this.componentConfig.hooks.onUnmount.call(this, this.jurisContext);
                }
                if (this.stateKey && options.cleanupState !== false) {
                    jurisInstance.stateManager.setState(this.stateKey, undefined);
                }
            }

            attributeChangedCallback(name, oldValue, newValue) {
                if (oldValue !== newValue && this._mounted) {
                    console.debug(log.d('Attribute changed', { name, oldValue, newValue }, 'framework'));
                    if (this.stateKey) {
                        const currentState = jurisInstance.getState(this.stateKey, {});
                        jurisInstance.setState(this.stateKey, {
                            ...currentState,
                            [name]: this._parseAttributeValue(newValue)
                        });
                    }
                    if (this.componentConfig?.hooks?.onAttributeChange) {
                        this.componentConfig.hooks.onAttributeChange.call(this, name, oldValue, newValue, this.jurisContext);
                    }
                    if (options.rerenderOnAttributeChange !== false) {
                        this.render();
                    }
                }
            }

            _setupShadowDOM() {
                if (!enhanceMode) {
                    this.attachShadow({ mode: shadowMode });
                    this.renderRoot = this.shadowRoot;
                } else {
                    this.renderRoot = this;
                }
            }

            _setupJurisIntegration() {
                this.stateKey = stateNamespace || `webcomponents.${name.replace(/-/g, '_')}.${this.componentId}`;
                const initialState = this._getInitialState();
                jurisInstance.setState(this.stateKey, initialState);
                this.jurisContext = this._createJurisContext();
                const unsubscribe = jurisInstance.subscribe(this.stateKey, () => {
                    if (this._mounted && options.autoRerender !== false) {
                        console.debug(log.d('Auto re-rendering due to state change', { componentId: this.componentId }, 'framework'));
                        this.render();
                    }
                });
                this._unsubscribes.push(unsubscribe);
            }

            _createJurisContext() {
                const baseContext = contextProvider ?
                    contextProvider.call(this, jurisInstance.createContext(this)) :
                    jurisInstance.createContext(this);
                return {
                    ...baseContext,
                    component: {
                        name: this.componentName,
                        id: this.componentId,
                        element: this,
                        renderRoot: this.renderRoot,
                        shadowRoot: this.shadowRoot,
                        getState: (key, defaultValue) => {
                            const fullKey = key ? `${this.stateKey}.${key}` : this.stateKey;
                            return jurisInstance.getState(fullKey, defaultValue);
                        },
                        setState: (key, value) => {
                            if (typeof key === 'object') {
                                const currentState = jurisInstance.getState(this.stateKey, {});
                                jurisInstance.setState(this.stateKey, { ...currentState, ...key });
                            } else {
                                const fullKey = key ? `${this.stateKey}.${key}` : this.stateKey;
                                jurisInstance.setState(fullKey, value);
                            }
                        },
                        updateState: (updates) => {
                            const currentState = jurisInstance.getState(this.stateKey, {});
                            jurisInstance.setState(this.stateKey, { ...currentState, ...updates });
                        },
                        getAttribute: (name, defaultValue = null) => {
                            return this.getAttribute(name) || defaultValue;
                        },
                        setAttribute: (name, value) => {
                            this.setAttribute(name, value);
                        },
                        emit: (eventName, detail = {}, options = {}) => {
                            const event = new CustomEvent(eventName, {
                                detail,
                                bubbles: true,
                                composed: true,
                                ...options
                            });
                            this.dispatchEvent(event);
                            return event;
                        },
                        getSlot: (name = '') => {
                            return name ?
                                this.querySelector(`[slot="${name}"]`) :
                                this.querySelector(':not([slot])');
                        },
                        getAllSlots: () => {
                            const slots = {};
                            this.querySelectorAll('[slot]').forEach(el => {
                                const slotName = el.getAttribute('slot');
                                if (!slots[slotName]) slots[slotName] = [];
                                slots[slotName].push(el);
                            });
                            return slots;
                        },
                        onMount: (callback) => {
                            if (this._mounted) {
                                callback.call(this, this.jurisContext);
                            } else {
                                this._onMountCallbacks = this._onMountCallbacks || [];
                                this._onMountCallbacks.push(callback);
                            }
                        },
                        onUnmount: (callback) => {
                            this._onUnmountCallbacks = this._onUnmountCallbacks || [];
                            this._onUnmountCallbacks.push(callback);
                        }
                    }
                };
            }

            _getInitialState() {
                let initialState = {};
                if (this.componentConfig?.initialState) {
                    if (typeof this.componentConfig.initialState === 'function') {
                        initialState = this.componentConfig.initialState.call(this);
                    } else {
                        initialState = { ...this.componentConfig.initialState };
                    }
                }
                if (this.componentFn?.getInitialState) {
                    initialState = { ...initialState, ...this.componentFn.getInitialState.call(this) };
                }
                attributes.forEach(attr => {
                    if (this.hasAttribute(attr)) {
                        initialState[attr] = this._parseAttributeValue(this.getAttribute(attr));
                    }
                });
                return initialState;
            }

            _setupAttributes() {
                attributes.forEach(attr => {
                    if (this.hasAttribute(attr)) {
                        const value = this._parseAttributeValue(this.getAttribute(attr));
                        this.jurisContext.component.setState(attr, value);
                    }
                });
            }

            _setupStyles() {
                if (styles && this.shadowRoot) {
                    const styleElement = document.createElement('style');
                    styleElement.textContent = styles;
                    this.shadowRoot.appendChild(styleElement);
                }
            }

            _parseAttributeValue(value) {
                if (value === null || value === undefined) return value;
                if (value === 'true') return true;
                if (value === 'false') return false;
                if (value === '') return true; // Boolean attribute
                if (!isNaN(value) && !isNaN(parseFloat(value))) return parseFloat(value);
                try {
                    return JSON.parse(value);
                } catch {
                    return value;
                }
            }

            render() {
                try {
                    console.debug(log.d('Rendering WebComponent', { componentId: this.componentId }, 'framework'));
                    let vdom;
                    if (this.componentFn) {
                        vdom = this.componentFn.call(this, this._getProps(), this.jurisContext);
                    } else if (this.componentConfig?.template) {
                        vdom = this.componentConfig.template.call(this, this._getProps(), this.jurisContext);
                    } else {
                        console.warn(log.w('No render method found for WebComponent', { name }, 'framework'));
                        return;
                    }
                    if (vdom?.then) {
                        this._handleAsyncRender(vdom);
                        return;
                    }
                    if (vdom) {
                        const element = jurisInstance.objectToHtml(vdom);
                        this.renderRoot.innerHTML = '';
                        if (this.shadowRoot && styles) {
                            const styleElement = document.createElement('style');
                            styleElement.textContent = styles;
                            this.renderRoot.appendChild(styleElement);
                        }
                        this.renderRoot.appendChild(element);
                    }
                } catch (error) {
                    console.error(log.e('WebComponent render error', {
                        name,
                        componentId: this.componentId,
                        error: error.message
                    }, 'framework'));
                    this._renderError(error);
                }
            }

            _handleAsyncRender(vdomPromise) {
                this.renderRoot.innerHTML = '<div class="juris-loading">Loading...</div>';
                jurisInstance.promisify(vdomPromise)
                    .then(vdom => {
                        if (this._mounted) {
                            const element = jurisInstance.objectToHtml(vdom);
                            this.renderRoot.innerHTML = '';
                            this.renderRoot.appendChild(element);
                        }
                    })
                    .catch(error => {
                        console.error(log.e('Async render error', { error: error.message }, 'framework'));
                        this._renderError(error);
                    });
            }

            _renderError(error) {
                const errorElement = document.createElement('div');
                errorElement.style.cssText = 'color: red; padding: 10px; border: 1px solid red; background: #fee;';
                errorElement.textContent = `Component Error: ${error.message}`;
                this.renderRoot.innerHTML = '';
                this.renderRoot.appendChild(errorElement);
            }

            _getProps() {
                const props = {};
                attributes.forEach(attr => {
                    if (this.hasAttribute(attr)) {
                        props[attr] = this._parseAttributeValue(this.getAttribute(attr));
                    }
                });
                const state = jurisInstance.getState(this.stateKey, {});
                Object.assign(props, state);
                return props;
            }

            forceRender() {
                this.render();
            }

            getJurisContext() {
                return this.jurisContext;
            }

            getComponentState() {
                return jurisInstance.getState(this.stateKey, {});
            }

            updateComponentState(updates) {
                this.jurisContext.component.updateState(updates);
            }
        };
    }
}

    // Main Juris Class
    class Juris {
        static _inGlobal = false;
        constructor(config = {}) {
            if (config.logLevel) {
                this.setupLogging(config.logLevel);
            }
            console.info(log.i('Juris framework initializing', { hasServices: !!config.services, hasLayout: !!config.layout, hasStates: !!config.states, hasComponents: !!config.components, renderMode: config.renderMode || 'auto' }, 'framework'));
            this.services = config.services || {};
            this.layout = config.layout;
            this.stateManager = new StateManager(config.states || {}, config.middleware || []);
            this.headlessManager = new HeadlessManager(this);
            this.componentManager = new ComponentManager(this);
            this.domRenderer = new DOMRenderer(this);
            this.domRenderer.cssExtraction = config.cssExtraction!==undefined?config.cssExtraction:false;
            this.domEnhancer = new DOMEnhancer(this);
            this.templateCompiler = new TemplateCompiler();
            this.webComponentFactory = new WebComponentFactory(this);
            this.headlessAPIs = {};
            if (config.autoCompileTemplates !== false) {
                this.compileTemplates();
            }
            if (config.headlessComponents) {
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
            this.headlessManager.initializeQueued();
            if (config.renderMode === 'fine-grained') this.domRenderer.setRenderMode('fine-grained');
            else if (config.renderMode === 'batch') this.domRenderer.setRenderMode('batch');
            if (config.components) {
                Object.entries(config.components).forEach(([name, component]) => {
                    this.componentManager.register(name, component);
                });
            }
            console.info(log.i('Juris framework initialized', { componentsCount: this.componentManager.components.size, headlessCount: this.headlessManager.components.size }, 'framework'));


            //polyfill to support mobile
            if (typeof requestIdleCallback === 'undefined') { window.requestIdleCallback = function (callback, options) { const start = Date.now(); return setTimeout(function () { callback({ didTimeout: false, timeRemaining: function () { return Math.max(0, 50 - (Date.now() - start)); } }); }, 1); }; }
        }

    _detectGlobalAndWarn() {
        if (!Juris._done) { (requestIdleCallback || setTimeout)(() => { if (Juris._inGlobal) return; Juris._inGlobal = true; for (let key in globalThis) { if (globalThis[key] instanceof Juris) { console.warn(`⚠️ JURIS GLOBAL: '${key}'`); } } }); }
    }

    compileTemplates() {
        const templates = document.querySelectorAll('template[data-component]');
        const components = {};
        templates.forEach(template => {
            const parsed = this.templateCompiler.parseTemplate(template);
            const componentCode = this.templateCompiler.generateComponent(parsed);
            components[parsed.name] = eval(`(${componentCode})`);
        });
        // 2. Register components
        Object.entries(components).forEach(([name, component]) => {
            this.registerComponent(name, component);
        });
    }

    setupLogging(level) {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        const currentLevel = levels[level] || 1;
        if (currentLevel > 0) {
            console.debug = () => { }; // Disable debug in production
        }
        if (currentLevel > 1) {
            console.log('Juris logging initialized at level:', level);
            console.log('To change log level, use juris.setupLogging("newLevel") or set logLevel in config');
            console.log = () => { }; // Disable log in production
            console.info = () => { }; // Disable info in production
        }
    }

    setupIndicators(elementId, config) {
        this.domRenderer.setupIndicators(elementId, config);
    }

    createHeadlessContext(element = null) {
        const context = {
            getState: (path, defaultValue, track) => this.stateManager.getState(path, defaultValue, track),
            setState: (path, value, context) => this.stateManager.setState(path, value, context),
            executeBatch: (callback) => this.executeBatch(callback),
            subscribe: (path, callback) => this.stateManager.subscribe(path, callback),
            services: this.services,
            ...(this.services || {}),
            headless: this.headlessManager.context,
            isSSR: typeof MutationObserver === 'undefined',
            ...(this.headlessAPIs || {}),
            components: {
                register: (name, component) => this.componentManager.register(name, component),
                registerHeadless: (name, component, options) => this.headlessManager.register(name, component, options),
                get: name => this.componentManager.components.get(name),
                getHeadless: name => this.headlessManager.getInstance(name),
                initHeadless: (name, props) => this.headlessManager.initialize(name, props),
                reinitHeadless: (name, props) => this.headlessManager.reinitialize(name, props)
            },
            utils: {
                render: container => this.render(container),
                cleanup: () => this.cleanup(),
                forceRender: () => this.render(),
                getHeadlessStatus: () => this.headlessManager.getStatus(),
            },
            juris: this,
            logger: {
                log: log, lwarn: log.w, error: log.e, info: log.i, debug: log.d, subscribe: logSub, unsubscribe: logUnsub
            }
        };

        if (element) context.element = element;
        return context;
    }

    executeBatch(callback) {
        return this.stateManager.executeBatch(callback);
    }

    createWebComponent(name, componentDefinition, options = {}) {
        return this.webComponentFactory.create(name, componentDefinition, options);
    }

    createWebComponents(components, globalOptions = {}) {
        return this.webComponentFactory.createMultiple(components, globalOptions);
    }

    createContext(element = null) {
        const context = {
            getState: (path, defaultValue, track) => this.stateManager.getState(path, defaultValue, track),
            setState: (path, value, context) => this.stateManager.setState(path, value, context),
            executeBatch: (callback) => this.executeBatch(callback),
            subscribe: (path, callback) => this.stateManager.subscribe(path, callback),
            services: this.services,
            ...(this.services || {}),
            ...(this.headlessAPIs || {}),
            headless: this.headlessManager.context,
            isSSR: typeof window === 'undefined',
            components: {
                register: (name, component) => this.componentManager.register(name, component),
                registerHeadless: (name, component, options) => this.headlessManager.register(name, component, options),
                get: name => this.componentManager.components.get(name),
                getHeadless: name => this.headlessManager.getInstance(name),
                initHeadless: (name, props) => this.headlessManager.initialize(name, props),
                reinitHeadless: (name, props) => this.headlessManager.reinitialize(name, props),
                getHeadlessAPI: name => this.headlessManager.getAPI(name),
                getAllHeadlessAPIs: () => this.headlessManager.getAllAPIs()
            },
            utils: {
                render: container => this.render(container),
                cleanup: () => this.cleanup(),
                forceRender: () => this.render(),
                setRenderMode: mode => this.setRenderMode(mode),
                getRenderMode: () => this.getRenderMode(),
                isFineGrained: () => this.isFineGrained(),
                isBatchMode: () => this.isBatchMode(),
                getHeadlessStatus: () => this.headlessManager.getStatus(),
                objectToHtml: (vnode) => this.objectToHtml(vnode)
            },
            objectToHtml: (vnode) => this.objectToHtml(vnode),
            setupIndicators: (elementId, config) => this.setupIndicators(elementId, config),
            juris: this,
            logger: {
                log: log, lwarn: log.w, error: log.e, info: log.i, debug: log.d, subscribe: logSub, unsubscribe: logUnsub
            }
        };
        if (element) context.element = element;
        return context;
    }
    // Public API
    getState(path, defaultValue, track) { return this.stateManager.getState(path, defaultValue, track); }
    setState(path, value, context) {
        console.debug(log.d('Public setState called', { path }, 'application'));
        return this.stateManager.setState(path, value, context);
    }
    subscribe(path, callback, hierarchical = true) { return this.stateManager.subscribe(path, callback, hierarchical); }
    subscribeExact(path, callback) { return this.stateManager.subscribeExact(path, callback); }
    registerComponent(name, component) {
        console.info(log.i('Public component registration', { name }, 'application'));
        return this.componentManager.register(name, component);
    }
    registerHeadlessComponent(name, component, options) { return this.headlessManager.register(name, component, options); }
    getComponent(name) { return this.componentManager.components.get(name); }
    getHeadlessComponent(name) { return this.headlessManager.getInstance(name); }
    initializeHeadlessComponent(name, props) { return this.headlessManager.initialize(name, props); }
    setRenderMode(mode) { this.domRenderer.setRenderMode(mode); }
    getRenderMode() { return this.domRenderer.getRenderMode(); }
    isFineGrained() { return this.domRenderer.isFineGrained(); }
    isBatchMode() { return this.domRenderer.isBatchMode(); }
    _updateComponentContexts() {
        if (this.headlessAPIs) {
            // Context updates happen automatically via spread operator
        }
    }

    registerAndInitHeadless(name, componentFn, options = {}) {
        this.headlessManager.register(name, componentFn, options);
        return this.headlessManager.initialize(name, options);
    }

    getHeadlessStatus() { return this.headlessManager.getStatus(); }
    objectToHtml(vnode) { return this.domRenderer.render(vnode); }

    render(container = '#app') {
        const startTime = performance.now();
        console.info(log.i('Render started with template compilation', { container }, 'application'));
        const containerEl = typeof container === 'string' ?
            document.querySelector(container) : container;
        if (!containerEl) {
            console.error(log.e('Render container not found', { container }, 'application'));
            return;
        }
        const isHydration = this.getState('isHydration', false);
        try {
            if (isHydration) {
                this._renderWithHydration(containerEl);
            } else {
                this._renderImmediate(containerEl);
            }
            const duration = performance.now() - startTime;
            console.info(log.i('Render completed with templates', { duration: `${duration.toFixed(2)}ms`, isHydration }, 'application'));
        } catch (error) {
            console.error(log.e('Render failed', { error: error.message, container }, 'application'));
            this._renderError(containerEl, error);
        }
    }

    _renderImmediate (containerEl) {
        containerEl.innerHTML = '';
        const element = this.domRenderer.render(this.layout);
        if (element) containerEl.appendChild(element);
    }
    
    async _renderWithHydration (containerEl) {
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

    _renderError(container, error) {
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
    configureEnhancement(options) { return this.domEnhancer.configure(options); }
    getEnhancementStats() { return this.domEnhancer.getStats(); }

    cleanup() {
        console.info(log.i('Framework cleanup initiated', {}, 'application'));
        this.headlessManager.cleanup();
    }

    destroy() {
        console.info(log.i('Framework destruction initiated', {}, 'application'));
        this.cleanup();
        this.domEnhancer.destroy();
        this.stateManager.subscribers.clear();
        this.stateManager.externalSubscribers.clear();
        this.componentManager.components.clear();
        this.headlessManager.components.clear();
        console.info(log.i('Framework destroyed', {}, 'application'));
    }
}

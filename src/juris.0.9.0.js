/**
 * Juris (JavaScript Unified Reactive Interface Solution)
 * The First and Only Non-blocking Reactive Platform, Architecturally Optimized for Next Generation Cutting-Edge Cross-Platform Application.
 * Juris aims to eliminate build complexity from small to large applications.
 * Author: Resti Guay
 * Version: 0.9.0
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
 *          onClick:()=>clickHandler()
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
const jurisLinesOfCode = 2907;
const jurisVersion = '0.9.0';
const jurisMinifiedSize = '54 kB';

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
const { log, logSub, logUnsub } = createLogger();
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

class StateManager {
    constructor(initialState = {}, middleware = []) {
        log.ei && console.info(log.i('StateManager initialized', {
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
        this.isBatching = false;
        this.batchQueue = [];
        this.batchedPaths = new Set();
    }
    reset() {
        log.ei && console.info(log.i('State reset to initial state', {}, 'framework'));
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
        log.ed && console.debug(log.d('State change initiated', { path, hasValue: value !== undefined }, 'application'));
        if (!isValidPath(path) || this.#hasCircularUpdate(path)) return;
        if (this.isBatching) {
            this.#queueBatchedUpdate(path, value, context);
            return;
        }
        this.#setStateImmediate(path, value, context);
    }

    executeBatch(callback) {
        if (this.isBatching) {
            return callback();
        }
        this.#beginBatch();
        try {
            const result = callback();
            if (result && typeof result.then === 'function') {
                return result
                    .then(value => {
                        this.#endBatch();
                        return value;
                    })
                    .catch(error => {
                        this.#endBatch();
                        throw error;
                    });
            }
            this.#endBatch();
            return result;
        } catch (error) {
            this.#endBatch();
            throw error;
        }
    }

    #beginBatch() {
        log.ed && console.debug(log.d('Manual batch started', {}, 'framework'));
        this.isBatching = true;
        this.batchQueue = [];
        this.batchedPaths.clear();
    }

    #endBatch() {
        if (!this.isBatching) {
            log.ew && console.warn(log.w('endBatch() called without beginBatch()', {}, 'framework'));
            return;
        }
        log.ed && console.debug(log.d('Manual batch ending', { queuedUpdates: this.batchQueue.length }, 'framework'));
        this.isBatching = false;
        if (this.batchQueue.length === 0) return;
        this.#processBatchedUpdates();
    }

    isBatchingActive() {return this.isBatching;}

    getBatchQueueSize() {return this.batchQueue.length;}

    clearBatch() {
        if (this.isBatching) {
            log.ei && console.info(log.i('Clearing current batch', { clearedUpdates: this.batchQueue.length }, 'framework'));
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
            const oldValue = this.getState(update.path);
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
        const parentPaths = new Set();
        appliedUpdates.forEach(({ path }) => {
            const parts = getPathParts(path);
            for (let i = 1; i <= parts.length; i++) {
                parentPaths.add(parts.slice(0, i).join('.'));
            }
        });
        parentPaths.forEach(path => {
            if (this.subscribers.has(path)) this.#triggerPathSubscribers(path);
            if (this.externalSubscribers.has(path)) {
                this.externalSubscribers.get(path).forEach(({ callback, hierarchical }) => {
                    try {
                        callback(this.getState(path), null, path);
                    } catch (error) {
                        log.ee && console.error(log.e('External subscriber error:', error), 'application');
                    }
                });
            }
        });
    }

    #setStateImmediate(path, value, context = {}) {
        const oldValue = this.getState(path);
        let finalValue = value;
        for (const middleware of this.middleware) {
            try {
                const result = middleware({ path, oldValue, newValue: finalValue, context, state: this.state });
                if (result !== undefined) finalValue = result;
            } catch (error) {
                log.ee && console.error(log.e('Middleware error', { path, error: error.message, middlewareName: middleware.name || 'anonymous' }, 'application'));
            }
        }
        if (deepEquals(oldValue, finalValue)) {
            log.ed && console.debug(log.d('State unchanged, skipping update', { path }, 'framework'));
            return;
        }
        log.ed && console.debug(log.d('State updated', { path, oldValue: typeof oldValue, newValue: typeof finalValue }, 'application'));
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
            this.#notifySubscribers(path, finalValue, oldValue);
            this.#notifyExternalSubscribers(path, finalValue, oldValue);
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

    #notifySubscribers(path, newValue, oldValue) {
        this.#triggerPathSubscribers(path);
        const parts = getPathParts(path);
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
                    log.ee && console.error(log.e('Subscriber error:', error), 'application');
                    this.currentTracking = oldTracking;
                }
            });
        }
    }

    #hasCircularUpdate(path) {
        if (!this.currentlyUpdating) this.currentlyUpdating = new Set();
        if (this.currentlyUpdating.has(path)) {
            log.ew && console.warn(log.w('Circular dependency detected', { path }, 'framework'));
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

class ComponentManager {
    constructor(juris) {
        log.ei && console.info(log.i('ComponentManager initialized', {}, 'framework'));
        this.juris = juris;
        this.components = new Map();
        this.instances = new WeakMap();
        this.namedComponents = new Map();
        this.componentCounters = new Map();
        this.componentStates = new WeakMap();
        this.asyncPlaceholders = new WeakMap();
        this.asyncPropsCache = new Map();
    }

    register(name, componentFn) {
        log.ei && console.info(log.i('Component registered', { name }, 'application'));
        this.components.set(name, componentFn);
    }

    create(name, props = {}) {
        const componentFn = this.components.get(name);
        if (!componentFn) {
            log.ee && console.error(log.e('Component not found', { name }, 'application'));
            return null;
        }
        try {
            if (this.juris.domRenderer._hasAsyncProps(props)) {
                log.ed && console.debug(log.d('Component has async props', { name }, 'framework'));
                return this.#createWithAsyncProps(name, componentFn, props);
            }
            const { componentId, componentStates } = this.#setupComponent(name);
            log.ed && console.debug(log.d('Component setup complete', { name, componentId, stateCount: componentStates.size }, 'framework'));
            const context = this.#createComponentContext(componentId, componentStates);
            const result = componentFn(props, context);
            if (result?.then) return this.#handleAsyncComponent(promisify(result), name, props, componentStates);
            return this.#processComponentResult(result, name, props, componentStates);
        } catch (error) {
            log.ee && console.error(log.e('Component creation failed!', { name, error: error.message }, 'application'));
            return this.#createErrorElement(new Error(error.message));
        }
    }

    #setupComponent(name) {
        if (!this.componentCounters.has(name)) this.componentCounters.set(name, 0);
        const instanceIndex = this.componentCounters.get(name) + 1;
        this.componentCounters.set(name, instanceIndex);
        const componentId = `${name}#${instanceIndex}`;
        const componentStates = new Set();
        return { componentId, componentStates };
    }

    #createComponentContext(componentId, componentStates) {
        const context = this.juris.createContext();
        context.newState = (key, initialValue) => {
            const statePath = `##local.${componentId}.${key}`;
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

    #createWithAsyncProps(name, componentFn, props) {
        log.ed && console.debug(log.d('Creating component with async props', { name }, 'framework'));
        const tempElement = document.createElement('div');
        tempElement.id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const placeholder = this._createPlaceholder(`Loading ${name}...`, 'juris-async-props-loading', tempElement);
        this.asyncPlaceholders.set(placeholder, { name, props, type: 'async-props' });
        this.#resolveAsyncProps(props).then(resolvedProps => {
            try {
                const realElement = this.#createSyncComponent(name, componentFn, resolvedProps);
                if (realElement && placeholder.parentNode) {
                    placeholder.parentNode.replaceChild(realElement, placeholder);
                }
                this.asyncPlaceholders.delete(placeholder);
            } catch (error) {
                this.#replaceWithError(placeholder, error);
            }
        }).catch(error => this.#replaceWithError(placeholder, error));

        return placeholder;
    }

    async #resolveAsyncProps(props) {
        const cacheKey = this.#generateCacheKey(props);
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

    #generateCacheKey(props) {
        return JSON.stringify(props, (key, value) => value?.then ? '[Promise]' : value);
    }

    #createSyncComponent(name, componentFn, props) {
        const { componentId, componentStates } = this.#setupComponent(name);
        const context = this.#createComponentContext(componentId, componentStates);
        const result = componentFn(props, context);
        if (result?.then) return this.#handleAsyncComponent(promisify(result), name, props, componentStates);
        return this.#processComponentResult(result, name, props, componentStates);
    }

    #handleAsyncComponent(resultPromise, name, props, componentStates) {
        log.ed && console.debug(log.d('Handling async component', { name }, 'framework'));
        const tempElement = document.createElement('div');
        tempElement.id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const placeholder = this._createPlaceholder(`Loading ${name}...`, 'juris-async-loading', tempElement);
        this.asyncPlaceholders.set(placeholder, { name, props, componentStates });
        resultPromise.then(result => {
            log.ed && console.debug(log.d('Async component resolved', { name }, 'framework'));
            try {
                const realElement = this.#processComponentResult(result, name, props, componentStates);
                if (realElement && placeholder.parentNode) {
                    placeholder.parentNode.replaceChild(realElement, placeholder);
                }
                this.asyncPlaceholders.delete(placeholder);
            } catch (error) {
                log.ee && console.error(log.e('Async component failed', { name, error: error.message }, 'application'));
                this.#replaceWithError(placeholder, error);
            }
        }).catch(error => this.#replaceWithError(placeholder, error));

        return placeholder;
    }

    #processComponentResult(result, name, props, componentStates) {
        if (Array.isArray(result)) {
            const fragment = document.createDocumentFragment();
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
                get() {
                    return '';
                }
            });
            const subscriptions = [];
            this.juris.domRenderer._handleChildrenFineGrained(virtualContainer, result, subscriptions);
            fragment._jurisComponent = {
                name,
                props,
                virtual: virtualContainer,
                cleanup: () => {
                    subscriptions.forEach(unsub => {
                        try { unsub(); } catch(e) {}
                    });
                }
            };            
            if (componentStates?.size > 0) {
                fragment._jurisComponentStates = componentStates;
            }            
            return fragment;
        }
        if (result && typeof result === 'object') {
            if (this.#hasLifecycleHooks(result)) {
                const instance = {
                    name, 
                    props,
                    hooks: result.hooks || {
                        onMount: result.onMount,
                        onUpdate: result.onUpdate,
                        onUnmount: result.onUnmount
                    },
                    api: result.api || {},
                    render: result.render
                };
                const renderResult = instance.render ? instance.render() : result;
                if (renderResult?.then) {
                    return this.#handleAsyncLifecycleRender(promisify(renderResult), instance, componentStates);
                }
                const element = this.juris.domRenderer.render(renderResult, false, name);
                if (element) {
                    this.instances.set(element, instance);
                    if (componentStates?.size > 0) {
                        this.componentStates.set(element, componentStates);
                    }
                    if (instance.api && Object.keys(instance.api).length > 0) {
                        this.namedComponents.set(name, { element, instance });
                    }
                    if (instance.hooks.onMount) {
                        setTimeout(() => {
                            try {
                                const mountResult = instance.hooks.onMount();
                                if (mountResult?.then) {
                                    promisify(mountResult).catch(error =>
                                        log.ee && console.error(log.e(`Async onMount error in ${name}:`, error), 'application')
                                    );
                                }
                            } catch (error) {
                                log.ee && console.error(log.e(`onMount error in ${name}:`, error), 'application');
                            }
                        }, 0);
                    }
                }
                return element;
            }            
            if (typeof result.render === 'function' && !this.#hasLifecycleHooks(result)) {
                const container = document.createElement('div');
                container.setAttribute('data-juris-reactive-render', name);
                const componentData = { name, api: result.api || {}, render: result.render };
                this.instances.set(container, componentData);
                if (result.api) {
                    this.namedComponents.set(name, { element: container, instance: componentData });
                }
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
                                log.ee && console.error(`Async render error for ${name}:`, error);
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
                        log.ee && console.error(`Error in reactive render for ${name}:`, error);
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

    #hasLifecycleHooks(result) {
        return result.hooks && (result.hooks.onMount || result.hooks.onUpdate || result.hooks.onUnmount) ||
            result.onMount || result.onUpdate || result.onUnmount;
    }

    #handleAsyncLifecycleRender(renderPromise, instance, componentStates) {
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
                                        log.ee && console.error(log.e(`Async onMount error in ${instance.name}:`, error), 'application')
                                    );
                                }
                            } catch (error) {
                                log.ee && console.error(log.e(`onMount error in ${instance.name}:`, error), 'application');
                            }
                        }, 0);
                    }
                }
            } catch (error) {
                this.#replaceWithError(placeholder, error);
            }
        }).catch(error => this.#replaceWithError(placeholder, error));
        return placeholder;
    }

    getComponent(name) {return this.namedComponents.get(name)?.instance || null;}
    getComponentAPI(name) {return this.namedComponents.get(name)?.instance?.api || null;}
    getComponentElement(name) {return this.namedComponents.get(name)?.element || null;}
    getNamedComponents() {return Array.from(this.namedComponents.keys());}
    updateInstance(element, newProps) {
        const instance = this.instances.get(element);
        if (!instance) return;
        const oldProps = instance.props;
        if (deepEquals(oldProps, newProps)) return;
        if (this.juris.domRenderer._hasAsyncProps(newProps)) {
            this.#resolveAsyncProps(newProps).then(resolvedProps => {
                instance.props = resolvedProps;
                this.#performUpdate(instance, element, oldProps, resolvedProps);
            }).catch(error => log.ee && console.error(log.e(`Error updating async props for ${instance.name}:`, error), 'application'));
        } else {
            instance.props = newProps;
            this.#performUpdate(instance, element, oldProps, newProps);
        }
    }

    #performUpdate(instance, element, oldProps, newProps) {
        if (instance.hooks.onUpdate) {
            try {
                const updateResult = instance.hooks.onUpdate(oldProps, newProps);
                if (updateResult?.then) {
                    promisify(updateResult).catch(error => log.ee && console.error(log.e(`Async onUpdate error in ${instance.name}:`, error), 'application'));
                }
            } catch (error) {
                log.ee && console.error(log.e(`onUpdate error in ${instance.name}:`, error), 'application');
            }
        }
        try {
            const renderResult = instance.render();
            const normalizedRenderResult = promisify(renderResult);
            if (normalizedRenderResult !== renderResult) {
                normalizedRenderResult.then(newContent => {
                    this.juris.domRenderer.updateElementContent(element, newContent);
                }).catch(error => log.ee && console.error(log.e(`Async re-render error in ${instance.name}:`, error), 'application'));
            } else {
                this.juris.domRenderer.updateElementContent(element, renderResult);
            }
        } catch (error) {
            log.ee && console.error(log.e(`Re-render error in ${instance.name}:`, error), 'application');
        }
    }

    cleanup(element) {
        if (element instanceof DocumentFragment) {
            if (element._jurisComponent?.cleanup) {
                element._jurisComponent.cleanup();
            }
            if (element._jurisComponentStates) {
                element._jurisComponentStates.forEach(statePath => {
                    // Clean up component states
                    const pathParts = statePath.split('.');
                    let current = this.juris.stateManager.state;
                    for (let i = 0; i < pathParts.length - 1; i++) {
                        if (current[pathParts[i]]) current = current[pathParts[i]];
                        else return;
                    }
                    delete current[pathParts[pathParts.length - 1]];
                });
            }
            return;
        }
        const instance = this.instances.get(element);
        if (instance) log.ed && console.debug(log.d('Cleaning up component', { name: instance.name }, 'framework'));
        if (instance?.hooks?.onUnmount) {
            try {
                const unmountResult = instance.hooks.onUnmount();
                if (unmountResult?.then) {
                    promisify(unmountResult).catch(error => log.ee && console.error(log.e(`Async onUnmount error in ${instance.name}:`, error), 'application'));
                }
            } catch (error) {
                log.ee && console.error(log.e(`onUnmount error in ${instance.name}:`, error), 'application');
            }
        }
        if (element._reactiveSubscriptions) {
            element._reactiveSubscriptions.forEach(unsubscribe => {
                try { unsubscribe(); } catch (error) { 
                    log.ew && console.warn('Error cleaning up reactive subscription:', error); 
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

    #createErrorElement(error) {
        const element = document.createElement('div');
        element.style.cssText = 'color: red; border: 1px solid red; padding: 8px; background: #ffe6e6;';
        element.textContent = `Component Error: ${error.message}`;
        return element;
    }

    #replaceWithError(placeholder, error) {
        const errorElement = this.#createErrorElement(error);
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

class DOMRenderer {
    constructor(juris) {
        log.ei && console.info(log.i('DOMRenderer initialized', { renderMode: 'fine-grained' }, 'framework'));
        this.juris = juris;
        this.subscriptions = new WeakMap();
        this.componentStack = [];
        this.cssCache = new Map();         
        this.injectedCSS = new Set();       
        this.styleSheet = null;             
        this.camelCaseRegex = /([A-Z])/g;   
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
        this.tempArray = [];
        this.tempKeyParts = [];
        this.TOUCH_CONFIG = {
            moveThreshold: 10,
            timeThreshold: 300,
            touchAction: 'manipulation',
            tapHighlight: 'transparent',
            touchCallout: 'none'
        };
        this.RECYCLE_POOL_SIZE = 100;
    }

    setRenderMode(mode) {
        if (['fine-grained', 'batch'].includes(mode)) {
            this.renderMode = mode;
            log.ei && console.info(log.i('Render mode changed', { mode }, 'framework'));
        } else {
            log.ew && console.warn(log.w('Invalid render mode', { mode }, 'application'));
        }
    }

    getRenderMode() { return this.renderMode; }
    isFineGrained() { return this.renderMode === 'fine-grained'; }
    isBatchMode() { return this.renderMode === 'batch'; }

    render(vnode, staticMode = false, componentName = null) {
        if (typeof vnode === 'string' || typeof vnode === 'number') {
            return document.createTextNode(String(vnode));
        }
        if (!vnode || typeof vnode !== 'object') return null;
        if (Array.isArray(vnode)) {
            const hasReactiveFunctions = !staticMode && vnode.some(item => typeof item === 'function');            
            if (hasReactiveFunctions) {
                const fragment = document.createDocumentFragment();
                const proxyElement = {
                    _isProxy: true,
                    _fragment: fragment,
                    _subscriptions: [],
                    appendChild: (child) => fragment.appendChild(child),
                    removeChild: (child) => fragment.removeChild(child),
                    replaceChild: (newChild, oldChild) => {
                        if (oldChild.parentNode === fragment) {
                            fragment.replaceChild(newChild, oldChild);
                        }
                    },
                    get parentNode() { return null; },
                    get children() { return fragment.children || [] },
                    textContent: {
                        set(value) {
                            while (fragment.firstChild) {
                                fragment.removeChild(fragment.firstChild);
                            }
                            if (value) {
                                fragment.appendChild(document.createTextNode(value));
                            }
                        }
                    }
                };
                const subscriptions = [];
                this.#handleReactiveFragmentChildren(fragment, vnode, subscriptions);
                if (subscriptions.length > 0) {
                    fragment._jurisCleanup = () => {
                        subscriptions.forEach(unsub => { 
                            try { unsub(); } catch(e) {} 
                        });
                    };
                }
                
                return fragment;
            }
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
            return this.#createDeepRecursionErrorElement(tagName, this.componentStack);
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
            return this.#createComponentErrorElement(tagName);
        }
        if (typeof tagName !== 'string' || tagName.length === 0) return null;
        let modifiedProps = props;
        // NEW: Let custom CSS extractor handle all the logic
        if (props.style && !staticMode && this.customCSSExtractor) {
            const elementName = componentName || tagName;
            modifiedProps = this.customCSSExtractor.processProps(props, elementName, this);
        }
        const inheritedComponentName = componentName || (props.style ? tagName : null);
        if (staticMode) {
            return this.#createElementStatic(tagName, modifiedProps, inheritedComponentName);
        }
        if (this.renderMode === 'fine-grained') {
            return this.#createElementFineGrained(tagName, modifiedProps, inheritedComponentName);
        }
        try {
            const key = modifiedProps.key || this.#generateKey(tagName, modifiedProps);
            const cachedElement = this.elementCache.get(key);
            if (cachedElement && this.#canReuseElement(cachedElement, tagName, modifiedProps)) {
                this.#updateElementProperties(cachedElement, modifiedProps);
                return cachedElement;
            }
            return this.#createElementOptimized(tagName, modifiedProps, key, inheritedComponentName);
        } catch (error) {
            this.failureCount++;
            if (this.failureCount >= this.maxFailures) this.renderMode = 'fine-grained';
            return this.#createElementFineGrained(tagName, modifiedProps, inheritedComponentName);
        }
    }

    #handleReactiveFragmentChildren(fragment, children, subscriptions) {
        const childNodes = [];
        const cleanupFunctions = [];
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (typeof child === 'function') {
                let currentNode = document.createTextNode('');
                let childSubscriptions = [];
                
                const updateChild = () => {
                    childSubscriptions.forEach(unsub => { 
                        try { unsub(); } catch(e) {} 
                    });
                    childSubscriptions = [];
                    const deps = this.juris.stateManager.startTracking();
                    const oldTracking = this.juris.stateManager.currentTracking;
                    this.juris.stateManager.currentTracking = deps;
                    
                    let result;
                    try {
                        result = child();
                    } finally {
                        this.juris.stateManager.currentTracking = oldTracking;
                    }
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
                childNodes.push(currentNode);
                cleanupFunctions.push(() => {
                    childSubscriptions.forEach(unsub => { 
                        try { unsub(); } catch(e) {} 
                    });
                });
                subscriptions.push(() => {
                    childSubscriptions.forEach(unsub => { 
                        try { unsub(); } catch(e) {} 
                    });
                });                
            } else if (child != null) {
                // Static child
                const childElement = this.#createChild(child, null, false);
                if (childElement) {
                    fragment.appendChild(childElement);
                    childNodes.push(childElement);
                }
            }
        }
        fragment._reactiveCleanup = () => {
            cleanupFunctions.forEach(cleanup => { 
                try { cleanup(); } catch(e) {} 
            });
        };
    }

    #createComponentErrorElement(tagName) {
        const errorElement = document.createElement('div');
        errorElement.style.cssText = 'color: red; border: 1px solid red; padding: 8px; background: #ffe6e6; font-family: monospace;';
        errorElement.textContent = `Component "${tagName}" not registered`;
        return errorElement;
    }

    #createDeepRecursionErrorElement(tagName, callStack) {
        const errorElement = document.createElement('div');
        errorElement.style.cssText = 'color: red; border: 1px solid red; padding: 8px; background: #ffe6e6; font-family: monospace;';
        const chain = [...callStack, tagName].join(' â†’ ');
        errorElement.textContent = `Recursion detected: ${chain}`;
        return errorElement;
    }

    #createElementStatic(tagName, props, componentName = null) {
        const element = this.SVG_ELEMENTS.has(tagName.toLowerCase())
            ? document.createElementNS("http://www.w3.org/2000/svg", tagName)
            : document.createElement(tagName);
        for (const key in props) {
            if (!props.hasOwnProperty(key)) continue;

            const value = props[key];
            if (key === 'children') {
                this.#updateChildrenStatic(element, value, componentName); // Pass context
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

    #updateChildrenStatic(element, children, componentName = null) {
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

    #createElementFineGrained(tagName, props, componentName = null) {
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
                this.#handleChildren(element, value, subscriptions, componentName); // Pass context
            } else if (key === 'text') {
                this._handleText(element, value, subscriptions);
            } else if (key === 'style') {
                this._handleStyle(element, value, subscriptions);
            } else if (key.startsWith('on')) {
                this._handleEvent(element, key, value, eventListeners);
            } else if (typeof value === 'function') {
                this._handleReactiveAttribute(element, key, value, subscriptions);
            } else if (this.#isPromiseLike(value)) {
                this.#handleAsyncProp(element, key, value, subscriptions);
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

    #handleChildren(element, children, subscriptions) {
        if (this.renderMode === 'fine-grained') {
            this._handleChildrenFineGrained(element, children, subscriptions);
        } else {
            this._handleChildrenOptimized(element, children, subscriptions);
        }
    }

    _handleChildrenFineGrained(element, children, subscriptions) {
        if (Array.isArray(children) && children.length > 0 && children[0]?.config?.staticMode) {
            return this.#updateChildrenStatic(element, children);
        }
        if (typeof children === 'function') {
            this.#handleReactiveChildren(element, children, subscriptions);
        } else if (this.#isPromiseLike(children)) {
            this.#handleAsyncChildrenDirect(element, children);
        } else {
            this.#updateChildren(element, children);
        }
    }

    _handleChildrenOptimized(element, children, subscriptions) {
        if (Array.isArray(children) && children.length > 0 && children[0]?.config?.staticMode) {
            return this.#updateChildrenStatic(element, children);
        }
        if (typeof children === 'function') {
            let lastChildrenState = null;
            let childElements = [];
            let useOptimizedPath = true;
            const updateChildren = () => {
                try {
                    const newChildren = children(element);
                    if (this.#isPromiseLike(newChildren)) {
                        promisify(newChildren)
                            .then(resolvedChildren => {
                                if (resolvedChildren !== "ignore" && !this.#childrenEqual(lastChildrenState, resolvedChildren)) {
                                    if (useOptimizedPath) {
                                        try {
                                            childElements = this.#reconcileChildren(element, childElements, resolvedChildren);
                                            lastChildrenState = resolvedChildren;
                                        } catch (error) {
                                            log.ew && console.warn(log.w('Reconciliation failed, falling back to safe rendering:', error.message), 'framework');
                                            useOptimizedPath = false;
                                            this.#updateChildren(element, resolvedChildren);
                                            lastChildrenState = resolvedChildren;
                                        }
                                    } else {
                                        this.#updateChildren(element, resolvedChildren);
                                        lastChildrenState = resolvedChildren;
                                    }
                                }
                            })
                            .catch(error => {
                                log.ee && console.error(log.e('Error in async children function:', error), 'framework');
                                useOptimizedPath = false;
                            });
                    } else {
                        if (newChildren !== "ignore" && !this.#childrenEqual(lastChildrenState, newChildren)) {
                            if (useOptimizedPath) {
                                try {
                                    childElements = this.#reconcileChildren(element, childElements, newChildren);
                                    lastChildrenState = newChildren;
                                } catch (error) {
                                    log.ew && console.warn(log.w('Reconciliation failed, falling back to safe rendering:', error.message), 'framework');
                                    useOptimizedPath = false;
                                    this.#updateChildren(element, newChildren);
                                    lastChildrenState = newChildren;
                                }
                            } else {
                                this.#updateChildren(element, newChildren);
                                lastChildrenState = newChildren;
                            }
                        }
                    }
                } catch (error) {
                    log.ee && console.error(log.e('Error in children function:', error), 'application');
                    useOptimizedPath = false;
                    try {
                        this.#updateChildren(element, []);
                    } catch (fallbackError) {
                        log.ee && console.error(log.e('Even safe fallback failed:', fallbackError), 'application');
                    }
                }
            };
            this._createReactiveUpdate(element, updateChildren, subscriptions);
            try {
                const initialChildren = children();
                if (this.#isPromiseLike(initialChildren)) {
                    promisify(initialChildren)
                        .then(resolvedInitial => {
                            childElements = this.#reconcileChildren(element, [], resolvedInitial);
                            lastChildrenState = resolvedInitial;
                        })
                        .catch(error => {
                            log.ew && console.warn(log.w('Initial async children failed, using safe method:', error.message), 'framework');
                            useOptimizedPath = false;
                            this.#updateChildren(element, []);
                        });
                } else {
                    childElements = this.#reconcileChildren(element, [], initialChildren);
                    lastChildrenState = initialChildren;
                }
            } catch (error) {
                log.ew && console.warn(log.w('Initial reconciliation failed, using safe method:', error.message), 'framework');
                useOptimizedPath = false;
                const initialChildren = children();
                this.#updateChildren(element, initialChildren);
                lastChildrenState = initialChildren;
            }
        } else if (this.#isPromiseLike(children)) {
            this.#handleAsyncChildrenDirect(element, children);
        } else {
            try {
                this.#reconcileChildren(element, [], children);
            } catch (error) {
                log.ew && console.warn(log.w('Static reconciliation failed, using safe method:', error.message), 'framework');
                this.#updateChildren(element, children);
            }
        }
    }

    #handleAsyncProp(element, key, value, subscriptions) {
        if (key === 'text') {
            this.#handleAsyncTextDirect(element, value);
        } else if (key === 'children') {
            this.#handleAsyncChildrenDirect(element, value);
        } else if (key === 'style') {
            this.#handleAsyncStyleDirect(element, value);
        } else if (key === 'innerHTML') {
            this.#handleAsyncInnerHTMLDirect(element, value);
        } else {
            this.#setPlaceholder(element, key);
            promisify(value)
                .then(resolvedValue => {
                    const config = this._getPlaceholderConfig(element);
                    element.classList.remove(config.className);
                    this._setStaticAttribute(element, key, resolvedValue);
                })
                .catch(error => {
                    log.ee && console.error(log.e(`Async prop '${key}' failed:`, error), 'application');
                    this.#setErrorState(element, key, error.message);
                });
        }
    }

    #handleAsyncInnerHTMLDirect(element, htmlPromise) {
        const config = this._getPlaceholderConfig(element);
        element.innerHTML = `<span class="${config.className}">${config.text}</span>`;
        promisify(htmlPromise)
            .then(resolvedHTML => {
                element.innerHTML = resolvedHTML;
            })
            .catch(error => {
                log.ee && console.error(log.e('Async innerHTML failed:', error), 'application');
                element.innerHTML = `<span class="juris-async-error">Error: ${error.message}</span>`;
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

    #isPromiseLike(value) {
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

    #childrenEqual(oldChildren, newChildren) {
        if (oldChildren === newChildren) return true;
        if (Array.isArray(oldChildren) !== Array.isArray(newChildren)) return false;
        if (Array.isArray(oldChildren) && oldChildren.length !== newChildren.length) return false;
        return deepEquals && deepEquals(oldChildren, newChildren);
    }

    #reconcileChildren(parent, oldChildren, newChildren) {
        log.ed && console.debug(log.d('Reconciling children', { parentTag: parent.tagName, oldCount: oldChildren.length, newCount: Array.isArray(newChildren) ? newChildren.length : (newChildren ? 1 : 0) }, 'framework'));
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
            const key = props.key || this.#generateKey(tagName, props);
            const existingElement = oldChildrenByKey.get(key);
            if (existingElement &&
                !usedElements.has(existingElement) &&
                this.#canReuseElement(existingElement, tagName, props) &&
                !this.#wouldCreateCircularReference(parent, existingElement)) {
                if (existingElement.parentNode) {
                    existingElement.parentNode.removeChild(existingElement);
                }
                this.#updateElementProperties(existingElement, props);
                newChildElements.push(existingElement);
                fragment.appendChild(existingElement);
                usedElements.add(existingElement);
                oldChildrenByKey.delete(key);
            } else {
                const newElement = this.render(newChild);
                if (newElement && !this.#wouldCreateCircularReference(parent, newElement)) {
                    newElement._jurisKey = key;
                    newChildElements.push(newElement);
                    fragment.appendChild(newElement);
                }
            }
        }

        oldChildrenByKey.forEach(unusedChild => {
            if (!usedElements.has(unusedChild)) {
                this.#recycleElement(unusedChild);
            }
        });

        try {
            parent.textContent = '';
            if (fragment.hasChildNodes()) {
                parent.appendChild(fragment);
            }
        } catch (error) {
            log.ee && console.error(log.e('Error in reconcileChildren:', error), 'framework');
            parent.textContent = '';
            for (let i = 0; i < newChildElements.length; i++) {
                const child = newChildElements[i];
                try {
                    if (child && !this.#wouldCreateCircularReference(parent, child)) {
                        parent.appendChild(child);
                    }
                } catch (e) {
                    log.ee && console.error(log.e('Reconciliation failed', { parentTag: parent.tagName, error: e.message }, 'framework'));
                }
            }
        }

        return newChildElements;
    }

    #wouldCreateCircularReference(parent, child) {
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
                    if (this.#wouldCreateCircularReference(parent, child.children[i])) {
                        return true;
                    }
                }
            }
        } catch (error) {
            log.ew && console.warn(log.w('Error checking circular reference, assuming unsafe:', error), 'application');
            return true;
        }
        return false;
    }

    #recycleElement(element) {
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
            this.#resetElement(element);
            pool.push(element);
        }
    }

    #handleAsyncChildrenDirect(element, childrenPromise) {
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
                this.#updateChildren(element, resolvedChildren);
                this.asyncPlaceholders.delete(element);
            })
            .catch(error => {
                log.ee && console.error(log.e('Async children failed:', error), 'application');
                placeholder.textContent = `Error loading content: ${error.message}`;
                placeholder.className = 'juris-async-error';
            });
    }

    #handleReactiveChildren(element, childrenFn, subscriptions) {
        let lastChildrenResult = null, isInitialized = false;
        const updateChildren = () => {
            try {
                const result = childrenFn(element);
                if (this.#isPromiseLike(result)) {
                    promisify(result)
                        .then(resolvedResult => {
                            if (resolvedResult !== "ignore" && (!isInitialized || !deepEquals(resolvedResult, lastChildrenResult))) {
                                if (typeof resolvedResult === 'string' || typeof resolvedResult === 'number') {
                                    element.textContent = String(resolvedResult);
                                } else {
                                    this.#updateChildren(element, resolvedResult);
                                }
                                lastChildrenResult = resolvedResult;
                                isInitialized = true;
                            }
                        })
                        .catch(error => log.ee && console.error(log.e('Error in async reactive children:', error), 'application'));
                } else {
                    if (result !== "ignore" && (!isInitialized || !deepEquals(result, lastChildrenResult))) {
                        if (typeof result === 'string' || typeof result === 'number') {
                            element.textContent = String(result);
                        } else {
                            this.#updateChildren(element, result);
                        }
                        lastChildrenResult = result;
                        isInitialized = true;
                    }
                }
            } catch (error) {
                log.ee && console.error(log.e('Error in reactive children function:', error), 'application');
            }
        };
        this._createReactiveUpdate(element, updateChildren, subscriptions);
    }

    #updateChildren(element, children, componentName = null) {
        if (children === "ignore") return;
        
        if (Array.isArray(children)) {
            let actualChildren = children;
            let childStaticMode = false;
            if (children.length > 0 && children[0]?.config?.staticMode) {
                childStaticMode = true;
                actualChildren = children.slice(1);
            }
            const hasReactiveFunctions = actualChildren.some(child => typeof child === 'function');            
            if (hasReactiveFunctions) {
                this.#renderReactiveChildren(element, actualChildren, componentName, childStaticMode);
            } else {
                this.#renderStaticChildren(element, actualChildren, componentName, childStaticMode);
            }
        } else if (children) {
            element.textContent = '';
            if (typeof children === 'function') {
                this.#setupSingleReactiveChild(element, children, componentName);
            } else {
                const childElement = this.#createChild(children, componentName, false);
                if (childElement) element.appendChild(childElement);
            }
        } else {
            element.textContent = '';
        }
    }

    #setupSingleReactiveChild(element, childFn, componentName) {
        let subscription = null;        
        const update = () => {
            if (subscription) {
                try { subscription(); } catch(e) {}
            }
            const deps = this.juris.stateManager.startTracking();
            const oldTracking = this.juris.stateManager.currentTracking;
            this.juris.stateManager.currentTracking = deps;            
            let result;
            try {
                result = childFn(element);
            } finally {
                this.juris.stateManager.currentTracking = oldTracking;
            }
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
            if (deps.size > 0) {
                const subscriptions = [];
                deps.forEach(path => {
                    subscriptions.push(this.juris.stateManager.subscribeInternal(path, update));
                });
                subscription = () => subscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
            }
        };
        
        element._reactiveCleanup = subscription;
        update();
    }

    #renderReactiveChildren(element, children, componentName, childStaticMode) {
        element.textContent = '';
        const childNodes = [];
        const cleanupFunctions = [];        
        const fragment = document.createDocumentFragment();        
        for (let i = 0; i < children.length; i++) {
            const child = children[i];            
            if (typeof child === 'function') {
                const { node, cleanup } = this.#createIndividualReactiveChild(child, i, componentName, childStaticMode, element);
                if (node) {
                    childNodes.push(node);
                    fragment.appendChild(node);
                    cleanupFunctions.push(cleanup);
                }
            } else if (child != null) {
                const childElement = this.#createChild(child, componentName, childStaticMode);
                if (childElement) {
                    childNodes.push(childElement);
                    fragment.appendChild(childElement);
                }
            }
        }        
        if (fragment.hasChildNodes()) element.appendChild(fragment);        
        element._reactiveCleanup = () => {
            cleanupFunctions.forEach(cleanup => { try { cleanup(); } catch(e) {} });
        };
    }
    #createIndividualReactiveChild(childFn, index, componentName, childStaticMode, parentElement) {
        let currentNode = document.createTextNode('');
        let subscriptions = [];        
        const updateThisChild = () => {
            subscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
            subscriptions = [];
            const deps = this.juris.stateManager.startTracking();
            const oldTracking = this.juris.stateManager.currentTracking;
            this.juris.stateManager.currentTracking = deps;            
            let result;
            try {
                result = childFn(parentElement);
            } finally {
                this.juris.stateManager.currentTracking = oldTracking;
            }
            if (this.#isPromiseLike(result)) {
                const placeholder = document.createTextNode('Loading...');
                if (currentNode.parentNode) {
                    currentNode.parentNode.replaceChild(placeholder, currentNode);
                }
                currentNode = placeholder;                
                promisify(result).then(resolved => {
                    const newNode = this.#createChild(resolved, componentName, childStaticMode) || document.createTextNode('');
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
                const newNode = this.#createChild(result, componentName, childStaticMode) || document.createTextNode('');
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
    #createChild(child, componentName, staticMode) {
        if (child == null) return null;
        if (typeof child === 'string' || typeof child === 'number') {
            return document.createTextNode(String(child));
        }
        if (Array.isArray(child)) {
            const fragment = document.createDocumentFragment();
            for (let i = 0; i < child.length; i++) {
                const subChild = this.#createChild(child[i], componentName, staticMode);
                if (subChild) fragment.appendChild(subChild);
            }
            return fragment.hasChildNodes() ? fragment : null;
        }
        return this.render(child, staticMode, componentName);
    }
    #renderStaticChildren(element, children, componentName, childStaticMode) {
        element.textContent = '';
        const fragment = document.createDocumentFragment();        
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child != null) {
                const childElement = this.#createChild(child, componentName, childStaticMode);
                if (childElement) fragment.appendChild(childElement);
            }
        }        
        if (fragment.hasChildNodes()) element.appendChild(fragment);
    }
    _handleText(element, text, subscriptions) {
        if (typeof text === 'function') {
            this.#handleReactiveText(element, text, subscriptions);
        } else if (this.#isPromiseLike(text)) {
            this.#handleAsyncTextDirect(element, text);
        } else {
            element.textContent = text;
        }
    }

    #handleAsyncTextDirect(element, textPromise) {
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
                log.ee && console.error(log.e('Async text failed:', error), 'application');
                element.textContent = `Error: ${error.message}`;
                element.classList.add('juris-async-error');
            });
    }

    #handleReactiveText(element, textFn, subscriptions) {
        let lastTextValue = null, isInitialized = false;
        const updateText = () => {
            try {
                const result = textFn(element);
                if (this.#isPromiseLike(result)) {
                    promisify(result)
                        .then(resolvedText => {
                            if (!isInitialized || resolvedText !== lastTextValue) {
                                element.textContent = resolvedText;
                                lastTextValue = resolvedText;
                                isInitialized = true;
                            }
                        })
                        .catch(error => log.ee && console.error(log.e('Error in async reactive text:', error), 'application'));
                } else {
                    if (!isInitialized || result !== lastTextValue) {
                        element.textContent = result;
                        lastTextValue = result;
                        isInitialized = true;
                    }
                }
            } catch (error) {
                log.ee && console.error(log.e('Error in reactive text function:', error), 'application');
            }
        };
        this._createReactiveUpdate(element, updateText, subscriptions);
    }

    _handleStyle(element, style, subscriptions) {
        if (typeof style === 'function') {
            this.#handleReactiveStyle(element, style, subscriptions);
        } else if (this.#isPromiseLike(style)) {
            this.#handleAsyncStyleDirect(element, style);
        } else if (typeof style === 'object') {
            for (const prop in style) {
                if (style.hasOwnProperty(prop)) {
                    const val = style[prop];
                    if (typeof val === 'function') {
                        this.#handleReactiveStyleProperty(element, prop, val, subscriptions);
                    } else {
                        if (prop.startsWith('--')) {
                            element.style.setProperty(prop, val);
                        } else {
                            element.style[prop] = val;
                        }
                    }
                }
            }
        }
    }

    #handleReactiveStyleProperty(element, prop, valueFn, subscriptions) {
        let lastValue = null, isInitialized = false;
        const updateStyleProperty = () => {
            try {
                const result = valueFn(element);
                if (this.#isPromiseLike(result)) {
                    promisify(result)
                        .then(resolvedValue => {
                            if (!isInitialized || resolvedValue !== lastValue) {
                                if (prop.startsWith('--')) {
                                    element.style.setProperty(prop, resolvedValue);
                                } else {
                                    element.style[prop] = resolvedValue;
                                }
                                lastValue = resolvedValue;
                                isInitialized = true;
                            }
                        })
                        .catch(error => log.ee && console.error(`Error in async reactive style property '${prop}':`, error));
                } else {
                    if (!isInitialized || result !== lastValue) {
                        if (prop.startsWith('--')) {
                            element.style.setProperty(prop, result);
                        } else {
                            element.style[prop] = result;
                        }
                        lastValue = result;
                        isInitialized = true;
                    }
                }
            } catch (error) {
                log.ee && console.error(`Error in reactive style property '${prop}':`, error);
            }
        };
        this._createReactiveUpdate(element, updateStyleProperty, subscriptions);
    }

    #handleAsyncStyleDirect(element, stylePromise) {
        const config = this._getPlaceholderConfig(element);
        element.classList.add(config.className);
        if (config.style) {
            const loadingStyles = config.style.split(';').filter(s => s.trim());
            for (let i = 0; i < loadingStyles.length; i++) {
                const styleRule = loadingStyles[i];
                const [prop, value] = styleRule.split(':').map(s => s.trim());
                if (prop && value) {
                    if (prop.startsWith('--')) {
                        element.style.setProperty(prop, value);
                    } else {
                        element.style[prop] = value;
                    }
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
            .catch(error => log.ee && console.error(log.e('Async style failed:', error), 'application'));
    }

    #handleReactiveStyle(element, styleFn, subscriptions) {
        let lastStyleValue = null, isInitialized = false;
        const updateStyle = () => {
            try {
                let result;
                if (styleFn.length > 0) {
                    result = styleFn(element);
                } else {
                    result = styleFn();
                }
                if (this.customCSSExtractor && this.customCSSExtractor.postProcessReactiveResult && typeof result === 'object') {
                    result = this.customCSSExtractor.postProcessReactiveResult(result, 'reactive', element);
                }
                if (this.#isPromiseLike(result)) {
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
                        .catch(error => log.ee && console.error('Error in async reactive style:', error));
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
                log.ee && console.error('Error in reactive style function:', error);
            }
        };
        
        this._createReactiveUpdate(element, updateStyle, subscriptions);
    }

    #createElementOptimized(tagName, props, key) {
        let element = this.#getRecycledElement(tagName);
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
        this.#processProperties(element, props, subscriptions, eventListeners);
        if (subscriptions.length > 0 || eventListeners.length > 0) {
            this.subscriptions.set(element, { subscriptions, eventListeners });
        }
        return element;
    }

    #processProperties(element, props, subscriptions, eventListeners) {
        for (const key in props) {
            if (!props.hasOwnProperty(key) || key === 'key') continue;
            const value = props[key];
            switch (key) {
                case 'children':
                    this.#handleChildren(element, value, subscriptions);
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
        log.ed && console.debug(log.d('Event handler attached', { tagName: element.tagName, eventName }, 'framework'));
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
                if (!touchMovlog.ed && touchDuration < config.timeThreshold) {
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
                if (this.#isPromiseLike(result)) {
                    promisify(result)
                        .then(resolvedValue => {
                            if (!isInitialized || !deepEquals(resolvedValue, lastValue)) {
                                this._setStaticAttribute(element, attr, resolvedValue);
                                lastValue = resolvedValue;
                                isInitialized = true;
                            }
                        })
                        .catch(error => log.ee && console.error(log.e(`Error in async reactive attribute '${attr}':`, error), 'application'));
                } else {
                    if (!isInitialized || !deepEquals(result, lastValue)) {
                        this._setStaticAttribute(element, attr, result);
                        lastValue = result;
                        isInitialized = true;
                    }
                }
            } catch (error) {
                log.ee && console.error(log.e(`Error in reactive attribute '${attr}':`, error), 'application');
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
            log.ew && console.warn(log.w(`Function value for attribute '${attr}' should be handled reactively`), 'application');
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
            log.ee && console.error(log.e('Error capturing dependencies:', error), 'application');
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
        this.#updateChildren(element, [newContent]);
    }

    setupIndicators(elementId, config) {
        this.placeholderConfigs.set(elementId, { ...this.defaultPlaceholder, ...config });
    }

    cleanup(element) {
        log.ed && console.debug(log.d('Cleaning up element', { tagName: element.tagName }, 'framework'));
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
        if (element._jurisKey) this.elementCache.delete(element._jurisKey);
        if (this.asyncPlaceholders.has(element)) this.asyncPlaceholders.delete(element);
        try {
            const children = element.children;
            for (let i = 0; i < children.length; i++) {
                try { this.cleanup(children[i]); } catch(e) {}
            }
        } catch(e) {}
    }

    #generateKey(tagName, props) {
        if (props.key) return props.key;
        let key = tagName;
        for (let i = 0; i < this.KEY_PROPS.length; i++) {
            const prop = this.KEY_PROPS[i];
            if (props[prop] && typeof props[prop] !== 'function') {
                key += `|${prop}:${props[prop]}`;
            }
        }
        key += `|hash:${this.#hashProps(props)}`;
        return key;
    }

    #hashProps(props) {
        const str = JSON.stringify(props, (key, value) => typeof value === 'function' ? '[function]' : value);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    #getRecycledElement(tagName) {
        const pool = this.recyclePool.get(tagName);
        if (pool?.length > 0) {
            const element = pool.pop();
            this.#resetElement(element);
            return element;
        }
        return null;
    }

    #resetElement(element) {
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

    #canReuseElement(element, tagName, props) {
        return element.tagName.toLowerCase() === tagName.toLowerCase();
    }

    #updateElementProperties(element, props) {
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
    getAsyncStats() {
        return { 
            cachedAsyncProps: this.asyncCache.size,
            cachedCSS: this.cssCache.size,
            injectedCSS: this.injectedCSS.size
        };
    }
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

class Juris {
    static #inGlobal = false;
    constructor(config = {}) {
        if (config.logLevel) {
            this.setupLogging(config.logLevel);
        }
        
        log.ei && console.info(log.i('Juris framework initializing', { 
            hasServices: !!config.services, 
            hasLayout: !!config.layout, 
            hasStates: !!config.states, 
            hasComponents: !!config.components, 
            renderMode: config.renderMode || 'auto',
            features: config.features ? Object.keys(config.features) : 'default'
        }, 'framework'));

        this.services = config.services || {};
        this.layout = config.layout;        
        // Core features - always initialized (minimal)
        this.stateManager = new StateManager(config.states || {}, config.middleware || []);
        this.componentManager = new ComponentManager(this);
        this.domRenderer = new DOMRenderer(this);
        this.armedElements = new WeakMap();
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
        if (config.renderMode === 'fine-grained') this.domRenderer.setRenderMode('fine-grained');
        else if (config.renderMode === 'batch') this.domRenderer.setRenderMode('batch');
        if (config.components) {
            Object.entries(config.components).forEach(([name, component]) => {
                this.componentManager.register(name, component);
            });
        }
        
        log.ei && console.info(log.i('Juris framework initialized', { 
            componentsCount: this.componentManager.components.size, 
            headlessCount: this.headlessManager?.components?.size || 0,
            enabledFeatures: Object.keys(features)
        }, 'framework'));
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
        const currentLevel = levels[level] || 1;
        if (currentLevel > 0) {
            log.ed = false;
        }
        if (currentLevel > 1) {
            log.el && (console.log('Juris logging initialized at level:', level));
            log.el && (console.log('To change log level, use juris.setupLogging("newLevel") or set logLevel in config'));
            log.el = false;
            log.ei = false;
        }
    }

    setupIndicators(elementId, config) { this.domRenderer.setupIndicators(elementId, config); }

    createHeadlessContext(element = null) {
        const context = {
            getState: (path, defaultValue, track) => this.stateManager.getState(path, defaultValue, track),
            setState: (path, value, context) => this.stateManager.setState(path, value, context),
            executeBatch: (callback) => this.executeBatch(callback),
            subscribe: (path, callback) => this.stateManager.subscribe(path, callback),
            services: this.services,
            ...(this.services || {}),
            headless: this.headlessManager?.context,
            isSSR: typeof MutationObserver === 'undefined',
            ...(this.headlessAPIs || {}),
            components: {
                register: (name, component) => this.componentManager.register(name, component),
                registerHeadless: (name, component, options) => this.headlessManager?.register(name, component, options),
                get: name => this.componentManager.components.get(name),
                getHeadless: name => this.headlessManager?.getInstance(name),
                initHeadless: (name, props) => this.headlessManager?.initialize(name, props),
                reinitHeadless: (name, props) => this.headlessManager?.reinitialize(name, props),
                getComponentAPI: (name) => this.getComponentAPI(name),
                getComponentElement: (name) => this.getComponentElement(name),
                getNamedComponents: () => this.componentManager.getNamedComponents(),
            },
            utils: {
                render: container => this.render(container),
                cleanup: () => this.cleanup(),
                forceRender: () => this.render(),
                getHeadlessStatus: () => this.headlessManager?.getStatus(),
            },
            juris: this,
            logger: {
                log: log, lwarn: log.w, error: log.e, info: log.i, debug: log.d, subscribe: logSub, unsubscribe: logUnsub
            }
        };

        if (element) context.element = element;
        return context;
    }

    executeBatch(callback) {return this.stateManager.executeBatch(callback);}

    createWebComponent(name, componentDefinition, options = {}) {
        if (!this.webComponentFactory) {
            log.ee && console.error(log.e('WebComponent creation requested but webComponentFactory not available'), 'application');
            return null;
        }
        return this.webComponentFactory.create(name, componentDefinition, options);
    }

    createWebComponents(components, globalOptions = {}) {
        if (!this.webComponentFactory) {
            log.ee && console.error(log.e('WebComponents creation requested but webComponentFactory not available'), 'framework');
            return {};
        }
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
            headless: this.headlessManager?.context,
            isSSR: typeof window === 'undefined',
            components: {
                register: (name, component) => this.componentManager.register(name, component),
                registerHeadless: (name, component, options) => this.headlessManager?.register(name, component, options),
                get: name => this.componentManager.components.get(name),
                getHeadless: name => this.headlessManager.getInstance(name),
                initHeadless: (name, props) => this.headlessManager?.initialize(name, props),
                reinitHeadless: (name, props) => this.headlessManager?.reinitialize(name, props),
                getHeadlessAPI: name => this.headlessManager?.getAPI(name),
                getAllHeadlessAPIs: () => this.headlessManager?.getAllAPIs(),
                getComponentAPI: (name) => this.getComponentAPI(name),
                getComponentElement: (name) => this.getComponentElement(name),
                getNamedComponents: () => this.componentManager.getNamedComponents(),
            },
            utils: {
                render: container => this.render(container),
                cleanup: () => this.cleanup(),
                forceRender: () => this.render(),
                setRenderMode: mode => this.setRenderMode(mode),
                getRenderMode: () => this.getRenderMode(),
                isFineGrained: () => this.isFineGrained(),
                isBatchMode: () => this.isBatchMode(),
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
        if (element) context.element = element;
        return context;
    }

    getState(path, defaultValue, track) { return this.stateManager.getState(path, defaultValue, track); }
    setState(path, value, context) {
        log.ed && console.debug(log.d('Public setState called', { path }, 'application'));
        return this.stateManager.setState(path, value, context);
    }
    subscribe(path, callback, hierarchical = true) { return this.stateManager.subscribe(path, callback, hierarchical); }
    subscribeExact(path, callback) { return this.stateManager.subscribeExact(path, callback); }
    registerComponent(name, component) {
        log.ei && console.info(log.i('Public component registration', { name }, 'application'));
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
    getHeadlessAPI(name) { return this.headlessManager?.getAPI(name); }
    registerAndInitHeadless(name, componentFn, options = {}) {
        this.headlessManager.register(name, componentFn, options);
        return this.headlessManager.initialize(name, options);
    }

    getHeadlessStatus() { return this.headlessManager.getStatus(); }
    objectToHtml(vnode) { return this.domRenderer.render(vnode); }

    render(container = '#app') {
        const startTime = performance.now();
        log.ei && console.info(log.i('Render started', { container }, 'application'));        
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
                    this.domRenderer._handleChildrenFineGrained(containerEl, this.layout, subscriptions);
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
            if (isHydration) {
                this.#renderWithHydration(containerEl);
            } else {
                this.#renderImmediate(containerEl);
            }
            
            const duration = performance.now() - startTime;
            log.ei && console.info(log.i('Render completed', { 
                duration: `${duration.toFixed(2)}ms`, 
                isHydration 
            }, 'application'));
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
    getEnhancementStats() { 
        if (!this.domEnhancer) {
            return { error: 'domEnhancer not available' };
        }
        return this.domEnhancer.getStats(); 
    }

    // Enhanced arm() API - Testing-focused minimal modification
    arm(target, handlerFn) {
        log.ei && console.info(log.i('ARM: Arming element', { target: target.tagName || target.constructor.name }, 'framework'));
        
        const context = this.createContext(target);
        const handlers = handlerFn(context);
        const eventListeners = [];
        const jurisInstance = this; // Capture Juris instance
        
        // Setup event listeners
        for (const eventName in handlers) {
            if (handlers.hasOwnProperty(eventName) && eventName.startsWith('on')) {
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
                    eventListeners.push({ 
                        original: eventName,
                        actual: actualEventName, 
                        handler 
                    });
                    
                    log.ed && console.debug(log.d('ARM: Event listener attached', { 
                        target: target.tagName || target.constructor.name, 
                        originalEvent: eventName,
                        actualEvent: actualEventName 
                    }, 'framework'));
                }
            }
        }
        
        // Return object with events exposed for testing
        const armedInstance = {
            // For testing: expose registered events
            events: eventListeners.map(e => ({
                name: e.original,
                actualEvent: e.actual,
                handler: e.handler
            })),
            
            // For testing: manually trigger events
            trigger(eventName, eventData = {}) {
                const listener = eventListeners.find(e => 
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
            
            // Clean cleanup method
            cleanup() {
                log.ed && console.debug(log.d('ARM: Disarming element', { 
                    target: target.tagName || target.constructor.name,
                    removedListeners: eventListeners.length
                }, 'framework'));
                
                eventListeners.forEach(({ actual, handler }) => {
                    target.removeEventListener(actual, handler);
                });
                jurisInstance.armedElements.delete(target);
                return true;
            }
        };
        
        // Store armed data
        jurisInstance.armedElements.set(target, { eventListeners, context, instance: armedInstance });
        
        return armedInstance;
    }

    cleanup() {
        log.ei && console.info(log.i('Framework cleanup initiated', {}, 'faramework'));
        this.armedElements = new WeakMap();
        this.headlessManager?.cleanup();
    }

    destroy() {
        log.ei && console.info(log.i('Framework destruction initiated', {}, 'faramework'));
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
        this.armedElements = new WeakMap();
        log.ei && console.info(log.i('Framework destroyed', {}, 'faramework'));
    }    
}
// Browser-only exports (script tag compatible)
if (typeof window !== 'undefined') {
    window.Juris = Juris;
    window.jurisVersion = jurisVersion;
    window.jurisLinesOfCode = jurisLinesOfCode;
    window.jurisMinifiedSize = jurisMinifiedSize;
    Object.freeze(Juris);
    Object.freeze(Juris.prototype);
}

// Basic CommonJS for compatibility
if (typeof module !== 'undefined' && module.exports) {           
    module.exports.Juris = Juris;
    module.exports.default = Juris;
    module.exports.jurisVersion = jurisVersion;
    module.exports.jurisLinesOfCode = jurisLinesOfCode;
    module.exports.jurisMinifiedSize = jurisMinifiedSize;
}
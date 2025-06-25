/**
 * Juris (JavaScript Unified Reactive Interface Solution)
 * Author: Resti Guay
 * Version: 0.7.0 (optimized)
 * License: MIT
 */
(function () {
    'use strict';

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

    const createPromisify = () => {
        let useNative = typeof Promise.try === 'function';
        return {
            promisify: result => useNative ? Promise.try(() => result) : result?.then ? result : Promise.resolve(result),
            setPromiseMode: mode => useNative = mode === 'native' || (mode !== 'custom' && typeof Promise.try === 'function')
        };
    };
    const { promisify, setPromiseMode } = createPromisify();

    // State Manager
    class StateManager {
        constructor(initialState = {}, middleware = []) {
            this.state = { ...initialState };
            this.middleware = [...middleware];
            this.subscribers = new Map();
            this.externalSubscribers = new Map();
            this.currentTracking = null;
            this.isUpdating = false;
            this.updateQueue = [];
            this.batchTimeout = null;
            this.batchUpdateInProgress = false;
            this.maxBatchSize = 50;
            this.batchDelayMs = 0;
            this.batchingEnabled = true;
            this.initialState = JSON.parse(JSON.stringify(initialState));
        }

        reset(preserve = []) {
            const preserved = {};
            preserve.forEach(path => {
                const value = this.getState(path);
                if (value !== null) preserved[path] = value;
            });
            this.state = {};
            Object.entries(this.initialState).forEach(([path, value]) =>
                this.setState(path, JSON.parse(JSON.stringify(value))));
            Object.entries(preserved).forEach(([path, value]) => this.setState(path, value));
        }

        getState(path, defaultValue = null) {
            if (!isValidPath(path)) return defaultValue;
            this.currentTracking?.add(path);
            const parts = getPathParts(path);
            let current = this.state;
            for (const part of parts) {
                if (current?.[part] === undefined) return defaultValue;
                current = current[part];
            }
            return current;
        }

        setState(path, value, context = {}) {
            if (!isValidPath(path) || this._hasCircularUpdate(path)) return;
            if (this.batchingEnabled && this.batchDelayMs > 0) {
                this._queueUpdate(path, value, context);
                return;
            }
            this._setStateImmediate(path, value, context);
        }

        _setStateImmediate(path, value, context = {}) {
            const oldValue = this.getState(path);
            let finalValue = value;

            for (const middleware of this.middleware) {
                try {
                    const result = middleware({ path, oldValue, newValue: finalValue, context, state: this.state });
                    if (result !== undefined) finalValue = result;
                } catch (error) {
                    console.error('Middleware error:', error);
                }
            }

            if (deepEquals(oldValue, finalValue)) return;

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

        _queueUpdate(path, value, context) {
            this.updateQueue.push({ path, value, context, timestamp: Date.now() });
            if (this.updateQueue.length > this.maxBatchSize * 2) {
                this._processBatchedUpdates();
                return;
            }
            if (!this.batchTimeout) {
                this.batchTimeout = setTimeout(() => this._processBatchedUpdates(), this.batchDelayMs);
            }
        }

        _processBatchedUpdates() {
            if (this.batchUpdateInProgress || this.updateQueue.length === 0) return;
            this.batchUpdateInProgress = true;
            if (this.batchTimeout) {
                clearTimeout(this.batchTimeout);
                this.batchTimeout = null;
            }

            const batchSize = Math.min(this.maxBatchSize, this.updateQueue.length);
            const currentBatch = this.updateQueue.splice(0, batchSize);

            try {
                const pathGroups = new Map();
                currentBatch.forEach(update => pathGroups.set(update.path, update));
                pathGroups.forEach(update => this._setStateImmediate(update.path, update.value, update.context));
            } catch (error) {
                console.error('Error processing batched updates:', error);
            } finally {
                this.batchUpdateInProgress = false;
                if (this.updateQueue.length > 0) setTimeout(() => this._processBatchedUpdates(), 0);
            }
        }

        configureBatching(options = {}) {
            this.maxBatchSize = options.maxBatchSize || this.maxBatchSize;
            this.batchDelayMs = options.batchDelayMs !== undefined ? options.batchDelayMs : this.batchDelayMs;
            if (options.enabled !== undefined) this.batchingEnabled = options.enabled;
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
                            console.error('External subscriber error:', error);
                        }
                    }
                });
            });
        }

        _triggerPathSubscribers(path) {
            const subs = this.subscribers.get(path);
            if (subs) {
                new Set(subs).forEach(callback => {
                    try {
                        const oldTracking = this.currentTracking;
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
                        console.error('Subscriber error:', error);
                        this.currentTracking = oldTracking;
                    }
                });
            }
        }

        _hasCircularUpdate(path) {
            if (!this.currentlyUpdating) this.currentlyUpdating = new Set();
            if (this.currentlyUpdating.has(path)) {
                console.warn(`Circular dependency detected for path: ${path}`);
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
            this.juris = juris;
            this.components = new Map();
            this.instances = new Map();
            this.context = {};
            this.initQueue = new Set();
            this.lifecycleHooks = new Map();
        }

        register(name, componentFn, options = {}) {
            this.components.set(name, { fn: componentFn, options });
            if (options.autoInit) this.initQueue.add(name);
        }

        initialize(name, props = {}) {
            const component = this.components.get(name);
            if (!component) return null;

            try {
                const context = this.juris.createHeadlessContext();
                const instance = component.fn(props, context);
                if (!instance || typeof instance !== 'object') return null;

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
                console.error(`Error initializing headless component '${name}':`, error);
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
                try { instance.hooks.onUnregister(); } catch (error) { console.error(`Error in onUnregister for '${name}':`, error); }
            }

            if (this.context[name]) delete this.context[name];
            if (this.juris.headlessAPIs?.[name]) delete this.juris.headlessAPIs[name];

            this.instances.delete(name);
            this.lifecycleHooks.delete(name);
            return this.initialize(name, props);
        }

        cleanup() {
            this.instances.forEach((instance, name) => {
                if (instance.hooks?.onUnregister) {
                    try { instance.hooks.onUnregister(); } catch (error) { console.error(`Error in onUnregister for '${name}':`, error); }
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
            this.juris = juris;
            this.components = new Map();
            this.instances = new WeakMap();
            this.componentCounters = new Map();
            this.componentStates = new WeakMap();
            this.asyncPlaceholders = new WeakMap();
            this.asyncPropsCache = new Map();
        }

        register(name, componentFn) {
            this.components.set(name, componentFn);
        }

        create(name, props = {}) {
            const componentFn = this.components.get(name);
            if (!componentFn) {
                console.error(`Component '${name}' not found`);
                return null;
            }

            try {
                if (this._hasAsyncProps(props)) return this._createWithAsyncProps(name, componentFn, props);

                const { componentId, componentStates } = this._setupComponent(name);
                const context = this._createComponentContext(componentId, componentStates);
                const result = componentFn(props, context);

                if (result?.then) return this._handleAsyncComponent(promisify(result), name, props, componentStates);
                return this._processComponentResult(result, name, props, componentStates);
            } catch (error) {
                console.error(`Error creating component '${name}':`, error);
                return this._createErrorElement(error);
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
            const placeholder = this._createPlaceholder(`Loading ${name}...`, 'juris-async-props-loading');
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
            const placeholder = this._createPlaceholder(`Loading ${name}...`, 'juris-async-loading');
            this.asyncPlaceholders.set(placeholder, { name, props, componentStates });

            resultPromise.then(result => {
                try {
                    const realElement = this._processComponentResult(result, name, props, componentStates);
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

        _processComponentResult(result, name, props, componentStates) {
            if (result && typeof result === 'object') {
                if (this._hasLifecycleHooks(result)) {
                    return this._createLifecycleComponent(result, name, props, componentStates);
                }

                if (typeof result.render === 'function' && !this._hasLifecycleHooks(result)) {
                    const renderResult = result.render();
                    if (renderResult?.then) return this._handleAsyncRender(promisify(renderResult), name, componentStates);

                    const element = this.juris.domRenderer.render(renderResult);
                    if (element && componentStates.size > 0) this.componentStates.set(element, componentStates);
                    return element;
                }

                const keys = Object.keys(result);
                if (keys.length === 1 && typeof keys[0] === 'string' && keys[0].length > 0) {
                    const element = this.juris.domRenderer.render(result);
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

        _handleAsyncRender(renderPromise, name, componentStates) {
            const placeholder = this._createPlaceholder(`Rendering ${name}...`, 'juris-async-render');

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
                                promisify(mountResult).catch(error => console.error(`Async onMount error in ${name}:`, error));
                            }
                        } catch (error) {
                            console.error(`onMount error in ${name}:`, error);
                        }
                    }, 0);
                }
            }
            return element;
        }

        _handleAsyncLifecycleRender(renderPromise, instance, componentStates) {
            const placeholder = this._createPlaceholder(`Loading ${instance.name}...`, 'juris-async-lifecycle');

            renderPromise.then(renderResult => {
                try {
                    const element = this.juris.domRenderer.render(renderResult);
                    if (element) {
                        this.instances.set(element, instance);
                        if (componentStates?.size > 0) this.componentStates.set(element, componentStates);
                        if (placeholder.parentNode) placeholder.parentNode.replaceChild(element, placeholder);

                        if (instance.hooks.onMount) {
                            setTimeout(() => {
                                try {
                                    const mountResult = instance.hooks.onMount();
                                    if (mountResult?.then) {
                                        promisify(mountResult).catch(error => console.error(`Async onMount error in ${instance.name}:`, error));
                                    }
                                } catch (error) {
                                    console.error(`onMount error in ${instance.name}:`, error);
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
                }).catch(error => console.error(`Error updating async props for ${instance.name}:`, error));
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
                        promisify(updateResult).catch(error => console.error(`Async onUpdate error in ${instance.name}:`, error));
                    }
                } catch (error) {
                    console.error(`onUpdate error in ${instance.name}:`, error);
                }
            }

            try {
                const renderResult = instance.render();
                const normalizedRenderResult = promisify(renderResult);

                if (normalizedRenderResult !== renderResult) {
                    normalizedRenderResult.then(newContent => {
                        this.juris.domRenderer.updateElementContent(element, newContent);
                    }).catch(error => console.error(`Async re-render error in ${instance.name}:`, error));
                } else {
                    this.juris.domRenderer.updateElementContent(element, renderResult);
                }
            } catch (error) {
                console.error(`Re-render error in ${instance.name}:`, error);
            }
        }

        cleanup(element) {
            const instance = this.instances.get(element);
            if (instance?.hooks?.onUnmount) {
                try {
                    const unmountResult = instance.hooks.onUnmount();
                    if (unmountResult?.then) {
                        promisify(unmountResult).catch(error => console.error(`Async onUnmount error in ${instance.name}:`, error));
                    }
                } catch (error) {
                    console.error(`onUnmount error in ${instance.name}:`, error);
                }
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

        _createPlaceholder(text, className) {
            const placeholder = document.createElement('div');
            placeholder.className = className;
            placeholder.textContent = text;
            placeholder.style.cssText = 'padding: 8px; background: #f0f0f0; border: 1px dashed #ccc; opacity: 0.7;';
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
                activePlaceholders: this.asyncPlaceholders.size,
                registeredComponents: this.components.size,
                cachedAsyncProps: this.asyncPropsCache.size
            };
        }
    }

    // DOM Renderer
    class DOMRenderer {
        constructor(juris) {
            this.juris = juris;
            this.subscriptions = new WeakMap();
            this.eventMap = {
                ondoubleclick: 'dblclick', onmousedown: 'mousedown', onmouseup: 'mouseup',
                onmouseover: 'mouseover', onmouseout: 'mouseout', onmousemove: 'mousemove',
                onkeydown: 'keydown', onkeyup: 'keyup', onkeypress: 'keypress',
                onfocus: 'focus', onblur: 'blur', onchange: 'change', oninput: 'input',
                onsubmit: 'submit', onload: 'load', onresize: 'resize', onscroll: 'scroll'
            };
            this.elementCache = new Map();
            this.recyclePool = new Map();
            this.renderMode = 'fine-grained';
            this.failureCount = 0;
            this.maxFailures = 3;
            this.asyncCache = new Map();
            this.asyncPlaceholders = new WeakMap();
        }

        setRenderMode(mode) {
            if (['fine-grained', 'batch'].includes(mode)) {
                this.renderMode = mode;
                console.log(`Juris: Render mode set to '${mode}'`);
            }
        }

        getRenderMode() { return this.renderMode; }
        isFineGrained() { return this.renderMode === 'fine-grained'; }
        isBatchMode() { return this.renderMode === 'batch'; }

        render(vnode) {
            if (!vnode || typeof vnode !== 'object') return null;

            if (Array.isArray(vnode)) {
                const fragment = document.createDocumentFragment();
                vnode.forEach(child => {
                    const childElement = this.render(child);
                    if (childElement) fragment.appendChild(childElement);
                });
                return fragment;
            }

            const tagName = Object.keys(vnode)[0];
            const props = vnode[tagName] || {};

            if (this.juris.componentManager.components.has(tagName)) {
                const parentTracking = this.juris.stateManager.currentTracking;
                this.juris.stateManager.currentTracking = null;
                const result = this.juris.componentManager.create(tagName, props);
                this.juris.stateManager.currentTracking = parentTracking;
                return result;
            }

            if (typeof tagName !== 'string' || tagName.length === 0) return null;

            if (this.renderMode === 'fine-grained') return this._createElementFineGrained(tagName, props);

            try {
                const key = props.key || this._generateKey(tagName, props);
                const cachedElement = this.elementCache.get(key);
                if (cachedElement && this._canReuseElement(cachedElement, tagName, props)) {
                    this._updateElementProperties(cachedElement, props);
                    return cachedElement;
                }
                return this._createElementOptimized(tagName, props, key);
            } catch (error) {
                this.failureCount++;
                if (this.failureCount >= this.maxFailures) this.renderMode = 'fine-grained';
                return this._createElementFineGrained(tagName, props);
            }
        }

        _createElementFineGrained(tagName, props) {
            const element = document.createElement(tagName);
            const subscriptions = [], eventListeners = [];

            if (this._hasAsyncProps(props)) {
                this._setupAsyncElement(element, props, subscriptions, eventListeners);
            } else {
                this._setupSyncElement(element, props, subscriptions, eventListeners);
            }

            if (subscriptions.length > 0 || eventListeners.length > 0) {
                this.subscriptions.set(element, { subscriptions, eventListeners });
            }
            return element;
        }

        _hasAsyncProps(props) {
            return Object.entries(props).some(([key, value]) => !key.startsWith('on') && this._isPromiseLike(value));
        }

        _isPromiseLike(value) { return value?.then; }

        _setupAsyncElement(element, props, subscriptions, eventListeners) {
            const syncProps = {}, asyncProps = {};

            Object.entries(props).forEach(([key, value]) => {
                if (key.startsWith('on')) {
                    this._handleEvent(element, key, value, eventListeners);
                } else if (this._isPromiseLike(value)) {
                    asyncProps[key] = value;
                    this._setPlaceholder(element, key);
                } else {
                    syncProps[key] = value;
                }
            });

            this._setupSyncElement(element, syncProps, subscriptions, eventListeners);
            if (Object.keys(asyncProps).length > 0) this._resolveAsyncProps(element, asyncProps, subscriptions);
        }

        _setupSyncElement(element, props, subscriptions, eventListeners) {
            Object.entries(props).forEach(([key, value]) => {
                if (key === 'children') this._handleChildren(element, value, subscriptions);
                else if (key === 'text') this._handleText(element, value, subscriptions);
                else if (key === 'style') this._handleStyle(element, value, subscriptions);
                else if (key.startsWith('on')) this._handleEvent(element, key, value, eventListeners);
                else if (typeof value === 'function') this._handleReactiveAttribute(element, key, value, subscriptions);
                else if (key !== 'key') this._setStaticAttribute(element, key, value);
            });
        }

        _setPlaceholder(element, key) {
            const placeholders = {
                text: () => { element.textContent = '...'; element.classList.add('juris-async-loading'); },
                children: () => {
                    const placeholder = document.createElement('span');
                    placeholder.textContent = 'Loading...';
                    placeholder.className = 'juris-async-loading';
                    element.appendChild(placeholder);
                },
                className: () => element.classList.add('juris-async-loading'),
                style: () => { element.style.opacity = '0.7'; element.classList.add('juris-async-loading'); }
            };
            (placeholders[key] || (() => element.setAttribute(key, 'loading')))();
        }

        _resolveAsyncProps(element, asyncProps, subscriptions) {
            const cacheKey = this._generateAsyncCacheKey(asyncProps);
            const cached = this.asyncCache.get(cacheKey);

            if (cached && Date.now() - cached.timestamp < 5000) {
                this._applyResolvedProps(element, cached.props, subscriptions);
                return;
            }

            const resolvePromises = Object.entries(asyncProps).map(([key, value]) =>
                promisify(value)
                    .then(resolved => ({ key, value: resolved, success: true }))
                    .catch(error => ({ key, error: error.message, success: false }))
            );

            Promise.all(resolvePromises).then(results => {
                const resolvedProps = {};
                results.forEach(({ key, value, error, success }) => {
                    resolvedProps[key] = success ? value : { __asyncError: error };
                });

                this.asyncCache.set(cacheKey, { props: resolvedProps, timestamp: Date.now() });
                this._applyResolvedProps(element, resolvedProps, subscriptions);
            });
        }

        _applyResolvedProps(element, resolvedProps, subscriptions) {
            element.classList.remove('juris-async-loading');

            Object.entries(resolvedProps).forEach(([key, value]) => {
                if (value?.__asyncError) {
                    console.error(`Async prop '${key}' failed:`, value.__asyncError);
                    this._setErrorState(element, key, value.__asyncError);
                    return;
                }

                if (key === 'children') this._handleAsyncChildren(element, value, subscriptions);
                else if (key === 'text') element.textContent = value;
                else if (key === 'style') Object.assign(element.style, typeof value === 'object' ? value : {});
                else if (key === 'innerHTML') element.innerHTML = value;
                else this._setStaticAttribute(element, key, value);
            });
        }

        _setErrorState(element, key, error) {
            element.classList.add('juris-async-error');
            if (key === 'text') element.textContent = `Error: ${error}`;
            else if (key === 'children') element.innerHTML = `<span class="juris-async-error">Error: ${error}</span>`;
        }

        _handleAsyncChildren(element, children, subscriptions) {
            element.innerHTML = '';
            if (Array.isArray(children)) {
                children.forEach(child => {
                    const childElement = this.render(child);
                    if (childElement) element.appendChild(childElement);
                });
            } else if (children) {
                const childElement = this.render(children);
                if (childElement) element.appendChild(childElement);
            }
        }

        _generateAsyncCacheKey(asyncProps) {
            return JSON.stringify(asyncProps, (key, value) => this._isPromiseLike(value) ? '[Promise]' : value);
        }

        _handleChildren(element, children, subscriptions) {
            if (this.renderMode === 'fine-grained') {
                this._handleChildrenFineGrained(element, children, subscriptions);
            } else {
                this._handleChildrenOptimized(element, children, subscriptions);
            }
        }

        _handleChildrenFineGrained(element, children, subscriptions) {
            if (typeof children === 'function') this._handleReactiveChildren(element, children, subscriptions);
            else if (this._isPromiseLike(children)) this._handleAsyncChildrenDirect(element, children);
            else this._updateChildren(element, children);
        }

        _handleChildrenOptimized(element, children, subscriptions) {
            if (typeof children === 'function') {
                let lastChildrenState = null;
                let childElements = [];
                let useOptimizedPath = true;

                const updateChildren = () => {
                    try {
                        const newChildren = children();

                        if (this._isPromiseLike(newChildren)) {
                            promisify(newChildren)
                                .then(resolvedChildren => {
                                    if (resolvedChildren !== "ignore" && !this._childrenEqual(lastChildrenState, resolvedChildren)) {
                                        if (useOptimizedPath) {
                                            try {
                                                childElements = this._reconcileChildren(element, childElements, resolvedChildren);
                                                lastChildrenState = resolvedChildren;
                                            } catch (error) {
                                                console.warn('Reconciliation failed, falling back to safe rendering:', error.message);
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
                                    console.error('Error in async children function:', error);
                                    useOptimizedPath = false;
                                });
                        } else {
                            if (newChildren !== "ignore" && !this._childrenEqual(lastChildrenState, newChildren)) {
                                if (useOptimizedPath) {
                                    try {
                                        childElements = this._reconcileChildren(element, childElements, newChildren);
                                        lastChildrenState = newChildren;
                                    } catch (error) {
                                        console.warn('Reconciliation failed, falling back to safe rendering:', error.message);
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
                        console.error('Error in children function:', error);
                        useOptimizedPath = false;
                        try {
                            this._updateChildren(element, []);
                        } catch (fallbackError) {
                            console.error('Even safe fallback failed:', fallbackError);
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
                                console.warn('Initial async children failed, using safe method:', error.message);
                                useOptimizedPath = false;
                                this._updateChildren(element, []);
                            });
                    } else {
                        childElements = this._reconcileChildren(element, [], initialChildren);
                        lastChildrenState = initialChildren;
                    }
                } catch (error) {
                    console.warn('Initial reconciliation failed, using safe method:', error.message);
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
                    console.warn('Static reconciliation failed, using safe method:', error.message);
                    this._updateChildren(element, children);
                }
            }
        }

        _childrenEqual(oldChildren, newChildren) {
            return deepEquals && deepEquals(oldChildren, newChildren);
        }

        _reconcileChildren(parent, oldChildren, newChildren) {
            if (!Array.isArray(newChildren)) {
                newChildren = newChildren ? [newChildren] : [];
            }

            const newChildElements = [];
            const fragment = document.createDocumentFragment();

            const oldChildrenByKey = new Map();
            oldChildren.forEach((child, index) => {
                const key = child._jurisKey || `auto-${index}`;
                oldChildrenByKey.set(key, child);
            });

            const usedElements = new Set();

            newChildren.forEach((newChild, index) => {
                if (!newChild || typeof newChild !== 'object') return;

                const tagName = Object.keys(newChild)[0];
                const props = newChild[tagName] || {};

                const key = props.key || this._generateKey(tagName, props, index);

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
            });

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
                console.error('Error in reconcileChildren:', error);
                parent.textContent = '';
                newChildElements.forEach(child => {
                    try {
                        if (child && !this._wouldCreateCircularReference(parent, child)) {
                            parent.appendChild(child);
                        }
                    } catch (e) {
                        console.warn('Failed to append child, skipping:', e);
                    }
                });
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
                    for (let descendant of child.children) {
                        if (this._wouldCreateCircularReference(parent, descendant)) {
                            return true;
                        }
                    }
                }

            } catch (error) {
                console.warn('Error checking circular reference, assuming unsafe:', error);
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
            const recyclePoolSize = 100;

            if (pool.length < recyclePoolSize) {
                this.cleanup(element);
                this._resetElement(element);
                pool.push(element);
            }
        }

        _handleAsyncChildrenDirect(element, childrenPromise) {
            const placeholder = document.createElement('div');
            placeholder.className = 'juris-async-loading';
            placeholder.textContent = 'Loading content...';
            element.appendChild(placeholder);
            this.asyncPlaceholders.set(element, { type: 'children', placeholder });

            promisify(childrenPromise)
                .then(resolvedChildren => {
                    if (placeholder.parentNode) element.removeChild(placeholder);
                    this._updateChildren(element, resolvedChildren);
                    this.asyncPlaceholders.delete(element);
                })
                .catch(error => {
                    console.error('Async children failed:', error);
                    placeholder.textContent = `Error loading content: ${error.message}`;
                    placeholder.className = 'juris-async-error';
                });
        }

        _handleReactiveChildren(element, childrenFn, subscriptions) {
            let lastChildrenResult = null, isInitialized = false;

            const updateChildren = () => {
                try {
                    const result = childrenFn();
                    if (this._isPromiseLike(result)) {
                        promisify(result)
                            .then(resolvedResult => {
                                if (resolvedResult !== "ignore" && (!isInitialized || !deepEquals(resolvedResult, lastChildrenResult))) {
                                    this._updateChildren(element, resolvedResult);
                                    lastChildrenResult = resolvedResult;
                                    isInitialized = true;
                                }
                            })
                            .catch(error => console.error('Error in async reactive children:', error));
                    } else {
                        if (result !== "ignore" && (!isInitialized || !deepEquals(result, lastChildrenResult))) {
                            this._updateChildren(element, result);
                            lastChildrenResult = result;
                            isInitialized = true;
                        }
                    }
                } catch (error) {
                    console.error('Error in reactive children function:', error);
                }
            };

            this._createReactiveUpdate(element, updateChildren, subscriptions);
        }

        _updateChildren(element, children) {
            if (children === "ignore") return;

            Array.from(element.children).forEach(child => this.cleanup(child));
            element.textContent = '';

            const fragment = document.createDocumentFragment();
            if (Array.isArray(children)) {
                children.forEach(child => {
                    const childElement = this.render(child);
                    if (childElement) fragment.appendChild(childElement);
                });
            } else if (children) {
                const childElement = this.render(children);
                if (childElement) fragment.appendChild(childElement);
            }

            if (fragment.hasChildNodes()) element.appendChild(fragment);
        }

        _handleText(element, text, subscriptions) {
            if (typeof text === 'function') this._handleReactiveText(element, text, subscriptions);
            else if (this._isPromiseLike(text)) this._handleAsyncTextDirect(element, text);
            else element.textContent = text;
        }

        _handleAsyncTextDirect(element, textPromise) {
            element.textContent = 'Loading...';
            element.classList.add('juris-async-loading');

            promisify(textPromise)
                .then(resolvedText => {
                    element.textContent = resolvedText;
                    element.classList.remove('juris-async-loading');
                })
                .catch(error => {
                    console.error('Async text failed:', error);
                    element.textContent = `Error: ${error.message}`;
                    element.classList.add('juris-async-error');
                });
        }

        _handleReactiveText(element, textFn, subscriptions) {
            let lastTextValue = null, isInitialized = false;

            const updateText = () => {
                try {
                    const result = textFn();
                    if (this._isPromiseLike(result)) {
                        promisify(result)
                            .then(resolvedText => {
                                if (!isInitialized || resolvedText !== lastTextValue) {
                                    element.textContent = resolvedText;
                                    lastTextValue = resolvedText;
                                    isInitialized = true;
                                }
                            })
                            .catch(error => console.error('Error in async reactive text:', error));
                    } else {
                        if (!isInitialized || result !== lastTextValue) {
                            element.textContent = result;
                            lastTextValue = result;
                            isInitialized = true;
                        }
                    }
                } catch (error) {
                    console.error('Error in reactive text function:', error);
                }
            };

            this._createReactiveUpdate(element, updateText, subscriptions);
        }

        _handleStyle(element, style, subscriptions) {
            if (typeof style === 'function') this._handleReactiveStyle(element, style, subscriptions);
            else if (this._isPromiseLike(style)) this._handleAsyncStyleDirect(element, style);
            else if (typeof style === 'object') Object.assign(element.style, style);
        }

        _handleAsyncStyleDirect(element, stylePromise) {
            element.style.opacity = '0.7';
            element.classList.add('juris-async-loading');

            promisify(stylePromise)
                .then(resolvedStyle => {
                    element.style.opacity = '';
                    element.classList.remove('juris-async-loading');
                    if (typeof resolvedStyle === 'object') Object.assign(element.style, resolvedStyle);
                })
                .catch(error => console.error('Async style failed:', error));
        }

        _handleReactiveStyle(element, styleFn, subscriptions) {
            let lastStyleValue = null, isInitialized = false;

            const updateStyle = () => {
                try {
                    const result = styleFn();
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
                            .catch(error => console.error('Error in async reactive style:', error));
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
                    console.error('Error in reactive style function:', error);
                }
            };

            this._createReactiveUpdate(element, updateStyle, subscriptions);
        }

        _createElementOptimized(tagName, props, key) {
            let element = this._getRecycledElement(tagName);
            if (!element) element = document.createElement(tagName);

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
            Object.keys(props).forEach(key => {
                const value = props[key];
                if (key === 'children') this._handleChildren(element, value, subscriptions);
                else if (key === 'text') this._handleText(element, value, subscriptions);
                else if (key === 'innerHTML') {
                    if (typeof value === 'function') this._handleReactiveAttribute(element, key, value, subscriptions);
                    else element.innerHTML = value;
                }
                else if (key === 'style') this._handleStyle(element, value, subscriptions);
                else if (key.startsWith('on')) this._handleEvent(element, key, value, eventListeners);
                else if (typeof value === 'function') this._handleReactiveAttribute(element, key, value, subscriptions);
                else if (key !== 'key') this._setStaticAttribute(element, key, value);
            });
        }

        _handleEvent(element, eventName, handler, eventListeners) {
            if (eventName === 'onclick') {
                element.style.touchAction = 'manipulation';
                element.style.webkitTapHighlightColor = 'transparent';
                element.style.webkitTouchCallout = 'none';
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
                        if (deltaX > 10 || deltaY > 10) touchMoved = true;
                    }
                };

                const touchEnd = e => {
                    const touchDuration = Date.now() - touchStartTime;
                    if (!touchMoved && touchDuration < 300) {
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
                const actualEventName = this.eventMap[eventName.toLowerCase()] || eventName.slice(2).toLowerCase();
                element.addEventListener(actualEventName, handler);
                eventListeners.push({ eventName: actualEventName, handler });
            }
        }

        _handleReactiveAttribute(element, attr, valueFn, subscriptions) {
            let lastValue = null, isInitialized = false;

            const updateAttribute = () => {
                try {
                    const result = valueFn();
                    if (this._isPromiseLike(result)) {
                        promisify(result)
                            .then(resolvedValue => {
                                if (!isInitialized || !deepEquals(resolvedValue, lastValue)) {
                                    this._setStaticAttribute(element, attr, resolvedValue);
                                    lastValue = resolvedValue;
                                    isInitialized = true;
                                }
                            })
                            .catch(error => console.error(`Error in async reactive attribute '${attr}':`, error));
                    } else {
                        if (!isInitialized || !deepEquals(result, lastValue)) {
                            this._setStaticAttribute(element, attr, result);
                            lastValue = result;
                            isInitialized = true;
                        }
                    }
                } catch (error) {
                    console.error(`Error in reactive attribute '${attr}':`, error);
                }
            };

            this._createReactiveUpdate(element, updateAttribute, subscriptions);
        }

        _setStaticAttribute(element, attr, value) {
            if (['children', 'key'].includes(attr)) return;

            if (typeof value === 'function') {
                if (attr === 'value' && ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) {
                    element.value = value();
                    return;
                }
                console.warn(`Function value for attribute '${attr}' should be handled reactively`);
                return;
            }

            if (attr === 'className') element.className = value;
            else if (attr === 'htmlFor') element.setAttribute('for', value);
            else if (attr === 'tabIndex') element.tabIndex = value;
            else if (attr.startsWith('data-') || attr.startsWith('aria-')) element.setAttribute(attr, value);
            else if (attr in element && typeof element[attr] !== 'function') {
                try {
                    const descriptor = Object.getOwnPropertyDescriptor(element, attr) ||
                        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), attr);
                    if (!descriptor || descriptor.writable !== false) element[attr] = value;
                    else element.setAttribute(attr, value);
                } catch (error) {
                    element.setAttribute(attr, value);
                }
            } else {
                element.setAttribute(attr, value);
            }
        }

        _createReactiveUpdate(element, updateFn, subscriptions) {
            const dependencies = this.juris.stateManager.startTracking();
            const originalTracking = this.juris.stateManager.currentTracking;
            this.juris.stateManager.currentTracking = dependencies;

            try {
                updateFn();
            } catch (error) {
                console.error('Error capturing dependencies:', error);
            } finally {
                this.juris.stateManager.currentTracking = originalTracking;
            }

            dependencies.forEach(path => {
                const unsubscribe = this.juris.stateManager.subscribeInternal(path, updateFn);
                subscriptions.push(unsubscribe);
            });
        }

        updateElementContent(element, newContent) {
            this._updateChildren(element, [newContent]);
        }

        cleanup(element) {
            this.juris.componentManager.cleanup(element);

            const data = this.subscriptions.get(element);
            if (data) {
                data.subscriptions?.forEach(unsubscribe => {
                    try { unsubscribe(); } catch (error) { console.warn('Error during subscription cleanup:', error); }
                });
                data.eventListeners?.forEach(({ eventName, handler }) => {
                    try { element.removeEventListener(eventName, handler); } catch (error) { console.warn('Error during event listener cleanup:', error); }
                });
                this.subscriptions.delete(element);
            }

            if (element._jurisKey) this.elementCache.delete(element._jurisKey);
            if (this.asyncPlaceholders.has(element)) this.asyncPlaceholders.delete(element);

            try {
                Array.from(element.children || []).forEach(child => {
                    try { this.cleanup(child); } catch (error) { console.warn('Error cleaning up child element:', error); }
                });
            } catch (error) {
                console.warn('Error during children cleanup:', error);
            }
        }

        _generateKey(tagName, props) {
            if (props.key) return props.key;
            const keyProps = ['id', 'className', 'text'];
            const keyParts = [tagName];
            keyProps.forEach(prop => {
                if (props[prop] && typeof props[prop] !== 'function') {
                    keyParts.push(`${prop}:${props[prop]}`);
                }
            });
            const propsHash = this._hashProps(props);
            keyParts.push(`hash:${propsHash}`);
            return keyParts.join('|');
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
            const attributesToKeep = ['id', 'data-juris-key'];
            Array.from(element.attributes).forEach(attr => {
                if (!attributesToKeep.includes(attr.name)) element.removeAttribute(attr.name);
            });
        }

        _canReuseElement(element, tagName, props) {
            return element.tagName.toLowerCase() === tagName.toLowerCase();
        }

        _updateElementProperties(element, props) {
            Object.keys(props).forEach(key => {
                if (!['key', 'children', 'text', 'style'].includes(key)) {
                    const value = props[key];
                    if (typeof value !== 'function') this._setStaticAttribute(element, key, value);
                }
            });
        }

        clearAsyncCache() { this.asyncCache.clear(); }
        getAsyncStats() { return { cachedAsyncProps: this.asyncCache.size, activePlaceholders: this.asyncPlaceholders.size }; }
    }

    // DOM Enhancer
    class DOMEnhancer {
        constructor(juris) {
            this.juris = juris;
            this.observers = new Map();
            this.enhancedElements = new WeakSet();
            this.enhancementRules = new Map();
            this.containerEnhancements = new WeakMap();
            this.options = { debounceMs: 5, batchUpdates: true, observeSubtree: true, observeChildList: true };
            this.pendingEnhancements = new Set();
            this.enhancementTimer = null;
        }

        enhance(selector, definition, options = {}) {
            const config = { ...this.options, ...options };

            if (this._hasSelectorsCategory(definition)) return this._enhanceWithSelectors(selector, definition, config);

            this.enhancementRules.set(selector, { definition, config, type: 'simple' });
            this._enhanceExistingElements(selector, definition, config);

            if (config.observeNewElements !== false) this._setupMutationObserver(selector, definition, config);
            return () => this._unenhance(selector);
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

        _enhanceWithSelectors(containerSelector, definition, config) {
            this.enhancementRules.set(containerSelector, { definition, config, type: 'selectors' });
            this._enhanceExistingContainers(containerSelector, definition, config);
            if (config.observeNewElements !== false) this._setupSelectorsObserver(containerSelector, definition, config);
            return () => this._unenhanceSelectors(containerSelector);
        }

        _enhanceExistingContainers(containerSelector, definition, config) {
            document.querySelectorAll(containerSelector).forEach(container => this._enhanceContainer(container, definition, config));
        }

        _enhanceContainer(container, definition, config) {
            if (this.enhancedElements.has(container)) return;

            try {
                this.enhancedElements.add(container);
                container.setAttribute('data-juris-enhanced-container', Date.now());

                let actualDefinition = definition;
                if (typeof definition === 'function') {
                    const context = this.juris.createContext(container);
                    actualDefinition = definition(context);
                }

                if (!actualDefinition?.selectors) {
                    console.warn('Selectors enhancement must have a "selectors" property');
                    return;
                }

                const containerData = new Map();
                this.containerEnhancements.set(container, containerData);
                this._applyContainerProperties(container, actualDefinition);

                Object.entries(actualDefinition.selectors).forEach(([selector, selectorDefinition]) => {
                    this._enhanceSelector(container, selector, selectorDefinition, containerData, config);
                });
            } catch (error) {
                console.error('Error enhancing container:', error);
                this.enhancedElements.delete(container);
            }
        }

        _applyContainerProperties(container, definition) {
            const containerProps = { ...definition };
            delete containerProps.selectors;
            if (Object.keys(containerProps).length > 0) this._applyEnhancements(container, containerProps);
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
                        console.warn(`Selector '${selector}' function must return a definition object`);
                        this.enhancedElements.delete(element);
                        return;
                    }
                }

                const processedDefinition = this._processElementAwareFunctions(element, actualDefinition);
                this._applyEnhancements(element, processedDefinition);
            } catch (error) {
                console.error('Error enhancing selector element:', error);
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
                            console.warn(`Error processing element-aware function '${key}':`, error);
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

        _setupSelectorsObserver(containerSelector, definition, config) {
            const observerKey = `selectors_${containerSelector}`;
            if (this.observers.has(observerKey)) return;

            const observer = new MutationObserver(mutations => {
                if (config.debounceMs > 0) {
                    this._debouncedProcessSelectorsMutations(mutations, containerSelector, definition, config);
                } else {
                    this._processSelectorsMutations(mutations, containerSelector, definition, config);
                }
            });

            observer.observe(document.body, {
                childList: config.observeChildList,
                subtree: config.observeSubtree
            });
            this.observers.set(observerKey, observer);
        }

        _processSelectorsMutations(mutations, containerSelector, definition, config) {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this._handleNewNodeForSelectors(node, containerSelector, definition, config);
                        }
                    });
                }
            });
        }

        _handleNewNodeForSelectors(node, containerSelector, definition, config) {
            if (node.matches?.(containerSelector)) this._enhanceContainer(node, definition, config);

            if (node.querySelectorAll) {
                node.querySelectorAll(containerSelector).forEach(container => {
                    this._enhanceContainer(container, definition, config);
                });
            }

            this._enhanceNewElementsInContainers(node);
        }

        _enhanceNewElementsInContainers(node) {
            document.querySelectorAll('[data-juris-enhanced-container]').forEach(container => {
                if (!container.contains(node)) return;

                const containerData = this.containerEnhancements.get(container);
                if (!containerData) return;

                containerData.forEach((selectorData, selector) => {
                    const { definition, enhancedElements } = selectorData;

                    if (node.matches?.(selector)) {
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

        _debouncedProcessSelectorsMutations(mutations, containerSelector, definition, config) {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.pendingEnhancements.add({
                                node, containerSelector, definition, config,
                                type: 'selectors', timestamp: Date.now()
                            });
                        }
                    });
                }
            });

            if (this.enhancementTimer) clearTimeout(this.enhancementTimer);
            this.enhancementTimer = setTimeout(() => {
                this._processPendingEnhancements();
                this.enhancementTimer = null;
            }, config.debounceMs);
        }

        _unenhanceSelectors(containerSelector) {
            const observerKey = `selectors_${containerSelector}`;
            const observer = this.observers.get(observerKey);
            if (observer) {
                observer.disconnect();
                this.observers.delete(observerKey);
            }

            this.enhancementRules.delete(containerSelector);
            document.querySelectorAll(`${containerSelector}[data-juris-enhanced-container]`).forEach(container => {
                this._cleanupContainer(container);
            });
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

        _enhanceExistingElements(selector, definition, config) {
            const elements = document.querySelectorAll(selector);
            if (config.batchUpdates && elements.length > 1) {
                this._batchEnhanceElements(Array.from(elements), definition, config);
            } else {
                elements.forEach(element => this._enhanceElement(element, definition, config));
            }
        }

        _batchEnhanceElements(elements, definition, config) {
            elements.filter(element => !this.enhancedElements.has(element))
                .forEach(element => this._enhanceElement(element, definition, config));
        }

        _enhanceElement(element, definition, config) {
            if (this.enhancedElements.has(element)) return;

            try {
                this.enhancedElements.add(element);
                element.setAttribute('data-juris-enhanced', Date.now());

                let actualDefinition = definition;
                if (typeof definition === 'function') {
                    const context = this.juris.createContext(element);
                    actualDefinition = definition(context);
                    if (!actualDefinition || typeof actualDefinition !== 'object') {
                        console.warn('Enhancement function must return a definition object');
                        this.enhancedElements.delete(element);
                        return;
                    }
                }

                this._applyEnhancements(element, actualDefinition);
                config.onEnhanced?.(element, this.juris.createContext(element));
            } catch (error) {
                console.error('Error enhancing element:', error);
                this.enhancedElements.delete(element);
            }
        }

        _applyEnhancements(element, definition) {
            const subscriptions = [], eventListeners = [];
            const renderer = this.juris.domRenderer;

            Object.keys(definition).forEach(key => {
                const value = definition[key];
                try {
                    if (key === 'children') this._handleChildren(element, value, subscriptions, renderer);
                    else if (key === 'text') renderer._handleText(element, value, subscriptions);
                    else if (key === 'innerHTML') this._handleInnerHTML(element, value, subscriptions, renderer);
                    else if (key === 'style') renderer._handleStyle(element, value, subscriptions);
                    else if (key.startsWith('on')) renderer._handleEvent(element, key, value, eventListeners);
                    else if (typeof value === 'function') renderer._handleReactiveAttribute(element, key, value, subscriptions);
                    else renderer._setStaticAttribute(element, key, value);
                } catch (error) {
                    console.error(`Error processing enhancement property '${key}':`, error);
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

        _setupMutationObserver(selector, definition, config) {
            if (this.observers.has(selector)) return;

            const observer = new MutationObserver(mutations => {
                if (config.debounceMs > 0) {
                    this._debouncedProcessMutations(mutations, selector, definition, config);
                } else {
                    this._processMutations(mutations, selector, definition, config);
                }
            });

            observer.observe(document.body, {
                childList: config.observeChildList,
                subtree: config.observeSubtree
            });
            this.observers.set(selector, observer);
        }

        _processMutations(mutations, selector, definition, config) {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this._enhanceNewNode(node, selector, definition, config);
                        }
                    });
                }
            });
        }

        _enhanceNewNode(node, selector, definition, config) {
            if (node.matches?.(selector)) this._enhanceElement(node, definition, config);

            if (node.querySelectorAll) {
                node.querySelectorAll(selector).forEach(element => {
                    this._enhanceElement(element, definition, config);
                });
            }
        }

        _debouncedProcessMutations(mutations, selector, definition, config) {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.pendingEnhancements.add({
                                node, selector, definition, config, timestamp: Date.now()
                            });
                        }
                    });
                }
            });

            if (this.enhancementTimer) clearTimeout(this.enhancementTimer);
            this.enhancementTimer = setTimeout(() => {
                this._processPendingEnhancements();
                this.enhancementTimer = null;
            }, config.debounceMs);
        }

        _processPendingEnhancements() {
            const enhancements = Array.from(this.pendingEnhancements);
            this.pendingEnhancements.clear();

            enhancements.forEach(({ node, selector, definition, config, containerSelector, type }) => {
                try {
                    if (type === 'selectors') {
                        this._handleNewNodeForSelectors(node, containerSelector, definition, config);
                    } else {
                        this._enhanceNewNode(node, selector, definition, config);
                    }
                } catch (error) {
                    console.error('Error processing pending enhancement:', error);
                }
            });
        }

        _unenhance(selector) {
            const observer = this.observers.get(selector);
            if (observer) {
                observer.disconnect();
                this.observers.delete(selector);
            }

            this.enhancementRules.delete(selector);
            document.querySelectorAll(`${selector}[data-juris-enhanced]`).forEach(element => {
                this._cleanupElement(element);
            });
        }

        _cleanupElement(element) {
            this.juris.domRenderer.cleanup(element);
            this.enhancedElements.delete(element);
            element.removeAttribute('data-juris-enhanced');
            element.removeAttribute('data-juris-enhanced-selector');
        }

        configure(options) { Object.assign(this.options, options); }

        getStats() {
            const enhancedElements = document.querySelectorAll('[data-juris-enhanced]').length;
            const enhancedContainers = document.querySelectorAll('[data-juris-enhanced-container]').length;
            const enhancedSelectors = document.querySelectorAll('[data-juris-enhanced-selector]').length;

            return {
                enhancementRules: this.enhancementRules.size,
                activeObservers: this.observers.size,
                pendingEnhancements: this.pendingEnhancements.size,
                enhancedElements, enhancedContainers, enhancedSelectors,
                totalEnhanced: enhancedElements + enhancedSelectors
            };
        }

        destroy() {
            this.observers.forEach(observer => observer.disconnect());
            this.observers.clear();
            this.enhancementRules.clear();

            if (this.enhancementTimer) {
                clearTimeout(this.enhancementTimer);
                this.enhancementTimer = null;
            }

            document.querySelectorAll('[data-juris-enhanced], [data-juris-enhanced-selector]').forEach(element => {
                this._cleanupElement(element);
            });

            document.querySelectorAll('[data-juris-enhanced-container]').forEach(container => {
                this._cleanupContainer(container);
            });

            this.pendingEnhancements.clear();
        }
    }

    // Main Juris Class
    class Juris {
        constructor(config = {}) {
            this.services = config.services || {};
            this.layout = config.layout;

            this.stateManager = new StateManager(config.states || {}, config.middleware || []);
            this.headlessManager = new HeadlessManager(this);
            this.componentManager = new ComponentManager(this);
            this.domRenderer = new DOMRenderer(this);
            this.domEnhancer = new DOMEnhancer(this);

            if (config.headlessComponents) {
                Object.entries(config.headlessComponents).forEach(([name, config]) => {
                    if (typeof config === 'function') {
                        this.headlessManager.register(name, config);
                    } else {
                        this.headlessManager.register(name, config.fn, config.options);
                    }
                });
            }
            this.headlessManager.initializeQueued();

            if (config.renderMode === 'fine-grained') this.domRenderer.setRenderMode('fine-grained');
            else if (config.renderMode === 'batch') this.domRenderer.setRenderMode('batch');

            if (config.legacyMode === true) {
                console.warn('legacyMode is deprecated. Use renderMode: "fine-grained" instead.');
                this.domRenderer.setRenderMode('fine-grained');
            }

            if (config.components) {
                Object.entries(config.components).forEach(([name, component]) => {
                    this.componentManager.register(name, component);
                });
            }
        }

        init() { }

        createHeadlessContext(element = null) {
            const context = {
                getState: (path, defaultValue) => this.stateManager.getState(path, defaultValue),
                setState: (path, value, context) => this.stateManager.setState(path, value, context),
                subscribe: (path, callback) => this.stateManager.subscribe(path, callback),
                services: this.services,
                ...(this.services || {}),
                headless: this.headlessManager.context,
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
                    getHeadlessStatus: () => this.headlessManager.getStatus()
                },
                juris: this
            };

            if (element) context.element = element;
            return context;
        }

        createContext(element = null) {
            const context = {
                getState: (path, defaultValue) => this.stateManager.getState(path, defaultValue),
                setState: (path, value, context) => this.stateManager.setState(path, value, context),
                subscribe: (path, callback) => this.stateManager.subscribe(path, callback),
                services: this.services,
                ...(this.services || {}),
                ...(this.headlessAPIs || {}),
                headless: this.headlessManager.context,
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
                    getHeadlessStatus: () => this.headlessManager.getStatus()
                },
                juris: this
            };

            if (element) context.element = element;
            return context;
        }

        // Public API
        getState(path, defaultValue) { return this.stateManager.getState(path, defaultValue); }
        setState(path, value, context) { return this.stateManager.setState(path, value, context); }
        subscribe(path, callback, hierarchical = true) { return this.stateManager.subscribe(path, callback, hierarchical); }
        subscribeExact(path, callback) { return this.stateManager.subscribeExact(path, callback); }

        registerComponent(name, component) { return this.componentManager.register(name, component); }
        registerHeadlessComponent(name, component, options) { return this.headlessManager.register(name, component, options); }
        getComponent(name) { return this.componentManager.components.get(name); }
        getHeadlessComponent(name) { return this.headlessManager.getInstance(name); }
        initializeHeadlessComponent(name, props) { return this.headlessManager.initialize(name, props); }

        setRenderMode(mode) { this.domRenderer.setRenderMode(mode); }
        getRenderMode() { return this.domRenderer.getRenderMode(); }
        isFineGrained() { return this.domRenderer.isFineGrained(); }
        isBatchMode() { return this.domRenderer.isBatchMode(); }

        enableLegacyMode() {
            console.warn('enableLegacyMode() is deprecated. Use setRenderMode("fine-grained") instead.');
            this.setRenderMode('fine-grained');
        }

        disableLegacyMode() {
            console.warn('disableLegacyMode() is deprecated. Use setRenderMode("batch") instead.');
            this.setRenderMode('batch');
        }

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
            const containerEl = typeof container === 'string' ? document.querySelector(container) : container;
            if (!containerEl) {
                console.error('Container not found:', container);
                return;
            }

            Array.from(containerEl.children).forEach(child => this.domRenderer.cleanup(child));
            containerEl.innerHTML = '';
            this.headlessManager.initializeQueued();

            try {
                if (!this.layout) {
                    containerEl.innerHTML = '<p>No layout configured</p>';
                    return;
                }

                const element = this.domRenderer.render(this.layout);
                if (element) containerEl.appendChild(element);
            } catch (error) {
                console.error('Render error:', error);
                this._renderError(containerEl, error);
            }
        }

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

        cleanup() { this.headlessManager.cleanup(); }

        destroy() {
            this.cleanup();
            this.domEnhancer.destroy();
            this.stateManager.subscribers.clear();
            this.stateManager.externalSubscribers.clear();
            this.componentManager.components.clear();
            this.headlessManager.components.clear();
        }
    }

    // Export
    if (typeof window !== 'undefined') {
        window.Juris = Juris;
        window.deepEquals = deepEquals;
        window.setPromiseMode = setPromiseMode;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Juris;
        module.exports.deepEquals = deepEquals;
        module.exports.setPromiseMode = setPromiseMode;
    }

})();
/**
 * Caution: This is not just a framework, its a paradigm-shifting platform.
 * Juris (JavaScript Unified Reactive Interface Solution)
 * Transforms web development through its comprehensive object-first architecture that makes
 * reactivity an intentional choice rather than an automatic behavior. By expressing interfaces
 * as pure JavaScript objects where functions explicitly define reactivity, Juris delivers a
 * complete solution for applications that are universally deployable, precisely controlled,
 * and designed from the ground up for seamless AI collaboration—all while maintaining the 
 * simplicity and debuggability of native JavaScript patterns.
 * 
 * Author: Resti Guay
 * Maintained by: Juris Github Team
 * Version: 0.5.0 (stable)
 * License: MIT
 * GitHub: https://github.com/jurisjs/juris
 * Website: https://jurisjs.com
 * Documentation: https://jurisjs.com/#docs
 */
(function () {
    'use strict';

    /**
     * Utility functions
     */
    function isValidPath(path) {
        return typeof path === 'string' && path.trim().length > 0 && !path.includes('..');
    }

    function getPathParts(path) {
        return path.split('.').filter(Boolean);
    }

    function deepEquals(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return false;
        if (typeof a !== typeof b) return false;

        if (typeof a === 'object') {
            if (Array.isArray(a) !== Array.isArray(b)) return false;
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);
            if (keysA.length !== keysB.length) return false;

            for (let key of keysA) {
                if (!keysB.includes(key) || !deepEquals(a[key], b[key])) {
                    return false;
                }
            }
            return true;
        }

        return false;
    }

    /**
     * State Manager - Handles reactive state with middleware support
     */
    class StateManager {
        constructor(initialState = {}, middleware = []) {
            this.state = { ...initialState };
            this.middleware = [...middleware];
            this.subscribers = new Map();
            this.externalSubscribers = new Map();
            this.currentTracking = null;
            this.isUpdating = false;

            // Batch update system
            this.updateQueue = [];
            this.batchTimeout = null;
            this.batchUpdateInProgress = false;
            this.maxBatchSize = 50;
            this.batchDelayMs = 0; // ✅ FIXED: Non-zero default for batching
            this.batchingEnabled = true; // ✅ FIXED: Add batching control
        }

        getState(path, defaultValue = null) {
            if (!isValidPath(path)) {
                console.warn('Invalid state path:', path);
                return defaultValue;
            }

            if (this.currentTracking) {
                this.currentTracking.add(path);
            }

            const parts = getPathParts(path);
            let current = this.state;

            for (const part of parts) {
                if (current == null || current[part] === undefined) {
                    return defaultValue;
                }
                current = current[part];
            }

            return current;
        }

        setState(path, value, context = {}) {
            if (!isValidPath(path)) {
                console.warn('Invalid state path:', path);
                return;
            }

            if (this._hasCircularUpdate(path)) {
                return;
            }

            // Route to batching if enabled
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
                    const result = middleware({
                        path,
                        oldValue,
                        newValue: finalValue,
                        context,
                        state: this.state
                    });
                    if (result !== undefined) {
                        finalValue = result;
                    }
                } catch (error) {
                    console.error('Middleware error:', error);
                }
            }

            if (deepEquals(oldValue, finalValue)) {
                return;
            }

            const parts = getPathParts(path);
            let current = this.state;

            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (current[part] == null || typeof current[part] !== 'object') {
                    current[part] = {};
                }
                current = current[part];
            }

            current[parts[parts.length - 1]] = finalValue;

            if (!this.isUpdating) {
                this.isUpdating = true;

                if (!this.currentlyUpdating) {
                    this.currentlyUpdating = new Set();
                }
                this.currentlyUpdating.add(path);

                this._notifySubscribers(path, finalValue, oldValue);
                this._notifyExternalSubscribers(path, finalValue, oldValue); // ✅ Now hierarchical

                this.currentlyUpdating.delete(path);
                this.isUpdating = false;
            }
        }


        _processBatchedUpdates() {
            if (this.batchUpdateInProgress || this.updateQueue.length === 0) {
                return;
            }

            this.batchUpdateInProgress = true;

            if (this.batchTimeout) {
                clearTimeout(this.batchTimeout);
                this.batchTimeout = null;
            }

            const batchSize = Math.min(this.maxBatchSize, this.updateQueue.length);
            const currentBatch = this.updateQueue.splice(0, batchSize);

            try {
                // ✅ FIXED: Group updates by path and take latest value
                const pathGroups = new Map();

                currentBatch.forEach(update => {
                    pathGroups.set(update.path, update); // Latest update wins
                });

                // ✅ FIXED: Process unique paths only
                const affectedPaths = new Set();

                pathGroups.forEach((update) => {
                    this._setStateImmediate(update.path, update.value, update.context);
                    affectedPaths.add(update.path);
                });

                console.log(`Batched ${currentBatch.length} updates into ${pathGroups.size} unique state changes`);

            } catch (error) {
                console.error('Error processing batched updates:', error);
            } finally {
                this.batchUpdateInProgress = false;

                if (this.updateQueue.length > 0) {
                    setTimeout(() => this._processBatchedUpdates(), 0);
                }
            }
        }

        configureBatching(options = {}) {
            this.maxBatchSize = options.maxBatchSize || this.maxBatchSize;
            this.batchDelayMs = options.batchDelayMs !== undefined ? options.batchDelayMs : this.batchDelayMs;

            if (options.enabled !== undefined) {
                this.batchingEnabled = options.enabled;
            }

            console.log(`Batching configured: enabled=${this.batchingEnabled}, delay=${this.batchDelayMs}ms, maxSize=${this.maxBatchSize}`);
        }

        getBatchStatus() {
            return {
                enabled: this.batchingEnabled,
                queueLength: this.updateQueue.length,
                inProgress: this.batchUpdateInProgress,
                hasTimeout: !!this.batchTimeout,
                delayMs: this.batchDelayMs,
                maxBatchSize: this.maxBatchSize
            };
        }

        _queueUpdate(path, value, context) {
            this.updateQueue.push({ path, value, context, timestamp: Date.now() });

            if (this.updateQueue.length > this.maxBatchSize * 2) {
                console.warn('Update queue is getting large, processing immediately');
                this._processBatchedUpdates();
                return;
            }

            if (!this.batchTimeout) {
                this.batchTimeout = setTimeout(() => {
                    this._processBatchedUpdates();
                }, this.batchDelayMs);
            }
        }

        subscribe(path, callback, hierarchical = true) {
            if (!this.externalSubscribers.has(path)) {
                this.externalSubscribers.set(path, new Set());
            }

            // Store callback with hierarchical flag
            const subscription = { callback, hierarchical };
            this.externalSubscribers.get(path).add(subscription);

            return () => {
                const subs = this.externalSubscribers.get(path);
                if (subs) {
                    subs.delete(subscription);
                    if (subs.size === 0) {
                        this.externalSubscribers.delete(path);
                    }
                }
            };
        }

        subscribeExact(path, callback) {
            return this.subscribe(path, callback, false);
        }

        subscribeInternal(path, callback) {
            if (!this.subscribers.has(path)) {
                this.subscribers.set(path, new Set());
            }
            this.subscribers.get(path).add(callback);

            return () => {
                const subs = this.subscribers.get(path);
                if (subs) {
                    subs.delete(callback);
                    if (subs.size === 0) {
                        this.subscribers.delete(path);
                    }
                }
            };
        }

        _notifySubscribers(path, newValue, oldValue) {
            this._triggerPathSubscribers(path);

            const parts = getPathParts(path);
            for (let i = parts.length - 1; i > 0; i--) {
                const parentPath = parts.slice(0, i).join('.');
                this._triggerPathSubscribers(parentPath);
            }

            const prefix = path ? path + '.' : '';
            const allSubscriberPaths = new Set([
                ...this.subscribers.keys(),
                ...this.externalSubscribers.keys()
            ]);

            allSubscriberPaths.forEach(subscriberPath => {
                if (subscriberPath.startsWith(prefix) && subscriberPath !== path) {
                    this._triggerPathSubscribers(subscriberPath);
                }
            });
        }

        _notifyExternalSubscribers(changedPath, newValue, oldValue) {
            // Check all external subscribers
            this.externalSubscribers.forEach((subscriptions, subscribedPath) => {
                subscriptions.forEach(subscription => {
                    const { callback, hierarchical } = subscription;

                    let shouldNotify = false;

                    if (hierarchical) {
                        // Hierarchical: notify if changedPath is under subscribedPath
                        if (changedPath === subscribedPath ||
                            changedPath.startsWith(subscribedPath + '.')) {
                            shouldNotify = true;
                        }
                    } else {
                        // Exact: notify only if paths match exactly
                        if (changedPath === subscribedPath) {
                            shouldNotify = true;
                        }
                    }

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
                const subscribersCopy = new Set(subs);

                subscribersCopy.forEach(callback => {
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
            if (!this.currentlyUpdating) {
                this.currentlyUpdating = new Set();
            }

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

    /**
     * Headless Manager - Enhanced with better lifecycle management
     */
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

            if (options.autoInit) {
                this.initQueue.add(name);
            }
        }

        initialize(name, props = {}) {
            const component = this.components.get(name);
            if (!component) {
                console.warn(`Headless component '${name}' not found`);
                return null;
            }

            try {
                const context = this.juris.createHeadlessContext();
                const instance = component.fn(props, context);

                if (!instance || typeof instance !== 'object') {
                    console.warn(`Headless component '${name}' must return an object`);
                    return null;
                }

                this.instances.set(name, instance);

                if (instance.hooks) {
                    this.lifecycleHooks.set(name, instance.hooks);
                }

                if (instance.api) {
                    this.context[name] = instance.api;

                    if (!this.juris.headlessAPIs) {
                        this.juris.headlessAPIs = {};
                    }
                    this.juris.headlessAPIs[name] = instance.api;

                    this.juris._updateComponentContexts();
                }

                if (instance.hooks?.onRegister) {
                    try {
                        instance.hooks.onRegister();
                    } catch (error) {
                        console.error(`Error in onRegister for headless component '${name}':`, error);
                    }
                }

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

        getInstance(name) {
            return this.instances.get(name);
        }

        getAPI(name) {
            return this.context[name];
        }

        getAllAPIs() {
            return { ...this.context };
        }

        reinitialize(name, props = {}) {
            if (this.instances.has(name)) {
                const instance = this.instances.get(name);
                if (instance.hooks?.onUnregister) {
                    try {
                        instance.hooks.onUnregister();
                    } catch (error) {
                        console.error(`Error in onUnregister for '${name}':`, error);
                    }
                }
            }

            if (this.context[name]) {
                delete this.context[name];
            }
            if (this.juris.headlessAPIs?.[name]) {
                delete this.juris.headlessAPIs[name];
            }

            this.instances.delete(name);
            this.lifecycleHooks.delete(name);

            return this.initialize(name, props);
        }

        cleanup() {
            this.instances.forEach((instance, name) => {
                if (instance.hooks?.onUnregister) {
                    try {
                        instance.hooks.onUnregister();
                    } catch (error) {
                        console.error(`Error in onUnregister for '${name}':`, error);
                    }
                }
            });
            this.instances.clear();
            this.context = {};
            this.lifecycleHooks.clear();

            if (this.juris.headlessAPIs) {
                this.juris.headlessAPIs = {};
            }
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

    /**
     * Component Manager - Handles UI components with lifecycle
     */
    class ComponentManager {
        constructor(juris) {
            this.juris = juris;
            this.components = new Map();
            this.instances = new WeakMap();
            this.componentCounters = new Map(); // Track instances per component name
            this.componentStates = new WeakMap();
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
                if (!this.componentCounters.has(name)) {
                    this.componentCounters.set(name, 0);
                }
                const currentCount = this.componentCounters.get(name);
                const instanceIndex = currentCount + 1;
                this.componentCounters.set(name, instanceIndex);
                const componentId = `${name}_${instanceIndex}`;
                const componentStates = new Set();

                const context = this.juris.createContext();

                // Add newState function to context
                context.newState = (key, initialValue) => {
                    const statePath = `__local.${componentId}.${key}`;

                    // Set initial value if not exists
                    if (this.juris.stateManager.getState(statePath, Symbol('not-found')) === Symbol('not-found')) {
                        this.juris.stateManager.setState(statePath, initialValue);
                    }

                    // Track this state for cleanup
                    componentStates.add(statePath);

                    const getter = () => this.juris.stateManager.getState(statePath, initialValue);
                    const setter = (value) => this.juris.stateManager.setState(statePath, value);

                    return [getter, setter];
                };

                const result = componentFn(props, context);

                if (result && typeof result === 'object') {
                    // Check for lifecycle component first
                    if (result.onMount || result.onUpdate || result.onUnmount ||
                        (typeof result.render === 'function' && (result.onMount !== undefined || result.onUpdate !== undefined || result.onUnmount !== undefined))) {
                        return this._createLifecycleComponent(result, name, props, componentStates);
                    }

                    // Check for render function pattern
                    if (typeof result.render === 'function' && !result.onMount && !result.onUpdate && !result.onUnmount) {
                        const renderResult = result.render();
                        console.log(`Render function for '${name}' returned:`, renderResult);
                        const element = this.juris.domRenderer.render(renderResult);
                        if (element && componentStates.size > 0) {
                            this.componentStates.set(element, componentStates);
                        }
                        return element;
                    }

                    // Direct VDOM return - check if it has valid tag names
                    const keys = Object.keys(result);
                    if (keys.length === 1) {
                        const tagName = keys[0];
                        // Valid HTML tag names or registered components
                        if (typeof tagName === 'string' && tagName.length > 0) {
                            const element = this.juris.domRenderer.render(result);
                            if (element && componentStates.size > 0) {
                                this.componentStates.set(element, componentStates);
                            }
                            return element;
                        }
                    }
                }

                // Fallback
                console.warn(`Component '${name}' returned unexpected structure, attempting to render:`, result);
                const element = this.juris.domRenderer.render(result);
                if (element && componentStates.size > 0) {
                    this.componentStates.set(element, componentStates);
                }
                return element;

            } catch (error) {
                console.error(`Error creating component '${name}':`, error);
                return this._createErrorElement(error);
            }
        }

        // Helper method to detect VDOM structure
        _isVDOMStructure(obj) {
            if (!obj || typeof obj !== 'object') return false;

            const keys = Object.keys(obj);
            if (keys.length !== 1) return false;

            const tagName = keys[0];

            // Check if it's a valid HTML tag name or component name
            return typeof tagName === 'string' &&
                (this.juris.componentManager.components.has(tagName) ||
                    /^[a-zA-Z][a-zA-Z0-9-]*$/.test(tagName));
        }

        _createLifecycleComponent(componentResult, name, props, componentStates) {
            const instance = {
                name,
                props,
                hooks: componentResult.hooks || {},
                api: componentResult.api || {},
                render: componentResult.render
            };

            const element = this.juris.domRenderer.render(instance.render());
            if (element) {
                this.instances.set(element, instance);

                // Store component states for cleanup
                if (componentStates && componentStates.size > 0) {
                    this.componentStates.set(element, componentStates);
                }

                if (instance.hooks.onMount) {
                    setTimeout(() => {
                        if (element.isConnected) {
                            try {
                                instance.hooks.onMount();
                            } catch (error) {
                                console.error(`onMount error in ${name}:`, error);
                            }
                        }
                    }, 0);
                }
            }

            return element;
        }

        updateInstance1(element, newProps) {
            const instance = this.instances.get(element);
            if (!instance) return;

            const oldProps = instance.props;

            // ✅ NEW: Check if props have actually changed using deep comparison
            if (deepEquals(oldProps, newProps)) {
                console.log(`Skipping re-render for ${instance.name} - props unchanged`);
                return; // Skip re-render if props are identical
            }

            instance.props = newProps;

            if (instance.hooks.onUpdate) {
                try {
                    instance.hooks.onUpdate(oldProps, newProps);
                } catch (error) {
                    console.error(`onUpdate error in ${instance.name}:`, error);
                }
            }

            try {
                const newContent = instance.render();
                this.juris.domRenderer.updateElementContent(element, newContent);
            } catch (error) {
                console.error(`Re-render error in ${instance.name}:`, error);
            }
        }

        cleanup(element) {
            const instance = this.instances.get(element);
            if (instance && instance.hooks.onUnmount) {
                try {
                    instance.hooks.onUnmount();
                } catch (error) {
                    console.error(`onUnmount error in ${instance.name}:`, error);
                }
            }

            // Cleanup component local states
            const states = this.componentStates.get(element);
            if (states) {
                states.forEach(statePath => {
                    // Remove from global state
                    const pathParts = statePath.split('.');
                    let current = this.juris.stateManager.state;
                    for (let i = 0; i < pathParts.length - 1; i++) {
                        if (current[pathParts[i]]) {
                            current = current[pathParts[i]];
                        } else {
                            return; // Path doesn't exist
                        }
                    }
                    delete current[pathParts[pathParts.length - 1]];
                });
                this.componentStates.delete(element);
            }

            this.instances.delete(element);
        }

        _createErrorElement(error) {
            const element = document.createElement('div');
            element.style.cssText = 'color: red; border: 1px solid red; padding: 8px; background: #ffe6e6;';
            element.textContent = `Component Error: ${error.message}`;
            return element;
        }
    }

    /**
     * OPTIMIZED DOM Renderer with renderMode support
     */
    class DOMRenderer {
        constructor(juris) {
            this.juris = juris;
            this.subscriptions = new WeakMap();
            this.eventMap = {
                ondoubleclick: 'dblclick',
                onmousedown: 'mousedown',
                onmouseup: 'mouseup',
                onmouseover: 'mouseover',
                onmouseout: 'mouseout',
                onmousemove: 'mousemove',
                onkeydown: 'keydown',
                onkeyup: 'keyup',
                onkeypress: 'keypress',
                onfocus: 'focus',
                onblur: 'blur',
                onchange: 'change',
                oninput: 'input',
                onsubmit: 'submit',
                onload: 'load',
                onresize: 'resize',
                onscroll: 'scroll'
            };

            // VDOM-style optimizations
            this.elementCache = new Map();
            this.recyclePool = new Map();
            this.renderQueue = [];
            this.isRendering = false;
            this.scheduledRender = null;

            // Performance settings
            this.batchSize = 20;
            this.recyclePoolSize = 100;

            // RENDER MODE: Choose between fine-grained and batch rendering
            this.renderMode = 'fine-grained'; // 'batch' or 'fine-grained'
            this.failureCount = 0;
            this.maxFailures = 3;

            this.renderStats = {
                totalUpdates: 0,
                skippedUpdates: 0,
                lastReset: Date.now()
            };
        }

        getRenderStats() {
            const now = Date.now();
            const duration = (now - this.renderStats.lastReset) / 1000;
            const skipRate = this.renderStats.totalUpdates > 0
                ? (this.renderStats.skippedUpdates / this.renderStats.totalUpdates * 100).toFixed(1)
                : 0;

            return {
                totalUpdates: this.renderStats.totalUpdates,
                skippedUpdates: this.renderStats.skippedUpdates,
                skipRate: `${skipRate}%`,
                duration: `${duration.toFixed(1)}s`
            };
        }

        resetRenderStats() {
            this.renderStats = {
                totalUpdates: 0,
                skippedUpdates: 0,
                lastReset: Date.now()
            };
        }

        // PUBLIC: Set render mode
        setRenderMode(mode) {
            if (mode === 'fine-grained' || mode === 'batch') {
                this.renderMode = mode;
                console.log(`Juris: Render mode set to '${mode}'`);
                if (mode === 'fine-grained') {
                    console.log('  → Using direct DOM updates (more compatible)');
                } else {
                    console.log('  → Using VDOM-style reconciliation (higher performance)');
                }
            } else {
                console.warn(`Invalid render mode '${mode}'. Use 'fine-grained' or 'batch'`);
            }
        }

        getRenderMode() {
            return this.renderMode;
        }

        isFineGrained() {
            return this.renderMode === 'fine-grained';
        }

        isBatchMode() {
            return this.renderMode === 'batch';
        }

        // DEPRECATED: Legacy method names for backward compatibility
        setLegacyMode(enabled) {
            console.warn('setLegacyMode() is deprecated. Use setRenderMode() instead.');
            this.setRenderMode(enabled ? 'fine-grained' : 'batch');
        }

        isLegacyMode() {
            console.warn('isLegacyMode() is deprecated. Use isFineGrained() instead.');
            return this.isFineGrained();
        }

        render(vnode) {
            if (!vnode || typeof vnode !== 'object') {
                return null;
            }

            // ✅ NEW: Handle arrays of vnodes
            if (Array.isArray(vnode)) {
                //console.log('DOMRenderer.render received array:', vnode);
                const fragment = document.createDocumentFragment();
                vnode.forEach(child => {
                    const childElement = this.render(child);
                    if (childElement) {
                        fragment.appendChild(childElement);
                    }
                });
                return fragment;
            }

            // Debug log
            //console.log('DOMRenderer.render received:', vnode);

            const tagName = Object.keys(vnode)[0];
            const props = vnode[tagName] || {};

            // Debug log
            //console.log('Extracted tagName:', tagName, 'type:', typeof tagName);

            // Check if it's a registered component
            if (this.juris.componentManager.components.has(tagName)) {
                const parentTracking = this.juris.stateManager.currentTracking;
                this.juris.stateManager.currentTracking = null;

                const result = this.juris.componentManager.create(tagName, props);

                this.juris.stateManager.currentTracking = parentTracking;
                return result;
            }

            // Validate tagName before creating element
            if (typeof tagName !== 'string' || tagName.length === 0) {
                console.error('Invalid tagName:', tagName, 'from vnode:', vnode);
                return null;
            }

            // FINE-GRAINED MODE: Use direct DOM updates
            if (this.renderMode === 'fine-grained') {
                return this._createElementFineGrained(tagName, props);
            }

            // BATCH MODE: Try optimized reconciliation with automatic fallback
            try {
                const key = props.key || this._generateKey(tagName, props);
                const cachedElement = this.elementCache.get(key);

                if (cachedElement && this._canReuseElement(cachedElement, tagName, props)) {
                    this._updateElementProperties(cachedElement, props);
                    return cachedElement;
                }

                return this._createElementOptimized(tagName, props, key);
            } catch (error) {
                console.warn('Batch rendering failed, falling back to fine-grained mode:', error.message);
                this.failureCount++;

                if (this.failureCount >= this.maxFailures) {
                    console.log('Too many batch failures, switching to fine-grained mode permanently');
                    this.renderMode = 'fine-grained';
                }

                return this._createElementFineGrained(tagName, props);
            }
        }

        // FINE-GRAINED: Direct DOM manipulation method
        _createElementFineGrained(tagName, props) {
            // Debug logging to catch the issue
            /*console.log('_createElementFineGrained called with:', {
                tagName: tagName,
                tagNameType: typeof tagName,
                props: props
            });*/

            // Validate inputs
            if (typeof tagName !== 'string') {
                console.error('Invalid tagName in _createElementFineGrained:', tagName);
                return null;
            }

            const element = document.createElement(tagName);
            const subscriptions = [];
            const eventListeners = [];

            Object.keys(props).forEach(key => {
                const value = props[key];

                if (key === 'children') {
                    this._handleChildrenFineGrained(element, value, subscriptions);
                } else if (key === 'text') {
                    this._handleText(element, value, subscriptions);
                } else if (key === 'style') {
                    this._handleStyleFineGrained(element, value, subscriptions);
                } else if (key.startsWith('on')) {
                    this._handleEvent(element, key, value, eventListeners);
                } else if (typeof value === 'function') {
                    this._handleReactiveAttribute(element, key, value, subscriptions);
                } else if (key !== 'key') {
                    this._setStaticAttribute(element, key, value);
                }
            });

            if (subscriptions.length > 0 || eventListeners.length > 0) {
                this.subscriptions.set(element, { subscriptions, eventListeners });
            }

            return element;
        }

        _handleChildrenFineGrained(element, children, subscriptions) {
            if (typeof children === 'function') {
                let lastChildrenResult = null;
                let isInitialized = false;

                const updateChildren = () => {
                    try {
                        const result = children();

                        // ✅ NEW: Only update if children result has actually changed
                        if (isInitialized && deepEquals(result, lastChildrenResult)) {
                            return; // Skip update if children haven't changed
                        }

                        if (result !== "ignore") {
                            this._updateChildrenFineGrained(element, result);
                            lastChildrenResult = result;
                            isInitialized = true;
                        }
                    } catch (error) {
                        console.error('Error in children function:', error);
                    }
                };

                this._createReactiveUpdate(element, updateChildren, subscriptions);

                // Initial render
                const initialResult = children();
                this._updateChildrenFineGrained(element, initialResult);
                lastChildrenResult = initialResult;
                isInitialized = true;
            } else {
                this._updateChildrenFineGrained(element, children);
            }
        }

        _updateChildrenFineGrained(element, children) {
            if (children === "ignore") {
                return;
            }

            const childrenToRemove = Array.from(element.children);
            childrenToRemove.forEach(child => {
                this.cleanup(child);
            });

            element.textContent = '';

            const fragment = document.createDocumentFragment();

            if (Array.isArray(children)) {
                children.forEach(child => {
                    const childElement = this.render(child);
                    if (childElement) {
                        fragment.appendChild(childElement);
                    }
                });
            } else if (children) {
                const childElement = this.render(children);
                if (childElement) {
                    fragment.appendChild(childElement);
                }
            }

            if (fragment.hasChildNodes()) {
                element.appendChild(fragment);
            }
        }

        _handleStyleFineGrained(element, style, subscriptions) {
            if (typeof style === 'function') {
                this._createReactiveUpdate(element, () => {
                    const styleObj = style();
                    if (typeof styleObj === 'object') {
                        Object.assign(element.style, styleObj);
                    }
                }, subscriptions);

                const initialStyle = style();
                if (typeof initialStyle === 'object') {
                    Object.assign(element.style, initialStyle);
                }
            } else if (typeof style === 'object') {
                Object.assign(element.style, style);
            }
        }

        // BATCH MODE: Optimized element creation
        _createElementOptimized(tagName, props, key) {
            let element = this._getRecycledElement(tagName);

            if (!element) {
                element = document.createElement(tagName);
            }

            if (key) {
                this.elementCache.set(key, element);
                element._jurisKey = key;
            }

            const subscriptions = [];
            const eventListeners = [];

            this._processProperties(element, props, subscriptions, eventListeners);

            if (subscriptions.length > 0 || eventListeners.length > 0) {
                this.subscriptions.set(element, { subscriptions, eventListeners });
            }

            return element;
        }

        _processProperties(element, props, subscriptions, eventListeners) {
            Object.keys(props).forEach(key => {
                const value = props[key];

                if (key === 'children') {
                    this._handleChildrenOptimized(element, value, subscriptions);
                } else if (key === 'text') {
                    this._handleText(element, value, subscriptions);
                } else if (key === 'innerHTML') {
                    if (typeof value === 'function') {
                        this._handleReactiveAttribute(element, key, value, subscriptions);
                    } else {
                        element.innerHTML = value;
                    }
                } else if (key === 'style') {
                    this._handleStyle(element, value, subscriptions);
                } else if (key.startsWith('on')) {
                    this._handleEvent(element, key, value, eventListeners);
                } else if (typeof value === 'function') {
                    this._handleReactiveAttribute(element, key, value, subscriptions);
                } else if (key !== 'key') {
                    this._setStaticAttribute(element, key, value);
                }
            });
        }

        _handleChildrenOptimized(element, children, subscriptions) {
            if (typeof children === 'function') {
                let lastChildrenState = null;
                let childElements = [];
                let useOptimizedPath = true;

                const updateChildren = () => {
                    try {
                        const newChildren = children();
                        if (newChildren !== "ignore" && !this._childrenEqual(lastChildrenState, newChildren)) {
                            if (useOptimizedPath) {
                                try {
                                    childElements = this._reconcileChildren(element, childElements, newChildren);
                                    lastChildrenState = newChildren;
                                } catch (error) {
                                    console.warn('Reconciliation failed, falling back to safe rendering:', error.message);
                                    useOptimizedPath = false;
                                    this._updateChildrenSafe(element, newChildren);
                                    lastChildrenState = newChildren;
                                }
                            } else {
                                this._updateChildrenSafe(element, newChildren);
                                lastChildrenState = newChildren;
                            }
                        }
                    } catch (error) {
                        console.error('Error in children function:', error);
                        useOptimizedPath = false;
                        try {
                            this._updateChildrenSafe(element, []);
                        } catch (fallbackError) {
                            console.error('Even safe fallback failed:', fallbackError);
                        }
                    }
                };

                this._createReactiveUpdate(element, updateChildren, subscriptions);

                try {
                    const initialChildren = children();
                    childElements = this._reconcileChildren(element, [], initialChildren);
                    lastChildrenState = initialChildren;
                } catch (error) {
                    console.warn('Initial reconciliation failed, using safe method:', error.message);
                    useOptimizedPath = false;
                    const initialChildren = children();
                    this._updateChildrenSafe(element, initialChildren);
                    lastChildrenState = initialChildren;
                }

            } else {
                try {
                    this._reconcileChildren(element, [], children);
                } catch (error) {
                    console.warn('Static reconciliation failed, using safe method:', error.message);
                    this._updateChildrenSafe(element, children);
                }
            }
        }

        _updateChildrenSafe(element, children) {
            if (children === "ignore") {
                return;
            }

            const childrenToRemove = Array.from(element.children);
            childrenToRemove.forEach(child => {
                try {
                    this.cleanup(child);
                } catch (error) {
                    console.warn('Error cleaning up child:', error);
                }
            });

            element.textContent = '';

            const fragment = document.createDocumentFragment();

            if (Array.isArray(children)) {
                children.forEach(child => {
                    try {
                        const childElement = this.render(child);
                        if (childElement && childElement !== element) {
                            fragment.appendChild(childElement);
                        }
                    } catch (error) {
                        console.warn('Error rendering child:', error);
                    }
                });
            } else if (children) {
                try {
                    const childElement = this.render(children);
                    if (childElement && childElement !== element) {
                        fragment.appendChild(childElement);
                    }
                } catch (error) {
                    console.warn('Error rendering single child:', error);
                }
            }

            try {
                if (fragment.hasChildNodes()) {
                    element.appendChild(fragment);
                }
            } catch (error) {
                console.error('Failed to append fragment, trying individual children:', error);
                Array.from(fragment.children).forEach(child => {
                    try {
                        if (child && child !== element) {
                            element.appendChild(child);
                        }
                    } catch (individualError) {
                        console.warn('Failed to append individual child:', individualError);
                    }
                });
            }
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
                    if (current === child) {
                        return true;
                    }
                    current = current.parentNode;
                }

                if (child.contains && child.contains(parent)) {
                    return true;
                }

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

        _canReuseElement(element, tagName, props) {
            return element.tagName.toLowerCase() === tagName.toLowerCase();
        }

        _updateElementProperties(element, props) {
            Object.keys(props).forEach(key => {
                if (key === 'key' || key === 'children' || key === 'text' || key === 'style') {
                    return;
                }

                const value = props[key];
                if (typeof value !== 'function') {
                    this._setStaticAttribute(element, key, value);
                }
            });
        }

        _childrenEqual(oldChildren, newChildren) {
            return false;
        }

        _generateKey(tagName, props, index = null) {
            if (props.key) {
                return props.key;
            }

            const keyProps = ['id', 'className', 'text'];
            const keyParts = [tagName];

            keyProps.forEach(prop => {
                if (props[prop] && typeof props[prop] !== 'function') {
                    keyParts.push(`${prop}:${props[prop]}`);
                }
            });

            if (index !== null) {
                keyParts.push(`idx:${index}`);
            }

            const propsHash = this._hashProps(props);
            keyParts.push(`hash:${propsHash}`);

            return keyParts.join('|');
        }

        _hashProps(props) {
            const str = JSON.stringify(props, (key, value) => {
                return typeof value === 'function' ? '[function]' : value;
            });

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
            if (pool && pool.length > 0) {
                const element = pool.pop();
                this._resetElement(element);
                return element;
            }
            return null;
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

            if (pool.length < this.recyclePoolSize) {
                this.cleanup(element);
                this._resetElement(element);
                pool.push(element);
            }
        }

        _resetElement(element) {
            element.textContent = '';
            element.className = '';
            element.removeAttribute('style');

            const attributesToKeep = ['id', 'data-juris-key'];
            const attributes = Array.from(element.attributes);

            attributes.forEach(attr => {
                if (!attributesToKeep.includes(attr.name)) {
                    element.removeAttribute(attr.name);
                }
            });
        }

        _handleText(element, text, subscriptions) {
            if (typeof text === 'function') {
                let lastTextValue = null;
                let isInitialized = false;

                this._createReactiveUpdate(element, () => {
                    const newTextValue = text();

                    // ✅ NEW: Only update if text has actually changed
                    if (isInitialized && newTextValue === lastTextValue) {
                        return; // Skip update if text hasn't changed
                    }

                    element.textContent = newTextValue;
                    lastTextValue = newTextValue;
                    isInitialized = true;
                }, subscriptions);

                const initialValue = text();
                element.textContent = initialValue;
                lastTextValue = initialValue;
                isInitialized = true;
            } else {
                element.textContent = text;
            }
        }

        _handleStyle(element, style, subscriptions) {
            if (typeof style === 'function') {
                let lastStyleState = null;
                let isInitialized = false;

                this._createReactiveUpdate(element, () => {
                    const styleObj = style();

                    // ✅ NEW: Only update if style has actually changed
                    if (isInitialized && deepEquals(styleObj, lastStyleState)) {
                        return; // Skip update if style hasn't changed
                    }

                    const cssText = this._styleObjectToCssText(styleObj);
                    element.style.cssText = cssText;
                    lastStyleState = { ...styleObj };
                    isInitialized = true;
                }, subscriptions);

                const initialStyle = style();
                const cssText = this._styleObjectToCssText(initialStyle);
                element.style.cssText = cssText;
                lastStyleState = { ...initialStyle };
                isInitialized = true;

            } else if (typeof style === 'object') {
                const reactiveProps = {};
                const staticProps = {};

                Object.keys(style).forEach(prop => {
                    if (typeof style[prop] === 'function') {
                        reactiveProps[prop] = style[prop];
                    } else {
                        staticProps[prop] = style[prop];
                    }
                });

                Object.assign(element.style, staticProps);

                if (Object.keys(reactiveProps).length > 0) {
                    const lastValues = {};
                    const initialized = {};

                    this._createReactiveUpdate(element, () => {
                        const changes = {};
                        let hasChanges = false;

                        Object.keys(reactiveProps).forEach(prop => {
                            const newValue = reactiveProps[prop]();

                            // ✅ NEW: Only update if individual style property has changed
                            if (!initialized[prop] || newValue !== lastValues[prop]) {
                                changes[prop] = newValue;
                                lastValues[prop] = newValue;
                                initialized[prop] = true;
                                hasChanges = true;
                            }
                        });

                        if (hasChanges) {
                            Object.assign(element.style, changes);
                        }
                    }, subscriptions);

                    Object.keys(reactiveProps).forEach(prop => {
                        const value = reactiveProps[prop]();
                        element.style[prop] = value;
                        lastValues[prop] = value;
                        initialized[prop] = true;
                    });
                }
            }
        }

        _styleObjectsEqual(style1, style2) {
            if (style1 === style2) return true;
            if (!style1 || !style2) return false;

            const keys1 = Object.keys(style1);
            const keys2 = Object.keys(style2);

            if (keys1.length !== keys2.length) return false;

            for (let key of keys1) {
                if (style1[key] !== style2[key]) return false;
            }

            return true;
        }

        _styleObjectToCssText(styleObj) {
            if (!styleObj || typeof styleObj !== 'object') return '';

            return Object.entries(styleObj)
                .map(([prop, value]) => {
                    const cssProp = prop.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
                    return `${cssProp}: ${value}`;
                })
                .join('; ');
        }

        _handleEvent(element, eventName, handler, eventListeners) {
            if (eventName === 'onclick') {
                element.style.touchAction = 'manipulation';
                element.style.userSelect = 'none';
                element.style.webkitTapHighlightColor = 'transparent';
                element.style.webkitTouchCallout = 'none';

                element.addEventListener('click', handler);
                eventListeners.push({ eventName: 'click', handler });

                let touchStartTime = 0;
                let touchMoved = false;
                let startX = 0;
                let startY = 0;

                const touchStart = (e) => {
                    touchStartTime = Date.now();
                    touchMoved = false;
                    if (e.touches && e.touches[0]) {
                        startX = e.touches[0].clientX;
                        startY = e.touches[0].clientY;
                    }
                };

                const touchMove = (e) => {
                    if (e.touches && e.touches[0]) {
                        const deltaX = Math.abs(e.touches[0].clientX - startX);
                        const deltaY = Math.abs(e.touches[0].clientY - startY);
                        if (deltaX > 10 || deltaY > 10) {
                            touchMoved = true;
                        }
                    }
                };

                const touchEnd = (e) => {
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

                eventListeners.push({ eventName: 'touchstart', handler: touchStart });
                eventListeners.push({ eventName: 'touchmove', handler: touchMove });
                eventListeners.push({ eventName: 'touchend', handler: touchEnd });

            } else {
                const actualEventName = this.eventMap[eventName.toLowerCase()] || eventName.slice(2).toLowerCase();
                element.addEventListener(actualEventName, handler);
                eventListeners.push({ eventName: actualEventName, handler });
            }
        }

        _handleReactiveAttribute(element, attr, valueFn, subscriptions) {
            let lastValue = null;
            let isInitialized = false;

            this._createReactiveUpdate(element, () => {
                const newValue = valueFn();

                // ✅ NEW: Only update if value has actually changed
                if (isInitialized && deepEquals(newValue, lastValue)) {
                    return; // Skip update if value hasn't changed
                }

                this._setStaticAttribute(element, attr, newValue);
                lastValue = newValue;
                isInitialized = true;
            }, subscriptions);

            const initialValue = valueFn();
            this._setStaticAttribute(element, attr, initialValue);
            lastValue = initialValue;
            isInitialized = true;
        }

        _setStaticAttribute(element, attr, value) {
            if (attr === 'children' || attr === 'key') {
                return;
            }

            // ✅ Handle function values for specific attributes
            if (typeof value === 'function') {
                if (attr === 'value' && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT')) {
                    // For form elements, evaluate the function and set the value
                    element.value = value();
                    return;
                }
                // For other attributes with functions, they should be handled by _handleReactiveAttribute
                console.warn(`Function value for attribute '${attr}' should be handled reactively`);
                return;
            }

            if (attr === 'className') {
                element.className = value;
            } else if (attr === 'htmlFor') {
                element.setAttribute('for', value);
            } else if (attr === 'tabIndex') {
                element.tabIndex = value;
            } else if (attr.startsWith('data-') || attr.startsWith('aria-')) {
                element.setAttribute(attr, value);
            } else if (attr in element && typeof element[attr] !== 'function') {
                try {
                    const descriptor = Object.getOwnPropertyDescriptor(element, attr) ||
                        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), attr);

                    if (!descriptor || descriptor.writable !== false) {
                        element[attr] = value;
                    } else {
                        element.setAttribute(attr, value);
                    }
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

        _updateChildren(element, children) {
            if (children === "ignore") {
                return;
            }

            try {
                if (Array.isArray(children)) {
                    const currentChildElements = Array.from(element.children);
                    this._reconcileChildren(element, currentChildElements, children);
                } else {
                    const childrenArray = children ? [children] : [];
                    const currentChildElements = Array.from(element.children);
                    this._reconcileChildren(element, currentChildElements, childrenArray);
                }
            } catch (error) {
                console.warn('Reconciliation failed in _updateChildren, using safe fallback:', error.message);
                this._updateChildrenSafe(element, children);
            }
        }

        updateElementContent(element, newContent) {
            this._updateChildren(element, [newContent]);
        }

        cleanup(element) {
            this.juris.componentManager.cleanup(element);

            const data = this.subscriptions.get(element);
            if (data) {
                if (data.subscriptions) {
                    data.subscriptions.forEach(unsubscribe => {
                        try {
                            unsubscribe();
                        } catch (error) {
                            console.warn('Error during subscription cleanup:', error);
                        }
                    });
                }

                if (data.eventListeners) {
                    data.eventListeners.forEach(({ eventName, handler }) => {
                        try {
                            element.removeEventListener(eventName, handler);
                        } catch (error) {
                            console.warn('Error during event listener cleanup:', error);
                        }
                    });
                }

                this.subscriptions.delete(element);
            }

            if (element._jurisKey) {
                this.elementCache.delete(element._jurisKey);
            }

            try {
                const children = Array.from(element.children || []);
                children.forEach(child => {
                    try {
                        this.cleanup(child);
                    } catch (error) {
                        console.warn('Error cleaning up child element:', error);
                    }
                });
            } catch (error) {
                console.warn('Error during children cleanup:', error);
            }

            if (element.removeAttribute) {
                try {
                    element.removeAttribute('data-juris-enhanced');
                    element.removeAttribute('data-juris-component');
                    element.removeAttribute('data-juris-key');
                } catch (error) {
                    // Ignore errors for elements that might be detached
                }
            }
        }
    }

    /**
 * Simplified DOM Enhancer - Focus on core functionality
 * Removed complex nested selector logic and selectors category for clarity
 */
    class DOMEnhancer {
        constructor(juris) {
            this.juris = juris;
            this.observers = new Map();
            this.enhancedElements = new WeakSet();
            this.enhancementRules = new Map();
            this.containerEnhancements = new WeakMap(); // Track selectors category enhancements

            // Simplified performance options
            this.options = {
                debounceMs: 5,
                batchUpdates: true,
                observeSubtree: true,
                observeChildList: true
            };

            this.pendingEnhancements = new Set();
            this.enhancementTimer = null;
        }

        // ===== CORE ENHANCEMENT METHOD =====
        enhance(selector, definition, options = {}) {
            const config = { ...this.options, ...options };

            // Check if this uses the selectors category
            if (this._hasSelectorsCategory(definition)) {
                return this._enhanceWithSelectors(selector, definition, config);
            }

            // Store the enhancement rule
            this.enhancementRules.set(selector, { definition, config, type: 'simple' });

            // Process existing elements
            this._enhanceExistingElements(selector, definition, config);

            // Setup mutation observer for new elements
            if (config.observeNewElements !== false) {
                this._setupMutationObserver(selector, definition, config);
            }

            // Return cleanup function
            return () => this._unenhance(selector);
        }

        _hasSelectorsCategory(definition) {
            // Check object definition
            if (definition && typeof definition === 'object' && definition.selectors) {
                return true;
            }

            // Check function definition
            if (typeof definition === 'function') {
                try {
                    const testContext = this.juris.createContext();
                    const result = definition(testContext);
                    return result && typeof result === 'object' && result.selectors;
                } catch (error) {
                    // If test fails, assume it's not selectors category
                    return false;
                }
            }

            return false;
        }

        // ===== SELECTORS CATEGORY ENHANCEMENT =====
        _enhanceWithSelectors(containerSelector, definition, config) {
            // Store the enhancement rule
            this.enhancementRules.set(containerSelector, {
                definition,
                config,
                type: 'selectors'
            });

            // Process existing containers
            this._enhanceExistingContainers(containerSelector, definition, config);

            // Setup mutation observer for new containers and elements
            if (config.observeNewElements !== false) {
                this._setupSelectorsObserver(containerSelector, definition, config);
            }

            // Return cleanup function
            return () => this._unenhanceSelectors(containerSelector);
        }

        _enhanceExistingContainers(containerSelector, definition, config) {
            const containers = document.querySelectorAll(containerSelector);
            containers.forEach(container => {
                this._enhanceContainer(container, definition, config);
            });
        }

        _enhanceContainer(container, definition, config) {
            if (this.enhancedElements.has(container)) {
                return;
            }

            try {
                // Mark container as enhanced
                this.enhancedElements.add(container);
                container.setAttribute('data-juris-enhanced-container', Date.now());

                // Get the definition
                let actualDefinition = definition;
                if (typeof definition === 'function') {
                    const context = this.juris.createContext(container);
                    actualDefinition = definition(context);
                }

                if (!actualDefinition || !actualDefinition.selectors) {
                    console.warn('Selectors enhancement must have a "selectors" property');
                    return;
                }

                // Track this container's enhancements
                const containerData = new Map();
                this.containerEnhancements.set(container, containerData);

                // Apply container-level properties (excluding selectors)
                this._applyContainerProperties(container, actualDefinition);

                // Process each selector
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

            // Store selector data for cleanup and new element handling
            containerData.set(selector, {
                definition,
                enhancedElements
            });
        }

        _enhanceSelectorElement(element, definition, container, selector) {
            try {
                // Mark as enhanced
                this.enhancedElements.add(element);
                element.setAttribute('data-juris-enhanced-selector', Date.now());

                // Get the actual definition
                let actualDefinition = definition;

                // If definition is a function, call it with context
                if (typeof definition === 'function') {
                    const context = this.juris.createContext(element);
                    actualDefinition = definition(context);

                    if (!actualDefinition || typeof actualDefinition !== 'object') {
                        console.warn(`Selector '${selector}' function must return a definition object`);
                        this.enhancedElements.delete(element);
                        return;
                    }
                }

                // Process element-aware functions (FIXED - no auto-execution)
                const processedDefinition = this._processElementAwareFunctions(element, actualDefinition);

                // Apply enhancements
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
                    // Check if this is an event handler (starts with 'on')
                    if (key.startsWith('on')) {
                        // Event handlers should never be auto-executed, always preserve them
                        processed[key] = value;
                    }
                    // Check if function expects parameters (element-aware) and is NOT an event handler
                    else if (value.length > 0) {
                        try {
                            // Create safe context for element-aware functions
                            const context = this.juris.createContext(element);
                            const result = value(context);

                            // Element-aware function should return an object
                            if (result && typeof result === 'object') {
                                processed[key] = result;
                            } else {
                                console.warn(`Element-aware function for '${key}' should return an object`);
                                processed[key] = value;
                            }
                        } catch (error) {
                            console.warn(`Error processing element-aware function '${key}':`, error);
                            processed[key] = value;
                        }
                    } else {
                        // No parameters = direct function (like computed properties)
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

            if (this.observers.has(observerKey)) {
                return;
            }

            const observer = new MutationObserver((mutations) => {
                if (config.debounceMs > 0) {
                    this._debouncedProcessSelectorsMutations(mutations, containerSelector, definition, config);
                } else {
                    this._processSelectorsMutations(mutations, containerSelector, definition, config);
                }
            });

            const observerConfig = {
                childList: config.observeChildList,
                subtree: config.observeSubtree
            };

            observer.observe(document.body, observerConfig);
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
            // Check if the node itself is a new container
            if (node.matches && node.matches(containerSelector)) {
                this._enhanceContainer(node, definition, config);
            }

            // Check for new containers within the node
            if (node.querySelectorAll) {
                const newContainers = node.querySelectorAll(containerSelector);
                newContainers.forEach(container => {
                    this._enhanceContainer(container, definition, config);
                });
            }

            // Check for new elements within existing containers
            this._enhanceNewElementsInContainers(node);
        }

        _enhanceNewElementsInContainers(node) {
            const containers = document.querySelectorAll('[data-juris-enhanced-container]');

            containers.forEach(container => {
                if (!container.contains(node)) return;

                const containerData = this.containerEnhancements.get(container);
                if (!containerData) return;

                containerData.forEach((selectorData, selector) => {
                    const { definition, enhancedElements } = selectorData;

                    // Check if node matches selector
                    if (node.matches && node.matches(selector)) {
                        this._enhanceSelectorElement(node, definition, container, selector);
                        enhancedElements.add(node);
                    }

                    // Check descendants
                    if (node.querySelectorAll) {
                        const matchingElements = node.querySelectorAll(selector);
                        matchingElements.forEach(element => {
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
                                node,
                                containerSelector,
                                definition,
                                config,
                                type: 'selectors',
                                timestamp: Date.now()
                            });
                        }
                    });
                }
            });

            if (this.enhancementTimer) {
                clearTimeout(this.enhancementTimer);
            }

            this.enhancementTimer = setTimeout(() => {
                this._processPendingEnhancements();
                this.enhancementTimer = null;
            }, config.debounceMs);
        }

        _unenhanceSelectors(containerSelector) {
            const observerKey = `selectors_${containerSelector}`;

            // Disconnect observer
            const observer = this.observers.get(observerKey);
            if (observer) {
                observer.disconnect();
                this.observers.delete(observerKey);
            }

            // Remove enhancement rule
            this.enhancementRules.delete(containerSelector);

            // Clean up containers
            const containers = document.querySelectorAll(`${containerSelector}[data-juris-enhanced-container]`);
            containers.forEach(container => {
                this._cleanupContainer(container);
            });
        }

        _cleanupContainer(container) {
            const containerData = this.containerEnhancements.get(container);

            if (containerData) {
                containerData.forEach((selectorData) => {
                    selectorData.enhancedElements.forEach(element => {
                        this._cleanupElement(element);
                    });
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
            const elementsToProcess = elements.filter(element => !this.enhancedElements.has(element));
            elementsToProcess.forEach(element => this._enhanceElement(element, definition, config));
        }

        _enhanceElement(element, definition, config) {
            if (this.enhancedElements.has(element)) {
                return;
            }

            try {
                // Mark as enhanced
                this.enhancedElements.add(element);
                element.setAttribute('data-juris-enhanced', Date.now());

                // Get enhancement definition
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

                // Apply enhancements using DOMRenderer
                this._applyEnhancements(element, actualDefinition);

                // Call onEnhanced callback if provided
                if (config.onEnhanced) {
                    const context = this.juris.createContext(element);
                    config.onEnhanced(element, context);
                }

            } catch (error) {
                console.error('Error enhancing element:', error);
                this.enhancedElements.delete(element);
            }
        }

        _applyEnhancements(element, definition) {
            const subscriptions = [];
            const eventListeners = [];
            const renderer = this.juris.domRenderer;

            Object.keys(definition).forEach(key => {
                const value = definition[key];

                try {
                    // Handle different property types
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
                    console.error(`Error processing enhancement property '${key}':`, error);
                }
            });

            // Store subscriptions for cleanup
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

        // ===== MUTATION OBSERVER =====
        _setupMutationObserver(selector, definition, config) {
            if (this.observers.has(selector)) {
                return; // Observer already exists
            }

            const observer = new MutationObserver((mutations) => {
                if (config.debounceMs > 0) {
                    this._debouncedProcessMutations(mutations, selector, definition, config);
                } else {
                    this._processMutations(mutations, selector, definition, config);
                }
            });

            const observerConfig = {
                childList: config.observeChildList,
                subtree: config.observeSubtree
            };

            observer.observe(document.body, observerConfig);
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
            // Check if the node itself matches
            if (node.matches && node.matches(selector)) {
                this._enhanceElement(node, definition, config);
            }

            // Check for matching descendants
            if (node.querySelectorAll) {
                const matchingElements = node.querySelectorAll(selector);
                matchingElements.forEach(element => {
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
                                node,
                                selector,
                                definition,
                                config,
                                timestamp: Date.now()
                            });
                        }
                    });
                }
            });

            if (this.enhancementTimer) {
                clearTimeout(this.enhancementTimer);
            }

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

        // ===== CLEANUP METHODS =====
        _unenhance(selector) {
            // Disconnect observer
            const observer = this.observers.get(selector);
            if (observer) {
                observer.disconnect();
                this.observers.delete(selector);
            }

            // Remove enhancement rule
            this.enhancementRules.delete(selector);

            // Clean up enhanced elements
            const elements = document.querySelectorAll(`${selector}[data-juris-enhanced]`);
            elements.forEach(element => {
                this._cleanupElement(element);
            });
        }

        _cleanupElement(element) {
            // Use DOMRenderer cleanup
            this.juris.domRenderer.cleanup(element);

            // Remove from enhanced set
            this.enhancedElements.delete(element);

            // Remove enhancement attributes
            element.removeAttribute('data-juris-enhanced');
            element.removeAttribute('data-juris-enhanced-selector');
        }

        // ===== PUBLIC API =====
        configure(options) {
            Object.assign(this.options, options);
        }

        configureRenderOptimization(options = {}) {
            if (options.enableLogging !== undefined) {
                this.renderOptimization = this.renderOptimization || {};
                this.renderOptimization.enableLogging = options.enableLogging;
            }

            console.log('Render optimization configured:', this.renderOptimization);
        }
        getStats() {
            const enhancedElements = document.querySelectorAll('[data-juris-enhanced]').length;
            const enhancedContainers = document.querySelectorAll('[data-juris-enhanced-container]').length;
            const enhancedSelectors = document.querySelectorAll('[data-juris-enhanced-selector]').length;

            return {
                enhancementRules: this.enhancementRules.size,
                activeObservers: this.observers.size,
                pendingEnhancements: this.pendingEnhancements.size,
                enhancedElements,
                enhancedContainers,
                enhancedSelectors,
                totalEnhanced: enhancedElements + enhancedSelectors
            };
        }

        destroy() {
            // Disconnect all observers
            this.observers.forEach(observer => observer.disconnect());
            this.observers.clear();

            // Clear enhancement rules
            this.enhancementRules.clear();

            // Clear pending timer
            if (this.enhancementTimer) {
                clearTimeout(this.enhancementTimer);
                this.enhancementTimer = null;
            }

            // Clean up all enhanced elements
            const enhancedElements = document.querySelectorAll('[data-juris-enhanced], [data-juris-enhanced-selector]');
            enhancedElements.forEach(element => {
                this._cleanupElement(element);
            });

            const enhancedContainers = document.querySelectorAll('[data-juris-enhanced-container]');
            enhancedContainers.forEach(container => {
                this._cleanupContainer(container);
            });

            // Clear pending enhancements
            this.pendingEnhancements.clear();
        }
    }

    /**
    * Main Juris class with renderMode support
    */
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

            // RENDER MODE: Check config for render mode
            if (config.renderMode === 'fine-grained') {
                this.domRenderer.setRenderMode('fine-grained');
            } else if (config.renderMode === 'batch') {
                this.domRenderer.setRenderMode('batch');
            }

            // BACKWARD COMPATIBILITY: Support legacy config
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

        init() {

        }
        createHeadlessContext(element = null) {
            const context = {
                // Core state management
                getState: (path, defaultValue) => this.stateManager.getState(path, defaultValue),
                setState: (path, value, context) => this.stateManager.setState(path, value, context),
                subscribe: (path, callback) => this.stateManager.subscribe(path, callback),

                // Services access
                services: this.services,
                ...(this.services || {}),

                // Access to other headless APIs
                headless: this.headlessManager.context,
                ...(this.headlessAPIs || {}),

                // Component management
                components: {
                    register: (name, component) => this.componentManager.register(name, component),
                    registerHeadless: (name, component, options) => this.headlessManager.register(name, component, options),
                    get: (name) => this.componentManager.components.get(name),
                    getHeadless: (name) => this.headlessManager.getInstance(name),
                    initHeadless: (name, props) => this.headlessManager.initialize(name, props),
                    reinitHeadless: (name, props) => this.headlessManager.reinitialize(name, props)
                },

                // Utilities
                utils: {
                    render: (container) => this.render(container),
                    cleanup: () => this.cleanup(),
                    forceRender: () => this.render(),
                    getHeadlessStatus: () => this.headlessManager.getStatus()
                },

                // Direct access to Juris instance
                juris: this
            };

            // ✅ Add element reference when provided
            if (element) {
                context.element = element;
            }

            return context;
        }

        // Create unified context with enhanced headless support
        createContext(element = null) {
            const context = {
                // State management
                getState: (path, defaultValue) => this.stateManager.getState(path, defaultValue),
                setState: (path, value, context) => this.stateManager.setState(path, value, context),
                subscribe: (path, callback) => this.stateManager.subscribe(path, callback),

                // Services
                services: this.services,
                ...(this.services || {}),

                // Direct access to all headless APIs
                ...(this.headlessAPIs || {}),

                // Headless components context
                headless: this.headlessManager.context,

                // Component management
                components: {
                    register: (name, component) => this.componentManager.register(name, component),
                    registerHeadless: (name, component, options) => this.headlessManager.register(name, component, options),
                    get: (name) => this.componentManager.components.get(name),
                    getHeadless: (name) => this.headlessManager.getInstance(name),
                    initHeadless: (name, props) => this.headlessManager.initialize(name, props),
                    reinitHeadless: (name, props) => this.headlessManager.reinitialize(name, props),
                    getHeadlessAPI: (name) => this.headlessManager.getAPI(name),
                    getAllHeadlessAPIs: () => this.headlessManager.getAllAPIs()
                },

                // Utilities
                utils: {
                    render: (container) => this.render(container),
                    cleanup: () => this.cleanup(),
                    forceRender: () => this.render(),
                    setRenderMode: (mode) => this.setRenderMode(mode),
                    getRenderMode: () => this.getRenderMode(),
                    isFineGrained: () => this.isFineGrained(),
                    isBatchMode: () => this.isBatchMode(),
                    getHeadlessStatus: () => this.headlessManager.getStatus(),
                },

                // Direct access
                juris: this
            };

            // Add element reference when provided
            if (element) {
                context.element = element;
            }

            return context;
        }

        // Public API - State Management
        getState(path, defaultValue) {
            return this.stateManager.getState(path, defaultValue);
        }

        setState(path, value, context) {
            return this.stateManager.setState(path, value, context);
        }

        subscribe(path, callback, hierarchical = true) {
            return this.stateManager.subscribe(path, callback, hierarchical);
        }
        subscribeExact(path, callback) {
            return this.stateManager.subscribeExact(path, callback);
        }
        // Public API - Component Management
        registerComponent(name, component) {
            return this.componentManager.register(name, component);
        }

        registerHeadlessComponent(name, component, options) {
            return this.headlessManager.register(name, component, options);
        }

        getComponent(name) {
            return this.componentManager.components.get(name);
        }

        getHeadlessComponent(name) {
            return this.headlessManager.getInstance(name);
        }

        initializeHeadlessComponent(name, props) {
            return this.headlessManager.initialize(name, props);
        }

        // Public API - Render Mode Control
        setRenderMode(mode) {
            this.domRenderer.setRenderMode(mode);
        }

        getRenderMode() {
            return this.domRenderer.getRenderMode();
        }

        isFineGrained() {
            return this.domRenderer.isFineGrained();
        }

        isBatchMode() {
            return this.domRenderer.isBatchMode();
        }

        // DEPRECATED: Legacy method names for backward compatibility
        enableLegacyMode() {
            console.warn('enableLegacyMode() is deprecated. Use setRenderMode("fine-grained") instead.');
            this.setRenderMode('fine-grained');
        }

        disableLegacyMode() {
            console.warn('disableLegacyMode() is deprecated. Use setRenderMode("batch") instead.');
            this.setRenderMode('batch');
        }

        // Enhanced methods for headless component management
        _updateComponentContexts() {
            // This method can be called when headless components are added/removed
            // to ensure all component contexts have access to updated APIs
            if (this.headlessAPIs) {
                // The contexts will get updated APIs on next render cycle
                // due to the spread operator in createContext()
            }
        }

        registerAndInitHeadless(name, componentFn, options = {}) {
            this.headlessManager.register(name, componentFn, options);
            return this.headlessManager.initialize(name, options);
        }

        getHeadlessStatus() {
            return this.headlessManager.getStatus();
        }
        /**
         * Convert a vnode to an HTML element
         * @param {Object} vnode - The vnode to convert
         * @returns {Element} The HTML element
         */
        objectToHtml(vnode) {
            return this.domRenderer.render(vnode);
        }
        // Public API - Rendering
        render(container = '#app') {
            const containerEl = typeof container === 'string'
                ? document.querySelector(container)
                : container;

            if (!containerEl) {
                console.error('Container not found:', container);
                return;
            }

            // Cleanup existing content
            Array.from(containerEl.children).forEach(child => {
                this.domRenderer.cleanup(child);
            });
            containerEl.innerHTML = '';

            this.headlessManager.initializeQueued();

            try {
                if (!this.layout) {
                    containerEl.innerHTML = '<p>No layout configured</p>';
                    return;
                }

                const element = this.domRenderer.render(this.layout);
                if (element) {
                    containerEl.appendChild(element);
                }
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

        // Public API - DOM Enhancement
        enhance(selector, definition, options) {
            return this.domEnhancer.enhance(selector, definition, options);
        }

        configureEnhancement(options) {
            return this.domEnhancer.configure(options);
        }

        getEnhancementStats() {
            return this.domEnhancer.getStats();
        }

        // Public API - Cleanup
        cleanup() {
            this.headlessManager.cleanup();
        }

        destroy() {
            this.cleanup();
            this.domEnhancer.destroy();
            this.stateManager.subscribers.clear();
            this.stateManager.externalSubscribers.clear();
            this.componentManager.components.clear();
            this.headlessManager.components.clear();
        }
    }

    // Export Juris globally
    if (typeof window !== 'undefined') {
        window.Juris = Juris;
        window.deepEquals = deepEquals;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Juris;
        module.exports.deepEquals = deepEquals;
    }

})();
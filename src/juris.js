/**
 * Caution: This is not  just a framework, its also a platform. 
 * Juris (JavaScript Unified Reactive Interface Solution) 
 * transforms web development through its comprehensive object-first architecture that makes 
 * reactivity an intentional choice rather than an automatic behavior. By expressing interfaces 
 * as pure JavaScript objects where functions explicitly define reactivity, Juris delivers a 
 * complete solution for applications that are universally deployable, precisely controlled,
 * and designed from the ground up for seamless AI collaboration—all while maintaining the 
 * simplicity and debuggability of native JavaScript patterns.
 * 
 * Author: Resti Guay
 * Maintained by: Juris Github Team
 * Version: 0.3.1
 * License: MIT
 */
(function() {
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
        }
        
        getState(path, defaultValue = null) {
            if (!isValidPath(path)) {
                console.warn('Invalid state path:', path);
                return defaultValue;
            }
            
            // Track dependency
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
            
            const oldValue = this.getState(path);
            
            // Run middleware
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
                return; // No change
            }
            
            // Set value
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
            
            // Notify subscribers
            if (!this.isUpdating) {
                this.isUpdating = true;
                this._notifySubscribers(path, finalValue, oldValue);
                this._notifyExternalSubscribers(path, finalValue, oldValue);
                this.isUpdating = false;
            }
        }
        
        subscribe(path, callback) {
            if (!this.externalSubscribers.has(path)) {
                this.externalSubscribers.set(path, new Set());
            }
            this.externalSubscribers.get(path).add(callback);
            
            return () => {
                const subs = this.externalSubscribers.get(path);
                if (subs) {
                    subs.delete(callback);
                    if (subs.size === 0) {
                        this.externalSubscribers.delete(path);
                    }
                }
            };
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
            // Notify exact path
            this._triggerPathSubscribers(path);
            
            // Notify parent paths
            const parts = getPathParts(path);
            for (let i = parts.length - 1; i > 0; i--) {
                const parentPath = parts.slice(0, i).join('.');
                this._triggerPathSubscribers(parentPath);
            }
        }
        
        _notifyExternalSubscribers(path, newValue, oldValue) {
            const subs = this.externalSubscribers.get(path);
            if (subs) {
                subs.forEach(callback => {
                    try {
                        callback(newValue, oldValue, path);
                    } catch (error) {
                        console.error('External subscriber error:', error);
                    }
                });
            }
        }
        
        _triggerPathSubscribers(path) {
            const subs = this.subscribers.get(path);
            if (subs) {
                subs.forEach(callback => {
                    try {
                        const oldTracking = this.currentTracking;
                        const newTracking = new Set();
                        this.currentTracking = newTracking;
                        
                        callback();
                        
                        this.currentTracking = oldTracking;
                        
                        // Update subscriptions for new dependencies - newTracking is always a Set
                        newTracking.forEach(newPath => {
                            this.subscribeInternal(newPath, callback);
                        });
                    } catch (error) {
                        console.error('Subscriber error:', error);
                        this.currentTracking = oldTracking;
                    }
                });
            }
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
     * Headless Manager - Manages headless components (business logic)
     */
    class HeadlessManager {
        constructor(juris) {
            this.juris = juris;
            this.components = new Map();
            this.instances = new Map();
            this.context = {};
            this.initQueue = new Set();
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
                const context = this.juris.createContext();
                const instance = component.fn(props, context);
                
                if (!instance || typeof instance !== 'object') {
                    console.warn(`Headless component '${name}' must return an object`);
                    return null;
                }
                
                this.instances.set(name, instance);
                
                if (instance.api) {
                    this.context[name] = instance.api;
                }
                
                if (instance.hooks?.onRegister) {
                    instance.hooks.onRegister();
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
                    this.initialize(name);
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
                const context = this.juris.createContext();
                const result = componentFn(props, context);
                
                // Check if it's a lifecycle component
                if (result && typeof result === 'object' && typeof result.render === 'function') {
                    return this._createLifecycleComponent(result, name, props);
                }
                
                // Legacy component
                return this.juris.domRenderer.render(result);
            } catch (error) {
                console.error(`Error creating component '${name}':`, error);
                return this._createErrorElement(error);
            }
        }
        
        _createLifecycleComponent(componentResult, name, props) {
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
                
                // Call onMount
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
        
        updateInstance(element, newProps) {
            const instance = this.instances.get(element);
            if (!instance) return;
            
            const oldProps = instance.props;
            instance.props = newProps;
            
            if (instance.hooks.onUpdate) {
                try {
                    instance.hooks.onUpdate(oldProps, newProps);
                } catch (error) {
                    console.error(`onUpdate error in ${instance.name}:`, error);
                }
            }
            
            // Re-render
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
     * DOM Enhancer - Enhances existing DOM elements with reactive features
     */
    class DOMEnhancer {
        constructor(juris) {
            this.juris = juris;
            this.observers = new Map();
            this.enhancedElements = new WeakSet();
            this.enhancementRules = new Map();
            
            // Performance options
            this.performanceOptions = {
                debounceMs: 10,
                batchUpdates: true,
                observeSubtree: true,
                observeAttributes: true,
                observeChildList: true
            };
            
            // Debounced batch processing
            this.pendingEnhancements = new Set();
            this.enhancementTimer = null;
        }
        
        /**
         * Enhance existing DOM elements matching a CSS selector
         * @param {string} selector - CSS selector to match elements
         * @param {object} definition - DOM definition without root tag
         * @param {object} options - Enhancement options
         */
        enhance(selector, definition, options = {}) {
            const config = {
                ...this.performanceOptions,
                ...options
            };
            
            // Store enhancement rule for future elements
            this.enhancementRules.set(selector, { definition, config });
            
            // Enhance existing elements
            this._enhanceExistingElements(selector, definition, config);
            
            // Set up mutation observer if requested
            if (config.observeNewElements !== false) {
                this._setupMutationObserver(selector, definition, config);
            }
            
            return () => this._unenhance(selector);
        }
        
        /**
         * Enhance existing elements matching the selector
         */
        _enhanceExistingElements(selector, definition, config) {
            const elements = document.querySelectorAll(selector);
            
            if (config.batchUpdates && elements.length > 1) {
                this._batchEnhanceElements(Array.from(elements), definition, config);
            } else {
                elements.forEach(element => this._enhanceElement(element, definition, config));
            }
        }
        
        /**
         * Batch enhance multiple elements for better performance
         */
        _batchEnhanceElements(elements, definition, config) {
            // Process elements in place rather than moving them to fragments
            // This avoids DOM insertion/removal issues
            
            const elementsToProcess = elements.filter(element => !this.enhancedElements.has(element));
            
            if (elementsToProcess.length === 0) return;
            
            // Enhance all elements in their current positions
            elementsToProcess.forEach(element => {
                this._enhanceElement(element, definition, config);
            });
        }
        
        /**
         * Enhance a single element - REUSES DOMRenderer architecture
         */
        _enhanceElement(element, definition, config) {
            if (this.enhancedElements.has(element)) {
                return; // Already enhanced
            }
            
            try {
                this.enhancedElements.add(element);
                
                // REUSE: Use DOMRenderer's _createElement logic but on existing element
                const subscriptions = [];
                const eventListeners = [];
                
                // REUSE: Apply enhancement using DOMRenderer's methods directly
                this._applyEnhancementUsingRenderer(element, definition, subscriptions, eventListeners);
                
                // REUSE: Store subscriptions using same pattern as DOMRenderer
                if (subscriptions.length > 0 || eventListeners.length > 0) {
                    this.juris.domRenderer.subscriptions.set(element, { subscriptions, eventListeners });
                }
                
                // Mark element as enhanced
                element.setAttribute('data-juris-enhanced', Date.now());
                
                // Call enhancement callback if provided
                if (config.onEnhanced) {
                    const context = this.juris.createContext();
                    config.onEnhanced(element, context);
                }
                
            } catch (error) {
                console.error('Error enhancing element:', error);
                this.enhancedElements.delete(element);
            }
        }
        
        /**
         * Apply enhancement using DOMRenderer methods - MAXIMUM REUSE
         */
        _applyEnhancementUsingRenderer(element, definition, subscriptions, eventListeners) {
            const renderer = this.juris.domRenderer;
            
            // Process each property using DOMRenderer's existing methods
            Object.keys(definition).forEach(key => {
                const value = definition[key];
                
                if (key === 'children') {
                    // REUSE: DOMRenderer's _handleChildren method
                    renderer._handleChildren(element, value, subscriptions);
                } else if (key === 'text') {
                    // REUSE: DOMRenderer's _handleText method
                    renderer._handleText(element, value, subscriptions);
                } else if (key === 'style') {
                    // REUSE: DOMRenderer's _handleStyle method
                    renderer._handleStyle(element, value, subscriptions);
                } else if (key.startsWith('on')) {
                    // REUSE: DOMRenderer's _handleEvent method
                    renderer._handleEvent(element, key, value, eventListeners);
                } else if (typeof value === 'function') {
                    // REUSE: DOMRenderer's _handleReactiveAttribute method with element context
                    this._handleReactiveAttributeWithContext(element, key, value, subscriptions);
                } else {
                    // REUSE: DOMRenderer's _setStaticAttribute method
                    renderer._setStaticAttribute(element, key, value);
                }
            });
        }
        
        /**
         * Handle reactive attributes with proper element context
         */
        _handleReactiveAttributeWithContext(element, attr, valueFn, subscriptions) {
            const updateAttribute = () => {
                try {
                    // Call function with element as context
                    const value = valueFn.call(element);
                    this.juris.domRenderer._setStaticAttribute(element, attr, value);
                } catch (error) {
                    console.error(`Error in enhanced ${attr} function:`, error);
                }
            };
            
            this._createReactiveUpdate(updateAttribute, subscriptions);
            updateAttribute(); // Initial render
        }
        
        /**
         * Create reactive update for enhanced elements - REUSES StateManager tracking
         */
        _createReactiveUpdate(updateFn, subscriptions) {
            const dependencies = this.juris.stateManager.startTracking();
            
            try {
                updateFn(); // Capture dependencies
            } catch (error) {
                console.error('Error capturing dependencies for enhanced element:', error);
            }
            
            // Subscribe to dependencies
            dependencies.forEach(path => {
                const unsubscribe = this.juris.stateManager.subscribeInternal(path, updateFn);
                subscriptions.push(unsubscribe);
            });
        }
        
        /**
         * Set up mutation observer for new elements
         */
        _setupMutationObserver(selector, definition, config) {
            if (this.observers.has(selector)) {
                return; // Already observing
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
                subtree: config.observeSubtree,
                attributes: config.observeAttributes,
                attributeOldValue: config.observeAttributes
            };
            
            observer.observe(document.body, observerConfig);
            this.observers.set(selector, observer);
        }
        
        /**
         * Process mutations with debouncing for performance
         */
        _debouncedProcessMutations(mutations, selector, definition, config) {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.pendingEnhancements.add({ node, selector, definition, config });
                        }
                    });
                }
            });
            
            // Debounce processing
            if (this.enhancementTimer) {
                clearTimeout(this.enhancementTimer);
            }
            
            this.enhancementTimer = setTimeout(() => {
                this._processPendingEnhancements();
                this.enhancementTimer = null;
            }, config.debounceMs);
        }
        
        /**
         * Process mutations immediately
         */
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
        
        /**
         * Process pending enhancements in batch
         */
        _processPendingEnhancements() {
            const enhancements = Array.from(this.pendingEnhancements);
            this.pendingEnhancements.clear();
            
            // Group by selector for batch processing
            const groups = new Map();
            enhancements.forEach(({ node, selector, definition, config }) => {
                if (!groups.has(selector)) {
                    groups.set(selector, { elements: [], definition, config });
                }
                
                const matchingElements = node.matches && node.matches(selector) ? [node] : [];
                if (node.querySelectorAll) {
                    matchingElements.push(...Array.from(node.querySelectorAll(selector)));
                }
                groups.get(selector).elements.push(...matchingElements);
            });
            
            // Process each group
            groups.forEach(({ elements, definition, config }, selector) => {
                if (config.batchUpdates && elements.length > 1) {
                    this._batchEnhanceElements(elements, definition, config);
                } else {
                    elements.forEach(element => this._enhanceElement(element, definition, config));
                }
            });
        }
        
        /**
         * Enhance new node that was added to DOM
         */
        _enhanceNewNode(node, selector, definition, config) {
            // Check if the node itself matches
            if (node.matches && node.matches(selector)) {
                this._enhanceElement(node, definition, config);
            }
            
            // Check if any descendants match
            if (node.querySelectorAll) {
                const matchingElements = node.querySelectorAll(selector);
                matchingElements.forEach(element => {
                    this._enhanceElement(element, definition, config);
                });
            }
        }
        
        /**
         * Remove enhancement for a selector
         */
        _unenhance(selector) {
            // Stop observing
            const observer = this.observers.get(selector);
            if (observer) {
                observer.disconnect();
                this.observers.delete(selector);
            }
            
            // Remove enhancement rule
            this.enhancementRules.delete(selector);
            
            // Clean up enhanced elements - REUSE DOMRenderer cleanup
            const elements = document.querySelectorAll(`${selector}[data-juris-enhanced]`);
            elements.forEach(element => {
                this._cleanupEnhancedElement(element);
            });
        }
        
        /**
         * Cleanup enhanced element - REUSES DOMRenderer cleanup
         */
        _cleanupEnhancedElement(element) {
            // REUSE: Use DOMRenderer's cleanup method directly
            this.juris.domRenderer.cleanup(element);
            
            // Remove enhancement tracking
            this.enhancedElements.delete(element);
            element.removeAttribute('data-juris-enhanced');
        }
        
        /**
         * Configure performance options
         */
        configure(options) {
            Object.assign(this.performanceOptions, options);
        }
        
        /**
         * Get enhancement statistics
         */
        getStats() {
            return {
                enhancementRules: this.enhancementRules.size,
                activeObservers: this.observers.size,
                pendingEnhancements: this.pendingEnhancements.size,
                enhancedElements: document.querySelectorAll('[data-juris-enhanced]').length
            };
        }
        
        /**
         * Clean up all enhancements - REUSES existing cleanup
         */
        destroy() {
            // Stop all observers
            this.observers.forEach(observer => observer.disconnect());
            this.observers.clear();
            
            // Clear enhancement rules
            this.enhancementRules.clear();
            
            // Clear pending timer
            if (this.enhancementTimer) {
                clearTimeout(this.enhancementTimer);
                this.enhancementTimer = null;
            }
            
            // Clean up all enhanced elements using DOMRenderer cleanup
            const enhancedElements = document.querySelectorAll('[data-juris-enhanced]');
            enhancedElements.forEach(element => {
                this._cleanupEnhancedElement(element);
            });
        }
    }
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
        }
        
        render(vnode) {
            if (!vnode || typeof vnode !== 'object') {
                return null;
            }
            
            const tagName = Object.keys(vnode)[0];
            const props = vnode[tagName] || {};
            
            // Check if it's a component
            if (this.juris.componentManager.components.has(tagName)) {
                return this.juris.componentManager.create(tagName, props);
            }
            
            // Create DOM element
            return this._createElement(tagName, props);
        }
        
        _createElement(tagName, props) {
            const element = document.createElement(tagName);
            const subscriptions = [];
            const eventListeners = [];
            
            // Set up properties
            Object.keys(props).forEach(key => {
                const value = props[key];
                
                if (key === 'children') {
                    this._handleChildren(element, value, subscriptions);
                } else if (key === 'text') {
                    this._handleText(element, value, subscriptions);
                } else if (key === 'style') {
                    this._handleStyle(element, value, subscriptions);
                } else if (key.startsWith('on')) {
                    this._handleEvent(element, key, value, eventListeners);
                } else if (typeof value === 'function') {
                    this._handleReactiveAttribute(element, key, value, subscriptions);
                } else {
                    this._setStaticAttribute(element, key, value);
                }
            });
            
            // Store subscriptions and event listeners for cleanup
            if (subscriptions.length > 0 || eventListeners.length > 0) {
                this.subscriptions.set(element, { subscriptions, eventListeners });
            }
            
            return element;
        }
        
        _handleChildren(element, children, subscriptions) {
            if (typeof children === 'function') {
                // Create the reactive update for children
                const updateChildren = () => {
                    try {
                        const result = children();
                        if (result !== "ignore") {
                          this._updateChildren(element, result);
                        }
                    } catch (error) {
                        console.error('Error in children function:', error);
                    }
                };
                
                this._createReactiveUpdate(element, updateChildren, subscriptions);
                
                // Initial render
                try {
                    const result = children();
                    if (result !== "ignore") {
                      this._updateChildren(element, result);
                    }
                } catch (error) {
                    console.error('Error in initial children render:', error);
                }
            } else {
                this._updateChildren(element, children);
            }
        }
        
        _handleText(element, text, subscriptions) {
            if (typeof text === 'function') {
                this._createReactiveUpdate(element, () => {
                    element.textContent = text();
                }, subscriptions);
                element.textContent = text();
            } else {
                element.textContent = text;
            }
        }
        
        _handleStyle(element, style, subscriptions) {
            if (typeof style === 'function') {
                this._createReactiveUpdate(element, () => {
                    const styleObj = style();
                    Object.assign(element.style, styleObj);
                }, subscriptions);
                Object.assign(element.style, style());
            } else if (typeof style === 'object') {
                Object.keys(style).forEach(prop => {
                    const value = style[prop];
                    if (typeof value === 'function') {
                        this._createReactiveUpdate(element, () => {
                            element.style[prop] = value();
                        }, subscriptions);
                        element.style[prop] = value();
                    } else {
                        element.style[prop] = value;
                    }
                });
            }
        }
        
        _handleEvent(element, eventName, handler, eventListeners) {
            const actualEventName = this.eventMap[eventName.toLowerCase()] || eventName.slice(2).toLowerCase();
            element.addEventListener(actualEventName, handler);
            eventListeners.push({ eventName: actualEventName, handler });
        }
        
        _handleReactiveAttribute(element, attr, valueFn, subscriptions) {
            this._createReactiveUpdate(element, () => {
                const value = valueFn();
                this._setStaticAttribute(element, attr, value);
            }, subscriptions);
            
            // Set initial value
            const value = valueFn();
            this._setStaticAttribute(element, attr, value);
        }
        
        _setStaticAttribute(element, attr, value) {
            if (attr === 'className') {
                element.className = value;
            } else if (attr in element) {
                element[attr] = value;
            } else {
                element.setAttribute(attr, value);
            }
        }
        
        _createReactiveUpdate(element, updateFn, subscriptions) {
            // Start tracking dependencies
            const dependencies = this.juris.stateManager.startTracking();
            
            // Call function to capture dependencies - but don't execute the actual update yet
            // We just want to capture what state paths this function will access
            const originalTracking = this.juris.stateManager.currentTracking;
            this.juris.stateManager.currentTracking = dependencies;
            
            try {
                // Call the function to see what dependencies it has
                updateFn();
            } catch (error) {
                console.error('Error capturing dependencies:', error);
            } finally {
                // Restore tracking state
                this.juris.stateManager.currentTracking = originalTracking;
            }
            
            // Subscribe to all captured dependencies
            dependencies.forEach(path => {
                const unsubscribe = this.juris.stateManager.subscribeInternal(path, updateFn);
                subscriptions.push(unsubscribe);
            });
        }
        
        _updateChildren(element, children) {
  
            if (children === "ignore") {
              return; // Preserve existing children
            }
            // Clear existing children
            while (element.firstChild) {
                this.cleanup(element.firstChild);
                element.removeChild(element.firstChild);
            }
            
            // Add new children
            if (Array.isArray(children)) {
                children.forEach(child => {
                    const childElement = this.render(child);
                    if (childElement) {
                        element.appendChild(childElement);
                    }
                });
            }
        }
        
        updateElementContent(element, newContent) {
            this._updateChildren(element, [newContent]);
        }
        
        cleanup(element) {
            // Cleanup component instances
            this.juris.componentManager.cleanup(element);
            
            // Cleanup subscriptions and event listeners
            const data = this.subscriptions.get(element);
            if (data) {
                // Cleanup subscriptions
                if (data.subscriptions) {
                    data.subscriptions.forEach(unsubscribe => unsubscribe());
                }
                
                // Cleanup event listeners
                if (data.eventListeners) {
                    data.eventListeners.forEach(({ eventName, handler }) => {
                        element.removeEventListener(eventName, handler);
                    });
                }
                
                this.subscriptions.delete(element);
            }
            
            // Cleanup children
            Array.from(element.children).forEach(child => {
                this.cleanup(child);
            });
        }
    }
  
    /**
     * Main Juris class
     */
    class Juris {
        constructor(config = {}) {
            this.services = config.services || {};
            this.layout = config.layout;
            
            // Initialize managers
            this.stateManager = new StateManager(config.states || {}, config.middleware || []);
            this.headlessManager = new HeadlessManager(this);
            this.componentManager = new ComponentManager(this);
            this.domRenderer = new DOMRenderer(this);
            this.domEnhancer = new DOMEnhancer(this); // NEW: DOM enhancer
            
            // Register components
            if (config.components) {
                Object.entries(config.components).forEach(([name, component]) => {
                    this.componentManager.register(name, component);
                });
            }
            
            // Register headless components
            if (config.headlessComponents) {
                Object.entries(config.headlessComponents).forEach(([name, config]) => {
                    if (typeof config === 'function') {
                        this.headlessManager.register(name, config);
                    } else {
                        this.headlessManager.register(name, config.fn, config.options);
                    }
                });
            }
            
            // Initialize auto-init headless components
            this.headlessManager.initializeQueued();
        }
        
        // Create unified context
        createContext() {
            return {
                // State management
                getState: (path, defaultValue) => this.stateManager.getState(path, defaultValue),
                setState: (path, value, context) => this.stateManager.setState(path, value, context),
                subscribe: (path, callback) => this.stateManager.subscribe(path, callback),
                
                // Services
                services: this.services,
                
                // Headless components
                headless: this.headlessManager.context,
                
                // Component management
                components: {
                    register: (name, component) => this.componentManager.register(name, component),
                    registerHeadless: (name, component, options) => this.headlessManager.register(name, component, options),
                    get: (name) => this.componentManager.components.get(name),
                    getHeadless: (name) => this.headlessManager.getInstance(name),
                    initHeadless: (name, props) => this.headlessManager.initialize(name, props)
                },
                
                // Utilities
                utils: {
                    render: (container) => this.render(container),
                    cleanup: () => this.cleanup()
                },
                
                // Direct access
                juris: this
            };
        }
        
        // Public API - State Management
        getState(path, defaultValue) {
            return this.stateManager.getState(path, defaultValue);
        }
        
        setState(path, value, context) {
            return this.stateManager.setState(path, value, context);
        }
        
        subscribe(path, callback) {
            return this.stateManager.subscribe(path, callback);
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
            
            // Initialize remaining headless components
            this.headlessManager.initializeQueued();
            
            // Render new content
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
            this.domEnhancer.destroy(); // Clean up enhancements
            this.stateManager.subscribers.clear();
            this.stateManager.externalSubscribers.clear();
            this.componentManager.components.clear();
            this.headlessManager.components.clear();
        }
    }
  
    // Export Juris globally
    if (typeof window !== 'undefined') {
        window.Juris = Juris;
    }
    
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Juris;
    }
  
  })();
// Complete rewrite of WebComponentFactory with proper props passing support

if (typeof WebComponentFactory === 'undefined') {
    class WebComponentFactory {
        constructor(jurisInstance) {
            this.juris = jurisInstance;
            this.registeredComponents = new Set();
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
            this.registeredComponents.add(name);
            
            // Patch DOMRenderer to handle this web component
            this._patchDOMRendererForComponent(name);
            
            console.info(log.i('WebComponent registered', { name, className: WebComponentClass.name }, 'framework'));
            return WebComponentClass;
        }

        initializeFromConfig(webComponentsConfig, createContextFn) {
            if (!webComponentsConfig || typeof webComponentsConfig !== 'object') {
                return;
            }
            
            const transformedComponents = {};
            
            Object.entries(webComponentsConfig).forEach(([name, componentFn]) => {
                try {
                    const tempContext = createContextFn();
                    const componentConfig = componentFn({}, tempContext);
                    
                    if (!componentConfig || typeof componentConfig !== 'object') {
                        console.error(log.e('Invalid webComponent configuration', { name }, 'framework'));
                        return;
                    }
                    
                    const {
                        render,
                        attributes = [],
                        initialState = {},
                        options = {},
                        hooks = {},
                        ...otherProps
                    } = componentConfig;
                    
                    if (!render || typeof render !== 'function') {
                        console.error(log.e('WebComponent must have a render function', { name }, 'framework'));
                        return;
                    }
                    
                    transformedComponents[name] = {
                        component: {
                            render,
                            initialState,
                            hooks,
                            ...otherProps
                        },
                        options: {
                            attributes,
                            ...options
                        }
                    };
                    
                } catch (error) {
                    console.error(log.e('Failed to process webComponent', { 
                        name, 
                        error: error.message 
                    }, 'framework'));
                }
            });
            
            if (Object.keys(transformedComponents).length > 0) {
                const result = this.createMultiple(transformedComponents);
                console.info(log.i('WebComponents auto-registered', { 
                    count: Object.keys(transformedComponents).length 
                }, 'framework'));
                return result;
            }
            
            return {};
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

        _patchDOMRendererForComponent(componentName) {
            const originalRenderToDOM = this.juris.domRenderer._renderToDOM;
            const webComponentFactory = this;
            
            this.juris.domRenderer._renderToDOM = function(vnode, componentNameContext = null) {
                // Check if this is a web component
                if (vnode && typeof vnode === 'object' && !Array.isArray(vnode)) {
                    const tagName = Object.keys(vnode)[0];
                    
                    if (webComponentFactory.registeredComponents.has(tagName)) {
                        const props = vnode[tagName] || {};
                        return webComponentFactory._createWebComponentElement(tagName, props);
                    }
                }
                
                return originalRenderToDOM.call(this, vnode, componentNameContext);
            };
        }

        _createWebComponentElement(tagName, props) {
            const element = document.createElement(tagName);
            
            // Store reactive props and subscriptions
            element._jurisReactiveProps = {};
            element._jurisPropsSubscriptions = [];
            element._jurisStaticProps = {};
            
            // Process each prop
            for (const [key, value] of Object.entries(props)) {
                if (typeof value === 'function') {
                    // Reactive prop
                    element._jurisReactiveProps[key] = value;
                    this._setupReactiveProp(element, key, value);
                } else {
                    // Static prop
                    element._jurisStaticProps[key] = value;
                    this._setElementAttribute(element, key, value);
                }
            }
            
            return element;
        }

        _setupReactiveProp(element, key, propFunction) {
            const updateProp = () => {
                try {
                    const result = propFunction();
                    this._setElementAttribute(element, key, result);
                    
                    // Notify web component of prop change
                    if (element._jurisWebComponentInstance) {
                        element._jurisWebComponentInstance._onPropUpdate(key, result);
                    }
                } catch (error) {
                    console.warn(`Error updating reactive prop ${key}:`, error);
                }
            };
            
            // Track dependencies and create subscriptions
            const { deps } = this.juris.stateManager.track(() => updateProp());
            deps.forEach(path => {
                const unsub = this.juris.stateManager.subscribeInternal(path, updateProp);
                element._jurisPropsSubscriptions.push(unsub);
            });
        }

        _setElementAttribute(element, key, value) {
            if (value === null || value === undefined) {
                element.removeAttribute(key);
            } else if (typeof value === 'boolean') {
                if (value) {
                    element.setAttribute(key, '');
                } else {
                    element.removeAttribute(key);
                }
            } else if (typeof value === 'object') {
                element.setAttribute(key, JSON.stringify(value));
            } else {
                element.setAttribute(key, String(value));
            }
        }

        _createWebComponentClass(name, componentDefinition, options) {
            const jurisInstance = this.juris;
            const webComponentFactory = this;
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
                    this._currentProps = {};
                    
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
                    
                    // Link element to web component instance for prop updates
                    this._jurisWebComponentInstance = this;
                    
                    console.debug(log.d('WebComponent connecting', { name, componentId: this.componentId }, 'framework'));
                    
                    this._setupShadowDOM();
                    this._setupJurisIntegration();
                    this._setupInitialProps();
                    this._setupStyles();

                    if (this.componentConfig?.hooks?.onConnect) {
                        this.componentConfig.hooks.onConnect.call(this, this.jurisContext);
                    }
                    if (this.componentConfig?.api) {
                        this._setupComponentAPI(this.componentConfig);
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
                    
                    // Clean up prop subscriptions
                    if (this._jurisPropsSubscriptions) {
                        this._jurisPropsSubscriptions.forEach(unsubscribe => {
                            try { unsubscribe(); } catch (error) {
                                console.warn('Error cleaning up prop subscription:', error);
                            }
                        });
                        this._jurisPropsSubscriptions = [];
                    }
                    
                    this._unsubscribes.forEach(unsubscribe => {
                        try { unsubscribe(); } catch (error) {
                            console.warn('Error during subscription cleanup:', error);
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
                        
                        // Update current props
                        this._currentProps[name] = this._parseAttributeValue(newValue);
                        
                        if (this.componentConfig?.hooks?.onAttributeChange) {
                            this.componentConfig.hooks.onAttributeChange.call(this, name, oldValue, newValue, this.jurisContext);
                        }

                        if (options.rerenderOnAttributeChange !== false) {
                            this.render();
                        }
                    }
                }

                _onPropUpdate(propName, newValue) {
                    // For reactive props, we don't need to update since the function reference doesn't change
                    // The function's internal state dependencies handle reactivity
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

                _setupInitialProps() {
                    // Extract initial props from reactive and static prop sources
                    if (this._jurisReactiveProps) {
                        Object.entries(this._jurisReactiveProps).forEach(([key, propFn]) => {
                            // Store the function directly as the prop value
                            this._currentProps[key] = propFn;
                        });
                    }
                    
                    if (this._jurisStaticProps) {
                        Object.assign(this._currentProps, this._jurisStaticProps);
                    }
                    
                    // Also include DOM attributes
                    attributes.forEach(attr => {
                        if (this.hasAttribute(attr)) {
                            this._currentProps[attr] = this._parseAttributeValue(this.getAttribute(attr));
                        }
                    });
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
                            emit: (eventName, detail = {}, options = {}) => {
                                const event = new CustomEvent(eventName, {
                                    detail,
                                    bubbles: true,
                                    composed: true,
                                    ...options
                                });
                                this.dispatchEvent(event);
                                return event;
                            }
                        }
                    };
                }

                _setupComponentAPI(componentConfig) {
                    if (componentConfig.api && typeof componentConfig.api === 'object') {
                        Object.entries(componentConfig.api).forEach(([methodName, method]) => {
                            if (typeof method === 'function') {
                                this[methodName] = method.bind(this);
                            } else {
                                this[methodName] = method;
                            }
                        });
                    }
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

                    return initialState;
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
                    if (value === '') return true;
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
                        
                        let componentResult;
                        if (this.componentFn) {
                            // Pass current props to component function
                            componentResult = this.componentFn.call(this, this._currentProps, this.jurisContext);
                        } else if (this.componentConfig?.render) {
                            componentResult = this.componentConfig.render.call(this, this._currentProps, this.jurisContext);
                        } else {
                            console.warn(log.w('No render method found for WebComponent', { name }, 'framework'));
                            return;
                        }

                        // Set up API if returned by component
                        this._setupComponentAPI(componentResult);

                        // Get the actual VDOM to render
                        let vdom = componentResult;
                        if (componentResult && componentResult.render && typeof componentResult.render === 'function') {
                            vdom = componentResult.render();
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
                            
                            if (element) {
                                this.renderRoot.appendChild(element);
                            }
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
                                const actualVdom = vdom.render ? vdom.render() : vdom;
                                const element = jurisInstance.objectToHtml(actualVdom);
                                this.renderRoot.innerHTML = '';
                                if (element) {
                                    this.renderRoot.appendChild(element);
                                }
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

    // Register feature automatically
    if (typeof window !== 'undefined') {
        window.WebComponentFactory = WebComponentFactory;
        Object.freeze(window.WebComponentFactory);
        Object.freeze(window.WebComponentFactory.prototype);
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports.WebComponentFactory = WebComponentFactory;
        module.exports.default = WebComponentFactory;
    }
}
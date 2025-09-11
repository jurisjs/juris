//v0.9.0
// juris-webcomponent.js - Standalone WebComponent Factory Feature
if (typeof WebComponentFactory === 'undefined') {
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
                        try { 
                            unsubscribe(); 
                        } catch (error) {
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
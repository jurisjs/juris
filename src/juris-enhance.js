if (typeof DOMEnhancer === 'undefined') {
  class DOMEnhancer {
    constructor(juris) {
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
          this._enhanceContainer(selectorOrElement, definition, config, '');
        } else {
          this._enhanceElement(selectorOrElement, definition, config, '');
        }            
        return () => this._cleanupElement(selectorOrElement, '', config);
      }        
      const selector = selectorOrElement;
      const enhancementType = this._determineEnhancementType(selector, definition);  
      this.enhancementRegistry.set(selector, { definition, config, type: enhancementType });
      this._enhanceExistingElements(selector, definition, config, enhancementType);                
      if (config.observeNewElements !== false) {
        this._ensureUnifiedObserver(config);
        this.observerRefCount++;
      }
      return () => this._unenhance(selector);
    }

    _enhanceViewportAware(selectorOrElement, definition, config) {
      if (selectorOrElement instanceof Element) {
        this._setupViewportObserver(config);
        this._observeElementForViewport(selectorOrElement, definition, config, '');
        return () => this._cleanupViewportElement(selectorOrElement);
      }
      const selector = selectorOrElement;
      const elements = document.querySelectorAll(selector);            
      this._setupViewportObserver(config);            
      elements.forEach(element => {
        this._observeElementForViewport(element, definition, config, selector);
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
    }

    _processViewportChanges(entries) {
      entries.forEach(entry => {
        const element = entry.target;
        const viewportData = this.viewportElements.get(element);                
        if (!viewportData) return;
        const selector = viewportData.selector;
        if (entry.isIntersecting) {
          this._enhanceElement(element, viewportData.definition, viewportData.config, selector);
        } else {
          this._cleanupElement(element, selector, viewportData.config);
          if (viewportData.minimal) {
            this._enhanceElement(element, viewportData.minimal, viewportData.config, selector);
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

    _observeElementForViewport(element, definition, config, selector) {
      const minimal = config.minimal || this._createMinimalDefinition(definition);            
      this.viewportElements.set(element, {
        definition,
        config,
        minimal,
        selector
      });
      this.intersectionObserver.observe(element);
      const rect = element.getBoundingClientRect();
      const isInitiallyVisible = (
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0
      );
      if (isInitiallyVisible) {
        this._enhanceElement(element, definition, config, selector);
      }
    }

    _createMinimalDefinition(definition) {
      if (typeof definition !== 'object' || !definition) return null;
      const minimal = {};
      if (definition.style) {
        minimal.style = {};
        const layoutProps = ['height', 'width', 'display', 'position'];
        layoutProps.forEach(prop => {
          if (definition.style[prop]) {
            minimal.style[prop] = definition.style[prop];
          }
        });
      }
      if (definition.className) {
        minimal.className = definition.className;
      }
      return Object.keys(minimal).length > 0 ? minimal : null;
    }

    _cleanupViewportElement(element) {
      const viewportData = this.viewportElements.get(element);
      if (this.intersectionObserver) {
        this.intersectionObserver.unobserve(element);
      }
      this.viewportElements.delete(element);
      this._cleanupElement(element, viewportData?.selector || '', viewportData?.config);
    }

    _cleanupViewportObserver() {
      if (this.intersectionObserver && this.viewportElements.size === 0) {
        this.intersectionObserver.disconnect();
        this.intersectionObserver = null;
      }
    }

    _enhanceExistingElements(selector, definition, config, type) {
      if (type === 'selectors') {
        this._enhanceExistingContainers(selector, definition, config);
      } else {
        const elements = document.querySelectorAll(selector);
        if (config.batchUpdates && elements.length > 1) {
          this._batchEnhanceElements(Array.from(elements), definition, config, selector);
        } else {
          elements.forEach(element => this._enhanceElement(element, definition, config, selector));
        }
      }
    }

    _enhanceExistingContainers(containerSelector, definition, config) {
      document.querySelectorAll(containerSelector).forEach(container =>
        this._enhanceContainer(container, definition, config, containerSelector)
      );
    }

    _batchEnhanceElements(elements, definition, config, selector) {
      elements.filter(element => !this.enhancedElements.has(element))
        .forEach(element => this._enhanceElement(element, definition, config, selector));
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
          console.error('Error processing enhancement:', error);
        }
      });
    }

    _processIdEnhancement(node, selector, definition, config) {
      const id = selector.slice(1);
      if (node.id === id) {
        this._enhanceElement(node, definition, config, selector);
      } else if (node.querySelector) {
        const found = node.querySelector(selector);
        if (found) this._enhanceElement(found, definition, config, selector);
      }
    }

    _processSimpleEnhancement(node, selector, definition, config) {
      if (node.matches && node.matches(selector)) {
        this._enhanceElement(node, definition, config, selector);
      }
      if (node.querySelectorAll) {
        node.querySelectorAll(selector).forEach(element => {
          this._enhanceElement(element, definition, config, selector);
        });
      }
    }

    _processSelectorsEnhancement(node, selector, definition, config) {
      if (node.matches && node.matches(selector)) {
        this._enhanceContainer(node, definition, config, selector);
      }
      if (node.querySelectorAll) {
        node.querySelectorAll(selector).forEach(container => {
          this._enhanceContainer(container, definition, config, selector);
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
          const { definition, enhancedElements, config } = selectorData;
          if (node.matches && node.matches(selector)) {
            this._enhanceSelectorElement(node, definition, container, selector, config);
            enhancedElements.add(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll(selector).forEach(element => {
              if (!this.enhancedElements.has(element)) {
                this._enhanceSelectorElement(element, definition, container, selector, config);
                enhancedElements.add(element);
              }
            });
          }
        });
      });
    }

    _enhanceContainer(container, definition, config, containerSelector) {
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
        this._callHook('onEnhance', config, container, containerSelector);
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
          this._enhanceSelectorElement(element, definition, container, selector, config);
          enhancedElements.add(element);
        }
      });
      containerData.set(selector, { definition, enhancedElements, config });
    }

    _enhanceSelectorElement(element, definition, container, selector, config) {
      try {
        this.enhancedElements.add(element);
        element.setAttribute('data-juris-enhanced-selector', Date.now());
        let actualDefinition = definition;
        if (typeof definition === 'function') {
          actualDefinition = definition(element);
          if (!actualDefinition || typeof actualDefinition !== 'object') {
            console.warn(`Selector '${selector}' function must return a definition object`);
            this.enhancedElements.delete(element);
            return;
          }
        }
        const processedDefinition = this._processElementAwareFunctions(element, actualDefinition);
        this._applyEnhancements(element, processedDefinition);
        this._callHook('onEnhance', config, element, selector);
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
              const result = value(element);
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

    _enhanceElement(element, definition, config, selector) {
      if (this.enhancedElements.has(element)) {
        return;
      }
      try {
        this.enhancedElements.add(element);
        element.setAttribute('data-juris-enhanced', Date.now());
        let actualDefinition = definition;
        if (typeof definition === 'function') {
          const context = this.juris.createContext(element);
          actualDefinition = definition(context);
          if (!actualDefinition || typeof actualDefinition !== 'object') {
            this.enhancedElements.delete(element);
            return;
          }
        }                
        this._applyEnhancements(element, actualDefinition);
        this._callHook('onEnhance', config, element, selector);
      } catch (error) {
        console.error(`Element enhancement failed for ${element.tagName}:`, error);
        this.enhancedElements.delete(element);
      }
    }

    _applyEnhancements(element, definition) {
      const context = { subs: [], events: [], element };
      const renderer = this.juris.domRenderer;            
      Object.keys(definition).forEach(key => {
        const value = definition[key];
        try {
          renderer.applyProp(element, key, value, context);
        } catch (error) {
          console.error(`Error processing enhancement property '${key}':`, error);
        }
      });
      if (context.subs.length > 0 || context.events.length > 0) {
        renderer.subscriptions.set(element, context);
      }
    }

    _callHook(hookName, config, element, selector) {
      if (config.hooks && typeof config.hooks[hookName] === 'function') {
        try {
          config.hooks[hookName](element, selector);
        } catch (error) {
          console.error(`Error in ${hookName} hook:`, error);
        }
      }
    }

    _unenhance(selector) {
      const enhancement = this.enhancementRegistry.get(selector);
      if (!enhancement) return;
      this.observerRefCount--;
      if (this.observerRefCount === 0 && this.unifiedObserver) {
        this.unifiedObserver.disconnect();
        this.unifiedObserver = null;
      }
      this.enhancementRegistry.delete(selector);
      if (enhancement.type === 'selectors') {
        document.querySelectorAll(`${selector}[data-juris-enhanced-container]`).forEach(container => {
          this._cleanupContainer(container, selector, enhancement.config);
        });
      } else {
        document.querySelectorAll(`${selector}[data-juris-enhanced]`).forEach(element => {
          this._cleanupElement(element, selector, enhancement.config);
        });
      }
    }

    _cleanupContainer(container, selector, config) {
      const containerData = this.containerEnhancements.get(container);
      if (containerData) {
        containerData.forEach((selectorData, subSelector) => {
          selectorData.enhancedElements.forEach(element => {
            this._cleanupElement(element, subSelector, selectorData.config);
          });
        });
        this.containerEnhancements.delete(container);
      }
      this._callHook('onUnenhance', config, container, selector);
      this.juris.domRenderer.cleanup(container);
      this.enhancedElements.delete(container);
      container.removeAttribute('data-juris-enhanced');
      container.removeAttribute('data-juris-enhanced-container');
    }

    _cleanupElement(element, selector, config) {
      this._callHook('onUnenhance', config, element, selector);
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
        activeIntersectionObserver: this.intersectionObserver ? 1 : 0,
        observerRefCount: this.observerRefCount,
        pendingEnhancements: this.pendingEnhancements.size,
        viewportElements: this.viewportElements.size || 0,
        enhancedElements,
        enhancedContainers,
        enhancedSelectors,
        totalEnhanced: enhancedElements + enhancedSelectors
      };
    }

    destroy() {
      if (this.unifiedObserver) {
        this.unifiedObserver.disconnect();
        this.unifiedObserver = null;
      }
      if (this.intersectionObserver) {
        this.intersectionObserver.disconnect();
        this.intersectionObserver = null;
      }
      this.enhancementRegistry.clear();
      this.viewportElements = new WeakMap();
      this.observerRefCount = 0;
      if (this.enhancementTimer) {
        clearTimeout(this.enhancementTimer);
        this.enhancementTimer = null;
      }
      document.querySelectorAll('[data-juris-enhanced], [data-juris-enhanced-selector]').forEach(element => {
        this._cleanupElement(element, '', {});
      });
      document.querySelectorAll('[data-juris-enhanced-container]').forEach(container => {
        this._cleanupContainer(container, '', {});
      });
      this.pendingEnhancements.clear();
    }
  }
  if (typeof window !== 'undefined') {
    window.DOMEnhancer = DOMEnhancer;
    Object.freeze(window.DOMEnhancer);
    Object.freeze(window.DOMEnhancer.prototype);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports.DOMEnhancer = DOMEnhancer;
    module.exports.default = DOMEnhancer;
  }
}
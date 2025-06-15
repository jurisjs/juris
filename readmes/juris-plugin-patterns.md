# Juris Plugin Patterns - Developer Guide

## Overview

Juris provides powerful plugin patterns through **headless components** that allow developers to integrate advanced libraries and create sophisticated state management solutions. This guide demonstrates how to replace or extend the built-in StateManager with custom implementations.

## Table of Contents

1. [Core Plugin Architecture](#core-plugin-architecture)
2. [State Management Plugins](#state-management-plugins)
3. [Advanced State Patterns](#advanced-state-patterns)
4. [Integration Examples](#integration-examples)
5. [Best Practices](#best-practices)
6. [Plugin Templates](#plugin-templates)

---

## Why Juris is the Most Flexible Framework Ever Created

### Unprecedented Modular Architecture

Juris achieves unmatched flexibility through its **complete replaceability** of core systems. Unlike other frameworks that lock you into specific patterns, Juris allows you to replace **every single core component**:

#### **Complete System Replacement**
```javascript
const juris = new Juris({
  // Traditional Juris setup
});
https://jurisjs.com/
// Replace EVERYTHING with custom implementations
juris.stateManager = new ReduxStateManager(reduxStore);
juris.componentManager = new ReactComponentManager(juris);
juris.domRenderer = new SSRRenderer(juris);
juris.domEnhancer = new CustomEnhancer(juris);
juris.headlessManager = new CustomHeadlessManager(juris);

// Now you have Redux + React + SSR + Custom Enhancement
// All powered by Juris's reactive core
```

### Framework Transformation Capabilities

#### **Transform into Any Existing Framework**

**Become React:**
```javascript
juris.stateManager = new ReactStateManager(); // Context + useState
juris.componentManager = new ReactComponentManager(); // JSX + Hooks
// Result: Full React compatibility with Juris performance
```

**Become Vue:**
```javascript
juris.stateManager = new VueStateManager(); // Reactive refs
juris.componentManager = new VueComponentManager(); // SFC support
// Result: Vue 3 Composition API with Juris architecture
```

**Become Svelte:**
```javascript
juris.stateManager = new SvelteStateManager(); // Stores + reactivity
juris.componentManager = new SvelteComponentManager(); // Svelte syntax
// Result: Svelte-like development experience
```

**Become Angular:**
```javascript
juris.stateManager = new NgRxStateManager(); // NgRx store
juris.componentManager = new AngularComponentManager(); // Dependency injection
// Result: Angular patterns with Juris simplicity
```

### Unique Advantages Over Other Frameworks

#### **1. True Framework Agnosticism**
- **React**: Locked into JSX, Virtual DOM, specific state patterns
- **Vue**: Locked into template syntax, reactivity system
- **Angular**: Locked into TypeScript, dependency injection
- **Svelte**: Locked into compile-time optimizations
- **Juris**: Can **become any of these** while maintaining core benefits

#### **2. Gradual Migration Support**
```javascript
// Start with React components
juris.componentManager = new ReactComponentManager();

// Migrate state to Redux gradually
juris.stateManager = new ReduxStateManager();

// Add SSR when ready
juris.domRenderer = new SSRRenderer();

// Each change is independent - no big rewrites!
```

#### **3. Mix and Match Architectures**
```javascript
// Impossible in other frameworks - possible in Juris
const juris = new Juris();

// Use Redux for global state
juris.stateManager = new ReduxStateManager(store);

// Use React components for UI
juris.componentManager = new ReactComponentManager();

// Use Vue reactivity for specific features
juris.registerHeadlessComponent('vueFeature', VueReactiveComponent);

// Use Svelte stores for real-time data
juris.registerHeadlessComponent('realtimeData', SvelteStoreComponent);

// All working together seamlessly!
```

#### **4. Future-Proof Architecture**
```javascript
// When new frameworks emerge, Juris adapts
juris.componentManager = new NewFramework2025ComponentManager();
// Your app logic remains unchanged
```

### Real-World Flexibility Examples

#### **Enterprise Migration Scenario**
```javascript
// Year 1: Legacy jQuery app
juris.domEnhancer.enhance('.legacy-widget', jQueryCompatLayer);

// Year 2: Add React components gradually  
juris.componentManager = new ReactComponentManager();
juris.registerComponent('NewFeature', ReactComponent);

// Year 3: Migrate to Redux
juris.stateManager = new ReduxStateManager(existingStore);

// Year 4: Add SSR for performance
juris.domRenderer = new SSRRenderer();

// Each step is independent - no breaking changes!
```

#### **Multi-Team Development**
```javascript
// Team A uses React
teamA.componentManager = new ReactComponentManager();

// Team B uses Vue  
teamB.componentManager = new VueComponentManager();

// Team C uses vanilla JS
teamC.componentManager = new VanillaComponentManager();

// All teams share the same state and services layer
// All components work together in the same app
```

#### **Performance Optimization Freedom**
```javascript
// Development: Use fine-grained reactivity for debugging
juris.domRenderer.setRenderMode('fine-grained');

// Production: Use batch rendering for performance
juris.domRenderer.setRenderMode('batch');

// Server: Use SSR for SEO
juris.domRenderer = new SSRRenderer();

// Static pages: Use string renderer
juris.domRenderer = new StringRenderer();

// Same codebase, optimized for each environment
```

### Comparison with Other "Flexible" Frameworks

| Framework | State | Components | Rendering | Enhancement | Headless |
|-----------|-------|------------|-----------|-------------|----------|
| **React** | Context only | JSX only | VDOM only | Manual | Limited |
| **Vue** | Reactivity only | SFC/Templates | VDOM only | Directives | Limited |
| **Angular** | RxJS/NgRx | TS/DI only | VDOM only | Directives | Services |
| **Svelte** | Stores only | Svelte syntax | Compile only | Actions | Limited |
| **Juris** | **ANY** | **ANY** | **ANY** | **ANY** | **FULL** |

### The Juris Advantage: "Write Once, Run Anywhere" 2.0

#### **Traditional WORA**: Same code, different platforms
#### **Juris WORA**: Same architecture, different frameworks

```javascript
// This component works with ANY state management
function UniversalComponent(props, context) {
  // Works with Redux, MobX, Zustand, custom state...
  const data = context.getState('app.data');
  
  // Works with React JSX, Vue templates, vanilla JS...
  return context.render({
    div: {
      text: `Data: ${data}`,
      onClick: () => context.setState('app.data', newData)
    }
  });
}

// Deploy to:
// - React app (with Redux)
// - Vue app (with Pinia)  
// - Angular app (with NgRx)
// - Vanilla app (with custom state)
// - Server-side (with SSR)
// - Static site (with string rendering)
```

### Framework Evolution Timeline

#### **Past**: Framework Lock-in
- Choose React → Stuck with React patterns forever
- Choose Vue → Stuck with Vue patterns forever
- Migration = Complete rewrite

#### **Present**: Most Frameworks
- Some flexibility within framework boundaries
- Limited plugin ecosystems
- Breaking changes require major updates

#### **Future**: Juris Approach
- **Zero lock-in** - Change any part at any time
- **Infinite extensibility** - Plugin system with no limits
- **Evolutionary architecture** - Adapt to new patterns without rewrites
- **Framework transcendence** - Beyond framework wars

### The Plugin Ecosystem Multiplier Effect

Since **everything** is replaceable, the plugin ecosystem becomes **exponentially more powerful**:

```javascript
// Community can create plugins for:
- stateManager: Redux, MobX, Zustand, Valtio, Jotai, Recoil...
- componentManager: React, Vue, Svelte, Angular, Solid, Lit...  
- domRenderer: SSR, Static, Canvas, WebGL, Native, AR/VR...
- enhancer: jQuery, Alpine, HTMX, Web Components...
- headless: Database, Authentication, Real-time, AI...

// Mix and match ANY combination
// Community innovations benefit EVERYONE
```

### Conclusion: A New Category of Framework

Juris isn't just "another JavaScript framework" - it's a **meta-framework** that transcends traditional framework limitations:

- **Not opinionated** - You choose the opinions
- **Not locked-in** - Change anything at any time  
- **Not breaking** - Evolve incrementally forever
- **Not limiting** - Infinite extensibility through plugins

**Juris enables framework freedom** - the ability to use the best parts of every framework, change your mind without penalty, and evolve your architecture as needs change.

This level of flexibility has never existed before in the JavaScript ecosystem, making Juris truly **the most flexible framework ever created**.

---

## DOMRenderer Replacement

### Complete DOMRenderer Override for SSR

The DOMRenderer can be replaced to support Server-Side Rendering (SSR), static HTML generation, or alternative rendering targets:

#### Method 1: Direct Replacement

```javascript
function CustomDOMRenderer(juris) {
  // Your custom renderer implementation
  return {
    render: (vnode) => { /* implementation */ },
    cleanup: (element) => { /* implementation */ },
    setRenderMode: (mode) => { /* implementation */ },
    // ... other DOMRenderer interface methods
  };
}

// Replace during initialization
const juris = new Juris({
  // ... other config
});

// Override the domRenderer
juris.domRenderer = new CustomDOMRenderer(juris);
```

#### Method 2: Runtime Replacement via Plugin

```javascript
function DOMRendererReplacer(props, context) {
  const { rendererClass, rendererConfig = {} } = props;
  
  let originalRenderer = null;
  let customRenderer = null;
  
  const replaceRenderer = () => {
    originalRenderer = context.juris.domRenderer;
    customRenderer = new rendererClass(context.juris, rendererConfig);
    context.juris.domRenderer = customRenderer;
    
    console.log('DOMRenderer replaced successfully');
  };
  
  const restoreOriginalRenderer = () => {
    if (originalRenderer) {
      context.juris.domRenderer = originalRenderer;
      console.log('Original DOMRenderer restored');
    }
  };
  
  return {
    api: {
      replaceRenderer,
      restoreOriginalRenderer,
      getCurrentRenderer: () => context.juris.domRenderer,
      getOriginalRenderer: () => originalRenderer,
      getCustomRenderer: () => customRenderer
    },
    
    hooks: {
      onRegister: () => {
        if (props.autoReplace !== false) {
          replaceRenderer();
        }
      },
      
      onUnregister: () => {
        if (props.autoRestore !== false) {
          restoreOriginalRenderer();
        }
      }
    }
  };
}
```

### Server-Side Renderer (SSR)

Here's a complete SSR-compatible renderer that can replace the built-in DOMRenderer:

```javascript
class SSRRenderer {
  constructor(juris, config = {}) {
    this.juris = juris;
    this.isServer = config.isServer || (typeof window === 'undefined');
    this.htmlOutput = '';
    this.componentStack = [];
    this.idCounter = 0;
    this.hydrationData = new Map();
    
    // SSR-specific options
    this.includeHydrationData = config.includeHydrationData !== false;
    this.prettify = config.prettify || false;
    this.doctype = config.doctype || '<!DOCTYPE html>';
    
    // Client-side hydration support
    this.subscriptions = this.isServer ? null : new WeakMap();
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
  
  // Main render method - works for both SSR and CSR
  render(vnode) {
    if (this.isServer) {
      return this.renderToString(vnode);
    } else {
      return this.renderToDOM(vnode);
    }
  }
  
  // Server-side rendering to HTML string
  renderToString(vnode, options = {}) {
    if (!vnode || typeof vnode !== 'object') {
      return '';
    }

    const tagName = Object.keys(vnode)[0];
    const props = vnode[tagName] || {};

    // Handle components
    if (this.juris.componentManager.components.has(tagName)) {
      return this.renderComponentToString(tagName, props);
    }

    // Handle regular elements
    return this.renderElementToString(tagName, props);
  }
  
  renderComponentToString(name, props) {
    this.componentStack.push(name);
    
    try {
      const componentFn = this.juris.componentManager.components.get(name);
      const context = this.createSSRContext();
      const result = componentFn(props, context);

      let html = '';
      if (result && typeof result === 'object' && typeof result.render === 'function') {
        // Lifecycle component
        html = this.renderToString(result.render());
      } else {
        // Direct result
        html = this.renderToString(result);
      }

      this.componentStack.pop();
      return html;
    } catch (error) {
      console.error(`SSR Error in component '${name}':`, error);
      this.componentStack.pop();
      return `<!-- Error rendering component ${name}: ${error.message} -->`;
    }
  }
  
  renderElementToString(tagName, props) {
    const attributes = [];
    const styles = [];
    let children = '';
    let textContent = '';
    
    // Generate unique ID for hydration
    const hydrationId = this.generateHydrationId();
    attributes.push(`data-juris-ssr="${hydrationId}"`);
    
    Object.keys(props).forEach(key => {
      const value = props[key];
      
      if (key === 'children') {
        children = this.renderChildrenToString(value, hydrationId);
      } else if (key === 'text') {
        textContent = this.renderTextToString(value, hydrationId);
      } else if (key === 'innerHTML') {
        // Dangerous - but supported
        if (typeof value === 'function') {
          this.captureReactiveData(hydrationId, key, value);
          children = this.executeFunction(value, '');
        } else {
          children = value;
        }
      } else if (key === 'style') {
        this.handleStyleSSR(value, styles, hydrationId);
      } else if (key.startsWith('on')) {
        this.handleEventSSR(key, value, attributes, hydrationId);
      } else if (typeof value === 'function') {
        this.handleReactiveAttributeSSR(key, value, attributes, hydrationId);
      } else if (key !== 'key') {
        this.handleStaticAttributeSSR(key, value, attributes);
      }
    });
    
    // Add styles if any
    if (styles.length > 0) {
      attributes.push(`style="${styles.join('; ')}"`);
    }
    
    // Build HTML
    const attributeString = attributes.length > 0 ? ` ${attributes.join(' ')}` : '';
    const content = textContent || children;
    
    // Self-closing tags
    if (this.isSelfClosing(tagName)) {
      return `<${tagName}${attributeString} />`;
    }
    
    return `<${tagName}${attributeString}>${content}</${tagName}>`;
  }
  
  renderChildrenToString(children, parentId) {
    if (children === "ignore") {
      return '';
    }
    
    if (typeof children === 'function') {
      this.captureReactiveData(parentId, 'children', children);
      return this.executeFunction(children, (result) => {
        if (Array.isArray(result)) {
          return result.map(child => this.renderToString(child)).join('');
        } else if (result) {
          return this.renderToString(result);
        }
        return '';
      });
    }
    
    if (Array.isArray(children)) {
      return children.map(child => this.renderToString(child)).join('');
    } else if (children) {
      return this.renderToString(children);
    }
    
    return '';
  }
  
  renderTextToString(text, parentId) {
    if (typeof text === 'function') {
      this.captureReactiveData(parentId, 'text', text);
      return this.executeFunction(text, '');
    }
    return this.escapeHtml(String(text));
  }
  
  handleStyleSSR(style, styles, parentId) {
    if (typeof style === 'function') {
      this.captureReactiveData(parentId, 'style', style);
      const styleObj = this.executeFunction(style, {});
      if (typeof styleObj === 'object') {
        Object.entries(styleObj).forEach(([prop, value]) => {
          const cssProp = prop.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
          styles.push(`${cssProp}: ${value}`);
        });
      }
    } else if (typeof style === 'object') {
      Object.entries(style).forEach(([prop, value]) => {
        if (typeof value === 'function') {
          this.captureReactiveData(parentId, `style.${prop}`, value);
          const resolvedValue = this.executeFunction(value, '');
          const cssProp = prop.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
          styles.push(`${cssProp}: ${resolvedValue}`);
        } else {
          const cssProp = prop.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
          styles.push(`${cssProp}: ${value}`);
        }
      });
    }
  }
  
  handleEventSSR(eventName, handler, attributes, parentId) {
    // Store event handler for hydration
    this.captureReactiveData(parentId, eventName, handler);
    
    // Add data attribute for hydration
    attributes.push(`data-juris-event-${eventName}="true"`);
  }
  
  handleReactiveAttributeSSR(attr, valueFn, attributes, parentId) {
    this.captureReactiveData(parentId, attr, valueFn);
    const value = this.executeFunction(valueFn, '');
    this.handleStaticAttributeSSR(attr, value, attributes);
  }
  
  handleStaticAttributeSSR(attr, value, attributes) {
    if (attr === 'className') {
      attributes.push(`class="${this.escapeHtml(value)}"`);
    } else if (attr === 'htmlFor') {
      attributes.push(`for="${this.escapeHtml(value)}"`);
    } else if (attr.startsWith('data-') || attr.startsWith('aria-')) {
      attributes.push(`${attr}="${this.escapeHtml(value)}"`);
    } else {
      attributes.push(`${attr}="${this.escapeHtml(value)}"`);
    }
  }
  
  // Client-side hydration
  renderToDOM(vnode) {
    if (!vnode || typeof vnode !== 'object') {
      return null;
    }

    const tagName = Object.keys(vnode)[0];
    const props = vnode[tagName] || {};

    // Check if this element was server-rendered
    const hydrationId = this.findHydrationElement(tagName, props);
    if (hydrationId) {
      return this.hydrateElement(hydrationId, tagName, props);
    }

    // Fallback to normal rendering
    return this.createFreshElement(tagName, props);
  }
  
  hydrateElement(hydrationId, tagName, props) {
    const element = document.querySelector(`[data-juris-ssr="${hydrationId}"]`);
    if (!element) {
      console.warn(`Hydration element not found for ID: ${hydrationId}`);
      return this.createFreshElement(tagName, props);
    }
    
    // Restore reactive behavior
    const hydrationData = this.getHydrationData(hydrationId);
    if (hydrationData) {
      this.attachReactivity(element, hydrationData);
    }
    
    // Remove SSR marker
    element.removeAttribute('data-juris-ssr');
    
    return element;
  }
  
  attachReactivity(element, hydrationData) {
    const subscriptions = [];
    const eventListeners = [];
    
    Object.entries(hydrationData).forEach(([key, functionData]) => {
      if (key.startsWith('on')) {
        // Restore event handler
        this.attachEventHandler(element, key, functionData, eventListeners);
      } else if (key === 'children') {
        // Restore children reactivity
        this.attachChildrenReactivity(element, functionData, subscriptions);
      } else if (key === 'text') {
        // Restore text reactivity
        this.attachTextReactivity(element, functionData, subscriptions);
      } else if (key === 'style') {
        // Restore style reactivity
        this.attachStyleReactivity(element, functionData, subscriptions);
      } else {
        // Restore attribute reactivity
        this.attachAttributeReactivity(element, key, functionData, subscriptions);
      }
    });
    
    if (subscriptions.length > 0 || eventListeners.length > 0) {
      this.subscriptions.set(element, { subscriptions, eventListeners });
    }
  }
  
  attachEventHandler(element, eventName, handler, eventListeners) {
    const actualEventName = this.eventMap[eventName.toLowerCase()] || eventName.slice(2).toLowerCase();
    
    if (eventName === 'onclick') {
      // Special handling for click events (touch support)
      element.addEventListener('click', handler);
      eventListeners.push({ eventName: 'click', handler });
    } else {
      element.addEventListener(actualEventName, handler);
      eventListeners.push({ eventName: actualEventName, handler });
    }
  }
  
  // Utility methods
  createSSRContext() {
    return {
      // State management (read-only during SSR)
      getState: (path, defaultValue) => {
        // During SSR, try to get initial state
        return this.juris.stateManager.getState(path, defaultValue);
      },
      setState: (path, value, context) => {
        // During SSR, state changes are ignored
        if (!this.isServer) {
          this.juris.stateManager.setState(path, value, context);
        }
      },
      subscribe: (path, callback) => {
        // During SSR, subscriptions are no-ops
        if (!this.isServer) {
          return this.juris.stateManager.subscribe(path, callback);
        }
        return () => {};
      },
      
      // Services
      services: this.juris.services || {},
      
      // SSR context
      isSSR: this.isServer,
      
      // Other context methods...
      ...(this.juris.createContext ? this.juris.createContext() : {})
    };
  }
  
  generateHydrationId() {
    return `ssr_${++this.idCounter}`;
  }
  
  captureReactiveData(hydrationId, key, fn) {
    if (this.includeHydrationData) {
      if (!this.hydrationData.has(hydrationId)) {
        this.hydrationData.set(hydrationId, {});
      }
      this.hydrationData.get(hydrationId)[key] = fn;
    }
  }
  
  executeFunction(fn, defaultValue) {
    try {
      return fn();
    } catch (error) {
      console.error('SSR function execution error:', error);
      return defaultValue;
    }
  }
  
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return String(text).replace(/[&<>"']/g, (m) => map[m]);
  }
  
  isSelfClosing(tagName) {
    const selfClosing = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 
                         'link', 'meta', 'param', 'source', 'track', 'wbr'];
    return selfClosing.includes(tagName.toLowerCase());
  }
  
  findHydrationElement(tagName, props) {
    // Look for matching SSR element
    const elements = document.querySelectorAll(`${tagName}[data-juris-ssr]`);
    // Simple matching - could be more sophisticated
    return elements.length > 0 ? elements[0].getAttribute('data-juris-ssr') : null;
  }
  
  getHydrationData(hydrationId) {
    return this.hydrationData.get(hydrationId);
  }
  
  createFreshElement(tagName, props) {
    // Fallback to normal DOM creation
    return this.juris.domRenderer.render({ [tagName]: props });
  }
  
  // Required interface methods
  setRenderMode(mode) {
    // SSR renderer doesn't use render modes
    console.log(`SSR Renderer: render mode '${mode}' not applicable`);
  }
  
  getRenderMode() {
    return 'ssr';
  }
  
  cleanup(element) {
    if (this.isServer) return;
    
    const data = this.subscriptions?.get(element);
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
  }
}
```

### String Renderer (Static HTML Generation)

```javascript
class StringRenderer {
  constructor(juris, config = {}) {
    this.juris = juris;
    this.prettify = config.prettify || false;
    this.indentSize = config.indentSize || 2;
    this.currentIndent = 0;
  }
  
  render(vnode) {
    return this.renderToString(vnode);
  }
  
  renderToString(vnode, indent = 0) {
    if (!vnode || typeof vnode !== 'object') {
      return '';
    }

    const tagName = Object.keys(vnode)[0];
    const props = vnode[tagName] || {};

    // Handle components
    if (this.juris.componentManager.components.has(tagName)) {
      return this.renderComponent(tagName, props, indent);
    }

    // Handle regular elements
    return this.renderElement(tagName, props, indent);
  }
  
  renderComponent(name, props, indent) {
    try {
      const componentFn = this.juris.componentManager.components.get(name);
      const context = this.createStaticContext();
      const result = componentFn(props, context);

      if (result && typeof result === 'object' && typeof result.render === 'function') {
        return this.renderToString(result.render(), indent);
      } else {
        return this.renderToString(result, indent);
      }
    } catch (error) {
      console.error(`Static render error in component '${name}':`, error);
      return `<!-- Error: ${error.message} -->`;
    }
  }
  
  renderElement(tagName, props, indent) {
    const indentStr = this.prettify ? ' '.repeat(indent * this.indentSize) : '';
    const childIndentStr = this.prettify ? ' '.repeat((indent + 1) * this.indentSize) : '';
    
    const attributes = [];
    let children = '';
    let textContent = '';
    
    Object.keys(props).forEach(key => {
      const value = props[key];
      
      if (key === 'children') {
        children = this.renderChildren(value, indent + 1);
      } else if (key === 'text') {
        textContent = this.renderText(value);
      } else if (key === 'innerHTML') {
        children = typeof value === 'function' ? this.executeFunction(value, '') : value;
      } else if (key === 'style') {
        this.handleStyle(value, attributes);
      } else if (!key.startsWith('on') && typeof value !== 'function' && key !== 'key') {
        this.handleStaticAttribute(key, value, attributes);
      }
    });
    
    const attributeString = attributes.length > 0 ? ` ${attributes.join(' ')}` : '';
    const content = textContent || children;
    
    if (this.isSelfClosing(tagName)) {
      return `${indentStr}<${tagName}${attributeString} />`;
    }
    
    const openTag = `${indentStr}<${tagName}${attributeString}>`;
    const closeTag = `${indentStr}</${tagName}>`;
    
    if (content) {
      if (this.prettify && children && !textContent) {
        return `${openTag}\n${content}\n${closeTag}`;
      } else {
        return `${openTag}${content}${closeTag}`;
      }
    }
    
    return `${openTag}${closeTag}`;
  }
  
  renderChildren(children, indent) {
    if (children === "ignore") return '';
    
    if (typeof children === 'function') {
      const result = this.executeFunction(children, null);
      return this.renderChildren(result, indent);
    }
    
    if (Array.isArray(children)) {
      const childrenHtml = children.map(child => this.renderToString(child, indent)).join('');
      return this.prettify ? childrenHtml : childrenHtml;
    } else if (children) {
      return this.renderToString(children, indent);
    }
    
    return '';
  }
  
  renderText(text) {
    if (typeof text === 'function') {
      return this.escapeHtml(this.executeFunction(text, ''));
    }
    return this.escapeHtml(String(text));
  }
  
  handleStyle(style, attributes) {
    if (typeof style === 'function') {
      const styleObj = this.executeFunction(style, {});
      if (typeof styleObj === 'object') {
        const cssText = this.styleObjectToCssText(styleObj);
        attributes.push(`style="${cssText}"`);
      }
    } else if (typeof style === 'object') {
      const cssText = this.styleObjectToCssText(style);
      attributes.push(`style="${cssText}"`);
    }
  }
  
  handleStaticAttribute(attr, value, attributes) {
    if (attr === 'className') {
      attributes.push(`class="${this.escapeHtml(value)}"`);
    } else if (attr === 'htmlFor') {
      attributes.push(`for="${this.escapeHtml(value)}"`);
    } else {
      attributes.push(`${attr}="${this.escapeHtml(value)}"`);
    }
  }
  
  createStaticContext() {
    return {
      getState: (path, defaultValue) => {
        return this.juris.stateManager.getState(path, defaultValue);
      },
      setState: () => {}, // No-op for static rendering
      subscribe: () => () => {}, // No-op for static rendering
      services: this.juris.services || {},
      isStatic: true
    };
  }
  
  executeFunction(fn, defaultValue) {
    try {
      return fn();
    } catch (error) {
      console.error('Static render function error:', error);
      return defaultValue;
    }
  }
  
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return String(text).replace(/[&<>"']/g, (m) => map[m]);
  }
  
  styleObjectToCssText(styleObj) {
    return Object.entries(styleObj)
      .map(([prop, value]) => {
        const cssProp = prop.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
        return `${cssProp}: ${value}`;
      })
      .join('; ');
  }
  
  isSelfClosing(tagName) {
    const selfClosing = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 
                         'link', 'meta', 'param', 'source', 'track', 'wbr'];
    return selfClosing.includes(tagName.toLowerCase());
  }
  
  // Required interface methods
  setRenderMode() {
    console.log('String renderer does not support render modes');
  }
  
  getRenderMode() {
    return 'string';
  }
  
  cleanup() {
    // No cleanup needed for string rendering
  }
}
```

### Usage Examples

#### Server-Side Rendering Setup

```javascript
// server.js (Node.js)
const { Juris } = require('./juris');

// Create SSR-capable Juris instance
const createSSRJuris = (initialState = {}) => {
  const juris = new Juris({
    states: initialState,
    components: {
      App: require('./components/App'),
      Header: require('./components/Header'),
      // ... other components
    }
  });
  
  // Replace with SSR renderer
  juris.domRenderer = new SSRRenderer(juris, {
    isServer: true,
    includeHydrationData: true,
    prettify: true
  });
  
  return juris;
};

// Express route
app.get('/', (req, res) => {
  const juris = createSSRJuris({
    user: { name: 'John', email: 'john@example.com' },
    posts: []
  });
  
  // Render to HTML string
  const html = juris.domRenderer.renderToString({
    App: { 
      initialData: req.query 
    }
  });
  
  // Send complete HTML page
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>My SSR App</title>
        <script>
          window.__JURIS_INITIAL_STATE__ = ${JSON.stringify(juris.stateManager.state)};
        </script>
      </head>
      <body>
        <div id="app">${html}</div>
        <script src="/client.js"></script>
      </body>
    </html>
  `);
});
```

#### Client-Side Hydration

```javascript
// client.js
document.addEventListener('DOMContentLoaded', () => {
  // Create client-side Juris instance
  const juris = new Juris({
    states: window.__JURIS_INITIAL_STATE__ || {},
    components: {
      App: require('./components/App'),
      Header: require('./components/Header'),
      // ... other components
    }
  });
  
  // Replace with SSR renderer in client mode
  juris.domRenderer = new SSRRenderer(juris, {
    isServer: false,
    includeHydrationData: true
  });
  
  // Hydrate the SSR content
  const appContainer = document.getElementById('app');
  if (appContainer.hasChildNodes()) {
    // Hydrate existing content
    juris.domRenderer.hydrate(appContainer);
  } else {
    // Fallback to normal rendering
    juris.render('#app');
  }
});
```

#### Static Site Generation

```javascript
// build.js - Static site generation
const fs = require('fs');
const path = require('path');

const generateStaticSite = () => {
  const pages = [
    { route: '/', component: 'HomePage', data: {} },
    { route: '/about', component: 'AboutPage', data: {} },
    { route: '/blog', component: 'BlogPage', data: { posts: getBlogPosts() } }
  ];
  
  pages.forEach(({ route, component, data }) => {
    const juris = new Juris({
      states: data,
      components: require('./components')
    });
    
    // Use string renderer for static generation
    juris.domRenderer = new StringRenderer(juris, {
      prettify: true
    });
    
    const html = juris.domRenderer.renderToString({
      [component]: data
    });
    
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>My Static Site</title>
          <link rel="stylesheet" href="/styles.css">
        </head>
        <body>
          ${html}
          <script src="/client.js"></script>
        </body>
      </html>
    `;
    
    // Write static HTML file
    const outputPath = path.join('dist', route === '/' ? 'index.html' : `${route}/index.html`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, fullHtml);
  });
};

generateStaticSite();
```

#### Next.js-Style SSR with API Routes

```javascript
// pages/api/ssr.js
export default async function handler(req, res) {
  const { page, ...props } = req.query;
  
  const juris = new Juris({
    states: await getInitialState(props),
    components: await import(`../components/${page}`)
  });
  
  juris.domRenderer = new SSRRenderer(juris, {
    isServer: true
  });
  
  const html = juris.domRenderer.renderToString({
    [page]: props
  });
  
  res.status(200).json({
    html,
    initialState: juris.stateManager.state
  });
}

// Client-side usage
const loadSSRPage = async (page, props) => {
  const response = await fetch(`/api/ssr?page=${page}&${new URLSearchParams(props)}`);
  const { html, initialState } = await response.json();
  
  // Update container with SSR content
  document.getElementById('app').innerHTML = html;
  
  // Initialize client-side Juris with SSR state
  const juris = new Juris({
    states: initialState,
    components: await import(`./components/${page}`)
  });
  
  juris.domRenderer = new SSRRenderer(juris, { isServer: false });
  juris.domRenderer.hydrate(document.getElementById('app'));
};
```

#### Plugin-Based Renderer Replacement

```javascript
const juris = new Juris({
  headlessComponents: {
    rendererReplacer: {
      fn: DOMRendererReplacer,
      options: {
        autoInit: true,
        rendererClass: SSRRenderer,
        rendererConfig: {
          isServer: typeof window === 'undefined',
          prettify: process.env.NODE_ENV === 'development'
        },
        autoReplace: true
      }
    }
  }
});

// Now Juris supports SSR automatically
```

---

## ComponentManager Replacement

### Complete ComponentManager Override

The ComponentManager can be replaced to support JSX transpilation, React-like components, or any other component system:

#### Method 1: Direct Replacement

```javascript
function CustomComponentManager(juris) {
  // Your custom component manager implementation
  return {
    register: (name, componentFn) => { /* implementation */ },
    create: (name, props) => { /* implementation */ },
    cleanup: (element) => { /* implementation */ },
    // ... other ComponentManager interface methods
  };
}

// Replace during initialization
const juris = new Juris({
  // ... other config
});

// Override the componentManager immediately after creation
juris.componentManager = new CustomComponentManager(juris);
```

#### Method 2: Runtime Replacement via Plugin

```javascript
function ComponentManagerReplacer(props, context) {
  const { componentManagerClass, componentManagerConfig = {} } = props;
  
  let originalComponentManager = null;
  let customComponentManager = null;
  
  const replaceComponentManager = () => {
    // Store original for potential restoration
    originalComponentManager = context.juris.componentManager;
    
    // Create and install new component manager
    customComponentManager = new componentManagerClass(context.juris, componentManagerConfig);
    context.juris.componentManager = customComponentManager;
    
    console.log('ComponentManager replaced successfully');
  };
  
  const restoreOriginalComponentManager = () => {
    if (originalComponentManager) {
      context.juris.componentManager = originalComponentManager;
      console.log('Original ComponentManager restored');
    }
  };
  
  return {
    api: {
      replaceComponentManager,
      restoreOriginalComponentManager,
      getCurrentComponentManager: () => context.juris.componentManager,
      getOriginalComponentManager: () => originalComponentManager,
      getCustomComponentManager: () => customComponentManager
    },
    
    hooks: {
      onRegister: () => {
        if (props.autoReplace !== false) {
          replaceComponentManager();
        }
      },
      
      onUnregister: () => {
        if (props.autoRestore !== false) {
          restoreOriginalComponentManager();
        }
      }
    }
  };
}
```

### JSX Component Manager

Here's a complete JSX-compatible ComponentManager that can replace the built-in one:

```javascript
class JSXComponentManager {
  constructor(juris, config = {}) {
    this.juris = juris;
    this.components = new Map();
    this.instances = new WeakMap();
    this.jsxPragma = config.pragma || 'h'; // JSX pragma function
    this.fragment = config.fragment || 'Fragment';
    
    // Setup JSX pragma globally if requested
    if (config.setupGlobal) {
      this._setupGlobalJSX();
    }
  }
  
  _setupGlobalJSX() {
    // Make JSX pragma available globally
    window[this.jsxPragma] = this.createElement.bind(this);
    window[this.fragment] = this.createFragment.bind(this);
    
    // Also make React-style JSX work
    window.React = {
      createElement: this.createElement.bind(this),
      Fragment: this.createFragment.bind(this)
    };
  }
  
  // JSX pragma function - converts JSX to Juris objects
  createElement(type, props = {}, ...children) {
    // Flatten children and filter out nulls/undefined
    const flatChildren = children.flat(Infinity).filter(child => 
      child !== null && child !== undefined && child !== false
    );
    
    // Handle text nodes
    const processedChildren = flatChildren.map(child => {
      if (typeof child === 'string' || typeof child === 'number') {
        return { text: { text: child } };
      }
      return child;
    });
    
    // Create Juris-compatible object
    const element = {
      [type]: {
        ...props,
        children: processedChildren.length === 1 
          ? processedChildren[0] 
          : processedChildren
      }
    };
    
    return element;
  }
  
  createFragment(props, ...children) {
    // Fragment is just a div that gets unwrapped
    return this.createElement('div', { 
      ...props, 
      'data-fragment': true 
    }, ...children);
  }
  
  register(name, componentFn) {
    // Support both JSX and traditional Juris components
    if (this._isJSXComponent(componentFn)) {
      this.components.set(name, this._wrapJSXComponent(componentFn));
    } else {
      this.components.set(name, componentFn);
    }
  }
  
  _isJSXComponent(componentFn) {
    // Detect if component returns JSX (has $typeof or other JSX markers)
    const testResult = componentFn({}, this._createMockContext());
    return this._looksLikeJSX(testResult);
  }
  
  _looksLikeJSX(obj) {
    // Simple heuristic to detect JSX-like objects
    return obj && 
           typeof obj === 'object' && 
           !Array.isArray(obj) &&
           Object.keys(obj).length === 1 &&
           typeof Object.values(obj)[0] === 'object';
  }
  
  _wrapJSXComponent(jsxComponent) {
    return (props, context) => {
      // Create JSX-compatible context
      const jsxContext = this._createJSXContext(context);
      
      // Call JSX component
      const result = jsxComponent(props, jsxContext);
      
      // Convert result to Juris format if needed
      return this._processJSXResult(result);
    };
  }
  
  _createJSXContext(context) {
    return {
      ...context,
      
      // JSX-friendly state hooks
      useState: (initialValue) => {
        const stateId = this._generateStateId();
        const currentValue = context.getState(stateId, initialValue);
        
        const setState = (newValue) => {
          const value = typeof newValue === 'function' 
            ? newValue(context.getState(stateId)) 
            : newValue;
          context.setState(stateId, value);
        };
        
        return [currentValue, setState];
      },
      
      useEffect: (effect, dependencies = []) => {
        // Simple effect hook implementation
        const effectId = this._generateEffectId();
        const lastDeps = context.getState(`effects.${effectId}.deps`, []);
        
        const depsChanged = !this._arrayEquals(dependencies, lastDeps);
        
        if (depsChanged) {
          context.setState(`effects.${effectId}.deps`, dependencies);
          
          // Cleanup previous effect
          const cleanup = context.getState(`effects.${effectId}.cleanup`);
          if (cleanup && typeof cleanup === 'function') {
            cleanup();
          }
          
          // Run new effect
          const newCleanup = effect();
          if (newCleanup && typeof newCleanup === 'function') {
            context.setState(`effects.${effectId}.cleanup`, newCleanup);
          }
        }
      },
      
      // JSX element creation
      h: this.createElement.bind(this),
      createElement: this.createElement.bind(this),
      Fragment: this.createFragment.bind(this)
    };
  }
  
  _processJSXResult(result) {
    // If result is already Juris-compatible, return as-is
    if (this._isJurisObject(result)) {
      return result;
    }
    
    // Convert JSX result to Juris format
    return result;
  }
  
  _isJurisObject(obj) {
    return obj && typeof obj === 'object' && !Array.isArray(obj);
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

      if (result && typeof result === 'object' && typeof result.render === 'function') {
        return this._createLifecycleComponent(result, name, props);
      }

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
  
  // Utility methods
  _generateStateId() {
    return `state_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  _generateEffectId() {
    return `effect_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  _arrayEquals(a, b) {
    return a.length === b.length && a.every((val, i) => val === b[i]);
  }
  
  _createMockContext() {
    return {
      getState: () => null,
      setState: () => {},
      subscribe: () => () => {}
    };
  }
}
```

### React-Compatible Component Manager

```javascript
class ReactComponentManager extends JSXComponentManager {
  constructor(juris, config = {}) {
    super(juris, {
      pragma: 'React.createElement',
      fragment: 'React.Fragment',
      ...config
    });
    
    this.hooks = new Map();
    this.currentComponent = null;
    this.hookIndex = 0;
  }
  
  _wrapJSXComponent(reactComponent) {
    return (props, context) => {
      // Setup React-like hooks context
      this.currentComponent = reactComponent;
      this.hookIndex = 0;
      
      const jsxContext = this._createReactContext(context);
      
      // Call React component
      const result = reactComponent(props, jsxContext);
      
      // Reset hooks context
      this.currentComponent = null;
      this.hookIndex = 0;
      
      return result;
    };
  }
  
  _createReactContext(context) {
    return {
      ...super._createJSXContext(context),
      
      // React hooks
      useState: (initialValue) => {
        const hookKey = `${this.currentComponent.name || 'anonymous'}_${this.hookIndex++}`;
        const currentValue = context.getState(`hooks.${hookKey}`, initialValue);
        
        const setState = (newValue) => {
          const value = typeof newValue === 'function' 
            ? newValue(context.getState(`hooks.${hookKey}`)) 
            : newValue;
          context.setState(`hooks.${hookKey}`, value);
        };
        
        return [currentValue, setState];
      },
      
      useEffect: (effect, dependencies = []) => {
        const hookKey = `${this.currentComponent.name || 'anonymous'}_effect_${this.hookIndex++}`;
        const lastDeps = context.getState(`hooks.${hookKey}.deps`, []);
        
        const depsChanged = dependencies.length === 0 || 
          !this._arrayEquals(dependencies, lastDeps);
        
        if (depsChanged) {
          context.setState(`hooks.${hookKey}.deps`, dependencies);
          
          // Cleanup previous effect
          const cleanup = context.getState(`hooks.${hookKey}.cleanup`);
          if (cleanup && typeof cleanup === 'function') {
            cleanup();
          }
          
          // Run new effect
          const newCleanup = effect();
          if (newCleanup && typeof newCleanup === 'function') {
            context.setState(`hooks.${hookKey}.cleanup`, newCleanup);
          }
        }
      },
      
      useCallback: (callback, dependencies) => {
        const hookKey = `${this.currentComponent.name || 'anonymous'}_callback_${this.hookIndex++}`;
        const lastDeps = context.getState(`hooks.${hookKey}.deps`, []);
        const lastCallback = context.getState(`hooks.${hookKey}.callback`);
        
        if (!this._arrayEquals(dependencies, lastDeps)) {
          context.setState(`hooks.${hookKey}.deps`, dependencies);
          context.setState(`hooks.${hookKey}.callback`, callback);
          return callback;
        }
        
        return lastCallback || callback;
      },
      
      useMemo: (factory, dependencies) => {
        const hookKey = `${this.currentComponent.name || 'anonymous'}_memo_${this.hookIndex++}`;
        const lastDeps = context.getState(`hooks.${hookKey}.deps`, []);
        const lastValue = context.getState(`hooks.${hookKey}.value`);
        
        if (!this._arrayEquals(dependencies, lastDeps)) {
          const newValue = factory();
          context.setState(`hooks.${hookKey}.deps`, dependencies);
          context.setState(`hooks.${hookKey}.value`, newValue);
          return newValue;
        }
        
        return lastValue;
      },
      
      useRef: (initialValue) => {
        const hookKey = `${this.currentComponent.name || 'anonymous'}_ref_${this.hookIndex++}`;
        const ref = context.getState(`hooks.${hookKey}`, { current: initialValue });
        return ref;
      }
    };
  }
}
```

### Preact-Compatible Component Manager

```javascript
class PreactComponentManager extends JSXComponentManager {
  constructor(juris, config = {}) {
    super(juris, {
      pragma: 'h',
      fragment: 'Fragment',
      ...config
    });
  }
  
  createElement(type, props = {}, ...children) {
    // Preact-style JSX handling
    if (typeof type === 'function') {
      // Functional component
      return type(props, { children });
    }
    
    return super.createElement(type, props, ...children);
  }
  
  _createJSXContext(context) {
    return {
      ...super._createJSXContext(context),
      
      // Preact-style hooks
      useSignal: (initialValue) => {
        const stateId = this._generateStateId();
        const signal = {
          value: context.getState(stateId, initialValue),
          peek: () => context.getState(stateId),
          subscribe: (callback) => context.subscribe(stateId, callback)
        };
        
        Object.defineProperty(signal, 'value', {
          get: () => context.getState(stateId),
          set: (newValue) => context.setState(stateId, newValue)
        });
        
        return signal;
      }
    };
  }
}
```

### Usage Examples

#### JSX with Babel Transpilation

```javascript
// babel.config.js
module.exports = {
  presets: ['@babel/preset-env'],
  plugins: [
    ['@babel/plugin-transform-react-jsx', {
      pragma: 'h', // Use 'h' instead of React.createElement
      pragmaFrag: 'Fragment'
    }]
  ]
};

// Your JSX component
function MyJSXComponent(props, context) {
  const [count, setCount] = context.useState(0);
  
  return (
    <div>
      <h1>Count: {count}</h1>
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
    </div>
  );
}

// Setup Juris with JSX support
const juris = new Juris({
  components: {
    MyJSXComponent
  }
});

// Replace ComponentManager
juris.componentManager = new JSXComponentManager(juris, {
  pragma: 'h',
  fragment: 'Fragment',
  setupGlobal: true
});
```

#### React-Style Components

```javascript
// React-style component
function ReactLikeComponent(props) {
  const [state, setState] = React.useState({ count: 0 });
  
  React.useEffect(() => {
    console.log('Component mounted');
    return () => console.log('Component unmounted');
  }, []);
  
  const increment = React.useCallback(() => {
    setState(prev => ({ count: prev.count + 1 }));
  }, []);
  
  return (
    <div className="react-component">
      <h2>React-style Component</h2>
      <p>Count: {state.count}</p>
      <button onClick={increment}>Increment</button>
    </div>
  );
}

// Setup with React compatibility
const juris = new Juris({
  components: {
    ReactLikeComponent
  }
});

juris.componentManager = new ReactComponentManager(juris, {
  setupGlobal: true
});
```

#### Plugin-Based Replacement

```javascript
const juris = new Juris({
  headlessComponents: {
    componentReplacer: {
      fn: ComponentManagerReplacer,
      options: {
        autoInit: true,
        componentManagerClass: JSXComponentManager,
        componentManagerConfig: {
          pragma: 'h',
          setupGlobal: true
        },
        autoReplace: true
      }
    }
  }
});

// Now all components support JSX
juris.registerComponent('MyJSXComponent', (props, context) => {
  return <div>Hello JSX!</div>;
});
```

#### TypeScript JSX Support

```typescript
// types/jsx.d.ts
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
  
  interface Element {
    [key: string]: any;
  }
}

// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react",
    "jsxFactory": "h",
    "jsxFragmentFactory": "Fragment"
  }
}

// Component with TypeScript
interface Props {
  name: string;
  age: number;
}

function TypedComponent(props: Props, context: any) {
  return (
    <div className="typed-component">
      <h1>Hello {props.name}</h1>
      <p>Age: {props.age}</p>
    </div>
  );
}
```

---

## StateManager Replacement

### Complete StateManager Override

To completely replace the built-in StateManager, you can override it during Juris initialization or at runtime:

#### Method 1: Initialization Override

```javascript
function CustomStateManager() {
  // Your custom state manager implementation
  return {
    getState: (path, defaultValue) => { /* implementation */ },
    setState: (path, value, context) => { /* implementation */ },
    subscribe: (path, callback) => { /* implementation */ },
    subscribeInternal: (path, callback) => { /* implementation */ },
    startTracking: () => { /* implementation */ },
    endTracking: () => { /* implementation */ },
    // ... other StateManager interface methods
  };
}

// Replace during initialization
const juris = new Juris({
  // ... other config
});

// Override the stateManager immediately after creation
juris.stateManager = new CustomStateManager();
```

#### Method 2: Runtime Replacement via Plugin

```javascript
function StateManagerReplacer(props, context) {
  const { stateManagerClass, stateManagerConfig = {} } = props;
  
  let originalStateManager = null;
  let customStateManager = null;
  
  const replaceStateManager = () => {
    // Store original for potential restoration
    originalStateManager = context.juris.stateManager;
    
    // Create and install new state manager
    customStateManager = new stateManagerClass(stateManagerConfig);
    context.juris.stateManager = customStateManager;
    
    // Update all component contexts to use new state manager
    context.juris._updateComponentContexts();
    
    console.log('StateManager replaced successfully');
  };
  
  const restoreOriginalStateManager = () => {
    if (originalStateManager) {
      context.juris.stateManager = originalStateManager;
      context.juris._updateComponentContexts();
      console.log('Original StateManager restored');
    }
  };
  
  return {
    api: {
      replaceStateManager,
      restoreOriginalStateManager,
      getCurrentStateManager: () => context.juris.stateManager,
      getOriginalStateManager: () => originalStateManager,
      getCustomStateManager: () => customStateManager
    },
    
    hooks: {
      onRegister: () => {
        if (props.autoReplace !== false) {
          replaceStateManager();
        }
      },
      
      onUnregister: () => {
        if (props.autoRestore !== false) {
          restoreOriginalStateManager();
        }
      }
    }
  };
}

// Usage
const juris = new Juris({
  headlessComponents: {
    stateReplacer: {
      fn: StateManagerReplacer,
      options: {
        autoInit: true,
        stateManagerClass: CustomReduxStateManager,
        stateManagerConfig: { /* config */ },
        autoReplace: true,
        autoRestore: true
      }
    }
  }
});
```

### Custom StateManager Implementation

Here's a complete custom StateManager that can replace the built-in one:

```javascript
class ReduxStateManager {
  constructor(config = {}) {
    this.store = null;
    this.subscribers = new Map();
    this.externalSubscribers = new Map();
    this.currentTracking = null;
    this.pathCache = new Map();
    
    // Initialize Redux store if provided
    if (config.store) {
      this.setStore(config.store);
    }
  }
  
  setStore(store) {
    this.store = store;
    
    // Subscribe to Redux store changes
    this.store.subscribe(() => {
      this._notifyAllSubscribers();
    });
  }
  
  getState(path, defaultValue = null) {
    if (!this.store) return defaultValue;
    
    // Track dependency for reactivity
    if (this.currentTracking) {
      this.currentTracking.add(path);
    }
    
    const state = this.store.getState();
    const value = this._getValueByPath(state, path);
    return value !== undefined ? value : defaultValue;
  }
  
  setState(path, value, context = {}) {
    if (!this.store) {
      console.warn('No Redux store configured');
      return;
    }
    
    // Dispatch Redux action
    this.store.dispatch({
      type: 'JURIS_SET_STATE',
      payload: { path, value, context }
    });
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
  
  // Internal methods
  _getValueByPath(obj, path) {
    if (!path) return obj;
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  _notifyAllSubscribers() {
    // Notify all subscribers when Redux state changes
    const allPaths = new Set([
      ...this.subscribers.keys(),
      ...this.externalSubscribers.keys()
    ]);
    
    allPaths.forEach(path => {
      this._notifyPathSubscribers(path);
    });
  }
  
  _notifyPathSubscribers(path) {
    const currentValue = this.getState(path);
    
    // Notify internal subscribers
    const internalSubs = this.subscribers.get(path);
    if (internalSubs) {
      internalSubs.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error('Internal subscriber error:', error);
        }
      });
    }
    
    // Notify external subscribers
    const externalSubs = this.externalSubscribers.get(path);
    if (externalSubs) {
      externalSubs.forEach(callback => {
        try {
          callback(currentValue, undefined, path);
        } catch (error) {
          console.error('External subscriber error:', error);
        }
      });
    }
  }
}
```

### MobX StateManager Replacement

```javascript
class MobXStateManager {
  constructor(config = {}) {
    this.observableState = this._makeObservable(config.initialState || {});
    this.subscribers = new Map();
    this.externalSubscribers = new Map();
    this.currentTracking = null;
    this.reactions = new Set();
  }
  
  _makeObservable(obj) {
    // Simplified MobX-like observable implementation
    return new Proxy(obj, {
      set: (target, key, value) => {
        const oldValue = target[key];
        target[key] = this._makeObservable(value);
        this._notifyChange(key, value, oldValue);
        return true;
      },
      
      get: (target, key) => {
        if (this.currentTracking) {
          this.currentTracking.add(String(key));
        }
        return target[key];
      }
    });
  }
  
  getState(path, defaultValue = null) {
    if (this.currentTracking) {
      this.currentTracking.add(path);
    }
    
    const value = this._getValueByPath(this.observableState, path);
    return value !== undefined ? value : defaultValue;
  }
  
  setState(path, value, context = {}) {
    this._setValueByPath(this.observableState, path, value);
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
    // Create MobX-style reaction
    const reaction = () => {
      this.currentTracking = new Set();
      callback();
      this.currentTracking = null;
    };
    
    this.reactions.add(reaction);
    
    if (!this.subscribers.has(path)) {
      this.subscribers.set(path, new Set());
    }
    this.subscribers.get(path).add(reaction);
    
    return () => {
      this.reactions.delete(reaction);
      const subs = this.subscribers.get(path);
      if (subs) {
        subs.delete(reaction);
        if (subs.size === 0) {
          this.subscribers.delete(path);
        }
      }
    };
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
  
  // Internal methods
  _getValueByPath(obj, path) {
    if (!path) return obj;
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  _setValueByPath(obj, path, value) {
    const parts = path.split('.');
    const lastKey = parts.pop();
    const target = parts.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }
  
  _notifyChange(key, newValue, oldValue) {
    // Trigger all reactions
    this.reactions.forEach(reaction => {
      try {
        reaction();
      } catch (error) {
        console.error('MobX reaction error:', error);
      }
    });
  }
}
```

### Zustand StateManager Replacement

```javascript
class ZustandStateManager {
  constructor(config = {}) {
    this.state = config.initialState || {};
    this.subscribers = new Map();
    this.externalSubscribers = new Map();
    this.currentTracking = null;
    this.listeners = new Set();
    
    // Create Zustand-style store
    this.store = this._createStore();
  }
  
  _createStore() {
    const setState = (partial, replace = false) => {
      const nextState = typeof partial === 'function' 
        ? partial(this.state) 
        : partial;
        
      if (replace) {
        this.state = nextState;
      } else {
        this.state = { ...this.state, ...nextState };
      }
      
      this._notifyAllListeners();
    };
    
    const getState = () => this.state;
    
    const subscribe = (listener) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };
    
    return { setState, getState, subscribe };
  }
  
  getState(path, defaultValue = null) {
    if (this.currentTracking) {
      this.currentTracking.add(path);
    }
    
    const value = this._getValueByPath(this.state, path);
    return value !== undefined ? value : defaultValue;
  }
  
  setState(path, value, context = {}) {
    const update = {};
    this._setValueByPath(update, path, value);
    this.store.setState(update);
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
  
  // Zustand-specific methods
  getStore() {
    return this.store;
  }
  
  // Internal methods
  _getValueByPath(obj, path) {
    if (!path) return obj;
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  _setValueByPath(obj, path, value) {
    const parts = path.split('.');
    const lastKey = parts.pop();
    const target = parts.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }
  
  _notifyAllListeners() {
    // Notify Zustand listeners
    this.listeners.forEach(listener => {
      try {
        listener(this.state);
      } catch (error) {
        console.error('Zustand listener error:', error);
      }
    });
    
    // Notify Juris subscribers
    const allPaths = new Set([
      ...this.subscribers.keys(),
      ...this.externalSubscribers.keys()
    ]);
    
    allPaths.forEach(path => {
      this._notifyPathSubscribers(path);
    });
  }
  
  _notifyPathSubscribers(path) {
    const currentValue = this.getState(path);
    
    // Notify internal subscribers
    const internalSubs = this.subscribers.get(path);
    if (internalSubs) {
      internalSubs.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error('Internal subscriber error:', error);
        }
      });
    }
    
    // Notify external subscribers
    const externalSubs = this.externalSubscribers.get(path);
    if (externalSubs) {
      externalSubs.forEach(callback => {
        try {
          callback(currentValue, undefined, path);
        } catch (error) {
          console.error('External subscriber error:', error);
        }
      });
    }
  }
}
```

### Usage Examples

#### Complete Redux Integration

```javascript
import { createStore, combineReducers } from 'redux';

// Define your reducers
const userReducer = (state = {}, action) => {
  switch (action.type) {
    case 'JURIS_SET_STATE':
      if (action.payload.path.startsWith('user.')) {
        const key = action.payload.path.replace('user.', '');
        return { ...state, [key]: action.payload.value };
      }
      return state;
    default:
      return state;
  }
};

const appReducer = combineReducers({
  user: userReducer,
  // ... other reducers
});

// Create Redux store
const store = createStore(appReducer);

// Replace Juris StateManager
const juris = new Juris({
  // ... other config
});

// Method 1: Direct replacement
juris.stateManager = new ReduxStateManager({ store });

// Method 2: Plugin-based replacement
const juris2 = new Juris({
  headlessComponents: {
    stateReplacer: {
      fn: StateManagerReplacer,
      options: {
        autoInit: true,
        stateManagerClass: ReduxStateManager,
        stateManagerConfig: { store },
        autoReplace: true
      }
    }
  }
});
```

#### MobX Integration

```javascript
// Replace with MobX StateManager
const juris = new Juris({
  // ... other config
});

juris.stateManager = new MobXStateManager({
  initialState: {
    user: { name: '', email: '' },
    posts: []
  }
});

// Now all Juris reactivity uses MobX under the hood
```

#### Zustand Integration

```javascript
// Replace with Zustand StateManager
const juris = new Juris({
  // ... other config
});

const zustandStateManager = new ZustandStateManager({
  initialState: {
    count: 0,
    user: null
  }
});

juris.stateManager = zustandStateManager;

// Access the underlying Zustand store if needed
const zustandStore = zustandStateManager.getStore();
zustandStore.setState({ count: 5 });
```

---

## Core Plugin Architecture

### Headless Component Structure

Every Juris plugin follows this basic structure:

```javascript
function MyPlugin(props, context) {
  // 1. Initialize plugin state/logic
  // 2. Create public API methods
  // 3. Set up lifecycle hooks
  // 4. Return plugin interface
  
  return {
    api: {
      // Public methods exposed to other components
    },
    hooks: {
      onRegister: () => {},    // Called when plugin registers
      onUnregister: () => {}   // Called when plugin unregisters
    }
  };
}
```

### Plugin Registration

```javascript
const juris = new Juris({
  headlessComponents: {
    'myPlugin': {
      fn: MyPlugin,
      options: { autoInit: true }
    }
  }
});

// Access plugin API in components
const context = juris.createContext();
context.myPlugin.someMethod();
```

---

## State Management Plugins

> **Important**: These plugins can completely replace `juris.stateManager` or work alongside it. For complete replacement, see the [StateManager Replacement](#statemanager-replacement) section.

### 1. Redux-Style State Plugin

Replace Juris StateManager with Redux patterns:

```javascript
function ReduxStatePlugin(props, context) {
  let store = null;
  let subscribers = new Set();
  
  // Initialize store with reducers
  const createStore = (reducer, initialState, middleware = []) => {
    let state = initialState;
    let listeners = [];
    
    const getState = () => state;
    
    const dispatch = (action) => {
      // Apply middleware
      let next = (action) => {
        state = reducer(state, action);
        listeners.forEach(listener => listener());
        notifyJurisSubscribers();
      };
      
      // Apply middleware in reverse order
      for (let i = middleware.length - 1; i >= 0; i--) {
        next = middleware[i](store)(next);
      }
      
      next(action);
    };
    
    const subscribe = (listener) => {
      listeners.push(listener);
      return () => {
        listeners = listeners.filter(l => l !== listener);
      };
    };
    
    store = { getState, dispatch, subscribe };
    return store;
  };
  
  const notifyJurisSubscribers = () => {
    subscribers.forEach(({ path, callback }) => {
      const value = getStateByPath(store.getState(), path);
      callback(value);
    });
  };
  
  const getStateByPath = (state, path) => {
    return path.split('.').reduce((obj, key) => obj?.[key], state);
  };
  
  return {
    api: {
      createStore,
      getStore: () => store,
      
      // Juris-compatible interface
      getState: (path, defaultValue = null) => {
        if (!store) return defaultValue;
        return getStateByPath(store.getState(), path) ?? defaultValue;
      },
      
      setState: (path, value) => {
        store?.dispatch({ type: 'SET_STATE', path, value });
      },
      
      dispatch: (action) => store?.dispatch(action),
      
      subscribe: (path, callback) => {
        const subscription = { path, callback };
        subscribers.add(subscription);
        
        return () => subscribers.delete(subscription);
      },
      
      // Redux DevTools integration
      enableDevTools: () => {
        if (window.__REDUX_DEVTOOLS_EXTENSION__) {
          return window.__REDUX_DEVTOOLS_EXTENSION__()(store);
        }
      }
    }
  };
}
```

### 2. MobX-Style Observable Plugin

```javascript
function MobXStatePlugin(props, context) {
  const observables = new Map();
  const computeds = new Map();
  const reactions = new Set();
  
  const observable = (obj) => {
    return new Proxy(obj, {
      set(target, key, value) {
        const oldValue = target[key];
        target[key] = value;
        
        // Notify observers
        notifyObservers(target, key, value, oldValue);
        return true;
      }
    });
  };
  
  const computed = (fn) => {
    let cachedValue;
    let isStale = true;
    
    return () => {
      if (isStale) {
        cachedValue = fn();
        isStale = false;
      }
      return cachedValue;
    };
  };
  
  const autorun = (fn) => {
    const reaction = { fn, dependencies: new Set() };
    reactions.add(reaction);
    
    // Track dependencies
    fn();
    
    return () => reactions.delete(reaction);
  };
  
  const notifyObservers = (target, key, newValue, oldValue) => {
    reactions.forEach(reaction => {
      if (reaction.dependencies.has(target)) {
        reaction.fn();
      }
    });
  };
  
  return {
    api: {
      observable,
      computed,
      autorun,
      
      // Juris integration
      createObservableState: (initialState) => {
        return observable(initialState);
      }
    }
  };
}
```

### 3. Zustand-Style Store Plugin

```javascript
function ZustandStatePlugin(props, context) {
  const stores = new Map();
  
  const create = (createState) => {
    const state = {};
    const listeners = new Set();
    
    const setState = (partial, replace) => {
      const nextState = typeof partial === 'function' 
        ? partial(state) 
        : partial;
        
      if (!replace) {
        Object.assign(state, nextState);
      } else {
        Object.keys(state).forEach(key => delete state[key]);
        Object.assign(state, nextState);
      }
      
      listeners.forEach(listener => listener(state));
    };
    
    const getState = () => state;
    
    const subscribe = (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
    
    const destroy = () => {
      listeners.clear();
    };
    
    // Initialize state
    const initialState = createState(setState, getState);
    Object.assign(state, initialState);
    
    const store = { setState, getState, subscribe, destroy };
    return store;
  };
  
  return {
    api: {
      create,
      
      // Global store registry
      registerStore: (name, store) => {
        stores.set(name, store);
      },
      
      getStore: (name) => stores.get(name),
      
      // Juris integration helpers
      connectToJuris: (store, path = '') => {
        return store.subscribe((state) => {
          // Sync with Juris state if needed
          if (context.setState && path) {
            context.setState(path, state);
          }
        });
      }
    }
  };
}
```

---

## Advanced State Patterns

### 1. Time Travel Debugging Plugin

```javascript
function TimeTravel(props, context) {
  let history = [];
  let currentIndex = -1;
  let isReplaying = false;
  
  const captureState = () => {
    if (isReplaying) return;
    
    const state = context.getState('') || {};
    history = history.slice(0, currentIndex + 1);
    history.push({
      state: JSON.parse(JSON.stringify(state)),
      timestamp: Date.now(),
      action: 'STATE_CHANGE'
    });
    currentIndex = history.length - 1;
  };
  
  const travelTo = (index) => {
    if (index < 0 || index >= history.length) return;
    
    isReplaying = true;
    currentIndex = index;
    const snapshot = history[index];
    
    // Restore state
    Object.keys(snapshot.state).forEach(key => {
      context.setState(key, snapshot.state[key]);
    });
    
    isReplaying = false;
  };
  
  return {
    api: {
      captureState,
      undo: () => travelTo(currentIndex - 1),
      redo: () => travelTo(currentIndex + 1),
      travelTo,
      getHistory: () => history,
      getCurrentIndex: () => currentIndex,
      canUndo: () => currentIndex > 0,
      canRedo: () => currentIndex < history.length - 1
    },
    
    hooks: {
      onRegister: () => {
        // Auto-capture on state changes
        context.subscribe('', captureState);
      }
    }
  };
}
```

### 2. State Persistence Plugin

```javascript
function StatePersistence(props, context) {
  const { storage = 'localStorage', key = 'juris-state' } = props;
  
  const getStorage = () => {
    switch (storage) {
      case 'localStorage': return window.localStorage;
      case 'sessionStorage': return window.sessionStorage;
      default: return null;
    }
  };
  
  const save = (path = '', data = null) => {
    const storageApi = getStorage();
    if (!storageApi) return;
    
    const stateToSave = data || context.getState(path);
    try {
      storageApi.setItem(`${key}:${path}`, JSON.stringify(stateToSave));
    } catch (error) {
      console.warn('Failed to save state:', error);
    }
  };
  
  const load = (path = '') => {
    const storageApi = getStorage();
    if (!storageApi) return null;
    
    try {
      const saved = storageApi.getItem(`${key}:${path}`);
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      console.warn('Failed to load state:', error);
      return null;
    }
  };
  
  const restore = (path = '') => {
    const saved = load(path);
    if (saved) {
      if (path) {
        context.setState(path, saved);
      } else {
        Object.keys(saved).forEach(key => {
          context.setState(key, saved[key]);
        });
      }
    }
  };
  
  return {
    api: {
      save,
      load,
      restore,
      clear: (path = '') => {
        const storageApi = getStorage();
        storageApi?.removeItem(`${key}:${path}`);
      },
      
      // Auto-save functionality
      enableAutoSave: (paths = [''], debounceMs = 1000) => {
        let timeoutId;
        
        paths.forEach(path => {
          context.subscribe(path, () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => save(path), debounceMs);
          });
        });
      }
    },
    
    hooks: {
      onRegister: () => {
        // Auto-restore on initialization
        if (props.autoRestore !== false) {
          restore();
        }
      }
    }
  };
}
```

### 3. State Validation Plugin

```javascript
function StateValidation(props, context) {
  const validators = new Map();
  const validationErrors = new Map();
  
  const addValidator = (path, validator) => {
    if (!validators.has(path)) {
      validators.set(path, []);
    }
    validators.get(path).push(validator);
    
    // Subscribe to changes
    context.subscribe(path, () => validatePath(path));
  };
  
  const validatePath = (path) => {
    const value = context.getState(path);
    const pathValidators = validators.get(path) || [];
    const errors = [];
    
    pathValidators.forEach(validator => {
      try {
        const result = validator(value);
        if (result !== true && result) {
          errors.push(typeof result === 'string' ? result : 'Validation failed');
        }
      } catch (error) {
        errors.push(error.message);
      }
    });
    
    if (errors.length > 0) {
      validationErrors.set(path, errors);
    } else {
      validationErrors.delete(path);
    }
    
    return errors;
  };
  
  const validateAll = () => {
    let allValid = true;
    validators.forEach((_, path) => {
      const errors = validatePath(path);
      if (errors.length > 0) allValid = false;
    });
    return allValid;
  };
  
  return {
    api: {
      addValidator,
      validatePath,
      validateAll,
      getErrors: (path) => validationErrors.get(path) || [],
      getAllErrors: () => Object.fromEntries(validationErrors),
      isValid: (path) => !validationErrors.has(path),
      isAllValid: () => validationErrors.size === 0,
      
      // Common validators
      validators: {
        required: (message = 'Field is required') => 
          (value) => value != null && value !== '' ? true : message,
        
        minLength: (min, message) => 
          (value) => (!value || value.length >= min) ? true : (message || `Minimum length is ${min}`),
        
        pattern: (regex, message) => 
          (value) => (!value || regex.test(value)) ? true : (message || 'Invalid format'),
        
        custom: (fn, message) => 
          (value) => fn(value) ? true : message
      }
    }
  };
}
```

---

## Integration Examples

### Complete Redux Integration

```javascript
// redux-integration.js
import { createStore, combineReducers, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';

function ReduxIntegration(props, context) {
  const { reducers, middleware = [thunk], devTools = true } = props;
  
  // Create Redux store
  const rootReducer = combineReducers(reducers);
  const enhancer = devTools && window.__REDUX_DEVTOOLS_EXTENSION__ 
    ? window.__REDUX_DEVTOOLS_EXTENSION__(applyMiddleware(...middleware))
    : applyMiddleware(...middleware);
    
  const store = createStore(rootReducer, enhancer);
  
  // Sync with Juris state
  store.subscribe(() => {
    const state = store.getState();
    Object.keys(state).forEach(key => {
      context.setState(`redux.${key}`, state[key]);
    });
  });
  
  return {
    api: {
      store,
      dispatch: store.dispatch,
      getState: store.getState,
      
      // Juris-compatible methods
      getReduxState: (path, defaultValue) => {
        const state = store.getState();
        return path.split('.').reduce((obj, key) => obj?.[key], state) ?? defaultValue;
      },
      
      // Connect component to Redux
      connect: (mapStateToProps, mapDispatchToProps) => {
        return (component) => {
          return (props, context) => {
            const stateProps = mapStateToProps ? mapStateToProps(store.getState()) : {};
            const dispatchProps = mapDispatchToProps ? mapDispatchToProps(store.dispatch) : {};
            
            return component({
              ...props,
              ...stateProps,
              ...dispatchProps
            }, context);
          };
        };
      }
    }
  };
}

// Usage
const juris = new Juris({
  headlessComponents: {
    redux: {
      fn: ReduxIntegration,
      options: {
        autoInit: true,
        reducers: {
          user: userReducer,
          posts: postsReducer
        },
        middleware: [thunk, logger],
        devTools: true
      }
    }
  }
});
```

### RxJS Reactive Streams

```javascript
function RxJSStreams(props, context) {
  const { Subject, BehaviorSubject, combineLatest, map, filter } = rxjs;
  const streams = new Map();
  
  const createStream = (name, initialValue) => {
    const subject = initialValue !== undefined 
      ? new BehaviorSubject(initialValue)
      : new Subject();
    
    streams.set(name, subject);
    
    // Sync with Juris state
    subject.subscribe(value => {
      context.setState(`streams.${name}`, value);
    });
    
    return subject;
  };
  
  const getStream = (name) => streams.get(name);
  
  const combineStreams = (streamNames, combiner) => {
    const streamsList = streamNames.map(name => streams.get(name)).filter(Boolean);
    return combineLatest(streamsList).pipe(map(combiner));
  };
  
  return {
    api: {
      createStream,
      getStream,
      combineStreams,
      
      // Operators
      operators: { map, filter, /* ... other operators */ },
      
      // Utility methods
      fromState: (path) => {
        const subject = new BehaviorSubject(context.getState(path));
        context.subscribe(path, (value) => subject.next(value));
        return subject;
      },
      
      toState: (stream, path) => {
        return stream.subscribe(value => context.setState(path, value));
      }
    }
  };
}
```

---

## Best Practices

### 1. Plugin Lifecycle Management

```javascript
function MyPlugin(props, context) {
  let cleanupFunctions = [];
  
  const addCleanup = (fn) => cleanupFunctions.push(fn);
  
  // Setup
  const subscription = context.subscribe('some.path', handler);
  addCleanup(() => subscription());
  
  return {
    api: {
      // ... your API
    },
    hooks: {
      onRegister: () => {
        console.log('Plugin registered');
      },
      onUnregister: () => {
        // Cleanup all resources
        cleanupFunctions.forEach(fn => fn());
        cleanupFunctions = [];
        console.log('Plugin cleaned up');
      }
    }
  };
}
```

### 2. Error Handling

```javascript
function RobustPlugin(props, context) {
  const handleError = (error, operation) => {
    console.error(`Error in ${operation}:`, error);
    // Report to monitoring service
    context.services?.errorReporting?.report(error);
  };
  
  const safeExecute = (fn, operation) => {
    try {
      return fn();
    } catch (error) {
      handleError(error, operation);
      return null;
    }
  };
  
  return {
    api: {
      riskyOperation: () => safeExecute(() => {
        // ... potentially failing code
      }, 'riskyOperation')
    }
  };
}
```

### 3. Performance Optimization

```javascript
function OptimizedPlugin(props, context) {
  // Memoization
  const memoCache = new Map();
  const memoize = (fn, keyFn) => {
    return (...args) => {
      const key = keyFn ? keyFn(...args) : JSON.stringify(args);
      if (memoCache.has(key)) {
        return memoCache.get(key);
      }
      const result = fn(...args);
      memoCache.set(key, result);
      return result;
    };
  };
  
  // Debouncing
  const debounce = (fn, ms) => {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), ms);
    };
  };
  
  return {
    api: {
      memoize,
      debounce,
      
      // Example usage
      expensiveOperation: memoize((data) => {
        // Expensive computation
        return processData(data);
      }, (data) => data.id)
    }
  };
}
```

---

## Plugin Templates

### Basic Plugin Template

```javascript
function PluginTemplate(props, context) {
  // 1. Extract props with defaults
  const {
    option1 = 'default',
    option2 = false,
    ...otherProps
  } = props;
  
  // 2. Initialize plugin state
  let internalState = {};
  
  // 3. Create internal methods
  const internalMethod = () => {
    // Implementation
  };
  
  // 4. Setup subscriptions/listeners
  const cleanup = [];
  
  // 5. Return plugin interface
  return {
    api: {
      // Public methods
      publicMethod: () => {
        // Implementation
      },
      
      // Getters/Setters
      getState: () => internalState,
      setState: (newState) => {
        internalState = { ...internalState, ...newState };
      }
    },
    
    hooks: {
      onRegister: () => {
        // Initialize plugin
      },
      
      onUnregister: () => {
        // Cleanup resources
        cleanup.forEach(fn => fn());
      }
    }
  };
}
```

### State Manager Plugin Template

```javascript
function StateManagerTemplate(props, context) {
  const {
    initialState = {},
    middleware = [],
    persistence = false
  } = props;
  
  // State storage
  let state = { ...initialState };
  const subscribers = new Map();
  
  // Core methods
  const getState = (path, defaultValue = null) => {
    // Implementation
  };
  
  const setState = (path, value, options = {}) => {
    // Implementation with middleware support
  };
  
  const subscribe = (path, callback) => {
    // Implementation
  };
  
  return {
    api: {
      getState,
      setState,
      subscribe,
      
      // Advanced features
      batch: (updates) => {
        // Batch multiple updates
      },
      
      transaction: (fn) => {
        // Atomic operations
      },
      
      middleware: {
        add: (middleware) => {
          // Add middleware
        },
        remove: (middleware) => {
          // Remove middleware
        }
      }
    }
  };
}
```

---

## Conclusion

Juris's headless component architecture provides unlimited flexibility for integrating advanced state management libraries and creating sophisticated plugins. The patterns shown here demonstrate how to:

- Replace the built-in StateManager with custom implementations
- Integrate popular state libraries (Redux, MobX, Zustand, RxJS)
- Add advanced features (time travel, persistence, validation)
- Follow best practices for performance and maintainability

Use these patterns as starting points for your own plugins, and remember that the headless component system allows for complete customization while maintaining compatibility with Juris's reactive rendering system.
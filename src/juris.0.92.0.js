//# sourceURL=juris.js

// Type Helpers
const _isStr = v => typeof v === 'string';
const _isFn = v => typeof v === 'function';
const _isNum = v => typeof v === 'number';
const _isBool = v => typeof v === 'boolean';
const _isObj = v => v !== null && typeof v === 'object';
const _isArr = v => Array.isArray(v);
const _isNull = v => v === null || v === undefined;
const _isPromise = v => _isObj(v) && _isFn(v.then);
const _isEmpty = o => !_isObj(o) || Object.keys(o).length === 0;
const _isPrimitive = v => _isStr(v) || _isNum(v);
const _isDigit = s => /^\d+$/.test(s);

class StateManager {
  constructor() {
    this.states = {};
    this.subscriptions = new Map();
    this.reactiveNodes = new Map();
    this.effectCleanups = new Map();
    this.activeReactive = null;
    this.batchMode = false;
    this.batchedUpdates = new Set();
    this.reactiveCounter = 0;
    this.effectCounter = 0;
  }

  getState(key, defaultValue) {
    if (this.activeReactive) {
      const subs = this.subscriptions.get(this.activeReactive);
      if (subs) subs.add(key);
    }
    if (key.includes('.')) return this._getNested(key, defaultValue);
    return this.states.hasOwnProperty(key) ? this.states[key] : defaultValue;
  }

  _getNested(path, defaultValue) {
    const keys = path.split('.');
    let value = this.states;
    for (const key of keys) {
      if (_isNull(value)) return defaultValue;
      const parsed = _isDigit(key) ? parseInt(key, 10) : key;
      value = value[parsed];
    }
    return value !== undefined ? value : defaultValue;
  }

  setState(key, value, notifyFn) {
    if (key.includes('.')) {
      this._setNested(key, value, notifyFn);
      return;
    }
    if (this.states[key] === value) return;
    this.states[key] = value;
    this._notify(key, notifyFn);
  }

  _setNested(path, value, notifyFn) {
    const keys = path.split('.');
    const rootKey = keys[0];
    
    if (keys.length === 1) {
      if (this.states[rootKey] === value) return;
      this.states[rootKey] = value;
      this._notify(rootKey, notifyFn);
      return;
    }
    
    const newRoot = this._shallowClonePath(this.states[rootKey], keys.slice(1), value);
    
    if (this.states[rootKey] === newRoot) return;
    this.states[rootKey] = newRoot;
    this._notify(path, notifyFn);
  }

  _shallowClonePath(obj, pathKeys, value) {
    if (!_isObj(obj) || obj === null) {
      obj = _isDigit(pathKeys[0]) ? [] : {};
    }
    if (pathKeys.length === 1) {
      const key = _isDigit(pathKeys[0]) ? parseInt(pathKeys[0], 10) : pathKeys[0];
      if (obj[key] === value) return obj;
      if (_isArr(obj)) {
        const clone = obj.slice();
        clone[key] = value;
        return clone;
      } else {
        return {...obj, [key]: value};
      }
    }
    const currentKey = _isDigit(pathKeys[0]) ? parseInt(pathKeys[0], 10) : pathKeys[0];
    const restOfPath = pathKeys.slice(1);
    const oldValue = obj[currentKey];
    const newValue = this._shallowClonePath(oldValue, restOfPath, value);
    if (oldValue === newValue) return obj;
    if (_isArr(obj)) {
      const clone = obj.slice();
      clone[currentKey] = newValue;
      return clone;
    } else {
      return {...obj, [currentKey]: newValue};
    }
  }

  _notify(key, notifyFn) {
    if (this.batchMode) {
      for (const [id, deps] of this.subscriptions.entries()) {
        if (this._shouldNotify(deps, key)) this.batchedUpdates.add(id);
      }
      return;
    }    
    const toUpdate = [];
    for (const [id, deps] of this.subscriptions.entries()) {
      if (this._shouldNotify(deps, key)) toUpdate.push(id);
    }    
    if (notifyFn) notifyFn(toUpdate);
  }

  _shouldNotify(deps, changedKey) {
    for (const subscribedKey of deps) {
      if (subscribedKey === changedKey) return true;
      if (changedKey.startsWith(subscribedKey + '.')) return true;
      if (subscribedKey.startsWith(changedKey + '.')) return true;
    }
    return false;
  }

  track(id, fn) {
    this.subscriptions.set(id, new Set());
    const prev = this.activeReactive;
    this.activeReactive = id;
    try {
      return fn();
    } finally {
      this.activeReactive = prev;
    }
  }

  batch(fn, executeFn) {
    this.batchMode = true;
    this.batchedUpdates.clear();
    try {
      fn();
    } finally {
      this.batchMode = false;
      const updates = Array.from(this.batchedUpdates);
      this.batchedUpdates.clear();
      if (executeFn) executeFn(updates);
    }
  }

  effect(fn, executeFn) {
    const id = 'effect_' + (this.effectCounter++);
    this.subscriptions.set(id, new Set());    
    const execute = () => {
      const cleanups = this.effectCleanups.get(id);
      if (cleanups) {
        cleanups.forEach(c => c());
        this.effectCleanups.delete(id);
      }
      const result = this.track(id, fn);
      Promise.resolve(result).then(cleanup => {
        if (_isFn(cleanup)) {
          if (!this.effectCleanups.has(id)) this.effectCleanups.set(id, []);
          this.effectCleanups.get(id).push(cleanup);
        }
      });
    };    
    this.reactiveNodes.set(id, {type: 'effect', fn: () => this.track(id, fn)});
    if (executeFn) executeFn(id, execute);
    return id;
  }

  cleanup(id) {
    const cleanups = this.effectCleanups.get(id);
    if (cleanups) {
      cleanups.forEach(c => c());
      this.effectCleanups.delete(id);
    }
    this.subscriptions.delete(id);
    this.reactiveNodes.delete(id);
  }

  cleanupByCompKey(compKey) {
    const toDelete = [];
    for (const [id, reactive] of this.reactiveNodes.entries()) {
      if (reactive.compKey === compKey) {
        toDelete.push(id);
        const cleanups = this.effectCleanups.get(id);
        if (cleanups) {
          cleanups.forEach(cleanup => cleanup());
          this.effectCleanups.delete(id);
        }
      }
    }
    toDelete.forEach(id => {
      this.subscriptions.delete(id);
      this.reactiveNodes.delete(id);
    });
  }

  cleanupByParent(parentReactiveId) {
    const toDelete = [];
    for (const [id, reactive] of this.reactiveNodes.entries()) {
      if (reactive.parentReactiveId === parentReactiveId && id !== parentReactiveId) {
        toDelete.push(id);
        const cleanups = this.effectCleanups.get(id);
        if (cleanups) {
          cleanups.forEach(cleanup => cleanup());
          this.effectCleanups.delete(id);
        }
      }
    }
    toDelete.forEach(id => {
      this.subscriptions.delete(id);
      this.reactiveNodes.delete(id);
    });
    return toDelete.length;
  }
}

class DOMRenderer {
  constructor() {
    this.svgTags = new Set(['svg','path','circle','rect','line','polyline','polygon','ellipse','g','defs','use','symbol','clipPath','mask','pattern','linearGradient','radialGradient','stop','text','tspan','textPath','image','foreignObject']);
    this.bools = ['checked','selected','disabled','readonly','required','autofocus','autoplay','controls','loop','muted','multiple','open','hidden','async','defer'];
  }

  createElement(tag, isSvg) {
    return isSvg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  }

  setAttribute(el, key, value, isSvg = false) {
    if (isSvg) {
      _isNull(value) ? el.removeAttribute(key) : el.setAttribute(key, value);
      return;
    }
    
    if (this.bools.includes(key)) {
      value ? el.setAttribute(key, '') : el.removeAttribute(key);
      return;
    }
    const props = {value:'value',checked:'checked',selected:'selected',className:'className',htmlFor:'htmlFor',innerHTML:'innerHTML'};
    if (props[key]) { el[props[key]] = value; return; }
    if (key === 'class' || key === 'className') { el.className = value; return; }
    if (key === 'style' && _isObj(value)) { Object.assign(el.style, value); return; }
    _isNull(value) ? el.removeAttribute(key) : el.setAttribute(key, value);
  }

  updateText(node, value) {
    if (_isNull(value)) {
      if (node.nodeType === 3) {
        const comment = document.createComment('reactive-null');
        node.parentNode?.replaceChild(comment, node);
        return {node: comment, type: 'reactive-null'};
      }
      return {node, type: 'reactive-null'};
    }
    if (node.nodeType === 8) {
      const text = document.createTextNode(String(value));
      node.parentNode?.replaceChild(text, node);
      return {node: text, type: 'text'};
    }
    node.textContent = String(value);
    return {node, type: 'text'};
  }

  removeRange(start, end) {
    let node = start.nextSibling;
    while (node && node !== end) {
      const next = node.nextSibling;
      node.parentNode?.removeChild(node);
      node = next;
    }
  }

  insertBeforeMarker(parent, nodes, marker) {
    const frag = document.createDocumentFragment();
    nodes.forEach(n => { if (n) frag.appendChild(n); });
    parent?.insertBefore(frag, marker);
  }

  replaceElement(oldEl, newEl) {
    oldEl.parentNode?.replaceChild(newEl, oldEl);
  }
}

export class Juris {
  static #count = 0;
  constructor(config) {
    this.sm = new StateManager();
    this.sm.states = config.states || {};
    this.renderer = new DOMRenderer();
    this.components = config.components || {};
    this.activeComponents = new Set();
    this.layout = config.layout || [];
    this.services = config.services || {};
    this.middlewares = config.middlewares || [];
    this.rootEl = null;
    this.componentMap = new Map();
    this.componentApiMap = new Map();
    this.componentCounter = 0;
    this.zIndex = 1000;
    this.zStacks = new Map();
    this.armedElements = new Map();
    if (config.activeComponents && _isObj(config.activeComponents)) {
      Object.keys(config.activeComponents).forEach(name => {
        this.components[name] = config.activeComponents[name];
        this.activeComponents.add(name);
      });
    }
    
    this.placeholderConfig = config.placeholderConfig || {};
    this.loadingSpinner = config.loadingSpinner || null;
    this.loadingSpinnerDelay = config.loadingSpinnerDelay || 200;
    this.loadingSpinnerComponent = config.loadingSpinnerComponent || null;
    this.loadingSpinnerComponentDelay = config.loadingSpinnerComponentDelay || 500;
    
    this.pendingPromises = new Set();
    this.globalSpinnerTimeout = null;
    this.globalSpinnerElement = null;
    
    this._applyMiddlewares();
    this._initPlugins(config.plugins || {});
    
    if (config.headlessComponents && this._headlessManager) {
      Object.keys(config.headlessComponents).forEach(name => {
        const componentConfig = config.headlessComponents[name];
        if (_isFn(componentConfig)) {
          this.registerHeadless(name, componentConfig);
        } else {
          this.registerHeadless(name, componentConfig.fn, componentConfig.options);
        }
      });
    }
    //DEVTOOLS--START
    this.__DEV__ = false;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      const name = (config.debugName || 'juris') + (Juris.#count++ || '');
      window[name] = this;
      this.__DEV__ = config.devMode || true;
      if (this.__DEV__) {
        this.__devtools = {
          componentTree: new Map()
        };    
        window['__JURIS_DEVTOOLS_HOOK__'+Juris.#count] = {
          getComponentTree: () => this._buildComponentTree(),
        }
      }
    }
    //DEVTOOLS--END
  }

  get states() { return this.sm.states; }
  set states(val) { this.sm.states = val; }
  get subscriptions() { return this.sm.subscriptions; }
  get reactiveNodes() { return this.sm.reactiveNodes; }

  _isComponent(value) {
    if (!_isObj(value)) return false;
    const keys = Object.keys(value);
    return keys.length === 1 && this.components[keys[0]];
  }
  
  _createPlaceholder(el) {
    const id = el?.id;
    const classes = el?.className ? el.className.split(' ') : [];
    
    let config = null;
    if (id && this.placeholderConfig['#' + id]) {
      config = this.placeholderConfig['#' + id];
    } else {
      for (const cls of classes) {
        if (this.placeholderConfig['.' + cls]) {
          config = this.placeholderConfig['.' + cls];
          break;
        }
      }
    }
    
    if (!config) return document.createComment('loading');
    
    if (config.text) {
      const span = document.createElement('span');
      span.textContent = config.text;
      if (config.class) span.className = config.class;
      return span;
    }
    
    if (config.children) {
      const container = document.createElement('div');
      if (config.class) container.className = config.class;
      this._buildTree(config.children).then(frag => container.appendChild(frag));
      return container;
    }
    
    return document.createComment('loading');
  }

  _trackPromise(promise) {
    const promiseId = 'promise_' + Math.random().toString(36).substr(2, 9);
    this.pendingPromises.add(promiseId);
    
    if (this.pendingPromises.size === 1 && this.loadingSpinnerComponent && !this.globalSpinnerTimeout) {
      this.globalSpinnerTimeout = setTimeout(() => {
        if (this.pendingPromises.size > 0) {
          this._showGlobalSpinner();
        }
      }, this.loadingSpinnerComponentDelay);
    }
    
    const cleanup = () => {
      this.pendingPromises.delete(promiseId);
      if (this.pendingPromises.size === 0) {
        if (this.globalSpinnerTimeout) {
          clearTimeout(this.globalSpinnerTimeout);
          this.globalSpinnerTimeout = null;
        }
        this._hideGlobalSpinner();
      }
    };
    
    promise.then(cleanup).catch(cleanup);
  }

  _showGlobalSpinner() {
    if (this.globalSpinnerElement || !this.loadingSpinnerComponent) return;
    
    const spinnerVdom = this.loadingSpinnerComponent();
    this._processNode(spinnerVdom).then(spinnerEl => {
      if (spinnerEl && this.pendingPromises.size > 0) {
        this.globalSpinnerElement = spinnerEl;
        document.body.appendChild(spinnerEl);
      }
    });
  }

  _hideGlobalSpinner() {
    if (this.globalSpinnerElement && this.globalSpinnerElement.parentNode) {
      this.globalSpinnerElement.parentNode.removeChild(this.globalSpinnerElement);
      this.globalSpinnerElement = null;
    }
  }

  _handlePromise(promise, parent, el) {
    this._trackPromise(promise);
    
    let currentNode = document.createComment('loading');
    let spinnerTimeout = null;
    
    if (this.loadingSpinner && this.loadingSpinnerDelay > 0) {
      spinnerTimeout = setTimeout(() => {
        if (currentNode.parentNode) {
          const spinner = this.loadingSpinner();
          this._processNode(spinner).then(spinnerEl => {
            if (spinnerEl && currentNode.parentNode) {
              currentNode.parentNode.replaceChild(spinnerEl, currentNode);
              currentNode = spinnerEl;
            }
          });
        }
      }, this.loadingSpinnerDelay);
    } else if (this.loadingSpinner) {
      const spinner = this.loadingSpinner();
      this._processNode(spinner).then(spinnerEl => {
        if (spinnerEl) currentNode = spinnerEl;
      });
      return this._processNode(spinner);
    }
    
    promise.then(result => {
      if (spinnerTimeout) clearTimeout(spinnerTimeout);
      
      this._processChildNode(result).then(node => {
        if (currentNode && currentNode.parentNode) {
          currentNode.parentNode.replaceChild(node || document.createComment('null'), currentNode);
        }
      });
    }).catch(err => {
      if (spinnerTimeout) clearTimeout(spinnerTimeout);
      console.error('[Juris] Promise error:', err);
      if (currentNode && currentNode.parentNode) {
        currentNode.parentNode.replaceChild(document.createComment('error'), currentNode);
      }
    });
    
    return currentNode;
  }

  _applyMiddlewares() {
    if (this.middlewares.length === 0) return;
    
    const originalGet = this.sm.getState.bind(this.sm);
    const originalSet = this.sm.setState.bind(this.sm);
    
    this.sm.getState = (key, def) => {
      const hasGetMiddleware = this.middlewares.some(m => m.beforeGetState);
      if (!hasGetMiddleware) return originalGet(key, def);
      
      let result = {key, defaultValue: def, value: originalGet(key, def)};
      for (const m of this.middlewares) {
        if (m.beforeGetState) result = m.beforeGetState(result, this) || result;
      }
      return result.value;
    };
    
    this.sm.setState = (key, value, notifyFn) => {
      let data = {key, value, oldValue: originalGet(key)};
      for (const m of this.middlewares) {
        if (m.beforeSetState) data = m.beforeSetState(data, this) || data;
      }
      originalSet(data.key, data.value, notifyFn);
      for (const m of this.middlewares) {
        if (m.afterSetState) m.afterSetState(data, this);
      }
    };
  }

  _initPlugins(plugins) {
    Object.entries(plugins).forEach(([name, plugin]) => {
      if (_isFn(plugin)) plugin(this);
      else if (plugin?.install) plugin.install(this);
    });
  }

  getState(key, def) { return this.sm.getState(key, def); }
  
  setState(key, val) {
    this.sm.setState(key, val, (toUpdate) => {
      for (const id of toUpdate) {
        if (id.startsWith('reactive_')) this._updateReactiveNode(id);
        else if (id.startsWith('effect_')) this._executeEffect(id);
      }
    });
  }

  effect(fn) {
    return this.sm.effect(fn, (id, execute) => execute());
  }

  executeBatch(fn) {
    this.sm.batch(fn, (updates) => {
      for (const id of updates) {
        if (id.startsWith('reactive_')) this._updateReactiveNode(id);
        else if (id.startsWith('effect_')) this._executeEffect(id);
      }
    });
  }

  _executeEffect(id) {
    const reactive = this.sm.reactiveNodes.get(id);
    if (!reactive || reactive.type !== 'effect') return;
    
    const cleanups = this.sm.effectCleanups.get(id);
    if (cleanups) {
      cleanups.forEach(c => c());
      this.sm.effectCleanups.delete(id);
    }
    
    const result = this.sm.track(id, reactive.fn);
    Promise.resolve(result).then(cleanup => {
      if (_isFn(cleanup)) {
        if (!this.sm.effectCleanups.has(id)) this.sm.effectCleanups.set(id, []);
        this.sm.effectCleanups.get(id).push(cleanup);
      }
    });
  }

  _updateReactiveNode(reactiveId) {
    const reactive = this.sm.reactiveNodes.get(reactiveId);
    if (!reactive) return;

    this.sm.subscriptions.delete(reactiveId);
    this.sm.subscriptions.set(reactiveId, new Set());
    this.sm.activeReactive = reactiveId;

    try {
      const newValue = reactive.fn();
      this.sm.activeReactive = null;

      if (reactive.type === 'text' || reactive.type === 'reactive-null') {
        if (reactive.node?.parentNode) {
          if (_isPromise(newValue)) {
            const placeholder = this._handlePromise(newValue, reactive.node.parentNode, reactive.element);
            reactive.node.parentNode.replaceChild(placeholder, reactive.node);
            reactive.node = placeholder;
          } else {
            Promise.resolve(newValue).then(resolvedValue => {
              if (this._isComponent(resolvedValue)) {
                this._processNode(resolvedValue, false, reactive.compKey, reactive.parentReactiveId).then(element => {
                  if (element && reactive.node?.parentNode) {
                    reactive.node.parentNode.replaceChild(element, reactive.node);
                    reactive.node = element;
                    reactive.type = 'element';
                    reactive.isComponent = true;
                  }
                });
              } else if (_isObj(resolvedValue) && !_isArr(resolvedValue)) {
                this._processNode(resolvedValue, false, reactive.compKey, reactive.parentReactiveId).then(element => {
                  if (element && reactive.node?.parentNode) {
                    reactive.node.parentNode.replaceChild(element, reactive.node);
                    reactive.node = element;
                    reactive.type = 'element';
                  }
                });
              } else {
                const result = this.renderer.updateText(reactive.node, resolvedValue);
                reactive.node = result.node;
                reactive.type = result.type;
              }
            });
          }
        }
      } else if (reactive.type === 'element') {
        if (reactive.node?.parentNode) {
          if (_isPromise(newValue)) {
            const placeholder = this._handlePromise(newValue, reactive.node.parentNode, reactive.element);
            reactive.node.parentNode.replaceChild(placeholder, reactive.node);
            reactive.node = placeholder;
          } else {
            Promise.resolve(newValue).then(resolvedValue => {
              if (_isNull(resolvedValue)) {
                const comment = document.createComment('reactive-null');
                reactive.node.parentNode.replaceChild(comment, reactive.node);
                reactive.node = comment;
                reactive.type = 'reactive-null';
              } else if (_isPrimitive(resolvedValue)) {
                const textNode = document.createTextNode(String(resolvedValue));
                reactive.node.parentNode.replaceChild(textNode, reactive.node);
                reactive.node = textNode;
                reactive.type = 'text';
              } else if (_isObj(resolvedValue) && !_isArr(resolvedValue)) {
                this._processNode(resolvedValue, false, reactive.compKey, reactive.parentReactiveId).then(element => {
                  if (element && reactive.node?.parentNode) {
                    reactive.node.parentNode.replaceChild(element, reactive.node);
                    reactive.node = element;
                  }
                });
              }
            });
          }
        }
      } else if (reactive.type === 'attr') {
        if (reactive.element) {
          Promise.resolve(newValue).then(resolvedValue => {
            this.renderer.setAttribute(reactive.element, reactive.attrName, resolvedValue, reactive.isSvg);
          });
        }
      } else if (reactive.type === 'style') {
        if (reactive.element) {
          Promise.resolve(newValue).then(resolvedStyles => {
            Object.assign(reactive.element.style, resolvedStyles);
          });
        }
      } else if (reactive.type === 'children') {
        if (reactive.element) {
          if (_isPromise(newValue)) {
            const placeholder = this._handlePromise(newValue, reactive.element, reactive.element);
            reactive.element.appendChild(placeholder);
          } else {
            Promise.resolve(newValue).then(children => {
              this._updateReactiveChildren(reactiveId, reactive.element, children);
            });
          }
        }
      } else if (reactive.type === 'render') {
        this._updateComponentRender(reactiveId, newValue);
      } else if (reactive.type === 'innerHTML') {
        if (reactive.element) {
          Promise.resolve(newValue).then(resolvedValue => {
            reactive.element.innerHTML = resolvedValue;
          });
        }
      }
    } catch (e) {
      console.error('[Juris] Reactive update error:', e);
      this.sm.activeReactive = null;
    }
  }

  _updateReactiveChildren(parentReactiveId, element, children) {
    const reactive = this.sm.reactiveNodes.get(parentReactiveId);
    if (!reactive) return;

    const newChildArray = _isArr(children) ? children : [children];
    
    Promise.all(newChildArray.map(child => {
      if (_isPrimitive(child)) {
        return Promise.resolve({type: 'text', value: String(child), vdom: null, key: null});
      } else if (_isBool(child) || _isNull(child)) {
        return Promise.resolve(null);
      } else {
        const key = this._extractKey(child);
        return Promise.resolve({type: 'vdom', value: child, vdom: child, key});
      }
    })).then(newChildren => {
      const filtered = newChildren.filter(c => c !== null);
      this._diffChildren(element, filtered, reactive.compKey, parentReactiveId);
    });
  }

  _cleanupChildComponents(container, parentReactiveId) {
    const componentsToCleanup = [];
    
    for (const [compKey, meta] of this.componentMap.entries()) {
      if (this._isNodeInside(meta.element, container)) {
        if (!this.activeComponents.has(meta.name)) {
          componentsToCleanup.push(compKey);
        }
      }
    }
    
    for (const compKey of componentsToCleanup) {
      const renderReactive = this.sm.reactiveNodes.get('reactive_render_' + compKey);
      if (renderReactive?.hooks?.onUnmount) renderReactive.hooks.onUnmount();
      this._cleanupComponentReactives(compKey);
      this.componentMap.delete(compKey);
    }
  }

  _cleanupChildComponentsByParent(parentReactiveId) {
    const componentsToCleanup = [];
    
    for (const [compKey, meta] of this.componentMap.entries()) {
      if (meta.parentReactiveId === parentReactiveId && !this.activeComponents.has(meta.name)) {
        componentsToCleanup.push(compKey);
      }
    }
    
    for (const compKey of componentsToCleanup) {
      const renderReactive = this.sm.reactiveNodes.get('reactive_render_' + compKey);
      if (renderReactive?.hooks?.onUnmount) renderReactive.hooks.onUnmount();
      this._cleanupComponentReactives(compKey);
      this.componentMap.delete(compKey);
      //DEVTOOLS--START
      if (this.__DEV__ && this.__devtools?.componentTree) {  
        this.__devtools.componentTree.delete(compKey);
      }
      //DEVTOOLS--END
    }
  }

  _extractKey(vdom) {
    if (!_isObj(vdom)) return null;
    const entries = Object.entries(vdom);
    if (!entries.length) return null;
    const [_, props] = entries[0];
    return props && props.key !== undefined ? props.key : null;
  }

  _diffChildren(container, newChildren, compKey, parentReactiveId) {
    const oldNodes = Array.from(container.childNodes);
    const hasKeys = newChildren.some(c => c.key !== null && c.key !== undefined);
    
    if (hasKeys) {
      this._diffChildrenByKey(container, oldNodes, newChildren, compKey, parentReactiveId);
    } else {
      this._diffChildrenByIndex(container, oldNodes, newChildren, compKey, parentReactiveId);
    }
  }

  _diffChildrenByKey(container, oldNodes, newChildren, compKey, parentReactiveId) {
    if (!container._jurisNodeKeys) container._jurisNodeKeys = new Map();
    
    const oldMap = new Map(container._jurisNodeKeys);
    
    if (oldMap.size === 0 && oldNodes.length > 0) {
      for (const node of oldNodes) {
        if (node.nodeType === 1 && node._jurisKey !== undefined) {
          oldMap.set(node._jurisKey, node);
          container._jurisNodeKeys.set(node._jurisKey, node);
        }
      }
    }
    
    const newMap = new Map();
    
    for (const [key, node] of oldMap) {
      if (!newChildren.some(c => c.key === key)) {
        if (node.parentNode === container) {
          this._deepCleanupNode(node, parentReactiveId);
          container.removeChild(node);
        }
      }
    }
    
    Promise.all(newChildren.map(async child => {
      if (_isNull(child.key)) return null;
      
      const existing = oldMap.get(child.key);
      if (existing?.parentNode === container) {
        newMap.set(child.key, existing);
        return {key: child.key, node: existing};
      }
      
      const node = child.type === 'text' 
        ? document.createTextNode(child.value)
        : await this._processNode(child.value, false, compKey, parentReactiveId);
      
      newMap.set(child.key, node);
      return {key: child.key, node};
    })).then(results => {
      for (let i = 0; i < newChildren.length; i++) {
        const result = results[i];
        if (!result) continue;
        
        const {node} = result;
        const currentPos = Array.from(container.childNodes).indexOf(node);
        
        if (currentPos === -1) {
          const ref = container.childNodes[i];
          container.insertBefore(node, ref || null);
        } else if (currentPos !== i) {
          const ref = container.childNodes[i];
          if (ref !== node) container.insertBefore(node, ref);
        }
      }
      
      container._jurisNodeKeys = newMap;
    });
  }

  _diffChildrenByIndex(container, oldNodes, newChildren, compKey, parentReactiveId) {
    const maxLen = Math.max(oldNodes.length, newChildren.length);
    
    for (let i = maxLen - 1; i >= 0; i--) {
      if (i >= newChildren.length && oldNodes[i]) {
        const shouldPreserve = this._isActiveComponentNode(oldNodes[i]);
        if (!shouldPreserve) {
          this._deepCleanupNode(oldNodes[i], parentReactiveId);
          oldNodes[i].parentNode?.removeChild(oldNodes[i]);
        }
      }
    }
    
    for (let i = 0; i < newChildren.length; i++) {
      const oldNode = oldNodes[i];
      const newChild = newChildren[i];
      
      if (!oldNode) {
        if (newChild.type === 'text') {
          container.appendChild(document.createTextNode(newChild.value));
        } else if (newChild.type === 'vdom') {
          this._processNode(newChild.value, false, compKey, parentReactiveId).then(node => {
            if (node) {
              i < container.childNodes.length 
                ? container.insertBefore(node, container.childNodes[i])
                : container.appendChild(node);
            }
          });
        }
      } else {
        const shouldPreserve = this._isActiveComponentNode(oldNode);
        if (shouldPreserve) {
          continue;
        }
        
        if (newChild.type === 'text') {
          if (oldNode.nodeType === 3) {
            if (oldNode.textContent !== newChild.value) oldNode.textContent = newChild.value;
          } else {
            this._deepCleanupNode(oldNode, parentReactiveId);
            container.replaceChild(document.createTextNode(newChild.value), oldNode);
          }
        } else if (newChild.type === 'vdom') {
          this._deepCleanupNode(oldNode, parentReactiveId);
          this._processNode(newChild.value, false, compKey, parentReactiveId).then(node => {
            if (node && oldNode.parentNode) oldNode.parentNode.replaceChild(node, oldNode);
          });
        }
      }
    }
  }

  _isActiveComponentNode(node) {
    for (const [compKey, meta] of this.componentMap.entries()) {
      if (this.activeComponents.has(meta.name)) {
        if (meta.element === node || (meta.element?.contains && meta.element.contains(node))) {
          return true;
        }
      }
    }
    return false;
  }

  _deepCleanupNode(node, parentReactiveId) {
    if (!node) return;
    
    for (const [compKey, meta] of this.componentMap.entries()) {
      if (meta.element === node || this._isNodeInside(meta.element, node)) {
        const renderReactive = this.sm.reactiveNodes.get('reactive_render_' + compKey);
        if (renderReactive?.hooks?.onUnmount) renderReactive.hooks.onUnmount();
        this._cleanupComponentReactives(compKey);
        this.componentMap.delete(compKey);
        //DEVTOOLS--START
        if (this.__DEV__ && this.__devtools?.componentTree) { 
          this.__devtools.componentTree.delete(compKey);
        }
        //DEVTOOLS--END
      }
    }
    
    for (const [id, reactive] of this.sm.reactiveNodes.entries()) {
      if (reactive.element === node || reactive.node === node ||
          (reactive.element && this._isNodeInside(reactive.element, node)) ||
          (reactive.node && this._isNodeInside(reactive.node, node))) {
        this.sm.cleanup(id);
      }
    }
    if (node._jurisEventListeners) {
      node._jurisEventListeners.forEach(({eventName, handler}) => {
        node.removeEventListener(eventName, handler);
      });
      delete node._jurisEventListeners;
    } 
    if (node.childNodes) {
      for (let i = 0; i < node.childNodes.length; i++) {
        this._deepCleanupNode(node.childNodes[i], parentReactiveId);
      }
    }
  }

  _isNodeInside(child, parent) {
    if (!child || !parent) return false;
    let current = child;
    while (current && current !== document.body) {
      if (current === parent) return true;
      current = current.parentNode;
    }
    return false;
  }

  _getAllDescendantComponents(parentReactiveId) {
    const descendants = [];
    const visited = new Set();
    
    const findDescendants = (parentId) => {
      if (visited.has(parentId)) return;
      visited.add(parentId);
      
      for (const [compKey, meta] of this.componentMap.entries()) {
        if (meta.parentReactiveId === parentId) {
          descendants.push(compKey);
          findDescendants('reactive_render_' + compKey);
        }
      }
    };
    
    findDescendants(parentReactiveId);
    
    descendants.forEach(compKey => {
      const localStateKey = `__local_${compKey}`;
      if (this.sm.states[localStateKey]) delete this.sm.states[localStateKey];
    });
    
    return descendants;
  }

  _updateComponentRender(reactiveId, renderResult) {
    const reactive = this.sm.reactiveNodes.get(reactiveId);
    if (!reactive) return;

    const meta = this.componentMap.get(reactive.compKey);
    if (!meta) return;

    if (_isPromise(renderResult)) {
      renderResult.then(resolvedResult => {
        this._processResolvedRenderResult(reactive, meta, resolvedResult);
      }).catch(err => {
        console.error('[Juris] Async render error:', err);
      });
      return;
    }

    this._processResolvedRenderResult(reactive, meta, renderResult);
  }

  _processResolvedRenderResult(reactive, meta, renderResult) {
    if (_isNull(renderResult)) {
      if (meta.type === 'null') return;
      if (reactive.hooks?.onUnmount) reactive.hooks.onUnmount();
      this._cleanupComponentReactives(reactive.compKey);
      
      if (meta.type === 'primitive' || meta.type === 'array') {
        this.renderer.removeRange(meta.element, meta.endMarker);
      } else if (meta.type === 'element' && meta.element?.parentNode) {
        const start = document.createComment(`start:${reactive.compKey}`);
        const end = document.createComment(`end:${reactive.compKey}`);
        meta.element.parentNode.insertBefore(start, meta.element);
        meta.element.parentNode.insertBefore(end, meta.element.nextSibling);
        meta.element.parentNode.removeChild(meta.element);
        meta.element = start;
        meta.endMarker = end;
        meta.type = 'null';
      }
      return;
    }

    const reactiveId = 'reactive_render_' + reactive.compKey;
    this._cleanupChildComponentsByParent(reactiveId);

    const processedResult = _isFn(renderResult) ? renderResult() : renderResult;

    if (_isPrimitive(processedResult)) {
      if (meta.type === 'primitive' || meta.type === 'null') {
        if (meta.type === 'null' && !this.sm.subscriptions.has('reactive_render_' + reactive.compKey)) {
          this.sm.subscriptions.set('reactive_render_' + reactive.compKey, new Set());
        }
        this._updatePrimitive(meta, String(processedResult));
        meta.type = 'primitive';
      }
      if (reactive.hooks?.onUpdate) reactive.hooks.onUpdate();
      return;
    }
    
    if (_isArr(processedResult)) {
      if (meta.type === 'array' || meta.type === 'null') {
        if (meta.type === 'null' && !this.sm.subscriptions.has('reactive_render_' + reactive.compKey)) {
          this.sm.subscriptions.set('reactive_render_' + reactive.compKey, new Set());
        }
        this._updateArray(meta, processedResult);
        meta.type = 'array';
      }
      if (reactive.hooks?.onUpdate) reactive.hooks.onUpdate();
      return;
    }

    this._processNode(processedResult, false, reactive.compKey, 'reactive_render_' + reactive.compKey).then(newElement => {
      if (!newElement) return;
      
      if (meta.type === 'null' && !this.sm.subscriptions.has('reactive_render_' + reactive.compKey)) {
        this.sm.subscriptions.set('reactive_render_' + reactive.compKey, new Set());
      }
      
      if (meta.type === 'null' && meta.element?.parentNode) {
        const parent = meta.element.parentNode;
        parent.insertBefore(newElement, meta.endMarker);
        parent.removeChild(meta.element);
        parent.removeChild(meta.endMarker);
        meta.element = newElement;
        meta.type = 'element';
        delete meta.endMarker;
      } else if (meta.element?.parentNode) {
        for (const [id, r] of this.sm.reactiveNodes.entries()) {
          if (r.compKey === reactive.compKey && r.type !== 'render') {
            this.sm.cleanup(id);
          }
        }
        
        if (reactive.api) this._attachApiToElement(newElement, reactive.api, meta.name);
        this.renderer.replaceElement(meta.element, newElement);
        meta.element = newElement;
        meta.type = 'element';
      }
      
      if (reactive.hooks?.onUpdate) reactive.hooks.onUpdate();
    });
  }

  _updatePrimitive(meta, text) {
    this.renderer.removeRange(meta.element, meta.endMarker);
    this.renderer.insertBeforeMarker(meta.element.parentNode, [document.createTextNode(text)], meta.endMarker);
  }

  _updateArray(meta, items) {
    this.renderer.removeRange(meta.element, meta.endMarker);
    
    Promise.all(items.map(item => {
      if (_isPrimitive(item)) return Promise.resolve(document.createTextNode(String(item)));
      if (_isFn(item)) return this._processChildNode(item);
      if (_isBool(item) || _isNull(item)) return Promise.resolve(null);
      return this._processNode(item);
    })).then(elements => {
      this.renderer.insertBeforeMarker(meta.element.parentNode, elements, meta.endMarker);
    });
  }

  _cleanupComponentReactives(compKey) {
    this.sm.cleanupByCompKey(compKey);
    const localStateKey = `__local_${compKey}`;
    if (this.sm.states[localStateKey]) delete this.sm.states[localStateKey];
  }

  createContext(compKey) {
    const localStateKey = `__local_${compKey}`;
    if (!this.sm.states[localStateKey]) this.sm.states[localStateKey] = {};
    
    let localStateCounter = 0;
    
    return {
      getState: (k, d) => this.getState(k, d),
      setState: (k, v) => this.setState(k, v),
      effect: (fn) => this.effect(fn),
      executeBatch: (fn) => this.executeBatch(fn),
      z: (l) => this.z(l),
      topZ: (l) => this.topZ(l),
      modal: (o) => this.modal(o),
      arm: (selector, handlerFn) => this.arm(selector, handlerFn),
      getComponentAPI: (n) => this.componentApiMap.get(n) || null,
      plugin: (n) => this.services[n] || null,
      objectToElement: (o) => this.objectToElement(o),
      registerComponent: (n, fn, opts) => this.registerComponent(n, fn, opts),
      newState: (initialValue) => {
        const stateId = localStateCounter++;
        const fullKey = `${localStateKey}.${stateId}`;
        
        if (!this.sm.states[localStateKey]) this.sm.states[localStateKey] = {};
        if (this.sm.states[localStateKey][stateId] === undefined) {
          this.sm.states[localStateKey][stateId] = initialValue;
        }
        
        const getter = () => {
          const value = this.getState(fullKey);
          return value !== undefined ? value : initialValue;
        };
        
        const setter = (value) => {
          if (_isFn(value)) {
            this.setState(fullKey, value(getter()));
          } else {
            this.setState(fullKey, value);
          }
        };
        
        return [getter, setter];
      },
      juris:this,
      ...this.services
    };
  }

  registerComponent(name, fn, options = {}) {
    if (!_isStr(name) || !name || !_isFn(fn)) {
      console.error('[Juris] Component name must be a non-empty string and fn must be a function');
      return false;
    }
    this.components[name] = fn;
    if (options.active === true) {
      this.activeComponents.add(name);
    }
    return true;
  }

  getComponentAPI(name) {
    return this.componentApiMap.get(name) || null;
  }

  arm(target, handlerFn) {
    if (!target) {
      return {id: 'evt_' + Math.random().toString(36).substr(2, 9)};
    }
    
    if (_isNull(handlerFn) || !_isFn(handlerFn)) {
      console.warn('[Juris] arm() called without valid handler function');
      return null;
    }
    
    const jurisInstance = this;
    const context = this.createContext('arm_' + Math.random().toString(36).substr(2, 9));
    const handlers = handlerFn(context);
    const listeners = [];
    
    for (let eventName in handlers) {
      let actualEventName;
      
      if (eventName.startsWith('on-')) {
        actualEventName = eventName.slice(3);
      } else if (eventName.startsWith('on:')) {
        actualEventName = eventName.slice(3);
      } else if (eventName.startsWith('on')) {
        actualEventName = eventName.slice(2).toLowerCase();
      } else {
        actualEventName = eventName;
      }
      
      const handler = handlers[eventName];
      
      if (_isFn(handler)) {
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
        const listener = listeners.find(e => e.original === eventName || e.actual === eventName);
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
        listeners.forEach(({actual, handler}) => {
          target.removeEventListener(actual, handler);
        });
        jurisInstance.armedElements.delete(target);
        return true;
      }
    };
    
    this.armedElements.set(target, {listeners, context, instance});
    return instance;
  }

  z(layer = 'default') {
    if (!this.zStacks.has(layer)) this.zStacks.set(layer, []);
    const stack = this.zStacks.get(layer);
    const idx = this.zIndex++;
    stack.push(idx);
    return {
      value: idx,
      pop: () => {
        const i = stack.indexOf(idx);
        if (i > -1) stack.splice(i, 1);
      }
    };
  }

  topZ(layer = 'default') {
    const stack = this.zStacks.get(layer);
    return stack?.length ? stack[stack.length - 1] : this.zIndex;
  }

  modal(opts) {
    return new Promise(resolve => {
      const id = 'modal_' + Date.now();
      const zh = this.z(opts.layer || 'modals');
      if (!this.sm.states._modals) this.sm.states._modals = {};
      
      this.setState(`_modals.${id}`, {
        visible: true,
        zIndex: zh.value,
        width: opts.width,
        dismissable: opts.dismissable !== false,
        component: opts.component,
        onClose: (result) => {
          this.setState(`_modals.${id}.visible`, false);
          zh.pop();
          setTimeout(() => {
            const modals = {...this.sm.states._modals};
            delete modals[id];
            this.setState('_modals', modals);
          }, 300);
          resolve(result);
        }
      });
    });
  }

  _attachApiToElement(el, api, name) {
    if (!el || !api || !_isObj(api)) return;
    Object.keys(api).forEach(k => { el[k] = api[k]; });
    if (name) this.componentApiMap.set(name, api);
  }

  render(container = '#app', vdom = null) {
    this.rootEl = _isStr(container) ? document.querySelector(container) : container;
    if (!this.rootEl) return;
    this.rootEl.innerHTML = '';
    const layout = vdom !== null ? vdom : this.layout;
    this._buildTree(layout).then(frag => this.rootEl.appendChild(frag));
  }

  _buildTree(layout) {
    layout = _isArr(layout) ? layout : [layout];
    return Promise.all(layout.map(item => this._processNode(item))).then(els => {
      const frag = document.createDocumentFragment();
      els.forEach(el => { if (el) frag.appendChild(el); });
      return frag;
    });
  }

  _processNode(node, isSvgContext = false, compKey = null, parentReactiveId = null) {
    if (!_isObj(node)) return Promise.resolve(null);
    const entries = Object.entries(node);
    if (!entries.length) return Promise.resolve(null);
    
    const [key, props] = entries[0];
    if (this.components[key]) {
      return this._buildComponent(key, props, compKey ? ('reactive_render_' + compKey) : parentReactiveId);
    }
    
    const isSvg = isSvgContext || this.renderer.svgTags.has(key);
    const itemKey = props?.key;
    return this._buildElement({tag: key, props}, isSvg, compKey, itemKey);
  }

  _buildComponent(name, props, parentReactiveId = null) {
    const userKey = props?.__key ?? props?.key;
    const compKey = userKey !== undefined 
      ? `${name}:${userKey}_${this.componentCounter++}`
      : `${name}_${this._hashProps(props)}_${this.componentCounter++}`;
    //DEVTOOLS--START
    if (this.__DEV__) {
      const meta = {
        name,
        compKey,
        parent: parentReactiveId,
        props: Object.keys(props || {}),
        mountTime: Date.now(),
        isRoot: !parentReactiveId
      };
      this.__devtools.componentTree.set(compKey, meta);
    }
    //DEVTOOLS--END

    const context = this.createContext(compKey);
    const result = this.components[name](props, context);
    
    const renderFn = result?.render || (_isFn(result) ? result : () => result);
    
    const reactiveId = 'reactive_render_' + compKey;
    this.sm.subscriptions.set(reactiveId, new Set());
    
    const wrappedRender = () => {
      this.sm.subscriptions.set(reactiveId, new Set());
      return this.sm.track(reactiveId, renderFn);
    };

    this.sm.reactiveNodes.set(reactiveId, {
      type: 'render',
      compKey,
      fn: wrappedRender,
      hooks: result?.hooks,
      api: result?.api,
      parentReactiveId
    });

    if (result?.api) {
      this.componentApiMap.set(name, result.api);
    }

    if (result?.hooks?.onMount) setTimeout(() => result.hooks.onMount(), 0);

    const renderOutput = wrappedRender();
    
    if (_isPromise(renderOutput)) {
      return renderOutput.then(resolvedOutput => 
        this._buildComponentFromResult(resolvedOutput, compKey, name, props, result, parentReactiveId)
      );
    }
    
    return this._buildComponentFromResult(renderOutput, compKey, name, props, result, parentReactiveId);
  }

  _cleanupComponentReactives(compKey) {
    this.sm.cleanupByCompKey(compKey);
    const localStateKey = `__local_${compKey}`;
    if (this.sm.states[localStateKey]) delete this.sm.states[localStateKey];
    
    //DEVTOOLS--START
    if (this.__DEV__ && this.__devtools?.componentTree) {
      this.__devtools.componentTree.delete(compKey);
    }
    //DEVTOOLS--END
  }
  _hashProps(props) {
    if (!props || typeof props !== 'object' || Object.keys(props).length === 0) {
      return '0';
    }
    
    // Create stable short hash from prop keys and primitive values
    const keys = Object.keys(props).filter(k => k !== '__key' && k !== 'key').sort();
    let str = keys.map(k => {
      const v = props[k];
      if (_isPrimitive(v)) return `${k}:${v}`;
      if (_isArr(v)) return `${k}:arr${v.length}`;
      if (_isObj(v)) return `${k}:obj`;
      return k;
    }).join('|');
    
    // Simple hash to 6 chars
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).slice(0, 6);
  }
  
  _buildComponentFromResult(finalResult, compKey, name, props, result, parentReactiveId) {
  if (_isNull(finalResult)) {
    const start = document.createComment(`start:${compKey}`);
    const end = document.createComment(`end:${compKey}`);
    const frag = document.createDocumentFragment();
    frag.appendChild(start);
    frag.appendChild(end);
    this.componentMap.set(compKey, {name, props, element: start, endMarker: end, type: 'null', parentReactiveId});
    return Promise.resolve(frag);
  }

  const processedResult = _isFn(finalResult) ? finalResult() : finalResult;

  if (_isPrimitive(processedResult)) {
    return this._createPrimitiveFragment(compKey, String(processedResult), name, props, parentReactiveId);
  }
  
  if (_isArr(processedResult)) {
    return this._createArrayFragment(compKey, processedResult, name, props, parentReactiveId);
  }

  // Main case: element result
  return this._processNode(processedResult, false, compKey).then(element => {
    if (result?.api && element) this._attachApiToElement(element, result.api, name);
    
    //DEVTOOLS--START
    if (this.__DEV__) {
      // Store dev metadata ON the element itself, not in DOM structure
      element._jurisDevCompKey = compKey;
      element._jurisDevCompName = name;
      
      // Update devtools metadata with element reference
      if (this.__devtools?.componentTree) {
        const meta = this.__devtools.componentTree.get(compKey);
        if (meta) {
          meta.element = element;
        }
      }
    }
    //DEVTOOLS--END
    
    this.componentMap.set(compKey, {name, props, element, type: 'element', parentReactiveId});
    return element; // Always return the raw element, never a fragment
  });
}

  _createPrimitiveFragment(compKey, text, name, props, parentReactiveId = null) {
    const start = document.createComment(`start:${compKey}`);
    const end = document.createComment(`end:${compKey}`);
    const frag = document.createDocumentFragment();
    frag.appendChild(start);
    frag.appendChild(document.createTextNode(text));
    frag.appendChild(end);
    this.componentMap.set(compKey, {name, props, element: start, endMarker: end, type: 'primitive', parentReactiveId});
    return Promise.resolve(frag);
  }

  _createArrayFragment(compKey, items, name, props, parentReactiveId = null) {
    const start = document.createComment(`start:${compKey}`);
    const end = document.createComment(`end:${compKey}`);
    
    return Promise.all(items.map(item => {
      if (_isPrimitive(item)) return Promise.resolve(document.createTextNode(String(item)));
      if (_isFn(item)) return this._processChildNode(item);
      if (_isBool(item) || _isNull(item)) return Promise.resolve(null);
      return this._processNode(item);
    })).then(elements => {
      const frag = document.createDocumentFragment();
      frag.appendChild(start);
      elements.forEach(el => { if (el) frag.appendChild(el); });
      frag.appendChild(end);
      this.componentMap.set(compKey, {name, props, element: start, endMarker: end, type: 'array', parentReactiveId});
      return frag;
    });
  }

  _buildElement(nodeOrObj, isSvgContext = false, compKey = null, itemKey = null) {
    const node = nodeOrObj.tag ? nodeOrObj : {tag: Object.keys(nodeOrObj)[0], props: Object.values(nodeOrObj)[0]};
    const {tag, props} = node;
    
    if (_isNull(itemKey) && props?.key !== undefined) itemKey = props.key;
    
    const isSvg = isSvgContext || this.renderer.svgTags.has(tag);
    const el = this.renderer.createElement(tag, isSvg);
    
    if (!_isNull(itemKey)) el._jurisKey = itemKey;
    
    const asyncTasks = [];
    let refCallback = null;
  
    const createReactive = (fn) => {
      const reactiveId = 'reactive_' + tag + (this.sm.reactiveCounter++);
      this.sm.subscriptions.set(reactiveId, new Set());
      
      const wrappedFn = () => {
        const prevReactive = this.sm.activeReactive;
        this.sm.activeReactive = reactiveId;
        try {
          return fn(el);
        } finally {
          this.sm.activeReactive = prevReactive;
        }
      };
      
      return {reactiveId, wrappedFn};
    };
  
    const handleReactiveProp = (type, valueFn, applyFn, nodeData = {}) => {
      const {reactiveId, wrappedFn} = createReactive(valueFn);
      const result = wrappedFn();
      
      this.sm.reactiveNodes.set(reactiveId, {type, fn: wrappedFn, compKey, ...nodeData});
      
      if (_isPromise(result)) {
        asyncTasks.push(result.then(resolved => applyFn(resolved)));
      } else {
        applyFn(result);
      }
    };
  
    const appendChildren = (childArray, parentReactiveId = null) => {
      asyncTasks.push(
        Promise.all(childArray.map(child => this._processChildNode(child, isSvg, compKey, parentReactiveId)))
          .then(nodes => {
            const frag = document.createDocumentFragment();
            nodes.forEach(node => { if (node) frag.appendChild(node); });
            el.appendChild(frag);
          })
      );
    };
  
    for (const [key, value] of Object.entries(props)) {
      if (key === 'ref' || key === 'onMount') {
        refCallback = value;
      } else if (key === 'key') {
        continue;
      } else if (key === 'children') {
        if (_isFn(value)) {
          const {reactiveId, wrappedFn} = createReactive(value);
          const children = wrappedFn();
          this.sm.reactiveNodes.set(reactiveId, {type: 'children', element: el, fn: wrappedFn, compKey});
          
          if (_isPromise(children)) {
            const placeholder = this._handlePromise(children, el, el);
            el.appendChild(placeholder);
          } else {
            const childArray = _isArr(children) ? children : [children];
            appendChildren(childArray, reactiveId);
          }
        } else {
          const childArray = _isArr(value) ? value : [value];
          appendChildren(childArray);
        }
      } else if (key === 'text') {
        if (_isFn(value)) {
          const textNode = document.createTextNode('');
          el.appendChild(textNode);
          handleReactiveProp(
            'text',
            value,
            text => textNode.textContent = String(text),
            {node: textNode}
          );
        } else {
          el.textContent = value;
        }
      } else if (key === 'innerHTML') {
        if (_isFn(value)) {
          handleReactiveProp(
            'innerHTML',
            value,
            html => el.innerHTML = html,
            {element: el}
          );
        } else {
          el.innerHTML = value;
        }
      } else if (key === 'style') {
        if (_isFn(value)) {
          handleReactiveProp(
            'style',
            value,
            styles => Object.assign(el.style, styles),
            {element: el}
          );
        } else if (_isObj(value)) {
          const hasReactiveFunctions = Object.values(value).some(v => _isFn(v));
          
          if (hasReactiveFunctions) {
            handleReactiveProp(
              'style',
              () => {
                const computedStyles = {};
                for (const [styleKey, styleValue] of Object.entries(value)) {
                  computedStyles[styleKey] = _isFn(styleValue) ? styleValue() : styleValue;
                }
                return computedStyles;
              },
              styles => Object.assign(el.style, styles),
              {element: el}
            );
          } else {
            Object.assign(el.style, value);
          }
        }
      } else if (key.startsWith('on') && key !== 'onMount') {
        this._handleEvent(el, key, value);
      } else {
        if (_isFn(value)) {
          handleReactiveProp(
            'attr',
            value,
            attrValue => this.renderer.setAttribute(el, key, attrValue, isSvg),
            {element: el, attrName: key, isSvg}
          );
        } else {
          this.renderer.setAttribute(el, key, value, isSvg);
        }
      }
    }
  
    return Promise.all(asyncTasks).then(() => {
      if (refCallback) refCallback(el);
      return el;
    });
  }
  
  _handleEvent(el, eventName, handler) {
    if (eventName === 'onconnected') {
      el._jurisOnConnected = handler;
      this._pendingConnected = this._pendingConnected || new Set();
      this._pendingConnected.add(el);
      return;
    }
    
    eventName = eventName.toLowerCase();
    let actualEventName = eventName === 'onclick' ? 'click' :
                          eventName === 'ondblclick' || eventName === 'ondoubleclick' ? 'dblclick' :
                          eventName.slice(2);
    
    const wrappedHandler = (e) => {
      try {
        return handler(e);
      } catch (error) {
        console.error(`[Juris] Event handler error (${actualEventName}):`, error);
      }
    };
    
    if (actualEventName === 'dblclick') {
      el._jurisHasDoubleClick = true;
    }
    
    const finalHandler = actualEventName === 'click'
      ? (e) => {
          if (e.detail === 2 && el._jurisHasDoubleClick) return;
          wrappedHandler(e);
        }
      : wrappedHandler;
    
    el.addEventListener(actualEventName, finalHandler);
    
    if (!el._jurisEventListeners) el._jurisEventListeners = [];
    el._jurisEventListeners.push({ eventName: actualEventName, handler: finalHandler });
  }

  _processChildNode(child, isSvgContext = false, compKey = null, parentReactiveId = null) {
    if (_isPrimitive(child)) {
      return Promise.resolve(document.createTextNode(String(child)));
    }
    if (_isBool(child) || _isNull(child)) {
      return Promise.resolve(document.createComment('null'));
    }
    if (_isFn(child)) {
      const reactiveId = 'reactive_' + (this.sm.reactiveCounter++);
      this.sm.subscriptions.set(reactiveId, new Set());
      
      const wrappedFn = () => {
        const prevReactive = this.sm.activeReactive;
        this.sm.activeReactive = reactiveId;
        try {
          return child();
        } finally {
          this.sm.activeReactive = prevReactive;
        }
      };
      
      const result = wrappedFn();
      
      if (_isPromise(result)) {
        return result.then(resolved => {
          if (_isNull(resolved)) {
            const placeholder = document.createComment('reactive-null');
            this.sm.reactiveNodes.set(reactiveId, {type: 'reactive-null', node: placeholder, fn: wrappedFn, compKey, parentReactiveId});
            return placeholder;
          }
          if (_isPrimitive(resolved)) {
            const textNode = document.createTextNode(String(resolved));
            this.sm.reactiveNodes.set(reactiveId, {type: 'text', node: textNode, fn: wrappedFn, compKey, parentReactiveId});
            return textNode;
          }
          if (this._isComponent(resolved)) {
            return this._processNode(resolved, isSvgContext, compKey, parentReactiveId).then(el => {
              this.sm.reactiveNodes.set(reactiveId, {type: 'element', node: el, fn: wrappedFn, compKey, parentReactiveId, isComponent: true});
              return el;
            });
          }
          if (_isObj(resolved)) {
            return this._processNode(resolved, isSvgContext, compKey, parentReactiveId).then(el => {
              this.sm.reactiveNodes.set(reactiveId, {type: 'element', node: el, fn: wrappedFn, compKey, parentReactiveId});
              return el;
            });
          }
          return document.createComment('null');
        });
      }
      
      if (_isNull(result)) {
        const placeholder = document.createComment('reactive-null');
        this.sm.reactiveNodes.set(reactiveId, {type: 'reactive-null', node: placeholder, fn: wrappedFn, compKey, parentReactiveId});
        return Promise.resolve(placeholder);
      }
      if (_isPrimitive(result)) {
        const textNode = document.createTextNode(String(result));
        this.sm.reactiveNodes.set(reactiveId, {type: 'text', node: textNode, fn: wrappedFn, compKey, parentReactiveId});
        return Promise.resolve(textNode);
      }
      if (this._isComponent(result)) {
        return this._processNode(result, isSvgContext, compKey, parentReactiveId).then(el => {
          this.sm.reactiveNodes.set(reactiveId, {type: 'element', node: el, fn: wrappedFn, compKey, parentReactiveId, isComponent: true});
          return el;
        });
      }
      if (_isObj(result)) {
        return this._processNode(result, isSvgContext, compKey, parentReactiveId).then(el => {
          this.sm.reactiveNodes.set(reactiveId, {type: 'element', node: el, fn: wrappedFn, compKey, parentReactiveId});
          return el;
        });
      }
      return Promise.resolve(document.createComment('null'));
    }
    return this._processNode(child, isSvgContext, compKey, parentReactiveId);
  }

  setAttribute(el, key, value, isSvg = false) {
    this.renderer.setAttribute(el, key, value, isSvg);
  }
  
  getCM(){
    return this.components;
  }
  
  async objectToElement(obj) {
    const layout = _isArr(obj) ? obj : [obj];
    const frag = await this._buildTree(layout);
    return frag.children.length === 1 ? frag.children[0] : frag;
  }

  _buildComponentTree() {
    const tree = {};
    for (const [key, meta] of this.__devtools.componentTree.entries()) {
      if (!meta.parent) {
        tree[key] = this._buildTreeNode(key);
      }
    }
    return tree;
  }

  _buildTreeNode(compKey) {
    const meta = this.__devtools.componentTree.get(compKey);
    const children = {};
    
    for (const [childKey, childMeta] of this.__devtools.componentTree.entries()) {
      if (childMeta.parent === `reactive_render_${compKey}`) {
        children[childKey] = this._buildTreeNode(childKey);
      }
    }
    
    return {
      name: meta.name,
      props: meta.props,
      renderCount: meta.renderCount || 0,
      children: Object.keys(children).length ? children : undefined
    };
  }
}

if (typeof window !== 'undefined') {
  window.Juris = Juris;
}
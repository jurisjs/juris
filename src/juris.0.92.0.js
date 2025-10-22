// @ts-nocheck
/**
 * Juris (JavaScript Unified Reactive Interface Solution)
 * The First and Only Non-blocking Reactive Platform, 
   Architecturally Optimized for Next Generation Cutting-Edge Cross-Platform Application.
 * Juris aims to eliminate build complexity from small to large applications.
 * Author: Resti Guay
 * Version: 0.93.0
 * License: MIT
 * GitHub: https://github.com/jurisjs/juris
 * Website: https://jurisjs.com/
 * NPM: https://www.npmjs.com/package/juris
 * Codepen: https://codepen.io/jurisauthor
 * Online Testing: https://jurisjs.com/tests/juris_pure_test_interface.html
 */

'use strict';
// Type Helpers
let _isStr = v => typeof v === 'string';
let _isFn = v => typeof v === 'function';
let _isNum = v => typeof v === 'number';
let _isBool = v => typeof v === 'boolean' || v==='true' || v==='false';
let _isObj = v => v !== null && typeof v === 'object';
let _isArr = v => Array.isArray(v);
let _shoudBeArray = v => !_isArr(v)?[v]:v;
let _isNull = v => v === null || v === undefined;
let _isPromise = v => _isObj(v) && _isFn(v.then);
let _isPrimitive = v => _isStr(v) || _isNum(v);
let _isDigit = s => /^\d+$/.test(s);
let _RENDER ='render';
let _EFFECT_ = 'effect_';
let _EFFECT ='effect';
let _REACTIVE_NULL='reactive-null';
let _TEXT = 'text';
let _PLACEHOLDER =  'placeholder';
let w=window;
let d=document;

// Add Trie classes before StateManager
class TrieNode {
  constructor() {
    this._children = new Map();
    this._subscribers = new Set();
  }
}

class SubscriptionTrie {
  constructor() {
    this.root = new TrieNode();
  }

  subscribe(path, subscriberId) {
    const segments = path.split('.');
    let node = this.root;
    
    for (const segment of segments) {
      if (!node._children.has(segment)) {
        node._children.set(segment, new TrieNode());
      }
      node = node._children.get(segment);
    }
    
    node._subscribers.add(subscriberId);
  }

  _unsubscribe(path, subscriberId) {
    const segments = path.split('.');
    const nodes = [this.root];
    let node = this.root;
    
    for (const segment of segments) {
      if (!node._children.has(segment)) return;
      node = node._children.get(segment);
      nodes.push(node);
    }
    
    node._subscribers.delete(subscriberId);
    
    // Cleanup empty nodes
    for (let i = segments.length - 1; i >= 0; i--) {
      const currentNode = nodes[i + 1];
      if (currentNode._subscribers.size === 0 && currentNode._children.size === 0) {
        nodes[i]._children.delete(segments[i]);
      } else {
        break;
      }
    }
  }

  findAffected(changedPath) {
    const affected = new Set();
    const segments = changedPath.split('.');
    let node = this.root;
    
    // Collect subscribers at root
    node._subscribers.forEach(id => affected.add(id));
    
    // Walk down path, collecting subscribers at each level
    for (const segment of segments) {
      if (!node._children.has(segment)) return affected;
      node = node._children.get(segment);
      node._subscribers.forEach(id => affected.add(id));
    }
    
    // Collect all descendants
    const collectDescendants = (n) => {
      n._subscribers.forEach(id => affected.add(id));
      for (const child of n._children.values()) {
        collectDescendants(child);
      }
    };
    collectDescendants(node);
    
    return affected;
  }
}

class StateManager {
  constructor() {
    this.states = {};
    this._subscriptions = new Map();
    this._trie = new SubscriptionTrie();
    this._reactiveNodes = new Map();
    this._effectCleanups = new Map();
    this._activeReactive = null;
    this._batchMode = false;
    this._batchedUpdates = new Set();
    this._reactiveCounter = 0;
    this._effectCounter = 0;
  }
  
  getSubscriptions() { return this._subscriptions; }
  getReactiveNodes() { return this._reactiveNodes; }
  getEffectCleanups() { return this._effectCleanups; }
  getReactiveCounter() { return this._reactiveCounter; }
  getEffectCounter() { return this._effectCounter; }
  getActiveReactive() { return this._activeReactive; }
  getBatchMode() { return this._batchMode; }
  getBatchedUpdates() { return this._batchedUpdates; }

  _getState(key, defaultValue, subscribe = true) {
    if (subscribe && this._activeReactive) {
      if (!this._subscriptions.has(this._activeReactive)) {
        this._subscriptions.set(this._activeReactive, new Set());
      }
      const subs = this._subscriptions.get(this._activeReactive);
      if (!subs.has(key)) {
        subs.add(key);
        this._trie.subscribe(key, this._activeReactive); // ADD THIS
      }
    }
    return key.includes('.') ? this._getNested(key, defaultValue) : 
           (this.states.hasOwnProperty(key) ? this.states[key] : defaultValue);
  }

  _getNested(path, defaultValue) {
    let keys = path.split('.');
    let value = this.states;
    for (let key of keys) {
      if (_isNull(value)) return defaultValue;
      value = value[_isDigit(key) ? parseInt(key, 10) : key];
    }
    return value !== undefined ? value : defaultValue;
  }

  _setState(key, value, notifyFn) {
    if (key.includes('.')) {
      this._setNested(key, value, notifyFn);
    } else {
      if (this.states[key] === value) return;
      this.states[key] = value;
      this._notify(key, notifyFn);
    }
  }

  _setNested(path, value, notifyFn) {
    let keys = path.split('.');
    let rootKey = keys[0];    
    if (keys.length === 1) {
      if (this.states[rootKey] === value) return;
      this.states[rootKey] = value;
      this._notify(rootKey, notifyFn);
      return;
    }
    
    let newRoot = this._shallowClonePath(this.states[rootKey], keys.slice(1), value);
    if (this.states[rootKey] === newRoot) return;
    this.states[rootKey] = newRoot;
    this._notify(path, notifyFn);
  }

  _shallowClonePath(obj, pathKeys, value) {
    if (!_isObj(obj) || obj === null) obj = _isDigit(pathKeys[0]) ? [] : {};    
    if (pathKeys.length === 1) {
      let key = _isDigit(pathKeys[0]) ? parseInt(pathKeys[0], 10) : pathKeys[0];
      if (obj[key] === value) return obj;
      return _isArr(obj) ? [...obj.slice(0, key), value, ...obj.slice(key + 1)] : {...obj, [key]: value};
    }    
    let currentKey = _isDigit(pathKeys[0]) ? parseInt(pathKeys[0], 10) : pathKeys[0];
    let newValue = this._shallowClonePath(obj[currentKey], pathKeys.slice(1), value);
    if (obj[currentKey] === newValue) return obj;
    return _isArr(obj) ? [...obj.slice(0, currentKey), newValue, ...obj.slice(currentKey + 1)] : {...obj, [currentKey]: newValue};
  }

   _notify(key, notifyFn) {
    const affected = this._trie.findAffected(key); // REPLACE _shouldNotify loop
    
    if (this._batchMode) {
      affected.forEach(id => this._batchedUpdates.add(id));
    } else if (notifyFn) {
      notifyFn(Array.from(affected));
    }
  }

  _shouldNotify(deps, changedKey) {
    for (let subscribedKey of deps) {
      if (subscribedKey === changedKey || changedKey.startsWith(subscribedKey + '.') || subscribedKey.startsWith(changedKey + '.')) return true;
    }
    return false;
  }

  _track(id, fn) {
    let isEffect = id.startsWith(_EFFECT_);
    
    if (!this._subscriptions.has(id)) {
      this._subscriptions.set(id, new Set());
    } else if (isEffect) {
      // Clear old subscriptions from Trie
      for (const path of this._subscriptions.get(id)) {
        this._trie._unsubscribe(path, id);
      }
      this._subscriptions.get(id).clear();
    }
    
    let prev = this._activeReactive;
    this._activeReactive = id;
    try {
      return fn();
    } finally {
      this._activeReactive = prev;
    }
  }

  _batch(fn, executeFn) {
    this._batchMode = true;
    this._batchedUpdates.clear();
    try {
      fn();
    } finally {
      this._batchMode = false;
      let updates = Array.from(this._batchedUpdates);
      this._batchedUpdates.clear();
      if (executeFn) executeFn(updates);
    }
  }

  effect(fn, executeFn) {
    let id = _EFFECT_ + (this._effectCounter++);
    this._subscriptions.set(id, new Set());    
    let execute = () => {
      this._runCleanups(id);
      let result = this._track(id, fn);
      if (_isPromise(result)) {
        result.then(cleanup => {         
          this._registerCleanup(id, cleanup);
        });
      } else {
        this._registerCleanup(id, result);
      }
    };    
    this._reactiveNodes.set(id, {type: _EFFECT, fn: fn});    
    if (executeFn) executeFn(id, execute);
    return id;
  }

  _runCleanups(id) {
    let cleanups = this._effectCleanups.get(id);
    if (cleanups) {
      cleanups.forEach(c => c());
      this._effectCleanups.delete(id);
    }
  }

  cleanup(id) {
    this._runCleanups(id);
    
    // Remove from Trie
    const paths = this._subscriptions.get(id);
    if (paths) {
      for (const path of paths) {
        this._trie._unsubscribe(path, id);
      }
    }
    
    this._subscriptions.delete(id);
    this._reactiveNodes.delete(id);
  }

  _cleanupByCompKey(cKey) {
    let toDelete = [];
    for (let [id, reactive] of this._reactiveNodes.entries()) {
      if (reactive.cKey === cKey) {
        toDelete.push(id);
        this._runCleanups(id);
      }
    }
    toDelete.forEach(id => {
      // Remove from Trie
      const paths = this._subscriptions.get(id);
      if (paths) {
        for (const path of paths) {
          this._trie._unsubscribe(path, id);
        }
      }
      
      this._subscriptions.delete(id);
      this._reactiveNodes.delete(id);
    });
  }

  _cleanupByParent(pRId) {
    let toDelete = [];
    for (let [id, reactive] of this._reactiveNodes.entries()) {
      if (reactive.pRId === pRId && id !== pRId) {
        toDelete.push(id);
        this._runCleanups(id);
      }
    }
    toDelete.forEach(id => {
      // Remove from Trie
      const paths = this._subscriptions.get(id);
      if (paths) {
        for (const path of paths) {
          this._trie._unsubscribe(path, id);
        }
      }
      
      this._subscriptions.delete(id);
      this._reactiveNodes.delete(id);
    });
    return toDelete.length;
  }

  getSubscribersForState(statePath) {
    let subscribers = [];
    for (let [rId, dependencies] of this._subscriptions.entries()) {
      for (let dep of dependencies) {
        if (dep === statePath || statePath.startsWith(dep + '.') || dep.startsWith(statePath + '.')) {
          subscribers.push({rId, dependency: dep, reactive: this._reactiveNodes.get(rId)});
          break;
        }
      }
    }
    return subscribers;
  }

  getStateSubscriptionMap() {
    let map = new Map();
    for (let [rId, dependencies] of this._subscriptions.entries()) {
      for (let statePath of dependencies) {
        if (!map.has(statePath)) map.set(statePath, []);
        map.get(statePath).push({rId, reactive: this._reactiveNodes.get(rId)});
      }
    }
    return map;
  }
  _registerCleanup(id, cleanup) {
    if (_isFn(cleanup)) {
      if (!this._effectCleanups.has(id)) {
        this._effectCleanups.set(id, []);
      }
      this._effectCleanups.get(id).push(cleanup);
    }
  }
}

class HeadlessManager {
  constructor(juris) {
    this._juris = juris;
    this._components = new Map();
    this._instances = new Map();
    this._queuedInitializations = new Map();
    this.apis = new Map();
    this._context = this._createHeadlessContext();
  }

  _createHeadlessContext() {
    return {
      getState: (path, defaultValue, track) => this._juris._stateManager._getState(path, defaultValue, track),
      setState: (path, value, context) => this._juris.setState(path, value),
      executeBatch: (callback) => this._juris._stateManager._batch(callback),
      subscribe: (path, callback) => this._juris._stateManager.subscribe(path, callback),
      subscribeExact: (path, callback) => this._juris._stateManager.subscribeExact(path, callback),
      effect: (fn) => {
        let { result, deps } = this._juris._stateManager._track(fn);
        let subscriptions = [];
        deps.forEach(path => {
          let unsub = this._juris._stateManager.subscribeInternal(path, fn);
          subscriptions.push(unsub);
        });
        return () => subscriptions.forEach(unsub => unsub());
      },
      services: this._juris._services || {},
      juris: this._juris
    };
  }

  register(name, componentFn, options = {}) {
    if (!name || typeof componentFn !== 'function') {
      console.error('[Juris HeadlessManager] Invalid component registration:', name);
      return false;
    }    
    this._components.set(name, { fn: componentFn, options });
    
    if (options.autoInit !== false) {
      this._queuedInitializations.set(name, options.props || {});
      this.initialize(name, options.props || {});
    }    
    return true;
  }

  initialize(name, props = {}) {
    let component = this._components.get(name);
    if (!component) {
      console.error('[Juris HeadlessManager] Component not found:', name);
      return null;
    }
    try {
      let context = { ...this._context, ...this._juris._services };
      let result = component.fn(context, props);      
      let instance = {
        name,
        props,
        result,
        api: result?.api || {},
        hooks: result?.hooks || {},
        cleanup: result?.cleanup || (() => {})
      };
      this._instances.set(name, instance);      
      if (instance.api && Object.keys(instance.api).length > 0) {
        this.apis.set(name, instance.api);
      }
      if (instance.hooks.onMount) {
        setTimeout(() => instance.hooks.onMount(), 0);
      }
      this._queuedInitializations.delete(name);      
      return instance;
    } catch (error) {
      console.error('[Juris HeadlessManager] Initialization failed:', name, error);
      return null;
    }
  }

  reinitialize(name, props = {}) {
    let instance = this._instances.get(name);
    if (instance) {
      if (instance.hooks.onUnmount) {
        instance.hooks.onUnmount();
      }
      instance.cleanup();
      this._instances.delete(name);
      this.apis.delete(name);
    }
    return this.initialize(name, props);
  }

  initializeQueued() {
    let queued = Array.from(this._queuedInitializations.entries());
    queued.forEach(([name, props]) => {
      if (!this._instances.has(name)) {
        this.initialize(name, props);
      }
    });
  }

  getInstance(name) {
    return this._instances.get(name) || null;
  }

  getAPI(name) {
    return this.apis.get(name) || null;
  }

  getAllAPIs() {
    let allAPIs = {};
    this.apis.forEach((api, name) => {
      allAPIs[name] = api;
    });
    return allAPIs;
  }

  getStatus() {
    return {
      registered: Array.from(this._components.keys()),
      initialized: Array.from(this._instances.keys()),
      queued: Array.from(this._queuedInitializations.keys()),
      apis: Array.from(this.apis.keys())
    };
  }

  cleanup() {
    this._instances.forEach((instance, name) => {
      if (instance.hooks.onUnmount) {
        instance.hooks.onUnmount();
      }
      instance.cleanup();
    });
    this._instances.clear();
    this.apis.clear();
  }
}

class DOMRenderer {
  constructor() {
    this.svgTags = new Set(['svg','path','circle','rect','line','polyline','polygon','ellipse','g','defs','use','symbol','clipPath','mask','pattern','linearGradient','radialGradient','stop','text','tspan','textPath','image','foreignObject']);
    this.bools = ['checked','selected','disabled','readonly','required','autofocus','autoplay','controls','loop','muted','multiple','open','hidden','async','defer'];
  }

  _createElement(tag, isSvg=false) {
    let el = isSvg ? d.createElementNS('http://www.w3.org/2000/svg', tag) : d.createElement(tag);
    return el;
  }

  _createTextNode(text) {
    return d.createTextNode(text);
  }

  _createComments(text) {
    return _shoudBeArray(text).map(t => d.createComment(t));
  }

  _createFragment() {
    return d.createDocumentFragment();
  }

  _setAttribute(el, key, value, isSvg = false) {
    if (isSvg) {
      _isNull(value) ? el.removeAttribute(key) : el.setAttribute(key, value);
      return;
    }
    if (this.bools.includes(key)) {
      value ? el.setAttribute(key, '') : el.removeAttribute(key);
      return;
    }
    let props = {value:'value',checked:'checked',selected:'selected',htmlFor:'htmlFor'};
    if (props[key]) { el[props[key]] = value; return; }
    if (key === 'class' || key === 'className') { el.className = value; return; }
    if (key === 'style' && _isObj(value)) { Object.assign(el.style, value); return; }
    _isNull(value) ? el.removeAttribute(key) : el.setAttribute(key, value);
  }

  _updateText(node, value) {
    if (_isNull(value)) {
      if (node.nodeType === 3) {
        let [comment] = this._createComments(_REACTIVE_NULL);
        node.parentNode?.replaceChild(comment, node);
        return {node: comment, type: _REACTIVE_NULL};
      }
      return {node, type: _REACTIVE_NULL};
    }
    if (node.nodeType === 8) {
      let text = this._createTextNode(String(value));
      node.parentNode?.replaceChild(text, node);
      return {node: text, type: _TEXT};
    }
    node.textContent = String(value);
    return {node, type: _TEXT};
  }

  _removeRange(start, end) {
    let node = start.nextSibling;
    while (node && node !== end) {
      let next = node.nextSibling;
      node.parentNode?.removeChild(node);
      node = next;
    }
  }

  _insertBeforeMarker(parent, nodes, marker) {
    let frag = this._createFragment();
    nodes.forEach(n => { if (n) frag.appendChild(n); });
    parent?.insertBefore(frag, marker);
  }

  _replaceElement(oldEl, newEl) {
    oldEl.parentNode?.replaceChild(newEl, oldEl);
  }

  _appendChildren(parent, children) {
    if(children ==='ignore') return;
    _shoudBeArray(children).forEach(child => {
      if(!_isNull(child)) {
        parent.appendChild(child);
      }
    });
  }

  _insertBefore(parent, newNode, refNode) {
    parent.insertBefore(newNode, refNode);
  }

  _removeChild(parent, children) {
    _shoudBeArray(children).forEach(child => {
      parent.removeChild(child);
    });
  }

  _addEventListener(el, eventName, handler) {
    el.addEventListener(eventName, handler);
  }

  _removeEventListener(el, eventName, handler) {
    el.removeEventListener(eventName, handler);
  }

  _createLoadingPlaceholder(position) {
    let loadingSpan = this._createElement('span');
    loadingSpan.style.cssText = 'color: #999; font-style: italic; padding: 4px 8px; display: inline-flex; align-items: center; gap: 6px;';
    let spinner = this._createElement('span');
    spinner.style.cssText = 'display: inline-block; width: 12px; height: 12px; border: 2px solid #e0e0e0; border-top-color: #667eea; border-radius: 50%; animation: juris-spin 0.8s linear infinite;';
    if (!d.getElementById('juris-spinner-styles')) {
      let style = this._createElement('style');
      style.id = 'juris-spinner-styles';
      style.textContent = '@keyframes juris-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
      d.head.appendChild(style);
    }
    this._appendChildren(loadingSpan, [spinner, this._createTextNode('Loading...')]);
    loadingSpan._jurisAsyncPlaceholder = true;
    return loadingSpan;
  }

  _cleanupEventListeners(el) {
    if (!el) return;
    if (el._jurisEventListeners) {
      el._jurisEventListeners.forEach(({eventName, handler}) => {
        this._removeEventListener(el, eventName, handler);
      });
      delete el._jurisEventListeners;
    }    
    if (el.childNodes) {
      for (let i = 0; i < el.childNodes.length; i++) {
        this._cleanupEventListeners(el.childNodes[i]);
      }
    }
  }

  _isNodeInside(child, parent) {
    if (!child || !parent) return false;
    let current = child;
    while (current && current !== d.body) {
      if (current === parent) return true;
      current = current.parentNode;
    }
    return false;
  }
}

class RouteMapper {
  constructor(config = {}) {
    this.aliases = config.aliases || {};
    this.routes = config.routes || {};
  }

  _resolve(segment) {
    return this.aliases[segment] || segment;
  }

  _resolvePath(path = w.location.pathname) {
    let routeMatch = this._matchRoute(path);
    if (routeMatch) {
      return routeMatch;
    }

    let segments = path.split('/').filter(s => s);
    if (segments.length > 0) {
      let firstSegment = this._resolve(segments[0]);
      let routeTargets = Object.values(this.routes);
      if (routeTargets.includes(firstSegment)) {
        return firstSegment;
      }
    }
    return 'home';
  }

  match(path = w.location.pathname) {
    let segments = path.split('/').filter(s => s);
    let sortedRoutes = Object.entries(this.routes).sort(([a], [b]) => {
      let aHasParams = a.includes(':');
      let bHasParams = b.includes(':');
      
      if (aHasParams && !bHasParams) return 1;
      if (!aHasParams && bHasParams) return -1;
      
      let aSegments = a.split('/').filter(s => s);
      let bSegments = b.split('/').filter(s => s);
      
      if (aSegments.length !== bSegments.length) {
        return bSegments.length - aSegments.length;
      }
      
      let aLiteralCount = aSegments.filter(s => !s.startsWith(':')).length;
      let bLiteralCount = bSegments.filter(s => !s.startsWith(':')).length;
      
      return bLiteralCount - aLiteralCount;
    });

    let candidateRoutes = sortedRoutes.filter(([pattern, target]) => {
      let patternSegs = pattern.split('/').filter(s => s);
      return patternSegs.length === segments.length;
    });
    
    for (let [pattern, target] of candidateRoutes) {
      let patternSegs = pattern.split('/').filter(s => s);
      
      let params = {};
      let match = true;

      for (let i = 0; i < patternSegs.length; i++) {
        if (patternSegs[i].startsWith(':')) {
          params[patternSegs[i].slice(1)] = segments[i];
        } else if (patternSegs[i] !== segments[i]) {
          match = false;
          break;
        }
      }

      if (match) {
        return { pattern, target, params, path };
      }
    }
    return null;
  }

  getParam(paramName, path = w.location.pathname) {
    let match = this.match(path);
    return match ? match.params[paramName] : null;
  }

  _matchRoute(path) {
    let result = this.match(path);
    if (!result) return null;

    let resolved = result.target;
    for (let [key, value] of Object.entries(result.params)) {
      resolved = resolved.replace(':' + key, value);
    }
    return resolved;
  }

  getSegments(path = w.location.pathname) {
    let segments = path.split('/').filter(s => s);
    return segments.map(seg => this._resolve(seg));
  }
}

class Juris {
  static #count = 0;  
  constructor(config={}) {
    this._stateManager = new StateManager();
    this._stateManager.states = config?.states || {};
    this.basePath = config.basePath || '';
    this._renderer = config.rendererInstance || new DOMRenderer();
    this._routerInstance = config.routerInstance || new RouteMapper(config.urlMappings || {});    
    this.__DEV__ = false;
    this.__SSR_RENDERED__=false;
    if (typeof window !== 'undefined'){
      if(w.__JURIS_HYDRATION_DATA__){
        this._stateManager.states = w.__JURIS_HYDRATION_DATA__;
        this.__SSR_RENDERED__=true;
      }
      //DEVTOOLS--START
      if (typeof window !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || _isBool(this._stateManager._getState('url.search.devMode', false, false)))) {
        let name = (config.debugName || 'juris') + (Juris.#count++ || '');
        Object.assign(w, {[name]: this});
        this.__DEV__ = config.devMode || true;
        if (this.__DEV__) {
          this.__devtools = {componentTree: new Map()};
          w['__JURIS_DEVTOOLS_HOOK__' + Juris.#count] = {
            getComponentTree: () => this._buildComponentTree(),
            getDOMTree: (root) => this._buildDOMTree(root),
            getElementInfo: (el) => this._buildDOMNode(el),
            getReactiveNodes: () => Array.from(this._stateManager._reactiveNodes.entries()),
            getSubscriptions: () => Array.from(this._stateManager._subscriptions.entries()),
            getArmedElements: () => Array.from(this._armedElements.entries())
          }
        }
      }
      //DEVTOOLS--END
    }

    this._components = config.components || {};
    this._activeComponents = new Set();
    this._headComponent = config.headComponent || null;    
    this.layout = config.layout || [];
    this._services = config.services || {};
    this._middlewares = config.middlewares || [];
    this._rootEl = null;
    this._componentMap = new Map();
    this._componentApiMap = new Map();
    this._componentCounter = 0;
    this._zIndex = 1000;
    this._zStacks = new Map();
    this._armedElements = new Map();    
    if (config.activeComponents && _isObj(config.activeComponents)) {
      Object.keys(config.activeComponents).forEach(name => {
        this._components[name] = config.activeComponents[name];
        this._activeComponents.add(name);
      });
    }
    this.indicator = this._normalizeIndicator(
      config.indicator || 
      config.loadingSpinner || 
      config.loadingSpinnerComponent
    );
    this.indicatorDelay = config.indicatorDelay || 200;
    this.indicatorGlobalDelay = config.indicatorGlobalDelay || 500;    
    this._pendingPromises = new Set();
    
    this._globalSpinnerTimeout = null;
    this._globalSpinnerTimeout = null; 
    this._applyMiddlewares();
    this._initPlugins(config.plugins || {});   
    if (config.headlessComponents) {
      if (!this._headlessManager) {
        this._headlessManager = new HeadlessManager(this);
      }
      Object.keys(config.headlessComponents).forEach(name => {
        let componentConfig = config.headlessComponents[name];
        if (_isFn(componentConfig)) {
          this._headlessManager.register(name, componentConfig);
        } else {
          this._headlessManager.register(name, componentConfig.fn, componentConfig.options);
        }
      });
    }

    this._startURLInjection();
    this._baseContext = {
      getState: (k, d, s) => this.getState(k, d, s),
      setState: (k, v) => this.setState(k, v),
      removeState: (k) => this.removeState(k),
      executeBatch: (fn) => this.executeBatch(fn),
      z: (l) => this.z(l),
      topZ: (l) => this.topZ(l),
      modal: (o) => this.modal(o),
      arm: (selector, handlerFn) => this.arm(selector, handlerFn),
      getComponentAPI: (n) => this._componentApiMap.get(n) || null,
      getHeadlessAPI: (n) => this._headlessManager?.getAPI(n) || null,
      getAllHeadlessAPIs: () => this.getAllHeadlessAPIs(),
      plugin: (n) => this._services[n] || null,
      objectToElement: (o) => this.objectToElement(o),
      registerComponent: (n, fn, opts) => this.registerComponent(n, fn, opts),
      registerHeadless: (n, fn, opts) => this.registerHeadless(n, fn, opts),
      initializeHeadless: (n, props) => this.initializeHeadless(n, props),
      registerActiveComponent: (n, fn, opts) => this.registerActiveComponent(n, fn, opts),
      getHeadless: (n) => this.getHeadless(n),
      juris: this,
      services: this._services,
      router: {
        navigate: (path, params = null) => this.navigate(path, params),
        replace: (path) => {
          if(window){
            w.history.replaceState({}, '', this.basePath + path);
            w.dispatchEvent(new Event('urlchange'));
          }else{
            this.setState('url.path', path);
            this._updateRouteParams(path);
          }
        },
        back: () => { if (window) w.history.back(); },
        forward: () => { if (window) w.history.forward(); },
        isActive: (path, segmentIndex = null) => {
          let current = this.getState('url.path');
          let segments = this.getState('url.segments');
          if (segmentIndex !== null) {
            return segments[segmentIndex] === path;
          }
          path = path.startsWith('/') ? path : '/' + path;
          return current === path || current.startsWith(path + '/');
        },
        query: {
          get: (key, defaultValue, subscribe) => {
            return this.getState(`url.search.${key}`, defaultValue, subscribe);
          },
          set: (key, value) => {
            if (typeof window === 'undefined') {
              this.setState(`url.search.${key}`, value);
              return;
            }   
            let params = new URLSearchParams(w.location.search);
            params.set(key, value);
            let newUrl = `${w.location.pathname}?${params}`;
            w.history.pushState({}, '', newUrl);
            w.dispatchEvent(new Event('urlchange'));
          }
        },
        hash: {
          get: () => {
            return this.getState('url.hash', '').replace('#', '');
          },
          set: (value) => {
             if (typeof window === 'undefined') {
              let hash = value.startsWith('#') ? value : `#${value}`;
              this.setState('url.hash', hash);
              return;
            }            
            let hash = value.startsWith('#') ? value : `#${value}`;
            w.location.hash = hash;
          }
        },
        buildPath: (pattern, params) => {
          let path = pattern;
          for (let [key, val] of Object.entries(params)) {
            path = path.replace(`:${key}`, val);
          }
          return path;
        }
      }
    };
     
    if (this._headComponent) {
      this._renderHeadComponent();
    }
  }

  _normalizeIndicator(ind) {
    if (!ind) return {default: null};
    if (_isFn(ind)) return {default: ind};
    if (ind.tag) return {default: ind};
    if (_isObj(ind)) {
      if (ind.default || Object.keys(ind).some(k => k.charAt(0) === '#' || this._components[k])) {
        return ind;
      }
      return {default: ind};
    }
    return {default: null};
  }

  _getIndicator(componentName = null, elementId = null) {
    if (elementId) {
      let idKey = '#' + elementId;
      if (this.indicator[idKey]) return this.indicator[idKey];
    }
    if (componentName && this.indicator[componentName]) {
      return this.indicator[componentName];
    }
    if (!this.indicator || !this.indicator.default) return {div:{text:'Loading...', class:'juris-indicator'}};
    return this.indicator.default;
  }

  _renderHeadComponent() {
    if (typeof window === 'undefined') return;
    let cKey = 'head_singleton';
    let context = this.createContext(cKey);
    try {
      let result = this._headComponent({}, context);
      let renderFn;
      if (_isFn(result)) {
        renderFn = result;
      } else if (result?.render) {
        renderFn = result.render;
      } else {
        renderFn = () => result;
      }
      let rId = 'reactive_render_' + cKey;
      this._stateManager._subscriptions.set(rId, new Set());
      let wrappedRender = () => {
        let prev = this._stateManager._activeReactive;
        this._stateManager._activeReactive = rId;
        try {
          return renderFn();
        } finally {
          this._stateManager._activeReactive = prev;
        }
      };

      this._stateManager._reactiveNodes.set(rId, {
        type: _RENDER,
        cKey,
        fn: wrappedRender,
        hooks: result?.hooks,
        pRId: null
      });

      this._componentMap.set(cKey, {
        name: 'Head',
        props: {},
        el: d.head,
        type: 'head',
        pRId: null
      });
      let renderOutput = wrappedRender();
      this._processHeadVDOM(renderOutput, cKey, rId);
      if (result?.hooks?.onMount) {
        setTimeout(() => result.hooks.onMount(), 0);
      }
    } catch (error) {
      console.error('[Juris Head] Error:', error);
    }
  }

  _processHeadVDOM(vdom, cKey, pRId) {
    if (!vdom || typeof vdom !== 'object') return;
    let children = [];
    let keys = Object.keys(vdom);
    if (keys.length === 1) {
        children = [vdom];
    } else {
      children = keys.map(key => ({ [key]: vdom[key] }));
    }
    children.forEach(child => {
      if (!child || typeof child !== 'object') return;
      let tag = Object.keys(child)[0];
      let props = child[tag];
      let el = this._buildElement(child, false, cKey, props?.key, pRId);
      if (_isPromise(el)) {
        el.then(el => this._mountToHead(el, tag));
      } else {
        this._mountToHead(el, tag);
      }
    });
  }

  _mountToHead(el, tag) {
    if (!el) return;    
    el.setAttribute('data-jhead', 'true');    
    if (tag === 'title') {
      let existingTitle = d.head.querySelector('title');
      if (existingTitle) {
        existingTitle.replaceWith(el);
      } else {
        d.head.appendChild(el);
      }
      return;
    }    
    if (tag === 'base') {
      let existingBase = d.head.querySelector('base');
      if (existingBase) {
        existingBase.replaceWith(el);
      } else {
        d.head.insertBefore(el, d.head.firstChild);
      }
      return;
    }
    if (tag === 'meta' || tag === 'link') {
      let existing = this._findExistingHeadElement(el, tag);
      if (existing) {
        existing.replaceWith(el);
        return;
      }
    }    
    d.head.appendChild(el);
  }

  _findExistingHeadElement(el, tag) {
    if (tag === 'meta') {
      if (el.name) return d.head.querySelector(`meta[name="${el.name}"]:not([data-jhead])`);
      if (el.getAttribute('property')) return d.head.querySelector(`meta[property="${el.getAttribute('property')}"]:not([data-jhead])`);
      if (el.getAttribute('http-equiv')) return d.head.querySelector(`meta[http-equiv="${el.getAttribute('http-equiv')}"]:not([data-jhead])`);
    }
    
    if (tag === 'link') {
      if (el.rel === 'canonical') return d.head.querySelector('link[rel="canonical"]:not([data-jhead])');
      if (el.rel && el.href) return d.head.querySelector(`link[rel="${el.rel}"][href="${el.href}"]:not([data-jhead])`);
    }
    
    return null;
  }

  _updateURLState(){
    if (typeof window === 'undefined') return;
    let params = new URLSearchParams(w.location.search);
    params.forEach((value, key) => {
      this.setState('url.search.' + key, value);
    });
    this.setState('url.href', w.location.href);
    
    let currentPath = w.location.pathname;
    if (this.basePath && currentPath.startsWith(this.basePath)) {
      currentPath = currentPath.substring(this.basePath.length) || '/';
    }
    
    let segments = currentPath.split('/').filter(s => s);    
    this.setState('url.path', currentPath);
    this.setState('url.segments', segments);    
    let mappedPath = this.getRouter()._resolvePath(currentPath);
    this.setState('url.mappedPath', mappedPath);
    this._updateRouteParams(currentPath);
  }

  _updateRouteParams(path){  
    let match = this._routerInstance.match(path);
    Object.keys(match || {}).forEach(k => {
      if(k === 'params') {
        this.setState('url.params', match[k]);
      } else {
        this.setState('url.route.' + k, match[k]);
      }
    });
  }

  _startURLInjection() {
    if (typeof window === 'undefined') return;
    this._updateURLState();
    w.addEventListener('urlchange', () => {
      this._updateURLState();
    });
    w.addEventListener('popstate', () => {
      w.dispatchEvent(new Event('urlchange'));
    });
    w.addEventListener('hashchange', () => {
      this.setState('url.hash', w.location.hash);
    });
  }  

  navigate(path, params = null) {
    if (params) {
      for (let [key, value] of Object.entries(params)) {
        path = path.replace(`:${key}`, value);
      }
    }          
    if(window){
      let fullPath = this.basePath + path;
      w.history.pushState({}, '', fullPath);
      w.dispatchEvent(new Event('urlchange'));
    }else{
      this.setState('url.path',this.basePath + path);
      this._updateRouteParams(path);
    }
  }

  get states() { return this._stateManager.states; }
  set states(val) { this._stateManager.states = val; }
  get subscriptions() { return this._stateManager._subscriptions; }
  get reactiveNodes() { return this._stateManager._reactiveNodes; }
  get renderer() { return this._renderer; }
  getStateManager() { return this._stateManager; }
  getRouter() { return this._routerInstance; }
  getServices() { return this._services; }
  get armedElements(){return this._armedElements; }
  get activeComponents(){return this._activeComponents; }
  get components(){return this._components; }
  
  registerService(name, service) {
    this._services[name] = service;
  }
  
  getActiveComponents() {
    return Array.from(this._activeComponents);
  }
  
  getComponents() {
    return this._components;
  }
  
  setMiddleware(middleware) {
    this._middlewares.push(middleware);
    this._applyMiddlewares();
  }

  _checkAndTrackPromise(value) {
   if (_isPromise(value)) {
    this._trackPromise(value);
    return true;
   }
   return false;
  }

  _isComponent(value) {
    if (!_isObj(value)) return false;
    let keys = Object.keys(value);
    return keys.length === 1 && this._components[keys[0]];
  }

  _trackPromise(promise) {
    let promiseId = 'promise_' + Math.random().toString(36).substr(2, 9);
    this._pendingPromises.add(promiseId);
    if (this._pendingPromises.size === 1 && this.indicator?.default && !this._globalSpinnerTimeout) {
      this._globalSpinnerTimeout = setTimeout(() => {
        if (this._pendingPromises.size > 0) this._showGlobalSpinner();
      }, this.indicatorGlobalDelay);
    }
    let cleanup = () => {
      this._pendingPromises.delete(promiseId);
      if (this._pendingPromises.size === 0) {
        if (this._globalSpinnerTimeout) {
          clearTimeout(this._globalSpinnerTimeout);
          this._globalSpinnerTimeout = null;
        }
        this._hideGlobalSpinner();
      }
    };
    promise.then(cleanup).catch(cleanup);
  }

  registerHeadless(name, fn, options = {}) {
    if (!this._headlessManager) {
      this._headlessManager = new HeadlessManager(this);
    }
    return this._headlessManager.register(name, fn, options);
  }

  initializeHeadless(name, props = {}) {
    if (!this._headlessManager) {
      console.error(' HeadlessManager not initialized');
      return null;
    }
    return this._headlessManager.initialize(name, props);
  }

  reinitializeHeadless(name, props = {}) {
    if (!this._headlessManager) {
      console.error(' HeadlessManager not initialized');
      return null;
    }
    return this._headlessManager.reinitialize(name, props);
  }

  getHeadless(name) {
    return this._headlessManager?.getInstance(name) || null;
  }

  getHeadlessAPI(name) {
    return this._headlessManager?.getAPI(name) || null;
  }

  getAllHeadlessAPIs() {
    return this._headlessManager?.getAllAPIs() || {};
  }

  getHeadlessStatus() {
    return this._headlessManager?.getStatus() || { registered: [], initialized: [], queued: [], apis: [] };
  }

  _showGlobalSpinner() {
    if (this._globalSpinnerTimeout) return;
    let indicatorVdom = this._getIndicator();
    if (!indicatorVdom) return;
    let spinnerEl = this._processNode(indicatorVdom);
    if (spinnerEl && !_isPromise(spinnerEl)) {
      this._globalSpinnerTimeout = spinnerEl;
      this._renderer._appendChildren(d.body, spinnerEl);
    }
  }

  _hideGlobalSpinner() {
    if (this._globalSpinnerTimeout?.parentNode) {
      this._globalSpinnerTimeout.parentNode.removeChild(this._globalSpinnerTimeout);
      this._globalSpinnerTimeout = null;
    }
  }

  // DEDUPLICATED: Consolidated async child replacement with error handling
  _handleAsyncChildReplacement(promise, position, cKey = null, pRId = null) {
    let placeholder = this._renderer._createLoadingPlaceholder(position);
    
    promise.then(resolved => {
      let processResult = this._processNode(resolved, false, cKey, pRId);
      
      if (_isPromise(processResult)) {
        processResult.then(node => {
          if (placeholder.parentNode && node) {
            this._renderer._replaceElement(placeholder, node);
          }
        });
      } else if (processResult && placeholder.parentNode) {
        this._renderer._replaceElement(placeholder, processResult);
      }
    }).catch(err => {
      console.error(` Error resolving async child at position ${position}:`, err);
      if (placeholder.parentNode) {
        let errorSpan = this._renderer._createElement('span');
        errorSpan.style.cssText = 'color: #ef4444; font-style: italic; padding: 4px 8px;';
        errorSpan.textContent = 'Error loading';
        this._renderer._replaceElement(placeholder, errorSpan);
      }
    });
    
    return placeholder;
  }

  _handlePromise(promise, parent, el, componentName = null, elementId = null) {
    this._trackPromise(promise);
    let [currentNode] = this._renderer._createComments('loading');
    let spinnerTimeout = null;
    let indicatorVdom = this._getIndicator(componentName, elementId);  
    if (indicatorVdom && this.indicatorDelay > 0) {
      spinnerTimeout = setTimeout(() => {
        if (currentNode.parentNode) {
          let spinnerEl = this._processNode(indicatorVdom);
          if (spinnerEl && currentNode.parentNode) {
            this._renderer._replaceElement(currentNode, spinnerEl);
            currentNode = spinnerEl;
          }
        }
      }, this.indicatorDelay);
    } else if (indicatorVdom) {
      return this._processNode(indicatorVdom);
    }    
    promise.then(result => {
      if (spinnerTimeout) clearTimeout(spinnerTimeout);
      let nodeResult = this._processChildNode(result);      
      if (_isPromise(nodeResult)) {
        nodeResult.then(node => {
          if (currentNode?.parentNode) {
            this._renderer._replaceElement(currentNode, node || this._renderer._createComments('null')[0]);
          }
        });
      } else if (currentNode?.parentNode) {
        this._renderer._replaceElement(currentNode, nodeResult || this._renderer._createComments('null')[0]);
      }
    }).catch(err => {
      if (spinnerTimeout) clearTimeout(spinnerTimeout);
      console.error(' Promise error:', err);
      if (currentNode?.parentNode) {
        this._renderer._replaceElement(currentNode, this._renderer._createComments('error')[0]);
      }
    });    
    return currentNode;
  }

  _applyMiddlewares() {
    if (this._middlewares.length === 0) return;    
    let originalGet = this._stateManager._getState.bind(this._stateManager);
    let originalSet = this._stateManager._setState.bind(this._stateManager);    
    this._stateManager._getState = (key, def) => {
      if (!this._middlewares.some(m => m.beforeGetState)) return originalGet(key, def);
      let result = {key, defaultValue: def, value: originalGet(key, def)};
      for (let m of this._middlewares) {
        if (m.beforeGetState) result = m.beforeGetState(result, this) || result;
      }
      return result.value;
    };    
    this._stateManager._setState = (key, value, notifyFn) => {
      let data = {key, value, oldValue: originalGet(key)};
      for (let m of this._middlewares) {
        if (m.beforeSetState) data = m.beforeSetState(data, this) || data;
      }
      originalSet(data.key, data.value, notifyFn);
      for (let m of this._middlewares) {
        if (m.afterSetState) m.afterSetState(data, this);
      }
    };
  }

  _notifySubscription(subscriptionId, changedKey) {
    if (!this._subscriptionCallbacks) return;    
    let callback = this._subscriptionCallbacks.get(subscriptionId);
    if (!callback) return;    
    let subscribedKeys = this._stateManager._subscriptions.get(subscriptionId);
    if (!subscribedKeys) return;    
    let key = Array.from(subscribedKeys)[0];
    let newValue = this.getState(key);
    let oldValue = this._stateManager.states._previousValues?.[key];    
    try {
      callback(newValue, oldValue);
    } catch (error) {
      console.error(' Subscription callback error:', error);
    }
  }

  _initPlugins(plugins) {
    Object.entries(plugins).forEach(([name, plugin]) => {
      if (_isFn(plugin)) plugin(this);
      else if (plugin?.install) plugin.install(this);
    });
  }

  getState(key, def, subscribe = true) { return this._stateManager._getState(key, def, subscribe); }
  
  setState(key, val) {
    this._stateManager._setState(key, val, (toUpdate) => {
      for (let id of toUpdate) {
        if (id.startsWith('reactive_')) {
          this._updateReactiveNode(id);
        } else if (id.startsWith(_EFFECT_)) {
          this._executeEffect(id);
        } else if (id.startsWith('subscription_')) {
          this._notifySubscription(id, key);
        }
      }
    });
  }
  removeState(path) {
    let keys = path.split('.');
    let rootKey = keys[0];
    if (keys.length === 1) {
      delete this._stateManager.states[rootKey];
      this._stateManager._notify(rootKey, (toUpdate) => {
        for (let id of toUpdate) {
          if (id.startsWith('reactive_')) this._updateReactiveNode(id);
          else if (id.startsWith(_EFFECT_)) this._executeEffect(id);
        }
      });
      return;
    }    
    // Recursively delete with immutable cloning
    let newRoot = this._deleteAtPath(this._stateManager.states[rootKey], keys.slice(1));
    if (newRoot === this._stateManager.states[rootKey]) return;
    this._stateManager.states[rootKey] = newRoot;
    // Only notify subscribers of the deleted path
    for (let [id, deps] of this._stateManager._subscriptions) {
      if (deps.has(path)) {
        if (id.startsWith('reactive_')) this._updateReactiveNode(id);
        else if (id.startsWith(_EFFECT_)) this._executeEffect(id);
      }
    }
  }

  _deleteAtPath(obj, pathKeys) {
    if (!obj || typeof obj !== 'object') return obj;
    
    if (pathKeys.length === 1) {
      let key = pathKeys[0];
      
      if (Array.isArray(obj)) {
        let index = parseInt(key, 10);
        if (index < 0 || index >= obj.length) return obj;
        return [...obj.slice(0, index), ...obj.slice(index + 1)];
      } else {
        if (!obj.hasOwnProperty(key)) return obj;
        let {[key]: _, ...rest} = obj;
        return rest;
      }
    }
    
    let key = pathKeys[0];
    let currentKey = Array.isArray(obj) ? parseInt(key, 10) : key;
    
    if (!obj.hasOwnProperty(currentKey)) return obj;
    
    let newValue = this._deleteAtPath(obj[currentKey], pathKeys.slice(1));
    
    if (obj[currentKey] === newValue) return obj;
    
    return Array.isArray(obj)
      ? [...obj.slice(0, currentKey), newValue, ...obj.slice(currentKey + 1)]
      : {...obj, [currentKey]: newValue};
  }
  effect(fn) {
    let cKey = null;
    if (this._stateManager._activeReactive) {
      let activeNode = this._stateManager._reactiveNodes.get(this._stateManager._activeReactive);
      if (activeNode?.cKey) {
        cKey = activeNode.cKey;
      }
    }    
    return this._stateManager.effect(fn, (id, execute) => {
      execute();
      if (cKey) {
        let effectNode = this._stateManager._reactiveNodes.get(id);
        if (effectNode) {
          effectNode.cKey = cKey;
        }
      }
    });
  }

  executeBatch(fn) {
    this._stateManager._batch(fn, (updates) => {
      for (let id of updates) {
        if (id.startsWith('reactive_')) this._updateReactiveNode(id);
        else if (id.startsWith(_EFFECT_)) this._executeEffect(id);
      }
    });
  }

  _executeEffect(id) {
    let reactive = this._stateManager._reactiveNodes.get(id);
    if (!reactive || reactive.type !== _EFFECT) return;
    
    if (reactive._isExecuting) return;
    reactive._isExecuting = true;
    
    // Clear subscriptions from both Map and Trie
    if (this._stateManager._subscriptions.has(id)) {
      const paths = this._stateManager._subscriptions.get(id);
      for (const path of paths) {
        this._stateManager._trie._unsubscribe(path, id);
      }
      paths.clear();
    }
  
    this._stateManager._runCleanups(id);    
    try {
      let result = this._stateManager._track(id, reactive.fn);
      if (this._checkAndTrackPromise(result)) {
        result.then(cleanup => {
          this._stateManager._registerCleanup(id, cleanup);
        }).catch(err => {
          console.error('Effect error:', err);
        });
      } else {
        this._stateManager._registerCleanup(id, result);
      }
    } catch (err) {
      console.error('Effect execution error:', err);
    }finally {
      reactive._isExecuting = false;
    }
  }

  _updateReactiveNode(rId) {
    let reactive = this._stateManager._reactiveNodes.get(rId);
    if (!reactive) return;
    
    if (reactive.type === _RENDER) {
      this._stateManager._subscriptions.get(rId)?.clear();
    } else {
      // Clear from Trie for non-render reactives
      const paths = this._stateManager._subscriptions.get(rId);
      if (paths) {
        for (const path of paths) {
          this._stateManager._trie._unsubscribe(path, rId);
        }
      }
      
      this._stateManager._subscriptions.delete(rId);
      this._stateManager._subscriptions.set(rId, new Set());
    }		
    this._stateManager._activeReactive = rId;
    let newValue;
    try {
      newValue = reactive.fn();
    } catch (error) {
      this._stateManager._activeReactive = null;
      if (reactive.type === _RENDER) {
        console.error(' Component update error:', error);
        let meta = this._componentMap.get(reactive.cKey);
        if (meta) this._processResolvedRenderResult(reactive, meta, this._createErrorVDOM(error, meta.name));
      } else {
        console.error(' Reactive node error:', error);
      }
      return;
    }
    this._stateManager._activeReactive = null;		
    if (reactive.type === _TEXT || reactive.type === _REACTIVE_NULL) {
      this._updateTextNode(reactive, newValue);
    } else if (reactive.type === 'attr') {
      if (reactive.attrName === 'class' || reactive.attrName === 'className') {
        this._checkAndTrackPromise(newValue) ? newValue.then(v => reactive.el.className = v) : (reactive.el.className = newValue);
      } else {
        this._checkAndTrackPromise(newValue) ? newValue.then(v => this._renderer._setAttribute(reactive.el, reactive.attrName, v, reactive.isSvg)) : this._renderer._setAttribute(reactive.el, reactive.attrName, newValue, reactive.isSvg);
      }
    } else if (reactive.type === 'style') {
      this._checkAndTrackPromise(newValue) ? newValue.then(s => Object.assign(reactive.el.style, s)) : Object.assign(reactive.el.style, newValue);
    } else if (reactive.type === 'children') {
      this._updateChildrenNode(reactive, newValue);
    } else if (reactive.type === _RENDER) {
      this._updateComponentRender(rId, newValue);
    } else if (reactive.type === 'el') {
      this._updateElementNode(reactive, newValue);
    } else if (reactive.type === 'innerHTML') {
      if (reactive.el) {
        this._checkAndTrackPromise(newValue) ? newValue.then(v => reactive.el.innerHTML = v) : (reactive.el.innerHTML = newValue);
      }
    } else if (reactive.type === 'classList') {
        if (!reactive.el) return;
        let newClasses = new Set(_shoudBeArray(newValue).filter(c => c));
        let prvCls = reactive.prvCls;
        prvCls.forEach(cls => {
          if (!newClasses.has(cls)) {
            reactive.el.classList.remove(cls);
          }
        });
        newClasses.forEach(cls => {
          if (!prvCls.has(cls)) {
            reactive.el.classList.add(cls);
          }
        });
        reactive.prvCls = newClasses;
      }
  }
  _replaceReactiveNode(result, reactive, newValue) {
    const replaceNode = (el) => {
      if (el && reactive.node?.parentNode) {
        this._renderer._replaceElement(reactive.node, el);
        reactive.node = el;
        reactive.type = 'el';
        reactive.isCom = this._isComponent(newValue);
      }
    };

    if (_isPromise(result)) {
      result.then(replaceNode);
    } else if (result) {
      replaceNode(result);
    }
  }

  _updateTextNode(reactive, newValue) {
    if (!reactive.node?.parentNode) return;    
    if (_isPromise(newValue)) {
      let placeholder = this._handlePromise(newValue, reactive.node.parentNode, reactive.el);
      this._renderer._replaceElement(reactive.node, placeholder);
      reactive.node = placeholder;
    } else {
      if (this._isComponent(newValue) || (_isObj(newValue) && !_isArr(newValue))) {
        let result = this._processNode(newValue, false, reactive.cKey, reactive.pRId);        
        this._replaceReactiveNode(result, reactive, newValue);
      } else {
        let updateResult = this._renderer._updateText(reactive.node, newValue);
        reactive.node = updateResult.node;
        reactive.type = updateResult.type;
      }
    }
  }

  _createErrorVDOM(error, componentName) {
    //DEVTOOLS--START
    if(this.__DEV__ === false) {
      console.error(` Error in component or tag "${componentName}":`, error);
      return null;
    } 
    //DEVTOOLS--END
    return {
      div: {
        style: {padding: '12px', margin: '8px', border: '2px solid #ef4444', borderRadius: '4px', background: '#fee', color: '#991b1b', fontFamily: 'monospace', fontSize: '12px'},
        children: [
          {strong: {text: `Error in component or tag "${componentName}"`}},
          {br: {}},
          {div: {text: error.message}},
          {br: {}},
          {small: {text: error.stack ? error.stack.split('\n')[1] : 'No stack trace'}}
        ]
      }
    };
  }

  _updateElementNode(reactive, newValue) {
    if (!reactive.node?.parentNode) return;    
    this._renderer._cleanupEventListeners(reactive.node);
    if (_isPromise(newValue)) {
      let placeholder = this._handlePromise(newValue, reactive.node.parentNode, reactive.el);
      this._renderer._replaceElement(reactive.node, placeholder);
      reactive.node = placeholder;
    } else {
      if (_isNull(newValue)) {
        let comment = this._renderer._createComments(_REACTIVE_NULL)[0];
        this._renderer._replaceElement(reactive.node, comment);
        reactive.node = comment;
        reactive.type = _REACTIVE_NULL;
      } else if (_isPrimitive(newValue)) {
        let textNode = this._renderer._createTextNode(String(newValue));
        this._renderer._replaceElement(reactive.node, textNode);
        this._setMetaElement(reactive, textNode, null, _TEXT);
        reactive.node = textNode;
        reactive.type = _TEXT;
      } else if (_isObj(newValue) && !_isArr(newValue)) {
        let result = this._processNode(newValue, false, reactive.cKey, reactive.pRId);        
        this._replaceReactiveNode(result, reactive, newValue);
      }
    }
  }

  _updateChildrenNode(reactive, newValue) {
    if (!reactive.el) return;    
    if (_isPromise(newValue)) {
      let placeholder = this._handlePromise(newValue, reactive.el, reactive.el);
      this._renderer._appendChildren(reactive.el, placeholder);
    } else {
      this._updateReactiveChildren(reactive.el, newValue, reactive);
    }
  }

  _cleanupDisconnectedComponents() {
    let disconnectedComponents = [];    
    for (let [cKey, meta] of this._componentMap.entries()) {
      let el = meta.el;      
      if (el && el.nodeType === 1 && !el.isConnected) {
        disconnectedComponents.push(cKey);
      } else if (el && el.nodeType === 8 && !el.isConnected) {
        disconnectedComponents.push(cKey);
      }
    }    
    for (let cKey of disconnectedComponents) {
      let renderReactiveId = 'reactive_render_' + cKey;
      let renderReactive = this._stateManager._reactiveNodes.get(renderReactiveId);      
      if (renderReactive?.hooks?.onUnmount) {
        renderReactive.hooks.onUnmount();
      }      
      this._stateManager._cleanupByCompKey(cKey);
      this._stateManager.cleanup(renderReactiveId);
      this._componentMap.delete(cKey);      
      let localStateKey = `__local_${cKey}`;
      if (this._stateManager.states[localStateKey]) {
        delete this._stateManager.states[localStateKey];
      }      
      //DEVTOOLS--START
      if (this.__DEV__ && this.__devtools?.componentTree) {
        this.__devtools.componentTree.delete(cKey);
      }
      //DEVTOOLS--END
    }    
    return disconnectedComponents.length;
  }
  _cleanupComponent(cKey, meta, reactive) {
  // Call onUnmount hook if exists
  if (reactive?.hooks?.onUnmount) {
    try {
      reactive.hooks.onUnmount();
    } catch (error) {
      console.error('Error in onUnmount:', error);
    }
  }
  
  // Remove from DOM based on component type
  if (meta.type === 'el' && meta.el?.parentNode) {
    // Clean up event listeners recursively
    this._renderer._cleanupEventListeners(meta.el);
    // Remove the element
    this._renderer._removeChild(meta.el.parentNode, meta.el);
  } else if ((meta.type === 'primitive' || meta.type === 'array' || meta.type === 'null') && meta.el?.parentNode) {
    // Remove content between markers
    this._renderer._removeRange(meta.el, meta.endMarker);
    this._renderer._removeChild(meta.el.parentNode, [meta.el, meta.endMarker]);
  }
  let rId = 'reactive_render_' + cKey;
  this._stateManager._cleanupByCompKey(cKey);
  this._stateManager.cleanup(rId);
  // Remove from component map
  this._componentMap.delete(cKey);
  if (meta.name) {
    this._componentApiMap.delete(meta.name);
  }
  let localStateKey = `__local_${cKey}`;
  if (this._stateManager.states[localStateKey]) {
    delete this._stateManager.states[localStateKey];
  }
  //DEVTOOLS--START
  if (this.__DEV__ && this.__devtools?.componentTree) {
    this.__devtools.componentTree.delete(cKey);
  }
  //DEVTOOLS--END
}
  _updateReactiveChildren(el, children, reactive) {
    if (children === "ignore") return;
    let pRId = Object.keys(reactive).find(k => reactive[k] && _isStr(reactive[k]) && reactive[k].startsWith('reactive_'));
    this._cleanupReactiveNodesInContainer(el, pRId);
    let newChildArray = _shoudBeArray(children);
    let hasAsync = false;
    let processedChildren = [];
    for (let i = 0; i < newChildArray.length; i++) {
      let child = newChildArray[i];
      if (_isFn(child)) {
        child = child(el);
      }
      if (_isPrimitive(child) || _isBool(child)) {
        processedChildren[i] = {type: _TEXT, value: String(child), vdom: null, key: null};
      } else if (_isNull(child)) {
        processedChildren[i] = null;
      } else if (this._checkAndTrackPromise(child)) {
        hasAsync = true;
        processedChildren[i] = {type:_PLACEHOLDER, position: i, promise: child, key: null};
      } else {
        let childKey = this._extractKey(child);
        processedChildren[i] = {type: 'vdom', value: child, vdom: child, key: childKey};
      }
    }
    let filtered = processedChildren.filter(c => c !== null);
    this._diffChildren(el, filtered, reactive.cKey, pRId);
    if (hasAsync) {
      for (let i = 0; i < processedChildren.length; i++) {
        if (processedChildren[i]?.type ===_PLACEHOLDER) {
          let placeholder = processedChildren[i];
          placeholder.promise.then(resolved => {
            processedChildren[i] = {
              type: 'vdom',
              value: resolved,
              vdom: resolved,
              key: this._extractKey(resolved)
            };
          });
        }
      }
    }
  }

  _cleanupReactiveNodesInContainer(container, pRId) {
    if (!pRId || this._stateManager._reactiveNodes.size === 0) return;  
    let toDelete = [];  
    for (let [id, reactive] of this._stateManager._reactiveNodes.entries()) {
      if (id === pRId || reactive.type === 'render') continue;    
      if (reactive.pRId === pRId) {
        toDelete.push(id);
      } else if (reactive.el && !reactive.el.isConnected) {
        toDelete.push(id);
      } else if (reactive.node && !reactive.node.isConnected) {
        toDelete.push(id);
      }
    }  
    for (let i = 0; i < toDelete.length; i++) {
      this._stateManager.cleanup(toDelete[i]);
    }
  }

  _cleanupReactivesByParent(pRId) {
    let toDelete = [];
    for (let [id, reactive] of this._stateManager._reactiveNodes.entries()) {
      if (reactive.pRId === pRId && id !== pRId) toDelete.push(id);
    }
    toDelete.forEach(id => this._stateManager.cleanup(id));
  }

  _extractKey(vdom) {
    if (!_isObj(vdom)) return null;
    let [props] = Object.values(vdom);
    return props?.key ?? null;
  }

  _diffChildren(container, newChildren, cKey, pRId) {
    let oldNodes = Array.from(container.childNodes);
    let hasKeys = newChildren.some(c => c.key !== null && c.key !== undefined);
    if (hasKeys) {
      this._diffChildrenByKey(container, oldNodes, newChildren, cKey, pRId);
    } else {
      this._replaceAllChildren(container, newChildren, cKey, pRId);
    }
    requestAnimationFrame(() => {
      this._cleanupDisconnectedComponents();
    });
  }

  _scheduleAsyncCleanup(nodes, pRId) {
    if (!nodes || nodes.length === 0) return;
    setTimeout(() => this._batchDeepCleanup(nodes, pRId), 0);
  }

  _replaceAllChildren(container, newChildren, cKey, pRId) {
    if (container._jurisPendingUpdate) {
      container._jurisPendingUpdate._cancelled = true;
    }
    let updateToken = {_cancelled: false};
    container._jurisPendingUpdate = updateToken;  
    if (newChildren === "ignore") {
      delete container._jurisPendingUpdate;
      return;
    }
    let oldNodes = Array.from(container.childNodes);
    let results = [];
    for (let i = 0; i < newChildren.length; i++) {
      let child = newChildren[i];
      if (!child) {
        results[i] = null;
        continue;
      }    
      if (child.type === 'placeholder') {
        let indicatorVdom = this._getIndicator(null, null);
        let loadingSpan = indicatorVdom 
          ? this._processNode(indicatorVdom)
          : this._renderer._createLoadingPlaceholder(i);      
        results[i] = loadingSpan;
        this._trackPromise(child.promise);      
        this._handleAsyncChildReplacement(child.promise, i, cKey, pRId).then(placeholder => {
          if (loadingSpan.parentNode) {
            this._renderer._replaceElement(loadingSpan, placeholder);
          }
        });
        continue;
      }    
      if (child.type === 'text') {
        results[i] = this._renderer._createTextNode(child.value);
      } else {
        let processResult = this._processNode(child.value, false, cKey, pRId);      
        if (_isPromise(processResult)) {
          results[i] = this._handleAsyncChildReplacement(processResult, i, cKey, pRId);
          continue;
        }      
        results[i] = processResult;
      }
    }  
    if (updateToken._cancelled) {
      return;
    }
    container.innerHTML = '';
    let frag = this._renderer._createFragment();
    for (let i = 0; i < results.length; i++) {
      if (results[i]) {
        this._renderer._appendChildren(frag, results[i]);
      }
    }
    this._renderer._appendChildren(container, frag);
    if (oldNodes.length > 0) {
      this._scheduleAsyncCleanup(oldNodes, pRId);
    }
    requestAnimationFrame(() => this._checkPendingConnected());  
    if (container._jurisPendingUpdate === updateToken) {
      delete container._jurisPendingUpdate;
    }
  }

  _batchDeepCleanup(nodes, pRId) {
    if (!nodes || nodes.length === 0) return;
    
    if (this._stateManager._reactiveNodes.size === 0) {
      for (let i = 0; i < nodes.length; i++) {
        this._cleanupEventListenersRecursive(nodes[i]);
      }
      return;
    }
    
    let allNodesToCleanup = new Set();
    for (let i = 0; i < nodes.length; i++) {
      this._collectNodesRecursive(nodes[i], allNodesToCleanup);
    }
    
    let toCleanup = [];
    for (let [id, reactive] of this._stateManager._reactiveNodes.entries()) {
      if (id.startsWith('reactive_render_')) continue;
      
      if (allNodesToCleanup.has(reactive.el) || allNodesToCleanup.has(reactive.node)) {
        toCleanup.push(id);
      }
    }
    
    for (let i = 0; i < toCleanup.length; i++) {
      this._stateManager.cleanup(toCleanup[i]);
    }
    
    for (let n of allNodesToCleanup) {
      if (n._jurisEventListeners) {
        let listeners = n._jurisEventListeners;
        for (let i = 0; i < listeners.length; i++) {
          this._renderer._removeEventListener(n, listeners[i]._eventName, listeners[i]._handler);
        }
        delete n._jurisEventListeners;
      }
    }
  }

  _collectNodesRecursive(node, set) {
    if (!node) return;
    set.add(node);
    if (node.childNodes) {
      for (let i = 0; i < node.childNodes.length; i++) {
        this._collectNodesRecursive(node.childNodes[i], set);
      }
    }
  }

  _cleanupEventListenersRecursive(node) {
    if (!node) return;
    
    if (node._jurisEventListeners) {
      let listeners = node._jurisEventListeners;
      for (let i = 0; i < listeners.length; i++) {
        this._renderer._removeEventListener(node, listeners[i]._eventName, listeners[i]._handler);
      }
      delete node._jurisEventListeners;
    }
    
    if (node.childNodes) {
      for (let i = 0; i < node.childNodes.length; i++) {
        this._cleanupEventListenersRecursive(node.childNodes[i]);
      }
    }
  }

  _diffChildrenByKey(container, oldNodes, newChildren, cKey, pRId) {
    if (!container._jurisNodeKeys) container._jurisNodeKeys = new Map();    
    let oldMap = new Map(container._jurisNodeKeys);
    
    if (oldMap.size === 0 && oldNodes.length > 0) {
      for (let i = 0; i < oldNodes.length; i++) {
        let node = oldNodes[i];
        if (node.nodeType === 1 && node._jurisKey !== undefined) {
          oldMap.set(node._jurisKey, node);
        }
      }
      container._jurisNodeKeys = oldMap;
    }
    
    let newKeySet = new Set();
    let results = [];
    let newMap = new Map();
    let hasAsync = false;
    
    for (let i = 0; i < newChildren.length; i++) {
      let child = newChildren[i];
      
      if (!child || child.type === _PLACEHOLDER || _isNull(child.key)) {
        results[i] = null;
        continue;
      }
      
      newKeySet.add(child.key);
      
      let existing = oldMap.get(child.key);
      if (existing?.parentNode === container) {
        newMap.set(child.key, existing);
        results[i] = {key: child.key, node: existing};
        continue;
      }
      
      if (child.type === _TEXT) {
        let node = this._renderer._createTextNode(child.value);
        newMap.set(child.key, node);
        results[i] = {key: child.key, node};
      } else {
        let processResult = this._processNode(child.value, false, cKey, pRId);
        
        if (_isPromise(processResult)) {
          hasAsync = true;
          results[i] = processResult.then(node => {
            newMap.set(child.key, node);
            return {key: child.key, node};
          });
        } else {
          newMap.set(child.key, processResult);
          results[i] = {key: child.key, node: processResult};
        }
      }
    }
    
    for (let [key, node] of oldMap) {
      if (!newKeySet.has(key) && node.parentNode === container) {
        this._deepCleanupNode(node, pRId);
        this._renderer._removeChild(container, node);
      }
    }
    
    let reorderChildren = () => {
      let childNodesArray = container.childNodes;
      let positionMap = new Map();
      
      for (let i = 0; i < childNodesArray.length; i++) {
        positionMap.set(childNodesArray[i], i);
      }
      
      for (let i = 0; i < results.length; i++) {
        let result = results[i];
        if (!result) continue;
        
        let {node} = result;
        let currentPos = positionMap.get(node);
        
        if (currentPos === undefined) {
          let ref = childNodesArray[i];
          this._renderer._insertBefore(container, node, ref || null);
          
          positionMap.set(node, i);
          for (let [n, pos] of positionMap.entries()) {
            if (pos >= i && n !== node) {
              positionMap.set(n, pos + 1);
            }
          }
        } else if (currentPos !== i) {
          let ref = childNodesArray[i];
          if (ref !== node) {
            this._renderer._insertBefore(container, node, ref);
            
            let oldPos = currentPos;
            positionMap.set(node, i);
            
            for (let [n, pos] of positionMap.entries()) {
              if (n === node) continue;
              if (oldPos < i && pos > oldPos && pos <= i) {
                positionMap.set(n, pos - 1);
              } else if (oldPos > i && pos >= i && pos < oldPos) {
                positionMap.set(n, pos + 1);
              }
            }
          }
        }
      }
      
      container._jurisNodeKeys = newMap;
    };
    
    if (hasAsync) {
      results.forEach((r, idx) => {
        if (_isPromise(r)) {
          r.then(resolved => {
            results[idx] = resolved;
            reorderChildren();
          });
        }
      });
    }
    
    reorderChildren();
  }

  _isActiveComponentNode(node) {
    for (let [cKey, meta] of this._componentMap.entries()) {
      if (this._activeComponents.has(meta.name)) {
        if (meta.el === node || (meta.el?.contains && meta.el.contains(node))) return true;
      }
    }
    return false;
  }

  _deepCleanupNode(node, pRId) {
    if (!node) return;
    let nodesToCleanup = new Set();
    let collectNodes = (n) => {
      if (!n) return;
      nodesToCleanup.add(n);
      if (n.childNodes) {
        for (let i = 0; i < n.childNodes.length; i++) {
          collectNodes(n.childNodes[i]);
        }
      }
    };
    collectNodes(node);
    if (nodesToCleanup.size === 0) return;
    let toCleanup = [];
    for (let [id, reactive] of this._stateManager._reactiveNodes.entries()) {
      if (reactive.type === _RENDER) continue;
      if (nodesToCleanup.has(reactive.el) || nodesToCleanup.has(reactive.node)) {
        toCleanup.push(id);
      }
    }
    for (let id of toCleanup) {
      this._stateManager.cleanup(id);
    }
    for (let n of nodesToCleanup) {
      if (n._jurisEventListeners) {
        n._jurisEventListeners.forEach(({eventName, handler}) => 
          this._renderer._removeEventListener(n, eventName, handler)
        );
        delete n._jurisEventListeners;
      }
    }
  }

  _setMetaElement(meta, start, end=null, type=null) {
    meta.el = start;
    if (end) meta.endMarker = end;
    if(type) meta.type = type;
  }

  _updateComponentRender(rId, renderResult) {
    let reactive = this._stateManager._reactiveNodes.get(rId);
    if (!reactive) return;
    let meta = this._componentMap.get(reactive.cKey);
    if (!meta) return;
    
    if (this._checkAndTrackPromise(renderResult)) {
      renderResult.then(resolved => this._processResolvedRenderResult(reactive, meta, resolved))
        .catch(err => console.error(' Async render error:', err));
      return;
    }
    this._processResolvedRenderResult(reactive, meta, renderResult);
  }

  _processResolvedRenderResult(reactive, meta, renderResult) {
    let rId = 'reactive_render_' + reactive.cKey;
    
    // Check for cleanup signal FIRST
    if (renderResult === 'cleanup') {
      this._cleanupComponent(reactive.cKey, meta, reactive);
      return;
    }
    
    // Clean up existing reactive nodes in container
    if (meta.el) {
      this._cleanupReactiveNodesInContainer(meta.el, rId);
    }
    if (_isNull(renderResult)) {
      if (meta.type === 'null') return;
      
      if (meta.type === 'primitive' || meta.type === 'array') {
        this._renderer._removeRange(meta.el, meta.endMarker);
      } else if (meta.type === 'el' && meta.el?.parentNode) {
        let [start, end] = this._renderer._createComments([`start:${reactive.cKey}`, `end:${reactive.cKey}`]);
        this._renderer._insertBefore(meta.el.parentNode, start, meta.el);
        this._renderer._insertBefore(meta.el.parentNode, end, meta.el.nextSibling);
        this._renderer._removeChild(meta.el.parentNode, meta.el);
        this._setMetaElement(meta, start, end, 'null');
      }
      return;
    }
    let processedResult = _isFn(renderResult) ? renderResult() : renderResult;
    if (_isPrimitive(processedResult)) {
      if (meta.type === 'primitive' || meta.type === 'null') {
        if (meta.type === 'null' && !this._stateManager._subscriptions.has(rId)) {
          this._stateManager._subscriptions.set(rId, new Set());
        }
        this._updatePrimitive(meta, String(processedResult));
        meta.type = 'primitive';
      }
      if (reactive.hooks?.onUpdate) reactive.hooks.onUpdate();
      return;
    }
    if (_isArr(processedResult)) {
      if (meta.type === 'array' || meta.type === 'null') {
        if (meta.type === 'null' && !this._stateManager._subscriptions.has(rId)) {
          this._stateManager._subscriptions.set(rId, new Set());
        }
        this._updateArray(meta, processedResult);
        meta.type = 'array';
      }
      if (reactive.hooks?.onUpdate) reactive.hooks.onUpdate();
      return;
    }
    let result = this._processNode(processedResult, false, reactive.cKey, rId);  
    let updateElement = (newElement) => {
      if (!newElement) return;
      if (meta.type === 'null' && !this._stateManager._subscriptions.has(rId)) {
        this._stateManager._subscriptions.set(rId, new Set());
      }    
      if (meta.type === 'null' && meta.el?.parentNode) {
        let parent = meta.el.parentNode;
        this._renderer._insertBefore(parent, newElement, meta.endMarker);
        this._renderer._removeChild(parent, [meta.el, meta.endMarker]);
        this._setMetaElement(meta, newElement, null, 'el');
      } else if (meta.el?.parentNode) {
        this._cleanupElementReactives(meta.el);
        if (reactive.api) this._attachApiToElement(newElement, reactive.api, meta.name);
        this._renderer._replaceElement(meta.el, newElement);
        this._setMetaElement(meta, newElement, null, 'el');
      }    
      if (reactive.hooks?.onUpdate) reactive.hooks.onUpdate();
    };  
    if (_isPromise(result)) {
      result.then(updateElement);
    } else {
      updateElement(result);
    }
  }

  _cleanupElementReactives(el) {
    if (!el) return;    
    let toDelete = [];
    for (let [id, reactive] of this._stateManager._reactiveNodes.entries()) {
      if (reactive.type === _RENDER) continue;
      let reactiveNode = reactive.node || reactive.el;
      if (reactiveNode === el || this._renderer._isNodeInside(reactiveNode, el)) toDelete.push(id);
    }
    toDelete.forEach(id => this._stateManager.cleanup(id));
    this._renderer._cleanupEventListeners(el);
  }

  _updatePrimitive(meta, text) {
    this._renderer._removeRange(meta.el, meta.endMarker);
    this._renderer._insertBeforeMarker(meta.el.parentNode, [this._renderer._createTextNode(text)], meta.endMarker);
  }

  _updateArray(meta, items) {
    this._renderer._removeRange(meta.el, meta.endMarker);    
    let elements = [];    
    for (let i = 0; i < items.length; i++) {
      let item = items[i];
      if (_isPrimitive(item)) {
        elements[i] = this._renderer._createTextNode(String(item));
      } else if (_isFn(item)) {
        let processResult = this._processChildNode(item);
        if (this._checkAndTrackPromise(processResult)) {
          // DEDUPLICATED: Use consolidated handler
          elements[i] = this._handleAsyncChildReplacement(processResult, i);
        } else {
          elements[i] = processResult;
        }
      } else if (_isBool(item) || _isNull(item)) {
        elements[i] = null;
      } else {
        let processResult = this._processNode(item);
        if (this._checkAndTrackPromise(processResult)) {
          // DEDUPLICATED: Use consolidated handler
          elements[i] = this._handleAsyncChildReplacement(processResult, i);
        } else {
          elements[i] = processResult;
        }
      }
    }    
    this._renderer._insertBeforeMarker(meta.el.parentNode, elements, meta.endMarker);
  }

  createContext(cKey) {
    let localStateKey = `__local_${cKey}`;
    if (!this._stateManager.states[localStateKey]) {
      this._stateManager.states[localStateKey] = {};
    }    
    let localStateCounter = 0; 
    let context = {
      ...this._baseContext,
      ...this._services,
      ...(this._headlessManager ? this._headlessManager.getAllAPIs() : {}),
      effect: (fn) => {
        let effectId = this._stateManager.effect(fn, (id, execute) => {
          execute();
          let effectNode = this._stateManager._reactiveNodes.get(id);
          if (effectNode) effectNode.cKey = cKey;
        });
        return effectId;
      },
      newState: (initialValue) => {
        let stateId = localStateCounter++;
        let fullKey = `${localStateKey}.${stateId}`;        
        if (!this._stateManager.states[localStateKey]) {
          this._stateManager.states[localStateKey] = {};
        }
        if (this._stateManager.states[localStateKey][stateId] === undefined) {
          this._stateManager.states[localStateKey][stateId] = initialValue;
        }        
        let getter = () => {
          let value = this.getState(fullKey);
          return value !== undefined ? value : initialValue;
        };
        let setter = (value) => {
          if (_isFn(value)) {
            this.setState(fullKey, value(getter()));
          } else {
            this.setState(fullKey, value);
          }
        };
        return [getter, setter];
      }
    };
    return context;
  }

  registerComponent(name, fn, options = {}) {
    if (!_isStr(name) || !name || !_isFn(fn)) {
      console.error(' Component name must be a non-empty string and fn must be a function');
      return false;
    }
    this._components[name] = fn;
    if (options.active === true) this._activeComponents.add(name);
    return true;
  }

  registerActiveComponent(name, fn, options={}){
    this._components[name] = fn;
    this._activeComponents.add(name);
  }
  
  arm(target, handlerFn) {    
    if (_isNull(handlerFn) || !_isFn(handlerFn)) {
      console.warn(' arm() called without valid handler function');
      return null;
    }    
    let context = this.createContext('arm_' + Math.random().toString(36).substr(2, 9));
    let handlers = handlerFn(context);
    let listeners = [];    
    for (let eventName in handlers) {
      let actualEventName = eventName.startsWith('on-') || eventName.startsWith('on:') 
        ? eventName.slice(3)
        : eventName.startsWith('on') ? eventName.slice(2).toLowerCase() : eventName;      
      let handler = handlers[eventName];
      if (_isFn(handler)) {
        this._renderer._addEventListener(target, actualEventName, handler);
        listeners.push({original: eventName, actual: actualEventName, handler});
      }
    }
    let jurisInstance = this;
    let instance = {
      events: listeners.map(e => ({name: e.original, actualEvent: e.actual, handler: e._handler})),      
      trigger(eventName, eventData = {}) {
        let listener = listeners.find(e => e.original === eventName || e.actual === eventName);
        if (listener) {
          let mockEvent = {type: listener.actual, target, preventDefault: () => {}, stopPropagation: () => {}, ...eventData};
          listener.handler.call(target, mockEvent);
          return true;
        }
        return false;
      },      
      cleanup() {
        listeners.forEach(({actual, handler}) => jurisInstance._renderer._removeEventListener(target, actual, handler));
        jurisInstance._armedElements.delete(target);
        return true;
      }
    };    
    this._armedElements.set(target, {listeners, context, instance});
    return instance;
  }

  z(layer = 'default') {
    if (!this._zStacks.has(layer)) this._zStacks.set(layer, []);
    let stack = this._zStacks.get(layer);
    let idx = this._zIndex++;
    stack.push(idx);
    return {
      value: idx,
      pop: () => {
        let i = stack.indexOf(idx);
        if (i > -1) stack.splice(i, 1);
      }
    };
  }

  topZ(layer = 'default') {
    let stack = this._zStacks.get(layer);
    return stack?.length ? stack[stack.length - 1] : this._zIndex;
  }

  modal(opts) {
    return new Promise(resolve => {
      let id = 'modal_' + Math.random().toString(36).substr(2, 9);
      let zh = this.z(opts.layer || 'modals');
      if (!this._stateManager.states._modals) this._stateManager.states._modals = {};      
      this.setState(`_modals`, {
        [id]: {
          visible: true,
          zIndex: zh.value,
          width: opts.width,
          dismissable: opts.dismissable !== false,
          component: opts.component,
          onClose: (result) => {
            this.setState(`_modals.${id}.visible`, false);
            zh.pop();
            setTimeout(() => {
              this.setState(`_modals.${id}`, null);
            }, 300);
            resolve(result);
          }
        }
      });
    });
  }

  subscribe(key, callback, options = {}) {
    let subscriptionId = 'subscription_' + Math.random().toString(36).substr(2, 9);    
    this._stateManager._subscriptions.set(subscriptionId, new Set([key]));
    this._stateManager._trie.subscribe(key, subscriptionId);    
    if (!this._subscriptionCallbacks) {
      this._subscriptionCallbacks = new Map();
    }
    this._subscriptionCallbacks.set(subscriptionId, callback);    
    if (options.immediate !== false) {
      let currentValue = this.getState(key, undefined, false);
      callback(currentValue, undefined);
    }    
    return () => {
      this._stateManager._trie._unsubscribe(key, subscriptionId);
      this._subscriptionCallbacks.delete(subscriptionId);
      this._stateManager._subscriptions.delete(subscriptionId);
    };
  }

  _attachApiToElement(el, api, name) {
    if (!el || !api || !_isObj(api)) return;
    Object.keys(api).forEach(k => { el[k] = api[k]; });
    if (name) this._componentApiMap.set(name, api);
  }

  //DEVTOOLS--START
  _markComponentElement(el, cKey, name) {
    if (!el || el.nodeType !== 1) return;
    el.setAttribute('data-jcomp', cKey);
    if (this.__DEV__) {
      el._jurisDevCompKey = cKey;
      el._jurisDevCompName = name;
      if (this.__devtools?.componentTree) {
        let meta = this.__devtools.componentTree.get(cKey);
        if (meta) meta.el = el;
      }
    }
  }
  //DEVTOOLS--END

  _collectSSRComponents(root) {
    let elements = root.querySelectorAll('[data-jcomp]');
    this._pendingHydration.clear();
    
    elements.forEach(el => {
      let cKey = el.getAttribute('data-jcomp');
      this._ssrComponentMap.set(cKey, el);
      this._pendingHydration.add(cKey);
    });
  }

  render(container = '#app', vdom = null) {
    this._rootEl = _isStr(container) ? d.querySelector(container) : container;
    if (!this._rootEl) return;
    if (this.__SSR_RENDERED__) {
      this._hydrateMode = true;
      this._ssrComponentMap = new Map();
      this._pendingHydration = new Set();
      this._collectSSRComponents(this._rootEl);      
      let layout = vdom !== null ? vdom : this.layout;
      let result = this._buildTree(layout);      
      const setupAndHydrate = () => {
        this._hydrateVisibleComponents();
        this._setupHydrationObserver();
        requestAnimationFrame(() => this._checkPendingConnected());
      }
      if (_isPromise(result)) {
        result.then(setupAndHydrate);
      } else {
        setupAndHydrate();
      }     
      return;
    }    
    this._rootEl.innerHTML = '';
    let layout = vdom !== null ? vdom : this.layout;
    let result = this._buildTree(layout);    
    if (_isPromise(result)) {
      result.then(frag => this._renderer._appendChildren(this._rootEl, frag));
    } else {
      this._renderer._appendChildren(this._rootEl, result);
    }
    requestAnimationFrame(() => this._checkPendingConnected());
  }

  _hydrateVisibleComponents() {
    if (!this._ssrComponentMap || this._ssrComponentMap.size === 0) return;
    let hydrated = 0;
    let hydratedKeys = [];   
    for (let cKey of this._pendingHydration) {
      let el = this._ssrComponentMap.get(cKey);
      if (el && this._isInViewport(el) && !el._jurisHydrated) {
        this._hydrateComponent(cKey, el);
        hydratedKeys.push(cKey);
        hydrated++;
      } else if (el) {
        //not in view port
      }
    }
    hydratedKeys.forEach(key => this._pendingHydration.delete(key));
  }

  _isInViewport(el) {
    if (!el || !el.getBoundingClientRect) return false;    
    let rect = el.getBoundingClientRect();
    let windowHeight = w.innerHeight || d.documentElement.clientHeight;
    let windowWidth = w.innerWidth || d.documentElement.clientWidth;
    let buffer = 200;    
    return (
      rect.top <= windowHeight + buffer &&
      rect.bottom >= -buffer &&
      rect.left <= windowWidth + buffer &&
      rect.right >= -buffer
    );
  }

  _setupHydrationObserver() {
    let pendingComponents = [];
    for (let cKey of this._pendingHydration) {
      let el = this._ssrComponentMap.get(cKey);
      if (el && !el._jurisHydrated) {
        pendingComponents.push({cKey, el});
      }
    }    
    if (pendingComponents.length === 0) {
      this._cleanupHydration();
      return;
    }    
    if (!w.IntersectionObserver) {
      console.warn('IntersectionObserver not available, hydrating all components');
      for (let {cKey, el} of pendingComponents) {
        this._hydrateComponent(cKey, el);
        this._pendingHydration.delete(cKey);
      }
      this._cleanupHydration();
      return;
    }    
    this._hydrationObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            let el = entry.target;
            let cKey = el.getAttribute('data-jcomp');          
            if (cKey && !el._jurisHydrated && this._pendingHydration.has(cKey)) {
              this._hydrateComponent(cKey, el);
              this._pendingHydration.delete(cKey);
              this._hydrationObserver.unobserve(el);
            }
          }
        });
        if (this._pendingHydration.size === 0) {
          this._cleanupHydration();
        }
      },
      {
        rootMargin: '200px',
        threshold: 0.01
      }
    );
    for (let {cKey, el} of pendingComponents) {
      this._hydrationObserver.observe(el);
    }
  }

  _hydrateComponent(cKey, el) {
    if (el._jurisHydrated) return;
    el._jurisHydrated = true;
    let meta = this._componentMap.get(cKey);
    if (!meta) {
      console.warn(`No metadata found for component: ${cKey}`);
      return;
    }
    let rId = 'reactive_render_' + cKey;
    let reactive = this._stateManager._reactiveNodes.get(rId);
    
    if (!reactive) {
      console.warn(`No reactive node found for component: ${cKey}`);
      return;
    }
    let wasHydrating = this._hydrateMode;
    this._hydrateMode = false;
    const replaceWithHydrated = (resolved) => {
      this._replaceWithHydratedElement(cKey, el, resolved, reactive);
    }
    try {
      let renderResult = reactive.fn();    
      if (_isPromise(renderResult)) {
        renderResult.then(replaceWithHydrated);
      } else {
        replaceWithHydrated(renderResult);
      }
    } catch (error) {
      console.error(`Error hydrating component ${cKey}:`, error);
    } finally {
      this._hydrateMode = wasHydrating;
    }
    if (reactive?.hooks?.onMount) {
      setTimeout(() => {
        if (reactive.hooks.onMount) {
          reactive.hooks.onMount();
        }
      }, 0);
    }
  }

  _replaceAndMarkHydrated(newElement, oldElement, cKey) {
    if (newElement && oldElement.parentNode) {
      newElement.setAttribute('data-jcomp', cKey);
      this._renderer._replaceElement(oldElement, newElement);      
      let meta = this._componentMap.get(cKey);
      if (meta) {
        meta.el = newElement;
      }      
      newElement._jurisHydrated = true;
      this._ssrComponentMap.set(cKey, newElement);
    }
  }

  _replaceWithHydratedElement(cKey, oldElement, renderResult, reactive) {
    let processedResult = _isFn(renderResult) ? renderResult() : renderResult;
    
    if (_isNull(processedResult) || _isPrimitive(processedResult) || _isArr(processedResult)) {
      return;
    }
    let newElement = this._processNode(processedResult, false, cKey, 'reactive_render_' + cKey);
    if (_isPromise(newElement)) {
      this._replaceAndMarkHydrated(newElement, oldElement, cKey);
    } else if (newElement && oldElement.parentNode) {
     this._replaceAndMarkHydrated(newElement, oldElement, cKey);
    }
  }

  _attachComponentEvents(cKey, rootElement) {
    let rId = 'reactive_render_' + cKey;
    this._attachEventsToTree(rootElement, cKey, rId);
  }

  _attachEventsToTree(el, cKey, pRId) {
    if (!el || el.nodeType !== 1) return;
    for (let [id, reactive] of this._stateManager._reactiveNodes.entries()) {
      if (reactive.el === el && reactive.cKey === cKey) {
        if (el._jurisEventHandlers) {
          for (let [eventName, handler] of Object.entries(el._jurisEventHandlers)) {
            this._renderer._addEventListener(el, eventName, handler);
          }
        }
      }
    }
    if (el.childNodes) {
      for (let i = 0; i < el.childNodes.length; i++) {
        let child = el.childNodes[i];
        if (child.nodeType === 1 && child.getAttribute('data-jcomp')) {
          continue;
        }
        this._attachEventsToTree(child, cKey, pRId);
      }
    }
  }

  _cleanupHydration() {
    if (this._hydrationObserver) {
      this._hydrationObserver.disconnect();
      this._hydrationObserver = null;
    }
    this._hydrateMode = false;
    this._ssrComponentMap.clear();
    this._pendingHydration.clear();
  }

  _buildTree(layout) {
    layout = _shoudBeArray(layout);    
    let hasAsync = false;
    let elements = [];    
    for (let i = 0; i < layout.length; i++) {
      let item = layout[i];
      let processResult = this._processNode(item);      
      if (_isPromise(processResult)) {
        hasAsync = true;
        elements[i] = processResult;
      } else {
        elements[i] = processResult;
      }
    }
    
    let buildFragment = (resolvedElements) => {
      let frag = this._renderer._createFragment();
      this._renderer._appendChildren(frag, resolvedElements);
      return frag;
    };
    
    if (!hasAsync) {
      return buildFragment(elements);
    } else {
      return Promise.all(elements.map(e => _isPromise(e) ? e : Promise.resolve(e)))
        .then(buildFragment);
    }
  }

  _processNode(node, isSvgC = false, cKey = null, pRId = null) {
    if (!_isObj(node)) return null;
    let entries = Object.entries(node);
    if (!entries.length) return null;    
    let [key, props] = entries[0];
    if (this._components[key]) {
      return this._buildComponent(key, props, cKey ? ('reactive_render_' + cKey) : pRId);
    }
    let isSvg = isSvgC || this._renderer.svgTags.has(key);
    try {
      return this._buildElement({tag: key, props}, isSvg, cKey, props?.key, pRId);
    } catch (error) {
      console.error('Error processing node:', {tag: key, props},error);
      return this._buildElement(this._createErrorVDOM(error, key));
    }
  }

  _buildComponent(name, props, pRId = null) {
    let userKey = props?.__key ?? props?.key;
    let cKey = userKey !== undefined 
      ? `${name}:${userKey}_${this._componentCounter++}`
      : `${name}_${this._hashProps(props)}_${this._componentCounter++}`;    
    let context = this.createContext(cKey);
    let componentError = null;
    let errorHandler = (message, source, lineno, colno, error) => {
      componentError = {message, source, lineno, colno, error};
      return true;
    };    
    let previousHandler = w.onerror;
    w.onerror = errorHandler;    
    let result;
    try {
      result = this._components[name](props, context);
    } catch (err) {
      componentError = {
        msg: err.message,
        src: 'component',
        ln: 0,
        col: 0,
        err
      };
    } finally {
      w.onerror = previousHandler;
    }    
    //DEVTOOLS--START
    if (this.__DEV__) {
      this.__devtools.componentTree.set(cKey, {
        name, 
        cKey,
        vdom:result,
        parent: pRId, 
        props: props || {},
        propKeys: Object.keys(props || {}),
        mountTime: Date.now(), 
        isRoot: !pRId,
        hasRender: !!result?.render || _isFn(result),
        hasHooks: !!result?.hooks,
        hasApi: !!result?.api,
        hookNames: result?.hooks ? Object.keys(result.hooks) : [],
        apiMethods: result?.api ? Object.keys(result.api) : [],
        api: result?.api || null
      });
    }    
    //DEVTOOLS--END
    if (componentError) {
      return this._renderComponentError(componentError, cKey, name, props, pRId);
    }
    if (this._checkAndTrackPromise(result)) {
      return result.then(resolvedResult => {
        let renderFn = resolvedResult?.render || (_isFn(resolvedResult) ? resolvedResult : () => resolvedResult);
        let rId = 'reactive_render_' + cKey;
        this._stateManager._subscriptions.set(rId, new Set());
        let wrappedRender = () => {
          let prev = this._stateManager._activeReactive;
          this._stateManager._activeReactive = rId;
          try {
            return renderFn();
          } catch (error) {
            console.error(' Render error:', error);
            return this._createErrorVDOM(error, name);
          } finally {
            this._stateManager._activeReactive = prev;
          }
        };
        this._stateManager._reactiveNodes.set(rId, {
          type: _RENDER, cKey, fn: wrappedRender, hooks: resolvedResult?.hooks, api: resolvedResult?.api, pRId
        });
        if (resolvedResult?.api) this._componentApiMap.set(name, resolvedResult.api);
        if (resolvedResult?.hooks?.onMount) setTimeout(() => resolvedResult.hooks.onMount(), 0);
        let renderOutput = wrappedRender();
        if (this._checkAndTrackPromise(renderOutput)) {
          return renderOutput.then(resolved => this._buildComponentFromResult(resolved, cKey, name, props, resolvedResult, pRId));
        }
        return this._buildComponentFromResult(renderOutput, cKey, name, props, resolvedResult, pRId);
      });
    }
    let renderFn = result?.render || (_isFn(result) ? result : () => result);
    let rId = 'reactive_render_' + cKey;
    this._stateManager._subscriptions.set(rId, new Set());
    let wrappedRender = () => {
      let prev = this._stateManager._activeReactive;
      this._stateManager._activeReactive = rId;
      try {
        return renderFn();
      } catch (error) {
        console.error(' Render error:', error);
        return this._createErrorVDOM(error, name);
      } finally {
        this._stateManager._activeReactive = prev;
      }
    };
    this._stateManager._reactiveNodes.set(rId, {
      type: _RENDER, cKey, fn: wrappedRender, hooks: result?.hooks, api: result?.api, pRId
    });
    if (result?.api) this._componentApiMap.set(name, result.api);
    if (result?.hooks?.onMount) setTimeout(() => result.hooks.onMount(), 0);
    let renderOutput = wrappedRender();
    if (this._checkAndTrackPromise(renderOutput)) {
      let currentNode = this._renderer._createComments(`async-component:${cKey}`)[0];
      let spinnerTimeout = null;
      let indicatorVdom = this._getIndicator(name, props?.id);
      if (indicatorVdom && this.indicatorDelay > 0) {
        spinnerTimeout = setTimeout(() => {
          if (currentNode.parentNode) {
            let spinnerEl = this._processNode(indicatorVdom);
            if (spinnerEl && currentNode.parentNode) {
              this._renderer._replaceElement(currentNode, spinnerEl);
              currentNode = spinnerEl;
            }
          }
        }, this.indicatorDelay);
      }   
      renderOutput.then(resolved => {
        if (spinnerTimeout) clearTimeout(spinnerTimeout);        
        let componentElement = this._buildComponentFromResult(resolved, cKey, name, props, result, pRId);
        if (_isPromise(componentElement)) {
          componentElement.then(el => {
            if (el && currentNode?.parentNode) {
              this._renderer._replaceElement(currentNode, el);
            }
          });
        } else if (componentElement && currentNode?.parentNode) {
          this._renderer._replaceElement(currentNode, componentElement);
        }
      }).catch(err => {
        if (spinnerTimeout) clearTimeout(spinnerTimeout);
        console.error(' Async render error:', err);
        if (currentNode?.parentNode) {
          let errorEl = this._renderComponentError(
            { message: err.message, source: 'async-render', lineno: 0, colno: 0, error: err },
            cKey, name, props, pRId
          );
          this._renderer._replaceElement(currentNode, errorEl);
        }
      });
      return currentNode;
    }
    return this._buildComponentFromResult(renderOutput, cKey, name, props, result, pRId);
  }

  _renderComponentError(error, cKey, name, props, pRId) {
    let errorElement = this._renderer._createElement('div');
    errorElement.style.cssText = 'padding:12px;margin:8px;border:2px solid #ef4444;border-radius:4px;background:#fee;color:#991b1b;font-family:monospace;font-size:12px;';
    errorElement.innerHTML = `
      <strong>Error in component "${name}"</strong><br/>
      ${error.message}<br/>
      <small>${error.source}:${error.lineno}:${error.colno}</small>
    `;
    this._componentMap.set(cKey, {name, props, el: errorElement, type: 'error', pRId});
    return errorElement;
  }

  _hashProps(props) {
    if (!props || typeof props !== 'object' || Object.keys(props).length === 0) return '0';    
    let keys = Object.keys(props).filter(k => k !== '__key' && k !== 'key').sort();
    let str = keys.map(k => {
      let v = props[k];
      if (_isPrimitive(v)) return `${k}:${v}`;
      if (_isArr(v)) return `${k}:arr${v.length}`;
      if (_isObj(v)) return `${k}:obj`;
      return k;
    }).join('|');    
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).slice(0, 6);
  }
  _finalizeComponentElement(el, cKey, name, props, result, pRId) {
    if (result?.api && el) {
      this._attachApiToElement(el, result.api, name);
    }
    this._markComponentElement(el, cKey, name);
    this._componentMap.set(cKey, {name, props, el, type: 'el', pRId});
    return el;
  }

  _buildComponentFromResult(finalResult, cKey, name, props, result, pRId) {
    if (this._hydrateMode && this._ssrComponentMap.has(cKey)) {
      let ssrElement = this._ssrComponentMap.get(cKey);      
      if (result?.api) this._attachApiToElement(ssrElement, result.api, name);  
      this._markComponentElement(ssrElement, cKey, name);
      this._componentMap.set(cKey, {name, props, el: ssrElement, type: 'el', pRId});
      return ssrElement;
    }
    if (_isNull(finalResult)) {
      let [start, end] = this._renderer._createComments([`start:${cKey}`, `end:${cKey}`]);
      let frag = this._renderer._createFragment();
      this._renderer._appendChildren(frag, [start, end]);
      this._componentMap.set(cKey, {name, props, el: start, endMarker: end, type: 'null', pRId});
      return frag;
    }
    let processedResult = _isFn(finalResult) ? finalResult() : finalResult;
    if (_isPrimitive(processedResult)) {
      return this._createPrimitiveFragment(cKey, String(processedResult), name, props, pRId);
    }
    if (_isArr(processedResult)) {
      return this._createArrayFragment(cKey, processedResult, name, props, pRId);
    }
    let elementResult = this._processNode(processedResult, false, cKey, 'reactive_render_' + cKey);
    if (_isPromise(elementResult)) {
      return elementResult.then(el => {
        return this._finalizeComponentElement(el, cKey, name, props, result, pRId);
      });
    }    
    return this._finalizeComponentElement(elementResult, cKey, name, props, result, pRId);
  }

  _createPrimitiveFragment(cKey, text, name, props, pRId = null) {
    let [start, end] = this._renderer._createComments([`start:${cKey}`, `end:${cKey}`]);
    let frag = this._renderer._createFragment();
    this._renderer._appendChildren(frag, [start, this._renderer._createTextNode(text), end]);
    this._componentMap.set(cKey, {name, props, el: start, endMarker: end, type: 'primitive', pRId});
    return frag;
  }

  _createArrayFragment(cKey, items, name, props, pRId = null) {
    let [start, end] = this._renderer._createComments([`start:${cKey}`, `end:${cKey}`]);
    let elements = [];
    for (let i = 0; i < items.length; i++) {
      let item = items[i];      
      if (_isPrimitive(item)) {
        elements[i] = this._renderer._createTextNode(String(item));
      } else if (_isFn(item)) {
        let processResult = this._processChildNode(item, false, cKey, 'reactive_render_' + cKey);
        if (this._checkAndTrackPromise(processResult)) {
          elements[i] = this._handleAsyncChildReplacement(processResult, i, cKey, 'reactive_render_' + cKey);
        } else {
          elements[i] = processResult;
        }
      } else if (_isBool(item) || _isNull(item)) {
        elements[i] = null;
      } else {
        let processResult = this._processNode(item, false, cKey, 'reactive_render_' + cKey);
        if (this._checkAndTrackPromise(processResult)) {
          elements[i] = this._handleAsyncChildReplacement(processResult, i, cKey, 'reactive_render_' + cKey);
        } else {
          elements[i] = processResult;
        }
      }
    }    
    let frag = this._renderer._createFragment();
    this._renderer._appendChildren(frag, [start, ...elements, end]);
    this._componentMap.set(cKey, {name, props, el: start, endMarker: end, type: 'array', pRId});
    return frag;
  }

  _buildElement(nodeOrObj, isSvgC = false, cKey = null, itemKey = null, pRId = null) {
    if(!_isObj(nodeOrObj)) return null;
    let node = nodeOrObj.tag ? nodeOrObj : {tag: Object.keys(nodeOrObj)[0], props: Object.values(nodeOrObj)[0]};
    let {tag, props} = node;
    
    if (_isNull(itemKey) && props?.key !== undefined) itemKey = props.key;
    
    let isSvg = isSvgC || this._renderer.svgTags.has(tag);
    let el = this._renderer._createElement(tag, isSvg);
    if(el.constructor.name === 'HTMLUnknownElement' && this.__DEV__) {
      console.warn(`[Juris DOMRenderer] Warning: Created unknown el <${tag}>. Check if the tag name is correct or if a custom el needs to be defined.`,el);
    }
    if (typeof el === 'object' || typeof SVGElement === 'object') {
      el._jurisTag = tag;
    }
    if (!_isNull(itemKey)) el._jurisKey = itemKey;
    
    let hasAsync = false;
    let asyncTasks = [];
    let refCallback = props?.ref || null;
    
    let createReactive = (fn) => {
      let rId = 'reactive_' + tag + (this._stateManager._reactiveCounter++);
      this._stateManager._subscriptions.set(rId, new Set());
      
      let wFn = () => {
        let prevReactive = this._stateManager._activeReactive;
        this._stateManager._activeReactive = rId;
        try {
          return fn(el);
        } finally {
          this._stateManager._activeReactive = prevReactive;
        }
      };
      
      return {rId, wFn};
    };

    let handleReactiveProp = (type, valueFn, applyFn, nodeData = {}) => {
      let {rId, wFn} = createReactive(valueFn);
      let result = wFn();
      
      this._stateManager._reactiveNodes.set(rId, {type, fn: wFn, cKey, pRId, ...nodeData});
      
      if (this._checkAndTrackPromise(result)) {
        hasAsync = true;
        asyncTasks.push(result.then(resolved => applyFn(resolved)));
        return; 
      }
      
      applyFn(result);
    };

    let appendChildren = (childArray, pRId = null) => {
      let nodes = [];
      let childrenHasAsync = false;
      
      for (let i = 0; i < childArray.length; i++) {
        let child = childArray[i];
        let processResult = this._processChildNode(child, isSvg, cKey, pRId);
        
        if (this._checkAndTrackPromise(processResult)) {
          childrenHasAsync = true;
          let indicatorVdom = this._getIndicator(null, props?.id);
          let placeholder = indicatorVdom 
            ? this._processNode(indicatorVdom)
            : this._renderer._createLoadingPlaceholder(i);
          
          nodes[i] = placeholder;
          
          processResult.then(node => {
            if (placeholder.parentNode && node) {
              this._renderer._replaceElement(placeholder, node);
            }
          });
          
          continue;
        }
        
        nodes[i] = processResult;
      }
      
      let frag = this._renderer._createFragment();
      nodes.forEach(node => { if (node) this._renderer._appendChildren(frag, node); });
      this._renderer._appendChildren(el, frag);
    };
    
    let specialKeys = {ref: 1, onMount: 1, key: 1, children: 1, text: 1, innerHTML: 1, style: 1, dataset: 1, classList: 1};
    
    for (let key in props) {
      let value = props[key];
      
      if (specialKeys[key]) {
        if (key === _TEXT) {
          if (_isFn(value)) {
            let textNode = this._renderer._createTextNode('');
            this._renderer._appendChildren(el, textNode);
            handleReactiveProp(_TEXT, value, text => textNode.textContent = String(text), {node: textNode});
          } else {
            el.textContent = value;
          }
          continue;
        }
        
        if (key === 'children') {
          if (_isFn(value)) {
            let {rId, wFn} = createReactive(value);
            let children = wFn();
            this._stateManager._reactiveNodes.set(rId, {type: 'children', el: el, fn: wFn, cKey, pRId});
            
            if (_isPromise(children)) {
              hasAsync = true;
              let indicatorVdom = this._getIndicator(null, props?.id);
              let placeholder = indicatorVdom
                ? this._handlePromise(children, el, el, null, props?.id)
                : this._handlePromise(children, el, el);
              this._renderer._appendChildren(el, placeholder);
            } else {
              appendChildren(_shoudBeArray(children), rId);
            }
          } else {
            appendChildren(_shoudBeArray(value), pRId);
          }
          continue;
        }
        
        if (key === 'innerHTML') {
          if (_isFn(value)) {
            handleReactiveProp('innerHTML', value, html => el.innerHTML = html, {el: el});
          } else {
            el.innerHTML = value;
          }
          continue;
        }
        
        if (key === 'style') {
          if (_isFn(value)) {
            handleReactiveProp('style', value, styles => Object.assign(el.style, styles), {el: el});
          } else if (_isObj(value)) {
            let hasReactiveFunctions = Object.values(value).some(_isFn);
            
            if (hasReactiveFunctions) {
              handleReactiveProp(
                'style',
                () => {
                  let computedStyles = {};
                  for (let styleKey in value) {
                    computedStyles[styleKey] = _isFn(value[styleKey]) ? value[styleKey]() : value[styleKey];
                  }
                  return computedStyles;
                },
                styles => Object.assign(el.style, styles),
                {el: el}
              );
            } else {
              Object.assign(el.style, value);
            }
          }
          continue;
        }
        
        if (key === 'classList') {
          value = _shoudBeArray(value);          
          let hasReactiveFunctions = value.some(_isFn);          
          if (hasReactiveFunctions) {
            let prvCls = new Set();
            let {rId, wFn} = createReactive(() => {
              let computedClasses = [];
              for (let i = 0; i < value.length; i++) {
                let classItem = value[i];
                if (_isFn(classItem)) {
                  let result = classItem();
                  if (result) computedClasses.push(result);
                } else if (classItem) {
                  computedClasses.push(classItem);
                }
              }
              return computedClasses.filter(c => c);
            });
            let currentClasses = wFn();
            currentClasses.forEach(cls => {
              el.classList.add(cls);
              prvCls.add(cls);
            });
            this._stateManager._reactiveNodes.set(rId, {
              type: 'classList',
              fn: wFn,
              el: el,
              cKey,
              pRId,
              prvCls
            });
          } else {
            value.filter(c => c).forEach(cls => el.classList.add(cls));
          }
          continue;
        }
      }

      if (key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110) {
        if (key !== 'onMount') this._handleEvent(el, key, value);
        continue;
      }

      if (_isFn(value)) {
        handleReactiveProp('attr', value, v => {
          let descriptor = Object.getOwnPropertyDescriptor(el, key);
          if (descriptor && descriptor.set) {
            el[key] = value;
          } else {
            this._renderer._setAttribute(el, key, v, isSvg);
          }
        }, {el: el, attrName: key, isSvg});
      } else {
        let descriptor = Object.getOwnPropertyDescriptor(el, key);
        if (descriptor && descriptor.set) {
          el[key] = value;
        } else {
          this._renderer._setAttribute(el, key, value, isSvg);
        }
      }
    }
    
    if (!hasAsync) {
      if (refCallback) refCallback(el);
      return el;
    } else {
      return Promise.all(asyncTasks).then(() => {
        if (refCallback) refCallback(el);
        return el;
      });
    }
  }

  _checkPendingConnected() {
    if (!this._pendingConnected || this._pendingConnected.size === 0) return;    
    let connected = [];    
    for (let el of this._pendingConnected) {
      if (el.isConnected && el._jurisOnConnected) {
        try {
          el._jurisOnConnected(el);
        } catch (error) {
          console.error('Error in onconnected callback:', error);
        }
        connected.push(el);
        delete el._jurisOnConnected;
      }
    }
    connected.forEach(el => this._pendingConnected.delete(el));
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
    if (actualEventName === 'dblclick') el._jurisHasDoubleClick = true;    
    let finalHandler = actualEventName === 'click'
      ? (e) => {
          if (e.detail === 2 && el._jurisHasDoubleClick) return;
          handler(e);
        }
      : handler;
    this._renderer._addEventListener(el, actualEventName, finalHandler);    
    if (!el._jurisEventListeners) el._jurisEventListeners = [];
    el._jurisEventListeners.push({eventName: actualEventName, handler: finalHandler});
  }

  _registerElementReactiveNode(rId, el, wFn, cKey, pRId, value) {
    this._stateManager._reactiveNodes.set(rId, {
      type: 'el',
      node: el,
      fn: wFn,
      cKey,
      pRId,
      isCom: this._isComponent(value)
    });
    return el;
  }

  _handleElementResultRegistration(elementResult, rId, wFn, cKey, pRId, value) {
    if (_isPromise(elementResult)) {
      return elementResult.then(el => {
        return this._registerElementReactiveNode(rId, el, wFn, cKey, pRId, value);
      });
    }
    return this._registerElementReactiveNode(rId, elementResult, wFn, cKey, pRId, value);
  }

  _processChildNode(child, isSvgC = false, cKey = null, pRId = null) {
    if (_isPrimitive(child)) return this._renderer._createTextNode(String(child));
    if (_isBool(child) || _isNull(child)) return this._renderer._createComments('null')[0];    
    let arrayToFragment = (arr) => {
      let frag = this._renderer._createFragment();
      for (let i = 0; i < arr.length; i++) {
        let item = arr[i];
        if (_isNull(item)) continue;
        
        if (_isPrimitive(item) || _isBool(item)) {
          this._renderer._appendChildren(frag, this._renderer._createTextNode(String(item)));
        } else {
          let itemResult = this._processNode(item, isSvgC, cKey, pRId);
          if (_isPromise(itemResult)) {
            let placeholder = this._renderer._createLoadingPlaceholder(i);
            this._renderer._appendChildren(frag, placeholder);
            itemResult.then(node => {
              if (placeholder.parentNode && node) {
                this._renderer._replaceElement(placeholder, node);
              }
            });
          } else if (itemResult) {
            this._renderer._appendChildren(frag, itemResult);
          }
        }
      }
      return frag;
    };
    
    if (_isArr(child)) {
      return arrayToFragment(child);
    }
    
    if (_isFn(child)) {
      let rId = 'reactive_' + (this._stateManager._reactiveCounter++);
      this._stateManager._subscriptions.set(rId, new Set());
      
      let wFn = () => {
        let prevReactive = this._stateManager._activeReactive;
        this._stateManager._activeReactive = rId;
        try {
          return child();
        } finally {
          this._stateManager._activeReactive = prevReactive;
        }
      };
      
      let result = wFn();
      if (this._checkAndTrackPromise(result)) {
        return result.then(resolved => {
          if (_isArr(resolved)) {
            let frag = arrayToFragment(resolved);
            this._stateManager._reactiveNodes.set(rId, {
              type: 'el', node: frag, fn: wFn, cKey, pRId, isCom: false
            });
            return frag;
          }
          
          if (_isNull(resolved)) {
            let placeholder = this._renderer._createComments(_REACTIVE_NULL)[0];
            this._stateManager._reactiveNodes.set(rId, {type: _REACTIVE_NULL, node: placeholder, fn: wFn, cKey, pRId});
            return placeholder;
          }
          if (_isPrimitive(resolved)) {
            let textNode = this._renderer._createTextNode(String(resolved));
            this._stateManager._reactiveNodes.set(rId, {type: _TEXT, node: textNode, fn: wFn, cKey, pRId});
            return textNode;
          }
          if (this._isComponent(resolved) || _isObj(resolved)) {
            let elementResult = this._processNode(resolved, isSvgC, cKey, pRId);
             if (this._checkAndTrackPromise(elementResult)) {
              return elementResult.then(el => {
                return this._registerElementReactiveNode(rId, el, wFn, cKey, pRId, resolved);
              });
            }
            return this._registerElementReactiveNode(rId, elementResult, wFn, cKey, pRId, resolved);
          }
          return this._renderer._createComments('null')[0];
        });
      }
      
      if (_isArr(result)) {
        let frag = arrayToFragment(result);
        this._stateManager._reactiveNodes.set(rId, {
          type: 'el', node: frag, fn: wFn, cKey, pRId, isCom: false
        });
        return frag;
      }
      
      if (_isNull(result)) {
        let placeholder = this._renderer._createComments(_REACTIVE_NULL)[0];
        this._stateManager._reactiveNodes.set(rId, {type: _REACTIVE_NULL, node: placeholder, fn: wFn, cKey, pRId});
        return placeholder;
      }
      if (_isPrimitive(result)) {
        let textNode = this._renderer._createTextNode(String(result));
        this._stateManager._reactiveNodes.set(rId, {type: _TEXT, node: textNode, fn: wFn, cKey, pRId});
        return textNode;
      }
      if (this._isComponent(result) || _isObj(result)) {
        let elementResult = this._processNode(result, isSvgC, cKey, pRId);        
        return this._handleElementResultRegistration(elementResult, rId, wFn, cKey, pRId, result);
      }
      return this._renderer._createComments('null')[0];
    }
    
    return this._processNode(child, isSvgC, cKey, pRId);
  }

  getCM() {
    return this._components;
  }

  objectToElement(vdom) {
    let result = this._buildTree(_shoudBeArray(vdom));    
    if (_isPromise(result)) {
      return result.then(frag => frag.children.length === 1 ? frag.children[0] : frag);
    } else {
      return result.children.length === 1 ? result.children[0] : result;
    }
  }

  //DEVTOOLS--START
  _buildComponentTree() {
    let tree = {};
    for (let [key, meta] of this.__devtools.componentTree.entries()) {
      if (!meta.parent) tree[key] = this._buildTreeNode(key);
    }
    return tree;
  }
  //DEVTOOLS--END

  //DEVTOOLS--START
  _buildTreeNode(cKey) {
    let meta = this.__devtools.componentTree.get(cKey);
    let children = {};
    for (let [childKey, childMeta] of this.__devtools.componentTree.entries()) {
      if (childMeta.parent === `reactive_render_${cKey}`) {
        children[childKey] = this._buildTreeNode(childKey);
      }
    }    
    return {
      name: meta.name,
      props: meta.props,
      propKeys: meta.propKeys,
      vdom:meta.vdom,
      el:meta.el,
      renderCount: meta.renderCount || 0,
      hasRender: meta.hasRender,
      hasHooks: meta.hasHooks,
      hasApi: meta.hasApi,
      hookNames: meta.hookNames,
      apiMethods: meta.apiMethods,
      api: meta.api,
      children: Object.keys(children).length ? children : undefined
    };
  }
  //DEVTOOLS--END

  //DEVTOOLS--START
  _buildDOMTree(rootElement = null) {
    let root = rootElement || this._rootEl;
    if (!root) return null;
    return this._buildDOMNode(root);
  }
  //DEVTOOLS--END

  //DEVTOOLS--START
  _buildDOMNode(node) {
    if (!node) return null;
    let nodeInfo = {
      nodeType: node.nodeType,
      nodeName: node.nodeName.toLowerCase(),
    };
    if (node.nodeType === 1) {
      nodeInfo.tagName = node.tagName.toLowerCase();
      nodeInfo.id = node.id || undefined;
      nodeInfo.className = node.className || undefined;
      nodeInfo.node = node;
      if (node._jurisTag) nodeInfo.jurisTag = node._jurisTag;
      if (node._jurisKey !== undefined) nodeInfo.jurisKey = node._jurisKey;
      if (node._jurisDevCompKey) nodeInfo.cKey = node._jurisDevCompKey;
      if (node._jurisDevCompName) nodeInfo.compName = node._jurisDevCompName;
      if (node._jurisAsyncPlaceholder) nodeInfo.isAsyncPlaceholder = true;
      if (node._jurisHasDoubleClick) nodeInfo.hasDoubleClick = true;
      if (node._jurisEventListeners && node._jurisEventListeners.length > 0) {
        nodeInfo.eventListeners = node._jurisEventListeners.map(e => e._eventName);
      }
      if (this._armedElements.has(node)) {
        let armed = this._armedElements.get(node);
        nodeInfo.armed = {
          events: armed.instance.events.map(e => e.name)
        };
      }
      if (node._jurisOnConnected) {
        nodeInfo.hasOnConnected = true;
      }
      nodeInfo._reactiveNodes = this._getReactiveNodesForElement(node);
      if (node.attributes && node.attributes.length > 0) {
        nodeInfo.attributes = {};
        for (let i = 0; i < node.attributes.length; i++) {
          let attr = node.attributes[i];
          nodeInfo.attributes[attr.name] = attr.value;
        }
      }
      if (node.childNodes && node.childNodes.length > 0) {
        nodeInfo.children = [];
        for (let i = 0; i < node.childNodes.length; i++) {
          let childInfo = this._buildDOMNode(node.childNodes[i]);
          if (childInfo) nodeInfo.children.push(childInfo);
        }
      }
      
    } else if (node.nodeType === 3) {
      nodeInfo.textContent = node.textContent;
      nodeInfo.length = node.textContent.length;
      nodeInfo._reactiveNodes = this._getReactiveNodesForElement(node);      
    } else if (node.nodeType === 8) {
      nodeInfo.data = node.data;
      if (node.data.startsWith('start:')) {
        //mk - markertType
        nodeInfo.mk = 'start';
        nodeInfo.cKey = node.data.substring(6);
      } else if (node.data.startsWith('end:')) {
        nodeInfo.mk = 'end';
        nodeInfo.cKey = node.data.substring(4);
      } else if (node.data.includes(_REACTIVE_NULL)) {
        nodeInfo.mk = _REACTIVE_NULL;
      } else if (node.data.includes('loading')) {
        nodeInfo.mk = 'loading';
      } else if (node.data.includes('async-component')) {
        nodeInfo.mk = 'async-component';
        let match = node.data.match(/async-component:(\S+)/);
        if (match) nodeInfo.cKey = match[1];
      }
      nodeInfo._reactiveNodes = this._getReactiveNodesForElement(node);
    }
    
    return nodeInfo;
  }
  //DEVTOOLS--END

  //DEVTOOLS--START
  _getReactiveNodesForElement(el) {
    let reactives = [];
    for (let [id, reactive] of this._stateManager._reactiveNodes.entries()) {
      if (reactive.el === el || reactive.node === el) {
        reactives.push({
          id,
          type: reactive.type,
          cKey: reactive.cKey,
          pRId: reactive.pRId,
          dependencies: Array.from(this._stateManager._subscriptions.get(id) || []),
          attrName: reactive.attrName,
          isSvg: reactive.isSvg,
          isCom: reactive.isCom,
          hasHooks: !!(reactive.hooks && Object.keys(reactive.hooks).length > 0),
          hasApi: !!(reactive.api && Object.keys(reactive.api).length > 0)
        });
      }
    }
    
    return reactives.length > 0 ? reactives : undefined;
  }
  //DEVTOOLS--END
}

if (typeof window !== 'undefined') {
  w.Juris = Juris;
}

export { Juris };
export default Juris;
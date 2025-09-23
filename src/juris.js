/**
 * Juris (JavaScript Unified Reactive Interface Solution)
 * The First and Only Non-blocking Reactive Platform, Architecturally Optimized for Next Generation Cutting-Edge Cross-Platform Application.
 * Juris aims to eliminate build complexity from small to large applications.
 * Author: Resti Guay
 * Version: 0.91.0
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
 *          onclick:()=>clickHandler()
 *        }},//button
 *        {input:{type:'text',min:'1', max:'10',
                value: () => juris.getState('counter.step', 1), //note: reactive value
 *          oninput: (e) => {
                let newStep = parseInt(e.target.value) || 1;
                juris.setState('counter.step', Math.max(1, Math.min(10, newStep)));
            }
 *        }},//input
 *        ()=> juris.getState('counter.step', 1),//text node
 *        ()=>{
 *          let step = juris.getState('counter.step', 1);
 *          return {span:{text:`Current step is ${step}`}};
 *        }//span
 *      ]
 *   }}//div.main
 * }//return
 */

'use strict';
let jurisLinesOfCode = 2600;
let jurisVersion = '0.91.0';
let jurisMinifiedSize = '38kB, 12kB gzipped';
let getPathParts = path => path.split('.').filter(Boolean);

/**
 * Check if value is a function
 * @param {*} val 
 * @returns 
 */
let _isFN = (val) => {
  return typeof val === 'function';
}
/**
 * Check if value is a plain object
 * @param {*} val - Value to check
 * @returns {boolean} True if val is an object (excludes null and arrays)
 */
let _isOb = (val) => {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}
/**
 * Check if value is a string
 * @param {*} val - Value to check
 * @returns {boolean} True if val is a string
 */
let _isSt = (val) => {
  return typeof val === 'string';
}
/**
 * Check if value is a number
 * @param {*} val - Value to check
 * @returns {boolean} True if val is a number
 */
let _isNu = (val) => {
  return typeof val === 'number' && !isNaN(val);
}
let isValidPath = path => _isSt(path) && path.trim().length > 0 && !path.includes('..');
let deepEquals = (a, b) => {
    if (a === b) return true;
    if (a == null || b == null || typeof a !== typeof b) return false;
    if (_isOb(a)) {
        if (Array.isArray(a) !== Array.isArray(b)) return false;
        let keysA = Object.keys(a), keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        return keysA.every(key => keysB.includes(key) && deepEquals(a[key], b[key]));
    }
    return false;
};
let createLogger = () => {
    let s = [];
    let f = (m, c, cat) => {
        let msg = `${cat ? `[${cat}] ` : ''}${m}${c ? ` ${JSON.stringify(c)}` : ''}`;
        let logObj = { formatted: msg, message: m, context: c, category: cat, timestamp: Date.now() };
        setTimeout(() => s.forEach(sub => sub(logObj)), 0);
        return logObj;
    };
    return {
        log: { l: f, w: f, e: f, i: f, d: f, ei:true, ee:true, el:true, ew:true, ed:true },
        sub: cb => s.push(cb),
        unsub: cb => s.splice(s.indexOf(cb), 1)
    };
};
let { log, sub: logSub, unsub: logUnsub } = createLogger();
let createPromisify = () => {
    let activePromises = new Set();
    let isTracking = false;
    let subs = new Set();
    let checkAllComplete = () => {
        if (activePromises.size === 0 && subs.size > 0) {
            subs.forEach(callback => callback());
        }
    };
    let trackingPromisify = result => {
        let promise = _isFN(result?.then) ? result : Promise.resolve(result);
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
            subs.clear();
        },
        onAllComplete: (callback) => {
            subs.add(callback);
            if (activePromises.size === 0) {
                setTimeout(callback, 0);
            }
            return () => subs.delete(callback);
        }
    };
};
let { promisify, startTracking, stopTracking, onAllComplete } = createPromisify();

class StateManager {
    constructor(initialState = {}, middleware = []) {
        this.state = { ...initialState };
        this.middleware = [...middleware];
        this.subscribers = new Map();
        this.extSubs = new Map();
        this.deps = null;
        this.isUpdating = false;
        this.initialState = JSON.parse(JSON.stringify(initialState));
        this.maxUpdateDepth = 50;
        this.updateDepth = 0;
        this.newSubs = new Set();
        this.isBatching = false;
        this.batchQueue = [];
        this.batchedPaths = new Set();
        this.pathCache = new Map();
        this.maxCacheSize = 500;
        this.plugins = new Map();
        this.isDeferringSubscriptions = false;
        this.deferredSubscriptions = [];
    }
    startDeferringSubscriptions() {
      this.isDeferringSubscriptions = true;
      this.deferredSubscriptions = [];
    }
    processDeferredSubscriptions() {
    if (!this.isDeferringSubscriptions) return;
    
    // Temporarily disable deferring to create real subscriptions
    let wasDeferring = this.isDeferringSubscriptions;
    this.isDeferringSubscriptions = false;
    
    this.deferredSubscriptions.forEach(({path, callback, unsubscriber}) => {
        // Create real subscription
        let realUnsub = this.subscribeInternal(path, callback);
        // Update the mutable reference to point to real unsubscriber
        unsubscriber.fn = realUnsub;
    });
    
    // Clear the deferred list and reset state
    this.deferredSubscriptions = [];
    this.isDeferringSubscriptions = false;
}
    addPlugin(name, plugin) {
        this.plugins.set(name, plugin);
        if (_isFN(plugin.initialize)) {
            plugin.initialize(this);
        }
        return plugin;
    }

    getPlugin(name) {
        return this.plugins.get(name);
    }

    hasPlugin(name) {
        return this.plugins.has(name);
    }

    removePlugin(name) {
        let plugin = this.plugins.get(name);
        if (plugin && _isFN(plugin.destroy)) {
            plugin.destroy();
        }
        return this.plugins.delete(name);
    }

    destroy() {
        this.plugins.forEach((plugin, name) => {
            this.removePlugin(name);
        });
        this.plugins.clear();
    }
    // Compute delegation methods
    compute(name, fn, options = {}) {
        let computePlugin = this.getPlugin('compute');
        if (!computePlugin) {
            throw new Error('Compute not available.');
        }
        return computePlugin.compute(name, fn, options);
    }

    configureCompute(defaults) {
        let computePlugin = this.getPlugin('compute');
        if (!computePlugin) {
            throw new Error('Compute not available.');
        }
        return computePlugin.configureCompute(defaults);
    }

    getComputeStats(name = null) {
        let computePlugin = this.getPlugin('compute');
        return computePlugin ? computePlugin.getComputeStats(name) : null;
    }

    clearCompute(name = null) {
        let computePlugin = this.getPlugin('compute');
        if (computePlugin) {
            computePlugin.clearCompute(name);
        }
    }
    #getPathParts(path) {
        let parts = this.pathCache.get(path);
        if (parts) return parts;
        parts = path.split('.').filter(Boolean);
        if (this.pathCache.size >= this.maxCacheSize) {
            let firstKey = this.pathCache.keys().next().value;
            this.pathCache.delete(firstKey);
        }        
        this.pathCache.set(path, parts);
        return parts;
    }

    track(fn, isolated = false) {
        let saved = this.deps;
        let deps = isolated ? null : (this.deps = new Set());
        let result;        
        try {
            result = fn();
        } finally {
            this.deps = saved;
        }
        return { 
            result, 
            deps: deps ? [...deps] : [] 
        };
    }
    
    reset() {
        if (this.isBatching) {
            this.batchQueue = [];
            this.batchedPaths.clear();
            this.isBatching = false;
        }
        this.state = JSON.parse(JSON.stringify(this.initialState));
        this.pathCache.clear();
        this.plugins.forEach(plugin => {
            if (_isFN(plugin.reset)) {
                plugin.reset();
            }
        });
    }

    getState(path, defaultValue = null, track = true) {
      try {
        if (!isValidPath(path)) return defaultValue;
        if (track && this.deps) this.deps.add(path);
        let dotIndex = path.indexOf('.');
        if (dotIndex === -1) {
          let value = this.state[path];
          return value !== undefined ? value : defaultValue;
        }
        let parts = this.pathCache.get(path);
        if (!parts) {
          parts = path.split('.');
          if (this.pathCache.size >= this.maxCacheSize) {
            this.pathCache.delete(this.pathCache.keys().next().value);
          }
          this.pathCache.set(path, parts);
        }
        let current = this.state;
        for (let i = 0; i < parts.length; i++) {
          current = current?.[parts[i]];
          if (current === undefined) return defaultValue;
        }
        return current;
      } catch (error) {
        log.ee && console.error(log.e('State access failed', {path, defaultValue, track, error: error.message, stack: error.stack?.split('\n').slice(0, 3).join('\n')}, 'frk'));
        return defaultValue;
      }
    }

    setState(path, value, context = {}) {
      try {
        if (!isValidPath(path)) return false;
        if (this.#hasCircularUpdate(path)) return false;
        if (this.#canQuickCompare(path, value)) {
          let currentValue = this.#getValueFast(path);
          if (currentValue === value) return false;
        }
        if (this.isBatching) {
          this.#queueBatchedUpdate(path, value, context);
          return;
        }
        this.#setStateImmediate(path, value, context);
      } catch (error) {
        log.ee && console.error(log.e('State update failed', {path, valueType: typeof value, context, error: error.message, stack: error.stack?.split('\n').slice(0, 3).join('\n')}, 'frk'));
        throw error;
      }
    }
    #canQuickCompare(path, value) {
        return (
            (_isSt(value) || _isNu(value) || typeof value === 'boolean') &&
            path.indexOf('.') === -1 &&
            this.middleware.length === 0
        );
    }

    #getValueFast(path) {
        return this.state[path];
    }
    executeBatch(callback) {
        if (this.isBatching) return callback();
        this.#beginBatch();
        try {
            let result = callback();
            if (result && _isFN(result.then)) {
                return result
                    .then(value => { this.#endBatch(); return value; })
                    .catch(error => { this.#endBatch(); throw error; });
            }
            this.#endBatch();
            return result;
        } catch (error) {
            this.#endBatch();
            throw error;
        }
    }

    #beginBatch() {
        this.isBatching = true;
        this.batchQueue = [];
        this.batchedPaths.clear();
    }

    #endBatch() {
        if (!this.isBatching) {
            log.ew && console.warn(log.w('invalid use of endBatch()', {}, 'frk'));
            return;
        }
        this.isBatching = false;
        if (this.batchQueue.length === 0) return;
        this.#processBatchedUpdates();
    }

    isBatchingActive() {return this.isBatching;}

    getBatchQueueSize() {return this.batchQueue.length;}

    clearBatch() {
        if (this.isBatching) {
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
        let updates = [...this.batchQueue];
        this.batchQueue = [];
        this.batchedPaths.clear();
        let pathGroups = new Map();
        updates.forEach(update => pathGroups.set(update.path, update));
        let wasUpdating = this.isUpdating;
        this.isUpdating = true;
        let appliedUpdates = [];
        pathGroups.forEach(update => {
            let oldValue = this.getState(update.path, null, false);
            let finalValue = update.value;
            for (let middleware of this.middleware) {
                try {
                    let result = middleware({ path: update.path, oldValue, newValue: finalValue, context: update.context, state: this.state });
                    if (result !== undefined) finalValue = result;
                } catch (error) {
                    log.ee && console.error(log.e('Middleware error in batch', {
                        path: update.path,
                        error: error.message
                    }, 'app'));
                }
            }
            if (deepEquals(oldValue, finalValue)) return;
            this.#setStateFast(update.path, finalValue);
            appliedUpdates.push({ path: update.path, oldValue, newValue: finalValue });
        });
        this.isUpdating = wasUpdating;
        let parentPaths = new Set();
        appliedUpdates.forEach(({ path }) => {
            let parts = this.#getPathParts(path);
            for (let i = 1; i <= parts.length; i++) {
                parentPaths.add(parts.slice(0, i).join('.'));
            }
        });
        parentPaths.forEach(path => {
            if (this.subscribers.has(path)) this.#triggerPathSubscribers(path);
            if (this.extSubs.has(path)) {
                this.extSubs.get(path).forEach(({ callback, hierarchical }) => {
                    try {
                        callback(this.getState(path, null, false), null, path);
                    } catch (error) {
                        log.ee && console.error(log.e('ex-subscriber error:', error), 'app');
                    }
                });
            }
        });
    }

    #setStateImmediate(path, value, context = {}) {
        let oldValue = this.getState(path, null, false);
        let finalValue = value;
        // Optimize middleware loop
        if (this.middleware.length > 0) {
            for (let i = 0; i < this.middleware.length; i++) {
                try {
                    let result = this.middleware[i]({ path, oldValue, newValue: finalValue, context, state: this.state });
                    if (result !== undefined) finalValue = result;
                } catch (error) {
                    log.ee && console.error(log.e('Middleware error', { path, error: error.message, middlewareName: middleware.name || 'anonymous' }, 'app'));
                }
            }
        }
        if (deepEquals(oldValue, finalValue)) {
            log.ed && console.debug(log.d('State not updated', { path }, 'frk'));
            return;
        }
        this.#setStateFast(path, finalValue);
        if (!this.isUpdating) {
            this.isUpdating = true;
            this.newSubs = this.newSubs || new Set();
            this.newSubs.add(path);
            this.#notifySubscribers(path, finalValue, oldValue);
            this.#notifyExternalSubscribers(path, finalValue, oldValue);
            this.newSubs.delete(path);
            this.isUpdating = false;
        }
    }

    // Optimized state mutation with inline operations
    #setStateFast(path, value) {
        let dotIndex = path.indexOf('.');
        if (dotIndex === -1) {
            this.state[path] = value;
            return;
        }
        
        // Inline path parsing and object creation
        let parts = this.pathCache.get(path);
        if (!parts) {
            parts = path.split('.');
            if (this.pathCache.size >= this.maxCacheSize) {
                this.pathCache.delete(this.pathCache.keys().next().value);
            }
            this.pathCache.set(path, parts);
        }
        
        let current = this.state;
        let lastIndex = parts.length - 1;
        for (let i = 0; i < lastIndex; i++) {
            let part = parts[i];
            if (current[part] == null || !_isOb(current[part])) {
                current[part] = {};
            }
            current = current[part];
        }
        current[parts[lastIndex]] = value;
    }

    subscribe(path, callback, hierarchical = true) {
        if (!this.extSubs.has(path)) this.extSubs.set(path, new Set());
        let subscription = { callback, hierarchical };
        this.extSubs.get(path).add(subscription);
        return () => {
            let subs = this.extSubs.get(path);
            if (subs) {
                subs.delete(subscription);
                if (subs.size === 0) this.extSubs.delete(path);
            }
        };
    }

    subscribeExact(path, callback) {
        return this.subscribe(path, callback, false);
    }

    subscribeInternal(path, callback) {
    if (this.isDeferringSubscriptions) {
        // Create a mutable unsubscriber reference
        let unsubscriber = { fn: null };
        
        this.deferredSubscriptions.push({
            path, 
            callback,
            unsubscriber // Store reference so we can update it later
        });
        
        return () => {
            if (unsubscriber.fn) {
                // Call the real unsubscriber if it exists
                unsubscriber.fn();
            } else {
                // Remove from deferred list if not yet processed
                let index = this.deferredSubscriptions.findIndex(
                    sub => sub.path === path && sub.callback === callback && sub.unsubscriber === unsubscriber
                );
                if (index !== -1) {
                    this.deferredSubscriptions.splice(index, 1);
                }
            }
        };
    }
    
    // Normal subscription logic
    if (!this.subscribers.has(path)) {
        this.subscribers.set(path, new Set());
    }
    
    this.subscribers.get(path).add(callback);
    
    return () => {
        let subs = this.subscribers.get(path);
        if (subs) {
            subs.delete(callback);
            if (subs.size === 0) {
                this.subscribers.delete(path);
            }
        }
    };
}

    #notifySubscribers(path, newValue, oldValue) {
        this.#triggerPathSubscribers(path);
        let parts = this.#getPathParts(path);
        for (let i = parts.length - 1; i > 0; i--) {
            this.#triggerPathSubscribers(parts.slice(0, i).join('.'));
        }
        let prefix = path ? path + '.' : '';
        let allPaths = new Set([...this.subscribers.keys(), ...this.extSubs.keys()]);
        allPaths.forEach(subscriberPath => {
            if (subscriberPath.startsWith(prefix) && subscriberPath !== path) {
                this.#triggerPathSubscribers(subscriberPath);
            }
        });
    }

    #notifyExternalSubscribers(changedPath, newValue, oldValue) {
        this.extSubs.forEach((subscriptions, subscribedPath) => {
            subscriptions.forEach(({ callback, hierarchical }) => {
                let shouldNotify = hierarchical ?
                    (changedPath === subscribedPath || changedPath.startsWith(subscribedPath + '.')) :
                    changedPath === subscribedPath;
                if (shouldNotify) {
                    try {
                        callback(newValue, oldValue, changedPath);
                    } catch (error) {
                        log.ee && console.error(log.e('ex-subscriber error:', {error, path:changedPath, newValue,oldValue} ), 'app');
                    }
                }
            });
        });
    }

    #triggerPathSubscribers(path) {
      let subs = this.subscribers.get(path);
      if (!subs || subs.size === 0) return;

      new Set(subs).forEach(callback => {
        try {
          let { result, deps } = this.track(() => callback());
          deps.forEach(newPath => {
            let existingSubs = this.subscribers.get(newPath);
            if (!existingSubs) {
              existingSubs = new Set();
              this.subscribers.set(newPath, existingSubs);
            }
            if (!existingSubs.has(callback)) {
              existingSubs.add(callback);
            }
          });
        } catch (error) {
          log.ee && console.error(log.e('subscriber error:', {path, error: error.message, stack: error.stack?.split('\n').slice(0, 3).join('\n'), callbackName: callback.name || 'anonymous'}, 'frk'));
        }
      });
    }

    #hasCircularUpdate(path) {
        if (!this.newSubs) this.newSubs = new Set();
        if (this.newSubs.has(path)) {
            log.ew && console.warn(log.w('Circular dependency detected', { path }, 'frk'));
            return true;
        }
        return false;
    }

    startTracking() {
        let deps = new Set();
        this.deps = deps;
        return deps;
    }

    endTracking() {
        let deps = this.deps;
        this.deps = null;
        return deps || new Set();
    }
}

class ComponentManager {
    constructor(juris) {
        this.juris = juris;
        this.components = new Map();
        this.insts = new Map();
        this.namedComps = new Map();
        this.comps = new Map();
        this.componentStates  = new Map();
        this.placeholders = new Map();
        this.asyncPropsCache = new Map();
    }

    register(name, compFn) {
        this.components.set(name, compFn);
    }
    getAsyncStats() {
        return {
            placeholders: this.placeholders.size,
            cachedAsyncProps: this.asyncPropsCache.size
        };
    }
    create(name, props = {}, targetContainer = null) {
      let compFn = this.components.get(name);
      if (!compFn) {
        log.ee && console.error(log.e('Component not found', { name }, 'app'));
        return null;
      }
      try {
        if (this.juris.getDR()._hasAsyncProps(props)) {
          return this.#createWithAsyncProps(name, compFn, props, targetContainer);
        }
        let { comptId, componentStates, context } = this.#getCompContext(name);
        let result = this.#callComponentFunction(compFn, props, context);
        if (result?.then) {
          return this.#handleAsyncComp(promisify(result), name, props, componentStates, targetContainer);
        }
        return this.#procCompResult(result, name, props, componentStates, targetContainer);
      } catch (error) {
        log.ee && console.error(log.e('Component creation failed', {name, props, error: error.message, stack: error.stack?.split('\n').slice(0, 5).join('\n')}, 'app'));
        return this.#newErrElm(name, error);
      }
    }

    #callComponentFunction(componentFn, props, context) {
      try {
        let funcStr = componentFn.toString();
        let paramMatch = funcStr.match(/^[^(]*\(([^)]*)\)/);
        if (!paramMatch || !paramMatch[1].trim()) {
          return componentFn();
        }
        let params = paramMatch[1].split(',').map(p => p.trim());
        if (params.length === 1) {
          let param = params[0];
          if (param.startsWith('{') && param.includes('}') || param === 'props' || param === 'prp') {
            return componentFn(props);
          } else {
            return componentFn(context);
          }
        } else {
          return componentFn(props, context);
        }
      } catch (error) {
        log.ee && console.error(log.e('Component Error', {componentName: componentFn.name || 'anonymous', props, error: error.message, stack: error.stack?.split('\n').slice(0, 5).join('\n')}, 'app'));
        throw error;
      }
    }

    #getCompContext(name) {
        let { comptId, componentStates  } = this.#newCompId(name);
        let context = this.#getCompCxt(comptId, componentStates );
        return { comptId, componentStates , context };
    }

    #newCompId(name) {
      if (!this.comps.has(name)) {
          this.comps.set(name, 0);
      }
      let instanceIndex = this.comps.get(name) + 1;
      this.comps.set(name, instanceIndex);
      let comptId = `${name}#${instanceIndex}`;
      let componentStates  = new Set();
      return { comptId, componentStates  };
    }

    #getCompCxt(comptId, componentStates ) {
      const context = this.juris.createContext();
      context.newState = (key, initialValue) => {
        const statePath = `##local.${comptId}.${key}`;
        if (this.juris.stateManager.getState(statePath) === null) {
            this.juris.stateManager.setState(statePath, initialValue);
        }
        componentStates .add(statePath);
        return [
            () => this.juris.stateManager.getState(statePath, initialValue),
            value => this.juris.stateManager.setState(statePath, value),
            fn => this.juris.stateManager.subscribe(statePath, fn)
        ];
      };
      return context;
    }

    #createWithAsyncProps(name, compFn, props, targetContainer = null) {
      let ph = targetContainer || this.#newPlaceholder(name, 'async-props-loading');
      this.placeholders.set(ph, { name, props, type: 'async-props' });
      this.#resolveAsyncProps(props).then(resolved => {
        try {
          let elem = this.#createSyncComponent(name, compFn, resolved, targetContainer);
          if (targetContainer) {
            // If using external container, replace contents instead of element
            targetContainer.innerHTML = '';
            if (elem !== targetContainer) {
              targetContainer.appendChild(elem);
            }
          } else {
            this.#replacePlaceholder(ph, elem);
          }
        } catch (err) {
          this.#replaceWithError(ph, err);
        }
      }).catch(err => this.#replaceWithError(ph, err));
      return ph;
    }

    async #resolveAsyncProps(props) {
      let key = this.#newKey(props);
      let cached = this.asyncPropsCache.get(key);
      if (cached && Date.now() - cached.timestamp < 5000) {
          return cached.props;
      }
      let resolved = {};
      let keys = Object.keys(props);
      for (let i = 0; i < keys.length; i++) {
        let k = keys[i];
        let v = props[k];
        if (v?.then) {
          try {
              resolved[k] = await v;
          } catch (err) {
              resolved[k] = { __asyncError: err.message };
          }
        } else {
          resolved[k] = v;
        }
      }
      this.asyncPropsCache.set(key, { props: resolved, timestamp: Date.now() });
      return resolved;
    }

    #createSyncComponent(name, compFn, props, targetContainer = null) {
      let { comptId, componentStates , context } = this.#getCompContext(name);
      let result = this.#callComponentFunction(compFn, props, context);
      if (result?.then) {
        return this.#handleAsyncComp(promisify(result), name, props, componentStates , targetContainer);
      }
      return this.#procCompResult(result, name, props, componentStates , targetContainer);
    }

    #handleAsyncComp(promise, name, props, states, targetContainer = null) {
      let ph = targetContainer || this.#newPlaceholder(name, 'async-loading');
      this.placeholders.set(ph, { name, props, states });
      promise.then(result => {
        try {
          let elem = this.#procCompResult(result, name, props, states, targetContainer);
          if (targetContainer) {
            // If using external container, replace contents instead of element
            targetContainer.innerHTML = '';
            if (elem !== targetContainer) {
              targetContainer.appendChild(elem);
            }
          } else {
            this.#replacePlaceholder(ph, elem);
          }
        } catch (err) {
          log.ee && console.error(log.e('Async component failed', { name, error: err.message }, 'app'));
          this.#replaceWithError(ph, err);
        }
      }).catch(err => this.#replaceWithError(ph, err));
      return ph;
    }

    #procCompResult(result, name, props, states, targetContainer = null) {
      if (Array.isArray(result)) {
        return this.#newCompFrag(result, name, props, states);
      }      
      let hasLifecycle = _isOb(result) && 
        (this.#hasHooks(result) || _isFN(result.render));      
      if (hasLifecycle) {
        return this.#createManagedComponent(result, name, props, states, targetContainer);
      }
      // Handle all other cases (primitives, null, VDOM objects)
      let el = this.juris.getDR().render(result, name);
      return this.#finalizeElement(el, name, states, result);
    }
    #createElm(tagName){
      return document.createElement(tagName);
    }
    #createManagedComponent(result, name, props, states, targetContainer = null) {
      try {
        let inst = this.#newComp(result, name, props);
        let currentElement = targetContainer || this.#createElm('div');
        let isExternal = !!targetContainer;
        let allSubscriptions = new Set();
        let hasBeenMounted = false;    
        if (!isExternal) {
          currentElement.setAttribute('data-jc', name);
          currentElement.setAttribute('data-jr', Date.now());
        }    
        const updateRender = async () => {
          try {
            allSubscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
            allSubscriptions.clear();
            if (currentElement && currentElement._reactiveSubscriptions) {
              currentElement._reactiveSubscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
              currentElement._reactiveSubscriptions = [];
            }
            let { result: res, deps } = this.juris.getSM().track(() => {
              if (inst.render) {
                return inst.render(currentElement);
              }
              return result;
            });
            if (res?.then) {
              try {
                res = await promisify(res);
              } catch (err) {
                log.ee && console.error(log.e('Async render error', {
                  componentName: name,
                  error: err.message,
                  stack: err.stack?.split('\n').slice(0, 5).join('\n')
                }, 'app'));
                res = this.#newErrElm(name, err);
              }
            }
            
            if (res) {
              try {
                let newElement = this.juris.getDR().render(res, name);
                if (currentElement.parentNode && newElement !== currentElement) {
                  if (currentElement.parentNode.contains(currentElement)) {
                    currentElement.parentNode.replaceChild(newElement, currentElement);
                    currentElement = newElement;
                  }
                  if (!isExternal && currentElement.setAttribute) {
                    currentElement.setAttribute('data-jc', name);
                    currentElement.setAttribute('data-jr', Date.now());
                  }
                } else if (newElement && !currentElement.parentNode) {
                  currentElement = newElement;              
                  if (!isExternal && currentElement.setAttribute) {
                    currentElement.setAttribute('data-jc', name);
                    currentElement.setAttribute('data-jr', Date.now());
                  }
                }            
                if (hasBeenMounted && (inst.hooks?.onUpdate || inst.onUpdate)) {
                  let updateHook = inst.hooks?.onUpdate || inst.onUpdate;
                  setTimeout(() => this.#runHook(updateHook, currentElement, name, 'onUpdate'), 0);
                }
                hasBeenMounted = true;
              } catch (renderError) {
                log.ee && console.error(log.e('Render update failed', {componentName: name,error: renderError.message, stack: renderError.stack?.split('\n').slice(0, 5).join('\n')}, 'app'));
              }
            }        
            // Create new subscriptions
            deps.forEach(path => {
              try {
                let unsub = this.juris.getSM().subscribeInternal(path, updateRender);
                allSubscriptions.add(unsub);
              } catch (subError) {
                log.ee && console.error(log.e('Subscription creation failed', {componentName: name,path,error: subError.message}, 'app'));
              }
            });
          } catch (updateError) {
            log.ee && console.error(log.e('Component update cycle failed', {componentName: name,error: updateError.message,stack: updateError.stack?.split('\n').slice(0, 5).join('\n')}, 'app'));
          }
        };
        try {
          updateRender();
        } catch (initialRenderError) {
          log.ee && console.error(log.e('Initial component render failed', {componentName: name, error: initialRenderError.message, stack: initialRenderError.stack?.split('\n').slice(0, 5).join('\n')}, 'app'));
        }
        currentElement._componentCleanup = () => {
          try {
            if (inst.hooks?.onUnmount || inst.onUnmount) {
              let unmountHook = inst.hooks?.onUnmount || inst.onUnmount;
              try {
                this.#runHook(unmountHook, currentElement, name, 'onUnmount');
              } catch (error) {
                log.ee && console.error(log.e('onUnmount error', { componentName: name, error: error.message, stack: error.stack?.split('\n').slice(0, 3).join('\n') }, 'app'));
              }
            }
            allSubscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
            allSubscriptions.clear();
            if (currentElement._reactiveSubscriptions) {
              currentElement._reactiveSubscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
              currentElement._reactiveSubscriptions = [];
            }
          } catch (cleanupError) {
            log.ee && console.error(log.e('Component cleanup failed', {componentName: name, error: cleanupError.message }, 'app'));
          }
        };
        
        this.#setupUnifiedComp(currentElement, inst, states, name, isExternal);
        return currentElement;
      } catch (error) {
        log.ee && console.error(log.e('Managed component creation failed', {
          componentName: name,
          props,
          error: error.message,
          stack: error.stack?.split('\n').slice(0, 5).join('\n')
        }, 'app'));
        return this.#newErrElm(name, error);
      }
    }

    #setupUnifiedComp(el, inst, states, name, isExternal = false) {
      inst.isExternalContainer = isExternal;
      this.insts.set(el, inst);      
      if (states?.size > 0) {
        this.componentStates .set(el, states);
      }      
      if (_isOb(inst.api)) {
        el.api = inst.api;
        this.namedComps.set(name, { elm: el, instance: inst });
      }
      let hooks = inst.hooks || {};
      if (hooks.onMount || inst.onMount) {
        let mountHook = hooks.onMount || inst.onMount;
        setTimeout(() => this.#runHook(mountHook, el, name, 'onMount'), 0);
      }
    }

    #finalizeElement(el, name, states, result) {
      if (el && states.size > 0) {
        this.componentStates .set(el, states);
      }
      if (_isOb(result.api) && el) {
        el.api = result.api;
      }
      if (el && el.setAttribute) {
        el.setAttribute('data-jc', name);
        el._jurisComponent = name;
      }
      return el;
    }
    #newCompFrag(result, name, props, states, targetContainer) {
        let frag = targetContainer || document.createDocumentFragment();
        let virt = this.#newVirtContainer(frag, name, props);
        let subs = [];
        this.juris.getDR()._handleChildren(virt, result, subs);
        frag._jurisComponent = {
            name,
            props,
            virtual: virt,
            cleanup: () => {
                subs.forEach(unsub => { try { unsub(); } catch(e) {} });
            }
        };
        if (states?.size > 0) {
            frag._juriscomponentStates  = states;
        }
        return frag;
    }

    #newComp(result, name, props) {
        return {
            name, props,
            hooks: result.hooks || { onMount: result.onMount, onUpdate: result.onUpdate, onUnmount: result.onUnmount },
            api: result.api || {},
            render: result.render
        };
    }

    #runHook(hook, args, componentName, hookName) {
      try {
        let result = Array.isArray(args) ? hook(...args) : hook(args);
        if (result?.then) {
          promisify(result).catch(error => {
            log.ee && console.error(log.e(`Async ${hookName} error`, {componentName,hookName,error: error.message,stack: error.stack?.split('\n').slice(0, 5).join('\n') }, 'app'));
          });
        }
      } catch (error) {
        log.ee && console.error(log.e(`${hookName} error`, {componentName,hookName,error: error.message,stack: error.stack?.split('\n').slice(0, 5).join('\n')}, 'app'));
      }
    }

    #newVirtContainer(frag, name, props) {
      let virt = {
        _isVirtual: true,
        _fragment: frag,
        _componentName: name,
        _componentProps: props,
        appendChild: (child) => frag.appendChild(child),
        removeChild: (child) => {
            if (child.parentNode === frag) {
                frag.removeChild(child);
            }
        },
        replaceChild: (newChild, oldChild) => {
            if (oldChild.parentNode === frag) {
                frag.replaceChild(newChild, oldChild);
            }
        },
        get children() {
            return Array.from(frag.childNodes);
        },
        get parentNode() { return null; },
        textContent: ''
      };
      Object.defineProperty(virt, 'textContent', {
        set(val) {
            while (frag.firstChild) {
                frag.removeChild(frag.firstChild);
            }
            if (val) {
                frag.appendChild(document.createTextNode(val));
            }
        },
        get() { return ''; }
      });
      return virt;
    }

    #newPlaceholder(name, className) {
        let tempElement = this.#createElm('div');
        tempElement.id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        return this._createPlaceholder(`Loading ${name}...`, className, tempElement);
    }

    #replacePlaceholder(placeholder, newElement) {
        if (newElement && placeholder.parentNode) {
            placeholder.parentNode.replaceChild(newElement, placeholder);
        }
        this.placeholders.delete(placeholder);
    }

    #replaceWithError(placeholder, error) {
      let errorElement = this.#newErrElm(
          placeholder._jurisComponent?.name || 'Unknown Component', 
          error
      );
      if (placeholder.parentNode) {
          placeholder.parentNode.replaceChild(errorElement, placeholder);
      }
      this.placeholders.delete(placeholder);
    }

    #newErrElm(name, error) {
        let elm = this.#createElm('div');
        elm.style.cssText = 'color: red; border: 1px solid red; padding: 8px; background: #ffe6e6;';
        elm.textContent = `Component Error in ${name}: ${error.message}`;
        return elm;
    }

    #hasHooks(result) {
        return result.hooks && (result.hooks.onMount || result.hooks.onUpdate || result.hooks.onUnmount) ||
            result.onMount || result.onUpdate || result.onUnmount;
    }

    #newKey(props) {
        return JSON.stringify(props, (key, value) => value?.then ? '[Promise]' : value);
    }

    cleanup(elm) {
      if (elm instanceof DocumentFragment) {
        this.#cleanupFragment(elm);
        return;
      }
      
      let instance = this.insts.get(elm);
      if (instance?.hooks?.onUnmount) {
        this.#runHook(instance.hooks.onUnmount, elm, instance.name, 'onUnmount');
      }
      
      if (elm._reactiveSubscriptions) {
        elm._reactiveSubscriptions.forEach(unsubscribe => {
          try { unsubscribe(); } catch (error) { 
            log.ew && console.warn('Error cleaning up reactive subscription:', error); 
          }
        });
        elm._reactiveSubscriptions = [];
      }
      if (!instance?.isExternalContainer) {
        this.#cleanupcomponentStates (elm);
      } else {
        let states = this.componentStates .get(elm);
        if (states) {
          this.#cleanupStateSet(states);
          this.componentStates .delete(elm);
        }
      }
      
      if (this.placeholders.has(elm)) {
        this.placeholders.delete(elm);
      }
      this.insts.delete(elm);
    }

    #cleanupFragment(fragment) {
        fragment._jurisComponent?.cleanup?.();
        if (fragment._juriscomponentStates ) {
            this.#cleanupStateSet(fragment._juriscomponentStates );
        }
    }

    #cleanupcomponentStates (elm) {
        let states = this.componentStates .get(elm);
        if (states) {
            this.#cleanupStateSet(states);
            this.componentStates .delete(elm);
        }
    }

    #cleanupStateSet(stateSet) {
        stateSet.forEach(statePath => {
            let pathParts = statePath.split('.');
            let current = this.juris.getSM().state;
            for (let i = 0; i < pathParts.length - 1; i++) {
                if (current[pathParts[i]]) {
                    current = current[pathParts[i]];
                } else {
                    return;
                }
            }
            delete current[pathParts[pathParts.length - 1]];
        });
    }

    getComponent(name) {return this.namedComps.get(name)?.instance || null;}
    getComponentAPI(name) {return this.namedComps.get(name)?.instance?.api || null;}
    getComponentElement(name) {return this.namedComps.get(name)?.elm || null;}
    getNamedComponents() { return Array.from(this.namedComps.keys()); }
    clearAsyncPropsCache() { this.asyncPropsCache.clear(); }
    
    _createPlaceholder(text, className, elm = null) {
        let config = this.juris.getDR()._getPlaceholderConfig(elm);
        let placeholder = this.#createElm('div');
        placeholder.className = config.className;
        placeholder.textContent = config.text;
        if (config.style) placeholder.style.cssText = config.style;
        return placeholder;
    }
}

class DOMRenderer {
  constructor(juris) {
    this.juris = juris;
    this.subscriptions = new WeakMap();
    this.keyedNodes = new WeakMap();
    this.nodeKeys = new WeakMap();
    this.placeholders = new WeakMap();
    this.placeholderConfigs = new Map();
    this.componentStack = [];
    this.objTreeAnalyzer = null;
    this.SKIP_ATTRS = new Set(['children', 'key', 'ref']);    
    this.BOOLEAN_ATTRS = new Set([
      'autofocus', 'autoplay', 'checked', 'controls', 'defer', 'disabled',
      'hidden', 'loop', 'multiple', 'muted', 'open', 'readonly', 'required',
      'reversed', 'selected'
    ]);
    this.elementTypeCache = new Map();
    this.defaultPlaceholder = {
      className: 'juris-async-loading',
      style: 'padding: 8px; background: #f0f0f0; border: 1px dashed #ccc; opacity: 0.7;',
      text: 'Loading...',
      children: null,
      errorClassName: 'juris-async-error',
      errorStyle: 'color: red; padding: 8px; background: #ffe6e6;'
    };        
    this.TOUCH_CONFIG = {
      moveThreshold: 10,
      timeThreshold: 300,
      touchAction: 'manipulation',
      tapHighlight: 'transparent',
      touchCallout: 'none'
    };
    this.cleanupTimeout = null;
    this._testMode = false;
    this._lastObjectTree = null;
    this.pendingConnectedCallbacks = new Set();
  }

  #handleAsync = (promise, handlers = {}, context = {}) => {    
    let {
      onStart = () => {},
      onResolved = () => {},
      onError = (error) => {
        log.ee && console.error(log.e('Async operation failed:', error), 'app');
      },
      onFinally = () => {}
    } = handlers;    
    if (context.elm && context.type) {
      this.#applyPlaceholder(context.elm, context.type, context);
    }    
    onStart();    
    let trackedPromise = promisify(promise);    
    return trackedPromise
      .then(resolved => {
        if (context.elm && context.type) {
          this.#removePlaceholder(context.elm);
        }
        onResolved(resolved);
        return resolved;
      })
      .catch(error => {
        if (context.elm && context.type) {
          this.#applyErrorState(context.elm, context.type, error, context);
        }
        onError(error);
        throw error;
      })
      .finally(() => {
        onFinally();
      });
  };
  
  #applyPlaceholder(elm, type, context = {}) {
    let config = this._getPlaceholderConfig(elm);    
    switch(type) {
      case 'children':
      case 'reactive-children':
      case 'fragment-child':
        this.#applyChildrenPlaceholder(elm, config);
        break;                
      case 'text':
        this.#applyTextPlaceholder(elm, config);
        break;
      case 'attribute':
        this.#applyAttributePlaceholder(elm, config, context.attributeName);
        break;
      case 'style':
        this.#applyStylePlaceholder(elm, config);
        break;
      case 'component':
        return this.#createComponentPlaceholder(config, context.componentName);
    }
  }
  
  #applyChildrenPlaceholder(elm, config) {
    elm.innerHTML = '';
    let placeholder;    
    if (config.children) {
      placeholder = this.render(config.children);
    } else {
      placeholder = this.#createElm('div');
      placeholder.className = config.className;
      placeholder.textContent = config.text;
      if (config.style) placeholder.style.cssText = config.style;
    }    
    elm.appendChild(placeholder);
    this.placeholders.set(elm, { 
      type: 'children', 
      placeholder,
      originalContent: elm._jurisLastChildren 
    });
  }
  
  #applyTextPlaceholder(elm, config) {
    let originalText = elm.textContent;
    elm.textContent = config.text;
    elm.classList.add(config.className);
    if (config.style) {
      elm.setAttribute('data-jos', elm.style.cssText);
      elm.style.cssText = config.style;
    }
    this.placeholders.set(elm, { 
      type: 'text', 
      originalText,
      hadStyle: !!config.style 
    });
  }
  
  #applyAttributePlaceholder(elm, config, attributeName) {
    elm.classList.add(config.className);
    if (attributeName) {
      let originalValue = elm.getAttribute(attributeName);
      elm.setAttribute(attributeName, 'loading');
      this.placeholders.set(elm, { 
        type: 'attribute',
        attributeName,
        originalValue 
      });
    }
  }
  
  #applyStylePlaceholder(elm, config) {
    elm.classList.add(config.className);
    let originalStyle = elm.style.cssText;
    if (config.style) {
      elm.style.cssText = config.style;
    }
    this.placeholders.set(elm, { 
      type: 'style',
      originalStyle 
    });
  }
  
  #createComponentPlaceholder(config, componentName) {
    let placeholder = this.#createElm('div');
    placeholder.className = config.className;
    placeholder.textContent = componentName ? `Loading ${componentName}...` : config.text;
    if (config.style) placeholder.style.cssText = config.style;
    placeholder.setAttribute('data-jp', 'component');
    return placeholder;
  }
  
  #removePlaceholder(elm) {
    let placeholderData = this.placeholders.get(elm);
    if (!placeholderData) return;    
    let config = this._getPlaceholderConfig(elm);
    elm.classList.remove(config.className);    
    switch(placeholderData.type) {
      case 'children':
        if (placeholderData.placeholder && placeholderData.placeholder.parentNode === elm) {
          elm.removeChild(placeholderData.placeholder);
        }
        break;        
      case 'text':
        if (placeholderData.hadStyle) {
          let originalStyle = elm.getAttribute('data-jos');
          elm.style.cssText = originalStyle || '';
          elm.removeAttribute('data-jos');
        }
        break;        
      case 'style':
        elm.style.cssText = placeholderData.originalStyle || '';
        break;
    }    
    this.placeholders.delete(elm);
  }
  
  #applyErrorState(elm, type, error, context = {}) {
    let config = this._getPlaceholderConfig(elm);
    this.#removePlaceholder(elm);    
    let errorMessage = `Error: ${error.message}`;    
    switch(type) {
      case 'children':
      case 'reactive-children':
      case 'fragment-child':
        elm.innerHTML = `<div class="${config.errorClassName}" style="${config.errorStyle}">${errorMessage}</div>`;
        break;        
      case 'text':
        elm.textContent = errorMessage;
        elm.classList.add(config.errorClassName);
        if (config.errorStyle) elm.style.cssText = config.errorStyle;
        break;        
      case 'attribute':
        elm.classList.add(config.errorClassName);
        if (context.attributeName) {
          elm.setAttribute(context.attributeName, 'error');
          elm.setAttribute('data-juris-error', errorMessage);
        }
        break;        
      case 'style':
        elm.classList.add(config.errorClassName);
        if (config.errorStyle) elm.style.cssText = config.errorStyle;
        break;
    }
  }
  
  #createReactiveHandler(elm, getValue, updateDom, options = {}) {
  let lastValue = options.trackChanges ? null : undefined;
  let isInitialized = false;

  let update = () => {
    try {
      let result = getValue();
      if (!this.#isPromiseLike(result)) {
        if (!options.trackChanges || !isInitialized || !deepEquals(result, lastValue)) {
          updateDom(result);
          if (options.trackChanges) {
            lastValue = result;
            isInitialized = true;
          }
        }
        return result;
      }
      let asyncContext = {
        elm,
        type: options.type || 'generic',
        attributeName: options.attributeName
      };
      return this.#handleAsync(result, {
        onResolved: (resolved) => {
          if (!options.trackChanges || !isInitialized || !deepEquals(resolved, lastValue)) {
            updateDom(resolved);
            if (options.trackChanges) {
              lastValue = resolved;
              isInitialized = true;
            }
          }
        },
        onError: (error) => {
          if (options.onError) {
            options.onError(error);
          }
          log.ee && console.error(log.e(`Reactive ${options.name} failed`, {element: elm.tagName,elementId: elm.id,type: options.type,error: error.message,stack: error.stack?.split('\n').slice(0, 3).join('\n')}, 'app'));
        }
      }, asyncContext);
    } catch (error) {
      log.ee && console.error(log.e(`Reactive ${options.name} execution failed`, {element: elm.tagName,elementId: elm.id,type: options.type,error: error.message,stack: error.stack?.split('\n').slice(0, 3).join('\n')}, 'app'));
      if (options.onError) {
        options.onError(error);
      }
    }
  };

  return update;
}
  
  #extractKey(vnode, index) {
    if (_isSt(vnode) || _isNu(vnode) || !vnode) {
      return null;
    }
    if (Array.isArray(vnode)) {
      return null;
    }
    if (_isOb(vnode)) {
      let tagName = Object.keys(vnode)[0];
      let props = vnode[tagName];
      return props?.key ?? null;
    }
    return null;
  }
  
  #diffChildren(parent, oldChildren, newChildren) {
    if (oldChildren.length === 0 && newChildren.length === 0) return;    
    let operations = [];
    let oldKeyMap = new Map();
    let newKeyMap = new Map();
    let usedKeys = new Set();    
    let oldNodes = Array.from(parent.childNodes);
    oldNodes.forEach((node, index) => {
      let key = this.nodeKeys.get(node);
      if (key !== undefined) {
        oldKeyMap.set(key, { node, index });
      } else {
        oldKeyMap.set(`__index_${index}`, { node, index });
      }
    });    
    for (let i = 0; i < newChildren.length; i++) {
      let child = newChildren[i];
      let key = this.#extractKey(child, i) ?? `__index_${i}`;      
      if (usedKeys.has(key) && !key.startsWith('__index_')) {
        log.ew && console.warn(log.w(
          `Duplicate key "${key}" detected. Keys must be unique among siblings.`,
          { parent: parent.tagName, key },
          'frk'
        ));
        let fallbackKey = `__index_${i}`;
        newKeyMap.set(fallbackKey, { child, index: i });
        operations.push({ type: 'create', child, index: i, key: fallbackKey });
      } else {
        usedKeys.add(key);
        newKeyMap.set(key, { child, index: i });        
        if (oldKeyMap.has(key)) {
          let oldEntry = oldKeyMap.get(key);
          if (this.#shouldUpdateNode(oldEntry.node, child)) {
            operations.push({ type: 'update', node: oldEntry.node, child, index: i, key });
          }
          if (oldEntry.index !== i) {
            operations.push({ type: 'move', node: oldEntry.node, from: oldEntry.index, to: i, key });
          }
        } else {
          operations.push({ type: 'create', child, index: i, key });
        }
      }
    }    
    oldKeyMap.forEach((entry, key) => {
      if (!newKeyMap.has(key)) {
        operations.push({ type: 'remove', node: entry.node, key });
      }
    });    
    this.#executeChildOperations(parent, operations, newChildren);
  }
  
  #shouldUpdateNode(node, vnode) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent !== String(vnode);
    }
    return node.nodeType === Node.ELEMENT_NODE;
  }
  
  #executeChildOperations(parent, operations, newChildren) {
    operations.filter(op => op.type === 'remove').forEach(op => {
      if (op.node.parentNode === parent) {
        parent.removeChild(op.node);
        this.nodeKeys.delete(op.node);
        this.cleanup(op.node);
      }
    });    
    let createdNodes = new Map();
    operations.filter(op => op.type === 'create').forEach(op => {
      let newNode = this.#createChild(op.child);
      if (newNode) {
        createdNodes.set(op.key, newNode);
        if (_isSt(op.key) && !op.key.startsWith('__')) {
          this.nodeKeys.set(newNode, op.key);
        }
      }
    });
    operations.filter(op => op.type === 'update').forEach(op => {
      this.#updateExistingNode(op.node, op.child);
    });
    let targetOrder = [];
    newChildren.forEach((child, index) => {
      let key = this.#extractKey(child, index) ?? `__index_${index}`;
      let existingOp = operations.find(op => op.key === key && (op.type === 'update' || op.type === 'move'));
      if (existingOp) {
        targetOrder.push(existingOp.node);
      } else if (createdNodes.has(key)) {
        targetOrder.push(createdNodes.get(key));
      }
    });        
    this.#reorderNodes(parent, targetOrder);
  }
  
  #updateExistingNode(node, vnode) {
    if (node.nodeType === Node.TEXT_NODE) {
      let newContent = String(vnode);
      if (node.textContent !== newContent) {
        node.textContent = newContent;
      }
      return;
    }    
    if (node.nodeType === Node.ELEMENT_NODE && _isOb(vnode) && !Array.isArray(vnode)) {
      let tagName = Object.keys(vnode)[0];
      let props = vnode[tagName] || {};
      let subscriptions = [];            
      for (let key in props) {
        if (key === 'key') continue;
        let cleanup = this.applyProp(node, key, props[key]);
        if (_isFN(cleanup)) {
          subscriptions.push(cleanup);
        }
      }            
      if (subscriptions.length > 0) {
        let existing = this.subscriptions.get(node) || { subscriptions: [], eventListeners: [] };
        existing.subscriptions.push(...subscriptions);
        this.subscriptions.set(node, existing);
      }
    }
  }
  
  #reorderNodes(parent, targetOrder) {
    let lastNode = null;        
    for (let i = targetOrder.length - 1; i >= 0; i--) {
      let targetNode = targetOrder[i];
      if (!targetNode) continue;            
      if (targetNode.parentNode === parent) {
        if (lastNode && targetNode.nextSibling !== lastNode) {
          parent.insertBefore(targetNode, lastNode);
        } else if (!lastNode && targetNode !== parent.lastChild) {
          parent.appendChild(targetNode);
        }
      } else {
        if (lastNode) {
          parent.insertBefore(targetNode, lastNode);
        } else {
          parent.appendChild(targetNode);
        }
      }
      lastNode = targetNode;
    }
  }
  
  render(vnode, componentName = null, returnObjectTree = false, targetContainer = null) {
    if (_isSt(vnode) || _isNu(vnode)) {
      return document.createTextNode(String(vnode));
    }
    if (this._testMode && returnObjectTree && this.objTreeAnalyzer) {
      return this.objTreeAnalyzer.buildObjectTree(vnode, componentName);
    }
    return this._renderToDOM(vnode, componentName, targetContainer);
  }
  
  _renderToDOM(vnode, componentName = null, targetContainer = null) {
    if (_isSt(vnode) || _isNu(vnode)) {
      return document.createTextNode(String(vnode));
    }        
    if (!vnode || typeof vnode !== 'object') return null;//not for _isOb
    if (Array.isArray(vnode)) {
      return this.#createArrayFragment(vnode, componentName);
    }        
    let tagName = Object.keys(vnode)[0];
    let props = vnode[tagName] || {};        
    if (this.componentStack.includes(tagName)) {
      return this.#newErrElm('recursion', [...this.componentStack, tagName].join(' → '));
    }        
    if (this.juris.getCM().components.has(tagName)) {
      return this.#renderComponent(tagName, props, targetContainer);
    }        
    if (/^[A-Z]/.test(tagName)) {
      return this.#newErrElm('component', `Component "${tagName}" not registered`);
    }        
    if (!_isSt(tagName) || tagName.length === 0) return null;        
    let modifiedProps = props;
    if (props.style && this.cssExtractor) {
      let elementName = componentName || tagName;
      modifiedProps = this.cssExtractor.processProps(props, elementName, this);
    }        
    return this.#createElement(tagName, modifiedProps, componentName);
  }
  
  #createElement(tagName, props, componentName = null) {
    let elm = this.#createElementByType(tagName);
    let allSubscriptions = [];        
    for (let key in props) {
      if (!props.hasOwnProperty(key) || key === 'key') continue;
      let cleanup = this.applyProp(elm, key, props[key], componentName);
      if (_isFN(cleanup)) {
        allSubscriptions.push(cleanup);
      }
    }        
    if (allSubscriptions.length > 0) {
      let existing = this.subscriptions.get(elm) || { subscriptions: [], eventListeners: [] };
      existing.subscriptions.push(...allSubscriptions);
      this.subscriptions.set(elm, existing);
    }        
    return elm;
  }
  #createSVG(tagName){
    return document.createElementNS("http://www.w3.org/2000/svg", tagName);
  }
  #createElm(tagName){
    return document.createElement(tagName);
  }
  #createFrg(){
    return document.createDocumentFragment();
  }
  #createElementByType(tagName) {
    let isSVG = this.elementTypeCache.get(tagName);
    if (isSVG === undefined) {
      try {
        let svgEl = this.#createSVG(tagName);
        let isCommonHTML = ['a', 'script', 'style', 'title'].includes(tagName);
        isSVG = !isCommonHTML && svgEl.constructor !== SVGElement;
        this.elementTypeCache.set(tagName, isSVG);
      } catch {
        isSVG = false;
        this.elementTypeCache.set(tagName, false);
      }
    }        
    return isSVG 
      ? this.#createSVG(tagName)
      : this.#createElm(tagName);
  }
  
  #createArrayFragment(vnode, componentName) {
    let hasReactiveFunctions = vnode.some(item => _isFN(item));
    let hasKeys = vnode.some(item => this.#extractKey(item) !== null);        
    if (hasReactiveFunctions || hasKeys) {
      let fragment = this.#createFrg();
      let subscriptions = [];            
      if (hasKeys && !hasReactiveFunctions) {
        for (let i = 0; i < vnode.length; i++) {
          let child = vnode[i];
          let childElement = this.render(child, componentName);
          if (childElement) {
            let key = this.#extractKey(child, i);
            if (key) {
              this.nodeKeys.set(childElement, key);
            }
            fragment.appendChild(childElement);
          }
        }
      } else {
        this.#handleReactiveFragmentChildren(fragment, vnode, subscriptions, componentName);
      }
      if (subscriptions.length > 0) {
        fragment._jurisCleanup = () => {
          subscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
        };
      }
      return fragment;
    }
    let fragment = this.#createFrg();
    for (let i = 0; i < vnode.length; i++) {
      let childElement = this.render(vnode[i], componentName);
      if (childElement) fragment.appendChild(childElement);
    }
    return fragment;
  }
  
  #renderComponent(tagName, props, targetContainer = null) {
    let componentFn = this.juris.getCM().components.get(tagName);
    if (!componentFn) {
      log.ee && console.error(log.e('Component not found', { name: tagName }, 'app'));
      return null;
    }    
    if (this.componentStack.includes(tagName)) {
      return this.#newErrElm('recursion', [...this.componentStack, tagName].join(' → '));
    }    
    this.componentStack.push(tagName);
    let { result, deps } = this.juris.getSM().track(() => 
      this.juris.getCM().create(tagName, props, targetContainer), true);
    this.componentStack.pop();    
    return result;
  }
  
  #newErrElm(type, message) {
    let elm = this.#createElm('div');
    elm.style.cssText = 'color: red; border: 1px solid red; padding: 8px; background: #ffe6e6; font-family: monospace;';
    elm.textContent = message;
    elm.setAttribute('data-juris-error', type);
    return elm;
  }
  
  applyProp(elm, propName, propValue, componentName = null) {
    let subscriptions = [];
    let eventListeners = [];    
    try {
      if (propName === 'onconnected') {
        elm._jurisOnConnected = propValue;
        this.pendingConnectedCallbacks.add(elm);
        return () => {
          this.pendingConnectedCallbacks.delete(elm);
          if (elm._jurisOnConnected) {
            delete elm._jurisOnConnected;
          }
        };
      } else if (propName === 'children' && propValue) {
        this._handleChildren(elm, propValue, subscriptions, componentName);
      } else if (propName === 'text') {
        this.#handleText(elm, propValue, subscriptions);
      } else if (propName === 'style') {
        this.#handleStyle(elm, propValue, subscriptions);
      } else if (propName.startsWith('on') && propValue) {
        this.#handleEvent(elm, propName, propValue, eventListeners);
      } else if (_isFN(propValue)) {
        this.#handleReactiveAttribute(elm, propName, propValue, subscriptions);
      } else if (this.#isPromiseLike(propValue) && propValue) {
        this.#handleAsyncProp(elm, propName, propValue);
      } else {
        this.#setStaticAttribute(elm, propName, propValue);
      }
      
      if (subscriptions.length > 0 || eventListeners.length > 0) {
        let existing = this.subscriptions.get(elm) || { subscriptions: [], eventListeners: [] };
        existing.subscriptions.push(...subscriptions);
        existing.eventListeners.push(...eventListeners);
        this.subscriptions.set(elm, existing);
      }
      
      return () => {
        subscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
        eventListeners.forEach(({eventName, handler}) => {
          try { elm.removeEventListener(eventName, handler); } catch(e) {}
        });
      };
    } catch (error) {
      log.ee && console.error(log.e('Property application failed', {element: elm.tagName,elementId: elm.id,property: propName,valueType: typeof propValue,componentName, error: error.message, stack: error.stack?.split('\n').slice(0, 3).join('\n')}, 'app'));
      return () => {};
    }
  }

  _processPendingConnectedCallbacks() {
    this.pendingConnectedCallbacks.forEach(elm => {
      if (elm.isConnected && elm._jurisOnConnected) {
        try {
          elm._jurisOnConnected.call(elm, { 
            type: 'connected', 
            target: elm,
            timeStamp: Date.now()
          });
        } catch (error) {
          log.ee && console.error(log.e('onconnected callback error:', error), 'app');
        }
      }
    });
    this.pendingConnectedCallbacks.clear();
  }

  #handleAsyncProp(elm, propName, propValue) {
    let asyncContext = {elm,type: 'attribute',attributeName: propName};    
    if (propName === 'innerHTML') {
      asyncContext.type = 'children';
      return this.#handleAsync(propValue, {
        onResolved: (resolved) => {
          elm.innerHTML = resolved;
        }
      }, asyncContext);
    }    
    return this.#handleAsync(propValue, {
      onResolved: (resolved) => {
        this.#setStaticAttribute(elm, propName, resolved);
      }
    }, asyncContext);
  }
  
  #attachRecompute(elm, propName, reactiveFn, updateDom) {
    if (!elm.$) {
      elm.$ = {};
    }    
    if (propName.startsWith('style_')) {
      if (!elm.$.style) elm.$.style = {};
      let styleProp = propName.substring(6);
      elm.$.style[styleProp] = (options = {}) => {
        let value = reactiveFn(elm, options);
        updateDom(value);
        return value;
      };
    } else {
      elm.$[propName] = (options = {}) => {
        let value = reactiveFn(elm, options);
        updateDom(value);
        return value;
      };
    }
  }
  
  #handleText(elm, text, subscriptions) {
    if (_isFN(text)) {
      try {
        let {result, deps} = this.juris.getSM().track(() => text(elm));
        elm.textContent = result;
        this.#attachRecompute(elm, 'text', text, (value) => {
          elm.textContent = value;
        });
        if(deps.size === 0) {
          return;
        }
        let updateText = this.#createReactiveHandler(
          elm,
          () => text(elm),
          (value) => { elm.textContent = value; },
          { trackChanges: true, name: 'text', type: 'text' }
        );
        this._createReactiveUpdate(elm, updateText, subscriptions, deps);
      } catch (error) {
        log.ee && console.error(log.e('Reactive text function failed', {element: elm.tagName,elementId: elm.id,error: error.message, stack: error.stack?.split('\n').slice(0, 3).join('\n')}, 'app'));
        elm.textContent = `Error: ${error.message}`;
      }
    } else if (this.#isPromiseLike(text)) {
      let asyncContext = { elm, type: 'text' };
      this.#handleAsync(text, {
        onResolved: (resolved) => {
          elm.textContent = resolved;
        }
      }, asyncContext);
    } else {
      elm.textContent = text;
    }
  }
  
  #handleStyle(elm, style, subscriptions) {
    if (_isFN(style)) {
      try {
        let {result, deps} = this.juris.getSM().track(() => {
          let value = style.length > 0 ? style(elm) : style();
          if (this.cssExtractor?.postProcessReactiveResult && _isOb(value)) {
            value = this.cssExtractor.postProcessReactiveResult(value, 'reactive', elm);
          }
          return value;
        });
        if (_isOb(result)) {
          Object.assign(elm.style, result);
        }
        this.#attachRecompute(elm, 'style', style, (value) => {
          if (_isOb(value)) {
            Object.assign(elm.style, value);
          }
        });
        if (deps.size === 0) {
          return;
        }
        let updateStyle = this.#createReactiveHandler(
          elm,
          () => {
            let value = style.length > 0 ? style(elm) : style();
            if (this.cssExtractor?.postProcessReactiveResult && _isOb(value)) {
              value = this.cssExtractor.postProcessReactiveResult(value, 'reactive', elm);
            }
            return value;
          },
          (value) => {
            if (_isOb(value)) {
              Object.assign(elm.style, value);
            }
          },
          { trackChanges: true, name: 'style', type: 'style' }
        );
        this._createReactiveUpdate(elm, updateStyle, subscriptions, deps);
      } catch (error) {
        log.ee && console.error(log.e('Style Error', {element: elm.tagName,elementId: elm.id,error: error.message, stack: error.stack?.split('\n').slice(0, 3).join('\n')}, 'app'));
      }
    } else if (this.#isPromiseLike(style)) {
      let asyncContext = { elm, type: 'style' };
      this.#handleAsync(style, {
        onResolved: (resolved) => {
          if (_isOb(resolved)) {
            Object.assign(elm.style, resolved);
          }
        }
      }, asyncContext);
    } else if (_isOb(style)) {
      try {
        for (let prop in style) {
          if (style.hasOwnProperty(prop)) {
            let val = style[prop];
            if (_isFN(val)) {
              this.#handleReactiveStyleProperty(elm, prop, val, subscriptions);
            } else {
              this.#setStyleProperty(elm, prop, val);
            }
          }
        }
      } catch (error) {
        log.ee && console.error(log.e('Style Error', {element: elm.tagName,elementId: elm.id,error: error.message, stack: error.stack?.split('\n').slice(0, 3).join('\n')}, 'app'));
      }
    }
  }
  
  #handleReactiveStyleProperty(elm, prop, valueFn, subscriptions) {
    try {
      let {result, deps} = this.juris.getSM().track(() => valueFn(elm));
      this.#setStyleProperty(elm, prop, result);
      this.#attachRecompute(elm, `style_${prop}`, valueFn, (value) => {
        this.#setStyleProperty(elm, prop, value);
      });
      if (deps.size === 0) {
        return;
      }
      let updateStyleProperty = this.#createReactiveHandler(
        elm,
        () => valueFn(elm),
        (value) => this.#setStyleProperty(elm, prop, value),
        { trackChanges: true, name: `style.${prop}`, type: 'style' }
      );
      this._createReactiveUpdate(elm, updateStyleProperty, subscriptions, deps);
    } catch (error) {
      element._jurisError={error};
      element.style.borderColor='red';
      element.title=error.message;
      log.ee && console.error(log.e(prop + ' style Error', {element: elm.tagName, elementId: elm.id, property: prop, error: error.message, stack: error.stack?.split('\n').slice(0, 3).join('\n')}, 'app'));
    }
  }
  
  #handleReactiveAttribute(elm, attr, valueFn, subscriptions) {
    try {
      let {result, deps} = this.juris.getSM().track(() => valueFn(elm));
      this.#setStaticAttribute(elm, attr, result);
      this.#attachRecompute(elm, attr, valueFn, (value) => {
        this.#setStaticAttribute(elm, attr, value);
      });
      if (deps.size === 0) {
        return;
      }
      let updateAttribute = this.#createReactiveHandler(
        elm,
        () => valueFn(elm),
        (value) => this.#setStaticAttribute(elm, attr, value),
        { trackChanges: true, name: `attribute '${attr}'`, type: 'attribute', attributeName: attr }
      );
      this._createReactiveUpdate(elm, updateAttribute, subscriptions, deps);
    } catch (error) {
      log.ee && console.error(log.e(attr +' attribute error', {element: elm.tagName, elementId: elm.id, attribute: attr, error: error.message, stack: error.stack?.split('\n').slice(0, 3).join('\n')}, 'app'));
    }
  }
  
  _handleChildren(elm, children, subscriptions, componentName = null) {
    if (_isFN(children)) {
      try {
        let {result, deps} = this.juris.getSM().track(() => {
          let value = children(elm);
          return Array.isArray(value) ? value : [value];
        });
        if (result !== "ignore") {
          if (_isSt(result) || _isNu(result)) {
            elm.textContent = String(result);
          } else {
            this.#updateChildren(elm, result, componentName);
          }
        }
        this.#attachRecompute(elm, 'children', children, (result) => {
          if (result !== "ignore") {
            if (_isSt(result) || _isNu(result)) {
              elm.textContent = String(result);
            } else {
              this.#updateChildren(elm, result, componentName);
            }
          }
        });
        if (deps.size === 0) {
          return;
        }
        let updateChildren = this.#createReactiveHandler(
          elm,
          () => {
            let value = children(elm);
            return Array.isArray(value) ? value : [value];
          },
          (result) => {
            if (result !== "ignore") {
              if (_isSt(result) || _isNu(result)) {
                elm.textContent = String(result);
              } else {
                this.#updateChildren(elm, result, componentName);
              }
            }
          },
          { trackChanges: false, name: 'children', type: 'reactive-children' }
        );
        this._createReactiveUpdate(elm, updateChildren, subscriptions, deps);
      } catch (error) {
        log.ee && console.error(log.e('children error', {element: elm.tagName, elementId: elm.id, componentName, error: error.message, stack: error.stack?.split('\n').slice(0, 3).join('\n') }, 'app'));
        elm.textContent = `Error rendering children: ${error.message}`;
      }
    } else if (this.#isPromiseLike(children)) {
      let asyncContext = { elm, type: 'children' };
      this.#handleAsync(children, {
        onResolved: (resolved) => {
          this.#updateChildren(elm, resolved, componentName);
        },
        onError: (error) => {
          log.ee && console.error(log.e('Async children error', {element: elm.tagName,elementId: elm.id,componentName,error: error.message}, 'app'));
        }
      }, asyncContext);
    } else {
      try {
        this.#updateChildren(elm, children, componentName);
      } catch (error) {
        log.ee && console.error(log.e('Children error', {element: elm.tagName,elementId: elm.id,componentName,error: error.message, stack: error.stack?.split('\n').slice(0, 3).join('\n')}, 'app'));
      }
    }
  }
  
  #updateChildren(elm, children, componentName = null) {
    if (children === "ignore") return;
    if(!Array.isArray(children)){
      children = [children];
    }
    let lastChildren = elm._jurisLastChildren;
    if (lastChildren === children) {
      return;
    }
    if (!elm._jurisChildrenKeyed) {
      elm._jurisChildrenKeyed = children.some(child => this.#extractKey(child) !== null);
    }    
    if (elm._jurisChildrenKeyed && lastChildren && Array.isArray(lastChildren)) {
      this.#diffChildren(elm, lastChildren, children);
    } else {
      this.#renderChildren(elm, children, componentName);
    }    
    elm._jurisLastChildren = children;
  }

  #handleReactiveFragmentChildren(fragment, children, subscriptions, componentName) {
    for (let i = 0; i < children.length; i++) {
      let child = children[i];
      if (_isFN(child)) {
        let { node, cleanup } = this.#createIndividualReactiveChild(child, i, componentName, fragment);
        if (node) {
          fragment.appendChild(node);
          subscriptions.push(cleanup);
        }
      } else if (child != null) {
        let childElement = this.#createChild(child, componentName);
        if (childElement) {
          let key = this.#extractKey(child, i);
          if (key) {
            this.nodeKeys.set(childElement, key);
          }
          fragment.appendChild(childElement);
        }
      }
    }
  }  
  
  #createIndividualReactiveChild(childFn, index, componentName, parentElement) {
    let config = this._getPlaceholderConfig(parentElement);
    let currentNode = document.createTextNode('');
    let subscriptions = [];        
    let updateThisChild = () => {
      subscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
      subscriptions = [];            
      let { result, deps } = this.juris.getSM().track(() => childFn(parentElement));
      if (this.#isPromiseLike(result)) {
        this.#handleAsync(result, {
          onStart: () => {
            let placeholder = this.#createElm('span');
            placeholder.textContent = config.text;
            placeholder.className = config.className;
            if (config.style) placeholder.style.cssText = config.style;            
            if (currentNode.parentNode) {
              currentNode.parentNode.replaceChild(placeholder, currentNode);
            }
            currentNode = placeholder;
          },
          onResolved: (resolved) => {
            let newNode = this.#createChild(resolved, componentName) || document.createTextNode('');
            if (currentNode.parentNode) {
              currentNode.parentNode.replaceChild(newNode, currentNode);
            }
            currentNode = newNode;
          },
          onError: (error) => {
            let errorNode = this.#createElm('span');
            errorNode.className = config.errorClassName;
            errorNode.textContent = `Error: ${error.message}`;
            if (currentNode.parentNode) {
              currentNode.parentNode.replaceChild(errorNode, currentNode);
            }
            currentNode = errorNode;
          }
        });
      } else {
        try {
          let newNode = this.#createChild(result, componentName) || document.createTextNode('');
          if (currentNode.parentNode) {
            currentNode.parentNode.replaceChild(newNode, currentNode);
          }
          currentNode = newNode;
        } catch (error) {
          let errorNode = this.#createElm('span');
          errorNode.className = config.errorClassName;
          errorNode.textContent = `Error: ${error.message}`;
          if (currentNode.parentNode) {
            currentNode.parentNode.replaceChild(errorNode, currentNode);
          }
          currentNode = errorNode;
        }
      }
      deps.forEach(path => {
        let unsub = this.juris.getSM().subscribeInternal(path, updateThisChild);
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
  
  #createChild(child, componentName) {
    try {
      if (child == null) return null;
      if (_isSt(child) || _isNu(child)) {
        return document.createTextNode(String(child));
      }
      if (Array.isArray(child)) {
        let fragment = this.#createFrg();
        for (let i = 0; i < child.length; i++) {
          let subChild = this.#createChild(child[i], componentName);
          if (subChild) fragment.appendChild(subChild);
        }
        return fragment.hasChildNodes() ? fragment : null;
      }
      if (_isOb(child)) {
        let tagName = Object.keys(child)[0];
        let props = child[tagName] || {};
        if (this.juris.getCM().components.has(tagName)) {
          let tempContainer = this.#createElm('div');
          let result = this.#renderComponent(tagName, props, tempContainer);
          if (tempContainer.firstChild) {
            let extractedFragment = this.#createFrg();
            while (tempContainer.firstChild) {
              extractedFragment.appendChild(tempContainer.firstChild);
            }
            return extractedFragment;
          } else if (result) {
            return result;
          }
          return null;
        }
        return this.render(child, componentName);
      }
      return null;
    } catch (error) {
      log.ee && console.error(log.e('Child creation failed', {childType: typeof child,componentName,error: error.message, stack: error.stack?.split('\n').slice(0, 3).join('\n') }, 'app'));
      return document.createTextNode(`Error: ${error.message}`);
    }
  }
  
  #renderChildren(elm, children, componentName) {
    elm.textContent = '';
    let fragment = this.#createFrg();
    let cleanupFunctions = [];
    for (let i = 0; i < children.length; i++) {
      let child = children[i];      
      if (_isFN(child)) {
        let { node, cleanup } = this.#createIndividualReactiveChild(child, i, componentName, elm);
        if (node) {
          fragment.appendChild(node);
          cleanupFunctions.push(cleanup);
        }
      } else if (child != null) {
        let childElement = this.#createChild(child, componentName);
        if (childElement) {
          let key = this.#extractKey(child, i);
          if (key) this.nodeKeys.set(childElement, key);
          fragment.appendChild(childElement);
        }
      }
    }
    if (fragment.hasChildNodes()) elm.appendChild(fragment);    
    if (cleanupFunctions.length > 0) {
      elm._reactiveCleanup = () => {
        cleanupFunctions.forEach(cleanup => { try { cleanup(); } catch(e) {} });
      };
    }
  }
  
  #setStyleProperty(elm, prop, value) {
    if (prop.startsWith('--')) {
      elm.style.setProperty(prop, value);
    } else {
      elm.style[prop] = value;
    }
  }
  
  #setStaticAttribute(elm, attr, value) {
    try {
      if (this.SKIP_ATTRS.has(attr)) return;
      if (this.BOOLEAN_ATTRS.has(attr)) {
        let boolValue = value && value !== 'false';
        if (boolValue) {
          elm.setAttribute(attr,'');
        } else {
          elm.removeAttribute(attr);
        }
        if (attr in elm) {
          elm[attr] = boolValue;
        }
        return;
      }
      if (elm.namespaceURI === 'http://www.w3.org/2000/svg') {
        elm.setAttribute(attr, value);
        return;
      }
      const READ_ONLY_ATTRS = new Set(['list', 'form', 'labels']);
      if (READ_ONLY_ATTRS.has(attr)) {
        elm.setAttribute(attr, value);
        return;
      }
      let firstChar = attr.charCodeAt(0);
      if ((firstChar === 100 && attr.charCodeAt(4) === 45) ||
          (firstChar === 97 && attr.charCodeAt(4) === 45) ||
          attr.indexOf('-') !== -1 ||
          attr.indexOf(':') !== -1) {
        elm.setAttribute(attr, value);
        return;
      }
      if (attr in elm && !_isFN(elm[attr])) {
        try {
          elm[attr] = value;
        } catch (error) {
          elm.setAttribute(attr, value);
        }
      } else {
        elm.setAttribute(attr, value);
      }
    } catch (error) {
      log.ee && console.error(log.e('Attribute setting failed', {element: elm.tagName, elementId: elm.id, attribute: attr, value: typeof value === 'object' ? JSON.stringify(value) : value, error: error.message}, 'app'));
    }
  }
  
  #handleEvent(elm, eventName, handler, eventListeners) {
  if (eventName === 'onconnected') {
    elm._jurisOnConnected = handler;
    return;
  }
  eventName = eventName.toLowerCase();
  let actualEventName = eventName === 'onclick' ? 'click' :   eventName === 'ondoubleclick' ? 'dblclick' :
                         eventName.slice(2);  
  const wrappedHandler = (e) => {
    try {
      return handler(e);
    } catch (error) {
      log.ee && console.error(log.e('Event handler failed', {eventType: actualEventName,element: elm.tagName,elementId: elm.id,error: error.message, stack: error.stack?.split('\n').slice(0, 5).join('\n')}, 'app'));
    }
  };
  elm.addEventListener(actualEventName, wrappedHandler);
  eventListeners.push({ eventName: actualEventName, handler: wrappedHandler });
  if (eventName === 'onclick') {
    this.#attachTouchSupport(elm, wrappedHandler, eventListeners);
  }
}
  
  #attachTouchSupport(elm, handler, eventListeners) {
    if (!/Mobi|Android/i.test(navigator.userAgent)) return;    
    let touchState = { startTime: 0, moved: false, startX: 0, startY: 0 };    
    let touchStart = e => {
      touchState.startTime = Date.now();
      touchState.moved = false;
      if (e.touches?.[0]) {
        touchState.startX = e.touches[0].clientX;
        touchState.startY = e.touches[0].clientY;
      }
    };    
    let touchMove = e => {
      if (e.touches?.[0]) {
        let deltaX = Math.abs(e.touches[0].clientX - touchState.startX);
        let deltaY = Math.abs(e.touches[0].clientY - touchState.startY);
        if (deltaX > this.TOUCH_CONFIG.moveThreshold || deltaY > this.TOUCH_CONFIG.moveThreshold) {
          touchState.moved = true;
        }
      }
    };    
    let touchEnd = e => {
      if (!touchState.moved && Date.now() - touchState.startTime < this.TOUCH_CONFIG.timeThreshold) {
        e.preventDefault();
        handler(e);
      }
    };    
    let touchEvents = [
      { name: 'touchstart', handler: touchStart, options: { passive: true }},
      { name: 'touchmove', handler: touchMove, options: { passive: true }},
      { name: 'touchend', handler: touchEnd, options: { passive: false }}
    ];    
    touchEvents.forEach(({name, handler, options}) => {
      elm.addEventListener(name, handler, options);
      eventListeners.push({ eventName: name, handler });
    });
  }
  
  _createReactiveUpdate(elm, updateFn, subscriptions, deps = null) {
    let actualDeps = deps || this.juris.getSM().track(() => updateFn(elm)).deps;
    actualDeps.forEach(path => {
      let unsub = this.juris.getSM().subscribeInternal(path, updateFn);
      subscriptions.push(unsub);
    });
  }
  
  updateElementContent(elm, newContent) {
    this.#updateChildren(elm, [newContent]);
  }
  
  setupIndicators(elementId, config) {
    this.placeholderConfigs.set(elementId, { 
      ...this.defaultPlaceholder, 
      ...config 
    });
  }
  
  _hasAsyncProps(props) {
    for (let key in props) {
      if (props.hasOwnProperty(key) && !key.startsWith('on') && this.#isPromiseLike(props[key])) {
        return true;
      }
    }
    return false;
  }
  
  _getPlaceholderConfig(elm) {
    if (elm?.id && this.placeholderConfigs.has(elm.id)) {
      return this.placeholderConfigs.get(elm.id);
    }    
    let current = elm?.parentElement;
    while (current) {
      if (current.id && this.placeholderConfigs.has(current.id)) {
        return this.placeholderConfigs.get(current.id);
      }
      current = current.parentElement;
    }    
    return this.defaultPlaceholder;
  }
  
  #isPromiseLike(value) {
    return value?.then;
  }
  
  cleanup(elm) {
    this.juris.getCM().cleanup(elm);
    this.nodeKeys.delete(elm);    
    if (this.keyedNodes.has(elm)) {
      this.keyedNodes.delete(elm);
    }    
    let data = this.subscriptions.get(elm);
    if (data) {
      if (data.subscriptions) {
        data.subscriptions.forEach(unsub => { try { unsub(); } catch(e) {} });
      }
      if (data.eventListeners) {
        data.eventListeners.forEach(({eventName, handler}) => {
          try { elm.removeEventListener(eventName, handler); } catch(e) {}
        });
      }
      this.subscriptions.delete(elm);
    }    
    if (elm._reactiveCleanup) {
      try { elm._reactiveCleanup(); } catch(e) {}
      elm._reactiveCleanup = null;
    }    
    if (this.placeholders.has(elm)) {
      this.placeholders.delete(elm);
    }    
    try {
      let children = elm.children;
      for (let i = 0; i < children.length; i++) {
        try { this.cleanup(children[i]); } catch(e) {}
      }
    } catch(e) {}
  }
  
  clearCSSCache() {
    if (_isFN(this.cssExtractor)) {
      this.cssExtractor.clearCache();
    }
  }
  
  attachObjectTreeAnalyzer(analyzer) {
    this.objTreeAnalyzer = analyzer;
    return this.objTreeAnalyzer;
  }
  
  setTestMode(enabled = true) {
    this._testMode = enabled;
    return this._testMode;
  }
  
  isTestMode() {
    return this._testMode;
  }
  
  getObjectTree() {
    return this.objTreeAnalyzer?.getObjectTree() || null;
  }
}

class Juris {
    static #inGlobal = false;
    constructor(config = {}) {
        if (config.logLevel) {
            this.setupLogging(config.logLevel);
        }
        this.contextTemplate = null;
        this.contextCache = new Map();
        this.services = config.services || {};
        this.layout = config.layout;        
        this.stateManager = new StateManager(config.states || {}, config.middleware || []);
        this.componentManager = new ComponentManager(this);
        this.domRenderer = new DOMRenderer(this);
        this.armedElements = new Map();
        let features = config.features || {};
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
            this.getDR().cssExtractor = new features.cssExtractor();
        }
        if (features.compute) {
            let computeOptions = config.computeOptions || {};
            let computePlugin = new features.compute(this.stateManager, computeOptions);
            this.stateManager.addPlugin('compute', computePlugin);
            log.ei && console.info(log.i('Compute plugin initialized', { options: computeOptions }, 'frk'));
        }
        if (config.headlessComponents && this.getHM()) {
            Object.keys(config.headlessComponents).forEach(name => {
                const componentConfig = config.headlessComponents[name];
                if (_isFN(componentConfig)) {
                    this.getHM().register(name, componentConfig);
                } else {
                    this.getHM().register(name, componentConfig.fn, componentConfig.options);
                }
            });
        }
        if (config.placeholders) {
            const elementIds = Object.keys(config.placeholders);
            for (let i = 0; i < elementIds.length; i++) {
                const elementId = elementIds[i];
                const placeholderConfig = config.placeholders[elementId];
                this.getDR().setupIndicators(elementId, placeholderConfig);
            }
        }
        if (config.defaultPlaceholder) {
            this.getDR().defaultPlaceholder = { ...this.getDR().defaultPlaceholder, ...config.defaultPlaceholder };
        }
        if (this.getHM()) {
            this.getHM().initializeQueued();
        }
        if (config.components) {
            Object.keys(config.components).forEach(name => {
                this.getCM().register(name, config.components[name]);
            });
        }        
        if (config.webComponents && this.webComponentFactory) {
            this.webComponentFactory.createMultiple(config.webComponents, config.webComponentOptions || {});
        }
        if (typeof requestIdleCallback === 'undefined') { 
            window.requestIdleCallback = function (callback, options) { 
                let start = Date.now(); 
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

    getDR() { return this.domRenderer; }
    
    getSM() { return this.stateManager; }

    getHM() { return this.headlessManager; }
    
    getCM() { return this.componentManager; }
    
    getComponentAPI(name) { return this.getCM().getComponentAPI(name); }


    getComponentElement(name) {return this.getCM().getComponentElement(name); }
    
    getNamedComponents() { return this.getCM().getNamedComponents();}

    compileTemplates(templates = null) {
        if (!this.templateCompiler) {
            log.ew && console.warn(log.w('Template compilation requested but templateCompiler not available'), 'frk');
            return;
        }
        let templateElements = templates || document.querySelectorAll('template[data-component]');
        let components = this.templateCompiler.compileTemplates(templateElements);
        Object.keys(components).forEach(name => {
            this.registerComponent(name, components[name]);
        });
    }

    setupLogging(level) {
        log.ei=true;log.ed=true;log.el=true;log.ew=true;log.ee=true;
        let levels = { debug: 0, info: 1, warn: 2, error: 3 };
        let currentLevel = levels[level] ?? 1;
        if (currentLevel > 0) log.ed = false;
        if (currentLevel > 1) {
            log.el && (console.log('Juris logging initialized at level:', level));
            log.el && (console.log('To change log level, use juris.setupLogging("newLevel") or set logLevel in config'));
            log.el = false; log.ei = false;
        }
    }

    setupIndicators(elementId, config) { this.getDR().setupIndicators(elementId, config); }

    #detectGlobalAndWarn() {
        if (!Juris._done) { (requestIdleCallback || setTimeout)(() => { if (Juris.#inGlobal) return; Juris.#inGlobal = true; for (let key in globalThis) { if (globalThis[key] instanceof Juris) { log.ew && console.warn(`JURIS GLOBAL: '${key}'`); } } }); }
    }
    #createBaseContext() {
        if (!this.contextTemplate) {
            this.contextTemplate = {
                getState: (path, defaultValue, track) => this.getSM().getState(path, defaultValue, track),
                setState: (path, value, context) => this.getSM().setState(path, value, context),
                executeBatch: (callback) => this.executeBatch(callback),
                subscribe: (path, callback) => this.getSM().subscribe(path, callback),
                effect: (fn) => {
                  const { result, deps } = this.getSM().track(fn);
                  const subscriptions = [];
                  deps.forEach(path => {
                    const unsub = this.getSM().subscribeInternal(path, fn);
                    subscriptions.push(unsub);
                  });
                  return () => subscriptions.forEach(unsub => unsub());
                },
                compute: (name, fn,option) => this.getSM().compute(name,fn, option),
                services: this.services,
                ...(this.services || {}),
                ...(this.headlessAPIs || {}),
                headless: this.getHM()?.context,
                isSSR: typeof window === 'undefined',
                components: {
                    register: (name, component) => this.getCM().register(name, component),
                    registerHeadless: (name, component, options) => this.getHM()?.register(name, component, options),
                    get: name => this.getCM().components.get(name),
                    getHeadless: name => this.getHM()?.getInstance(name),
                    initHeadless: (name, props) => this.getHM()?.initialize(name, props),
                    reinitHeadless: (name, props) => this.getHM()?.reinitialize(name, props),
                    getComponentAPI: (name) => this.getComponentAPI(name),
                    getHeadlessAPI: name => this.getHM()?.getAPI(name),
                    getComponentElement: (name) => this.getComponentElement(name),
                    getNamedComponents: () => this.getCM().getNamedComponents(),
                },
                utils: {
                    render: container => this.render(container),
                    cleanup: () => this.cleanup(),
                    forceRender: () => this.render(),
                    getHeadlessStatus: () => this.getHM()?.getStatus(),
                    objectToHtml: (vnode) => this.objectToHtml(vnode)
                },
                objectToHtml: (vnode) => this.objectToHtml(vnode),
                setupIndicators: (elementId, config) => this.setupIndicators(elementId, config),
                juris: this,
                logger: {
                    warn: log.w, error: log.e, info: log.i, debug: log.d, subscribe: logSub, unsubscribe: logUnsub
                }
            };
        }
        return this.contextTemplate;
    }
    
    createHeadlessContext(elm = null) {
        return this.createContext(elm);
    }

    executeBatch(callback) {return this.getSM().executeBatch(callback);}

    createWebComponent(name, componentDefinition, options = {}) {
        if (!this.webComponentFactory) {
            log.ee && console.error(log.e('WebComponent not available'), 'app');
            return null;
        }
        return this.webComponentFactory.createWebComponent(name, componentDefinition, options);
    }

    createWebComponents(components, globalOptions = {}) {
        if (!this.webComponentFactory) {
            log.ee && console.error(log.e('WebComponents not available'), 'app');
            return {};
        }
        return this.webComponentFactory.createMultiple(components, globalOptions);
    }
    
    createContext(elm = null) {
        let context = { ...this.#createBaseContext() };
        if (this.getHM()) {
            let headlessAPIs = this.getHM().getAllAPIs();
            Object.assign(context, headlessAPIs);
        }
        if (elm) context.element = elm;
        return context;
    }
    
    promisify(result) { return promisify(result);}
    
    getState(path, defaultValue, track) { return this.getSM().getState(path, defaultValue, track); }
    
    setState(path, value, context) {
        return this.getSM().setState(path, value, context);
    }
    
    subscribe(path, callback, hierarchical = true) { return this.getSM().subscribe(path, callback, hierarchical); }
    
    subscribeExact(path, callback) { return this.getSM().subscribeExact(path, callback); }
    
    registerComponent(name, component) {
        return this.getCM().register(name, component);
    }

    registerHeadlessComponent(name, component, options) { return this.getHM().register(name, component, options); }
    
    initializeQueuedHeadlessComponent() { this.getHM().initializeQueued(); }
    
    initializeHeadlessComponent(name, props) { return this.getHM().initialize(name, props); }
    
    getHeadlessComponent(name) { return this.getHM().getInstance(name); }
    
    getHeadlessAPI(name) { return this.getHM()?.getAPI(name); }

    getComponent(name) { return this.getCM().components.get(name); }

    registerAndInitHeadless(name, componentFn, options = {}) {
        this.getHM().register(name, componentFn, options);
        return this.getHM().initialize(name, options);
    }

    getHeadlessStatus() { return this.getHM().getStatus(); }
    
    objectToHtml(vnode) { return this.getDR().render(vnode); }
    
    render(container = '#app', vdom = null) {
      let startTime = performance.now();
      let containerEl = _isSt(container) ? 
        document.querySelector(container) : container;        
      if (!containerEl) {
        log.ee && console.error(log.e('Render container not found', { container }, 'app'));
        return;
      }
      try {
        this.getSM().startDeferringSubscriptions();
        let content = vdom !== null ? vdom : this.layout;
        let isHydration = this.getState('isHydration', false);        
        if (isHydration) {
          this.#renderWithHydration(containerEl, content);
        } else {
          this.#renderImmediate(containerEl, content);
        }
        this.getSM().processDeferredSubscriptions();        
        let duration = performance.now() - startTime;
        log.ei && console.info(log.i('Render completed', {duration: `${duration.toFixed(2)}ms`,isHydration}, 'app'));        
        return containerEl;        
      } catch (error) {
        this.getSM().processDeferredSubscriptions();
        log.ee && console.error(log.e('Render failed', { 
          error: error.message, 
          container 
        }, 'app'));
        this.#renderError(containerEl, error);
        return containerEl;
      }
    }

    #renderImmediate(containerEl, content) {
      this.getDR().cleanup(containerEl);
      containerEl.innerHTML = '';      
      let elm = this.getDR().render(content, null, false, containerEl);
      if (elm && elm !== containerEl) {
        containerEl.appendChild(elm);
      }
      this.getDR()._processPendingConnectedCallbacks();
    }
    
    async #renderWithHydration(containerEl, vdom = null) {
      let stagingEl = this.#createElm('div');
      stagingEl.style.cssText = 'position: absolute; left: -9999px; visibility: hidden;';
      document.body.appendChild(stagingEl);
      try {
        startTracking();
        let content = vdom !== null ? vdom : this.layout;
        let elm = this.getDR().render(content);
        if (elm) stagingEl.appendChild(elm);
        await onAllComplete();
        this.getDR().cleanup(containerEl);
        containerEl.innerHTML = '';
        while (stagingEl.firstChild) {
          containerEl.appendChild(stagingEl.firstChild);
        }
        this.getDR()._processPendingConnectedCallbacks();
        this.getHM()?.initializeQueued();
      } finally {
        stopTracking();
        document.body.removeChild(stagingEl);
      }
    }
    #createElm(tagName){
      return document.createElement(tagName);
    }
    #renderError(container, error) {
        let errorEl = this.#createElm('div');
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
            log.ew && console.warn(log.w('Enhancement configuration requested but domEnhancer not available'), 'frk');
            return;
        }
        return this.domEnhancer.configure(options); 
    }
    
    arm(target, handlerFn) {
      if(handlerFn == null || !_isFN(handlerFn)) {
        log.ew && console.warn(log.w('arm() called without valid handler function'), 'frk');
        return null;
      }
      try {
        let context = this.createContext(target);
        let handlers = handlerFn(context);
        let listeners = [];
        let jurisIns = this;        
        for (let eventName in handlers) {
          let actualEventName;
          if (eventName.startsWith('on-')) {
            actualEventName = eventName.slice(3);
          } else if (eventName.startsWith('on:')) {
            actualEventName = eventName.slice(3);
          } else {
            actualEventName = eventName.slice(2).toLowerCase();
          }          
          let handler = handlers[eventName];          
          if (_isFN(handler)) {
            const wrappedHandler = (e) => {
              try {
                return handler(e);
              } catch (error) {
                log.ee && console.error(log.e('Armed event handler failed', {eventType: actualEventName, target: target.tagName || target.toString(), error: error.message, stack: error.stack?.split('\n').slice(0, 5).join('\n')}, 'app'));
              }
            };            
            target.addEventListener(actualEventName, wrappedHandler);
            listeners.push({ 
              original: eventName,
              actual: actualEventName, 
              handler: wrappedHandler
            });
          }
        }        
        let instance = {events: listeners.map(e => ({name: e.original,actualEvent: e.actual,handler: e.handler})),
          trigger(eventName, eventData = {}) {
            let listener = listeners.find(e => e.original === eventName || e.actual === eventName);
            if (listener) {
              let mockEvent = {type: listener.actual,target: target,preventDefault: () => {},stopPropagation: () => {}, ...eventData};
              try {
                listener.handler.call(target, mockEvent);
                return true;
              } catch (error) {
                log.ee && console.error(log.e('Armed event trigger failed', {eventName,target: target.tagName || target.toString(),error: error.message}, 'app'));
                return false;
              }
            }
            return false;
          },
          cleanup() {
            listeners.forEach(({ actual, handler }) => {
              target.removeEventListener(actual, handler);
            });
            jurisIns.armedElements.delete(target);
            return true;
          }
        };        
        jurisIns.armedElements.set(target, { listeners, context, instance: instance });
        return instance;
      } catch (error) {
        log.ee && console.error(log.e('arm() setup failed', {target: target.tagName || target.toString(),error: error.message, stack: error.stack?.split('\n').slice(0, 5).join('\n')}, 'app'));
        return null;
      }
    }

    cleanup() {
        this.armedElements = new Map();
        this.getHM()?.cleanup();
    } 
    destroy() {
        this.cleanup();
        if (this.domEnhancer) {
            this.domEnhancer.destroy();
        }
        this.getSM().subscribers.clear();
        this.getSM().extSubs.clear();
        this.getCM().components.clear();
        if (this.getHM()) {
            this.getHM().components.clear();
        }
        this.armedElements = new Map();
    }
}
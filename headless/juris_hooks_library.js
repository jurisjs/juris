/**
 * Juris Hooks - React-like useState and custom hooks for Juris framework
 * 
 * @version 1.0.0
 * @author Community
 * @license MIT
 */
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = global || self, factory(global.JurisHooks = {}));
}(this, (function (exports) {
    'use strict';

    // ============================================================================
    // CORE: Extendable State Manager
    // ============================================================================

    /**
     * Creates an extendable state manager that can accept hook collections
     * @param {Array} hookCollections - Array of hook collection objects or functions
     * @param {Object} options - Configuration options
     * @returns {Function} - Headless component function for Juris
     */
    function createExtendableStateManager(hookCollections = [], options = {}) {
        return function(props, context) {
            const config = {
                debug: false,
                cacheMaxAge: 60000,
                cleanupInterval: 30000,
                enableCacheCleanup: true,
                ...options,
                ...props
            };

            // Internal state management
            const stateCache = new Map();
            const subscriberCache = new Map();

            // Core useState implementation
            function useState(path, defaultValue = null) {
                if (!path || typeof path !== 'string') {
                    throw new Error('useState: path must be a non-empty string');
                }

                const getter = () => {
                    if (stateCache.has(path)) {
                        const cached = stateCache.get(path);
                        const currentValue = context.getState(path, defaultValue);
                        if (currentValue !== cached.value) {
                            cached.value = currentValue;
                            cached.lastAccess = Date.now();
                        }
                        return currentValue;
                    }

                    const value = context.getState(path, defaultValue);
                    stateCache.set(path, { value, lastAccess: Date.now() });
                    return value;
                };

                const setter = (newValue, updateContext = {}) => {
                    if (typeof newValue === 'function') {
                        const currentValue = context.getState(path, defaultValue);
                        newValue = newValue(currentValue);
                    }

                    context.setState(path, newValue, {
                        source: 'useState',
                        path,
                        ...updateContext
                    });

                    stateCache.set(path, { value: newValue, lastAccess: Date.now() });
                };

                if (config.debug) {
                    getter.path = path;
                    setter.path = path;
                }

                return [getter, setter];
            }

            // Core useSubscribe implementation
            function useSubscribe(path, callback) {
                if (!subscriberCache.has(path)) {
                    subscriberCache.set(path, new Set());
                }
                
                subscriberCache.get(path).add(callback);
                
                const unsubscribe = context.subscribe(path, (newValue, oldValue, statePath) => {
                    try {
                        callback(newValue, oldValue, statePath);
                    } catch (error) {
                        console.error(`Error in useSubscribe callback for "${path}":`, error);
                    }
                });

                return () => {
                    unsubscribe();
                    const subscribers = subscriberCache.get(path);
                    if (subscribers) {
                        subscribers.delete(callback);
                        if (subscribers.size === 0) {
                            subscriberCache.delete(path);
                        }
                    }
                };
            }

            // Core useLocalState implementation
            function useLocalState(initialValue) {
                let value = initialValue;
                const subscribers = new Set();

                const getter = () => value;
                
                const setter = (newValue) => {
                    if (typeof newValue === 'function') {
                        newValue = newValue(value);
                    }
                    
                    if (newValue !== value) {
                        const oldValue = value;
                        value = newValue;
                        
                        subscribers.forEach(callback => {
                            try {
                                callback(newValue, oldValue);
                            } catch (error) {
                                console.error('Error in useLocalState subscriber:', error);
                            }
                        });
                    }
                };

                getter.subscribe = (callback) => {
                    subscribers.add(callback);
                    return () => subscribers.delete(callback);
                };

                return [getter, setter];
            }

            // Base API with core hooks
            const api = {
                useState,
                useSubscribe,
                useLocalState,
                
                // Utility methods
                clearCache: () => {
                    stateCache.clear();
                    subscriberCache.clear();
                },
                
                getCacheStats: () => ({
                    stateCache: stateCache.size,
                    subscriberCache: subscriberCache.size,
                    totalSubscribers: Array.from(subscriberCache.values())
                        .reduce((sum, set) => sum + set.size, 0)
                }),
                
                debug: {
                    getStateCache: () => new Map(stateCache),
                    getSubscriberCache: () => new Map(subscriberCache),
                    listStatePaths: () => Array.from(stateCache.keys())
                }
            };

            // Extend API with hook collections
            hookCollections.forEach(collection => {
                try {
                    if (typeof collection === 'function') {
                        // Function that returns hooks
                        const hooks = collection(context, api);
                        if (hooks && typeof hooks === 'object') {
                            Object.assign(api, hooks);
                        }
                    } else if (collection && typeof collection === 'object') {
                        // Object with hook definitions
                        Object.entries(collection).forEach(([name, hookFn]) => {
                            if (typeof hookFn === 'function') {
                                api[name] = hookFn(context, api);
                            }
                        });
                    }
                } catch (error) {
                    console.error('Error loading hook collection:', error);
                }
            });

            // Cache cleanup
            const cleanupCache = () => {
                const now = Date.now();
                const maxAge = config.cacheMaxAge;

                for (const [path, cached] of stateCache.entries()) {
                    if (now - cached.lastAccess > maxAge) {
                        stateCache.delete(path);
                    }
                }
            };

            // Periodic cache cleanup
            let cleanupInterval;
            if (config.enableCacheCleanup) {
                cleanupInterval = setInterval(cleanupCache, config.cleanupInterval);
            }

            // Component lifecycle hooks
            const hooks = {
                onRegister: () => {
                    if (config.debug) {
                        console.log('🔧 Juris Hooks: State manager registered');
                        console.log(`Available hooks: ${Object.keys(api).join(', ')}`);
                    }

                    // Inject API into Juris context creation
                    const juris = context.juris;
                    const originalCreateContext = juris.createContext.bind(juris);
                    const originalCreateHeadlessContext = juris.createHeadlessContext.bind(juris);
                    
                    juris.createContext = function() {
                        const ctx = originalCreateContext();
                        return { ...ctx, ...api };
                    };
                    
                    juris.createHeadlessContext = function() {
                        const ctx = originalCreateHeadlessContext();
                        return { ...ctx, ...api };
                    };
                    
                    if (config.debug) {
                        console.log('✅ Juris Hooks: APIs injected into context creation');
                    }
                },
                
                onUnregister: () => {
                    if (cleanupInterval) {
                        clearInterval(cleanupInterval);
                    }
                    stateCache.clear();
                    subscriberCache.clear();
                    
                    if (config.debug) {
                        console.log('🔧 Juris Hooks: State manager unregistered');
                    }
                }
            };

            return { api, hooks };
        };
    }

    // ============================================================================
    // BUILT-IN HOOK COLLECTIONS
    // ============================================================================

    /**
     * Timer Hooks Collection
     */
    const TimerHooks = {
        useTimer: (context, { useState }) => (interval = 1000) => {
            const uniqueId = `timer_${Date.now()}_${Math.random()}`;
            const [getCount, setCount] = useState(`timers.${uniqueId}.count`, 0);
            const [getActive, setActive] = useState(`timers.${uniqueId}.active`, false);
            
            let intervalId;

            const start = () => {
                if (!getActive()) {
                    setActive(true);
                    intervalId = setInterval(() => {
                        setCount(count => count + 1);
                    }, interval);
                }
            };

            const stop = () => {
                setActive(false);
                if (intervalId) {
                    clearInterval(intervalId);
                    intervalId = null;
                }
            };

            const reset = () => {
                stop();
                setCount(0);
            };

            return {
                count: getCount,
                start,
                stop,
                reset,
                isActive: getActive,
                
                cleanup: () => {
                    stop();
                    context.setState(`timers.${uniqueId}`, undefined);
                }
            };
        },

        useInterval: (context, { useState }) => (callback, delay) => {
            const [getActive, setActive] = useState(`interval_${Date.now()}`, false);
            let intervalId;

            return {
                start: () => {
                    if (!getActive()) {
                        setActive(true);
                        intervalId = setInterval(callback, delay);
                    }
                },
                
                stop: () => {
                    setActive(false);
                    if (intervalId) {
                        clearInterval(intervalId);
                        intervalId = null;
                    }
                },
                
                isActive: getActive
            };
        },

        useTimeout: (context) => (callback, delay) => {
            let timeoutId;
            
            return {
                start: () => {
                    clearTimeout(timeoutId);
                    timeoutId = setTimeout(callback, delay);
                },
                
                cancel: () => {
                    clearTimeout(timeoutId);
                }
            };
        }
    };

    /**
     * UI Hooks Collection
     */
    const UIHooks = {
        useToggle: (context, { useState }) => (initialValue = false, persistKey = null) => {
            const path = persistKey ? `toggles.${persistKey}` : `toggle_${Date.now()}`;
            const [getValue, setValue] = useState(path, initialValue);
            
            const toggle = () => setValue(current => !current);
            
            return [getValue, toggle, setValue];
        },

        useCounter: (context, { useState }) => (initial = 0, persistKey = null) => {
            const path = persistKey ? `counters.${persistKey}` : `counter_${Date.now()}`;
            const [getCount, setCount] = useState(path, initial);
            
            return {
                count: getCount,
                increment: (step = 1) => setCount(c => c + step),
                decrement: (step = 1) => setCount(c => c - step),
                reset: () => setCount(initial),
                set: setCount
            };
        },

        useInput: (context, { useState }) => (initialValue = '', persistKey = null) => {
            const path = persistKey ? `inputs.${persistKey}` : `input_${Date.now()}`;
            const [getValue, setValue] = useState(path, initialValue);
            
            return {
                value: getValue,
                onChange: (e) => setValue(e.target.value),
                onInput: (e) => setValue(e.target.value),
                clear: () => setValue(''),
                set: setValue
            };
        },

        useBoolean: (context, { useState }) => (initialValue = false, persistKey = null) => {
            const path = persistKey ? `booleans.${persistKey}` : `boolean_${Date.now()}`;
            const [getValue, setValue] = useState(path, initialValue);
            
            return {
                value: getValue,
                setTrue: () => setValue(true),
                setFalse: () => setValue(false),
                toggle: () => setValue(current => !current),
                set: setValue
            };
        }
    };

    /**
     * Storage Hooks Collection
     */
    const StorageHooks = {
        useLocalStorage: (context, { useState }) => (key, defaultValue = null) => {
            const storageKey = `juris_${key}`;
            
            // Initialize from localStorage
            let initialValue = defaultValue;
            try {
                const stored = localStorage.getItem(storageKey);
                if (stored !== null) {
                    initialValue = JSON.parse(stored);
                }
            } catch (error) {
                console.warn('localStorage read error:', error);
            }

            const [getValue, setValue] = useState(`localStorage.${key}`, initialValue);
            
            // Enhanced setter that syncs with localStorage
            const syncedSetValue = (newValue) => {
                if (typeof newValue === 'function') {
                    newValue = newValue(getValue());
                }
                
                try {
                    localStorage.setItem(storageKey, JSON.stringify(newValue));
                } catch (error) {
                    console.warn('localStorage write error:', error);
                }
                
                setValue(newValue);
            };

            return [getValue, syncedSetValue];
        },

        useSessionStorage: (context, { useState }) => (key, defaultValue = null) => {
            const storageKey = `juris_session_${key}`;
            
            let initialValue = defaultValue;
            try {
                const stored = sessionStorage.getItem(storageKey);
                if (stored !== null) {
                    initialValue = JSON.parse(stored);
                }
            } catch (error) {
                console.warn('sessionStorage read error:', error);
            }

            const [getValue, setValue] = useState(`sessionStorage.${key}`, initialValue);
            
            const syncedSetValue = (newValue) => {
                if (typeof newValue === 'function') {
                    newValue = newValue(getValue());
                }
                
                try {
                    sessionStorage.setItem(storageKey, JSON.stringify(newValue));
                } catch (error) {
                    console.warn('sessionStorage write error:', error);
                }
                
                setValue(newValue);
            };

            return [getValue, syncedSetValue];
        }
    };

    /**
     * Utility Hooks Collection
     */
    const UtilityHooks = {
        useDebounce: (context) => (callback, delay) => {
            let timeoutId;
            return (...args) => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => callback(...args), delay);
            };
        },

        useThrottle: (context) => (callback, limit) => {
            let inThrottle;
            return (...args) => {
                if (!inThrottle) {
                    callback(...args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        },

        usePrevious: (context, { useState, useSubscribe }) => (value) => {
            const statePath = `previous_${Date.now()}`;
            const [getPrevious, setPrevious] = useState(statePath, value);
            
            // Update previous value when current value changes
            if (getPrevious() !== value) {
                setPrevious(getPrevious());
            }
            
            return getPrevious;
        },

        useArray: (context, { useState }) => (initialArray = [], persistKey = null) => {
            const path = persistKey ? `arrays.${persistKey}` : `array_${Date.now()}`;
            const [getArray, setArray] = useState(path, initialArray);
            
            return {
                value: getArray,
                push: (item) => setArray(arr => [...arr, item]),
                pop: () => setArray(arr => arr.slice(0, -1)),
                remove: (index) => setArray(arr => arr.filter((_, i) => i !== index)),
                update: (index, item) => setArray(arr => arr.map((current, i) => i === index ? item : current)),
                clear: () => setArray([]),
                set: setArray
            };
        }
    };

    // ============================================================================
    // HELPER FUNCTIONS
    // ============================================================================

    /**
     * Create a simple hook collection from an object of hook functions
     */
    function createHookCollection(hooks) {
        return hooks;
    }

    /**
     * Combine multiple hook collections into one
     */
    function combineHookCollections(...collections) {
        return collections.reduce((combined, collection) => {
            return { ...combined, ...collection };
        }, {});
    }

    /**
     * Create a namespaced hook collection to avoid naming conflicts
     */
    function namespaceHooks(namespace, hooks) {
        const namespacedHooks = {};
        Object.entries(hooks).forEach(([name, hook]) => {
            namespacedHooks[`${namespace}${name.charAt(0).toUpperCase()}${name.slice(1)}`] = hook;
        });
        return namespacedHooks;
    }

    // ============================================================================
    // EXPORTS
    // ============================================================================

    exports.createExtendableStateManager = createExtendableStateManager;
    exports.TimerHooks = TimerHooks;
    exports.UIHooks = UIHooks;
    exports.StorageHooks = StorageHooks;
    exports.UtilityHooks = UtilityHooks;
    exports.createHookCollection = createHookCollection;
    exports.combineHookCollections = combineHookCollections;
    exports.namespaceHooks = namespaceHooks;

    // Default export for convenience
    exports.default = {
        createExtendableStateManager,
        TimerHooks,
        UIHooks,
        StorageHooks,
        UtilityHooks,
        createHookCollection,
        combineHookCollections,
        namespaceHooks
    };

    // Version info
    exports.version = '1.0.0';

})));

// ============================================================================
// USAGE EXAMPLES (for reference)
// ============================================================================

/* 

// Basic usage:
import { createExtendableStateManager, TimerHooks, UIHooks } from './juris-hooks.js';

const juris = new Juris({
    headlessComponents: {
        stateManager: {
            fn: createExtendableStateManager([TimerHooks, UIHooks]),
            options: { autoInit: true, debug: true }
        }
    },
    
    components: {
        MyComponent: (props, context) => {
            const [getCount, setCount] = context.useState('counter', 0);
            const timer = context.useTimer(1000);
            const [visible, toggle] = context.useToggle(true);
            
            return {
                render: () => ({
                    div: {
                        children: [
                            { p: { text: () => `Count: ${getCount()}` } },
                            { p: { text: () => `Timer: ${timer.count()}` } },
                            { button: { text: '+', onclick: () => setCount(c => c + 1) } },
                            { button: { text: 'Start Timer', onclick: timer.start } },
                            { button: { text: 'Toggle', onclick: toggle } }
                        ]
                    }
                })
            };
        }
    }
});

// Custom hook collection:
const MyHooks = {
    useGeolocation: (context, { useState }) => () => {
        const [getPosition, setPosition] = useState('geo.position', null);
        // ... implementation
        return { position: getPosition, getCurrentPosition };
    }
};

// Use with custom hooks:
const stateManager = createExtendableStateManager([
    TimerHooks,
    UIHooks,
    StorageHooks,
    MyHooks
], { debug: true });

*/
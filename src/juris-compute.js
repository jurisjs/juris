/**
 * Juris Compute Plugin
 * Extracted compute functionality from StateManager as a separate plugin
 */

class ComputePlugin {
    constructor(stateManager, options = {}) {
        this.stateManager = stateManager;
        this.computeCache = new Map();
        this.computeDefaults = {
            maxSize: 10,
            ttl: null,  // null = no expiration, or milliseconds
            eviction: 'fifo',  // 'fifo' | 'lru' | 'lfu'
            weak: false,  // use WeakRef for results if true
            ...options
        };        
    }

    compute(name, fn, options = {}) {
        const config = { ...this.computeDefaults, ...options };
        let nameCache = this.computeCache.get(name);
        if (!nameCache) {
            nameCache = { entries: [], config };
            this.computeCache.set(name, nameCache);
        }

        // Check cache
        if (nameCache.entries.length > 0) {
            const now = Date.now();
            for (let i = 0; i < nameCache.entries.length; i++) {
                const entry = nameCache.entries[i];
                if (nameCache.config.ttl && (now - entry.timestamp > nameCache.config.ttl)) {
                    nameCache.entries.splice(i, 1);
                    i--;
                    continue;
                }
                const currentValues = entry.depPaths.map(path => 
                    this.stateManager.getState(path, undefined, false)
                );
                if (this.#deepEquals(entry.depValues, currentValues)) {
                    entry.lastAccess = now;
                    entry.accessCount = (entry.accessCount || 0) + 1;
                    if (this.stateManager.deps) {
                        entry.depPaths.forEach(path => this.stateManager.deps.add(path));
                    }
                    return config.weak && entry.resultRef ? entry.resultRef.deref() : entry.result;
                }
            }
        }

        const outerDeps = this.stateManager.deps;
        this.stateManager.deps = new Set();
        
        try {
            const result = fn();
            const depPaths = Array.from(this.stateManager.deps);
            
            if (result && typeof result.then === 'function') {
                // Async: return promise that caches when resolved
                return result.then(resolved => {
                    this.#cacheResult(nameCache, depPaths, resolved);
                    return resolved;
                });
            }
            
            // Sync: cache immediately
            this.#cacheResult(nameCache, depPaths, result);
            return result;
            
        } finally {
            if (outerDeps) {
                Array.from(this.stateManager.deps).forEach(path => outerDeps.add(path));
            }
            this.stateManager.deps = outerDeps;
        }
    }

    #cacheResult(nameCache, depPaths, result) {
        const depValues = depPaths.map(path => this.stateManager.getState(path, undefined, false));
        const now = Date.now();
        
        const entry = {
            depPaths,
            depValues,
            timestamp: now,
            lastAccess: now,
            accessCount: 1
        };

        // Handle weak references if configured
        if (nameCache.config.weak && typeof WeakRef !== 'undefined') {
            entry.resultRef = new WeakRef(result);
        } else {
            entry.result = result;
        }
        
        nameCache.entries.push(entry);
        if (nameCache.entries.length > nameCache.config.maxSize) {
            this.#evictCacheEntry(nameCache);
        }
    }

    #evictCacheEntry(nameCache) {
        const config = nameCache.config;
        let indexToRemove = 0;
        
        switch (config.eviction) {
            case 'lru':
                // Remove least recently used
                let oldestAccess = nameCache.entries[0].lastAccess;
                for (let i = 1; i < nameCache.entries.length - 1; i++) {
                    if (nameCache.entries[i].lastAccess < oldestAccess) {
                        oldestAccess = nameCache.entries[i].lastAccess;
                        indexToRemove = i;
                    }
                }
                break;
                
            case 'lfu':
                // Remove least frequently used
                let lowestCount = nameCache.entries[0].accessCount || 0;
                for (let i = 1; i < nameCache.entries.length - 1; i++) {
                    const count = nameCache.entries[i].accessCount || 0;
                    if (count < lowestCount) {
                        lowestCount = count;
                        indexToRemove = i;
                    }
                }
                break;
                
            case 'fifo':
            default:
                // Remove first (oldest insertion)
                indexToRemove = 0;
                break;
        }
        
        nameCache.entries.splice(indexToRemove, 1);
    }

    configureCompute(defaults) {
        this.computeDefaults = { ...this.computeDefaults, ...defaults };
        return this.computeDefaults;
    }

    getComputeStats(name = null) {
        if (name) {
            const cache = this.computeCache.get(name);
            if (!cache) return null;
            
            return {
                name,
                entries: cache.entries.length,
                config: cache.config,
                details: cache.entries.map(e => ({
                    depPaths: e.depPaths,
                    timestamp: e.timestamp,
                    lastAccess: e.lastAccess,
                    accessCount: e.accessCount || 0,
                    hasResult: e.result !== undefined || (e.resultRef?.deref() !== undefined)
                }))
            };
        }
        
        // Return stats for all caches
        const stats = {};
        for (const [name, cache] of this.computeCache) {
            stats[name] = {
                entries: cache.entries.length,
                config: cache.config
            };
        }
        return stats;
    }

    clearCompute(name = null) {
        if (name) {
            this.computeCache.delete(name);
        } else {
            this.computeCache.clear();
        }
    }

    // Cleanup method for plugin lifecycle
    destroy() {
        this.computeCache.clear();
        this.stateManager = null;
    }

    #deepEquals(a, b) {
        if (a === b) return true;
        if (a == null || b == null || typeof a !== typeof b) return false;
        if (typeof a === 'object') {
            if (Array.isArray(a) !== Array.isArray(b)) return false;
            const keysA = Object.keys(a), keysB = Object.keys(b);
            if (keysA.length !== keysB.length) return false;
            return keysA.every(key => keysB.includes(key) && this.#deepEquals(a[key], b[key]));
        }
        return false;
    }
}

if (typeof window !== 'undefined') {
    window.ComputePlugin = ComputePlugin;
		Object.freeze(ComputePlugin);
		Object.freeze(ComputePlugin.prototype);
}
// Export for use as a feature
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ComputePlugin;
}
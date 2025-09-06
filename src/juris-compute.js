/**
 * Juris Compute Plugin - 100% Debug Version
 * Complete rewrite with comprehensive debugging on every operation
 */

class ComputePlugin {
  constructor(stateManager, options = {}) {
    this.stateManager = stateManager;
    this.computeCache = new Map();
    this.computeDefaults = {
      maxSize: 10,
      ttl: null,
      eviction: 'fifo',
      weak: false,
      ...options
    };
    console.log(`[ComputePlugin] Plugin initialized with defaults:`, this.computeDefaults);
  }

  compute(name, fn, options = {}) {
    console.log(`\n[ComputePlugin] ========================================`);
    console.log(`[ComputePlugin] COMPUTE CALL: "${name}"`);
    console.log(`[ComputePlugin] Options passed:`, options);
    
    const config = { ...this.computeDefaults, ...options };
    console.log(`[ComputePlugin] Final config:`, config);
    
    let nameCache = this.computeCache.get(name);
    if (!nameCache) {
      nameCache = { entries: [], config };
      this.computeCache.set(name, nameCache);
      console.log(`[ComputePlugin] Created new cache "${name}" with:`, {
        maxSize: config.maxSize,
        eviction: config.eviction,
        ttl: config.ttl,
        weak: config.weak
      });
    } else {
      console.log(`[ComputePlugin] Using existing cache "${name}"`);
    }

    console.log(`[ComputePlugin] Current cache state: ${nameCache.entries.length} entries`);

    // STEP 1: Check existing cache entries
    if (nameCache.entries.length > 0) {
      console.log(`[ComputePlugin] === CACHE CHECK PHASE ===`);
      console.log(`[ComputePlugin] Checking ${nameCache.entries.length} existing entries...`);
      
      const now = Date.now();
      console.log(`[ComputePlugin] Current timestamp: ${now}`);

      for (let i = 0; i < nameCache.entries.length; i++) {
        const entry = nameCache.entries[i];
        console.log(`[ComputePlugin] \n--- Checking Entry ${i} ---`);
        console.log(`[ComputePlugin] Entry details:`, {
          depPaths: entry.depPaths,
          depValues: entry.depValues,
          timestamp: entry.timestamp,
          lastAccess: entry.lastAccess,
          accessCount: entry.accessCount || 1
        });

        // Check TTL expiration
        if (nameCache.config.ttl) {
          const age = now - entry.timestamp;
          console.log(`[ComputePlugin] TTL check: age=${age}ms, limit=${nameCache.config.ttl}ms`);
          if (age > nameCache.config.ttl) {
            console.log(`[ComputePlugin] Entry ${i} EXPIRED - removing`);
            nameCache.entries.splice(i, 1);
            i--;
            continue;
          } else {
            console.log(`[ComputePlugin] Entry ${i} not expired`);
          }
        } else {
          console.log(`[ComputePlugin] No TTL configured, skipping expiration check`);
        }

        // Get current state values for cached dependency paths
        console.log(`[ComputePlugin] Getting current values for paths:`, entry.depPaths);
        const currentValues = entry.depPaths.map(path => {
          const value = this.stateManager.getState(path, undefined, false);
          console.log(`[ComputePlugin]   ${path} = ${JSON.stringify(value)}`);
          return value;
        });
        
        console.log(`[ComputePlugin] Cached values:`, entry.depValues);
        console.log(`[ComputePlugin] Current values:`, currentValues);

        // Compare cached vs current values
        const valuesMatch = this.deepEquals(entry.depValues, currentValues);
        console.log(`[ComputePlugin] Values match? ${valuesMatch}`);

        if (valuesMatch) {
          console.log(`[ComputePlugin] *** CACHE HIT for entry ${i}! ***`);
          
          // Update access tracking
          console.log(`[ComputePlugin] Updating access info...`);
          const oldLastAccess = entry.lastAccess;
          const oldAccessCount = entry.accessCount || 1;
          
          entry.lastAccess = now;
          entry.accessCount = (entry.accessCount || 0) + 1;
          
          console.log(`[ComputePlugin] Access updated:`, {
            lastAccess: `${oldLastAccess} -> ${entry.lastAccess}`,
            accessCount: `${oldAccessCount} -> ${entry.accessCount}`
          });

          // Add dependencies to tracking if needed
          if (this.stateManager.deps) {
            console.log(`[ComputePlugin] Adding deps to stateManager.deps:`, entry.depPaths);
            entry.depPaths.forEach(path => this.stateManager.deps.add(path));
          } else {
            console.log(`[ComputePlugin] No stateManager.deps to update`);
          }

          // Get result
          const result = config.weak && entry.resultRef ? entry.resultRef.deref() : entry.result;
          console.log(`[ComputePlugin] Returning cached result:`, result);
          console.log(`[ComputePlugin] === CACHE HIT COMPLETE ===`);
          console.log(`[ComputePlugin] ========================================\n`);
          return result;
        } else {
          console.log(`[ComputePlugin] Entry ${i} values don't match - continuing`);
        }
      }
      
      console.log(`[ComputePlugin] No cache hits found after checking all entries`);
    } else {
      console.log(`[ComputePlugin] === NO CACHE ENTRIES ===`);
      console.log(`[ComputePlugin] Cache is empty, will compute new result`);
    }

    // STEP 2: Execute function (cache miss)
    console.log(`[ComputePlugin] === CACHE MISS - EXECUTING FUNCTION ===`);
    
    const outerDeps = this.stateManager.deps;
    console.log(`[ComputePlugin] Saving outer deps:`, outerDeps ? Array.from(outerDeps) : 'none');
    
    this.stateManager.deps = new Set();
    console.log(`[ComputePlugin] Started fresh dependency tracking`);

    try {
      console.log(`[ComputePlugin] Calling user function...`);
      const result = fn();
      console.log(`[ComputePlugin] Function returned:`, result);
      
      const depPaths = Array.from(this.stateManager.deps);
      console.log(`[ComputePlugin] Dependencies captured:`, depPaths);

      if (result && typeof result.then === 'function') {
        console.log(`[ComputePlugin] Result is Promise - handling async`);
        return result.then(resolved => {
          console.log(`[ComputePlugin] Promise resolved to:`, resolved);
          this.cacheResult(nameCache, depPaths, resolved, name);
          return resolved;
        });
      }

      console.log(`[ComputePlugin] Result is sync - caching now`);
      this.cacheResult(nameCache, depPaths, result, name);
      
      console.log(`[ComputePlugin] === FUNCTION EXECUTION COMPLETE ===`);
      console.log(`[ComputePlugin] ========================================\n`);
      return result;

    } finally {
      console.log(`[ComputePlugin] Restoring dependency tracking...`);
      if (outerDeps) {
        const capturedDeps = Array.from(this.stateManager.deps);
        console.log(`[ComputePlugin] Merging captured deps into outer:`, capturedDeps);
        capturedDeps.forEach(path => outerDeps.add(path));
      }
      this.stateManager.deps = outerDeps;
      console.log(`[ComputePlugin] Dependency tracking restored`);
    }
  }

  cacheResult(nameCache, depPaths, result, cacheName) {
    console.log(`\n[ComputePlugin] === CACHING RESULT FOR "${cacheName}" ===`);
    
    const depValues = depPaths.map(path => {
      const value = this.stateManager.getState(path, undefined, false);
      console.log(`[ComputePlugin] Dependency ${path} = ${JSON.stringify(value)}`);
      return value;
    });
    
    const now = Date.now();
    console.log(`[ComputePlugin] Cache timestamp: ${now}`);
    console.log(`[ComputePlugin] Result to cache:`, result);
    console.log(`[ComputePlugin] Current cache size: ${nameCache.entries.length}`);
    console.log(`[ComputePlugin] Max cache size: ${nameCache.config.maxSize}`);
    console.log(`[ComputePlugin] TTL configured: ${nameCache.config.ttl}ms`);

    const entry = {
      depPaths: [...depPaths],
      depValues: [...depValues],
      timestamp: now,
      lastAccess: now,
      accessCount: 1
    };

    if (nameCache.config.weak && typeof WeakRef !== 'undefined') {
      entry.resultRef = new WeakRef(result);
      console.log(`[ComputePlugin] Using WeakRef for result storage`);
    } else {
      entry.result = result;
      console.log(`[ComputePlugin] Using direct result storage`);
    }

    console.log(`[ComputePlugin] New entry created:`, {
      depPaths: entry.depPaths,
      depValues: entry.depValues,
      timestamp: entry.timestamp,
      lastAccess: entry.lastAccess,
      accessCount: entry.accessCount,
      ttl: nameCache.config.ttl
    });

    // Check if eviction needed
    const needsEviction = nameCache.entries.length >= nameCache.config.maxSize;
    console.log(`[ComputePlugin] Needs eviction? ${needsEviction} (${nameCache.entries.length} >= ${nameCache.config.maxSize})`);

    if (needsEviction) {
      console.log(`[ComputePlugin] === EVICTION REQUIRED ===`);
      this.logCacheState(nameCache, 'BEFORE EVICTION');
      this.evictCacheEntry(nameCache, cacheName);
      this.logCacheState(nameCache, 'AFTER EVICTION');
    } else {
      console.log(`[ComputePlugin] Cache has space - no eviction needed`);
    }

    nameCache.entries.push(entry);
    console.log(`[ComputePlugin] Entry added. New cache size: ${nameCache.entries.length}`);
    
    this.logCacheState(nameCache, 'FINAL CACHE STATE');
    console.log(`[ComputePlugin] === CACHING COMPLETE ===\n`);
  }

  evictCacheEntry(nameCache, cacheName) {
    console.log(`\n[ComputePlugin] >>> EVICTION START for "${cacheName}" <<<`);
    console.log(`[ComputePlugin] Eviction strategy: ${nameCache.config.eviction}`);
    console.log(`[ComputePlugin] Entries before eviction: ${nameCache.entries.length}`);

    if (nameCache.entries.length === 0) {
      console.log(`[ComputePlugin] ERROR: Cannot evict from empty cache!`);
      return;
    }

    let indexToRemove = 0;

    switch (nameCache.config.eviction) {
      case 'lru':
        console.log(`[ComputePlugin] === LRU EVICTION ===`);
        let oldestAccess = nameCache.entries[0].lastAccess;
        console.log(`[ComputePlugin] Starting with entry 0, lastAccess: ${oldestAccess}`);
        
        for (let i = 1; i < nameCache.entries.length; i++) {
          const entryAccess = nameCache.entries[i].lastAccess;
          console.log(`[ComputePlugin] Entry ${i} lastAccess: ${entryAccess}`);
          
          if (entryAccess < oldestAccess) {
            console.log(`[ComputePlugin] Entry ${i} is older (${entryAccess} < ${oldestAccess})`);
            oldestAccess = entryAccess;
            indexToRemove = i;
          } else {
            console.log(`[ComputePlugin] Entry ${i} is newer, keeping current choice`);
          }
        }
        console.log(`[ComputePlugin] LRU selected entry ${indexToRemove} with lastAccess ${oldestAccess}`);
        break;

      case 'lfu':
        console.log(`[ComputePlugin] === LFU EVICTION ===`);
        let lowestCount = nameCache.entries[0].accessCount || 1;
        console.log(`[ComputePlugin] Starting with entry 0, accessCount: ${lowestCount}`);
        
        for (let i = 1; i < nameCache.entries.length; i++) {
          const entryCount = nameCache.entries[i].accessCount || 1;
          console.log(`[ComputePlugin] Entry ${i} accessCount: ${entryCount}`);
          
          if (entryCount < lowestCount) {
            console.log(`[ComputePlugin] Entry ${i} has lower count (${entryCount} < ${lowestCount})`);
            lowestCount = entryCount;
            indexToRemove = i;
          } else {
            console.log(`[ComputePlugin] Entry ${i} has higher count, keeping current choice`);
          }
        }
        console.log(`[ComputePlugin] LFU selected entry ${indexToRemove} with accessCount ${lowestCount}`);
        break;

      case 'fifo':
      default:
        console.log(`[ComputePlugin] === FIFO EVICTION ===`);
        indexToRemove = 0;
        console.log(`[ComputePlugin] FIFO selected entry 0 (oldest insertion)`);
        break;
    }

    const evictedEntry = nameCache.entries[indexToRemove];
    console.log(`[ComputePlugin] Evicting entry ${indexToRemove}:`, {
      depPaths: evictedEntry.depPaths,
      depValues: evictedEntry.depValues,
      timestamp: evictedEntry.timestamp,
      lastAccess: evictedEntry.lastAccess,
      accessCount: evictedEntry.accessCount || 1
    });

    nameCache.entries.splice(indexToRemove, 1);
    console.log(`[ComputePlugin] Entry removed. Remaining entries: ${nameCache.entries.length}`);
    console.log(`[ComputePlugin] >>> EVICTION COMPLETE <<<\n`);
  }

  logCacheState(nameCache, label) {
    console.log(`[ComputePlugin] ${label}:`);
    if (nameCache.entries.length === 0) {
      console.log(`[ComputePlugin]   (empty cache)`);
    } else {
      nameCache.entries.forEach((entry, i) => {
        console.log(`[ComputePlugin]   Entry ${i}:`, {
          depValues: entry.depValues,
          timestamp: entry.timestamp,
          lastAccess: entry.lastAccess,
          accessCount: entry.accessCount || 1
        });
      });
    }
  }

  configureCompute(defaults) {
    console.log(`[ComputePlugin] Configuring compute defaults:`, defaults);
    this.computeDefaults = { ...this.computeDefaults, ...defaults };
    console.log(`[ComputePlugin] New defaults:`, this.computeDefaults);
    return this.computeDefaults;
  }

  getComputeStats(name = null) {
    console.log(`[ComputePlugin] Getting stats for: ${name || 'all caches'}`);
    
    if (name) {
      const cache = this.computeCache.get(name);
      if (!cache) {
        console.log(`[ComputePlugin] Cache "${name}" not found`);
        return null;
      }
      
      const stats = {
        name,
        entries: cache.entries.length,
        config: cache.config,
        details: cache.entries.map(e => ({
          depPaths: e.depPaths,
          timestamp: e.timestamp,
          lastAccess: e.lastAccess,
          accessCount: e.accessCount || 1,
          hasResult: e.result !== undefined || (e.resultRef?.deref() !== undefined)
        }))
      };
      console.log(`[ComputePlugin] Stats for "${name}":`, stats);
      return stats;
    }

    const stats = {};
    for (const [name, cache] of this.computeCache) {
      stats[name] = {
        entries: cache.entries.length,
        config: cache.config
      };
    }
    console.log(`[ComputePlugin] All cache stats:`, stats);
    return stats;
  }

  clearCompute(name = null) {
    if (name) {
      console.log(`[ComputePlugin] Clearing cache: ${name}`);
      this.computeCache.delete(name);
    } else {
      console.log(`[ComputePlugin] Clearing all caches`);
      this.computeCache.clear();
    }
  }

  destroy() {
    console.log(`[ComputePlugin] Destroying plugin`);
    this.computeCache.clear();
    this.stateManager = null;
  }

  deepEquals(a, b) {
    const result = this.deepEqualsInternal(a, b);
    console.log(`[ComputePlugin] deepEquals(${JSON.stringify(a)}, ${JSON.stringify(b)}) = ${result}`);
    return result;
  }

  deepEqualsInternal(a, b) {
    if (a === b) return true;
    if (a == null || b == null || typeof a !== typeof b) return false;
    if (typeof a === 'object') {
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      const keysA = Object.keys(a), keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(key => keysB.includes(key) && this.deepEqualsInternal(a[key], b[key]));
    }
    return false;
  }
}

if (typeof window !== 'undefined') {
  window.ComputePlugin = ComputePlugin;
  Object.freeze(ComputePlugin);
  Object.freeze(ComputePlugin.prototype);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ComputePlugin;
}
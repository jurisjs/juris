const DocsAPI = (props = {}, context) => {
    const { getState, setState, subscribe } = context;
    
    // Configuration
    const config = {
        baseUrl: props.baseUrl || '/api',
        statePath: props.statePath || 'docs',
        cacheExpiry: props.cacheExpiry || 300000, // 5 minutes
        debounceMs: props.debounceMs || 300,
        maxRetries: props.maxRetries || 3,
        ...props.config
    };

    // Internal state
    let searchDebounceTimer = null;
    let cache = new Map();
    let requestQueue = new Map();

    return {
        api: {
            // Navigation
            getNavigation: () => fetchWithCache('navigation'),
            
            // Documents
            getDocument: (id) => fetchWithCache(`docs/${id}`, { key: `doc_${id}` }),
            loadDocument: (id) => loadDocumentToState(id),
            
            // Search
            search: (query, limit = 20) => debouncedSearch(query, limit),
            searchImmediate: (query, limit = 20) => performSearch(query, limit),
            
            // Related
            getRelated: (id) => fetchWithCache(`related/${id}`, { key: `related_${id}` }),
            
            // State access
            getCurrentDocument: () => getState(`${config.statePath}.current`),
            getSearchResults: () => getState(`${config.statePath}.search.results`, []),
            getSearchQuery: () => getState(`${config.statePath}.search.query`, ''),
            isLoading: () => getState(`${config.statePath}.loading`, false),
            getError: () => getState(`${config.statePath}.error`),
            
            // Cache management
            clearCache: () => clearCache(),
            preloadDocument: (id) => preloadDocument(id),
            
            // Utilities
            buildUrl: (path) => `${config.baseUrl}/${path}`,
            isDocumentCached: (id) => cache.has(`doc_${id}`),
            getCacheStats: () => getCacheStats()
        },

        hooks: {
            onRegister: () => {
                initializeState();
                // Auto-load navigation
                fetchWithCache('navigation');
            },
            
            onUnregister: () => {
                if (searchDebounceTimer) {
                    clearTimeout(searchDebounceTimer);
                }
                cache.clear();
                requestQueue.clear();
            }
        }
    };

    // ==================== CORE FETCH LOGIC ====================

    async function fetchWithCache(endpoint, options = {}) {
        const cacheKey = options.key || endpoint;
        const cached = getCachedData(cacheKey);
        
        if (cached) {
            return cached;
        }

        // Prevent duplicate requests
        if (requestQueue.has(cacheKey)) {
            return requestQueue.get(cacheKey);
        }

        const promise = performFetch(endpoint, options);
        requestQueue.set(cacheKey, promise);

        try {
            const data = await promise;
            setCachedData(cacheKey, data);
            return data;
        } finally {
            requestQueue.delete(cacheKey);
        }
    }

    async function performFetch(endpoint, options = {}) {
        const url = `${config.baseUrl}/${endpoint}`;
        let retries = 0;

        while (retries <= config.maxRetries) {
            try {
                setLoading(true);
                clearError();

                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers
                    },
                    ...options.fetchOptions
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                
                if (data.error) {
                    throw new Error(data.error);
                }

                return data;

            } catch (error) {
                retries++;
                
                if (retries > config.maxRetries) {
                    setError(`Failed to fetch ${endpoint}: ${error.message}`);
                    throw error;
                }
                
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
            } finally {
                setLoading(false);
            }
        }
    }

    // ==================== DOCUMENT MANAGEMENT ====================

    async function loadDocumentToState(id) {
        try {
            const doc = await fetchWithCache(`docs/${id}`, { key: `doc_${id}` });
            
            setState(`${config.statePath}.current`, doc);
            setState(`${config.statePath}.currentId`, id);
            
            // Load related documents in background
            setTimeout(() => {
                fetchWithCache(`related/${id}`, { key: `related_${id}` })
                    .then(related => {
                        setState(`${config.statePath}.related`, related.related || []);
                    })
                    .catch(() => {}); // Silent fail for related docs
            }, 100);

            return doc;
        } catch (error) {
            setError(`Failed to load document ${id}: ${error.message}`);
            throw error;
        }
    }

    async function preloadDocument(id) {
        try {
            await fetchWithCache(`docs/${id}`, { key: `doc_${id}` });
            return true;
        } catch {
            return false;
        }
    }

    // ==================== SEARCH FUNCTIONALITY ====================

    function debouncedSearch(query, limit = 20) {
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
        }

        setState(`${config.statePath}.search.query`, query);

        if (!query.trim()) {
            setState(`${config.statePath}.search.results`, []);
            return Promise.resolve([]);
        }

        return new Promise((resolve) => {
            searchDebounceTimer = setTimeout(async () => {
                try {
                    const results = await performSearch(query, limit);
                    resolve(results);
                } catch (error) {
                    resolve([]);
                }
            }, config.debounceMs);
        });
    }

    async function performSearch(query, limit = 20) {
        if (!query.trim()) {
            setState(`${config.statePath}.search.results`, []);
            return [];
        }

        try {
            const cacheKey = `search_${query}_${limit}`;
            const cached = getCachedData(cacheKey);
            
            if (cached) {
                setState(`${config.statePath}.search.results`, cached.results);
                return cached.results;
            }

            const url = `${config.baseUrl}/search?q=${encodeURIComponent(query)}&limit=${limit}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Search failed: ${response.statusText}`);
            }

            const data = await response.json();
            const results = data.results || [];

            // Cache search results
            setCachedData(cacheKey, data, config.cacheExpiry / 2); // Shorter cache for search

            setState(`${config.statePath}.search.results`, results);
            setState(`${config.statePath}.search.resultCount`, results.length);

            return results;

        } catch (error) {
            setError(`Search failed: ${error.message}`);
            setState(`${config.statePath}.search.results`, []);
            return [];
        }
    }

    // ==================== CACHE MANAGEMENT ====================

    function getCachedData(key) {
        const cached = cache.get(key);
        if (!cached) return null;

        if (Date.now() > cached.expires) {
            cache.delete(key);
            return null;
        }

        return cached.data;
    }

    function setCachedData(key, data, ttl = config.cacheExpiry) {
        cache.set(key, {
            data,
            expires: Date.now() + ttl,
            created: Date.now()
        });
    }

    function clearCache() {
        cache.clear();
        setState(`${config.statePath}.cache.cleared`, Date.now());
    }

    function getCacheStats() {
        const now = Date.now();
        let expired = 0;
        let total = cache.size;

        for (const [key, value] of cache.entries()) {
            if (now > value.expires) {
                expired++;
            }
        }

        return {
            total,
            expired,
            active: total - expired,
            size: cache.size
        };
    }

    // ==================== STATE MANAGEMENT ====================

    function initializeState() {
        setState(`${config.statePath}.loading`, false);
        setState(`${config.statePath}.error`, null);
        setState(`${config.statePath}.search.query`, '');
        setState(`${config.statePath}.search.results`, []);
        setState(`${config.statePath}.search.resultCount`, 0);
        setState(`${config.statePath}.current`, null);
        setState(`${config.statePath}.currentId`, null);
        setState(`${config.statePath}.related`, []);
        setState(`${config.statePath}.navigation`, {});
    }

    function setLoading(loading) {
        setState(`${config.statePath}.loading`, loading);
    }

    function setError(error) {
        setState(`${config.statePath}.error`, error);
    }

    function clearError() {
        setState(`${config.statePath}.error`, null);
    }
};
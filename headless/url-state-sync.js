(() => {

	const UrlStateSync = (props = {}, context) => {
		const { getState, setState, subscribe } = context;

		// Default configuration with comprehensive options
		const defaultConfig = {
			// State management
			statePath: 'url',                    // Base path in state where URL data is stored
			stateStructure: {
				path: 'path',                    // Key for current path
				segments: 'segments',            // Key for parsed segments
				params: 'params',                // Key for URL parameters
				query: 'query',                  // Key for query string
				hash: 'hash'                     // Key for hash fragment
			},

			// URL handling
			mode: 'hash',                        // 'hash' | 'history' | 'memory'
			basePath: '',                        // Base path for history mode
			caseSensitive: false,                // Case sensitive route matching
			trailingSlash: 'ignore',             // 'strict' | 'ignore' | 'redirect'

			// Route configuration
			routes: {},                          // Route definitions with guards and metadata
			defaultRoute: '/',                   // Default route when none matches
			notFoundRoute: '/404',               // Route for 404 handling

			// Route guards
			globalGuards: {
				beforeEnter: [],                 // Global guards before any route
				afterEnter: [],                  // Global guards after route change
				beforeLeave: []                  // Global guards before leaving route
			},

			// URL parsing
			parseQuery: true,                    // Parse query string into object
			parseParams: true,                   // Parse route parameters
			encodeParams: true,                  // URL encode/decode parameters

			// Segments parsing
			segmentParsing: {
				enabled: true,
				maxDepth: 10,                    // Maximum segment depth
				customKeys: ['base', 'sub', 'section', 'item'], // Custom segment names
				includeEmpty: false              // Include empty segments
			},

			// Event handling
			events: {
				beforeChange: null,              // Callback before URL change
				afterChange: null,               // Callback after URL change
				onError: null,                   // Error handling callback
				onGuardFail: null               // Guard failure callback
			},

			// Advanced options
			debounceMs: 0,                       // Debounce URL changes
			syncOnStateChange: false,            // Sync URL when state changes
			preventDuplicates: true,             // Prevent duplicate navigation
			preserveScrollPosition: false,       // Restore scroll position

			// Debug options
			debug: false,                        // Enable debug logging
			logPrefix: '🧭'                     // Prefix for log messages
		};

		// Merge user configuration with defaults
		const config = mergeDeep(defaultConfig, props.config || {});

		// Internal state
		let currentUrl = '';
		let isNavigating = false;
		let debounceTimer = null;
		let scrollPositions = new Map();
		let unsubscribeStateSync = null;

		// Initialize based on mode
		const urlHandler = createUrlHandler(config.mode);

		return {
			api: {
				// Navigation methods
				navigate: (path, options = {}) => navigate(path, options),
				replace: (path, options = {}) => navigate(path, { ...options, replace: true }),
				back: () => urlHandler.back(),
				forward: () => urlHandler.forward(),
				go: (delta) => urlHandler.go(delta),

				// State access
				getCurrentPath: () => getState(`${config.statePath}.${config.stateStructure.path}`),
				getSegments: () => getState(`${config.statePath}.${config.stateStructure.segments}`),
				getParams: () => getState(`${config.statePath}.${config.stateStructure.params}`, {}),
				getQuery: () => getState(`${config.statePath}.${config.stateStructure.query}`, {}),

				// Route management
				addRoute: (path, routeConfig) => addRoute(path, routeConfig),
				removeRoute: (path) => removeRoute(path),
				hasRoute: (path) => hasRoute(path),
				matchRoute: (path) => matchRoute(path),

				// Guard management
				addGuard: (type, guard) => addGuard(type, guard),
				removeGuard: (type, guard) => removeGuard(type, guard),

				// Utilities
				buildUrl: (path, params, query) => buildUrl(path, params, query),
				parseUrl: (url) => parseUrl(url),
				isActive: (path, exact = false) => isActive(path, exact),

				// Configuration
				updateConfig: (newConfig) => updateConfig(newConfig),
				getConfig: () => ({ ...config }),

				// Debug
				getState: () => getUrlState(),
				getHistory: () => urlHandler.getHistory?.() || []
			},

			hooks: {
				onRegister: () => {
					debugLog('UrlStateSync initializing...');

					// Initialize URL handler
					urlHandler.init();

					// Set up initial state
					handleUrlChange();

					// Set up event listeners
					setupEventListeners();

					// Set up state synchronization if enabled
					if (config.syncOnStateChange) {
						setupStateSync();
					}

					debugLog('UrlStateSync ready');
				},

				onUnregister: () => {
					debugLog('UrlStateSync cleaning up...');

					// Clean up event listeners
					cleanupEventListeners();

					// Clean up state sync
					if (unsubscribeStateSync) {
						unsubscribeStateSync();
						unsubscribeStateSync = null;
					}

					// Clear timers
					if (debounceTimer) {
						clearTimeout(debounceTimer);
					}

					debugLog('UrlStateSync cleaned up');
				}
			}
		};

		// ==================== URL HANDLERS ====================

		function createUrlHandler(mode) {
			switch (mode) {
				case 'history':
					return createHistoryHandler();
				case 'memory':
					return createMemoryHandler();
				case 'hash':
				default:
					return createHashHandler();
			}
		}

		function createHashHandler() {
			return {
				init: () => {
					window.addEventListener('hashchange', handleUrlChange);
					window.addEventListener('popstate', handleUrlChange);
				},
				cleanup: () => {
					window.removeEventListener('hashchange', handleUrlChange);
					window.removeEventListener('popstate', handleUrlChange);
				},
				getCurrentPath: () => window.location.hash.substring(1) || config.defaultRoute,
				navigate: (path, replace = false) => {
					if (replace) {
						window.location.replace('#' + path);
					} else {
						window.location.hash = path;
					}
				},
				back: () => window.history.back(),
				forward: () => window.history.forward(),
				go: (delta) => window.history.go(delta)
			};
		}

		function createHistoryHandler() {
			return {
				init: () => {
					window.addEventListener('popstate', handleUrlChange);
				},
				cleanup: () => {
					window.removeEventListener('popstate', handleUrlChange);
				},
				getCurrentPath: () => {
					const path = window.location.pathname + window.location.search;
					return path.startsWith(config.basePath)
						? path.substring(config.basePath.length) || config.defaultRoute
						: config.defaultRoute;
				},
				navigate: (path, replace = false) => {
					const fullPath = config.basePath + path;
					if (replace) {
						window.history.replaceState(null, '', fullPath);
					} else {
						window.history.pushState(null, '', fullPath);
					}
					handleUrlChange();
				},
				back: () => window.history.back(),
				forward: () => window.history.forward(),
				go: (delta) => window.history.go(delta)
			};
		}

		function createMemoryHandler() {
			let memoryHistory = [config.defaultRoute];
			let currentIndex = 0;

			return {
				init: () => { },
				cleanup: () => { },
				getCurrentPath: () => memoryHistory[currentIndex] || config.defaultRoute,
				navigate: (path, replace = false) => {
					if (replace) {
						memoryHistory[currentIndex] = path;
					} else {
						currentIndex++;
						memoryHistory = memoryHistory.slice(0, currentIndex);
						memoryHistory.push(path);
					}
					handleUrlChange();
				},
				back: () => {
					if (currentIndex > 0) {
						currentIndex--;
						handleUrlChange();
					}
				},
				forward: () => {
					if (currentIndex < memoryHistory.length - 1) {
						currentIndex++;
						handleUrlChange();
					}
				},
				go: (delta) => {
					const newIndex = currentIndex + delta;
					if (newIndex >= 0 && newIndex < memoryHistory.length) {
						currentIndex = newIndex;
						handleUrlChange();
					}
				},
				getHistory: () => [...memoryHistory]
			};
		}

		// ==================== URL CHANGE HANDLING ====================

		function handleUrlChange() {
			if (isNavigating) return;

			const debouncedHandle = () => {
				const newUrl = urlHandler.getCurrentPath();

				// Prevent duplicate navigation
				if (config.preventDuplicates && newUrl === currentUrl) {
					return;
				}

				debugLog('URL change detected:', newUrl);

				// Execute before change callback
				if (config.events.beforeChange) {
					try {
						const result = config.events.beforeChange(newUrl, currentUrl);
						if (result === false) {
							debugLog('URL change prevented by beforeChange callback');
							return;
						}
					} catch (error) {
						handleError('beforeChange callback error', error);
						return;
					}
				}

				processUrlChange(newUrl);
			};

			if (config.debounceMs > 0) {
				if (debounceTimer) clearTimeout(debounceTimer);
				debounceTimer = setTimeout(debouncedHandle, config.debounceMs);
			} else {
				debouncedHandle();
			}
		}

		async function processUrlChange(newUrl) {
			isNavigating = true;

			try {
				// Save scroll position
				if (config.preserveScrollPosition && currentUrl) {
					scrollPositions.set(currentUrl, {
						x: window.scrollX,
						y: window.scrollY
					});
				}

				// Match route and check guards
				const routeMatch = matchRoute(newUrl);
				const canNavigate = await checkAllGuards(newUrl, currentUrl, routeMatch);

				if (!canNavigate) {
					debugLog('Navigation blocked by guards');
					if (config.events.onGuardFail) {
						config.events.onGuardFail(newUrl, currentUrl);
					}
					return;
				}

				// Parse URL components
				const urlData = parseUrl(newUrl);

				// Update state
				updateUrlState(urlData);

				// Update current URL
				currentUrl = newUrl;

				// Restore scroll position
				if (config.preserveScrollPosition) {
					setTimeout(() => {
						const savedPosition = scrollPositions.get(newUrl);
						if (savedPosition) {
							window.scrollTo(savedPosition.x, savedPosition.y);
						}
					}, 0);
				}

				// Execute after change callback
				if (config.events.afterChange) {
					try {
						config.events.afterChange(newUrl, currentUrl);
					} catch (error) {
						handleError('afterChange callback error', error);
					}
				}

				debugLog('URL change completed:', newUrl);

			} catch (error) {
				handleError('URL change processing error', error);
			} finally {
				isNavigating = false;
			}
		}

		// ==================== ROUTE MATCHING & GUARDS ====================

		function matchRoute(path) {
			const normalizedPath = normalizePath(path);

			// Direct match
			if (config.routes[normalizedPath]) {
				return {
					path: normalizedPath,
					route: config.routes[normalizedPath],
					params: {},
					exact: true
				};
			}

			// Pattern matching
			for (const [routePath, routeConfig] of Object.entries(config.routes)) {
				const match = matchPattern(normalizedPath, routePath);
				if (match) {
					return {
						path: routePath,
						route: routeConfig,
						params: match.params,
						exact: match.exact
					};
				}
			}

			return null;
		}

		function matchPattern(path, pattern) {
			// Simple pattern matching - can be extended for more complex patterns
			const pathParts = path.split('/').filter(Boolean);
			const patternParts = pattern.split('/').filter(Boolean);

			if (pathParts.length !== patternParts.length) {
				return null;
			}

			const params = {};

			for (let i = 0; i < patternParts.length; i++) {
				const patternPart = patternParts[i];
				const pathPart = pathParts[i];

				if (patternPart.startsWith(':')) {
					// Parameter
					const paramName = patternPart.substring(1);
					params[paramName] = config.encodeParams ? decodeURIComponent(pathPart) : pathPart;
				} else if (patternPart !== pathPart) {
					// Exact match required
					if (!config.caseSensitive) {
						if (patternPart.toLowerCase() !== pathPart.toLowerCase()) {
							return null;
						}
					} else if (patternPart !== pathPart) {
						return null;
					}
				}
			}

			return { params, exact: true };
		}

		async function checkAllGuards(newUrl, oldUrl, routeMatch) {
			try {
				// Check global before guards
				for (const guard of config.globalGuards.beforeEnter) {
					const result = await executeGuard(guard, newUrl, oldUrl, routeMatch);
					if (result === false) return false;
				}

				// Check route-specific guards
				if (routeMatch?.route?.guards) {
					for (const guard of routeMatch.route.guards) {
						const result = await executeGuard(guard, newUrl, oldUrl, routeMatch);
						if (result === false) return false;
					}
				}

				return true;
			} catch (error) {
				handleError('Guard execution error', error);
				return false;
			}
		}

		async function executeGuard(guard, newUrl, oldUrl, routeMatch) {
			if (typeof guard === 'function') {
				return await guard(newUrl, oldUrl, routeMatch);
			} else if (typeof guard === 'string') {
				// Named guard - could be resolved from a registry
				debugLog(`Named guard not implemented: ${guard}`);
				return true;
			}
			return true;
		}

		// ==================== URL PARSING ====================

		function parseUrl(url) {
			const [pathAndQuery, hash] = url.split('#');
			const [path, queryString] = pathAndQuery.split('?');

			const normalizedPath = normalizePath(path);
			const segments = parseSegments(normalizedPath);
			const query = config.parseQuery ? parseQueryString(queryString) : queryString || '';
			const params = config.parseParams ? extractParams(normalizedPath) : {};

			return {
				[config.stateStructure.path]: normalizedPath,
				[config.stateStructure.segments]: segments,
				[config.stateStructure.params]: params,
				[config.stateStructure.query]: query,
				[config.stateStructure.hash]: hash || ''
			};
		}

		function parseSegments(path) {
			if (!config.segmentParsing.enabled) {
				return { full: path };
			}

			const parts = path.split('/').filter(part =>
				config.segmentParsing.includeEmpty || part !== ''
			).slice(0, config.segmentParsing.maxDepth);

			const segments = {
				full: path,
				parts: parts
			};

			// Add custom segment keys
			config.segmentParsing.customKeys.forEach((key, index) => {
				segments[key] = parts[index] || '';
			});

			return segments;
		}

		function parseQueryString(queryString) {
			if (!queryString) return {};

			const params = {};
			const pairs = queryString.split('&');

			for (const pair of pairs) {
				const [key, value] = pair.split('=');
				if (key) {
					const decodedKey = decodeURIComponent(key);
					const decodedValue = value ? decodeURIComponent(value) : '';
					params[decodedKey] = decodedValue;
				}
			}

			return params;
		}

		function extractParams(path) {
			// Extract parameters based on current route match
			const routeMatch = matchRoute(path);
			return routeMatch?.params || {};
		}

		// ==================== STATE MANAGEMENT ====================

		function updateUrlState(urlData) {
			Object.entries(urlData).forEach(([key, value]) => {
				setState(`${config.statePath}.${key}`, value);
			});
		}

		function getUrlState() {
			return getState(config.statePath, {});
		}

		function setupStateSync() {
			// Watch for state changes that should update the URL
			unsubscribeStateSync = subscribe(`${config.statePath}.${config.stateStructure.path}`, (newPath) => {
				if (newPath !== currentUrl) {
					navigate(newPath, { internal: true });
				}
			});
		}

		// ==================== PUBLIC API METHODS ====================

		function navigate(path, options = {}) {
			if (options.internal) return; // Prevent infinite loops

			const normalizedPath = normalizePath(path);
			urlHandler.navigate(normalizedPath, options.replace);
		}

		function addRoute(path, routeConfig) {
			config.routes[normalizePath(path)] = routeConfig;
			debugLog('Route added:', path);
		}

		function removeRoute(path) {
			delete config.routes[normalizePath(path)];
			debugLog('Route removed:', path);
		}

		function hasRoute(path) {
			return normalizePath(path) in config.routes;
		}

		function addGuard(type, guard) {
			if (config.globalGuards[type]) {
				config.globalGuards[type].push(guard);
				debugLog('Guard added:', type);
			}
		}

		function removeGuard(type, guard) {
			if (config.globalGuards[type]) {
				const index = config.globalGuards[type].indexOf(guard);
				if (index > -1) {
					config.globalGuards[type].splice(index, 1);
					debugLog('Guard removed:', type);
				}
			}
		}

		function buildUrl(path, params = {}, query = {}) {
			let url = normalizePath(path);

			// Replace parameters
			Object.entries(params).forEach(([key, value]) => {
				url = url.replace(`:${key}`, config.encodeParams ? encodeURIComponent(value) : value);
			});

			// Add query string
			const queryString = Object.entries(query)
				.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
				.join('&');

			if (queryString) {
				url += '?' + queryString;
			}

			return url;
		}

		function isActive(path, exact = false) {
			const normalizedPath = normalizePath(path);
			const currentPath = getState(`${config.statePath}.${config.stateStructure.path}`);

			if (exact) {
				return currentPath === normalizedPath;
			} else {
				return currentPath?.startsWith(normalizedPath);
			}
		}

		function updateConfig(newConfig) {
			Object.assign(config, newConfig);
			debugLog('Configuration updated');
		}

		// ==================== UTILITY FUNCTIONS ====================

		function normalizePath(path) {
			if (!path || path === '/') return '/';

			// Handle trailing slash
			if (config.trailingSlash === 'strict') {
				return path; // Keep as is
			} else if (config.trailingSlash === 'redirect') {
				return path.endsWith('/') ? path.slice(0, -1) : path;
			} else {
				// ignore - normalize by removing trailing slash
				return path.endsWith('/') ? path.slice(0, -1) : path;
			}
		}

		function setupEventListeners() {
			// Additional event listeners can be added here
		}

		function cleanupEventListeners() {
			urlHandler.cleanup();
		}

		function handleError(context, error) {
			debugLog(`Error in ${context}:`, error);
			if (config.events.onError) {
				config.events.onError(context, error);
			}
		}

		function debugLog(...args) {
			if (config.debug) {
				console.log(config.logPrefix, ...args);
			}
		}

		function mergeDeep(target, source) {
			const result = { ...target };

			for (const key in source) {
				if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
					result[key] = mergeDeep(target[key] || {}, source[key]);
				} else {
					result[key] = source[key];
				}
			}

			return result;
		}
	};


	// Export Juris globally
	if (typeof window !== 'undefined') {
		window.UrlStateSync = UrlStateSync;
	}

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = UrlStateSync;
	}

})();
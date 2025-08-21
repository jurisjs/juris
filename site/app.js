//createMobileConsole();
const startTime = performance.now();
// Add this code to your test file (before the DOMContentLoaded event)

function createMobileConsole() {
	// Create mobile console overlay
	const mobileConsole = document.createElement('div');
	mobileConsole.id = 'mobile-console';
	mobileConsole.style.cssText = `
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: rgba(0, 0, 0, 0.95);
        color: #00ff00;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        padding: 10px;
        max-height: 200px;
        overflow-y: auto;
        z-index: 99999;
        border-top: 2px solid #333;
        box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5);
    `;

	// Add header with controls
	mobileConsole.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid #333; padding-bottom: 5px;">
            <strong style="color: #00ff00;">📱 Mobile Console</strong>
            <div>
                <button onclick="clearMobileConsole()" style="background: #ff4444; color: white; border: none; padding: 4px 8px; border-radius: 3px; font-size: 10px; margin-right: 5px;">Clear</button>
                <button onclick="toggleMobileConsole()" style="background: #4444ff; color: white; border: none; padding: 4px 8px; border-radius: 3px; font-size: 10px;">Hide</button>
            </div>
        </div>
        <div id="mobile-console-content"></div>
    `;

	document.body.appendChild(mobileConsole);

	// Store original console methods
	const originalLog = console.log;
	const originalWarn = console.warn;
	const originalError = console.error;
	const originalInfo = console.info;

	// Override console methods
	console.log = function (...args) {
		originalLog.apply(console, args);
		addMobileLog('LOG', args.join(' '), '#00ff00');
	};

	console.warn = function (...args) {
		originalWarn.apply(console, args);
		addMobileLog('WARN', args.join(' '), '#ffaa00');
	};

	console.error = function (...args) {
		originalError.apply(console, args);
		addMobileLog('ERROR', args.join(' '), '#ff4444');
	};

	console.info = function (...args) {
		originalInfo.apply(console, args);
		addMobileLog('INFO', args.join(' '), '#4488ff');
	};

	// Add log entry to mobile console
	window.addMobileLog = function (level, message, color) {
		const content = document.getElementById('mobile-console-content');
		if (content) {
			const time = new Date().toLocaleTimeString();
			const logEntry = document.createElement('div');
			logEntry.style.cssText = `
                margin: 2px 0;
                padding: 3px 6px;
                border-radius: 3px;
                background: rgba(255, 255, 255, 0.05);
                border-left: 3px solid ${color};
                font-size: 11px;
                line-height: 1.3;
                word-wrap: break-word;
            `;
			logEntry.innerHTML = `<span style="color: #888;">[${time}]</span> <span style="color: ${color}; font-weight: bold;">[${level}]</span> <span style="color: ${color};">${message}</span>`;
			content.appendChild(logEntry);
			content.scrollTop = content.scrollHeight;

			// Limit to last 50 entries to prevent memory issues
			while (content.children.length > 50) {
				content.removeChild(content.firstChild);
			}
		}
	};

	// Clear console function
	window.clearMobileConsole = function () {
		const content = document.getElementById('mobile-console-content');
		if (content) {
			content.innerHTML = '';
		}
	};

	// Toggle console visibility
	window.toggleMobileConsole = function () {
		const console = document.getElementById('mobile-console');
		if (console) {
			if (console.style.display === 'none') {
				console.style.display = 'block';
			} else {
				console.style.display = 'none';
			}
		}
	};

}

// Initialize mobile console if on mobile device
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
	//createMobileConsole();
}

// Enhanced StatePersistenceManager with Timing Controls for Layout Shift Prevention
const StatePersistenceManager = (props, context) => {
	const { getState, setState, subscribe } = context;

	// Enhanced configuration with timing controls
	const config = {
		domains: props.domains || [],
		excludeDomains: props.excludeDomains || ['temp', 'cache', 'session', 'geolocation', 'persistence'],
		keyPrefix: props.keyPrefix || 'app_state_',
		debounceMs: props.debounceMs || 1000,
		debug: props.debug || false,
		autoDetectNewDomains: props.autoDetectNewDomains || true,
		watchIntervalMs: props.watchIntervalMs || 5000,

		// Timing controls for layout shift prevention
		aggressiveRestore: props.aggressiveRestore !== false, // Default: true
		restoreDelay: props.restoreDelay || 0,
		priorityDomains: props.priorityDomains || [], // Restore these first
		earlyRestoreTimeout: props.earlyRestoreTimeout || 50,

		// Granular domain timing
		domainRestoreConfig: props.domainRestoreConfig || {},

		// Save timing controls
		immediateSave: props.immediateSave || [], // Save changes immediately
		criticalSave: props.criticalSave || [], // Save with shorter debounce
		criticalDebounceMs: props.criticalDebounceMs || 200,

		// User-specific domains (requires authentication)
		userSpecificDomains: props.userSpecificDomains || [],
		userIdPath: props.userIdPath || 'auth.user.id', // Path to user ID in state
		requireAuth: props.requireAuth || false // Whether user-specific domains require auth
	};

	// Internal state
	let saveTimers = new Map();
	let isRestoring = false;
	let domainSubscriptions = new Map();
	let domainWatcher = null;
	let restoreQueue = [];
	let isProcessingRestoreQueue = false;

	return {
		hooks: {
			onRegister: () => {

				// Initialize persistence state - DIRECT INJECTION
				if (context.juris && context.juris.stateManager && context.juris.stateManager.state) {
					context.juris.stateManager.state.persistence = {
						isEnabled: true,
						lastSave: null,
						lastRestore: null,
						errors: [],
						stats: {
							domainsTracked: 0,
							totalSaves: 0,
							totalRestores: 0,
							priorityRestores: 0,
							delayedRestores: 0
						}
					};
				} else {
					// Fallback if direct access not available
					setState('persistence.isEnabled', true);
					setState('persistence.lastSave', null);
					setState('persistence.lastRestore', null);
					setState('persistence.errors', []);
					setState('persistence.stats', {
						domainsTracked: 0,
						totalSaves: 0,
						totalRestores: 0,
						priorityRestores: 0,
						delayedRestores: 0
					});
				}

				// Restore state with timing controls
				if (config.aggressiveRestore) {
					restoreAllDomainsWithTiming();
				} else {
					setTimeout(() => restoreAllDomainsWithTiming(), config.restoreDelay);
				}

				// Setup monitoring after early restore
				setTimeout(() => {
					setupDomainMonitoring();

					if (config.autoDetectNewDomains) {
						setupDomainWatcher();
					}
				}, Math.max(config.earlyRestoreTimeout, 100));

				// Setup cross-tab sync
				window.addEventListener('storage', handleStorageEvent);
				window.addEventListener('beforeunload', saveAllTrackedDomains);

			},

			onUnregister: () => {

				// Save all before cleanup
				saveAllTrackedDomains();

				// Clear all timers
				saveTimers.forEach(timer => clearTimeout(timer));
				saveTimers.clear();

				if (domainWatcher) {
					clearInterval(domainWatcher);
					domainWatcher = null;
				}

				// Unsubscribe from all domains
				domainSubscriptions.forEach(unsubscribe => unsubscribe());
				domainSubscriptions.clear();

				// Remove storage listener
				window.removeEventListener('storage', handleStorageEvent);
				window.removeEventListener('beforeunload', saveAllTrackedDomains);

			}
		},

		api: {
			saveDomain: (domain, immediate = false) => saveDomain(domain, immediate),
			saveAllDomains: () => saveAllTrackedDomains(),
			restoreDomain: (domain) => restoreDomain(domain),
			restoreAllDomains: () => restoreAllDomainsWithTiming(),
			addDomain: (domain) => addDomainTracking(domain),
			removeDomain: (domain) => removeDomainTracking(domain),
			clearDomain: (domain) => clearDomainStorage(domain),
			clearAllStorage: () => clearAllStorage(),
			getStorageStats: () => getStorageStats(),
			getTrackedDomains: () => Array.from(domainSubscriptions.keys()),
			exportState: () => exportState(),
			importState: (data) => importState(data),
			refreshDomainDetection: () => setupDomainMonitoring(),
			forceImmediateSave: (domain) => saveDomain(domain, true),
			restorePriorityDomains: () => restorePriorityDomains(),
			getRestoreQueue: () => [...restoreQueue],
			updateTimingConfig: (newConfig) => Object.assign(config, newConfig),
			getConfig: () => ({ ...config }) // Get current configuration
		}
	};

	// Enhanced restore with timing controls
	function restoreAllDomainsWithTiming() {
		log('📂 Starting timed restore sequence...');

		// Get all stored domains by scanning localStorage
		const storedDomains = [];
		const keyPrefix = config.keyPrefix;

		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && key.startsWith(keyPrefix)) {
				// Extract domain from key
				let remainder = key.substring(keyPrefix.length);

				// Split by underscore and take first part as domain
				let domain = remainder.split('_')[0];

				// Only include if it's a valid domain and not already included
				if (domain && !storedDomains.includes(domain)) {
					storedDomains.push(domain);
				}
			}
		}

		log(`📂 Found stored domains: [${storedDomains.join(', ')}]`);

		if (storedDomains.length === 0) {
			log('📂 No stored domains found');
			// DIRECT INJECTION for lastRestore
			if (context.juris && context.juris.stateManager && context.juris.stateManager.state && context.juris.stateManager.state.persistence) {
				context.juris.stateManager.state.persistence.lastRestore = Date.now();
			}
			return { restored: [], failed: [] };
		}

		// Sort domains by priority and timing configuration
		const sortedDomains = storedDomains.sort((a, b) => {
			const configA = config.domainRestoreConfig[a] || { priority: 999, delay: 0 };
			const configB = config.domainRestoreConfig[b] || { priority: 999, delay: 0 };

			if (configA.priority !== configB.priority) {
				return configA.priority - configB.priority;
			}
			return configA.delay - configB.delay;
		});

		log(`📂 Restore order: [${sortedDomains.join(', ')}]`);

		// Process domains with their configured timing
		let cumulativeDelay = 0;
		const results = { restored: [], failed: [], priority: [], delayed: [] };

		sortedDomains.forEach((domain, index) => {
			const domainConfig = config.domainRestoreConfig[domain] || { priority: 999, delay: 0, aggressive: false };

			if (domainConfig.aggressive || config.priorityDomains.includes(domain)) {
				// Immediate restore for aggressive/priority domains
				if (restoreDomain(domain)) {
					results.restored.push(domain);
					results.priority.push(domain);

					// DIRECT INJECTION for stats
					if (context.juris && context.juris.stateManager && context.juris.stateManager.state && context.juris.stateManager.state.persistence) {
						context.juris.stateManager.state.persistence.stats.priorityRestores =
							(context.juris.stateManager.state.persistence.stats.priorityRestores || 0) + 1;
					}
				} else {
					results.failed.push(domain);
				}

				log(`⚡ Priority restore completed for ${domain} immediately`);

			} else {
				// Delayed restore for non-critical domains
				const restoreDelay = cumulativeDelay + domainConfig.delay;

				setTimeout(() => {
					if (restoreDomain(domain)) {
						results.restored.push(domain);
						results.delayed.push(domain);

						// DIRECT INJECTION for stats
						if (context.juris && context.juris.stateManager && context.juris.stateManager.state && context.juris.stateManager.state.persistence) {
							context.juris.stateManager.state.persistence.stats.delayedRestores =
								(context.juris.stateManager.state.persistence.stats.delayedRestores || 0) + 1;
						}
					} else {
						results.failed.push(domain);
					}
				}, restoreDelay);

				log(`⏳ Delayed restore scheduled for ${domain} at ${restoreDelay}ms`);
				cumulativeDelay += domainConfig.delay;
			}
		});

		// Update final restore timestamp
		const finalDelay = Math.max(cumulativeDelay, config.earlyRestoreTimeout);
		setTimeout(() => {
			// DIRECT INJECTION for lastRestore
			if (context.juris && context.juris.stateManager && context.juris.stateManager.state && context.juris.stateManager.state.persistence) {
				context.juris.stateManager.state.persistence.lastRestore = Date.now();
			}
			log(`📂 Restore sequence completed. Priority: ${results.priority.length}, Delayed: ${results.delayed.length}, Failed: ${results.failed.length}`);
		}, finalDelay);

		return results;
	}

	function restorePriorityDomains() {
		log('⚡ Restoring priority domains only...');

		const priorityResults = { restored: [], failed: [] };

		config.priorityDomains.forEach(domain => {
			if (restoreDomain(domain)) {
				priorityResults.restored.push(domain);
			} else {
				priorityResults.failed.push(domain);
			}
		});

		log(`⚡ Priority restore completed: [${priorityResults.restored.join(', ')}]`);
		return priorityResults;
	}

	function setupDomainMonitoring() {
		log('🔍 Setting up domain monitoring...');

		const allState = context.juris.stateManager.state;
		const availableDomains = Object.keys(allState);
		log(`🔍 Available domains in state:`, availableDomains);

		// Clear existing subscriptions
		domainSubscriptions.forEach(unsubscribe => unsubscribe());
		domainSubscriptions.clear();

		// Determine which domains to track
		let domainsToTrack = [];

		if (config.domains.length > 0) {
			domainsToTrack = config.domains.filter(domain => {
				const exists = availableDomains.includes(domain);
				if (!exists) {
					log(`⚠️ Configured domain '${domain}' not found in state`);
				}
				return exists && !config.excludeDomains.includes(domain);
			});
		} else {
			domainsToTrack = availableDomains.filter(domain =>
				!config.excludeDomains.includes(domain)
			);
		}

		log(`📊 Domains to track: [${domainsToTrack.join(', ')}]`);

		// Track each domain
		domainsToTrack.forEach(domain => {
			addDomainTracking(domain);
		});

		// Update stats - DIRECT INJECTION
		if (context.juris && context.juris.stateManager && context.juris.stateManager.state && context.juris.stateManager.state.persistence) {
			context.juris.stateManager.state.persistence.stats.domainsTracked = domainSubscriptions.size;
		}

		log(`✅ Now tracking ${domainSubscriptions.size} domains: [${Array.from(domainSubscriptions.keys()).join(', ')}]`);
	}

	function setupDomainWatcher() {
		domainWatcher = setInterval(() => {
			const currentDomains = Object.keys(context.juris.stateManager.state);
			const trackedDomains = Array.from(domainSubscriptions.keys());

			const newDomains = currentDomains.filter(domain =>
				!trackedDomains.includes(domain) &&
				!config.excludeDomains.includes(domain) &&
				(config.domains.length === 0 || config.domains.includes(domain))
			);

			if (newDomains.length > 0) {
				log(`🆕 Detected new domains: [${newDomains.join(', ')}]`);
				newDomains.forEach(domain => addDomainTracking(domain));

				// DIRECT INJECTION for stats
				if (context.juris && context.juris.stateManager && context.juris.stateManager.state && context.juris.stateManager.state.persistence) {
					context.juris.stateManager.state.persistence.stats.domainsTracked = domainSubscriptions.size;
				}
			}
		}, config.watchIntervalMs);

		log(`👀 Domain watcher started (checking every ${config.watchIntervalMs}ms)`);
	}

	function addDomainTracking(domain) {
		if (domainSubscriptions.has(domain)) {
			log(`⚠️ Domain ${domain} already being tracked`);
			return false;
		}

		try {
			const testValue = getState(domain);
			log(`🔍 Testing domain '${domain}': ${testValue !== undefined ? 'exists' : 'undefined'}`);

			// Use internal subscription
			const unsubscribe = context.juris.stateManager.subscribeInternal(domain, () => {
				if (!isRestoring) {
					const currentValue = getState(domain);
					log(`🔄 State change detected in domain: ${domain}`, { currentValue });
					debouncedSave(domain, currentValue);
				}
			});

			domainSubscriptions.set(domain, unsubscribe);
			log(`➕ Added tracking for domain: ${domain}`);
			return true;

		} catch (error) {
			logError(`Failed to add tracking for domain ${domain}:`, error);
			return false;
		}
	}

	function removeDomainTracking(domain) {
		const unsubscribe = domainSubscriptions.get(domain);
		if (unsubscribe) {
			unsubscribe();
			domainSubscriptions.delete(domain);
			log(`➖ Removed tracking for domain: ${domain}`);
			return true;
		}

		log(`⚠️ Domain ${domain} was not being tracked`);
		return false;
	}

	function debouncedSave(domain, value) {
		// Clear existing timer
		if (saveTimers.has(domain)) {
			clearTimeout(saveTimers.get(domain));
		}

		// Determine save timing based on domain configuration
		let saveDelay = config.debounceMs;

		if (config.immediateSave.includes(domain)) {
			// Immediate save for critical domains
			saveDomain(domain, true);
			return;
		} else if (config.criticalSave.includes(domain)) {
			// Faster save for critical domains
			saveDelay = config.criticalDebounceMs;
		}

		const timer = setTimeout(() => {
			saveDomain(domain, false);
			saveTimers.delete(domain);
		}, saveDelay);

		saveTimers.set(domain, timer);

		const saveType = config.criticalSave.includes(domain) ? 'CRITICAL' : 'NORMAL';
		log(`⏰ ${saveType} save scheduled for domain: ${domain} in ${saveDelay}ms`);
	}

	function saveDomain(domain, immediate = false) {
		try {
			const value = getState(domain);
			if (value === undefined || value === null) {
				log(`⚠️ Skipping save for undefined domain: ${domain}`);
				return false;
			}

			const dataPackage = {
				value: value,
				timestamp: Date.now(),
				domain: domain,
				immediate: immediate
			};

			// Check if domain requires user-specific storage
			const isUserSpecific = config.userSpecificDomains.includes(domain);
			const currentUserId = getUserId();

			if (isUserSpecific && config.requireAuth && !currentUserId) {
				log(`⚠️ Skipping save for user-specific domain '${domain}' - no authenticated user`);
				return false;
			}

			// Build storage key
			let storageKey = config.keyPrefix + domain;
			if (isUserSpecific && currentUserId) {
				storageKey = `${storageKey}_${currentUserId}`;
			}

			localStorage.setItem(storageKey, JSON.stringify(dataPackage));

			// Update statistics - DIRECT INJECTION
			if (context.juris && context.juris.stateManager && context.juris.stateManager.state && context.juris.stateManager.state.persistence) {
				const stats = context.juris.stateManager.state.persistence.stats;
				stats.totalSaves = (stats.totalSaves || 0) + 1;

				context.juris.stateManager.state.persistence.lastSave = {
					domain,
					timestamp: Date.now(),
					size: JSON.stringify(dataPackage).length,
					immediate
				};
			}

			const saveType = immediate ? 'IMMEDIATE' : 'DEBOUNCED';
			log(`💾 ${saveType} saved domain: ${domain} (${JSON.stringify(dataPackage).length} bytes) key: ${storageKey}`);
			return true;

		} catch (error) {
			logError(`Failed to save domain ${domain}:`, error);
			return false;
		}
	}

	function restoreDomain(domain) {
		try {
			const isUserSpecific = config.userSpecificDomains.includes(domain);
			const currentUserId = getUserId();

			// Build storage key
			let storageKey = config.keyPrefix + domain;
			if (isUserSpecific && currentUserId) {
				storageKey = `${storageKey}_${currentUserId}`;
			}

			const stored = localStorage.getItem(storageKey);

			if (!stored) {
				log(`📂 No stored data for domain: ${domain} (key: ${storageKey})`);
				return false;
			}

			const data = JSON.parse(stored);

			// DIRECT INJECTION - Restore directly to state without triggering subscriptions
			isRestoring = true;

			// Direct injection into the state manager's internal state
			if (context.juris && context.juris.stateManager && context.juris.stateManager.state) {
				context.juris.stateManager.state[domain] = data.value;
				log(`📂 DIRECT INJECT: ${domain} directly injected into state`);
			} else {
				// Fallback to setState if direct access not available
				setState(domain, data.value);
				log(`📂 FALLBACK: ${domain} restored via setState`);
			}

			isRestoring = false;

			// Update statistics - DIRECT INJECTION
			if (context.juris && context.juris.stateManager && context.juris.stateManager.state && context.juris.stateManager.state.persistence) {
				const stats = context.juris.stateManager.state.persistence.stats;
				stats.totalRestores = (stats.totalRestores || 0) + 1;

				context.juris.stateManager.state.persistence.lastRestore = {
					domain,
					timestamp: Date.now(),
					dataTimestamp: data.timestamp
				};
			}

			log(`📂 Restored domain: ${domain} (saved ${new Date(data.timestamp).toLocaleString()})`);
			return true;

		} catch (error) {
			logError(`Failed to restore domain ${domain}:`, error);
			return false;
		}
	}

	function saveAllTrackedDomains() {
		log('💾 Saving all tracked domains...');

		const savedDomains = [];
		const failedDomains = [];

		domainSubscriptions.forEach((unsubscribe, domain) => {
			if (saveDomain(domain, true)) {
				savedDomains.push(domain);
			} else {
				failedDomains.push(domain);
			}
		});

		log(`💾 Saved ${savedDomains.length} domains: [${savedDomains.join(', ')}]`);

		if (failedDomains.length > 0) {
			logError(`❌ Failed to save ${failedDomains.length} domains: [${failedDomains.join(', ')}]`);
		}

		return { saved: savedDomains, failed: failedDomains };
	}

	function handleStorageEvent(event) {
		if (!event.key || !event.key.startsWith(config.keyPrefix)) {
			return;
		}

		// Extract domain from key
		let remainder = event.key.substring(config.keyPrefix.length);
		let domain = remainder.split('_')[0];

		if (domainSubscriptions.has(domain)) {
			log(`🔄 Storage changed externally for domain: ${domain}`);

			if (event.newValue) {
				// Parse and directly inject the new value
				try {
					const data = JSON.parse(event.newValue);
					isRestoring = true;

					// DIRECT INJECTION for cross-tab sync
					if (context.juris && context.juris.stateManager && context.juris.stateManager.state) {
						context.juris.stateManager.state[domain] = data.value;
						log(`🔄 DIRECT INJECT: ${domain} synced from external tab`);
					} else {
						setState(domain, data.value);
						log(`🔄 FALLBACK: ${domain} synced via setState`);
					}

					isRestoring = false;
				} catch (error) {
					logError(`Failed to parse external change for ${domain}:`, error);
				}
			} else {
				// Value was deleted externally
				isRestoring = true;
				if (context.juris && context.juris.stateManager && context.juris.stateManager.state) {
					delete context.juris.stateManager.state[domain];
					log(`🔄 DIRECT DELETE: ${domain} removed from state`);
				} else {
					setState(domain, undefined);
					log(`🔄 FALLBACK DELETE: ${domain} removed via setState`);
				}
				isRestoring = false;
			}
		}
	}

	function clearDomainStorage(domain) {
		try {
			const isUserSpecific = config.userSpecificDomains.includes(domain);
			const currentUserId = getUserId();

			let storageKey = config.keyPrefix + domain;
			if (isUserSpecific && currentUserId) {
				storageKey = `${storageKey}_${currentUserId}`;
			}

			localStorage.removeItem(storageKey);
			log(`🗑️ Cleared storage for domain: ${domain} (key: ${storageKey})`);
			return true;
		} catch (error) {
			logError(`Failed to clear storage for domain ${domain}:`, error);
			return false;
		}
	}

	function clearAllStorage() {
		try {
			const keysToRemove = [];

			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key && key.startsWith(config.keyPrefix)) {
					keysToRemove.push(key);
				}
			}

			keysToRemove.forEach(key => localStorage.removeItem(key));

			log(`🗑️ Cleared ${keysToRemove.length} storage entries`);
			return true;
		} catch (error) {
			logError('Failed to clear all storage:', error);
			return false;
		}
	}

	function getStorageStats() {
		let totalSize = 0;
		let entryCount = 0;
		const domains = [];

		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && key.startsWith(config.keyPrefix)) {
				const value = localStorage.getItem(key);
				totalSize += key.length + (value ? value.length : 0);
				entryCount++;

				// Extract domain from key
				let remainder = key.substring(config.keyPrefix.length);
				let domain = remainder.split('_')[0];
				domains.push(domain);
			}
		}

		return {
			totalSize,
			entryCount,
			domains: [...new Set(domains)], // Remove duplicates
			trackedDomains: Array.from(domainSubscriptions.keys()),
			config: {
				aggressiveRestore: config.aggressiveRestore,
				priorityDomains: config.priorityDomains,
				immediateSave: config.immediateSave,
				criticalSave: config.criticalSave,
				keyPrefix: config.keyPrefix,
				userSpecificDomains: config.userSpecificDomains
			}
		};
	}

	function exportState() {
		const exportData = {
			timestamp: Date.now(),
			domains: {}
		};

		domainSubscriptions.forEach((unsubscribe, domain) => {
			exportData.domains[domain] = getState(domain);
		});

		return exportData;
	}

	function importState(data) {
		try {
			if (!data.domains) {
				throw new Error('Invalid import data format');
			}

			isRestoring = true;

			Object.entries(data.domains).forEach(([domain, value]) => {
				// DIRECT INJECTION for import as well
				if (context.juris && context.juris.stateManager && context.juris.stateManager.state) {
					context.juris.stateManager.state[domain] = value;
					log(`📥 DIRECT INJECT: ${domain} imported directly into state`);
				} else {
					setState(domain, value);
					log(`📥 FALLBACK: ${domain} imported via setState`);
				}
				saveDomain(domain, true);
			});

			isRestoring = false;

			log(`📥 Imported ${Object.keys(data.domains).length} domains`);
			return true;
		} catch (error) {
			isRestoring = false;
			logError('Import failed:', error);
			return false;
		}
	}

	// Helper function to get user ID from configurable path
	function getUserId() {
		try {
			const pathParts = config.userIdPath.split('.');
			let value = context.juris.stateManager.state;

			for (const part of pathParts) {
				if (value && typeof value === 'object') {
					value = value[part];
				} else {
					return null;
				}
			}

			return value;
		} catch (error) {
			log(`⚠️ Failed to get user ID from path: ${config.userIdPath}`, error);
			return null;
		}
	}

	function log(message, ...args) {
		if (config.debug) {
		}
	}

	function logError(message, error = null) {

		// DIRECT INJECTION for errors
		if (context.juris && context.juris.stateManager && context.juris.stateManager.state && context.juris.stateManager.state.persistence) {
			const errors = context.juris.stateManager.state.persistence.errors;
			errors.push({
				message,
				error: error ? error.message : null,
				timestamp: Date.now()
			});

			if (errors.length > 10) {
				errors.splice(0, errors.length - 10);
			}
		}
	}
};

// GeolocationManager - Headless Component for Location Services
const GeolocationManager = (props, context) => {
	const { getState, setState, subscribe } = context;

	let watchId = null;
	let isWatching = false;

	// Configuration with defaults
	const config = {
		enableHighAccuracy: props.enableHighAccuracy !== false, // Default true
		timeout: props.timeout || 15000, // 15 seconds default
		maximumAge: props.maximumAge || 300000, // 5 minutes cache default
		autoStart: props.autoStart !== false, // Default true
		watchPosition: props.watchPosition || false, // Default false (single update)
		retryAttempts: props.retryAttempts || 3,
		retryDelay: props.retryDelay || 2000, // 2 seconds between retries
		statePath: props.statePath || 'geolocation' // Customizable state path
	};

	// Check if geolocation is supported
	const isSupported = () => 'geolocation' in navigator;

	// Initialize geolocation state structure
	const initializeState = () => {
		setState(`${config.statePath}.isSupported`, isSupported());
		setState(`${config.statePath}.isLoading`, false);
		setState(`${config.statePath}.error`, null);
		setState(`${config.statePath}.position`, null);
		setState(`${config.statePath}.lastUpdated`, null);
		setState(`${config.statePath}.accuracy`, null);
		setState(`${config.statePath}.isWatching`, false);
		setState(`${config.statePath}.retryCount`, 0);

		// Permission state
		setState(`${config.statePath}.permission.state`, 'prompt'); // 'granted', 'denied', 'prompt'
		setState(`${config.statePath}.permission.requested`, false);
	};

	// Check permission status (if supported)
	const checkPermissionStatus = async () => {
		if ('permissions' in navigator) {
			try {
				const permission = await navigator.permissions.query({ name: 'geolocation' });
				setState(`${config.statePath}.permission.state`, permission.state);

				// Listen for permission changes
				permission.addEventListener('change', () => {
					setState(`${config.statePath}.permission.state`, permission.state);

					// If permission was granted and we had an error, retry
					if (permission.state === 'granted' && getState(`${config.statePath}.error`)) {
						getCurrentPosition();
					}
				});
			} catch (error) {
				console.log('🗺️ Permission API not fully supported');
			}
		}
	};

	// Handle successful position update
	const onPositionSuccess = (position) => {
		const locationData = {
			latitude: position.coords.latitude,
			longitude: position.coords.longitude,
			accuracy: position.coords.accuracy,
			altitude: position.coords.altitude,
			altitudeAccuracy: position.coords.altitudeAccuracy,
			heading: position.coords.heading,
			speed: position.coords.speed,
			timestamp: position.timestamp
		};

		// Update state
		setState(`${config.statePath}.position`, locationData);
		setState(`${config.statePath}.lastUpdated`, Date.now());
		setState(`${config.statePath}.accuracy`, position.coords.accuracy);
		setState(`${config.statePath}.isLoading`, false);
		setState(`${config.statePath}.error`, null);
		setState(`${config.statePath}.retryCount`, 0);
		setState(`${config.statePath}.permission.state`, 'granted');


		// Trigger address lookup if enabled
		if (props.enableAddressLookup) {
			lookupAddress(locationData.latitude, locationData.longitude);
		}
	};

	// Handle geolocation errors
	const onPositionError = (error) => {
		let errorMessage = 'Unknown geolocation error';
		let errorCode = error.code;

		switch (error.code) {
			case error.PERMISSION_DENIED:
				errorMessage = 'Location access denied by user';
				setState(`${config.statePath}.permission.state`, 'denied');
				break;
			case error.POSITION_UNAVAILABLE:
				errorMessage = 'Location information unavailable';
				break;
			case error.TIMEOUT:
				errorMessage = 'Location request timed out';
				break;
		}

		setState(`${config.statePath}.error`, {
			message: errorMessage,
			code: errorCode,
			timestamp: Date.now()
		});
		setState(`${config.statePath}.isLoading`, false);

		console.error('🗺️ Geolocation error:', errorMessage);

		// Retry logic for timeout errors
		if (error.code === error.TIMEOUT) {
			const retryCount = getState(`${config.statePath}.retryCount`, 0);
			if (retryCount < config.retryAttempts) {
				setState(`${config.statePath}.retryCount`, retryCount + 1);

				setTimeout(() => {
					getCurrentPosition();
				}, config.retryDelay);
			}
		}
	};

	// Get current position (single update)
	const getCurrentPosition = () => {
		if (!isSupported()) {
			setState(`${config.statePath}.error`, {
				message: 'Geolocation not supported',
				code: 'NOT_SUPPORTED',
				timestamp: Date.now()
			});
			return;
		}

		setState(`${config.statePath}.isLoading`, true);
		setState(`${config.statePath}.permission.requested`, true);

		navigator.geolocation.getCurrentPosition(
			onPositionSuccess,
			onPositionError,
			{
				enableHighAccuracy: config.enableHighAccuracy,
				timeout: config.timeout,
				maximumAge: config.maximumAge
			}
		);
	};

	// Start watching position (continuous updates)
	const startWatching = () => {
		if (!isSupported() || isWatching) return;

		setState(`${config.statePath}.isWatching`, true);
		setState(`${config.statePath}.permission.requested`, true);
		isWatching = true;

		watchId = navigator.geolocation.watchPosition(
			onPositionSuccess,
			onPositionError,
			{
				enableHighAccuracy: config.enableHighAccuracy,
				timeout: config.timeout,
				maximumAge: config.maximumAge
			}
		);

	};

	// Stop watching position
	const stopWatching = () => {
		if (watchId !== null) {
			navigator.geolocation.clearWatch(watchId);
			watchId = null;
			isWatching = false;
			setState(`${config.statePath}.isWatching`, false);
		}
	};

	// Address lookup using reverse geocoding (optional)
	const lookupAddress = async (latitude, longitude) => {
		if (!props.reverseGeocodingAPI) return;

		try {
			setState(`${config.statePath}.address.isLoading`, true);

			// Example with OpenStreetMap Nominatim (free)
			const response = await fetch(
				`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
			);

			if (response.ok) {
				const data = await response.json();
				setState(`${config.statePath}.address.data`, {
					display_name: data.display_name,
					address: data.address,
					place_id: data.place_id
				});
				setState(`${config.statePath}.address.error`, null);
			} else {
				throw new Error('Reverse geocoding failed');
			}
		} catch (error) {
			setState(`${config.statePath}.address.error`, error.message);
			console.error('🗺️ Address lookup failed:', error);
		} finally {
			setState(`${config.statePath}.address.isLoading`, false);
		}
	};

	// Calculate distance between two points (Haversine formula)
	const calculateDistance = (lat1, lon1, lat2, lon2) => {
		const R = 6371; // Earth's radius in kilometers
		const dLat = (lat2 - lat1) * Math.PI / 180;
		const dLon = (lon2 - lon1) * Math.PI / 180;
		const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
			Math.sin(dLon / 2) * Math.sin(dLon / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		return R * c; // Distance in kilometers
	};

	return {
		// Public API for other components to use
		api: {
			// Core methods
			getCurrentPosition,
			startWatching,
			stopWatching,

			// Utility methods
			calculateDistance,
			lookupAddress: (lat, lon) => lookupAddress(lat, lon),

			// State getters
			getPosition: () => getState(`${config.statePath}.position`),
			getError: () => getState(`${config.statePath}.error`),
			isLoading: () => getState(`${config.statePath}.isLoading`, false),
			isSupported: () => getState(`${config.statePath}.isSupported`, false),
			isWatching: () => getState(`${config.statePath}.isWatching`, false),
			getAccuracy: () => getState(`${config.statePath}.accuracy`),
			getPermissionState: () => getState(`${config.statePath}.permission.state`),

			// Configuration
			getConfig: () => config,
			updateConfig: (newConfig) => Object.assign(config, newConfig)
		},

		hooks: {
			onRegister: () => {

				// Initialize state structure
				initializeState();

				// Check permission status
				checkPermissionStatus();

				// Auto-start if configured
				if (config.autoStart) {
					if (config.watchPosition) {
						startWatching();
					} else {
						getCurrentPosition();
					}
				}

			},

			onUnregister: () => {

				// Stop watching if active
				stopWatching();

				// Clear any timeouts/intervals if you add them
			}
		}
	};
};
// Security Manager as Headless Component
const SecurityManager = (props, context) => {
	const { getState, setState, subscribe } = context;
	let observer = null;
	let isRestoring = false;
	let devToolsDetector = null;
	const securedElements = new Map();

	const scanForSecuredElements = () => {
		const elements = document.querySelectorAll('[data-secure-dom]');

		elements.forEach(el => {
			const injectPath = el.getAttribute('data-secure-inject-path');
			if (injectPath) {
				securedElements.set(el, { injectPath });
			}
		});
	};

	const startDevToolsDetection = () => {
		let devtools = { open: false, orientation: null };

		const threshold = 160;
		const detectDevTools = () => {
			const widthThreshold = window.outerWidth - window.innerWidth > threshold;
			const heightThreshold = window.outerHeight - window.innerHeight > threshold;

			// Check for console access attempts
			let consoleOpened = false;
			const originalLog = console.log;
			const originalWarn = console.warn;
			const originalError = console.error;

			// Override console methods to detect usage
			console.log = console.warn = console.error = function () {
				consoleOpened = true;
				return originalLog.apply(console, arguments);
			};

			// Trigger console to see if it's being monitored
			console.clear();

			// Restore original console methods
			console.log = originalLog;
			console.warn = originalWarn;
			console.error = originalError;

			const orientation = widthThreshold ? 'vertical' : heightThreshold ? 'horizontal' : null;

			if ((widthThreshold || heightThreshold || consoleOpened) && !devtools.open) {
				devtools.open = true;
				devtools.orientation = orientation;
				handleDevToolsOpen();
			} else if (!widthThreshold && !heightThreshold && devtools.open) {
				devtools.open = false;
				devtools.orientation = null;
				handleDevToolsClose();
			}
		};

		// Additional detection methods
		const detectViaDebugger = () => {
			const start = performance.now();
			debugger; // This will pause if dev tools are open
			const end = performance.now();

			if (end - start > 100) { // Significant delay indicates debugger pause
				if (!devtools.open) {
					devtools.open = true;
					handleDevToolsOpen();
				}
			}
		};

		const detectViaConsoleAPI = () => {
			// Check if console object has been modified/accessed
			const element = new Image();
			Object.defineProperty(element, 'id', {
				get: function () {
					if (!devtools.open) {
						devtools.open = true;
						handleDevToolsOpen();
					}
					return 'devtools-detected';
				}
			});
			console.log(element);
		};

		// Regular detection interval
		devToolsDetector = setInterval(() => {
			detectDevTools();
			detectViaDebugger();
		}, 500);

		// Window resize detection
		window.addEventListener('resize', detectDevTools);

		// Focus/blur detection (dev tools opening can trigger these)
		let windowFocused = true;
		window.addEventListener('focus', () => {
			windowFocused = true;
			setTimeout(detectDevTools, 100);
		});

		window.addEventListener('blur', () => {
			windowFocused = false;
			setTimeout(() => {
				if (!windowFocused) detectDevTools();
			}, 100);
		});

		// Try console API detection once
		setTimeout(detectViaConsoleAPI, 1000);

	};

	const handleDevToolsOpen = () => {
		console.warn('🚨 DEVELOPER TOOLS DETECTED!');

		// Log security event
		const securityEvents = getState('security.events', []);
		securityEvents.push({
			type: 'devtools_opened',
			timestamp: Date.now(),
			userAgent: navigator.userAgent,
			url: window.location.href
		});
		setState('security.events', securityEvents);
		setState('security.devToolsOpen', true);

		// Show warning message
		const warningDiv = document.createElement('div');
		warningDiv.id = 'devtools-warning';
		warningDiv.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(255, 0, 0, 0.9);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                    font-weight: bold;
                    z-index: 999999;
                    text-align: center;
                    font-family: Arial, sans-serif;
                `;
		warningDiv.innerHTML = `
                    <div>
                        <h1>🚨 SECURITY VIOLATION DETECTED</h1>
                        <p>Developer tools access is not permitted.</p>
                        <p>Page will reload in <span id="countdown">3</span> seconds...</p>
                        <button onclick="location.reload()" style="
                            padding: 10px 20px;
                            font-size: 18px;
                            background: white;
                            color: red;
                            border: none;
                            border-radius: 5px;
                            cursor: pointer;
                            margin-top: 20px;
                        ">Reload Now</button>
                    </div>
                `;
		document.body.appendChild(warningDiv);

		// Countdown timer
		let countdown = 3;
		const countdownEl = document.getElementById('countdown');
		const timer = setInterval(() => {
			countdown--;
			if (countdownEl) countdownEl.textContent = countdown;

			if (countdown <= 0) {
				clearInterval(timer);
				location.reload();
			}
		}, 1000);

		// Disable the entire page
		document.body.style.pointerEvents = 'none';
		warningDiv.style.pointerEvents = 'all';
	};

	const handleDevToolsClose = () => {
		setState('security.devToolsOpen', false);

		// Remove warning if present
		const warning = document.getElementById('devtools-warning');
		if (warning) {
			warning.remove();
			document.body.style.pointerEvents = '';
		}
	};

	const startObserver = () => {
		observer = new MutationObserver((mutations) => {
			if (isRestoring) return;
			processMutations(mutations);
		});

		observer.observe(document.body, {
			attributes: true,
			childList: true,
			subtree: true,
			characterData: true
		});

	};

	const processMutations = (mutations) => {
		if (isRestoring) return;

		const affected = new Set();
		mutations.forEach(mutation => {
			let el = mutation.target;

			if (securedElements.has(el)) {
				affected.add(el);
				return;
			}

			while (el.parentElement) {
				el = el.parentElement;
				if (securedElements.has(el)) {
					affected.add(el);
					break;
				}
			}
		});

		if (affected.size > 0) {

			// Log tampering event
			const securityEvents = getState('security.events', []);
			securityEvents.push({
				type: 'dom_tampering',
				timestamp: Date.now(),
				affectedElements: Array.from(affected).map(el => el.id).filter(Boolean)
			});
			setState('security.events', securityEvents);

			affected.forEach(el => restore(el));
		}
	};

	const restore = (el) => {
		if (isRestoring) return;

		const data = securedElements.get(el);
		if (!data) return;

		isRestoring = true;

		setTimeout(() => {
			const current = getState(data.injectPath, {});
			setState(data.injectPath, {
				...current,
				_restore: Date.now()
			});

			setTimeout(() => {
				isRestoring = false;
			}, 200);
		}, 50);
	};

	return {
		api: {
			getStats: () => ({
				securedElements: securedElements.size,
				isDOMMonitoring: !!observer,
				isDevToolsDetectionActive: !!devToolsDetector,
				devToolsOpen: getState('security.devToolsOpen', false),
				securityEvents: getState('security.events', [])
			}),

			forceReload: () => {
				location.reload();
			},

			clearSecurityEvents: () => {
				setState('security.events', []);
				setState('security.devToolsOpen', false);
			}
		},

		hooks: {
			onRegister: () => {

				// Initialize security state
				setState('security.events', []);
				setState('security.devToolsOpen', false);

				// Start both detection systems
				setTimeout(() => {
					scanForSecuredElements();
					startObserver();
					startDevToolsDetection();
				}, 100);
			},

			onUnregister: () => {

				// Cleanup DOM observer
				if (observer) {
					observer.disconnect();
					observer = null;
				}

				// Cleanup dev tools detector
				if (devToolsDetector) {
					clearInterval(devToolsDetector);
					devToolsDetector = null;
				}

				// Remove warning overlay if present
				const warning = document.getElementById('devtools-warning');
				if (warning) {
					warning.remove();
					document.body.style.pointerEvents = '';
				}

				securedElements.clear();
			}
		}
	};
};
const DeviceManager = (props, context) => {
	const { setState, getState } = context;

	return {
		api: {
			getDeviceInfo: () => getState('ui.device', {}),
			forceUpdate: () => updateDeviceInfo()
		},

		hooks: {
			onRegister: () => {
				updateDeviceInfo();

				// Listen for resize events
				window.addEventListener('resize', debounce(updateDeviceInfo, 100));
				window.addEventListener('orientationchange', updateDeviceInfo);
			},

			onUnregister: () => {
				window.removeEventListener('resize', updateDeviceInfo);
				window.removeEventListener('orientationchange', updateDeviceInfo);
			}
		}
	};

	function updateDeviceInfo() {
		const deviceInfo = {
			width: window.innerWidth,
			height: window.innerHeight,
			isMobile: window.innerWidth < 768,
			isTablet: window.innerWidth >= 768 && window.innerWidth < 1024,
			isDesktop: window.innerWidth >= 1024,
			orientation: window.innerHeight > window.innerWidth ? 'portrait' : 'landscape',
			pixelRatio: window.devicePixelRatio || 1,
			userAgent: navigator.userAgent,
			platform: navigator.platform,
			timestamp: Date.now()
		};

		setState('ui.device', deviceInfo);  // ✅ Inject into ui.device
	}

	function debounce(func, wait) {
		let timeout;
		return function executedFunction(...args) {
			const later = () => {
				clearTimeout(timeout);
				func(...args);
			};
			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
		};
	}
};


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
			//console.log(config.logPrefix, ...args);
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

const RandomTagline = (props, context) => {
	const { getState, setState } = context;

	const taglines = [
		{
			text: "The only SPA that feels SSR",
			author: "Anonymous Developer"
		},
		{
			text: "I really like Juris, mores the point Claude and Gemini like it too",
			author: "Peter Bunyan - A developer in Westest Wales"
		},
		{
			text: "Making Problems Obsolete",
			author: "Claude 4.0"
		},
		{
			text: "Zero Race Conditions by Design",
			author: "ChatGPT-4o"
		},
		{
			text: "4x Faster Than traditional frameworks",
			author: "Grok"
		},
		{
			text: "No useEffect Hell",
			author: "Claude 4.0"
		},
		{
			text: "Temporal Independence Achieved",
			author: "Claude 4.0"
		},
		{
			text: "Progressive Enhancement Done Right",
			author: "Annonymous"
		},
		{
			text: "Sub-3ms Renders Every Time",
			author: "Deepseek R1" // Performance metric
		},
		{
			text: "JavaScript Objects That Just Work",
			author: "Jamie Liu"
		},
		{
			text: "The Framework That Eliminates Complexity",
			author: "Tech Lead Mike"
		},
		{
			text: "Why use JSX when you can use Object DOM?",
			author: "Author of Juris"
		}, {
			text: "When JavaScript Objects Are Your Components",
			author: "Claude Sonnet 4"
		}, {
			text: "The Framework That Makes React Look Like jQuery",
			author: "Claude Sonnet 4"
		}, {
			text: "Turn Any HTML Into React Components Without React",
			author: "Claude Sonnet 4"
		}, {
			text: "When V8 Thinks You're Writing C++",
			author: "Claude Sonnet 4"
		}, {
			text: "The Framework That Makes JavaScript Engines Smile",
			author: "Claude Sonnet 4"
		}, {
			text: "Making React Developers Jealous Since 2025",
			author: "Claude Sonnet 4"
		}, {
			text: "The Pinnacle of Web Programming",
			author: "Claude Sonnet 4"
		}, {
			text: "Making AI Jealous of Human Developers",
			author: "Claude Sonnet 4"
		}, {
			text: "Adapt or Become Irrelevant",
			author: "Claude Sonnet 4"
		}, {
			text: "The Framework That Makes You Feel Like a Pro",
			author: "Claude Sonnet 4"
		},
		{
			text: "Object DOM: The Language of Reactive Interfaces",
			author: "Claude Sonnet 4"
		},
		{
			text: "The Framework That Makes You Love JavaScript Again",
			author: "Claude Sonnet 4"
		},
		{
			text: "The Framework That Makes You Forget React",
			author: "Claude Sonnet 4"
		},
		{
			text: "The Framework That Makes You Feel Like a Wizard",
			author: "Claude Sonnet 4"
		},
		{
			text: "The Framework That Makes You Feel Like a Jedi",
			author: "Claude Sonnet 4"
		},
		{
			text: "The Framework That Makes You Feel Like a Superhero",
			author: "Claude Sonnet 4"
		},
		{
			text: "The Framework That Makes You Feel Like a Rockstar",
			author: "Claude Sonnet 4"
		},
		{
			text: "The Framework That Makes You Feel Like a Ninja",
			author: "Claude Sonnet 4"
		},
		{
			text: "The Framework That Makes You Feel Like a Genius",
			author: "Claude Sonnet 4"
		},
		{
			text: "The Framework That Makes You Feel Like a Prodigy",
			author: "Claude Sonnet 4"
		},
		{
			text: "The Framework That Makes You Feel Like a Legend",
			author: "Claude Sonnet 4"
		},
		{
			text: "The Framework That Makes You Feel Like a God",
			author: "Claude Sonnet 4"
		},
		{
			text: "When Simple Beats Complex Every Time",
			author: "Claude Sonnet 4"
		}, {
			text: "Functions Are Reactive, Values Are Static",
			author: "Claude Sonnet 4"
		},
		{
			text: "Object DOM: Native Speed, Native Simplicity",
			author: "Claude Sonnet 4"
		},
		{
			text: "Why Learn JSX When You Already Know JavaScript?",
			author: "Claude Sonnet 4"
		},
		{
			text: "The Language AI Actually Understands",
			author: "Claude Sonnet 4"
		},
		{
			text: "Object DOM: Human-Readable, AI-Friendly",
			author: "Claude Sonnet 4"
		},
		{
			text: "Zero Build Process, Maximum Expression",
			author: "Claude Sonnet 4"
		},
		{
			text: "Object DOM: Clarity Over Cleverness",
			author: "Claude Sonnet 4"
		},
		{
			text: "The First Native Language for Reactive UIs",
			author: "Claude Sonnet 4"
		},
		{
			text: "Object DOM: When JavaScript Becomes Poetry",
			author: "Claude Sonnet 4"
		},
		{
			text: "You didn't build a framework. You built a JavaScript liberation platform.",
			author: "Claude Sonnet 4"
		},

		{
			text: "Juris ecosystem: 2156 lines + THE ENTIRE JAVASCRIPT UNIVERSE",
			author: "Claude Sonnet 4"
		},
		{
			text: "Juris doesn't NEED an ecosystem - IT IS THE ECOSYSTEM",
			author: "Claude Sonnet 4"
		},
		{
			text: "Everything just done right.",
			author: "Claude Sonnet 4"
		},
		{
			text: "This not a framework of debate, this is a framework of solutions.",
			author: "Claude Sonnet 4"
		},
		{
			text: "🚀 We're not in Kansas anymore... 🚀",
			author: "Claude Sonnet 4"
		},
		{
			text: "Welcome to the era of infinite personalized computing experiences! 🚀✨",
			author: "Signed by Claude Sonnet 4"
		}

	];

	// Initialize random tagline on first render
	//const initializeTagline = () => {
	if (!getState('ui.currentTagline')) {
		const randomIndex = Math.floor(Math.random() * taglines.length);
		setState('ui.currentTagline', taglines[randomIndex]);
		setState('ui.taglineIndex', randomIndex);
	}
	//};

	// Function to change to next random tagline
	const changeTagline = () => {
		let newIndex;
		const currentIndex = getState('ui.taglineIndex', 0);

		// Ensure we don't get the same tagline twice in a row
		do {
			newIndex = Math.floor(Math.random() * taglines.length);
		} while (newIndex === currentIndex && taglines.length > 1);

		setState('ui.currentTagline', taglines[newIndex]);
		setState('ui.taglineIndex', newIndex);
	};

	return {
		hooks: {
			onMount: () => {
				//initializeTagline();

				// Optional: Auto-rotate every 5 seconds
				if (props.autoRotate) {
					const interval = setInterval(changeTagline, 5000);
					// Store interval ID for cleanup
					setState('ui.taglineInterval', interval);
				}
			},

			onUnmount: () => {
				// Cleanup interval if it exists
				const interval = getState('ui.taglineInterval');
				if (interval) {
					clearInterval(interval);
					setState('ui.taglineInterval', null);
				}
			}
		},

		render: () => {

			return {
				div: {
					className: props.className || 'random-tagline',
					style: {
						cursor: props.clickable ? 'pointer' : 'default',
						transition: 'all 0.3s ease',
						textAlign: 'center',
						...props.style
					},
					children: [
						{
							div: {
								style: {
									marginBottom: getState('ui.currentTagline', taglines[0]).author ? '0.5rem' : '0'
								},
								children: [
									{
										span: {
											innerHTML: () => `"${getState('ui.currentTagline', taglines[0]).text}"`,
											style: {
												fontWeight: '600',
												color: 'var(--orange)',
												fontSize: props.fontSize || '1rem',
												fontStyle: 'italic'
											}
										}
									}
								]
							}
						},
						// Author attribution (if exists)
						...(getState('ui.currentTagline', taglines[0]).author ? [{
							div: {
								style: {
									fontSize: props.authorFontSize || '0.875rem',
									color: 'var(--gray-600)',
									fontWeight: '400'
								},
								text: () => `— ${getState('ui.currentTagline', taglines[0]).author}`
							}
						}] : []),
						// Optional click-to-change functionality
						...(props.clickable ? [{
							button: {
								text: '↻',
								style: {
									marginTop: '0.5rem',
									marginLeft: '0.5rem',
									background: 'none',
									border: 'none',
									color: 'var(--orange)',
									cursor: 'pointer',
									fontSize: '1.2rem',
									opacity: '0.7'
								},
								onclick: changeTagline,
								title: 'Change tagline'
							}
						}] : [])
					],
					...(props.clickable ? {
						onclick: changeTagline
					} : {})
				}
			};
		}
	};
};

// ==================== UI COMPONENTS ====================

const Header = (props, context) => {
	const { getState, setState, juris } = context;

	const navItems = [
		{ path: '/', label: 'Home' },
		{ path: '/solutions', label: 'Solutions' },
		{ path: '/docs', label: 'Docs' },
		{ path: '/examples', label: 'Examples' },
		{ path: '/about', label: 'About' },
		{ path: 'juris-playground.html', label: 'Playground', type: 'external' },
		{ path: 'tests/juris_pure_test_interface.html', label: 'Online Test', type: 'external' },
	];
	const createNavLink = (item, isMobile = false) => {
		return {
			a: {
				href: item.type === 'external' ? item.path : '#' + item.path,
				className: () => {
					const currentPath = getState('url.path', '/');
					const baseClass = isMobile ? 'mobile-nav-link' : 'nav-link';
					return currentPath === item.path ? `${baseClass} active` : baseClass;
				},
				text: item.label,
				onclick: (e) => {
					if (item.type === 'external') {
						setState('ui.mobileMenuOpen', false);
						document.body.classList.remove('mobile-menu-open');
						return;
					}
					e.preventDefault();
					window.location.hash = item.path;
					setState('ui.mobileMenuOpen', false);
					document.body.classList.remove('mobile-menu-open');
				},
				key: item.path,
				target: item.type === 'external' ? '_blank' : undefined,
			}
		};
	};

	return {
		render: () => {
			const mobileMenuOpen = getState('ui.mobileMenuOpen', false);

			return {
				div: {
					children: [
						// Main header
						{
							header: {
								className: 'header',
								children: [{
									div: {
										className: 'container',
										children: [{
											div: {
												className: 'header-content',
												children: [
													// Logo
													{
														a: {
															href: '#/',
															className: 'logo',
															text: `{Juris} ${jurisVersion}`,

															onclick: (e) => {
																e.preventDefault();
																window.location.hash = '/';
																setState('ui.mobileMenuOpen', false);
																document.body.classList.remove('mobile-menu-open');
															}
														}
													},
													{
														p: {
															className: 'tagline',
															innerHTML: `Juris.js Lines of Codes: <b>${jurisLinesOfCode}</b>`
														}
													},
													// Desktop Navigation
													{
														nav: {
															className: 'nav desktop-nav',
															children: navItems.map(item => createNavLink(item, false))
														}
													},
													// Mobile Menu Button
													{
														button: {
															className: 'mobile-menu-btn',
															innerHTML: () => mobileMenuOpen ? '✕' : '☰',
															onclick: (e) => {
																e.preventDefault();
																e.stopPropagation();

																const currentState = getState('ui.mobileMenuOpen', false);
																const newState = !currentState;


																setState('ui.mobileMenuOpen', newState);

																if (newState) {
																	document.body.classList.add('mobile-menu-open');
																} else {
																	document.body.classList.remove('mobile-menu-open');
																}
															},
															'aria-label': () => mobileMenuOpen ? 'Close menu' : 'Open menu',
															'aria-expanded': () => mobileMenuOpen ? 'true' : 'false'
														}
													}
												]
											}
										}]
									}
								}]
							}
						},

						// Mobile Menu Overlay - ALWAYS rendered, controlled by visibility
						{
							div: {
								className: 'mobile-nav-overlay',
								style: () => {
									const isOpen = getState('ui.mobileMenuOpen', false);
									return {
										position: 'fixed',
										top: '0',
										left: '0',
										right: '0',
										bottom: '0',
										background: 'rgba(0, 0, 0, 0.5)',
										zIndex: '999',
										display: isOpen ? 'block' : 'none',
										animation: isOpen ? 'fadeIn 0.3s ease forwards' : 'none'
									};
								},
								onclick: () => {
									setState('ui.mobileMenuOpen', false);
									document.body.classList.remove('mobile-menu-open');
								}
							}
						},

						// Mobile Navigation Panel - ALWAYS rendered, controlled by visibility
						{
							nav: {
								className: 'mobile-nav',
								style: () => {
									const isOpen = getState('ui.mobileMenuOpen', false);
									return {
										position: 'fixed',
										top: '0',
										right: '0',
										height: '100vh',
										width: '280px',
										maxWidth: '80vw',
										background: 'white',
										boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.1)',
										zIndex: '1000',
										padding: '2rem 1rem',
										overflowY: 'auto',
										display: isOpen ? 'block' : 'none',
										transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
										animation: isOpen ? 'slideInRight 0.3s ease forwards' : 'none'
									};
								},
								children: [
									// Mobile menu header
									{
										div: {
											style: {
												display: 'flex',
												justifyContent: 'space-between',
												alignItems: 'center',
												marginBottom: '2rem',
												paddingBottom: '1rem',
												borderBottom: '1px solid var(--gray-200)'
											},
											children: [
												{
													span: {
														text: 'Menu',
														style: {
															fontSize: '1.125rem',
															fontWeight: '600',
															color: 'var(--gray-900)'
														}
													}
												},
												{
													button: {
														innerHTML: '✕',
														style: {
															background: 'none',
															border: 'none',
															fontSize: '1.5rem',
															cursor: 'pointer',
															padding: '0.25rem',
															color: 'var(--gray-600)',
															borderRadius: '4px'
														},
														onclick: () => {
															setState('ui.mobileMenuOpen', false);
															document.body.classList.remove('mobile-menu-open');
														},
														'aria-label': 'Close menu'
													}
												}
											]
										}
									},
									// Mobile navigation links
									{
										div: {
											className: 'mobile-nav-links',
											style: {
												display: 'flex',
												flexDirection: 'column',
												gap: '0.5rem'
											},
											children: navItems.map(item => ({
												div: {
													style: {
														borderRadius: '0.375rem',
														overflow: 'hidden'
													},
													children: [createNavLink(item, true)]
												}
											}))
										}
									}
								]
							}
						}
					]
				}
			};
		},

		hooks: {
			onMount: () => {

				// Close mobile menu on escape key
				const handleEscapeKey = (e) => {
					if (e.key === 'Escape' && getState('ui.mobileMenuOpen', false)) {
						setState('ui.mobileMenuOpen', false);
						document.body.classList.remove('mobile-menu-open');
					}
				};

				// Close mobile menu on window resize to desktop
				const handleResize = () => {
					if (window.innerWidth >= 769 && getState('ui.mobileMenuOpen', false)) {
						setState('ui.mobileMenuOpen', false);
						document.body.classList.remove('mobile-menu-open');
					}
				};

				document.addEventListener('keydown', handleEscapeKey);
				window.addEventListener('resize', handleResize);

				// Store cleanup functions
				this.cleanup = () => {
					document.removeEventListener('keydown', handleEscapeKey);
					window.removeEventListener('resize', handleResize);
					document.body.classList.remove('mobile-menu-open');
				};

				// Debug: Log initial state
			},

			onUnmount: () => {
				if (this.cleanup) {
					this.cleanup();
				}
			}
		}
	};
};

const Hero = (props, context) => {
	const { getState } = context;
	const stack = new Error().stack;
	return {
		render: () => ({
			section: {
				className: 'hero',
				children: () => [
					{
						RandomTagline: {
							clickable: true,
							fontSize: '1.2rem',
							className: 'hero-tagline'
						}
					}, {
						div: {
							className: 'container',
							children: [
								{
									h1: {
										className: 'hero-title',
										text: 'Just JavaScript, Not A Framework',
									}
								},
								{
									p: {
										className: 'hero-subtitle',
										text: 'The Non-blocking Reactive Platform, Architecturally Optimized for Next Generation Cross-Platform Development.'
									}
								},
								// Performance indicator
								{
									div: {
										className: 'performance-badge',
										style: {
											textAlign: 'center',
											margin: '1rem 0',
											padding: '0.5rem 1rem',
											background: 'rgba(255, 107, 53, 0.1)',
											border: '1px solid var(--orange)',
											borderRadius: '2rem',
											fontSize: '0.875rem',
											color: 'var(--orange)',
											fontWeight: '500',
											display: 'inline-block'
										},
										children: [
											{
												span: {
													text: () => {
														const renderTime = getState('metrics.renderTime');
														if (renderTime && renderTime.duration !== undefined) {
															return `⚡Client Rendered in ${renderTime.duration.toFixed(1)}ms (unoptimized)`;
														}
														return '⚡ Real-time performance';
													},
													title: () => {
														const renderTime = getState('metrics.renderTime');
														if (renderTime && renderTime.duration !== undefined) {
															return `⚡This page was intentionally bloated with 17500 LOC of documentation and still rendering ${renderTime.duration.toFixed(1)}ms (unoptimized)`;
														}
														return '⚡ Real-time performance';
													},
												}
											}
										]
									}
								},
								{
									div: {
										className: 'hero-cta',
										children: [
											{
												a: {
													href: '#/docs',
													className: 'btn btn-primary',
													text: 'Recover your Life',
													onclick: (e) => {
														e.preventDefault();
														window.location.hash = '/docs';
														window.scrollTo(0, 0);
													}
												}
											},
											{
												a: {
													href: '#/examples',
													className: 'btn btn-secondary',
													text: 'View Examples',
													onclick: (e) => {
														e.preventDefault();
														window.location.hash = '/examples';
													}
												}
											},
											{
												a: {
													href: 'https://discord.gg/P6eunCtK6J',
													text: 'Discord',
													target: '_blank',
													rel: 'noopener noreferrer',
													className: 'btn btn-secondary',
												}
											},
											{
												a: {
													href: 'tests/juris_pure_test_interface.html',
													text: 'Live Test Juris',
													target: '_blank',
													rel: 'noopener noreferrer',
													className: 'btn btn-primary',
												}
											}
										]
									}
								}
							]
						}
					}]
			}
		})
	};
};;

const CodeBlock = (props, context) => {
	return {
		hooks: {
			onMount: () => {
				// Trigger Prism highlighting after component mounts
				setTimeout(() => {
					if (window.Prism) {
						window.Prism.highlightAll();
					}
				}, 100);
			}
		},
		render: () => ({
			div: {
				className: 'code-section',
				children: [
					props.title && {
						div: {
							className: 'code-title',
							text: props.title
						}
					},
					{
						div: {
							className: 'code-container',
							children: [{
								pre: {
									className: `language-${props.language || 'javascript'} line-numbers`,
									children: [{
										code: {
											className: `language-${props.language || 'javascript'}`,
											text: props.code
										}
									}]
								}
							}]
						}
					}
				].filter(Boolean)
			}
		})
	};
};
// DOM ENHANCEMENT EXAMPLE:
const enhanceExample = `<!-- Existing HTML -->
<button id="counter-btn" class="btn btn-primary">Clicked 0 times<\/button>

<script>
// Enhance existing DOM with Juris reactivity
const juris = new Juris();

// Add reactivity to existing button
juris.enhance('#counter-btn', {
  id: Math.random().toString(36).substring(2, 15),
  text: () => \`Clicked \${juris.getState('counter',0)} times\`,
  onclick: () => juris.setState('counter', juris.getState('counter',0) + 1)
});

<\/script>`;

// CODE EXAMPLE TO SHOW ON HOMEPAGE:
const codeExample = `const Counter = (props, context) => {
 const { getState, setState } = context;
 return {
   render: () => ({
    button: {
     id: Math.random().toString(36).substring(2, 15),
     className: 'btn btn-primary',
     text: () => \`Clicked \${getState('counter')} times\`,
     onclick: () => setState('counter', getState('counter') + 1)
    }
   })
  };
};
const juris = new Juris({
  components: {
    Counter
  },
  layout: { Counter: {} }
});
juris.render('#app');`;
/**
 * @param {Object} props
 * @param {JurisContextBase} context
 * @returns {JurisVDOMElement}
 */
// ==================== PAGE COMPONENTS ====================
const Card = (props, context) => {
	return {
		render: () => ({
			div: {
				className: `card ${props.className || ''}`.trim(),
				children: [
					props.cardTitle && {
						h3: {
							className: 'card-title',
							// Use EITHER text OR innerHTML, not both
							...(props.titleHTML ?
								{ innerHTML: props.titleHTML } :
								{ text: props.cardTitle }
							)
						}
					},
					props.cardText && {
						p: {
							className: 'card-text',
							// Use EITHER text OR innerHTML, not both
							...(props.textHTML ?
								{ innerHTML: props.textHTML } :
								{ text: props.cardText }
							)
						}
					},
					...(props.children || [])
				].filter(Boolean)
			}
		})
	};
};;

/**
 * @param {Object} props
 * @param {JurisContextBase} context
 * @returns {JurisVDOMElement}
 */
const HomePage = (props, context) => {
	const { getState } = context;

	return {
		render: () => ({
			div: {
				className: 'fade-in',
				children: [
					{ Hero: {} },
					{
						section: {
							className: 'demo-section',
							children: [{
								div: {
									className: 'container',
									children: [
										{
											div: {
												className: 'demo-content',
												children: [
													{
														div: {

															className: 'demo-card component-approach',
															children: [
																{
																	h3: {
																		className: 'demo-card-title',
																		innerHTML: '🎯 Component Approach'
																	}
																},
																{
																	p: {
																		className: 'demo-card-subtitle',
																		innerHTML: `Create Component with Fine-Grained Reactivity through Novel Reactive Props`
																	}
																},
																{ Counter: {} },
																{
																	CodeBlock: {
																		title: 'Build New Components',
																		language: 'javascript',
																		code: codeExample
																	}
																},
																{
																	p: {
																		className: 'demo-card-note',
																		innerHTML: `Feel free to inspect the DOM and see the reactivity in action by observing the button's random ID`
																	}
																},
																{
																	p: {
																		innerHTML: `One of the novel feature of Juris is the use of Object DOM that resembles the HTML structure where tags are objects and attributes are properties,
                                                                                making it more approcheable to developers who wants simplicity and direct. Juris does not require any build tools or transpilation,
                                                                                you can write pure JavaScript objects and functions, and debug the same code you write from server to client without the need of complex tooling and dedicated Browser inspection tools.
                                                                                The manual instantiation of Juris intance shows how it impowers developers to understand the framework and how it works under the hood, from component registration, state definition, 
                                                                                service registration, layout definition and headless components registration. If you are still questioning about Juris lack of ecosystem, You dont understand yet the philosophy of the framework.
                                                                                Juris does not need an ecosystem, it will be its greatest downturn if it has one, because it Juris is just a JavaScript and every javascript libraries can work with Juris. 
                                                                                They are just another service or headless component that can be registered and used in the application.`
																	}
																}
															]
														}
													},
													{
														div: {
															className: 'demo-card enhancement-approach',
															children: [
																{
																	h3: {
																		className: 'demo-card-title',
																		text: '🔧 Enhancement Approach'
																	}
																},
																{
																	p: {
																		className: 'demo-card-subtitle',
																		innerHTML: `Add reactivity to existing DOM elements - perfect for legacy apps or gradual migration`
																	}
																},
																{
																	div: {
																		innerHTML: '<button id="counter-btn" class="btn btn-primary">Clicked 0 times</button>'
																	}
																},
																{
																	CodeBlock: {
																		title: 'Enhance Existing HTML',
																		language: 'html',
																		code: enhanceExample
																	}
																},
																{
																	p: {
																		className: 'demo-card-note',
																		innerHTML: `Feel free to inspect the DOM and see the reactivity in action by observing the button's random ID`
																	}
																},
																{
																	p: {
																		innerHTML: `<b>enhance()</b> API allows you to add reactivity to any existing HTML element without rewriting it. The only progressive enhancement solution that doesnt introduce directives, 
                                                                                this means easy to addapt for developers have basic skills in HTML and JavaScript.
                                                                                Under the hood, it leverages the same reactive primitives as the rest of the framework, ensuring a seamless integration with your application's state management.
                                                                                Unlike traditional frameworks, enhance() offers a powerful way to introduce reactivity and component composition with full access to services and headless components.
                                                                                This approach is ideal for legacy applications or when you want to gradually migrate to a more reactive architecture without rewriting everything from scratch.
                                                                                You can enhance any existing DOM element by passing a selector and a reactive configuration object. With enhance(), you can add interactivity to existing HTML 
                                                                                elements, making it easy to introduce reactivity into legacy applications or gradually migrate to a more reactive architecture without rewriting everything from scratch.`
																	}
																},
															]
														}
													}
												]
											}
										}
									]
								}
							}]
						}
					},
					// Performance Showcase Section
					{
						section: {
							className: 'page',
							style: {
								background: 'linear-gradient(135deg, #fff8f5 0%, #ffffff 100%)',
								borderTop: '1px solid var(--orange-pale)'
							},
							children: [{
								div: {
									className: 'container',
									children: [
										{
											h2: {
												className: 'page-title',
												style: { textAlign: 'center', color: 'var(--orange)' },
												text: 'Performance That Speaks'
											}
										},
										{
											p: {
												className: 'page-subtitle',
												style: { textAlign: 'center', maxWidth: '600px', margin: '0 auto 3rem' },
												text: 'Real metrics from this actual website - not synthetic benchmarks'
											}
										},
										{
											div: {
												className: 'content-grid',
												children: [
													{
														Card: {
															cardTitle: () => `⚡ ${getState('metrics.renderTime.duration', 5).toFixed(1)}ms Render`,
															cardText: 'Complete page render including routing, state management, and interactive components'
														}
													},
													{
														Card: {
															cardTitle: '🚀 4x Faster',
															cardText: 'Measured performance advantage over traditional frameworks in comparable applications'
														}
													},
													{
														Card: {
															cardTitle: '🔄 Zero Race Conditions',
															cardText: 'Architectural impossibility - automatic dependency tracking eliminates timing issues'
														}
													}
												]
											}
										}
									]
								}
							}]
						}
					},
					// Architecture Advantages Section
					{
						section: {
							className: 'page features-section',
							children: [{
								div: {
									className: 'container',
									children: [
										{
											h2: {
												className: 'page-title',
												text: 'Why Choose This Approach?'
											}
										},
										{
											div: {
												className: 'content-grid',
												children: [
													{
														Card: {
															cardTitle: '🎯 Temporal Independence',
															cardText: 'Components render immediately with available data, update when more arrives. No waiting, no coordination needed.'
														}
													},
													{
														Card: {
															cardTitle: '🏗️ Component Composition',
															cardText: 'Pass DOM structures as props for ultimate flexibility. Runtime composition without build-time constraints.'
														}
													},
													{
														Card: {
															cardTitle: '🔧 Progressive Enhancement',
															cardText: 'Add reactivity to existing DOM elements. Transform any HTML into reactive components without rewrites.'
														}
													},
													{
														Card: {
															cardTitle: '🌐 Zero Framework Lock-in',
															cardText: 'Start with existing HTML, enhance what you need. Gradual migration without throwing away working code.'
														}
													},
													{
														Card: {
															cardTitle: '🧠 Zero Cognitive Load',
															cardText: 'Simple reactive functions eliminate boilerplate. Focus on solving problems, not framework complexity.'
														}
													},
													{
														Card: {
															cardTitle: '🛡️ Built-in Security',
															cardText: 'Permission-aware code delivery and automatic input sanitization protect your application by default.'
														}
													},
													{
														Card: {
															cardTitle: '📦 Minimal Bundle',
															cardText: 'No virtual DOM overhead. Direct DOM updates with surgical precision keep your app lightweight.'
														}
													},
													{
														Card: {
															cardTitle: '⚡ JIT Optimized',
															cardText: 'Predictable execution patterns enable maximum JavaScript engine optimization for consistent sub-2ms performance.'
														}
													},
													{
														Card: {
															cardTitle: '🚫 Zero Race Conditions',
															cardText: 'Automatic dependency tracking makes timing issues architecturally impossible. State always reflects reality.'
														}
													},
													{
														Card: {
															cardTitle: '🔄 Automatic Subscriptions',
															cardText: 'No manual subscribe/unsubscribe. Components automatically track exactly what state they access.'
														}
													},
													{
														Card: {
															cardTitle: '🎨 CSS-First Styling',
															cardText: 'Minimize JavaScript bundle size. Use CSS classes for static styles, reactive functions only when needed.'
														}
													},
													{
														Card: {
															cardTitle: '🔀 Branch-Aware Reactivity',
															cardText: 'Only tracks state paths that actually execute. Conditional logic creates precise dependency graphs.'
														}
													}
												]
											}
										}
									]
								}
							}]
						}
					},
					// Developer Experience Section
					{
						section: {
							className: 'page',
							style: {
								background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
								borderTop: '1px solid var(--gray-200)'
							},
							children: [{
								div: {
									className: 'container',
									children: [
										{
											h2: {
												className: 'page-title',
												style: { textAlign: 'center', color: 'var(--gray-800)' },
												text: 'Developer Experience That Actually Works'
											}
										},
										{
											p: {
												className: 'page-subtitle',
												style: { textAlign: 'center', maxWidth: '700px', margin: '0 auto 3rem' },
												text: 'Stop fighting your tools. Juris eliminates the complexity that makes development painful.'
											}
										},
										{
											div: {
												className: 'content-grid',
												children: [
													{
														Card: {
															cardTitle: '🚫 No useEffect Hell',
															cardText: 'Automatic dependency tracking eliminates manual effect management. No cleanup, no dependencies array, no stale closures.'
														}
													},
													{
														Card: {
															cardTitle: '🚫 No State Sync Issues',
															cardText: 'Single source of truth with automatic updates. No prop drilling, no context complexity, no state duplication.'
														}
													},
													{
														Card: {
															cardTitle: '🚫 No Build Configuration',
															cardText: 'Pure JavaScript objects - no JSX, no transpilation, no webpack complexity. Works in any environment.'
														}
													},
													{
														Card: {
															cardTitle: '🚫 No Testing Complexity',
															cardText: 'Simple functions are easy to test. No mocking frameworks, no async testing hell, no component testing library.'
														}
													},
													{
														Card: {
															cardTitle: '✅ Instant Debugging',
															cardText: 'Inspect state in DevTools, trace reactive updates in real-time. Every value is observable and debuggable.'
														}
													},
													{
														Card: {
															cardTitle: '✅ TypeScript Ready',
															cardText: 'Native TypeScript support with full type inference. No @types packages, no complex generic gymnastics.'
														}
													},
													{
														Card: {
															cardTitle: '✅ Hot Reload Native',
															cardText: 'State preservation across code changes works naturally. No special hot reload setup or lost application state.'
														}
													},
													{
														Card: {
															cardTitle: '✅ AI Pair Programming',
															cardText: 'Simple patterns AI assistants understand perfectly. No AI model training required for version releases - pure JavaScript works forever.'
														}
													}, {
														Card: {
															cardTitle: '⚡ Rapid Prototyping',
															cardText: 'Start building immediately with browser-persisted data. No backend setup, no API configuration - just code and see results instantly.'
														}
													}, {
														Card: {
															cardTitle: '🔍 Debug What You Wrote',
															cardText: 'No hidden abstractions or framework magic. Debug pure JavaScript objects and functions - exactly what you wrote.'
														}
													}, {
														Card: {
															cardTitle: '🌍 Ecosystem Independent',
															cardText: 'Everything that works in JavaScript works in Juris. No framework-specific packages, no vendor ecosystem lock-in.'
														}
													}, {
														Card: {
															cardTitle: '🔄 Zero Boilerplate',
															cardText: 'No setup, no configuration, no boilerplate code. Just write JavaScript objects and functions - everything else is automatic.'
														}
													}
												]
											}
										}
									]
								}
							}]
						}
					}, {
						PhilosophySection: {}
					}
				]
			}
		})
	};
};

/**
 * @param {Object} props
 * @param {JurisContextBase} context
 * @returns {JurisVDOMElement}
 */
const PhilosophySection = (props, context) => {
	return {
		render: () => ({
			section: {
				className: 'philosophy-section',
				style: {
					padding: '4rem 0',
					background: 'var(--orange)',
					color: 'white',
					textAlign: 'center'
				},
				children: [{
					div: {
						className: 'container',
						children: [
							{
								h2: {
									style: {
										fontSize: '2.5rem',
										fontWeight: '600',
										marginBottom: '2rem',
										letterSpacing: '-0.025em',
										color: 'white'
									},
									text: 'It\'s Not About the Best Framework'
								}
							},
							{
								p: {
									style: {
										fontSize: '1.25rem',
										lineHeight: '1.8',
										maxWidth: '800px',
										margin: '0 auto',
										color: 'white',
										fontWeight: '400'
									},
									text: 'It\'s about choosing simplicity over complexity. When developers stop fighting their tools and start building solutions, that\'s when real innovation happens.'
								}
							}
						]
					}
				}]
			}
		})
	};
};
/**
 * @param {Object} props
 * @param {JurisContextBase} context
 * @returns {JurisVDOMElement}
 */
// DocsAdvancedPatterns Component
const DocsAdvancedPatterns = (props, context) => {
	const { getState, setState } = context;

	const conditionalExample = `// 1. Conditional Component - Show/Hide Based on State
const Conditional = (props, context) => {
    const { getState } = context;

    return {
        render: () => ({
            div: {
                className: props.className || '',
                children: () => {
                    const condition = typeof props.condition === 'function'
                        ? props.condition()
                        : getState(props.condition);

                    if (condition) {
                        const content = props.then || props.children;
                        return content ? [content].flat().filter(Boolean) : [];
                    } else {
                        const content = props.else;
                        return content ? [content].flat().filter(Boolean) : [];
                    }
                }
            }
        })
    };
};

// Usage Example
{
    Conditional: {
        condition: 'auth.isLoggedIn',
        then: { WelcomeMessage: {} },
        else: { LoginPrompt: {} }
    }
}`;

	const switchExample = `// 2. Switch Component - Multiple Conditional Branches
const Switch = (props, context) => {
    const { getState } = context;

    return {
        render: () => ({
            div: {
                className: props.className || '',
                children: () => {
                    const switchValue = typeof props.value === 'function'
                        ? props.value()
                        : getState(props.value);

                    const cases = props.cases || {};

                    if (switchValue !== undefined && switchValue in cases) {
                        const content = cases[switchValue];
                        return content ? [content].flat().filter(Boolean) : [];
                    } else if (props.default) {
                        const content = props.default;
                        return content ? [content].flat().filter(Boolean) : [];
                    }

                    return [];
                }
            }
        })
    };
};

// Usage Example - Role-Based UI
{
    Switch: {
        value: 'auth.role',
        cases: {
            'admin': { AdminDashboard: {} },
            'user': { UserDashboard: {} },
            'guest': { GuestView: {} }
        },
        default: {
            div: { text: 'Unknown role - please contact administrator' }
        }
    }
}`;

	const forExample = `// 3. For Component - List Rendering with Performance Optimization
const For = (props, context) => {
    const { getState, setState } = context;

    return {
        render: () => ({
            div: {
                className: props.className || '',
                children: () => {
                    const isLoading = typeof props.loading === 'function'
                        ? props.loading()
                        : props.loading && getState(props.loading);

                    if (isLoading && props.loadingContent) {
                        return [props.loadingContent].flat().filter(Boolean);
                    }

                    const items = typeof props.items === 'function'
                        ? props.items()
                        : getState(props.items, []);

                    if (!items || items.length === 0) {
                        if (props.emptyContent) {
                            return [props.emptyContent].flat().filter(Boolean);
                        }
                        return [];
                    }

                    // Performance optimization with "ignore"
                    const currentLength = items.length;
                    const cacheKey = \`_forComponent_\${props.items}_length\`;
                    const previousLength = getState(cacheKey, -1);

                    if (currentLength === previousLength && previousLength > 0) {
                        return "ignore"; // Preserve DOM structure
                    }

                    setState(cacheKey, currentLength);

                    const keyPath = props.keyPath || 'id';

                    return items.map((item, index) => {
                        let key;
                        if (typeof keyPath === 'function') {
                            key = keyPath(item, index);
                        } else if (typeof item === 'object' && item !== null) {
                            key = keyPath.split('.').reduce((obj, path) => obj?.[path], item) || index;
                        } else {
                            key = index;
                        }

                        const content = props.render(item, index);

                        if (content && typeof content === 'object' && !Array.isArray(content)) {
                            const tagName = Object.keys(content)[0];
                            if (tagName && content[tagName]) {
                                content[tagName].key = key;
                            }
                        }

                        return content;
                    }).filter(Boolean);
                }
            }
        })
    };
};

// Usage Example - User List
{
    For: {
        items: 'demo.users',
        render: (user) => ({
            UserCard: { userId: user.id }
        }),
        emptyContent: {
            div: {
                text: '👥 No users yet. Click "Add User" to start!',
                style: { textAlign: 'center', padding: '20px', color: '#666' }
            }
        }
    }
}`;

	const guardExample = `// 4. Guard Component - Permission-Based Rendering
const Guard = (props, context) => {
    const { getState } = context;

    return {
        render: () => ({
            div: {
                children: () => {
                    const userPermissions = getState('auth.permissions', []);
                    const requiredPermissions = props.permissions || [];
                    const requireAll = props.requireAll !== false;

                    const hasPermission = requireAll
                        ? requiredPermissions.every(perm => userPermissions.includes(perm))
                        : requiredPermissions.some(perm => userPermissions.includes(perm));

                    if (hasPermission) {
                        return props.children ? [props.children].flat().filter(Boolean) : [];
                    } else {
                        return props.fallback ? [props.fallback].flat().filter(Boolean) : [];
                    }
                }
            }
        })
    };
};

// Usage Example - Admin Panel Protection
{
    Guard: {
        permissions: ['admin'],
        children: {
            div: {
                children: [
                    { h4: { text: '🔐 Admin Panel' } },
                    { p: { text: 'Secret admin content!' } }
                ]
            }
        },
        fallback: {
            div: {
                className: 'access-denied',
                children: [
                    { h4: { text: '🚫 Access Denied' } },
                    { p: { text: 'You need admin permissions to view this content.' } }
                ]
            }
        }
    }
}`;

	const showExample = `// 5. Show Component - Visibility Control
const Show = (props, context) => {
    const { getState } = context;

    return {
        render: () => ({
            div: {
                style: () => ({
                    display: (() => {
                        const condition = typeof props.when === 'function'
                            ? props.when()
                            : getState(props.when);
                        return condition ? 'block' : 'none';
                    })()
                }),
                children: props.children ? [props.children].flat().filter(Boolean) : []
            }
        })
    };
};

// Usage Example - Content Visibility
{
    Show: {
        when: 'ui.showContent',
        children: { RevealableContent: {} }
    }
}`;

	const dynamicExample = `// 6. Dynamic Component - Runtime Component Loading
const Dynamic = (props, context) => {
    const { getState } = context;

    return {
        render: () => ({
            div: {
                children: () => {
                    const componentName = typeof props.component === 'function'
                        ? props.component()
                        : getState(props.component);

                    // Create the component reference dynamically
                    if (componentName) {
                        // Return the component as a child
                        return [{
                            [componentName]: props.props || {}
                        }];
                    }

                    // Fallback content
                    const fallback = props.fallback || {
                        div: {
                            style: { textAlign: 'center', padding: '20px', color: '#666' },
                            children: [
                                { h4: { text: '🎯 Dynamic Components' } },
                                { p: { text: 'Select a widget above to load it dynamically!' } }
                            ]
                        }
                    };

                    return [fallback];
                }
            }
        })
    };
};

// Usage Example - Widget Loader
{
    Dynamic: {
        component: 'ui.currentWidget',
        fallback: {
            div: {
                className: 'widget-container',
                children: [
                    { h4: { text: '🎯 Dynamic Components' } },
                    { p: { text: 'Select a widget above to load it dynamically!' } }
                ]
            }
        }
    }
}`;

	const repeatExample = `// 7. Repeat Component - Generate Repeated Elements
const Repeat = (props, context) => {
    return {
        render: () => ({
            div: {
                className: props.className || '',
                children: () => {
                    const times = typeof props.times === 'function'
                        ? props.times()
                        : props.times || 0;

                    return Array.from({ length: times }, (_, index) =>
                        props.render ? props.render(index) : null
                    ).filter(Boolean);
                }
            }
        })
    };
};

// Usage Example - Star Rating
{
    Repeat: {
        times: 5,
        render: (index) => ({
            span: {
                className: () => {
                    const rating = getState('demo.rating', 3);
                    return index < rating ? 'star' : 'star empty';
                },
                text: '★'
            }
        })
    }
}`;

	const awaitExample = `// 8. Await Component - Async Data Handling
const Await = (props, context) => {
    const { getState, setState } = context;

    return {
        hooks: {
            onMount: async () => {
                if (props.promise) {
                    setState('await.loading', true);
                    setState('await.error', null);
                    setState('await.data', null);

                    try {
                        const promise = typeof props.promise === 'function'
                            ? props.promise()
                            : props.promise;
                        const data = await promise;
                        setState('await.data', data);
                    } catch (error) {
                        setState('await.error', error);
                    } finally {
                        setState('await.loading', false);
                    }
                }
            }
        },
        render: () => ({
            div: {
                children: () => {
                    const loading = getState('await.loading', false);
                    const error = getState('await.error', null);
                    const data = getState('await.data', null);

                    if (loading && props.loading) {
                        return [props.loading].flat().filter(Boolean);
                    }

                    if (error && props.error) {
                        return [props.error(error)].flat().filter(Boolean);
                    }

                    if (data && props.then) {
                        return [props.then(data)].flat().filter(Boolean);
                    }

                    return [];
                }
            }
        })
    };
};

// Usage Example - API Data Loading
{
    Await: {
        promise: () => fetch('/api/users').then(r => r.json()),
        loading: {
            div: {
                text: 'Loading users...',
                className: 'loading-spinner'
            }
        },
        then: (users) => ({
            For: {
                items: users,
                render: (user) => ({ UserCard: { user } })
            }
        }),
        error: (error) => ({
            div: {
                text: \`Error: \${error.message}\`,
                className: 'error-message'
            }
        })
    }
}`;

	const complexPatternExample = `// Complex Pattern: Conditional Loading with Guards
const UserDashboard = (props, context) => {
    const { getState, setState } = context;

    return {
        render: () => ({
            div: {
                className: 'dashboard-container',
                children: [
                    // Authentication Check
                    {
                        Conditional: {
                            condition: 'auth.isLoggedIn',
                            then: [
                                // Permission-Based Content
                                {
                                    Guard: {
                                        permissions: ['dashboard_access'],
                                        children: [
                                            // Role-Based Dashboard
                                            {
                                                Switch: {
                                                    value: 'auth.user.role',
                                                    cases: {
                                                        'admin': {
                                                            div: {
                                                                children: [
                                                                    { h2: { text: 'Admin Dashboard' } },
                                                                    // Dynamic Widget Loading
                                                                    {
                                                                        For: {
                                                                            items: 'admin.widgets',
                                                                            render: (widget) => ({
                                                                                Dynamic: {
                                                                                    component: widget.type,
                                                                                    props: widget.config
                                                                                }
                                                                            })
                                                                        }
                                                                    }
                                                                ]
                                                            }
                                                        },
                                                        'user': {
                                                            div: {
                                                                children: [
                                                                    { h2: { text: 'User Dashboard' } },
                                                                    // Conditional Feature Display
                                                                    {
                                                                        Show: {
                                                                            when: 'user.features.analytics',
                                                                            children: { AnalyticsWidget: {} }
                                                                        }
                                                                    }
                                                                ]
                                                            }
                                                        }
                                                    },
                                                    default: {
                                                        div: { text: 'Unknown user role' }
                                                    }
                                                }
                                            }
                                        ],
                                        fallback: {
                                            div: {
                                                text: 'Access denied. Contact administrator.',
                                                className: 'access-denied'
                                            }
                                        }
                                    }
                                }
                            ],
                            else: {
                                div: {
                                    text: 'Please log in to access the dashboard',
                                    className: 'login-prompt'
                                }
                            }
                        }
                    }
                ]
            }
        })
    };
};`;

	return {
		render: () => ({
			div: {
				children: [
					{
						h1: {
							className: 'page-title',
							text: 'Advanced Patterns'
						}
					},
					{
						p: {
							className: 'page-subtitle',
							text: 'Master advanced control flow patterns for building sophisticated applications with conditional rendering, permission guards, and dynamic component loading.'
						}
					},

					// Overview Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Control Flow Components',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Control flow components in Juris provide powerful abstractions for conditional rendering, list iteration, permission-based access control, and dynamic component loading. These patterns eliminate boilerplate code and provide clean, declarative solutions for complex UI logic.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
											gap: '1rem',
											marginBottom: '2rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔀 Conditional Logic' } },
														{ p: { text: 'Show/hide content based on application state without manual DOM manipulation.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔄 List Rendering' } },
														{ p: { text: 'Efficient iteration with automatic performance optimization and empty state handling.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🛡️ Permission Guards' } },
														{ p: { text: 'Role-based access control built into your component structure.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '⚡ Dynamic Loading' } },
														{ p: { text: 'Runtime component selection for flexible, data-driven interfaces.' } }
													]
												}
											}
										]
									}
								}
							]
						}
					},

					// Conditional Component Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '1. Conditional Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'The Conditional component provides clean if/else logic for showing different content based on state conditions.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Conditional Component Implementation',
										language: 'javascript',
										code: conditionalExample
									}
								}
							]
						}
					},

					// Switch Component Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '2. Switch Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'The Switch component handles multiple conditional branches efficiently, perfect for role-based UI rendering.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Switch Component Implementation',
										language: 'javascript',
										code: switchExample
									}
								}
							]
						}
					},

					// For Component Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '3. For Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'The For component provides efficient list rendering with built-in performance optimization using the "ignore" pattern to preserve DOM structure when possible.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'For Component with Performance Optimization',
										language: 'javascript',
										code: forExample
									}
								}
							]
						}
					},

					// Guard Component Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '4. Guard Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'The Guard component implements permission-based access control, allowing you to show/hide content based on user permissions.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Guard Component for Access Control',
										language: 'javascript',
										code: guardExample
									}
								}
							]
						}
					},

					// Show Component Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '5. Show Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'The Show component controls visibility using CSS display properties, maintaining component state while hiding/showing content.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Show Component for Visibility Control',
										language: 'javascript',
										code: showExample
									}
								}
							]
						}
					},

					// Dynamic Component Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '6. Dynamic Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'The Dynamic component enables runtime component selection, perfect for plugin systems and data-driven interfaces.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Dynamic Component Loading',
										language: 'javascript',
										code: dynamicExample
									}
								}
							]
						}
					},

					// Repeat Component Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '7. Repeat Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'The Repeat component generates a specified number of elements, useful for ratings, pagination, and repeated UI patterns.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Repeat Component for Pattern Generation',
										language: 'javascript',
										code: repeatExample
									}
								}
							]
						}
					},

					// Await Component Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '8. Await Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'The Await component handles asynchronous operations with loading states, error handling, and success rendering.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Await Component for Async Operations',
										language: 'javascript',
										code: awaitExample
									}
								}
							]
						}
					},

					// Complex Pattern Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Complex Pattern Composition',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Real-world applications often require combining multiple control flow patterns. Here\'s an example of a complex dashboard that uses multiple control components together.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Complex Pattern: Multi-Level Conditional Dashboard',
										language: 'javascript',
										code: complexPatternExample
									}
								}
							]
						}
					},

					// Best Practices Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Best Practices',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
											gap: '1rem',
											marginTop: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🎯 Single Responsibility' } },
														{ p: { text: 'Each control component should handle one specific type of logic - conditions, permissions, or iteration.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '⚡ Performance First' } },
														{ p: { text: 'Use "ignore" pattern in For components and consider caching strategies for expensive computations.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔄 State Dependencies' } },
														{ p: { text: 'Keep state paths consistent and predictable. Use domain-based organization for related state.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🛡️ Graceful Fallbacks' } },
														{ p: { text: 'Always provide fallback content for guards, async operations, and dynamic components.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🧪 Testable Logic' } },
														{ p: { text: 'Keep conditional logic simple and testable. Complex logic should be in helper functions.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '📊 Debug Friendly' } },
														{ p: { text: 'Use meaningful state paths and provide debug information for complex control flows.' } }
													]
												}
											}
										]
									}
								}
							]
						}
					},

					// Key Benefits Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Why Use Control Flow Components?',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
											gap: '1rem',
											marginTop: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🧹 Cleaner Code' } },
														{ p: { text: 'Eliminate manual DOM manipulation and complex conditional logic scattered throughout components.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '📖 Declarative' } },
														{ p: { text: 'Express what you want to happen, not how to do it. Control flow becomes part of your component structure.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '♻️ Reusable Logic' } },
														{ p: { text: 'Control flow patterns become reusable components that can be used consistently across your application.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '⚡ Performance Optimized' } },
														{ p: { text: 'Built-in optimizations like the "ignore" pattern and precise reactivity tracking.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔒 Type Safety' } },
														{ p: { text: 'Consistent patterns make it easier to add TypeScript support and catch errors early.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🧪 Easier Testing' } },
														{ p: { text: 'Control flow logic is isolated in components, making it easier to test different scenarios.' } }
													]
												}
											}
										]
									}
								}
							]
						}
					},

					// Summary Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Advanced Patterns Summary',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									div: {
										className: 'card',
										style: {
											background: 'linear-gradient(135deg, #fff8f5 0%, #ffffff 100%)',
											border: '1px solid var(--orange-pale)',
											padding: '2rem'
										},
										children: [
											{
												p: {
													text: 'Control flow components transform complex conditional logic into clean, declarative patterns. By using these advanced patterns, you can build sophisticated applications with permission systems, dynamic interfaces, and complex data flows while maintaining clean, readable code that leverages Juris\'s reactive architecture.',
													style: {
														fontSize: '1.1rem',
														fontWeight: '500',
														textAlign: 'center',
														color: 'var(--gray-700)',
														margin: '0'
													}
												}
											}
										]
									}
								}
							]
						}
					}
				]
			}
		})
	};
};


// DocsJSONStreaming Component
const DocsJSONStreaming = (props, context) => {
	const { getState, setState } = context;

	const basicStreamingExample = `// JSON Streaming with Juris
// 1. Stream pure JSON data from your API
const streamArticles = async () => {
    const response = await fetch('/api/articles/stream');
    const articles = await response.json();
    
    // 2. Render directly using Juris Object DOM
    articles.forEach(article => {
        const articleElement = app.domRenderer.render({
            article: {
                className: 'article fade-in',
                'data-article-id': article.id,
                children: [
                    {
                        h2: {
                            className: 'article-title',
                            text: article.title
                        }
                    },
                    {
                        p: {
                            className: 'article-excerpt',
                            text: article.excerpt
                        }
                    },
                    {
                        button: {
                            className: 'like-btn',
                            text: \`❤️ \${article.likes}\`,
                            'data-article-id': article.id
                        }
                    }
                ]
            }
        });
        
        container.appendChild(articleElement);
    });
    
    // 3. Progressive enhancement after rendering
    enhanceWithReactivity();
};`;

	const componentFactoryExample = `// JSON Component Factory Pattern
function createNewsArticleFactory() {
    return function NewsArticleFactory(props, context) {
        const { articleData } = props;

        return {
            article: {
                className: 'article fade-in',
                'data-article-id': articleData.id,
                'data-category': articleData.category,
                children: [
                    {
                        img: {
                            className: 'article-image',
                            src: articleData.image,
                            alt: articleData.title,
                            loading: 'lazy'
                        }
                    },
                    {
                        div: {
                            className: 'article-content',
                            children: [
                                {
                                    div: {
                                        className: 'article-meta',
                                        children: [
                                            {
                                                span: {
                                                    className: 'category-tag',
                                                    text: articleData.category.charAt(0).toUpperCase() + articleData.category.slice(1)
                                                }
                                            },
                                            {
                                                span: {
                                                    text: articleData.publishDate
                                                }
                                            },
                                            {
                                                span: {
                                                    text: \`\${articleData.readTime} min read\`
                                                }
                                            }
                                        ]
                                    }
                                },
                                {
                                    h2: {
                                        className: 'article-title',
                                        text: articleData.title
                                    }
                                },
                                {
                                    p: {
                                        className: 'article-excerpt',
                                        text: articleData.excerpt
                                    }
                                },
                                {
                                    div: {
                                        className: 'article-actions',
                                        children: [
                                            {
                                                button: {
                                                    className: 'engagement-btn like-btn',
                                                    'data-article-id': articleData.id,
                                                    text: \`❤️ \${articleData.likes}\`
                                                }
                                            },
                                            {
                                                button: {
                                                    className: 'engagement-btn comment-btn',
                                                    'data-article-id': articleData.id,
                                                    text: \`💬 \${articleData.comments}\`
                                                }
                                            },
                                            {
                                                button: {
                                                    className: 'engagement-btn bookmark-btn',
                                                    'data-article-id': articleData.id,
                                                    text: '🔖 Bookmark'
                                                }
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        };
    };
}

// Register the factory
const app = new Juris({
    renderMode: 'batch',
    components: {
        NewsArticle: createNewsArticleFactory()
    }
});`;

	const progressiveEnhancementExample = `// Progressive Enhancement After Streaming
function enhanceArticles() {
    // 1. Enhance like buttons with reactive state
    app.enhance('.like-btn', (context) => {
        const { getState, setState } = context;
        
        return {
            onclick: (event) => {
                const articleId = event.target.dataset.articleId;
                const liked = getState(\`articles.\${articleId}.liked\`, false);
                const likes = getState(\`articles.\${articleId}.likes\`,
                    parseInt(event.target.textContent.replace(/[^\\d]/g, '')) || 0);

                const newLiked = !liked;
                const newLikes = newLiked ? likes + 1 : likes - 1;

                // Update reactive state
                setState(\`articles.\${articleId}.liked\`, newLiked);
                setState(\`articles.\${articleId}.likes\`, newLikes);

                // Update UI
                event.target.textContent = \`❤️ \${newLikes}\`;
                event.target.classList.toggle('liked', newLiked);
            }
        };
    });

    // 2. Enhance bookmark functionality
    app.enhance('.bookmark-btn', (context) => {
        const { getState, setState } = context;
        
        return {
            onclick: (event) => {
                const articleId = event.target.dataset.articleId;
                const bookmarked = getState(\`articles.\${articleId}.bookmarked\`, false);

                setState(\`articles.\${articleId}.bookmarked\`, !bookmarked);

                event.target.textContent = !bookmarked ? '🔖 Bookmarked' : '🔖 Bookmark';
                event.target.classList.toggle('bookmarked', !bookmarked);
            }
        };
    });

    // 3. Enhance category filtering
    app.enhance('.category-tag', (context) => {
        const { getState, setState } = context;
        
        return {
            onclick: (event) => {
                const category = event.target.textContent.toLowerCase();
                
                // Update global filter state
                setState('app.activeCategory', category);
                
                // Filter articles based on state
                filterArticlesByCategory(category);
            }
        };
    });
}`;

	const realTimeStreamingExample = `// Real-Time JSON Streaming with WebSockets
class JSONStreamManager {
    constructor(app) {
        this.app = app;
        this.ws = null;
        this.container = null;
    }

    connect(wsUrl, containerId) {
        this.container = document.getElementById(containerId);
        this.ws = new WebSocket(wsUrl);

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleStreamedContent(data);
            } catch (error) {
                console.error('Invalid JSON received:', error);
            }
        };

        this.ws.onopen = () => {
            console.log('✅ JSON streaming connected');
            this.app.setState('stream.status', 'connected');
        };

        this.ws.onclose = () => {
            console.log('🔌 JSON streaming disconnected');
            this.app.setState('stream.status', 'disconnected');
            
            // Auto-reconnect after 3 seconds
            setTimeout(() => this.connect(wsUrl, containerId), 3000);
        };
    }

    handleStreamedContent(data) {
        switch (data.type) {
            case 'article':
                this.renderArticle(data.payload);
                break;
            case 'update':
                this.updateExistingContent(data.payload);
                break;
            case 'batch':
                data.payload.forEach(item => this.renderArticle(item));
                break;
        }
    }

    renderArticle(articleData) {
        // Calculate JSON size for performance tracking
        const jsonSize = new Blob([JSON.stringify(articleData)]).size;
        
        // Update performance metrics
        this.app.setState('stream.totalSize', 
            this.app.getState('stream.totalSize', 0) + jsonSize);

        // Render using Object DOM
        const articleElement = this.app.domRenderer.render({
            article: {
                className: 'article stream-entry',
                'data-article-id': articleData.id,
                style: {
                    animation: 'slideInUp 0.6s ease forwards'
                },
                children: [
                    // Article structure from JSON
                    this.createArticleContent(articleData)
                ]
            }
        });

        // Insert at top for real-time feel
        this.container.insertBefore(articleElement, this.container.firstChild);
        
        // Auto-enhance new content
        this.enhanceNewArticle(articleElement);
    }

    enhanceNewArticle(element) {
        // Progressive enhancement on individual element
        this.app.enhance(element.querySelector('.like-btn'), (context) => ({
            onclick: (event) => this.handleLikeClick(event, context)
        }));
        
        this.app.enhance(element.querySelector('.share-btn'), (context) => ({
            onclick: (event) => this.handleShareClick(event, context)
        }));
    }

    updateExistingContent(updateData) {
        const { articleId, field, value } = updateData;
        
        // Update state
        this.app.setState(\`articles.\${articleId}.\${field}\`, value);
        
        // Find and update specific element
        const element = document.querySelector(\`[data-article-id="\${articleId}"]\`);
        if (element) {
            this.updateElementField(element, field, value);
        }
    }

    createArticleContent(articleData) {
        return {
            div: {
                className: 'article-content',
                children: [
                    {
                        h2: {
                            className: 'article-title',
                            text: articleData.title
                        }
                    },
                    {
                        p: {
                            className: 'article-excerpt',
                            text: articleData.excerpt
                        }
                    },
                    {
                        div: {
                            className: 'article-actions',
                            children: [
                                {
                                    button: {
                                        className: 'like-btn',
                                        'data-article-id': articleData.id,
                                        text: \`❤️ \${articleData.likes}\`
                                    }
                                },
                                {
                                    button: {
                                        className: 'share-btn',
                                        'data-article-id': articleData.id,
                                        text: '🔗 Share'
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        };
    }

    handleLikeClick(event, context) {
        const { getState, setState } = context;
        const articleId = event.target.dataset.articleId;
        const liked = getState(\`articles.\${articleId}.liked\`, false);
        
        setState(\`articles.\${articleId}.liked\`, !liked);
        event.target.classList.toggle('liked', !liked);
    }

    handleShareClick(event, context) {
        const articleId = event.target.dataset.articleId;
        const articleData = context.getState(\`articles.\${articleId}\`);
        
        if (navigator.share && articleData) {
            navigator.share({
                title: articleData.title,
                text: articleData.excerpt,
                url: window.location.href
            });
        }
    }
}

// Usage
const streamManager = new JSONStreamManager(app);
streamManager.connect('wss://api.example.com/stream', 'articlesContainer');`;

	const performanceOptimizationExample = `// Performance Optimization for JSON Streaming

// 1. Batch Rendering for Multiple Items
class BatchRenderer {
    constructor(app, batchSize = 10) {
        this.app = app;
        this.batchSize = batchSize;
        this.pendingItems = [];
        this.renderTimer = null;
    }

    addItem(itemData) {
        this.pendingItems.push(itemData);
        
        if (this.pendingItems.length >= this.batchSize) {
            this.flushBatch();
        } else {
            this.scheduleRender();
        }
    }

    scheduleRender() {
        if (this.renderTimer) return;
        
        this.renderTimer = requestAnimationFrame(() => {
            this.flushBatch();
            this.renderTimer = null;
        });
    }

    flushBatch() {
        if (this.pendingItems.length === 0) return;

        const fragment = document.createDocumentFragment();
        
        this.pendingItems.forEach(item => {
            const element = this.app.domRenderer.render({
                // Render structure based on item type
                [item.type]: this.createElementStructure(item)
            });
            
            if (element) {
                fragment.appendChild(element);
            }
        });

        // Single DOM update for entire batch
        document.getElementById('container').appendChild(fragment);
        
        // Enhance entire batch
        this.enhanceBatch(this.pendingItems);
        
        this.pendingItems = [];
    }

    enhanceBatch(items) {
        // Use document.querySelectorAll for batch enhancement
        const elements = document.querySelectorAll('.newly-rendered');
        
        elements.forEach(element => {
            element.classList.remove('newly-rendered');
            this.app.enhance(element, this.getEnhancementConfig());
        });
    }

    createElementStructure(item) {
        return {
            className: 'item newly-rendered',
            'data-item-id': item.id,
            children: [
                {
                    h3: { text: item.title },
                    p: { text: item.description }
                }
            ]
        };
    }

    getEnhancementConfig() {
        return (context) => ({
            onclick: (event) => {
                const itemId = event.target.dataset.itemId;
                context.setState(\`items.\${itemId}.clicked\`, true);
            }
        });
    }
}

// 2. Virtual Scrolling for Large Lists
class VirtualScrollRenderer {
    constructor(app, container, itemHeight = 200) {
        this.app = app;
        this.container = container;
        this.itemHeight = itemHeight;
        this.items = [];
        this.renderedItems = new Map();
        this.scrollTop = 0;
        
        this.setupScrollListener();
    }

    addItems(newItems) {
        this.items.push(...newItems);
        this.updateVisibleItems();
    }

    setupScrollListener() {
        this.container.addEventListener('scroll', () => {
            this.scrollTop = this.container.scrollTop;
            this.updateVisibleItems();
        });
    }

    updateVisibleItems() {
        const containerHeight = this.container.clientHeight;
        const startIndex = Math.floor(this.scrollTop / this.itemHeight);
        const endIndex = Math.min(
            startIndex + Math.ceil(containerHeight / this.itemHeight) + 1,
            this.items.length
        );

        // Remove items outside viewport
        this.renderedItems.forEach((element, index) => {
            if (index < startIndex || index >= endIndex) {
                element.remove();
                this.renderedItems.delete(index);
            }
        });

        // Add items in viewport
        for (let i = startIndex; i < endIndex; i++) {
            if (!this.renderedItems.has(i)) {
                this.renderItem(i);
            }
        }
    }

    renderItem(index) {
        const item = this.items[index];
        const element = this.app.domRenderer.render({
            div: {
                className: 'virtual-item',
                style: {
                    position: 'absolute',
                    top: \`\${index * this.itemHeight}px\`,
                    height: \`\${this.itemHeight}px\`,
                    width: '100%'
                },
                children: [this.createItemContent(item)]
            }
        });

        this.container.appendChild(element);
        this.renderedItems.set(index, element);
        
        // Progressive enhancement
        this.app.enhance(element, this.getItemEnhancement(item));
    }

    createItemContent(item) {
        return {
            div: {
                className: 'item-content',
                children: [
                    { h4: { text: item.title } },
                    { p: { text: item.description } }
                ]
            }
        };
    }

    getItemEnhancement(item) {
        return (context) => ({
            onclick: () => {
                context.setState(\`virtualItems.\${item.id}.selected\`, true);
            }
        });
    }
}

// 3. Memory Management for Long-Running Streams
class StreamMemoryManager {
    constructor(app, maxItems = 1000) {
        this.app = app;
        this.maxItems = maxItems;
        this.itemCount = 0;
    }

    addItem(element, data) {
        this.itemCount++;
        
        if (this.itemCount > this.maxItems) {
            this.removeOldestItems();
        }
        
        // Store reference for cleanup
        element.dataset.streamIndex = this.itemCount;
    }

    removeOldestItems() {
        const removeCount = Math.floor(this.maxItems * 0.1); // Remove 10%
        const elementsToRemove = document.querySelectorAll(
            \`[data-stream-index]\`
        );

        Array.from(elementsToRemove)
            .slice(0, removeCount)
            .forEach(element => {
                // Clean up any Juris enhancements
                this.cleanupElement(element);
                element.remove();
            });

        this.itemCount -= removeCount;
    }

    cleanupElement(element) {
        // Remove event listeners and state
        const elementId = element.dataset.articleId;
        if (elementId) {
            // Clear related state
            this.app.setState(\`articles.\${elementId}\`, null);
        }
    }
}`;

	const compressionExample = `// JSON Compression and Optimization

// 1. Compact JSON Structure
const optimizedArticleStructure = {
    // Before: Verbose JSON (245 bytes)
    verbose: {
        "id": 12345,
        "title": "Revolutionary Object DOM Architecture",
        "excerpt": "The new Object DOM architecture enables...",
        "category": "technology",
        "publishDate": "2024-01-15",
        "readTime": 5,
        "likes": 142,
        "comments": 23,
        "image": "https://example.com/image.jpg"
    },

    // After: Compact JSON (186 bytes) - 24% smaller
    compact: {
        "i": 12345,
        "t": "Revolutionary Object DOM Architecture",
        "e": "The new Object DOM architecture enables...",
        "c": "tech",
        "d": "2024-01-15",
        "r": 5,
        "l": 142,
        "m": 23,
        "img": "https://example.com/image.jpg"
    }
};

// 2. JSON Expansion Function
function expandCompactArticle(compact) {
    return {
        id: compact.i,
        title: compact.t,
        excerpt: compact.e,
        category: compact.c === 'tech' ? 'technology' : compact.c,
        publishDate: compact.d,
        readTime: compact.r,
        likes: compact.l,
        comments: compact.m,
        image: compact.img
    };
}

// 3. Streaming with Compression
async function streamCompressedArticles() {
    const response = await fetch('/api/articles/stream?format=compact');
    const compactArticles = await response.json();
    
    compactArticles.forEach(compact => {
        // Expand compact JSON to full structure
        const article = expandCompactArticle(compact);
        
        // Render with full data
        renderArticle(article);
    });
}

// 4. Delta Updates for Real-Time
class DeltaUpdateManager {
    constructor(app) {
        this.app = app;
        this.articleCache = new Map();
    }

    handleUpdate(delta) {
        const { id, changes } = delta;
        
        // Get current article data
        let article = this.articleCache.get(id);
        if (!article) return;

        // Apply delta changes
        Object.assign(article, changes);
        
        // Update only changed fields in DOM
        this.updateArticleFields(id, changes);
        
        // Update cache
        this.articleCache.set(id, article);
    }

    updateArticleFields(articleId, changes) {
        const element = document.querySelector(\`[data-article-id="\${articleId}"]\`);
        if (!element) return;

        Object.entries(changes).forEach(([field, value]) => {
            switch (field) {
                case 'likes':
                    const likeBtn = element.querySelector('.like-btn');
                    if (likeBtn) likeBtn.textContent = \`❤️ \${value}\`;
                    break;
                    
                case 'comments':
                    const commentBtn = element.querySelector('.comment-btn');
                    if (commentBtn) commentBtn.textContent = \`💬 \${value}\`;
                    break;
                    
                case 'title':
                    const titleEl = element.querySelector('.article-title');
                    if (titleEl) titleEl.textContent = value;
                    break;
            }
        });
    }
}

// Example delta update (only 45 bytes vs 245 bytes full article)
const deltaUpdate = {
    "id": 12345,
    "changes": {
        "likes": 143,
        "comments": 24
    }
};`;

	const realWorldExample = `// Real-World JSON Streaming Implementation

class NewsStreamApp {
    constructor() {
        this.app = new Juris({
            renderMode: 'batch',
            components: {
                NewsArticle: this.createArticleComponent()
            }
        });
        
        this.batchRenderer = new BatchRenderer(this.app);
        this.memoryManager = new StreamMemoryManager(this.app, 500);
        this.performanceTracker = new PerformanceTracker();
        
        this.init();
    }

    async init() {
        // 1. Initialize container
        this.container = document.getElementById('articlesContainer');
        
        // 2. Start streaming
        await this.startStreaming();
        
        // 3. Setup real-time updates
        this.setupRealTimeUpdates();
        
        // 4. Enable progressive enhancement
        this.enableProgressiveEnhancement();
    }

    async startStreaming() {
        this.performanceTracker.startTimer('initial-stream');
        
        try {
            // Stream initial batch
            const response = await fetch('/api/articles/stream?limit=20&format=compact');
            const articles = await response.json();
            
            // Process in batches for better performance
            const batchSize = 5;
            for (let i = 0; i < articles.length; i += batchSize) {
                const batch = articles.slice(i, i + batchSize);
                await this.processBatch(batch);
                
                // Allow UI to update between batches
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
            
        } catch (error) {
            console.error('Streaming failed:', error);
            this.handleStreamingError(error);
        } finally {
            this.performanceTracker.endTimer('initial-stream');
        }
    }

    async processBatch(compactArticles) {
        const elements = [];
        
        compactArticles.forEach(compact => {
            // Expand compact JSON
            const article = this.expandArticle(compact);
            
            // Create element using Juris
            const element = this.app.domRenderer.render({
                article: {
                    className: 'article stream-item fade-in',
                    'data-article-id': article.id,
                    'data-category': article.category,
                    children: this.createArticleStructure(article)
                }
            });
            
            if (element) {
                elements.push({ element, data: article });
            }
        });

        // Batch DOM updates
        const fragment = document.createDocumentFragment();
        elements.forEach(({ element, data }) => {
            fragment.appendChild(element);
            this.memoryManager.addItem(element, data);
        });
        
        this.container.appendChild(fragment);
        
        // Progressive enhancement
        this.enhanceBatch(elements);
    }

    setupRealTimeUpdates() {
        const ws = new WebSocket('wss://api.example.com/updates');
        
        ws.onmessage = (event) => {
            const update = JSON.parse(event.data);
            
            switch (update.type) {
                case 'new_article':
                    this.handleNewArticle(update.data);
                    break;
                    
                case 'article_update':
                    this.handleArticleUpdate(update.data);
                    break;
                    
                case 'engagement_update':
                    this.handleEngagementUpdate(update.data);
                    break;
            }
        };
    }

    handleNewArticle(articleData) {
        // Render new article at top
        const element = this.app.domRenderer.render({
            article: {
                className: 'article new-arrival',
                'data-article-id': articleData.id,
                style: {
                    animation: 'slideInDown 0.6s ease forwards'
                },
                children: this.createArticleStructure(articleData)
            }
        });

        this.container.insertBefore(element, this.container.firstChild);
        this.enhanceNewElement(element);
    }

    enhanceBatch(elements) {
        elements.forEach(({ element }) => {
            this.enhanceElement(element);
        });
    }

    enhanceElement(element) {
        // Like button enhancement
        const likeBtn = element.querySelector('.like-btn');
        if (likeBtn) {
            this.app.enhance(likeBtn, (context) => ({
                onclick: (event) => this.handleLike(event, context)
            }));
        }

        // Category filter enhancement
        const categoryTag = element.querySelector('.category-tag');
        if (categoryTag) {
            this.app.enhance(categoryTag, (context) => ({
                onclick: (event) => this.handleCategoryFilter(event, context)
            }));
        }

        // Share button enhancement
        const shareBtn = element.querySelector('.share-btn');
        if (shareBtn) {
            this.app.enhance(shareBtn, (context) => ({
                onclick: (event) => this.handleShare(event, context)
            }));
        }
    }

    handleLike(event, context) {
        const { getState, setState } = context;
        const articleId = event.target.dataset.articleId;
        const currentLikes = parseInt(event.target.textContent.replace(/[^\\d]/g, '')) || 0;
        const liked = getState(\`articles.\${articleId}.liked\`, false);
        
        const newLiked = !liked;
        const newLikes = newLiked ? currentLikes + 1 : currentLikes - 1;
        
        // Update state
        setState(\`articles.\${articleId}.liked\`, newLiked);
        setState(\`articles.\${articleId}.likes\`, newLikes);
        
        // Update UI with animation
        event.target.style.transform = 'scale(1.2)';
        event.target.textContent = \`❤️ \${newLikes}\`;
        event.target.classList.toggle('liked', newLiked);
        
        setTimeout(() => {
            event.target.style.transform = 'scale(1)';
        }, 200);
        
        // Send to server (fire and forget)
        this.updateEngagement(articleId, 'like', newLiked);
    }

    async updateEngagement(articleId, type, value) {
        try {
            await fetch('/api/articles/engagement', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ articleId, type, value })
            });
        } catch (error) {
            console.error('Failed to update engagement:', error);
        }
    }

    createArticleComponent() {
        return (props, context) => {
            const { articleData } = props;
            return {
                article: {
                    className: 'news-article',
                    'data-article-id': articleData.id,
                    children: this.createArticleStructure(articleData)
                }
            };
        };
    }

    createArticleStructure(article) {
        return [
            {
                h2: {
                    className: 'article-title',
                    text: article.title
                }
            },
            {
                p: {
                    className: 'article-excerpt',
                    text: article.excerpt
                }
            },
            {
                div: {
                    className: 'article-actions',
                    children: [
                        {
                            button: {
                                className: 'like-btn',
                                'data-article-id': article.id,
                                text: \`❤️ \${article.likes}\`
                            }
                        },
                        {
                            button: {
                                className: 'share-btn',
                                'data-article-id': article.id,
                                text: '🔗 Share'
                            }
                        }
                    ]
                }
            }
        ];
    }

    expandArticle(compact) {
        return {
            id: compact.i,
            title: compact.t,
            excerpt: compact.e,
            category: compact.c,
            likes: compact.l,
            comments: compact.m
        };
    }

    handleCategoryFilter(event, context) {
        const category = event.target.textContent.toLowerCase();
        context.setState('app.activeCategory', category);
    }

    handleShare(event, context) {
        const articleId = event.target.dataset.articleId;
        const articleData = context.getState(\`articles.\${articleId}\`);
        
        if (navigator.share && articleData) {
            navigator.share({
                title: articleData.title,
                text: articleData.excerpt,
                url: window.location.href
            });
        }
    }
}

// Performance Tracker utility
class PerformanceTracker {
    constructor() {
        this.timers = new Map();
    }

    startTimer(name) {
        this.timers.set(name, performance.now());
    }

    endTimer(name) {
        const start = this.timers.get(name);
        if (start) {
            const duration = performance.now() - start;
            console.log(\`\${name}: \${duration.toFixed(2)}ms\`);
            this.timers.delete(name);
            return duration;
        }
        return 0;
    }
}

// Initialize the application
const app = new NewsStreamApp();`;

	return {
		render: () => ({
			div: {
				children: [
					{
						h1: {
							className: 'page-title',
							text: 'JSON Streaming'
						}
					},
					{
						p: {
							className: 'page-subtitle',
							text: 'Stream pure JSON content and progressively enhance with Juris for optimal performance and flexibility. Achieve 68% smaller payloads and blazing-fast rendering.'
						}
					},

					// Overview Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'What is JSON Streaming?',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'JSON Streaming is a revolutionary pattern where you deliver pure JSON data from your API and use Juris\'s Object DOM to render it directly in the browser. This eliminates the need for server-side HTML generation while enabling progressive enhancement.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
											gap: '1rem',
											marginBottom: '2rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '📦 68% Smaller Payloads' } },
														{ p: { text: 'Pure JSON is dramatically smaller than HTML with embedded JavaScript.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '⚡ Instant Rendering' } },
														{ p: { text: 'Object DOM renders JSON directly without parsing or compilation steps.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔄 Progressive Enhancement' } },
														{ p: { text: 'Add interactivity after initial render for optimal performance.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🌐 Real-Time Ready' } },
														{ p: { text: 'Perfect for WebSocket updates and live data streaming.' } }
													]
												}
											}
										]
									}
								}
							]
						}
					},

					// Basic Implementation Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Basic JSON Streaming Implementation',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Start streaming JSON content in three simple steps: fetch JSON data, render with Object DOM, and enhance with reactivity.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Basic JSON Streaming Pattern',
										language: 'javascript',
										code: basicStreamingExample
									}
								}
							]
						}
					},

					// Component Factory Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'JSON Component Factory Pattern',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Create component factories that transform JSON data into Object DOM structures. This pattern provides type safety and reusable rendering logic.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Component Factory for JSON Data',
										language: 'javascript',
										code: componentFactoryExample
									}
								}
							]
						}
					},

					// Progressive Enhancement Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Progressive Enhancement After Streaming',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'After streaming and rendering JSON content, use Juris\'s enhance() API to add reactive behaviors and state management.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Progressive Enhancement Implementation',
										language: 'javascript',
										code: progressiveEnhancementExample
									}
								}
							]
						}
					},

					// Real-Time Streaming Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Real-Time JSON Streaming',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Combine JSON streaming with WebSockets for real-time content updates. Stream live data and update existing content seamlessly.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Real-Time WebSocket JSON Streaming',
										language: 'javascript',
										code: realTimeStreamingExample
									}
								}
							]
						}
					},

					// Performance Optimization Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Performance Optimization',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Optimize JSON streaming for large datasets with batch rendering, virtual scrolling, and memory management techniques.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Advanced Performance Optimization',
										language: 'javascript',
										code: performanceOptimizationExample
									}
								}
							]
						}
					},

					// Compression Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'JSON Compression and Optimization',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Reduce payload sizes further with compact JSON structures, delta updates, and intelligent compression strategies.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'JSON Compression Techniques',
										language: 'javascript',
										code: compressionExample
									}
								}
							]
						}
					},

					// Real-World Implementation Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Complete Real-World Implementation',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'A complete production-ready JSON streaming application with all optimizations, error handling, and real-time features.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Production JSON Streaming App',
										language: 'javascript',
										code: realWorldExample
									}
								}
							]
						}
					},

					// Summary Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'JSON Streaming Summary',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									div: {
										className: 'card',
										style: {
											background: 'linear-gradient(135deg, #fff8f5 0%, #ffffff 100%)',
											border: '1px solid var(--orange-pale)',
											padding: '2rem'
										},
										children: [
											{
												p: {
													text: 'JSON Streaming with Juris represents the next evolution in web application architecture. By delivering pure data and rendering it directly with Object DOM, you achieve unprecedented performance while maintaining the flexibility to progressively enhance with full reactivity.',
													style: {
														fontSize: '1.1rem',
														fontWeight: '500',
														textAlign: 'center',
														color: 'var(--gray-700)',
														margin: '0'
													}
												}
											}
										]
									}
								}
							]
						}
					}
				]
			}
		})
	};
};
const SolutionsPage = (props, context) => {
	return {
		render: () => ({
			div: {
				className: 'fade-in',
				children: [
					// Hero Section
					{
						section: {
							className: 'page',
							children: [{
								div: {
									className: 'container',
									children: [
										{
											h1: {
												className: 'page-title',
												text: 'Solutions That Make Problems Obsolete'
											}
										},
										{
											p: {
												className: 'page-subtitle',
												text: 'Revolutionary approaches to the fundamental challenges that have plagued web development for years.'
											}
										}
									]
								}
							}]
						}
					},

					// Performance Solutions Section
					{
						section: {
							className: 'page',
							style: {
								background: 'linear-gradient(135deg, #fff8f5 0%, #ffffff 100%)',
								borderTop: '1px solid var(--orange-pale)'
							},
							children: [{
								div: {
									className: 'container',
									children: [
										{
											h2: {
												className: 'page-title',
												style: { color: 'var(--orange)' },
												text: '⚡ Performance Solutions'
											}
										},
										{
											p: {
												className: 'page-subtitle',
												text: 'Eliminate performance bottlenecks through architectural design, not optimization tricks.'
											}
										},
										{
											div: {
												className: 'content-grid',
												children: [
													{
														Card: {
															cardTitle: 'Sub-5ms Render Times',
															cardText: 'Architecture that enables consistent sub-5ms renders for enterprise-scale applications. No virtual DOM overhead, no reconciliation delays.'
														}
													},
													{
														Card: {
															cardTitle: 'Zero Bundle Optimization',
															cardText: 'Direct DOM updates with surgical precision eliminate the need for complex bundle splitting and code optimization strategies.'
														}
													},
													{
														Card: {
															cardTitle: 'Automatic Performance',
															cardText: 'Branch-aware reactivity and precise dependency tracking deliver optimal performance without manual optimization effort.'
														}
													},
													{
														Card: {
															cardTitle: 'JIT Engine Optimization',
															cardText: 'Predictable execution patterns enable maximum JavaScript engine optimization for consistent performance across devices.'
														}
													}
												]
											}
										}
									]
								}
							}]
						}
					},

					// Architecture Solutions Section
					{
						section: {
							className: 'page',
							children: [{
								div: {
									className: 'container',
									children: [
										{
											h2: {
												className: 'page-title',
												style: { color: 'var(--orange)' },
												text: '🏗️ Architecture Solutions'
											}
										},
										{
											p: {
												className: 'page-subtitle',
												text: 'Rethink application architecture from the ground up for simplicity and scalability.'
											}
										},
										{
											div: {
												className: 'content-grid',
												children: [
													{
														Card: {
															cardTitle: 'Single-File Applications',
															cardText: 'Build enterprise-scale applications in single files. This documentation site is 8,010 LOC in one HTML file with perfect performance.'
														}
													},
													{
														Card: {
															cardTitle: 'Headless Component Patterns',
															cardText: 'Separate business logic from presentation with headless components. Clean service-oriented architecture without framework complexity.'
														}
													},
													{
														Card: {
															cardTitle: 'Domain-Based State Organization',
															cardText: 'Organize global state by logical domains (ui.*, auth.*, data.*) for clarity and maintainability without prop drilling.'
														}
													},
													{
														Card: {
															cardTitle: 'Component Composition Revolution',
															cardText: 'Pass DOM structures as props for ultimate flexibility. Runtime composition without build-time constraints or framework limitations.'
														}
													}
												]
											}
										}
									]
								}
							}]
						}
					},

					// Developer Experience Solutions Section
					{
						section: {
							className: 'page',
							style: {
								background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
								borderTop: '1px solid var(--gray-200)'
							},
							children: [{
								div: {
									className: 'container',
									children: [
										{
											h2: {
												className: 'page-title',
												style: { color: 'var(--gray-800)' },
												text: '🧠 Developer Experience Solutions'
											}
										},
										{
											p: {
												className: 'page-subtitle',
												text: 'Eliminate the pain points that make development complex and frustrating.'
											}
										},
										{
											div: {
												className: 'content-grid',
												children: [
													{
														Card: {
															cardTitle: 'Zero Build Complexity',
															cardText: 'No webpack, no babel, no build tools. Pure JavaScript objects work in any browser immediately without transpilation or compilation.'
														}
													},
													{
														Card: {
															cardTitle: 'No useEffect Hell',
															cardText: 'Automatic dependency tracking eliminates manual effect management. No cleanup functions, no dependencies arrays, no stale closures.'
														}
													},
													{
														Card: {
															cardTitle: 'Function-Based Reactivity',
															cardText: 'Simple rule: functions are reactive, values are static. Zero manual subscriptions, zero coordination complexity, zero race conditions.'
														}
													},
													{
														Card: {
															cardTitle: 'Instant Debugging',
															cardText: 'Debug pure JavaScript objects and functions - exactly what you wrote. No hidden abstractions, no framework magic, no black boxes.'
														}
													}
												]
											}
										}
									]
								}
							}]
						}
					},

					// Migration Solutions Section
					{
						section: {
							className: 'page',
							children: [{
								div: {
									className: 'container',
									children: [
										{
											h2: {
												className: 'page-title',
												style: { color: 'var(--orange)' },
												text: '🔄 Migration Solutions'
											}
										},
										{
											p: {
												className: 'page-subtitle',
												text: 'Adopt gradually without throwing away working code or rewriting entire applications.'
											}
										},
										{
											div: {
												className: 'content-grid',
												children: [
													{
														Card: {
															cardTitle: 'Progressive Enhancement',
															cardText: 'Add reactivity to existing DOM elements without rewrites. Transform any HTML into reactive components using enhance().'
														}
													},
													{
														Card: {
															cardTitle: 'Framework Agnostic',
															cardText: 'Integrate with React, Vue, Angular, or vanilla JavaScript. Start small, grow gradually, migrate at your own pace.'
														}
													},
													{
														Card: {
															cardTitle: 'Zero Framework Lock-in',
															cardText: 'Components are pure JavaScript objects. Easy to extract, port, or integrate with other systems without vendor dependency.'
														}
													},
													{
														Card: {
															cardTitle: 'Legacy Code Modernization',
															cardText: 'Modernize legacy applications incrementally. Add new features with Juris while keeping existing code functional.'
														}
													}
												]
											}
										}
									]
								}
							}]
						}
					},

					// Problem/Solution Comparisons Section
					{
						section: {
							className: 'page',
							style: {
								background: 'linear-gradient(135deg, #fff8f5 0%, #ffffff 100%)',
								borderTop: '1px solid var(--orange-pale)'
							},
							children: [{
								div: {
									className: 'container',
									children: [
										{
											h2: {
												className: 'page-title',
												style: { color: 'var(--orange)' },
												text: '🎯 Problem → Solution Transformation'
											}
										},
										{
											p: {
												className: 'page-subtitle',
												text: 'See how common development problems become obsolete with the right architectural approach.'
											}
										},
										{
											div: {
												className: 'content-grid',
												style: {
													gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))'
												},
												children: [
													{
														Card: {
															cardTitle: '❌ State Sync Issues → ✅ Global State Access',
															cardText: 'No prop drilling, no context providers, no state duplication. Any component accesses any state directly with automatic reactivity.'
														}
													},
													{
														Card: {
															cardTitle: '❌ Bundle Size Optimization → ✅ Direct DOM Updates',
															cardText: 'No virtual DOM overhead. Surgical precision updates keep applications lightweight without complex optimization strategies.'
														}
													},
													{
														Card: {
															cardTitle: '❌ Race Conditions → ✅ Temporal Independence',
															cardText: 'Components work before their dependencies exist. Updates happen when data arrives. Zero coordination complexity.'
														}
													},
													{
														Card: {
															cardTitle: '❌ Build Tool Complexity → ✅ Pure JavaScript',
															cardText: 'No webpack configs, no babel setup, no JSX transpilation. Write JavaScript objects that work immediately in any browser.'
														}
													},
													{
														Card: {
															cardTitle: '❌ Testing Complexity → ✅ Simple Functions',
															cardText: 'Test pure JavaScript functions. No mocking frameworks, no component testing libraries, no async testing hell.'
														}
													},
													{
														Card: {
															cardTitle: '❌ Component Coupling → ✅ Component Mobility',
															cardText: 'Components work anywhere in the UI tree. No parent-child dependencies, no context setup, no prop threading.'
														}
													}
												]
											}
										}
									]
								}
							}]
						}
					},

					// Real-World Applications Section
					{
						section: {
							className: 'page',
							children: [{
								div: {
									className: 'container',
									children: [
										{
											h2: {
												className: 'page-title',
												style: { color: 'var(--orange)' },
												text: '🌍 Real-World Applications'
											}
										},
										{
											p: {
												className: 'page-subtitle',
												text: 'Solutions proven at scale in production environments and complex scenarios.'
											}
										},
										{
											div: {
												className: 'content-grid',
												children: [
													{
														Card: {
															cardTitle: 'Enterprise Dashboards',
															cardText: 'Real-time data visualization with WebSocket integration, device detection, and responsive design. Sub-5ms updates for thousands of data points.'
														}
													},
													{
														Card: {
															cardTitle: 'Documentation Sites',
															cardText: 'This very site: 8,010 LOC single-file documentation with perfect Lighthouse scores, interactive examples, and comprehensive content.'
														}
													},
													{
														Card: {
															cardTitle: 'Progressive Web Apps',
															cardText: 'Single-file PWAs with offline capability, push notifications, and native-like performance. Zero build process, maximum functionality.'
														}
													},
													{
														Card: {
															cardTitle: 'Legacy System Integration',
															cardText: 'Modernize existing applications incrementally. Add reactive components to legacy DOM without disrupting working functionality.'
														}
													}
												]
											}
										}
									]
								}
							}]
						}
					},

					// The Philosophy Section
					{
						section: {
							className: 'page',
							style: {
								background: 'var(--orange)',
								color: 'white',
								textAlign: 'center'
							},
							children: [{
								div: {
									className: 'container',
									children: [
										{
											h2: {
												style: {
													fontSize: '2.5rem',
													fontWeight: '600',
													marginBottom: '2rem',
													letterSpacing: '-0.025em',
													color: 'white'
												},
												text: 'The Solution Philosophy'
											}
										},
										{
											p: {
												style: {
													fontSize: '1.25rem',
													lineHeight: '1.8',
													maxWidth: '800px',
													margin: '0 auto 2rem',
													color: 'white',
													fontWeight: '400'
												},
												text: 'Instead of solving complex problems with complex solutions, we eliminate the problems at their source. Every "best practice" in modern web development exists to solve problems that shouldn\'t exist in the first place.'
											}
										},
										{
											div: {
												style: {
													display: 'grid',
													gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
													gap: '2rem',
													marginTop: '3rem'
												},
												children: [
													{
														div: {
															style: { textAlign: 'center' },
															children: [
																{
																	div: {
																		style: { fontSize: '3rem', marginBottom: '1rem' },
																		text: '🚫'
																	}
																},
																{
																	h3: {
																		style: { fontSize: '1.2rem', marginBottom: '0.5rem', color: 'white' },
																		text: 'Eliminate Complexity'
																	}
																},
																{
																	p: {
																		style: { fontSize: '0.9rem', color: 'rgba(255,255,255,0.9)' },
																		text: 'Don\'t manage complexity, eliminate it'
																	}
																}
															]
														}
													},
													{
														div: {
															style: { textAlign: 'center' },
															children: [
																{
																	div: {
																		style: { fontSize: '3rem', marginBottom: '1rem' },
																		text: '⚡'
																	}
																},
																{
																	h3: {
																		style: { fontSize: '1.2rem', marginBottom: '0.5rem', color: 'white' },
																		text: 'Automatic Solutions'
																	}
																},
																{
																	p: {
																		style: { fontSize: '0.9rem', color: 'rgba(255,255,255,0.9)' },
																		text: 'Architecture handles optimization automatically'
																	}
																}
															]
														}
													},
													{
														div: {
															style: { textAlign: 'center' },
															children: [
																{
																	div: {
																		style: { fontSize: '3rem', marginBottom: '1rem' },
																		text: '🎯'
																	}
																},
																{
																	h3: {
																		style: { fontSize: '1.2rem', marginBottom: '0.5rem', color: 'white' },
																		text: 'Simple by Design'
																	}
																},
																{
																	p: {
																		style: { fontSize: '0.9rem', color: 'rgba(255,255,255,0.9)' },
																		text: 'Powerful capabilities through simple patterns'
																	}
																}
															]
														}
													},
													{
														div: {
															style: { textAlign: 'center' },
															children: [
																{
																	div: {
																		style: { fontSize: '3rem', marginBottom: '1rem' },
																		text: '🔄'
																	}
																},
																{
																	h3: {
																		style: { fontSize: '1.2rem', marginBottom: '0.5rem', color: 'white' },
																		text: 'Progressive Adoption'
																	}
																},
																{
																	p: {
																		style: { fontSize: '0.9rem', color: 'rgba(255,255,255,0.9)' },
																		text: 'Adopt incrementally without disruption'
																	}
																}
															]
														}
													}
												]
											}
										}
									]
								}
							}]
						}
					}
				]
			}
		})
	};
};
/**
 * @param {Object} props
 * @param {JurisContextBase} context
 * @returns {JurisVDOMElement}
 */
const DocsEnhanceAPI = (props, context) => {
	const { getState, setState } = context;

	const basicEnhanceExample = `// Basic Enhancement - Add Reactivity to Existing DOM
const app = new Juris({
    components: { /* your components */ }
});

// Enhance existing HTML elements with reactivity
app.enhance('#counter-btn', {
    text: () => \`Clicked \${app.getState('counter', 0)} times\`,
    onclick: () => {
        const current = app.getState('counter', 0);
        app.setState('counter', current + 1);
    }
});

// The HTML:
// <button id="counter-btn">Static Button</button>
// Becomes reactive without changing the HTML!`;

	const selectorBasedExample = `// Selector-Based Enhancement - Multiple Elements at Once
app.enhance('.themed-content', {
    className: () => {
        const theme = app.getState('ui.theme', 'light');
        return \`themed-content \${theme}\`;
    },
    style: () => ({
        opacity: app.getState('ui.visible', true) ? 1 : 0,
        transition: 'all 0.3s ease'
    })
});

// Enhances ALL elements with class 'themed-content'
// <div class="themed-content">Content 1</div>
// <div class="themed-content">Content 2</div>
// <div class="themed-content">Content 3</div>
// All become reactive simultaneously`;

	const nestedSelectorsExample = `// Nested Selectors - Complex Enhancement Patterns
app.enhance('.card-container', {
    // Enhance the container itself
    className: () => {
        const layout = app.getState('ui.layout', 'grid');
        return \`card-container \${layout}-layout\`;
    },
    
    // Enhance child elements with different behaviors
    selectors: {
        '.card': (context) => ({
            className: () => {
                const cardId = context.element.dataset.cardId;
                const isSelected = app.getState('selection.cards', []).includes(cardId);
                return \`card \${isSelected ? 'selected' : ''}\`;
            },
            onclick: () => {
                const cardId = context.element.dataset.cardId;
                const selected = app.getState('selection.cards', []);
                const newSelection = selected.includes(cardId)
                    ? selected.filter(id => id !== cardId)
                    : [...selected, cardId];
                app.setState('selection.cards', newSelection);
            }
        }),
        
        '.card-title': (context) => ({
            text: () => {
                const cardId = context.element.closest('.card').dataset.cardId;
                const cardData = app.getState(\`data.cards.\${cardId}\`);
                return cardData?.title || 'Loading...';
            }
        }),
        
        '.card-actions .btn': (context) => ({
            disabled: () => {
                const action = context.element.dataset.action;
                const permissions = app.getState('auth.permissions', []);
                return !permissions.includes(action);
            },
            onclick: (event) => {
                const action = event.target.dataset.action;
                const cardId = event.target.closest('.card').dataset.cardId;
                app.setState(\`actions.\${action}\`, { cardId, timestamp: Date.now() });
            }
        })
    }
});

// Complex HTML structure becomes fully reactive:
// <div class="card-container">
//   <div class="card" data-card-id="1">
//     <h3 class="card-title">Title</h3>
//     <div class="card-actions">
//       <button class="btn" data-action="edit">Edit</button>
//       <button class="btn" data-action="delete">Delete</button>
//     </div>
//   </div>
// </div>`;

	const contextAccessExample = `// Context Access - Full Framework Integration
app.enhance('.user-profile', (context) => {
    // Access to all headless components, services, and state management
    const { getState, setState, headless, services } = context;
    
    // Destructure headless components for easier access
    const { DataManager, ApiManager, NotificationManager } = headless;
    
    // Helper functions using context (defined in enhancement scope)
    const loadUserData = async (userId) => {
        if (!ApiManager) return;
        
        try {
            const userData = await ApiManager.get(\`/users/\${userId}\`);
            setState(\`users.\${userId}\`, userData);
            if (NotificationManager) {
                NotificationManager.show('User data loaded');
            }
        } catch (error) {
            if (NotificationManager) {
                NotificationManager.error('Failed to load user data');
            }
        }
    };
    
    const refreshData = () => {
        if (DataManager?.refreshUserData) {
            DataManager.refreshUserData();
        }
    };
    
    return {
        className: () => {
            const user = getState('auth.user');
            const theme = getState('ui.theme', 'light');
            return \`user-profile \${theme} \${user?.role || 'guest'}\`;
        },
        
        // Click handler with access to helper functions
        onclick: () => {
            const user = getState('auth.user');
            if (user?.id) {
                loadUserData(user.id);
            }
        },
        
        // Double-click for refresh
        ondblclick: () => {
            refreshData();
        }
    };
});

// Enhanced refresh button with context access
app.enhance('.refresh-btn', (context) => {
    const { getState, headless } = context;
    const { DataManager } = headless;
    
    return {
        text: 'Refresh Data',
        onclick: () => {
            // Access headless component methods directly
            if (DataManager?.refreshUserData) {
                DataManager.refreshUserData();
            }
        },
        className: () => {
            const loading = getState('ui.loading', false);
            return loading ? 'refresh-btn loading' : 'refresh-btn';
        }
    };
});`;

	const formEnhancementExample = `// Form Enhancement - Complex Form Handling
app.enhance('form.contact-form', (context) => {
    const { getState, setState } = context;
    
    // Form validation helper
    const validateContactForm = (data) => {
        const errors = {};
        
        if (!data.name || data.name.trim().length < 2) {
            errors.name = 'Name must be at least 2 characters';
        }
        
        if (!data.email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(data.email)) {
            errors.email = 'Please enter a valid email address';
        }
        
        if (!data.message || data.message.trim().length < 10) {
            errors.message = 'Message must be at least 10 characters';
        }
        
        return errors;
    };
    
    return {
        // Form-level enhancements
        className: () => {
            const isSubmitting = getState('form.contact.submitting', false);
            const hasErrors = Object.keys(getState('form.contact.errors', {})).length > 0;
            return \`contact-form \${isSubmitting ? 'submitting' : ''} \${hasErrors ? 'has-errors' : ''}\`;
        },
        
        onsubmit: async (event) => {
            event.preventDefault();
            
            // Set submitting state
            setState('form.contact.submitting', true);
            setState('form.contact.errors', {});
            
            try {
                const formData = new FormData(event.target);
                const data = Object.fromEntries(formData.entries());
                
                // Validate
                const errors = validateContactForm(data);
                if (Object.keys(errors).length > 0) {
                    setState('form.contact.errors', errors);
                    return;
                }
                
                // Submit
                await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                setState('form.contact.success', true);
                event.target.reset();
                
            } catch (error) {
                setState('form.contact.errors', { _form: error.message });
            } finally {
                setState('form.contact.submitting', false);
            }
        },
        
        // Field-specific enhancements
        selectors: {
            'input[name="email"]': (context) => ({
                className: () => {
                    const errors = getState('form.contact.errors', {});
                    return errors.email ? 'form-input error' : 'form-input';
                },
                oninput: (event) => {
                    setState('form.contact.email', event.target.value);
                    // Clear error on input
                    const errors = getState('form.contact.errors', {});
                    if (errors.email) {
                        delete errors.email;
                        setState('form.contact.errors', { ...errors });
                    }
                }
            }),
            
            '.error-message': (context) => ({
                text: () => {
                    const fieldName = context.element.dataset.field;
                    const errors = getState('form.contact.errors', {});
                    return errors[fieldName] || '';
                },
                style: () => ({
                    display: (() => {
                        const fieldName = context.element.dataset.field;
                        const errors = getState('form.contact.errors', {});
                        return errors[fieldName] ? 'block' : 'none';
                    })()
                })
            }),
            
            'button[type="submit"]': (context) => ({
                disabled: () => getState('form.contact.submitting', false),
                text: () => {
                    const submitting = getState('form.contact.submitting', false);
                    return submitting ? 'Sending...' : 'Send Message';
                }
            })
        }
    };
});`;

	const dataTableExample = `// Data Table Enhancement - Complex List Management
app.enhance('.data-table', (context) => {
    const { getState, setState, headless } = context;
    const { ApiManager } = headless;
    
    // Helper functions for table operations
    const deleteRow = async (rowId) => {
        setState('table.loading', true);
        try {
            await ApiManager.delete(\`/api/rows/\${rowId}\`);
            const data = getState('table.data', {});
            delete data[rowId];
            setState('table.data', { ...data });
        } finally {
            setState('table.loading', false);
        }
    };
    
    const loadTableData = async (page) => {
        setState('table.loading', true);
        try {
            const data = await ApiManager.get(\`/api/table?page=\${page}\`);
            setState('table.data', data.rows);
            setState('table.totalPages', data.totalPages);
        } finally {
            setState('table.loading', false);
        }
    };
    
    return {
        className: () => {
            const loading = getState('table.loading', false);
            const view = getState('table.view', 'grid');
            return \`data-table \${view}-view \${loading ? 'loading' : ''}\`;
        },
        
        selectors: {
            // Header controls
            '.sort-header': (context) => ({
                className: () => {
                    const column = context.element.dataset.column;
                    const sortBy = getState('table.sortBy');
                    const sortDir = getState('table.sortDirection', 'asc');
                    return \`sort-header \${sortBy === column ? 'active ' + sortDir : ''}\`;
                },
                onclick: () => {
                    const column = context.element.dataset.column;
                    const currentSort = getState('table.sortBy');
                    const currentDir = getState('table.sortDirection', 'asc');
                    
                    if (currentSort === column) {
                        setState('table.sortDirection', currentDir === 'asc' ? 'desc' : 'asc');
                    } else {
                        setState('table.sortBy', column);
                        setState('table.sortDirection', 'asc');
                    }
                }
            }),
            
            // Row selection
            '.row-checkbox': (context) => ({
                checked: () => {
                    const rowId = context.element.dataset.rowId;
                    return getState('table.selected', []).includes(rowId);
                },
                onchange: (event) => {
                    const rowId = context.element.dataset.rowId;
                    const selected = getState('table.selected', []);
                    
                    if (event.target.checked) {
                        setState('table.selected', [...selected, rowId]);
                    } else {
                        setState('table.selected', selected.filter(id => id !== rowId));
                    }
                }
            }),
            
            // Row actions
            '.row-action': (context) => ({
                disabled: () => {
                    const action = context.element.dataset.action;
                    const rowId = context.element.dataset.rowId;
                    const permissions = getState('auth.permissions', []);
                    const rowData = getState(\`table.data.\${rowId}\`);
                    
                    if (action === 'delete' && !permissions.includes('delete')) return true;
                    if (action === 'edit' && rowData?.locked) return true;
                    return false;
                },
                onclick: async (event) => {
                    const action = event.target.dataset.action;
                    const rowId = event.target.dataset.rowId;
                    
                    switch (action) {
                        case 'edit':
                            setState('ui.editingRow', rowId);
                            break;
                        case 'delete':
                            if (confirm('Are you sure?')) {
                                await deleteRow(rowId);
                            }
                            break;
                    }
                }
            }),
            
            // Pagination
            '.page-btn': (context) => ({
                className: () => {
                    const page = parseInt(context.element.dataset.page);
                    const currentPage = getState('table.currentPage', 1);
                    return \`page-btn \${page === currentPage ? 'active' : ''}\`;
                },
                onclick: () => {
                    const page = parseInt(context.element.dataset.page);
                    setState('table.currentPage', page);
                    loadTableData(page);
                }
            })
        }
    };
});`;

	const migrationExample = `// Progressive Migration - Legacy to Reactive
// Step 1: Start with existing HTML and basic enhancement
app.enhance('.legacy-widget', {
    className: () => {
        const theme = app.getState('ui.theme', 'light');
        return \`legacy-widget \${theme}\`;
    }
});

// Step 2: Add more sophisticated behavior
app.enhance('.legacy-widget', (context) => {
    const { getState, setState } = context;
    
    return {
        selectors: {
            '.legacy-button': (context) => ({
                onclick: () => {
                    // Bridge legacy JavaScript with reactive state
                    const widgetId = context.element.closest('.legacy-widget').id;
                    setState(\`widgets.\${widgetId}.clicked\`, Date.now());
                    
                    // Still call legacy function if needed
                    if (window.legacyButtonClick) {
                        window.legacyButtonClick(widgetId);
                    }
                }
            }),
            
            '.legacy-display': (context) => ({
                text: () => {
                    const widgetId = context.element.closest('.legacy-widget').id;
                    const lastClicked = getState(\`widgets.\${widgetId}.clicked\`);
                    return lastClicked 
                        ? \`Last clicked: \${new Date(lastClicked).toLocaleTimeString()}\`
                        : 'Not clicked yet';
                }
            })
        }
    };
});

// Step 3: Gradually replace with full components
// (Legacy code continues working while you migrate piece by piece)`;

	const enhancementOptionsExample = `// Enhancement Options - Configuration and Control
app.enhance('.advanced-component', (context) => {
    const { getState, setState, headless } = context;
    const { DataManager, NotificationManager } = headless;
    
    // Helper functions with context access
    const trackAnalytics = (eventName, data) => {
        setState('analytics.events', [
            ...getState('analytics.events', []),
            { eventName, data, timestamp: Date.now() }
        ]);
    };
    
    return {
        className: () => \`component \${getState('ui.theme')}\`,
        
        onclick: (event) => {
            const componentId = event.target.dataset.componentId;
            if (DataManager) {
                DataManager.trackInteraction(componentId);
            }
            if (NotificationManager) {
                NotificationManager.show('Component clicked');
            }
            trackAnalytics('component_clicked', { componentId });
        }
    };
}, {
    // Enhancement configuration options
    batchUpdates: true,           // Batch multiple DOM updates
    debounceMs: 16,              // Debounce rapid state changes
    observeNewElements: true,     // Auto-enhance dynamically added elements
    preserveExistingHandlers: false // Override existing event handlers
});

// Multiple Enhancement Calls - Process Different Elements
// Note: Each enhancement is applied separately
app.enhance('.card', cardEnhancement, { observeNewElements: true });
app.enhance('.button', buttonEnhancement, { debounceMs: 10 });
app.enhance('.input', inputEnhancement, { batchUpdates: true });

// Enhancement with progress tracking using state
app.setState('enhancement.progress', 0);

const enhanceWithProgress = async (selectors) => {
    const total = selectors.length;
    
    for (let i = 0; i < selectors.length; i++) {
        const { selector, config, options } = selectors[i];
        app.enhance(selector, config, options);
        
        // Update progress
        const progress = ((i + 1) / total) * 100;
        app.setState('enhancement.progress', progress);
        
        // Allow UI to update
        await new Promise(resolve => setTimeout(resolve, 0));
    }
};

// Usage
enhanceWithProgress([
    { selector: '.card', config: cardEnhancement },
    { selector: '.button', config: buttonEnhancement },
    { selector: '.input', config: inputEnhancement }
]);`;

	const realWorldExample = `// Real-World Example - E-commerce Product Grid
app.enhance('.product-grid', (context) => {
    const { getState, setState, headless } = context;
    const { ApiManager, NotificationManager } = headless;
    
    // Helper functions
    const formatPrice = (price, currency) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(price);
    };
    
    return {
        className: () => {
            const view = getState('products.view', 'grid');
            const loading = getState('products.loading', false);
            return \`product-grid \${view}-view \${loading ? 'loading' : ''}\`;
        },
        
        selectors: {
            // Product cards
            '.product-card': (context) => ({
                className: () => {
                    const productId = context.element.dataset.productId;
                    const favorited = getState('user.favorites', []).includes(productId);
                    const inCart = getState('cart.items', []).some(item => item.productId === productId);
                    return \`product-card \${favorited ? 'favorited' : ''} \${inCart ? 'in-cart' : ''}\`;
                }
            }),
            
            // Favorite buttons
            '.favorite-btn': (context) => ({
                className: () => {
                    const productId = context.element.closest('.product-card').dataset.productId;
                    const favorited = getState('user.favorites', []).includes(productId);
                    return \`favorite-btn \${favorited ? 'active' : ''}\`;
                },
                onclick: async (event) => {
                    const productId = event.target.closest('.product-card').dataset.productId;
                    const favorites = getState('user.favorites', []);
                    
                    const newFavorites = favorites.includes(productId)
                        ? favorites.filter(id => id !== productId)
                        : [...favorites, productId];
                    
                    setState('user.favorites', newFavorites);
                    
                    // Sync with backend
                    if (ApiManager) {
                        try {
                            await ApiManager.post('/api/favorites', {
                                productId,
                                favorited: newFavorites.includes(productId)
                            });
                        } catch (error) {
                            // Revert on error
                            setState('user.favorites', favorites);
                            if (NotificationManager) {
                                NotificationManager.error('Failed to update favorites');
                            }
                        }
                    }
                }
            }),
            
            // Add to cart buttons
            '.add-to-cart': (context) => ({
                disabled: () => {
                    const productId = context.element.closest('.product-card').dataset.productId;
                    const product = getState(\`products.data.\${productId}\`);
                    const inCart = getState('cart.items', []).some(item => item.productId === productId);
                    return !product?.inStock || inCart;
                },
                text: () => {
                    const productId = context.element.closest('.product-card').dataset.productId;
                    const inCart = getState('cart.items', []).some(item => item.productId === productId);
                    const product = getState(\`products.data.\${productId}\`);
                    
                    if (inCart) return 'In Cart';
                    if (!product?.inStock) return 'Out of Stock';
                    return 'Add to Cart';
                },
                onclick: async (event) => {
                    const productId = event.target.closest('.product-card').dataset.productId;
                    const product = getState(\`products.data.\${productId}\`);
                    
                    const cartItems = getState('cart.items', []);
                    const newItem = {
                        productId,
                        name: product.name,
                        price: product.price,
                        quantity: 1,
                        addedAt: Date.now()
                    };
                    
                    setState('cart.items', [...cartItems, newItem]);
                    setState('cart.count', cartItems.length + 1);
                    
                    // Show confirmation
                    if (NotificationManager) {
                        NotificationManager.success(\`\${product.name} added to cart!\`);
                    }
                    
                    // Analytics
                    setState('analytics.events', [
                        ...getState('analytics.events', []),
                        { event: 'add_to_cart', productId, timestamp: Date.now() }
                    ]);
                }
            }),
            
            // Price display
            '.price': (context) => ({
                text: () => {
                    const productId = context.element.closest('.product-card').dataset.productId;
                    const product = getState(\`products.data.\${productId}\`);
                    const currency = getState('user.currency', 'USD');
                    
                    if (!product) return 'Loading...';
                    
                    const price = product.price;
                    const discount = product.discount || 0;
                    const finalPrice = price * (1 - discount);
                    
                    return formatPrice(finalPrice, currency);
                },
                className: () => {
                    const productId = context.element.closest('.product-card').dataset.productId;
                    const product = getState(\`products.data.\${productId}\`);
                    return \`price \${product?.discount ? 'discounted' : ''}\`;
                }
            })
        }
    };
});`;

	return {
		render: () => ({
			div: {
				children: [
					{
						h1: {
							className: 'page-title',
							text: 'enhance() API'
						}
					},
					{
						p: {
							className: 'page-subtitle',
							text: 'Transform existing DOM elements into reactive components without rewrites. The ultimate progressive enhancement API.'
						}
					},

					// Overview Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'What is enhance()?',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'The enhance() API is Juris\'s revolutionary progressive enhancement system. It adds reactivity to existing DOM elements without changing the HTML, making legacy code reactive and enabling gradual migration to modern patterns.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
											gap: '1rem',
											marginBottom: '2rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🎯 Zero Rewrites' } },
														{ p: { text: 'Transform existing HTML into reactive components without changing a single line of markup.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔄 Full Reactivity' } },
														{ p: { text: 'Enhanced elements get complete access to reactive state, event handlers, and framework features.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🏗️ Nested Selectors' } },
														{ p: { text: 'Enhance complex DOM structures with different behaviors for different child elements.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🌐 Context Access' } },
														{ p: { text: 'Enhanced elements have full access to headless components, services, and framework context.' } }
													]
												}
											}
										]
									}
								}
							]
						}
					},

					// Basic Enhancement Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Basic Enhancement',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Start with existing HTML and add reactivity without changing the markup.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Basic Progressive Enhancement',
										language: 'javascript',
										code: basicEnhanceExample
									}
								}
							]
						}
					},

					// Selector-Based Enhancement Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Selector-Based Enhancement',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Enhance multiple elements at once using CSS selectors. Perfect for lists, grids, and repeated elements.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Multiple Element Enhancement',
										language: 'javascript',
										code: selectorBasedExample
									}
								}
							]
						}
					},

					// Nested Selectors Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Nested Selectors',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Enhance complex DOM structures with different behaviors for parent and child elements. Each selector gets its own enhancement configuration.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Complex Nested Enhancement',
										language: 'javascript',
										code: nestedSelectorsExample
									}
								}
							]
						}
					},

					// Context Access Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Context Access',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Enhanced elements have full access to the Juris context, including headless components, services, and custom methods through function-based enhancement definitions.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Full Framework Integration',
										language: 'javascript',
										code: contextAccessExample
									}
								}
							]
						}
					},

					// Form Enhancement Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Form Enhancement',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Transform static forms into reactive, validated forms with real-time feedback and error handling.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Complete Form Enhancement',
										language: 'javascript',
										code: formEnhancementExample
									}
								}
							]
						}
					},

					// Data Table Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Data Table Enhancement',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Turn static HTML tables into fully interactive data grids with sorting, filtering, pagination, and row actions.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Advanced Table Enhancement',
										language: 'javascript',
										code: dataTableExample
									}
								}
							]
						}
					},

					// Progressive Migration Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Progressive Migration',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Migrate legacy applications gradually without breaking existing functionality. Start with basic enhancements and progressively add more sophisticated behavior.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Gradual Legacy Migration',
										language: 'javascript',
										code: migrationExample
									}
								}
							]
						}
					},

					// Enhancement Options Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Enhancement Options',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Fine-tune enhancement behavior with configuration options and batch processing for optimal performance.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Advanced Configuration',
										language: 'javascript',
										code: enhancementOptionsExample
									}
								}
							]
						}
					},

					// Real-World Example Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Real-World Example',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Complete e-commerce product grid enhancement showing how to transform a static HTML product listing into a fully interactive shopping interface.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'E-commerce Enhancement',
										language: 'javascript',
										code: realWorldExample
									}
								}
							]
						}
					},

					// API Reference Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'API Reference',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
											gap: '1rem',
											marginTop: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: 'app.enhance(selector, config, options)' } },
														{ p: { text: 'Main enhancement method. Config can be object or function that returns config. Options configure behavior.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: 'Function-based Config' } },
														{ p: { text: 'Use (context) => config to access framework context including headless components and services.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: 'config.selectors' } },
														{ p: { text: 'Object defining child element behaviors. Keys are CSS selectors, values are enhancement configs or functions.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: 'options.batchUpdates' } },
														{ p: { text: 'Boolean. Batch multiple DOM updates for better performance. Default: false.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: 'options.debounceMs' } },
														{ p: { text: 'Number. Debounce rapid state changes to prevent excessive DOM updates. Default: 0.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: 'options.observeNewElements' } },
														{ p: { text: 'Boolean. Automatically enhance dynamically added elements that match the selector. Default: false.' } }
													]
												}
											}
										]
									}
								}
							]
						}
					},

					// Summary Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'enhance() API Summary',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									div: {
										className: 'card',
										style: {
											background: 'linear-gradient(135deg, #fff8f5 0%, #ffffff 100%)',
											border: '1px solid var(--orange-pale)',
											padding: '2rem'
										},
										children: [
											{
												p: {
													text: 'The enhance() API represents the ultimate progressive enhancement solution - transforming existing HTML into reactive components without rewrites, enabling gradual migration to modern patterns while maintaining full access to Juris\'s powerful features. Use function-based configurations to access the complete framework context.',
													style: {
														fontSize: '1.1rem',
														fontWeight: '500',
														textAlign: 'center',
														color: 'var(--gray-700)',
														margin: '0'
													}
												}
											}
										]
									}
								}
							]
						}
					}
				]
			}
		})
	};
};

const DocsPage = (props, context) => {
	const { getState } = context;

	const subRoutes = [
		{ path: '', label: 'Getting Started', section: 'intro' },
		{ path: 'components', label: 'Components', section: 'components' },
		{ path: 'enhance', label: 'enhance() API', section: 'enhance' },
		{ path: 'state', label: 'State Management', section: 'state' },
		{ path: 'routing', label: 'Routing', section: 'routing' },
		{ path: 'advanced', label: 'Advanced Patterns', section: 'advanced' },
		{ path: 'control-flow', label: 'Control Flow', section: 'control-flow' },
		{ path: 'headless', label: 'Headless Components', section: 'headless' },
		{ path: 'jason-streaming', label: 'JSON Streaming', section: 'jason-streaming' }
	];

	return {
		render: () => ({
			div: {
				className: 'fade-in',
				children: [
					{
						nav: {
							className: 'sub-nav',
							children: [{
								div: {
									className: 'sub-nav-content',
									children: () => {
										const currentSub = getState('url.segments.sub', '');

										return subRoutes.map(route => ({
											a: {
												href: `#/docs${route.path ? '/' + route.path : ''}`,
												className: currentSub === route.path ? 'sub-nav-link active' : 'sub-nav-link',
												text: route.label,
												onclick: (e) => {
													e.preventDefault();
													window.location.hash = `/docs${route.path ? '/' + route.path : ''}`;
												},
												key: route.path || 'intro'
											}
										}));
									}
								}
							}]
						}
					},
					{
						section: {
							className: 'page',
							children: [{
								div: {
									className: 'container',
									children: () => {
										const currentSub = getState('url.segments.sub', '');

										switch (currentSub) {
											case 'components':
												return [{ DocsComponents: {} }];
											case 'state':
												return [{ DocsState: {} }];
											case 'routing':
												return [{ DocsRouting: {} }];
											case 'headless':
												return [{ DocsHeadless: {} }];
											case 'enhance':
												return [{ DocsEnhanceAPI: {} }];
											case 'advanced':
												return [{ DocsAdvancedPatterns: {} }];
											case 'control-flow':
												return [{ DocsControlFlow: {} }];
											case 'jason-streaming':
												return [{ DocsJSONStreaming: {} }];
											default:
												return [{ DocsIntro: {} }];
										}
									}
								}
							}]
						}
					}
				]
			}
		})
	};
};

const DocsControlFlow = (props, context) => {
	const conditionalExample = `// 1. Conditional Component - Show/Hide Content Based on State
const LoginSection = (props, { getState, setState }) => ({
  render: () => ({
    div: {
      children: [
        {
          button: {
            text: 'Toggle Authentication',
            onclick: () => {
              const current = getState('auth.isLoggedIn', false);
              setState('auth.isLoggedIn', !current);
            }
          }
        },
        {
          Conditional: {
            condition: 'auth.isLoggedIn',  // State path or function
            then: {
              div: {
                className: 'welcome-message',
                children: [
                  { h3: { text: 'Welcome back!' } },
                  { p: { text: 'You have full access to the application.' } }
                ]
              }
            },
            else: {
              div: {
                className: 'login-prompt',
                children: [
                  { h3: { text: 'Please log in' } },
                  { p: { text: 'Access denied. Authentication required.' } }
                ]
              }
            }
          }
        }
      ]
    }
  })
});

// Using function-based conditions
const DynamicConditional = (props, { getState }) => ({
  render: () => ({
    Conditional: {
      condition: () => {
        const user = getState('auth.user');
        const permissions = getState('auth.permissions', []);
        return user && permissions.includes('admin');
      },
      then: { AdminPanel: {} },
      else: { AccessDenied: {} }
    }
  })
});

// Multiple conditions
const ComplexConditional = (props, { getState }) => ({
  render: () => ({
    div: {
      children: [
        {
          Conditional: {
            condition: 'user.isVerified',
            then: {
              Conditional: {
                condition: 'user.hasSubscription',
                then: { PremiumContent: {} },
                else: { UpgradePrompt: {} }
              }
            },
            else: { VerificationRequired: {} }
          }
        }
      ]
    }
  })
});`;

	const switchExample = `// 2. Switch Component - Multiple Condition Branches
const UserDashboard = (props, { getState, setState }) => ({
  render: () => ({
    div: {
      children: [
        {
          div: {
            className: 'role-selector',
            children: [
              {
                button: {
                  text: 'Admin',
                  onclick: () => setState('auth.role', 'admin')
                }
              },
              {
                button: {
                  text: 'User', 
                  onclick: () => setState('auth.role', 'user')
                }
              },
              {
                button: {
                  text: 'Guest',
                  onclick: () => setState('auth.role', 'guest')
                }
              }
            ]
          }
        },
        {
          Switch: {
            value: 'auth.role',  // State path to switch on
            cases: {
              'admin': {
                div: {
                  className: 'admin-dashboard',
                  children: [
                    { h2: { text: '👑 Admin Dashboard' } },
                    { p: { text: 'Full system access granted' } },
                    { AdminControls: {} }
                  ]
                }
              },
              'user': {
                div: {
                  className: 'user-dashboard', 
                  children: [
                    { h2: { text: '👤 User Dashboard' } },
                    { p: { text: 'Standard user privileges' } },
                    { UserControls: {} }
                  ]
                }
              },
              'guest': {
                div: {
                  className: 'guest-view',
                  children: [
                    { h2: { text: '👀 Guest View' } },
                    { p: { text: 'Limited access only' } }
                  ]
                }
              }
            },
            default: {
              div: {
                className: 'unknown-role',
                text: '❓ Unknown role - please contact administrator'
              }
            }
          }
        }
      ]
    }
  })
});

// Function-based switch values
const StatusSwitch = (props, { getState }) => ({
  render: () => ({
    Switch: {
      value: () => {
        const loading = getState('api.loading', false);
        const error = getState('api.error', null);
        if (loading) return 'loading';
        if (error) return 'error';
        return 'success';
      },
      cases: {
        'loading': { LoadingSpinner: {} },
        'error': { ErrorMessage: { error: () => getState('api.error') } },
        'success': { DataDisplay: {} }
      }
    }
  })
});`;

	const forExample = `// 3. For Component - Iterate Over Arrays with Performance Optimization
const UserList = (props, { getState, setState }) => ({
  render: () => ({
    div: {
      children: [
        {
          button: {
            text: 'Add User',
            onclick: () => {
              const users = getState('users.list', []);
              const newUser = {
                id: Date.now(),
                name: \`User \${users.length + 1}\`,
                email: \`user\${users.length + 1}@example.com\`,
                isOnline: Math.random() > 0.5
              };
              setState('users.list', [...users, newUser]);
            }
          }
        },
        {
          For: {
            items: 'users.list',  // State path to array
            render: (user, index) => ({
              div: {
                className: 'user-card',
                key: user.id,  // Automatically added for performance
                children: [
                  { h4: { text: user.name } },
                  { p: { text: user.email } },
                  { 
                    span: { 
                      className: user.isOnline ? 'online' : 'offline',
                      text: user.isOnline ? 'Online' : 'Offline' 
                    } 
                  }
                ]
              }
            }),
            keyPath: 'id',  // Custom key path (default: 'id')
            emptyContent: {
              div: {
                className: 'empty-state',
                children: [
                  { h3: { text: 'No users found' } },
                  { p: { text: 'Click "Add User" to get started!' } }
                ]
              }
            },
            loadingContent: {
              div: { className: 'loading', text: 'Loading users...' }
            },
            loading: 'users.loading'
          }
        }
      ]
    }
  })
});

// Function-based items
const DynamicList = (props, { getState }) => ({
  render: () => ({
    For: {
      items: () => {
        const search = getState('ui.searchTerm', '');
        const allItems = getState('data.items', []);
        return search 
          ? allItems.filter(item => item.name.includes(search))
          : allItems;
      },
      render: (item) => ({ ItemCard: { item } }),
      keyPath: (item, index) => \`\${item.category}-\${item.id}\`
    }
  })
});

// Performance Optimization with "ignore"
// The For component automatically optimizes by returning "ignore" 
// when array length hasn't changed, preserving DOM structure`;

	const portalExample = `// 4. Portal Component - Render Content Outside Component Tree
const Modal = (props, { getState, setState }) => ({
  render: () => ({
    div: {
      children: [
        {
          button: {
            text: 'Open Modal',
            onclick: () => setState('ui.showModal', true)
          }
        },
        {
          Conditional: {
            condition: 'ui.showModal',
            then: {
              Portal: {
                target: '#modal-root',  // CSS selector or DOM element
                children: {
                  div: {
                    className: 'modal-overlay',
                    onclick: () => setState('ui.showModal', false),
                    children: [
                      {
                        div: {
                          className: 'modal-content',
                          onclick: (e) => e.stopPropagation(),
                          children: [
                            { h2: { text: 'Modal Title' } },
                            { p: { text: 'This content is rendered in #modal-root!' } },
                            {
                              button: {
                                text: 'Close',
                                onclick: () => setState('ui.showModal', false)
                              }
                            }
                          ]
                        }
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      ]
    }
  })
});

// Portal to different targets
const NotificationSystem = (props, context) => ({
  render: () => ({
    Portal: {
      target: document.body,  // Direct DOM reference
      children: {
        div: {
          className: 'notification-container',
          children: [
            {
              For: {
                items: 'notifications.list',
                render: (notification) => ({
                  div: {
                    className: 'notification',
                    children: [
                      { span: { text: notification.message } },
                      {
                        button: {
                          text: '×',
                          onclick: () => {
                            // Remove notification logic
                          }
                        }
                      }
                    ]
                  }
                })
              }
            }
          ]
        }
      }
    }
  })
});

// Multiple portals
const MultiPortalExample = () => ({
  render: () => ({
    div: {
      children: [
        {
          Portal: {
            target: '#header-actions',
            children: { HeaderButton: { text: 'Portal Action' } }
          }
        },
        {
          Portal: {
            target: '#sidebar-widgets',
            children: { SidebarWidget: { title: 'Portal Widget' } }
          }
        }
      ]
    }
  })
});`;

	const fragmentExample = `// 5. Fragment Component - Group Children Without Wrapper
const CardContent = (props, context) => ({
  render: () => ({
    div: {
      className: 'card',
      children: [
        {
          Fragment: {
            children: [
              { h3: { text: props.title } },
              { p: { text: props.description } },
              {
                Fragment: {
                  children: [
                    { span: { text: 'Tags: ' } },
                    {
                      For: {
                        items: () => props.tags || [],
                        render: (tag) => ({
                          span: { className: 'tag', text: tag }
                        })
                      }
                    }
                  ]
                }
              }
            ]
          }
        },
        { div: { className: 'card-actions', children: [/* actions */] } }
      ]
    }
  })
});

// Fragment vs Regular Div Comparison
const WithoutFragment = () => ({
  render: () => ({
    div: {
      className: 'container',
      children: [
        {
          div: {  // Extra wrapper div
            children: [
              { h1: { text: 'Title' } },
              { p: { text: 'Content' } }
            ]
          }
        }
      ]
    }
  })
});

const WithFragment = () => ({
  render: () => ({
    div: {
      className: 'container', 
      children: [
        {
          Fragment: {  // No wrapper div in DOM
            children: [
              { h1: { text: 'Title' } },
              { p: { text: 'Content' } }
            ]
          }
        }
      ]
    }
  })
});

// Conditional fragments
const ConditionalFragment = (props, { getState }) => ({
  render: () => ({
    div: {
      children: [
        { h1: { text: 'Always shown' } },
        {
          Conditional: {
            condition: 'user.showDetails',
            then: {
              Fragment: {
                children: [
                  { h2: { text: 'User Details' } },
                  { p: { text: 'Email: user@example.com' } },
                  { p: { text: 'Role: Administrator' } }
                ]
              }
            }
          }
        }
      ]
    }
  })
});`;

	const guardExample = `// 6. Guard Component - Permission-Based Access Control
const PermissionGuard = (props, { getState, setState }) => ({
  render: () => ({
    div: {
      children: [
        {
          div: {
            className: 'permission-controls',
            children: [
              {
                button: {
                  text: 'Grant Admin',
                  onclick: () => setState('auth.permissions', ['read', 'write', 'admin'])
                }
              },
              {
                button: {
                  text: 'Grant Write',
                  onclick: () => setState('auth.permissions', ['read', 'write'])
                }
              },
              {
                button: {
                  text: 'Read Only',
                  onclick: () => setState('auth.permissions', ['read'])
                }
              },
              {
                button: {
                  text: 'No Access',
                  onclick: () => setState('auth.permissions', [])
                }
              }
            ]
          }
        },
        {
          Guard: {
            permissions: ['admin'],  // Required permissions
            requireAll: true,        // Must have ALL permissions (default: true)
            children: {
              div: {
                className: 'admin-panel',
                children: [
                  { h3: { text: '🔐 Admin Panel' } },
                  { p: { text: 'Top secret admin content!' } },
                  { button: { text: 'Delete Everything' } }
                ]
              }
            },
            fallback: {
              div: {
                className: 'access-denied',
                children: [
                  { h3: { text: '🚫 Access Denied' } },
                  { p: { text: 'You need admin permissions to view this content.' } }
                ]
              }
            }
          }
        }
      ]
    }
  })
});

// Multiple permission scenarios
const PermissionMatrix = (props, { getState }) => ({
  render: () => ({
    div: {
      children: [
        {
          Guard: {
            permissions: ['read', 'write'],
            requireAll: false,  // Need ANY of these permissions
            children: { EditableContent: {} },
            fallback: { ReadOnlyMessage: {} }
          }
        },
        {
          Guard: {
            permissions: ['admin', 'moderator'],
            requireAll: false,
            children: { ModerationTools: {} }
          }
        },
        {
          Guard: {
            permissions: ['read', 'write', 'admin'],
            requireAll: true,  // Need ALL permissions
            children: { SuperAdminPanel: {} },
            fallback: { InsufficientPermissions: {} }
          }
        }
      ]
    }
  })
});

// Custom permission logic
const CustomGuard = (props, { getState }) => ({
  render: () => ({
    Guard: {
      permissions: () => {
        const user = getState('auth.user');
        const isOwner = user && user.id === props.resourceOwnerId;
        const hasPermission = getState('auth.permissions', []).includes('admin');
        return isOwner || hasPermission;
      },
      children: { ProtectedResource: props },
      fallback: { AccessDenied: { resource: props.resourceType } }
    }
  })
});`;

	const suspenseExample = `// 7. Suspense Component - Handle Loading States and Errors
const DataLoader = (props, { getState, setState }) => ({
  hooks: {
    onMount: async () => {
      setState('suspense.loading', true);
      setState('suspense.error', null);
      
      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 2000));
        const data = { users: ['Alice', 'Bob', 'Charlie'] };
        setState('data.users', data.users);
      } catch (error) {
        setState('suspense.error', error.message);
      } finally {
        setState('suspense.loading', false);
      }
    }
  },
  
  render: () => ({
    div: {
      children: [
        {
          button: {
            text: 'Reload Data',
            onclick: () => {
              setState('suspense.loading', true);
              setState('suspense.error', null);
              
              // Simulate random success/failure
              setTimeout(() => {
                if (Math.random() > 0.7) {
                  setState('suspense.error', 'Network timeout');
                } else {
                  setState('data.users', ['Alice', 'Bob', 'Charlie', 'David']);
                }
                setState('suspense.loading', false);
              }, 1500);
            }
          }
        },
        {
          Suspense: {
            loading: {
              div: {
                className: 'loading-state',
                children: [
                  { div: { className: 'spinner' } },
                  { p: { text: 'Loading user data...' } }
                ]
              }
            },
            error: (error) => ({
              div: {
                className: 'error-state',
                children: [
                  { h3: { text: '❌ Error Loading Data' } },
                  { p: { text: \`Error: \${error}\` } },
                  {
                    button: {
                      text: 'Retry',
                      onclick: () => {
                        setState('suspense.loading', true);
                        setState('suspense.error', null);
                      }
                    }
                  }
                ]
              }
            }),
            children: {
              div: {
                children: [
                  { h3: { text: 'User Data Loaded Successfully!' } },
                  {
                    For: {
                      items: 'data.users',
                      render: (user) => ({
                        div: { className: 'user-item', text: user }
                      })
                    }
                  }
                ]
              }
            }
          }
        }
      ]
    }
  })
});

// Nested suspense boundaries
const NestedSuspense = () => ({
  render: () => ({
    Suspense: {
      loading: { div: { text: 'Loading app...' } },
      children: {
        div: {
          children: [
            { Header: {} },
            {
              Suspense: {
                loading: { div: { text: 'Loading content...' } },
                error: (error) => ({ ErrorDisplay: { error } }),
                children: { MainContent: {} }
              }
            },
            { Footer: {} }
          ]
        }
      }
    }
  })
});`;

	const errorBoundaryExample = `// 8. ErrorBoundary Component - Catch and Handle Errors
const ErrorProneComponent = (props, { setState }) => ({
  render: () => ({
    div: {
      children: [
        {
          button: {
            text: 'Trigger Error',
            onclick: () => {
              // Simulate an error
              setState('errorBoundary.error', new Error('Something went wrong!'));
            }
          }
        },
        {
          button: {
            text: 'Clear Error',
            onclick: () => setState('errorBoundary.error', null)
          }
        },
        {
          ErrorBoundary: {
            fallback: (error) => ({
              div: {
                className: 'error-boundary',
                children: [
                  { h3: { text: '💥 Component Error' } },
                  { p: { text: \`Error: \${error.message}\` } },
                  { p: { text: 'The component has crashed but the app continues running.' } },
                  {
                    button: {
                      text: 'Reset Component',
                      onclick: () => setState('errorBoundary.error', null)
                    }
                  }
                ]
              }
            }),
            children: {
              div: {
                className: 'working-component',
                children: [
                  { h3: { text: '✅ Working Component' } },
                  { p: { text: 'This component is working normally.' } },
                  { RiskyOperation: {} }
                ]
              }
            }
          }
        }
      ]
    }
  })
});

// Multiple error boundaries
const AppWithErrorBoundaries = () => ({
  render: () => ({
    div: {
      children: [
        {
          ErrorBoundary: {
            fallback: (error) => ({ HeaderError: { error } }),
            children: { Header: {} }
          }
        },
        {
          ErrorBoundary: {
            fallback: (error) => ({ SidebarError: { error } }),
            children: { Sidebar: {} }
          }
        },
        {
          ErrorBoundary: {
            fallback: (error) => ({ MainContentError: { error } }),
            children: { MainContent: {} }
          }
        }
      ]
    }
  })
});

// Error boundary with retry logic
const RetryableErrorBoundary = (props, { getState, setState }) => ({
  render: () => ({
    ErrorBoundary: {
      fallback: (error) => ({
        div: {
          className: 'retryable-error',
          children: [
            { h3: { text: 'Component Failed' } },
            { p: { text: error.message } },
            {
              p: {
                text: () => {
                  const attempts = getState('error.retryAttempts', 0);
                  return \`Retry attempts: \${attempts}\`;
                }
              }
            },
            {
              button: {
                text: 'Retry',
                onclick: () => {
                  const attempts = getState('error.retryAttempts', 0);
                  setState('error.retryAttempts', attempts + 1);
                  setState('errorBoundary.error', null);
                }
              }
            }
          ]
        }
      }),
      children: props.children
    }
  })
});`;

	const showExample = `// 9. Show Component - CSS Display Control
const VisibilityDemo = (props, { getState, setState }) => ({
  render: () => ({
    div: {
      children: [
        {
          button: {
            text: () => getState('ui.showContent') ? 'Hide Content' : 'Show Content',
            onclick: () => {
              const current = getState('ui.showContent', false);
              setState('ui.showContent', !current);
            }
          }
        },
        {
          Show: {
            when: 'ui.showContent',  // State path or function
            children: {
              div: {
                className: 'revealable-content',
                style: {
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  padding: '20px',
                  borderRadius: '10px',
                  animation: 'fadeIn 0.3s ease'
                },
                children: [
                  { h3: { text: '👁️ Now You See Me!' } },
                  { p: { text: 'This content appears and disappears with CSS display control.' } },
                  { p: { text: 'Unlike Conditional, the component stays mounted in DOM.' } }
                ]
              }
            }
          }
        },
        {
          p: {
            style: { marginTop: '15px', textAlign: 'center' },
            children: [
              { strong: { text: 'Status: ' } },
              {
                span: {
                  style: () => ({
                    color: getState('ui.showContent') ? '#38a169' : '#e53e3e'
                  }),
                  text: () => getState('ui.showContent')
                    ? 'Content visible (display: block)'
                    : 'Content hidden (display: none)'
                }
              }
            ]
          }
        }
      ]
    }
  })
});

// Function-based visibility
const DynamicVisibility = (props, { getState }) => ({
  render: () => ({
    div: {
      children: [
        {
          Show: {
            when: () => {
              const user = getState('auth.user');
              const time = new Date().getHours();
              return user && (time >= 9 && time <= 17); // Business hours
            },
            children: { BusinessHoursContent: {} }
          }
        },
        {
          Show: {
            when: () => getState('user.preferences.showAdvanced', false),
            children: { AdvancedSettings: {} }
          }
        }
      ]
    }
  })
});

// Show vs Conditional Comparison
// Show: Uses CSS display, component stays mounted
// Conditional: Completely mounts/unmounts component

const ShowVsConditional = (props, { getState }) => ({
  render: () => ({
    div: {
      children: [
        {
          h4: { text: 'Show Component (stays mounted):' }
        },
        {
          Show: {
            when: 'demo.visible',
            children: { ExpensiveComponent: {} }  // Stays in DOM when hidden
          }
        },
        {
          h4: { text: 'Conditional Component (mounts/unmounts):' }
        },
        {
          Conditional: {
            condition: 'demo.visible',
            then: { ExpensiveComponent: {} }  // Completely removed from DOM when hidden
          }
        }
      ]
    }
  })
});`;

	const matchExample = `// 10. Match Component - Pattern Matching with Multiple Conditions
const StatusMatcher = (props, { getState, setState }) => ({
  render: () => ({
    div: {
      children: [
        {
          div: {
            className: 'status-controls',
            children: [
              {
                button: {
                  text: 'Loading',
                  onclick: () => {
                    setState('api.loading', true);
                    setState('api.error', null);
                    setState('api.data', null);
                  }
                }
              },
              {
                button: {
                  text: 'Success',
                  onclick: () => {
                    setState('api.loading', false);
                    setState('api.error', null);
                    setState('api.data', { users: ['Alice', 'Bob'] });
                  }
                }
              },
              {
                button: {
                  text: 'Error',
                  onclick: () => {
                    setState('api.loading', false);
                    setState('api.error', 'Network timeout');
                    setState('api.data', null);
                  }
                }
              }
            ]
          }
        },
        {
          Match: {
            cases: [
              {
                when: 'api.loading',
                render: {
                  div: {
                    className: 'loading-state',
                    children: [
                      { div: { className: 'spinner' } },
                      { p: { text: 'Loading data...' } }
                    ]
                  }
                }
              },
              {
                when: 'api.error',
                render: {
                  div: {
                    className: 'error-state',
                    children: [
                      { h3: { text: '❌ Error' } },
                      { p: { text: () => \`Error: \${getState('api.error')}\` } }
                    ]
                  }
                }
              },
              {
                when: 'api.data',
                render: {
                  div: {
                    className: 'success-state',
                    children: [
                      { h3: { text: '✅ Data Loaded' } },
                      { p: { text: () => \`Found \${getState('api.data.users', []).length} users\` } }
                    ]
                  }
                }
              }
            ],
            default: {
              div: {
                className: 'idle-state',
                text: '⏳ Waiting for action...'
              }
            }
          }
        }
      ]
    }
  })
});

// Complex pattern matching with functions
const AdvancedMatcher = (props, { getState }) => ({
  render: () => ({
    Match: {
      cases: [
        {
          when: () => {
            const user = getState('auth.user');
            return user && user.role === 'admin';
          },
          render: { AdminInterface: {} }
        },
        {
          when: () => {
            const user = getState('auth.user');
            const subscription = getState('user.subscription');
            return user && subscription && subscription.plan === 'premium';
          },
          render: { PremiumInterface: {} }
        },
        {
          when: () => getState('auth.user') !== null,
          render: { StandardInterface: {} }
        }
      ],
      default: { LoginInterface: {} }
    }
  })
});

// Nested matching
const NestedMatcher = (props, { getState }) => ({
  render: () => ({
    Match: {
      cases: [
        {
          when: 'user.isLoggedIn',
          render: {
            Match: {
              cases: [
                {
                  when: () => getState('user.profile.isComplete'),
                  render: { Dashboard: {} }
                },
                {
                  when: () => !getState('user.profile.isComplete'),
                  render: { ProfileSetup: {} }
                }
              ]
            }
          }
        }
      ],
      default: { LoginForm: {} }
    }
  })
});`;

	const repeatExample = `// 11. Repeat Component - Generate Elements by Count
const StarRating = (props, { getState, setState }) => ({
  render: () => ({
    div: {
      children: [
        {
          div: {
            className: 'rating-controls',
            children: [
              {
                input: {
                  type: 'range',
                  min: '0',
                  max: '5',
                  value: () => getState('demo.rating', 3),
                  oninput: (e) => setState('demo.rating', parseInt(e.target.value))
                }
              },
              {
                span: {
                  text: () => \` Rating: \${getState('demo.rating', 3)}/5\`
                }
              }
            ]
          }
        },
        {
          div: {
            className: 'star-display',
            children: [
              {
                Repeat: {
                  times: 5,  // Fixed number
                  render: (index) => ({
                    span: {
                      className: () => {
                        const rating = getState('demo.rating', 3);
                        return index < rating ? 'star filled' : 'star empty';
                      },
                      text: '★',
                      style: {
                        fontSize: '2rem',
                        color: () => {
                          const rating = getState('demo.rating', 3);
                          return index < rating ? '#ffd700' : '#e2e8f0';
                        },
                        cursor: 'pointer'
                      },
                      onclick: () => setState('demo.rating', index + 1)
                    }
                  })
                }
              }
            ]
          }
        }
      ]
    }
  })
});

// Dynamic repeat count
const DynamicDots = (props, { getState, setState }) => ({
  render: () => ({
    div: {
      children: [
        {
          div: {
            children: [
              {
                button: {
                  text: '+',
                  onclick: () => {
                    const current = getState('ui.dotCount', 3);
                    setState('ui.dotCount', Math.min(current + 1, 10));
                  }
                }
              },
              {
                span: {
                  text: () => \` Dots: \${getState('ui.dotCount', 3)} \`,
                  style: { margin: '0 10px' }
                }
              },
              {
                button: {
                  text: '-',
                  onclick: () => {
                    const current = getState('ui.dotCount', 3);
                    setState('ui.dotCount', Math.max(current - 1, 0));
                  }
                }
              }
            ]
          }
        },
        {
          div: {
            style: { marginTop: '20px' },
            children: [
              {
                Repeat: {
                  times: () => getState('ui.dotCount', 3),  // Dynamic count
                  render: (index) => ({
                    div: {
                      style: {
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        backgroundColor: \`hsl(\${index * 60}, 70%, 60%)\`,
                        display: 'inline-block',
                        margin: '5px',
                        animation: \`pulse \${1 + index * 0.2}s infinite\`
                      }
                    }
                  })
                }
              }
            ]
          }
        }
      ]
    }
  })
});

// Complex repeat patterns
const ProgressBar = (props, { getState }) => ({
  render: () => ({
    div: {
      className: 'progress-container',
      children: [
        {
          Repeat: {
            times: 10,
            render: (index) => ({
              div: {
                className: 'progress-segment',
                style: () => {
                  const progress = getState('ui.progress', 0);
                  const isActive = (index + 1) * 10 <= progress;
                  return {
                    width: '30px',
                    height: '20px',
                    backgroundColor: isActive ? '#4ade80' : '#e5e7eb',
                    display: 'inline-block',
                    margin: '2px',
                    borderRadius: '4px',
                    transition: 'background-color 0.3s ease'
                  };
                }
              }
            })
          }
        }
      ]
    }
  })
});`;

	const awaitExample = `// 12. Await Component - Handle Promise-Based Operations
const AsyncDataLoader = (props, { getState, setState }) => ({
  render: () => ({
    div: {
      children: [
        {
          button: {
            text: 'Load Data',
            onclick: () => {
              // Trigger a new promise
              const promise = new Promise((resolve, reject) => {
                setTimeout(() => {
                  if (Math.random() > 0.3) {
                    resolve({ users: ['Alice', 'Bob', 'Charlie'], timestamp: Date.now() });
                  } else {
                    reject(new Error('Failed to load data'));
                  }
                }, 2000);
              });
              
              setState('async.promise', promise);
            }
          }
        },
        {
          Await: {
            promise: () => getState('async.promise'),  // Promise from state
            loading: {
              div: {
                className: 'loading-async',
                children: [
                  { div: { className: 'spinner' } },
                  { p: { text: 'Loading async data...' } },
                  { p: { text: 'This may take a few seconds.' } }
                ]
              }
            },
            then: (data) => ({
              div: {
                className: 'async-success',
                children: [
                  { h3: { text: '✅ Data Loaded Successfully!' } },
                  { p: { text: \`Loaded at: \${new Date(data.timestamp).toLocaleTimeString()}\` } },
                  {
                    ul: {
                      children: data.users.map(user => ({
                        li: { text: user }
                      }))
                    }
                  }
                ]
              }
            }),
            error: (error) => ({
              div: {
                className: 'async-error',
                children: [
                  { h3: { text: '❌ Loading Failed' } },
                  { p: { text: \`Error: \${error.message}\` } },
                  {
                    button: {
                      text: 'Try Again',
                      onclick: () => setState('async.promise', null)
                    }
                  }
                ]
              }
            })
          }
        }
      ]
    }
  })
});

// Function-based promises
const DynamicAwait = (props, { getState }) => ({
  render: () => ({
    Await: {
      promise: () => {
        const userId = getState('user.selectedId');
        if (!userId) return null;
        
        return fetch(\`/api/users/\${userId}\`)
          .then(response => response.json());
      },
      loading: { UserSkeleton: {} },
      then: (userData) => ({ UserProfile: { user: userData } }),
      error: (error) => ({ UserError: { error } })
    }
  })
});

// Chained async operations
const ChainedOperations = (props, context) => ({
  render: () => ({
    Await: {
      promise: () => {
        return fetch('/api/auth/token')
          .then(response => response.json())
          .then(tokenData => {
            return fetch('/api/user/profile', {
              headers: { Authorization: \`Bearer \${tokenData.token}\` }
            });
          })
          .then(response => response.json());
      },
      loading: { div: { text: 'Authenticating and loading profile...' } },
      then: (profile) => ({ UserDashboard: { profile } }),
      error: (error) => ({ AuthError: { error } })
    }
  })
});

// Multiple concurrent operations
const ConcurrentAwait = (props, context) => ({
  render: () => ({
    div: {
      children: [
        {
          Await: {
            promise: () => Promise.all([
              fetch('/api/users').then(r => r.json()),
              fetch('/api/posts').then(r => r.json()),
              fetch('/api/comments').then(r => r.json())
            ]),
            loading: { div: { text: 'Loading all data...' } },
            then: ([users, posts, comments]) => ({
              div: {
                children: [
                  { UsersList: { users } },
                  { PostsList: { posts } },
                  { CommentsList: { comments } }
                ]
              }
            }),
            error: (error) => ({ LoadingError: { error } })
          }
        }
      ]
    }
  })
});`;

	const dynamicExample = `// 13. Dynamic Component - Load Components by Name
const DynamicWidgetLoader = (props, { getState, setState }) => ({
  render: () => ({
    div: {
      children: [
        {
          div: {
            className: 'widget-selector',
            children: [
              {
                button: {
                  text: 'Chart Widget',
                  onclick: () => setState('ui.currentWidget', 'ChartWidget')
                }
              },
              {
                button: {
                  text: 'Calendar Widget', 
                  onclick: () => setState('ui.currentWidget', 'CalendarWidget')
                }
              },
              {
                button: {
                  text: 'Todo Widget',
                  onclick: () => setState('ui.currentWidget', 'TodoWidget')
                }
              },
              {
                button: {
                  text: 'Clear Widget',
                  onclick: () => setState('ui.currentWidget', null)
                }
              }
            ]
          }
        },
        {
          div: {
            className: 'widget-container',
            children: [
              {
                Dynamic: {
                  component: 'ui.currentWidget',  // State path to component name
                  props: {
                    title: 'Dynamic Widget',
                    data: () => getState('widgets.data')
                  },
                  fallback: {
                    div: {
                      className: 'no-widget',
                      style: {
                        textAlign: 'center',
                        padding: '40px',
                        color: '#666',
                        border: '2px dashed #ccc',
                        borderRadius: '10px'
                      },
                      children: [
                        { h3: { text: '🎯 Dynamic Component Loader' } },
                        { p: { text: 'Select a widget above to load it dynamically!' } },
                        { p: { text: 'Components are loaded and instantiated at runtime.' } }
                      ]
                    }
                  }
                }
              }
            ]
          }
        }
      ]
    }
  })
});

// Function-based component selection
const ConditionalDynamic = (props, { getState }) => ({
  render: () => ({
    Dynamic: {
      component: () => {
        const userRole = getState('auth.role');
        const isOnline = getState('user.isOnline');
        
        if (userRole === 'admin') return 'AdminDashboard';
        if (userRole === 'user' && isOnline) return 'UserDashboard';
        if (userRole === 'user' && !isOnline) return 'OfflineMode';
        return 'GuestView';
      },
      props: {
        userId: () => getState('auth.userId'),
        permissions: () => getState('auth.permissions')
      }
    }
  })
});

// Route-based dynamic components
const Router = (props, { getState }) => ({
  render: () => ({
    Dynamic: {
      component: () => {
        const route = getState('router.currentRoute', '/');
        const routeMap = {
          '/': 'HomePage',
          '/about': 'AboutPage',
          '/contact': 'ContactPage',
          '/dashboard': 'DashboardPage',
          '/profile': 'ProfilePage'
        };
        return routeMap[route] || 'NotFoundPage';
      },
      props: {
        route: () => getState('router.currentRoute'),
        params: () => getState('router.params')
      },
      fallback: {
        div: {
          text: 'Loading page...',
          style: { textAlign: 'center', padding: '50px' }
        }
      }
    }
  })
});

// Plugin system with dynamic components
const PluginManager = (props, { getState }) => ({
  render: () => ({
    div: {
      children: [
        {
          For: {
            items: 'plugins.enabled',
            render: (plugin) => ({
              div: {
                className: 'plugin-container',
                children: [
                  { h4: { text: plugin.name } },
                  {
                    Dynamic: {
                      component: plugin.componentName,
                      props: plugin.config,
                      fallback: {
                        div: {
                          text: \`Plugin "\${plugin.name}" failed to load\`,
                          className: 'plugin-error'
                        }
                      }
                    }
                  }
                ]
              }
            })
          }
        }
      ]
    }
  })
});

// Widget system with lazy loading
const LazyWidgetLoader = (props, { getState, setState }) => ({
  render: () => ({
    Dynamic: {
      component: () => {
        const widgetName = getState('ui.selectedWidget');
        
        // Simulate lazy loading
        if (widgetName && !getState(\`widgets.loaded.\${widgetName}\`)) {
          setState(\`widgets.loaded.\${widgetName}\`, true);
          console.log(\`Lazy loading widget: \${widgetName}\`);
        }
        
        return widgetName;
      },
      props: {
        isLazyLoaded: true,
        loadedAt: () => Date.now()
      }
    }
  })
});`;

	const performanceExample = `// Performance Optimization Patterns for Control Components

// 1. For Component Optimization with "ignore"
const OptimizedList = (props, { getState, setState }) => ({
  render: () => ({
    For: {
      items: 'users.list',
      render: (user, index) => ({
        div: {
          className: 'user-item',
          children: [
            { span: { text: user.name } },
            { span: { text: user.email } }
          ]
        }
      }),
      keyPath: 'id',  // Stable keys for performance
      // When array length doesn't change, For returns "ignore"
      // This preserves DOM structure and avoids re-rendering
    }
  })
});

// 2. Conditional vs Show Performance
const PerformanceComparison = (props, { getState }) => ({
  render: () => ({
    div: {
      children: [
        // Use Conditional for expensive components that should unmount
        {
          Conditional: {
            condition: 'ui.showExpensiveComponent',
            then: { ExpensiveDataVisualization: {} }  // Unmounts when hidden
          }
        },
        
        // Use Show for components that should stay mounted
        {
          Show: {
            when: 'ui.showCachedComponent',
            children: { CachedUserProfile: {} }  // Stays mounted, just hidden
          }
        }
      ]
    }
  })
});

// 3. Memoized Dynamic Components
const MemoizedDynamic = (props, { getState, setState }) => ({
  render: () => ({
    Dynamic: {
      component: () => {
        const componentName = getState('ui.component');
        const lastComponent = getState('ui.lastComponent');
        
        // Only update if component actually changed
        if (componentName !== lastComponent) {
          setState('ui.lastComponent', componentName);
        }
        
        return componentName;
      },
      props: {
        // Pass stable props to avoid unnecessary re-renders
        staticData: props.staticData,
        dynamicData: () => getState('component.data')
      }
    }
  })
});

// 4. Efficient State Management
const EfficientStateUpdates = (props, { getState, setState }) => ({
  render: () => ({
    div: {
      children: [
        {
          For: {
            items: 'todos.list',
            render: (todo, index) => ({
              div: {
                children: [
                  {
                    input: {
                      type: 'checkbox',
                      checked: todo.completed,
                      onchange: (e) => {
                        // Update individual item instead of entire array
                        setState(\`todos.list.\${index}.completed\`, e.target.checked);
                      }
                    }
                  },
                  { span: { text: todo.text } }
                ]
              }
            })
          }
        }
      ]
    }
  })
});`;

	const bestPracticesExample = `// Best Practices for Control Flow Components

// 1. Choose the Right Component
const ComponentSelection = () => ({
  render: () => ({
    div: {
      children: [
        // Use Conditional for mount/unmount behavior
        {
          Conditional: {
            condition: 'user.hasSubscription',
            then: { PremiumFeatures: {} },      // Unmounted when condition false
            else: { SubscriptionPrompt: {} }
          }
        },
        
        // Use Show for visibility toggle (stays mounted)
        {
          Show: {
            when: 'ui.showDetails',
            children: { UserDetails: {} }       // Hidden but stays in DOM
          }
        },
        
        // Use Switch for multiple exclusive states
        {
          Switch: {
            value: 'app.state',
            cases: {
              'loading': { LoadingScreen: {} },
              'error': { ErrorScreen: {} },
              'success': { MainContent: {} }
            }
          }
        },
        
        // Use Match for complex pattern matching
        {
          Match: {
            cases: [
              { when: () => complexCondition1(), render: { Component1: {} } },
              { when: () => complexCondition2(), render: { Component2: {} } }
            ],
            default: { DefaultComponent: {} }
          }
        }
      ]
    }
  })
});

// 2. State Organization
const WellOrganizedState = (props, { getState, setState }) => ({
  render: () => ({
    div: {
      children: [
        // Organize state by domain
        {
          Guard: {
            permissions: () => getState('auth.permissions', []),
            children: { ProtectedContent: {} }
          }
        },
        {
          For: {
            items: 'data.users.list',      // Clear hierarchy
            loading: 'data.users.loading',
            render: (user) => ({ UserCard: { user } })
          }
        }
      ]
    }
  })
});

// 3. Error Handling Strategy
const RobustErrorHandling = () => ({
  render: () => ({
    ErrorBoundary: {
      fallback: (error) => ({ AppError: { error } }),
      children: {
        div: {
          children: [
            {
              ErrorBoundary: {
                fallback: (error) => ({ SidebarError: { error } }),
                children: { Sidebar: {} }
              }
            },
            {
              ErrorBoundary: {
                fallback: (error) => ({ ContentError: { error } }),
                children: {
                  Suspense: {
                    loading: { ContentSkeleton: {} },
                    error: (error) => ({ ContentLoadError: { error } }),
                    children: { MainContent: {} }
                  }
                }
              }
            }
          ]
        }
      }
    }
  })
});

// 4. Composition Patterns
const ComposedComponents = () => ({
  render: () => ({
    div: {
      children: [
        // Nest components logically
        {
          Guard: {
            permissions: ['read'],
            children: {
              Suspense: {
                loading: { DataSkeleton: {} },
                children: {
                  Conditional: {
                    condition: 'data.hasItems',
                    then: {
                      For: {
                        items: 'data.items',
                        render: (item) => ({ DataItem: { item } })
                      }
                    },
                    else: { EmptyState: {} }
                  }
                }
              }
            },
            fallback: { AccessDenied: {} }
          }
        }
      ]
    }
  })
});

// 5. Avoid Common Pitfalls
const AvoidPitfalls = (props, { getState, setState }) => ({
  render: () => ({
    div: {
      children: [
        // ❌ Don't do this - creates new array every render
        // {
        //   For: {
        //     items: () => getState('data.items', []).filter(item => item.active),
        //     render: (item) => ({ Item: { item } })
        //   }
        // },
        
        // ✅ Do this - compute filtered items in state
        {
          For: {
            items: 'data.filteredItems',  // Pre-computed in state
            render: (item) => ({ Item: { item } })
          }
        },
        
        // ❌ Don't nest too deeply
        // {
        //   Conditional: {
        //     condition: 'a',
        //     then: {
        //       Conditional: {
        //         condition: 'b',
        //         then: {
        //           Conditional: {
        //             condition: 'c',
        //             then: { Component: {} }
        //           }
        //         }
        //       }
        //     }
        //   }
        // },
        
        // ✅ Use Match or compute condition
        {
          Match: {
            cases: [
              {
                when: () => getState('a') && getState('b') && getState('c'),
                render: { Component: {} }
              }
            ]
          }
        }
      ]
    }
  })
});`;

	return {
		render: () => ({
			div: {
				children: [
					{
						h1: {
							className: 'page-title',
							text: 'Control Flow Components'
						}
					},
					{
						p: {
							className: 'page-subtitle',
							text: 'Comprehensive guide to all control flow components in Juris - manage conditional rendering, loops, async operations, and component composition.'
						}
					},

					// Overview Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Control Flow Overview',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Control flow components manage how and when other components are rendered. They handle conditional logic, loops, async operations, error boundaries, and dynamic component loading.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
											gap: '1rem',
											marginBottom: '2rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔀 Conditional Logic' } },
														{ p: { text: 'Conditional, Switch, Match, Guard - control what renders based on state and conditions.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔄 Iteration' } },
														{ p: { text: 'For, Repeat - render lists and repeated elements with performance optimization.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '⚡ Async Operations' } },
														{ p: { text: 'Await, Suspense - handle promises, loading states, and async data.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🛡️ Error Handling' } },
														{ p: { text: 'ErrorBoundary, Suspense - catch errors and provide fallback UI.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🎯 Dynamic Loading' } },
														{ p: { text: 'Dynamic, Portal - load components by name and render outside tree.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '👁️ Visibility Control' } },
														{ p: { text: 'Show, Fragment - control visibility and DOM structure.' } }
													]
												}
											}
										]
									}
								}
							]
						}
					},

					// 1. Conditional Component
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '1. Conditional Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Renders content conditionally based on state or function results. Components are completely mounted/unmounted based on the condition.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
											gap: '1rem',
											marginBottom: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '✅ When to Use' } },
														{ p: { text: 'Simple show/hide logic, login states, feature flags, permission-based content.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔧 Key Features' } },
														{ p: { text: 'Mount/unmount behavior, else clauses, function conditions, nested conditionals.' } }
													]
												}
											}
										]
									}
								},
								{
									CodeBlock: {
										title: 'Conditional Component Usage',
										language: 'javascript',
										code: conditionalExample
									}
								}
							]
						}
					},

					// 2. Switch Component  
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '2. Switch Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Handles multiple exclusive conditions, like a switch statement. Perfect for user roles, app states, and multi-option scenarios.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
											gap: '1rem',
											marginBottom: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '✅ When to Use' } },
														{ p: { text: 'User roles, app states, themes, multiple exclusive options.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔧 Key Features' } },
														{ p: { text: 'Multiple cases, default fallback, value functions, clean syntax.' } }
													]
												}
											}
										]
									}
								},
								{
									CodeBlock: {
										title: 'Switch Component Usage',
										language: 'javascript',
										code: switchExample
									}
								}
							]
						}
					},

					// 3. For Component
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '3. For Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Iterates over arrays with built-in performance optimization. Includes loading states, empty states, and automatic "ignore" optimization.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
											gap: '1rem',
											marginBottom: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '✅ When to Use' } },
														{ p: { text: 'Render lists, user lists, data tables, any array iteration.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔧 Key Features' } },
														{ p: { text: 'Performance optimization, custom keys, loading/empty states, "ignore" behavior.' } }
													]
												}
											}
										]
									}
								},
								{
									CodeBlock: {
										title: 'For Component Usage',
										language: 'javascript',
										code: forExample
									}
								}
							]
						}
					},

					// 4. Portal Component
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '4. Portal Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Renders content outside the normal component tree into any DOM element. Perfect for modals, tooltips, and overlays.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
											gap: '1rem',
											marginBottom: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '✅ When to Use' } },
														{ p: { text: 'Modals, tooltips, notifications, dropdowns, overlays.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔧 Key Features' } },
														{ p: { text: 'Custom targets, DOM escape, lifecycle management, multiple portals.' } }
													]
												}
											}
										]
									}
								},
								{
									CodeBlock: {
										title: 'Portal Component Usage',
										language: 'javascript',
										code: portalExample
									}
								}
							]
						}
					},

					// 5. Fragment Component
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '5. Fragment Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Groups multiple children without adding an extra wrapper element to the DOM. Keeps HTML structure clean.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
											gap: '1rem',
											marginBottom: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '✅ When to Use' } },
														{ p: { text: 'Avoid wrapper divs, clean HTML structure, conditional groups.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔧 Key Features' } },
														{ p: { text: 'No DOM wrapper, group children, conditional fragments.' } }
													]
												}
											}
										]
									}
								},
								{
									CodeBlock: {
										title: 'Fragment Component Usage',
										language: 'javascript',
										code: fragmentExample
									}
								}
							]
						}
					},

					// 6. Guard Component
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '6. Guard Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Permission-based access control component. Shows content only if user has required permissions, with customizable fallback.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
											gap: '1rem',
											marginBottom: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '✅ When to Use' } },
														{ p: { text: 'User permissions, role-based access, feature flags, security.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔧 Key Features' } },
														{ p: { text: 'Permission arrays, requireAll/requireAny, fallback content.' } }
													]
												}
											}
										]
									}
								},
								{
									CodeBlock: {
										title: 'Guard Component Usage',
										language: 'javascript',
										code: guardExample
									}
								}
							]
						}
					},

					// 7. Suspense Component
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '7. Suspense Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Handles loading states and errors during async operations. Shows loading UI while waiting and error UI when things fail.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
											gap: '1rem',
											marginBottom: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '✅ When to Use' } },
														{ p: { text: 'Data loading, API calls, async operations, loading screens.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔧 Key Features' } },
														{ p: { text: 'Loading states, error handling, nested boundaries, retry logic.' } }
													]
												}
											}
										]
									}
								},
								{
									CodeBlock: {
										title: 'Suspense Component Usage',
										language: 'javascript',
										code: suspenseExample
									}
								}
							]
						}
					},

					// 8. ErrorBoundary Component
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '8. ErrorBoundary Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Catches JavaScript errors anywhere in the component tree and displays fallback UI instead of crashing the entire app.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
											gap: '1rem',
											marginBottom: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '✅ When to Use' } },
														{ p: { text: 'Component isolation, error recovery, app stability, debugging.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔧 Key Features' } },
														{ p: { text: 'Error catching, fallback UI, multiple boundaries, retry mechanisms.' } }
													]
												}
											}
										]
									}
								},
								{
									CodeBlock: {
										title: 'ErrorBoundary Component Usage',
										language: 'javascript',
										code: errorBoundaryExample
									}
								}
							]
						}
					},

					// 9. Show Component
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '9. Show Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Controls visibility with CSS display property. Unlike Conditional, components stay mounted but are hidden/shown.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
											gap: '1rem',
											marginBottom: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '✅ When to Use' } },
														{ p: { text: 'Toggle visibility, maintain state, expensive components, animations.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔧 Key Features' } },
														{ p: { text: 'CSS display control, keeps components mounted, function conditions.' } }
													]
												}
											}
										]
									}
								},
								{
									CodeBlock: {
										title: 'Show Component Usage',
										language: 'javascript',
										code: showExample
									}
								}
							]
						}
					},

					// 10. Match Component
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '10. Match Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Advanced pattern matching with multiple function-based conditions. More flexible than Switch for complex scenarios.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
											gap: '1rem',
											marginBottom: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '✅ When to Use' } },
														{ p: { text: 'Complex conditions, pattern matching, multiple criteria, advanced logic.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔧 Key Features' } },
														{ p: { text: 'Function conditions, ordered evaluation, default fallback, flexible patterns.' } }
													]
												}
											}
										]
									}
								},
								{
									CodeBlock: {
										title: 'Match Component Usage',
										language: 'javascript',
										code: matchExample
									}
								}
							]
						}
					},

					// 11. Repeat Component
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '11. Repeat Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Generates a specific number of elements. Perfect for stars, ratings, pagination, or any count-based rendering.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
											gap: '1rem',
											marginBottom: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '✅ When to Use' } },
														{ p: { text: 'Star ratings, pagination dots, progress bars, grid layouts.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔧 Key Features' } },
														{ p: { text: 'Count-based rendering, index access, dynamic counts, custom patterns.' } }
													]
												}
											}
										]
									}
								},
								{
									CodeBlock: {
										title: 'Repeat Component Usage',
										language: 'javascript',
										code: repeatExample
									}
								}
							]
						}
					},

					// 12. Await Component
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '12. Await Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Handles Promise-based async operations with loading, success, and error states. Perfect for API calls and async data loading.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
											gap: '1rem',
											marginBottom: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '✅ When to Use' } },
														{ p: { text: 'API calls, async data loading, promise handling, async operations.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔧 Key Features' } },
														{ p: { text: 'Promise handling, loading/error/success states, data passing.' } }
													]
												}
											}
										]
									}
								},
								{
									CodeBlock: {
										title: 'Await Component Usage',
										language: 'javascript',
										code: awaitExample
									}
								}
							]
						}
					},

					// 13. Dynamic Component
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: '13. Dynamic Component',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Loads and renders components dynamically by name. Essential for plugin systems, routing, and widget management.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
											gap: '1rem',
											marginBottom: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '✅ When to Use' } },
														{ p: { text: 'Widget systems, routing, plugin architecture, dynamic loading.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔧 Key Features' } },
														{ p: { text: 'Component name resolution, prop passing, fallback content, lazy loading.' } }
													]
												}
											}
										]
									}
								},
								{
									CodeBlock: {
										title: 'Dynamic Component Usage',
										language: 'javascript',
										code: dynamicExample
									}
								}
							]
						}
					},

					// Performance Optimization Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Performance Optimization',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Control flow components include several performance optimizations to ensure smooth rendering and minimal re-computation.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Performance Patterns',
										language: 'javascript',
										code: performanceExample
									}
								}
							]
						}
					},

					// Best Practices Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Best Practices',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Follow these patterns for optimal performance, maintainability, and user experience when using control flow components.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Best Practice Patterns',
										language: 'javascript',
										code: bestPracticesExample
									}
								}
							]
						}
					},

					// Component Comparison Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Component Comparison Guide',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
											gap: '1rem',
											marginTop: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔀 Conditional vs Show' } },
														{ p: { text: 'Conditional: Mount/unmount behavior, better for expensive components' } },
														{ p: { text: 'Show: CSS display control, preserves state and DOM position' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔄 Switch vs Match' } },
														{ p: { text: 'Switch: Simple value-based switching, clean syntax' } },
														{ p: { text: 'Match: Complex pattern matching, function-based conditions' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '⚡ Await vs Suspense' } },
														{ p: { text: 'Await: Promise-specific, handles single async operations' } },
														{ p: { text: 'Suspense: General loading states, can handle multiple sources' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔄 For vs Repeat' } },
														{ p: { text: 'For: Array iteration, data-driven rendering' } },
														{ p: { text: 'Repeat: Count-based rendering, number-driven generation' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🛡️ Guard vs Conditional' } },
														{ p: { text: 'Guard: Permission-specific, reads from auth.permissions' } },
														{ p: { text: 'Conditional: General purpose, any state or condition' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🎯 Portal vs Fragment' } },
														{ p: { text: 'Portal: Renders outside parent DOM tree' } },
														{ p: { text: 'Fragment: Groups children without wrapper in same tree' } }
													]
												}
											}
										]
									}
								}
							]
						}
					},

					// Summary Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Control Flow Components Summary',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									div: {
										className: 'card',
										style: {
											background: 'linear-gradient(135deg, #fff8f5 0%, #ffffff 100%)',
											border: '1px solid var(--orange-pale)',
											padding: '2rem'
										},
										children: [
											{
												p: {
													text: 'Juris control flow components provide a complete toolkit for managing conditional rendering, iteration, async operations, and component composition. Each component is optimized for specific use cases while maintaining consistent APIs and performance characteristics. Choose the right component for your scenario to build robust, maintainable applications.',
													style: {
														fontSize: '1.1rem',
														fontWeight: '500',
														textAlign: 'center',
														color: 'var(--gray-700)',
														margin: '0'
													}
												}
											}
										]
									}
								}
							]
						}
					}
				]
			}
		})
	};
};
const DocsHeadless = (props, context) => {
	const basicHeadlessExample = `// Basic Headless Component Structure
const DataManager = (props, context) => {
  const { getState, setState, subscribe } = context;
  
  return {
    // Lifecycle hooks for headless components
    hooks: {
      onRegister: () => {
        console.log('📦 DataManager registered');
        // Initialize subscriptions, start services, setup data
        initializeDataSources();
      },
      
      onUnregister: () => {
        console.log('🧹 DataManager cleanup');
        // Cleanup subscriptions, stop services, clear timers
        cleanup();
      }
    },
    
    // Public API for other components to use
    api: {
      loadUser: async (userId) => {
        setState('api.loading', true);
        try {
          const user = await fetch(\`/api/users/\${userId}\`);
          setState('users.current', user);
        } catch (error) {
          setState('api.error', error.message);
        } finally {
          setState('api.loading', false);
        }
      },
      
      refreshData: () => {
        // Refresh all data sources
        loadInitialData();
      }
    }
    
    // No render method - headless components don't render UI
  };

  function initializeDataSources() {
    // Setup initial data loading
    subscribe('auth.user.id', (userId) => {
      if (userId) {
        loadUserData(userId);
      }
    });
  }
  
  function cleanup() {
    // Cleanup any resources
  }
};

// Register as headless component
const juris = new Juris({
  headlessComponents: {
    DataManager: { fn: DataManager, options: { autoInit: true } }
  }
});`;

	const headlessVsUIExample = `// Headless Component (Business Logic Only)
const AuthManager = (props, context) => {
  const { getState, setState, subscribe } = context;
  
  return {
    hooks: {
      onRegister: () => {
        // Initialize auth state
        checkExistingAuth();
        setupTokenRefresh();
      }
    },
    
    api: {
      login: async (email, password) => {
        setState('auth.loading', true);
        try {
          const response = await fetch('/api/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
          });
          const { token, user } = await response.json();
          
          setState('auth.token', token);
          setState('auth.user', user);
          setState('auth.isLoggedIn', true);
        } catch (error) {
          setState('auth.error', error.message);
        } finally {
          setState('auth.loading', false);
        }
      },
      
      logout: () => {
        setState('auth.token', null);
        setState('auth.user', null);
        setState('auth.isLoggedIn', false);
        localStorage.removeItem('authToken');
      }
    }
    
    // No render method - pure business logic
  };
};

// UI Component (Presentation Only)
const LoginForm = (props, { getState, setState, AuthManager }) => {
  
  return {
    render: () => ({
      form: {
        className: 'login-form',
        onsubmit: (e) => {
          e.preventDefault();
          const email = getState('form.login.email', '');
          const password = getState('form.login.password', '');
          
          // Call headless component API directly
          AuthManager.login(email, password);
        },
        children: [
          {
            input: {
              type: 'email',
              placeholder: 'Email',
              value: () => getState('form.login.email', ''),
              oninput: (e) => setState('form.login.email', e.target.value)
            }
          },
          {
            input: {
              type: 'password',
              placeholder: 'Password',
              value: () => getState('form.login.password', ''),
              oninput: (e) => setState('form.login.password', e.target.value)
            }
          },
          {
            button: {
              type: 'submit',
              text: () => getState('auth.loading') ? 'Logging in...' : 'Login',
              disabled: () => getState('auth.loading', false)
            }
          },
          {
            div: {
              className: 'error-message',
              text: () => getState('auth.error', ''),
              style: () => ({
                display: getState('auth.error') ? 'block' : 'none'
              })
            }
          }
        ]
      }
    })
  };
};`;

	const realTimeServicesExample = `// Real-Time Services with Headless Components

const WebSocketManager = (props, context) => {
  const { getState, setState } = context;
  let ws = null;
  let reconnectTimer = null;
  
  return {
    hooks: {
      onRegister: () => {
        console.log('🔌 WebSocket service starting...');
        connect();
      },
      
      onUnregister: () => {
        console.log('🔌 WebSocket service stopping...');
        disconnect();
      }
    },
    
    api: {
      send: (message) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
        } else {
          console.warn('WebSocket not connected');
        }
      },
      
      getConnectionStatus: () => getState('websocket.status', 'disconnected')
    }
  };

  function connect() {
    const wsUrl = getState('config.websocketUrl', 'ws://localhost:8080');
    
    setState('websocket.status', 'connecting');
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('✅ WebSocket connected');
      setState('websocket.status', 'connected');
      setState('websocket.error', null);
      
      // Clear any reconnection timer
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleMessage(data);
      } catch (error) {
        console.error('Invalid WebSocket message:', event.data);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setState('websocket.error', 'Connection error');
    };
    
    ws.onclose = () => {
      console.log('🔌 WebSocket disconnected');
      setState('websocket.status', 'disconnected');
      
      // Auto-reconnect after 3 seconds
      reconnectTimer = setTimeout(() => {
        console.log('🔄 Attempting to reconnect...');
        connect();
      }, 3000);
    };
  }
  
  function disconnect() {
    if (ws) {
      ws.close();
      ws = null;
    }
    
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }
  
  function handleMessage(data) {
    switch (data.type) {
      case 'user_update':
        setState(\`users.\${data.userId}\`, data.user);
        break;
      case 'notification':
        const notifications = getState('notifications.list', []);
        setState('notifications.list', [...notifications, data.notification]);
        break;
      case 'system_status':
        setState('system.status', data.status);
        break;
    }
  }
};

const NotificationManager = (props, context) => {
  const { getState, setState, subscribe } = context;
  
  return {
    hooks: {
      onRegister: () => {
        // Subscribe to new notifications
        subscribe('notifications.list', handleNewNotifications);
        
        // Request notification permission
        if ('Notification' in window) {
          Notification.requestPermission();
        }
      }
    },
    
    api: {
      showNotification: (title, options = {}) => {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(title, options);
        }
      },
      
      markAsRead: (notificationId) => {
        const notifications = getState('notifications.list', []);
        const updated = notifications.map(n => 
          n.id === notificationId ? { ...n, read: true } : n
        );
        setState('notifications.list', updated);
      },
      
      clearAll: () => {
        setState('notifications.list', []);
      }
    }
  };
  
  function handleNewNotifications(notifications) {
    const unread = notifications.filter(n => !n.read);
    
    // Show browser notification for latest unread
    if (unread.length > 0) {
      const latest = unread[unread.length - 1];
      context.headless.NotificationManager.showNotification(
        latest.title, 
        { body: latest.message, icon: '/icon.png' }
      );
    }
    
    // Update unread count
    setState('notifications.unreadCount', unread.length);
  }
};`;

	const dataManagerExample = `// Data Management with Headless Components

const ApiManager = (props, context) => {
  const { getState, setState, subscribe } = context;
  const requestQueue = [];
  let isProcessing = false;
  
  return {
    hooks: {
      onRegister: () => {
        console.log('🌐 API Manager initialized');
        
        // Setup request interceptors
        setupInterceptors();
        
        // Subscribe to auth changes to update headers
        subscribe('auth.token', updateAuthHeaders);
      }
    },
    
    api: {
      get: (url, options = {}) => request('GET', url, null, options),
      post: (url, data, options = {}) => request('POST', url, data, options),
      put: (url, data, options = {}) => request('PUT', url, data, options),
      delete: (url, options = {}) => request('DELETE', url, null, options),
      
      // Batch requests
      batch: (requests) => {
        return Promise.all(requests.map(req => 
          request(req.method, req.url, req.data, req.options)
        ));
      },
      
      // Cached requests
      getCached: async (url, maxAge = 300000) => { // 5 minutes default
        const cacheKey = \`cache.\${url}\`;
        const cached = getState(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < maxAge) {
          return cached.data;
        }
        
        const data = await request('GET', url);
        setState(cacheKey, { data, timestamp: Date.now() });
        return data;
      }
    }
  };

  async function request(method, url, data = null, options = {}) {
    const requestId = generateRequestId();
    
    // Add to loading state
    setState(\`api.loading.\${requestId}\`, true);
    
    try {
      const token = getState('auth.token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token && { Authorization: \`Bearer \${token}\` }),
        ...options.headers
      };
      
      const config = {
        method,
        headers,
        ...(data && { body: JSON.stringify(data) })
      };
      
      const response = await fetch(url, config);
      
      if (!response.ok) {
        throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
      }
      
      const result = await response.json();
      
      // Clear any previous errors for this endpoint
      setState(\`api.errors.\${url}\`, null);
      
      return result;
      
    } catch (error) {
      console.error(\`API Error [\${method} \${url}]:\`, error);
      setState(\`api.errors.\${url}\`, error.message);
      throw error;
      
    } finally {
      setState(\`api.loading.\${requestId}\`, false);
    }
  }
  
  function setupInterceptors() {
    // Could setup global request/response interceptors here
  }
  
  function updateAuthHeaders(token) {
    // Headers are updated per request, no global state needed
    console.log('🔑 Auth token updated for API requests');
  }
  
  function generateRequestId() {
    return Math.random().toString(36).substring(2, 15);
  }
};

const CacheManager = (props, context) => {
  const { getState, setState } = context;
  
  return {
    hooks: {
      onRegister: () => {
        // Cleanup expired cache entries every 5 minutes
        setInterval(cleanupExpiredCache, 300000);
      }
    },
    
    api: {
      set: (key, value, ttl = 300000) => { // 5 minutes default
        setState(\`cache.\${key}\`, {
          data: value,
          expires: Date.now() + ttl
        });
      },
      
      get: (key) => {
        const cached = getState(\`cache.\${key}\`);
        if (!cached) return null;
        
        if (Date.now() > cached.expires) {
          setState(\`cache.\${key}\`, null);
          return null;
        }
        
        return cached.data;
      },
      
      clear: (pattern) => {
        if (pattern) {
          // Clear specific pattern
          const cache = getState('cache', {});
          Object.keys(cache).forEach(key => {
            if (key.includes(pattern)) {
              setState(\`cache.\${key}\`, null);
            }
          });
        } else {
          // Clear all cache
          setState('cache', {});
        }
      },
      
      getStats: () => {
        const cache = getState('cache', {});
        const entries = Object.values(cache).filter(Boolean);
        return {
          totalEntries: entries.length,
          totalSize: JSON.stringify(cache).length,
          oldestEntry: Math.min(...entries.map(e => e.expires))
        };
      }
    }
  };
  
  function cleanupExpiredCache() {
    const cache = getState('cache', {});
    const now = Date.now();
    let cleaned = 0;
    
    Object.entries(cache).forEach(([key, value]) => {
      if (value && value.expires < now) {
        setState(\`cache.\${key}\`, null);
        cleaned++;
      }
    });
    
    if (cleaned > 0) {
      console.log(\`🧹 Cleaned \${cleaned} expired cache entries\`);
    }
  }
};`;

	const deviceServicesExample = `// Device Services with Headless Components

const GeolocationManager = (props, context) => {
  const { getState, setState } = context;
  let watchId = null;
  
  return {
    hooks: {
      onRegister: () => {
        console.log('📍 Geolocation service starting...');
        
        // Check if geolocation is supported
        setState('geolocation.isSupported', 'geolocation' in navigator);
        
        // Auto-start if configured
        if (props.autoStart !== false) {
          getCurrentPosition();
        }
      },
      
      onUnregister: () => {
        if (watchId !== null) {
          navigator.geolocation.clearWatch(watchId);
          watchId = null;
        }
      }
    },
    
    api: {
      getCurrentPosition: () => getCurrentPosition(),
      startWatching: () => startWatching(),
      stopWatching: () => stopWatching(),
      
      calculateDistance: (lat1, lon1, lat2, lon2) => {
        // Haversine formula
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
      }
    }
  };

  function getCurrentPosition() {
    if (!getState('geolocation.isSupported')) {
      setState('geolocation.error', 'Geolocation not supported');
      return;
    }
    
    setState('geolocation.loading', true);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState('geolocation.position', {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        });
        setState('geolocation.loading', false);
        setState('geolocation.error', null);
      },
      (error) => {
        setState('geolocation.error', error.message);
        setState('geolocation.loading', false);
      },
      {
        enableHighAccuracy: props.enableHighAccuracy !== false,
        timeout: props.timeout || 15000,
        maximumAge: props.maximumAge || 300000
      }
    );
  }
  
  function startWatching() {
    if (watchId !== null) return; // Already watching
    
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        setState('geolocation.position', {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        });
        setState('geolocation.isWatching', true);
      },
      (error) => {
        setState('geolocation.error', error.message);
      }
    );
  }
  
  function stopWatching() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
      setState('geolocation.isWatching', false);
    }
  }
};

const DeviceDetector = (props, context) => {
  const { setState } = context;
  
  return {
    hooks: {
      onRegister: () => {
        console.log('📱 Device detection starting...');
        
        updateDeviceInfo();
        
        // Listen for orientation and resize changes
        window.addEventListener('resize', debounce(updateDeviceInfo, 100));
        window.addEventListener('orientationchange', updateDeviceInfo);
      },
      
      onUnregister: () => {
        window.removeEventListener('resize', updateDeviceInfo);
        window.removeEventListener('orientationchange', updateDeviceInfo);
      }
    },
    
    api: {
      getDeviceInfo: () => getState('device', {}),
      forceUpdate: () => updateDeviceInfo()
    }
  };

  function updateDeviceInfo() {
    const deviceInfo = {
      width: window.innerWidth,
      height: window.innerHeight,
      isMobile: window.innerWidth < 768,
      isTablet: window.innerWidth >= 768 && window.innerWidth < 1024,
      isDesktop: window.innerWidth >= 1024,
      orientation: window.innerHeight > window.innerWidth ? 'portrait' : 'landscape',
      pixelRatio: window.devicePixelRatio || 1,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      isTouchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      timestamp: Date.now()
    };
    
    setState('device', deviceInfo);
    console.log('📱 Device info updated:', deviceInfo);
  }
  
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
};`;

	const headlessAPIExample = `// Accessing Headless Component APIs

// Method 1: Direct destructuring from context (Recommended)
const UserProfile = (props, { getState, setState, DataManager, WebSocketManager, GeolocationManager }) => ({
  hooks: {
    onMount: () => {
      // Access headless component API directly
      const userId = getState('auth.user.id');
      if (userId) {
        DataManager.loadUser(userId);
      }
    }
  },
  
  render: () => ({
    div: {
      className: 'user-profile',
      children: [
        {
          button: {
            text: 'Refresh Data',
            onclick: () => {
              // Call headless API directly
              DataManager.refreshData();
            }
          }
        },
        {
          div: {
            className: 'connection-status',
            text: () => {
              const status = WebSocketManager.getConnectionStatus();
              return \`Connection: \${status}\`;
            }
          }
        },
        {
          div: {
            className: 'location-info',
            children: () => {
              const position = getState('geolocation.position');
              if (!position) return [{ span: { text: 'Location not available' } }];
              
              return [
                { p: { text: \`Lat: \${position.latitude}\` } },
                { p: { text: \`Lng: \${position.longitude}\` } },
                {
                  button: {
                    text: 'Get Current Location',
                    onclick: () => GeolocationManager.getCurrentPosition()
                  }
                }
              ];
            }
          }
        }
      ]
    }
  })
});

// Method 2: Access from full context object
const AlternativeComponent = (props, context) => {
  const { getState, setState, DataManager } = context;
  
  return {
    render: () => ({
      div: {
        text: 'Alternative access pattern',
        onclick: () => DataManager.refreshData()
      }
    })
  };
};

// From Other Headless Components
const AutoSaveManager = (props, { getState, setState, subscribe, ApiManager, NotificationManager }) => {
  let saveTimer = null;
  
  return {
    hooks: {
      onRegister: () => {
        // Subscribe to form changes
        subscribe('form', debounce(autoSave, 2000));
      }
    },
    
    api: {
      forceSave: () => saveNow(),
      enableAutoSave: () => setState('autosave.enabled', true),
      disableAutoSave: () => setState('autosave.enabled', false)
    }
  };

  async function autoSave() {
    const isEnabled = getState('autosave.enabled', true);
    if (!isEnabled) return;
    
    const formData = getState('form', {});
    
    try {
      // Use ApiManager headless component directly
      await ApiManager.post('/api/autosave', formData);
      setState('autosave.lastSaved', Date.now());
      
      // Use NotificationManager directly
      NotificationManager.showNotification(
        'Auto-saved', 
        { body: 'Your changes have been saved automatically' }
      );
    } catch (error) {
      setState('autosave.error', error.message);
    }
  }
  
  function saveNow() {
    if (saveTimer) clearTimeout(saveTimer);
    autoSave();
  }
  
  function debounce(func, wait) {
    return function executedFunction(...args) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => func(...args), wait);
    };
  }
};

// How Juris injects headless APIs into context:
// if (instance.api) {
//     this.context[name] = instance.api;
// }
// 
// This means headless component APIs become direct properties of context,
// accessible through destructuring or direct property access.`;

	return {
		render: () => ({
			div: {
				children: [
					{
						h1: {
							className: 'page-title',
							text: 'Headless Components'
						}
					},
					{
						p: {
							className: 'page-subtitle',
							text: 'Business logic components without UI - the foundation for services, data management, and background processing in Juris applications.'
						}
					},

					// What are Headless Components Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'What are Headless Components?',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Headless components contain business logic without any UI rendering. They handle services, data management, API calls, real-time connections, and background processing while UI components focus purely on presentation.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
											gap: '1rem',
											marginBottom: '2rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🧠 Pure Logic' } },
														{ p: { text: 'No render method - only business logic, state management, and services.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔄 Background Services' } },
														{ p: { text: 'Handle API calls, WebSockets, timers, and other background processing.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔗 Public APIs' } },
														{ p: { text: 'Expose methods that UI components can call to trigger actions.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '♻️ Lifecycle Hooks' } },
														{ p: { text: 'Use onRegister/onUnregister for setup and cleanup.' } }
													]
												}
											}
										]
									}
								}
							]
						}
					},

					// Basic Structure Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Basic Headless Component Structure',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Headless components follow a specific structure with lifecycle hooks and public APIs, but no render method.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Headless Component Pattern',
										language: 'javascript',
										code: basicHeadlessExample
									}
								}
							]
						}
					},

					// Headless Component Registration Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Headless Component Registration',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Register headless components in the Juris configuration object. Each headless component can have options like autoInit to control when it starts.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Registration Patterns',
										language: 'javascript',
										code: `// Basic Registration
const juris = new Juris({
  // Regular UI components
  components: {
    UserProfile,
    ProductList,
    Navigation
  },
  
  // Headless components with configuration
  headlessComponents: {
    // Auto-initialize on app start
    UrlStateSync: { fn: UrlStateSync, options: { autoInit: true } },
    SecurityManager: { fn: SecurityManager, options: { autoInit: true } },
    DeviceManager: { fn: DeviceManager, options: { autoInit: true } },
    GeolocationManager: { fn: GeolocationManager, options: { autoInit: true } },
    
    // Manual initialization (autoInit: false or omitted)
    ApiManager: { fn: ApiManager, options: { autoInit: false } },
    DataCache: { fn: DataCache }, // autoInit defaults to false
    
    // With custom options passed to component
    WebSocketManager: { 
      fn: WebSocketManager, 
      options: { 
        autoInit: true,
        url: 'wss://api.example.com/ws',
        reconnectInterval: 3000,
        maxRetries: 5
      }
    },
    
    NotificationManager: {
      fn: NotificationManager,
      options: {
        autoInit: true,
        requestPermission: true,
        defaultIcon: '/icon.png'
      }
    }
  },
  
  layout: {
    div: { children: [{ App: {} }] }
  }
});

// Registration Options Explained:
// - fn: The headless component function
// - options.autoInit: Whether to call onRegister immediately (default: false)
// - options.*: Any custom options passed to component as props

// Manual Registration (after app initialization)
juris.registerHeadlessComponent('CustomService', CustomService, {
  autoInit: true,
  customOption: 'value'
});

// Accessing registered headless components
// They become available in context automatically:
const SomeComponent = (props, { DataManager, ApiManager, WebSocketManager }) => ({
  render: () => ({
    div: {
      text: 'All headless components available via context destructuring'
    }
  })
});`
									}
								}
							]
						}
					},

					// Accessing Headless Components Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'How to Access Headless Components',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Headless component APIs are injected directly into the context object, making them accessible through destructuring or direct property access.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Access Patterns',
										language: 'javascript',
										code: `// Method 1: Direct destructuring from context (Recommended)
const UserProfile = (props, { getState, setState, DataManager, ApiManager }) => ({
  hooks: {
    onMount: () => {
      const userId = getState('auth.user.id');
      if (userId) {
        DataManager.loadUser(userId); // Direct access
      }
    }
  },
  
  render: () => ({
    button: {
      text: 'Refresh Data',
      onclick: () => DataManager.refreshData() // Direct API call
    }
  })
});

// Method 2: Destructure from full context object
const UserProfile = (props, context) => {
  const { getState, setState, DataManager } = context;
  
  return {
    render: () => ({
      button: {
        text: 'Load Data',
        onclick: () => DataManager.loadUser(123)
      }
    })
  };
};

// Method 3: Access directly from context (less preferred)
const UserProfile = (props, context) => {
  const { getState, setState } = context;

  return {
    render: () => ({
      button: {
        text: 'Refresh',
        onclick: () => context.DataManager.refreshData()
      }
    })
  };
};

// How Juris injects headless APIs:
// if (instance.api) {
//     this.context[name] = instance.api;
// }
// 
// This means each headless component's API becomes a direct property
// of the context object, accessible without nested paths.`
									}
								}
							]
						}
					},

					// Headless vs UI Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Headless vs UI Components',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Separation of concerns: headless components handle business logic while UI components handle presentation. This creates clean, testable, and reusable architecture.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Business Logic vs Presentation',
										language: 'javascript',
										code: headlessVsUIExample
									}
								}
							]
						}
					},

					// Real-Time Services Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Real-Time Services',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Headless components excel at managing real-time connections, notifications, and background services that need to run independently of UI state.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'WebSocket and Notification Services',
										language: 'javascript',
										code: realTimeServicesExample
									}
								}
							]
						}
					},

					// Data Management Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Data Management Services',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Handle API requests, caching, data synchronization, and other data-related operations in dedicated headless components.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'API and Cache Management',
										language: 'javascript',
										code: dataManagerExample
									}
								}
							]
						}
					},

					// Device Services Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Device and Browser Services',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Manage device capabilities like geolocation, device detection, and browser APIs through headless services.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Geolocation and Device Detection',
										language: 'javascript',
										code: deviceServicesExample
									}
								}
							]
						}
					},

					// API Access Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Accessing Headless Component APIs',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'UI components and other headless components can access headless APIs through the context or global juris instance.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'API Access Patterns',
										language: 'javascript',
										code: headlessAPIExample
									}
								}
							]
						}
					},

					// Key Benefits Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Core Benefits',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
											gap: '1rem',
											marginTop: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🎯 Separation of Concerns' } },
														{ p: { text: 'Clean separation between business logic and presentation layer. Easier testing and maintenance.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '♻️ Reusability' } },
														{ p: { text: 'Business logic can be reused across different UI implementations or even different applications.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔄 Background Processing' } },
														{ p: { text: 'Services run independently of UI lifecycle. Perfect for WebSockets, polling, and background tasks.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🧪 Easier Testing' } },
														{ p: { text: 'Test business logic without UI concerns. Mock headless components for UI testing.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '📦 Service Architecture' } },
														{ p: { text: 'Build service-oriented architecture with clean API boundaries between components.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '⚡ Performance' } },
														{ p: { text: 'No render overhead. Services run efficiently without DOM concerns.' } }
													]
												}
											}
										]
									}
								}
							]
						}
					},

					// Best Practices Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Best Practices',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
											gap: '1rem',
											marginTop: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔄 Use onRegister/onUnregister' } },
														{ p: { text: 'Always use proper lifecycle hooks for setup and cleanup. Never use onMount/onUnmount in headless components.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🎯 Single Responsibility' } },
														{ p: { text: 'Each headless component should handle one specific domain or service area.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔗 Clear APIs' } },
														{ p: { text: 'Expose well-defined public APIs that other components can reliably use.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🛡️ Error Handling' } },
														{ p: { text: 'Handle errors gracefully and update state to inform UI components of error conditions.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🧹 Resource Cleanup' } },
														{ p: { text: 'Always clean up timers, intervals, event listeners, and connections in onUnregister.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '📊 State Organization' } },
														{ p: { text: 'Use domain-based state paths that match your headless component responsibilities.' } }
													]
												}
											}
										]
									}
								}
							]
						}
					},

					// Summary Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Headless Components Summary',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									div: {
										className: 'card',
										style: {
											background: 'linear-gradient(135deg, #fff8f5 0%, #ffffff 100%)',
											border: '1px solid var(--orange-pale)',
											padding: '2rem'
										},
										children: [
											{
												p: {
													text: 'Headless components are the backbone of Juris applications - handling all business logic, services, and background processing without UI concerns. They provide clean separation of concerns, excellent testability, and enable building robust service-oriented architectures.',
													style: {
														fontSize: '1.1rem',
														fontWeight: '500',
														textAlign: 'center',
														color: 'var(--gray-700)',
														margin: '0'
													}
												}
											}
										]
									}
								}
							]
						}
					}
				]
			}
		})
	};
};

const DocsIntro = (props, context) => {
	const basicExample = `const App = (props, context) => {
  const { getState, setState } = context;
  
  return {
    render: () => ({
      div: {
        children: [
          { h1: { text: 'Hello World' } },
          {
            button: {
              text: () => \`Clicked \${getState('count', 0)} times\`,
              onclick: () => setState('count', getState('count', 0) + 1)
            }
          }
        ]
      }
    })
  };
};

const juris = new Juris({
  components: { App },
  layout: { App: {} }
});

juris.render('#app');`;

	const objectDomBasics = `// Object DOM Syntax: { tagName: { properties } }

// Basic element
{ div: { text: 'Hello World' } }
// Renders: <div>Hello World</div>

// Element with attributes
{ 
  div: { 
    id: 'my-div',
    className: 'container',
    text: 'Content here'
  } 
}
// Renders: <div id="my-div" class="container">Content here</div>

// Element with children
{
  div: {
    className: 'parent',
    children: [
      { h1: { text: 'Title' } },
      { p: { text: 'Paragraph' } },
      { span: { text: 'Span content' } }
    ]
  }
}
// Renders:
// <div class="parent">
//   <h1>Title</h1>
//   <p>Paragraph</p>
//   <span>Span content</span>
// </div>`;

	const reactiveVsStatic = `// Static vs Reactive Values in Object DOM

// STATIC VALUES (don't change)
{
  div: {
    id: 'static-id',                    // Always 'static-id'
    className: 'always-blue',           // Always 'always-blue'
    text: 'Never changes'               // Always 'Never changes'
  }
}

// REACTIVE VALUES (update automatically)
{
  div: {
    id: () => \`user-\${getState('currentUser.id')}\`,           // Updates when user changes
    className: () => getState('ui.theme') === 'dark' ? 'dark' : 'light',  // Updates when theme changes
    text: () => \`Hello \${getState('user.name', 'Guest')}\`,              // Updates when name changes
    style: () => ({ 
      opacity: getState('ui.visible') ? 1 : 0,                   // Updates when visibility changes
      color: getState('ui.primaryColor', '#000')                 // Updates when color changes
    })
  }
}

// KEY PRINCIPLE: Functions = Reactive, Values = Static`;

	const attributesAndEvents = `// Object DOM Attributes and Events

{
  input: {
    // Standard HTML attributes
    type: 'text',
    id: 'username',
    className: 'form-input',
    placeholder: 'Enter username',
    required: true,
    disabled: false,
    
    // Reactive attributes
    value: () => getState('form.username', ''),
    className: () => getState('form.errors.username') ? 'form-input error' : 'form-input',
    
    // Event handlers (always functions)
    onclick: (e) => console.log('Input clicked'),
    oninput: (e) => setState('form.username', e.target.value),
    onfocus: (e) => setState('form.activeField', 'username'),
    onblur: (e) => setState('form.activeField', null),
    
    // Form events
    onchange: (e) => validateUsername(e.target.value),
    onkeydown: (e) => {
      if (e.key === 'Enter') {
        submitForm();
      }
    }
  }
}

// Common event patterns:
{
  button: {
    text: 'Submit',
    onclick: () => setState('form.submitted', true),
    ondblclick: () => setState('form.fastSubmit', true),
    onmouseenter: () => setState('ui.buttonHovered', true),
    onmouseleave: () => setState('ui.buttonHovered', false)
  }
}`;

	const childrenPatterns = `// Children Patterns in Object DOM

// 1. ARRAY OF ELEMENTS (most common)
{
  div: {
    children: [
      { h1: { text: 'Title' } },
      { p: { text: 'Paragraph 1' } },
      { p: { text: 'Paragraph 2' } }
    ]
  }
}

// 2. SINGLE CHILD ELEMENT
{
  div: {
    children: { p: { text: 'Single paragraph' } }
  }
}

// 3. REACTIVE CHILDREN (dynamic structure)
{
  div: {
    children: () => {
      const user = getState('auth.user');
      
      if (!user) {
        return [{ LoginForm: {} }];
      }
      
      return [
        { h1: { text: \`Welcome, \${user.name}\` } },
        { UserDashboard: {} },
        user.isAdmin ? { AdminPanel: {} } : null
      ].filter(Boolean);
    }
  }
}

// 4. MIXED STATIC AND REACTIVE
{
  div: {
    children: [
      { header: { text: 'Always visible header' } },  // Static
      () => {                                          // Reactive section
        const showContent = getState('ui.showContent');
        return showContent ? [
          { main: { children: [{ ContentArea: {} }] } },
          { sidebar: { children: [{ SidebarWidget: {} }] } }
        ] : [
          { div: { text: 'Content hidden', className: 'placeholder' } }
        ];
      },
      { footer: { text: 'Always visible footer' } }   // Static
    ]
  }
}`;

	const stylingPatterns = `// Styling in Object DOM

// 1. CSS CLASSES (recommended for static styles)
{
  div: {
    className: 'card shadow-lg rounded-md p-4'  // Static classes
  }
}

// 2. REACTIVE CSS CLASSES
{
  div: {
    className: () => {
      const theme = getState('ui.theme');
      const isActive = getState('component.isActive');
      
      const classes = ['base-component'];
      if (theme === 'dark') classes.push('dark-theme');
      if (isActive) classes.push('active');
      
      return classes.join(' ');
    }
  }
}

// 3. INLINE STYLES (use sparingly, mainly for reactive values)
{
  div: {
    style: {
      position: 'relative',           // Static style
      zIndex: 10,                     // Static style
      width: '100%'                   // Static style
    }
  }
}

// 4. REACTIVE INLINE STYLES
{
  div: {
    style: () => ({
      opacity: getState('ui.visible') ? 1 : 0,
      transform: \`translateX(\${getState('ui.offset', 0)}px)\`,
      backgroundColor: getState('ui.theme') === 'dark' ? '#333' : '#fff',
      color: getState('ui.theme') === 'dark' ? '#fff' : '#333'
    })
  }
}

// 5. MIXED STYLING APPROACH (best practice)
{
  div: {
    className: 'card',  // Static base styles in CSS
    className: () => \`card \${getState('ui.theme')}\`,  // Add reactive classes
    style: () => ({
      // Only reactive styles inline
      opacity: getState('component.visible') ? 1 : 0
    })
  }
}`;

	const componentUsage = `// Using Components in Object DOM

// 1. SIMPLE COMPONENT USAGE
{
  div: {
    children: [
      { Header: {} },                    // Component with no props
      { UserProfile: { userId: 123 } }, // Component with static props
      { Footer: {} }
    ]
  }
}

// 2. COMPONENTS WITH REACTIVE PROPS
{
  div: {
    children: [
      {
        UserCard: {
          userId: () => getState('ui.selectedUser'),        // Reactive prop
          theme: () => getState('ui.theme'),                // Reactive prop
          showDetails: () => getState('ui.showUserDetails') // Reactive prop
        }
      }
    ]
  }
}

// 3. COMPONENTS WITH DOM OBJECT PROPS (powerful!)
{
  Modal: {
    isOpen: () => getState('modal.isOpen'),
    header: {
      div: {
        className: 'modal-header',
        children: [
          { h2: { text: 'Settings' } },
          { 
            button: { 
              text: '×', 
              onclick: () => setState('modal.isOpen', false) 
            } 
          }
        ]
      }
    },
    body: [
      { SettingsForm: {} },
      { PreferencesPanel: {} }
    ],
    footer: () => {
      const hasChanges = getState('settings.hasChanges');
      return {
        div: {
          className: 'modal-footer',
          children: hasChanges ? [
            { button: { text: 'Save', onclick: () => saveSettings() } },
            { button: { text: 'Cancel', onclick: () => cancelChanges() } }
          ] : [
            { button: { text: 'Close', onclick: () => closeModal() } }
          ]
        }
      };
    }
  }
}

// 4. CONDITIONAL COMPONENT RENDERING
{
  div: {
    children: () => {
      const userRole = getState('auth.user.role');
      const components = [{ PublicContent: {} }];
      
      if (userRole === 'user') {
        components.push({ UserDashboard: {} });
      }
      
      if (userRole === 'admin') {
        components.push({ UserDashboard: {} }, { AdminPanel: {} });
      }
      
      return components;
    }
  }
}`;

	const formExample = `// Complete Form Example with Object DOM

const ContactForm = (props, context) => {
  const { getState, setState } = context;
  
  return {
    render: () => ({
      form: {
        className: 'contact-form',
        onsubmit: (e) => {
          e.preventDefault();
          submitForm();
        },
        children: [
          {
            div: {
              className: 'form-group',
              children: [
                { 
                  label: { 
                    htmlFor: 'name',
                    text: 'Name:' 
                  } 
                },
                {
                  input: {
                    type: 'text',
                    id: 'name',
                    className: () => {
                      const error = getState('form.errors.name');
                      return error ? 'form-input error' : 'form-input';
                    },
                    value: () => getState('form.name', ''),
                    oninput: (e) => {
                      setState('form.name', e.target.value);
                      clearError('name');
                    },
                    placeholder: 'Enter your name'
                  }
                },
                {
                  div: {
                    className: 'error-message',
                    text: () => getState('form.errors.name', ''),
                    style: () => ({
                      display: getState('form.errors.name') ? 'block' : 'none'
                    })
                  }
                }
              ]
            }
          },
          {
            div: {
              className: 'form-group',
              children: [
                { 
                  label: { 
                    htmlFor: 'email',
                    text: 'Email:' 
                  } 
                },
                {
                  input: {
                    type: 'email',
                    id: 'email',
                    className: () => {
                      const error = getState('form.errors.email');
                      return error ? 'form-input error' : 'form-input';
                    },
                    value: () => getState('form.email', ''),
                    oninput: (e) => {
                      setState('form.email', e.target.value);
                      clearError('email');
                    },
                    placeholder: 'Enter your email'
                  }
                },
                {
                  div: {
                    className: 'error-message',
                    text: () => getState('form.errors.email', ''),
                    style: () => ({
                      display: getState('form.errors.email') ? 'block' : 'none'
                    })
                  }
                }
              ]
            }
          },
          {
            div: {
              className: 'form-actions',
              children: [
                {
                  button: {
                    type: 'submit',
                    className: 'btn btn-primary',
                    disabled: () => getState('form.submitting', false),
                    text: () => getState('form.submitting') ? 'Sending...' : 'Send Message'
                  }
                },
                {
                  button: {
                    type: 'button',
                    className: 'btn btn-secondary',
                    text: 'Clear',
                    onclick: () => clearForm()
                  }
                }
              ]
            }
          }
        ]
      }
    })
  };

  function submitForm() {
    // Form submission logic
  }

  function clearError(field) {
    setState(\`form.errors.\${field}\`, null);
  }

  function clearForm() {
    setState('form.name', '');
    setState('form.email', '');
    setState('form.errors', {});
  }
};`;

	return {
		render: () => ({
			div: {
				children: [
					{
						h1: {
							className: 'page-title',
							text: 'Getting Started'
						}
					},
					{
						p: {
							className: 'page-subtitle',
							text: 'Master Juris Object DOM syntax and reactive patterns for building modern web applications with pure JavaScript.'
						}
					},

					// Quick Start Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Quick Start',
										style: {
											marginBottom: '1rem',
											fontSize: '1.5rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Get started with Juris in minutes. No build tools, no configuration, just pure JavaScript.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Basic Application',
										language: 'javascript',
										code: basicExample
									}
								}
							]
						}
					},

					// Object DOM Basics Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Object DOM Syntax Basics',
										style: {
											marginBottom: '1rem',
											fontSize: '1.5rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Object DOM is Juris\'s revolutionary way to describe UI structure using pure JavaScript objects. No JSX, no templates, no compilation.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Object DOM Structure',
										language: 'javascript',
										code: objectDomBasics
									}
								}
							]
						}
					},

					// Reactive vs Static Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Reactive vs Static Values',
										style: {
											marginBottom: '1rem',
											fontSize: '1.5rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'The fundamental principle of Juris: Functions are reactive (update automatically), values are static (never change).',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Static vs Reactive Patterns',
										language: 'javascript',
										code: reactiveVsStatic
									}
								}
							]
						}
					},

					// Attributes and Events Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Attributes and Events',
										style: {
											marginBottom: '1rem',
											fontSize: '1.5rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Handle HTML attributes and DOM events naturally within Object DOM structure.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Attributes and Event Handlers',
										language: 'javascript',
										code: attributesAndEvents
									}
								}
							]
						}
					},

					// Children Patterns Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Children Patterns',
										style: {
											marginBottom: '1rem',
											fontSize: '1.5rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Master different approaches to rendering child elements, from static arrays to dynamic reactive structures.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Children Rendering Patterns',
										language: 'javascript',
										code: childrenPatterns
									}
								}
							]
						}
					},

					// Styling Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Styling Approaches',
										style: {
											marginBottom: '1rem',
											fontSize: '1.5rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Prefer CSS classes for static styles, use reactive inline styles only when values need to change dynamically.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Styling Best Practices',
										language: 'javascript',
										code: stylingPatterns
									}
								}
							]
						}
					},

					// Component Usage Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Component Usage',
										style: {
											marginBottom: '1rem',
											fontSize: '1.5rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Use components within Object DOM, including the revolutionary DOM objects as props pattern.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Component Composition',
										language: 'javascript',
										code: componentUsage
									}
								}
							]
						}
					},

					// Complete Example Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Complete Form Example',
										style: {
											marginBottom: '1rem',
											fontSize: '1.5rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'A comprehensive example showing Object DOM in action with forms, validation, and state management.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Real-World Form Component',
										language: 'javascript',
										code: formExample
									}
								}
							]
						}
					},

					// Key Principles Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Core Principles',
										style: {
											marginBottom: '1rem',
											fontSize: '1.5rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
											gap: '1.5rem',
											marginTop: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{
															h4: {
																text: '🎯 Object DOM Structure',
																style: { color: 'var(--orange)', marginBottom: '0.5rem' }
															}
														},
														{
															p: {
																text: '{ tagName: { properties } } - Pure JavaScript objects describe your entire UI structure.'
															}
														}
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{
															h4: {
																text: '⚡ Functions = Reactive',
																style: { color: 'var(--orange)', marginBottom: '0.5rem' }
															}
														},
														{
															p: {
																text: 'Use functions for values that should update automatically when state changes.'
															}
														}
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{
															h4: {
																text: '🔒 Values = Static',
																style: { color: 'var(--orange)', marginBottom: '0.5rem' }
															}
														},
														{
															p: {
																text: 'Use direct values for content that never changes during component lifetime.'
															}
														}
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{
															h4: {
																text: '🚫 No Build Tools',
																style: { color: 'var(--orange)', marginBottom: '0.5rem' }
															}
														},
														{
															p: {
																text: 'No JSX, no compilation, no transpilation. Just pure JavaScript that runs everywhere.'
															}
														}
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{
															h4: {
																text: '🎨 DOM Objects as Props',
																style: { color: 'var(--orange)', marginBottom: '0.5rem' }
															}
														},
														{
															p: {
																text: 'Pass entire UI structures as props for ultimate composition flexibility.'
															}
														}
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{
															h4: {
																text: '🔄 Automatic Dependencies',
																style: { color: 'var(--orange)', marginBottom: '0.5rem' }
															}
														},
														{
															p: {
																text: 'No manual subscriptions. Components automatically track exactly what state they access.'
															}
														}
													]
												}
											}
										]
									}
								}
							]
						}
					},

					// Next Steps Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Next Steps',
										style: {
											marginBottom: '1rem',
											fontSize: '1.5rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Now that you understand Object DOM basics, explore advanced topics:',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'next-steps-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
											gap: '1rem',
											marginTop: '1rem'
										},
										children: [
											{
												a: {
													href: '#/docs/components',
													className: 'card card-link',
													style: { textDecoration: 'none', color: 'inherit' },
													onclick: (e) => {
														e.preventDefault();
														window.location.hash = '/docs/components';
													},
													children: [
														{ h4: { text: '📦 Components' } },
														{ p: { text: 'Learn component lifecycle, composition, and advanced patterns.' } }
													]
												}
											},
											{
												a: {
													href: '#/docs/state',
													className: 'card card-link',
													style: { textDecoration: 'none', color: 'inherit' },
													onclick: (e) => {
														e.preventDefault();
														window.location.hash = '/docs/state';
													},
													children: [
														{ h4: { text: '🗃️ State Management' } },
														{ p: { text: 'Master reactive state with automatic dependency tracking.' } }
													]
												}
											},
											{
												a: {
													href: '#/docs/routing',
													className: 'card card-link',
													style: { textDecoration: 'none', color: 'inherit' },
													onclick: (e) => {
														e.preventDefault();
														window.location.hash = '/docs/routing';
													},
													children: [
														{ h4: { text: '🧭 Routing' } },
														{ p: { text: 'Build SPAs with client-side routing and navigation.' } }
													]
												}
											}
										]
									}
								}
							]
						}
					}
				]
			}
		})
	};
};

const DocsComponents = (props, context) => {
	const { getState } = context;

	// Code examples for each topic
	const componentExample = `const MyComponent = (props, context) => {
  return {
    hooks: {
      onMount: () => console.log('Component mounted'),
      onUnmount: () => console.log('Component unmounted')
    },
    
    render: () => ({
      div: {
        className: 'my-component',
        text: \`Hello \${props.name || 'World'}\`
      }
    })
  };
};`;

	const reactivePropsExample = `// Static vs Reactive Props
const UserCard = (props, context) => ({
  render: () => ({
    div: {
      className: 'user-card',
      children: [
        {
          // Static prop - won't change
          h3: { text: props.title }
        },
        {
          // Reactive prop - updates automatically
          p: { 
            text: () => {
              const userId = typeof props.userId === 'function' 
                ? props.userId() 
                : props.userId;
              return getState(\`users.\${userId}.name\`, 'Loading...');
            }
          }
        }
      ]
    }
  })
});

// Usage with reactive props:
{
  UserCard: {
    title: 'User Profile',                    // Static
    userId: () => getState('ui.selectedUser') // Reactive
  }
}`;

	const domPropsExample = `// DOM Objects as Props - Ultimate Composition
const Modal = (props, context) => ({
  render: () => ({
    div: {
      className: 'modal-overlay',
      children: [
        {
          div: {
            className: 'modal-content',
            children: [
              // Header can be any DOM structure
              props.header || { h2: { text: 'Default Title' } },
              
              // Body accepts arrays of DOM objects
              {
                div: {
                  className: 'modal-body',
                  children: Array.isArray(props.body) ? props.body : [props.body]
                }
              },
              
              // Footer with conditional content
              props.footer || {
                div: {
                  className: 'modal-footer',
                  children: [
                    {
                      button: {
                        text: 'Close',
                        onclick: () => setState('modal.isOpen', false)
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      ]
    }
  })
});

// Usage with complex DOM object props:
{
  Modal: {
    header: {
      div: {
        className: 'custom-header',
        children: [
          { h2: { text: 'User Settings' } },
          { span: { text: () => \`Logged in as \${getState('user.name')}\` } }
        ]
      }
    },
    body: [
      { UserProfile: {} },
      { AccountSettings: {} },
      props.showAdvanced ? { AdvancedOptions: {} } : null
    ].filter(Boolean),
    footer: () => {
      const hasChanges = getState('form.hasChanges');
      return {
        div: {
          className: 'modal-actions',
          children: hasChanges ? [
            { button: { text: 'Save', onclick: () => saveChanges() } },
            { button: { text: 'Cancel', onclick: () => cancelChanges() } }
          ] : [
            { button: { text: 'Close', onclick: () => closeModal() } }
          ]
        }
      };
    }
  }
}`;

	const lifecycleExample = `// Component Lifecycle Hooks
const DataComponent = (props, context) => {
  const { getState, setState, subscribe } = context;
  let unsubscribe = null;

  return {
    hooks: {
      onMount: () => {
        console.log('Component mounted, setting up subscriptions');
        
        // Subscribe to external data changes
        unsubscribe = subscribe('api.data', (newData) => {
          console.log('External data changed:', newData);
        });
        
        // Initialize component data
        if (!getState('component.initialized')) {
          setState('component.initialized', true);
          loadInitialData();
        }
      },

      onUpdate: (oldProps, newProps) => {
        console.log('Props changed:', { oldProps, newProps });
        
        // React to prop changes
        if (oldProps.userId !== newProps.userId) {
          loadUserData(newProps.userId);
        }
      },

      onUnmount: () => {
        console.log('Component unmounting, cleaning up');
        
        // Clean up subscriptions
        if (unsubscribe) {
          unsubscribe();
        }
        
        // Clear component state if needed
        setState('component.tempData', null);
      }
    },

    render: () => ({
      div: {
        className: 'data-component',
        text: () => {
          const data = getState('component.data');
          const loading = getState('component.loading', false);
          
          if (loading) return 'Loading...';
          if (!data) return 'No data';
          return \`Data: \${data.title}\`;
        }
      }
    })
  };

  function loadInitialData() {
    setState('component.loading', true);
    // Simulate API call
    setTimeout(() => {
      setState('component.data', { title: 'Initial Data' });
      setState('component.loading', false);
    }, 1000);
  }

  function loadUserData(userId) {
    setState('component.loading', true);
    // Load user-specific data
    setTimeout(() => {
      setState('component.data', { title: \`User \${userId} Data\` });
      setState('component.loading', false);
    }, 500);
  }
};`;

	const conditionalRenderingExample = `// Conditional Rendering Patterns
const ConditionalDisplay = (props, context) => ({
  render: () => ({
    div: {
      className: 'conditional-display',
      children: () => {
        const user = getState('auth.user');
        const isLoading = getState('auth.loading', false);
        const error = getState('auth.error');

        // Early returns for different states
        if (isLoading) {
          return [{ div: { className: 'loading', text: 'Loading...' } }];
        }

        if (error) {
          return [
            {
              div: {
                className: 'error-message',
                children: [
                  { h3: { text: 'Error' } },
                  { p: { text: error.message } },
                  {
                    button: {
                      text: 'Retry',
                      onclick: () => setState('auth.error', null)
                    }
                  }
                ]
              }
            }
          ];
        }

        if (!user) {
          return [{ LoginForm: {} }];
        }

        // Logged in user UI
        return [
          { UserDashboard: {} },
          user.isAdmin ? { AdminPanel: {} } : null,
          {
            div: {
              className: 'user-actions',
              children: [
                { NotificationPanel: {} },
                user.hasMessages ? { MessageCenter: {} } : null
              ].filter(Boolean)
            }
          }
        ].filter(Boolean);
      }
    }
  })
});

// Alternative: Multiple condition checks
const MultiConditionComponent = (props, context) => ({
  render: () => ({
    div: {
      className: 'multi-condition',
      children: () => {
        const conditions = {
          hasUser: getState('auth.user'),
          isAdmin: getState('auth.user.isAdmin', false),
          hasNotifications: getState('notifications.count', 0) > 0,
          isDarkMode: getState('ui.theme') === 'dark'
        };

        const components = [];

        // Add components based on conditions
        if (conditions.hasUser) {
          components.push({ UserProfile: {} });
          
          if (conditions.isAdmin) {
            components.push({ AdminControls: {} });
          }
          
          if (conditions.hasNotifications) {
            components.push({ NotificationBadge: {} });
          }
        } else {
          components.push({ LoginPrompt: {} });
        }

        // Add theme-specific component
        components.push({
          div: {
            className: conditions.isDarkMode ? 'dark-theme' : 'light-theme',
            text: 'Theme applied'
          }
        });

        return components;
      }
    }
  })
});`;

	const componentCompositionExample = `// Advanced Component Composition
const FlexibleCard = (props, context) => ({
  render: () => ({
    div: {
      className: () => \`card \${getState('ui.cardTheme', 'default')}\`,
      children: [
        // Conditional header
        props.title && {
          div: {
            className: 'card-header',
            children: Array.isArray(props.title) ? props.title : [props.title]
          }
        },
        
        // Main content area
        {
          div: {
            className: 'card-content',
            children: () => {
              // Content can be reactive function returning DOM objects
              const content = typeof props.content === 'function' 
                ? props.content() 
                : props.content;
              return Array.isArray(content) ? content : [content];
            }
          }
        },
        
        // Optional sidebar
        props.sidebar && {
          div: {
            className: 'card-sidebar',
            children: Array.isArray(props.sidebar) ? props.sidebar : [props.sidebar]
          }
        },
        
        // Actions footer
        props.actions && {
          div: {
            className: 'card-actions',
            children: () => {
              const actions = typeof props.actions === 'function' 
                ? props.actions() 
                : props.actions;
              return Array.isArray(actions) ? actions : [actions];
            }
          }
        }
      ].filter(Boolean)
    }
  })
});

// Usage examples:
{
  FlexibleCard: {
    title: [
      { h3: { text: 'Product Details' } },
      { span: { className: 'badge', text: () => getState('product.status') } }
    ],
    content: () => {
      const product = getState('product.current');
      return [
        { p: { text: product?.description || 'No description' } },
        { div: { text: \`Price: $\${product?.price || 0}\` } },
        product?.image && { img: { src: product.image, alt: product.name } }
      ].filter(Boolean);
    },
    sidebar: [
      { RelatedProducts: {} },
      { CustomerReviews: {} }
    ],
    actions: () => {
      const inStock = getState('product.current.inStock');
      return [
        {
          button: {
            text: 'Add to Cart',
            disabled: !inStock,
            onclick: () => addToCart()
          }
        },
        {
          button: {
            text: 'Wishlist',
            onclick: () => addToWishlist()
          }
        }
      ];
    }
  }
}`;

	const performanceExample = `// Performance Optimization Patterns
const OptimizedList = (props, context) => {
  const { items = [] } = props;

  return {
    render: () => ({
      div: {
        className: 'optimized-list',
        children: () => {
          const filter = getState('list.filter', '');
          const sortBy = getState('list.sortBy', 'name');
          const currentItems = getState('list.items', items);
          
          // Check if we can skip re-rendering
          const listLength = currentItems.length;
          const previousLength = getState('list.previousLength', 0);
          
          if (listLength === previousLength && 
              !getState('list.filterChanged', false) && 
              !getState('list.sortChanged', false)) {
            return "ignore"; // Preserve existing DOM
          }
          
          // Update tracking state
          setState('list.previousLength', listLength);
          setState('list.filterChanged', false);
          setState('list.sortChanged', false);
          
          // Render items with individual reactivity
          return currentItems
            .filter(item => item.name.toLowerCase().includes(filter.toLowerCase()))
            .sort((a, b) => a[sortBy]?.localeCompare(b[sortBy]))
            .map(item => ({
              OptimizedListItem: { 
                itemId: item.id, 
                key: item.id 
              }
            }));
        }
      }
    })
  };
};

// Individual items handle their own reactivity
const OptimizedListItem = (props, context) => ({
  render: () => {
    const item = getState(\`items.byId.\${props.itemId}\`);
    
    return {
      div: {
        className: () => {
          const isSelected = getState(\`selection.items\`, []).includes(props.itemId);
          return isSelected ? 'list-item selected' : 'list-item';
        },
        children: [
          {
            h4: { 
              text: () => getState(\`items.byId.\${props.itemId}.name\`, '') 
            }
          },
          {
            p: { 
              text: () => getState(\`items.byId.\${props.itemId}.description\`, '') 
            }
          },
          {
            button: {
              text: () => {
                const isSelected = getState(\`selection.items\`, []).includes(props.itemId);
                return isSelected ? 'Deselect' : 'Select';
              },
              onclick: () => {
                const selected = getState('selection.items', []);
                const newSelection = selected.includes(props.itemId)
                  ? selected.filter(id => id !== props.itemId)
                  : [...selected, props.itemId];
                setState('selection.items', newSelection);
              }
            }
          }
        ]
      }
    };
  }
});`;

	const errorHandlingExample = `// Error Boundaries and Error Handling
const ErrorBoundary = (props, context) => ({
  hooks: {
    onMount: () => {
      // Set up global error handler
      window.addEventListener('error', handleGlobalError);
      window.addEventListener('unhandledrejection', handlePromiseRejection);
    },
    
    onUnmount: () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handlePromiseRejection);
    }
  },

  render: () => {
    const error = getState('app.error');
    const isRecovering = getState('app.isRecovering', false);

    if (error && !isRecovering) {
      return {
        div: {
          className: 'error-boundary',
          children: [
            { h2: { text: 'Something went wrong' } },
            { p: { text: error.message } },
            {
              details: {
                children: [
                  { summary: { text: 'Error Details' } },
                  { pre: { text: error.stack } }
                ]
              }
            },
            {
              div: {
                className: 'error-actions',
                children: [
                  {
                    button: {
                      text: 'Try Again',
                      onclick: () => {
                        setState('app.isRecovering', true);
                        setTimeout(() => {
                          setState('app.error', null);
                          setState('app.isRecovering', false);
                        }, 500);
                      }
                    }
                  },
                  {
                    button: {
                      text: 'Reload Page',
                      onclick: () => window.location.reload()
                    }
                  }
                ]
              }
            }
          ]
        }
      };
    }

    // Normal rendering with error protection
    try {
      return {
        div: {
          className: 'app-content',
          children: Array.isArray(props.children) ? props.children : [props.children]
        }
      };
    } catch (renderError) {
      setState('app.error', {
        message: renderError.message,
        stack: renderError.stack,
        timestamp: Date.now()
      });
      return { div: { text: 'Loading...' } };
    }
  }

  function handleGlobalError(event) {
    setState('app.error', {
      message: event.error.message,
      stack: event.error.stack,
      timestamp: Date.now(),
      type: 'javascript'
    });
  }

  function handlePromiseRejection(event) {
    setState('app.error', {
      message: event.reason.message || 'Promise rejection',
      stack: event.reason.stack || '',
      timestamp: Date.now(),
      type: 'promise'
    });
  }
});`;

	return {
		render: () => ({
			div: {
				children: [
					{
						h1: {
							className: 'page-title',
							text: 'Components'
						}
					},
					{
						p: {
							className: 'page-subtitle',
							text: 'Master Juris component patterns: from basic structure to advanced composition and optimization techniques.'
						}
					},

					// Component Structure Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Component Structure',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Every Juris component follows a consistent structure with optional hooks, API, and required render function.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Basic Component Structure',
										language: 'javascript',
										code: componentExample
									}
								}
							]
						}
					},

					// Object DOM Usage Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Object DOM Structure',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Components are composed using Object DOM syntax, allowing for clean nesting and composition.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Component Usage in Object DOM',
										language: 'javascript',
										code: `div: {
  children: [
    { ComponentA: { staticProps: 'value', reactiveProps: () => getState('path') } },
    { ComponentB: { reactiveObjectDOM: () => ({ span: { text: getState('data') } }) } },
    {
      div: {
        children: [
          { ComponentC: { nested: true } },
          { ComponentD: { composition: 'works' } }
        ]
      }
    }
  ]
}`
									}
								}
							]
						}
					},

					// Reactive Props Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Reactive Props',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Props can be static values or reactive functions. Reactive props automatically update when their dependencies change.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Static vs Reactive Props',
										language: 'javascript',
										code: reactivePropsExample
									}
								}
							]
						}
					},

					// DOM Objects as Props Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'DOM Objects as Props',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Juris\'s revolutionary feature: pass entire DOM structures as props for ultimate composition flexibility.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Advanced Component Composition',
										language: 'javascript',
										code: domPropsExample
									}
								}
							]
						}
					},

					// Component Lifecycle Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Component Lifecycle',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Lifecycle hooks provide clean setup and teardown patterns without the complexity of useEffect.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Lifecycle Hooks',
										language: 'javascript',
										code: lifecycleExample
									}
								}
							]
						}
					},

					// Conditional Rendering Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Conditional Rendering',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Handle conditional rendering with reactive children functions that return different component structures based on state.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Conditional Rendering Patterns',
										language: 'javascript',
										code: conditionalRenderingExample
									}
								}
							]
						}
					},

					// Advanced Composition Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Advanced Composition',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Build highly flexible components that accept complex content structures and adapt to different use cases.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Flexible Component Design',
										language: 'javascript',
										code: componentCompositionExample
									}
								}
							]
						}
					},

					// Performance Optimization Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Performance Optimization',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Optimize large lists and complex UIs with granular reactivity and smart rendering strategies including the use of "ignore" to preserve existing DOM.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Performance Patterns',
										language: 'javascript',
										code: performanceExample
									}
								}
							]
						}
					},

					// Error Handling Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Error Handling',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Build robust applications with proper error boundaries and graceful error recovery mechanisms.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Error Boundaries',
										language: 'javascript',
										code: errorHandlingExample
									}
								}
							]
						}
					},

					// Key Principles Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Key Principles',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
											gap: '1rem',
											marginTop: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🎯 Functions = Reactive' } },
														{ p: { text: 'Use functions for values that should update automatically when state changes.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '⚡ Values = Static' } },
														{ p: { text: 'Use direct values for content that never changes during component lifetime.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔗 State Isolation' } },
														{ p: { text: 'Components access shared state directly, eliminating prop drilling and coordination complexity.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🎨 DOM Composition' } },
														{ p: { text: 'Pass DOM structures as props for ultimate flexibility and runtime composition.' } }
													]
												}
											}
										]
									}
								}
							]
						}
					}
				]
			}
		})
	};
};

const DocsState = (props, context) => {
	const { getState, setState } = context;
	const basicExample = `const Counter = (props, context) => {
  const { getState, setState } = context;
  
  return {
    render: () => ({
      div: {
        children: [
          {
            p: {
              text: () => \`Count: \${getState('counter', 0)}\`
            }
          },
          {
            button: {
              text: 'Increment',
              onclick: () => setState('counter', getState('counter', 0) + 1)
            }
          }
        ]
      }
    })
  };
}`;

	const domainExample = `// Domain-Based Global State Organization

const Counter = (props, context) => {
    const { getState, setState } = context;
    return {
        render: () => ({
            div: {
                children: [
                    {
                        p: {
                            // If 'demo.counter' doesn't exist, uses 0 as default
                            text: () => \`Count: \${getState('demo.counter', 0)}\`
                        }
                    },
                    {
                        button: {
                            text: 'Increment',
                            onclick: () => {
                                // Gets current value (or 0 if doesn't exist) and increments
                                const current = getState('demo.counter', 0);
                                setState('demo.counter', current + 1);
                            }
                        }
                    }
                ]
            }
        })
    };
};

const UserProfile = (props, context) => {
    const { getState, setState } = context;
    return {
        render: () => ({
            div: {
                className: () => \`profile \${getState('ui.theme', 'light')}\`,  // Default to 'light'
                children: [
                    {
                        h2: { 
                            text: () => \`Welcome \${getState('auth.user.name', 'Guest')}\`  // Default to 'Guest'
                        }
                    },
                    {
                        div: {
                            className: () => getState('ui.sidebar.collapsed', false) ? 'collapsed' : 'expanded'  // Default to false
                        }
                    },
                    {
                        span: {
                            text: () => \`Items in cart: \${getState('cart.items', []).length}\`  // Default to empty array
                        }
                    }
                ]
            }
        })
    };
};

const Settings = (props, context) => {
    const { getState, setState } = context;
    return {
        render: () => ({
            form: {
                children: [
                    {
                        input: {
                            type: 'text',
                            value: () => getState('settings.username', ''),  // Default to empty string
                            placeholder: 'Enter username',
                            oninput: (e) => setState('settings.username', e.target.value)
                        }
                    },
                    {
                        select: {
                            value: () => getState('settings.language', 'en'),  // Default to 'en'
                            onchange: (e) => setState('settings.language', e.target.value),
                            children: [
                                { option: { value: 'en', text: 'English' } },
                                { option: { value: 'es', text: 'Spanish' } },
                                { option: { value: 'fr', text: 'French' } }
                            ]
                        }
                    }
                ]
            }
        })
    };
};

// Key Benefits:
// 1. Components work immediately with sensible defaults
// 2. No need to pre-initialize state in configuration
// 3. State gets created naturally when first accessed
// 4. Default values provide fallback behavior
// 5. Components remain functional even if state is cleared/reset;

// UI Domain - Interface state
setState('ui.theme', 'dark');
setState('ui.mobileMenuOpen', true);
setState('ui.loading', false);

// Auth Domain - Authentication state  
setState('auth.user', { id: 123, name: 'John', role: 'admin' });
setState('auth.isLoggedIn', true);
setState('auth.permissions', ['read', 'write']);

// Data Domain - Application data
setState('data.products', productsArray);
setState('data.cart.items', cartItems);
setState('data.notifications.count', 5);

// Form Domain - Form state
setState('form.contact.name', 'John Doe');
setState('form.contact.email', 'john@example.com');
setState('form.contact.errors', {});

// Demo Domain - Example/demo state
setState('demo.counter', 42);
setState('demo.examples.active', 'counter'); `;

	const accessExample = `// Accessing Domain-Based State from Any Component

const UserProfile = (props, context) => ({
    render: () => ({
        div: {
            className: () => \`profile \${getState('ui.theme')}\`,  // UI domain
            children: [
                {
                    h2: { 
                        text: () => \`Welcome \${getState('auth.user.name', 'Guest')}\`  // Auth domain
                    }
                },
                {
                    p: { 
                        text: () => \`Cart: \${getState('data.cart.items', []).length} items\`  // Data domain
                    }
                },
                {
                    div: {
                        text: () => \`Notifications: \${getState('data.notifications.count', 0)}\`
                    }
                }
            ]
            }
        }
    })
});

// Component can be anywhere in the tree - state access remains the same
// No prop drilling, no context providers, no complex subscriptions`;

	const reactivityExample = `// Reactivity: Functions That Call getState() Become Reactive

const ReactiveExample = (props, context) => {
    const { getState, setState } = context;
    return {
        render: () => ({
            div: {
                // Static value - NEVER changes
                id: 'my-component',
                
                // Static getState call - evaluated once, NEVER updates
                title: getState('ui.theme', 'light'), // ❌ Not reactive
                
                // Function that calls getState - BECOMES reactive
                className: () => \`component \${getState('ui.theme', 'light')}\`, // ✅ Reactive
                
                children: () => {
                    const user = getState('auth.user');  // Tracks auth.user when function executes
                    
                    if (!user) {
                        // When user is null, this function only tracks auth.user
                        return [{ LoginForm: {} }];
                    }
                    
                    // When user exists, now tracks user-specific state
                    return [
                        { 
                            h1: { 
                                // Static text - NEVER updates even if user.name changes
                                text: \`Hello \${user.name}\`  // ❌ Not reactive
                            }
                        },
                        { 
                            h2: { 
                                // Function text - re-executes when auth.user.name changes
                                text: () => \`Welcome \${getState('auth.user.name', 'Guest')}\`  // ✅ Reactive
                            } 
                        },
                        {
                            div: {
                                children: () => {
                                    if (user.role === 'admin') {
                                        // Only tracks admin.notifications when user.role === 'admin'
                                        return [{ 
                                            AdminPanel: {
                                                count: () => getState('admin.notifications.count', 0)  // ✅ Reactive when admin
                                            }
                                        }];
                                    }
                                    return [{ UserDashboard: {} }];
                                }
                            }
                        }
                    ];
                }
            }
        })
    };
};

// Key Points:
// 1. setState('ui.theme', 'dark') just updates the value - nothing auto-happens
// 2. Functions that call getState() get tracked and re-executed
// 3. Static values/calls to getState() never update
// 4. You choose what's reactive by making it a function`;

	const temporalExample = `// Temporal Independence - Components Work Before State Exists

const PerformanceDisplay = (props, context) => ({
render: () => ({
    div: {
        className: 'performance-badge',
        children: [
            {
                span: {
                    // Works immediately, updates when state becomes available
                    text: () => {
                        const renderTime = context.getState('metrics.renderTime');
                        if (renderTime && renderTime.duration !== undefined) {
                            return \`⚡ Rendered in \${renderTime.duration.toFixed(1)}ms\`;
                        }
                        return '⚡ Real-time performance';
                    }
                }
            }]
        }
    })
});

// Component renders immediately with fallback text
// Automatically updates when ui.renderTime is set later
// No coordination needed, no race conditions`;

	const componentMobilityExample = `// Component Mobility - Works Anywhere Without State Impact

const ThemeToggle = (props, context) => {
  const { getState, setState } = context;
  
  return {
    render: () => ({
      button: {
        className: () => \`theme-btn ${getState('ui.theme')} \`,
        text: () => getState('ui.theme') === 'dark' ? '☀️' : '🌙',
        onclick: () => {
          const current = getState('ui.theme');
          setState('ui.theme', current === 'dark' ? 'light' : 'dark');
        }
      }
    })
  };
};

// This component works identically in ANY location:
// <Header><ThemeToggle /></Header>
// <Sidebar><ThemeToggle /></Sidebar>  
// <Modal><ThemeToggle /></Modal>
// <Footer><ThemeToggle /></Footer>

// No parent-child coupling, no prop passing, no context configuration`;

	const branchAwareExample = `// Branch-Aware Reactivity - Only Track What Actually Executes

const ConditionalComponent = (props, context) => {
  const { getState } = context;
  
  return {
    render: () => ({
      div: {
        children: () => {
          const viewMode = getState('ui.viewMode');  // Always tracked
          
          if (viewMode === 'grid') {
            // Only tracks grid-specific state when in grid mode
            return products.map(product => ({
              GridCard: {
                isSelected: () => getState(\`selection.grid.\${product.id}\`)
              }
            }));
          }
          
          if (viewMode === 'list') {
            // Only tracks list-specific state when in list mode  
            return products.map(product => ({
              ListItem: {
                isExpanded: () => getState(\`selection.list.\${product.id}\`)
              }
            }));
          }
          
          // Table mode - completely different dependencies
          return [{ DataTable: { sortBy: () => getState('table.sortBy') } }];
        }
      }
    })
  };
};

// When viewMode changes from 'grid' to 'list':
// - selection.grid.* changes are ignored (not in execution path)
// - selection.list.* changes start being tracked
// - Automatic dependency management, zero manual subscriptions`;

	const stateInitExample = `// Components Initialize State with Default Values

const Counter = (props, context) => {
  const { getState, setState } = context;
  
  return {
    render: () => ({
      div: {
        children: [
          {
            p: {
              // If 'demo.counter' doesn't exist, uses 0 as default
              text: () => \`Count: \${getState('demo.counter', 0)}\`
            }
          },
          {
            button: {
              text: 'Increment',
              onclick: () => {
                // Gets current value (or 0 if doesn't exist) and increments
                const current = getState('demo.counter', 0);
                setState('demo.counter', current + 1);
              }
            }
          }
        ]
      }
    })
  };
};

const UserProfile = (props, context) => ({
 render: () => ({
   div: {
     className: () => \`profile \${getState('ui.theme', 'light')}\`,  // Default to 'light'
     children: [
       {
         h2: { 
           text: () => \`Welcome \${getState('auth.user.name', 'Guest')}\`  // Default to 'Guest'
         }
       },
       {
         div: {
           className: () => getState('ui.sidebar.collapsed', false) ? 'collapsed' : 'expanded'  // Default to false
         }
       },
       {
         span: {
           text: () => \`Items in cart: \${getState('cart.items', []).length}\`  // Default to empty array
         }
       }
     ]
   }
 })
});

const Settings = (props, context) => ({
 render: () => ({
   form: {
     children: [
       {
         input: {
           type: 'text',
           value: () => getState('settings.username', ''),  // Default to empty string
           placeholder: 'Enter username',
           oninput: (e) => setState('settings.username', e.target.value)
         }
       },
       {
         select: {
           value: () => getState('settings.language', 'en'),  // Default to 'en'
           onchange: (e) => setState('settings.language', e.target.value),
           children: [
             { option: { value: 'en', text: 'English' } },
             { option: { value: 'es', text: 'Spanish' } },
             { option: { value: 'fr', text: 'French' } }
           ]
         }
       }
     ]
   }
 })
});

// Key Benefits:
// 1. Components work immediately with sensible defaults
// 2. No need to pre-initialize state in configuration
// 3. State gets created naturally when first accessed
// 4. Default values provide fallback behavior
// 5. Components remain functional even if state is cleared/reset`;
	return {
		render: () => ({
			div: {
				children: [
					{
						h1: {
							className: 'page-title',
							text: 'State Management'
						}
					},
					{
						p: {
							className: 'page-subtitle',
							text: 'Domain-based global state with automatic reactive dependency tracking.'
						}
					},

					// What is State Management Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'What is State Management in Juris?',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'State Management in Juris = Domain-Based Global State Access. Simply get and set state organized by logical domains. Reactivity happens when you make props/attributes functions that call getState().',
										style: { marginBottom: '1rem' }
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
											gap: '1rem',
											marginBottom: '2rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🌐 Global State' } },
														{ p: { text: 'Accessible from any component, anywhere in the application tree.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🏗️ Domain-Organized' } },
														{ p: { text: 'Logical grouping by concern: ui.*, auth.*, data.*, form.*' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '⚡ Simple Access' } },
														{ p: { text: 'Just getState(path) and setState(path, value) - that\'s it.' } }
													]
												}
											}
										]
									}
								}
							]
						}
					},

					// Basic Example Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Basic State Usage',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									CodeBlock: {
										title: 'Simple Counter Example',
										language: 'javascript',
										code: basicExample
									}
								}
							]
						}
					},

					// Domain Organization Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Domain-Based Organization',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Organize your global state by logical domains for clarity and maintainability.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Domain Organization Patterns',
										language: 'javascript',
										code: domainExample
									}
								}
							]
						}
					},

					// State Access Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Accessing State from Components',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Components can access any domain state directly - no prop drilling, no context providers, no complex subscriptions.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Direct State Access',
										language: 'javascript',
										code: accessExample
									}
								}
							]
						}
					},

					// Reactivity Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'How Reactivity Works',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'State is NOT reactive. Functions that call getState() become reactive. When you make a prop/attribute a function, Juris tracks which state it accesses and re-executes it when that state changes.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Function-Based Reactivity',
										language: 'javascript',
										code: reactivityExample
									}
								}
							]
						}
					},

					// State Initialization Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'State Initialization with Defaults',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Components can initialize state using default values. When state doesn\'t exist, getState() returns the default and the component works immediately.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Default Value Initialization',
										language: 'javascript',
										code: stateInitExample
									}
								}
							]
						}
					},

					// Temporal Independence Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Temporal Independence',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Components work immediately, even if the state they need doesn\'t exist yet. Updates happen automatically when data arrives.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Work Before State Exists',
										language: 'javascript',
										code: temporalExample
									}
								}
							]
						}
					},

					// Component Mobility Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Component Mobility',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Components can move anywhere in the UI tree without impacting their state access. No parent-child coupling.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Location Independence',
										language: 'javascript',
										code: componentMobilityExample
									}
								}
							]
						}
					},

					// Branch-Aware Reactivity Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Branch-Aware Reactivity',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Components only track state paths that actually execute. Change execution branches and dependency tracking automatically adapts.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Execution-Aware Dependencies',
										language: 'javascript',
										code: branchAwareExample
									}
								}
							]
						}
					},

					// Key Principles Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Core Principles',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
											gap: '1rem',
											marginTop: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🌐 Global Access' } },
														{ p: { text: 'Any component can access any state directly. No prop drilling or complex context setup.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🏗️ Domain Organization' } },
														{ p: { text: 'Organize state by logical domains (ui.*, auth.*, data.*) for clarity and maintainability.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '⚡ Zero Boilerplate' } },
														{ p: { text: 'No reducers, actions, providers, or subscriptions. Just getState() and setState().' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔄 Function-Based Reactivity' } },
														{ p: { text: 'Make props/attributes functions that call getState() to make them reactive.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🎯 Surgical Precision' } },
														{ p: { text: 'Only components using changed state paths re-render. Maximum efficiency by default.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🚫 Zero Race Conditions' } },
														{ p: { text: 'Temporal independence eliminates timing issues and coordination complexity.' } }
													]
												}
											}
										]
									}
								}
							]
						}
					},

					// Summary Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'State Management Summary',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									div: {
										className: 'card',
										style: {
											background: 'linear-gradient(135deg, #fff8f5 0%, #ffffff 100%)',
											border: '1px solid var(--orange-pale)',
											padding: '2rem'
										},
										children: [
											{
												p: {
													text: 'State Management in Juris is simply domain-based global state access with automatic reactivity. No complex patterns, no boilerplate, no coordination logic - just get and set state organized by logical domains, with functions automatically tracking their dependencies.',
													style: {
														fontSize: '1.1rem',
														fontWeight: '500',
														textAlign: 'center',
														color: 'var(--gray-700)',
														margin: '0'
													}
												}
											}
										]
									}
								}
							]
						}
					}
				]
			}
		})
	};
};

const DocsRouting = (props, context) => {
	const basicRoutingExample = `const Router = (props, context) => {
  return {
    render: () => ({
      div: {
        children: () => {
          const path = getState('router.path', '/');
          
          switch (path) {
            case '/':
              return [{ HomePage: {} }];
            case '/about':
              return [{ AboutPage: {} }];
            default:
              return [{ NotFoundPage: {} }];
          }
        }
      }
    })
  };
};`;

	const stateBasedRoutingExample = `// State-Based Routing with UrlStateSync Headless Component

const UrlStateSync = (props, context) => {
  const { getState, setState } = context;
  
  return {
    hooks: {
      onRegister: () => {
        console.log('🧭 UrlStateSync initializing...');
        
        // Initialize from current URL
        handleUrlChange();
        
        // Listen for browser navigation (back/forward)
        window.addEventListener('hashchange', handleUrlChange);
        window.addEventListener('popstate', handleUrlChange);
        
        console.log('✅ UrlStateSync ready');
      },
      
      onUnregister: () => {
        window.removeEventListener('hashchange', handleUrlChange);
        window.removeEventListener('popstate', handleUrlChange);
      }
    }
    
    // No render method - this is state synchronization only
  };

  function handleUrlChange() {
    const path = window.location.hash.substring(1) || '/';
    const segments = parseSegments(path);
    
    // Inject URL state into global state
    setState('url.path', path);
    setState('url.segments', segments);
    
    console.log('🧭 URL updated:', path);
  }
  
  function parseSegments(path) {
    const parts = path.split('/').filter(Boolean);
    return {
      full: path,
      parts: parts,
      base: parts[0] || '',
      sub: parts[1] || '',
      section: parts[2] || ''
    };
  }
};

// Register as headless component
const juris = new Juris({
  headlessComponents: {
    UrlStateSync: { fn: UrlStateSync, options: { autoInit: true } }
  }
});`;

	const routeGuardsExample = `// Route Guards with Conditional State Injection

const SecureUrlStateSync = (props, context) => {
  const { getState, setState } = context;
  
  // Define route permissions
  const routeGuards = {
    '/admin': ['admin'],
    '/admin/users': ['admin', 'user-management'],
    '/profile': ['authenticated'],
    '/settings': ['authenticated']
  };
  
  return {
    hooks: {
      onRegister: () => {
        handleUrlChange();
        window.addEventListener('hashchange', handleUrlChange);
      }
    }
  };

  async function handleUrlChange() {
    const path = window.location.hash.substring(1) || '/';
    const userPermissions = getState('auth.user.permissions', []);
    const isAuthenticated = getState('auth.isLoggedIn', false);
    
    // Check route guards BEFORE injecting state
    const guardResult = await checkRouteAccess(path, userPermissions, isAuthenticated);
    
    if (guardResult.allowed) {
      // Only inject URL state if authorized
      setState('url.path', path);
      setState('url.segments', parseSegments(path));
    } else {
      // Handle guard failure
      if (guardResult.redirect) {
        window.location.hash = guardResult.redirect;
      } else {
        setState('url.path', '/unauthorized');
        setState('url.segments', parseSegments('/unauthorized'));
      }
    }
  }
  
  async function checkRouteAccess(path, userPermissions, isAuthenticated) {
    // Public routes
    if (!routeGuards[path]) {
      return { allowed: true };
    }
    
    // Check authentication first
    if (!isAuthenticated) {
      return { 
        allowed: false, 
        redirect: '/login',
        reason: 'Authentication required'
      };
    }
    
    // Check permissions
    const requiredPermissions = routeGuards[path];
    const hasPermission = requiredPermissions.some(permission => 
      userPermissions.includes(permission)
    );
    
    if (!hasPermission) {
      return { 
        allowed: false, 
        redirect: '/unauthorized',
        reason: 'Insufficient permissions'
      };
    }
    
    return { allowed: true };
  }
};`;

	const navigationExample = `// Navigation Components Using State-Based Routing

const Navigation = (props, context) => {
  const navItems = [
    { path: '/', label: 'Home' },
    { path: '/docs', label: 'Docs' },
    { path: '/examples', label: 'Examples' }
  ];

  return {
    render: () => ({
      nav: {
        className: 'navigation',
        children: navItems.map(item => ({
          a: {
            href: '#' + item.path,
            className: () => {
              const currentPath = getState('url.path', '/');
              return currentPath === item.path ? 'nav-link active' : 'nav-link';
            },
            text: item.label,
            onclick: (e) => {
              e.preventDefault();
              // Programmatic navigation updates URL, UrlStateSync handles state
              window.location.hash = item.path;
            },
            key: item.path
          }
        }))
      }
    })
  };
};

const SubNavigation = (props, context) => {
  const subRoutes = [
    { path: '', label: 'Getting Started' },
    { path: 'components', label: 'Components' },
    { path: 'state', label: 'State Management' }
  ];

  return {
    render: () => ({
      nav: {
        className: 'sub-navigation',
        children: () => {
          const currentSub = getState('url.segments.sub', '');
          
          return subRoutes.map(route => ({
            a: {
              href: \`#/docs\${route.path ? '/' + route.path : ''}\`,
              className: currentSub === route.path ? 'sub-nav-link active' : 'sub-nav-link',
              text: route.label,
              onclick: (e) => {
                e.preventDefault();
                window.location.hash = \`/docs\${route.path ? '/' + route.path : ''}\`;
              },
              key: route.path || 'root'
            }
          }));
        }
      }
    })
  };
};`;

	const appLayoutExample = `// Application Layout with State-Based Routing

const AppLayout = (props, context) => {
  return {
    render: () => ({
      div: {
        className: 'app-layout',
        children: [
          { Header: {} },
          {
            main: {
              className: 'main-content',
              children: () => {
                const segments = getState('url.segments', { base: '' });
                
                // Route to components based on URL state
                switch (segments.base) {
                  case '':
                    return [{ HomePage: {} }];
                  case 'docs':
                    return [{ DocsPage: {} }];
                  case 'examples':
                    return [{ ExamplesPage: {} }];
                  case 'admin':
                    // Only renders if user passed route guards
                    return [{ AdminDashboard: {} }];
                  case 'unauthorized':
                    return [{ UnauthorizedPage: {} }];
                  default:
                    return [{ NotFoundPage: {} }];
                }
              }
            }
          },
          { Footer: {} }
        ]
      }
    })
  };
};

const DocsPage = (props, context) => {
  return {
    render: () => ({
      div: {
        children: [
          { SubNavigation: {} },
          {
            section: {
              className: 'docs-content',
              children: () => {
                const currentSub = getState('url.segments.sub', '');
                
                // Sub-routing based on URL segments
                switch (currentSub) {
                  case 'components':
                    return [{ DocsComponents: {} }];
                  case 'state':
                    return [{ DocsState: {} }];
                  default:
                    return [{ DocsIntro: {} }];
                }
              }
            }
          }
        ]
      }
    })
  };
};`;

	const routeDataExample = `// Route-Specific Data Loading

const RouteDataManager = (props, context) => {
  const { getState, setState, subscribe } = context;
  
  return {
    hooks: {
      onRegister: () => {
        // Listen for route changes and load appropriate data
        subscribe('url.path', handleRouteChange);
        subscribe('url.segments', handleSubRouteChange);
      }
    },
    
    api: {
      preloadRoute: async (path) => {
        // Preload data for route before navigation
        await loadRouteData(path);
      }
    }
  };

  async function handleRouteChange(newPath) {
    console.log('📊 Loading data for route:', newPath);
    
    // Clear previous route data
    setState('route.loading', true);
    setState('route.error', null);
    
    try {
      await loadRouteData(newPath);
    } catch (error) {
      setState('route.error', error.message);
    } finally {
      setState('route.loading', false);
    }
  }
  
  async function loadRouteData(path) {
    switch (path) {
      case '/dashboard':
        if (!getState('dashboard.data')) {
          const dashboardData = await fetchDashboardData();
          setState('dashboard.data', dashboardData);
        }
        break;
        
      case '/profile':
        const userId = getState('auth.user.id');
        if (userId && !getState(\`profiles.\${userId}\`)) {
          const profile = await fetchUserProfile(userId);
          setState(\`profiles.\${userId}\`, profile);
        }
        break;
        
      case '/admin/users':
        if (!getState('admin.users.list')) {
          const users = await fetchUsers();
          setState('admin.users.list', users);
        }
        break;
    }
  }
  
  async function handleSubRouteChange(segments) {
    // Handle sub-route specific data loading
    if (segments.base === 'docs' && segments.sub === 'api') {
      if (!getState('docs.apiReference')) {
        const apiDocs = await fetchApiDocs();
        setState('docs.apiReference', apiDocs);
      }
    }
  }
};`;

	const benefitsExample = `// Benefits of State-Based Routing

// 1. COMPONENT MOBILITY - Routes work from anywhere
const UserProfile = (props, context) => ({
  render: () => ({
    div: {
      children: [
        {
          h2: { 
            text: () => \`Profile for \${getState('url.segments.parts.1', 'user')}\`
          }
        },
        {
          nav: {
            children: [
              {
                a: {
                  href: '#/profile/settings',
                  className: () => {
                    const currentPath = getState('url.path');
                    return currentPath === '/profile/settings' ? 'active' : '';
                  },
                  text: 'Settings'
                }
              }
            ]
          }
        }
      ]
    }
  })
});

// 2. TEMPORAL INDEPENDENCE - Components work before URL loads
const Breadcrumbs = (props, context) => ({
  render: () => ({
    nav: {
      className: 'breadcrumbs',
      children: () => {
        const segments = getState('url.segments', { parts: [] });
        
        return segments.parts.map((segment, index) => {
          const path = '/' + segments.parts.slice(0, index + 1).join('/');
          return {
            a: {
              href: '#' + path,
              text: segment,
              key: segment
            }
          };
        });
      }
    }
  })
});

// 3. AUTOMATIC SUBSCRIPTIONS - No manual route listening
const ActiveIndicator = (props, context) => ({
  render: () => ({
    div: {
      className: () => {
        const currentPath = getState('url.path', '/');
        return props.path === currentPath ? 'indicator active' : 'indicator';
      },
      text: () => getState('url.path') === props.path ? '●' : '○'
    }
  })
});

// Usage anywhere in app:
{ ActiveIndicator: { path: '/dashboard' } }
{ ActiveIndicator: { path: '/profile' } }

// 4. BRANCH-AWARE REACTIVITY - Only tracks relevant routes
const ConditionalContent = (props, context) => ({
  render: () => ({
    div: {
      children: () => {
        const route = getState('url.segments.base');
        
        if (route === 'admin') {
          // Only tracks admin.* state when on admin routes
          return [{ 
            AdminStats: { 
              userCount: () => getState('admin.users.count')
            }
          }];
        }
        
        if (route === 'dashboard') {
          // Only tracks dashboard.* state when on dashboard
          return [{ 
            DashboardWidget: { 
              data: () => getState('dashboard.metrics')
            }
          }];
        }
        
        return [{ DefaultContent: {} }];
      }
    }
  })
});`;

	return {
		render: () => ({
			div: {
				children: [
					{
						h1: {
							className: 'page-title',
							text: 'Routing'
						}
					},
					{
						p: {
							className: 'page-subtitle',
							text: 'Juris does not include a built-in routing system, acknowledging that routing is complex and evolving architecture where developers may find better solutions. Instead, Juris provides powerful patterns for building custom state-based routing solutions.'
						}
					},

					// Philosophy Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Why No Built-in Router?',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									div: {
										className: 'card',
										style: {
											background: 'linear-gradient(135deg, #fff8f5 0%, #ffffff 100%)',
											border: '1px solid var(--orange-pale)',
											padding: '2rem',
											marginBottom: '2rem'
										},
										children: [
											{
												p: {
													text: 'Juris deliberately excludes a built-in routing system. The author acknowledges that routing is a complex and evolving architecture where developers may discover better solutions than any framework author could anticipate.',
													style: {
														fontSize: '1.1rem',
														marginBottom: '1rem',
														color: 'var(--gray-700)'
													}
												}
											},
											{
												p: {
													text: 'Instead, Juris provides the foundational patterns - headless components, state management, and reactivity - that enable you to build routing solutions perfectly suited to your application\'s needs.',
													style: {
														fontSize: '1.1rem',
														color: 'var(--gray-700)',
														margin: '0'
													}
												}
											}
										]
									}
								}
							]
						}
					},

					// Basic Routing Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Basic Router Pattern',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Simple routing by switching components based on URL state.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Basic Router Setup',
										language: 'javascript',
										code: basicRoutingExample
									}
								}
							]
						}
					},

					// State-Based Routing Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Recommended Pattern: State-Based Routing',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'The author suggests state-based routing as a more predictable and manageable approach. This pattern uses Juris\'s headless components to synchronize URL with global state, enabling automatic subscriptions, component mobility, and temporal independence.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Custom UrlStateSync Implementation',
										language: 'javascript',
										code: stateBasedRoutingExample
									}
								}
							]
						}
					},

					// Route Guards Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Custom Route Guards Implementation',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Example implementation of route protection using conditional state injection. You can adapt this pattern for any security requirements your application needs.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Custom Security Implementation',
										language: 'javascript',
										code: routeGuardsExample
									}
								}
							]
						}
					},

					// Navigation Components Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Navigation Components',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Navigation components that automatically track active routes using state subscriptions.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Reactive Navigation',
										language: 'javascript',
										code: navigationExample
									}
								}
							]
						}
					},

					// Application Layout Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Application Layout with Routing',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Complete application layout that renders different components based on URL segments.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Layout with Nested Routing',
										language: 'javascript',
										code: appLayoutExample
									}
								}
							]
						}
					},

					// Route Data Loading Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Route-Specific Data Loading',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'Automatically load data when routes change using headless components that subscribe to URL state.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Route Data Management',
										language: 'javascript',
										code: routeDataExample
									}
								}
							]
						}
					},

					// Benefits Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Why State-Based Routing Works Better',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									p: {
										text: 'State-based routing leverages Juris\'s core architectural patterns, providing benefits that traditional router libraries cannot match.',
										style: { marginBottom: '1rem' }
									}
								},
								{
									CodeBlock: {
										title: 'Architectural Benefits in Practice',
										language: 'javascript',
										code: benefitsExample
									}
								}
							]
						}
					},

					// Key Benefits Cards
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Core Advantages',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									div: {
										className: 'content-grid',
										style: {
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
											gap: '1rem',
											marginTop: '1rem'
										},
										children: [
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🚀 Component Mobility' } },
														{ p: { text: 'Route-aware components work anywhere in the application tree without framework-specific router configuration.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '⏰ Temporal Independence' } },
														{ p: { text: 'Components work immediately, even if URL state hasn\'t loaded yet. No coordination complexity.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🔄 Automatic Subscriptions' } },
														{ p: { text: 'Components automatically subscribe to URL changes through normal state patterns. No special router hooks.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🎯 Branch-Aware Reactivity' } },
														{ p: { text: 'Components only track route state when actually using it. Natural performance optimization.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '🛠️ Customizable Architecture' } },
														{ p: { text: 'Build routing solutions perfectly suited to your needs. No Platform limitations.' } }
													]
												}
											},
											{
												div: {
													className: 'card',
													children: [
														{ h4: { text: '📦 Headless Foundation' } },
														{ p: { text: 'URL synchronization as pure state management. Clean separation of concerns.' } }
													]
												}
											}
										]
									}
								}
							]
						}
					},

					// Summary Section
					{
						section: {
							style: { marginBottom: '3rem' },
							children: [
								{
									h2: {
										text: 'Routing Summary',
										style: {
											fontSize: '1.5rem',
											marginBottom: '1rem',
											color: 'var(--orange)'
										}
									}
								},
								{
									div: {
										className: 'card',
										style: {
											background: 'linear-gradient(135deg, #fff8f5 0%, #ffffff 100%)',
											border: '1px solid var(--orange-pale)',
											padding: '2rem'
										},
										children: [
											{
												p: {
													text: 'Juris doesn\'t include a built-in router because routing architecture is complex and evolving - developers may find better solutions than any framework author could anticipate. Instead, Juris provides the foundational patterns to build custom routing solutions perfectly suited to your application\'s unique requirements.',
													style: {
														fontSize: '1.1rem',
														fontWeight: '500',
														textAlign: 'center',
														color: 'var(--gray-700)',
														margin: '0'
													}
												}
											}
										]
									}
								}
							]
						}
					}
				]
			}
		})
	};
};

const ExamplesPage = (props, context) => {
	return {
		render: () => ({
			div: {
				className: 'fade-in',
				children: [{
					section: {
						className: 'page',
						children: [{
							div: {
								className: 'container',
								children: [
									{
										h1: {
											className: 'page-title',
											text: 'Examples'
										}
									},
									{
										p: {
											className: 'page-subtitle',
											text: 'Real-world examples and code samples.'
										}
									},
									{
										div: {
											className: 'content-grid',
											children: [
												{
													div: {
														className: 'card',
														children: [
															{
																h3: {
																	className: 'card-title',
																	text: 'Todo App'
																}
															},
															{
																p: {
																	className: 'card-text',
																	text: 'Classic todo application with state management, filtering, and persistence.'
																}
															},
															{
																a: {
																	className: 'card-link',
																	href: 'juris_todo_app_demo.html',
																	text: 'View Example',
																	target: '_blank',
																}
															}
														]
													}
												},
												{
													div: {
														className: 'card',
														children: [
															{
																h3: {
																	className: 'card-title',
																	text: 'Dashboard'
																}
															},
															{
																p: {
																	className: 'card-text',
																	text: 'Admin dashboard with charts, data tables, and real-time updates.'
																}
															},
															{
																a: {
																	className: 'card-link',
																	href: 'juris_dashboard_demo.html',
																	target: '_blank',
																	text: 'View Example'
																}
															}
														]
													}
												},
												{
													div: {
														className: 'card',
														children: [
															{
																h3: {
																	className: 'card-title',
																	text: 'E-commerce'
																}
															},
															{
																p: {
																	className: 'card-text',
																	text: 'Shopping cart with product catalog, search, and checkout flow.'
																}
															},
															{
																a: {
																	className: 'card-link',
																	href: 'juris_ecommerce_demo.html',
																	target: '_blank',
																	text: 'View Example'
																}
															}
														]
													}
												}
											]
										}
									}, {
										div: {
											className: 'content-grid',
											children: [
												{
													div: {
														className: 'card',
														children: [
															{
																h3: {
																	className: 'card-title',
																	text: 'Simple Counter App'
																}
															},
															{
																p: {
																	className: 'card-text',
																	text: 'Classic counter application with state management, with reset increment and decrement functionality.'
																}
															},
															{
																a: {
																	className: 'card-link',
																	href: 'juris_simple_counter_app.html',
																	text: 'View Example',
																	target: '_blank',
																}
															}
														]
													}
												},
												{
													div: {
														className: 'card',
														children: [
															{
																h3: {
																	className: 'card-title',
																	text: 'Simple Todos App'
																}
															},
															{
																p: {
																	className: 'card-text',
																	text: 'Classic todo application with state management, filtering.'
																}
															},
															{
																a: {
																	className: 'card-link',
																	href: 'juris_simple_todos_app.html',
																	target: '_blank',
																	text: 'View Example'
																}
															}
														]
													}
												},
												{
													div: {
														className: 'card',
														children: [
															{
																h3: {
																	className: 'card-title',
																	text: 'Simple Calculator App'
																}
															},
															{
																p: {
																	className: 'card-text',
																	text: 'Basic calculator with addition, subtraction, multiplication, and division. Not applicable during exams.😂'
																}
															},
															{
																a: {
																	className: 'card-link',
																	href: 'juris_simple_calculator_app.html',
																	target: '_blank',
																	text: 'View Example'
																}
															}
														]
													}
												}
											]
										}
									}
								]
							}
						}]
					}
				}]
			}
		})
	};
};

const AboutPage = (props, context) => {
	const { getState } = context;
	return {
		render: () => ({
			div: {
				className: 'fade-in',
				children: [
					// Hero Section
					{
						section: {
							className: 'page',
							children: [{
								div: {
									className: 'container',
									children: [
										{
											h1: {
												className: 'page-title',
												text: 'About Juris Platform'
											}
										},
										{
											p: {
												className: 'page-subtitle',
												text: 'The platform that proves complexity is a choice, not a requirement. Making development problems obsolete through revolutionary architectural thinking.'
											}
										}
									]
								}
							}]
						}
					},

					// Mission & Vision Section
					{
						section: {
							className: 'page',
							style: {
								background: 'linear-gradient(135deg, #fff8f5 0%, #ffffff 100%)',
								borderTop: '1px solid var(--orange-pale)'
							},
							children: [{
								div: {
									className: 'container',
									children: [
										{
											h2: {
												className: 'page-title',
												style: { color: 'var(--orange)', textAlign: 'center' },
												text: 'Our Mission'
											}
										},
										{
											div: {
												style: {
													maxWidth: '800px',
													margin: '0 auto 3rem',
													textAlign: 'center'
												},
												children: [
													{
														p: {
															style: {
																fontSize: '1.25rem',
																lineHeight: '1.8',
																color: 'var(--gray-700)',
																marginBottom: '2rem'
															},
															text: 'To eliminate the artificial complexity that has plagued web development, proving that powerful applications can be built with elegant simplicity.'
														}
													}
												]
											}
										},
										{
											div: {
												className: 'content-grid',
												children: [
													{
														Card: {
															cardTitle: '🎯 Core Philosophy',
															cardText: 'Technology should solve problems, not create them. Every framework feature exists to eliminate complexity, not manage it.'
														}
													},
													{
														Card: {
															cardTitle: '🔮 Vision',
															cardText: 'A world where developers spend time solving business problems instead of fighting framework complexity and tooling overhead.'
														}
													},
													{
														Card: {
															cardTitle: '⚡ Impact',
															cardText: 'Prove that 13000-line single-file applications with perfect performance are not just possible, but practical.'
														}
													}
												]
											}
										}
									]
								}
							}]
						}
					},

					// The Story Section
					{
						section: {
							className: 'page',
							children: [{
								div: {
									className: 'container',
									children: [
										{
											h2: {
												className: 'page-title',
												style: { color: 'var(--orange)' },
												text: 'The Story Behind Juris'
											}
										},
										{
											div: {
												style: {
													maxWidth: '900px',
													margin: '0 auto'
												},
												children: [
													{
														div: {
															className: 'card',
															style: {
																padding: '2rem',
																marginBottom: '2rem',
																background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
																border: '1px solid var(--gray-200)'
															},
															children: [
																{
																	h3: {
																		style: {
																			color: 'var(--orange)',
																			marginBottom: '1rem'
																		},
																		text: 'The Problem Recognition'
																	}
																},
																{
																	p: {
																		style: {
																			fontSize: '1.1rem',
																			lineHeight: '1.7',
																			marginBottom: '1rem'
																		},
																		text: 'Modern web development had become an exercise in managing complexity rather than solving problems. Developers spend more time configuring build tools, managing state synchronization, and debugging framework quirks than building actual features.'
																	}
																},
																{
																	p: {
																		style: {
																			fontSize: '1.1rem',
																			lineHeight: '1.7',
																			margin: '0'
																		},
																		text: 'We realized that most "best practices" exist to solve problems that shouldn\'t exist in the first place. What if we could eliminate the problems at their source?'
																	}
																}
															]
														}
													},
													{
														div: {
															className: 'card',
															style: {
																padding: '2rem',
																marginBottom: '2rem',
																background: 'linear-gradient(135deg, #fff8f5 0%, #ffffff 100%)',
																border: '1px solid var(--orange-pale)'
															},
															children: [
																{
																	h3: {
																		style: {
																			color: 'var(--orange)',
																			marginBottom: '1rem'
																		},
																		text: 'The Breakthrough Moment'
																	}
																},
																{
																	p: {
																		style: {
																			fontSize: '1.1rem',
																			lineHeight: '1.7',
																			marginBottom: '1rem'
																		},
																		text: 'The insight came when we realized that JavaScript objects could describe UI structure more elegantly than JSX, functions could provide precise reactivity without manual subscriptions, and global state could eliminate coordination complexity entirely.'
																	}
																},
																{
																	p: {
																		style: {
																			fontSize: '1.1rem',
																			lineHeight: '1.7',
																			margin: '0'
																		},
																		text: 'When we built our first 13,000+ line single-file application that rendered in under 5ms with perfect performance scores, we knew we had discovered something revolutionary.'
																	}
																}
															]
														}
													}
												]
											}
										}
									]
								}
							}]
						}
					},

					// Innovation Principles Section
					{
						section: {
							className: 'page',
							style: {
								background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
								borderTop: '1px solid var(--gray-200)'
							},
							children: [{
								div: {
									className: 'container',
									children: [
										{
											h2: {
												className: 'page-title',
												style: { color: 'var(--gray-800)' },
												text: 'Innovation Principles'
											}
										},
										{
											p: {
												className: 'page-subtitle',
												text: 'The core principles that guide every architectural decision in Juris Platform.'
											}
										},
										{
											div: {
												className: 'content-grid',
												children: [
													{
														Card: {
															cardTitle: '🧠 Rethink Everything',
															cardText: 'Question every assumption about how web applications should be built. Challenge industry conventions that create unnecessary complexity.'
														}
													},
													{
														Card: {
															cardTitle: '⚡ Eliminate, Don\'t Manage',
															cardText: 'Instead of providing tools to manage complexity, eliminate the complexity at its source through better architectural patterns.'
														}
													},
													{
														Card: {
															cardTitle: '🎯 Simplicity Scales',
															cardText: 'Prove that simple approaches can handle enterprise-scale complexity better than complex solutions designed for complexity.'
														}
													},
													{
														Card: {
															cardTitle: '🔄 Progressive Enhancement',
															cardText: 'Enable gradual adoption without forcing complete rewrites. Respect existing codebases and development workflows.'
														}
													},
													{
														Card: {
															cardTitle: '🚀 Performance by Design',
															cardText: 'Build performance into the architecture rather than requiring optimization as an afterthought or specialized skill.'
														}
													},
													{
														Card: {
															cardTitle: '🧪 Prove with Real Examples',
															cardText: 'Every claim backed by working code. This documentation site itself demonstrates the principles in a real 8,000+ line application.'
														}
													}
												]
											}
										}
									]
								}
							}]
						}
					},

					// Technical Achievements Section
					{
						section: {
							className: 'page',
							children: [{
								div: {
									className: 'container',
									children: [
										{
											h2: {
												className: 'page-title',
												style: { color: 'var(--orange)' },
												text: 'Technical Achievements'
											}
										},
										{
											p: {
												className: 'page-subtitle',
												text: 'Measurable breakthroughs that validate our architectural approach.'
											}
										},
										{
											div: {
												style: {
													display: 'grid',
													gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
													gap: '2rem',
													marginTop: '2rem'
												},
												children: [
													{
														div: {
															className: 'card',
															style: {
																textAlign: 'center',
																padding: '2rem',
																background: 'linear-gradient(135deg, #fff8f5 0%, #ffffff 100%)',
																border: '2px solid var(--orange)'
															},
															children: [
																{
																	div: {
																		style: {
																			fontSize: '3rem',
																			fontWeight: 'bold',
																			color: 'var(--orange)',
																			marginBottom: '0.5rem'
																		},
																		text: () => `${getState('metrics.renderTime.duration', 3.5).toFixed(1)}ms`
																	}
																},
																{
																	h4: {
																		style: { marginBottom: '0.5rem' },
																		text: 'Render Time'
																	}
																},
																{
																	p: {
																		style: { fontSize: '0.9rem', color: 'var(--gray-600)' },
																		text: '13000 LOC documentation site'
																	}
																}
															]
														}
													},
													{
														div: {
															className: 'card',
															style: {
																textAlign: 'center',
																padding: '2rem',
																background: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)',
																border: '2px solid #22c55e'
															},
															children: [
																{
																	div: {
																		style: {
																			fontSize: '3rem',
																			fontWeight: 'bold',
																			color: '#22c55e',
																			marginBottom: '0.5rem'
																		},
																		text: '100%'
																	}
																},
																{
																	h4: {
																		style: { marginBottom: '0.5rem' },
																		text: 'Lighthouse Score'
																	}
																},
																{
																	p: {
																		style: { fontSize: '0.9rem', color: 'var(--gray-600)' },
																		text: 'Performance & Best Practices'
																	}
																}
															]
														}
													},
													{
														div: {
															className: 'card',
															style: {
																textAlign: 'center',
																padding: '2rem',
																background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)',
																border: '2px solid #3b82f6'
															},
															children: [
																{
																	div: {
																		style: {
																			fontSize: '3rem',
																			fontWeight: 'bold',
																			color: '#3b82f6',
																			marginBottom: '0.5rem'
																		},
																		text: '1'
																	}
																},
																{
																	h4: {
																		style: { marginBottom: '0.5rem' },
																		text: 'File Count'
																	}
																},
																{
																	p: {
																		style: { fontSize: '0.9rem', color: 'var(--gray-600)' },
																		text: 'Complete application'
																	}
																}
															]
														}
													},
													{
														div: {
															className: 'card',
															style: {
																textAlign: 'center',
																padding: '2rem',
																background: 'linear-gradient(135deg, #fefce8 0%, #ffffff 100%)',
																border: '2px solid #eab308'
															},
															children: [
																{
																	div: {
																		style: {
																			fontSize: '3rem',
																			fontWeight: 'bold',
																			color: '#eab308',
																			marginBottom: '0.5rem'
																		},
																		text: '0'
																	}
																},
																{
																	h4: {
																		style: { marginBottom: '0.5rem' },
																		text: 'Build Tools'
																	}
																},
																{
																	p: {
																		style: { fontSize: '0.9rem', color: 'var(--gray-600)' },
																		text: 'Pure JavaScript'
																	}
																}
															]
														}
													}
												]
											}
										}
									]
								}
							}]
						}
					},

					// Community & Future Section
					{
						section: {
							className: 'page',
							style: {
								background: 'linear-gradient(135deg, #fff8f5 0%, #ffffff 100%)',
								borderTop: '1px solid var(--orange-pale)'
							},
							children: [{
								div: {
									className: 'container',
									children: [
										{
											h2: {
												className: 'page-title',
												style: { color: 'var(--orange)' },
												text: 'Community & Future'
											}
										},
										{
											div: {
												className: 'content-grid',
												children: [
													{
														Card: {
															cardTitle: '🌍 Open Source Philosophy',
															cardText: 'Juris is built with transparency and community collaboration. Every innovation should be accessible to developers worldwide.'
														}
													},
													{
														Card: {
															cardTitle: '🔬 Research & Development',
															cardText: 'Continuous exploration of architectural patterns that eliminate complexity while maintaining power and flexibility.'
														}
													},
													{
														Card: {
															cardTitle: '📚 Education Mission',
															cardText: 'Share knowledge about why complexity exists and how it can be eliminated through better architectural thinking.'
														}
													},
													{
														Card: {
															cardTitle: '🚀 Platform Evolution',
															cardText: 'Guide the Platform\'s evolution based on real-world usage while maintaining the core principle of simplicity.'
														}
													}
												]
											}
										}
									]
								}
							}]
						}
					},

					// The Call to Action Section
					{
						section: {
							className: 'page',
							style: {
								background: 'var(--orange)',
								color: 'white',
								textAlign: 'center'
							},
							children: [{
								div: {
									className: 'container',
									children: [
										{
											h2: {
												style: {
													fontSize: '2.5rem',
													fontWeight: '600',
													marginBottom: '2rem',
													letterSpacing: '-0.025em',
													color: 'white'
												},
												text: 'Join the Revolution'
											}
										},
										{
											p: {
												style: {
													fontSize: '1.25rem',
													lineHeight: '1.8',
													maxWidth: '700px',
													margin: '0 auto 2rem',
													color: 'white',
													fontWeight: '400'
												},
												text: 'Help us prove that complexity is a choice, not a requirement. Together, we can make development problems obsolete and restore the joy of building software.'
											}
										},
										{
											div: {
												style: {
													display: 'flex',
													justifyContent: 'center',
													gap: '1rem',
													flexWrap: 'wrap',
													marginTop: '2rem'
												},
												children: [
													{
														a: {
															href: '#/docs',
															className: 'btn',
															style: {
																background: 'white',
																color: 'var(--orange)',
																padding: '1rem 2rem',
																borderRadius: '0.5rem',
																textDecoration: 'none',
																fontWeight: '600',
																border: '2px solid white'
															},
															text: 'Start Building',
															onclick: (e) => {
																e.preventDefault();
																window.location.hash = '/docs';
															}
														}
													},
													{
														a: {
															href: 'https://github.com/jurisjs/juris',
															className: 'btn',
															style: {
																background: 'transparent',
																color: 'white',
																padding: '1rem 2rem',
																borderRadius: '0.5rem',
																textDecoration: 'none',
																fontWeight: '600',
																border: '2px solid white'
															},
															text: 'View Source',
															target: '_blank',
															rel: 'noopener noreferrer'
														}
													}
												]
											}
										}
									]
								}
							}]
						}
					}
				]
			}
		})
	};
};

const NotFoundPage = (props, context) => {
	return {
		render: () => ({
			div: {
				className: 'fade-in',
				children: [{
					section: {
						className: 'page',
						style: { textAlign: 'center', padding: '4rem 0' },
						children: [{
							div: {
								className: 'container',
								children: [
									{
										h1: {
											className: 'page-title',
											text: '404 - Page Not Found'
										}
									},
									{
										p: {
											className: 'page-subtitle',
											text: 'The page you\'re looking for doesn\'t exist.'
										}
									},
									{
										a: {
											href: '#/',
											className: 'btn btn-primary',
											text: 'Go Home',
											onclick: (e) => {
												e.preventDefault();
												window.location.hash = '/';
											}
										}
									}
								]
							}
						}]
					}
				}]
			}
		})
	};
};
const Footer = (props, context) => {
	return {
		render: () => ({
			footer: {
				className: 'footer',
				children: [{
					div: {
						className: 'container',
						children: [{
							div: {
								style: {
									display: 'grid',
									gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
									gap: '2rem',
									marginBottom: '2rem'
								},
								children: [
									{
										div: {
											children: [
												{
													h4: {
														text: 'Platform',
														style: {
															marginBottom: '1rem',
															color: 'var(--gray-900)',
															fontWeight: '600'
														}
													}
												},
												{
													div: {
														style: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
														children: [
															{
																a: {
																	href: '#/docs',
																	text: 'Documentation',
																	style: { color: 'var(--gray-600)', textDecoration: 'none' },
																	onclick: (e) => {
																		e.preventDefault();
																		window.location.hash = '/docs';
																	}
																}
															},
															{
																a: {
																	href: '#/examples',
																	text: 'Examples',
																	style: { color: 'var(--gray-600)', textDecoration: 'none' },
																	onclick: (e) => {
																		e.preventDefault();
																		window.location.hash = '/examples';
																	}
																}
															},
															{
																a: {
																	href: 'https://github.com/jurisjs/juris',
																	text: 'GitHub',
																	target: '_blank',
																	rel: 'noopener noreferrer',
																	style: { color: 'var(--gray-600)', textDecoration: 'none' }
																}
															},
															{
																a: {
																	href: 'https://www.npmjs.com/package/juris',
																	text: 'NPM Package',
																	target: '_blank',
																	rel: 'noopener noreferrer',
																	style: { color: 'var(--gray-600)', textDecoration: 'none' }
																}
															}
														]
													}
												}
											]
										}
									},
									{
										div: {
											children: [
												{
													h4: {
														text: 'Community',
														style: {
															marginBottom: '1rem',
															color: 'var(--gray-900)',
															fontWeight: '600'
														}
													}
												},
												{
													div: {
														style: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
														children: [
															{
																a: {
																	href: 'https://discord.gg/P6eunCtK6J',
																	text: 'Discord',
																	target: '_blank',
																	rel: 'noopener noreferrer',
																	style: { color: 'var(--gray-600)', textDecoration: 'none' }
																}
															},
															{
																a: {
																	href: 'https://x.com/jurisjs',
																	text: 'Twitter',
																	target: '_blank',
																	rel: 'noopener noreferrer',
																	style: { color: 'var(--gray-600)', textDecoration: 'none' }
																}
															},
															{
																a: {
																	href: 'https://www.reddit.com/r/jurisjs/',
																	text: 'Reddit',
																	target: '_blank',
																	rel: 'noopener noreferrer',
																	style: { color: 'var(--gray-600)', textDecoration: 'none' }
																}
															},
															{
																a: {
																	href: 'https://stackoverflow.com/questions/tagged/juris',
																	text: 'Stack Overflow',
																	target: '_blank',
																	rel: 'noopener noreferrer',
																	style: { color: 'var(--gray-600)', textDecoration: 'none' }
																}
															}
														]
													}
												}
											]
										}
									},
									{
										div: {
											children: [
												{
													h4: {
														text: 'Resources',
														style: {
															marginBottom: '1rem',
															color: 'var(--gray-900)',
															fontWeight: '600'
														}
													}
												},
												{
													div: {
														style: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },//TODO: set display back to flex when available
														children: [
															{
																a: {
																	href: '#/docs/components',
																	text: 'API Reference',
																	style: { color: 'var(--gray-600)', textDecoration: 'none' },
																	onclick: (e) => {
																		e.preventDefault();
																		window.location.hash = '/docs/components';
																	}
																}
															},
															{
																a: {
																	href: 'https://medium.com/@resti.guay',
																	text: 'Blog',
																	target: '_blank',
																	rel: 'noopener noreferrer',
																	style: { color: 'var(--gray-600)', textDecoration: 'none' }
																}
															},
															{
																a: {
																	href: 'mailto:support@jurisjs.com',
																	text: 'Support',
																	style: { color: 'var(--gray-600)', textDecoration: 'none' }
																}
															}
														]
													}
												}
											]
										}
									},
									{
										div: {
											children: [
												{
													h4: {
														text: 'Company',
														style: {
															marginBottom: '1rem',
															color: 'var(--gray-900)',
															fontWeight: '600'
														}
													}
												},
												{
													div: {
														style: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },//TODO: set display back to flex when available
														children: [
															{
																a: {
																	href: '#/about',
																	text: 'About',
																	style: { color: 'var(--gray-600)', textDecoration: 'none' },
																	onclick: (e) => {
																		e.preventDefault();
																		window.location.hash = '/about';
																	}
																}
															},
														]
													}
												}
											]
										}
									}
								]
							}
						},
						{
							div: {
								style: {
									borderTop: '1px solid var(--gray-200)',
									paddingTop: '2rem',
									textAlign: 'center'
								},
								children: [{
									div: {
										className: 'footer-content',
										text: '© 2025 Built with Juris Platform. Inspect the browser DevTools to see the code in action. '
									}
								}]
							}
						}]
					}
				}]
			}
		})
	};
};
/**
 * @param {Object} props
 * @param {JurisContextBase} context
 * @returns {JurisVDOMElement}
 */
const AppLayout = (props, context) => {
	const { getState } = context;

	return {
		render: () => ({
			div: {
				children: [
					{ Header: {} },
					{
						main: {
							className: 'main',
							children: () => {
								const segments = getState('url.segments', { base: '' });

								switch (segments.base) {
									case '':
										return [{ HomePage: {} }];
									case 'solutions':
										return [{ SolutionsPage: {} }];
									case 'docs':
										return [{ DocsPage: {} }];
									case 'examples':
										return [{ ExamplesPage: {} }];
									case 'about':
										return [{ AboutPage: {} }];
									default:
										return [{ NotFoundPage: {} }];
								}
							}
						}
					},
					{
						Footer: {}
					}
				]
			}
		})
	};
};
/**
 * @param {Object} props
 * @param {JurisContextBase} context
 * @returns {JurisVDOMElement}
 */
const Counter = (props, context) => {
	const { getState, setState } = context;

	return {
		render: () => ({
			button: {
				id: Math.random().toString(36).substring(2, 15),
				className: 'btn btn-primary',
				text: () => `Clicked ${getState('demo.counter', 0)} times`,
				onclick: () => setState('demo.counter', getState('demo.counter', 0) + 1)
			}
		})
	};
};
// ==================== APPLICATION INITIALIZATION ====================
const juris = new Juris({
    features: {
        headless: HeadlessManager,
        enhance: DOMEnhancer,
        template: TemplateCompiler,
        webComponentFactory: WebComponentFactory,
        //cssExtractor: CSSExtractor
        
    },
	renderMode: 'fine-grained', // Disables reconciliation
	logLevel: 'warn', // Set to 'debug' for detailed logs, warn for production
	components: {
		Card,
		AppLayout,
		Header,
		Hero,
		CodeBlock,
		HomePage,
		SolutionsPage,
		DocsPage,
		DocsIntro,
		DocsComponents,
		DocsState,
		DocsRouting,
		DocsHeadless,
		ExamplesPage,
		AboutPage,
		NotFoundPage,
		Counter,
		Footer,
		PhilosophySection,
		RandomTagline,
		DocsAdvancedPatterns,
		DocsJSONStreaming,
		DocsControlFlow,
		DocsEnhanceAPI
	},

	headlessComponents: {
		// Enhanced StatePersistenceManager with timing controls
		StatePersistenceManager: {
			fn: StatePersistenceManager,
			options: {
				autoInit: true,

				// IMPORTANT: Exclude mobile menu state from persistence
				excludeDomains: [
					'temp',
					'cache',
					'session',
					'geolocation',
					'persistence'
					// Add these UI states that shouldn't persist:
					// 'ui.mobileMenuOpen' // Actually, let's be more specific
				],

				// OR better approach - exclude specific UI states:
				excludePaths: [
					'ui.mobileMenuOpen',  // Don't persist mobile menu state
					'ui.device',          // Don't persist device info (it's detected fresh)
					// Add other transient UI states here
				],

				debug: true,
				keyPrefix: 'juris_docs_',

				// Other existing config...
				aggressiveRestore: true,
				restoreDelay: 0,
				priorityDomains: ['demo'], // Remove 'ui' from priority to prevent mobile menu restore
				earlyRestoreTimeout: 0,

				domainRestoreConfig: {
					// Remove ui from restore config or make it skip mobile menu
					demo: {
						priority: 1,
						delay: 0,
						aggressive: true
					},
					settings: {
						priority: 3,
						delay: 100,
						aggressive: false
					}
				},

				immediateSave: [],
				criticalSave: [],  // Remove 'ui' from critical save
				criticalDebounceMs: 200,
				debounceMs: 1000,

				autoDetectNewDomains: true,
				watchIntervalMs: 5000
			}
		},
		UrlStateSync: {
			fn: UrlStateSync,
			options: {
				autoInit: true,
				config: {
					// Your route configuration here
					routes: {
						'/': { guards: [] },
						'/docs': { guards: [] },
						'/docs/components': { guards: [] },
						'/docs/state': { guards: [] },
						'/docs/routing': { guards: [] },
						'/solutions': { guards: [] },
						'/advanced': { guards: [] },
						'/examples': { guards: [] },
						'/about': { guards: [] }
					},
					debug: true // Enable for development
				}
			}
		},
		//SecurityManager: { fn: SecurityManager, options: { autoInit: true } },
		DeviceManager: { fn: DeviceManager, options: { autoInit: true } },
		//GeolocationManager: { fn: GeolocationManager, options: { autoInit: true } },
	},

	layout: {
		div: {
			children: [{ AppLayout: {} }]
		}
	},

	states: {
		url: {
			path: '/',
			query: {},
			segments: { full: '/', parts: [], base: '', sub: '', section: '' }
		},
		ui: {
			mobileMenuOpen: false
		},
		demo: {          // ADD this section
			counter: 0
		}
	}
});
juris.setupLogging('info')
// Start the application
juris.render('#app');
juris.enhance('#counter-btn', {
	id: Math.random().toString(36).substring(2, 15),
	text: () => `Clicked ${juris.getState('enhance.counter', 0)} times`,
	onclick: () => {
		juris.setState('enhance.counter', juris.getState('enhance.counter', 0) + 1)
	}
}, {
	batchUpdates: true,        // Process multiple elements together
	debounceMs: 16,           // Debounce rapid DOM changes
	observeNewElements: true  // Auto-enhance dynamically added elements

});


// Global access for debugging
//window.juris = juris;

console.log('🚀 Website Ready - Making Problems Obsolete!');
const endTime = performance.now();
console.log(`🕒 Initialization Time: ${endTime - startTime} ms`);
juris.setState('metrics.renderTime', {
	start: startTime,
	end: endTime,
	duration: endTime - startTime
});
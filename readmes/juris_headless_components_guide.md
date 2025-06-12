# Juris Headless Components Guide

## Overview

Headless components in Juris provide stateful logic and business functionality without UI rendering. They expose APIs that other components can consume, enabling clean separation of concerns and reusable business logic.

## Registration and Initialization

### Basic Registration
```javascript
juris.registerHeadlessComponent('notifications', (props, context) => {
  // Component logic here
  return {
    api: { /* public methods */ },
    hooks: { /* lifecycle hooks */ }
  };
});
```

### With Auto-Initialization
```javascript
juris.registerHeadlessComponent('auth', authComponent, {
  autoInit: true  // Initializes immediately
});
```

### Manual Initialization
```javascript
const instance = juris.initializeHeadlessComponent('dataStore', {
  endpoint: '/api/data',
  cacheTimeout: 5000
});
```

## Component Structure

A headless component returns an object with:

```javascript
function myHeadlessComponent(props, context) {
  return {
    // Public API exposed to other components
    api: {
      method1: () => { /* implementation */ },
      method2: (param) => { /* implementation */ }
    },
    
    // Lifecycle hooks (optional)
    hooks: {
      onRegister: () => { /* initialization */ },
      onUnregister: () => { /* cleanup */ }
    }
  };
}
```

## Context Properties

The context parameter provides:

### State Management
- **getState(path, defaultValue)** - Read reactive state
- **setState(path, value, context)** - Update state
- **subscribe(path, callback)** - Subscribe to changes

### Services Access
- **services** - All registered services object
- **...services** - Individual services via spread

### Inter-Component Communication
- **headless** - Other headless component APIs
- **...headlessAPIs** - Direct API access

### Component Management
- **components.register(name, component)** - Register UI component
- **components.registerHeadless(name, component, options)** - Register headless
- **components.get(name)** - Get UI component
- **components.getHeadless(name)** - Get headless instance
- **components.initHeadless(name, props)** - Initialize headless
- **components.reinitHeadless(name, props)** - Reinitialize
- **components.getHeadlessAPI(name)** - Get specific API
- **components.getAllHeadlessAPIs()** - Get all APIs

### Utilities
- **utils.render(container)** - Trigger render
- **utils.cleanup()** - Clean resources
- **utils.getHeadlessStatus()** - Get status info
- **juris** - Direct framework access

## Common Patterns

### 1. State Management Store
```javascript
juris.registerHeadlessComponent('userStore', (props, context) => {
  const { setState, getState, subscribe } = context;
  
  return {
    api: {
      login: async (credentials) => {
        setState('user.loading', true);
        try {
          const user = await context.services.auth.login(credentials);
          setState('user.data', user);
          setState('user.authenticated', true);
        } catch (error) {
          setState('user.error', error.message);
        } finally {
          setState('user.loading', false);
        }
      },
      
      logout: () => {
        setState('user.data', null);
        setState('user.authenticated', false);
        setState('user.error', null);
      },
      
      getUser: () => getState('user.data'),
      isAuthenticated: () => getState('user.authenticated', false),
      isLoading: () => getState('user.loading', false),
      getError: () => getState('user.error')
    }
  };
});
```

### 2. API Client Wrapper
```javascript
juris.registerHeadlessComponent('apiClient', (props, context) => {
  const baseURL = props.baseURL || '/api';
  
  return {
    api: {
      get: async (endpoint) => {
        const response = await fetch(`${baseURL}${endpoint}`);
        return response.json();
      },
      
      post: async (endpoint, data) => {
        const response = await fetch(`${baseURL}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        return response.json();
      },
      
      withAuth: () => {
        const token = context.getState('user.token');
        return {
          headers: { Authorization: `Bearer ${token}` }
        };
      }
    }
  };
});
```

### 3. Event Bus/Notification System
```javascript
juris.registerHeadlessComponent('eventBus', (props, context) => {
  const listeners = new Map();
  
  return {
    api: {
      emit: (event, data) => {
        const eventListeners = listeners.get(event) || [];
        eventListeners.forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            console.error(`Event listener error for ${event}:`, error);
          }
        });
      },
      
      on: (event, callback) => {
        if (!listeners.has(event)) {
          listeners.set(event, []);
        }
        listeners.get(event).push(callback);
        
        // Return unsubscribe function
        return () => {
          const eventListeners = listeners.get(event);
          if (eventListeners) {
            const index = eventListeners.indexOf(callback);
            if (index > -1) {
              eventListeners.splice(index, 1);
            }
          }
        };
      },
      
      off: (event, callback) => {
        const eventListeners = listeners.get(event);
        if (eventListeners) {
          const index = eventListeners.indexOf(callback);
          if (index > -1) {
            eventListeners.splice(index, 1);
          }
        }
      }
    },
    
    hooks: {
      onUnregister: () => {
        listeners.clear();
      }
    }
  };
});
```

### 4. Cache Manager
```javascript
juris.registerHeadlessComponent('cache', (props, context) => {
  const cache = new Map();
  const ttl = props.ttl || 300000; // 5 minutes default
  
  return {
    api: {
      set: (key, value, customTTL) => {
        const expiresAt = Date.now() + (customTTL || ttl);
        cache.set(key, { value, expiresAt });
      },
      
      get: (key) => {
        const item = cache.get(key);
        if (!item) return null;
        
        if (Date.now() > item.expiresAt) {
          cache.delete(key);
          return null;
        }
        
        return item.value;
      },
      
      has: (key) => {
        const item = cache.get(key);
        if (!item) return false;
        
        if (Date.now() > item.expiresAt) {
          cache.delete(key);
          return false;
        }
        
        return true;
      },
      
      clear: () => cache.clear(),
      size: () => cache.size
    }
  };
});
```

### 5. Form Validation
```javascript
juris.registerHeadlessComponent('formValidator', (props, context) => {
  const rules = props.rules || {};
  
  return {
    api: {
      validate: (formData) => {
        const errors = {};
        
        Object.keys(rules).forEach(field => {
          const value = formData[field];
          const fieldRules = rules[field];
          
          fieldRules.forEach(rule => {
            if (rule.required && (!value || value.trim() === '')) {
              errors[field] = rule.message || `${field} is required`;
            } else if (rule.pattern && !rule.pattern.test(value)) {
              errors[field] = rule.message || `${field} is invalid`;
            } else if (rule.minLength && value.length < rule.minLength) {
              errors[field] = rule.message || `${field} is too short`;
            }
          });
        });
        
        return {
          isValid: Object.keys(errors).length === 0,
          errors
        };
      },
      
      validateField: (field, value) => {
        const fieldRules = rules[field] || [];
        for (const rule of fieldRules) {
          if (rule.required && (!value || value.trim() === '')) {
            return { isValid: false, error: rule.message || `${field} is required` };
          }
          if (rule.pattern && !rule.pattern.test(value)) {
            return { isValid: false, error: rule.message || `${field} is invalid` };
          }
        }
        return { isValid: true, error: null };
      }
    }
  };
});
```

## Cross-Component Communication

### Accessing Other Headless APIs
```javascript
juris.registerHeadlessComponent('orderService', (props, context) => {
  return {
    api: {
      createOrder: async (orderData) => {
        // Access other headless components
        const userStore = context.components.getHeadlessAPI('userStore');
        const apiClient = context.components.getHeadlessAPI('apiClient');
        const eventBus = context.components.getHeadlessAPI('eventBus');
        
        if (!userStore.isAuthenticated()) {
          throw new Error('User must be authenticated');
        }
        
        const order = await apiClient.post('/orders', {
          ...orderData,
          userId: userStore.getUser().id
        });
        
        eventBus.emit('order:created', order);
        return order;
      }
    }
  };
});
```

### State Coordination
```javascript
juris.registerHeadlessComponent('appState', (props, context) => {
  return {
    api: {
      initialize: () => {
        // Set up coordinated state
        context.setState('app.initialized', true);
        context.setState('app.theme', 'light');
        context.setState('app.sidebar.open', false);
      },
      
      toggleTheme: () => {
        const current = context.getState('app.theme');
        context.setState('app.theme', current === 'light' ? 'dark' : 'light');
      },
      
      toggleSidebar: () => {
        const current = context.getState('app.sidebar.open', false);
        context.setState('app.sidebar.open', !current);
      }
    },
    
    hooks: {
      onRegister: () => {
        // Auto-initialize app state
        context.setState('app.initialized', true);
      }
    }
  };
});
```

## Lifecycle Management

### Using Lifecycle Hooks
```javascript
juris.registerHeadlessComponent('websocketManager', (props, context) => {
  let ws = null;
  
  return {
    api: {
      send: (message) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
        }
      },
      
      isConnected: () => ws && ws.readyState === WebSocket.OPEN
    },
    
    hooks: {
      onRegister: () => {
        ws = new WebSocket(props.url || 'ws://localhost:8080');
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          context.setState('websocket.lastMessage', data);
        };
      },
      
      onUnregister: () => {
        if (ws) {
          ws.close();
          ws = null;
        }
      }
    }
  };
});
```

## Management Methods

### Status and Control
```javascript
// Get status of all headless components
const status = juris.getHeadlessStatus();
console.log(status);
// {
//   registered: ['userStore', 'apiClient', 'eventBus'],
//   initialized: ['userStore', 'apiClient'],
//   queued: ['eventBus'],
//   apis: ['userStore', 'apiClient']
// }

// Reinitialize with new props
juris.headlessManager.reinitialize('apiClient', { 
  baseURL: '/api/v2' 
});

// Access instance directly
const userStoreInstance = juris.getHeadlessComponent('userStore');
```

### Dynamic Registration
```javascript
// Register and initialize in one step
const instance = juris.registerAndInitHeadless('dynamicService', (props, context) => {
  return {
    api: {
      process: (data) => {
        // Dynamic functionality
        return data.map(item => ({ ...item, processed: true }));
      }
    }
  };
}, { autoInit: true });
```

## Best Practices

1. **Single Responsibility** - Each headless component should have one clear purpose
2. **API Design** - Keep APIs simple and predictable
3. **Error Handling** - Always handle errors gracefully in async operations
4. **State Coordination** - Use consistent state paths across components
5. **Cleanup** - Implement onUnregister hooks for resource cleanup
6. **Testing** - Headless components are easy to unit test in isolation
# Juris Subscribe API & Context Values Reference

## Subscribe API Overview

The Juris framework provides a robust subscription system for reactive state management. The `subscribe` method allows you to listen to state changes at specific paths.

### Basic Subscribe API

```javascript
// Basic subscription
const unsubscribe = context.subscribe(path, callback);

// Example usage
const unsubscribe = context.subscribe('user.profile.name', (newValue, oldValue, path) => {
    console.log(`${path} changed from ${oldValue} to ${newValue}`);
});

// Clean up subscription
unsubscribe();
```

### Subscribe Method Signature

```javascript
subscribe(path: string, callback: (newValue: any, oldValue: any, path: string) => void): () => void
```

**Parameters:**
- `path` (string): Dot-notation path to the state property (e.g., 'user.profile.name')
- `callback` (function): Function called when the state changes
  - `newValue`: The new value after the change
  - `oldValue`: The previous value before the change  
  - `path`: The path that changed

**Returns:**
- Function to unsubscribe from the state changes

### Subscription Features

1. **Hierarchical Notifications**: Subscribing to a parent path will trigger for child changes
2. **Automatic Cleanup**: Returns an unsubscribe function for cleanup
3. **Error Handling**: Subscriber errors are caught and logged without breaking other subscribers
4. **Circular Dependency Detection**: Prevents infinite update loops

## Complete Context API Reference

Juris provides two types of contexts with different capabilities:

### 1. Standard Context (`createContext`)

This is the main context used in UI components and enhanced DOM elements.

```javascript
const context = {
    // === STATE MANAGEMENT ===
    getState: (path, defaultValue) => any,
    setState: (path, value, context) => void,
    subscribe: (path, callback) => unsubscribeFunction,

    // === SERVICES ACCESS ===
    services: object,                    // User-defined services
    ...services,                        // Services spread directly onto context

    // === HEADLESS COMPONENT APIS ===
    ...headlessAPIs,                    // All headless component APIs spread directly
    headless: object,                   // Namespace for headless component APIs

    // === COMPONENT MANAGEMENT ===
    components: {
        register: (name, component) => void,
        registerHeadless: (name, component, options) => void,
        get: (name) => componentFunction,
        getHeadless: (name) => headlessInstance,
        initHeadless: (name, props) => headlessInstance,
        reinitHeadless: (name, props) => headlessInstance,
        getHeadlessAPI: (name) => api,
        getAllHeadlessAPIs: () => object
    },

    // === UTILITIES ===
    utils: {
        render: (container) => void,
        cleanup: () => void,
        forceRender: () => void,
        setRenderMode: (mode) => void,        // 'fine-grained' or 'batch'
        getRenderMode: () => string,
        isFineGrained: () => boolean,
        isBatchMode: () => boolean,
        getHeadlessStatus: () => object,
    },

    // === DIRECT ACCESS ===
    juris: JurisInstance,               // Direct access to Juris instance
    element: HTMLElement                // DOM element (when applicable)
}
```

### 2. Headless Context (`createHeadlessContext`)

Specialized context for headless components with reduced UI-specific features.

```javascript
const headlessContext = {
    // === CORE STATE MANAGEMENT ===
    getState: (path, defaultValue) => any,
    setState: (path, value, context) => void,
    subscribe: (path, callback) => unsubscribeFunction,

    // === SERVICES ACCESS ===
    services: object,                    // User-defined services
    ...services,                        // Services spread directly onto context

    // === HEADLESS COMPONENT ACCESS ===
    headless: object,                   // Other headless component APIs
    ...headlessAPIs,                    // All headless APIs spread directly

    // === COMPONENT MANAGEMENT ===
    components: {
        register: (name, component) => void,
        registerHeadless: (name, component, options) => void,
        get: (name) => componentFunction,
        getHeadless: (name) => headlessInstance,
        initHeadless: (name, props) => headlessInstance,
        reinitHeadless: (name, props) => headlessInstance
    },

    // === UTILITIES ===
    utils: {
        render: (container) => void,
        cleanup: () => void,
        forceRender: () => void,
        getHeadlessStatus: () => object
    },

    // === DIRECT ACCESS ===
    juris: JurisInstance,               // Direct access to Juris instance
    element: HTMLElement                // DOM element (when provided)
}
```

## State Management Deep Dive

### State Path Notation

Juris uses dot notation for state paths:

```javascript
// Simple property
context.setState('username', 'john');
context.getState('username'); // 'john'

// Nested objects
context.setState('user.profile.name', 'John Doe');
context.setState('user.profile.email', 'john@example.com');
context.getState('user.profile'); // { name: 'John Doe', email: 'john@example.com' }

// Arrays
context.setState('todos.0.completed', true);
context.setState('todos.1.text', 'Updated task');
```

### Advanced Subscription Patterns

```javascript
// Listen to specific property
context.subscribe('user.name', (newName, oldName) => {
    console.log(`Name changed: ${oldName} → ${newName}`);
});

// Listen to entire object changes
context.subscribe('user', (newUser, oldUser) => {
    console.log('User object changed:', newUser);
});

// Listen to array changes
context.subscribe('todos', (newTodos, oldTodos) => {
    console.log(`Todo count: ${oldTodos?.length || 0} → ${newTodos?.length || 0}`);
});

// Multiple subscriptions with cleanup
const subscriptions = [
    context.subscribe('theme', updateTheme),
    context.subscribe('user.preferences', updateUI),
    context.subscribe('notifications', showNotifications)
];

// Cleanup all subscriptions
const cleanup = () => subscriptions.forEach(unsub => unsub());
```

## Services Integration

Services are custom objects/functions you provide during Juris initialization:

```javascript
const juris = new Juris({
    services: {
        api: {
            fetchUser: (id) => fetch(`/api/users/${id}`),
            saveUser: (user) => fetch('/api/users', { method: 'POST', body: JSON.stringify(user) })
        },
        storage: {
            get: (key) => localStorage.getItem(key),
            set: (key, value) => localStorage.setItem(key, value)
        },
        utils: {
            formatDate: (date) => new Intl.DateTimeFormat().format(date),
            generateId: () => Math.random().toString(36).substr(2, 9)
        }
    }
});

// In any component or context:
context.services.api.fetchUser(123);
// OR directly:
context.api.fetchUser(123);

context.services.storage.set('theme', 'dark');
// OR directly:
context.storage.set('theme', 'dark');
```

## Headless Component APIs

Headless components can expose APIs that become available throughout the application:

```javascript
// Register a headless component with API
juris.registerHeadlessComponent('auth', (props, context) => {
    return {
        api: {
            login: (credentials) => { /* login logic */ },
            logout: () => { /* logout logic */ },
            getCurrentUser: () => context.getState('auth.currentUser'),
            isAuthenticated: () => !!context.getState('auth.currentUser')
        },
        hooks: {
            onRegister: () => console.log('Auth system initialized')
        }
    };
});

// In any other component:
context.auth.login({ username: 'user', password: 'pass' });
// OR:
context.headless.auth.login({ username: 'user', password: 'pass' });
```

## Component Management

The `components` object provides methods for dynamic component management:

```javascript
// Register new components at runtime
context.components.register('MyButton', (props, ctx) => ({
    button: {
        text: props.label,
        onclick: props.onClick,
        className: 'btn btn-primary'
    }
}));

// Register headless components
context.components.registerHeadless('dataService', (props, ctx) => ({
    api: {
        fetchData: () => { /* fetch logic */ }
    }
}));

// Get component instances
const buttonComponent = context.components.get('MyButton');
const dataService = context.components.getHeadless('dataService');

// Initialize headless components dynamically
context.components.initHeadless('newService', { config: 'value' });
```

## Utilities Reference

### Render Mode Control

```javascript
// Switch rendering modes
context.utils.setRenderMode('fine-grained');  // Direct DOM updates (more compatible)
context.utils.setRenderMode('batch');         // VDOM-style reconciliation (higher performance)

// Check current mode
const mode = context.utils.getRenderMode();   // 'fine-grained' | 'batch'
const isFineGrained = context.utils.isFineGrained();
const isBatch = context.utils.isBatchMode();
```

### Rendering and Cleanup

```javascript
// Force re-render
context.utils.forceRender();

// Render to specific container
context.utils.render('#my-container');

// Cleanup resources
context.utils.cleanup();

// Get headless component status
const status = context.utils.getHeadlessStatus();
// Returns: { registered: [], initialized: [], queued: [], apis: [] }
```

## Best Practices

### 1. Subscription Management

```javascript
// ✅ Good: Always clean up subscriptions
const MyComponent = (props, context) => {
    const subscriptions = [];
    
    const cleanup = () => {
        subscriptions.forEach(unsub => unsub());
    };
    
    subscriptions.push(
        context.subscribe('user', updateUserUI)
    );
    
    return {
        render: () => ({ /* JSX-like object */ }),
        hooks: {
            onUnmount: cleanup
        }
    };
};
```

### 2. State Organization

```javascript
// ✅ Good: Hierarchical state structure
context.setState('app.user.profile.name', 'John');
context.setState('app.user.preferences.theme', 'dark');
context.setState('app.ui.modal.visible', true);

// ❌ Avoid: Flat structure
context.setState('userName', 'John');
context.setState('userTheme', 'dark');
context.setState('modalVisible', true);
```

### 3. Service Usage

```javascript
// ✅ Good: Use services for external dependencies
const handleSave = async () => {
    const user = context.getState('currentUser');
    await context.api.saveUser(user);
    context.storage.set('lastSaved', Date.now());
};

// ❌ Avoid: Direct external calls in components
const handleSave = async () => {
    const user = context.getState('currentUser');
    await fetch('/api/users', { /* ... */ }); // Direct dependency
};
```

This comprehensive reference covers all aspects of the Juris subscribe API and the complete context values available in both standard and headless contexts.
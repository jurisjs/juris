# 🎯 Juris Hooks Ecosystem

> **React-like useState and custom hooks for the Juris framework**

Transform your Juris applications with familiar React-style state management through a powerful headless component that injects `useState` and custom hooks into all component contexts.

## 🚨 Critical: Headless Component Order

**⚠️ IMPORTANT:** The state manager headless component **MUST** be registered **FIRST** among headless components that need hook APIs.

### ❌ Wrong Order (Other Headless Components Won't Have Hooks):
```javascript
const juris = new Juris({
    headlessComponents: {
        myDataManager: {
            fn: (props, context) => {
                const [data, setData] = context.useState('data', []); // ❌ TypeError!
                return { api: { getData: () => data } };
            }
        },
        stateManager: { 
            fn: createExtendableStateManager([TimerHooks]) // Too late for myDataManager!
        }
    }
});
```

### ✅ Correct Order (All Headless Components Get Hooks):
```javascript
const juris = new Juris({
    headlessComponents: {
        // 1️⃣ STATE MANAGER FIRST
        stateManager: { 
            fn: createExtendableStateManager([TimerHooks, UIHooks]),
            options: { autoInit: true }
        },
        
        // 2️⃣ OTHER HEADLESS COMPONENTS AFTER
        myDataManager: {
            fn: (props, context) => {
                const [data, setData] = context.useState('data', []); // ✅ Works!
                return { api: { getData: () => data } };
            }
        }
    },
    
    // 3️⃣ REGULAR COMPONENTS (Order doesn't matter - always get hooks)
    components: {
        MyComponent: (props, context) => {
            const [count, setCount] = context.useState('count', 0); // ✅ Always works!
        }
    }
});
```

### 📋 Why Order Matters:
1. **Headless components** are initialized in registration order
2. **State manager** patches `createHeadlessContext()` in its `onRegister` hook
3. **Later headless components** get the enhanced context with hooks
4. **Regular components** always get enhanced context (processed after all headless)

**Put the state manager FIRST among headless components!** 🎯

## 🚀 Quick Start

```javascript
import { createExtendableStateManager, TimerHooks, UIHooks } from 'juris-hooks';

const juris = new Juris({
    headlessComponents: {
        stateManager: {
            fn: createExtendableStateManager([TimerHooks, UIHooks]),
            options: { autoInit: true }
        }
    },
    
    components: {
        MyComponent: (props, context) => {
            // ✨ useState works just like React!
            const [getCount, setCount] = context.useState('counter', 0);
            const timer = context.useTimer(1000);
            
            return {
                render: () => ({
                    div: {
                        children: [
                            { p: { text: () => `Count: ${getCount()}` } },
                            { button: { 
                                text: 'Increment', 
                                onclick: () => setCount(count => count + 1) 
                            }}
                        ]
                    }
                })
            };
        }
    }
});
```

## 🎯 Why Juris Hooks?

### **Familiar React-like API**
```javascript
// Instead of this:
const count = context.getState('counter', 0);
context.setState('counter', count + 1);

// Write this:
const [getCount, setCount] = context.useState('counter', 0);
setCount(count => count + 1);
```

### **Automatic Reactivity**
- ✅ UI updates automatically when state changes
- ✅ Built on Juris's proven state management system
- ✅ Performance optimized with intelligent caching

### **Extensible Hook System**
- 📦 Install only the hooks you need
- 🔌 Community-driven hook collections
- 🎨 Create and share your own hooks easily

## 📦 Installation

```bash
npm install juris-hooks

# Optional hook collections
npm install juris-timer-hooks
npm install juris-ui-hooks  
npm install juris-storage-hooks
npm install juris-animation-hooks
```

## 🔧 Core API

### `useState(path, defaultValue)`
React-like state management with Juris paths.

```javascript
const [getValue, setValue] = context.useState('user.name', 'John');

// Functional updates (like React)
setValue(currentName => currentName.toUpperCase());

// Direct updates  
setValue('Jane');
```

### `useSubscribe(path, callback)`
Subscribe to state changes with automatic cleanup.

```javascript
const unsubscribe = context.useSubscribe('user.theme', (newTheme) => {
    console.log('Theme changed to:', newTheme);
});
```

### `useLocalState(initialValue)`
Component-local state that doesn't pollute global state.

```javascript
const [getValue, setValue] = context.useLocalState(0);
// This state is isolated to this component instance
```

## 🏪 Hook Collections

### Timer Hooks (`juris-timer-hooks`)

```javascript
import { TimerHooks } from 'juris-timer-hooks';

// In your component:
const timer = context.useTimer(1000);
const interval = context.useInterval(() => console.log('tick'), 5000);

// Usage:
timer.start();    // Start counting
timer.stop();     // Stop timer
timer.reset();    // Reset to 0
console.log(timer.count()); // Get current count
```

### UI Hooks (`juris-ui-hooks`)

```javascript
import { UIHooks } from 'juris-ui-hooks';

const [getVisible, toggleVisible] = context.useToggle(true);
const counter = context.useCounter(0);
const input = context.useInput('');

// Usage:
<input value={input.value} oninput={input.onInput} />
<button onclick={counter.increment}>Count: {counter.count()}</button>
<button onclick={toggleVisible}>Toggle</button>
```

### Storage Hooks (`juris-storage-hooks`)

```javascript
import { StorageHooks } from 'juris-storage-hooks';

const [getTheme, setTheme] = context.useLocalStorage('theme', 'light');
const [getSession, setSession] = context.useSessionStorage('user', null);

// Automatically syncs with browser storage
setTheme('dark'); // Saved to localStorage
```

## 🎨 Creating Custom Hook Collections

Hook collections are simple objects that extend the base API:

```javascript
const MyHooks = {
    useGeolocation: (context, { useState }) => () => {
        const [getPosition, setPosition] = useState('geo.position', null);
        const [getError, setError] = useState('geo.error', null);

        const getCurrentPosition = () => {
            navigator.geolocation.getCurrentPosition(
                (pos) => setPosition({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                }),
                (err) => setError(err.message)
            );
        };

        return {
            position: getPosition,
            error: getError,
            getCurrentPosition,
            isSupported: () => !!navigator.geolocation
        };
    },

    useDebounce: (context, { useState }) => (callback, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => callback(...args), delay);
        };
    }
};

// Use in your app:
const stateManager = createExtendableStateManager([MyHooks]);
```

## 🏗️ Architecture

### How It Works

1. **Headless Component**: Registers as a Juris headless component
2. **Context Injection**: Automatically injects APIs into all component contexts
3. **Path-Based State**: Uses Juris's proven path-based state management
4. **Automatic Reactivity**: UI updates automatically via Juris's tracking system

### Performance Features

- ✅ **State Caching**: Frequently accessed state is cached
- ✅ **Optimized Subscriptions**: Automatic cleanup and batching
- ✅ **Minimal Global State**: Local state options to avoid pollution
- ✅ **Resource Pooling**: Advanced patterns for extreme scale

## 📋 Complete Example

```javascript
import { 
    createExtendableStateManager,
    TimerHooks,
    UIHooks,
    StorageHooks 
} from 'juris-hooks';

const juris = new Juris({
    headlessComponents: {
        stateManager: {
            fn: createExtendableStateManager([
                TimerHooks,
                UIHooks, 
                StorageHooks
            ]),
            options: { autoInit: true, debug: true }
        }
    },

    components: {
        TodoApp: (props, context) => {
            // Multiple hooks working together
            const [getTodos, setTodos] = context.useState('todos', []);
            const input = context.useInput('');
            const [getFilter, setFilter] = context.useToggle('all');
            const [getTheme, setTheme] = context.useLocalStorage('theme', 'light');

            const addTodo = () => {
                if (input.value().trim()) {
                    setTodos(todos => [...todos, {
                        id: Date.now(),
                        text: input.value(),
                        completed: false
                    }]);
                    input.clear();
                }
            };

            const toggleTodo = (id) => {
                setTodos(todos => todos.map(todo =>
                    todo.id === id 
                        ? { ...todo, completed: !todo.completed }
                        : todo
                ));
            };

            return {
                render: () => ({
                    div: {
                        className: () => `todo-app theme-${getTheme()}`,
                        children: [
                            {
                                div: {
                                    children: [
                                        {
                                            input: {
                                                placeholder: 'Add todo...',
                                                value: input.value,
                                                oninput: input.onInput,
                                                onkeypress: (e) => {
                                                    if (e.key === 'Enter') addTodo();
                                                }
                                            }
                                        },
                                        {
                                            button: {
                                                text: 'Add',
                                                onclick: addTodo
                                            }
                                        }
                                    ]
                                }
                            },
                            {
                                ul: {
                                    children: () => getTodos().map(todo => ({
                                        li: {
                                            key: todo.id,
                                            style: {
                                                textDecoration: todo.completed ? 'line-through' : 'none'
                                            },
                                            onclick: () => toggleTodo(todo.id),
                                            text: todo.text
                                        }
                                    }))
                                }
                            },
                            {
                                button: {
                                    text: () => `Theme: ${getTheme()}`,
                                    onclick: () => setTheme(
                                        current => current === 'light' ? 'dark' : 'light'
                                    )
                                }
                            }
                        ]
                    }
                })
            };
        }
    },

    layout: { TodoApp: {} }
});

juris.render('#app');
```

## 🤝 Community

### Available Hook Collections

| Package | Hooks | Description |
|---------|-------|-------------|
| `juris-timer-hooks` | `useTimer`, `useInterval`, `useTimeout` | Time-based utilities |
| `juris-ui-hooks` | `useToggle`, `useCounter`, `useInput` | Common UI patterns |
| `juris-storage-hooks` | `useLocalStorage`, `useSessionStorage` | Browser storage |
| `juris-animation-hooks` | `useAnimation`, `useSpring` | Animation utilities |
| `juris-api-hooks` | `useFetch`, `useWebSocket` | API interactions |
| `juris-form-hooks` | `useForm`, `useValidation` | Form management |

### Contributing

1. **Create a hook collection** following the pattern shown above
2. **Publish to npm** with prefix `juris-*-hooks`
3. **Add tests** and documentation
4. **Submit to the community registry**

### Hook Collection Template

```javascript
const YourHooks = {
    useYourHook: (context, { useState, useSubscribe }) => (params) => {
        // Your implementation here
        return {
            // Return your hook API
        };
    }
};

export default YourHooks;
```

## 📚 Advanced Usage

### Custom State Namespacing

```javascript
// Avoid state collisions with component IDs
const [getCount, setCount] = context.useState(`counter.${props.componentId}`, 0);
```

### Performance Optimization

```javascript
// Use local state for temporary UI state
const [getVisible, setVisible] = context.useLocalState(false);

// Use persistent state for app data
const [getUser, setUser] = context.useState('user.current', null);
```

### Cleanup and Lifecycle

```javascript
const MyComponent = (props, context) => {
    const timer = context.useTimer(1000);
    
    return {
        render: () => ({ /* ... */ }),
        
        hooks: {
            onMount: () => {
                timer.start();
            },
            
            onUnmount: () => {
                timer.stop(); // Cleanup when component unmounts
            }
        }
    };
};
```

## 🐛 Debugging

Enable debug mode to see what's happening:

```javascript
createExtendableStateManager(hookCollections, { debug: true })
```

Debug output shows:
- 📊 Cache statistics
- 🔍 Active state paths
- 📈 Subscription counts
- 🎯 Hook registrations

## 📄 License

MIT

## 🙏 Credits

Built on the [Juris framework](https://github.com/jurisjs/juris) - A JavaScript Unified Reactive Interface Solution that makes reactivity an intentional choice rather than an automatic behavior.

---

**Ready to transform your Juris applications with React-like hooks?** 

```bash
npm install juris-hooks
```

**Happy coding!** 🎉
# Juris Framework Documentation

**Version**: 0.3.1-optimized-rendermode  
**Author**: Resti Guay  
**License**: MIT

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Core Concepts](#core-concepts)
4. [State Management](#state-management)
5. [Component System](#component-system)
6. [Headless Components](#headless-components)
7. [Rendering System](#rendering-system)
8. [DOM Enhancement](#dom-enhancement)
9. [Performance & Optimization](#performance--optimization)
10. [API Reference](#api-reference)
11. [Examples](#examples)
12. [Migration Guide](#migration-guide)
13. [Troubleshooting](#troubleshooting)

## Introduction

Juris (JavaScript Unified Reactive Interface Solution) is a comprehensive web development framework that transforms web development through its object-first architecture. It makes reactivity an intentional choice rather than automatic behavior, delivering a complete solution for universally deployable applications with precise control and seamless AI collaboration.

### Key Features

- **Object-First Architecture**: Express interfaces as pure JavaScript objects
- **Intentional Reactivity**: Functions explicitly define reactive behavior
- **Dual Rendering Modes**: Choose between fine-grained and batch rendering
- **Headless Component Support**: Logic-only components for maximum reusability
- **Universal Deployment**: Works in any JavaScript environment
- **AI-Friendly**: Designed for seamless AI collaboration
- **Native JavaScript Patterns**: Maintains simplicity and debuggability

### Philosophy

Juris believes that web development should be:
- **Predictable**: Clear, explicit patterns without hidden magic
- **Performant**: Optimized for both development and runtime performance
- **Flexible**: Adaptable to different use cases and deployment targets
- **Maintainable**: Easy to understand, debug, and extend

## Getting Started

### Installation

Include Juris in your project by adding the script to your HTML:

```html
<script src="path/to/juris.js"></script>
```

Or if using as a module:

```javascript
const Juris = require('./juris');
// or
import Juris from './juris';
```

### Basic Setup

```javascript
// Create a new Juris instance
const app = new Juris({
  states: {
    counter: 0,
    user: { name: 'Guest' }
  },
  
  components: {
    MyButton: (props, context) => ({
      button: {
        text: () => `Count: ${context.getState('counter')}`,
        onclick: () => {
          const current = context.getState('counter');
          context.setState('counter', current + 1);
        }
      }
    })
  },
  
  layout: {
    div: {
      children: [
        { h1: { text: 'Welcome to Juris!' } },
        { MyButton: {} }
      ]
    }
  }
});

// Render the application
app.render('#app');
```

### Your First Component

```javascript
const WelcomeComponent = (props, context) => ({
  div: {
    className: 'welcome',
    style: {
      padding: '20px',
      backgroundColor: '#f0f0f0'
    },
    children: [
      { 
        h2: { 
          text: () => `Hello, ${context.getState('user.name', 'Guest')}!` 
        } 
      },
      {
        button: {
          text: 'Change Name',
          onclick: () => {
            const newName = prompt('Enter your name:');
            if (newName) {
              context.setState('user.name', newName);
            }
          }
        }
      }
    ]
  }
});
```

## Core Concepts

### Object-First Architecture

Juris uses plain JavaScript objects to define UI structures:

```javascript
const element = {
  div: {
    className: 'container',
    children: [
      { h1: { text: 'Title' } },
      { p: { text: 'Content' } }
    ]
  }
};
```

### Reactivity Through Functions

Reactivity is explicit through function usage:

```javascript
const reactiveElement = {
  div: {
    // Static property
    className: 'container',
    
    // Reactive property
    text: () => context.getState('message'),
    
    // Reactive style
    style: () => ({
      color: context.getState('theme') === 'dark' ? 'white' : 'black'
    })
  }
};
```

### Path-Based State Management

State is managed through dot-notation paths:

```javascript
// Set nested state
context.setState('user.profile.name', 'John');

// Get nested state with default
const name = context.getState('user.profile.name', 'Anonymous');

// Subscribe to state changes
const unsubscribe = context.subscribe('user.profile', (newValue, oldValue) => {
  console.log('Profile changed:', { newValue, oldValue });
});
```

## State Management

### StateManager Class

The StateManager handles all reactive state with middleware support and performance optimizations.

#### Basic Usage

```javascript
// Creating state
const app = new Juris({
  states: {
    counter: 0,
    todos: [],
    user: {
      name: 'Guest',
      preferences: {
        theme: 'light'
      }
    }
  }
});

// Accessing state in components
const component = (props, context) => ({
  div: {
    text: () => {
      const count = context.getState('counter');
      const theme = context.getState('user.preferences.theme', 'light');
      return `Count: ${count} (Theme: ${theme})`;
    }
  }
});
```

#### State Middleware

Add middleware to intercept and transform state changes:

```javascript
const loggingMiddleware = ({ path, oldValue, newValue, context, state }) => {
  console.log(`State change: ${path}`, { oldValue, newValue });
  return newValue; // Return undefined to prevent change
};

const validationMiddleware = ({ path, oldValue, newValue }) => {
  if (path === 'counter' && newValue < 0) {
    console.warn('Counter cannot be negative');
    return 0; // Override the value
  }
  return newValue;
};

const app = new Juris({
  middleware: [loggingMiddleware, validationMiddleware],
  states: { counter: 0 }
});
```

#### Batch Updates

Configure batching for performance:

```javascript
// Configure batching behavior
app.stateManager.configureBatching({
  maxBatchSize: 100,
  batchDelayMs: 5
});

// Queue multiple updates
app.stateManager._queueUpdate('counter', 1);
app.stateManager._queueUpdate('user.name', 'John');
app.stateManager._queueUpdate('todos', []);
```

#### Subscriptions

Subscribe to state changes:

```javascript
// Subscribe to specific path
const unsubscribe = context.subscribe('user.name', (newName, oldName, path) => {
  console.log(`Name changed from ${oldName} to ${newName}`);
});

// Subscribe to nested object changes
context.subscribe('user.preferences', (newPrefs, oldPrefs) => {
  console.log('Preferences updated:', newPrefs);
});

// Cleanup subscription
unsubscribe();
```

### Advanced State Patterns

#### Computed State

```javascript
const TodoApp = (props, context) => {
  // Computed values using functions
  const completedCount = () => {
    const todos = context.getState('todos', []);
    return todos.filter(todo => todo.completed).length;
  };
  
  const totalCount = () => {
    const todos = context.getState('todos', []);
    return todos.length;
  };
  
  return {
    div: {
      children: [
        {
          p: {
            text: () => `${completedCount()} of ${totalCount()} completed`
          }
        }
      ]
    }
  };
};
```

#### State Actions

```javascript
const createTodoActions = (context) => ({
  addTodo: (text) => {
    const todos = context.getState('todos', []);
    const newTodo = {
      id: Date.now(),
      text,
      completed: false
    };
    context.setState('todos', [...todos, newTodo]);
  },
  
  toggleTodo: (id) => {
    const todos = context.getState('todos', []);
    const updated = todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    );
    context.setState('todos', updated);
  },
  
  removeTodo: (id) => {
    const todos = context.getState('todos', []);
    const filtered = todos.filter(todo => todo.id !== id);
    context.setState('todos', filtered);
  }
});

// Usage in component
const TodoComponent = (props, context) => {
  const actions = createTodoActions(context);
  
  return {
    div: {
      children: () => {
        const todos = context.getState('todos', []);
        return todos.map(todo => ({
          div: {
            key: todo.id,
            children: [
              { span: { text: todo.text } },
              {
                button: {
                  text: 'Toggle',
                  onclick: () => actions.toggleTodo(todo.id)
                }
              }
            ]
          }
        }));
      }
    }
  };
};
```

## Component System

### Regular Components

Components are functions that return object definitions:

```javascript
const Button = (props, context) => ({
  button: {
    className: props.className || 'btn',
    text: props.text || 'Click me',
    onclick: props.onClick || (() => {}),
    disabled: () => context.getState('loading', false)
  }
});

// Register component
app.registerComponent('Button', Button);

// Use component
const layout = {
  div: {
    children: [
      {
        Button: {
          text: 'Save',
          className: 'btn-primary',
          onClick: () => console.log('Saving...')
        }
      }
    ]
  }
};
```

### Component with Lifecycle

Components can return an object with lifecycle hooks:

```javascript
const TimerComponent = (props, context) => {
  let intervalId = null;
  
  return {
    render: () => ({
      div: {
        className: 'timer',
        children: [
          {
            p: {
              text: () => {
                const seconds = context.getState('timer.seconds', 0);
                return `Timer: ${seconds}s`;
              }
            }
          },
          {
            button: {
              text: 'Start',
              onclick: () => {
                if (!intervalId) {
                  intervalId = setInterval(() => {
                    const current = context.getState('timer.seconds', 0);
                    context.setState('timer.seconds', current + 1);
                  }, 1000);
                }
              }
            }
          },
          {
            button: {
              text: 'Stop',
              onclick: () => {
                if (intervalId) {
                  clearInterval(intervalId);
                  intervalId = null;
                }
              }
            }
          }
        ]
      }
    }),
    
    hooks: {
      onMount: () => {
        console.log('Timer component mounted');
        context.setState('timer.seconds', 0);
      },
      
      onUpdate: (oldProps, newProps) => {
        console.log('Timer component updated', { oldProps, newProps });
      },
      
      onUnmount: () => {
        console.log('Timer component unmounted');
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }
    },
    
    api: {
      reset: () => {
        context.setState('timer.seconds', 0);
      },
      
      getTime: () => {
        return context.getState('timer.seconds', 0);
      }
    }
  };
};
```

### Component Composition

```javascript
const Card = (props, context) => ({
  div: {
    className: 'card',
    style: {
      border: '1px solid #ddd',
      borderRadius: '4px',
      padding: '16px',
      margin: '8px'
    },
    children: [
      props.title ? { h3: { text: props.title } } : null,
      props.content || { p: { text: 'No content' } }
    ].filter(Boolean)
  }
});

const CardList = (props, context) => ({
  div: {
    className: 'card-list',
    children: () => {
      const items = context.getState('cardItems', []);
      return items.map(item => ({
        Card: {
          key: item.id,
          title: item.title,
          content: { p: { text: item.description } }
        }
      }));
    }
  }
});
```

## Headless Components

Headless components provide logic without UI, perfect for reusable business logic.

### Basic Headless Component

```javascript
const CounterLogic = (props, context) => {
  const initialValue = props.initialValue || 0;
  context.setState('counter.value', initialValue);
  
  return {
    api: {
      increment: (amount = 1) => {
        const current = context.getState('counter.value', 0);
        context.setState('counter.value', current + amount);
      },
      
      decrement: (amount = 1) => {
        const current = context.getState('counter.value', 0);
        context.setState('counter.value', current - amount);
      },
      
      reset: () => {
        context.setState('counter.value', initialValue);
      },
      
      getValue: () => {
        return context.getState('counter.value', 0);
      }
    },
    
    hooks: {
      onRegister: () => {
        console.log('Counter logic registered');
      },
      
      onUnregister: () => {
        console.log('Counter logic unregistered');
      }
    }
  };
};

// Register headless component with new syntax
const app = new Juris({
  headlessComponents: {
    CounterLogic: { fn: CounterLogic, options: { autoInit: true, initialValue: 0 } }
  }
});

// Alternative registration method
app.registerHeadlessComponent('CounterLogic', CounterLogic, {
  autoInit: true,
  initialValue: 0
});
```

### Real-world Headless Components Example

```javascript
// Define individual headless components
const UrlStateSync = (props, context) => {
  return {
    api: {
      syncToUrl: (statePath) => {
        const value = context.getState(statePath);
        const url = new URL(window.location);
        url.searchParams.set(statePath.replace('.', '_'), JSON.stringify(value));
        window.history.replaceState({}, '', url);
      },
      
      loadFromUrl: (statePath) => {
        const url = new URL(window.location);
        const value = url.searchParams.get(statePath.replace('.', '_'));
        if (value) {
          try {
            context.setState(statePath, JSON.parse(value));
          } catch (e) {
            console.warn('Failed to parse URL state:', e);
          }
        }
      }
    },
    
    hooks: {
      onRegister: () => {
        console.log('UrlStateSync initialized');
      }
    }
  };
};

const DeviceManager = (props, context) => {
  return {
    api: {
      getDeviceInfo: () => {
        return {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          isMobile: /Mobile|Android|iPhone|iPad/.test(navigator.userAgent),
          isOnline: navigator.onLine
        };
      },
      
      watchOnlineStatus: () => {
        const updateStatus = () => {
          context.setState('device.isOnline', navigator.onLine);
        };
        
        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);
        updateStatus();
      }
    },
    
    hooks: {
      onRegister: () => {
        console.log('DeviceManager initialized');
        const deviceInfo = this.api.getDeviceInfo();
        context.setState('device', deviceInfo);
      }
    }
  };
};

const GeolocationManager = (props, context) => {
  return {
    api: {
      getCurrentPosition: () => {
        return new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'));
            return;
          }
          
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const location = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: position.timestamp
              };
              context.setState('location.current', location);
              resolve(location);
            },
            (error) => {
              context.setState('location.error', error.message);
              reject(error);
            }
          );
        });
      },
      
      watchPosition: () => {
        if (!navigator.geolocation) return null;
        
        return navigator.geolocation.watchPosition(
          (position) => {
            const location = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: position.timestamp
            };
            context.setState('location.current', location);
          },
          (error) => {
            context.setState('location.error', error.message);
          }
        );
      }
    },
    
    hooks: {
      onRegister: () => {
        console.log('GeolocationManager initialized');
      }
    }
  };
};

// Register all headless components
const app = new Juris({
  headlessComponents: {      
    UrlStateSync: { fn: UrlStateSync, options: { autoInit: true } },
    //SecurityManager: { fn: SecurityManager, options: { autoInit: true } },
    DeviceManager: { fn: DeviceManager, options: { autoInit: true } },
    GeolocationManager: { fn: GeolocationManager, options: { autoInit: true } },
  },
  
  states: {
    device: {},
    location: {
      current: null,
      error: null
    }
  },
  
  components: {
    LocationDisplay: (props, context) => ({
      div: {
        className: 'location-display',
        children: [
          {
            button: {
              text: 'Get Location',
              onclick: () => {
                context.GeolocationManager.getCurrentPosition()
                  .then(() => console.log('Location updated'))
                  .catch(err => console.error('Location error:', err));
              }
            }
          },
          {
            div: {
              text: () => {
                const location = context.getState('location.current');
                const error = context.getState('location.error');
                
                if (error) return `Error: ${error}`;
                if (location) {
                  return `Lat: ${location.latitude.toFixed(4)}, Lng: ${location.longitude.toFixed(4)}`;
                }
                return 'Location not available';
              }
            }
          },
          {
            div: {
              text: () => {
                const device = context.getState('device', {});
                return `Device: ${device.isMobile ? 'Mobile' : 'Desktop'} | Online: ${device.isOnline ? 'Yes' : 'No'}`;
              }
            }
          }
        ]
      }
    })
  }
});
```

### Using Headless Components in UI Components

```javascript
const CounterUI = (props, context) => {
  // Access headless component API directly
  const counterAPI = context.CounterLogic;
  
  // Or use the components utility
  const counterAPIAlt = context.components.getHeadlessAPI('CounterLogic');
  
  return {
    div: {
      className: 'counter-ui',
      children: [
        {
          h2: {
            text: () => `Count: ${context.getState('counter.value', 0)}`
          }
        },
        {
          button: {
            text: '+',
            onclick: () => counterAPI.increment()
          }
        },
        {
          button: {
            text: '-',
            onclick: () => counterAPI.decrement()
          }
        },
        {
          button: {
            text: 'Reset',
            onclick: () => counterAPI.reset()
          }
        }
      ]
    }
  };
};
```

### Advanced Headless Component Example

```javascript
const TodoManager = (props, context) => {
  const storageKey = props.storageKey || 'juris-todos';
  
  // Initialize from localStorage
  const savedTodos = localStorage.getItem(storageKey);
  const initialTodos = savedTodos ? JSON.parse(savedTodos) : [];
  context.setState('todos.items', initialTodos);
  
  const saveTodos = (todos) => {
    localStorage.setItem(storageKey, JSON.stringify(todos));
  };
  
  return {
    api: {
      addTodo: (text) => {
        const todos = context.getState('todos.items', []);
        const newTodo = {
          id: Date.now(),
          text: text.trim(),
          completed: false,
          createdAt: new Date().toISOString()
        };
        const updated = [...todos, newTodo];
        context.setState('todos.items', updated);
        saveTodos(updated);
      },
      
      updateTodo: (id, updates) => {
        const todos = context.getState('todos.items', []);
        const updated = todos.map(todo =>
          todo.id === id ? { ...todo, ...updates } : todo
        );
        context.setState('todos.items', updated);
        saveTodos(updated);
      },
      
      deleteTodo: (id) => {
        const todos = context.getState('todos.items', []);
        const updated = todos.filter(todo => todo.id !== id);
        context.setState('todos.items', updated);
        saveTodos(updated);
      },
      
      toggleTodo: (id) => {
        const todos = context.getState('todos.items', []);
        const todo = todos.find(t => t.id === id);
        if (todo) {
          const updated = todos.map(t =>
            t.id === id ? { ...t, completed: !t.completed } : t
          );
          context.setState('todos.items', updated);
          saveTodos(updated);
        }
      },
      
      clearCompleted: () => {
        const todos = context.getState('todos.items', []);
        const updated = todos.filter(todo => !todo.completed);
        context.setState('todos.items', updated);
        saveTodos(updated);
      },
      
      getStats: () => {
        const todos = context.getState('todos.items', []);
        return {
          total: todos.length,
          completed: todos.filter(t => t.completed).length,
          pending: todos.filter(t => !t.completed).length
        };
      }
    },
    
    hooks: {
      onRegister: () => {
        console.log('TodoManager registered with storage key:', storageKey);
      }
    }
  };
};

// Register with configuration
const app = new Juris({
  headlessComponents: {
    TodoManager: {
      fn: TodoManager,
      options: { 
        autoInit: true, 
        storageKey: 'my-app-todos' 
      }
    }
  }
});
```

### Headless Component Registration Patterns

```javascript
// Method 1: In constructor config (recommended)
const app = new Juris({
  headlessComponents: {
    // Simple registration with auto-init
    SimpleComponent: {
      fn: SimpleComponentFunction,
      options: { autoInit: true }
    },
    
    // With custom options
    ComplexComponent: {
      fn: ComplexComponentFunction,
      options: { 
        autoInit: true,
        customProp: 'value',
        initialData: { foo: 'bar' }
      }
    },
    
    // Manual initialization (autoInit: false or omitted)
    ManualComponent: {
      fn: ManualComponentFunction,
      options: { autoInit: false }
    }
  }
});

// Method 2: Programmatic registration
app.registerHeadlessComponent('DynamicComponent', DynamicFunction, {
  autoInit: true,
  config: 'value'
});

// Method 3: Register and initialize separately
app.registerHeadlessComponent('LazyComponent', LazyFunction);
app.initializeHeadlessComponent('LazyComponent', { 
  setting: 'custom' 
});
```

## Rendering System

Juris provides two rendering modes for different performance characteristics.

### Render Modes

#### Fine-Grained Mode (Default)

More compatible, uses direct DOM manipulation:

```javascript
const app = new Juris({
  renderMode: 'fine-grained',
  // ... other config
});

// Or set programmatically
app.setRenderMode('fine-grained');
```

#### Batch Mode

Higher performance, uses VDOM-style reconciliation:

```javascript
const app = new Juris({
  renderMode: 'batch',
  // ... other config
});

// Or set programmatically
app.setRenderMode('batch');
```

### Element Rendering

#### Basic Elements

```javascript
const basicElement = {
  div: {
    className: 'container',
    id: 'main-content',
    style: {
      padding: '20px',
      backgroundColor: '#f0f0f0'
    },
    text: 'Hello World'
  }
};
```

#### Reactive Properties

```javascript
const reactiveElement = {
  div: {
    // Static properties
    className: 'dynamic-content',
    
    // Reactive text
    text: () => {
      const user = context.getState('user.name', 'Guest');
      const time = context.getState('currentTime', '');
      return `Welcome ${user}! Current time: ${time}`;
    },
    
    // Reactive style
    style: () => ({
      color: context.getState('theme.textColor', '#000'),
      backgroundColor: context.getState('theme.bgColor', '#fff'),
      fontSize: context.getState('ui.fontSize', '16px')
    }),
    
    // Reactive attributes
    className: () => {
      const theme = context.getState('theme.name', 'light');
      const size = context.getState('ui.size', 'medium');
      return `content theme-${theme} size-${size}`;
    }
  }
};
```

#### Event Handling

```javascript
const interactiveElement = {
  button: {
    text: 'Click me',
    
    // Click event
    onclick: (event) => {
      console.log('Button clicked!', event);
      const count = context.getState('clickCount', 0);
      context.setState('clickCount', count + 1);
    },
    
    // Other events
    onmouseenter: () => {
      context.setState('ui.hovering', true);
    },
    
    onmouseleave: () => {
      context.setState('ui.hovering', false);
    },
    
    onkeydown: (event) => {
      if (event.key === 'Enter') {
        // Handle enter key
      }
    }
  }
};
```

#### Children Rendering

```javascript
const containerWithChildren = {
  div: {
    className: 'container',
    children: [
      { h1: { text: 'Title' } },
      { p: { text: 'Description' } },
      {
        ul: {
          children: () => {
            const items = context.getState('menuItems', []);
            return items.map(item => ({
              li: {
                key: item.id, // Important for optimization
                text: item.label,
                onclick: () => item.action()
              }
            }));
          }
        }
      }
    ]
  }
};
```

#### Conditional Rendering

```javascript
const conditionalElement = {
  div: {
    children: () => {
      const isLoggedIn = context.getState('user.isLoggedIn', false);
      const user = context.getState('user.profile', null);
      
      if (isLoggedIn && user) {
        return [
          { h2: { text: `Welcome, ${user.name}!` } },
          {
            button: {
              text: 'Logout',
              onclick: () => context.setState('user.isLoggedIn', false)
            }
          }
        ];
      } else {
        return [
          { h2: { text: 'Please log in' } },
          {
            button: {
              text: 'Login',
              onclick: () => {
                // Simulate login
                context.setState('user.isLoggedIn', true);
                context.setState('user.profile', { name: 'John Doe' });
              }
            }
          }
        ];
      }
    }
  }
};
```

### Performance Optimization

#### Element Keys

Use keys for efficient list rendering:

```javascript
const optimizedList = {
  ul: {
    children: () => {
      const items = context.getState('items', []);
      return items.map(item => ({
        li: {
          key: item.id, // Critical for performance
          text: item.name,
          onclick: () => handleItemClick(item.id)
        }
      }));
    }
  }
};
```

#### Memoization Pattern

```javascript
const MemoizedComponent = (props, context) => {
  let lastProps = null;
  let cachedResult = null;
  
  return {
    div: {
      children: () => {
        const currentProps = context.getState('componentProps', {});
        
        // Only re-render if props changed
        if (!deepEquals(lastProps, currentProps)) {
          lastProps = { ...currentProps };
          cachedResult = expensiveRenderFunction(currentProps);
        }
        
        return cachedResult;
      }
    }
  };
};
```

## DOM Enhancement

Enhance existing DOM elements with reactive behavior.

### Basic Enhancement

```javascript
// Enhance all buttons with a class
app.enhance('.enhanced-button', {
  style: () => ({
    backgroundColor: context.getState('theme.buttonColor', '#007bff'),
    color: 'white'
  }),
  
  onclick: (event) => {
    console.log('Enhanced button clicked!');
    const clicks = context.getState('buttonClicks', 0);
    context.setState('buttonClicks', clicks + 1);
  }
});
```

### Advanced Enhancement

```javascript
app.enhance('[data-counter]', (context) => {
  const counterId = element.dataset.counter;
  
  return {
    text: () => {
      const count = context.getState(`counters.${counterId}`, 0);
      return `Count: ${count}`;
    },
    
    onclick: () => {
      const current = context.getState(`counters.${counterId}`, 0);
      context.setState(`counters.${counterId}`, current + 1);
    },
    
    style: () => ({
      color: context.getState(`counters.${counterId}`, 0) > 10 ? 'red' : 'blue'
    })
  };
}, {
  observeNewElements: true,
  batchUpdates: true
});
```

### Enhancement Configuration

```javascript
app.configureEnhancement({
  debounceMs: 10,
  batchUpdates: true,
  observeSubtree: true,
  observeAttributes: true
});

// Get enhancement statistics
const stats = app.getEnhancementStats();
console.log('Enhancement stats:', stats);
```

## Performance & Optimization

### Render Mode Selection

Choose the appropriate render mode based on your needs:

```javascript
// For maximum compatibility
app.setRenderMode('fine-grained');

// For maximum performance
app.setRenderMode('batch');

// Check current mode
console.log('Current render mode:', app.getRenderMode());
```

### State Management Optimization

#### Batch State Updates

```javascript
// Configure batching
app.stateManager.configureBatching({
  maxBatchSize: 100,
  batchDelayMs: 5
});

// Multiple rapid updates will be batched automatically
for (let i = 0; i < 100; i++) {
  context.setState(`items.${i}`, { value: i });
}
```

#### Middleware for Performance

```javascript
const performanceMiddleware = ({ path, oldValue, newValue, context }) => {
  const start = performance.now();
  
  // Allow the change
  const result = newValue;
  
  const end = performance.now();
  if (end - start > 1) {
    console.warn(`Slow state change on ${path}: ${end - start}ms`);
  }
  
  return result;
};
```

### Component Optimization

#### Prevent Unnecessary Re-renders

```javascript
const OptimizedComponent = (props, context) => {
  let lastRelevantState = null;
  let cachedRender = null;
  
  return {
    div: {
      children: () => {
        // Only depend on specific state
        const relevantState = context.getState('specific.path', null);
        
        if (relevantState !== lastRelevantState) {
          lastRelevantState = relevantState;
          cachedRender = computeExpensiveRender(relevantState);
        }
        
        return cachedRender;
      }
    }
  };
};
```

#### Use Keys Effectively

```javascript
const EfficientList = (props, context) => ({
  div: {
    children: () => {
      const items = context.getState('items', []);
      return items.map(item => ({
        div: {
          key: `item-${item.id}`, // Stable, unique key
          text: item.name,
          onclick: () => handleClick(item.id)
        }
      }));
    }
  }
});
```

### Memory Management

#### Cleanup Subscriptions

```javascript
const ComponentWithCleanup = (props, context) => {
  const subscriptions = [];
  
  return {
    render: () => ({
      div: { text: 'Component content' }
    }),
    
    hooks: {
      onMount: () => {
        // Add subscriptions that need cleanup
        const unsub1 = context.subscribe('data.items', handleItemsChange);
        const unsub2 = context.subscribe('ui.theme', handleThemeChange);
        
        subscriptions.push(unsub1, unsub2);
      },
      
      onUnmount: () => {
        // Clean up subscriptions
        subscriptions.forEach(unsub => unsub());
        subscriptions.length = 0;
      }
    }
  };
};
```

## API Reference

### Juris Class

#### Constructor

```javascript
new Juris(config)
```

**Parameters:**
- `config` (Object): Configuration object
  - `states` (Object): Initial state values
  - `middleware` (Array): State middleware functions
  - `components` (Object): Component definitions
  - `headlessComponents` (Object): Headless component definitions with new syntax
  - `layout` (Object): Root layout definition
  - `renderMode` (String): 'fine-grained' or 'batch'
  - `services` (Object): External services

**Headless Components Configuration:**
```javascript
{
  headlessComponents: {
    ComponentName: {
      fn: ComponentFunction,
      options: {
        autoInit: true, // Auto-initialize on app creation
        // ... custom options passed to component
      }
    }
  }
}
```

#### Methods

##### State Management
- `getState(path, defaultValue)` - Get state value
- `setState(path, value, context)` - Set state value
- `subscribe(path, callback)` - Subscribe to state changes

##### Component Management
- `registerComponent(name, component)` - Register UI component
- `registerHeadlessComponent(name, component, options)` - Register headless component
- `getComponent(name)` - Get component definition
- `getHeadlessComponent(name)` - Get headless component instance

##### Rendering
- `render(container)` - Render application
- `setRenderMode(mode)` - Set rendering mode
- `getRenderMode()` - Get current rendering mode
- `isFineGrained()` - Check if using fine-grained mode
- `isBatchMode()` - Check if using batch mode

##### Enhancement
- `enhance(selector, definition, options)` - Enhance DOM elements
- `configureEnhancement(options)` - Configure enhancement behavior
- `getEnhancementStats()` - Get enhancement statistics

##### Lifecycle
- `cleanup()` - Clean up resources
- `destroy()` - Completely destroy instance

### Context Object

The context object is passed to components and provides access to the Juris API.

#### Properties
- `getState(path, defaultValue)` - Access state
- `setState(path, value, context)` - Update state
- `subscribe(path, callback)` - Subscribe to changes
- `services` - External services
- `headless` - Headless component APIs (legacy access)
- `{HeadlessComponentName}` - Direct access to headless APIs
- `components` - Component management utilities
- `utils` - Utility functions
- `juris` - Direct access to Juris instance

### State Manager

#### Methods
- `configureBatching(options)` - Configure batch updates
- `startTracking()` - Start dependency tracking
- `endTracking()` - End dependency tracking

### Component Manager

#### Methods
- `register(name, componentFn)` - Register component
- `create(name, props)` - Create component instance
- `cleanup(element)` - Clean up component

### Headless Manager

#### Methods
- `register(name, componentFn, options)` - Register headless component
- `initialize(name, props)` - Initialize instance
- `getInstance(name)` - Get instance
- `getAPI(name)` - Get component API
- `getStatus()` - Get status information

## Examples

### Todo Application

```javascript
// Define TodoLogic as a separate function
const TodoLogic = (props, context) => ({
  api: {
    addTodo: (text) => {
      const todos = context.getState('todos', []);
      const newTodo = {
        id: Date.now(),
        text: text.trim(),
        completed: false
      };
      context.setState('todos', [...todos, newTodo]);
    },
    
    toggleTodo: (id) => {
      const todos = context.getState('todos', []);
      const updated = todos.map(todo =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      );
      context.setState('todos', updated);
    },
    
    deleteTodo: (id) => {
      const todos = context.getState('todos', []);
      context.setState('todos', todos.filter(todo => todo.id !== id));
    },
    
    clearCompleted: () => {
      const todos = context.getState('todos', []);
      context.setState('todos', todos.filter(todo => !todo.completed));
    }
  }
});

const TodoApp = new Juris({
  states: {
    todos: [],
    filter: 'all', // all, active, completed
    newTodoText: ''
  },
  
  headlessComponents: {
    TodoLogic: { fn: TodoLogic, options: { autoInit: true } }
  },
  
  components: {
    TodoInput: (props, context) => ({
      div: {
        className: 'todo-input',
        children: [
          {
            input: {
              type: 'text',
              placeholder: 'Add a new todo...',
              value: () => context.getState('newTodoText', ''),
              oninput: (e) => context.setState('newTodoText', e.target.value),
              onkeydown: (e) => {
                if (e.key === 'Enter') {
                  const text = context.getState('newTodoText', '');
                  if (text.trim()) {
                    context.TodoLogic.addTodo(text);
                    context.setState('newTodoText', '');
                  }
                }
              }
            }
          },
          {
            button: {
              text: 'Add',
              onclick: () => {
                const text = context.getState('newTodoText', '');
                if (text.trim()) {
                  context.TodoLogic.addTodo(text);
                  context.setState('newTodoText', '');
                }
              }
            }
          }
        ]
      }
    }),
    
    TodoItem: (props, context) => ({
      li: {
        className: () => props.todo.completed ? 'completed' : '',
        children: [
          {
            input: {
              type: 'checkbox',
              checked: props.todo.completed,
              onchange: () => context.TodoLogic.toggleTodo(props.todo.id)
            }
          },
          {
            span: {
              text: props.todo.text,
              style: () => ({
                textDecoration: props.todo.completed ? 'line-through' : 'none'
              })
            }
          },
          {
            button: {
              text: '×',
              onclick: () => context.TodoLogic.deleteTodo(props.todo.id)
            }
          }
        ]
      }
    }),
    
    TodoList: (props, context) => ({
      ul: {
        className: 'todo-list',
        children: () => {
          const todos = context.getState('todos', []);
          const filter = context.getState('filter', 'all');
          
          const filteredTodos = todos.filter(todo => {
            if (filter === 'active') return !todo.completed;
            if (filter === 'completed') return todo.completed;
            return true;
          });
          
          return filteredTodos.map(todo => ({
            TodoItem: {
              key: todo.id,
              todo: todo
            }
          }));
        }
      }
    }),
    
    TodoFilters: (props, context) => ({
      div: {
        className: 'todo-filters',
        children: [
          {
            button: {
              text: 'All',
              className: () => context.getState('filter') === 'all' ? 'active' : '',
              onclick: () => context.setState('filter', 'all')
            }
          },
          {
            button: {
              text: 'Active',
              className: () => context.getState('filter') === 'active' ? 'active' : '',
              onclick: () => context.setState('filter', 'active')
            }
          },
          {
            button: {
              text: 'Completed',
              className: () => context.getState('filter') === 'completed' ? 'active' : '',
              onclick: () => context.setState('filter', 'completed')
            }
          },
          {
            button: {
              text: 'Clear Completed',
              onclick: () => context.TodoLogic.clearCompleted()
            }
          }
        ]
      }
    })
  },
  
  layout: {
    div: {
      className: 'todo-app',
      children: [
        { h1: { text: 'Todo App' } },
        { TodoInput: {} },
        { TodoList: {} },
        { TodoFilters: {} }
      ]
    }
  }
});

TodoApp.render('#app');
```

### Dashboard with Real-time Updates

```javascript
// Define WebSocketManager as a separate function
const WebSocketManager = (props, context) => {
  let ws = null;
  
  const connect = () => {
    ws = new WebSocket('wss://api.example.com/metrics');
    
    ws.onopen = () => {
      context.setState('isConnected', true);
      console.log('WebSocket connected');
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      context.setState('metrics', data.metrics);
      context.setState('lastUpdated', new Date().toISOString());
    };
    
    ws.onclose = () => {
      context.setState('isConnected', false);
      console.log('WebSocket disconnected');
      
      // Reconnect after 5 seconds
      setTimeout(connect, 5000);
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  };
  
  return {
    api: {
      connect,
      disconnect: () => {
        if (ws) {
          ws.close();
          ws = null;
        }
      },
      
      send: (data) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(data));
        }
      }
    },
    
    hooks: {
      onRegister: () => {
        connect();
      },
      
      onUnregister: () => {
        if (ws) {
          ws.close();
        }
      }
    }
  };
};

const Dashboard = new Juris({
  states: {
    metrics: {
      users: 0,
      sales: 0,
      revenue: 0
    },
    lastUpdated: null,
    isConnected: false
  },
  
  services: {
    websocket: null,
    api: {
      baseUrl: 'https://api.example.com'
    }
  },
  
  headlessComponents: {
    WebSocketManager: { fn: WebSocketManager, options: { autoInit: true } }
  },
  
  components: {
    MetricCard: (props, context) => ({
      div: {
        className: 'metric-card',
        style: {
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          margin: '10px',
          textAlign: 'center',
          backgroundColor: '#f9f9f9'
        },
        children: [
          {
            h3: {
              text: props.title,
              style: { margin: '0 0 10px 0', color: '#333' }
            }
          },
          {
            div: {
              text: () => {
                const value = context.getState(`metrics.${props.metric}`, 0);
                return props.formatter ? props.formatter(value) : value.toString();
              },
              style: { fontSize: '2em', fontWeight: 'bold', color: props.color || '#000' }
            }
          }
        ]
      }
    }),
    
    ConnectionStatus: (props, context) => ({
      div: {
        className: 'connection-status',
        style: () => ({
          padding: '10px',
          borderRadius: '4px',
          backgroundColor: context.getState('isConnected', false) ? '#d4edda' : '#f8d7da',
          color: context.getState('isConnected', false) ? '#155724' : '#721c24',
          border: context.getState('isConnected', false) ? '1px solid #c3e6cb' : '1px solid #f5c6cb'
        }),
        children: [
          {
            span: {
              text: () => context.getState('isConnected', false) ? '🟢 Connected' : '🔴 Disconnected'
            }
          },
          {
            span: {
              text: () => {
                const lastUpdated = context.getState('lastUpdated', null);
                return lastUpdated ? ` - Last updated: ${new Date(lastUpdated).toLocaleTimeString()}` : '';
              },
              style: { marginLeft: '10px', fontSize: '0.9em' }
            }
          }
        ]
      }
    })
  },
  
  layout: {
    div: {
      className: 'dashboard',
      style: { padding: '20px', fontFamily: 'Arial, sans-serif' },
      children: [
        { h1: { text: 'Real-time Dashboard' } },
        { ConnectionStatus: {} },
        {
          div: {
            className: 'metrics-grid',
            style: { display: 'flex', flexWrap: 'wrap' },
            children: [
              {
                MetricCard: {
                  title: 'Active Users',
                  metric: 'users',
                  color: '#007bff',
                  formatter: (value) => value.toLocaleString()
                }
              },
              {
                MetricCard: {
                  title: 'Sales Today',
                  metric: 'sales',
                  color: '#28a745',
                  formatter: (value) => value.toLocaleString()
                }
              },
              {
                MetricCard: {
                  title: 'Revenue',
                  metric: 'revenue',
                  color: '#ffc107',
                  formatter: (value) => `$${(value / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                }
              }
            ]
          }
        }
      ]
    }
  }
});

Dashboard.render('#dashboard');
```

## Migration Guide

### From Version 0.2.x to 0.3.x

#### Render Mode Changes

**Before (0.2.x):**
```javascript
const app = new Juris({
  legacyMode: true // or false
});

app.enableLegacyMode();
app.disableLegacyMode();
```

**After (0.3.x):**
```javascript
const app = new Juris({
  renderMode: 'fine-grained' // or 'batch'
});

app.setRenderMode('fine-grained');
app.setRenderMode('batch');
```

#### Enhanced Headless Components

**Before (0.2.x):**
```javascript
// Limited headless support
app.registerHeadless('Counter', CounterLogic);
```

**After (0.3.x):**
```javascript
// Method 1: In constructor (recommended)
const app = new Juris({
  headlessComponents: {
    Counter: {
      fn: CounterLogic,
      options: { autoInit: true, initialValue: 0 }
    }
  }
});

// Method 2: Programmatic registration
app.registerHeadlessComponent('Counter', CounterLogic, {
  autoInit: true,
  initialValue: 0
});

// Access APIs directly in context
const component = (props, context) => {
  const counterAPI = context.Counter; // Direct access
  // or
  const counterAPI = context.components.getHeadlessAPI('Counter');
};
```

#### Performance Improvements

The new version includes automatic performance optimizations:
- VDOM-style reconciliation in batch mode
- Improved element recycling
- Better memory management
- Automatic fallback mechanisms

No code changes required, but you may see performance improvements.

### Breaking Changes

1. **Legacy Mode**: `legacyMode` config option is deprecated. Use `renderMode: 'fine-grained'` instead.

2. **Headless Component Registration**: New object syntax with `fn` and `options` properties is now the standard way to register headless components.

3. **Headless API Access**: Direct access to headless APIs in context object using the component name.

4. **Enhanced Context**: More utilities available in component context.

## Troubleshooting

### Common Issues

#### Components Not Updating

**Problem**: Component doesn't re-render when state changes.

**Solution**: Ensure you're using functions for reactive properties:

```javascript
// ❌ Wrong - static value
{ text: context.getState('message') }

// ✅ Correct - reactive function
{ text: () => context.getState('message') }
```

#### Headless Component API Not Available

**Problem**: Cannot access headless component API in UI components.

**Solutions**:

1. Ensure headless component is registered with `autoInit: true`:
```javascript
headlessComponents: {
  MyLogic: {
    fn: MyLogicComponent,
    options: { autoInit: true }
  }
}
```

2. Access API correctly:
```javascript
// ✅ Direct access (preferred)
const myAPI = context.MyLogic;

// ✅ Via components utility
const myAPI = context.components.getHeadlessAPI('MyLogic');
```

3. Check if component was initialized:
```javascript
const status = context.utils.getHeadlessStatus();
console.log('Headless status:', status);
```

#### Performance Issues

**Problem**: Application feels slow with many components.

**Solutions**:

1. Use batch render mode:
```javascript
app.setRenderMode('batch');
```

2. Add keys to list items:
```javascript
children: () => items.map(item => ({
  div: {
    key: item.id, // Important!
    text: item.name
  }
}))
```

3. Optimize state subscriptions:
```javascript
// ❌ Avoid subscribing to large objects frequently
context.getState('largeObject')

// ✅ Subscribe to specific paths
context.getState('largeObject.specificProperty')
```

#### Memory Leaks

**Problem**: Application memory usage grows over time.

**Solutions**:

1. Clean up subscriptions in component lifecycle:
```javascript
hooks: {
  onUnmount: () => {
    subscriptions.forEach(unsub => unsub());
  }
}
```

2. Use component cleanup properly:
```javascript
// When removing components manually
app.domRenderer.cleanup(element);
```

#### State Not Persisting

**Problem**: State resets unexpectedly.

**Solutions**:

1. Check for circular dependencies in state updates
2. Verify middleware isn't modifying state unexpectedly
3. Use proper state paths without typos

#### Render Mode Issues

**Problem**: Batch mode causing errors.

**Solution**: Juris automatically falls back to fine-grained mode when batch rendering fails. You can also manually switch:

```javascript
// Switch to more compatible mode
app.setRenderMode('fine-grained');
```

### Debug Helpers

#### State Debugging

```javascript
// Add logging middleware
const debugMiddleware = ({ path, oldValue, newValue }) => {
  console.log(`State change: ${path}`, { oldValue, newValue });
  return newValue;
};

const app = new Juris({
  middleware: [debugMiddleware]
});
```

#### Component Debugging

```javascript
const DebugComponent = (props, context) => ({
  render: () => {
    console.log('Component rendering with props:', props);
    return { div: { text: 'Debug component' } };
  },
  
  hooks: {
    onMount: () => console.log('Component mounted'),
    onUpdate: (oldProps, newProps) => console.log('Component updated', { oldProps, newProps }),
    onUnmount: () => console.log('Component unmounted')
  }
});
```

#### Headless Component Debugging

```javascript
// Check headless component status
console.log('Headless status:', app.getHeadlessStatus());

// Debug headless component APIs
console.log('Available APIs:', Object.keys(context));

// Check if specific headless component is available
if (context.MyComponent) {
  console.log('MyComponent API available');
} else {
  console.log('MyComponent API not found');
}
```

#### Performance Monitoring

```javascript
const performanceMiddleware = ({ path, oldValue, newValue }) => {
  const start = performance.now();
  
  // Simulate the change processing time
  requestAnimationFrame(() => {
    const end = performance.now();
    if (end - start > 16) { // More than one frame
      console.warn(`Slow state update on ${path}: ${end - start}ms`);
    }
  });
  
  return newValue;
};
```

### Getting Help

1. **Check the Console**: Juris provides detailed error messages and warnings
2. **Verify State Paths**: Ensure state paths are spelled correctly and exist
3. **Test in Fine-Grained Mode**: If batch mode has issues, try fine-grained mode
4. **Use Debug Middleware**: Add logging to track state changes
5. **Check Component Lifecycle**: Ensure proper cleanup in component hooks
6. **Verify Headless Registration**: Ensure headless components use the correct syntax and `autoInit: true`

---

## Conclusion

Juris provides a powerful, flexible foundation for building reactive web applications with intentional design choices and excellent performance characteristics. Its object-first architecture, dual rendering modes, and comprehensive headless component system make it suitable for everything from simple interactive pages to complex applications.

For more examples and advanced patterns, explore the framework's capabilities and don't hesitate to experiment with different rendering modes and architectural patterns to find what works best for your specific use case.
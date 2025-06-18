# Juris Enhance API Documentation

The `enhance` API is Juris's powerful system for adding reactive behavior to existing DOM elements through progressive enhancement. It allows you to transform static HTML into interactive, reactive interfaces without requiring a complete rewrite.

## Table of Contents

1. [Basic Usage](#basic-usage)
2. [Enhancement Patterns](#enhancement-patterns)
3. [Selectors Category](#selectors-category)
4. [Supported Properties](#supported-properties)
5. [Context Object](#context-object)
6. [Configuration Options](#configuration-options)
7. [Advanced Features](#advanced-features)
8. [Best Practices](#best-practices)
9. [Examples](#examples)
10. [Error Handling](#error-handling)

---

## Basic Usage

### Simple Enhancement

```javascript
app.enhance(selector, definition, options)
```

**Parameters:**
- `selector` (string): CSS selector to target elements
- `definition` (object|function): Enhancement definition
- `options` (object, optional): Configuration options

**Returns:** Function to remove the enhancement

### Basic Example

```javascript
// Simple object-based enhancement
app.enhance('.my-button', {
    onclick: () => console.log('clicked'),
    text: 'Click me!',
    className: 'btn btn-primary'
});

// Function-based enhancement with context
app.enhance('.counter', (context) => ({
    text: () => `Count: ${context.getState('count', 0)}`,
    onclick: () => {
        const current = context.getState('count', 0);
        context.setState('count', current + 1);
    }
}));
```

---

## Enhancement Patterns

### 1. Object-Based Definition

Static enhancement with fixed properties:

```javascript
app.enhance('.static-element', {
    className: 'enhanced',
    style: { color: 'blue', fontSize: '16px' },
    onclick: () => alert('Hello!')
});
```

### 2. Function-Based Definition

Dynamic enhancement with access to context:

```javascript
app.enhance('.dynamic-element', (context) => ({
    className: () => context.getState('active') ? 'active' : 'inactive',
    text: () => `Status: ${context.getState('status', 'ready')}`,
    onclick: () => context.setState('active', !context.getState('active'))
}));
```

### 3. Mixed Static and Reactive Properties

Combine static and reactive properties:

```javascript
app.enhance('.mixed-element', (context) => ({
    // Static properties
    id: 'my-element',
    'data-component': 'enhanced',
    
    // Reactive properties  
    className: () => context.getState('theme', 'light'),
    text: () => context.getState('message', 'Hello'),
    disabled: () => context.getState('loading', false)
}));
```

---

## Selectors Category

Group related enhancements under a common container using the `selectors` category.

### Basic Selectors Category

```javascript
app.enhance('.container', {
    // Container properties (optional)
    className: 'enhanced-container',
    
    // Nested selectors
    selectors: {
        '.child-button': {
            onclick: () => console.log('child clicked'),
            text: 'Child Button'
        },
        
        '.child-input': {
            oninput: (e) => console.log('input changed:', e.target.value),
            placeholder: 'Enter text...'
        }
    }
});
```

### Function-Based Selectors

Use functions for dynamic selector definitions:

```javascript
app.enhance('.task-list', {
    selectors: {
        // Function-based selector with element-specific context
        '.task-item': (context) => {
            const taskId = context.element.dataset.taskId;
            const isCompleted = context.element.dataset.completed === 'true';
            
            return {
                className: () => {
                    const updating = context.getState(`tasks.${taskId}.updating`);
                    return `task-item ${isCompleted ? 'completed' : 'pending'} ${updating ? 'updating' : ''}`;
                },
                
                onclick: () => {
                    context.setState(`tasks.${taskId}.updating`, true);
                    // Simulate async operation
                    setTimeout(() => {
                        context.setState(`tasks.${taskId}.updating`, false);
                        context.element.dataset.completed = isCompleted ? 'false' : 'true';
                    }, 500);
                }
            };
        },
        
        '.delete-btn': (context) => ({
            onclick: () => {
                const taskId = context.element.dataset.taskId;
                if (confirm('Delete this task?')) {
                    context.element.closest('.task-item').remove();
                }
            }
        })
    }
});
```

### Mixed Object and Function Selectors

```javascript
app.enhance('.dashboard', {
    // Container enhancement
    className: 'dashboard-enhanced',
    
    selectors: {
        // Object-based selector
        '.sidebar': {
            className: 'sidebar enhanced',
            style: () => ({ width: context.getState('sidebarWidth', '250px') })
        },
        
        // Function-based selector
        '.nav-item': (context) => {
            const page = context.element.dataset.page;
            const isActive = context.getState('currentPage') === page;
            
            return {
                className: isActive ? 'nav-item active' : 'nav-item',
                onclick: () => context.setState('currentPage', page)
            };
        }
    }
});
```

---

## Supported Properties

### Event Handlers

All standard DOM events are supported with the `on` prefix:

```javascript
app.enhance('.interactive', {
    onclick: (event) => console.log('clicked'),
    onchange: (event) => console.log('changed'),
    oninput: (event) => console.log('input'),
    onmouseover: (event) => console.log('hover'),
    onkeydown: (event) => console.log('key pressed'),
    onsubmit: (event) => {
        event.preventDefault();
        console.log('form submitted');
    }
});
```

### Text Content

Set or reactively update text content:

```javascript
app.enhance('.text-element', {
    // Static text
    text: 'Static text',
    
    // Reactive text
    text: () => `Current time: ${new Date().toLocaleTimeString()}`
});
```

### HTML Content

Set or reactively update innerHTML:

```javascript
app.enhance('.html-element', {
    // Static HTML
    innerHTML: '<strong>Bold text</strong>',
    
    // Reactive HTML
    innerHTML: () => `<p>Counter: ${context.getState('count', 0)}</p>`
});
```

### Styles

Apply static or reactive styles:

```javascript
app.enhance('.styled-element', {
    // Static styles (object)
    style: {
        color: 'blue',
        fontSize: '16px',
        margin: '10px'
    },
    
    // Reactive styles (function returning object)
    style: () => ({
        backgroundColor: context.getState('theme') === 'dark' ? '#333' : '#fff',
        opacity: context.getState('visible') ? 1 : 0.5,
        transform: `scale(${context.getState('scale', 1)})`
    })
});
```

### CSS Classes

Set or reactively update CSS classes:

```javascript
app.enhance('.class-element', {
    // Static class
    className: 'static-class',
    
    // Reactive class
    className: () => {
        const theme = context.getState('theme', 'light');
        const active = context.getState('active', false);
        return `base-class theme-${theme} ${active ? 'active' : 'inactive'}`;
    }
});
```

### Attributes

Set static or reactive attributes:

```javascript
app.enhance('.attr-element', {
    // Static attributes
    id: 'my-element',
    'data-component': 'enhanced',
    'aria-label': 'Interactive element',
    
    // Reactive attributes
    disabled: () => context.getState('loading', false),
    'aria-expanded': () => context.getState('expanded', false),
    value: () => context.getState('inputValue', ''),
    placeholder: () => context.getState('placeholderText', 'Enter text...')
});
```

### HTMX Attributes

Seamless integration with HTMX:

```javascript
app.enhance('.htmx-element', {
    'hx-get': '/api/data',
    'hx-target': '#result',
    'hx-swap': 'innerHTML',
    'hx-trigger': 'click',
    
    // Reactive HTMX attributes
    'hx-vals': () => JSON.stringify({
        filter: context.getState('currentFilter'),
        page: context.getState('currentPage', 1)
    })
});
```

### Children (Virtual DOM)

Reactively render child elements:

```javascript
app.enhance('.list-container', {
    children: () => {
        const items = context.getState('items', []);
        return items.map(item => ({
            div: {
                key: item.id,
                className: 'list-item',
                text: item.name,
                onclick: () => context.setState('selectedItem', item.id)
            }
        }));
    }
});
```

---

## Context Object

The context object provides access to state management, services, and other Juris features.

### Core Properties

```javascript
app.enhance('.element', (context) => {
    // State management
    context.getState(path, defaultValue)
    context.setState(path, value)
    context.subscribe(path, callback)
    
    // Element reference (in selectors category)
    context.element // The specific DOM element being enhanced
    
    // Services access
    context.services // Configured services
    
    // Headless component APIs
    context.headless // All headless component APIs
    context.someHeadlessAPI // Direct access to specific APIs
    
    // Component management
    context.components.register(name, component)
    context.components.get(name)
    
    // Utilities
    context.utils.render(container)
    context.utils.cleanup()
    
    // Direct Juris access
    context.juris // Main Juris instance
});
```

### Element-Specific Context

In the `selectors` category, context includes the specific element:

```javascript
app.enhance('.container', {
    selectors: {
        '.item': (context) => {
            // context.element points to the specific .item element
            const itemId = context.element.dataset.itemId;
            const itemType = context.element.dataset.type;
            
            return {
                className: () => `item item-${itemType}`,
                onclick: () => context.setState(`items.${itemId}.selected`, true)
            };
        }
    }
});
```

---

## Configuration Options

### Available Options

```javascript
app.enhance('.element', definition, {
    // Mutation observer settings
    debounceMs: 5,              // Debounce mutations (0 = no debounce)
    batchUpdates: true,         // Batch process multiple elements
    observeSubtree: true,       // Watch for nested element additions
    observeChildList: true,     // Watch for direct child additions
    observeNewElements: false,  // Disable mutation observer entirely
    
    // Callback
    onEnhanced: (element, context) => {
        console.log('Element enhanced:', element);
    }
});
```

### Global Configuration

Configure default options for all enhancements:

```javascript
app.configureEnhancement({
    debounceMs: 10,
    batchUpdates: true,
    observeSubtree: true
});
```

---

## Advanced Features

### Element-Aware Functions

Functions that receive the element as a parameter:

```javascript
app.enhance('.dynamic-button', {
    // Element-aware function pattern
    text: (el) => () => {
        const count = el.dataset.count || '0';
        return `Clicked ${count} times`;
    },
    
    onclick: (el) => () => {
        const current = parseInt(el.dataset.count || '0');
        el.dataset.count = (current + 1).toString();
    }
});
```

### Conditional Enhancement

Apply different enhancements based on element properties:

```javascript
app.enhance('.form-field', (context) => {
    const fieldType = context.element.dataset.type;
    
    if (fieldType === 'email') {
        return {
            oninput: (e) => {
                const isValid = /\S+@\S+\.\S+/.test(e.target.value);
                context.setState(`validation.${e.target.name}`, isValid);
            },
            className: () => {
                const isValid = context.getState(`validation.${context.element.name}`, true);
                return `form-field ${isValid ? 'valid' : 'invalid'}`;
            }
        };
    } else if (fieldType === 'number') {
        return {
            oninput: (e) => {
                const isValid = !isNaN(e.target.value) && e.target.value !== '';
                context.setState(`validation.${e.target.name}`, isValid);
            }
        };
    } else {
        return {
            oninput: (e) => {
                context.setState(`form.${e.target.name}`, e.target.value);
            }
        };
    }
});
```

### Enhancement Cleanup

```javascript
// Store the cleanup function
const unenhance = app.enhance('.temporary-element', definition);

// Later, remove the enhancement
unenhance();

// Or clean up all enhancements
app.destroy();
```

---

## Best Practices

### 1. Use Meaningful Selectors

```javascript
// ✅ Good: Descriptive selectors
app.enhance('.user-profile-card', definition);
app.enhance('.shopping-cart-item', definition);

// ❌ Avoid: Generic selectors
app.enhance('.item', definition);
app.enhance('.button', definition);
```

### 2. Group Related Functionality

```javascript
// ✅ Good: Group related elements
app.enhance('.task-board', {
    selectors: {
        '.task-card': cardDefinition,
        '.task-actions': actionsDefinition,
        '.task-status': statusDefinition
    }
});

// ❌ Avoid: Separate unrelated enhancements
app.enhance('.task-card', cardDefinition);
app.enhance('.random-button', buttonDefinition);
app.enhance('.unrelated-div', divDefinition);
```

### 3. Handle Missing Elements Gracefully

```javascript
// ✅ Good: Safe element access
app.enhance('.data-element', (context) => ({
    text: () => {
        const data = context.element?.dataset?.value || 'N/A';
        return `Value: ${data}`;
    }
}));

// Helper function for safer access
function getDatasetValue(context, key, fallback = '') {
    return context.element?.dataset?.[key] || fallback;
}
```

### 4. Use Reactive Properties Appropriately

```javascript
// ✅ Good: Reactive where needed
app.enhance('.status-indicator', {
    // Static properties that don't change
    'data-component': 'status-indicator',
    
    // Reactive properties that depend on state
    className: () => `status ${context.getState('status', 'idle')}`,
    text: () => context.getState('statusText', 'Ready')
});
```

### 5. Optimize Performance

```javascript
// ✅ Good: Batch related enhancements
app.enhance('.dashboard', {
    selectors: {
        '.widget': widgetDefinition,
        '.chart': chartDefinition,
        '.controls': controlsDefinition
    }
});

// ✅ Good: Disable observers when not needed
app.enhance('.static-list', definition, {
    observeNewElements: false
});
```

---

## Examples

### Complete Todo App Enhancement

```javascript
// Todo app with full functionality
app.enhance('.todo-app', {
    selectors: {
        // Add new todo form
        '.add-todo-form': {
            onsubmit: (e) => {
                e.preventDefault();
                const input = e.target.querySelector('input');
                const todos = context.getState('todos', []);
                const newTodo = {
                    id: Date.now(),
                    text: input.value,
                    completed: false
                };
                context.setState('todos', [...todos, newTodo]);
                input.value = '';
            }
        },
        
        // Todo list container
        '.todo-list': {
            children: () => {
                const todos = context.getState('todos', []);
                const filter = context.getState('filter', 'all');
                
                const filteredTodos = todos.filter(todo => {
                    if (filter === 'active') return !todo.completed;
                    if (filter === 'completed') return todo.completed;
                    return true;
                });
                
                return filteredTodos.map(todo => ({
                    div: {
                        key: todo.id,
                        className: `todo-item ${todo.completed ? 'completed' : ''}`,
                        children: [
                            {
                                input: {
                                    type: 'checkbox',
                                    checked: todo.completed,
                                    onchange: () => {
                                        const todos = context.getState('todos', []);
                                        const updated = todos.map(t => 
                                            t.id === todo.id ? { ...t, completed: !t.completed } : t
                                        );
                                        context.setState('todos', updated);
                                    }
                                }
                            },
                            {
                                span: {
                                    text: todo.text,
                                    className: 'todo-text'
                                }
                            },
                            {
                                button: {
                                    text: 'Delete',
                                    className: 'delete-btn',
                                    onclick: () => {
                                        const todos = context.getState('todos', []);
                                        const filtered = todos.filter(t => t.id !== todo.id);
                                        context.setState('todos', filtered);
                                    }
                                }
                            }
                        ]
                    }
                }));
            }
        },
        
        // Filter buttons
        '.filter-buttons': {
            children: () => {
                const currentFilter = context.getState('filter', 'all');
                const filters = [
                    { key: 'all', label: 'All' },
                    { key: 'active', label: 'Active' },
                    { key: 'completed', label: 'Completed' }
                ];
                
                return filters.map(filter => ({
                    button: {
                        key: filter.key,
                        text: filter.label,
                        className: currentFilter === filter.key ? 'filter-btn active' : 'filter-btn',
                        onclick: () => context.setState('filter', filter.key)
                    }
                }));
            }
        },
        
        // Todo count
        '.todo-count': {
            text: () => {
                const todos = context.getState('todos', []);
                const remaining = todos.filter(t => !t.completed).length;
                return `${remaining} item${remaining !== 1 ? 's' : ''} left`;
            }
        }
    }
});
```

### E-commerce Product Card

```javascript
app.enhance('.product-grid', {
    selectors: {
        '.product-card': (context) => {
            const productId = context.element.dataset.productId;
            const price = parseFloat(context.element.dataset.price);
            
            return {
                className: () => {
                    const inCart = context.getState(`cart.${productId}`, false);
                    const loading = context.getState(`products.${productId}.loading`, false);
                    return `product-card ${inCart ? 'in-cart' : ''} ${loading ? 'loading' : ''}`;
                }
            };
        },
        
        '.add-to-cart-btn': (context) => ({
            onclick: () => {
                const productId = context.element.dataset.productId;
                const price = parseFloat(context.element.dataset.price);
                
                context.setState(`products.${productId}.loading`, true);
                
                // Simulate API call
                setTimeout(() => {
                    const cart = context.getState('cart', {});
                    const quantity = cart[productId]?.quantity || 0;
                    
                    context.setState(`cart.${productId}`, {
                        quantity: quantity + 1,
                        price: price
                    });
                    
                    context.setState(`products.${productId}.loading`, false);
                    
                    // Update cart total
                    const cartItems = context.getState('cart', {});
                    const total = Object.values(cartItems).reduce((sum, item) => 
                        sum + (item.quantity * item.price), 0
                    );
                    context.setState('cartTotal', total);
                }, 500);
            },
            
            text: () => {
                const productId = context.element.dataset.productId;
                const loading = context.getState(`products.${productId}.loading`, false);
                const inCart = context.getState(`cart.${productId}`, false);
                
                if (loading) return 'Adding...';
                if (inCart) return 'In Cart';
                return 'Add to Cart';
            },
            
            disabled: () => {
                const productId = context.element.dataset.productId;
                return context.getState(`products.${productId}.loading`, false);
            }
        }),
        
        '.quantity-controls': (context) => {
            const productId = context.element.dataset.productId;
            const quantity = context.getState(`cart.${productId}.quantity`, 0);
            
            return {
                style: () => ({
                    display: quantity > 0 ? 'flex' : 'none'
                }),
                
                children: () => [
                    {
                        button: {
                            text: '-',
                            className: 'qty-btn decrease',
                            onclick: () => {
                                const current = context.getState(`cart.${productId}.quantity`, 0);
                                if (current > 1) {
                                    context.setState(`cart.${productId}.quantity`, current - 1);
                                } else {
                                    context.setState(`cart.${productId}`, null);
                                }
                            }
                        }
                    },
                    {
                        span: {
                            text: quantity.toString(),
                            className: 'qty-display'
                        }
                    },
                    {
                        button: {
                            text: '+',
                            className: 'qty-btn increase',
                            onclick: () => {
                                const current = context.getState(`cart.${productId}.quantity`, 0);
                                context.setState(`cart.${productId}.quantity`, current + 1);
                            }
                        }
                    }
                ]
            };
        }
    }
});
```

---

## Error Handling

### Common Issues and Solutions

#### 1. Element Not Found During Testing

```javascript
// Problem: context.element is undefined during definition testing
function getDatasetValue(context, key, fallback = '') {
    if (!context.element || !context.element.dataset) {
        return fallback;
    }
    return context.element.dataset[key] || fallback;
}

app.enhance('.data-element', (context) => ({
    text: () => {
        const value = getDatasetValue(context, 'value', 'N/A');
        return `Value: ${value}`;
    }
}));
```

#### 2. Circular Dependencies

```javascript
// Problem: State updates cause infinite loops
app.enhance('.counter', (context) => ({
    onclick: () => {
        const current = context.getState('count', 0);
        // ✅ Good: Only update if value actually changes
        if (current < 10) {
            context.setState('count', current + 1);
        }
    },
    
    text: () => {
        const count = context.getState('count', 0);
        // ❌ Avoid: Don't update state in reactive properties
        // context.setState('lastUpdate', Date.now()); // This would cause a loop
        return `Count: ${count}`;
    }
}));
```

#### 3. Memory Leaks

```javascript
// ✅ Good: Store cleanup function and call it when needed
const cleanupEnhancement = app.enhance('.temporary-element', definition);

// Later, when component unmounts or is no longer needed
cleanupEnhancement();

// ✅ Good: Use proper lifecycle management
app.enhance('.component', (context) => ({
    // Set up any intervals or subscriptions
    onmount: () => {
        const interval = setInterval(() => {
            context.setState('timestamp', Date.now());
        }, 1000);
        
        // Store for cleanup
        context.element._interval = interval;
    },
    
    onunmount: () => {
        // Clean up resources
        if (context.element._interval) {
            clearInterval(context.element._interval);
        }
    }
}));
```

#### 4. Performance Issues

```javascript
// ✅ Good: Debounce expensive operations
let debounceTimer;
app.enhance('.search-input', (context) => ({
    oninput: (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            context.setState('searchQuery', e.target.value);
        }, 300);
    }
}));

// ✅ Good: Disable observers for static content
app.enhance('.static-content', definition, {
    observeNewElements: false
});
```

---

## API Reference Summary

### Main Methods

- `app.enhance(selector, definition, options)` - Enhance elements
- `app.configureEnhancement(options)` - Set global options  
- `app.getEnhancementStats()` - Get enhancement statistics

### Definition Types

- **Object**: Static enhancement definition
- **Function**: Dynamic enhancement with context access

### Property Types

- **Static**: Fixed values (`text: 'Hello'`)
- **Reactive**: Functions that return values (`text: () => state.message`)
- **Element-aware**: Functions that receive element (`text: (el) => el.dataset.value`)

### Selectors Category

- **Container properties**: Applied to the container element
- **Nested selectors**: Applied to elements within the container
- **Function selectors**: Dynamic selector definitions with element-specific context

The Enhance API provides a powerful and flexible way to progressively enhance your HTML with reactive behavior while maintaining clean, organized, and performant code.
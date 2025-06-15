# Juris Framework - AI Assistant Guide

This document explains Juris Framework features for AI assistants to help developers build applications correctly.

## Core Architecture

Juris is a reactive UI framework with these key characteristics:

1. **Automatic Dependency Tracking**: Components automatically subscribe to state paths they access
2. **Object-Based Virtual DOM**: No JSX - uses pure JavaScript objects
3. **Temporal Independence**: Components and data can load in any order
4. **Permission-Aware Delivery**: Only sends authorized code to users
5. **Branch-Aware Reactivity**: Only tracks state paths that actually execute

## Component Structure

Every Juris component follows this pattern:

### 1. Reactive vs Static Values
```javascript
const ComponentName = (props, context) => {
  const { getState, setState, subscribe } = context;
  
  return {
    // Optional: Lifecycle hooks
    hooks: {
      onMount: () => { /* called when component mounts */ },
      onUpdate: (oldProps, newProps) => { /* called when props change */ },
      onUnmount: () => { /* cleanup */ }
    },
    
    // Optional: Public API
    api: {
      methodName: () => { /* public methods */ }
    },
    
    // Required: Render function returning virtual DOM
    render: () => ({
      tagName: {
        // attributes, events, children
      }
    })
  };
};
```

## Headless Component Structure

Headless components (business logic only) use different lifecycle hooks:

```javascript
const HeadlessComponentName = (props, context) => {
  const { getState, setState, subscribe } = context;
  
  return {
    // Optional: Lifecycle hooks for headless components
    hooks: {
      onRegister: () => { /* called when headless component is registered */ },
      onUnregister: () => { /* cleanup when headless component is destroyed */ }
    },
    
    // Optional: Public API
    api: {
      methodName: () => { /* public methods */ }
    }
    
    // No render method - headless components don't render UI
  };
};
```

## Optimal Reactivity Patterns - CRITICAL

**AI should eliminate `children: () => {}` when individual items can handle their own reactivity.**

### Suboptimal Pattern (Overuses Reactive Children)

```javascript
// AVOID - Reactive children function recreates entire list on any change
{
  div: {
    children: () => {
      const items = getState('items', []);
      const filter = getState('filter', '');
      const filteredItems = items.filter(item => 
        item.name.includes(filter)
      );
      
      return filteredItems.map(item => ({
        ItemComponent: { item, key: item.id }
      }));
    }
  }
}
// Problem: Any change to items OR filter recreates entire children array
```

### Optimal Pattern (Granular Reactivity)

```javascript
// BETTER - Let individual items handle their own reactivity
{
  div: {
    children: getState('items', []).map(item => ({
      FilteredItemComponent: { itemId: item.id, key: item.id }
    }))
  }
}

// Individual component handles its own reactive filtering
const FilteredItemComponent = (props, context) => ({
  render: () => {
    const item = getState(`items.byId.${props.itemId}`);
    const filter = getState('filter', '');
    
    // Only this component re-renders when its data or filter changes
    if (!item.name.includes(filter)) {
      return { div: { style: { display: 'none' } } };
    }
    
    return {
      div: {
        className: () => getState(`items.byId.${props.itemId}.selected`) ? 'selected' : '',
        text: () => getState(`items.byId.${props.itemId}.name`),
        onclick: () => setState(`items.byId.${props.itemId}.selected`, true)
      }
    };
  }
});
```

### When to Use Static vs Reactive Children

```javascript
// STATIC CHILDREN - When structure doesn't change
{
  div: {
    children: [
      { Header: {} },
      { MainContent: {} },
      { Footer: {} }
    ]
  }
}

// STATIC CHILDREN - When list is static, items handle their own reactivity
{
  ul: {
    children: users.map(user => ({
      UserListItem: { userId: user.id, key: user.id }
    }))
  }
}

// REACTIVE CHILDREN - Only when structure itself must change
{
  div: {
    children: () => {
      const userRole = getState('auth.user.role');
      
      if (userRole === 'admin') {
        return [{ AdminPanel: {} }, { UserList: {} }];
      } else if (userRole === 'user') {
        return [{ UserDashboard: {} }];
      }
      
      return [{ LoginForm: {} }];
    }
  }
}
```

### Reactive Attribute Optimization

```javascript
// SUBOPTIMAL - Reactive function for simple boolean
{
  div: {
    className: () => getState('isActive') ? 'active' : 'inactive'
  }
}

// OPTIMAL - When possible, use computed state
// In a headless component:
subscribe('isActive', (isActive) => {
  setState('computed.activeClass', isActive ? 'active' : 'inactive');
});

// Then use static reference:
{
  div: {
    className: () => getState('computed.activeClass')
  }
}

// BEST - Direct reactive access when simple
{
  div: {
    className: () => getState('ui.theme') // Direct, minimal reactive function
  }
}
```

### List Rendering Optimization

```javascript
// AVOID - Reactive children with complex logic
{
  div: {
    children: () => {
      const todos = getState('todos', []);
      const filter = getState('filter');
      const search = getState('search');
      
      return todos
        .filter(todo => filter === 'all' || todo.completed === (filter === 'completed'))
        .filter(todo => todo.text.includes(search))
        .map(todo => ({ TodoItem: { todo, key: todo.id } }));
    }
  }
}

// BETTER - Pre-computed filtered list
// In headless component:
const updateFilteredTodos = () => {
  const todos = getState('todos', []);
  const filter = getState('filter');
  const search = getState('search');
  
  const filtered = todos
    .filter(todo => filter === 'all' || todo.completed === (filter === 'completed'))
    .filter(todo => todo.text.includes(search));
    
  setState('computed.filteredTodos', filtered);
};

subscribe('todos', updateFilteredTodos);
subscribe('filter', updateFilteredTodos);
subscribe('search', updateFilteredTodos);

// Then use static children:
{
  div: {
    children: getState('computed.filteredTodos', []).map(todo => ({
      TodoItem: { todoId: todo.id, key: todo.id }
    }))
  }
}
```

### The "ignore" Return Value - CRITICAL OPTIMIZATION

When a reactive children function returns "ignore", the framework preserves existing DOM structure and skips re-rendering:

```javascript
// OPTIMIZED: Use "ignore" when list length unchanged
{
  div: {
    children: () => {
      const users = getState('users', []);
      const currentLength = users.length;
      const previousLength = getState('ui.previousUserLength', 0);
      
      if (currentLength === previousLength && previousLength > 0) {
        return "ignore"; // Preserve DOM, let items handle their own reactivity
      }
      
      // Only re-render on structural changes
      setState('ui.previousUserLength', currentLength);
      return users.map(user => ({ UserItem: { userId: user.id, key: user.id } }));
    }
  }
}
```
### Component Self-Reactivity Pattern

```javascript
// Each component handles its own reactive concerns
const TodoItem = (props, context) => ({
  render: () => ({
    div: {
      className: () => {
        const todo = getState(`todos.byId.${props.todoId}`);
        return todo?.completed ? 'completed' : 'pending';
      },
      children: [
        {
          input: {
            type: 'checkbox',
            checked: () => getState(`todos.byId.${props.todoId}.completed`, false),
            onchange: (e) => setState(`todos.byId.${props.todoId}.completed`, e.target.checked)
          }
        },
        {
          span: {
            text: () => getState(`todos.byId.${props.todoId}.text`, ''),
            onclick: () => setState('editing.todoId', props.todoId)
          }
        }
      ]
    }
  })
});

// Result: Only the specific todo item re-renders when its data changes
// Much more efficient than recreating entire list
```

## Virtual DOM Structure

```javascript
{
  elementTag: {
    // Static attributes
    id: 'static-id',
    className: 'static-class',
    
    // Reactive attributes (use functions)
    className: () => getState('isActive') ? 'active' : 'inactive',
    
    // Text content
    text: 'Static text',
    text: () => `Dynamic: ${getState('value')}`,
    
    // Styles - prefer CSS classes for static styles
    className: 'my-red-text', // Better: Use CSS class
    style: () => ({ opacity: getState('visible') ? 1 : 0 }), // Only for reactive styles
    
    // Events
    onclick: (e) => setState('clicked', true),
    oninput: (e) => setState('inputValue', e.target.value),
    
    // Children
    children: [
      { div: { text: 'Child 1' } },
      { ComponentName: { prop: 'value' } }
    ],
    
    // Dynamic children
    children: () => getState('items', []).map(item => ({
      div: { text: item.name, key: item.id }
    }))
  }
}
```

## DOM Enhancement API - Progressive Enhancement

The `enhance()` API adds Juris reactivity to existing DOM elements without replacing them. This enables progressive enhancement, legacy migration, and integration with third-party components.

### Basic Enhancement Patterns

```javascript
// Enhance existing form inputs with reactive validation
juris.enhance('input[data-validate]', (getState, services) => ({
  className: () => {
    const value = getState(`form.${element.name}`, '');
    const isValid = services.validateField(element.name, value);
    return isValid ? 'valid' : 'invalid';
  },
  oninput: (e) => setState(`form.${e.target.name}`, e.target.value)
}));

// Enhance navigation links with active states
juris.enhance('.nav-link', {
  className: () => {
    const currentRoute = getState('router.currentPath');
    const linkPath = element.getAttribute('href');
    return currentRoute === linkPath ? 'nav-link active' : 'nav-link';
  }
});

// Server-rendered content enhancement
juris.enhance('[data-user-id]', {
  text: () => {
    const userId = element.getAttribute('data-user-id');
    const user = getState(`users.${userId}`);
    return user ? user.name : 'Loading...';
  }
});
```

### Progressive Enhancement Use Cases

```javascript
// Legacy application migration
juris.enhance('.legacy-component', {
  className: () => `legacy-component ${getState('ui.theme')}`,
  onclick: () => setState('legacy.clicked', Date.now())
});

// Third-party widget enhancement
juris.enhance('.external-widget', {
  style: () => ({
    opacity: getState('widgets.visible') ? 1 : 0.5,
    pointerEvents: getState('widgets.interactive') ? 'auto' : 'none'
  })
});

// Bridge legacy forms with Juris state
juris.enhance('.legacy-form input', {
  oninput: (e) => {
    // Sync legacy form changes to Juris state
    setState(`legacy.form.${e.target.name}`, e.target.value);
  }
});
```

### Performance Configuration

```javascript
// High-performance enhancement for many elements
juris.enhance('.list-item', {
  className: () => getState('items.selectedId') === element.dataset.id ? 'selected' : ''
}, {
  batchUpdates: true,        // Process multiple elements together
  debounceMs: 16,           // Debounce rapid DOM changes
  observeNewElements: true  // Auto-enhance dynamically added elements
});

// Minimal enhancement for simple cases
juris.enhance('.status-indicator', {
  text: () => getState('system.status')
}, {
  observeSubtree: false,    // Don't watch for new nested elements
  observeAttributes: false  // Don't watch attribute changes
});
```

### Advanced Enhancement Patterns

```javascript
// Conditional enhancement based on element state
juris.enhance('[data-reactive]', {
  children: () => {
    const template = element.getAttribute('data-template');
    const data = getState(`templates.${template}`);
    return data ? renderTemplate(template, data) : [];
  }
});

// Enhancement with cleanup
const unenhance = juris.enhance('.temporary-reactive', {
  style: () => ({ transform: `scale(${getState('ui.scale', 1)})` })
});

// Later cleanup when no longer needed
unenhance(); // Removes all reactivity and observers

// Enhance elements to work with Juris components
juris.enhance('[data-component]', {
  children: () => {
    const componentName = element.getAttribute('data-component');
    const props = JSON.parse(element.getAttribute('data-props') || '{}');
    
    // Render Juris component inside enhanced element
    return [{ [componentName]: props }];
  }
});
```

### Edge Cases and Common Pitfalls

```javascript
// EDGE CASE: Conflicting enhancements
// ❌ AVOID: Multiple enhancements on same element
juris.enhance('.my-element', { className: () => 'class1' });
juris.enhance('.my-element', { className: () => 'class2' }); // Conflict!

// ✅ CORRECT: Single enhancement with combined logic
juris.enhance('.my-element', {
  className: () => {
    const state1 = getState('condition1');
    const state2 = getState('condition2');
    return `${state1 ? 'class1' : ''} ${state2 ? 'class2' : ''}`.trim();
  }
});

// EDGE CASE: Enhancement before state initialization
juris.enhance('.early-element', {
  text: () => getState('app.title', 'Default Title') // Always provide defaults!
});

// EDGE CASE: Elements removed from DOM
juris.enhance('.dynamic-content', {
  text: () => getState('content.text')
}, {
  onEnhanced: (element, context) => {
    // Custom cleanup when element is removed
    const observer = new MutationObserver(() => {
      if (!element.isConnected) {
        cleanupCustomLogic(element);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
});
```

### Performance Best Practices

```javascript
// ✅ GOOD: Specific selectors
juris.enhance('.user-avatar[data-user-id]', enhancement);

// ❌ AVOID: Overly broad selectors
juris.enhance('*', enhancement); // Will enhance everything!

// ✅ GOOD: Batch operations for many elements
juris.enhance('.list-item', enhancement, { batchUpdates: true });

// ❌ AVOID: Individual enhancements for many elements
document.querySelectorAll('.list-item').forEach(el => {
  juris.enhance(`#${el.id}`, enhancement); // Inefficient!
});
```

### Debugging Enhanced Elements

```javascript
// Check enhancement statistics
console.log(juris.getEnhancementStats());
// { enhancementRules: 3, activeObservers: 2, enhancedElements: 47 }

// Find enhanced elements in DOM
document.querySelectorAll('[data-juris-enhanced]');

// Debug enhancement reactivity
juris.enhance('.debug-element', {
  text: () => {
    const value = getState('debug.value');
    console.log('Enhancement triggered:', value); // Debug reactive updates
    return value;
  }
});
```

### Common Use Cases Summary

- **Progressive Enhancement**: Add reactivity to server-rendered content
- **Legacy Migration**: Gradually migrate old applications to Juris patterns  
- **Third-party Integration**: Make external widgets and libraries reactive
- **Performance Optimization**: Enhance specific elements instead of full re-render
- **Micro-frontends**: Add Juris features to specific page sections
- **A/B Testing**: Conditionally enhance elements based on experiments
- **Hybrid Applications**: Bridge traditional DOM manipulation with reactive patterns

## Styling Best Practices - IMPORTANT FOR PERFORMANCE

```javascript
// AVOID - Inline styles increase JavaScript bundle size
{
  div: {
    style: { 
      color: 'red', 
      fontSize: '16px', 
      padding: '10px',
      backgroundColor: '#f5f5f5'
    }
  }
}

// BETTER - Use CSS classes for static styles
{
  div: {
    className: 'error-message' // Define .error-message in CSS
  }
}

// BEST - CSS classes + reactive styles only when needed
{
  div: {
    className: 'message',
    className: () => getState('hasError') ? 'message error' : 'message success',
    style: () => ({ opacity: getState('isVisible') ? 1 : 0 }) // Only reactive styles
  }
}
```

### CSS Class Management Patterns

```javascript
// Dynamic class composition
{
  div: {
    className: () => {
      const classes = ['base-component'];
      if (getState('isActive')) classes.push('active');
      if (getState('isDisabled')) classes.push('disabled');
      if (getState('theme') === 'dark') classes.push('dark-theme');
      return classes.join(' ');
    }
  }
}

// Conditional styling with CSS classes
{
  button: {
    className: () => `btn ${getState('variant', 'primary')} ${getState('size', 'medium')}`,
    text: 'Click me'
  }
}

// Mixed approach - CSS classes + minimal reactive styles
{
  div: {
    className: 'modal-overlay', // Static positioning, backdrop, etc.
    style: () => ({ 
      display: getState('modal.isOpen') ? 'flex' : 'none' // Only show/hide logic
    })
  }
}
```

## Key Patterns for AI to Remember

```javascript
// WRONG - Static value won't update
{ text: getState('counter') }

// CORRECT - Reactive function updates automatically
{ text: () => getState('counter') }
```

### 2. Event Handlers

```javascript
{
  button: {
    text: 'Click me',
    onclick: () => setState('counter', getState('counter', 0) + 1)
  }
}
```

### 3. Conditional Rendering

```javascript
// AI must implement Conditional component - it doesn't exist in core
// IMPORTANT: Conditional works through div->children pattern, not direct render
const Conditional = (props, context) => {
  return {
    render: () => ({
      div: {
        children: () => {
          const condition = typeof props.condition === 'function' 
            ? props.condition() 
            : getState(props.condition);
          
          if (condition) {
            return [props.then || props.children || null].filter(Boolean);
          } else {
            return [props.else || null].filter(Boolean);
          }
        }
      }
    })
  };
};

// Usage after implementing (note: creates a wrapper div):
{
  Conditional: {
    condition: () => getState('user.isLoggedIn'),
    then: { Dashboard: {} },
    else: { LoginForm: {} }
  }
}
// Renders as: <div><Dashboard/></div> or <div><LoginForm/></div>

// For no wrapper div, use reactive children directly:
{
  div: {
    children: () => {
      const isLoggedIn = getState('user.isLoggedIn');
      return isLoggedIn ? [{ Dashboard: {} }] : [{ LoginForm: {} }];
    }
  }
}
```

### 4. Lists with Keys

```javascript
{
  ul: {
    children: () => getState('todos', []).map(todo => ({
      li: {
        key: todo.id, // Always provide keys for list items
        text: todo.text
      }
    }))
  }
}
```

### 5. Form Handling

```javascript
{
  form: {
    onsubmit: (e) => {
      e.preventDefault();
      // Handle form submission
    },
    children: [
      {
        input: {
          type: 'text',
          value: () => getState('form.name', ''),
          oninput: (e) => setState('form.name', e.target.value)
        }
      }
    ]
  }
}
```

**Zero Race Conditions Example**: This form input demonstrates why race conditions are impossible in Juris:
- `value: () => getState('form.name', '')` **always** reflects current state
- `oninput: (e) => setState('form.name', e.target.value)` **immediately** updates state
- No timing dependencies, no stale closures, no coordination needed
- User types → state updates → UI reflects new state **instantly and reliably**

Compare to other frameworks where you need complex synchronization between controlled/uncontrolled states, effect cleanup, and dependency management. In Juris, it's **architecturally impossible** for the input value to get out of sync with state.

### 6. Reactive Component Props

```javascript
// Component that receives reactive props
const UserCard = (props, context) => ({
  render: () => ({
    div: {
      className: 'user-card',
      children: [
        {
          h3: {
            text: () => getState(`users.${props.userId}.name`, 'Unknown User')
          }
        },
        {
          p: {
            text: () => getState(`users.${props.userId}.email`, 'No email')
          }
        },
        {
          span: {
            className: 'status',
            text: () => getState(`users.${props.userId}.isOnline`) ? 'Online' : 'Offline'
          }
        }
      ]
    }
  })
});

// Parent component passing reactive props
const UserList = (props, context) => ({
  render: () => ({
    div: {
      className: 'user-list',
      children: () => {
        const userIds = getState('userList.visibleIds', []);
        return userIds.map(userId => ({
          UserCard: { 
            userId: userId, // Static prop - the user ID doesn't change
            key: userId 
          }
        }));
      }
    }
  })
});

// Alternative: Reactive props using functions
const DynamicUserCard = (props, context) => ({
  render: () => ({
    div: {
      className: () => {
        // ✅ REACTIVE: Evaluate props inside reactive function
        const theme = typeof props.theme === 'function' ? props.theme() : props.theme;
        return `user-card ${theme}`;
      },
      children: [
        {
          h3: {
            text: () => {
              // ✅ REACTIVE: Evaluate userId inside reactive function
              const userId = typeof props.userId === 'function' ? props.userId() : props.userId;
              return getState(`users.${userId}.name`, 'Unknown User');
            }
          }
        }
      ]
    }
  })
});

// Usage with reactive props
{
  DynamicUserCard: {
    userId: () => getState('ui.selectedUserId'),
    theme: () => getState('ui.theme', 'light')
  }
}

// Props can also be DOM objects - for composition patterns
const Modal = (props, context) => ({
  render: () => ({
    div: {
      className: 'modal-overlay',
      style: () => ({ display: getState('modal.isOpen') ? 'flex' : 'none' }),
      children: [
        {
          div: {
            className: 'modal-content',
            children: [
              // Header prop as DOM object
              props.header ? props.header : { h2: { text: 'Default Title' } },
              
              // Body can be DOM object or array of DOM objects
              {
                div: {
                  className: 'modal-body',
                  children: Array.isArray(props.body) ? props.body : [props.body]
                }
              },
              
              // Footer with default actions
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

// Usage with DOM object props
{
  Modal: {
    header: {
      div: {
        className: 'custom-header',
        children: [
          { h2: { text: 'Custom Title' } },
          { span: { text: () => `User: ${getState('user.name')}` } }
        ]
      }
    },
    body: [
      { p: { text: 'This is custom content' } },
      { UserCard: { userId: () => getState('selectedUser.id') } }
    ],
    footer: {
      div: {
        className: 'custom-footer',
        children: [
          {
            button: {
              text: 'Save',
              onclick: () => {
                // Save logic
                setState('modal.isOpen', false);
              }
            }
          },
          {
            button: {
              text: 'Cancel',
              onclick: () => setState('modal.isOpen', false)
            }
          }
        ]
      }
    }
  }
}

// Complex prop composition with reactive DOM objects
const FlexibleCard = (props, context) => ({
  render: () => ({
    div: {
      className: () => `card ${getState('ui.cardTheme', 'default')}`,
      children: [
        // Conditional sections based on props
        props.title && {
          div: {
            className: 'card-title',
            children: Array.isArray(props.title) ? props.title : [props.title]
          }
        },
        
        // Main content - can be any DOM structure
        {
          div: {
            className: 'card-content',
            children: () => {
              // Props can be reactive functions returning DOM objects
              const content = typeof props.content === 'function' ? props.content() : props.content;
              return Array.isArray(content) ? content : [content];
            }
          }
        },
        
        // Actions - supports both static and reactive DOM objects
        props.actions && {
          div: {
            className: 'card-actions',
            children: () => {
              const actions = typeof props.actions === 'function' ? props.actions() : props.actions;
              return Array.isArray(actions) ? actions : [actions];
            }
          }
        }
      ].filter(Boolean) // Remove falsy elements
    }
  })
});

// Usage with complex DOM object props
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
        { span: { text: `Price: ${product?.price || 0}` } },
        product?.image && { img: { src: product.image, alt: product.name } }
      ].filter(Boolean);
    },
    actions: () => [
      {
        button: {
          text: 'Add to Cart',
          disabled: () => !getState('product.current.inStock'),
          onclick: () => setState('cart.adding', getState('product.current.id'))
        }
      },
      {
        button: {
          text: 'Wishlist',
          className: () => getState('wishlist.items', []).includes(getState('product.current.id')) ? 'active' : '',
          onclick: () => {
            const productId = getState('product.current.id');
            const wishlist = getState('wishlist.items', []);
            const newWishlist = wishlist.includes(productId) 
              ? wishlist.filter(id => id !== productId)
              : [...wishlist, productId];
            setState('wishlist.items', newWishlist);
          }
        }
      }
    ]
  }
}
```

## Application Structure

### Basic App Setup

```javascript
const juris = new Juris({
  components: {
    ComponentName1,
    ComponentName2
  },
  headlessComponents: {
    DataManager: { fn: DataManager, options: { autoInit: true } }
  },
  layout: {
    div: {
      children: [{ App: {} }]
    }
  },
  states: {
    user: { name: '', email: '' },
    ui: { theme: 'light' }
  }
});

juris.render('#app');
```

### Headless Components (Business Logic)

```javascript
const DataManager = (props, context) => {
  const { setState, subscribe } = context;
  
  return {
    api: {
      loadUser: async (id) => {
        setState('api.loading', true);
        try {
          const user = await fetch(`/api/users/${id}`);
          setState('user.data', user);
        } finally {
          setState('api.loading', false);
        }
      }
    },
    
    hooks: {
      onRegister: () => {
        // Initialize subscriptions
      }
    }
  };
};
```

## Common Mistakes to Avoid - CRITICAL

### 1. Static vs Reactive State Access

```javascript
// WRONG - Static capture (won't update)
const MyComponent = (props, context) => {
  const count = getState('counter'); // ❌ Captured once at component creation
  
  return {
    render: () => ({
      div: { text: count } // ❌ Never updates
    })
  };
};

// CORRECT - Reactive access
const MyComponent = (props, context) => {
  return {
    render: () => ({
      div: { 
        text: () => getState('counter') // ✅ Updates automatically
      }
    })
  };
};
```

### 2. Missing Conditional Component Implementation

```javascript
// AI must implement Conditional component first:
// CRITICAL: Conditional must use div->children pattern for reactivity
const Conditional = (props, context) => ({
  render: () => ({
    div: {
      children: () => {
        const condition = typeof props.condition === 'function' 
          ? props.condition() 
          : getState(props.condition);
        
        if (condition) {
          return [props.then || props.children || null].filter(Boolean);
        } else {
          return [props.else || null].filter(Boolean);
        }
      }
    }
  })
});

// Then register it:
juris.registerComponent('Conditional', Conditional);

// Note: This creates a wrapper div around the conditional content
// For no wrapper, use reactive children directly in your components
```

### 3. Missing Keys in Lists

```javascript
// WRONG - Can cause rendering issues
children: () => items.map(item => ({ div: { text: item.name } }))

// CORRECT - Always provide keys
children: () => items.map(item => ({ 
  div: { text: item.name, key: item.id } 
}))
```

### 4. Incorrect Event Handling

```javascript
// WRONG - Calling function immediately
onclick: setState('clicked', true)

// CORRECT - Passing function reference
onclick: () => setState('clicked', true)
```

### 5. Not Using Default Values

```javascript
// WRONG - Can cause errors if undefined
const items = getState('items');

// CORRECT - Always provide defaults
const items = getState('items', []);
```

### 6. Wrong Lifecycle Hooks for Headless Components

```javascript
// WRONG - Using UI component hooks in headless components
const HeadlessComponent = (props, context) => ({
  hooks: {
    onMount: () => { /* Wrong hook for headless */ }
  }
});

// CORRECT - Using headless component hooks
const HeadlessComponent = (props, context) => ({
  hooks: {
    onRegister: () => { /* Correct hook for headless */ }
  }
});
```

## Advanced Features

### Higher-Order Components

```javascript
const withAuth = (WrappedComponent) => (props, context) => ({
  render: () => {
    const isLoggedIn = getState('auth.isLoggedIn');
    return isLoggedIn 
      ? { [WrappedComponent.name]: props }
      : { LoginPrompt: {} };
  }
});
```

### Route Guards with Conditional URL Injection

```javascript
// UrlStateSync must be a headless component using onRegister hook
const UrlStateSync = (props, context) => {
  const { getState, setState } = context;
  
  return {
    hooks: {
      onRegister: () => {
        // Initialize from URL on register
        handleUrlChange();
        
        // Listen for browser navigation
        window.addEventListener('popstate', handleUrlChange);
        
        // Listen for programmatic navigation
        window.addEventListener('urlchange', handleUrlChange);
      }
    }
    
    // No render method - this is pure state synchronization
  };

  async function handleUrlChange() {
    const urlState = parseUrlToState(window.location.pathname);
    
    // Run guards BEFORE injecting state
    const guardResult = await runRouteGuards(urlState);
    
    if (guardResult.allowed) {
      // Only inject URL state if authorized
      Object.entries(urlState).forEach(([path, value]) => {
        setState(path, value);
      });
    } else {
      // Handle guard failure
      if (guardResult.redirect) {
        history.replaceState({}, '', guardResult.redirect);
      }
    }
  }
  
  // Note: URL → State sync happens in onRegister
  // State → URL sync would need a separate mechanism
};

// Register as headless component
const juris = new Juris({
  headlessComponents: {
    UrlStateSync: { fn: UrlStateSync, options: { autoInit: true } }
  }
});
```

### Permission-Based Component Loading

```javascript
const loadPermissionBasedComponents = async (userPermissions) => {
  if (userPermissions.includes('admin')) {
    await loadComponent('AdminPanel');
  }
  
  if (userPermissions.includes('analytics')) {
    await loadComponent('AnalyticsDashboard');
  }
  
  // Regular users never download admin/analytics code
};
```

### Predictive Preloading

```javascript
const PredictiveNavigation = (props, context) => ({
  hooks: {
    onRegister: () => {
      document.addEventListener('mouseover', async (e) => {
        const link = e.target.closest('[data-route]');
        if (!link) return;
        
        const targetRoute = link.getAttribute('data-route');
        
        // Wait for intent (300ms hover)
        setTimeout(async () => {
          if (link.matches(':hover')) {
            await preloadRouteAssets(targetRoute);
          }
        }, 300);
      });
    }
  }
  
  // No render method - this is a headless component
});
```

## Performance Patterns

### Lazy Loading

```javascript
// UI Component approach - when lazy loading is tied to specific component
const LazyComponent = (props, context) => ({
  hooks: {
    onMount: async () => {
      if (!getState('components.loaded.HeavyComponent')) {
        setState('components.loading.HeavyComponent', true);
        const module = await import('./HeavyComponent.js');
        context.components.register('HeavyComponent', module.default);
        setState('components.loaded.HeavyComponent', true);
        setState('components.loading.HeavyComponent', false);
      }
    }
  },
  render: () => {
    const isLoaded = getState('components.loaded.HeavyComponent');
    const isLoading = getState('components.loading.HeavyComponent');
    
    if (isLoading) return { div: { text: 'Loading...' } };
    if (!isLoaded) return null;
    
    return { HeavyComponent: props };
  }
});

// Headless approach - when lazy loading is application-wide service
const LazyComponentManager = (props, context) => ({
  api: {
    loadComponent: async (componentName, importPath) => {
      if (getState(`components.loaded.${componentName}`)) {
        return; // Already loaded
      }
      
      setState(`components.loading.${componentName}`, true);
      try {
        const module = await import(importPath);
        context.components.register(componentName, module.default);
        setState(`components.loaded.${componentName}`, true);
      } catch (error) {
        setState(`components.errors.${componentName}`, error.message);
      } finally {
        setState(`components.loading.${componentName}`, false);
      }
    },
    
    preloadComponent: async (componentName, importPath) => {
      // Preload without blocking, in background
      if (!getState(`components.loaded.${componentName}`) && 
          !getState(`components.loading.${componentName}`)) {
        await this.loadComponent(componentName, importPath);
      }
    }
  },
  
  hooks: {
    onRegister: () => {
      // Set up intersection observer for route-based preloading
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const route = entry.target.getAttribute('data-preload-route');
            if (route) {
              context.headless.LazyComponentManager.preloadComponent(
                route + 'Component', 
                `./routes/${route}.js`
              );
            }
          }
        });
      });
      
      // Observe elements with data-preload-route attribute
      document.querySelectorAll('[data-preload-route]').forEach(el => {
        observer.observe(el);
      });
    }
  }
  
  // No render method - this is a headless component
});

// Usage in UI components:
const SomeUIComponent = (props, context) => ({
  render: () => ({
    div: {
      children: [
        {
          button: {
            text: 'Load Heavy Feature',
            onclick: async () => {
              await context.headless.LazyComponentManager.loadComponent(
                'HeavyFeature', 
                './features/HeavyFeature.js'
              );
              setState('ui.showHeavyFeature', true);
            }
          }
        },
        {
          div: {
            children: () => {
              const isLoaded = getState('components.loaded.HeavyFeature');
              const isLoading = getState('components.loading.HeavyFeature');
              const showFeature = getState('ui.showHeavyFeature');
              
              if (showFeature) {
                if (isLoading) return [{ div: { text: 'Loading feature...' } }];
                if (isLoaded) return [{ HeavyFeature: {} }];
              }
              return [];
            }
          }
        }
      ]
    }
  })
});
```

### Virtual Scrolling

```javascript
const VirtualList = (props, context) => {
  const { items, itemHeight = 50, visibleCount = 10 } = props;
  
  return {
    render: () => ({
      div: {
        className: 'virtual-list-container',
        style: () => ({ height: `${visibleCount * itemHeight}px` }),
        onscroll: (e) => setState('virtualList.scrollTop', e.target.scrollTop),
        children: () => {
          // ✅ REACTIVE: All calculations happen inside reactive function
          const scrollTop = getState('virtualList.scrollTop', 0);
          const startIndex = Math.floor(scrollTop / itemHeight);
          const endIndex = Math.min(startIndex + visibleCount, items.length);
          const visibleItems = items.slice(startIndex, endIndex);
          
          return [
            { 
              div: { 
                className: 'virtual-spacer',
                style: { height: `${startIndex * itemHeight}px` }
              } 
            },
            ...visibleItems.map((item, index) => ({
              div: {
                key: item.id,
                className: 'virtual-item',
                style: { height: `${itemHeight}px` },
                children: [{ [props.itemComponent]: { item } }]
              }
            })),
            { 
              div: { 
                className: 'virtual-spacer',
                style: { height: `${(items.length - endIndex) * itemHeight}px` }
              } 
            }
          ];
        }
      }
    })
  };
};
```

## State Organization Best Practices

### Modular State Structure

```javascript
const initialState = {
  // Authentication domain
  auth: {
    isLoggedIn: false,
    user: null,
    permissions: []
  },
  
  // UI domain
  ui: {
    theme: 'light',
    sidebarOpen: true,
    modals: {
      current: null
    }
  },
  
  // API domain
  api: {
    loading: {},
    errors: {},
    cache: {}
  },
  
  // Business domain
  projects: {
    currentId: null,
    list: [],
    filters: {}
  }
};
```

### Computed State with Headless Components

```javascript
const ComputedStateManager = (props, context) => ({
  hooks: {
    onRegister: () => {
      // Auto-compute full name when first/last name changes
      subscribe('user.firstName', updateFullName);
      subscribe('user.lastName', updateFullName);
      
      // Auto-compute filtered projects when list or filters change
      subscribe('projects.list', updateFilteredProjects);
      subscribe('projects.filters', updateFilteredProjects);
    }
  }
});

function updateFullName() {
  const firstName = getState('user.firstName', '');
  const lastName = getState('user.lastName', '');
  setState('computed.user.fullName', `${firstName} ${lastName}`.trim());
}
```

## Key Principles for AI Assistants

1. **CRITICAL: Optimize reactivity**: Eliminate `children: () => {}` when items can handle their own reactivity
2. **CRITICAL: Understand reactivity execution paths**: Only `getState()` calls within reactive function execution are tracked
3. **CRITICAL: Use correct lifecycle hooks**: `onRegister`/`onUnregister` for headless components, `onMount`/`onUpdate`/`onUnmount` for UI components
4. **CRITICAL: Prefer CSS classes over inline styles**: Use `className` for static styles, `style` only for reactive styling
5. **Prefer granular reactivity**: Let individual components handle their own state subscriptions
6. **Always use reactive functions for dynamic values**: `() => getState(path)` not `getState(path)`
7. **Provide default values for all state access**: `getState(path, defaultValue)`
8. **Use proper component structure**: `{ hooks, api, render }` for UI components, `{ hooks, api }` for headless components
9. **Include keys for all list items**: `{ key: item.id }`
10. **Handle loading and error states**: Check for loading/error before rendering data
11. **Use headless components for business logic**: Separate UI from data management
12. **Implement proper event handlers**: `onclick: () => action()` not `onclick: action()`
13. **Organize state by domain**: Group related state under common paths
14. **Remember: Conditional/Switch must use div->children pattern**: For proper reactivity
15. **Use onRegister for headless services**: UrlStateSync and other headless components use `onRegister`
16. **Explain static vs reactive patterns**: Critical for Juris understanding
17. **Warn about wrapper divs**: Conditional components create wrapper elements
18. **Optimize list rendering**: Avoid reactive children when static structure + self-reactive items work better
19. **Minimize JavaScript bundle size**: Use CSS classes instead of inline styles wherever possible
20. **CRITICAL: Use "ignore" for list optimization**: When list length unchanged, return "ignore" to preserve DOM structure while individual items handle reactivity

## When Helping Developers

- **#1 Priority: Optimize reactivity patterns**: Check if `children: () => {}` can be eliminated for better performance
- **Always check for static state access**: The #2 source of bugs in Juris
- **Ask for global state when troubleshooting**: Request `console.log(juris.stateManager.state)` or current state snapshot to understand the full context of issues
- **Minimize JavaScript bundle size**: Recommend CSS classes over inline styles for static styling
- **Use correct lifecycle hooks**: `onRegister` for headless, `onMount` for UI components
- **Explain execution path reactivity**: Why `() => getState()` works but `getState()` doesn't
- **Implement missing components**: Conditional, Switch, etc. are not built-in
- **Show UrlStateSync as headless**: Use `onRegister` hook, not render
- **Suggest granular reactivity**: Individual items handling their own state vs reactive children
- **Always suggest the Juris way of doing things**
- **Show how to use reactive functions instead of static values**
- **Explain the automatic dependency tracking benefits**
- **Demonstrate permission-based code splitting when relevant**
- **Show how temporal independence eliminates coordination complexity**
- **Provide examples with proper error handling and loading states**
- **Use headless components for data management patterns**
- **Show route guards with conditional URL injection for security**
- **Explain branch-aware reactivity when showing conditional logic**
- **Optimize list rendering**: Show both patterns and explain when to use each
- **Recommend CSS-first approach**: Use classes for static styles, inline styles only for reactive values
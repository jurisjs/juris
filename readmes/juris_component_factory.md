# Juris JSON Component Factory & HTML Enhancement Guide

## Overview

Juris provides powerful patterns for creating components from JSON configurations and enhancing existing HTML with reactive behavior. This guide covers the JSON Component Factory pattern and the comprehensive enhance() API for seamless HTML enhancements.

## Table of Contents

1. [JSON Component Factory](#json-component-factory)
2. [HTML Enhancement API](#html-enhancement-api)
3. [Progressive Enhancement](#progressive-enhancement)
4. [Integration Examples](#integration-examples)
5. [Best Practices](#best-practices)

---

## Streaming JSON Content Engine

### Revolutionary Pattern: Content Streaming + Progressive Enhancement

The JSON Component Factory enables streaming pure JSON content without event handlers, then letting enhance() add interactivity progressively. This creates unprecedented performance and flexibility.

#### **The Streaming Pattern**

```javascript
// 1. Server streams pure content JSON (no events, no handlers)
const contentStream = {
  article: {
    className: 'blog-post',
    'data-post-id': '123',
    children: [
      {
        header: {
          children: [
            {
              h1: {
                text: '10 Ways to Optimize Your React App'
              }
            },
            {
              div: {
                className: 'post-meta',
                children: [
                  {
                    span: {
                      className: 'author',
                      text: 'By John Doe'
                    }
                  },
                  {
                    time: {
                      className: 'publish-date',
                      datetime: '2024-01-15',
                      text: 'January 15, 2024'
                    }
                  },
                  {
                    div: {
                      className: 'engagement-stats',
                      children: [
                        {
                          span: {
                            className: 'like-count',
                            'data-post-id': '123',
                            text: '42 likes'
                          }
                        },
                        {
                          span: {
                            className: 'share-count',
                            'data-post-id': '123',
                            text: '18 shares'
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
      {
        div: {
          className: 'post-content',
          children: [
            {
              p: {
                text: 'React optimization is crucial for performance...'
              }
            },
            {
              button: {
                className: 'read-more-btn',
                'data-action': 'expand-content',
                text: 'Read More'
              }
            }
          ]
        }
      }
    ]
  }
};

// 2. Render pure content instantly (no JavaScript required)
const contentHTML = juris.domRenderer.render(contentStream);

// 3. enhance() adds interactivity later (progressive enhancement)
// Note: ALL interactivity comes from enhance(), never from JSON
juris.enhance('.like-btn', (context) => {
  // context.element gives direct access to each enhanced element
  const { element } = context;
  
  return {
    onclick: async (event) => {
      // Use context.element instead of event.target for clarity
      const postId = element.dataset.postId;
      const isLiked = context.getState(`posts.${postId}.liked`, false);
      
      // Toggle like state
      const newLikedState = !isLiked;
      context.setState(`posts.${postId}.liked`, newLikedState);
      
      // Update server
      await toggleLike(postId, newLikedState);
      
      // Update like count
      const currentCount = context.getState(`posts.${postId}.likeCount`, 0);
      context.setState(`posts.${postId}.likeCount`, currentCount + (newLikedState ? 1 : -1));
    },
    
    text: () => {
      // Direct access to element's data attributes
      const postId = element.dataset.postId;
      const isLiked = context.getState(`posts.${postId}.liked`, false);
      const count = context.getState(`posts.${postId}.likeCount`, 42);
      return `${isLiked ? '♥' : '♡'} ${count}`;
    },
    
    className: () => {
      const postId = element.dataset.postId;
      const isLiked = context.getState(`posts.${postId}.liked`, false);
      return `like-btn ${isLiked ? 'liked' : ''}`;
    }
  };
});
```

### Performance Benefits

JSON streaming provides remarkable advantages over traditional HTML delivery. JSON payloads are approximately 68% smaller than equivalent HTML with embedded JavaScript. This size reduction enables intelligent preloading strategies that download images and assets before users reach them in feeds.

The separation between content structure and interactive behavior allows for optimal caching strategies. Content can be cached aggressively at CDN level while behavior enhancements are applied client-side. This architecture also enables universal content compatibility where the same JSON works across web, mobile, email, and print formats.

---

## JSON Component Factory

### Basic JSON to Component Pattern

Transform JSON configurations into fully functional Juris components using the native Object DOM structure:

```javascript
function JSONComponentFactory(props, context) {
  const { componentConfig } = props;
  
  const createComponentFromJSON = (config) => {
    if (!config || typeof config !== 'object') {
      return { div: { text: 'Invalid component config' } };
    }
    
    return processJSONElement(config);
  };
  
  const processJSONElement = (element) => {
    // Extract the tag name (first key in the object)
    const tagName = Object.keys(element)[0];
    const elementProps = element[tagName] || {};
    
    // Process properties with state binding
    const processedProps = processProps(elementProps, element.id);
    
    // Process children recursively
    if (elementProps.children) {
      if (Array.isArray(elementProps.children)) {
        processedProps.children = elementProps.children.map(child => {
          if (typeof child === 'string') {
            return { span: { text: child } };
          }
          return processJSONElement(child);
        });
      } else if (typeof elementProps.children === 'string') {
        processedProps.text = elementProps.children;
        delete processedProps.children;
      } else {
        processedProps.children = processJSONElement(elementProps.children);
      }
    }
    
    return { [tagName]: processedProps };
  };
  
  const processProps = (props, elementId) => {
    const processed = {};
    
    Object.entries(props).forEach(([key, value]) => {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        // State binding - create reactive function
        const statePath = value.slice(2, -2).trim();
        const fullPath = statePath.startsWith('state.') 
          ? `components.${elementId}.${statePath.slice(6)}`
          : statePath;
          
        processed[key] = () => context.getState(fullPath);
      } else if (typeof value === 'object' && value.type === 'computed') {
        // Computed property
        processed[key] = () => evaluateComputed(value, elementId);
      } else {
        processed[key] = value;
      }
    });
    
    return processed;
  };
  
  const evaluateComputed = (computed, elementId) => {
    const { expression, dependencies = [] } = computed;
    
    // Get dependency values
    const values = {};
    dependencies.forEach(dep => {
      const fullPath = `components.${elementId}.${dep}`;
      values[dep] = context.getState(fullPath);
    });
    
    // Evaluate expression safely
    try {
      return new Function(...Object.keys(values), `return ${expression}`)(...Object.values(values));
    } catch (error) {
      console.error('Computed property error:', error);
      return null;
    }
  };
  
  return createComponentFromJSON(componentConfig);
}

// Note: This example shows a corrected counter that separates structure from behavior

// First: Define the pure JSON structure (NO JavaScript events)
const counterConfig = {
  div: {
    className: 'counter-widget',
    'data-component-id': 'counter',
    children: [
      {
        h2: {
          className: 'counter-display',
          text: 'Counter: 0'  // Static initial text, updated by enhancement
        }
      },
      {
        button: {
          className: 'increment-btn',
          text: 'Increment'
          // Note: No onclick here! All events come from enhance()
        }
      }
    ]
  }
};

// Second: Register as component
const juris = new Juris({
  components: {
    JSONComponent: JSONComponentFactory
  }
});

// Third: Render the pure structure
const counterElement = juris.componentManager.create('JSONComponent', {
  componentConfig: counterConfig
});

// Fourth: Add interactivity with enhance() API
juris.enhance('.counter-display', (context) => ({
  text: () => {
    const count = context.getState('components.counter.count', 0);
    return `Counter: ${count}`;
  }
}));

juris.enhance('.increment-btn', (context) => ({
  onclick: (event) => {
    const current = context.getState('components.counter.count', 0);
    context.setState('components.counter.count', current + 1);
  }
}));
```

### Advanced JSON Component Features

#### **Conditional Rendering and Lists**

```javascript
// Pure JSON structure with NO JavaScript functions
const todoListConfig = {
  div: {
    className: 'todo-app',
    'data-component': 'todo-list',
    children: [
      {
        input: {
          type: 'text',
          className: 'todo-input',
          placeholder: 'Add new todo...'
          // No oninput event here - added by enhance()
        }
      },
      {
        button: {
          className: 'add-todo-btn',
          text: 'Add Todo'
          // No onclick event here - added by enhance()
        }
      },
      {
        ul: {
          className: 'todo-list'
          // Dynamic children will be managed by enhance()
        }
      }
    ]
  }
};

// ALL interactivity comes from enhance() API, never from JSON
juris.enhance('.todo-input', (context) => ({
  value: () => context.getState('todos.newTodo', ''),
  oninput: (event) => {
    context.setState('todos.newTodo', event.target.value);
  }
}));

juris.enhance('.add-todo-btn', (context) => ({
  onclick: (event) => {
    const newTodo = context.getState('todos.newTodo', '');
    const todos = context.getState('todos.items', []);
    
    if (newTodo.trim()) {
      const updated = [...todos, {
        id: Date.now(),
        text: newTodo,
        done: false
      }];
      
      context.setState('todos.items', updated);
      context.setState('todos.newTodo', '');
    }
  }
}));

juris.enhance('.todo-list', (context) => ({
  children: () => {
    const todos = context.getState('todos.items', []);
    return todos.map(todo => ({
      li: {
        key: todo.id,
        className: todo.done ? 'todo-done' : 'todo-pending',
        'data-todo-id': todo.id,
        children: [
          {
            span: {
              className: 'todo-text',
              text: todo.text
            }
          },
          {
            button: {
              className: 'todo-toggle-btn',
              'data-todo-id': todo.id,
              text: todo.done ? 'Undo' : 'Done'
              // No onclick - handled by separate enhancement
            }
          }
        ]
      }
    }));
  }
}));

// Handle todo toggle buttons using element context
juris.enhance('.todo-toggle-btn', (context) => {
  const { element } = context;
  
  return {
    onclick: (event) => {
      // Use element's dataset directly
      const todoId = parseInt(element.dataset.todoId);
      const todos = context.getState('todos.items', []);
      const updated = todos.map(t => 
        t.id === todoId ? { ...t, done: !t.done } : t
      );
      context.setState('todos.items', updated);
    }
  };
});
```

---

## HTML Enhancement API

### Basic Enhancement Pattern

Transform existing HTML into reactive Juris components using the enhance() method:

```javascript
const juris = new Juris();

// Basic enhancement
juris.enhance('.my-widget', {
  text: () => `Current time: ${new Date().toLocaleTimeString()}`,
  
  onclick: (event) => {
    alert('Widget clicked!');
  }
});

// Enhanced with state management using context.element
juris.enhance('.counter', (context) => {
  // Destructure element from context for clean access
  const { element } = context;
  
  return {
    text: () => {
      const count = context.getState('counter.value', 0);
      return `Count: ${count}`;
    },
    
    onclick: (event) => {
      const current = context.getState('counter.value', 0);
      context.setState('counter.value', current + 1);
    },
    
    style: () => ({
      backgroundColor: context.getState('counter.value', 0) > 5 ? 'green' : 'blue',
      color: 'white',
      padding: '10px',
      cursor: 'pointer'
    })
  };
});
```

### Advanced Enhancement Patterns

#### **Form Enhancement with Validation**

```javascript
// Enhance forms with validation and state management
juris.enhance('form.enhanced-form', (context) => {
  const formId = 'contactForm';
  
  // Initialize form state
  context.setState(`${formId}.data`, {});
  context.setState(`${formId}.errors`, {});
  context.setState(`${formId}.isSubmitting`, false);
  
  return {
    onsubmit: async (event) => {
      event.preventDefault();
      
      context.setState(`${formId}.isSubmitting`, true);
      
      const formData = context.getState(`${formId}.data`, {});
      const errors = validateForm(formData);
      
      context.setState(`${formId}.errors`, errors);
      
      if (Object.keys(errors).length === 0) {
        try {
          await submitForm(formData);
          alert('Form submitted successfully!');
          context.setState(`${formId}.data`, {});
        } catch (error) {
          alert('Submission failed: ' + error.message);
        }
      }
      
      context.setState(`${formId}.isSubmitting`, false);
    },
    
    className: () => {
      const isSubmitting = context.getState(`${formId}.isSubmitting`, false);
      return isSubmitting ? 'form-submitting' : '';
    }
  };
});

// Enhance form inputs using element context
juris.enhance('form.enhanced-form input[name]', (context) => {
  const { element } = context;
  
  return {
    oninput: (event) => {
      // Use element directly instead of event.target
      const fieldName = element.name;
      const value = element.value;
      const formId = 'contactForm';
      
      // Update field data
      context.setState(`${formId}.data.${fieldName}`, value);
      
      // Clear errors on input
      const errors = context.getState(`${formId}.errors`, {});
      if (errors[fieldName]) {
        delete errors[fieldName];
        context.setState(`${formId}.errors`, errors);
      }
    },
    
    style: () => {
      const fieldName = element.name;
      if (!fieldName) return {};
      
      const formId = 'contactForm';
      const errors = context.getState(`${formId}.errors`, {});
      
      if (errors[fieldName]) {
        return { borderColor: 'red' };
      }
      
      return {};
    }
  };
});
```

#### **Data Table Enhancement**

```javascript
// Enhance tables with sorting, filtering, and pagination
juris.enhance('table.data-table', (context) => {
  const tableId = 'dataTable';
  
  // Initialize table state
  context.setState(`${tableId}.sortBy`, null);
  context.setState(`${tableId}.sortDir`, 'asc');
  context.setState(`${tableId}.filter`, '');
  context.setState(`${tableId}.page`, 1);
  
  return {
    children: () => {
      const rawData = context.getState(`${tableId}.data`, []);
      const sortBy = context.getState(`${tableId}.sortBy`);
      const sortDir = context.getState(`${tableId}.sortDir`);
      const filter = context.getState(`${tableId}.filter`);
      const page = context.getState(`${tableId}.page`);
      
      // Process data: filter, sort, paginate
      let processedData = [...rawData];
      
      if (filter) {
        processedData = processedData.filter(row =>
          Object.values(row).some(val => 
            String(val).toLowerCase().includes(filter.toLowerCase())
          )
        );
      }
      
      if (sortBy) {
        processedData.sort((a, b) => {
          const aVal = a[sortBy];
          const bVal = b[sortBy];
          const mult = sortDir === 'asc' ? 1 : -1;
          
          if (aVal < bVal) return -1 * mult;
          if (aVal > bVal) return 1 * mult;
          return 0;
        });
      }
      
      return generateTableRows(processedData, tableId);
    }
  };
});

// Enhance table headers for sorting using element context
juris.enhance('table.data-table th[data-sort]', (context) => {
  const { element } = context;
  
  return {
    onclick: (event) => {
      // Use element directly to get the sort field
      const sortField = element.dataset.sort;
      const tableId = 'dataTable';
      const currentSort = context.getState(`${tableId}.sortBy`);
      const currentDir = context.getState(`${tableId}.sortDir`);
      
      if (currentSort === sortField) {
        context.setState(`${tableId}.sortDir`, currentDir === 'asc' ? 'desc' : 'asc');
      } else {
        context.setState(`${tableId}.sortBy`, sortField);
        context.setState(`${tableId}.sortDir`, 'asc');
      }
    },
    
    className: () => {
      const sortField = element.dataset.sort;
      const tableId = 'dataTable';
      const currentSort = context.getState(`${tableId}.sortBy`);
      const currentDir = context.getState(`${tableId}.sortDir`);
      
      if (currentSort === sortField) {
        return `sorted sorted-${currentDir}`;
      }
      return 'sortable';
    }
  };
});
```

---

## Progressive Enhancement

### Layer-by-Layer Enhancement

Build progressively enhanced applications that work without JavaScript:

```javascript
// Base HTML works without JavaScript
/*
<div class="counter" data-enhance="interactive-counter">
  <span class="count">0</span>
  <button class="increment">+</button>
  <button class="decrement">-</button>
</div>
*/

// Layer 1: Initialize state from HTML using element context
juris.enhance('[data-enhance="interactive-counter"]', (context) => {
  // Direct access to the specific element being enhanced
  const { element } = context;
  
  // Use element's data attributes to create unique identifier
  const counterId = element.dataset.counterId || 'default';
  
  // Read initial value from HTML using element reference
  const initialCount = parseInt(element.querySelector('.count').textContent) || 0;
  context.setState(`counters.${counterId}`, initialCount);
  
  return {};
});

// Layer 2: Update display reactively using element context
juris.enhance('[data-enhance="interactive-counter"] .count', (context) => {
  const { element } = context;
  
  return {
    text: () => {
      // Find the parent counter element through element relationships
      const counterElement = element.closest('[data-enhance="interactive-counter"]');
      const counterId = counterElement.dataset.counterId || 'default';
      return context.getState(`counters.${counterId}`, 0);
    }
  };
});

// Layer 3: Add button functionality using element context
juris.enhance('[data-enhance="interactive-counter"] .increment', (context) => {
  const { element } = context;
  
  return {
    onclick: (event) => {
      // Use element to navigate to parent and get counter ID
      const counterElement = element.closest('[data-enhance="interactive-counter"]');
      const counterId = counterElement.dataset.counterId || 'default';
      const current = context.getState(`counters.${counterId}`, 0);
      context.setState(`counters.${counterId}`, current + 1);
    }
  };
});

juris.enhance('[data-enhance="interactive-counter"] .decrement', (context) => {
  const { element } = context;
  
  return {
    onclick: (event) => {
      const counterElement = element.closest('[data-enhance="interactive-counter"]');
      const counterId = counterElement.dataset.counterId || 'default';
      const current = context.getState(`counters.${counterId}`, 0);
      context.setState(`counters.${counterId}`, current - 1);
    }
  };
});

// Layer 4: Advanced visual enhancements using element context
juris.enhance('[data-enhance="interactive-counter"]', (context) => {
  const { element } = context;
  
  return {
    style: () => {
      // Direct access to element's data attributes
      const counterId = element.dataset.counterId || 'default';
      const count = context.getState(`counters.${counterId}`, 0);
      
      return {
        backgroundColor: count > 10 ? '#4CAF50' : count < 0 ? '#f44336' : '#2196F3',
        transition: 'background-color 0.3s ease',
        padding: '20px',
        borderRadius: '8px',
        color: 'white'
      };
    }
  };
});
```

---

## Integration Examples

### WordPress Plugin Integration

```javascript
// WordPress plugin that enhances existing content
(function($) {
  'use strict';
  
  $(document).ready(function() {
    const juris = new Juris({
      states: {
        wp: {
          postId: window.wp_post_id || null,
          userId: window.wp_user_id || null,
          nonce: window.wp_nonce || null
        }
      }
    });
    
    // Enhance WordPress comments
    juris.enhance('.comment-form', (context) => ({
      onsubmit: async (event) => {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        formData.append('action', 'submit_comment');
        formData.append('nonce', context.getState('wp.nonce'));
        
        try {
          const response = await fetch(window.ajaxurl, {
            method: 'POST',
            body: formData
          });
          
          const result = await response.json();
          
          if (result.success) {
            $('.comments-list').append(result.data.html);
            event.target.reset();
          } else {
            alert('Comment submission failed: ' + result.data.message);
          }
        } catch (error) {
          alert('Network error occurred');
        }
      }
    }));
    
    // Enhance like buttons using element context
    juris.enhance('.post-like-btn', (context) => {
      // Destructure element for direct access to this specific button
      const { element } = context;
      
      return {
        onclick: async (event) => {
          // Use element directly instead of searching through event.target
          const postId = element.dataset.postId;
          const isLiked = context.getState(`posts.${postId}.liked`, false);
          
          try {
            const response = await fetch(window.ajaxurl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                action: isLiked ? 'unlike_post' : 'like_post',
                post_id: postId,
                nonce: context.getState('wp.nonce')
              })
            });
            
            const result = await response.json();
            
            if (result.success) {
              context.setState(`posts.${postId}.liked`, !isLiked);
              context.setState(`posts.${postId}.likeCount`, result.data.count);
            }
          } catch (error) {
            console.error('Like action failed:', error);
          }
        },
        
        text: () => {
          // Direct access to element's data attributes
          const postId = element.dataset.postId;
          const isLiked = context.getState(`posts.${postId}.liked`, false);
          const count = context.getState(`posts.${postId}.likeCount`, 0);
          
          return `${isLiked ? '♥' : '♡'} ${count}`;
        }
      };
    });
  });
})(jQuery);
```

### E-commerce Product Enhancement

```javascript
// Enhance Shopify-style product pages
const shopifyJuris = new Juris({
  states: {
    product: window.product || {},
    cart: window.cart || { items: [] }
  }
});

// Enhance variant selectors
shopifyJuris.enhance('.product-variants select', (context) => ({
  onchange: (event) => {
    const variantId = event.target.value;
    const product = context.getState('product');
    const selectedVariant = product.variants.find(v => v.id == variantId);
    
    if (selectedVariant) {
      context.setState('product.selectedVariant', selectedVariant);
      context.setState('product.currentPrice', selectedVariant.price);
      context.setState('product.available', selectedVariant.available);
    }
  }
}));

// Enhance add to cart button
shopifyJuris.enhance('.add-to-cart-btn', (context) => ({
  onclick: async (event) => {
    event.preventDefault();
    
    const variantId = context.getState('product.selectedVariant.id');
    const quantity = parseInt(document.querySelector('.quantity-input').value) || 1;
    
    context.setState('cart.adding', true);
    
    try {
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: variantId,
          quantity: quantity
        })
      });
      
      if (response.ok) {
        const cartResponse = await fetch('/cart.js');
        const cart = await cartResponse.json();
        context.setState('cart', cart);
        
        showNotification('Product added to cart!');
      }
    } catch (error) {
      showNotification('Error adding to cart', 'error');
    } finally {
      context.setState('cart.adding', false);
    }
  },
  
  text: () => {
    const adding = context.getState('cart.adding', false);
    const available = context.getState('product.available', true);
    
    if (adding) return 'Adding...';
    if (!available) return 'Out of Stock';
    return 'Add to Cart';
  },
  
  disabled: () => {
    const adding = context.getState('cart.adding', false);
    const available = context.getState('product.available', true);
    
    return adding || !available;
  }
}));
```

---

## Best Practices

### Performance Optimization

Use debouncing for expensive operations and batch state updates when possible:

```javascript
// Debounced search
juris.enhance('.search-input', (context) => ({
  oninput: debounce((event) => {
    const query = event.target.value;
    context.setState('search.query', query);
    
    if (query.length > 2) {
      performSearch(query);
    }
  }, 300)
}));

// Batch state updates
juris.enhance('.bulk-update-form', (context) => ({
  onsubmit: (event) => {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const updates = {};
    
    for (let [key, value] of formData.entries()) {
      updates[`form.${key}`] = value;
    }
    
    // Apply all updates at once
    Object.entries(updates).forEach(([path, value]) => {
      context.setState(path, value);
    });
  }
}));
```

### Error Handling and Memory Management

Always include proper error handling and cleanup:

```javascript
// Graceful error handling
juris.enhance('.api-widget', (context) => {
  try {
    return {
      children: () => {
        try {
          const data = context.getState('widget.data');
          return renderWidgetData(data);
        } catch (error) {
          console.error('Widget render error:', error);
          return [{ div: { text: 'Failed to render widget', className: 'error' } }];
        }
      }
    };
  } catch (error) {
    console.error('Widget enhancement error:', error);
    return {
      innerHTML: '<div class="error">Widget enhancement failed</div>'
    };
  }
});

// Cleanup subscriptions
juris.enhance('.real-time-widget', (context) => {
  let intervalId = null;
  
  return {
    onMount: () => {
      intervalId = setInterval(() => {
        updateWidgetData();
      }, 5000);
    },
    
    onUnmount: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
  };
});
```

### Accessibility Considerations

Ensure enhancements maintain accessibility standards:

```javascript
juris.enhance('.interactive-button', (context) => ({
  onclick: (event) => {
    performAction();
  },
  
  onkeydown: (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      performAction();
    }
  },
  
  'aria-pressed': () => {
    return context.getState('button.pressed', false).toString();
  },
  
  role: 'button',
  tabindex: '0'
}));
```

---

## Conclusion

The JSON Component Factory and HTML Enhancement API provide powerful patterns for progressive enhancement, framework integration, configuration-driven UIs, and legacy modernization. These patterns make Juris incredibly versatile, bridging traditional web development with modern reactive frameworks while maintaining the simplicity and debuggability of native JavaScript patterns.

The enhance() API particularly excels at adding reactive behavior to existing HTML without requiring complete rewrites, making it ideal for modernizing legacy applications or enhancing content management systems like WordPress or Shopify.
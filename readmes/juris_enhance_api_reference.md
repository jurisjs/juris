# Juris enhance() API Reference

## API Signature

```javascript
juris.enhance(selector, definition, options = {})
```

- **selector**: CSS selector string to target DOM elements
- **definition**: Object or function defining enhancements
- **options**: Configuration object for performance and behavior

## Definition Patterns

### 1. Static Object Definition
```javascript
juris.enhance('.my-button', {
  style: { backgroundColor: 'blue', padding: '10px' },
  text: 'Enhanced Button',
  className: 'enhanced-btn',
  onclick: () => alert('Clicked!')
});
```

### 2. Function Definition (Dynamic)
```javascript
juris.enhance('.counter', (context) => {
  return {
    text: () => `Count: ${context.getState('counter', 0)}`,
    onclick: () => context.setState('counter', context.getState('counter', 0) + 1),
    style: () => ({
      color: context.getState('counter', 0) > 5 ? 'red' : 'black'
    })
  };
});
```

### 3. Reactive Properties
```javascript
juris.enhance('.status', {
  text: () => juris.getState('user.status', 'offline'),
  className: () => `status-${juris.getState('user.status', 'offline')}`,
  style: () => ({
    backgroundColor: juris.getState('user.online') ? 'green' : 'gray'
  })
});
```

## Context Object Properties

When using function definition, the context provides:

### State Management
- **getState(path, defaultValue)** - Get reactive state value
- **setState(path, value, context)** - Update state value
- **subscribe(path, callback)** - Subscribe to state changes

### Services Access
- **services** - All registered services
- **...services** - Direct service properties via spread

### Headless Components
- **headless** - All headless component APIs
- **...headlessAPIs** - Direct API access via spread

### Component Management
- **components.register(name, component)** - Register UI component
- **components.registerHeadless(name, component, options)** - Register headless component
- **components.get(name)** - Get UI component
- **components.getHeadless(name)** - Get headless instance
- **components.initHeadless(name, props)** - Initialize headless component
- **components.reinitHeadless(name, props)** - Reinitialize headless component
- **components.getHeadlessAPI(name)** - Get specific headless API
- **components.getAllHeadlessAPIs()** - Get all headless APIs

### Element Reference
- **element** - Reference to the DOM element being enhanced

### Utilities
- **utils.render(container)** - Trigger full render
- **utils.cleanup()** - Clean up resources
- **utils.forceRender()** - Force re-render
- **utils.setRenderMode(mode)** - Set render mode ('fine-grained' or 'batch')
- **utils.getRenderMode()** - Get current render mode
- **utils.isFineGrained()** - Check if in fine-grained mode
- **utils.isBatchMode()** - Check if in batch mode
- **utils.getHeadlessStatus()** - Get headless component status

### Framework Access
- **juris** - Direct access to Juris instance

## Definition Object Properties

### Reactive Content
- **text**: Function or string for text content
- **innerHTML**: Function or string for HTML content
- **children**: Function or array for child elements

### Styling
- **style**: Function or object for CSS styles
- **className**: Function or string for CSS classes

### Attributes
- Any attribute name as function or static value
- Special handling for: `htmlFor`, `tabIndex`, `data-*`, `aria-*`

### Events
- **onclick**: Click handler with touch optimization
- **onmousedown/up/over/out/move**: Mouse events
- **onkeydown/up/press**: Keyboard events
- **onfocus/blur**: Focus events
- **onchange/input**: Input events
- **onsubmit**: Form submission
- **onload/resize/scroll**: Window events

## Configuration Options

```javascript
const options = {
  // Performance settings
  debounceMs: 5,              // Debounce mutations (default: 5ms)
  batchUpdates: true,         // Batch multiple updates
  maxBatchSize: 50,           // Max elements per batch
  
  // Observer settings
  observeSubtree: true,       // Watch child elements
  observeAttributes: true,    // Watch attribute changes
  observeChildList: true,     // Watch DOM changes
  observeNewElements: true,   // Auto-enhance new elements
  
  // Lifecycle hooks
  onEnhanced: (element, context) => {
    // Called after enhancement
  }
};
```

## Advanced Patterns

### 1. Conditional Enhancement
```javascript
juris.enhance('.conditional', (context) => {
  const shouldShow = context.getState('feature.enabled');
  
  return {
    style: () => ({
      display: context.getState('feature.enabled') ? 'block' : 'none'
    }),
    text: () => shouldShow ? 'Feature Active' : 'Feature Disabled'
  };
});
```

### 2. Cross-Component Communication
```javascript
juris.enhance('.communicator', (context) => {
  // Access other headless component APIs
  const notification = context.components.getHeadlessAPI('notifications');
  const user = context.components.getHeadlessAPI('user');
  
  return {
    onclick: () => {
      notification?.show(`Hello ${user?.getName()}`);
    }
  };
});
```

### 3. Element-Specific State
```javascript
juris.enhance('.toggle', (context) => {
  const elementId = context.element.id || Math.random().toString(36);
  const statePath = `toggles.${elementId}`;
  
  return {
    text: () => context.getState(statePath, false) ? 'ON' : 'OFF',
    onclick: () => {
      const current = context.getState(statePath, false);
      context.setState(statePath, !current);
    },
    className: () => context.getState(statePath, false) ? 'active' : 'inactive'
  };
});
```

### 4. Service Integration
```javascript
// Assuming services registered: { api: apiService, logger: logService }
juris.enhance('.data-loader', (context) => {
  const { api, logger } = context.services;
  
  return {
    text: () => {
      const loading = context.getState('data.loading');
      const data = context.getState('data.items', []);
      return loading ? 'Loading...' : `${data.length} items`;
    },
    
    onclick: async () => {
      context.setState('data.loading', true);
      try {
        const result = await api.fetchData();
        context.setState('data.items', result);
        logger.info('Data loaded successfully');
      } catch (error) {
        logger.error('Failed to load data', error);
      } finally {
        context.setState('data.loading', false);
      }
    }
  };
});
```

### 5. Complex Children Management
```javascript
juris.enhance('.list-container', (context) => {
  return {
    children: () => {
      const items = context.getState('list.items', []);
      
      return items.map(item => ({
        'div': {
          key: item.id,
          className: 'list-item',
          text: item.name,
          onclick: () => context.setState('list.selected', item.id),
          style: () => ({
            backgroundColor: context.getState('list.selected') === item.id 
              ? '#e3f2fd' 
              : 'transparent'
          })
        }
      }));
    }
  };
});
```

## Return Value and Lifecycle

The `enhance()` method returns an unsubscribe function:

```javascript
const unenhance = juris.enhance('.my-element', definition);

// Later, to remove enhancement:
unenhance();
```

## Performance Considerations

- Use **function definitions** sparingly for better performance
- **Batch updates** are enabled by default for multiple elements
- **Debouncing** prevents excessive re-enhancement during DOM mutations
- **Element recycling** optimizes memory usage in batch mode
- Set `observeNewElements: false` if you don't need automatic enhancement of new DOM nodes

## Error Handling

The enhancement system includes automatic error recovery:
- Function definition errors are caught and logged
- Individual property errors don't break the entire enhancement
- Circular reference detection prevents infinite loops
- Fallback to safe rendering when optimization fails
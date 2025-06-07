# Juris `enhance()` Method - Complete Pattern Guide

The `enhance()` method is one of Juris's most powerful features, allowing you to progressively enhance existing DOM elements with reactive behavior. Here's a comprehensive guide to all the patterns you can use.

## Basic Syntax

```javascript
juris.enhance(selector, definitionFunction, options)
```

## 1. Selector Patterns

### Standard CSS Selectors
```javascript
// Tag selectors
juris.enhance('button', buttonDefinition);
juris.enhance('input', inputDefinition);

// Class selectors
juris.enhance('.btn', buttonDefinition);
juris.enhance('.form-field', fieldDefinition);

// ID selectors
juris.enhance('#main-nav', navDefinition);

// Attribute selectors
juris.enhance('[data-enhance="counter"]', counterDefinition);
juris.enhance('[type="email"]', emailDefinition);

// Complex selectors
juris.enhance('.card .btn:not(.disabled)', cardButtonDefinition);
juris.enhance('form input[required]', requiredFieldDefinition);
```

### Advanced Selector Patterns
```javascript
// Pseudo-selectors
juris.enhance('li:first-child', firstItemDefinition);
juris.enhance('tr:nth-child(odd)', oddRowDefinition);

// Descendant selectors
juris.enhance('.sidebar ul li a', sidebarLinkDefinition);

// Multiple selectors (enhance separately)
juris.enhance('.btn-primary', primaryButtonDefinition);
juris.enhance('.btn-secondary', secondaryButtonDefinition);
```

## 2. Definition Function Patterns

The definition function receives `(props, context)` and returns an object defining the enhancements.

### Props Object Structure
```javascript
const definition = (props, context) => {
  // props contains:
  // - element: The DOM element being enhanced
  // - id: Element's ID
  // - className: Element's class string
  // - tagName: Lowercase tag name
  // - dataset: Copy of element.dataset
  
  console.log(props.element);   // <button id="my-btn" class="btn">
  console.log(props.id);        // "my-btn"
  console.log(props.className); // "btn"
  console.log(props.tagName);   // "button"
  console.log(props.dataset);   // { enhance: "counter" }
};
```

### Context Object Structure
```javascript
const definition = (props, context) => {
  // context contains:
  // - setState(path, value)
  // - getState(path, defaultValue)
  // - useState(path, defaultValue)
  // - navigate(path)
  // - subscribe(path, callback)
  // - services: Global services
  // - Component management APIs
  // - juris: Framework instance
};
```

## 3. Text Content Patterns

### Static Text
```javascript
juris.enhance('.greeting', (props, context) => ({
  text: 'Hello, World!'
}));
```

### Reactive Text
```javascript
juris.enhance('.username', (props, context) => ({
  text: () => `Welcome, ${context.getState('user.name', 'Guest')}!`
}));

juris.enhance('.counter-display', (props, context) => ({
  text: () => `Count: ${context.getState('counter.value', 0)}`
}));
```

### Text with Context Data
```javascript
juris.enhance('[data-template]', (props, context) => ({
  text: () => {
    const template = props.dataset.template;
    const data = context.getState('templates', {});
    return data[template] || 'Template not found';
  }
}));
```

## 4. HTML Content Patterns

### Static HTML
```javascript
juris.enhance('.rich-content', (props, context) => ({
  html: '<strong>Bold text</strong> with <em>emphasis</em>'
}));
```

### Reactive HTML (Sanitized)
```javascript
juris.enhance('.markdown-content', (props, context) => ({
  html: () => {
    const markdown = context.getState('content.markdown', '');
    return context.services.markdownToHtml(markdown);
  }
}));
```

### Dangerous HTML (Use Carefully)
```javascript
juris.enhance('.trusted-content', (props, context) => ({
  dangerousHtml: () => {
    // Only use with trusted content!
    const trustedHtml = context.getState('content.trusted', '');
    return trustedHtml;
  }
}));
```

## 5. Event Handler Patterns

### Basic Event Handlers
```javascript
juris.enhance('.btn', (props, context) => ({
  onClick: (event, context) => {
    console.log('Button clicked!', event);
    context.setState('lastClicked', Date.now());
  },
  
  onMouseover: (event, context) => {
    context.setState('hoveredButton', props.id);
  },
  
  onFocus: (event, context) => {
    context.setState('focusedElement', props.element);
  }
}));
```

### Form Event Handlers
```javascript
juris.enhance('input[type="text"]', (props, context) => ({
  onInput: (event, context) => {
    const path = `form.${props.id}`;
    context.setState(path, event.target.value);
  },
  
  onChange: (event, context) => {
    context.setState('form.lastChanged', props.id);
  },
  
  onBlur: (event, context) => {
    // Validate on blur
    const value = event.target.value;
    const isValid = value.length >= 3;
    context.setState(`validation.${props.id}`, isValid);
  }
}));
```

### Custom Event Handlers
```javascript
juris.enhance('[data-draggable]', (props, context) => ({
  onDragstart: (event, context) => {
    event.dataTransfer.setData('text/plain', props.id);
    context.setState('dragSource', props.id);
  },
  
  onDragend: (event, context) => {
    context.setState('dragSource', null);
  }
}));
```

## 6. Style Patterns

### Static Styles
```javascript
juris.enhance('.highlight', (props, context) => ({
  style: {
    backgroundColor: 'yellow',
    fontWeight: 'bold',
    padding: '4px'
  }
}));
```

### Reactive Styles
```javascript
juris.enhance('.status-indicator', (props, context) => ({
  style: {
    backgroundColor: () => {
      const status = context.getState('system.status', 'unknown');
      return {
        online: 'green',
        offline: 'red',
        pending: 'orange'
      }[status] || 'gray';
    },
    
    opacity: () => context.getState('ui.fadeLevel', 1),
    
    transform: () => {
      const scale = context.getState('ui.scale', 1);
      return `scale(${scale})`;
    }
  }
}));
```

### Conditional Styles
```javascript
juris.enhance('.conditional-style', (props, context) => ({
  style: {
    display: () => context.getState('ui.showElement', true) ? 'block' : 'none',
    color: () => context.getState('theme.isDark', false) ? 'white' : 'black'
  }
}));
```

## 7. Attribute Patterns

### Static Attributes
```javascript
juris.enhance('img[data-lazy]', (props, context) => ({
  'data-loaded': 'true',
  alt: 'Lazy loaded image',
  loading: 'lazy'
}));
```

### Reactive Attributes
```javascript
juris.enhance('.progress-bar', (props, context) => ({
  'aria-valuenow': () => context.getState('progress.current', 0),
  'aria-valuemax': () => context.getState('progress.max', 100),
  
  title: () => {
    const current = context.getState('progress.current', 0);
    const max = context.getState('progress.max', 100);
    return `Progress: ${current}/${max}`;
  }
}));
```

### Boolean Attributes
```javascript
juris.enhance('button[data-toggle]', (props, context) => ({
  disabled: () => context.getState('ui.isLoading', false),
  hidden: () => !context.getState('user.isLoggedIn', false),
  'aria-expanded': () => context.getState('ui.menuOpen', false)
}));
```

## 8. Children Patterns

### Static Children
```javascript
juris.enhance('.container', (props, context) => ({
  children: [
    { div: { className: 'header', text: 'Header' } },
    { div: { className: 'content', text: 'Content' } },
    { div: { className: 'footer', text: 'Footer' } }
  ]
}));
```

### Reactive Children
```javascript
juris.enhance('.dynamic-list', (props, context) => ({
  children: () => {
    const items = context.getState('list.items', []);
    return items.map(item => ({
      li: {
        key: item.id,
        text: item.name,
        className: item.active ? 'active' : ''
      }
    }));
  }
}));
```

### Conditional Children
```javascript
juris.enhance('.conditional-container', (props, context) => ({
  children: () => {
    const showContent = context.getState('ui.showContent', false);
    const isLoading = context.getState('ui.isLoading', false);
    
    if (isLoading) {
      return [{ div: { className: 'loading', text: 'Loading...' } }];
    }
    
    if (showContent) {
      return [
        { h2: { text: 'Content Title' } },
        { p: { text: 'Content body...' } }
      ];
    }
    
    return [{ p: { text: 'No content to display' } }];
  }
}));
```

## 9. Component Composition Patterns

### Rendering Registered Components
```javascript
juris.enhance('[data-widget]', (props, context) => {
  const widgetType = props.dataset.widget;
  
  return {
    children: () => {
      // Render a registered component
      return [{ [widgetType]: { 
        title: props.dataset.title,
        config: JSON.parse(props.dataset.config || '{}')
      }}];
    }
  };
});
```

### Dynamic Component Loading
```javascript
juris.enhance('[data-component]', (props, context) => {
  const componentName = props.dataset.component;
  const componentProps = JSON.parse(props.dataset.props || '{}');
  
  return {
    children: () => {
      // Check if component exists
      const components = context.getComponents();
      const componentExists = components.some(c => c.name === componentName);
      
      if (!componentExists) {
        return [{ div: { 
          className: 'component-error',
          text: `Component "${componentName}" not found`
        }}];
      }
      
      return [{ [componentName]: componentProps }];
    }
  };
});
```

### Conditional Component Rendering
```javascript
juris.enhance('[data-conditional-component]', (props, context) => {
  const condition = props.dataset.condition;
  const componentName = props.dataset.component;
  const fallbackComponent = props.dataset.fallback;
  
  return {
    children: () => {
      const shouldRender = context.getState(condition, false);
      
      if (shouldRender) {
        return [{ [componentName]: {} }];
      } else if (fallbackComponent) {
        return [{ [fallbackComponent]: {} }];
      } else {
        return [{ div: { text: 'Component hidden' } }];
      }
    }
  };
});
```

### Component List Rendering
```javascript
juris.enhance('[data-component-list]', (props, context) => {
  const listPath = props.dataset.listPath;
  const componentType = props.dataset.componentType;
  
  return {
    children: () => {
      const items = context.getState(listPath, []);
      
      return items.map((item, index) => ({
        [componentType]: {
          key: item.id || index,
          data: item,
          index: index
        }
      }));
    }
  };
});
```

### Nested Component Composition
```javascript
juris.enhance('[data-layout]', (props, context) => {
  const layoutType = props.dataset.layout;
  
  return {
    children: () => {
      switch (layoutType) {
        case 'sidebar':
          return [
            { Sidebar: { position: 'left' } },
            { MainContent: { flex: 1 } }
          ];
          
        case 'header-footer':
          return [
            { Header: { title: context.getState('page.title', 'App') } },
            { MainContent: { className: 'main-content' } },
            { Footer: { year: new Date().getFullYear() } }
          ];
          
        case 'dashboard':
          return [
            { DashboardHeader: {} },
            { 
              div: {
                className: 'dashboard-grid',
                children: [
                  { MetricsWidget: { type: 'sales' } },
                  { ChartWidget: { type: 'line', data: 'analytics.chart' } },
                  { RecentActivity: { limit: 10 } }
                ]
              }
            }
          ];
          
        default:
          return [{ div: { text: 'Unknown layout type' } }];
      }
    }
  };
});
```

### Component Communication Patterns
```javascript
juris.enhance('[data-parent-component]', (props, context) => {
  const parentId = props.id;
  
  return {
    children: () => {
      const childData = context.getState(`components.${parentId}.children`, []);
      
      return childData.map(child => ({
        [child.component]: {
          ...child.props,
          parentId: parentId,
          onChildEvent: (data) => {
            // Handle child component events
            context.setState(`components.${parentId}.lastChildEvent`, {
              childId: child.id,
              data: data,
              timestamp: Date.now()
            });
          }
        }
      }));
    },
    
    // Listen for child component updates
    onMount: (element, props, context) => {
      return context.subscribe(`components.${parentId}.children`, (newChildren) => {
        console.log('Child components updated:', newChildren);
      });
    }
  };
});
```

### Component Factory Pattern
```javascript
juris.enhance('[data-factory]', (props, context) => {
  const factoryType = props.dataset.factory;
  const factoryConfig = JSON.parse(props.dataset.config || '{}');
  
  const componentFactories = {
    form: (config) => {
      return config.fields.map(field => ({
        FormField: {
          type: field.type,
          name: field.name,
          label: field.label,
          required: field.required,
          validation: field.validation
        }
      }));
    },
    
    menu: (config) => {
      return config.items.map(item => ({
        MenuItem: {
          label: item.label,
          icon: item.icon,
          href: item.href,
          children: item.children ? 
            item.children.map(child => ({ MenuItem: child })) : 
            undefined
        }
      }));
    },
    
    grid: (config) => {
      const { columns, rows } = config;
      return Array.from({ length: rows }, (_, rowIndex) => ({
        GridRow: {
          children: Array.from({ length: columns }, (_, colIndex) => ({
            GridCell: {
              row: rowIndex,
              col: colIndex,
              content: config.data?.[rowIndex]?.[colIndex] || ''
            }
          }))
        }
      }));
    }
  };
  
  return {
    children: () => {
      const factory = componentFactories[factoryType];
      if (!factory) {
        return [{ div: { text: `Unknown factory type: ${factoryType}` } }];
      }
      
      return factory(factoryConfig);
    }
  };
});
```

### Higher-Order Component Pattern
```javascript
juris.enhance('[data-hoc]', (props, context) => {
  const wrappedComponent = props.dataset.component;
  const hocType = props.dataset.hoc;
  const componentProps = JSON.parse(props.dataset.props || '{}');
  
  const higherOrderComponents = {
    withLoading: (component, props) => {
      const isLoading = context.getState(`loading.${props.loadingKey || 'default'}`, false);
      
      if (isLoading) {
        return [{ LoadingSpinner: {} }];
      }
      
      return [{ [component]: props }];
    },
    
    withAuth: (component, props) => {
      const isAuthenticated = context.getState('auth.isAuthenticated', false);
      
      if (!isAuthenticated) {
        return [{ LoginPrompt: {} }];
      }
      
      return [{ [component]: props }];
    },
    
    withErrorBoundary: (component, props) => {
      const error = context.getState(`errors.${props.errorKey || 'default'}`, null);
      
      if (error) {
        return [{ ErrorDisplay: { error } }];
      }
      
      return [{ [component]: props }];
    }
  };
  
  return {
    children: () => {
      const hoc = higherOrderComponents[hocType];
      if (!hoc) {
        return [{ div: { text: `Unknown HOC type: ${hocType}` } }];
      }
      
      return hoc(wrappedComponent, componentProps);
    }
  };
});
```

### Component Slot Pattern
```javascript
juris.enhance('[data-slot-container]', (props, context) => {
  const slotConfig = JSON.parse(props.dataset.slots || '{}');
  
  return {
    children: () => {
      const slots = context.getState('ui.slots', {});
      
      return Object.entries(slotConfig).map(([slotName, defaultComponent]) => {
        const slotContent = slots[slotName];
        
        if (slotContent) {
          // Render dynamic slot content
          return {
            div: {
              className: `slot slot-${slotName}`,
              children: Array.isArray(slotContent) ? slotContent : [slotContent]
            }
          };
        } else if (defaultComponent) {
          // Render default component
          return {
            div: {
              className: `slot slot-${slotName}`,
              children: [{ [defaultComponent]: {} }]
            }
          };
        } else {
          // Empty slot
          return {
            div: {
              className: `slot slot-${slotName} slot-empty`,
              'data-slot': slotName
            }
          };
        }
      });
    }
  };
});
```

### Portal/Teleport Pattern
```javascript
juris.enhance('[data-portal]', (props, context) => {
  const targetSelector = props.dataset.target;
  const componentName = props.dataset.component;
  const componentProps = JSON.parse(props.dataset.props || '{}');
  
  return {
    onMount: (element, props, context) => {
      const targetElement = document.querySelector(targetSelector);
      
      if (targetElement) {
        // Create the component in the target location
        const portalElement = context.juris.renderUIObject({
          [componentName]: {
            ...componentProps,
            'data-portal-source': element.id
          }
        });
        
        if (portalElement) {
          targetElement.appendChild(portalElement);
          
          // Store reference for cleanup
          element._portalElement = portalElement;
          element._portalTarget = targetElement;
        }
      }
      
      // Return cleanup function
      return () => {
        if (element._portalElement && element._portalTarget) {
          element._portalTarget.removeChild(element._portalElement);
        }
      };
    },
    
    // Hide the original element since content is rendered elsewhere
    style: {
      display: 'none'
    }
  };
});
```

## 10. Services Access Patterns

### Basic Service Access
```javascript
juris.enhance('[data-api-loader]', (props, context) => {
  const endpoint = props.dataset.endpoint;
  
  return {
    onMount: async (element, props, context) => {
      // Access HTTP service
      const httpService = context.services.http;
      
      try {
        const data = await httpService.get(endpoint);
        context.setState(`api.${endpoint}`, data);
      } catch (error) {
        context.setState(`api.errors.${endpoint}`, error.message);
      }
    },
    
    text: () => {
      const data = context.getState(`api.${endpoint}`);
      const error = context.getState(`api.errors.${endpoint}`);
      
      if (error) return `Error: ${error}`;
      if (!data) return 'Loading...';
      return `Loaded ${Object.keys(data).length} items`;
    }
  };
});
```

### Multiple Service Integration
```javascript
juris.enhance('[data-dashboard]', (props, context) => {
  return {
    onMount: async (element, props, context) => {
      const { 
        auth, 
        analytics, 
        notifications, 
        cache,
        logger 
      } = context.services;
      
      // Check authentication
      const user = auth.getCurrentUser();
      if (!user) {
        context.navigate('/login');
        return;
      }
      
      // Load dashboard data
      logger.info('Loading dashboard for user:', user.id);
      
      try {
        // Check cache first
        let dashboardData = cache.get(`dashboard_${user.id}`);
        
        if (!dashboardData) {
          // Fetch from analytics service
          dashboardData = await analytics.getDashboardData(user.id);
          cache.set(`dashboard_${user.id}`, dashboardData, 300); // 5 min cache
        }
        
        context.setState('dashboard.data', dashboardData);
        context.setState('dashboard.lastUpdated', Date.now());
        
        // Setup real-time notifications
        notifications.subscribe('dashboard_updates', (update) => {
          context.setState('dashboard.liveUpdates', update);
        });
        
      } catch (error) {
        logger.error('Dashboard load failed:', error);
        context.setState('dashboard.error', error.message);
      }
    },
    
    children: () => {
      const data = context.getState('dashboard.data');
      const error = context.getState('dashboard.error');
      
      if (error) {
        return [{ ErrorComponent: { message: error } }];
      }
      
      if (!data) {
        return [{ LoadingComponent: {} }];
      }
      
      return [
        { DashboardHeader: { user: data.user } },
        { MetricsGrid: { metrics: data.metrics } },
        { RecentActivity: { activities: data.activities } }
      ];
    }
  };
});
```

### Service-Driven Form Handling
```javascript
juris.enhance('form[data-api-form]', (props, context) => {
  const apiEndpoint = props.dataset.apiEndpoint;
  const validationRules = props.dataset.validation;
  
  return {
    onSubmit: async (event, context) => {
      event.preventDefault();
      
      const { 
        validation, 
        http, 
        notifications,
        logger 
      } = context.services;
      
      const formData = new FormData(event.target);
      const data = Object.fromEntries(formData.entries());
      
      // Validate using service
      const validationResult = validation.validate(data, validationRules);
      if (!validationResult.isValid) {
        context.setState('form.errors', validationResult.errors);
        return;
      }
      
      // Submit using HTTP service
      context.setState('form.isSubmitting', true);
      
      try {
        const response = await http.post(apiEndpoint, data);
        
        logger.info('Form submitted successfully:', response);
        notifications.success('Form submitted successfully!');
        
        context.setState('form.success', true);
        context.setState('form.errors', {});
        
      } catch (error) {
        logger.error('Form submission failed:', error);
        notifications.error(`Submission failed: ${error.message}`);
        
        context.setState('form.errors', { 
          _general: error.message 
        });
      } finally {
        context.setState('form.isSubmitting', false);
      }
    },
    
    style: {
      opacity: () => context.getState('form.isSubmitting', false) ? 0.6 : 1
    }
  };
});
```

### Real-time Service Integration
```javascript
juris.enhance('[data-live-data]', (props, context) => {
  const channel = props.dataset.channel;
  const updateInterval = parseInt(props.dataset.interval) || 30000;
  
  return {
    onMount: (element, props, context) => {
      const { 
        websocket, 
        polling, 
        cache,
        logger 
      } = context.services;
      
      let cleanup = [];
      
      // Setup WebSocket connection if available
      if (websocket.isAvailable()) {
        const unsubscribe = websocket.subscribe(channel, (data) => {
          logger.debug('Live data received:', data);
          context.setState(`live.${channel}`, data);
          context.setState(`live.${channel}.lastUpdate`, Date.now());
        });
        cleanup.push(unsubscribe);
      } else {
        // Fallback to polling
        const pollInterval = polling.start(channel, updateInterval, async () => {
          try {
            const data = await context.services.http.get(`/api/live/${channel}`);
            context.setState(`live.${channel}`, data);
            context.setState(`live.${channel}.lastUpdate`, Date.now());
          } catch (error) {
            logger.error('Polling failed:', error);
          }
        });
        cleanup.push(() => polling.stop(pollInterval));
      }
      
      // Return cleanup function
      return () => {
        cleanup.forEach(fn => fn());
      };
    },
    
    text: () => {
      const data = context.getState(`live.${channel}`);
      const lastUpdate = context.getState(`live.${channel}.lastUpdate`);
      
      if (!data) return 'Connecting...';
      
      const timeSince = Date.now() - lastUpdate;
      const seconds = Math.floor(timeSince / 1000);
      
      return `${data.value} (updated ${seconds}s ago)`;
    }
  };
});
```

## 11. Headless Component Patterns

### Accessing Headless Components
```javascript
juris.enhance('[data-headless-consumer]', (props, context) => {
  const headlessComponentName = props.dataset.headless;
  
  return {
    onMount: (element, props, context) => {
      // Access headless component
      const headlessComponent = context[headlessComponentName];
      
      if (headlessComponent && headlessComponent.initialize) {
        headlessComponent.initialize(element, props);
      }
    },
    
    children: () => {
      // Use headless component data
      const headlessComponent = context[headlessComponentName];
      
      if (!headlessComponent) {
        return [{ div: { text: `Headless component "${headlessComponentName}" not found` } }];
      }
      
      // Access headless component methods and state
      const data = headlessComponent.getData ? headlessComponent.getData() : {};
      
      return [
        { h3: { text: `Data from ${headlessComponentName}` } },
        { pre: { text: JSON.stringify(data, null, 2) } }
      ];
    }
  };
});
```

### Headless Component Communication
```javascript
juris.enhance('[data-headless-manager]', (props, context) => {
  return {
    onMount: (element, props, context) => {
      // Get all headless components
      const headlessComponents = context.juris.getHeadlessComponents();
      
      console.log('Available headless components:', headlessComponents);
      
      // Setup communication between headless components
      headlessComponents.forEach(component => {
        if (context[component.name] && context[component.name].onMessage) {
          context[component.name].onMessage((message) => {
            // Broadcast to other headless components
            headlessComponents.forEach(otherComponent => {
              if (otherComponent.name !== component.name && 
                  context[otherComponent.name] && 
                  context[otherComponent.name].receiveMessage) {
                context[otherComponent.name].receiveMessage(message);
              }
            });
          });
        }
      });
    },
    
    children: () => {
      const headlessComponents = context.juris.getHeadlessComponents();
      
      return [
        { h3: { text: 'Headless Component Manager' } },
        { 
          ul: {
            children: headlessComponents.map(component => ({
              li: {
                text: `${component.name} - ${component.registered ? 'Active' : 'Inactive'}`,
                style: {
                  color: component.registered ? 'green' : 'red'
                }
              }
            }))
          }
        }
      ];
    }
  };
});
```

### Headless State Management
```javascript
juris.enhance('[data-headless-state]', (props, context) => {
  const stateManager = props.dataset.stateManager;
  
  return {
    onMount: (element, props, context) => {
      // Access headless state manager
      const headlessStateManager = context[stateManager];
      
      if (headlessStateManager) {
        // Subscribe to state changes
        const unsubscribe = headlessStateManager.subscribe((state) => {
          context.setState('headless.state', state);
        });
        
        // Initialize with current state
        if (headlessStateManager.getState) {
          context.setState('headless.state', headlessStateManager.getState());
        }
        
        return unsubscribe;
      }
    },
    
    children: () => {
      const headlessState = context.getState('headless.state', {});
      const headlessStateManager = context[stateManager];
      
      return [
        { h3: { text: 'Headless State Manager' } },
        { 
          div: {
            children: Object.entries(headlessState).map(([key, value]) => ({
              div: {
                children: [
                  { strong: { text: `${key}: ` } },
                  { span: { text: JSON.stringify(value) } },
                  {
                    button: {
                      text: 'Update',
                      onClick: () => {
                        if (headlessStateManager && headlessStateManager.updateState) {
                          headlessStateManager.updateState(key, Date.now());
                        }
                      }
                    }
                  }
                ]
              }
            }))
          }
        }
      ];
    }
  };
});
```

### Headless Component Lifecycle
```javascript
juris.enhance('[data-headless-lifecycle]', (props, context) => {
  const targetHeadless = props.dataset.target;
  
  return {
    onMount: (element, props, context) => {
      const headlessComponent = context[targetHeadless];
      
      if (headlessComponent) {
        // Trigger headless component lifecycle events
        if (headlessComponent.onEnhancementMount) {
          headlessComponent.onEnhancementMount(element, props);
        }
        
        return () => {
          // Cleanup on unmount
          if (headlessComponent.onEnhancementUnmount) {
            headlessComponent.onEnhancementUnmount(element, props);
          }
        };
      }
    },
    
    children: () => {
      const headlessComponent = context[targetHeadless];
      
      if (!headlessComponent) {
        return [{ div: { text: `Headless component "${targetHeadless}" not available` } }];
      }
      
      // Render based on headless component state
      const componentState = headlessComponent.getLifecycleState ? 
        headlessComponent.getLifecycleState() : 
        { status: 'unknown' };
      
      return [
        { h4: { text: `${targetHeadless} Lifecycle` } },
        { p: { text: `Status: ${componentState.status}` } },
        { p: { text: `Active since: ${componentState.activeSince || 'N/A'}` } }
      ];
    }
  };
});
```

### Headless Component Method Invocation
```javascript
juris.enhance('[data-headless-controls]', (props, context) => {
  const headlessTarget = props.dataset.target;
  const availableMethods = (props.dataset.methods || '').split(',');
  
  return {
    children: () => {
      const headlessComponent = context[headlessTarget];
      
      if (!headlessComponent) {
        return [{ div: { text: `Headless component "${headlessTarget}" not found` } }];
      }
      
      return [
        { h4: { text: `${headlessTarget} Controls` } },
        {
          div: {
            className: 'headless-controls',
            children: availableMethods.map(methodName => {
              const method = headlessComponent[methodName.trim()];
              
              if (typeof method !== 'function') {
                return {
                  div: {
                    text: `Method "${methodName}" not available`,
                    style: { color: 'red' }
                  }
                };
              }
              
              return {
                button: {
                  text: methodName,
                  onClick: async () => {
                    try {
                      const result = await method();
                      context.setState(`headless.${headlessTarget}.lastResult`, {
                        method: methodName,
                        result: result,
                        timestamp: Date.now()
                      });
                    } catch (error) {
                      context.setState(`headless.${headlessTarget}.lastError`, {
                        method: methodName,
                        error: error.message,
                        timestamp: Date.now()
                      });
                    }
                  }
                }
              };
            })
          }
        },
        {
          div: {
            className: 'headless-results',
            children: () => {
              const lastResult = context.getState(`headless.${headlessTarget}.lastResult`);
              const lastError = context.getState(`headless.${headlessTarget}.lastError`);
              
              const results = [];
              
              if (lastResult) {
                results.push({
                  div: {
                    className: 'result success',
                    children: [
                      { strong: { text: `${lastResult.method}: ` } },
                      { span: { text: JSON.stringify(lastResult.result) } }
                    ]
                  }
                });
              }
              
              if (lastError) {
                results.push({
                  div: {
                    className: 'result error',
                    children: [
                      { strong: { text: `${lastError.method} Error: ` } },
                      { span: { text: lastError.error } }
                    ]
                  }
                });
              }
              
              return results;
            }
          }
        }
      ];
    }
  };
});
```

## 10. Mixed Patterns (Complex Examples)

### Interactive Counter
```javascript
juris.enhance('[data-counter]', (props, context) => {
  const countPath = `counters.${props.id}`;
  
  return {
    text: () => `Count: ${context.getState(countPath, 0)}`,
    
    style: {
      backgroundColor: () => {
        const count = context.getState(countPath, 0);
        return count > 10 ? 'red' : count > 5 ? 'orange' : 'green';
      },
      padding: '8px',
      borderRadius: '4px',
      cursor: 'pointer'
    },
    
    onClick: (event, context) => {
      const current = context.getState(countPath, 0);
      context.setState(countPath, current + 1);
    },
    
    onDoubleClick: (event, context) => {
      context.setState(countPath, 0);
    },
    
    title: () => {
      const count = context.getState(countPath, 0);
      return `Current count: ${count}. Click to increment, double-click to reset.`;
    }
  };
});
```

### Form Field with Validation
```javascript
juris.enhance('input[data-validate]', (props, context) => {
  const fieldPath = `form.fields.${props.id}`;
  const errorPath = `form.errors.${props.id}`;
  const validationRule = props.dataset.validate;
  
  return {
    onInput: (event, context) => {
      const value = event.target.value;
      context.setState(fieldPath, value);
      
      // Clear error on input
      context.setState(errorPath, null);
    },
    
    onBlur: (event, context) => {
      const value = event.target.value;
      let error = null;
      
      switch (validationRule) {
        case 'required':
          if (!value.trim()) error = 'This field is required';
          break;
        case 'email':
          if (!/\S+@\S+\.\S+/.test(value)) error = 'Invalid email format';
          break;
        case 'minlength':
          const minLength = parseInt(props.dataset.minlength) || 3;
          if (value.length < minLength) error = `Minimum ${minLength} characters`;
          break;
      }
      
      context.setState(errorPath, error);
    },
    
    style: {
      borderColor: () => {
        const error = context.getState(errorPath);
        return error ? 'red' : '#ccc';
      }
    },
    
    'aria-invalid': () => !!context.getState(errorPath),
    
    title: () => context.getState(errorPath) || ''
  };
});
```

### Tab System
```javascript
juris.enhance('[data-tab-container]', (props, context) => {
  const containerId = props.id || 'default';
  const activeTabPath = `tabs.${containerId}.active`;
  
  return {
    children: () => {
      const tabs = context.getState(`tabs.${containerId}.list`, []);
      const activeTab = context.getState(activeTabPath, tabs[0]?.id);
      
      return [
        // Tab headers
        {
          div: {
            className: 'tab-headers',
            children: tabs.map(tab => ({
              button: {
                className: `tab-header ${tab.id === activeTab ? 'active' : ''}`,
                text: tab.title,
                onClick: () => context.setState(activeTabPath, tab.id)
              }
            }))
          }
        },
        // Tab content
        {
          div: {
            className: 'tab-content',
            children: tabs
              .filter(tab => tab.id === activeTab)
              .map(tab => ({
                div: {
                  className: 'tab-panel',
                  html: tab.content
                }
              }))
          }
        }
      ];
    }
  };
});
```

## 10. Configuration Options

### Basic Options
```javascript
// Disable automatic observation
juris.enhance('.static-enhancement', definition, {
  useObserver: false
});

// Scope to specific container
juris.enhance('.scoped-element', definition, {
  scope: '#main-container'
});

// Add debouncing
juris.enhance('.high-frequency-updates', definition, {
  debounce: 100 // milliseconds
});
```

### Advanced Options
```javascript
juris.enhance('.advanced-enhancement', definition, {
  useObserver: true,        // Watch for new elements (default: true)
  debounce: 50,            // Debounce observer updates (default: null)
  throttle: 100,           // Throttle updates (default: null)
  scope: '.container',     // Limit scope (default: document)
});
```

## 11. Cleanup and Lifecycle

### Cleanup Function
```javascript
// enhance() returns a cleanup function
const cleanupCounter = juris.enhance('[data-counter]', counterDefinition);

// Later, stop observing and cleanup
cleanupCounter();
```

### Using with useState Hook
```javascript
juris.enhance('[data-stateful]', (props, context) => {
  // Use the useState hook for simpler state management
  const [count, setCount] = context.useState(`counters.${props.id}`, 0);
  
  return {
    text: () => `Count: ${count()}`,
    onClick: () => setCount(current => current + 1)
  };
});
```

## 12. Best Practices

### Performance Optimization
```javascript
// Use specific selectors to avoid over-enhancement
juris.enhance('[data-enhance="specific"]', definition); // ✅ Good
juris.enhance('div', definition); // ❌ Too broad

// Debounce high-frequency updates
juris.enhance('.frequent-updates', definition, { debounce: 100 });

// Scope enhancements when possible
juris.enhance('.component', definition, { scope: '#app' });
```

### Error Handling
```javascript
juris.enhance('.safe-enhancement', (props, context) => ({
  onClick: (event, context) => {
    try {
      // Potentially failing operation
      const data = JSON.parse(props.dataset.config);
      context.setState('config', data);
    } catch (error) {
      console.error('Enhancement error:', error);
      context.setState('error', error.message);
    }
  }
}));
```

### Memory Management
```javascript
// Store cleanup functions for manual cleanup
const cleanupFunctions = [];

cleanupFunctions.push(juris.enhance('.temp-element', definition));

// Later, cleanup all enhancements
cleanupFunctions.forEach(cleanup => cleanup());
```

This comprehensive guide covers all the patterns available with Juris's `enhance()` method. The system is designed to be flexible and powerful while maintaining simplicity and performance.
# UrlStateSync Headless Component

A comprehensive URL/routing headless component for Juris that provides state-synchronized navigation with support for hash, history, and memory modes.

## Registration

```javascript
juris.registerHeadlessComponent('router', UrlStateSync, {
  config: {
    mode: 'hash',
    statePath: 'url',
    routes: {
      '/': { name: 'home' },
      '/users/:id': { name: 'user', guards: [authGuard] },
      '/admin': { name: 'admin', guards: [adminGuard] }
    }
  }
});
```

## Configuration Options

### Core Settings
```javascript
{
  // State management
  statePath: 'url',                    // Base state path
  stateStructure: {
    path: 'path',                      // Current path key
    segments: 'segments',              // Parsed segments key
    params: 'params',                  // URL parameters key
    query: 'query',                    // Query string key
    hash: 'hash'                       // Hash fragment key
  },

  // URL handling
  mode: 'hash',                        // 'hash' | 'history' | 'memory'
  basePath: '',                        // Base path (history mode)
  caseSensitive: false,                // Case sensitive matching
  trailingSlash: 'ignore',             // 'strict' | 'ignore' | 'redirect'

  // Routes and guards
  routes: {},                          // Route definitions
  defaultRoute: '/',                   // Default route
  notFoundRoute: '/404',               // 404 route
  globalGuards: {
    beforeEnter: [],                   // Global entry guards
    afterEnter: [],                    // Global after guards
    beforeLeave: []                    // Global leave guards
  }
}
```

### Advanced Options
```javascript
{
  // Parsing
  parseQuery: true,                    // Parse query to object
  parseParams: true,                   // Parse route parameters
  encodeParams: true,                  // URL encode parameters
  
  // Segments
  segmentParsing: {
    enabled: true,
    maxDepth: 10,
    customKeys: ['base', 'sub', 'section', 'item'],
    includeEmpty: false
  },

  // Behavior
  debounceMs: 0,                       // Debounce changes
  syncOnStateChange: false,            // Sync URL on state change
  preventDuplicates: true,             // Prevent duplicate navigation
  preserveScrollPosition: false,       // Save/restore scroll

  // Events
  events: {
    beforeChange: (newUrl, oldUrl) => true,  // Before navigation
    afterChange: (newUrl, oldUrl) => {},     // After navigation
    onError: (context, error) => {},         // Error handler
    onGuardFail: (newUrl, oldUrl) => {}      // Guard failure
  },

  // Debug
  debug: false,
  logPrefix: '🧭'
}
```

## API Methods

### Navigation
```javascript
const router = juris.getHeadlessComponent('router').api;

// Navigate to path
router.navigate('/users/123');
router.navigate('/admin', { replace: true });

// History navigation
router.back();
router.forward();
router.go(-2);

// Replace current entry
router.replace('/new-path');
```

### State Access
```javascript
// Get current state
const currentPath = router.getCurrentPath();    // '/users/123'
const segments = router.getSegments();          // { base: 'users', sub: '123' }
const params = router.getParams();              // { id: '123' }
const query = router.getQuery();                // { tab: 'profile' }
```

### Route Management
```javascript
// Add routes
router.addRoute('/products/:id', {
  name: 'product',
  guards: [authGuard],
  meta: { requiresAuth: true }
});

// Route utilities
router.hasRoute('/products/123');              // true
router.removeRoute('/old-route');
const match = router.matchRoute('/users/456'); // Route match object
```

### Guards
```javascript
// Add global guards
router.addGuard('beforeEnter', async (newUrl, oldUrl, match) => {
  if (match?.route?.meta?.requiresAuth) {
    const isAuth = context.getState('user.authenticated');
    return isAuth || '/login';
  }
  return true;
});

// Remove guards
router.removeGuard('beforeEnter', guardFunction);
```

### Utilities
```javascript
// Build URLs
const url = router.buildUrl('/users/:id', { id: 123 }, { tab: 'profile' });
// Result: '/users/123?tab=profile'

// Parse URLs
const parsed = router.parseUrl('/users/123?tab=profile#section');

// Check active state
router.isActive('/users');          // true (partial match)
router.isActive('/users', true);    // false (exact match)
```

## URL Modes

### Hash Mode (Default)
```javascript
// URLs: example.com/#/users/123
{ mode: 'hash' }
```

### History Mode
```javascript
// URLs: example.com/users/123
{
  mode: 'history',
  basePath: '/app'  // Optional base path
}
```

### Memory Mode
```javascript
// In-memory routing (no URL changes)
{ mode: 'memory' }
```

## Route Definition

### Basic Routes
```javascript
routes: {
  '/': { name: 'home' },
  '/about': { name: 'about' },
  '/users': { name: 'users' }
}
```

### Parameterized Routes
```javascript
routes: {
  '/users/:id': {
    name: 'user',
    guards: [authGuard],
    meta: { requiresAuth: true }
  },
  '/products/:category/:id': {
    name: 'product',
    guards: [loadProductGuard]
  }
}
```

### Route Guards
```javascript
const authGuard = async (newUrl, oldUrl, match) => {
  const isAuthenticated = context.getState('user.authenticated');
  return isAuthenticated || '/login';
};

const adminGuard = (newUrl, oldUrl, match) => {
  const user = context.getState('user.data');
  return user?.role === 'admin';
};
```

## State Structure

The component automatically maintains URL state:

```javascript
// State at 'url' path (configurable)
{
  url: {
    path: '/users/123',
    segments: {
      full: '/users/123',
      parts: ['users', '123'],
      base: 'users',
      sub: '123',
      section: '',
      item: ''
    },
    params: { id: '123' },
    query: { tab: 'profile', sort: 'name' },
    hash: 'personal-info'
  }
}
```

## Integration Patterns

### With UI Components
```javascript
juris.enhance('.nav-link', (context) => {
  const router = context.components.getHeadlessAPI('router');
  
  return {
    className: () => {
      const href = context.element.getAttribute('href');
      return router.isActive(href) ? 'active' : '';
    },
    onclick: (e) => {
      e.preventDefault();
      const href = context.element.getAttribute('href');
      router.navigate(href);
    }
  };
});
```

### Route-Based Rendering
```javascript
juris.registerComponent('Router', (props, context) => {
  const currentPath = context.getState('url.path');
  const routes = {
    '/': () => ({ 'HomePage': {} }),
    '/users': () => ({ 'UsersPage': {} }),
    '/users/:id': () => ({ 'UserDetail': { id: context.getState('url.params.id') } })
  };

  return {
    render: () => {
      const router = context.components.getHeadlessAPI('router');
      const match = router.matchRoute(currentPath);
      
      if (match && routes[match.path]) {
        return routes[match.path]();
      }
      
      return { 'NotFound': {} };
    }
  };
});
```

### Guard Implementation
```javascript
// Authentication guard
const requireAuth = async (newUrl, oldUrl, match) => {
  const token = localStorage.getItem('authToken');
  if (!token) return '/login';
  
  try {
    const valid = await validateToken(token);
    return valid || '/login';
  } catch {
    return '/login';
  }
};

// Role-based guard
const requireRole = (role) => (newUrl, oldUrl, match) => {
  const userRole = context.getState('user.role');
  return userRole === role || '/unauthorized';
};
```

## Events and Lifecycle

### Event Callbacks
```javascript
{
  events: {
    beforeChange: (newUrl, oldUrl) => {
      console.log(`Navigating from ${oldUrl} to ${newUrl}`);
      return true; // Allow navigation
    },
    
    afterChange: (newUrl, oldUrl) => {
      // Track page view
      analytics.track('page_view', { url: newUrl });
    },
    
    onError: (context, error) => {
      console.error('Router error:', context, error);
    },
    
    onGuardFail: (newUrl, oldUrl) => {
      console.log('Navigation blocked by guard');
    }
  }
}
```

### State Synchronization
```javascript
// Enable two-way state sync
{
  syncOnStateChange: true
}

// Manual state updates will trigger URL changes
context.setState('url.path', '/new-route');
```

## Debug and Monitoring

### Debug Mode
```javascript
{
  debug: true,
  logPrefix: '🧭 Router:'
}
```

### Status Information
```javascript
const router = context.components.getHeadlessAPI('router');

// Get current state
const state = router.getState();

// Get configuration
const config = router.getConfig();

// Memory mode history
const history = router.getHistory(); // Only in memory mode
```
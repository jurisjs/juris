# Juris Router Documentation

> **Complete routing solution for Juris Framework - Build dynamic single-page applications with powerful routing capabilities**

[![Version](https://img.shields.io/badge/version-0.1.2-blue.svg)](https://github.com/juris-framework/juris)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Framework](https://img.shields.io/badge/framework-Juris-purple.svg)](https://github.com/juris-framework/juris)

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Router Configuration](#router-configuration)
- [Route Definitions](#route-definitions)
- [Navigation](#navigation)
- [Route Parameters](#route-parameters)
- [Query Parameters](#query-parameters)
- [Route Guards](#route-guards)
- [Route Middleware](#route-middleware)
- [Nested Routing](#nested-routing)
- [Route Aliases](#route-aliases)
- [Route Transitions](#route-transitions)
- [Scroll Behavior](#scroll-behavior)
- [Lazy Loading](#lazy-loading)
- [Built-in Components](#built-in-components)
- [Advanced Features](#advanced-features)
- [API Reference](#api-reference)
- [Best Practices](#best-practices)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

---

## Overview

Juris Router is a powerful, feature-rich routing solution designed specifically for the Juris Framework. It provides declarative routing with advanced features like nested routes, route guards, parameter validation, transitions, and more.

### ✨ Key Features

- **🛣️ Multiple Routing Modes**: Hash, History, and Memory routing
- **🎯 Advanced Pattern Matching**: Parameters, wildcards, regex patterns
- **🔒 Route Guards & Middleware**: Authentication, authorization, and custom logic
- **📦 Nested Routing**: Complex layouts with RouterOutlet components
- **🔗 Route Aliases**: Multiple paths to the same component
- **🎨 Route Transitions**: Smooth animations between routes
- **📜 Scroll Management**: Intelligent scroll behavior
- **⚡ Lazy Loading**: Code splitting and dynamic imports
- **✅ Parameter Validation**: Type checking, constraints, and defaults
- **🔍 Query Parameter Support**: Advanced parsing and validation
- **📱 Mobile-Friendly**: Touch gestures and mobile optimizations

---

## Quick Start

### Basic Setup

```javascript
const app = new Juris({
  router: {
    mode: 'hash', // 'hash', 'history', or 'memory'
    routes: {
      '/': { component: 'HomePage' },
      '/about': { component: 'AboutPage' },
      '/users/:id': { component: 'UserPage' }
    }
  },
  
  components: {
    HomePage: () => ({ render: () => ({ h1: { text: 'Welcome!' } }) }),
    AboutPage: () => ({ render: () => ({ h1: { text: 'About Us' } }) }),
    UserPage: (props, context) => ({
      render: () => ({
        div: {
          children: [
            { h1: { text: `User: ${context.getState('router.params.id')}` } }
          ]
        }
      })
    })
  },
  
  layout: {
    div: {
      children: [
        { Router: {} } // Main router outlet
      ]
    }
  }
});

app.render();
```

### Navigation

```javascript
// Programmatic navigation
context.navigate('/users/123');
context.navigate('/search?q=hello&category=news');

// Using RouterLink component
{
  RouterLink: {
    to: '/users/123',
    text: 'View User',
    className: 'nav-link'
  }
}
```

---

## Router Configuration

Configure the router when initializing your Juris app:

```javascript
const app = new Juris({
  router: {
    // Routing mode
    mode: 'hash', // 'hash' | 'history' | 'memory'
    
    // Base path for history mode
    base: '/app',
    
    // Route definitions
    routes: {
      // Basic routes
      '/': { component: 'HomePage' },
      '/about': { component: 'AboutPage' },
      
      // Parameterized routes
      '/users/:id': { 
        component: 'UserPage',
        params: {
          id: { type: 'string', required: true }
        }
      },
      
      // Nested routes
      '/dashboard': {
        component: 'DashboardLayout',
        children: {
          '/stats': { component: 'StatsPage' },
          '/settings': { component: 'SettingsPage' }
        }
      }
    },
    
    // Global route guards
    guards: {
      authGuard: async (context) => {
        const isAuth = context.getState('auth.isAuthenticated');
        if (!isAuth) {
          context.navigate('/login');
          return false;
        }
        return true;
      }
    },
    
    // Global middleware
    middleware: [
      {
        path: '*',
        handler: (context) => {
          console.log('Route accessed:', context.route);
        }
      }
    ],
    
    // Route transitions
    transitions: true,
    
    // Scroll behavior
    scrollBehavior: 'top', // 'top' | 'none' | 'maintain' | function
    
    // History size limit for memory mode
    maxHistorySize: 50,
    
    // Lazy loading configuration
    lazy: {
      'UserPage': () => import('./components/UserPage.js')
    }
  }
});
```

### Routing Modes

#### Hash Mode (Default)
```javascript
// Uses URL hash for routing
// Example: https://example.com/#/users/123
mode: 'hash'
```

#### History Mode
```javascript
// Uses HTML5 History API
// Example: https://example.com/users/123
mode: 'history',
base: '/app' // Optional base path
```

#### Memory Mode
```javascript
// In-memory routing (useful for testing)
mode: 'memory'
```

---

## Route Definitions

### Basic Routes

```javascript
routes: {
  '/': { component: 'HomePage' },
  '/about': { component: 'AboutPage' },
  '/contact': { component: 'ContactPage' }
}
```

### Parameterized Routes

```javascript
routes: {
  // Single parameter
  '/users/:id': { component: 'UserPage' },
  
  // Multiple parameters
  '/users/:userId/posts/:postId': { component: 'PostPage' },
  
  // Optional parameters
  '/posts/:id?': { component: 'PostPage' }
}
```

### Wildcard Routes

```javascript
routes: {
  // Catch-all route
  '/admin/*': { component: 'AdminPage' },
  
  // 404 handler
  '*': { component: 'NotFoundPage' }
}
```

### Regex Routes

```javascript
routes: {
  // Custom regex pattern
  'RegExp:^/files/(.+)\\.(jpg|png|gif)$': { 
    component: 'ImageViewer' 
  }
}
```

### Route Configuration Options

```javascript
routes: {
  '/profile': {
    // Component to render
    component: 'ProfilePage',
    
    // Route guards
    guards: ['authGuard', 'profileGuard'],
    
    // Parameter validation
    params: {
      section: { 
        type: 'string',
        enum: ['personal', 'security', 'preferences'],
        default: 'personal'
      }
    },
    
    // Query parameter validation
    query: {
      tab: { 
        type: 'string',
        enum: ['general', 'advanced'],
        default: 'general'
      },
      page: { 
        type: 'number',
        min: 1,
        default: 1
      }
    },
    
    // Route metadata
    meta: {
      title: 'User Profile - {params.section}',
      requiresAuth: true,
      breadcrumb: 'Profile'
    },
    
    // Data loading
    loadData: async (context) => {
      const profile = await fetchUserProfile();
      context.setState('profile.data', profile);
    },
    
    // Route transitions
    transitions: {
      name: 'slide-left',
      duration: 400
    },
    
    // Route aliases
    alias: ['/me', '/account'],
    
    // Redirect
    redirectTo: '/profile/personal',
    
    // Nested routes
    children: {
      '/personal': { component: 'PersonalSettings' },
      '/security': { component: 'SecuritySettings' }
    }
  }
}
```

---

## Navigation

### Programmatic Navigation

```javascript
// Basic navigation
context.navigate('/users/123');

// Navigation with query parameters
context.navigate('/search?q=hello&category=news');

// Navigation with options
context.navigate('/profile', {
  replace: true,      // Replace current history entry
  query: { tab: 'settings' },
  hash: 'security',
  state: { from: 'dashboard' }
});

// Force navigation (bypass guards)
context.navigate('/admin', { force: true });

// Silent navigation (no route change events)
context.navigate('/background', { silent: true });
```

### RouterLink Component

```javascript
// Basic link
{
  RouterLink: {
    to: '/about',
    text: 'About Us'
  }
}

// Link with query parameters
{
  RouterLink: {
    to: '/users/123',
    params: { id: 123 },
    query: { tab: 'profile' },
    text: 'View Profile'
  }
}

// Active link styling
{
  RouterLink: {
    to: '/dashboard',
    text: 'Dashboard',
    activeClass: 'nav-active',
    exact: true // Exact match for active state
  }
}

// Link with custom attributes
{
  RouterLink: {
    to: '/download',
    text: 'Download File',
    className: 'btn btn-primary',
    target: '_blank',
    onClick: (e) => {
      console.log('Link clicked');
    }
  }
}
```

### Route Building

```javascript
// Build route with parameters
const userRoute = app.buildRoute('/users/:id', { id: 123 });
// Result: '/users/123'

// Build route with query parameters
const searchRoute = app.buildRoute('/search', {}, { q: 'hello' });
// Result: '/search?q=hello'
```

---

## Route Parameters

### Parameter Definition

```javascript
routes: {
  '/users/:id': {
    component: 'UserPage',
    params: {
      id: {
        type: 'string',
        required: true,
        pattern: /^\d+$/,
        transform: (value) => parseInt(value)
      }
    }
  }
}
```

### Parameter Types

```javascript
params: {
  // String parameter
  username: {
    type: 'string',
    required: true,
    minLength: 3,
    maxLength: 20,
    pattern: /^[a-zA-Z0-9_]+$/
  },
  
  // Number parameter
  age: {
    type: 'number',
    min: 0,
    max: 150,
    default: 25
  },
  
  // Integer parameter
  page: {
    type: 'int',
    min: 1,
    default: 1
  },
  
  // Float parameter
  price: {
    type: 'float',
    min: 0.01,
    max: 9999.99
  },
  
  // Boolean parameter
  active: {
    type: 'boolean',
    default: true
  },
  
  // Date parameter
  created: {
    type: 'date',
    default: () => new Date()
  },
  
  // Enum parameter
  status: {
    type: 'string',
    enum: ['active', 'inactive', 'pending'],
    default: 'active'
  }
}
```

### Accessing Parameters

```javascript
const UserPage = (props, context) => ({
  render: () => {
    const userId = context.getState('router.params.id');
    const allParams = context.getState('router.params');
    
    return {
      div: {
        children: [
          { h1: { text: `User ID: ${userId}` } },
          { pre: { text: JSON.stringify(allParams, null, 2) } }
        ]
      }
    };
  }
});
```

---

## Query Parameters

### Query Parameter Definition

```javascript
routes: {
  '/search': {
    component: 'SearchPage',
    query: {
      q: {
        type: 'string',
        required: true,
        minLength: 1
      },
      category: {
        type: 'string',
        enum: ['all', 'news', 'images', 'videos'],
        default: 'all'
      },
      page: {
        type: 'number',
        min: 1,
        default: 1
      },
      sort: {
        type: 'string',
        enum: ['relevance', 'date', 'title'],
        default: 'relevance'
      }
    }
  }
}
```

### Complex Query Parameters

```javascript
query: {
  // Array parameters
  tags: {
    type: 'array',
    items: { type: 'string' },
    maxItems: 10
  },
  
  // Object parameters
  filters: {
    type: 'object',
    properties: {
      price: { type: 'number' },
      color: { type: 'string' }
    }
  }
}
```

### Accessing Query Parameters

```javascript
const SearchPage = (props, context) => ({
  render: () => {
    const query = context.getState('router.query.q');
    const category = context.getState('router.query.category', 'all');
    const allQuery = context.getState('router.query');
    
    return {
      div: {
        children: [
          { h1: { text: `Search: ${query}` } },
          { p: { text: `Category: ${category}` } },
          { pre: { text: JSON.stringify(allQuery, null, 2) } }
        ]
      }
    };
  }
});
```

### Query Parameter Navigation

```javascript
// Update query parameters
context.navigate('/search?q=new+query&category=news');

// Build query string
const queryString = app.buildQueryString({
  q: 'hello world',
  category: 'news',
  tags: ['urgent', 'breaking']
});
// Result: "q=hello%20world&category=news&tags[]=urgent&tags[]=breaking"
```

---

## Route Guards

Route guards are functions that determine whether a route can be activated. They're perfect for authentication, authorization, and other access control logic.

### Basic Guards

```javascript
// Define guards
const guards = {
  // Authentication guard
  authGuard: async (context) => {
    const isAuthenticated = context.getState('auth.isAuthenticated');
    
    if (!isAuthenticated) {
      // Store intended route for redirect after login
      context.setState('auth.intendedRoute', context.route);
      context.navigate('/login');
      return false; // Block navigation
    }
    
    return true; // Allow navigation
  },
  
  // Admin guard
  adminGuard: async (context) => {
    const user = context.getState('auth.user');
    
    if (!user || user.role !== 'admin') {
      context.navigate('/unauthorized');
      return false;
    }
    
    return true;
  },
  
  // Data loading guard
  profileGuard: async (context) => {
    try {
      // Load required data before route activation
      const userId = context.params.id;
      const profile = await fetchUserProfile(userId);
      context.setState('profile.data', profile);
      return true;
    } catch (error) {
      context.navigate('/error');
      return false;
    }
  }
};

// Use guards in router configuration
const app = new Juris({
  router: {
    guards,
    routes: {
      '/profile': {
        component: 'ProfilePage',
        guards: ['authGuard'] // Single guard
      },
      '/admin': {
        component: 'AdminPage',
        guards: ['authGuard', 'adminGuard'] // Multiple guards
      },
      '/users/:id': {
        component: 'UserPage',
        guards: ['authGuard', 'profileGuard']
      }
    }
  }
});
```

### Advanced Guard Examples

```javascript
const guards = {
  // Guard with custom logic
  subscriptionGuard: async (context) => {
    const user = context.getState('auth.user');
    const requiredPlan = context.config.meta?.requiredPlan;
    
    if (requiredPlan && user.plan !== requiredPlan) {
      context.navigate('/upgrade', {
        query: { plan: requiredPlan, returnUrl: context.route }
      });
      return false;
    }
    
    return true;
  },
  
  // Guard with confirmation
  unsavedChangesGuard: async (context) => {
    const hasUnsavedChanges = context.getState('editor.hasUnsavedChanges');
    
    if (hasUnsavedChanges) {
      const confirmed = confirm('You have unsaved changes. Continue?');
      if (!confirmed) {
        return false;
      }
      
      // Clear unsaved changes flag
      context.setState('editor.hasUnsavedChanges', false);
    }
    
    return true;
  },
  
  // Async guard with API call
  permissionGuard: async (context) => {
    try {
      const permission = await checkUserPermission(
        context.params.resourceId
      );
      
      if (!permission.canAccess) {
        context.navigate('/forbidden');
        return false;
      }
      
      // Store permission data for component use
      context.setState('permissions.current', permission);
      return true;
    } catch (error) {
      console.error('Permission check failed:', error);
      context.navigate('/error');
      return false;
    }
  }
};
```

### Guard Context

Guards receive a context object with useful properties and methods:

```javascript
const guardContext = {
  // Route information
  route: '/users/123',           // Current route path
  from: '/dashboard',            // Previous route
  to: '/users/123',             // Target route
  params: { id: '123' },        // Route parameters
  query: { tab: 'profile' },    // Query parameters
  hash: 'section1',             // URL hash
  
  // Navigation methods
  navigate: (path) => { /* navigate to path */ },
  
  // State management
  getState: (path, defaultValue) => { /* get state */ },
  setState: (path, value) => { /* set state */ },
  
  // Route configuration
  config: {
    component: 'UserPage',
    meta: { requiresAuth: true }
  }
};
```

---

## Route Middleware

Route middleware provides a way to execute code before, during, or after route changes. Unlike guards, middleware always runs and cannot block navigation.

### Basic Middleware

```javascript
const middleware = [
  // Global analytics middleware
  {
    path: '*', // Apply to all routes
    priority: 100,
    handler: (context) => {
      // Track page view
      analytics.track('page_view', {
        route: context.route,
        timestamp: Date.now()
      });
    }
  },
  
  // Admin section middleware
  {
    path: '/admin/*',
    priority: 50,
    before: (context) => {
      console.log('Entering admin section');
      context.setState('ui.adminMode', true);
    },
    after: (context) => {
      console.log('Admin route loaded');
    }
  },
  
  // Authentication middleware
  {
    path: '/auth/*',
    handler: (context) => {
      // Clear any existing auth errors
      context.setState('auth.error', null);
    }
  }
];

// Register middleware
const app = new Juris({
  router: {
    middleware,
    routes: { /* routes */ }
  }
});
```

### Advanced Middleware

```javascript
const middleware = [
  // Performance monitoring
  {
    path: '*',
    priority: 100,
    before: (context) => {
      context.setState('performance.routeStartTime', Date.now());
    },
    after: (context) => {
      const startTime = context.getState('performance.routeStartTime');
      const duration = Date.now() - startTime;
      console.log(`Route ${context.route} loaded in ${duration}ms`);
    }
  },
  
  // Breadcrumb management
  {
    path: '*',
    priority: 80,
    handler: (context) => {
      const breadcrumbs = context.getState('ui.breadcrumbs', []);
      const routeMeta = context.config?.meta;
      
      if (routeMeta?.breadcrumb) {
        breadcrumbs.push({
          label: routeMeta.breadcrumb,
          path: context.route
        });
        
        // Limit breadcrumb history
        if (breadcrumbs.length > 5) {
          breadcrumbs.shift();
        }
        
        context.setState('ui.breadcrumbs', breadcrumbs);
      }
    }
  },
  
  // Theme management
  {
    path: '/dark/*',
    handler: (context) => {
      document.body.classList.add('dark-theme');
    }
  }
];
```

### Middleware vs Guards

| Feature | Guards | Middleware |
|---------|--------|------------|
| **Purpose** | Control access | Execute side effects |
| **Can block navigation** | ✅ Yes | ❌ No |
| **Execution order** | Before route activation | Around route change |
| **Use cases** | Auth, permissions | Analytics, logging |
| **Return value** | `true`/`false` | Any value |

---

## Nested Routing

Nested routing allows you to build complex layouts with multiple levels of components and sub-routes.

### Basic Nested Routes

```javascript
routes: {
  '/dashboard': {
    component: 'DashboardLayout',
    children: {
      '/stats': { component: 'StatsPage' },
      '/users': { component: 'UsersPage' },
      '/settings': { component: 'SettingsPage' }
    }
  }
}

// DashboardLayout component
const DashboardLayout = (props, context) => ({
  render: () => ({
    div: {
      className: 'dashboard-layout',
      children: [
        // Sidebar navigation
        {
          nav: {
            className: 'sidebar',
            children: [
              { RouterLink: { to: '/dashboard/stats', text: 'Statistics' } },
              { RouterLink: { to: '/dashboard/users', text: 'Users' } },
              { RouterLink: { to: '/dashboard/settings', text: 'Settings' } }
            ]
          }
        },
        // Main content area
        {
          main: {
            className: 'content',
            children: [
              { RouterOutlet: { name: 'dashboard' } } // Nested route outlet
            ]
          }
        }
      ]
    }
  })
});
```

### Multiple Named Outlets

```javascript
routes: {
  '/app': {
    component: 'AppLayout',
    children: {
      '/home': {
        outlets: {
          main: 'HomePage',
          sidebar: 'RecentActivity',
          footer: 'QuickActions'
        }
      },
      '/profile': {
        outlets: {
          main: 'ProfilePage',
          sidebar: 'ProfileSidebar'
        }
      }
    }
  }
}

// AppLayout with multiple outlets
const AppLayout = () => ({
  render: () => ({
    div: {
      className: 'app-layout',
      children: [
        {
          aside: {
            className: 'sidebar',
            children: [{ RouterOutlet: { name: 'sidebar' } }]
          }
        },
        {
          main: {
            className: 'main-content',
            children: [{ RouterOutlet: { name: 'main' } }]
          }
        },
        {
          footer: {
            className: 'footer',
            children: [{ RouterOutlet: { name: 'footer' } }]
          }
        }
      ]
    }
  })
});
```

### Deep Nesting

```javascript
routes: {
  '/admin': {
    component: 'AdminLayout',
    guards: ['adminGuard'],
    children: {
      '/users': {
        component: 'UsersLayout',
        children: {
          '/list': { component: 'UsersList' },
          '/:id': {
            component: 'UserDetail',
            children: {
              '/profile': { component: 'UserProfile' },
              '/permissions': { component: 'UserPermissions' },
              '/activity': { component: 'UserActivity' }
            }
          }
        }
      },
      '/settings': {
        component: 'SettingsLayout',
        children: {
          '/general': { component: 'GeneralSettings' },
          '/security': { component: 'SecuritySettings' },
          '/integrations': { component: 'IntegrationSettings' }
        }
      }
    }
  }
}

// Results in routes like:
// /admin/users/list
// /admin/users/123/profile
// /admin/users/123/permissions
// /admin/settings/general
```

---

## Route Aliases

Route aliases allow multiple URLs to point to the same component, useful for legacy URLs, shortcuts, or alternative paths.

### Basic Aliases

```javascript
routes: {
  '/home': {
    component: 'HomePage',
    alias: ['/welcome', '/start'] // Multiple aliases
  },
  '/profile': {
    component: 'ProfilePage',
    alias: '/me' // Single alias
  }
}

// All these URLs show the same component:
// /home, /welcome, /start → HomePage
// /profile, /me → ProfilePage
```

### Dynamic Aliases

```javascript
routes: {
  '/users/:id/profile': {
    component: 'UserProfile',
    alias: ['/users/:id', '/u/:id'] // Aliases with parameters
  }
}

// These URLs are equivalent:
// /users/123/profile
// /users/123
// /u/123
```

### Conditional Aliases

```javascript
routes: {
  '/dashboard': {
    component: 'DashboardPage',
    alias: (context) => {
      const user = context.getState('auth.user');
      return user?.role === 'admin' ? ['/admin', '/control-panel'] : [];
    }
  }
}
```

---

## Route Transitions

Add smooth animations and transitions between route changes.

### Basic Transitions

```javascript
routes: {
  '/home': {
    component: 'HomePage',
    transitions: 'fade' // Predefined transition
  },
  '/about': {
    component: 'AboutPage',
    transitions: {
      name: 'slide-left',
      duration: 400,
      easing: 'ease-in-out'
    }
  }
}
```

### Predefined Transitions

```javascript
// Available transition names:
transitions: 'fade'        // Fade in/out
transitions: 'slide-left'  // Slide from right to left
transitions: 'slide-right' // Slide from left to right
transitions: 'slide-up'    // Slide from bottom to top
transitions: 'slide-down'  // Slide from top to bottom
transitions: 'zoom'        // Zoom in/out
transitions: 'flip'        // 3D flip effect
```

### Custom Transitions

```javascript
routes: {
  '/gallery': {
    component: 'GalleryPage',
    transitions: {
      name: 'custom',
      duration: 600,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      beforeEnter: (element) => {
        element.style.opacity = '0';
        element.style.transform = 'scale(0.8) rotate(10deg)';
      },
      enter: (element) => {
        element.style.transition = 'all 600ms ease-out';
        element.style.opacity = '1';
        element.style.transform = 'scale(1) rotate(0deg)';
      },
      afterEnter: (element) => {
        console.log('Transition complete');
      },
      beforeLeave: (element) => {
        element.style.zIndex = '1';
      },
      leave: (element) => {
        element.style.transition = 'all 300ms ease-in';
        element.style.opacity = '0';
        element.style.transform = 'scale(1.2) rotate(-5deg)';
      },
      afterLeave: (element) => {
        element.remove();
      }
    }
  }
}
```

### Global Transition Configuration

```javascript
const app = new Juris({
  router: {
    transitions: true, // Enable transitions globally
    defaultTransition: {
      name: 'fade',
      duration: 300
    },
    routes: { /* routes */ }
  }
});
```

---

## Scroll Behavior

Control how the page scrolls when navigating between routes.

### Basic Scroll Behavior

```javascript
const app = new Juris({
  router: {
    scrollBehavior: 'top', // Scroll to top on route change
    routes: { /* routes */ }
  }
});
```

### Scroll Behavior Options

```javascript
// Predefined behaviors
scrollBehavior: 'top'      // Always scroll to top
scrollBehavior: 'none'     // Don't change scroll position
scrollBehavior: 'maintain' // Keep current scroll position
scrollBehavior: 'hash'     // Scroll to hash anchor if present
```

### Custom Scroll Behavior

```javascript
const app = new Juris({
  router: {
    scrollBehavior: (to, from, savedPosition) => {
      // Restore position for back/forward navigation
      if (savedPosition) {
        return savedPosition;
      }
      
      // Scroll to anchor if hash is present
      if (to.hash) {
        return { selector: to.hash };
      }
      
      // Different behavior for different routes
      if (to.path.startsWith('/docs')) {
        return { x: 0, y: 0, smooth: true };
      }
      
      // Maintain scroll for certain routes
      if (to.path === from.path) {
        return false; // Don't scroll
      }
      
      // Default to top
      return { x: 0, y: 0 };
    },
    routes: { /* routes */ }
  }
});
```

### Smooth Scrolling

```javascript
const app = new Juris({
  router: {
    scrollBehavior: (to, from) => ({
      x: 0,
      y: 0,
      smooth: true // Enable smooth scrolling
    }),
    routes: { /* routes */ }
  }
});
```

---

## Lazy Loading

Implement code splitting and dynamic imports for better performance.

### Basic Lazy Loading

```javascript
const app = new Juris({
  router: {
    lazy: {
      // Component name → import function
      'HeavyComponent': () => import('./components/HeavyComponent.js'),
      'AdminPanel': () => import('./components/AdminPanel.js')
    },
    routes: {
      '/heavy': { 
        component: 'HeavyComponent', // Will be lazy loaded
        lazy: true
      },
      '/admin': {
        component: 'AdminPanel',
        lazy: {
          loader: () => import('./components/AdminPanel.js'),
          loading: 'LoadingComponent',
          error: 'ErrorComponent',
          delay: 200,
          timeout: 10000
        }
      }
    }
  }
});
```

### Route-Level Lazy Loading

```javascript
routes: {
  '/dashboard': {
    lazy: {
      loader: async () => {
        // Load multiple dependencies
        const [component, data] = await Promise.all([
          import('./components/Dashboard.js'),
          fetch('/api/dashboard-data').then(r => r.json())
        ]);
        
        // Store data in state
        app.setState('dashboard.data', data);
        
        return component;
      },
      loading: 'DashboardLoading',
      error: 'DashboardError'
    }
  }
}
```

### Progressive Enhancement

```javascript
routes: {
  '/editor': {
    component: 'BasicEditor', // Basic version loads immediately
    lazy: {
      loader: () => import('./components/AdvancedEditor.js'),
      enhance: true // Upgrade to advanced version when loaded
    }
  }
}
```

---

## Built-in Components

### Router Component

The main router component that renders the current route.

```javascript
{
  Router: {
    // Loading component while route loads
    loadingComponent: 'RouteLoading',
    
    // Error component for route errors
    errorComponent: 'RouteError',
    
    // 404 component for unmatched routes
    notFoundComponent: 'NotFound',
    
    // Additional props passed to route components
    user: () => context.getState('auth.user'),
    theme: () => context.getState('ui.theme')
  }
}
```

### RouterLink Component

Navigation links with automatic active state detection.

```javascript
{
  RouterLink: {
    to: '/about',           // Target route
    text: 'About Us',       // Link text
    className: 'nav-link',  // CSS class
    activeClass: 'active',  // Active state class
    exact: false,           // Exact match for active state
    replace: false,         // Replace history entry
    
    // Query parameters
    query: { tab: 'team' },
    
    // URL hash
    hash: 'leadership',
    
    // Custom click handler
    onClick: (e) => {
      console.log('Link clicked');
    }
  }
}
```

### RouterOutlet Component

Outlet for rendering nested routes.

```javascript
{
  RouterOutlet: {
    name: 'main',           // Outlet name (default: 'default')
    fallback: 'EmptyState', // Component when no route matches
    
    // Props passed to child components
    layout: 'wide',
    permissions: () => context.getState('auth.permissions')
  }
}
```

---

## Advanced Features

### Route Data Loading

Load data before route activation:

```javascript
routes: {
  '/users/:id': {
    component: 'UserPage',
    loadData: async ({ params, query, setState, getState }) => {
      try {
        // Load user data
        const user = await fetchUser(params.id);
        setState('users.current', user);
        
        // Load related data
        const posts = await fetchUserPosts(params.id);
        setState('users.posts', posts);
        
      } catch (error) {
        setState('users.error', error.message);
        throw error; // Prevent route activation
      }
    }
  }
}
```

### Route Meta Information

Store metadata about routes:

```javascript
routes: {
  '/admin/users': {
    component: 'AdminUsers',
    meta: {
      title: 'User Management',
      breadcrumb: 'Users',
      icon: 'users',
      permissions: ['admin', 'user.read'],
      layout: 'admin',
      sidebar: true
    }
  }
}

// Access meta in components
const component = (props, context) => ({
  render: () => {
    const meta = context.getState('router.meta');
    document.title = meta.title;
    
    return { /* component JSX */ };
  }
});
```

### Dynamic Route Registration

Add routes dynamically at runtime:

```javascript
// Register new route
app.registerRoute('/dynamic/:id', {
  component: 'DynamicPage',
  guards: ['authGuard']
});

// Remove route
app.unregisterRoute('/old-route');

// Update route
app.updateRoute('/existing', {
  component: 'UpdatedComponent'
});
```

### Route History Management

Access and manipulate route history:

```javascript
// Get route history
const history = app.getRouteHistory();

// Go back/forward
app.goBack();
app.goForward();

// Clear history
app.clearHistory();

// Check if can go back/forward
const canGoBack = app.canGoBack();
const canGoForward = app.canGoForward();
```

---

## API Reference

### Router Configuration

```typescript
interface RouterConfig {
  mode?: 'hash' | 'history' | 'memory';
  base?: string;
  routes: Record<string, RouteConfig>;
  guards?: Record<string, GuardFunction>;
  middleware?: MiddlewareConfig[];
  transitions?: boolean | TransitionConfig;
  scrollBehavior?: ScrollBehavior;
  maxHistorySize?: number;
  lazy?: Record<string, () => Promise<any>>;
}
```

### Route Configuration

```typescript
interface RouteConfig {
  component: string;
  guards?: string[];
  params?: Record<string, ParamConfig>;
  query?: Record<string, ParamConfig>;
  meta?: Record<string, any>;
  loadData?: (context: LoadDataContext) => Promise<void>;
  transitions?: string | TransitionConfig;
  alias?: string | string[];
  redirectTo?: string;
  children?: Record<string, RouteConfig>;
  lazy?: boolean | LazyConfig;
}
```

### Navigation Methods

```typescript
// Navigate to route
navigate(path: string, options?: NavigationOptions): boolean

// Build route URL
buildRoute(pattern: string, params?: object, query?: object): string

// Check current route
getCurrentRoute(): string

// Get route parameters
getRouteParams(): object

// Get query parameters
getQueryParams(): object
```

### State Access

```typescript
// Router state paths
'router.currentRoute'    // Current route path
'router.params'         // Route parameters
'router.query'          // Query parameters
'router.hash'           // URL hash
'router.isLoading'      // Loading state
'router.error'          // Error state
'router.meta'           // Route metadata
```

---

## Best Practices

### 1. Route Organization

```javascript
// ✅ Good: Organize routes hierarchically
routes: {
  '/': { component: 'HomePage' },
  
  // Auth routes
  '/auth/login': { component: 'LoginPage' },
  '/auth/register': { component: 'RegisterPage' },
  
  // User routes
  '/users': { component: 'UsersList' },
  '/users/:id': { component: 'UserDetail' },
  '/users/:id/edit': { component: 'UserEdit' },
  
  // Admin routes
  '/admin': {
    component: 'AdminLayout',
    children: {
      '/dashboard': { component: 'AdminDashboard' },
      '/users': { component: 'AdminUsers' }
    }
  }
}
```

### 2. Parameter Validation

```javascript
// ✅ Good: Always validate parameters
routes: {
  '/users/:id': {
    component: 'UserPage',
    params: {
      id: {
        type: 'string',
        required: true,
        pattern: /^\d+$/,
        transform: (value) => parseInt(value)
      }
    }
  }
}

// ❌ Bad: No validation
routes: {
  '/users/:id': { component: 'UserPage' }
}
```

### 3. Guard Composition

```javascript
// ✅ Good: Compose specific guards
const guards = {
  authGuard: requireAuthentication,
  adminGuard: requireAdminRole,
  subscriptionGuard: requireActiveSubscription
};

routes: {
  '/admin/billing': {
    component: 'BillingPage',
    guards: ['authGuard', 'adminGuard', 'subscriptionGuard']
  }
}

// ❌ Bad: One giant guard
const megaGuard = (context) => {
  // Huge function doing everything
};
```

### 4. Component Props

```javascript
// ✅ Good: Use reactive props
const UserPage = (props, context) => ({
  render: () => {
    const userId = () => context.getState('router.params.id');
    const user = () => context.getState('users.current');
    
    return {
      div: {
        children: [
          { h1: { text: () => `User: ${user()?.name || userId()}` } }
        ]
      }
    };
  }
});

// ❌ Bad: Static props
const UserPage = (props, context) => {
  const userId = context.getState('router.params.id'); // Won't update
  
  return {
    render: () => ({
      h1: { text: `User: ${userId}` }
    })
  };
};
```

### 5. Error Handling

```javascript
// ✅ Good: Comprehensive error handling
routes: {
  '/users/:id': {
    component: 'UserPage',
    guards: ['authGuard'],
    loadData: async ({ params, setState }) => {
      try {
        const user = await fetchUser(params.id);
        setState('users.current', user);
      } catch (error) {
        setState('users.error', error.message);
        throw error;
      }
    }
  }
}

// ❌ Bad: No error handling
routes: {
  '/users/:id': {
    component: 'UserPage',
    loadData: async ({ params, setState }) => {
      const user = await fetchUser(params.id); // Can throw
      setState('users.current', user);
    }
  }
}
```

---

## Examples

### Example 1: E-commerce App

```javascript
const ecommerceApp = new Juris({
  router: {
    mode: 'history',
    base: '/shop',
    
    routes: {
      '/': { 
        component: 'HomePage',
        meta: { title: 'Shop - Best Products Online' }
      },
      
      '/products': {
        component: 'ProductList',
        query: {
          category: { type: 'string', optional: true },
          sort: { type: 'string', enum: ['price', 'name', 'rating'], default: 'name' },
          page: { type: 'number', min: 1, default: 1 },
          search: { type: 'string', optional: true }
        }
      },
      
      '/products/:id': {
        component: 'ProductDetail',
        params: {
          id: { type: 'string', pattern: /^[a-zA-Z0-9-]+$/ }
        },
        loadData: async ({ params, setState }) => {
          const product = await fetchProduct(params.id);
          setState('products.current', product);
        }
      },
      
      '/cart': {
        component: 'ShoppingCart',
        guards: ['cartGuard']
      },
      
      '/checkout': {
        component: 'CheckoutPage',
        guards: ['authGuard', 'cartNotEmptyGuard']
      },
      
      '/account': {
        component: 'AccountLayout',
        guards: ['authGuard'],
        children: {
          '/profile': { component: 'ProfilePage' },
          '/orders': { component: 'OrderHistory' },
          '/settings': { component: 'AccountSettings' }
        }
      }
    },
    
    guards: {
      authGuard: async (context) => {
        const token = localStorage.getItem('authToken');
        if (!token) {
          context.navigate('/login?return=' + encodeURIComponent(context.route));
          return false;
        }
        return true;
      },
      
      cartNotEmptyGuard: (context) => {
        const cartItems = context.getState('cart.items', []);
        if (cartItems.length === 0) {
          context.navigate('/cart');
          return false;
        }
        return true;
      }
    }
  }
});
```

### Example 2: Dashboard App

```javascript
const dashboardApp = new Juris({
  router: {
    mode: 'hash',
    
    routes: {
      '/': { 
        redirectTo: '/dashboard',
        guards: ['authGuard']
      },
      
      '/login': {
        component: 'LoginPage',
        guards: ['guestGuard']
      },
      
      '/dashboard': {
        component: 'DashboardLayout',
        guards: ['authGuard'],
        children: {
          '/overview': { 
            component: 'OverviewPage',
            alias: '/' // /dashboard redirects to /dashboard/overview
          },
          '/analytics': {
            component: 'AnalyticsPage',
            loadData: async ({ setState }) => {
              const data = await fetchAnalytics();
              setState('analytics.data', data);
            }
          },
          '/users': {
            component: 'UsersPage',
            guards: ['adminGuard']
          },
          '/settings': {
            component: 'SettingsLayout',
            children: {
              '/profile': { component: 'ProfileSettings' },
              '/security': { component: 'SecuritySettings' },
              '/billing': { 
                component: 'BillingSettings',
                guards: ['subscriptionGuard']
              }
            }
          }
        }
      }
    },
    
    transitions: {
      name: 'slide-left',
      duration: 300
    },
    
    scrollBehavior: 'top'
  }
});
```

---

## Troubleshooting

### Common Issues

#### 1. Routes Not Matching

**Problem**: Routes don't match expected URLs

**Solutions**:
```javascript
// Check route order (specific routes before general ones)
routes: {
  '/users/new': { component: 'NewUser' },    // ✅ Specific first
  '/users/:id': { component: 'UserDetail' }, // ✅ General second
}

// Verify parameter patterns
params: {
  id: { 
    type: 'string',
    pattern: /^\d+$/, // Only digits
    required: true
  }
}

// Debug route matching
console.log('Current route:', app.getCurrentRoute());
console.log('Route match:', app.matchRoute('/users/123'));
```

#### 2. Guards Not Working

**Problem**: Route guards aren't blocking navigation

**Solutions**:
```javascript
// Ensure guards return boolean values
const authGuard = async (context) => {
  const isAuth = await checkAuth();
  if (!isAuth) {
    context.navigate('/login');
    return false; // ✅ Explicit false
  }
  return true; // ✅ Explicit true
};

// Check guard registration
guards: {
  'authGuard': authGuard // ✅ String key matches route reference
}

routes: {
  '/protected': {
    guards: ['authGuard'] // ✅ Array of guard names
  }
}
```

#### 3. Parameter Validation Failing

**Problem**: Route parameters aren't being validated correctly

**Solutions**:
```javascript
// Check parameter configuration
params: {
  id: {
    type: 'string',        // ✅ Correct type
    required: true,        // ✅ Required validation
    pattern: /^\d+$/,      // ✅ Pattern validation
    transform: parseInt    // ✅ Transform to number
  }
}

// Debug parameter parsing
console.log('Raw params:', app.getRouteParams());
console.log('Validated params:', context.getState('router.params'));
```

#### 4. Navigation Not Working

**Problem**: Programmatic navigation doesn't work

**Solutions**:
```javascript
// Use correct navigation syntax
context.navigate('/users/123');              // ✅ Correct
window.location.hash = '#/users/123';        // ❌ Bypasses router

// Check for navigation guards
const result = app.navigate('/protected');
console.log('Navigation allowed:', result);

// Verify route exists
console.log('Available routes:', Object.keys(app.routes));
```

### Performance Issues

#### 1. Slow Route Changes

**Causes & Solutions**:
```javascript
// Optimize guard performance
const fastGuard = (context) => {
  // ✅ Use cached auth state
  const isAuth = context.getState('auth.isAuthenticated');
  return isAuth;
};

const slowGuard = async (context) => {
  // ❌ API call on every route change
  const isAuth = await fetch('/api/auth/check');
  return isAuth.ok;
};

// Lazy load heavy components
routes: {
  '/heavy': {
    lazy: () => import('./HeavyComponent.js')
  }
}
```

#### 2. Memory Leaks

**Prevention**:
```javascript
// Clean up subscriptions in component unmount
const Component = (props, context) => ({
  onMount: () => {
    const unsubscribe = context.subscribe('data.updates', handler);
    return unsubscribe; // ✅ Return cleanup function
  }
});

// Limit history size
router: {
  maxHistorySize: 50 // ✅ Prevent unlimited history growth
}
```

### Debug Tools

```javascript
// Enable router debugging
window.app = app; // Make app globally accessible

// Debug current state
console.log('Router state:', app.getState('router'));

// Monitor route changes
app.subscribe('router.currentRoute', (newRoute, oldRoute) => {
  console.log(`Route changed: ${oldRoute} → ${newRoute}`);
});

// Trace route matching
const debugMatch = (path) => {
  console.log('Matching:', path);
  console.log('Result:', app.matchRoute(path));
};
```

---

## Migration Guide

### From Other Routers

Coming from other routing libraries? Here's how Juris Router concepts map:

#### React Router
```javascript
// React Router
<Route path="/users/:id" component={UserPage} />

// Juris Router
routes: {
  '/users/:id': { component: 'UserPage' }
}
```

#### Vue Router
```javascript
// Vue Router
const routes = [
  { path: '/users/:id', component: UserPage, beforeEnter: guard }
]

// Juris Router
routes: {
  '/users/:id': { 
    component: 'UserPage',
    guards: ['guard']
  }
}
```

---

This comprehensive documentation covers all aspects of the Juris Router. For more examples and advanced use cases, check out the [official Juris documentation](https://github.com/juris-framework/juris) and [community examples](https://github.com/juris-framework/examples).

**Happy routing!** 🚀
# DocumentFramework.addDoc() Method

## Overview

The `addDoc()` method is the primary way to add documentation entries to your DocumentFramework instance. It validates, processes, and organizes documentation content with support for rich formatting, interactive examples, and flexible code snippets.

## Syntax

```javascript
docFramework.addDoc(id, documentObject)
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | ✓ | Unique identifier for the document. Used for navigation, bookmarks, and URL routing. |
| `documentObject` | `object` | ✓ | Document configuration object containing all content and metadata. |

## Document Object Properties

### Required Properties

```javascript
{
  title: string,        // Document title displayed in navigation and header
  category: string,     // Category for grouping documents in sidebar
  content: string       // Main documentation content/description
}
```

### Optional Properties

```javascript
{
  description: string,           // Brief description for navigation
  code: string,                 // Complete executable code for live preview
  codeSnippet: string|array,    // Code examples for documentation (see below)
  liveExample: object,          // Static VDOM example
  interactiveExample: function, // Dynamic component example
  testCode: string,             // Test code (reserved for future use)
  technicalDetails: object,     // Key-value pairs for technical reference
  tags: array,                  // Tags for search and categorization
  order: number                 // Manual ordering within category (optional)
}
```

## Code Snippet Support

The `codeSnippet` property supports both simple strings and complex arrays with mixed content:

### Simple String

```javascript
codeSnippet: `// Basic example - compact VDOM with 2-space indentation
const HelloComponent = () => ({
  div: { 
    class: 'p-4 bg-blue-100 rounded',
    text: "Hello World" 
  }
});`
```

### Array with Mixed Content

```javascript
codeSnippet: [
  // String code block
  `// First example - basic component structure
const SimpleCard = () => ({
  div: {
    class: 'bg-white rounded-lg shadow p-6',
    children: [
      {h3: { class: 'text-lg font-bold', text: 'Card Title' }},
      {p: { class: 'text-gray-600', text: 'Card content here' }}
    ]
  }//card
});`,
  
  // Explanatory text
  { text: "Now let's add some interactivity with state management:" },
  
  // Titled code block with language
  {
    title: "Interactive Component with State",
    language: "javascript",
    code: `const Counter = (props, context) => {
  const [count, setCount] = context.newState('count', 0);
  
  return {
    div: {
      class: 'text-center p-4 border rounded',
      children: [
        {p: { 
          class: 'text-2xl font-bold mb-4',
          text: () => \`Count: \${count()}\` 
        }},
        {button: { 
          class: 'px-4 py-2 bg-blue-500 text-white rounded',
          text: 'Increment', 
          onclick: () => setCount(count() + 1) 
        }}
      ]
    }//counter-container
  };
};`
  },
  
  // Visual separator
  { separator: "Best Practices" },
  
  // Custom VDOM element for tips
  {
    div: {
      class: 'p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-r',
      children: [
        {h4: { class: 'font-bold text-yellow-800 mb-2', text: 'Pro Tip' }},
        {p: { class: 'text-yellow-700', text: 'Use compact VDOM with 2-space indentation and end-bracket comments for clarity.' }}
      ]
    }
  }
]
```

### Array Content Types

| Type | Structure | Purpose |
|------|-----------|---------|
| **String** | `"code here"` | Simple code snippet with syntax highlighting |
| **Titled Code** | `{title: "Name", language: "js", code: "..."}` | Code block with custom title and language |
| **Text Block** | `{text: "explanation"}` | Explanatory text between code sections |
| **Separator** | `{separator: "Section Name"}` | Visual divider with optional label |
| **VDOM Object** | `{div: {...}}` | Custom styled content, tips, warnings, etc. |

## Complete Working Examples

### Basic Document with Proper Structure

```javascript
// Define the component first
const WelcomeCard = (props) => ({
  div: {
    class: 'max-w-md mx-auto bg-white rounded-xl shadow-md p-6',
    children: [
      {h2: {
        class: 'text-2xl font-bold text-gray-800 mb-2',
        text: props.title || 'Welcome'
      }},//title
      {p: {
        class: 'text-gray-600 mb-4',
        text: props.message || 'Getting started with Juris'
      }},//message
      {button: {
        class: 'px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600',
        text: 'Get Started',
        onclick: () => alert('Hello from Juris!')
      }}//button
    ]
  }//card
});

// Add documentation entry
docFramework.addDoc('getting-started', {
  title: 'Getting Started',
  category: 'Basics',
  content: 'Learn how to create your first component with proper VDOM structure.',
  
  codeSnippet: `// Component with compact VDOM layout
const WelcomeCard = (props) => ({
  div: {
    class: 'max-w-md mx-auto bg-white rounded-xl shadow-md p-6',
    children: [
      {h2: {
        class: 'text-2xl font-bold text-gray-800 mb-2',
        text: props.title || 'Welcome'
      }},//title
      {p: {
        class: 'text-gray-600 mb-4',
        text: props.message || 'Getting started with Juris'
      }},//message
      {button: {
        class: 'px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600',
        text: 'Get Started',
        onclick: () => alert('Hello from Juris!')
      }}//button
    ]
  }//card
});`,

  code: `// Complete working example with proper structure
const WelcomeCard = (props) => ({
  div: {
    class: 'max-w-md mx-auto bg-white rounded-xl shadow-md p-6',
    children: [
      {h2: {
        class: 'text-2xl font-bold text-gray-800 mb-2',
        text: props.title || 'Welcome'
      }},//title
      {p: {
        class: 'text-gray-600 mb-4',
        text: props.message || 'Getting started with Juris'
      }},//message
      {button: {
        class: 'px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600',
        text: 'Get Started',
        onclick: () => alert('Welcome to Juris!')
      }}//button
    ]
  }//card
});

// Create Juris instance with proper structure
const demo = new Juris({
  components: {
    WelcomeCard
  },
  layout: {
    div: {
      class: 'min-h-screen bg-gray-100 py-8',
      children: [{
        WelcomeCard: {
          title: 'Hello World',
          message: 'Your first Juris component is working!'
        }
      }]
    }//container
  }
});

// Render to demo container
demo.render('#demo');`,
  
  technicalDetails: {
    'VDOM Style': 'Compact layout with 2-space indentation',
    'Comments': 'End-bracket comments for clarity',
    'Components': 'Added to components object',
    'Layout': 'Can be array of components or VDOM objects'
  },
  
  tags: ['beginner', 'tutorial', 'vdom', 'structure']
});
```

### Advanced Document with Interactive Example

```javascript
// Define interactive component
const TodoApp = (props, context) => ({
  div: {
    class: 'max-w-md mx-auto p-4',
    children: [
      {h2: {
        class: 'text-2xl font-bold mb-4',
        text: 'Todo App'
      }},//title
      {div: {
        class: 'flex mb-4',
        children: [
          {input: {
            type: 'text',
            class: 'flex-1 border rounded-l px-3 py-2',
            placeholder: 'Add new todo...',
            value: () => context.getState('newTodo', ''),
            oninput: (e) => context.setState('newTodo', e.target.value)
          }},//input
          {button: {
            class: 'px-4 py-2 bg-blue-500 text-white rounded-r hover:bg-blue-600',
            text: 'Add',
            onclick: () => {
              const text = context.getState('newTodo', '');
              if (text.trim()) {
                const todos = context.getState('todos', []);
                const newTodo = { id: Date.now(), text: text.trim(), done: false };
                context.setState('todos', [...todos, newTodo]);
                context.setState('newTodo', '');
              }
            }
          }}//add-btn
        ]
      }},//input-group
      {div: {
        class: 'space-y-2',
        children: () => {
          const todos = context.getState('todos', []);
          return todos.map(todo => ({
            div: {
              class: 'flex items-center p-2 border rounded',
              children: [
                {input: {
                  type: 'checkbox',
                  class: 'mr-3',
                  checked: todo.done,
                  onchange: (e) => {
                    const todos = context.getState('todos', []);
                    const updated = todos.map(t => 
                      t.id === todo.id ? {...t, done: e.target.checked} : t
                    );
                    context.setState('todos', updated);
                  }
                }},//checkbox
                {span: {
                  class: todo.done ? 'line-through text-gray-500' : 'text-gray-800',
                  text: todo.text
                }},//text
                {button: {
                  class: 'ml-auto px-2 py-1 bg-red-500 text-white rounded text-sm',
                  text: '×',
                  onclick: () => {
                    const todos = context.getState('todos', []);
                    context.setState('todos', todos.filter(t => t.id !== todo.id));
                  }
                }}//delete
              ]
            }//todo-item
          }));
        }
      }}//todo-list
    ]
  }//container
});

docFramework.addDoc('advanced-patterns', {
  title: 'Advanced Patterns',
  category: 'Advanced',
  description: 'Complex patterns for experienced developers.',
  content: 'This guide covers advanced component patterns and state management with proper VDOM structure.',
  
  codeSnippet: [
    `// Basic pattern with compact VDOM
const SimpleComponent = () => ({
  div: { 
    class: 'p-4 bg-white rounded',
    text: "Basic component" 
  }
});`,
    
    { text: "For complex applications, use state management with reactive functions:" },
    
    {
      title: "Stateful Todo Component",
      language: "javascript", 
      code: `const TodoApp = (props, context) => ({
  div: {
    class: 'max-w-md mx-auto p-4',
    children: [
      {h2: { class: 'text-2xl font-bold mb-4', text: 'Todo App' }},//title
      {div: {
        class: 'flex mb-4',
        children: [
          {input: {
            type: 'text',
            class: 'flex-1 border rounded-l px-3 py-2',
            placeholder: 'Add new todo...',
            value: () => context.getState('newTodo', ''),
            oninput: (e) => context.setState('newTodo', e.target.value)
          }},//input
          {button: {
            class: 'px-4 py-2 bg-blue-500 text-white rounded-r',
            text: 'Add',
            onclick: () => {
              const text = context.getState('newTodo', '');
              if (text.trim()) {
                const todos = context.getState('todos', []);
                context.setState('todos', [...todos, {
                  id: Date.now(), 
                  text: text.trim(), 
                  done: false
                }]);
                context.setState('newTodo', '');
              }
            }
          }}//add-btn
        ]
      }},//input-group
      {div: {
        class: 'space-y-2',
        children: () => {
          const todos = context.getState('todos', []);
          return todos.map(todo => ({
            div: {
              class: 'flex items-center p-2 border rounded',
              children: [
                {input: { type: 'checkbox', checked: todo.done }},
                {span: { text: todo.text }},
                {button: { class: 'ml-auto', text: '×' }}
              ]
            }//todo-item
          }));
        }
      }}//todo-list
    ]
  }//container
});`
    },
    
    { separator: "Best Practices for VDOM Structure" },
    
    {
      div: {
        class: 'p-4 bg-green-50 border-l-4 border-green-400 rounded-r',
        children: [
          {h4: { class: 'font-semibold text-green-800 mb-2', text: 'VDOM Guidelines' }},
          {ul: {
            class: 'text-green-700 space-y-1',
            children: [
              {li: { text: 'Use 2-space indentation for compact layout' }},
              {li: { text: 'Add end-bracket comments for nested structures' }},
              {li: { text: 'Keep inline attributes short, break long ones' }},
              {li: { text: 'Components go in components:{} object' }},
              {li: { text: 'Layout can be array or VDOM object' }}
            ]
          }}
        ]
      }
    }
  ],
  
  code: `// Complete working todo application
const TodoApp = (props, context) => ({
  div: {
    class: 'max-w-md mx-auto p-4',
    children: [
      {h2: {
        class: 'text-2xl font-bold mb-4',
        text: 'Interactive Todo App'
      }},//title
      {div: {
        class: 'flex mb-4',
        children: [
          {input: {
            type: 'text',
            class: 'flex-1 border rounded-l px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500',
            placeholder: 'Add new todo...',
            value: () => context.getState('newTodo', ''),
            oninput: (e) => context.setState('newTodo', e.target.value),
            onkeypress: (e) => {
              if (e.key === 'Enter') {
                const text = context.getState('newTodo', '');
                if (text.trim()) {
                  const todos = context.getState('todos', []);
                  context.setState('todos', [...todos, {
                    id: Date.now(),
                    text: text.trim(),
                    done: false
                  }]);
                  context.setState('newTodo', '');
                }
              }
            }
          }},//input
          {button: {
            class: 'px-4 py-2 bg-blue-500 text-white rounded-r hover:bg-blue-600',
            text: 'Add',
            onclick: () => {
              const text = context.getState('newTodo', '');
              if (text.trim()) {
                const todos = context.getState('todos', []);
                context.setState('todos', [...todos, {
                  id: Date.now(),
                  text: text.trim(), 
                  done: false
                }]);
                context.setState('newTodo', '');
              }
            }
          }}//add-btn
        ]
      }},//input-group
      {div: {
        class: 'space-y-2',
        children: () => {
          const todos = context.getState('todos', []);
          return todos.length ? todos.map(todo => ({
            div: {
              class: 'flex items-center p-2 border rounded hover:bg-gray-50',
              children: [
                {input: {
                  type: 'checkbox',
                  class: 'mr-3',
                  checked: todo.done,
                  onchange: (e) => {
                    const todos = context.getState('todos', []);
                    const updated = todos.map(t => 
                      t.id === todo.id ? {...t, done: e.target.checked} : t
                    );
                    context.setState('todos', updated);
                  }
                }},//checkbox
                {span: {
                  class: todo.done 
                    ? 'flex-1 line-through text-gray-500' 
                    : 'flex-1 text-gray-800',
                  text: todo.text
                }},//text
                {button: {
                  class: 'px-2 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600',
                  text: '×',
                  onclick: () => {
                    const todos = context.getState('todos', []);
                    context.setState('todos', todos.filter(t => t.id !== todo.id));
                  }
                }}//delete
              ]
            }//todo-item
          })) : [{
            p: {
              class: 'text-gray-500 text-center py-8',
              text: 'No todos yet. Add one above!'
            }
          }];
        }
      }}//todo-list
    ]
  }//container
});

// Create demo with proper structure
const demo = new Juris({
  states: {
    todos: [
      { id: 1, text: 'Learn Juris VDOM syntax', done: true },
      { id: 2, text: 'Build a todo app', done: false }
    ],
    newTodo: ''
  },
  components: {
    TodoApp
  },
  layout: [
    {
      div: {
        class: 'min-h-screen bg-gray-100 py-8',
        children: [{ TodoApp: {} }]
      }
    }
  ]
});

// Render to demo container
demo.render('#demo');`,
  
  interactiveExample: (context) => ({
    div: {
      class: 'p-4 border rounded bg-blue-50',
      children: [
        {button: {
          class: 'px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600',
          text: () => `Clicked ${context.getState('demo.clicks', 0)} times`,
          onclick: () => {
            const current = context.getState('demo.clicks', 0);
            context.setState('demo.clicks', current + 1);
          }
        }},//counter-btn
        {p: {
          class: 'mt-2 text-sm text-blue-700',
          text: 'This is a live interactive example!'
        }}//note
      ]
    }//demo-container
  }),
  
  technicalDetails: {
    'State Management': 'Uses reactive state with automatic cleanup',
    'Performance': 'Only re-renders when dependencies change', 
    'VDOM Structure': 'Compact layout with end-bracket comments',
    'Memory': 'Component state cleaned up on unmount'
  },
  
  tags: ['advanced', 'state', 'patterns', 'performance', 'vdom', 'todo']
});
```

## Key Structure Requirements

### Component Registration
Components must be added to the `components` object:

```javascript
const demo = new Juris({
  components: {
    MyComponent,
    AnotherComponent
  },
  // ... other config
});
```

### Layout Options
Layout can be an array of components or VDOM objects:

```javascript
// Array layout
layout: [
  { MyComponent: { prop: 'value' } },
  { div: { text: 'Some content' } }
]

// Object VDOM layout  
layout: {
  div: {
    class: 'container',
    children: [
      { MyComponent: {} },
      { p: { text: 'Footer text' } }
    ]
  }
}
```

### VDOM Style Guidelines

1. **Use 2-space indentation** for compact, readable structure
2. **Add end-bracket comments** for complex nested elements: `}}//elementName`
3. **Keep short attributes inline**, break longer ones to new lines
4. **Use Tailwind CSS classes** for consistent styling
5. **Always render to #demo** for documentation examples

### Interactive Example Function

The `interactiveExample` property accepts a function receiving the Juris context:

```javascript
interactiveExample: (context) => ({
  div: {
    class: 'p-4 border rounded',
    children: [
      {input: {
        type: 'text',
        class: 'border rounded px-2 py-1',
        value: () => context.getState('demo.text', ''),
        oninput: (e) => context.setState('demo.text', e.target.value)
      }},//input
      {p: {
        class: 'mt-2',
        text: () => `You typed: ${context.getState('demo.text', '')}`
      }}//output
    ]
  }//interactive-demo
})
```

## Return Value

Returns the processed document object with additional metadata:

```javascript
{
  id: string,
  title: string,
  category: string,
  // ... all provided properties
  insertionOrder: number  // Auto-assigned for ordering
}
```

## Error Handling

The method throws an error if required properties are missing:

```javascript
// This will throw an error
docFramework.addDoc('invalid', {
  title: 'Missing Category'  // Missing required 'category' and 'content'
});
// Error: Document invalid missing required fields: category, content
```

## Best Practices Summary

### Content Organization
- Use clear, descriptive titles and categories
- Keep content concise but comprehensive  
- Include relevant tags for discoverability
- Add technical details for quick reference

### Code Structure
- Follow compact VDOM layout with 2-space indentation
- Add end-bracket comments for nested elements
- Register components in `components:{}` object
- Always include complete working examples with `demo.render('#demo')`
- Use Tailwind CSS for consistent styling

### Performance
- Avoid overly large code snippets
- Use reactive functions only when needed
- Keep interactive examples focused and lightweight
- Include proper cleanup in component lifecycle

This comprehensive API allows you to create rich, interactive documentation that scales from simple tutorials to complex technical references while maintaining consistent VDOM structure and styling.
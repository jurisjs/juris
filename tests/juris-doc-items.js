
// 1. Your First Juris Component
docFramework.addDoc('first-component', {
    title: 'Your First Juris Component',
    category: 'Getting Started',
    description: 'Create your very first Juris component in 5 minutes.',
    content: 'A Juris component is just a function that returns an object describing what you want to show on the page. Think of it like writing HTML, but with JavaScript objects instead of tags.',
    codeSnippet: `const HelloWorld = () => ({
    div: {
        text: "Hello, World!"
    }
});`,
    code: `const HelloWorld = () => {
    return {
        div: {
            text: "Hello, World!"
        }
    };
};

// Create and render the app
const app = new Juris({
    components: { HelloWorld },
    layout: { HelloWorld: {} }
});

app.render("#demo");`,
    technicalDetails: {
        'Component Function': 'A component is just a JavaScript function that returns an object. The object describes what HTML elements you want to create.',
        'Object Structure': 'Use the HTML tag name as the key (like "div", "p", "button"). The value is another object with properties like "class", "text", and "children".',
        'Registration': 'Add your component to the "components" object when creating your Juris app. Use the same name you gave your function.',
        'Layout': 'The "layout" tells Juris which components to show when the app starts. Use {} for components that don\'t need any special data.',
        'Rendering': 'Call app.render() with a CSS selector (like "#demo") to tell Juris where to put your component on the page.'
    },
    tags: ['beginner', 'first-steps', 'components'],
    
});

// 2. Adding Buttons and Click Events
docFramework.addDoc('buttons-clicks', {
    title: 'Buttons and Click Events',
    category: 'Getting Started',
    description: 'Learn how to add buttons that do something when clicked.',
    content: 'Interactive elements like buttons are easy in Juris. Just add an "onclick" property to your button object.',
    

    codeSnippet: `const ClickButton = () => ({
        button: {
            text: "Click Me",
            onclick: () => alert("Hello!")
        }
    });`,
    
    code: `const ClickDemo = () => {
    return {
        div: {
            class: "p-6 bg-gray-50 rounded-lg text-center space-y-4",
            children: [
                {
                    h2: {
                        class: "text-2xl font-bold text-gray-800 mb-4",
                        text: "Click the Buttons!"
                    }
                },
                {
                    button: {
                        class: "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600",
                        text: "Say Hello",
                        onclick: () => {
                            alert("Hello there!");
                        }
                    }
                },
                {
                    button: {
                        class: "px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 ml-2",
                        text: "Show Time",
                        onclick: () => {
                            alert("The time is: " + new Date().toLocaleTimeString());
                        }
                    }
                },
                {
                    button: {
                        class: "px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 ml-2",
                        text: "Random Number",
                        onclick: () => {
                            const randomNum = Math.floor(Math.random() * 100) + 1;
                            alert("Your random number is: " + randomNum);
                        }
                    }
                }
            ]
        }
    };
};

const app = new Juris({
    components: { ClickDemo },
    layout: { ClickDemo: {} }
});

app.render("#demo");`,
    technicalDetails: {
        'Click Events': 'Add onclick: () => { /* your code */ } to any element to make it clickable. The code inside the function runs when clicked.',
        'Arrow Functions': 'The () => syntax is a modern JavaScript way to write functions. It\'s shorter than writing function() {}.',
        'Alert Boxes': 'alert() shows a popup message. It\'s great for testing, but real apps usually update the page content instead.',
        'Children Array': 'When you want multiple elements inside a container, use "children" with an array of objects.',
        'CSS Classes': 'Tailwind classes like "hover:bg-blue-600" automatically change the button color when you hover over it.'
    },
    tags: ['beginner', 'events', 'buttons', 'interactivity'],
   
});

// 3. Working with Text Input
docFramework.addDoc('text-input', {
    title: 'Text Input and Forms',
    category: 'Getting Started',
    description: 'Get text from users with input fields and forms.',
    content: 'Input fields let users type text into your app. You can read what they typed and use it in your code.',
    code: `const GreetingForm = () => {
    return {
        div: {
            class: "p-6 bg-white rounded-lg shadow-md max-w-md mx-auto",
            children: [
                {
                    h2: {
                        class: "text-xl font-bold text-gray-800 mb-4",
                        text: "What's Your Name?"
                    }
                },
                {
                    input: {
                        type: "text",
                        placeholder: "Enter your name here...",
                        class: "w-full p-2 border border-gray-300 rounded mb-4 focus:border-blue-500 focus:outline-none",
                        id: "nameInput"
                    }
                },
                {
                    button: {
                        class: "w-full py-2 bg-blue-500 text-white rounded hover:bg-blue-600",
                        text: "Greet Me!",
                        onclick: () => {
                            // Get the text from the input field
                            const nameInput = document.getElementById('nameInput');
                            const userName = nameInput.value;
                            
                            if (userName.trim() === '') {
                                alert('Please enter your name first!');
                            } else {
                                alert('Hello, ' + userName + '! Nice to meet you!');
                            }
                        }
                    }
                },
                {
                    div: {
                        class: "mt-4 p-3 bg-gray-100 rounded text-sm text-gray-600",
                        children: [
                            {
                                p: {
                                    text: "💡 Tip: Try typing your name and clicking the button!"
                                }
                            }
                        ]
                    }
                }
            ]
        }
    };
};

const app = new Juris({
    components: { GreetingForm },
    layout: { GreetingForm: {} }
});

app.render("#demo");`,
    technicalDetails: {
        'Input Elements': 'Use type: "text" for text input, type: "email" for email, type: "number" for numbers, etc.',
        'Placeholder Text': 'The placeholder shows gray text inside the input to hint what users should type.',
        'Getting Input Values': 'Use document.getElementById() to find your input, then .value to get what the user typed.',
        'ID Attribute': 'Give your input an id so you can find it later with JavaScript.',
        'Input Validation': 'Always check if the input is empty with .trim() === \'\' before using it.'
    },
    tags: ['beginner', 'forms', 'input', 'user-data'],
    
});

// 4. Making Things Change (Basic State)
docFramework.addDoc('basic-state', {
    title: 'Making Things Change on the Page',
    category: 'Getting Started',
    description: 'Learn how to make your page update when things happen.',
    content: 'Sometimes you want text or other content to change when users interact with your app. Juris makes this easy with "state" - think of it as the app\'s memory.',
    code: `const CounterApp = (props, context) => {
    // Create a piece of memory to store a number
    const [getCount, setCount] = context.newState('count', 0);
    
    return {
        div: {
            class: "p-6 bg-gradient-to-b from-blue-50 to-blue-100 rounded-lg text-center max-w-sm mx-auto",
            children: [
                {
                    h2: {
                        class: "text-2xl font-bold text-blue-800 mb-4",
                        text: "Simple Counter"
                    }
                },
                {
                    div: {
                        class: "text-6xl font-bold text-blue-600 mb-6",
                        // This text changes automatically when count changes!
                        text: () => getCount()
                    }
                },
                {
                    div: {
                        class: "space-x-2",
                        children: [
                            {
                                button: {
                                    class: "px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600",
                                    text: "Add 1",
                                    onclick: () => {
                                        const currentCount = getCount();
                                        setCount(currentCount + 1);
                                    }
                                }
                            },
                            {
                                button: {
                                    class: "px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600",
                                    text: "Subtract 1",
                                    onclick: () => {
                                        const currentCount = getCount();
                                        setCount(currentCount - 1);
                                    }
                                }
                            },
                            {
                                button: {
                                    class: "px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600",
                                    text: "Reset",
                                    onclick: () => {
                                        setCount(0);
                                    }
                                }
                            }
                        ]
                    }
                },
                {
                    p: {
                        class: "mt-4 text-sm text-gray-600",
                        text: () => {
                            const count = getCount();
                            if (count === 0) return "Starting fresh!";
                            if (count > 0) return \`You're up by \${count}!\`;
                            return \`You're down by \${Math.abs(count)}!\`;
                        }
                    }
                }
            ]
        }
    };
};

const app = new Juris({
    components: { CounterApp },
    layout: { CounterApp: {} }
});

app.render("#demo");`,
    technicalDetails: {
        'State Creation': 'context.newState("name", startingValue) creates a piece of memory. It returns two functions: one to read the value, one to change it.',
        'Getter Function': 'The first returned function (getCount) reads the current value. Call it like getCount() to get the number.',
        'Setter Function': 'The second returned function (setCount) changes the value. Call it like setCount(newValue) to update.',
        'Reactive Text': 'When you use text: () => getCount(), the text automatically updates when the state changes. The () => makes it "reactive".',
        'Context Parameter': 'Your component function needs (props, context) parameters to access newState. This is how Juris gives you state powers.'
    },
    tags: ['beginner', 'state', 'reactivity', 'counter'],
    
});

// 5. Showing and Hiding Things
docFramework.addDoc('show-hide', {
    title: 'Showing and Hiding Things',
    category: 'Getting Started',  
    description: 'Learn how to show or hide parts of your page based on conditions.',
    content: 'Sometimes you only want to show certain content when something is true. Like showing a "Welcome back!" message only when someone is logged in.',
    code: `const ShowHideDemo = (props, context) => {
    const [getIsVisible, setIsVisible] = context.newState('isVisible', false);
    const [getName, setName] = context.newState('name', '');
    
    return {
        div: {
            class: "p-6 bg-white rounded-lg shadow-md max-w-md mx-auto space-y-4",
            children: [
                {
                    h2: {
                        class: "text-xl font-bold text-gray-800",
                        text: "Show/Hide Demo"
                    }
                },
                
                // Toggle button
                {
                    button: {
                        class: () => \`px-4 py-2 rounded text-white \${
                            getIsVisible() 
                                ? 'bg-red-500 hover:bg-red-600' 
                                : 'bg-green-500 hover:bg-green-600'
                        }\`,
                        text: () => getIsVisible() ? 'Hide Message' : 'Show Message',
                        onclick: () => setIsVisible(!getIsVisible())
                    }
                },
                
                // Conditional content - only shows when isVisible is true
                () => {
                    if (getIsVisible()) {
                        return {
                            div: {
                                class: "p-4 bg-blue-100 border-l-4 border-blue-500 rounded",
                                children: [
                                    {
                                        p: {
                                            class: "text-blue-800 font-medium",
                                            text: "🎉 Surprise! You can see this message now!"
                                        }
                                    },
                                    {
                                        p: {
                                            class: "text-blue-600 text-sm mt-1",
                                            text: "This content appears and disappears based on the button above."
                                        }
                                    }
                                ]
                            }
                        };
                    }
                    return null; // Return null to show nothing
                },
                
                // Name input section
                {
                    div: {
                        class: "border-t pt-4",
                        children: [
                            {
                                label: {
                                    class: "block text-sm font-medium text-gray-700 mb-1",
                                    text: "Enter your name:"
                                }
                            },
                            {
                                input: {
                                    type: "text",
                                    class: "w-full p-2 border border-gray-300 rounded focus:border-blue-500 focus:outline-none",
                                    value: () => getName(),
                                    oninput: (e) => setName(e.target.value),
                                    placeholder: "Type your name..."
                                }
                            }
                        ]
                    }
                },
                
                // Conditional greeting - only shows when name is not empty
                () => {
                    const name = getName().trim();
                    if (name) {
                        return {
                            div: {
                                class: "p-3 bg-green-100 border border-green-300 rounded",
                                children: [
                                    {
                                        p: {
                                            class: "text-green-800 font-medium",
                                            text: \`Hello, \${name}! 👋\`
                                        }
                                    }
                                ]
                            }
                        };
                    }
                    return null;
                }
            ]
        }
    };
};

const app = new Juris({
    components: { ShowHideDemo },
    layout: { ShowHideDemo: {} }
});

app.render("#demo");`,
    technicalDetails: {
        'Conditional Rendering': 'Use () => { if (condition) return element; return null; } to show things conditionally. Return null to show nothing.',
        'Boolean State': 'Store true/false values in state to control visibility. Use !getIsVisible() to flip between true and false.',
        'Dynamic Classes': 'Use template strings with \${} to change CSS classes based on state. This lets you style things differently based on conditions.',
        'Input Binding': 'Use value: () => getName() and oninput: (e) => setName(e.target.value) to connect input fields to state.',
        'String Methods': 'Use .trim() to remove spaces from the beginning and end of text. Check if text exists with if (name) before showing it.'
    },
    tags: ['beginner', 'conditional', 'visibility', 'dynamic-content'],
    
});

// 6. Making Lists of Things
docFramework.addDoc('simple-lists', {
    title: 'Making Lists of Things',
    category: 'Getting Started',
    description: 'Learn how to show lists of items like shopping lists or todo lists.',
    content: 'Most apps need to show lists of things - like a list of friends, products to buy, or tasks to complete. Juris makes this easy with JavaScript arrays.',
    code: `const SimpleList = (props, context) => {
    // Start with some example items
    const [getItems, setItems] = context.newState('items', [
        'Buy groceries',
        'Walk the dog', 
        'Learn Juris',
        'Make dinner'
    ]);
    
    const [getNewItem, setNewItem] = context.newState('newItem', '');
    
    const addItem = () => {
        const item = getNewItem().trim();
        if (item) {
            const currentItems = getItems();
            setItems([...currentItems, item]); // Add new item to the end
            setNewItem(''); // Clear the input
        }
    };
    
    const removeItem = (indexToRemove) => {
        const currentItems = getItems();
        const newItems = currentItems.filter((item, index) => index !== indexToRemove);
        setItems(newItems);
    };
    
    return {
        div: {
            class: "p-6 bg-white rounded-lg shadow-md max-w-md mx-auto",
            children: [
                {
                    h2: {
                        class: "text-xl font-bold text-gray-800 mb-4",
                        text: "My Todo List"
                    }
                },
                
                // Add new item section
                {
                    div: {
                        class: "flex space-x-2 mb-4",
                        children: [
                            {
                                input: {
                                    type: "text",
                                    class: "flex-1 p-2 border border-gray-300 rounded focus:border-blue-500 focus:outline-none",
                                    placeholder: "Add new task...",
                                    value: () => getNewItem(),
                                    oninput: (e) => setNewItem(e.target.value),
                                    onkeypress: (e) => {
                                        if (e.key === 'Enter') {
                                            addItem();
                                        }
                                    }
                                }
                            },
                            {
                                button: {
                                    class: "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600",
                                    text: "Add",
                                    onclick: addItem
                                }
                            }
                        ]
                    }
                },
                
                // The list of items
                {
                    div: {
                        class: "space-y-2",
                        children: () => {
                            const items = getItems();
                            
                            if (items.length === 0) {
                                return [{
                                    div: {
                                        class: "text-center text-gray-500 py-8",
                                        text: "No tasks yet! Add one above. 📝"
                                    }
                                }];
                            }
                            
                            return items.map((item, index) => ({
                                div: {
                                    class: "flex justify-between items-center p-3 bg-gray-50 rounded border",
                                    children: [
                                        {
                                            span: {
                                                class: "flex-1 text-gray-800",
                                                text: item
                                            }
                                        },
                                        {
                                            button: {
                                                class: "px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600",
                                                text: "Done",
                                                onclick: () => removeItem(index)
                                            }
                                        }
                                    ]
                                }
                            }));
                        }
                    }
                },
                
                // Show count
                {
                    div: {
                        class: "mt-4 pt-4 border-t text-center text-sm text-gray-600",
                        children: [
                            {
                                p: {
                                    text: () => {
                                        const count = getItems().length;
                                        return count === 0 ? "No tasks" :
                                               count === 1 ? "1 task remaining" :
                                               \`\${count} tasks remaining\`;
                                    }
                                }
                            }
                        ]
                    }
                }
            ]
        }
    };
};

const app = new Juris({
    components: { SimpleList },
    layout: { SimpleList: {} }
});

app.render("#demo");`,
    technicalDetails: {
        'Array State': 'Store lists in state using arrays like ["item1", "item2"]. Use getItems() to read the array and setItems() to change it.',
        'Adding Items': 'Use [...currentItems, newItem] to add items. The ... spreads the old items and adds the new one at the end.',
        'Removing Items': 'Use .filter((item, index) => index !== indexToRemove) to remove items by their position in the array.',
        'Mapping Arrays': 'Use .map() to turn each item in your array into a component. The index parameter tells you which item number it is.',
        'Enter Key Detection': 'Use onkeypress: (e) => { if (e.key === "Enter") { /* do something */ } } to detect when users press Enter.'
    },
    tags: ['beginner', 'lists', 'arrays', 'todo', 'crud'],
    
});

// Export for use in documentation framework
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { docSnippets: 'Generated documentation snippets ready for integration' };
}


docFramework.addDoc('dynamic-styling', {
    title: 'Dynamic Styling with Tailwind',
    category: 'UI Patterns',
    description: 'Learn how to create dynamic, interactive styling that responds to user actions and state changes.',
    content: 'Dynamic styling allows your components to change appearance based on user interactions, state, or conditions. This creates engaging, responsive interfaces that feel alive and interactive. You can combine Tailwind utility classes with reactive functions to achieve powerful styling effects.',
    
    // Copy-able code snippet for display in documentation
    codeSnippet: `const HelloWorld = () => ({
    div: {text: "Hello!", class: "bg-blue-500 hover:bg-blue-600" }
});`,

    technicalDetails: {
        'Dynamic Classes': 'Use template literals with ${} to insert state values into class strings. This allows classes to change based on component state.',
        'Tailwind Utilities': 'Combine multiple utility classes like hover:, focus:, and responsive prefixes for complex styling behaviors.',
        'State-Driven Styling': 'Store style-related state (theme, size, active state) and use it to conditionally apply different class combinations.',
        'Transition Classes': 'Use transition-* utilities for smooth animations between state changes. duration-* controls animation speed.',
        'Conditional Logic': 'Use ternary operators or object lookups to select different class combinations based on state values.'
    },
    
    tags: ['styling', 'tailwind', 'dynamic', 'interactive', 'state'],
    code: `const DynamicButton = (props, context) => {
    const [getTheme, setTheme] = context.newState('theme', 'blue');
    const [getIsActive, setIsActive] = context.newState('isActive', false);
    
    const themes = {
        blue: 'bg-blue-500 hover:bg-blue-600',
        green: 'bg-green-500 hover:bg-green-600',
        red: 'bg-red-500 hover:bg-red-600'
    };
    
    return {
        div: {
            class: "p-4 space-y-4",
            children: [
                {
                    select: {
                        class: "p-2 border border-gray-300 rounded",
                        value: () => getTheme(),
                        onchange: (e) => setTheme(e.target.value),
                        children: Object.keys(themes).map(theme => ({
                            option: { value: theme, text: theme.charAt(0).toUpperCase() + theme.slice(1) }
                        }))
                    }
                },
                {
                    button: {
                        class: () => \`\${themes[getTheme()]} px-6 py-3 text-white rounded-lg font-medium transition-all duration-200 transform \${
                            getIsActive() ? 'scale-95 shadow-lg' : 'hover:scale-105 shadow-md'
                        }\`,
                        text: () => getIsActive() ? 'Active!' : 'Click Me',
                        onclick: () => setIsActive(!getIsActive())
                    }
                }
            ]
        }
    };
};

const app = new Juris({
    components: { DynamicButton },
    layout: { DynamicButton: {} }
});

app.render("#demo");`
});

// ===== ARM() API DOCUMENTATION =====

// 1. Basic arm() API Introduction
docFramework.addDoc('arm-api-basics', {
    title: 'arm() API - Advanced Event Handling',
    category: 'Event Management',
    description: 'Master the arm() API for sophisticated event handling with full Juris context access on any DOM target.',
    content: 'The arm() API provides a powerful way to attach event handlers to any DOM element, window, or document with complete access to Juris state management, services, and reactive capabilities. Unlike traditional addEventListener, arm() gives you the full Juris context including state management, services, and component APIs.',
    
    codeSnippet: `juris.arm(document, (context) => ({
    onclick: (e) => context.setState('clicked', true),
    onkeydown: (e) => console.log('Key pressed:', e.key)
}));`,

    technicalDetails: {
        'Context Access': 'Every handler receives full Juris context including state management, services, and component APIs',
        'Event Normalization': 'Supports both onclick and on-click syntax, automatically normalizes to standard events',
        'Cleanup Management': 'Returns instance with cleanup() method to remove all listeners and prevent memory leaks',
        'Trigger Method': 'Instance provides trigger() to programmatically fire events for testing',
        'Target Flexibility': 'Works on any DOM element, window, document, or custom objects'
    },
    
    tags: ['events', 'context', 'handlers', 'cleanup', 'api'],
    code: `// Basic usage - arm a button with reactive handlers
// Example: Global document events with context
const docArmed = juris.arm(document, (context) => ({
    onkeydown: (e) => {
        if (e.key === 'Escape') {
            context.setState('modal.open', false);
            context.setState('sidebar.open', false);
        }
    },
    
    onvisibilitychange: (e) => {
        const isHidden = document.hidden;
        context.setState('app.visibility', isHidden ? 'hidden' : 'visible');
        
        if (isHidden) {
            context.services.api?.pausePolling();
        } else {
            context.services.api?.resumePolling();
        }
    }
}));

// Window events for app-wide state management
const windowArmed = juris.arm(window, (context) => ({
    onresize: (e) => {
        context.setState('viewport.width', window.innerWidth);
        context.setState('viewport.height', window.innerHeight);
    },
    
    onbeforeunload: (e) => {
        // Save important state before leaving
        const unsavedData = context.getState('editor.unsavedChanges');
        if (unsavedData) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes';
        }
    },
    
    onfocus: (e) => {
        context.setState('app.focused', true);
    },
    
    onblur: (e) => {
        context.setState('app.focused', false);
    }
}));`
});

// 2. Advanced Patterns and Use Cases
docFramework.addDoc('arm-api-patterns', {
    title: 'arm() API - Advanced Patterns',
    category: 'Event Management',
    description: 'Advanced patterns and techniques for using the arm() API in complex applications.',
    content: 'Learn advanced patterns for the arm() API including event delegation, keyboard shortcuts, gesture handling, and integration with reactive state management for sophisticated user interactions.',
    
    codeSnippet: `// Keyboard shortcut system
juris.arm(document, (context) => ({
    onkeydown: (e) => shortcuts.handle(e, context)
}));`,

    technicalDetails: {
        'Event Delegation': 'Use event bubbling to handle events for dynamic child elements efficiently',
        'Keyboard Shortcuts': 'Create complex keyboard shortcut systems with modifier key combinations',
        'Gesture Recognition': 'Implement custom gestures like swipe, pinch, and long-press',
        'State Integration': 'Seamlessly integrate with reactive state for complex interaction patterns',
        'Conditional Handlers': 'Use context state to conditionally enable/disable certain event responses'
    },
    
    tags: ['advanced', 'patterns', 'shortcuts', 'gestures', 'delegation'],
    code: `// Advanced Pattern 1: Keyboard Shortcut System
const createShortcutSystem = (juris) => {
    const shortcuts = new Map();
    
    const addShortcut = (keys, action, description) => {
        const keyCombo = keys.toLowerCase().replace(/\s+/g, '');
        shortcuts.set(keyCombo, { action, description, keys });
    };
    
    const handleKeydown = (e, context) => {
        const combo = [
            e.ctrlKey && 'ctrl',
            e.altKey && 'alt', 
            e.shiftKey && 'shift',
            e.metaKey && 'meta',
            e.key.toLowerCase()
        ].filter(Boolean).join('+');
        
        const shortcut = shortcuts.get(combo);
        if (shortcut) {
            e.preventDefault();
            shortcut.action(context, e);
        }
    };
    
    // Register shortcuts
    addShortcut('Ctrl+S', (context) => {
        context.setState('document.saving', true);
        context.services.api.saveDocument()
            .finally(() => context.setState('document.saving', false));
    }, 'Save document');
    
    addShortcut('Ctrl+Shift+P', (context) => {
        context.setState('commandPalette.open', true);
    }, 'Open command palette');
    
    addShortcut('Escape', (context) => {
        // Close any open modals/overlays
        context.setState('modal.open', false);
        context.setState('dropdown.open', false);
        context.setState('commandPalette.open', false);
    }, 'Close overlays');
    
    // Arm the document
    const armed = juris.arm(document, (context) => ({
        onkeydown: (e) => handleKeydown(e, context)
    }));
    
    return { addShortcut, shortcuts, cleanup: () => armed.cleanup() };
};

// Advanced Pattern 2: Event Delegation for Dynamic Content
const createEventDelegation = (juris) => {
    return juris.arm(document, (context) => ({
        onclick: (e) => {
            // Handle button clicks anywhere in document
            if (e.target.matches('[data-action]')) {
                const action = e.target.dataset.action;
                const id = e.target.dataset.id;
                
                switch(action) {
                    case 'delete-item':
                        context.setState(\`items.\${id}.deleted\`, true);
                        break;
                    case 'toggle-favorite':
                        const current = context.getState(\`items.\${id}.favorite\`, false);
                        context.setState(\`items.\${id}.favorite\`, !current);
                        break;
                    case 'open-modal':
                        context.setState('modal.open', true);
                        context.setState('modal.itemId', id);
                        break;
                }
            }
            
            // Handle tab navigation
            if (e.target.matches('[data-tab]')) {
                const tabId = e.target.dataset.tab;
                context.setState('activeTab', tabId);
                
                // Update URL without page reload
                const url = new URL(window.location);
                url.searchParams.set('tab', tabId);
                window.history.pushState({}, '', url);
            }
        },
        
        oninput: (e) => {
            // Handle all form inputs with data-model attribute
            if (e.target.matches('[data-model]')) {
                const path = e.target.dataset.model;
                const value = e.target.type === 'checkbox' ? 
                    e.target.checked : e.target.value;
                context.setState(path, value);
            }
        }
    }));
};

// Advanced Pattern 3: Touch Gesture Recognition
const createGestureSystem = (juris) => {
    let touchState = {
        startX: 0, startY: 0, startTime: 0,
        isLongPress: false, longPressTimer: null
    };
    
    return juris.arm(document, (context) => ({
        ontouchstart: (e) => {
            const touch = e.touches[0];
            touchState.startX = touch.clientX;
            touchState.startY = touch.clientY;
            touchState.startTime = Date.now();
            touchState.isLongPress = false;
            
            // Start long press detection
            touchState.longPressTimer = setTimeout(() => {
                touchState.isLongPress = true;
                context.setState('gesture.longPress', {
                    x: touchState.startX,
                    y: touchState.startY,
                    target: e.target
                });
            }, 500);
        },
        
        ontouchmove: (e) => {
            const touch = e.touches[0];
            const deltaX = touch.clientX - touchState.startX;
            const deltaY = touch.clientY - touchState.startY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            // Cancel long press if moved too much
            if (distance > 10 && touchState.longPressTimer) {
                clearTimeout(touchState.longPressTimer);
                touchState.longPressTimer = null;
            }
            
            // Update swipe state
            if (distance > 20) {
                context.setState('gesture.swipe', {
                    deltaX, deltaY, distance,
                    direction: Math.abs(deltaX) > Math.abs(deltaY) ?
                        (deltaX > 0 ? 'right' : 'left') :
                        (deltaY > 0 ? 'down' : 'up')
                });
            }
        },
        
        ontouchend: (e) => {
            const duration = Date.now() - touchState.startTime;
            const touch = e.changedTouches[0];
            const deltaX = touch.clientX - touchState.startX;
            const deltaY = touch.clientY - touchState.startY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            if (touchState.longPressTimer) {
                clearTimeout(touchState.longPressTimer);
            }
            
            // Detect swipe gestures
            if (distance > 50 && duration < 500) {
                const direction = Math.abs(deltaX) > Math.abs(deltaY) ?
                    (deltaX > 0 ? 'right' : 'left') :
                    (deltaY > 0 ? 'down' : 'up');
                    
                context.setState('gesture.completed', {
                    type: 'swipe',
                    direction,
                    distance,
                    duration
                });
            }
            
            // Clear gesture state
            setTimeout(() => {
                context.setState('gesture.longPress', null);
                context.setState('gesture.swipe', null);
            }, 100);
        }
    }));
};

// Usage examples
const app = new Juris({
    states: {
        clickCount: 0,
        modal: { open: false },
        activeTab: 'home',
        gesture: {}
    },
    layout: { div: { text: 'arm() API Demo' } }
});

// Initialize systems
const shortcuts = createShortcutSystem(app);
const delegation = createEventDelegation(app);
const gestures = createGestureSystem(app);

// Cleanup when app destroys
// shortcuts.cleanup();
// delegation.cleanup();
// gestures.cleanup();`
});

// 3. Testing and Debugging with arm() API
docFramework.addDoc('arm-api-testing', {
    title: 'Testing arm() API Handlers',
    category: 'Event Management',
    description: 'Learn how to test and debug event handlers created with the arm() API effectively.',
    content: 'The arm() API returns instances with testing capabilities including programmatic event triggering and introspection. This makes it easy to test complex event handling logic without manual user interaction.',
    
    codeSnippet: `const armed = juris.arm(element, handlers);
armed.trigger('onclick', { ctrlKey: true });
console.log(armed.events); // Inspect registered events`,

    technicalDetails: {
        'Trigger Method': 'Programmatically fire events with custom event data for testing',
        'Event Introspection': 'Inspect registered events and their handlers through the events property',
        'Mock Event Objects': 'Create realistic mock events with preventDefault and stopPropagation',
        'State Verification': 'Use state inspection to verify handler effects in tests',
        'Cleanup Testing': 'Verify proper cleanup prevents memory leaks'
    },
    
    tags: ['testing', 'debugging', 'trigger', 'mock', 'introspection'],
    code: `// Testing arm() API handlers
const createTestSuite = (juris) => {
    const element = document.createElement('button');
    
    // Create armed element with testable handlers
    const armed = juris.arm(element, (context) => ({
        onclick: (e) => {
            const count = context.getState('testCount', 0);
            context.setState('testCount', count + 1);
            
            if (e.ctrlKey) {
                context.setState('ctrlClicked', true);
            }
            
            console.log('Button clicked!', { count: count + 1 });
        },
        
        onmouseenter: (e) => {
            context.setState('hovered', true);
        },
        
        onmouseleave: (e) => {
            context.setState('hovered', false);
        },
        
        onkeydown: (e) => {
            if (e.key === 'Enter') {
                context.setState('enterPressed', true);
            }
        }
    }));
    
    // Test suite functions
    const tests = {
        // Test 1: Basic event triggering
        testBasicClick() {
            console.log('Testing basic click...');
            const initialCount = juris.getState('testCount', 0);
            
            // Trigger click event
            const success = armed.trigger('onclick');
            
            const newCount = juris.getState('testCount', 0);
            console.assert(success, 'Click event should trigger successfully');
            console.assert(newCount === initialCount + 1, 'Count should increment');
            console.log('✓ Basic click test passed');
        },
        
        // Test 2: Event with modifiers
        testCtrlClick() {
            console.log('Testing ctrl+click...');
            
            armed.trigger('onclick', { ctrlKey: true });
            
            const ctrlClicked = juris.getState('ctrlClicked', false);
            console.assert(ctrlClicked, 'Ctrl key should be detected');
            console.log('✓ Ctrl+click test passed');
        },
        
        // Test 3: Keyboard events
        testKeyboardInput() {
            console.log('Testing keyboard input...');
            
            armed.trigger('onkeydown', { key: 'Enter' });
            
            const enterPressed = juris.getState('enterPressed', false);
            console.assert(enterPressed, 'Enter key should be detected');
            console.log('✓ Keyboard test passed');
        },
        
        // Test 4: Event introspection
        testEventIntrospection() {
            console.log('Testing event introspection...');
            
            console.log('Registered events:', armed.events);
            
            const hasClick = armed.events.some(e => e.name === 'onclick');
            const hasMouseEnter = armed.events.some(e => e.actualEvent === 'mouseenter');
            
            console.assert(hasClick, 'Should have click handler');
            console.assert(hasMouseEnter, 'Should have mouseenter handler');
            console.log('✓ Introspection test passed');
        },
        
        // Test 5: Cleanup testing
        testCleanup() {
            console.log('Testing cleanup...');
            
            const eventCountBefore = armed.events.length;
            console.assert(eventCountBefore > 0, 'Should have events before cleanup');
            
            const cleanupResult = armed.cleanup();
            console.assert(cleanupResult, 'Cleanup should return true');
            
            // Try to trigger after cleanup (should fail)
            const triggerSuccess = armed.trigger('onclick');
            console.assert(!triggerSuccess, 'Events should not trigger after cleanup');
            
            console.log('✓ Cleanup test passed');
        },
        
        // Test 6: Error handling
        testErrorHandling() {
            console.log('Testing error handling...');
            
            // Create armed element with error-prone handler
            const errorElement = document.createElement('div');
            const errorArmed = juris.arm(errorElement, (context) => ({
                onclick: (e) => {
                    if (e.shouldError) {
                        throw new Error('Test error');
                    }
                    context.setState('errorTest', 'success');
                }
            }));
            
            // Test normal operation
            errorArmed.trigger('onclick');
            console.assert(juris.getState('errorTest') === 'success', 'Normal operation should work');
            
            // Test error condition
            try {
                errorArmed.trigger('onclick', { shouldError: true });
            } catch (error) {
                console.log('Expected error caught:', error.message);
            }
            
            errorArmed.cleanup();
            console.log('✓ Error handling test passed');
        }
    };
    
    // Run all tests
    const runAllTests = () => {
        console.log('🧪 Running arm() API test suite...\n');
        
        // Reset state before testing
        juris.setState('testCount', 0);
        juris.setState('ctrlClicked', false);
        juris.setState('enterPressed', false);
        juris.setState('hovered', false);
        
        Object.values(tests).forEach(test => {
            try {
                test();
            } catch (error) {
                console.error('❌ Test failed:', error);
            }
        });
        
        console.log('\n✅ Test suite completed!');
    };
    
    return { tests, runAllTests, armed };
};

// Usage example
const app = new Juris({
    states: {
        testCount: 0,
        ctrlClicked: false,
        enterPressed: false,
        hovered: false,
        errorTest: null
    }
});

// Create and run test suite
const testSuite = createTestSuite(app);
// testSuite.runAllTests();

// Interactive debugging helper
const createDebugHelper = (juris) => {
    return {
        inspectArmedElement(element) {
            const armedData = juris.armedElements.get(element);
            if (armedData) {
                console.log('Armed element data:', {
                    listeners: armedData.listeners,
                    context: Object.keys(armedData.context),
                    instance: armedData.instance
                });
                return armedData;
            } else {
                console.log('Element is not armed');
                return null;
            }
        },
        
        listAllArmedElements() {
            console.log('All armed elements:', Array.from(juris.armedElements.keys()));
            return juris.armedElements;
        },
        
        triggerGlobalEvent(eventName, eventData = {}) {
            // Find all elements with this event and trigger them
            let triggered = 0;
            juris.armedElements.forEach((data, element) => {
                if (data.instance.trigger(eventName, eventData)) {
                    triggered++;
                }
            });
            console.log(\`Triggered \${eventName} on \${triggered} elements\`);
            return triggered;
        }
    };
};

const debugHelper = createDebugHelper(app);
// debugHelper.listAllArmedElements();`
});

// 4. arm() API Integration Patterns
docFramework.addDoc('arm-api-integration', {
    title: 'arm() API Integration Patterns',
    category: 'Event Management',
    description: 'Integration patterns for using arm() API with components, services, and external libraries.',
    content: 'Learn how to integrate the arm() API with Juris components, external services, third-party libraries, and complex application architectures for maximum effectiveness.',
    
    codeSnippet: `// Component integration
const MyComponent = (props, context) => {
    const element = document.createElement('div');
    context.services.armed = juris.arm(element, handlers);
    return element;
};`,

    technicalDetails: {
        'Component Integration': 'Use arm() within component lifecycle hooks for element-specific event handling',
        'Service Integration': 'Connect arm() handlers to application services and APIs',
        'Library Integration': 'Bridge arm() events with third-party libraries and frameworks',
        'Context Sharing': 'Share context between arm() handlers and component state',
        'Cleanup Coordination': 'Coordinate cleanup between components and armed elements'
    },
    
    tags: ['integration', 'components', 'services', 'libraries', 'patterns'],
    code: `// Integration Pattern 1: Component + arm() API
const createInteractiveComponent = (juris) => {
    const InteractiveCard = (props, context) => {
        const [getId] = context.newState('id', props.id || Date.now());
        const [getDragging, setDragging] = context.newState('dragging', false);
        const [getPosition, setPosition] = context.newState('position', { x: 0, y: 0 });
        
        return {
            div: {
                class: () => \`card p-4 border rounded-lg cursor-move transition-transform \${
                    getDragging() ? 'scale-105 shadow-lg' : 'shadow-md'
                }\`,
                style: () => ({
                    transform: \`translate(\${getPosition().x}px, \${getPosition().y}px)\`
                }),
                text: props.title || 'Interactive Card',
                
                // Use arm() for complex drag behavior
                ref: (element) => {
                    if (!element._armed) {
                        element._armed = juris.arm(element, (armContext) => {
                            let dragStart = { x: 0, y: 0 };
                            let elementStart = { x: 0, y: 0 };
                            
                            return {
                                onmousedown: (e) => {
                                    setDragging(true);
                                    dragStart = { x: e.clientX, y: e.clientY };
                                    elementStart = getPosition();
                                    
                                    // Global mouse events during drag
                                    const globalArmed = juris.arm(document, (globalContext) => ({
                                        onmousemove: (e) => {
                                            if (getDragging()) {
                                                const newPos = {
                                                    x: elementStart.x + (e.clientX - dragStart.x),
                                                    y: elementStart.y + (e.clientY - dragStart.y)
                                                };
                                                setPosition(newPos);
                                            }
                                        },
                                        
                                        onmouseup: (e) => {
                                            setDragging(false);
                                            globalArmed.cleanup(); // Clean up global listeners
                                            
                                            // Save position to persistent storage
                                            armContext.services.storage?.save(\`card-\${getId()}-position\`, getPosition());
                                        }
                                    }));
                                },
                                
                                ondblclick: (e) => {
                                    // Reset position on double-click
                                    setPosition({ x: 0, y: 0 });
                                    armContext.services.storage?.remove(\`card-\${getId()}-position\`);
                                }
                            };
                        });
                        
                        // Load saved position
                        const savedPos = context.services.storage?.load(\`card-\${getId()}-position\`);
                        if (savedPos) {
                            setPosition(savedPos);
                        }
                    }
                }
            }
        };
    };
    
    return InteractiveCard;
};

// Integration Pattern 2: Service-Connected arm() Handlers
const createServiceIntegration = (juris) => {
    // Example service for API communication
    const apiService = {
        async saveData(data) {
            console.log('Saving data:', data);
            return fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        },
        
        async loadData(id) {
            console.log('Loading data for:', id);
            const response = await fetch(\`/api/load/\${id}\`);
            return response.json();
        }
    };
    
    // Form with auto-save functionality
    const createAutoSaveForm = (formElement) => {
        return juris.arm(formElement, (context) => {
            let saveTimeout;
            const formData = new Map();
            
            return {
                oninput: async (e) => {
                    if (e.target.matches('[data-field]')) {
                        const fieldName = e.target.dataset.field;
                        const value = e.target.value;
                        formData.set(fieldName, value);
                        
                        // Update reactive state
                        context.setState(\`form.\${fieldName}\`, value);
                        context.setState('form.modified', true);
                        
                        // Debounced auto-save
                        clearTimeout(saveTimeout);
                        saveTimeout = setTimeout(async () => {
                            try {
                                context.setState('form.saving', true);
                                await apiService.saveData(Object.fromEntries(formData));
                                context.setState('form.lastSaved', new Date().toISOString());
                                context.setState('form.modified', false);
                            } catch (error) {
                                context.setState('form.error', error.message);
                            } finally {
                                context.setState('form.saving', false);
                            }
                        }, 1000);
                    }
                },
                
                onsubmit: async (e) => {
                    e.preventDefault();
                    
                    try {
                        context.setState('form.submitting', true);
                        await apiService.saveData(Object.fromEntries(formData));
                        context.setState('form.submitted', true);
                        context.setState('form.modified', false);
                    } catch (error) {
                        context.setState('form.error', error.message);
                    } finally {
                        context.setState('form.submitting', false);
                    }
                }
            };
        });
    };
    
    return { createAutoSaveForm, apiService };
};

// Integration Pattern 3: Third-party Library Integration
const createLibraryIntegration = (juris) => {
    // Example: Integrating with a chart library
    const createChartComponent = (chartLibrary) => {
        const ChartComponent = (props, context) => {
            let chart = null;
            
            return {
                div: {
                    class: 'chart-container',
                    ref: (element) => {
                        if (!chart) {
                            // Initialize chart
                            chart = new chartLibrary.Chart(element, props.config);
                            
                            // Arm element for chart interactions
                            const armed = juris.arm(element, (armContext) => ({
                                onclick: (e) => {
                                    // Get clicked chart element
                                    const points = chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
                                    if (points.length > 0) {
                                        const point = points[0];
                                        const datasetIndex = point.datasetIndex;
                                        const index = point.index;
                                        const value = chart.data.datasets[datasetIndex].data[index];
                                        
                                        // Update reactive state
                                        armContext.setState('chart.selectedPoint', {
                                            datasetIndex,
                                            index,
                                            value,
                                            label: chart.data.labels[index]
                                        });
                                    }
                                },
                                
                                onmousemove: (e) => {
                                    // Custom hover effects
                                    const points = chart.getElementsAtEventForMode(e, 'nearest', { intersect: false }, false);
                                    armContext.setState('chart.hoverPoint', points[0] || null);
                                }
                            }));
                            
                            // Listen to state changes to update chart
                            context.subscribe('chartData', (newData) => {
                                chart.data = newData;
                                chart.update();
                            });
                            
                            // Cleanup when element is removed
                            element._cleanup = () => {
                                chart.destroy();
                                armed.cleanup();
                            };
                        }
                    }
                }
            };
        };
        
        return ChartComponent;
    };
    
    // Example: Integrating with a modal library
    const createModalIntegration = (modalLibrary) => {
        return juris.arm(document, (context) => ({
            // Listen for modal trigger buttons
            onclick: (e) => {
                if (e.target.matches('[data-modal]')) {
                    const modalId = e.target.dataset.modal;
                    const modalConfig = context.getState(\`modals.\${modalId}\`, {});
                    
                    // Open modal with library
                    const modal = modalLibrary.open({
                        ...modalConfig,
                        onClose: () => {
                            context.setState(\`modals.\${modalId}.open\`, false);
                        },
                        onConfirm: (data) => {
                            context.setState(\`modals.\${modalId}.result\`, data);
                            context.setState(\`modals.\${modalId}.confirmed\`, true);
                        }
                    });
                    
                    context.setState(\`modals.\${modalId}.open\`, true);
                    context.setState(\`modals.\${modalId}.instance\`, modal);
                }
            }
        }));
    };
    
    return { createChartComponent, createModalIntegration };
};

// Usage Example: Complete Integration
const createCompleteApp = () => {
    const app = new Juris({
        states: {
            form: {
                modified: false,
                saving: false,
                submitted: false,
                error: null
            },
            chart: {
                selectedPoint: null,
                hoverPoint: null
            }
        },
        services: {
            storage: {
                save: (key, data) => localStorage.setItem(key, JSON.stringify(data)),
                load: (key) => {
                    const data = localStorage.getItem(key);
                    return data ? JSON.parse(data) : null;
                },
                remove: (key) => localStorage.removeItem(key)
            }
        },
        components: {
            InteractiveCard: createInteractiveComponent(app)
        },
        layout: {
            div: {
                class: 'app p-4',
                children: [
                    { h1: { text: 'arm() API Integration Demo' } },
                    { InteractiveCard: { id: 'card1', title: 'Draggable Card 1' } },
                    { InteractiveCard: { id: 'card2', title: 'Draggable Card 2' } }
                ]
            }
        }
    });
    
    // Initialize integrations
    const { createAutoSaveForm } = createServiceIntegration(app);
    
    // Setup form auto-save if form exists
    const form = document.querySelector('#autoSaveForm');
    if (form) {
        createAutoSaveForm(form);
    }
    
    return app;
};

// Initialize complete app
// const app = createCompleteApp();
// app.render('#app');`


});
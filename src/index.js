// Basic middleware setup
const juris = new Juris({
  states: {
    user: { name: 'John', age: 25 },
    app: { theme: 'light' }
  },
  middleware: [
    // Logging middleware
    (action) => {
      console.log('State change:', action.path, action.oldValue, '->', action.newValue);
      return action.newValue; // Pass through unchanged
    },
    // Validation middleware  
    (action) => {
      if (action.path === 'user.age' && action.newValue < 0) {
        console.warn('Invalid age, using 0');
        return 0; // Modify the value
      }
      return action.newValue;
    }
  ]
});

const StatusText = (props, context) => ({
  span: {
    class: `font-medium ${
      props.status === 'success' ? 'text-green-600' :
      props.status === 'error' ? 'text-red-600' :
      props.status === 'warning' ? 'text-yellow-600' :
      'text-gray-600'
    }`,
    text: () => context.getState(props.path, props.defaultText || 'No status'),
    'aria-live': 'polite'
  }//span
})
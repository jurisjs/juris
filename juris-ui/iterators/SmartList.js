/**
 * SmartList - Reusable List Component with Smart Diffing for Juris 0.91.0
 * 
 * Features:
 * - Key-based smart diffing for optimal performance
 * - Flexible item rendering with component support
 * - Customizable styling and behavior
 * - Loading states and error handling
 * - Event callbacks for list operations
 * - Extensible through configuration
 * 
 * Usage:
 * SmartList({
 *   items: [] | () => [],
 *   renderItem: (item, index, context) => vnode,
 *   keyFn: (item, index) => key | 'propertyName',
 *   // ... other options
 * })
 */

// Core SmartList Configuration
const SmartListDefaults = {
  showDiffBadge: false,
  diffBadgeText: 'Smart Diff',
  diffBadgeClass: 'smartlist-diff-badge',
  trackChanges: true,
  batchUpdates: true,
  containerClass: 'smartlist',
  itemClass: 'smartlist-item',
  loadingClass: 'smartlist-loading',
  errorClass: 'smartlist-error',
  emptyClass: 'smartlist-empty'
};

const SmartListUtils = {
  generateHash(obj) {
    if (obj === null || typeof obj !== 'object') return String(obj);
    return JSON.stringify(obj, Object.keys(obj).sort());
  },

  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj);
    if (Array.isArray(obj)) return obj.map(this.deepClone);
    
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }
    return cloned;
  },

  deepEquals(a, b) {
    if (a === b) return true;
    if (a == null || b == null || typeof a !== typeof b) return false;
    if (typeof a === 'object') {
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      const keysA = Object.keys(a), keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(key => keysB.includes(key) && this.deepEquals(a[key], b[key]));
    }
    return false;
  },

  normalizeKeyFn(keyFn) {
    if (typeof keyFn === 'string') {
      return (item) => item[keyFn];
    }
    if (typeof keyFn === 'function') {
      return keyFn;
    }
    return (item, index) => index;
  },

  createItemData(item, index, hash) {
    return {
      item: this.deepClone(item),
      index,
      hash,
      timestamp: Date.now()
    };
  }
};

const SmartDiffer = {
  performDiff(parentElement, newItems, renderItem, keyFn, context, config = {}) {
    const existingNodes = Array.from(parentElement.children);
    if (existingNodes.length === 0) {
      return this.initialRender(parentElement, newItems, renderItem, keyFn, context, config);
    }
    const { existingNodeMap, existingDataMap } = this.buildExistingMaps(existingNodes);
    const operations = this.planOperations(newItems, keyFn, existingNodeMap, existingDataMap, config);
    this.executeOperations(parentElement, operations, renderItem, context, config);
    this.cleanupUnusedNodes(existingNodes, operations, context);
    
    return {
      added: operations.filter(op => op.type === 'create').length,
      updated: operations.filter(op => op.type === 'reuse' && op.needsUpdate).length,
      removed: existingNodes.length - operations.length,
      reused: operations.filter(op => op.type === 'reuse' && !op.needsUpdate).length
    };
  },

  initialRender(parentElement, items, renderItem, keyFn, context, config) {
    const fragment = document.createDocumentFragment();
    const stats = { added: 0, updated: 0, removed: 0, reused: 0 };    
    items.forEach((item, index) => {
      const key = String(keyFn(item, index));
      const element = this.createItemElement(item, index, renderItem, key, context, config);
      if (element) {
        fragment.appendChild(element);
        stats.added++;
      }
    });    
    parentElement.appendChild(fragment);
    return stats;
  },

  buildExistingMaps(existingNodes) {
    const existingNodeMap = new Map();
    const existingDataMap = new Map();    
    existingNodes.forEach(node => {
      const key = node.dataset.smartlistKey;
      if (key) {
        existingNodeMap.set(key, node);
        if (node._smartlistData) {
          existingDataMap.set(key, node._smartlistData);
        }
      }
    });    
    return { existingNodeMap, existingDataMap };
  },

  planOperations(newItems, keyFn, existingNodeMap, existingDataMap, config) {
    const operations = [];
    const usedNodes = new Set();    
    newItems.forEach((item, index) => {
      const key = String(keyFn(item, index));
      const existingNode = existingNodeMap.get(key);      
      if (existingNode) {
        const oldData = existingDataMap.get(key);
        const needsUpdate = this.shouldUpdateItem(oldData, { item, index }, config);        
        operations.push({
          type: 'reuse',
          key,
          item,
          index,
          node: existingNode,
          needsUpdate
        });
        usedNodes.add(existingNode);
      } else {
        operations.push({
          type: 'create',
          key,
          item,
          index
        });
      }
    });    
    operations.usedNodes = usedNodes;
    return operations;
  },

  executeOperations(parentElement, operations, renderItem, context, config) {
    const finalNodes = [];    
    operations.forEach(op => {
      if (op.type === 'reuse') {
        if (op.needsUpdate) {
          this.updateItemElement(op.node, op.item, op.index, renderItem, context, config);
        }
        finalNodes.push(op.node);
      } else if (op.type === 'create') {
        const newNode = this.createItemElement(op.item, op.index, renderItem, op.key, context, config);
        if (newNode) {
          finalNodes.push(newNode);
          if (config.onItemAdd) {
            try {
              config.onItemAdd(op.item, op.index);
            } catch (error) {
              console.warn('SmartList onItemAdd callback error:', error);
            }
          }
        }
      }
    });
    this.cleanupUnusedNodes(Array.from(parentElement.children), operations, context);
    this.applyNodeOrder(parentElement, finalNodes);
  },

  cleanupUnusedNodes(existingNodes, operations, context) {
    existingNodes.forEach(node => {
      if (!operations.usedNodes.has(node)) {
        const itemData = node._smartlistData;
        if (context.config?.onItemRemove && itemData) {
          try {
            context.config.onItemRemove(itemData.item, itemData.index);
          } catch (error) {
            console.warn('SmartList onItemRemove callback error:', error);
          }
        }
        
        this.cleanupNode(node, context);
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
    });
  },

  shouldUpdateItem(oldData, newData, config) {
    if (!oldData) return true;
    if (config.trackChanges) {
      const newHash = SmartListUtils.generateHash(newData.item);
      if (oldData.hash === newHash && oldData.index === newData.index) {
        return false;
      }
    }
    return oldData.index !== newData.index || !SmartListUtils.deepEquals(oldData.item, newData.item);
  },

  createItemElement(item, index, renderItem, key, context, config) {
    try {
      const vnode = renderItem(item, index, context);
      const element = context.juris.domRenderer.render(vnode);
      
      if (element) {
        element.dataset.smartlistKey = key;
        element._smartlistData = SmartListUtils.createItemData(
          item, 
          index, 
          SmartListUtils.generateHash(item)
        );
        if (config.itemClass) {
          element.classList.add(config.itemClass);
        }
      }
      
      return element;
    } catch (error) {
      console.error('SmartList item render error:', error);
      return this.createErrorElement(error, config);
    }
  },

  updateItemElement(element, newItem, newIndex, renderItem, context, config) {
    element._smartlistData = SmartListUtils.createItemData(
      newItem,
      newIndex,
      SmartListUtils.generateHash(newItem)
    );
    element.dataset.smartlistKey = String(context.keyFn(newItem, newIndex));
    if (config.granularUpdates !== false) {
      this.performGranularUpdate(element, newItem, newIndex, context, config);
    } else {
      this.replaceItemElement(element, newItem, newIndex, renderItem, context, config);
    }
  },

  performGranularUpdate(element, newItem, newIndex, context, config) {
    const textNodes = Array.from(element.childNodes).filter(node => node.nodeType === 3);
    if (textNodes.length === 1 && typeof newItem === 'string') {
      textNodes[0].textContent = newItem;
      return;
    }
    const commonUpdates = {
      'data-id': newItem.id,
      'data-status': newItem.status,
      'data-index': newIndex
    };    
    Object.entries(commonUpdates).forEach(([attr, value]) => {
      if (value !== undefined && element.getAttribute(attr) !== String(value)) {
        element.setAttribute(attr, String(value));
      }
    });
    if (newItem.completed !== undefined) {
      element.classList.toggle('completed', newItem.completed);
    }
    if (newItem.active !== undefined) {
      element.classList.toggle('active', newItem.active);
    }
    if (newItem.selected !== undefined) {
      element.classList.toggle('selected', newItem.selected);
    }
  },

  replaceItemElement(element, newItem, newIndex, renderItem, context, config) {
    try {
      const vnode = renderItem(newItem, newIndex, context);
      const newElement = context.juris.domRenderer.render(vnode);      
      if (newElement) {
        newElement.dataset.smartlistKey = element.dataset.smartlistKey;
        newElement._smartlistData = element._smartlistData;
        element.parentNode.replaceChild(newElement, element);
        this.cleanupNode(element, context);
      }
    } catch (error) {
      console.error('SmartList item re-render error:', error);
    }
  },

  applyNodeOrder(parentElement, finalNodes) {
    const currentNodes = Array.from(parentElement.children);
    let orderCorrect = currentNodes.length === finalNodes.length;
    if (orderCorrect) {
      for (let i = 0; i < currentNodes.length; i++) {
        if (currentNodes[i] !== finalNodes[i]) {
          orderCorrect = false;
          break;
        }
      }
    }    
    if (orderCorrect) {
      return; 
    }
    finalNodes.forEach((node, targetIndex) => {
      const currentParent = node.parentNode;
      if (currentParent !== parentElement) {
        parentElement.appendChild(node);
      }      
      const currentIndex = Array.from(parentElement.children).indexOf(node);      
      if (currentIndex !== targetIndex) {
        if (targetIndex >= parentElement.children.length) {
          parentElement.appendChild(node);
        } else {
          const referenceNode = parentElement.children[targetIndex];
          if (referenceNode && referenceNode !== node) {
            parentElement.insertBefore(node, referenceNode);
          }
        }
      }
    });
  },

  cleanupNode(element, context) {
    try {
      if (context.juris.domRenderer.cleanup) {
        context.juris.domRenderer.cleanup(element);
      }
    } catch (error) {
      console.warn('SmartList cleanup error:', error);
    }
  },

  createErrorElement(error, config) {
    const element = document.createElement('div');
    element.className = config.errorClass || 'smartlist-error';
    element.textContent = `Render Error: ${error.message}`;
    element.style.cssText = 'color: red; padding: 8px; border: 1px solid red; background: #ffe6e6;';
    return element;
  }
};

function SmartList(props, context) {
  const config = { ...SmartListDefaults, ...props };
  const { items, renderItem, keyFn, placeholder, loading, error } = props;
  if (!renderItem || typeof renderItem !== 'function') {
    throw new Error('SmartList: renderItem is required and must be a function');
  }
  const normalizedKeyFn = SmartListUtils.normalizeKeyFn(keyFn || ((item, index) => index));
    const itemContext = {
    ...context,
    keyFn: normalizedKeyFn,
    config
  };
  const containerProps = {
    class: [config.containerClass, props.class].filter(Boolean).join(' '),
    style: { position: 'relative', ...props.style },
    ...props.attributes
  };
  return {
    div: {
      ...containerProps,
      children: [
        // Diff badge (static)
        config.showDiffBadge ? {
          div: {
            class: config.diffBadgeClass,
            text: config.diffBadgeText,
            style: {
              position: 'absolute',
              top: '-8px',
              left: '10px',
              background: '#10b981',
              color: 'white',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: '600',
              zIndex: '10'
            }
          }
        } : null,
        (parentElement) => {
          const currentItems = typeof items === 'function' ? items() : items;
          if (!currentItems || currentItems.length === 0) {
            return SmartList.handleEmptyState(parentElement, placeholder, config, context);
          }
          if (currentItems.then) {
            return SmartList.handleAsyncItems(parentElement, currentItems, renderItem, normalizedKeyFn, itemContext, config, loading, error);
          }
          try {
            const stats = SmartDiffer.performDiff(
              parentElement, 
              currentItems, 
              renderItem, 
              normalizedKeyFn, 
              itemContext, 
              config
            );
            if (config.onPerformance) {
              config.onPerformance(stats);
            }
            return null;
          } catch (err) {
            console.error('SmartList diffing error:', err);
            if (config.onError) {
              config.onError(err);
            }
            return SmartList.renderError(parentElement, err, config);
          }
        }
      ].filter(Boolean)
    }
  };
}
SmartList.handleEmptyState = function(parentElement, placeholder, config, context) {
  if (parentElement.children.length > 0) {
    Array.from(parentElement.children).forEach(node => {
      SmartDiffer.cleanupNode(node, context);
    });
    parentElement.innerHTML = '';
  }
  
  if (placeholder) {
    const placeholderElement = context.juris.domRenderer.render(placeholder);
    if (placeholderElement) {
      if (config.emptyClass) {
        placeholderElement.classList.add(config.emptyClass);
      }
      parentElement.appendChild(placeholderElement);
    }
  }
  return null;
};

SmartList.handleAsyncItems = function(parentElement, itemsPromise, renderItem, keyFn, context, config, loading, error) {
  // Show loading state only if container is empty or doesn't have loading already
  const hasLoading = parentElement.querySelector('.smartlist-loading');
  
  if (loading && !hasLoading) {
    // Clean existing content
    Array.from(parentElement.children).forEach(node => {
      SmartDiffer.cleanupNode(node, context);
    });
    parentElement.innerHTML = '';
    
    const loadingElement = context.juris.domRenderer.render(loading);
    if (loadingElement) {
      if (config.loadingClass) {
        loadingElement.classList.add(config.loadingClass);
      }
      parentElement.appendChild(loadingElement);
    }
  }
  
  // Handle promise resolution
  itemsPromise
    .then(resolvedItems => {
      // Clear loading state
      parentElement.innerHTML = '';
      
      if (resolvedItems && resolvedItems.length > 0) {
        // Use smart diff for resolved items
        SmartDiffer.performDiff(parentElement, resolvedItems, renderItem, keyFn, context, config);
      } else {
        SmartList.handleEmptyState(parentElement, config.placeholder, config, context);
      }
    })
    .catch(err => {
      console.error('SmartList async items error:', err);
      SmartList.renderError(parentElement, err, config, error, context);
    });
  
  // Return null to prevent VDOM reconciliation
  return null;
};

SmartList.renderError = function(parentElement, err, config, customError = null, context = null) {
  // Clean existing content
  if (context) {
    Array.from(parentElement.children).forEach(node => {
      SmartDiffer.cleanupNode(node, context);
    });
  }
  parentElement.innerHTML = '';
  
  let errorElement;
  if (customError && typeof customError === 'function') {
    errorElement = customError(err);
  } else if (customError) {
    errorElement = customError;
  } else {
    errorElement = {
      div: {
        class: config.errorClass,
        text: `Error: ${err.message}`,
        style: {
          color: 'red',
          padding: '8px',
          border: '1px solid red',
          background: '#ffe6e6'
        }
      }
    };
  }
  
  if (errorElement && context) {
    const rendered = context.juris.domRenderer.render(errorElement);
    if (rendered) {
      parentElement.appendChild(rendered);
    }
  }
  
  // Return null to prevent VDOM reconciliation
  return null;
};

// Export for use in Juris applications
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SmartList, SmartListDefaults, SmartListUtils, SmartDiffer };
}

const JsonComponentFactory = (props = {}, context) => {
    const { getState, setState } = context;

    // Default templates in Juris Object DOM format
    const defaultTemplates = {
        document: (data) => ({
            'article': {
                className: 'doc-content',
                children: [
                    { 'h1': { className: 'doc-title', text: data.title } },
                    { 'p': { className: 'doc-subtitle', text: data.subtitle } },
                    { 'div': { className: 'doc-body', innerHTML: data.content } },
                    { 'span': { className: `doc-status status-${data.status}`, text: data.status } }
                ]
            }
        }),
        
        searchResult: (data) => ({
            'div': {
                className: 'search-result',
                children: [
                    { 'h3': { className: 'result-title', text: data.title } },
                    { 'p': { className: 'result-excerpt', innerHTML: data.excerpt } },
                    { 'span': { className: 'result-category', text: data.category } }
                ]
            }
        }),
        
        navigationSection: (data) => ({
            'div': {
                className: 'nav-category',
                children: [
                    { 'h2': { className: 'category-title', text: data.title } },
                    { 'p': { className: 'category-subtitle', text: data.subtitle } }
                ]
            }
        }),

        navigationItem: (data) => ({
            'li': {
                className: 'nav-item',
                children: [
                    { 'span': { className: 'section-title', text: data.title } },
                    { 'span': { className: 'section-subtitle', text: data.subtitle } },
                    { 'span': { className: `status status-${data.status}`, text: data.status } }
                ]
            }
        })
    };

    const config = {
        templates: { ...defaultTemplates, ...(props.templates || {}) },
        statePath: props.statePath || 'componentFactory',
        autoInject: props.autoInject !== false,
        ...props.config
    };

    // Create separate Juris instance for rendering
    const rendererInstance = new Juris({
        renderMode: config.renderMode || 'fine-grained'
    });

    return {
        api: {
            // Main factory methods
            createFromJson: (data, template, options = {}) => createComponent(data, template, options),
            createDocument: (docData, options = {}) => createComponent(docData, 'document', options),
            createSearchResults: (results, options = {}) => createSearchResultsList(results, options),
            createNavigation: (navData, options = {}) => createNavigationComponent(navData, options),
            
            // Direct rendering methods using separate instance
            renderToElement: (data, template, container) => renderToElement(data, template, container),
            renderToString: (data, template) => renderToString(data, template),
            
            // Template management
            addTemplate: (name, template) => addTemplate(name, template),
            getTemplate: (name) => config.templates[name],
            
            // Utilities
            mapJsonToObject: (data, template) => mapDataToObjectDOM(data, template),
            createFieldComponent: (value, fieldConfig, key) => createFieldComponent(value, fieldConfig, key),
            
            // Renderer access
            getRenderer: () => rendererInstance.domRenderer
        }
    };

    // ==================== CORE FACTORY LOGIC ====================

    function createComponent(data, templateName, options = {}) {
        const template = typeof templateName === 'string' 
            ? config.templates[templateName] 
            : templateName;

        if (!template) {
            console.warn(`Template '${templateName}' not found`);
            return createFallbackComponent(data);
        }

        // Execute function template or use static template
        return typeof template === 'function' 
            ? template(data) 
            : injectDataIntoComponent(template, data);
    }

    function createFieldComponent(value, fieldConfig, key) {
        // This is now simplified since templates are already Object DOM
        return { [fieldConfig.tag || 'span']: { text: value, className: fieldConfig.className || `field-${key}` } };
    }

    // ==================== RENDERING METHODS ====================

    function renderToElement(data, templateName, container) {
        const objectDOM = createComponent(data, templateName);
        const element = rendererInstance.domRenderer.render(objectDOM);
        
        if (container) {
            if (typeof container === 'string') {
                const targetEl = document.querySelector(container);
                if (targetEl) {
                    targetEl.appendChild(element);
                }
            } else {
                container.appendChild(element);
            }
        }
        
        return element;
    }

    function renderToString(data, templateName) {
        const element = renderToElement(data, templateName);
        return element ? element.outerHTML : '';
    }

    function createSearchResultsList(results, options = {}) {
        return {
            'ul': {
                className: 'search-results',
                children: results.map(result => config.templates.searchResult(result))
            }
        };
    }

    function createNavigationComponent(navData, options = {}) {
        const sections = Object.entries(navData).map(([categoryKey, category]) => {
            const categoryComponent = config.templates.navigationSection(category);
            
            // Add sections list
            if (category.sections?.length) {
                const sectionsComponent = {
                    'ul': {
                        className: 'nav-sections',
                        children: category.sections.map(section => 
                            config.templates.navigationItem(section)
                        )
                    }
                };
                
                // Add sections to category children
                const tagName = Object.keys(categoryComponent)[0];
                categoryComponent[tagName].children = [
                    ...(categoryComponent[tagName].children || []),
                    sectionsComponent
                ];
            }
            
            return categoryComponent;
        });

        return {
            'nav': {
                className: 'documentation-nav',
                children: sections
            }
        };
    }

    // ==================== TEMPLATE MANAGEMENT ====================

    function addTemplate(name, template) {
        config.templates[name] = template;
        setState(`${config.statePath}.templates.${name}`, template);
    }

    function mapDataToObjectDOM(data, template) {
        // Simple mapping utility
        const mapping = {};
        
        if (template.fields) {
            Object.entries(template.fields).forEach(([key, fieldConfig]) => {
                const value = getNestedValue(data, key);
                if (value !== undefined) {
                    mapping[key] = createFieldComponent(value, fieldConfig, key);
                }
            });
        }

        return mapping;
    }

    // ==================== UTILITIES ====================

    function getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }

    function createFallbackComponent(data) {
        // Create a simple representation when no template is found
        return {
            'div': {
                className: 'json-fallback',
                children: Object.entries(data).map(([key, value]) => ({
                    'div': {
                        className: 'json-field',
                        children: [
                            { 'strong': { text: key + ': ' } },
                            { 'span': { text: String(value) } }
                        ]
                    }
                }))
            }
        };
    }
};
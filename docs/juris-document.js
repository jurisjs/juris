class DocumentFramework {
    constructor() {
        this.docs = new Map();
        this.categories = new Map();
        this.searchIndex = [];
        this.currentDoc = null;
        this.filteredDocs = [];
        this.insertionCounter = 0; // Track insertion order
    }

    addDoc(id, doc) {
        // Validate required fields
        if (!doc.title || !doc.category || !doc.content) {
            throw new Error(`Document ${id} missing required fields: title, category, content`);
        }

        const docData = {
            id,
            title: doc.title,
            category: doc.category,
            description: doc.description || '',
            content: doc.content || '',
            code: doc.code || '',
            codeSnippet: doc.codeSnippet || '',
            liveExample: doc.liveExample || null,
            interactiveExample: doc.interactiveExample || null,
            testCode: doc.testCode || '',
            technicalDetails: doc.technicalDetails || {},
            tags: doc.tags || [],
            order: doc.order || 0,
            insertionOrder: this.insertionCounter++ // Add insertion order
        };

        this.docs.set(id, docData);
        this.updateCategory(doc.category, id);
        this.updateSearchIndex(id, docData);
        
        return docData;
    }

    updateCategory(categoryName, docId) {
        if (!this.categories.has(categoryName)) {
            this.categories.set(categoryName, {
                name: categoryName,
                docs: [],
                collapsed: false,
                order: this.categories.size // Categories ordered by creation time
            });
        }
        
        const category = this.categories.get(categoryName);
        if (!category.docs.includes(docId)) {
            category.docs.push(docId);
            // Sort docs within category by insertion order (no alphabetical sorting)
            category.docs.sort((a, b) => {
                const docA = this.docs.get(a);
                const docB = this.docs.get(b);
                return docA.insertionOrder - docB.insertionOrder;
            });
        }
    }

    updateSearchIndex(id, doc) {
        const searchableText = [
            doc.title,
            doc.description,
            doc.category,
            ...(doc.tags || []),
            doc.content
        ].join(' ').toLowerCase();

        this.searchIndex.push({
            id,
            text: searchableText,
            title: doc.title,
            category: doc.category
        });
    }

    search(query) {
        if (!query.trim()) {
            this.filteredDocs = Array.from(this.docs.keys());
            return this.filteredDocs;
        }

        const searchTerm = query.toLowerCase();
        const results = this.searchIndex
            .filter(item => item.text.includes(searchTerm))
            .map(item => item.id);

        this.filteredDocs = results;
        return results;
    }

    getDoc(id) {
        return this.docs.get(id);
    }

    getAllDocs() {
        // Group docs by category, then sort by insertion order within category
        const docsByCategory = new Map();
        
        Array.from(this.docs.values()).forEach(doc => {
            if (!docsByCategory.has(doc.category)) {
                docsByCategory.set(doc.category, []);
            }
            docsByCategory.get(doc.category).push(doc);
        });
        
        // Sort categories by their order, then docs by insertion order
        const sortedCategories = Array.from(this.categories.values())
            .sort((a, b) => a.order - b.order);
            
        const result = [];
        sortedCategories.forEach(category => {
            const categoryDocs = docsByCategory.get(category.name) || [];
            categoryDocs.sort((a, b) => a.insertionOrder - b.insertionOrder);
            result.push(...categoryDocs);
        });
        
        return result;
    }

    getCategories() {
        // Sort categories by their creation order (when they were first added)
        return Array.from(this.categories.values())
            .sort((a, b) => a.order - b.order);
    }

    getCategoryDocs(categoryName) {
        const category = this.categories.get(categoryName);
        if (!category) return [];
        
        return category.docs
            .map(id => this.docs.get(id))
            .sort((a, b) => a.insertionOrder - b.insertionOrder);
    }

    getFilteredCategories(searchQuery = '') {
        if (!searchQuery.trim()) {
            return this.getCategories();
        }

        const relevantDocs = this.search(searchQuery);
        const relevantCategories = new Set();
        
        relevantDocs.forEach(docId => {
            const doc = this.docs.get(docId);
            if (doc) {
                relevantCategories.add(doc.category);
            }
        });

        return this.getCategories().filter(category => 
            relevantCategories.has(category.name)
        );
    }

    getNavigation(currentDocId) {
        const allDocs = this.getAllDocs();
        const currentIndex = allDocs.findIndex(doc => doc.id === currentDocId);
        
        return {
            current: currentIndex,
            total: allDocs.length,
            previous: currentIndex > 0 ? allDocs[currentIndex - 1] : null,
            next: currentIndex < allDocs.length - 1 ? allDocs[currentIndex + 1] : null
        };
    }
}

if (typeof window !== 'undefined') {
    window.DocumentFramework = DocumentFramework;
    Object.freeze(window.DocumentFramework);
    Object.freeze(window.DocumentFramework.prototype);
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports.DocumentFramework = DocumentFramework;
    module.exports.default = DocumentFramework;
}
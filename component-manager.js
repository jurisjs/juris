// Registry of component definitions. A definition is `(props, api) => layout | (() => layout)`.
// Options: { ssr: false } marks a component the server never renders (a client-only placeholder is
// emitted instead; see the kit's string renderer, server/ssr-renderer.js).
//
// devMode adds an inspectable tree of the live client instances: the renderer reports every instance
// it creates (track) and disposes (untrack), and componentTree() walks them from the roots down.
// With devMode off none of this exists — no registry, nothing added to an instance. Server (SSR)
// instances are never tracked: they end with the request, and a shared server instance must not
// accumulate them.
export default class ComponentManager {
    constructor(options = {}) {
        this.components = new Map();
        this.options = new Map();
        this.devMode = Boolean(options.devMode);
        this.juris = options.juris ?? null; // for reading raw props and $local values into the tree
        this.roots = this.devMode ? new Set() : null; // live instances without a parent, creation order
        this.inspectors = this.devMode ? new Set() : null; // onTreeChange callbacks
        this.dirty = false;
        this.nextId = 0;
    }

    registerComponent(name, definition, options = {}) {
        if (typeof name !== "string" || name.length === 0) {
            throw new Error("ComponentManager.registerComponent: name must be a non-empty string");
        }
        if (typeof definition !== "function") {
            throw new Error(`ComponentManager.registerComponent: definition for "${name}" must be a function`);
        }
        if (this.components.has(name)) {
            throw new Error(`ComponentManager.registerComponent: "${name}" is already registered`);
        }
        this.components.set(name, definition);
        this.options.set(name, Object.freeze({ ssr: true, ...options }));
    }

    getOptions(name) {
        return this.options.get(name);
    }

    has(name) {
        return this.components.has(name);
    }

    get(name) {
        return this.components.get(name);
    }

    names() {
        return Array.from(this.components.keys());
    }

    // ---- devMode: the live instance tree -------------------------------------------------

    // Called by the renderer as soon as an instance exists (its parent is already set on it).
    track(instance) {
        if (!this.devMode || instance.ssr) return;
        instance.id = this.nextId++;
        instance.children = new Set();
        if (instance.parent?.children) instance.parent.children.add(instance);
        else this.roots.add(instance);
        this.dirty = true;
    }

    untrack(instance) {
        if (!this.devMode || instance.children === undefined) return;
        if (instance.parent?.children) instance.parent.children.delete(instance);
        this.roots.delete(instance);
        // Children normally go first (innermost disposal); anything still alive is re-rooted, not lost.
        for (const child of instance.children) {
            child.parent = null;
            this.roots.add(child);
        }
        instance.children = undefined;
        this.dirty = true;
    }

    // A plain snapshot of the live tree, roots first. `props` and `local.values` are raw values (no
    // tracking proxies); `local.values` includes useState initials that were never written; `root` is
    // the DOM node, the only non-serializable field.
    componentTree() {
        if (!this.devMode) throw new Error("Juris.componentTree: available in devMode only");
        return Array.from(this.roots, (instance) => this.snapshot(instance));
    }

    snapshot(instance) {
        const juris = this.juris;
        const raw = (value) => (juris ? juris.toRaw(value) : value);
        return {
            id: instance.id,
            name: instance.name,
            key: instance.props?.key,
            props: raw(instance.props),
            local: instance.local === undefined ? null : { path: instance.local, values: { ...instance.localDefaults, ...raw(juris?.peek(instance.local)) } },
            root: instance.root ?? null,
            adopted: Boolean(instance.adopted),
            disposed: Boolean(instance.disposed),
            children: Array.from(instance.children ?? [], (child) => this.snapshot(child)),
        };
    }

    // The live instances (not snapshots) of one component name, depth first.
    find(name) {
        if (!this.devMode) throw new Error("Juris.findComponents: available in devMode only");
        const out = [];
        const walk = (instance) => {
            if (instance.name === name) out.push(instance);
            for (const child of instance.children) walk(child);
        };
        for (const root of this.roots) walk(root);
        return out;
    }

    // fn(tree) after every render pass that created or disposed an instance. Returns an unsubscribe.
    onTreeChange(fn) {
        if (!this.devMode) throw new Error("Juris.onTreeChange: available in devMode only");
        this.inspectors.add(fn);
        return () => this.inspectors.delete(fn);
    }

    // The renderer calls this when its outermost DOM operation finishes. Every watcher is told,
    // whichever throws, and the first error is thrown once all have been, as a state notification
    // pass runs its callbacks (StateManager guard).
    flush() {
        if (!this.dirty) return;
        this.dirty = false;
        if (!this.inspectors.size) return;
        const tree = this.componentTree();
        let failures = null;
        for (const fn of this.inspectors) {
            try {
                fn(tree);
            } catch (error) {
                (failures ??= []).push(error);
            }
        }
        if (failures) throw failures[0];
    }
}
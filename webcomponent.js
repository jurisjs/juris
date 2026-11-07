// Web components drawn by Juris: a custom element whose content is a layout, with state of its own.
//
//   const juris = new Juris({ features: { webComponentFactory: WebComponentFactory } });
//   // or, on an instance already made: new WebComponentFactory(juris)
//   juris.createWebComponent("user-card", {
//       initialState: { open: false },                       // or a function, called on the element
//       render(props, context) {                             // `this` is the element
//           const { component } = context;
//           return { div: { textContent: props.name, onclick: () => component.setState("open", !props.open) } };
//       },
//       hooks: { onConnect(context) {}, onMount(context) {}, onUnmount(context) {}, onAttributeChange(name, old, value, context) {} },
//   }, { attributes: ["name"], styles: ":host { display: block }" });
//   juris.createWebComponents({ "x-a": fnA, "x-b": { component: fnB, options: { shadowMode: "closed" } } }, globalOptions);
//
// A definition is a function (props, context) => layout, or an object with `render` (or
// `component`, or `template`), `initialState` and `hooks`. Each element keeps its state under
// `webcomponents.<name>.<id>` (`stateNamespace` puts every element of the kind at one path instead):
// the initial state, then the observed attributes, read as values ("true", "42", JSON, and a bare
// attribute as true). Its props are its observed attributes with its state over them. The layout is
// drawn into a shadow root (`shadowMode`, "open" unless told; `enhanceMode: true` draws into the
// element itself), after `styles`, and drawn again whenever the element's state changes (unless
// `autoRerender` is false) and when an observed attribute does (unless `rerenderOnAttributeChange`
// is false), each time disposing what it drew before. A layout may be a promise: a `juris-loading`
// div shows until it settles. A render that throws shows its message instead.
//
// The context is headless.js's createContext for the element (through `contextProvider(context)`,
// called on the element, when given), with `component`: name, id, element, renderRoot, shadowRoot,
// getState(key, default), setState(key, value) or setState({ … }), updateState({ … }),
// getAttribute(name, default), setAttribute(name, value), emit(event, detail, options) (bubbling,
// composed), getSlot(name) and getAllSlots(). The element has render(), forceRender(),
// getJurisContext(), getComponentState() and updateComponentState({ … }).
//
// Disconnected, an element stops watching, runs onUnmount, disposes what it drew, and deletes its
// state (unless `cleanupState` is false); connected again, it draws again into the same root.
import { createContext } from "./headless.js";

const LOADING = { div: { class: "juris-loading", textContent: "Loading..." } };
const failed = (error) => ({
    div: { style: { color: "red", padding: "10px", border: "1px solid red", background: "#fee" }, textContent: `Component Error: ${error?.message ?? error}` },
});

// An attribute's text as a value: a bare attribute is true, then booleans, numbers (as Number reads
// them, so "0x10" is 16) and JSON, and anything else the text itself.
function parseAttribute(value) {
    if (value === null || value === undefined) return value;
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "") return true;
    if (!isNaN(value) && !isNaN(parseFloat(value))) return Number(value);
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

// Each instance's elements, by the state path each draws from, behind one observer: a write looks up
// the path it wrote and each path above it, so it costs the depth of the path, not the number of
// elements on the page.
const watched = new WeakMap(); // juris -> Map<stateKey, Set<element>>

function watch(juris, stateKey, element) {
    let byKey = watched.get(juris);
    if (!byKey) {
        byKey = new Map();
        watched.set(juris, byKey);
        juris.stateManager.observe((changed) => {
            if (byKey.size === 0) return;
            for (let at = changed; at; at = at.slice(0, Math.max(0, at.lastIndexOf(".")))) {
                for (const each of byKey.get(at) ?? []) if (each._mounted && !each._rendering) each.render();
            }
        });
    }
    if (!byKey.has(stateKey)) byKey.set(stateKey, new Set());
    byKey.get(stateKey).add(element);
    return () => {
        const elements = byKey.get(stateKey);
        if (elements?.delete(element) && elements.size === 0) byKey.delete(stateKey);
    };
}

export class WebComponentFactory {
    constructor(juris) {
        if (!juris || typeof juris.render !== "function") throw new TypeError("WebComponentFactory: give it the Juris instance it draws with");
        this.juris = juris;
        juris.webComponentFactory = this;
        juris.createWebComponent = (name, definition, options) => this.create(name, definition, options);
        juris.createWebComponents = (components, globalOptions) => this.createMultiple(components, globalOptions);
    }

    // Defines `name` and answers its class; a name defined already answers the class it has.
    create(name, componentDefinition, options = {}) {
        if (typeof name !== "string" || !name.includes("-")) throw new Error(`WebComponent name "${name}" must contain a hyphen (-)`);
        if (typeof customElements === "undefined") throw new Error("WebComponentFactory: custom elements need a browser");
        const existing = customElements.get(name);
        if (existing) {
            console.warn(`Juris: the web component "${name}" is defined already`);
            return existing;
        }
        const element = elementClass(this.juris, name, componentDefinition, options);
        customElements.define(name, element);
        return element;
    }

    createMultiple(components, globalOptions = {}) {
        const created = {};
        for (const [name, definition] of Object.entries(components)) {
            const options = definition?.options ? { ...globalOptions, ...definition.options } : globalOptions;
            created[name] = this.create(name, typeof definition === "function" ? definition : (definition?.component ?? definition), options);
        }
        return created;
    }
}

function elementClass(juris, name, definition, options) {
    const { shadowMode = "open", attributes = [], styles = "", enhanceMode = false, autoConnect = true, stateNamespace = null, contextProvider = null } = options;
    const config = definition !== null && typeof definition === "object" ? definition : null;
    const draw = typeof definition === "function" ? definition : (config?.render ?? config?.component ?? config?.template ?? null);
    const hooks = config?.hooks ?? {};
    const observed = Object.freeze([...attributes]);
    const state = juris.stateManager;
    let sequence = 0;

    return class JurisWebComponent extends HTMLElement {
        static get observedAttributes() {
            return observed;
        }

        constructor() {
            super();
            this.componentName = name;
            this.componentId = `${name}-${++sequence}`;
            this.isJurisComponent = true;
            this.componentFn = draw;
            this.componentConfig = config;
            this.renderRoot = null;
            this.stateKey = null;
            this.jurisContext = null;
            this._mounted = false;
            this._rendering = false;
            this._style = null;
            this._token = null;
            this._unwatch = null;
        }

        connectedCallback() {
            if (!autoConnect) return;
            if (!this.renderRoot) {
                // Once: a shadow root cannot be attached twice, and a moved element connects again.
                this.renderRoot = enhanceMode ? this : this.attachShadow({ mode: shadowMode });
                if (styles && !enhanceMode) {
                    this._style = document.createElement("style");
                    this._style.textContent = styles;
                    this.renderRoot.appendChild(this._style);
                }
            }
            this.stateKey = stateNamespace || `webcomponents.${name.replace(/-/g, "_")}.${this.componentId}`;
            juris.setValue(this.stateKey, this._getInitialState());
            this.jurisContext = this._createJurisContext();
            if (options.autoRerender !== false) this._unwatch = watch(juris, this.stateKey, this);
            hooks.onConnect?.call(this, this.jurisContext);
            this.render();
            this._mounted = true;
            if (hooks.onMount) requestAnimationFrame(() => hooks.onMount.call(this, this.jurisContext));
        }

        disconnectedCallback() {
            this._mounted = false;
            this._token = null;
            this._unwatch?.();
            this._unwatch = null;
            hooks.onUnmount?.call(this, this.jurisContext);
            this._clear();
            if (this.stateKey && options.cleanupState !== false) juris.deleteState(this.stateKey);
        }

        attributeChangedCallback(attribute, oldValue, newValue) {
            if (oldValue === newValue || !this._mounted) return;
            juris.setValue(this.stateKey, { ...(state.peek(this.stateKey) ?? {}), [attribute]: parseAttribute(newValue) });
            hooks.onAttributeChange?.call(this, attribute, oldValue, newValue, this.jurisContext);
            // Watching, the write above drew it again already.
            if (options.autoRerender === false && options.rerenderOnAttributeChange !== false) this.render();
        }

        render() {
            if (!this.renderRoot) return;
            const token = (this._token = {});
            let layout;
            this._rendering = true;
            try {
                if (!draw) {
                    console.warn(`Juris: the web component "${name}" has no render, component or template`);
                    return;
                }
                layout = draw.call(this, this._getProps(), this.jurisContext);
            } catch (error) {
                console.error(`Juris: the web component "${name}" failed to render`, error);
                layout = failed(error);
            } finally {
                this._rendering = false;
            }
            if (layout && typeof layout.then === "function") {
                this._show(LOADING);
                Promise.resolve(layout).then(
                    (resolved) => {
                        if (this._token === token && this._mounted) this._show(resolved);
                    },
                    (error) => {
                        if (this._token !== token) return;
                        console.error(`Juris: the web component "${name}" failed to render`, error);
                        this._show(failed(error));
                    },
                );
                return;
            }
            this._show(layout);
        }

        forceRender() {
            this.render();
        }

        getJurisContext() {
            return this.jurisContext;
        }

        getComponentState() {
            return state.peek(this.stateKey) ?? {};
        }

        updateComponentState(updates) {
            this.jurisContext.component.updateState(updates);
        }

        // What the root holds but its style goes, disposed, and `layout` is drawn in its place: a draw
        // that answers nothing leaves the root empty.
        _show(layout) {
            this._clear();
            if (!layout) return;
            try {
                juris.render(this.renderRoot, layout);
            } catch (error) {
                console.error(`Juris: the web component "${name}" failed to render`, error);
                juris.render(this.renderRoot, failed(error));
            }
        }

        _clear() {
            if (!this.renderRoot) return;
            for (const child of [...this.renderRoot.childNodes]) {
                if (child === this._style) continue;
                juris.disposeTree(child);
                child.remove();
            }
        }

        _getProps() {
            const props = {};
            for (const attribute of observed) if (this.hasAttribute(attribute)) props[attribute] = parseAttribute(this.getAttribute(attribute));
            return Object.assign(props, state.peek(this.stateKey) ?? {});
        }

        _getInitialState() {
            let initial = {};
            const given = config?.initialState;
            if (typeof given === "function") initial = given.call(this) ?? {};
            else if (given) initial = { ...given };
            if (typeof draw?.getInitialState === "function") initial = { ...initial, ...draw.getInitialState.call(this) };
            for (const attribute of observed) if (this.hasAttribute(attribute)) initial[attribute] = parseAttribute(this.getAttribute(attribute));
            return initial;
        }

        _createJurisContext() {
            const element = this;
            const key = (part) => (part ? `${element.stateKey}.${part}` : element.stateKey);
            const base = contextProvider ? contextProvider.call(this, createContext(juris, this)) : createContext(juris, this);
            return {
                ...base,
                component: {
                    name,
                    id: this.componentId,
                    element: this,
                    renderRoot: this.renderRoot,
                    shadowRoot: this.shadowRoot,
                    getState: (part, defaultValue = null) => juris.getState(key(part), defaultValue),
                    setState: (part, value) => {
                        if (part !== null && typeof part === "object") juris.setValue(element.stateKey, { ...(state.peek(element.stateKey) ?? {}), ...part });
                        else juris.setValue(key(part), value);
                    },
                    updateState: (updates) => juris.setValue(element.stateKey, { ...(state.peek(element.stateKey) ?? {}), ...updates }),
                    getAttribute: (attribute, defaultValue = null) => element.getAttribute(attribute) ?? defaultValue,
                    setAttribute: (attribute, value) => element.setAttribute(attribute, value),
                    emit: (eventName, detail = {}, eventOptions = {}) => {
                        const event = new CustomEvent(eventName, { detail, bubbles: true, composed: true, ...eventOptions });
                        element.dispatchEvent(event);
                        return event;
                    },
                    getSlot: (slot = "") => (slot ? element.querySelector(`[slot="${CSS.escape(slot)}"]`) : element.querySelector(":not([slot])")),
                    getAllSlots: () => {
                        const slots = {};
                        for (const child of element.querySelectorAll("[slot]")) (slots[child.getAttribute("slot")] ??= []).push(child);
                        return slots;
                    },
                },
            };
        }
    };
}

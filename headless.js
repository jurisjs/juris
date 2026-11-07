// Headless components: logic with no element, made once per instance, whose `api` every component
// reaches by name. The 0.91 contract, on this core:
//
//   const juris = new Juris({
//       features: { headless: HeadlessManager },
//       headlessComponents: { cart: { fn: Cart, options: { autoInit: true } }, clock: Clock },
//   });
//   // or, on an instance already made: new HeadlessManager(juris, { headlessComponents })
//
//   function Cart(props, context) {        // context: createContext(juris), below
//       return {
//           api: { add: (item) => context.setState("cart.items", [...context.getState("cart.items", []), item]) },
//           hooks: { onRegister() {}, onUnregister() {} },
//       };
//   }
//   juris.registerComponent("Buy", (props, api) => ({ button: { onclick: () => api.cart.add(props.item) } }));
//
// A headless component is registered (register, or `headlessComponents`) and made by initialize,
// at once when its options say `autoInit` (and then given those options as its props). Its `api`
// joins the component api under its name (`api.cart`, by extendApi's rule: a name the api already
// has is refused), the manager's `context`, `juris.headlessAPIs` and every context made after it;
// reinitialize makes it again, its onUnregister first, and the new api replaces the old one.
//
// The context is the 0.91 component context, built on this core: everything on the component api
// (getState, setValue, batch, call, …), and beside it `setState`, `executeBatch`, `subscribe`, the
// services by name, every headless api by name, `headless`, `isSSR`, `components` and `juris`.
// `getState(path, default, track)` answers `default` (null unless given) for a path with nothing at
// it, and a `track` of false reads without subscribing. `subscribe(path, callback, hierarchical)`
// calls `callback(value, previous, changedPath)` after every write to `path`, and, unless
// `hierarchical` is false, to any path beneath it; it answers the function that stops it.
// What 0.91 had there and this core has not (utils, objectToHtml, setupIndicators, logger, the named
// component api) is not there.
//
// The instance gains what 0.91's had: headlessManager, headlessAPIs, registerHeadlessComponent,
// initializeHeadlessComponent, initializeQueuedHeadlessComponent, getHeadlessComponent,
// getHeadlessAPI, registerAndInitHeadless, getHeadlessStatus, createHeadlessContext, and createContext.

// Each instance's context, but for its element, built once for each version of its component api
// (extendApi and a headless api's arrival replace that object) and copied for every caller.
const contexts = new WeakMap(); // juris.api -> the shared part of the context
// Each instance's subscriptions, by path, behind one observer: path -> Set<{ callback, hierarchical }>.
const subscriptions = new WeakMap();

export function createContext(juris, element = null) {
    const manager = juris.headlessManager ?? null;
    let base = contexts.get(juris.api);
    if (!base || base.headless !== manager?.context) {
        base = contextFor(juris, manager);
        contexts.set(juris.api, base);
    }
    const context = { ...base };
    if (element) context.element = element;
    return context;
}

function contextFor(juris, manager) {
    const state = juris.stateManager;
    const apis = manager ? manager.context : {};
    return {
        ...juris.api,
        getState: (path, defaultValue = null, track = true) => {
            if (track === false) {
                const value = state.peek(path);
                return value === undefined ? defaultValue : value;
            }
            return juris.getState(path, defaultValue, typeof track === "object" ? track : undefined);
        },
        setState: (path, value) => juris.setValue(path, value),
        executeBatch: (callback) => juris.batch(callback),
        subscribe: (path, callback, hierarchical = true) => subscribe(juris, path, callback, hierarchical),
        ...juris.services,
        ...apis,
        headless: manager?.context,
        isSSR: juris.isServer,
        components: {
            register: (name, component, options) => juris.registerComponent(name, component, options),
            get: (name) => juris.componentManager.get(name),
            registerHeadless: (name, component, options) => juris.headlessManager?.register(name, component, options),
            getHeadless: (name) => juris.headlessManager?.getInstance(name),
            initHeadless: (name, props) => juris.headlessManager?.initialize(name, props),
            reinitHeadless: (name, props) => juris.headlessManager?.reinitialize(name, props),
            getHeadlessAPI: (name) => juris.headlessManager?.getAPI(name),
        },
        juris,
    };
}

// One observer per instance, however many subscriptions: a write looks up the path it wrote and each
// path above it, so it costs the depth of the path, not the number of subscriptions. A callback that
// throws is reported and the others still run, as 0.91's were.
function subscribe(juris, path, callback, hierarchical) {
    if (typeof path !== "string" || !path) throw new TypeError("subscribe: path is a state path");
    if (typeof callback !== "function") throw new TypeError("subscribe: callback is a function (value, previous, changedPath)");
    let byPath = subscriptions.get(juris);
    if (!byPath) {
        byPath = new Map();
        subscriptions.set(juris, byPath);
        juris.stateManager.observe((changed, value, previous) => {
            if (byPath.size === 0) return;
            for (let at = changed; ; at = at.slice(0, Math.max(0, at.lastIndexOf(".")))) {
                for (const entry of byPath.get(at) ?? []) {
                    if (at !== changed && !entry.hierarchical) continue;
                    try {
                        entry.callback(value, previous, changed);
                    } catch (error) {
                        console.error(`Juris: a subscriber of "${at}" threw`, error);
                    }
                }
                if (!at) break;
            }
        });
    }
    const entry = { callback, hierarchical: hierarchical !== false };
    if (!byPath.has(path)) byPath.set(path, new Set());
    byPath.get(path).add(entry);
    return () => {
        const entries = byPath.get(path);
        if (entries?.delete(entry) && entries.size === 0) byPath.delete(path);
    };
}

export class HeadlessManager {
    constructor(juris, config) {
        if (!juris || typeof juris.registerComponent !== "function") throw new TypeError("HeadlessManager: give it the Juris instance it serves");
        if (juris.headlessManager) throw new Error("HeadlessManager: this instance has one already");
        this.juris = juris;
        this.components = new Map(); // name -> { fn, options }
        this.instances = new Map(); // name -> what its fn answered
        this.context = {}; // name -> its api; one object for the manager's life, so contexts can hold it
        this.initQueue = new Set(); // names initializeQueued makes, if they are not made yet
        this.lifecycleHooks = new Map(); // name -> its hooks
        juris.headlessManager = this;
        juris.headlessAPIs = {};
        juris.registerHeadlessComponent = (name, component, options) => this.register(name, component, options);
        juris.initializeHeadlessComponent = (name, props) => this.initialize(name, props);
        juris.initializeQueuedHeadlessComponent = () => this.initializeQueued();
        juris.getHeadlessComponent = (name) => this.getInstance(name);
        juris.getHeadlessAPI = (name) => this.getAPI(name);
        juris.registerAndInitHeadless = (name, component, options = {}) => {
            this.register(name, component, options);
            return this.initialize(name, options);
        };
        juris.getHeadlessStatus = () => this.getStatus();
        juris.createHeadlessContext = (element) => createContext(juris, element);
        juris.createContext ??= (element) => createContext(juris, element);
        for (const [name, entry] of Object.entries(config?.headlessComponents ?? {})) {
            if (typeof entry === "function") this.register(name, entry);
            else this.register(name, entry?.fn, entry?.options);
        }
        this.initializeQueued();
    }

    register(name, componentFn, options = {}) {
        if (typeof name !== "string" || !name) throw new TypeError("HeadlessManager.register: name is a non-empty string");
        if (typeof componentFn !== "function") throw new TypeError(`HeadlessManager.register: "${name}" is a function (props, context) => { api, hooks }`);
        this.components.set(name, { fn: componentFn, options });
        if (options?.autoInit) this.initialize(name, options);
    }

    // Makes `name` with `props`, replacing whatever was made under it before (its onUnregister runs
    // first). Answers what its function answered, or null, with the reason on the console, when it is
    // not registered, throws, or answers no object.
    initialize(name, props = {}) {
        const component = this.components.get(name);
        if (!component) {
            console.error(`HeadlessManager: no headless component "${name}" is registered`);
            return null;
        }
        if (this.instances.has(name)) this.release(name);
        try {
            const instance = component.fn(props, createContext(this.juris));
            if (!instance || typeof instance !== "object") {
                console.error(`HeadlessManager: "${name}" answered no object ({ api, hooks })`);
                return null;
            }
            // Published first: a name publish refuses leaves nothing made, so nothing for cleanup to end.
            if (instance.api) this.publish(name, instance.api);
            this.instances.set(name, instance);
            if (instance.hooks) this.lifecycleHooks.set(name, instance.hooks);
            instance.hooks?.onRegister?.();
            return instance;
        } catch (error) {
            console.error(`HeadlessManager: "${name}" failed to initialize`, error);
            return null;
        }
    }

    initializeQueued() {
        for (const name of this.initQueue) {
            if (!this.instances.has(name)) this.initialize(name, this.components.get(name)?.options ?? {});
        }
        this.initQueue.clear();
    }

    reinitialize(name, props = {}) {
        return this.initialize(name, props);
    }

    cleanup() {
        for (const name of [...this.instances.keys()]) this.release(name);
    }

    getInstance(name) {
        return this.instances.get(name);
    }

    getAPI(name) {
        return this.context[name];
    }

    getAllAPIs() {
        return { ...this.context };
    }

    getStatus() {
        return {
            registered: [...this.components.keys()],
            initialized: [...this.instances.keys()],
            queued: [...this.initQueue],
            apis: Object.keys(this.context),
        };
    }

    // `api` under `name` on the component api, beside what extendApi put there; it may replace only
    // what this manager put there itself.
    publish(name, api) {
        const current = this.juris.api;
        if (Object.hasOwn(current, name) && !Object.hasOwn(this.context, name)) {
            throw new Error(`HeadlessManager: "${name}" is a name the component api already has`);
        }
        this.context[name] = api;
        this.juris.headlessAPIs[name] = api;
        this.juris.api = Object.freeze({ ...current, [name]: api });
    }

    release(name) {
        const instance = this.instances.get(name);
        try {
            instance?.hooks?.onUnregister?.();
        } catch (error) {
            console.error(`HeadlessManager: "${name}"'s onUnregister threw`, error);
        }
        this.instances.delete(name);
        this.lifecycleHooks.delete(name);
        if (!Object.hasOwn(this.context, name)) return;
        delete this.context[name];
        delete this.juris.headlessAPIs[name];
        const { [name]: _released, ...rest } = this.juris.api;
        this.juris.api = Object.freeze(rest);
    }
}

// FluentState: the state as an object you read and write by property, a headless component (headless.js).
//
//   const juris = new Juris({
//       features: { headless: HeadlessManager },
//       headlessComponents: { fluentState: { fn: createFluentStateHeadless, options: { autoInit: true } } },
//   });
//   const $ = juris.getHeadlessAPI("fluentState").getFluentStates();   // in a component: api.fluentState
//
//   $.user.name = "Ada";                    // setValue("user.name", "Ada"); a missing parent is made
//   { p: { textContent: () => $.user.name } }  // read inside a binding: it re-runs when user.name changes
//   $.x.user.name                           // read without subscribing; written through $.x, no subscriber hears it
//   $.todos.push({ title: "Write" });       // and pop, shift, unshift, splice: a new array, written whole
//   $.user.update({ age: 36 });  $.user.clear();  $.user.exists();  $.user.raw();
//   const stop = $.user.subscribe((value, previous, changedPath) => {}, { immediate, deep, once });
//   fluentState.batch(() => { … });         // one notification pass; each subscriber called once at the end
//
// Reading a property answers its value when that is a primitive, and otherwise a fluent object for
// its path, whether there is an object there, an array, null or nothing yet: so `$.a.b.c = 1` and
// `$.list.push(x)` work on paths that do not exist, and `exists()` says whether one does. Reading
// never writes. A fluent object converts to its value (`${$.user.name}`, JSON.stringify), iterates
// when it is an array, and lists its keys (Object.keys, `in`), each read subscribing as a getState
// would. `raw()` is getState(path): inside a binding, the core's read-only tracking view.
//
// subscribe (and watch and onChange, which are never immediate) hears every write to its path, under
// it (unless `deep` is false) and above it, by whoever makes it, except writes made through `$.x`:
// `callback(value, previous, changedPath)`, with the path's own value and, when the write was to the
// path itself, what was there before. It answers the function that stops it, which `unsubscribe`
// also takes (or the callback). Subscriptions belong to the headless instance and end with it.
//
// The api: getFluentStates(), batch(fn), debug { getStats, clearCache, clearSubscriptions }.

const PATH = Symbol("fluentstate.path"); // a fluent object's path, and how one is told from a value
const METHODS = new Set(["x", "subscribe", "watch", "onChange", "unsubscribe", "push", "pop", "shift", "unshift", "splice", "update", "clear", "exists", "raw"]);
const join = (base, key) => (base ? `${base}.${key}` : String(key));
const isFluent = (value) => (typeof value === "object" || typeof value === "function") && value !== null && typeof value[PATH] === "string";
// A fluent object as a primitive: its value, and as text nothing for nothing there (`${$.missing}`).
const primitive = (value, hint) => {
    if (value === null || value === undefined) return hint === "string" ? "" : value;
    return typeof value === "object" ? (hint === "number" ? Number.NaN : String(value)) : value;
};
const typeName = (value) => (value === null ? "null" : Array.isArray(value) ? "Array" : typeof value === "object" ? "Object" : typeof value);

export function createFluentStateHeadless(props, context) {
    const juris = context?.juris;
    if (!juris?.stateManager) throw new TypeError("createFluentStateHeadless: context.juris is the Juris instance (headless.js makes such a context)");
    const state = juris.stateManager;
    const subscriptions = new Map(); // path -> Set<{ callback, deep, once, stop }>
    let batched = null; // the paths written while batch() runs, or null
    let quiet = 0; // > 0 while $.x writes: no subscriber hears them

    // ---- subscriptions -----------------------------------------------------------------------
    // A subscription at `at` hears a write to `changed` when it is the same path, a path beneath it
    // (when deep; never beneath the root, which only its own write reaches), or a path above it.
    const hears = (at, changed, deep) =>
        at === changed || (deep && at !== "" && changed.startsWith(`${at}.`)) || (changed === "" ? at !== "" : at.startsWith(`${changed}.`));

    const call = (entry, value, previous, changed) => {
        if (entry.once) entry.stop();
        try {
            entry.callback(value, previous, changed);
        } catch (error) {
            console.error("FluentState: a subscriber threw", error);
        }
    };

    const stopObserving = state.observe((changed, value, previous) => {
        if (quiet > 0 || subscriptions.size === 0) return;
        if (batched) {
            batched.add(changed);
            return;
        }
        for (const [at, entries] of subscriptions) {
            for (const entry of [...entries]) {
                if (!hears(at, changed, entry.deep)) continue;
                if (at === changed) call(entry, value, previous, changed);
                else call(entry, state.peek(at), undefined, changed);
            }
        }
    });

    // The end of a batch: each subscription once, for the first written path it hears.
    const flush = (paths) => {
        for (const [at, entries] of subscriptions) {
            for (const entry of [...entries]) {
                for (const changed of paths) {
                    if (!hears(at, changed, entry.deep)) continue;
                    call(entry, state.peek(at), undefined, changed);
                    break;
                }
            }
        }
    };

    const subscriber = (path, method) => (callback, options = {}) => {
        if (typeof callback !== "function") throw new TypeError(`FluentState.${method}: callback is a function (value, previous, changedPath)`);
        const entry = { callback, deep: options.deep ?? true, once: options.once ?? false, stop: null };
        entry.stop = () => {
            const entries = subscriptions.get(path);
            if (entries?.delete(entry) && entries.size === 0) subscriptions.delete(path);
        };
        if (!subscriptions.has(path)) subscriptions.set(path, new Set());
        subscriptions.get(path).add(entry);
        if (method === "subscribe" && options.immediate) call(entry, state.peek(path), undefined, path);
        return entry.stop;
    };

    const unsubscribe = (handle) => {
        for (const entries of subscriptions.values()) {
            for (const entry of entries) {
                if (entry.stop !== handle && entry.callback !== handle) continue;
                entry.stop();
                return true;
            }
        }
        return false;
    };

    // ---- reading and writing -------------------------------------------------------------------
    // A live fluent object reads as getState does (inside a binding, the path is a dependency); a
    // still one ($.x) peeks. Both write with setValue; a still one's writes reach no subscriber.
    const write = (path, value, live) => {
        const raw = isFluent(value) ? state.peek(value[PATH]) : value;
        if (live) return juris.setValue(path, raw);
        quiet += 1;
        try {
            juris.setValue(path, raw);
        } finally {
            quiet -= 1;
        }
    };
    const remove = (path, live) => {
        if (live) return juris.deleteState(path);
        quiet += 1;
        try {
            juris.deleteState(path);
        } finally {
            quiet -= 1;
        }
    };

    // An array method: a copy of the array (or [] for nothing there, [value] for one value), changed
    // as the method changes it and written back whole. pop and shift on an empty array write nothing.
    const arrayMethod = (path, live, method) => (...args) => {
        const current = state.peek(path);
        const list = Array.isArray(current) ? [...current] : current == null ? [] : [current];
        if ((method === "pop" || method === "shift") && list.length === 0) return undefined;
        const result = list[method](...args.map((item) => (isFluent(item) ? state.peek(item[PATH]) : item)));
        write(path, list, live);
        return result;
    };

    const method = (path, live, name) => {
        switch (name) {
            case "x":
                return fluent(path, false);
            case "subscribe":
            case "watch":
            case "onChange":
                if (!live) {
                    console.warn("FluentState: subscriptions are not available through $.x");
                    return undefined;
                }
                return subscriber(path, name);
            case "unsubscribe":
                return unsubscribe;
            case "push":
            case "pop":
            case "shift":
            case "unshift":
            case "splice":
                return arrayMethod(path, live, name);
            case "update":
                return (updates) => {
                    const next = { ...(state.peek(path) ?? {}), ...updates };
                    write(path, next, live);
                    return next;
                };
            case "clear":
                return () => write(path, null, live);
            case "exists":
                return () => (live ? juris.getState(path, undefined, { track: false }) : state.peek(path)) != null;
            case "raw":
                return () => (live ? juris.getState(path) : state.peek(path));
        }
    };

    const handler = (live) => {
        const read = live ? (path) => juris.getState(path, undefined, { track: false }) : (path) => state.peek(path);
        const self = {
            get(target, key) {
                const path = target[PATH];
                if (typeof key === "symbol") {
                    if (key === PATH) return path;
                    if (key === Symbol.toPrimitive) return (hint) => primitive(read(path), hint);
                    if (key === Symbol.toStringTag) return typeName(state.peek(path));
                    if (key === Symbol.iterator && Array.isArray(state.peek(path))) {
                        return function* () {
                            const length = read(join(path, "length"));
                            for (let index = 0; index < length; index += 1) yield self.get(target, String(index));
                        };
                    }
                    return undefined;
                }
                switch (key) {
                    case "valueOf":
                        return () => read(path);
                    case "toString":
                        return () => String(read(path) ?? "");
                    case "toJSON":
                        return () => (live ? juris.getState(path) : state.peek(path));
                }
                if (METHODS.has(key)) return method(path, live, key);
                const here = state.peek(path);
                // A primitive here (a string's length): its own property, read as the whole value.
                if (here !== null && here !== undefined && typeof here !== "object") return Object(read(path))[key];
                // A method of the object or array (map, filter, hasOwnProperty): called on this
                // fluent object, so what it reads comes through here.
                if (here && !Object.hasOwn(here, key) && typeof here[key] === "function") return here[key];
                const childPath = join(path, key);
                const value = read(childPath);
                return value === null || value === undefined || typeof value === "object" ? fluent(childPath, live) : value;
            },
            set(target, key, value) {
                if (typeof key !== "symbol") write(join(target[PATH], key), value, live);
                return true;
            },
            deleteProperty(target, key) {
                if (typeof key !== "symbol") remove(join(target[PATH], key), live);
                return true;
            },
            has(target, key) {
                if (typeof key === "symbol") return key === PATH;
                if (METHODS.has(key)) return true;
                const here = read(target[PATH]);
                return here !== null && typeof here === "object" && key in here;
            },
            ownKeys(target) {
                const here = read(target[PATH]);
                return here !== null && typeof here === "object" ? Reflect.ownKeys(here).filter((key) => typeof key === "string") : [];
            },
            getOwnPropertyDescriptor(target, key) {
                const here = state.peek(target[PATH]);
                if (typeof key === "symbol" || here === null || typeof here !== "object" || !Object.hasOwn(here, key)) return undefined;
                return { value: self.get(target, key), writable: true, enumerable: Object.getOwnPropertyDescriptor(here, key).enumerable, configurable: true };
            },
        };
        return self;
    };
    const handlers = { live: handler(true), still: handler(false) };
    const fluent = (path, live) => new Proxy({ [PATH]: path }, live ? handlers.live : handlers.still);
    const root = fluent("", true);

    const batch = (callback) => {
        if (batched) return juris.batch(callback);
        batched = new Set();
        try {
            return juris.batch(callback);
        } finally {
            const paths = batched;
            batched = null;
            if (paths.size) flush(paths);
        }
    };

    return {
        api: {
            getFluentStates: () => root,
            batch,
            debug: {
                getStats: () => ({ subscriptions: subscriptions.size, cache: 0, batchActive: batched !== null, batchQueueSize: batched?.size ?? 0 }),
                clearCache: () => { },
                clearSubscriptions: () => subscriptions.clear(),
            },
        },
        hooks: {
            onRegister() { },
            onUnregister() {
                stopObserving();
                subscriptions.clear();
            },
        },
    };
}

const MAX_PATH_CACHE = 10_000;
const MAX_NOTIFY_DEPTH = 100;
const RAW = Symbol("juris.raw");
const SETTLED = Symbol("juris.settled");
// Marks a notification that wakes one node's own subscribers and not its subtree (see notifyStructural).
// A control character, so it can never be the start of a real state path.
const EXACT = "\u0001";
// How many entries an async error log keeps (`errors` under the async root, and each group's): the
// last ones. A page that stays open for a day in a browser appended to them for good, and each append
// copies the log.
export const MAX_ERROR_LOG = 50;

// `text` as ONE segment of a state path, for a key made of something that is not a name (a live
// path, "rows.list", kept under the live client's root). Distinct texts give distinct segments:
// "%" is escaped first, then ".", which would split it, and "*", which a subscription reads as a
// wildcard; "__proto__", which no path may name, is escaped whole.
export function pathSegment(text) {
    const segment = String(text).replace(/%/g, "%25").replace(/\./g, "%2E").replace(/\*/g, "%2A");
    return segment === "__proto__" ? "%5F%5Fproto%5F%5F" : segment;
}

// A path's segments, its empty ones skipped ("a..b" and ".a.b" are "a.b"): what
// `path.split(".").filter(Boolean)` gives, in one list rather than two.
const splitPath = (path) => {
    const segments = [];
    let start = 0;
    for (let dot = path.indexOf("."); dot !== -1; dot = path.indexOf(".", start)) {
        if (dot > start) segments.push(path.slice(start, dot));
        start = dot + 1;
    }
    if (start < path.length) segments.push(path.slice(start));
    return segments;
};

// A pass's subscribers, sorted as they are found (affected): a computed's apart from the others'.
// Module functions rather than closures made for every pass.
const wakeInto = (found, callbacks) => {
    for (const callback of callbacks) {
        if (callback.isComputed) found.computedCallbacks.add(callback);
        else found.otherCallbacks.add(callback);
    }
};
const collectInto = (found, node) => {
    if (node.callbacks) for (const callbacks of node.callbacks) wakeInto(found, callbacks);
    if (node.children) for (const child of node.children.values()) collectInto(found, child);
};

// Creation order, for the binding phase of a pass (run): a parent before what it created.
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

// ---- settled values -----------------------------------------------------------------
// A settled value looks like a promise (.then / .catch) but is already resolved or rejected, and its
// callbacks run at once, synchronously. Anything that would otherwise return a promise can return one
// of these instead (a preloaded api.call does), so the same component code runs synchronously on the
// server and during hydration: `then` callbacks chain without yielding, and settle() applies the value
// immediately, never touching the $async counters. A callback that returns a real promise turns the
// chain asynchronous from that point, as usual.

const chain = (fn, argument) => {
    try {
        const result = fn(argument);
        return isSettled(result) || (result !== null && typeof result === "object" && typeof result.then === "function") ? result : settled(result);
    } catch (error) {
        return settledError(error);
    }
};

export function settled(value) {
    return Object.freeze({
        [SETTLED]: true,
        value,
        then: (onFulfilled) => (typeof onFulfilled === "function" ? chain(onFulfilled, value) : settled(value)),
        catch: () => settled(value),
        finally: (fn) => (typeof fn === "function" ? chain(fn).then(() => settled(value)) : settled(value)),
    });
}

export function settledError(error) {
    return Object.freeze({
        [SETTLED]: true,
        error,
        then: (onFulfilled, onRejected) => (typeof onRejected === "function" ? chain(onRejected, error) : settledError(error)),
        catch: (onRejected) => (typeof onRejected === "function" ? chain(onRejected, error) : settledError(error)),
        finally: (fn) => (typeof fn === "function" ? chain(fn).then(() => settledError(error)) : settledError(error)),
    });
}

export function isSettled(value) {
    return value !== null && typeof value === "object" && value[SETTLED] === true;
}

const isPlainObject = (value) => {
    if (value === null || typeof value !== "object") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

// An empty object or array of the kind and prototype of `value`, for a proxy of it to be made over: a
// proxy is held to its own target's properties, and this one has none of them but an array's length,
// which is the real one's.
const standInFor = (value) => {
    const empty = Array.isArray(value) ? Object.defineProperty([], "length", Reflect.getOwnPropertyDescriptor(value, "length")) : {};
    return Object.setPrototypeOf(empty, Object.getPrototypeOf(value));
};

// A copy of the async bookkeeping with every error log taken out: the one at the top (`errors`,
// whatever it holds) and, below it, any `errors` array, which is a group's (`groups.<name>.errors`;
// a dotted group name nests). The counters beside them are kept. See clearState.
const withoutErrorLogs = (value, top = false) =>
    Object.fromEntries(
        Object.entries(value)
            .filter(([key, child]) => key !== "errors" || (!top && !Array.isArray(child)))
            .map(([key, child]) => [key, isPlainObject(child) ? withoutErrorLogs(child) : child]),
    );

// A tracking proxy's handler (StateManager.track): one object per proxy, holding what it tracks,
// with traps every proxy shares, rather than a closure for each trap made for every proxy.
class Tracker {
    constructor(manager, target, basePath) {
        this.manager = manager;
        this.target = target;
        this.basePath = basePath;
        this.paths = null; // key -> its path, made once: a binding that runs again reads the same keys
    }

    childPath(key) {
        this.paths ??= new Map();
        let path = this.paths.get(key);
        if (path === undefined) {
            path = `${this.basePath}.${key}`;
            this.paths.set(key, path);
        }
        return path;
    }

    get(_, key, receiver) {
        const { manager, target } = this;
        if (key === RAW) return target;
        if (typeof key === "symbol") return Reflect.get(target, key, receiver);
        const child = target[key];
        if (typeof child === "function") return child; // array methods etc.; their reads go through this proxy
        const childPath = this.childPath(key);
        manager.activeDependencies?.add(childPath);
        const tracked = manager.activeDependencies && child !== null && typeof child === "object";
        return tracked ? manager.track(child, childPath) : child;
    }

    has(_, key) {
        if (typeof key !== "symbol") this.manager.activeDependencies?.add(this.childPath(key));
        return key in this.target;
    }

    ownKeys() {
        this.manager.activeDependencies?.add(this.basePath);
        return Reflect.ownKeys(this.target);
    }

    set(_, key) {
        const path = `${this.basePath}.${String(key)}`;
        throw new Error(`StateManager: state is read-only inside bindings; use setValue("${path}", value)`);
    }

    deleteProperty(_, key) {
        const path = `${this.basePath}.${String(key)}`;
        throw new Error(`StateManager: state is read-only inside bindings; use deleteState("${path}")`);
    }
}

// The handler of a proxy over a stand-in (an object that is not extensible): the real object's own
// properties, reported configurable where the stand-in has none of that name, as only a property its
// target has non-configurable may be reported so.
class ClosedTracker extends Tracker {
    getOwnPropertyDescriptor(standIn, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(this.target, key);
        if (descriptor && !Object.hasOwn(standIn, key)) descriptor.configurable = true;
        return descriptor;
    }
}

export default class StateManager {
    constructor(initialState = {}, options = {}) {
        this.state = initialState;
        this.devMode = Boolean(options.devMode);
        this.asyncPath = options.asyncPath ?? "$async"; // pending / slow / started / settled / errors live under here
        this.pendingDelay = options.pendingDelay ?? 200; // ms a promise may take before it counts as slow (0 = at once)
        this.onChange = typeof options.onChange === "function" ? options.onChange : null; // devtools hook: called after each notify
        // The words a rejection is kept with in the error log (recordError). Juris passes one that
        // filters on a server, where the log can reach a page someone else asked for.
        this.errorMessage = typeof options.errorMessage === "function" ? options.errorMessage : (error) => String(error?.message ?? error);
        this.pathCache = new Map();
        this.activeDependencies = null;
        this.subscribers = new Map(); // path -> Set<callback>, every subscription (the source of truth)
        this.trie = { parent: null, segment: null, children: null, callbacks: null }; // literal paths, by segment; children is a Map, created on demand (most nodes are leaves); callbacks, the Set of the subscriber sets of every spelling of the node's path ("a.b", "a..b")
        this.wildcards = new Map(); // path (with "*" segments) -> Set<callback>, the few that need a scan
        this.computed = new Map(); // path -> dispose
        this.proxyCache = new WeakMap(); // raw object -> Map<basePath, proxy>
        this.batchDepth = 0;
        this.batchedPaths = new Set(); // writes made inside batch(), notified together at the outermost exit
        this.observers = new Set(); // observe(): told of every write, by path, as it is made
        this.bindingSequence = 0; // creation order of bindings: the binding phase runs parents before children (see run)
        // Which async bookkeeping is current: one more on every clearState that resets it (a
        // server's, per request). A promise counted under an older epoch settles into nothing.
        this.epoch = 0;
    }

    // Stamps a subscriber callback with its creation order. Called by bindState/compute once per binding, so a
    // parent (created first) always runs before anything it created, and a child the parent disposed skips itself.
    stamp(callback) {
        callback.order = ++this.bindingSequence;
        return callback;
    }

    // ---- tracking proxies ---------------------------------------------------------
    // While a capture is active, getState hands out proxies that record every property read
    // as a leaf path ("todos.2.completed"), so bindings depend on exactly what they touched.

    toRaw(value) {
        return value !== null && typeof value === "object" ? (value[RAW] ?? value) : value;
    }

    // Replaces any tracking proxies inside `value` with their raw targets before storing.
    // Containers are copied only when something inside them actually changed. `seen` is made for the
    // first container: a write of a number or a string makes nothing.
    unwrap(value, seen = null) {
        if (value === null || typeof value !== "object") return value;
        const raw = this.toRaw(value);
        if (!(Array.isArray(raw) || isPlainObject(raw))) return raw;
        if (seen === null) seen = new WeakSet();
        else if (seen.has(raw)) return raw;
        seen.add(raw);
        let copy = null;
        for (const key of Object.keys(raw)) {
            const child = this.unwrap(raw[key], seen);
            if (child !== raw[key]) {
                copy = copy ?? (Array.isArray(raw) ? raw.slice() : { ...raw });
                copy[key] = child;
            }
        }
        return copy ?? raw;
    }

    // The traps read `target`, the real object, whatever the proxy is made over. A proxy must answer a
    // property of its own target that is neither writable nor configurable with what it holds, never a
    // tracking proxy of it: every property of a frozen object (a settled value's too) is one. So an
    // object that is not extensible (frozen, sealed or preventExtensions'd) is proxied over a stand-in
    // (standInFor), which holds the proxy to none of its properties, and what they hold is tracked and
    // proxied as any other object's is; the proxy is not frozen, as the object is. An extensible object
    // is its own proxy's target, at no cost, as the check is one call when the proxy is made. Left out:
    // an extensible object with a property DEFINED neither writable nor configurable, holding an
    // object, which a read through the proxy fails on. Plain state data never has one.
    track(target, basePath) {
        if (!Array.isArray(target) && !isPlainObject(target)) return target;

        let byPath = this.proxyCache.get(target);
        if (!byPath) {
            byPath = new Map();
            this.proxyCache.set(target, byPath);
        }
        const cached = byPath.get(basePath);
        if (cached) return cached;

        const closed = !Object.isExtensible(target);
        const handler = closed ? new ClosedTracker(this, target, basePath) : new Tracker(this, target, basePath);
        const proxy = new Proxy(closed ? standInFor(target) : target, handler);
        byPath.set(basePath, proxy);
        return proxy;
    }

    getPathSegments(path) {
        let segments = this.pathCache.get(path);
        if (segments === undefined) {
            segments = splitPath(path);
            // Walking "__proto__" reaches Object.prototype, so a write through it would pollute every object.
            if (segments.includes("__proto__")) throw new Error(`StateManager: "__proto__" is not allowed in a state path ("${path}")`);
            // A long-lived server instance sees a new path per row (`events.8812.title`) for the life
            // of the process. This is a cache of split strings, nothing more, so it is simply emptied
            // when it grows past a bound — re-splitting a path costs microseconds.
            if (this.pathCache.size >= MAX_PATH_CACHE) this.pathCache.clear();
            this.pathCache.set(path, segments);
        }
        return segments;
    }

    // Walks to the object that holds the last segment of `segments`.
    // With create=true, missing/non-object intermediates are replaced by {} (write semantics) and
    // `created` (if given) receives the index of the first segment that had to be created.
    // With create=false, returns undefined as soon as the path can't be followed (read/delete semantics).
    resolveParent(segments, create, created = null) {
        let current = this.state;
        for (let index = 0; index < segments.length - 1; index += 1) {
            const segment = segments[index];
            const next = current[segment];
            if (next === null || typeof next !== "object") {
                if (!create) return undefined;
                current[segment] = {};
                if (created && created.index === -1) created.index = index;
            }
            current = current[segment];
        }
        return current;
    }

    // A structural change (a key or index appearing or disappearing) wakes the readers of the
    // container's SHAPE — whoever read the container itself (Object.keys, iteration, a whole-value
    // read) and, for an array, its length — plus the readers of the key that appeared or went. NOT the
    // container's other children: a sibling's value has not changed.
    //
    // It used to notify the container as an ordinary write, which wakes the whole subtree, so the first
    // write to any useState key re-ran everything that read a sibling key of the same component. A form
    // whose root read one of its states was re-run by its first write to any sibling key, and every
    // field already filled in went blank.
    //
    // `shifts`: removing an array index moves every later index down, so there the siblings DID change
    // and the whole container is notified as before. Root-level keys have no container: the key path.
    //
    // `depth` is the index of the first segment that is new. When a write creates intermediates
    // (a.b.c into an `a` with no `b`), each created object is new too: its shape readers wake, and the
    // written path's own readers (and those beneath it). Readers of OTHER paths under a created object
    // read undefined before and still do, so they stay asleep.
    notifyStructural(segments, depth, { shifts = false } = {}) {
        const containerPath = segments.slice(0, depth).join(".");
        const fullPath = segments.join(".");
        if (shifts) return this.notify(containerPath || fullPath);
        this.batch(() => {
            if (containerPath) {
                this.notify(EXACT + containerPath);
                if (Array.isArray(this.peek(containerPath))) this.notify(`${containerPath}.length`);
            }
            for (let k = depth; k < segments.length - 1; k += 1) this.notify(EXACT + segments.slice(0, k + 1).join("."));
            this.notify(fullPath);
        });
    }

    // Read without registering a dependency. Use inside event handlers or updaters.
    peek(path) {
        const segments = this.getPathSegments(path);
        let value = this.state;
        for (let index = 0; index < segments.length; index += 1) value = value?.[segments[index]];
        return value;
    }

    // Inside a capture, object values come back as tracking proxies (see track). Pass { track: false }
    // to get the raw object; you then depend on `path` only. Every binding reads through here, so it
    // walks the path itself (peek's loop) and makes no options object when none is given.
    getState(path, defaultValue, options) {
        this.activeDependencies?.add(path);
        // A second, lighter observer: it records the path and hands out no proxies. The SSR renderer
        // uses it to learn what a render depended on without changing how the render behaves.
        this.activeReads?.add(path);
        const segments = this.getPathSegments(path);
        let value = this.state;
        for (let index = 0; index < segments.length; index += 1) value = value?.[segments[index]];

        if (value === undefined) return defaultValue;
        if (this.activeDependencies && options?.track !== false && value !== null && typeof value === "object") {
            return this.track(value, path);
        }
        return value;
    }

    setValue(path, value) {
        this.assertWritable(path, "setValue");
        this.write(path, value);
    }

    assertWritable(path, method) {
        if (this.computed.has(path)) {
            throw new Error(`StateManager.${method}: "${path}" is a computed path and cannot be written directly`);
        }
    }

    write(path, rawValue) {
        const segments = this.getPathSegments(path);
        const lastSegment = segments[segments.length - 1];

        if (!lastSegment) {
            return;
        }

        const value = this.unwrap(rawValue);
        const created = { index: -1 };
        const parent = this.resolveParent(segments, true, created);
        const previous = parent[lastSegment];
        // Own keys only: `constructor` or `toString` is `in` every object, and a new key under such a
        // name is still a new key, whose container's readers must wake.
        const isNewKey = !Object.hasOwn(parent, lastSegment);
        parent[lastSegment] = value;
        // Creating intermediates or a new key/index is a structural change of the nearest object that
        // already existed: notify that container rather than the leaf (see notifyStructural).
        if (created.index !== -1) {
            this.announce(path, value, previous, () => this.notifyStructural(segments, created.index));
        } else if (isNewKey) {
            this.announce(path, value, previous, () => this.notifyStructural(segments, segments.length - 1));
        } else {
            // Identical primitives cannot have changed anything, so skip the notify.
            // Objects/functions are always notified: callers may mutate in place and re-set to signal a change.
            const isPrimitive = value === null || (typeof value !== "object" && typeof value !== "function");
            if (isPrimitive && Object.is(previous, value)) {
                return;
            }
            if (this.observers.size !== 0) {
                this.announce(path, value, previous, () => this.notify(path));
                return;
            }
            // No observer to tell: what announce and notify would do, without their two frames on
            // every write's stack.
            if (this.batchDepth > 0) this.batchedPaths.add(path);
            else this.run([path]);
        }
    }

    // observe(observer): `observer(path, value, previous)` is called for every write, once, with the
    // path as written, after the subscribers it woke have run (inside batch(), at the write: the
    // subscribers wait for the batch, the observer does not). A deleted path is told with `value`
    // undefined, and clearState as the root, "". Unlike a subscription, it hears writes BENEATH the
    // paths it cares about, which is what a module that keeps its own subscriptions by path needs
    // (headless.js's subscribe, fluentstate.js). Returns the function that stops it.
    observe(observer) {
        if (typeof observer !== "function") throw new TypeError("StateManager.observe: observer is a function (path, value, previous)");
        this.observers.add(observer);
        return () => this.observers.delete(observer);
    }

    // Every observer runs, whichever throws; the first error is thrown once they all have, as a
    // notification pass does (guard).
    tell(path, value, previous) {
        if (this.observers.size === 0) return;
        let failure = null;
        for (const observer of [...this.observers]) {
            try {
                observer(path, value, previous);
            } catch (error) {
                failure ??= error;
            }
        }
        if (failure) throw failure;
    }

    // Wakes the subscribers of a write that was made (`wake`), then tells its observers. They are told
    // of every write, so a subscriber that throws does not keep it from them; the writer then gets that
    // error, the first, as it gets the first of several subscribers' (guard).
    announce(path, value, previous, wake) {
        try {
            wake();
        } catch (error) {
            try {
                this.tell(path, value, previous);
            } catch {
                // An observer's error comes after the subscriber's.
            }
            throw error;
        }
        this.tell(path, value, previous);
    }

    // Replaces the whole tree with `next` (default: empty), keeping the same root object so references
    // to it stay valid. The async counters under asyncPath are carried over unless `next` provides its
    // own, so promises still in flight balance out; with `resetAsync` (a server's, between requests)
    // they are not, and the epoch moves on, so whatever settles later counts for nothing. Every
    // subscriber and computed re-runs once, in one pass; onChange sees a single "" (root) change.
    // Meant for reusing one instance across requests.
    //
    // An own `__proto__` key in `next` (JSON.parse makes one) is skipped: no path can name it, and
    // copying it with assignment set the root's prototype instead.
    clearState(next = {}, { resetAsync = false } = {}) {
        const asyncKey = this.getPathSegments(this.asyncPath)[0];
        // The in-flight counters (pending / slow / started / settled, and each group's pending) must
        // survive a clear so they still balance when the work finishes. The error logs must NOT: on
        // a shared server instance they would carry every request's rejections forward, growing for
        // the life of the process, and a group's are drawn into the page (Await's onError), so one
        // request's failure would show in the next one's. Errors belong to the request that produced
        // them: the log at the top, and the one under every group.
        if (resetAsync) this.epoch += 1;
        const previous = resetAsync || Object.hasOwn(next, asyncKey) ? undefined : this.state[asyncKey];
        const carried = previous && typeof previous === "object" ? withoutErrorLogs(previous, true) : undefined;
        for (const key of Object.keys(this.state)) delete this.state[key];
        const values = this.unwrap(next);
        for (const key of Object.keys(values)) if (key !== "__proto__") this.state[key] = values[key];
        if (carried !== undefined) this.state[asyncKey] = carried;
        this.announce("", this.state, undefined, () => this.notify(""));
    }

    // Read-modify-write. The read is untracked so this is safe to call from inside a binding.
    updateState(path, updater) {
        this.setValue(path, updater(this.peek(path)));
    }

    // Removes a path. Object keys are deleted; array indexes are spliced out (later items shift down).
    // Either way the container is notified: its shape changed (see notifyStructural).
    deleteState(path) {
        this.assertWritable(path, "deleteState");
        const segments = this.getPathSegments(path);
        const lastSegment = segments[segments.length - 1];

        if (!lastSegment) {
            return;
        }

        const parent = this.resolveParent(segments, false);
        if (parent === undefined || !Object.hasOwn(parent, lastSegment)) {
            return;
        }

        const previous = parent[lastSegment];
        if (Array.isArray(parent)) {
            const index = Number(lastSegment);
            if (!Number.isInteger(index) || index < 0 || index >= parent.length) {
                return;
            }
            parent.splice(index, 1);
        } else {
            delete parent[lastSegment];
        }
        this.announce(path, undefined, previous, () => this.notifyStructural(segments, segments.length - 1, { shifts: Array.isArray(parent) }));
    }

    // Derived state stored at `path`. Dependencies are tracked automatically from getState calls;
    // `watch` adds paths that tracking can't see, typically wildcards like "todos.*.completed"
    // ("*" matches exactly one segment). Returns a dispose function; the last value stays in state.
    compute(path, resolver, options = {}) {
        if (this.computed.has(path)) {
            throw new Error(`StateManager.compute: "${path}" is already computed`);
        }
        const watch = options.watch ?? [];
        const binding = { version: 0, pending: false, disposed: false };
        let subscribed = null; // the paths currently subscribed; only the difference is touched per run

        const refresh = () => {
            if (binding.disposed) return;
            const run = ++binding.version;
            // tryCapture, not capture: a resolver that throws still yields the paths it read before it
            // threw, so it re-runs when they change — and the error becomes the computed's VALUE (a
            // settled error at `path`, which readers and boundaries already know how to handle)
            // instead of escaping into the notification pass and aborting every other subscriber.
            const { dependencies, value, error } = this.tryCapture(resolver);
            for (const watched of watch) dependencies.add(watched);
            try {
                const outcome = error ? settledError(error) : value;
                this.settle(binding, run, outcome, (settled) => this.write(path, settled));
                // settle records a settled error and applies it to nothing (a binding's onError takes it);
                // a computed's is its value, kept at `path`.
                if (error) this.write(path, outcome);
            } finally {
                if (!binding.disposed) subscribed = this.resubscribe(refresh, subscribed, dependencies);
            }
        };
        refresh.isComputed = true;
        this.stamp(refresh);

        const dispose = () => {
            binding.disposed = true;
            this.endPending(binding);
            subscribed = this.resubscribe(refresh, subscribed, null);
            this.computed.delete(path);
        };
        this.computed.set(path, dispose);
        try {
            refresh();
        } catch (error) {
            // A first run that fails outright (settle itself threw) must not leave the path registered
            // as "already computed" with nothing behind it.
            dispose();
            throw error;
        }
        return dispose;
    }

    // ---- async values ---------------------------------------------------------------
    // A resolver may return a promise of the value it would otherwise return. `settle` applies a
    // plain value at once and a promise once it resolves; `binding` ({ version, pending, disposed,
    // onPending }) identifies the resolver so a result from a superseded run (`run` older than
    // binding.version) or a disposed binding is dropped. Central counters under asyncPath let the
    // UI show one loading/progress indicator for everything in flight. `pending` counts every promise;
    // `slow` counts only those still waiting after pendingDelay, so indicators bound to it don't flicker.

    isThenable(value) {
        return value !== null && (typeof value === "object" || typeof value === "function") && typeof value.then === "function";
    }

    isSettled(value) {
        return isSettled(value);
    }

    settle(binding, run, value, apply) {
        // Already settled (see settled/settledError above): apply or fail right now, synchronously.
        if (isSettled(value)) {
            this.endPending(binding);
            if ("error" in value) {
                this.recordError(value.error);
                binding.onError?.call(binding, value.error);
                return;
            }
            this.settle(binding, run, value.value, apply);
            return;
        }
        if (!this.isThenable(value)) {
            this.endPending(binding);
            apply(value);
            return;
        }
        this.beginPending(binding);
        const epoch = this.epoch;
        const current = () => binding.version === run && !binding.disposed;
        Promise.resolve(value).then(
            (result) => {
                if (this.epoch === epoch) this.count("settled", 1);
                if (current()) this.settle(binding, run, result, apply);
            },
            (error) => {
                if (this.epoch === epoch) this.count("settled", 1);
                if (!current()) return;
                this.endPending(binding);
                // The log is the epoch's, as the counters are: an older one's rejection is not logged in it.
                if (this.epoch === epoch) this.recordError(error);
                binding.onError?.call(binding, error);
            },
        );
    }

    // The log keeps the last MAX_ERROR_LOG entries.
    recordError(error) {
        this.updateState(`${this.asyncPath}.errors`, (errors = []) => [...errors, { message: this.errorMessage(error), at: Date.now() }].slice(-MAX_ERROR_LOG));
        if (this.devMode) console.error("StateManager: async value rejected", error);
    }

    // Never below 0: a count the state no longer holds (it was reset) is not taken below nothing.
    count(name, delta) {
        const path = `${this.asyncPath}.${name}`;
        this.write(path, Math.max(0, (this.peek(path) ?? 0) + delta));
    }

    beginPending(binding) {
        // Pending since an epoch that is over: its counts went with that epoch, so it is counted anew.
        if (binding.pending && binding.epoch !== this.epoch) this.endPending(binding);
        if (!binding.pending) {
            binding.pending = true;
            binding.epoch = this.epoch;
            if (!this.peek(`${this.asyncPath}.pending`)) {
                // First promise of a new batch: progress counters start over.
                this.write(`${this.asyncPath}.started`, 0);
                this.write(`${this.asyncPath}.settled`, 0);
            }
            this.count("pending", 1);
            binding.onPending?.(true);
            if (this.pendingDelay > 0) binding.slowTimer = setTimeout(() => this.markSlow(binding), this.pendingDelay);
            else this.markSlow(binding);
        }
        this.count("started", 1);
    }

    markSlow(binding) {
        binding.slowTimer = null;
        if (!binding.pending || binding.slow || binding.epoch !== this.epoch) return;
        binding.slow = true;
        this.count("slow", 1);
        binding.onSlow?.(true);
    }

    endPending(binding) {
        if (!binding.pending) return;
        binding.pending = false;
        clearTimeout(binding.slowTimer);
        binding.slowTimer = null;
        // Counted in an epoch that is over (a server's previous request): its counts went with it.
        if (binding.epoch !== this.epoch) {
            if (binding.slow) {
                binding.slow = false;
                binding.onSlow?.(false);
            }
            binding.onPending?.(false);
            return;
        }
        if (binding.slow) {
            binding.slow = false;
            this.count("slow", -1);
            binding.onSlow?.(false);
        }
        this.count("pending", -1);
        binding.onPending?.(false);
    }

    // Like capture, but a throwing callback still yields the paths it read before it threw, so a
    // binding that failed can wake again when they change. Returns { dependencies, value, error }.
    tryCapture(callback) {
        const previousDependencies = this.activeDependencies;
        const dependencies = new Set();
        this.activeDependencies = dependencies;
        try {
            return { dependencies, value: callback(), error: null };
        } catch (error) {
            return { dependencies, value: undefined, error };
        } finally {
            this.activeDependencies = previousDependencies;
        }
    }

    capture(callback) {
        const previousDependencies = this.activeDependencies;
        const dependencies = new Set();
        this.activeDependencies = dependencies;

        try {
            const value = callback();
            if (this.devMode && dependencies.size === 0) {
                console.warn("StateManager: a reactive function read no state paths, so it will never re-run. " + "Read values with getState(path) instead of closing over them.", callback);
            }
            return { dependencies, value };
        } finally {
            this.activeDependencies = previousDependencies;
        }
    }

    // Subscribes `callback` to every path in `paths`. Returns an unsubscribe function.
    subscribe(paths, callback) {
        for (const path of paths) this.addSubscription(path, callback);
        return () => {
            for (const path of paths) this.removeSubscription(path, callback);
        };
    }

    // Moves `callback` from the paths in `previous` (a Set, or null) to those in `next` (a Set, or null
    // to drop everything), touching only the paths that differ. A binding whose reads did not change
    // between runs — the common case — costs nothing here. Returns `next`.
    resubscribe(callback, previous, next) {
        if (previous) {
            for (const path of previous) if (!next?.has(path)) this.removeSubscription(path, callback);
        }
        if (next) {
            for (const path of next) if (!previous?.has(path)) this.addSubscription(path, callback);
        }
        return next;
    }

    addSubscription(path, callback) {
        let callbacks = this.subscribers.get(path);
        if (!callbacks) {
            callbacks = new Set();
            this.subscribers.set(path, callbacks);
            if (path.includes("*")) {
                this.wildcards.set(path, callbacks);
            } else {
                let node = this.trie;
                for (const segment of this.getPathSegments(path)) {
                    let child = node.children?.get(segment);
                    if (!child) {
                        child = { parent: node, segment, children: null, callbacks: null };
                        node.children = node.children ?? new Map();
                        node.children.set(segment, child);
                    }
                    node = child;
                }
                // Each spelling of one path ("a.b", "a..b", ".a.b") keeps its own set, and all of them end here.
                (node.callbacks ??= new Set()).add(callbacks);
            }
        }
        callbacks.add(callback);
    }

    removeSubscription(path, callback) {
        const callbacks = this.subscribers.get(path);
        if (!callbacks) return;
        callbacks.delete(callback);
        if (callbacks.size) return;
        this.subscribers.delete(path);
        if (path.includes("*")) {
            this.wildcards.delete(path);
            return;
        }
        let node = this.trie;
        // Its node is there: no node is pruned while any spelling of its path is subscribed.
        for (const segment of this.getPathSegments(path)) node = node.children.get(segment);
        node.callbacks.delete(callbacks);
        if (node.callbacks.size) return; // another spelling of the path is still subscribed
        node.callbacks = null;
        // Prune the now-empty tail so the trie stays as small as the live subscriptions.
        while (node.parent && node.callbacks === null && !node.children?.size) {
            node.parent.children.delete(node.segment);
            if (node.parent.children.size === 0) node.parent.children = null;
            node = node.parent;
        }
    }

    // Does a write to `changedPath` wake a subscriber of `subscriberPath`?
    // True when they are equal or the changed path is an ancestor of the subscriber path.
    // Subscriber paths may contain "*" segments, each matching exactly one segment.
    isAffected(subscriberPath, changedPath) {
        if (!changedPath) return true;
        if (!subscriberPath.includes("*")) {
            return subscriberPath === changedPath || subscriberPath.startsWith(`${changedPath}.`);
        }
        const subscriberSegments = this.getPathSegments(subscriberPath);
        const changedSegments = this.getPathSegments(changedPath);
        if (changedSegments.length > subscriberSegments.length) return false;
        for (let index = 0; index < changedSegments.length; index += 1) {
            const expected = subscriberSegments[index];
            if (expected !== "*" && expected !== changedSegments[index]) return false;
        }
        return true;
    }

    // Groups writes: state is updated eagerly (reads inside see the new values), but subscribers are
    // notified once, synchronously, when the outermost batch exits — each affected callback runs a
    // single time however many of its paths were written. Returns whatever `fn` returns.
    batch(fn) {
        this.batchDepth += 1;
        try {
            return fn();
        } finally {
            this.batchDepth -= 1;
            if (this.batchDepth === 0 && this.batchedPaths.size) this.run([]);
        }
    }

    drainBatched() {
        const paths = Array.from(this.batchedPaths);
        this.batchedPaths.clear();
        return paths;
    }

    // A write to `changedPath` wakes subscribers of that exact path and of any path beneath it.
    // It does NOT bubble up: subscribers of a parent path only re-run when the parent itself is written.
    notify(changedPath) {
        if (this.batchDepth > 0) {
            this.batchedPaths.add(changedPath);
            return;
        }
        this.run([changedPath]);
    }

    // A write to `changedPath` wakes the subscribers of that path and of every path beneath it — which is
    // exactly the subtree under `changedPath` in the trie. So a pass costs the size of what is affected,
    // not the number of subscriptions in the app: a write to "todos.3.completed" never looks at the
    // bindings of the other rows. Only wildcard subscribers ("*" segments, from compute's watch) are
    // scanned, since a "*" can't be located as a fixed node; there are few of those.
    affected(changedPaths) {
        const found = { computedCallbacks: new Set(), otherCallbacks: new Set() };
        const { computedCallbacks, otherCallbacks } = found;
        for (const marked of changedPaths) {
            // An EXACT path (a container whose shape changed) wakes that node's own subscribers only.
            const exact = marked.startsWith(EXACT);
            const changedPath = exact ? marked.slice(EXACT.length) : marked;
            let node = this.trie;
            if (changedPath) {
                for (const segment of this.getPathSegments(changedPath)) {
                    node = node.children?.get(segment);
                    if (!node) break;
                }
            }
            if (node && exact) {
                for (const callbacks of node.callbacks ?? []) wakeInto(found, callbacks);
            } else if (node) collectInto(found, node);
        }
        if (this.wildcards.size !== 0) this.wakeWildcards(found, changedPaths);
        return found;
    }

    // The wildcard subscribers ("*" segments) a pass wakes: scanned, as a "*" has no node of its own.
    wakeWildcards(found, changedPaths) {
        for (const [path, callbacks] of this.wildcards) {
            const hit = changedPaths.some((marked) => (marked.startsWith(EXACT)
                ? this.isAffected(path, marked.slice(EXACT.length)) && this.getPathSegments(path).length === this.getPathSegments(marked.slice(EXACT.length)).length
                : this.isAffected(path, marked)));
            if (hit) wakeInto(found, callbacks);
        }
    }

    // One glitch-free notification pass. Writes made by callbacks are queued rather than delivered at once:
    // first every affected computed refreshes (repeating until their writes stop producing new paths), then
    // each affected ordinary binding runs once — so a binding never sees a derived value that is about to
    // change in the same pass. Writes made by the bindings start another pass.
    // A computed may run more than once per pass: if a computed that ran later writes a path it reads, it
    // must go again (a diamond: A reads x and b, B reads x and produces b). Since a computed only re-writes
    // when its value actually changed, this settles on its own; the guard catches genuine cycles.
    // Runs one subscriber. A throw is collected, not propagated: every other subscriber of the same
    // change still runs, and the first error is rethrown once the pass is complete — so a bug in one
    // binding cannot leave the rest of the page showing the previous state.
    guard(callback, failures) {
        try {
            callback();
        } catch (error) {
            failures.push(error);
        }
    }

    run(initialPaths) {
        this.batchDepth += 1;
        let rounds = 0;
        const failures = [];
        try {
            let pending = [...initialPaths, ...this.drainBatched()];
            while (pending.length) {
                const changedPaths = [];
                const otherCallbacks = new Set();
                // Computed phase: settle derived state completely.
                while (pending.length) {
                    rounds += 1;
                    if (rounds > MAX_NOTIFY_DEPTH) {
                        throw new Error(`StateManager: reactive loop detected while setting "${pending[0]}" (a binding or computed writes to a path it depends on)`);
                    }
                    changedPaths.push(...pending);
                    const found = this.affected(pending);
                    for (const callback of found.otherCallbacks) otherCallbacks.add(callback);
                    for (const callback of found.computedCallbacks) this.guard(callback, failures);
                    pending = this.drainBatched();
                }
                // Binding phase: everything that was affected, once, in creation order — a parent re-renders
                // (and disposes its children) before a child could run against a state it no longer belongs to.
                if (otherCallbacks.size === 1) {
                    for (const callback of otherCallbacks) this.guard(callback, failures);
                } else if (otherCallbacks.size > 1) {
                    for (const callback of [...otherCallbacks].sort(byOrder)) this.guard(callback, failures);
                }
                for (const changedPath of changedPaths) this.onChange?.(changedPath.startsWith(EXACT) ? changedPath.slice(EXACT.length) : changedPath);
                pending = this.drainBatched();
            }
        } finally {
            this.batchDepth -= 1;
        }
        if (failures.length) {
            if (failures.length > 1 && this.devMode) console.error(`StateManager: ${failures.length} subscribers threw during one change; rethrowing the first`, failures);
            throw failures[0];
        }
    }
}
// What a devtools panel reads from a page whose instance is in devMode: a feature, given to the
// instance as `features: { devtools: Devtools }`, which installs itself on the instance it is given.
// `hydrate` gives it when the page's instance is in devMode, importing this module only then
// (`import("./devtools.js")`), so a page with devMode off never downloads it; nothing a browser runs
// imports it statically (tests/boundary.test.mjs). An instance without devMode, and a server
// instance, are refused with a TypeError: one renders every request, and nothing about it is a page's.
//
// It registers the instance in a registry on `window` (`__JURIS_DEVTOOLS__`, shared by every copy
// of this module in the page, and announced with a `juris:devtools` event), and answers a versioned,
// read-only, synchronous request protocol there, which a Chrome DevTools panel reaches through
// `chrome.devtools.inspectedWindow.eval`: every answer is JSON, since that is all such an eval
// returns. The page sends nothing on its own; what leaves it is an answer to a request.
//
// What it records it takes by replacing methods on the one instance it is given (the state
// manager's stamp, compute, tryCapture, resubscribe, run, affected and guard; the renderer's
// bindState and mount), each calling the method it replaced with what it was given. Nothing on a
// prototype changes, so an instance without the feature runs exactly the code it ran before
// (tests/core.test.mjs holds it), and there is no devMode check on any path a write or a draw takes.
//
// Kept from the start, with or without a panel: a record of every live binding and computed (what it
// draws, for which component), and the changed paths and the cause of the last 200 notification
// passes. A binding's reads are not copied: they are read from the state manager's subscriptions
// when asked. Kept only while a connection subscribes: the timeline (every write, every callback of
// a pass timed) and the component tree's changes. REFERENCE.md, "devtools.js", is the contract.

// The protocol this module speaks. A panel reads it in `hello` and in the registry's `list()`.
export const PROTOCOL = 1;

// The registry's shape, which never changes, so every copy of this module (two builds in one page)
// can register in the first one's: `registry`, `list()`, `get(id)`, `register({ id, endpoint, describe })`.
const REGISTRY = 1;
const REGISTRY_NAME = "__JURIS_DEVTOOLS__";
const REGISTERED = "juris:devtools";
// The core's version, as `hello` and `list()` name it: package.json's (tests/core.test.mjs holds the two).
const JURIS_VERSION = "0.93.0";
// The `v` of this module's own URL: the code id the kit's module server stamps every import with
// (server/modules.js), or null where nothing stamped it.
const CODE_ID = new URL(import.meta.url).searchParams.get("v");

const TOPICS = Object.freeze(["tree", "timeline"]);
// What is kept: passes in the ring, changed paths per pass, a pass's writes and callbacks, a
// connection's queue, and the passes a binding remembers running in (while the timeline records).
const KEPT = Object.freeze({ passes: 200, changed: 50, writes: 50, ran: 500, queue: 2000, bindingPasses: 20 });
// How values are cut (D8): a string's characters, an array's items, an object's keys, the depth
// (3 unless asked, 8 at most), and how many items or keys a request may ask for at once.
const LIMITS = Object.freeze({ string: 1000, items: 100, keys: 200, depth: 3, deepest: 8, count: 1000 });
const MIB = 1024 * 1024;
const IDLE_MS = 30_000;
// How state-manager.js marks a changed path whose shape changed (a key came or went), among the
// paths of a pass: it wakes that node's own readers only. Shown without it.
const EXACT = "\u0001";
// The key a truncated object's last entry goes under: `{ "$": "more", path, keys }`.
const MORE_KEY = "\u2026"; // …

const CLEAR = Object.freeze({ kind: "clear" });
const MOUNT = Object.freeze({ kind: "mount" });
const OTHER = Object.freeze({ kind: "other" });
const NO_RECT = Object.freeze({ left: 0, top: 0, width: 0, height: 0 });

const now = () => performance.now();
const isNode = (value) => typeof globalThis.Node === "function" && value instanceof globalThis.Node;
const byId = (a, b) => a.id - b.id;
const unref = (timer) => {
    timer?.unref?.(); // Node's timers keep a process alive; a browser's are numbers
    return timer;
};
const nextFrame = (fn) => (typeof globalThis.requestAnimationFrame === "function" ? globalThis.requestAnimationFrame(fn) : unref(setTimeout(fn, 16)));
const errorOf = (error) => ({ name: String(error?.name ?? "Error"), message: String(error?.message ?? error).slice(0, LIMITS.string) });
const join = (path, key) => (path === "" ? String(key) : `${path}.${key}`);
// An own property, whatever its name (`__proto__` included), on an answer's object.
const put = (object, key, value) => Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });

// Thrown inside a request, answered as `{ ok: false, error: { code, message } }`.
class Refusal {
    constructor(code, message) {
        this.code = code;
        this.message = message;
    }
}
const refuse = (code, message) => {
    throw new Refusal(code, message);
};
const failure = (code, message) => ({ ok: false, error: { code, message } });

// One live binding or computed. `node` is the element it draws on (a property, a class, a style,
// children), `where` the node a seat or a root draws into now, or the getter of it, `applied` how
// many values it has applied, and `pending` the promise it returned that has not settled, or null.
class BindingRecord {
    constructor(kind, key, part, node, where, owner, path) {
        this.id = 0;
        this.kind = kind;
        this.key = key;
        this.part = part;
        this.node = node;
        this.where = where;
        this.owner = owner;
        this.path = path;
        this.applied = 0;
        this.lastPass = null;
        this.pending = null;
        this.passes = null;
    }
}

// What the renderer's label says a binding draws (DOMRenderer.bindState's `key` and `part`): a
// layout key (`classList` with its key as `part`), or a seat's or a root's symbol, whose `part` is the
// node it draws into or the getter of it. Without a label it is `bindState` called directly.
function labelOf(target, key, part, owner) {
    if (typeof key === "symbol") return new BindingRecord(key.description, null, null, null, part, owner, null);
    const node = typeof target === "function" ? target() : (target ?? null);
    if (key === "classList") return new BindingRecord("class", key, part, node, null, owner, null);
    if (key === "style" || key === "children") return new BindingRecord(key, key, null, node, null, owner, null);
    return typeof key === "string" ? new BindingRecord("property", key, null, node, null, owner, null) : new BindingRecord("other", null, null, node, null, owner, null);
}

// The preloaded calls the page arrived with: their keys, and the words of each failure as the page
// carries them (the server's exposeError has decided those already), never the answers.
function preloadsOf(calls) {
    if (calls === null || typeof calls !== "object") return [];
    return Object.keys(calls).map((key) => {
        const entry = calls[key];
        const failed = entry !== null && typeof entry === "object" && "$error" in entry;
        return { key, service: key.slice(0, key.indexOf(":")), ok: !failed, message: failed ? String(entry.$error) : null };
    });
}

// The page's #juris-dev, which the kit writes in development: `{ render }`, or null without one.
function devChannel() {
    const document = globalThis.document;
    const scripts = typeof document?.querySelectorAll === "function" ? document.querySelectorAll('script[type="application/json"]') : [];
    for (const script of scripts) {
        if (script.id !== "juris-dev") continue;
        try { const data = JSON.parse(script.textContent); return { render: typeof data?.render === "string" ? data.render : null }; } catch { return { render: null }; }
    }
    return null;
}

function makeRegistry() {
    const entries = new Map(); // id -> { id, endpoint, describe }
    return Object.freeze({
        registry: REGISTRY,
        list: () => Array.from(entries.values(), (entry) => entry.describe()),
        get: (id) => entries.get(id)?.endpoint ?? null,
        register: (entry) => {
            entries.set(entry.id, entry);
        },
    });
}

// Whether a write at `changed` (or a shape change at `exact`) wakes a reader of `read`, as the state
// manager's `affected` decides: the path itself, one above it, or the root; a `*` matches a segment.
function wokeRead(read, { changed, exact }, sm) {
    if (changed.has("") || changed.has(read) || exact.has(read)) return true;
    if (read.includes("*")) {
        const depth = sm.getPathSegments(read).length;
        return [...changed].some((path) => sm.isAffected(read, path)) || [...exact].some((path) => sm.isAffected(read, path) && sm.getPathSegments(path).length === depth);
    }
    for (let dot = read.indexOf("."); dot !== -1; dot = read.indexOf(".", dot + 1)) if (changed.has(read.slice(0, dot))) return true;
    return false;
}

// A value as JSON (D8), read raw: a tracking proxy is read through its target, never through a trap,
// and an accessor is named, never called, so nothing read for the panel is ever a dependency.
// `state`: the value is the state's, at `path`, and a private root under the root is counted, never
// sent. `props`: a component's props, whose functions are getters, or listeners when named `on…`.
class Encoder {
    constructor(devtools, { depth, from = 0, count = null, state = false, props = false }) {
        this.devtools = devtools;
        this.depth = depth;
        this.from = from;
        this.count = count;
        this.state = state;
        this.props = props;
        this.seen = null; // object -> the path it was first sent at, made for the first object
    }

    value(value, path, level, key = "") {
        switch (typeof value) {
            case "string": return value.length > LIMITS.string ? { $: "string", head: value.slice(0, LIMITS.string), length: value.length } : value;
            case "number": return Number.isFinite(value) ? value : { $: "number", text: String(value) };
            case "boolean": return value;
            case "undefined": return { $: "undefined" };
            case "bigint": return { $: "bigint", text: String(value) };
            case "symbol": return { $: "symbol", text: String(value) };
            case "function": return { $: "function", name: value.name, kind: this.props && level === 1 ? (key.startsWith("on") ? "listener" : "getter") : "function" };
        }
        if (value === null) return null;
        const { sm, juris } = this.devtools;
        const raw = sm.toRaw(value);
        if (isNode(raw)) return this.devtools.handle(raw);
        if (sm.isSettled(raw)) return "error" in raw ? { $: "settled", error: errorOf(raw.error) } : { $: "settled", value: this.value(raw.value, path, level) };
        if (sm.isThenable(raw)) return { $: "promise" };
        if (juris.isRef(raw)) return { $: "ref", path: raw.path };
        if (raw instanceof Date) return { $: "date", iso: Number.isNaN(raw.getTime()) ? null : raw.toISOString() };
        if (raw instanceof Error) return { $: "error", ...errorOf(raw) };
        this.seen ??= new Map();
        if (this.seen.has(raw)) return { $: "cycle", path: this.seen.get(raw) };
        if (level >= this.depth) return { $: "more", path };
        this.seen.set(raw, path);
        if (Array.isArray(raw)) return this.items(raw, path, level);
        if (raw instanceof Map) return { $: "map", size: raw.size, entries: this.collection(raw, path, level, ([k, v], index) => [this.value(k, join(path, index), level + 1), this.value(v, join(path, index), level + 1)]) };
        if (raw instanceof Set) return { $: "set", size: raw.size, items: this.collection(raw, path, level, (item, index) => this.value(item, join(path, index), level + 1)) };
        const prototype = Object.getPrototypeOf(raw);
        const entries = this.entries(raw, path, level);
        if (prototype !== Object.prototype && prototype !== null) return { $: "instance", of: typeof prototype.constructor === "function" ? prototype.constructor.name : "Object", entries };
        // An object of the state's own with a "$" key would read as one of these shapes: it is wrapped.
        return Object.hasOwn(entries, "$") ? { $: "object", entries } : entries;
    }

    // An array: `count` items (100 unless asked) from `from` at the top, 100 from the first below
    // it, then `more`.
    items(raw, path, level) {
        const from = level === 0 ? this.from : 0;
        const end = Math.min(raw.length, from + (level === 0 ? (this.count ?? LIMITS.items) : LIMITS.items));
        const out = [];
        for (let index = from; index < end; index += 1) out.push(this.value(raw[index], join(path, index), level + 1));
        if (end < raw.length) out.push({ $: "more", path, length: raw.length });
        return out;
    }

    // A Map's entries or a Set's items, the first 100, then `more`.
    collection(raw, path, level, each) {
        const out = [];
        for (const item of raw) {
            if (out.length === LIMITS.items) return [...out, { $: "more", path, length: raw.size }];
            out.push(each(item, out.length));
        }
        return out;
    }

    // An object's own enumerable keys, paged as an array's items are: `count` (200 unless asked)
    // from `from` at the top, the first 200 below it, then `more` under MORE_KEY.
    entries(raw, path, level) {
        const keys = Object.keys(raw);
        const from = level === 0 ? this.from : 0;
        const end = Math.min(keys.length, from + (level === 0 ? (this.count ?? LIMITS.keys) : LIMITS.keys));
        const out = {};
        for (const key of keys.slice(from, end)) {
            const descriptor = Object.getOwnPropertyDescriptor(raw, key);
            const at = join(path, key);
            if (this.state && path === "" && this.devtools.hidden.has(key)) put(out, key, this.devtools.privateValue(descriptor.value));
            else if ("value" in descriptor) put(out, key, this.value(descriptor.value, at, level + 1, key));
            else put(out, key, { $: "function", name: descriptor.get?.name ?? "", kind: "getter" });
        }
        if (end < keys.length) put(out, MORE_KEY, { $: "more", path, keys: keys.length });
        return out;
    }
}

// A value's paging, as `state` and `component` take it: `depth` levels, and at the top `count`
// items or keys (100 or 200 unless asked, 1,000 at most) from `from`.
function checkPaging(depth, from, count) {
    if (!Number.isInteger(depth) || depth < 0 || depth > LIMITS.deepest) refuse("bad-params", `depth is a whole number, 0 to ${LIMITS.deepest}`);
    if (!Number.isInteger(from) || from < 0) refuse("bad-params", "from is a whole number, 0 or more");
    if (count !== undefined && (!Number.isInteger(count) || count < 1 || count > LIMITS.count)) refuse("bad-params", `count is a whole number, 1 to ${LIMITS.count}`);
}

// The protocol's requests: `this` is the feature, `connection` the asking one, `params` an object.
const METHODS = {
    __proto__: null,

    hello() {
        return { protocol: PROTOCOL, juris: JURIS_VERSION, codeId: CODE_ID, id: this.juris.devIndex ?? null, mounted: this.mounted, dev: this.dev, topics: [...TOPICS], privateRoots: [...this.hidden] };
    },

    subscribe(connection, { topic }) {
        if (!TOPICS.includes(topic)) refuse("bad-params", `topic is one of ${TOPICS.join(", ")}`);
        if (!connection.topics.has(topic)) {
            connection.topics.add(topic);
            this.subscribed(topic);
        }
        return { topic };
    },

    unsubscribe(connection, { topic }) {
        if (!TOPICS.includes(topic)) refuse("bad-params", `topic is one of ${TOPICS.join(", ")}`);
        if (connection.topics.delete(topic)) this.unsubscribed(topic);
        return { topic };
    },

    tree() {
        return this.treeNodes();
    },

    // With `path` ("props", or the path a `more` inside the props names), the props' value there,
    // read as `state` reads the state's.
    component(connection, { id, path, depth = LIMITS.depth, from = 0, count }) {
        const instance = this.instanceById(id);
        if (path !== undefined) {
            if (typeof path !== "string" || !/^props(\.|$)/.test(path) || path.split(".").includes("__proto__")) refuse("bad-params", 'path is "props", or a path inside them a more names');
            checkPaging(depth, from, count);
            const value = path.split(".").slice(1).reduce((at, key) => this.ownValue(at, key), instance.props);
            return this.value(value, path, depth, { from, count, props: path === "props" });
        }
        const local = instance.local === undefined ? null : {
            path: instance.local,
            values: this.value({ ...instance.localDefaults, ...this.sm.toRaw(this.sm.peek(instance.local)) }, instance.local, LIMITS.depth),
        };
        return {
            ...this.treeNode(instance, instance.parent ?? null),
            props: this.value(instance.props, "props", LIMITS.depth, { props: true }),
            local,
            children: Array.from(instance.children ?? [], (child) => child.id),
            bindings: [...this.live.values()].filter((record) => record.owner === instance).map((record) => record.id),
        };
    },

    components(connection, { name }) {
        if (typeof name !== "string") refuse("bad-params", "name is a component's name, a string");
        return this.juris.findComponents(name).map((instance) => instance.id);
    },

    node(connection, params) {
        const node = this.nodeParam(params.node);
        const records = [...this.live.values()].filter((record) => this.nodeOf(record) === node);
        const last = records.reduce((latest, record) => Math.max(latest, record.lastPass ?? 0), 0);
        return { node: this.handle(node), roots: this.rootsOf(node), owner: this.ownerOf(node), bindings: this.describe(records), lastPass: this.summaryOf(this.passById(last)) };
    },

    binding(connection, { id }) {
        const record = this.live.get(id);
        if (record === undefined) refuse("no-such-binding", `no live binding ${JSON.stringify(id)}`);
        const [out] = this.describe([record]);
        const ids = new Set(record.passes ?? []);
        if (record.lastPass !== null) ids.add(record.lastPass);
        out.passes = [...ids].sort((a, b) => a - b).map((pass) => this.summaryOf(this.passById(pass))).filter((summary) => summary !== null);
        return out;
    },

    wakes(connection, { path }) {
        if (typeof path !== "string") refuse("bad-params", "path is a state path, a string");
        const { computedCallbacks, otherCallbacks } = this.affectedBy([path]);
        const recordsOf = (callbacks) => Array.from(callbacks, (callback) => this.records.get(callback)).filter(Boolean).sort(byId);
        return { computeds: this.describe(recordsOf(computedCallbacks)), bindings: this.describe(recordsOf(otherCallbacks)) };
    },

    state(connection, { path = "", depth = LIMITS.depth, from = 0, count }) {
        if (typeof path !== "string" || path.split(".").includes("__proto__")) refuse("bad-params", "path is a state path, a string");
        checkPaging(depth, from, count);
        const root = this.hiddenRoot(path);
        if (root !== null) return this.privateValue(this.sm.state[root]);
        return this.value(path === "" ? this.sm.state : this.sm.peek(path), path, depth, { from, count, state: true });
    },

    passes(connection, { since = 0 }) {
        if (typeof since !== "number") refuse("bad-params", "since is a pass's id, a number");
        return this.ring.filter((pass) => pass.id > since).sort(byId).map((pass) => this.summaryOf(pass));
    },

    preloads() {
        return this.preloads.map((entry) => ({ ...entry }));
    },

    highlight(connection, params) {
        const target = params.node !== undefined ? this.nodeParam(params.node) : params.component !== undefined ? (this.instanceById(params.component).root ?? null) : null;
        this.outline(target);
        return {};
    },

    pick(connection, { on }) {
        if (typeof on !== "boolean") refuse("bad-params", "on is true or false");
        if (on) this.startPick(connection);
        else this.stopPick();
        return { on };
    },
};

export class Devtools {
    constructor(juris) {
        if (!juris?.devMode) throw new TypeError("Devtools: the devtools feature is for an instance in devMode (new Juris({ devMode: true }))");
        if (juris.isServer) throw new TypeError("Devtools: never on a server instance, which renders every request: nothing about it is one page's");
        this.juris = juris;
        this.sm = juris.stateManager;
        this.renderer = juris.renderer;
        // Private roots but the async one, whose paths are counted, never listed (D14): `$server`,
        // which never reaches a browser, and the app's own `privatePaths`. The async root is the
        // browser's own bookkeeping, and is read like the rest of the state.
        this.hidden = new Set([...juris.privatePaths].filter((root) => root !== this.sm.asyncPath));
        this.preloads = preloadsOf(this.sm.peek(`${juris.ssrPath}.calls`));
        this.dev = devChannel();

        // Bindings.
        this.sequence = 0;
        // What each binding costs is a record, an entry here and one in `records`: a node's bindings
        // are found by going through them, when asked (about 2,000 on a large page, once per click).
        this.live = new Map(); // binding id -> record, every live binding and computed, in creation order
        this.records = new WeakMap(); // a binding's callback (its refresh) -> its record
        this.labelled = null; // the renderer's binding being made, until the state manager stamps it
        this.awaiting = null; // a record just stamped: the next read is its first
        this.computing = null; // the path of the computed being made

        // Passes.
        this.pass = null; // the pass open now
        this.passSequence = 0;
        this.ring = []; // the last 200 passes, pass n at (n - 1) % 200: a pass costs no copy of the others
        this.current = null; // the record whose callback a pass is running now
        this.read = false; // whether that callback has read yet
        this.entry = null; // while the timeline records: the running callback's entry
        this.timeline = false;
        this.waiting = null; // the timeline's writes made since the last pass
        this.closedEvent = null; // the last pass's event: a write is told after the pass it caused
        this.framePasses = [];
        this.frameAsked = false;
        this.treeDue = false;
        this.mounting = 0;
        this.mounted = false;
        this.root = null;

        // Connections, node handles, the outline.
        this.connections = new Map();
        this.connectionSequence = 0;
        this.counts = { tree: 0, timeline: 0 };
        this.unobserve = null;
        this.untree = null;
        this.refs = new WeakMap(); // node -> ref
        this.nodes = new Map(); // ref -> WeakRef(node)
        this.refSequence = 0;
        this.pruneAt = 1024;
        this.box = null;
        this.picking = null;
        this.shallower = 0; // while a request's answer is encoded again to fit: how many levels fewer

        this.endpoint = Object.freeze({
            protocol: PROTOCOL,
            connect: () => this.connect(),
            request: (connection, method, params) => this.request(connection, method, params),
            drain: (connection) => this.drain(connection),
            disconnect: (connection) => this.disconnect(connection),
            // Not requests, since neither answer is JSON: for the console's inspect() (DevTools' Reveal),
            // the registered definition, and the node a handle names, or null.
            definition: (name) => (typeof name === "string" ? (this.juris.componentManager.get(name) ?? null) : null),
            node: (handle) => (handle !== null && typeof handle === "object" && handle.$ === "node" && Number.isInteger(handle.ref) ? (this.nodes.get(handle.ref)?.deref() ?? null) : null),
        });
        juris.devtools = this;
        this.install();
        this.register();
    }

    // ---- instrumentation: methods replaced on this instance only ---------------------------------

    install() {
        const { sm, renderer } = this;
        const { stamp, compute, tryCapture, resubscribe, run, affected, guard } = sm;
        const { bindState, mount } = renderer;
        this.affectedBy = (paths) => affected.call(sm, paths);
        sm.stamp = (callback) => this.stamped(stamp.call(sm, callback));
        sm.compute = (path, resolver, options) => {
            const outer = this.computing;
            this.computing = path;
            try {
                return compute.call(sm, path, resolver, options);
            } finally {
                this.computing = outer;
            }
        };
        sm.tryCapture = (callback) => this.captured(tryCapture, callback);
        sm.resubscribe = (callback, previous, next) => {
            this.resubscribing(callback, previous, next);
            return resubscribe.call(sm, callback, previous, next);
        };
        sm.run = (paths) => this.running(run, paths);
        sm.affected = (paths) => {
            if (this.pass !== null) this.changed(this.pass, paths);
            return affected.call(sm, paths);
        };
        sm.guard = (callback, failures) => this.guarded(guard, callback, failures);
        renderer.bindState = (resolver, applyValue, target, key, part) => {
            this.labelled = labelOf(target, key, part, renderer.owner);
            try {
                return bindState.call(renderer, resolver, applyValue, target, key, part);
            } finally {
                this.labelled = null;
            }
        };
        renderer.mount = (target, layout, namespace) => {
            this.mounting += 1;
            try {
                const root = mount.call(renderer, target, layout, namespace);
                if (!this.mounted) {
                    this.mounted = true;
                    this.root = typeof target === "string" ? target : (target?.getAttribute?.("id") || null);
                }
                return root;
            } finally {
                this.mounting -= 1;
            }
        };
    }

    // Every binding and computed is stamped once, before its first run: its record is made here (the
    // renderer's, labelled, made in its bindState) and kept until it is disposed.
    stamped(callback) {
        const owner = this.renderer.owner;
        let record = this.labelled;
        this.labelled = null;
        if (callback.isComputed === true) record = new BindingRecord("computed", null, null, null, null, owner, this.computing);
        else if (record === null) record = new BindingRecord("other", null, null, null, null, owner, null);
        record.id = ++this.sequence;
        record.lastPass = this.pass?.id ?? null;
        this.records.set(callback, record);
        this.live.set(record.id, record);
        this.awaiting = record;
        return callback;
    }

    // A resolver's run. Its first is right after its stamp; every other is inside a pass, the first
    // read of the callback the pass is running. What it answered says whether a value is applied now
    // (the state manager's settle), later (a promise, kept as pending until it settles), or never (it
    // threw, or answered a settled error).
    captured(tryCapture, callback) {
        let record = this.awaiting;
        if (record !== null) this.awaiting = null;
        else if (this.current !== null && !this.read) {
            record = this.current;
            this.read = true;
        }
        const entry = record !== null && record === this.current ? this.entry : null;
        const started = entry === null ? 0 : now();
        const result = tryCapture.call(this.sm, callback);
        if (entry !== null) entry.readMs = now() - started;
        if (record !== null) this.answered(record, result);
        return result;
    }

    answered(record, { value, error }) {
        record.pending = null;
        if (error !== null) return;
        const { sm } = this;
        const raw = sm.toRaw(value);
        if (!sm.isThenable(raw) || sm.isSettled(raw)) {
            if (!sm.isSettled(raw) || !("error" in raw)) record.applied += 1;
            return;
        }
        record.pending = raw;
        const settle = (applied) => () => {
            if (record.pending !== raw) return; // superseded by a later run
            record.pending = null;
            if (applied) record.applied += 1;
        };
        if (raw instanceof Promise) Promise.prototype.then.call(raw, settle(true), settle(false));
    }

    // `next` null is a disposal: the record goes. While the timeline records, a callback's own
    // re-subscription names what woke it: its previous reads that the pass changed.
    resubscribing(callback, previous, next) {
        if (next === null) this.forget(callback);
        else if (this.entry !== null && this.current !== null && previous !== null && this.records.get(callback) === this.current) this.entry.wokeBy = this.wokeBy(previous);
    }

    forget(callback) {
        const record = this.records.get(callback);
        if (record === undefined) return; // disposed already
        this.records.delete(callback);
        this.live.delete(record.id);
    }

    wokeBy(previous) {
        const woke = [];
        for (const read of previous) if (wokeRead(read, this.pass.timing, this.sm)) woke.push(read);
        return this.paths(woke.sort());
    }

    // ---- passes ---------------------------------------------------------------------------------

    running(run, paths) {
        if (this.pass !== null) return run.call(this.sm, paths); // a pass never opens inside one
        const pass = this.open(paths);
        try {
            return run.call(this.sm, paths);
        } finally {
            this.close(pass);
        }
    }

    open(paths) {
        const pass = { id: ++this.passSequence, at: now(), cause: this.causeOf(paths), changed: [], rounds: 0, timing: null };
        this.pass = pass;
        this.closedEvent = null;
        this.ring[(pass.id - 1) % KEPT.passes] = pass;
        if (this.timeline) {
            const { writes, writeCount } = this.waiting;
            pass.timing = { writes, writeCount, ran: [], ranCount: 0, changed: new Set(), exact: new Set() };
            this.waiting = { writes: [], writeCount: 0 };
        }
        return pass;
    }

    // What the pass is the consequence of, read as it opens.
    causeOf(paths) {
        if (paths.includes("") || this.sm.batchedPaths.has("")) return CLEAR;
        if (this.mounting > 0) return MOUNT;
        const event = globalThis.event; // a browser's, while a DOM event is being dispatched
        return event !== null && typeof event === "object" && typeof event.type === "string" ? { kind: "event", type: event.type, node: this.handle(event.target) } : OTHER;
    }

    close(pass) {
        this.pass = null;
        const timing = pass.timing;
        if (timing === null) return;
        pass.timing = null;
        const event = { type: "pass", at: pass.at, id: pass.id, cause: pass.cause, writes: timing.writes, writeCount: timing.writeCount, ran: timing.ran, ranCount: timing.ranCount, rounds: pass.rounds, ms: now() - pass.at };
        this.closedEvent = event;
        this.emit("timeline", event);
        this.framePasses.push(pass.id);
        this.askFrame();
    }

    // The paths of one round of a pass: the first 50 kept, and, while the timeline records, all of
    // them, for what woke each callback.
    changed(pass, paths) {
        pass.rounds += 1;
        const timing = pass.timing;
        for (const marked of paths) {
            if (timing === null && pass.changed.length >= KEPT.changed) return;
            const path = marked.startsWith(EXACT) ? marked.slice(EXACT.length) : marked;
            if (pass.changed.length < KEPT.changed && !pass.changed.includes(path)) pass.changed.push(path);
            if (timing !== null) (path === marked ? timing.changed : timing.exact).add(path);
        }
    }

    // One callback of a pass: the pass it last ran in, and, while the timeline records, its time.
    guarded(guard, callback, failures) {
        const record = this.records.get(callback) ?? null;
        const pass = this.pass;
        if (record !== null) record.lastPass = pass.id;
        this.current = record;
        this.read = false;
        const timing = pass.timing;
        if (timing === null) {
            guard.call(this.sm, callback, failures);
            this.current = null;
            return;
        }
        const entry = { binding: record === null ? null : record.id, ms: 0, readMs: 0, applyMs: 0, wokeBy: [], error: null };
        if (record !== null) {
            record.passes ??= [];
            record.passes.push(pass.id);
            if (record.passes.length > KEPT.bindingPasses) record.passes.shift();
        }
        this.entry = entry;
        const before = failures.length;
        const started = now();
        guard.call(this.sm, callback, failures);
        entry.ms = now() - started;
        entry.applyMs = entry.ms - entry.readMs;
        if (failures.length > before) entry.error = errorOf(failures[before]);
        this.entry = null;
        this.current = null;
        timing.ranCount += 1;
        if (timing.ran.length < KEPT.ran) timing.ran.push(entry);
    }

    // The timeline's observer: a write inside a batch or a pass belongs to the pass it is in, or the
    // next one; one told outside them is the write that caused the pass that just closed.
    observed(path, value, previous) {
        const log = this.sm.batchDepth > 0 ? (this.pass?.timing ?? this.waiting) : (this.closedEvent ?? this.waiting);
        log.writeCount += 1;
        const root = this.hiddenRoot(path);
        if (root !== null) {
            const counted = log.writes.find((write) => write.root === root);
            if (counted !== undefined) counted.count += 1;
            else if (log.writes.length < KEPT.writes) log.writes.push({ root, count: 1 });
            return;
        }
        if (log.writes.length >= KEPT.writes) return;
        log.writes.push({ path, value: this.value(value, path, 1, { state: true }), previous: this.value(previous, path, 1, { state: true }), deleted: value === undefined && !this.holds(path) });
    }

    // Whether the state has `path` (a key there, whatever it holds).
    holds(path) {
        const segments = this.sm.getPathSegments(path);
        const parent = this.sm.resolveParent(segments, false);
        return parent !== null && typeof parent === "object" && Object.hasOwn(parent, segments[segments.length - 1]);
    }

    passById(id) {
        const pass = Number.isInteger(id) && id > 0 ? this.ring[(id - 1) % KEPT.passes] : undefined;
        return pass?.id === id ? pass : null;
    }

    summaryOf(pass) {
        return pass === null ? null : { id: pass.id, at: pass.at, cause: pass.cause, changed: this.paths(pass.changed) };
    }

    // ---- what the protocol answers ----------------------------------------------------------------

    // Bindings as the protocol sends them, their reads inverted from the subscriptions, once (D7).
    describe(records) {
        const reads = new Map(records.map((record) => [record, []]));
        for (const [path, callbacks] of this.sm.subscribers) for (const callback of callbacks) reads.get(this.records.get(callback))?.push(path);
        return records.map((record) => ({
            id: record.id,
            kind: record.kind,
            key: record.key,
            part: record.part,
            node: this.handle(this.nodeOf(record)),
            component: record.owner?.id ?? null,
            path: record.path,
            reads: this.paths(reads.get(record).sort()),
            applied: record.applied,
            lastPass: record.lastPass,
            pending: record.pending !== null,
        }));
    }

    nodeOf(record) {
        return record.node ?? (typeof record.where === "function" ? record.where() : record.where) ?? null;
    }

    // Paths as the protocol lists them: those under a private root (but the async one) are counted,
    // one `{ root, count }` for each such root, never listed (D14).
    paths(list) {
        const out = [];
        for (const path of list) {
            const root = this.hiddenRoot(path);
            const counted = root === null ? undefined : out.find((entry) => entry.root === root);
            if (root === null) out.push(path);
            else if (counted !== undefined) counted.count += 1;
            else out.push({ root, count: 1 });
        }
        return out;
    }

    hiddenRoot(path) {
        const dot = path.indexOf(".");
        const root = dot === -1 ? path : path.slice(0, dot);
        return this.hidden.has(root) ? root : null;
    }

    // What `value` holds under `key`, read as the encoder reads it: raw, an own data property only.
    ownValue(value, key) {
        const raw = this.sm.toRaw(value);
        const descriptor = raw !== null && typeof raw === "object" ? Object.getOwnPropertyDescriptor(raw, key) : undefined;
        return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
    }

    privateValue(value) {
        return { $: "private", count: value !== null && typeof value === "object" ? Object.keys(value).length : 0 };
    }

    // A value as JSON (Encoder), `depth` levels deep (one fewer for each time a request's answer
    // was cut to fit: request).
    value(value, path, depth, options = {}) {
        // A value JSON carries as it is, which most writes are, needs no encoder.
        if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.length <= LIMITS.string)) return value;
        return new Encoder(this, { ...options, depth: Math.max(0, depth - this.shallower) }).value(value, path, 0);
    }

    // A node as a handle the panel can give back: its ref lasts as long as the node does.
    handle(node) {
        if (!isNode(node)) return null;
        let ref = this.refs.get(node);
        if (ref === undefined) {
            ref = ++this.refSequence;
            this.refs.set(node, ref);
            this.nodes.set(ref, new WeakRef(node));
            if (this.nodes.size > this.pruneAt) this.prune();
        }
        return { $: "node", ref, tag: node.nodeType === 1 ? node.localName : node.nodeType === 3 ? "#text" : String(node.nodeName ?? ""), id: node.nodeType === 1 ? node.getAttribute("id") : null };
    }

    prune() {
        for (const [ref, weak] of this.nodes) if (weak.deref() === undefined) this.nodes.delete(ref);
        this.pruneAt = Math.max(1024, this.nodes.size * 2);
    }

    nodeParam(value) {
        if (isNode(value)) return value;
        if (value === null || typeof value !== "object" || value.$ !== "node" || !Number.isInteger(value.ref)) refuse("bad-params", 'node is a node handle ({ "$": "node", ref }), or the node itself');
        const node = this.nodes.get(value.ref)?.deref();
        if (node === undefined) refuse("no-such-node", `node ${value.ref} is gone`);
        return node;
    }

    rootsOf(node) {
        return Array.from(this.juris.componentInstances.get(node) ?? [], (instance) => instance.id);
    }

    // The innermost component whose root holds `node`, or is it.
    ownerOf(node) {
        for (let at = node; at; at = at.parentNode) {
            const instances = this.juris.componentInstances.get(at);
            if (instances?.length) return instances[0].id;
        }
        return null;
    }

    treeNodes() {
        const out = [];
        const walk = (instance, parent) => {
            out.push(this.treeNode(instance, parent));
            for (const child of instance.children ?? []) walk(child, instance);
        };
        for (const root of this.juris.componentManager.roots) walk(root, null);
        return out;
    }

    treeNode(instance, parent) {
        return { id: instance.id, name: instance.name, key: this.value(instance.props?.key, "key", 1), parent: parent?.id ?? null, root: this.handle(instance.root ?? null), adopted: Boolean(instance.adopted) };
    }

    instanceById(id) {
        const found = typeof id === "number" ? this.findInstance(id) : null;
        if (found === null) refuse("no-such-component", `no live component ${JSON.stringify(id)}`);
        return found;
    }

    findInstance(id) {
        const pending = [...this.juris.componentManager.roots];
        while (pending.length) {
            const instance = pending.pop();
            if (instance.id === id) return instance;
            pending.push(...(instance.children ?? []));
        }
        return null;
    }

    // ---- connections ------------------------------------------------------------------------------

    connect() {
        const id = `c${++this.connectionSequence}`;
        const connection = { id, topics: new Set(), queue: [], dropped: 0, timer: null };
        this.connections.set(id, connection);
        this.touch(connection);
        return id;
    }

    // A connection that has not drained for 30 seconds is closed: a panel that went away leaves no
    // recording on.
    touch(connection) {
        clearTimeout(connection.timer);
        connection.timer = unref(setTimeout(() => this.disconnect(connection.id), IDLE_MS));
    }

    disconnect(id) {
        const connection = this.connections.get(id);
        if (connection === undefined) return false;
        clearTimeout(connection.timer);
        this.connections.delete(id);
        for (const topic of connection.topics) this.unsubscribed(topic);
        if (this.picking?.connection === connection) this.stopPick();
        if (this.connections.size === 0) this.outline(null);
        return true;
    }

    request(id, method, params) {
        const connection = this.connections.get(id);
        if (connection === undefined) return failure("no-connection", `no connection ${JSON.stringify(id)}: connect() again`);
        if (typeof method !== "string" || METHODS[method] === undefined) return failure("unknown-method", `${JSON.stringify(method)} is not a method of protocol ${PROTOCOL}`);
        // Nothing read for the panel is a dependency, even if the request is made inside a capture.
        const sm = this.sm;
        const { activeDependencies, activeReads } = sm;
        sm.activeDependencies = null;
        sm.activeReads = null;
        try {
            // An answer over 1 MiB of JSON is encoded again, one level shallower, until it fits.
            for (this.shallower = 0; ; this.shallower += 1) {
                const result = METHODS[method].call(this, connection, params !== null && typeof params === "object" ? params : {});
                if (this.shallower === LIMITS.deepest || JSON.stringify(result).length <= MIB) return this.shallower === 0 ? { ok: true, result } : { ok: true, result, cut: true };
            }
        } catch (error) {
            return error instanceof Refusal ? failure(error.code, error.message) : failure("failed", errorOf(error).message);
        } finally {
            this.shallower = 0;
            sm.activeDependencies = activeDependencies;
            sm.activeReads = activeReads;
        }
    }

    // What happened since the last drain, oldest first, at most 1 MiB of JSON (one event at least):
    // `more` says some is left queued, `dropped` how many a full queue pushed out. A connection that
    // is not open answers `closed`, and connects again.
    drain(id) {
        const connection = this.connections.get(id);
        if (connection === undefined) return { events: [], dropped: 0, closed: true };
        this.touch(connection);
        let size = 0;
        let count = 0;
        for (const event of connection.queue) {
            size += JSON.stringify(event).length + 1;
            if (count > 0 && size > MIB) break;
            count += 1;
        }
        const events = connection.queue.splice(0, count);
        const dropped = connection.dropped;
        connection.dropped = 0;
        return connection.queue.length > 0 ? { events, dropped, more: true } : { events, dropped };
    }

    push(connection, event) {
        if (connection.queue.length >= KEPT.queue) {
            connection.queue.shift();
            connection.dropped += 1;
        }
        connection.queue.push(event);
    }

    emit(topic, event) {
        for (const connection of this.connections.values()) if (connection.topics.has(topic)) this.push(connection, event);
    }

    subscribed(topic) {
        this.counts[topic] += 1;
        if (this.counts[topic] !== 1) return;
        if (topic === "tree") {
            this.untree = this.juris.onTreeChange(() => {
                this.treeDue = true;
                this.askFrame();
            });
            return;
        }
        this.timeline = true;
        this.waiting = { writes: [], writeCount: 0 };
        this.unobserve = this.sm.observe((path, value, previous) => this.observed(path, value, previous));
    }

    unsubscribed(topic) {
        this.counts[topic] -= 1;
        if (this.counts[topic] !== 0) return;
        if (topic === "tree") {
            this.untree();
            this.untree = null;
            this.treeDue = false;
            return;
        }
        this.unobserve();
        this.unobserve = null;
        this.timeline = false;
        this.waiting = null;
        this.closedEvent = null;
        this.framePasses = [];
    }

    // One animation frame for whatever is due: the passes since the last frame, and the tree.
    askFrame() {
        if (this.frameAsked) return;
        this.frameAsked = true;
        nextFrame(() => this.frame());
    }

    frame() {
        this.frameAsked = false;
        if (this.framePasses.length > 0) {
            this.emit("timeline", { type: "frame", at: now(), passes: this.framePasses });
            this.framePasses = [];
        }
        if (this.treeDue) {
            this.treeDue = false;
            this.emit("tree", { type: "tree", at: now(), nodes: this.treeNodes() });
        }
    }

    // ---- the registry -----------------------------------------------------------------------------

    register() {
        const id = this.juris.devIndex;
        if (id === undefined) return; // no window: nothing is exposed (juris.js, devMode)
        const window = globalThis.window;
        if (window[REGISTRY_NAME] === undefined) Object.defineProperty(window, REGISTRY_NAME, { value: makeRegistry() });
        const registry = window[REGISTRY_NAME];
        if (registry?.registry !== REGISTRY || typeof registry.register !== "function") {
            console.warn(`Juris: window.${REGISTRY_NAME} is not a registry this version knows (registry ${String(registry?.registry)}), so window.$juris[${id}] could not register for devtools`);
            return;
        }
        registry.register({ id, endpoint: this.endpoint, describe: () => ({ id, protocol: PROTOCOL, juris: JURIS_VERSION, codeId: CODE_ID, root: this.root }) });
        window.dispatchEvent?.(new CustomEvent(REGISTERED, { detail: { id } }));
    }

    // ---- the outline and the picker --------------------------------------------------------------

    // An outline over `node`, or none: drawn by the page, in a closed shadow root on a host appended
    // to the document element, outside the root Juris draws into, so no layout ever sees it. Styled
    // through the CSSOM, which no style-src policy refuses.
    outline(node) {
        if (node === null && this.box === null) return;
        this.box ??= this.makeBox();
        const style = this.box.style;
        if (node === null) {
            style.display = "none";
            return;
        }
        const element = node.nodeType === 1 ? node : node.parentNode;
        const rect = typeof element?.getBoundingClientRect === "function" ? element.getBoundingClientRect() : NO_RECT;
        Object.assign(style, { display: "block", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    }

    makeBox() {
        const host = document.createElement("div");
        host.setAttribute("data-juris-devtools", "outline");
        const shadow = typeof host.attachShadow === "function" ? host.attachShadow({ mode: "closed" }) : host;
        const box = document.createElement("div");
        Object.assign(box.style, {
            position: "fixed", pointerEvents: "none", zIndex: "2147483647", boxSizing: "border-box",
            border: "2px solid rgb(26, 115, 232)", background: "rgba(26, 115, 232, 0.15)", display: "none",
        });
        shadow.appendChild(box);
        document.documentElement.appendChild(host);
        return box;
    }

    // While on, the node under the pointer is outlined, and a click is kept from the page and sent to
    // the connection that turned it on as `picked`, which ends the pick.
    startPick(connection) {
        if (this.picking !== null) {
            this.picking.connection = connection;
            return;
        }
        const swallow = (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        };
        const listeners = {
            pointermove: (event) => this.outline(isNode(event.target) ? event.target : null),
            pointerdown: swallow,
            mousedown: swallow,
            pointerup: swallow,
            mouseup: swallow,
            click: (event) => {
                swallow(event);
                this.picked(event.target);
            },
        };
        this.picking = { connection, listeners };
        for (const [type, listener] of Object.entries(listeners)) document.addEventListener(type, listener, true);
    }

    stopPick() {
        if (this.picking === null) return;
        for (const [type, listener] of Object.entries(this.picking.listeners)) document.removeEventListener(type, listener, true);
        this.picking = null;
        this.outline(null);
    }

    picked(node) {
        const { connection } = this.picking;
        this.stopPick();
        if (isNode(node)) this.push(connection, { type: "picked", at: now(), node: this.handle(node), roots: this.rootsOf(node), owner: this.ownerOf(node) });
    }
}

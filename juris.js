import StateManager, { settled, settledError, pathSegment, MAX_ERROR_LOG } from "./state-manager.js";
import DOMRenderer, { startsUpperCase } from "./dom-renderer.js";
import ComponentManager from "./component-manager.js";
import { FallbackSignal, defaultExposeError, publicMessage } from "./errors.js";
import { liveKey, canAddress, CALL_KIND } from "./live-protocol.js";
import { allowedTags, allowedSchemes, classTokens } from "./html-safety.js";

// What a server's own calls hand a service as `this` (live-protocol.js, "who is calling"): the
// preload's, and a render's call nobody preloaded. Frozen and shared: they say what kind of call it
// is and nothing about who asked, which a request's context would.
const PRELOAD_CALL = Object.freeze({ [CALL_KIND]: "preload" });
const RENDER_CALL = Object.freeze({ [CALL_KIND]: "render" });

const DROPPED = Symbol("juris.dropped"); // what layoutFromData's walk answers for a node left out
const REF = Symbol("juris.ref"); // marks a prop that points at a state path

// The string renderer is not here: it is the kit's (juris-kit/server/ssr-renderer.js),
// so no browser downloads it. A server instance is given it as a feature, `features: { ssr:
// SSRRenderer }`, which installs itself as `ssrRenderer`; the kit's server does that for its own.
// Without it renderToString and renderRequest throw, saying so, markRender does nothing and
// renderTrace() is null: nothing else in the core reaches for it, and each trace hook reads
// `this.ssrRenderer?.trace`.
const NO_STRING_RENDERER = "rendering to a string is the kit's: features: { ssr: SSRRenderer }, from juris-kit/server/ssr-renderer.js";

let devInstances = 0; // devMode instances get window.$juris[1], [2], … for console inspection

// Thrown through a component tree when an error boundary that is still rendering wants its fallback
// shown. It lives in errors.js, which both renderers import as well (they catch what the core
// throws, by instanceof), and is re-exported here, where an app imports the core from.
export { FallbackSignal };

// The components every instance registers itself (registerBuiltins), by name, so that an app's own
// check of which components its pages draw can count them without keeping a copy of the list.
export const BUILTIN_COMPONENTS = Object.freeze(["Await"]);

// The options an app gives its instance through the server's kernel (createJurisServer) and the
// client boot (hydrate), which build the instance themselves: `juris`, the same object on both sides.
// They are what the two renderers draw beyond their defaults, and the components a page is drawn
// with, so a page's server and its browser must be given them alike, from one module both import, or
// the browser takes away on boot what the server drew (or draws what the server refused, or a
// component the server never had). Only these: the rest of the instance is the kernel's and the
// boot's to set (isServer, requirePreload, the state, the services). `sharedOptions(value, where)`
// checks them for either side, before anything is built or read, as the constructor would (anything
// else refused with a TypeError that names `where`), and answers the options to hand the instance.
export const SHARED_OPTIONS = Object.freeze(["allowTags", "allowSchemes", "allowInnerHTML", "components"]);
export function sharedOptions(value, where) {
    if (value === undefined) return {};
    if (value === null || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
        throw new TypeError(`${where}: juris is the instance's options, a plain object ({ ${SHARED_OPTIONS.join(", ")} })`);
    }
    for (const key of Object.keys(value)) {
        if (!SHARED_OPTIONS.includes(key)) throw new TypeError(`${where}: juris.${key} is not an option (${SHARED_OPTIONS.join(", ")})`);
    }
    allowedTags(value.allowTags);
    allowedSchemes(value.allowSchemes);
    innerHTMLAllowed(value.allowInnerHTML, where);
    componentEntries(value.components, `${where}: juris.components`);
    return Object.fromEntries(SHARED_OPTIONS.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]));
}

// The `components` option, as the [name, definition] pairs it registers, in order (the constructor
// registers each as registerComponent would, with its rules: a name already registered is refused).
// `where` begins each refusal ("Juris: components").
//   - An object names each definition by its key: { Header, Footer }, or { "Cart": CartView }. Any
//     name registerComponent takes.
//   - A list names each by its function's own name: [Header, Footer]. The kit's minifier never
//     renames a function, so the name in the source is the name in the browser. Only a name a
//     component's tag could be is taken (a capitalised one, as the renderers read a component's):
//     an anonymous function has none, a bound one is "bound Header", an anonymous default export is
//     "default", and a lower-case one would be drawn in place of the element of that name. Each is
//     refused, saying to name the function or use the object form.
// Anything else is refused: a Map, a class's instance, a string, a single function.
const COMPONENT_NAME = /^[A-Z][A-Za-z0-9_$]*$/;
const COMPONENTS_SHAPE = "is an object of components by name ({ Header, Footer }),"
    + " or a list of named functions ([Header, Footer])";
const OBJECT_FORM = "name the function, or use the object form, components: { Header: … }";

// How a list's entry that is no function is shown in its refusal.
function shownEntry(value) {
    if (typeof value === "string") return JSON.stringify(value);
    if (Array.isArray(value)) return "a list";
    if (value !== null && typeof value === "object") return "an object";
    return String(value);
}

function componentEntries(value, where) {
    if (value === undefined) return [];
    if (Array.isArray(value)) {
        return value.map((definition, index) => {
            const at = `${where}[${index}]`;
            if (typeof definition !== "function") {
                throw new TypeError(
                    `${at} is ${shownEntry(definition)}, not a component:`
                        + " a list holds named functions ([Header, Footer])",
                );
            }
            const { name } = definition;
            if (name === "") {
                throw new TypeError(
                    `${at} is a function with no name, and a list registers each by its function's name: ${OBJECT_FORM}`,
                );
            }
            if (!COMPONENT_NAME.test(name)) {
                throw new TypeError(
                    `${at} is a function named ${JSON.stringify(name)}, which is no component's name`
                        + ` (a capitalised name, such as Header): ${OBJECT_FORM}`,
                );
            }
            return [name, definition];
        });
    }
    if (value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
        return Object.entries(value);
    }
    throw new TypeError(`${where} ${COMPONENTS_SHAPE}`);
}

// Whether a layout may set `innerHTML` (the renderers read `juris.allowInnerHTML`): off unless the app
// says so, and only a boolean says so, since a string such as "false" would read as yes.
function innerHTMLAllowed(value, where) {
    if (value === undefined) return false;
    if (typeof value !== "boolean") throw new TypeError(`${where}: allowInnerHTML is true or false, not ${typeof value === "string" ? JSON.stringify(value) : String(value)}`);
    return value;
}

// A root of the state tree, as the options that name one take it: a non-empty name with no ".", since
// the code that reads them (serializeState, clearState, the boot's `state[routePath]`) reads the
// root's key, and a nested name would match nothing there, silently.
function isRootName(value) {
    return typeof value === "string" && value.length > 0 && !value.includes(".");
}

// A copy of the plain objects and arrays in `value`, everything else (a Date, a Map, a class
// instance, a function) kept as it is. For the state a request is rendered with: a server hands the
// same object to every request that asks (a cached lookup), and a component's write under it during
// one render must not reach the next, or the object's owner. An own `__proto__` key stays data.
function copyPlain(value, seen = new Map()) {
    if (value === null || typeof value !== "object") return value;
    const prototype = Object.getPrototypeOf(value);
    const array = Array.isArray(value);
    if (!array && prototype !== Object.prototype && prototype !== null) return value;
    if (seen.has(value)) return seen.get(value);
    const copy = array ? [] : {};
    seen.set(value, copy);
    for (const key of Object.keys(value)) {
        Object.defineProperty(copy, key, { value: copyPlain(value[key], seen), writable: true, enumerable: true, configurable: true });
    }
    return copy;
}

// A preloaded answer as the page will carry it: a JSON round trip, the honest copy, since that is
// what the browser gets. A service may answer the same object every time (master data it caches);
// the render writes into the copy, and the service's object stays the service's.
const asTransferred = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

// What the renderers may do with a capitalised tag no component is registered under (see
// unknownComponent): the `unknownComponents` option.
const UNKNOWN_COMPONENTS = Object.freeze(["element", "warn", "throw"]);

// A layout is one { tag: content } object. A list where one goes is refused in words that name what
// gave it, when the renderer knows (Juris.oneLayout): a component's result, or the value of a function
// in one child's place (a seat). Anywhere else (a list inside a list of children, one given to render)
// getLayoutEntry refuses it in words that name nothing. A list as `children`, or a function's there
// (`children: () => [...]`), is the children, and fine.
const ONE_LAYOUT = "Juris: a layout is one { tag: content } object";
const LIST_GIVEN = {
    component: `${ONE_LAYOUT}; a component cannot return an array: wrap the children in an element`,
    seat: `${ONE_LAYOUT}; a function in one child's place returned a list:`
        + " make the function the children itself (children: () => [...]), or wrap the items in an element",
    layout: `${ONE_LAYOUT}, and a list was given where one goes: wrap the items in an element`,
};

// A preloaded call's answer in `calls` (the preload's `{ key: answer }`), or undefined when that call
// was not preloaded or failed. A failure is kept as `{ $error }` so the browser can reproduce it
// (`call`); it is not an answer to read.
function answerIn(calls, key) {
    if (!calls || !Object.hasOwn(calls, key)) return undefined;
    const entry = calls[key];
    return isFailure(entry) ? undefined : entry;
}

const isFailure = (entry) => entry !== null && typeof entry === "object" && "$error" in entry;

// What `call` answers for a service it ran: a promise (any thenable) as the service gave it, and an
// answer given at once, by a local service that is not async (a test's, a server's own), as a
// settled value, which runs its callbacks at once as a preloaded call's does; a throw is a settled
// rejection. The bare value used to be handed back, so `api.call(…).then(…)` threw a TypeError,
// and a throw went past the caller's `catch`.
function answerOf(run) {
    let answer;
    try {
        answer = run();
    } catch (error) {
        return settledError(error);
    }
    const thenable = answer !== null
        && (typeof answer === "object" || typeof answer === "function")
        && typeof answer.then === "function";
    return thenable ? answer : settled(answer);
}

// The services whose call failed in `calls`, each once, sorted: a traced render's `failed`.
function failedIn(calls) {
    const names = new Set();
    for (const [key, entry] of Object.entries(calls ?? {})) if (isFailure(entry)) names.add(key.slice(0, key.indexOf(":")));
    return [...names].sort();
}

// Called as binding.onError (with the binding as `this`) when a binding's promise rejects.
function handleAsyncError(error) {
    const juris = this.juris;
    const handled = juris.resolveError(this.owner, error, { phase: "async", component: this.owner?.name });
    if (handled?.layout) juris.showFallback(handled.boundary, handled.layout, error);
    return handled !== null;
}

export default class Juris {
    constructor(config) {
        this.devMode = Boolean(config?.devMode);
        // Root names are checked before anything is built: each is read as one key of the state's
        // root, and a nested one (`user.token`) used to match nothing, so what it named was
        // serialised into the page as if it had never been given.
        if (config?.asyncPath !== undefined && !isRootName(config.asyncPath)) throw new TypeError(`Juris: asyncPath is a root of the state, a name with no ".", not ${JSON.stringify(config.asyncPath)}`);
        if (config?.privatePaths !== undefined) {
            if (!Array.isArray(config.privatePaths)) throw new TypeError("Juris: privatePaths is a list of the state's root names");
            for (const name of config.privatePaths) {
                if (!isRootName(name)) throw new TypeError(`Juris: privatePaths names roots of the state, names with no "." (a nested path is not supported), not ${JSON.stringify(name)}`);
            }
        }
        // The components to register, read whole before anything is built: a list's unnamed
        // function is refused here, not halfway through registering the others.
        const components = componentEntries(config?.components, "Juris: components");
        this.stateManager = new StateManager(config?.state, {
            devMode: this.devMode,
            onChange: config?.onChange,
            asyncPath: config?.asyncPath,
            pendingDelay: config?.pendingDelay,
            errorMessage: (error) => this.recordedMessage(error),
        });
        this.componentManager = new ComponentManager({ devMode: this.devMode, juris: this });
        this.installed = new Map(); // install(): key -> null once its registrar ran, or the error it threw
        this.componentStack = [];
        // Shared services: the same names on both sides, backed by database queries on the server and by
        // endpoint calls on the client. Components reach them through api.call(name, ...args).
        this.services = Object.freeze({ ...(config?.services ?? {}) });
        this.requirePreload = Boolean(config?.requirePreload); // server: api.call must hit the preloaded cache
        this.ssrPath = config?.ssrPath ?? "$ssr"; // where preloaded call results travel to the client
        // Root keys that never leave the server: serializeState drops them. $async is always one of them.
        this.privatePaths = new Set([this.stateManager.asyncPath, "$server", ...(config?.privatePaths ?? [])]);
        // Where we are running. The DOM renderer works anywhere the core loads, and the string
        // renderer wherever an instance is given it (features.ssr); components read api.isServer when
        // they must differ, e.g. to skip a browser-only measurement. What it decides here is what a
        // server must not share between requests (the call cache, below).
        this.isServer = config?.isServer ?? typeof document === "undefined";
        // Client-side call cache, off by default: { dedupe: true } shares one promise between identical
        // in-flight calls; { ttl: ms } reuses a resolved result for that long (see call / invalidate).
        // A server instance refuses it. One instance renders every request, so a kept result, or an
        // in-flight promise, from one visitor's call would be the answer to the next visitor's
        // identical call. clearState empties it too, so a client that clears its state starts over.
        this.callCacheOptions = { dedupe: false, ttl: 0, ...(config?.callCache ?? {}) };
        if (this.isServer && (this.callCacheOptions.dedupe || this.callCacheOptions.ttl)) {
            throw new Error("Juris: callCache is for a browser instance; a server instance renders every request, so a cached call would answer one visitor with another's result");
        }
        this.callCache = new Map(); // key -> { promise?, value?, expires? }; never serialised
        // Tags a layout may use that both renderers otherwise refuse (script, iframe, base, …; see
        // html-safety.js). Opt-in, and checked and lower-cased once here, because the check runs per
        // element: a list of tags' names, anything else refused.
        this.allowTags = allowedTags(config?.allowTags);
        // URL schemes a layout may use beside the ones both renderers allow (http, https, mailto, …;
        // see html-safety.js), for an app whose links are `magnet:` or its own `web+…`. Added, never
        // removed, and checked here, once: a name that is not a scheme's is refused, and so are
        // javascript:, vbscript: and data:, which no option opens. It opens no attribute: srcdoc
        // stays refused.
        this.allowSchemes = allowedSchemes(config?.allowSchemes);
        // Whether a layout may set innerHTML, which both renderers otherwise refuse: a boolean, false
        // unless given, and one of the options the server and the browser are given alike.
        this.allowInnerHTML = innerHTMLAllowed(config?.allowInnerHTML, "Juris");
        // A capitalised tag names a component. When none is registered under it, "element" (the
        // default) draws an element of that name, which is what a browser does with a tag it does not
        // know: nothing fails, and the page lacks a part. "warn" also says so on the console, once per
        // name; "throw" refuses to draw it, which is what a test wants. Whichever it is, a traced
        // server render lists the name in its trace's `unknown` (see unknownComponent).
        this.unknownComponents = config?.unknownComponents ?? "element";
        if (!UNKNOWN_COMPONENTS.includes(this.unknownComponents)) {
            throw new TypeError(`Juris: unknownComponents is one of ${UNKNOWN_COMPONENTS.map((v) => `"${v}"`).join(", ")}`);
        }
        this.warnedUnknown = new Set(); // "warn": the names already said
        this.wholeContents = new WeakSet(); // devMode: what normalizeContent made of a tag's function content
        // Whether a failed preload's message may travel to the browser inside the page (see preload).
        // Same shape and same default as the dispatcher's (errors.js): nothing unless the app says so.
        this.exposeError = typeof config?.exposeError === "function" ? config.exposeError : defaultExposeError;
        // Not `onError`: that name is already the error-boundary registrar on the api.
        this.reportError = typeof config?.reportError === "function" ? config.reportError : null;
        // Component-local state lives under `${localPath}.<ComponentName>.<index>.<key>` (see useState).
        this.localPath = config?.localPath ?? "$local";
        this.localCounters = new Map(); // component name -> next index; reset by clearState
        this.localSubtrees = new Map(); // client-only component name -> next subtree index (see localScopeFor)
        this.liveLocals = new Set(); // slots owned by a live instance (client); a disposed slot not reclaimed is deleted
        this.liveCalls = new Map(); // live path -> the latest live() call there, when no live client keeps it (see live)
        this.renderer = new DOMRenderer(this); // all DOM work lives there; Juris delegates
        this.ssrRenderer = null; // renderToString's, once the kit's feature installs it (NO_STRING_RENDERER)
        // devMode in a browser: expose the instance as $juris[n] so componentTree(), getState() and
        // friends are one console keystroke away. Never on the server, never outside devMode.
        //
        // That puts the whole instance (state, services, the component tree) on `window`: a
        // debugging convenience, and nothing to ship. Which build is production is the app's to
        // know, not the framework's, which reads no environment, so the warning keys off what the
        // app passed: devMode is off unless the app turns it on, and wherever it is on, the console
        // says what it exposes.
        //
        // A second copy of the core in the page (two builds) counts from 1 as well: an index the other
        // copy took is skipped, so neither puts its instance over the other's (devtools.js names each
        // instance by its index).
        if (this.devMode && !this.isServer && typeof globalThis.window === "object" && globalThis.window !== null) {
            globalThis.window.$juris = globalThis.window.$juris ?? {};
            do this.devIndex = ++devInstances; while (Object.hasOwn(globalThis.window.$juris, this.devIndex));
            globalThis.window.$juris[this.devIndex] = this;
            console.info(`Juris: devMode is on, so this instance is exposed as window.$juris[${this.devIndex}]; turn devMode off for production`);
        }

        // Passed as the second argument to every component definition.
        const exposed = "getState toRaw setValue updateState deleteState peek compute batch clearState bindState render mount renderToString enhance unenhance registerComponent disposeTree onCleanup onMount onError useState ref prop call preloaded invalidate group assign live liveState liveMessage markRender".split(
            " ",
        );
        this.api = Object.freeze({ ...Object.fromEntries(exposed.map((name) => [name, (...args) => this[name](...args)])), services: this.services, isServer: this.isServer });
        this.registerBuiltins();
        // The app's components, in order, after the built-ins and before the features: a feature
        // is built on an instance that has them, and a plugin (the router) is installed on one.
        for (const [name, definition] of components) this.registerComponent(name, definition);
        // Features named in the options, built last, once the instance is whole: { features: { headless:
        // HeadlessManager, webComponentFactory: WebComponentFactory } }. Each is a class constructed
        // with (juris, config) that installs itself (headless.js, webcomponent.js, and the kit's
        // server/ssr-renderer.js as `ssr`); the key is only a name.
        for (const [name, Feature] of Object.entries(config?.features ?? {})) {
            if (typeof Feature !== "function") throw new TypeError(`Juris: features.${name} is a class, constructed with (juris, config)`);
            new Feature(this, config);
        }
    }

    // Await: renders `fallback` while an async group is pending, and hides (does not unmount) its
    // children meanwhile, so their bindings keep running and nothing refetches when the group toggles.
    // { Await: { group: "panel", fallback: { p: "Loading…" }, onError: (errors) => layout, tag: "div", children } }
    // The names are exported as BUILTIN_COMPONENTS; a test holds the two to each other.
    registerBuiltins() {
        this.registerComponent("Await", (props, api) => {
            const tag = props.tag ?? "div";
            const pending = () => api.getState(`${this.stateManager.asyncPath}.groups.${props.group}.pending`, 0) > 0;
            const errors = () => api.getState(`${this.stateManager.asyncPath}.groups.${props.group}.errors`, []);
            const { group: _g, fallback: _f, onError, tag: _t, children, ...rest } = props;
            return {
                [tag]: {
                    ...rest,
                    children: [
                        () => (pending() ? (props.fallback ?? null) : errors().length && onError ? (typeof onError === "function" ? onError(api.toRaw(errors())) : onError) : null),
                        { [tag]: { hidden: () => pending() || (errors().length > 0 && Boolean(onError)), children } },
                    ],
                },
            };
        });
    }

    // ---- plugins -------------------------------------------------------------------------
    // use(plugin, options): `plugin` is a function (juris, options) => extension, or an object with an
    // install(juris, options) method. Whatever it returns is merged into the api every component and
    // enhancer receives from then on (names must be new). A plugin that needs state, components or
    // bindings registers them on the instance it is given; the router is the first one.
    use(plugin, options) {
        const install = typeof plugin === "function" ? plugin : typeof plugin?.install === "function" ? plugin.install.bind(plugin) : null;
        if (typeof install !== "function") throw new Error("Juris.use: plugin must be a function or have an install(juris) method");
        const extension = install(this, options);
        if (extension && typeof extension === "object") this.extendApi(extension);
        return this;
    }

    extendApi(extension) {
        for (const key of Object.keys(extension)) {
            if (key in this.api) throw new Error(`Juris.extendApi: the api already has "${key}"`);
        }
        this.api = Object.freeze({ ...this.api, ...extension });
    }

    // options: { ssr: false } for components the server never renders (see the kit's SSRRenderer).
    registerComponent(name, definition, options) {
        this.componentManager.registerComponent(name, definition, options);
    }

    // Whether a component is registered under `name` on this instance (the built-ins included).
    hasComponent(name) {
        return this.componentManager.has(name);
    }

    // Both renderers call this for a layout whose tag starts with a capital letter, as a component's
    // name does, when no component is registered under it, before drawing it. `namespace` is the one
    // the tag sits in (SVG, MathML, or null for HTML), and `drawn` whether the renderer will draw it
    // as an element: false for a tag html-safety.js refuses (`Portal`, `Script`), which is dropped
    // whatever this decides. A tag inside <svg> or <math> is an element of that namespace, never
    // unknown: those name their own elements, so nothing is recorded, said or refused. Otherwise a
    // traced server render records the name (renderTrace's `unknown`), so a server can refuse to keep
    // a page that is missing a part (page-cache.js decide); then `unknownComponents` decides. "throw"
    // is an error like any other: a boundary may catch it, and the trace still has the name, so a
    // test reads both. The warning says what is drawn, and for a refused tag that is nothing.
    unknownComponent(tag, namespace = null, drawn = true) {
        if (namespace) return;
        this.ssrRenderer?.trace?.unknown.add(tag);
        if (this.unknownComponents === "throw") {
            throw new Error(`Juris: "${tag}" is not a registered component (unknownComponents: "throw")`);
        }
        const warn = this.unknownComponents === "warn" ? !this.warnedUnknown.has(tag) : this.devMode;
        if (!warn) return;
        this.warnedUnknown.add(tag);
        console.warn(drawn
            ? `Juris: "${tag}" is not a registered component; rendering it as an HTML element`
            : `Juris: "${tag}" is not a registered component, nor a tag a layout may draw; nothing is drawn for it`);
    }

    // install(key, registrar): runs registrar(this) the first time this instance is given `key`, and
    // does nothing for that key again; true when it ran, false when it had already. It is for a module
    // whose components several pages draw: registerComponent refuses a name it already has, so the
    // module registers them once, and the instance is what keeps "once". A flag in the module guards
    // one copy of the module in one process: a second instance there (a test's) gets nothing, and a
    // second copy of the module (the same file under two addresses, which is two modules) registers
    // again and throws. So the key is a string the module names itself by, never the function, which
    // differs between two copies. A registrar may install others; one that reaches its own key while
    // it is still running is not run again. A registrar that throws is remembered, and its error is
    // thrown again to every later caller for that key, so a half-registered module never looks done.
    install(key, registrar) {
        if (typeof key !== "string" || key.length === 0) throw new TypeError("Juris.install: key must be a non-empty string, the name the module registers under");
        if (typeof registrar !== "function") throw new TypeError(`Juris.install: registrar for "${key}" must be a function (juris) => void`);
        if (this.installed.has(key)) {
            const failed = this.installed.get(key);
            if (failed) throw failed;
            return false;
        }
        this.installed.set(key, null);
        try {
            registrar(this);
        } catch (error) {
            this.installed.set(key, error);
            throw error;
        }
        return true;
    }

    // ---- lifecycle ---------------------------------------------------------------------------
    // A component's life: the definition runs (setup: onCleanup / onMount / onError / useState are
    // valid here), its root is rendered, onMount handlers run once the outermost DOM operation that
    // created the root has finished (still synchronously), its bindings run on their own until the
    // instance is disposed, then cleanups run. Nothing runs on the server after setup except cleanups.

    currentInstance(method) {
        const instance = this.componentStack[this.componentStack.length - 1];
        if (!instance) throw new Error(`Juris.${method}: must be called during component setup`);
        return instance;
    }

    onCleanup(fn) {
        this.currentInstance("onCleanup").cleanups.push(fn);
    }

    // fn(rootElement) runs after the root is in its parent; a returned function becomes a cleanup.
    onMount(fn) {
        if (typeof fn !== "function") throw new Error("Juris.onMount: handler must be a function");
        const instance = this.currentInstance("onMount");
        instance.mounts = instance.mounts ?? [];
        instance.mounts.push(fn);
    }

    // ---- error boundaries ---------------------------------------------------------------------
    // onError(handler) makes the component a boundary for itself and everything rendered inside it.
    // handler(error, { phase, component, boundary }) — phase is "setup" (a definition threw), "binding"
    // (a reactive function or its DOM apply threw, first run or later) or "async" (a promise a binding
    // returned rejected; also recorded in $async.errors). It returns:
    //   a layout   → the boundary's root is replaced by it, until the boundary's root re-renders
    //   undefined  → handled: the failing binding keeps its last value and the pass goes on
    //   false      → not mine: the next boundary up is asked; with none left the error is thrown as usual
    onError(handler) {
        if (typeof handler !== "function") throw new Error("Juris.onError: handler must be a function");
        this.currentInstance("onError").errorHandler = handler;
    }

    // ---- refusals ----------------------------------------------------------------------------
    // What both renderers call, inside their devMode checks, for each thing they leave out of a page:
    // `rule` a code a program can match ("layout-in-value", or the one html-safety.js answers beside
    // its reason, `check.rule`, which it does not answer yet), `reason` the words, and `detail`
    // { name, value, node, component }: the tag, attribute or style key, the value refused, the node
    // it was on (the DOM renderer's), and the component whose layout it was in. It writes the console
    // line the renderers wrote before it existed. A devtools feature (devtools.js) may replace it on
    // its instance, to keep a record as well.
    refused(rule, reason, detail = {}) {
        if (rule === "layout-in-value") console.warn(`Juris: ${reason}; ignored`, detail.value);
        else console.warn(`Juris: dropped ${reason}`);
    }

    // Asks the boundaries from `owner` outwards. Returns null when nobody handled the error; otherwise
    // { boundary, layout } (layout undefined when the handler just swallowed it). Renderers act on it.
    resolveError(owner, error, info) {
        if (error instanceof FallbackSignal) return null; // already decided further in; let it travel
        for (let instance = owner; instance; instance = instance.parent) {
            if (typeof instance.errorHandler !== "function") continue;
            const verdict = instance.errorHandler(error, { ...info, boundary: instance.name });
            if (verdict === false) continue;
            if (this.devMode && verdict === undefined) console.warn(`Juris: error in "${info.component ?? "?"}" handled by "${instance.name}"`, error);
            return { boundary: instance, layout: verdict !== null && typeof verdict === "object" ? verdict : undefined };
        }
        return null;
    }

    getState(path, defaultValue, options) {
        return this.stateManager.getState(path, defaultValue, options);
    }

    toRaw(value) {
        return this.stateManager.toRaw(value);
    }

    // StateManager.setValue, written out: its check, then the write, one frame fewer on every
    // write's stack.
    setValue(path, value) {
        this.stateManager.assertWritable(path, "setValue");
        this.stateManager.write(path, value);
    }

    updateState(path, updater) {
        this.stateManager.updateState(path, updater);
    }

    batch(fn) {
        return this.stateManager.batch(fn);
    }

    // Everything that belongs to one state goes with it: the local-state numbering, and the call
    // cache (a result kept for the old state, or a call still in flight for it, is not an answer
    // for the new one; an in-flight call finishes and is not stored, as after invalidate()).
    //
    // On a server the async counters go too, each group's included. A server render awaits nothing
    // between clearState and serializeState, so nothing of the previous request is legitimately in
    // flight: a promise one request tracked (or one that never settles) used to keep the next
    // request's Await on its fallback, for good if it hung. What settles later is the old request's,
    // and moves none of the new one's counters (StateManager's `epoch`). A browser carries them
    // over as before, since its own work is still in flight across a clear.
    clearState(next) {
        this.localCounters.clear();
        this.localSubtrees.clear();
        this.callCache.clear();
        this.liveCalls.clear();
        this.stateManager.clearState(next, { resetAsync: this.isServer });
    }

    // ---- component-local state -------------------------------------------------------
    // The $local numbering a new instance belongs to. Slots are handed out by creation order per
    // component name, which lines the server's numbering up with the client's — but a component with
    // `ssr: false` is never invoked on the server, so nothing inside it was ever numbered there. A
    // `Row` inside such a component used to take `$local.Row.0` on the client, the slot the server
    // had given to a `Row` elsewhere on the page: the two swapped state, rather than one of them
    // merely finding nothing. So a client-only component opens its own numbering, under a prefix no
    // server-numbered slot can collide with, and everything below it counts in that one.
    localScopeFor(name, parent) {
        if (this.componentManager.getOptions(name).ssr !== false) return parent?.localScope ?? null;
        const index = this.localSubtrees.get(name) ?? 0;
        this.localSubtrees.set(name, index + 1);
        return { prefix: `${this.localPath}.$client.${name}.${index}`, counters: new Map() };
    }

    // useState(key, initial) -> [get, set], valid only during a definition. The value lives in the tree
    // at `$local.<ComponentName>.<n>.<key>`, where n is the instance's position among instances of that
    // component that use local state, in creation order. get() is a tracked read (get.path is the path,
    // for api.ref); set(value | updater) writes. Nothing is written until the first set, so the tree only
    // holds values that were actually changed.
    //
    // The instance that called useState owns the slot. If you did not write the state, do not access it
    // — the owner decides its shape, when it changes and when it goes away, and a reader it does not
    // know about breaks on a change it was entitled to make. That is a rule of the framework's
    // contract ("Local state" in src/README.md), for every app built on it.
    //
    // The [get, set] pair is the whole interface. `n` is a position in render order, not an address: it
    // moves when the page does. Component code doing `juris.setValue("$local.Row.0.open", true)` is not
    // reaching for an escape hatch, it is code written by someone who has not learned useState, and
    // reviews should read it that way.
    //
    // The slot is nonetheless an ordinary state path, and that is not an oversight to be sealed off: it
    // is how the values cross from the server render into the client, how a test drives a component
    // without its DOM, and how componentTree() reads them. Take the addressability away to enforce the
    // rule above and hydration goes with it — the rule is a rule, not a mechanism.
    //
    // Indices are deterministic for a given layout over a given state, so a server render and the
    // client mount that follows produce the same paths: the server's `$local` travels with the state and
    // each component adopts its own value. The counters reset with clearState (per request on the
    // server) and start at 0 on a client instance; mount does not reset them, so several roots mounted
    // in the order the server rendered them line up too. On the client the state is deleted with the
    // instance; a component re-invoked into the same root (same name and key, new props) inherits the
    // previous instance's slot, so its local state persists. On the server nothing is deleted at the end
    // of the render (the values must travel); the next clearState wipes them.
    // Reads register `${slot}.${key}`, so one component's writes never wake another component's bindings.
    useState(key, initial) {
        const instance = this.componentStack[this.componentStack.length - 1];
        if (!instance) throw new Error("Juris.useState: must be called during component setup");
        if (typeof key !== "string" || key.length === 0) throw new Error("Juris.useState: key must be a non-empty string");
        if (!instance.localClaimed) {
            if (instance.local === undefined) {
                // A fresh slot (a reclaimed one arrives on the instance from the renderer, see DOMRenderer.createComponent).
                const scope = instance.localScope ?? null;
                const counters = scope ? scope.counters : this.localCounters;
                const index = counters.get(instance.name) ?? 0;
                counters.set(instance.name, index + 1);
                instance.local = `${scope ? scope.prefix : this.localPath}.${instance.name}.${index}`;
            }
            instance.localClaimed = true;
            this.liveLocals.add(instance.local);
            instance.cleanups.push(() => {
                if (instance.ssr) return; // server: the values must travel; the next clearState wipes them
                this.liveLocals.delete(instance.local);
                // Deferred: a same-name instance taking over this root in the same pass reclaims the slot first.
                queueMicrotask(() => {
                    if (!this.liveLocals.has(instance.local) && this.stateManager.peek(instance.local) !== undefined) this.stateManager.deleteState(instance.local);
                });
            });
        }
        const path = `${instance.local}.${key}`;
        if (this.devMode) {
            instance.localDefaults = instance.localDefaults ?? {}; // componentTree shows unchanged values too
            instance.localDefaults[key] = initial;
        }
        const get = () => this.getState(path, initial);
        get.path = path;
        const set = (next) => this.setValue(path, typeof next === "function" ? next(this.peek(path) ?? initial) : next);
        return [get, set];
    }

    // ---- shared services -----------------------------------------------------------------
    // api.call(name, ...args) invokes services[name] and returns its promise, unless the same call was
    // preloaded: then a *settled* value is returned (see StateManager settled/settledError). It has the
    // promise's .then/.catch shape but runs the callbacks at once, so component code written as
    // api.call(...).then(...) is synchronous on the server and during the client's first render, and
    // asynchronous afterwards, without changing. Any number of components may make the same call;
    // the cache is not consumed per call. On the server it lives until the next clearState; on the
    // client mount() drops it once the first render is done (releasePreloaded), so later calls are real.
    // Server, per request: juris.renderRequest({ preload, state, layout }) does the whole sequence.
    // With requirePreload (server), a cache miss throws instead of reaching the database mid-render.
    // A service that answers at once (a local one that is not async) is answered as a settled value
    // too, and one that throws as a settled rejection (answerOf), so `call` always answers a thenable.

    // The key a call is preloaded, cached and subscribed under. It is the live protocol's
    // (live-protocol.js), because the server checks a subscription's key against its own.
    callKey(name, args) {
        return liveKey(name, args);
    }

    // The service called `name`, or undefined. Own properties only: `services` is a plain object, and
    // every method it inherits (constructor, toString, …) is a function too, so a typeof check alone
    // would call Object.prototype's.
    serviceFor(name) {
        return Object.hasOwn(this.services, name) ? this.services[name] : undefined;
    }

    call(name, ...args) {
        const service = this.serviceFor(name);
        if (typeof service !== "function") throw new Error(`Juris.call: unknown service "${name}"`);
        const key = this.callKey(name, args);
        this.ssrRenderer?.trace?.calls.add(key);
        const cache = this.stateManager.peek(`${this.ssrPath}.calls`);
        if (cache && Object.prototype.hasOwnProperty.call(cache, key)) {
            const entry = cache[key];
            if (entry && typeof entry === "object" && "$error" in entry) return settledError(new Error(entry.$error));
            return settled(entry);
        }
        // Not preloaded: during a traced server render this means a slot is about to render empty
        // whatever the caller does with the promise, so the render is marked incomplete here — at
        // the source — not only when the promise itself reaches the renderer.
        this.ssrRenderer?.trace?.flags.add("unresolved");
        if (this.requirePreload) throw new Error(`Juris.call: ${key} was not preloaded for this request`);

        // On a server (without requirePreload) the call reaches the service as a render's: its
        // arguments are whatever a component passed, which no route declared, so it is not a
        // preload, and a service that trusts a preload's arguments must be able to tell.
        if (this.isServer) return answerOf(() => service.call(RENDER_CALL, ...args));

        // Client cache (opt in). A fresh TTL hit is answered synchronously, like a preloaded call.
        const { dedupe, ttl } = this.callCacheOptions;
        if (!dedupe && !ttl) return answerOf(() => service(...args));
        const cached = this.callCache.get(key);
        if (cached) {
            if (cached.promise && dedupe) return cached.promise;
            if (ttl && "value" in cached && cached.expires > Date.now()) return settled(cached.value);
        }
        const promise = Promise.resolve()
            .then(() => service(...args))
            .then(
                (value) => {
                    if (this.callCache.get(key) !== entry) return value; // invalidated meanwhile
                    if (ttl) this.keepCached(key, value, ttl);
                    else this.callCache.delete(key);
                    return value;
                },
                (error) => {
                    if (this.callCache.get(key) === entry) this.callCache.delete(key);
                    throw error;
                },
            );
        const entry = { promise };
        this.callCache.set(key, entry);
        return promise;
    }

    // Stores a result for `ttl` ms, and drops every result whose time is up: a page that calls with
    // ever new arguments (a search box) would otherwise keep every answer it was ever given.
    keepCached(key, value, ttl) {
        const now = Date.now();
        for (const [other, entry] of this.callCache) if ("value" in entry && entry.expires <= now) this.callCache.delete(other);
        this.callCache.set(key, { value, expires: now + ttl });
    }

    // Drop cached results: invalidate(name, ...args) for one call, invalidate(name) for every call of
    // that service, invalidate() for everything. In-flight calls are left to finish (and not stored).
    invalidate(name, ...args) {
        if (name === undefined) return void this.callCache.clear();
        if (args.length) return void this.callCache.delete(this.callKey(name, args));
        for (const key of [...this.callCache.keys()]) if (key.startsWith(`${name}:`)) this.callCache.delete(key);
    }

    // A pushed patch (live) or any other writer that knows the current value of a call can keep the
    // TTL cache truthful: called by the SSE client after applying a patch.
    refreshCached(key, value) {
        const { ttl } = this.callCacheOptions;
        const entry = this.callCache.get(key);
        if (ttl && entry && "value" in entry) this.keepCached(key, value, ttl);
    }

    // ---- async groups ------------------------------------------------------------------------
    // group(name) scopes the pending count: track(promise) counts it under $async.groups.<name> until it
    // settles (a settled value or a plain value counts for nothing), pending()/ready() are tracked reads,
    // errors() the rejections seen (the last MAX_ERROR_LOG). $async.pending still counts everything;
    // the Await component renders a fallback while a group is pending. Groups live under $async, so
    // they are never serialised. A promise tracked before a server's clearState (another request's)
    // moves nothing when it settles: the epoch it was counted in is over.
    group(name) {
        if (typeof name !== "string" || !name) throw new Error("Juris.group: name must be a non-empty string");
        const base = `${this.stateManager.asyncPath}.groups.${name}`;
        const bump = (delta) => this.stateManager.updateState(`${base}.pending`, (n = 0) => Math.max(0, n + delta));
        return Object.freeze({
            name,
            track: (value) => {
                if (!this.stateManager.isThenable(value) || this.stateManager.isSettled(value)) return value;
                const epoch = this.stateManager.epoch;
                const current = () => this.stateManager.epoch === epoch;
                bump(1);
                return value.then(
                    (result) => {
                        if (current()) bump(-1);
                        return result;
                    },
                    (error) => {
                        if (current()) {
                            this.stateManager.batch(() => {
                                bump(-1);
                                this.stateManager.updateState(`${base}.errors`, (errors = []) => [...errors, { message: this.recordedMessage(error), at: Date.now() }].slice(-MAX_ERROR_LOG));
                            });
                        }
                        throw error;
                    },
                );
            },
            pending: () => this.getState(`${base}.pending`, 0),
            ready: () => this.getState(`${base}.pending`, 0) === 0,
            errors: () => this.getState(`${base}.errors`, []),
            reset: () => this.stateManager.batch(() => (this.setValue(`${base}.pending`, 0), this.deleteState(`${base}.errors`))),
        });
    }

    // assign(path, value): write `value` at `path` leaf by leaf — only leaves that differ are written,
    // keys that disappeared are deleted — so readers of unchanged leaves are not woken. Arrays whose
    // length changed are written whole (an index shift would otherwise wake every row anyway).
    assign(path, value) {
        this.batch(() => this.assignInto(path, value));
    }

    assignInto(path, value) {
        const previous = this.stateManager.peek(path);
        const isObject = (v) => v !== null && typeof v === "object";
        if (!isObject(value) || !isObject(previous) || Array.isArray(value) !== Array.isArray(previous) || (Array.isArray(value) && value.length !== previous.length)) {
            if (!Object.is(previous, value)) this.setValue(path, value);
            return;
        }
        // A key no path can address — one containing "." (it would be read as two segments) or
        // "__proto__" (refused by StateManager, and the throw used to abort the whole batch) — means
        // this object is written whole instead of leaf by leaf. The data arrives either way; a row
        // with a dotted column name just wakes its readers as one value. The rule is the live
        // protocol's canAddress, which the server's diff follows too.
        if (!canAddress(value) || !canAddress(previous)) {
            this.setValue(path, value);
            return;
        }
        // Own keys only: a removed `toString` is still `in` the new value, inherited.
        for (const key of Object.keys(previous)) if (!Object.hasOwn(value, key)) this.deleteState(`${path}.${key}`);
        for (const [key, child] of Object.entries(value)) this.assignInto(`${path}.${key}`, child);
    }

    // ---- live calls -------------------------------------------------------------------------
    // live(path, name, ...args): call the service as usual, assign the result to `path`, and keep it
    // assigned: whenever the server learns that this query changed, the patch it pushes lands on the
    // same path (see src/remote-services.js — sseClient installs the transport). On the server, and on
    // the client's first render, the result comes from the preload cache and is assigned synchronously,
    // so a server-rendered live page needs nothing extra. Inside a component definition the subscription
    // ends with the instance; elsewhere, call the returned function.
    //
    // What is at `path` is not always the latest answer (the first has not arrived, the subscribe was
    // refused, the stream is down), and the page can tell: liveState(path), below.
    live(path, name, ...args) {
        this.ssrRenderer?.trace?.live.add(name);
        const key = this.callKey(name, args);
        const transport = this.liveTransport;

        // Seed the path from the preloaded call when there IS one, and otherwise let the
        // subscription's first full value seed it.
        //
        // It used to do both, unconditionally. On the client after hydration that meant the query
        // ran twice for one mount — once over POST here, once on the server because a new group has
        // no `last` — and the two answers raced: the POST could land after a newer pushed patch and
        // assign the older value over it. The preloaded case is different and still wanted: there
        // the value is already settled, so it is assigned synchronously and the first paint has no
        // gap in it.
        const cache = this.stateManager.peek(`${this.ssrPath}.calls`);
        const preloaded = Boolean(cache) && Object.prototype.hasOwnProperty.call(cache, key);
        if (!transport) return this.liveByCall(path, name, args);
        if (preloaded) {
            const result = this.call(name, ...args);
            result.then(
                (value) => this.assign(path, value),
                () => { }, // the rejection is already recorded by whoever awaits `result`; the caller may await it too
            );
        }

        // `seeded`: the preload's answer is on screen, as the server drew it, so the path starts out
        // "live" (the server's render said so too) rather than "pending".
        const unsubscribe = transport.subscribe(key, name, args, path, { seeded: preloaded && !isFailure(cache[key]) });
        const instance = this.componentStack[this.componentStack.length - 1];
        if (instance) instance.cleanups.push(unsubscribe);
        return unsubscribe;
    }

    // live() where no live client keeps the path (a server, or a browser without one): one call, its
    // answer assigned, and the path's status kept by the core under the async root, which is never
    // serialised and which a server's clearState empties. Only the latest call at a path writes it,
    // so an older answer that arrives late (the arguments moved meanwhile, or, on a server, it belongs
    // to a request already rendered) is dropped rather than assigned over a newer one.
    liveByCall(path, name, args) {
        const token = {};
        this.liveCalls.set(path, token);
        const at = this.liveStatusAt(path);
        const latest = () => this.liveCalls.get(path) === token;
        // A service that answers synchronously (a test's, a browser's local one) is answered at once:
        // call answers it as a settled value (answerOf).
        const result = this.call(name, ...args);
        if (!this.stateManager.isSettled(result)) this.markLive(at, "pending");
        result.then(
            (value) => {
                if (!latest()) return;
                this.batch(() => {
                    this.assign(path, value);
                    this.markLive(at, "live");
                });
            },
            (error) => {
                if (latest()) this.markLive(at, "failed", this.recordedMessage(error));
            },
        );
        const unsubscribe = () => {
            if (!latest()) return;
            this.liveCalls.delete(path);
            if (this.stateManager.peek(at) !== undefined) this.stateManager.deleteState(at);
        };
        const instance = this.componentStack[this.componentStack.length - 1];
        if (instance) instance.cleanups.push(unsubscribe);
        return unsubscribe;
    }

    // Writes a live path's status at `at` (a state path the caller owns), leaf by leaf: `status`, and
    // `message` while it is "failed". The live client (remote-services.js) writes its own the same way.
    markLive(at, status, message = null) {
        this.batch(() => {
            this.setValue(`${at}.status`, status);
            if (message !== null) this.setValue(`${at}.message`, message);
            else if (this.stateManager.peek(`${at}.message`) !== undefined) this.stateManager.deleteState(`${at}.message`);
        });
    }

    // Where a live path's status is kept: the live client's, when there is one (under its statePath),
    // and otherwise the core's, under the async root.
    liveStatusAt(path) {
        return this.liveTransport?.statusAt?.(path) ?? `${this.stateManager.asyncPath}.live.${pathSegment(path)}`;
    }

    // api.liveState(path): whether what is at a live path is the latest answer, tracked, so a page can
    // mark data that may be old rather than show it as current:
    //   "live"     the latest answer is on screen (a preloaded one included, on the server and in the
    //              browser's first render)
    //   "pending"  subscribed, and the first answer is not here yet: what is shown is older, or nothing
    //              (the arguments moved, and the last route's data is still on screen)
    //   "failed"   the subscribe was refused, or the server could not run the query again (or, with no
    //              live client, the call rejected); liveMessage(path) has the words
    //   "offline"  the stream is down: nothing new arrives until it is back
    // and null for a path nothing is live at. The status goes with the subscription.
    liveState(path) {
        return this.getState(`${this.liveStatusAt(path)}.status`, null);
    }

    // api.liveMessage(path): the words of a "failed" live path (tracked), or null.
    liveMessage(path) {
        return this.getState(`${this.liveStatusAt(path)}.message`, null);
    }

    // api.preloaded(name, ...args): what that call answered in this page's preload, or undefined when
    // it was not preloaded or failed. A read, not a call: nothing reaches a service, requirePreload
    // has nothing to refuse, and nothing is subscribed, so it re-runs nothing when the answer changes
    // or goes. It is for a component that must show what another component on the page will load, on
    // the server and in the browser's first render, before that one has written it anywhere; on the
    // client the transfer is dropped after the first mount (releasePreloaded), and from then on it
    // answers undefined. In a traced server render a preloaded call it read is in the trace's
    // `calls`, as an api.call's is, because the markup depends on its answer (or on its failure).
    preloaded(name, ...args) {
        const key = this.callKey(name, args);
        const calls = this.stateManager.peek(`${this.ssrPath}.calls`);
        if (calls && Object.hasOwn(calls, key)) this.ssrRenderer?.trace?.calls.add(key);
        return answerIn(calls, key);
    }

    // Client: forget the transferred call results. Called by mount() after the first render.
    releasePreloaded() {
        if (this.stateManager.peek(this.ssrPath) !== undefined) this.stateManager.deleteState(this.ssrPath);
    }

    // The words a rejection is kept with, in $async.errors and in a group's errors. On a server they
    // can reach a page somebody else asked for (Await's onError draws a group's), so they pass
    // exposeError, as a failed preload's do. In a browser the error came from this page's own code,
    // or from a server that has already decided what it may say, so its message is kept as it is.
    recordedMessage(error) {
        return this.isServer ? publicMessage(error, this.exposeError) : String(error?.message ?? error);
    }

    // Runs the listed calls in parallel, off the state tree, and returns the cache to hand to clearState.
    // Each entry is [name, ...args]. Rejections are recorded so the client reproduces them.
    async preload(entries) {
        const calls = {};
        await Promise.all(
            entries.map(async ([name, ...args]) => {
                const service = this.serviceFor(name);
                if (typeof service !== "function") throw new Error(`Juris.preload: unknown service "${name}"`);
                try {
                    // A copy, as the page carries it (asTransferred): the render writes into it, never
                    // into the object the service answered, which it may hand the next request too.
                    calls[this.callKey(name, args)] = asTransferred(await service.call(PRELOAD_CALL, ...args));
                } catch (error) {
                    // This message is serialized into the page and is readable by anyone the page
                    // reaches, so a driver's text does not belong in it. `exposeError` decides, and
                    // says no unless the app opts in; onError (if given) still sees the original.
                    this.reportError?.(error, name, args);
                    calls[this.callKey(name, args)] = { $error: publicMessage(error, this.exposeError) };
                }
            }),
        );
        return { calls };
    }

    // JSON for a <script type="application/json"> tag: private root keys ($async, $server, and any
    // configured privatePaths, which are root names: the constructor refuses a nested one) stripped,
    // "<" escaped so "</script>" in data cannot close the tag.
    serializeState() {
        const rest = {};
        for (const key of Object.keys(this.stateManager.state)) {
            if (!this.privatePaths.has(key)) rest[key] = this.stateManager.state[key];
        }
        return JSON.stringify(rest).replace(/</g, "\\u003c");
    }

    // ---- server rendering ----------------------------------------------------------------
    // Both need the string renderer, the kit's feature (NO_STRING_RENDERER, above): without it each
    // throws a TypeError that says so, renderRequest before it preloads anything.
    //
    // One request on the shared instance, in the only order that is safe:
    //   1. preload every call the page needs (the only await; the state tree is untouched meanwhile)
    //   2. clearState with the request's data plus the cache — from here nothing yields
    //   3. renderToString, then serializeState
    // Because 2-3 are synchronous, two requests can never see each other's state, even though they
    // share the instance. Returns { html, json, result }; put json in <script type="application/json">.
    //
    // `result(name, ...args)` is what that preloaded call answered, or undefined when it was not
    // preloaded or failed: the caller already paid for these calls, and the answer to "what is this
    // page called", or "is it about anything", is inside them. Without it a server has to re-fetch
    // the subject to title the page, or give every page of a kind the same <title>. It reads this
    // render's calls, whatever the instance renders next. `cache`, the calls as the preload keeps
    // them ({ calls: { key: answer | { $error } } }), goes back for one more release, for a caller
    // that has not moved to `result`.
    //
    // A traced render's `trace` is renderTrace()'s, with `failed` beside it: each service whose
    // preloaded call failed, read or not. The page carries that request's failure (a slot drawn with
    // it, and the `$error` in its state, which the browser reads again), so a cache must not keep it
    // (page-cache.js `decide`).
    async renderRequest({ preload = [], state = {}, layout, namespace = null, trace = false, after = null }) {
        if (!this.ssrRenderer) throw new TypeError(`Juris.renderRequest: ${NO_STRING_RENDERER}`);
        if (layout === undefined) throw new Error("Juris.renderRequest: layout is required");
        const cache = await this.preload(preload);
        // The state is copied too: its roots are often objects the server keeps (a cached
        // configuration), and a component's write under one must stay in this request.
        this.clearState({ ...copyPlain(state), [this.ssrPath]: cache });
        const html = this.renderToString(layout, namespace, { trace });
        const json = this.serializeState();
        const result = (name, ...args) => answerIn(cache.calls, this.callKey(name, args));
        // Asked here, with nothing awaited since the render: what the render set is still this request's.
        const later = after ? after(result) : undefined;
        const out = trace ? { html, json, result, cache, trace: { ...this.renderTrace(), failed: failedIn(cache.calls) } } : { html, json, result, cache };
        return after ? { ...out, after: later } : out;
    }

    renderToString(layout, namespace = null, options = {}) {
        if (!this.ssrRenderer) throw new TypeError(`Juris.renderToString: ${NO_STRING_RENDERER}`);
        return this.ssrRenderer.renderToString(layout, namespace, options);
    }

    // For plugins: note something about the render in progress that the renderer cannot see for
    // itself — that a clock was read, that a random value was drawn. A no-op outside a traced render,
    // and so on an instance with no string renderer.
    markRender(flag) {
        this.ssrRenderer?.trace?.flags.add(String(flag));
    }

    // The last traced render, in a plain serialisable shape, or null (no traced render yet, or no
    // string renderer). `static` is the strong claim: no reactive function ran and nothing was
    // called, so the markup depends on the layout alone.
    renderTrace() {
        const t = this.ssrRenderer?.lastTrace;
        if (!t) return null;
        const paths = [...t.paths];
        return {
            reactive: t.reactive,
            paths,
            roots: [...new Set(paths.map((p) => p.split(".")[0]))],
            calls: [...t.calls],
            services: [...new Set([...t.calls].map((k) => k.slice(0, k.indexOf(":"))))],
            live: [...t.live],
            flags: [...t.flags],
            unknown: [...t.unknown],
            static: t.reactive === 0 && t.calls.size === 0,
        };
    }

    // ---- reactive props ------------------------------------------------------------------
    // A prop can be a plain value, a getter (a function not named on*, called inside the child's
    // bindings so its reads are tracked), or a ref to a state path. Refs compare equal by path, so
    // retained components that receive the same refs are left alone by the reconcile memo.
    // Any of the three may hold, return, or point at a promise: prop() hands it back as-is, and a
    // binding that returns it gets the usual async treatment (last value kept, $async counters,
    // data-pending). To combine an async prop with other state, chain on it inside the binding:
    //   textContent: () => Promise.resolve(api.prop(props.qty)).then((qty) => `${qty} of ${api.getState("max")}`)

    ref(path, defaultValue) {
        return Object.freeze({ [REF]: true, path, defaultValue });
    }

    isRef(value) {
        return value !== null && typeof value === "object" && value[REF] === true;
    }

    // Resolves a prop whichever form it took. Inside a binding, getters and refs register dependencies.
    prop(value, defaultValue) {
        if (typeof value === "function") return value() ?? defaultValue;
        if (this.isRef(value)) return this.getState(value.path, value.defaultValue ?? defaultValue);
        return value ?? defaultValue;
    }

    // Convention: function props named on* (onclick, onPick) are callbacks; any other function prop is a getter.
    isGetterProp(key, value) {
        return typeof value === "function" && !key.startsWith("on");
    }

    deleteState(path) {
        this.stateManager.deleteState(path);
    }

    // An untracked read: nothing re-runs when `path` changes. It is not a read the render can hide,
    // though. During a traced server render the path is recorded like a getState's, because the
    // markup depends on it all the same, and a server deciding whether a page can be kept under its
    // URL needs every root the page read (see renderTrace). Reads that are the framework's own
    // bookkeeping (the preload cache, the router's fields) go through stateManager.peek, which
    // records nothing.
    peek(path) {
        this.stateManager.activeReads?.add(path);
        return this.stateManager.peek(path);
    }

    // Derived state at `path`; the resolver receives the api. See StateManager.compute.
    // Inside a component definition the computed belongs to that instance: it is disposed with it (on
    // the server, when the render ends), so a shared instance never accumulates per-request computeds.
    compute(path, resolver, options) {
        const dispose = this.stateManager.compute(path, () => resolver(this.api), options);
        const instance = this.componentStack[this.componentStack.length - 1];
        if (instance) instance.cleanups.push(dispose);
        return dispose;
    }

    // Returns a dispose function. Once disposed the binding never runs again. The resolver may return
    // a promise (see StateManager.settle); `onSlow(true|false)`, if given, is called when it has been
    // pending longer than pendingDelay and again when it settles (the DOM renderer uses it for data-pending).
    // `owner` is the component instance the binding belongs to: errors are offered to its boundaries
    // (see onError); an error nobody handles is thrown out of the write that caused it, as always.
    bindState(resolver, applyValue, onSlow = null, owner = null) {
        let subscribed = null; // the paths currently subscribed; only the difference is touched per run
        // onError is shared (see handleAsyncError): a binding is created per reactive property, so it
        // carries only plain fields plus the closures it truly needs.
        const binding = { version: 0, pending: false, slow: false, disposed: false, onSlow, owner, juris: this, onError: handleAsyncError };

        const refresh = () => {
            if (binding.disposed) return;
            const run = ++binding.version;
            const { dependencies, value, error: resolverError } = this.stateManager.tryCapture(resolver);
            if (this.devMode && dependencies.size === 0 && !resolverError) {
                console.warn("StateManager: a reactive function read no state paths, so it will never re-run. Read values with getState(path) instead of closing over them.", resolver);
            }
            try {
                if (resolverError) throw resolverError;
                if (value === null || (typeof value !== "object" && typeof value !== "function")) {
                    // A plain value is no promise and no settled one: what settle does with it, without
                    // its frame on the stack of every binding that runs.
                    if (binding.pending) this.stateManager.endPending(binding);
                    applyValue(value);
                } else {
                    this.stateManager.settle(binding, run, value, applyValue);
                }
            } catch (error) {
                const handled = this.resolveError(owner, error, { phase: "binding", component: owner?.name });
                if (!handled) throw error;
                if (handled.layout) this.showFallback(handled.boundary, handled.layout, error);
            } finally {
                // Re-subscribe even if applyValue threw, so one bad frame doesn't kill the binding (but a
                // first run that throws out of bindState is disposed there: see below).
                if (!binding.disposed) subscribed = this.stateManager.resubscribe(refresh, subscribed, dependencies);
            }
        };

        const dispose = () => {
            binding.disposed = true;
            this.stateManager.endPending(binding);
            subscribed = this.stateManager.resubscribe(refresh, subscribed, null);
        };

        this.stateManager.stamp(refresh);
        try {
            refresh();
        } catch (error) {
            // A first run that throws out of here (a FallbackSignal for a boundary still mounting, or an
            // error nobody handled) abandons the draw it was in, and nobody is handed this dispose: the
            // binding goes with the draw. An error a boundary swallowed is not thrown, and keeps it.
            dispose();
            throw error;
        }
        return dispose;
    }

    // A boundary still rendering can't swap its root from inside its own subtree: signal upwards
    // and let its createComponent (or the SSR renderer) mount the fallback instead.
    showFallback(boundary, layout, error) {
        if (boundary.mounting || boundary.ssr) throw new FallbackSignal(boundary, layout, error);
        this.renderer.showFallback(boundary, layout);
    }

    // `layout` as it was given, refused when it is a list: `givenBy` names what gave it, a "component"
    // (its result) or a "seat" (the value of a function in one child's place), for the words (LIST_GIVEN).
    oneLayout(layout, givenBy) {
        if (Array.isArray(layout)) throw new Error(LIST_GIVEN[givenBy]);
        return layout;
    }

    // What a definition's answer draws, an answer that is no function (a function is bound or
    // evaluated first). A definition returns its layout at once, so an `async` one's promise is no
    // layout, and what it resolves to never reaches the draw: nothing is drawn, and devMode says that.
    // Taken as a layout, the promise reached the tag check as a tag named "undefined", and with a key
    // (withKey) it was drawn as an element of that name.
    definitionLayout(result, instance) {
        if (!this.stateManager.isThenable(result)) return this.oneLayout(result, "component");
        // Nothing waits for this promise, so a rejection has nowhere to go. Left alone it was an
        // unhandled rejection, and one failed read in one component ended a server.
        result.then(undefined, (error) => {
            console.error(`Juris: component "${instance.name}": its async definition rejected`, error);
        });
        if (this.devMode) {
            const reason = `component "${instance.name}": its definition returned a promise (it is async),`
                + " so nothing is drawn. A definition returns its layout at once;"
                + " to wait for one, keep the definition plain and return a function that returns the promise";
            this.refused("async-definition", reason, { name: instance.name, value: result, component: instance });
        }
        return null;
    }

    getLayoutEntry(layout) {
        const tag = this.layoutTag(layout);
        return { content: layout[tag], tag };
    }

    // A layout's tag: its first own key (Object.keys(layout)[0]), read without making the list of its
    // keys, as the renderers read it for every element. An own key always comes before an inherited
    // one in a for-in, so the first key is the tag when it is the layout's own, and there is none when
    // it is not.
    layoutTag(layout) {
        if (Array.isArray(layout)) throw new Error(LIST_GIVEN.layout);
        for (const tag in layout) return Object.hasOwn(layout, tag) ? tag : undefined;
        return undefined;
    }

    // { div: "text" } -> { textContent: "text" }; { div: null } -> {}
    // A function is text as a string is ({ b: () => api.call("count") }). devMode remembers that the
    // object came from one (wholeContentOf), as what that function returns is judged in other words.
    normalizeContent(content) {
        if (content === null || content === undefined) return {};
        if (typeof content === "object") return content;
        const normalized = { textContent: content };
        if (this.devMode && typeof content === "function") this.wholeContents.add(normalized);
        return normalized;
    }

    // `tag`, when `content` is what normalizeContent made of a function given as the whole of its
    // content, else null: for the words of what that function returns (layoutInValue). devMode's only.
    wholeContentOf(content, tag) {
        return this.wholeContents.has(content) ? tag : null;
    }

    // devMode's words for an object given where text goes, both renderers' (rejectLayout). `wholeContent`
    // (wholeContentOf) is the element's tag when a function given as its whole content returned the
    // object: { ul: () => [...] } draws its text, which is nothing, where { ul: { children: () => [...] } }
    // draws its list. The author wrote no textContent there, so the words do not speak of one.
    layoutInValue(value, position, wholeContent) {
        const given = Array.isArray(value) ? "a list" : "an object";
        if (wholeContent === null) {
            return `"${position}" was given ${given}, and takes text (a string or a number; a layout goes in children)`;
        }
        return `<${wholeContent}> was given a function as its whole content, which gives text, and it returned ${given}`
            + ` (to draw layouts, make the function its children: { ${wholeContent}: { children: () => [...] } })`;
    }

    isTextLayout(layout) {
        return layout === null || (typeof layout !== "object" && typeof layout !== "function");
    }

    isSeatLayout(layout) {
        return typeof layout === "function";
    }

    textOf(layout) {
        return layout === null || layout === undefined || typeof layout === "boolean" ? "" : String(layout);
    }

    // The class attribute an element gets, by the one rule both renderers draw it with ("Components
    // and layouts" in REFERENCE.md). `base` is what `class` or `className` gives, a string, or null
    // for none; `decisions` are the [className, on] pairs its classList gives, in the order of its
    // keys. Each pair is element.classList.toggle(className, on): on adds the class at the end unless
    // it is there, off takes it out. So a later pair for a class wins over an earlier one, and no
    // class is written twice. The base stays as it is written unless a pair changes it; then the
    // attribute is its classes, once each, a space apart. Null is no attribute: no base, no class on.
    classAttribute(base, decisions) {
        const classes = new Set(base === null ? [] : classTokens(base));
        let changed = false;
        for (const [className, on] of decisions) {
            if (classes.has(className) === on) continue;
            changed = true;
            if (on) {
                classes.add(className);
            } else {
                classes.delete(className);
            }
        }
        if (!changed) return base;
        if (base === null && classes.size === 0) return null;
        return [...classes].join(" ");
    }

    // normalizeContent's `key`, without the object it makes: content that is text or nothing has none.
    getKey(layout) {
        if (this.isTextLayout(layout) || this.isSeatLayout(layout)) return undefined;
        const content = layout[this.layoutTag(layout)];
        return content !== null && typeof content === "object" ? content.key : undefined;
    }

    // Copies the component's own key onto its root layout so keyed reconcile matches component instances.
    withKey(layout, key) {
        if (key === undefined || this.isTextLayout(layout) || this.isSeatLayout(layout)) return layout;
        const { content, tag } = this.getLayoutEntry(layout);
        const normalized = this.normalizeContent(content);
        if (normalized.key !== undefined) return layout;
        return { [tag]: { ...normalized, key } };
    }

    // devMode: a getter prop that is never called is almost always a mistake (the value was wanted, the
    // function was stored). Hand the definition wrapped getters and warn after the first render for any
    // that went unread. The instance keeps the original props so the reconcile memo still compares them.
    watchGetterProps(name, props) {
        const unread = new Set();
        const wrapped = { ...props };
        for (const [key, value] of Object.entries(props)) {
            if (!this.isGetterProp(key, value)) continue;
            unread.add(key);
            wrapped[key] = (...args) => {
                unread.delete(key);
                return value(...args);
            };
        }
        if (unread.size) {
            queueMicrotask(() => {
                for (const key of unread)
                    console.warn(`Juris: component "${name}" received getter prop "${key}" but never called it; read it with props.${key}() or api.prop(props.${key}) inside a binding`);
            });
        }
        return wrapped;
    }

    // Runs a definition with `instance` as the setup context (so onCleanup finds it).
    invokeDefinition(instance, props) {
        this.componentStack.push(instance);
        try {
            return this.componentManager.get(instance.name)(props, this.api);
        } finally {
            this.componentStack.pop();
        }
    }

    // ---- DOM rendering (see DOMRenderer) --------------------------------------------
    render(target, layout, namespace) {
        return this.renderer.render(target, layout, namespace);
    }

    // Client-side attachment to a server-rendered page: replaces whatever `target` contains with a
    // fresh render of `layout` (the transferred state makes it identical), then drops the preloaded
    // call results so later calls go to the services. Pass { release: false } to mount several roots
    // from the same transfer and call releasePreloaded() yourself afterwards.
    mount(target, layout, options = {}) {
        const root = this.renderer.mount(target, layout, options.namespace);
        if (options.release !== false) this.releasePreloaded();
        return root;
    }

    // A layout that came as data: a database row, a request, anything JSON can hold. Tags, attributes,
    // URLs and HTML are checked when it is drawn, as any layout's are (html-safety.js), but a name that
    // is a component is drawn as that component, with the data as its props, and no check can tell a
    // row from a layout written in code. This one can, because the caller says which it holds: every
    // component it names is left out unless `components` lists it, wherever it stands, its props too.
    // A name with a capital counts before anything is registered under it, as it may be later.
    // Answers a copy; a whole layout that was a refused component answers null, which draws nothing.
    layoutFromData(value, { components = [] } = {}) {
        if (!Array.isArray(components) || components.some((name) => typeof name !== "string")) {
            throw new TypeError("Juris: components is a list of component names (\"Badge\", \"Chart\")");
        }
        const allowed = new Set(components);
        const refused = (name) => !allowed.has(name) && (startsUpperCase(name) || this.componentManager.has(name));
        const walk = (node) => {
            if (Array.isArray(node)) return node.map(walk).filter((item) => item !== DROPPED);
            if (node === null || typeof node !== "object") return node;
            const copy = {};
            let dropped = false;
            for (const name of Object.keys(node)) {
                if (name === "__proto__") continue;
                if (refused(name)) {
                    dropped = true;
                    if (this.devMode) this.refused("component-from-data", `component "${name}" named in data`, { name });
                    continue;
                }
                const held = name === "style" ? node[name] : walk(node[name]);
                if (held !== DROPPED) copy[name] = held;
            }
            return dropped && Object.keys(copy).length === 0 ? DROPPED : copy;
        };
        const layout = walk(this.toRaw(value));
        return layout === DROPPED ? null : layout;
    }

    // A layout with named slots, for a shape drawn many times over with different values: a table's
    // rows. Answers a function that takes the values and gives what to draw. `layout` is a layout
    // holding slots ({ $slot: "label" }, which JSON can hold), or a function given `slot`, which makes
    // one, and which reads the value by that name here, where it is called for each draw.
    //
    // With no string renderer this is the whole of it: what is drawn is the ordinary layout, filled.
    // A server instance's renderer compiles it (SSRRenderer.compile in the kit), which writes the
    // same markup without walking the layout again, so the same code runs on both sides.
    compile(layout) {
        const ordinary = (values = {}) => {
            const read = (name) => (Object.hasOwn(values, name) ? values[name] : undefined);
            return typeof layout === "function" ? layout(read) : this.fillSlots(layout, read);
        };

        return this.ssrRenderer ? this.ssrRenderer.compile(layout, ordinary) : ordinary;
    }

    isSlot(node) {
        return node !== null && typeof node === "object" && Object.hasOwn(node, "$slot");
    }

    // A copy of `node` with each slot replaced by what `read` gives for its name. Everything else
    // that is not a plain object or a list is kept as it is, a listener among them. An own `__proto__`
    // key, which a parsed layout can hold, is left out, as layoutFromData leaves it out.
    fillSlots(node, read) {
        if (Array.isArray(node)) return node.map((item) => this.fillSlots(item, read));
        if (this.isSlot(node)) return read(node.$slot);
        if (node === null || typeof node !== "object") return node;

        const prototype = Object.getPrototypeOf(node);
        if (prototype !== Object.prototype && prototype !== null) return node;

        const filled = {};
        for (const key of Object.keys(node)) {
            if (key !== "__proto__") filled[key] = this.fillSlots(node[key], read);
        }
        return filled;
    }

    enhance(target, enhancer, options = {}) {
        return this.renderer.enhance(target, enhancer, options);
    }

    unenhance(element) {
        this.renderer.unenhance(element);
    }

    disposeTree(node) {
        this.renderer.disposeTree(node);
    }

    get componentInstances() {
        return this.renderer.componentInstances;
    }

    // ---- devMode inspection (see ComponentManager) ----------------------------------
    componentTree() {
        return this.componentManager.componentTree();
    }

    findComponents(name) {
        return this.componentManager.find(name);
    }

    onTreeChange(fn) {
        return this.componentManager.onTreeChange(fn);
    }
}
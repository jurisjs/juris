// The client boot: what the browser entry of every server-rendered app does, in the one order that
// works. `hydrate(options)` makes a page the server rendered live, and answers the instance.
//
// The page arrives whole and readable. The server rendered its body into the root element (`#app`),
// wrote the state it rendered with as JSON beside it (`#state`) and, unless the app turned it off, the
// names of the services a browser may call (`#services`); once the page is idle, the document imports
// the app's entry module and calls its `start()` (src/server/document.js). A page kept in a cache
// boots whichever build serves it next, so those names and `start()` do not change between builds.
// `start()` calls this, and the order below is load-bearing:
//
//    1. parse the state
//    2. construct the instance, its services stubs that call the server's over HTTP, and the
//       components the server's instance was given too (`juris.components`); in devMode with the
//       devtools feature, whose module is imported then and only then
//    3. install the plugins: the router, the live client, then the app's own, in the order given
//       (the server installs them in the same order, since an api name is taken once)
//    4. register the app's components
//    5. the skew guard: when this build's route table names the page other than the server's did,
//       this is not the server's code, and it would draw the wrong page; so reload once, before
//       anything is drawn, and answer null
//    6. await the route's own code (every matched record's `load`), so nothing unregistered is drawn
//    7. beforeMount(juris): what the server could not know, such as a reader's preferences, set
//       before the first render reads the state
//    8. mount, replacing the server's markup (and releasing the preloaded calls)
//    9. bind the title
//   10. once the browser is idle, load every other route's code, so the first navigation is instant
//   11. register the service worker when idle, and hand its messages to the app
//   and last, expose the instance under a global name when asked (a test waits for it).
//
// Options:
//   routes                 the route table, as createRouter takes it (required)
//   router                 the router's own options beside its routes (createRouter's), above all
//                          `guard(to, ctx)`, who may open a route, and `context(api)`, the `ctx`
//                          navigate() asks it with: the server's router asks the same guard in its
//                          resolve(), with who is asking there
//   register(juris)        registers the app's components, the `root` one included
//   services               the names of the services a page may call; read from #services when
//                          omitted (none when the page has none)
//   apiBase = "/api"       where the server answers them: a call is a POST to `${apiBase}/<name>`
//   fallback               remoteServices' words for a failure whose answer carries none
//   live = true            the live client (sseClient) at the same base; an object is its options;
//                          false for none. It gives its stream back while the page is in the
//                          back/forward cache, and takes it again when the page is shown from it
//   plugins = []           the app's own plugins, installed after the router and the live client
//   beforeMount(juris)     step 7; may return a promise, which is awaited
//   title                  document.title, bound so it re-runs when what it reads changes; the
//                          server's title stays when omitted. `{ fallback, suffix, max, decorate }`,
//                          the options the server's kernel is given (decorate(text, juris) apart),
//                          names the page as the server did: the router's titleOf on the route's
//                          `head`, with its own data where the page keeps it (`head.dataPath`), so a
//                          page titled from its data keeps its name when it boots. A function,
//                          title(juris), answers the whole title itself
//   skewGuard              { storageKey, reload }, or false (the default). The guard has to remember,
//                          across the reload, that it has reloaded this page already, and it keeps
//                          that in sessionStorage under `storageKey`, a key the app names and lists
//                          among what it stores. `reload` is how, `location.reload()` unless given
//   prefetch = "idle"      "idle", or false to load a route's code only when it is visited
//   serviceWorker          a script URL, or { url, onMessage(data, juris, event) }: registered when
//                          the browser is idle, its messages handed to onMessage; none when omitted
//   expose                 a global name to put the instance under, once it is live
//   stateId = "state", rootId = "app", root = { App: {} }
//                          the page's elements, and the layout mounted into the root
//   juris                  the instance's own options, { allowTags, allowSchemes, allowInnerHTML,
//                          components } (juris.js sharedOptions): the tags and URL schemes both
//                          renderers draw beyond their defaults, whether a layout may set innerHTML,
//                          and the components registered with the instance (before the plugins and
//                          `register`). The same object the server's kernel is given
//                          (createJurisServer's `juris`), from one module both import, or this boot
//                          takes away what the server drew. Nothing else: the state and the services
//                          are the boot's
//   devMode                true or false; left out, the page decides: a <script type="application/json"
//                          id="juris-dev">, which the kit's kernel writes in development only, turns
//                          it on. In devMode the instance is given the devtools feature (devtools.js),
//                          imported here and only then, so a page with devMode off never downloads it
// Those are all the options, and `title`, `skewGuard` and `serviceWorker` take only the keys named:
// any other, and a malformed value, is refused with a TypeError before the page is read. `router`,
// `live` and `juris` are refused as createRouter, sseClient and sharedOptions refuse them, before
// the page is read too.
//
// Nothing here writes browser storage but the skew guard, under the key the app gives it.
import Juris, { sharedOptions } from "./juris.js";
import { createRouter, titleOf } from "./router.js";
import { remoteServices, sseClient } from "./remote-services.js";

const TITLE_OPTIONS = new Set(["fallback", "suffix", "max", "decorate"]);
const SKEW_OPTIONS = new Set(["storageKey", "reload"]);
const WORKER_OPTIONS = new Set(["url", "onMessage"]);
const OPTIONS = new Set(["routes", "router", "register", "services", "apiBase", "fallback", "live", "plugins", "beforeMount", "title", "skewGuard",
    "prefetch", "serviceWorker", "expose", "stateId", "rootId", "root", "juris", "devMode"]);

// Late is the whole point of what runs here, so where there is no requestIdleCallback (Safari), a
// timer stands in. Asked by type, not presence: where the API is missing, an element with
// id="requestIdleCallback" is a global of that name (a named element on window), which `??` took
// for the function, and calling it threw.
const whenIdle = (fn) => (typeof globalThis.requestIdleCallback === "function" ? globalThis.requestIdleCallback(fn) : setTimeout(fn, 1200));

const isFunction = (value) => typeof value === "function";
const isName = (value) => typeof value === "string" && value.length > 0;

// Answers the instance's own options (`juris`), checked.
function checkOptions(options) {
    if (options === null || typeof options !== "object") throw new TypeError("hydrate: options is an object");
    for (const key of Object.keys(options)) {
        if (!OPTIONS.has(key)) throw new TypeError(`hydrate: "${key}" is not an option (${[...OPTIONS].join(", ")})`);
    }
    const { routes, router, register, services, apiBase, fallback, live, plugins, beforeMount, title, skewGuard, prefetch, serviceWorker, expose, stateId, rootId, root, devMode } = options;
    if (!Array.isArray(routes)) throw new TypeError("hydrate: routes is the route table, an array");
    if (router !== undefined && (router === null || typeof router !== "object" || Array.isArray(router))) throw new TypeError("hydrate: router is the router's options beside its routes ({ guard, context, … })");
    if (router && "routes" in router) throw new TypeError("hydrate: router.routes: the routes are an option of their own, routes");
    for (const [name, value] of Object.entries({ register, fallback, beforeMount })) {
        if (value !== undefined && !isFunction(value)) throw new TypeError(`hydrate: ${name} is a function`);
    }
    if (title !== undefined && !isFunction(title)) {
        if (title === null || typeof title !== "object" || Array.isArray(title)) throw new TypeError("hydrate: title is a function, or { fallback, suffix, max, decorate }");
        for (const key of Object.keys(title)) {
            if (!TITLE_OPTIONS.has(key)) throw new TypeError(`hydrate: title.${key} is not an option (${[...TITLE_OPTIONS].join(", ")})`);
        }
        for (const key of ["fallback", "suffix"]) if (title[key] !== undefined && typeof title[key] !== "string") throw new TypeError(`hydrate: title.${key} is a string`);
        if (title.max !== undefined && !(typeof title.max === "number" && title.max >= 0)) throw new TypeError("hydrate: title.max is a number of characters");
        if (title.decorate !== undefined && !isFunction(title.decorate)) throw new TypeError("hydrate: title.decorate is a function, decorate(text, juris)");
    }
    if (services !== undefined && !(Array.isArray(services) && services.every(isName))) throw new TypeError("hydrate: services is a list of service names");
    if (plugins !== undefined && !Array.isArray(plugins)) throw new TypeError("hydrate: plugins is a list");
    // A list too, as sseClient refuses one: spread into its options below, it used to boot with the defaults.
    if (live !== undefined && typeof live !== "boolean" && (live === null || typeof live !== "object" || Array.isArray(live))) throw new TypeError("hydrate: live is true, false, or the live client's options");
    if (prefetch !== undefined && prefetch !== "idle" && prefetch !== false) throw new TypeError('hydrate: prefetch is "idle" or false');
    for (const [name, value] of Object.entries({ apiBase, expose, stateId, rootId })) {
        if (value !== undefined && !isName(value)) throw new TypeError(`hydrate: ${name} is a non-empty string`);
    }
    if (skewGuard !== undefined && skewGuard !== false) {
        if (skewGuard === null || typeof skewGuard !== "object") throw new TypeError("hydrate: skewGuard is { storageKey, reload } or false");
        for (const key of Object.keys(skewGuard)) {
            if (!SKEW_OPTIONS.has(key)) throw new TypeError(`hydrate: skewGuard.${key} is not an option (${[...SKEW_OPTIONS].join(", ")})`);
        }
        if (!isName(skewGuard.storageKey)) throw new TypeError("hydrate: skewGuard.storageKey names the sessionStorage key the guard keeps its mark in");
        if (skewGuard.reload !== undefined && !isFunction(skewGuard.reload)) throw new TypeError("hydrate: skewGuard.reload is a function");
    }
    if (devMode !== undefined && typeof devMode !== "boolean") throw new TypeError("hydrate: devMode is true or false (left out, the page's #juris-dev turns it on)");
    if (root !== undefined && (root === null || typeof root !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(root)))) {
        throw new TypeError("hydrate: root is the layout mounted into the page's root element, a plain object ({ App: {} })");
    }
    if (serviceWorker !== undefined && !isName(serviceWorker)) {
        if (serviceWorker === null || typeof serviceWorker !== "object" || !isName(serviceWorker.url)) throw new TypeError("hydrate: serviceWorker is a script URL, or { url, onMessage }");
        for (const key of Object.keys(serviceWorker)) {
            if (!WORKER_OPTIONS.has(key)) throw new TypeError(`hydrate: serviceWorker.${key} is not an option (${[...WORKER_OPTIONS].join(", ")})`);
        }
        if (serviceWorker.onMessage !== undefined && !isFunction(serviceWorker.onMessage)) throw new TypeError("hydrate: serviceWorker.onMessage is a function");
    }
    return sharedOptions(options.juris, "hydrate");
}

// Step 5. `served` is the name the server's route table gave the page, read from the state before the
// router was installed (installing it derives the name again, with this build's table, in the same
// object). `drawn` is this build's. They differ when this is not the server's code: a module from
// an older build in the browser's cache, or from another instance mid-deploy. The server sent the
// right page, and this code would quietly replace it with the wrong one ("not found", often), so
// the page is loaded again, once. The mark, the page's path in sessionStorage, is what stops a second
// reload if the two still disagree after it; storage that will not keep it means no reload at all,
// since a reload it cannot remember could be the first of many. True when it reloads.
function skewReload({ storageKey, reload = () => location.reload() }, { served, drawn, path }) {
    const storage = () => globalThis.sessionStorage;
    if (served && drawn !== served) {
        let reloaded = false;
        try { reloaded = storage().getItem(storageKey) === path; } catch { /* unreadable: see below */ }
        if (!reloaded) {
            let kept = false;
            try {
                storage().setItem(storageKey, path);
                kept = storage().getItem(storageKey) === path;
            } catch { /* blocked */ }
            if (kept) {
                console.warn(`Juris: the server rendered this page as route "${served}", which this build calls "${drawn ?? "nothing"}": the code is not the server's. Reloading once.`);
                reload();
                return true;
            }
            console.error(`Juris: the server rendered this page as route "${served}", which this build calls "${drawn ?? "nothing"}", and there is nowhere to remember a reload, so the page is drawn as this build has it.`);
        } else {
            console.error(`Juris: still out of step with the server after a reload (route "${served}" there, "${drawn ?? "nothing"}" here). Clearing this site's data in the browser should help.`);
        }
    }
    try { storage().removeItem(storageKey); } catch { /* nothing to clear */ }
    return false;
}

// The <script type="application/json"> the server wrote with this id, or null.
const jsonScript = (id) => {
    for (const script of document.querySelectorAll('script[type="application/json"]')) if (script.id === id) return script;
    return null;
};

// What hydrate says when the page has no state script to boot on: the page contract's #state, which
// the kit's renderDocument writes (REFERENCE.md, "The page contract"). Reading it threw "Cannot read
// properties of null (reading 'textContent')", which named neither the script nor the id.
const noStateScript = (id) => `hydrate: the page has no <script type="application/json" id="${id}">,`
    + ' the state the server rendered it with ("The page contract");'
    + ` a <script id="${id}"> without that type is not read`;

export async function hydrate(options = {}) {
    const instanceOptions = checkOptions(options);
    const {
        routes, router: routerOptions = {}, register, services, apiBase = "/api", fallback, live = true, plugins = [], beforeMount, title,
        skewGuard = false, prefetch = "idle", serviceWorker, expose, stateId = "state", rootId = "app", root = { App: {} }, devMode,
    } = options;
    // Made first, so an option the router or the live client refuses is refused before the page is
    // read (making either installs nothing).
    const router = createRouter({ ...routerOptions, routes });
    const liveClient = live ? sseClient({ base: apiBase, ...(live === true ? {} : live) }) : null;

    // 1. The state the server rendered with, and what its route table called this page. Read from
    // the server's JSON script only: an element the page's content drew comes earlier in the
    // document, so a lookup by id alone took a member's content (a badge with id="state") for the
    // page's state. The renderers never draw a <script>, so no content can be one of these.
    const stateScript = jsonScript(stateId);
    if (stateScript === null) throw new Error(noStateScript(stateId));
    const state = JSON.parse(stateScript.textContent);
    const served = state?.[router.routePath]?.name;
    let names = services;
    if (!names) {
        const listed = jsonScript("services");
        names = listed ? JSON.parse(listed.textContent) : [];
    }
    const inDevMode = devMode ?? jsonScript("juris-dev") !== null;

    // 2. The instance, with a stub for each service it may call, and the app's own options, which the
    // server's instance was given too (its components among them, registered as it is built). In
    // devMode, the devtools feature, from a module imported now.
    const devOptions = inDevMode ? { devMode: true, features: { devtools: (await import("./devtools.js")).Devtools } } : {};
    const juris = new Juris({ ...instanceOptions, ...devOptions, state, services: remoteServices(names, { base: apiBase, fallback }) });

    // 3. Plugins: the router, one event stream for every live query on the page, then the app's.
    juris.use(router);
    if (liveClient) juris.use(liveClient);
    for (const plugin of plugins) juris.use(plugin);

    // 4. Components.
    register?.(juris);

    // 5. The skew guard, before anything is fetched or drawn.
    const path = juris.stateManager.peek(`${router.routePath}.path`) ?? "/";
    const here = router.match(path);
    if (skewGuard && skewReload(skewGuard, { served, drawn: here.name, path })) return null;

    // 6. This route's own code.
    const loading = router.loadFor(here.matched);
    if (loading) await loading;

    // 7. What the server could not know.
    const settling = beforeMount?.(juris);
    if (settling && isFunction(settling.then)) await settling;

    // 8. Drawn.
    juris.mount(rootId, root);

    // 9. The title follows what it reads: with options, the page's name as the server gave it, from
    // the route's head and the data the page keeps at head.dataPath.
    const titled = isFunction(title) ? () => title(juris) : title ? () => {
        const head = router.headOf(juris.getState(`${router.routePath}.matched`, []));
        const text = titleOf(head, head.dataPath ? juris.getState(head.dataPath, undefined) : undefined, title);
        return title.decorate ? title.decorate(text, juris) : text;
    } : null;
    if (titled) juris.bindState(titled, (text) => { if (typeof text === "string") document.title = text; });

    // 10. Every other route's code, one at a time, once nothing better is waiting. A failure is not an
    // error (the route loads its code when it is visited, and falls back to a full load), and stops
    // the rest.
    if (prefetch === "idle") {
        whenIdle(() => {
            (async () => {
                for (const record of router.records) {
                    const pending = router.loadFor([record.index]);
                    if (pending) await pending;
                }
            })().catch(() => { /* a prefetch failing is not an error */ });
        });
    }

    // 11. The service worker, late: it has nothing to do with the first paint.
    const worker = typeof serviceWorker === "string" ? { url: serviceWorker } : serviceWorker;
    const container = globalThis.navigator?.serviceWorker;
    if (worker && container) {
        whenIdle(() => {
            Promise.resolve().then(() => container.register(worker.url)).catch(() => { /* no worker, no harm */ });
        });
        if (worker.onMessage) container.addEventListener("message", (event) => worker.onMessage(event.data, juris, event));
    }

    if (expose) globalThis[expose] = juris;
    return juris;
}

export default hydrate;

// State-based router for Juris. The route is state under `$route` (routePath option):
//
//   $route.path      "/lots/L1"          raw state: writing it IS navigation
//   $route.query     { filter: "done" }  raw state: writing it updates the URL
//   $route.hash      "top"               raw state
//   $route.name      "lot"               derived from path + route table (leaf-level writes, so a
//   $route.params    { id: "L1" }        reader of $route.params.id wakes only when the id changes)
//   $route.matched   [0, 3]              derived: indices into router.records, outermost first
//   $route.meta      { ... }             derived: merged meta of the matched chain
//
// Install: juris.use(createRouter({ routes, mode, base }))  →  api.navigate, api.link, api.isActive,
// api.route, api.router; components RouterView and Link. On the client the URL follows the state
// (pushState / replaceState) and popstate writes back; on the server nothing touches a location —
// router.resolve(url) gives the state, the preload list and the route (and whether it is a 404) for
// a request. A route's `head` says what its page is called, and `titleOf` (at the end of this file)
// is the one function a server and a browser both ask to name it.
//
// A route record may carry `load(juris)`: whatever must happen before the route can be drawn, which
// in practice is fetching the page's module and registering its components. With `register` beside
// it, `load()` answers the page's module (`() => import("./pages/x.js")`) and the router calls
// `register(module, juris)` itself, once per module on each instance: routes that share a module
// share its register, so it runs for whichever reaches it first, and a register that throws has its
// error thrown again to every later caller, so a half-registered module never looks loaded.
// navigate() and Back / Forward (popstate) await every matched record's load before the location is
// written, so the page being left stays up until the next one can draw, and an unregistered
// component is never rendered (RouterView would not draw it again once it registered: a blank page
// that stays blank). Each load runs once per router, which is once per instance; one that fails is
// tried again on the next navigation. A load that throws or rejects, register included, falls back
// to a full page load of the address: the router makes it the tab's entry, marked in history.state,
// and calls `fullLoad(url)` (a reload by default). An entry that already carries the mark is not
// loaded in full again, so a page whose code keeps failing cannot loop. A server loads every route's
// code up front with `loadAll()`.

import { trailKey } from "./storage.js";

const MAX_REDIRECTS = 10;

// What createRouter takes. Anything else is refused: a misspelt `guard` would leave every route open
// without a word.
const OPTIONS = new Set(["routes", "mode", "base", "routePath", "scroll", "fullLoad", "guard", "context", "history"]);
const HISTORY_OPTIONS = new Set(["storage", "key"]);

// The fields the router keeps in history.state on the entries it makes: the entry's place in the
// trail, and the mark of a full load. Anything else there is somebody else's, and a replace keeps it.
const others = (state) => {
    if (!state || typeof state !== "object") return {};
    const { juris, idx, fullLoad, ...rest } = state;
    return rest;
};

// A path starts with exactly one "/" and ends with none. A backslash is read as "/", as a browser
// reads one in a URL (and as the kernel's canonicalPath does), and a tab or a newline, which a browser
// drops from a URL, is dropped: `/\evil.com`, `\\evil.com` or `/<tab>/evil.com` was answered as it
// came, and a browser given it as a Location or an href reads `//evil.com`, another host. So no
// target the router answers can name one. `%5C` is not a backslash to a browser, and stays.
const trimSlashes = (path) => path.replace(/[\t\n\r]/g, "").replace(/\\/g, "/").replace(/\/+$/, "").replace(/^\/*/, "/");

// The object has no prototype, and membership is tested with hasOwn rather than `in`. Both matter:
// `?hasOwnProperty=1` used to find the INHERITED method and produce `[function, "1"]` — a function
// in data parsed from a URL — and `?__proto__=a&__proto__=b` used to replace the query object's own
// prototype with an array. Neither reached Object.prototype, but both put values in the query that
// no caller could have expected.
export function parseQuery(search) {
    const query = Object.create(null);
    for (const [key, value] of new URLSearchParams(search.replace(/^\?/, ""))) {
        // A null-prototype object has no `__proto__` setter to trip over, so this is a plain own key.
        if (!Object.hasOwn(query, key)) query[key] = value;
        else query[key] = Array.isArray(query[key]) ? [...query[key], value] : [query[key], value];
    }
    return query;
}

export function formatQuery(query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
        if (value === undefined || value === null) continue;
        for (const item of Array.isArray(value) ? value : [value]) params.append(key, String(item));
    }
    const text = params.toString();
    return text ? `?${text}` : "";
}

// The params of one matched record. A segment that cannot be decoded — `%E0%A4%A`, which a crawler
// will send — is kept as it arrived rather than throwing URIError out of match() and into whatever
// the host does with it. The route still matches; the id simply does not exist, which is what the
// URL was saying anyway, and the page that handles "no such thing" handles it.
function decodeParams(keys, found) {
    const params = {};
    for (let i = 0; i < keys.length; i += 1) {
        const raw = found[i + 1] ?? "";
        try {
            params[keys[i]] = decodeURIComponent(raw);
        } catch {
            params[keys[i]] = raw;
        }
    }
    return params;
}

// Splits "/a/b?x=1#h" into its three parts, path normalised to a leading and no trailing slash.
export function splitUrl(url) {
    const hashIndex = url.indexOf("#");
    const hash = hashIndex === -1 ? "" : url.slice(hashIndex + 1);
    const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
    const queryIndex = beforeHash.indexOf("?");
    const query = queryIndex === -1 ? {} : parseQuery(beforeHash.slice(queryIndex + 1));
    const path = trimSlashes(queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex)) || "/";
    return { path, query, hash };
}

export function joinUrl({ path, query, hash }) {
    return `${path}${formatQuery(query)}${hash ? `#${hash}` : ""}`;
}

// "/lots/:id/files/*rest" -> { regex, keys: ["id", "rest"], catchAll }
function compilePath(path) {
    const keys = [];
    let catchAll = false;
    const source = path
        .split("/")
        .filter(Boolean)
        .map((segment) => {
            if (segment === "*") {
                catchAll = true;
                keys.push("pathMatch");
                return "(.*)";
            }
            if (segment.startsWith("*")) {
                catchAll = true;
                keys.push(segment.slice(1));
                return "(.*)";
            }
            if (segment.startsWith(":")) {
                keys.push(segment.slice(1));
                return "([^/]+)";
            }
            return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        })
        .join("/");
    const regex = new RegExp(`^/${source}${catchAll ? "" : "/?"}$`);
    return { regex, keys, catchAll };
}

export class Router {
    constructor(config = {}) {
        for (const key of Object.keys(config)) {
            if (!OPTIONS.has(key)) throw new TypeError(`Router: "${key}" is not an option (${[...OPTIONS].join(", ")})`);
        }
        for (const name of ["guard", "context", "fullLoad"]) {
            if (config[name] !== undefined && typeof config[name] !== "function") throw new TypeError(`Router: ${name} is a function`);
        }
        this.mode = config.mode ?? "history"; // or "hash"
        this.base = trimSlashes(config.base ?? "/");
        if (this.base === "/") this.base = "";
        this.routePath = config.routePath ?? "$route";
        // A root of the state: the boot reads the route as `state[routePath]`, so a nested name
        // would find nothing there.
        if (typeof this.routePath !== "string" || !this.routePath || this.routePath.includes(".")) {
            throw new TypeError(`Router: routePath is a root of the state, a name with no ".", not ${JSON.stringify(config.routePath)}`);
        }
        this.scroll = config.scroll ?? "top"; // "top" | false
        this.records = [];
        this.byName = new Map();
        this.compile(config.routes ?? [], null, "");
        this.juris = null;
        this.pending = null; // the latest navigate or popstate: one still in its guards or loads is superseded
        this.replaceNext = false;
        this.syncing = false;
        // record.load -> its promise while it runs, then true. A failed load is forgotten, so the
        // next navigation there tries again.
        this.loads = new Map();
        // A page module -> null once its register has run, or the error it threw, which every later
        // load of that module throws again. Per router, so per instance.
        this.registered = new Map();
        // Called with the address after the router has made it the tab's current entry. The default
        // reloads, so the server sends that page whole; history.state (and the mark) survive a reload.
        this.fullLoad = config.fullLoad ?? (() => window.location.reload());
        // Who may open a route: guard(to, ctx) answers nothing (undefined or null) or true to go on, or
        // a location to send the visitor to instead (verdict). It is asked with the route and a context and nothing else, on a server
        // in resolve() with the request's (who is asking), and in a browser by navigate() with
        // `context(api)`, so the one function decides alike on both sides. A server renders every
        // request on one instance, so a guard must read nothing but its two arguments: the instance's
        // state is whichever request rendered last.
        this.guard = config.guard ?? null;
        this.context = config.context ?? (() => ({}));
        // The trail's length, kept for the tab so a reload still knows how far Forward can go:
        // `history: { storage, key }` (sessionStorage, under src/storage.js's key for this router's
        // state root and base, unless told), or `false` to keep it in the page's memory alone.
        const history = config.history ?? {};
        if (history !== false) {
            if (history === null || typeof history !== "object" || Array.isArray(history)) throw new TypeError("Router: history is { storage, key }, or false to store nothing");
            for (const key of Object.keys(history)) {
                if (!HISTORY_OPTIONS.has(key)) throw new TypeError(`Router: history.${key} is not an option (storage, key)`);
            }
            if (history.key !== undefined && !(typeof history.key === "string" && history.key)) throw new TypeError("Router: history.key is a non-empty string");
            if (history.storage !== undefined && typeof history.storage?.getItem !== "function") throw new TypeError("Router: history.storage is a Storage (getItem, setItem)");
        }
        this.trail = history === false ? null : { storage: history.storage ?? null, key: history.key ?? trailKey({ routePath: this.routePath, base: this.base }) };
    }

    // The guard's answer for a route, as a target to go to instead, or null to go on. `to` is the
    // route: its path, query, hash, params, name and merged meta.
    verdict(to, ctx) {
        if (!this.guard) return null;
        const answer = this.guard(to, ctx);
        if (answer === undefined || answer === null || answer === true) return null;
        if ((typeof answer === "string" && answer) || (typeof answer === "object" && typeof answer.then !== "function")) return answer;
        throw new TypeError(`Router: a guard answers a location to go to instead, or nothing; for "${to.path}" it answered ${typeof answer === "string" ? '""' : String(answer)}`);
    }

    // ---- route table --------------------------------------------------------------------

    compile(routes, parent, prefix) {
        for (const route of routes) {
            const relative = route.path ?? "";
            const full = relative.startsWith("/") ? relative : `${prefix}/${relative}`;
            const path = trimSlashes(full) || "/";
            const record = {
                index: this.records.length,
                path,
                name: route.name,
                component: route.component,
                props: route.props,
                redirect: route.redirect,
                beforeEnter: route.beforeEnter,
                load: route.load,
                register: route.register,
                preload: route.preload,
                meta: route.meta ?? {},
                head: route.head ?? {},
                parent,
                depth: parent ? parent.depth + 1 : 0,
                hasChildren: Array.isArray(route.children) && route.children.length > 0,
                ...compilePath(path),
            };
            this.records.push(record);
            if (record.name !== undefined) {
                if (this.byName.has(record.name)) throw new Error(`Router: duplicate route name "${record.name}"`);
                this.byName.set(record.name, record);
            }
            if (record.hasChildren) this.compile(route.children, record, path === "/" ? "" : path);
        }
    }

    // The deepest matching record wins; catch-alls only when nothing else matches; ties by order.
    match(path) {
        let best = null;
        let bestScore = -Infinity;
        for (const record of this.records) {
            const found = record.regex.exec(path);
            if (!found) continue;
            const score = record.catchAll ? -1 : record.depth;
            if (score > bestScore) {
                bestScore = score;
                best = { record, params: decodeParams(record.keys, found) };
            }
        }
        if (!best) return { record: null, params: {}, matched: [], meta: {}, name: undefined };
        const chain = [];
        for (let r = best.record; r; r = r.parent) chain.unshift(r);
        const meta = Object.assign({}, ...chain.map((r) => r.meta));
        return { record: best.record, params: best.params, matched: chain.map((r) => r.index), meta, name: best.record.name };
    }

    // { path, query, hash } for a string or a { name, params, query, hash } / { path, query, hash } object.
    resolveTarget(to, current = null) {
        if (typeof to === "string") return splitUrl(to);
        if (to?.name !== undefined) {
            const record = this.byName.get(to.name);
            if (!record) throw new Error(`Router: unknown route name "${to.name}"`);
            const path = record.path.replace(/\*?[:*]([^/]+)|\*/g, (m, key) => {
                const value = to.params?.[key ?? "pathMatch"] ?? current?.params?.[key ?? "pathMatch"];
                if (value === undefined) throw new Error(`Router: missing param "${key ?? "pathMatch"}" for route "${to.name}"`);
                return encodeURIComponent(String(value));
            });
            return { path: trimSlashes(path) || "/", query: to.query ?? {}, hash: to.hash ?? "" };
        }
        return { path: trimSlashes(to?.path ?? current?.path ?? "/") || "/", query: to?.query ?? {}, hash: to?.hash ?? "" };
    }

    // Follows static redirects on the route table; returns the final target.
    followRedirects(target) {
        for (let hops = 0; hops < MAX_REDIRECTS; hops += 1) {
            const { record, params } = this.match(target.path);
            if (!record?.redirect) return target;
            const to = typeof record.redirect === "function" ? record.redirect({ ...target, params }) : record.redirect;
            target = this.resolveTarget(to, { ...target, params });
        }
        throw new Error(`Router: too many redirects resolving "${target.path}"`);
    }

    // Preload entries for a location: every matched record's preload({ params, query, path, ...extra }),
    // outermost first.
    //
    // `extra` is whatever the caller knows that the URL does not — in practice, who is asking. A
    // preload entry has to be the SAME call the component will make, argument for argument, or the
    // render finds nothing in the cache; so when a service's answer depends on the viewer, the
    // viewer has to be one of its arguments, and this is how it reaches the preload.
    preloadFor(location, extra = null) {
        const { params, matched } = this.match(location.path);
        const entries = [];
        for (const index of matched) {
            const record = this.records[index];
            if (typeof record.preload === "function") entries.push(...(record.preload({ ...location, params, ...extra }) ?? []));
        }
        return entries;
    }

    // Server: everything a request needs. `state` goes into renderRequest's state (spread it), `preload`
    // is its preload list; `redirect` (a URL) is set when the table redirects, so the server can 30x.
    // The route the address lands on (after the table's redirects) comes with it, so a server never
    // reads the address a second time: its `name` (null when it has none), `params`, merged `meta`,
    // `matched` (record indices, outermost first) and `notFound`, true when that route is the one
    // for addresses nothing else answers: a record whose path ends in a bare `*` (a named rest
    // parameter, `*rest`, is a route like any other), or no record at all.
    //
    // The guard is asked about that route with `ctx`, who is asking as the server knows it (nobody's
    // when none is given), and a location it answers is the `redirect`: the page is not to be drawn.
    resolve(url, extra = null, ctx = {}) {
        const location = this.fromUrl(url);
        const final = this.followRedirects(location);
        let redirect = joinUrl(final) !== joinUrl(location) ? this.toUrl(final) : null;
        const { record, params, matched, meta, name } = this.match(final.path);
        const refused = this.verdict({ ...final, params, name, meta }, ctx ?? {});
        if (refused !== null) redirect = this.toUrl(this.followRedirects(this.resolveTarget(refused, { ...final, params })));
        return {
            state: { [this.routePath]: { path: final.path, query: final.query, hash: final.hash } },
            preload: this.preloadFor(final, extra),
            redirect,
            name: name ?? null,
            params,
            meta,
            matched,
            notFound: !record || /(^|\/)\*$/.test(record.path),
            head: this.headOf(matched),
        };
    }

    // What a matched chain says about its page: each record's `head` merged over its parents',
    // outermost first ({ title, titleFrom, dataPath, description }). `meta.title` and `meta.titleFrom`
    // stand for head.title and head.titleFrom where no head says (for one release), so a table written
    // before `head` is titled as it was.
    headOf(matched) {
        const chain = [...(matched ?? [])].map((index) => this.records[index]).filter(Boolean);
        const head = Object.assign({}, ...chain.map((record) => record.head));
        for (const key of ["title", "titleFrom"]) {
            if (head[key] !== undefined) continue;
            for (const record of chain) if (record.meta?.[key] !== undefined) head[key] = record.meta[key];
        }
        return head;
    }

    // ---- URLs (base + mode) ---------------------------------------------------------------

    fromUrl(url) {
        if (this.mode === "hash") {
            const hashIndex = url.indexOf("#");
            return splitUrl(hashIndex === -1 ? "/" : url.slice(hashIndex + 1) || "/");
        }
        let rest = url.startsWith("http") ? url.replace(/^https?:\/\/[^/]+/, "") : url;
        if (this.base && (rest === this.base || rest.startsWith(`${this.base}/`) || rest.startsWith(`${this.base}?`) || rest.startsWith(`${this.base}#`))) rest = rest.slice(this.base.length) || "/";
        return splitUrl(rest);
    }

    toUrl(location) {
        const url = joinUrl(location);
        return this.mode === "hash" ? `${this.base}#${url}` : `${this.base}${url}`;
    }

    // ---- install --------------------------------------------------------------------------

    install(juris) {
        if (this.juris) throw new Error("Router: already installed");
        this.juris = juris;
        const rp = this.routePath;
        const sm = juris.stateManager;
        const client = !juris.isServer && typeof window !== "undefined" && window.location && window.history;

        // Derivation: path -> name / params / matched / meta, written per leaf so readers wake precisely.
        // A plain binding rather than compute(): the derived paths stay writable-looking but the router
        // overwrites them on every path change. Global, like a computed registered at setup; survives clearState.
        juris.bindState(
            () => juris.getState(`${rp}.path`),
            (path) => {
                if (path === undefined) return;
                const { params, matched, meta, name } = this.match(path);
                juris.batch(() => {
                    juris.setValue(`${rp}.name`, name ?? null);
                    this.writeObject(`${rp}.params`, params);
                    this.writeObject(`${rp}.meta`, meta);
                    const previous = sm.peek(`${rp}.matched`);
                    if (!Array.isArray(previous) || previous.length !== matched.length || previous.some((v, i) => v !== matched[i])) juris.setValue(`${rp}.matched`, matched);
                });
            },
        );

        if (client) {
            // Adopt a transferred route; otherwise read the location. The server never sees the
            // #fragment, and a page kept in a cache was rendered from its cache key, without the
            // query parameters it does not read; so where the transferred route is this address's
            // path, the address bar's query and hash are kept. Adopting the server's whole used to
            // make the first URL write (below) replace them away.
            const address = this.fromUrl(`${window.location.pathname}${window.location.search}${window.location.hash}`);
            const transferred = sm.peek(`${rp}.path`);
            if (transferred === undefined || transferred === address.path) this.writeLocation(address);
            // Where this tab is in its own trail, as state: `${rp}.history = { index, length }`. Browsers
            // will not say whether there is anything to go back or forward to, so the router records it:
            // each entry it makes carries its position (`idx`), and the length is kept for the tab
            // (sessionStorage) so a reload still knows what lies ahead. index 0 is where this tab entered
            // the app — a Back button at 0 would leave the app, so it has nowhere to go.
            // Where it is kept is the router's `history` option; with `false`, nowhere but this page.
            const trail = this.trail;
            const storage = () => trail?.storage ?? globalThis.sessionStorage;
            const readLength = () => { if (!trail) return 0; try { return Number(storage().getItem(trail.key)) || 0; } catch { return 0; } };
            const writeHistory = (index, length) => {
                if (trail) { try { storage().setItem(trail.key, String(length)); } catch { /* private mode: this page's memory only */ } }
                juris.setValue(`${rp}.history`, { index, length });
            };
            // An entry the router has not marked is a fresh one: the tab came to this address anew
            // (typed, a link from elsewhere), and whatever lay ahead of it before is gone, so a stored
            // length is not believed there. A marked one (a reload, a return to the app) keeps it.
            const fresh = !Number.isInteger(window.history.state?.idx);
            const index = fresh ? 0 : window.history.state.idx;
            if (fresh) window.history.replaceState({ ...others(window.history.state), juris: true, idx: 0 }, "");
            writeHistory(index, fresh ? 1 : Math.max(index + 1, readLength()));
            this.back = () => { if (sm.peek(`${rp}.history.index`) > 0) window.history.back(); };
            this.forward = () => { const h = sm.peek(`${rp}.history`); if (h && h.index < h.length - 1) window.history.forward(); };
            // State -> URL. The first write only settles the address this page was opened at (a
            // normalised form of it): it replaces the entry, it is not a step in the trail, and it
            // keeps what the entry carried (the full-load mark, below, is how a page that was opened
            // by one knows).
            let settling = true;
            // The address as toUrl writes it, to compare like with like: in hash mode the route is
            // the fragment alone, and the path and query in front of it are the page's, not the
            // route's, so every navigation to where the tab already was pushed a second entry.
            const addressNow = () => (this.mode === "hash" ? window.location.hash : `${window.location.pathname}${window.location.search}${window.location.hash}`);
            const comparable = (url) => (this.mode === "hash" ? url.slice(url.indexOf("#")) : url);
            juris.bindState(
                // The URL is made inside the binding, so every query key it is made of is read here and
                // a write to one wakes it. The query used to be read untracked, which woke it for a key
                // added or a whole new query only: a write to a key the route already had never
                // reached the address bar.
                () => this.toUrl({ path: juris.getState(`${rp}.path`, "/"), query: juris.getState(`${rp}.query`, {}), hash: juris.getState(`${rp}.hash`, "") }),
                (url) => {
                    if (this.syncing) return;
                    const first = settling;
                    settling = false;
                    // A navigate's { replace } is for the write it made, whether or not that moved the
                    // address. Kept past a write that did not, it made the next raw write of $route.path
                    // replace the entry rather than push one.
                    const replace = this.replaceNext;
                    this.replaceNext = false;
                    if (comparable(url) === addressNow()) return;
                    const now = sm.peek(`${rp}.history`) ?? { index: 0, length: 1 };
                    // A replace keeps what others put on the entry; the settle keeps the entry whole,
                    // the full-load mark included, which is how a page opened by one knows.
                    if (first) window.history.replaceState({ ...(window.history.state ?? {}), juris: true, idx: now.index }, "", url);
                    else if (replace) window.history.replaceState({ ...others(window.history.state), juris: true, idx: now.index }, "", url);
                    else {
                        // A new page: one step on, and whatever was ahead is gone (as in any browser).
                        window.history.pushState({ juris: true, idx: now.index + 1 }, "", url);
                        writeHistory(now.index + 1, now.index + 2);
                    }
                    if (this.scroll === "top" && typeof window.scrollTo === "function") window.scrollTo(0, 0);
                },
            );
            // URL -> state. The trail follows the tab at once; the page follows once its code is here.
            this.onPopState = (event) => {
                const h = sm.peek(`${rp}.history`) ?? { index: 0, length: 1 };
                if (Number.isInteger(event?.state?.idx)) writeHistory(event.state.idx, Math.max(h.length, event.state.idx + 1));
                else {
                    // An entry the router did not make (an in-page #anchor): count it as one step on.
                    window.history.replaceState({ ...others(window.history.state), juris: true, idx: h.index + 1 }, "");
                    writeHistory(h.index + 1, h.index + 2);
                }
                const token = (this.pending = {});
                const target = this.fromUrl(`${window.location.pathname}${window.location.search}${window.location.hash}`);
                const settle = () => {
                    this.syncing = true;
                    try {
                        this.writeLocation(target);
                    } finally {
                        this.syncing = false;
                    }
                };
                const loading = this.loadFor(this.match(target.path).matched);
                if (!loading) return settle();
                loading.then(
                    () => { if (this.pending === token) settle(); },
                    (error) => { if (this.pending === token) this.loadFailed(this.toUrl(target), "entry", error); },
                );
            };
            window.addEventListener("popstate", this.onPopState);
            // A route whose code could not be loaded is loaded in full instead: `url` becomes the tab's
            // entry, marked, and fullLoad(url) is called. `how` is "push" (a new page), "replace", or
            // "entry" (the tab is already there: Back or Forward). The mark is the guard against a
            // loop, and it lives in history.state, which a reload keeps: an entry that carries it for
            // this url has had its full load, so the router stops there rather than load it again.
            this.loadFailed = (url, how, error) => {
                const state = window.history.state;
                if (state?.fullLoad === url) {
                    console.error(`Router: the code for "${url}" did not load, and a full load of it has been tried already`, error);
                    return false;
                }
                const now = sm.peek(`${rp}.history`) ?? { index: 0, length: 1 };
                if (how === "push") {
                    window.history.pushState({ juris: true, idx: now.index + 1, fullLoad: url }, "", url);
                    writeHistory(now.index + 1, now.index + 2);
                } else if (how === "replace") window.history.replaceState({ ...others(state), juris: true, idx: now.index, fullLoad: url }, "", url);
                else window.history.replaceState({ ...(state ?? {}), fullLoad: url }, "");
                this.fullLoad(url);
                return false;
            };
        }

        this.registerComponents(juris);

        return {
            router: this,
            route: () => juris.getState(rp, {}),
            navigate: (to, options) => this.navigate(to, options),
            back: () => this.back?.(),
            forward: () => this.forward?.(),
            // Whether Back and Forward go anywhere in this tab's trail (index 0 is where the tab
            // entered the app, and nothing lies ahead of the last entry), tracked, so a button's
            // `disabled` follows them. Always false on a server, which has no trail.
            canBack: () => juris.getState(`${rp}.history.index`, 0) > 0,
            canForward: () => { const h = juris.getState(`${rp}.history`, null); return Boolean(h) && h.index < h.length - 1; },
            link: (to, options) => this.link(to, options),
            isActive: (to, options) => this.isActive(to, options),
        };
    }

    uninstall() {
        if (this.onPopState) window.removeEventListener("popstate", this.onPopState);
    }

    // Writes only the leaves that changed and deletes the ones that disappeared.
    writeObject(path, next) {
        const juris = this.juris;
        const previous = juris.stateManager.peek(path);
        if (previous === null || typeof previous !== "object") {
            juris.setValue(path, { ...next });
            return;
        }
        // Own keys only: a param named `toString` is `in` every object, and was never deleted.
        for (const key of Object.keys(previous)) if (!Object.hasOwn(next, key)) juris.deleteState(`${path}.${key}`);
        for (const [key, value] of Object.entries(next)) if (!Object.is(previous[key], value)) juris.setValue(`${path}.${key}`, value);
    }

    writeLocation({ path, query, hash }) {
        this.juris.batch(() => {
            this.juris.setValue(`${this.routePath}.path`, path);
            this.juris.setValue(`${this.routePath}.query`, query ?? {});
            this.juris.setValue(`${this.routePath}.hash`, hash ?? "");
        });
    }

    // ---- navigation ------------------------------------------------------------------------

    current() {
        const sm = this.juris.stateManager;
        const rp = this.routePath;
        return { path: sm.peek(`${rp}.path`) ?? "/", query: sm.peek(`${rp}.query`) ?? {}, hash: sm.peek(`${rp}.hash`) ?? "", params: sm.peek(`${rp}.params`) ?? {}, name: sm.peek(`${rp}.name`) ?? undefined };
    }

    // Starts every matched record's load(juris) that has not finished on this router, outermost first.
    // null when there is nothing to wait for, so a navigation between pages already loaded writes in
    // the same tick as before; otherwise a promise that rejects if any of them throws or rejects.
    loadFor(matched) {
        const waiting = [];
        for (const index of matched) {
            const { load, register } = this.records[index];
            if (typeof load !== "function" || this.loads.get(load) === true) continue;
            let running = this.loads.get(load);
            if (!running) {
                running = Promise.resolve()
                    .then(() => load(this.juris))
                    .then((module) => { if (typeof register === "function") this.registerModule(module, register); })
                    .then(
                        () => { this.loads.set(load, true); },
                        (error) => { this.loads.delete(load); throw error; },
                    );
                this.loads.set(load, running);
            }
            waiting.push(running);
        }
        return waiting.length ? Promise.all(waiting) : null;
    }

    // A page module's register, once per module on this router's instance, whichever route reached
    // it; the error a register threw, to every later caller.
    registerModule(module, register) {
        if (module === null || (typeof module !== "object" && typeof module !== "function")) {
            throw new TypeError("Router: a route's load, given a register, answers the page's module");
        }
        if (!this.registered.has(module)) {
            try {
                register(module, this.juris);
                this.registered.set(module, null);
            } catch (error) {
                this.registered.set(module, error);
            }
        }
        const failed = this.registered.get(module);
        if (failed) throw failed;
    }

    // A server: every route's code, record by record in the table's order, on the instance the router
    // is installed on, so any page can be rendered. Rejects with the first failure; what is loaded
    // already is not loaded again.
    async loadAll() {
        if (!this.juris) throw new Error("Router: not installed, so there is no instance to load the routes' code onto");
        for (const record of this.records) {
            const pending = this.loadFor([record.index]);
            if (pending) await pending;
        }
    }

    // navigate(to, { replace }) -> Promise<location | false>. Follows redirects, asks the router's guard
    // (with `context(api)`; a location it answers redirects), runs every matched record's
    // beforeEnter(to, from, api) outermost first (may be async; true/undefined continue, false
    // aborts, a string or target object redirects), awaits every matched record's load(juris), then
    // writes path/query/hash in one batch. A newer navigation, or Back / Forward, supersedes one still
    // in its guards or loads. A load that fails resolves false and loads the page in full (see the top
    // of this file); where there is no page to load (a server), it rejects with the load's error. A
    // raw setValue("$route.path") skips all of this.
    navigate(to, options = {}) {
        const from = this.current();
        // Resolved synchronously, so an unknown name or a missing param throws at the call site.
        const target = this.followRedirects(this.resolveTarget(to, from));
        return this.commit(target, from, options);
    }

    async commit(target, from, options) {
        const token = (this.pending = {});
        for (let hops = 0; hops < MAX_REDIRECTS; hops += 1) {
            const { params, matched, name, meta } = this.match(target.path);
            const toRoute = { ...target, params, name, meta };
            let redirected = this.verdict(toRoute, this.context(this.juris.api) ?? {});
            for (const index of redirected === null ? matched : []) {
                const guard = this.records[index].beforeEnter;
                if (typeof guard !== "function") continue;
                const verdict = await guard(toRoute, from, this.juris.api);
                if (this.pending !== token) return false;
                if (verdict === false) return false;
                if (verdict !== undefined && verdict !== true) {
                    redirected = verdict;
                    break;
                }
            }
            if (redirected === null) {
                const loading = this.loadFor(matched);
                if (loading) {
                    try {
                        await loading;
                    } catch (error) {
                        if (this.pending !== token) return false;
                        if (!this.loadFailed) throw error;
                        return this.loadFailed(this.toUrl(target), options.replace ? "replace" : "push", error);
                    }
                    if (this.pending !== token) return false;
                }
                this.replaceNext = Boolean(options.replace);
                this.writeLocation(target);
                return this.current();
            }
            target = this.followRedirects(this.resolveTarget(redirected, { ...target, params }));
        }
        throw new Error(`Router: too many redirects navigating to "${target.path}"`);
    }

    // Props for an anchor: href for the address bar / middle-click, onclick for in-app navigation.
    link(to, options = {}) {
        const target = this.resolveTarget(to, this.current());
        return {
            href: this.toUrl(target),
            onclick: (event) => {
                if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                if (event.currentTarget?.target && event.currentTarget.target !== "_self") return;
                event.preventDefault();
                this.navigate(target, options);
            },
        };
    }

    // Tracked: reads $route.path. exact: the paths are equal; otherwise `to` is the path or an ancestor of it.
    isActive(to, options = {}) {
        const target = this.resolveTarget(to, this.current());
        const path = this.juris.getState(`${this.routePath}.path`, "/");
        if (options.exact) return path === target.path;
        return path === target.path || (target.path !== "/" && path.startsWith(`${target.path}/`)) || (target.path === "/" && path === "/");
    }

    // ---- components ------------------------------------------------------------------------

    // The names are exported as ROUTER_COMPONENTS (below); a test holds the two to each other.
    registerComponents(juris) {
        const rp = this.routePath;
        // RouterView renders the matched record at `depth` (0 = top level; a routed component that has
        // children renders { RouterView: { depth: 1 } }, and so on). Keyed by record index, so moving
        // between two urls of the same route keeps the instance and only its param readers re-run.
        juris.registerComponent("RouterView", (props, api) => () => {
            const depth = props.depth ?? 0;
            const index = api.getState(`${rp}.matched.${depth}`);
            if (index === undefined) return props.fallback ?? null;
            const record = this.records[index];
            const component = record.component;
            if (component === undefined) return null;
            const routeProps = typeof record.props === "function" ? record.props(api.getState(`${rp}.params`, {})) : (record.props ?? {});
            if (typeof component === "string") return { [component]: { key: `route-${index}`, ...routeProps } };
            if (typeof component === "function") return component({ ...routeProps, key: `route-${index}` }, api);
            return component;
        });
        // Link: { Link: { to, exact, replace, textContent | children, class, onclick } }
        // A caller's onclick runs first, then the navigation, unless it called preventDefault(). It
        // used to replace the navigation, so a Link given an onclick made a full page load.
        //
        // The href follows the route, and the click goes where the href says at the time. A target
        // resolved against the current route (a name whose params come from it, a query alone) used
        // to be resolved once, at setup, and RouterView keeps a page's instance when only its params
        // change: the link kept pointing at the last item. The route's path is what it reads, since
        // the params are derived from it.
        juris.registerComponent("Link", (props, api) => {
            const { to, exact, replace, activeClass = "active", onclick: theirs, ...rest } = props;
            const href = () => {
                juris.getState(`${rp}.path`);
                return this.link(to, { replace }).href;
            };
            const navigate = (event) => this.link(to, { replace }).onclick(event);
            const onclick = typeof theirs === "function" ? (event) => { theirs(event); navigate(event); } : navigate;
            return { a: { href, onclick, classList: { [activeClass]: () => this.isActive(to, { exact }) }, ...rest } };
        });
    }
}

// What a page is called, the one function a server and a browser both ask (a route's `head`, above).
// `head.titleFrom(data)` names the page from its own data (the answer to the route's own call: a
// server has it from its preload, a browser where the page keeps it, `head.dataPath`), cut to `max`
// and followed by `suffix`; without a name, `head.title`; without that, `fallback`. A titleFrom that
// throws, or no data (a call that failed), never names a page: the route's own title is a fine
// answer. Whatever the app adds around it (a count, an environment's mark) is the app's.
// `max` counts characters (code points), not UTF-16 code units: a cut by code units could keep half
// of an emoji, which the server writes as the replacement character and the browser keeps as a lone
// surrogate, so the two sides named the page differently.
export function titleOf(head, data, { fallback = "", suffix = "", max = Infinity } = {}) {
    let text = head?.title ?? fallback;
    if (typeof head?.titleFrom === "function" && data) {
        try {
            const named = head.titleFrom(data);
            if (named) text = `${cutTo(String(named), max)}${suffix}`;
        } catch { /* the route's own title */ }
    }
    return text;
}

// No more code units than `max` means no more characters either, so only a longer string is split.
const cutTo = (text, max) => (text.length <= max ? text : Array.from(text).slice(0, max).join(""));

// The components installing a router registers, by name, so that an app's own check of which
// components its pages draw can count them without keeping a copy of the list.
export const ROUTER_COMPONENTS = Object.freeze(["RouterView", "Link"]);

export function createRouter(config) {
    return new Router(config);
}

export default createRouter;
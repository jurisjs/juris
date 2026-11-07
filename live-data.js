// Live data a component shows and keeps current, whose arguments come from the route.
//
// `api.live(path, service, ...args)` writes a live query's answer to a state path and keeps it
// there. A page that uses it by hand has three things to get right, and each one fails quietly:
//
//   The arguments move. RouterView keeps a page's instance when only the route's params or query
//   change (the next page of a list, another item under /things/:id), so nothing re-runs on its own.
//   The helpers here read the arguments INSIDE the getter they return, which is what subscribes the
//   page to them: the subscription moves when they change, and only then.
//
//   The arguments are the preload's. A server render answers a call only from what the route
//   preloaded (requirePreload refuses any other), and a call is keyed by the JSON of its arguments,
//   so the arguments built here must be the route's `preload` entry's, argument for argument:
//   `list()` and `list({})` are two different calls, and the second fails on the server alone.
//
//   The old subscription is dropped only AFTER the new one exists, so a change that arrives
//   mid-swap is not lost. Between a navigation and the answer, the previous data stays on screen
//   rather than the page emptying and jumping, and the getter's `state()` says "pending" meanwhile
//   (api.liveState, juris.js): the data shown is the last route's, and a page that must not pass it
//   off as this one's reads that. It used to be shown under the new route with no mark at all, and
//   for good when the new answer never came (a refused subscribe, a failed re-run).
//
// And one path, one service. A path written by one service and read by a component that expects
// another's answer is a page drawing the wrong data, and only after a navigation between two pages
// that share it, so a reload hides it. `claimPath` refuses a second service on a path, and every
// helper here claims the path it writes.
//
// It imports nothing: browsers download it, and a server render runs it.

// ---- one path, one service ---------------------------------------------------------------------
// The rule is one-way on purpose: a path may not be claimed by two different SERVICES, but one
// service may write to several paths (the same service asked two questions, under two paths).
//
// A claim is the instance's: its pages are what share the paths, and a server renders every request
// with one. So another instance in the same process (a test's, another app's) starts with none, and
// a claim made on a server holds for every later request it renders. The registry is found through
// the component's api by the instance's own `live`: the api object is replaced whenever a plugin
// adds to it (juris.use), and each of its functions is made once per instance and carried over, so
// `live`, whose paths these are, names the instance for as long as it lives. A second copy of this
// module (the same file under two addresses, during a deploy) keeps its own registry.
// The api is known by `live` being its own: the instance itself, or anything else that only inherits a
// `live`, would key the claim on a function every instance shares, and make it every instance's.
const claims = new WeakMap(); // an instance's api.live -> Map(path -> service)

const isApi = (api) => api !== null && typeof api === "object" && Object.hasOwn(api, "live") && typeof api.live === "function";

export function claimPath(api, path, service) {
    if (!isApi(api)) {
        throw new TypeError("claimPath(api, path, service): the first argument is the component's api, whose instance keeps the claim");
    }
    let held = claims.get(api.live);
    if (!held) claims.set(api.live, (held = new Map()));
    const writer = held.get(path);
    if (writer && writer !== service) {
        throw new Error(
            `Live path "${path}" is already written by "${writer}", so "${service}" cannot use it too. ` +
            `Two services sharing a path means one page renders the other's data — give this one its own path.`,
        );
    }
    held.set(path, service);
}

const live = (api, path, service, args, state) => {
    claimPath(api, path, service);
    const next = JSON.stringify(args);
    if (next !== state.key) {
        state.key = next;
        const previous = state.stop;
        state.stop = api.live(path, service, ...args);
        previous?.();
        state.onChange?.();
    }
    return api.getState(path, null);
};

// The general form: `argsFrom()` builds the arguments, reading whatever state they depend on, and
// the answer is written at `path` (the service's name unless given). Call it while a component is
// being set up; the getter it returns is what the component reads the answer through, and the
// subscription ends with the component.
//
// The getter carries `path`, and `state()` and `message()`, tracked reads of api.liveState(path)
// and api.liveMessage(path): whether what it answers is the latest ("live"), older or nothing yet
// ("pending"), refused or not re-run ("failed", with the words), or cut off ("offline").
//
// Whatever `argsFrom()` returns must match the route's `preload` entry ARGUMENT FOR ARGUMENT,
// because the key is the JSON of both.
export function useLiveData(api, service, argsFrom, path = service) {
    const state = { stop: null, key: null };
    api.onCleanup(() => state.stop?.());
    const read = () => live(api, path, service, argsFrom(), state);
    read.path = path;
    read.state = () => api.liveState(path);
    read.message = () => api.liveMessage(path);
    return read;
}

// What useRouteData takes beside its arguments.
const ROUTE_DATA_OPTIONS = new Set(["viewer"]);

// Where the router installed on this instance keeps the route (its `routePath`): the params are
// read there, one leaf each, so a change elsewhere in the route (the query, the hash) moves nothing.
function routeAt(api, caller) {
    const at = api.router?.routePath;
    if (typeof at !== "string" || at === "") {
        throw new Error(`${caller}: the arguments are the route's params, read from the router, and this instance has none: install one first (juris.use(createRouter(...)))`);
    }
    return at;
}

// Any page whose arguments are the route's params, named in order:
//
//   useRouteData(api, "thingPage", ["slug"])        → thingPage(params.slug)
//   useRouteData(api, "inbox", [])                  → inbox()
//
// The getter is useLiveData's, with its `path`, `state()` and `message()`.
//
// `viewer` is the state path of who is asking, when the service's answer depends on it: its value
// (null when there is none) is the LAST argument, after the params, as the route's preload must
// pass it too. The framework does not know where an app keeps its viewer, so it is a path, never
// `true`; an app that always keeps it in one place wraps this with that path.
export function useRouteData(api, service, params = [], path = service, options = {}) {
    for (const key of Object.keys(options ?? {})) {
        if (!ROUTE_DATA_OPTIONS.has(key)) throw new TypeError(`useRouteData: unknown option "${key}"`);
    }
    const viewer = options?.viewer ?? false;
    if (viewer !== false && (typeof viewer !== "string" || viewer === "")) {
        throw new TypeError("useRouteData: `viewer` is the state path of who is asking, whose value is the last argument, or false");
    }
    if (!Array.isArray(params) || !params.every((name) => typeof name === "string" && name !== "")) {
        throw new TypeError("useRouteData: `params` is a list of the route's param names, in the order the service takes them");
    }
    const at = routeAt(api, "useRouteData");
    return useLiveData(api, service, () => [
        ...params.map((name) => api.getState(`${at}.params.${name}`, null)),
        ...(viewer ? [api.getState(viewer, null) ?? null] : []),
    ], path);
}

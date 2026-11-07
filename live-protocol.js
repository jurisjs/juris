// The rules both ends of a live query must compute identically: the browser that subscribes and
// keeps the result in its state, and the server that runs the query and sends what changed. Each
// is defined here once, in a module that imports nothing, so the core (juris.js) and the
// dispatcher (server/service-dispatcher.js) use the same definition and neither keeps a copy that
// could drift. So is what the two tell a service about who is calling it (the call kinds, below).

// The key of a call: its service name and its argument list, as JSON. It names a preloaded call
// in the page's state, a subscription in the browser and a group on the server, and the server
// refuses a subscribe whose key is not the one it computes over the arguments it received. So its
// output is part of the wire: one byte of difference between two builds of an app is a 400 on
// every subscribe an open tab sends while a deploy is rolling. It must never change.
export function liveKey(name, args) {
    return `${name}:${JSON.stringify(args)}`;
}

const isObject = (v) => v !== null && typeof v === "object";

// Whether every own key of `value` can be one segment of a state path. A key containing "." would
// be read as two segments on the other side (a column named `a.b` became `{ a: { b } }`), and
// "__proto__" is refused outright by the state manager, which used to throw inside a patch's batch
// and take every other change in it down with it. An object holding either is sent, and written,
// whole at its own path: the data still arrives, and only the leaf-by-leaf granularity is lost.
// So is an object with the key "": its path would be its parent's (at the top, the root's), and a
// patch meant for that one field replaced, or deleted, the whole result.
// An array's keys are its indices, and anything that is not an object has none to address.
export function canAddress(value) {
    return !isObject(value) || Array.isArray(value) || Object.keys(value).every((key) => key !== "" && key !== "__proto__" && !key.includes("."));
}

// What the diff may walk into: arrays and plain objects. A Date (or any other class instance) has no
// own keys, so walking it found nothing — a changed timestamp was never sent, and after a reorder a
// row kept the previous row's date. Anything else is a leaf, compared whole.
const isTree = (v) => isObject(v) && (Array.isArray(v) || [Object.prototype, null].includes(Object.getPrototypeOf(v)));

// What changed between two results of a query, as leaf patches: { set: [[relativePath, value]],
// del: [relativePath] }, both empty when nothing did. Arrays whose length changed are sent whole
// under their own path ("" for the root), and so is an object canAddress refuses.
export function diff(previous, next, path = "", out = { set: [], del: [] }) {
    if (!isTree(next) || !isTree(previous) || Array.isArray(next) !== Array.isArray(previous) || (Array.isArray(next) && next.length !== previous.length)) {
        if (!Object.is(previous, next) && JSON.stringify(previous) !== JSON.stringify(next)) out.set.push([path, next]);
        return out;
    }
    if (!canAddress(next) || !canAddress(previous)) {
        if (JSON.stringify(previous) !== JSON.stringify(next)) out.set.push([path, next]);
        return out;
    }
    // Own keys only: `in` finds what the prototype has, so a removed field named "constructor" or
    // "toString" was never deleted.
    for (const key of Object.keys(previous)) if (!Object.hasOwn(next, key)) out.del.push(path ? `${path}.${key}` : key);
    for (const key of Object.keys(next)) diff(previous[key], next[key], path ? `${path}.${key}` : key, out);
    return out;
}

// ---- what a refusal says to a program -----------------------------------------------------------
// The live layer's refusals carry a code beside their words: a program matches the code, and the
// words may change. The browser's client knows a stale stream by CLIENT_UNKNOWN and opens a new one.
// Codes are part of the wire, so a renamed one would talk past every tab still open on the build
// before it: they must never change.
export const LIVE_CODES = Object.freeze({
    // 403: a client id this server never minted, or one minted for another owner (the session
    // signed in or out in another tab, or the id came from an instance that has restarted, or from
    // another instance behind the balancer). The answer is a new stream, and a new id with it.
    CLIENT_UNKNOWN: "live.client-unknown",
    // 403: a subscribe to a name that is no live query.
    NOT_A_QUERY: "live.not-a-query",
});

// ---- who is calling ----------------------------------------------------------------------------
// A service reads its caller from `this`, and every call the framework makes hands it a context that
// says what kind of call it is, under CALL_KIND: a symbol, so nothing a request carries can set it
// (JSON, a query string and a cookie make string keys only).
//
//   "direct"    a request: a JSON POST, the event stream, a subscribe, and the `authorize`,
//               `identify` and `touches` functions they run. The context is the one the app's
//               options.context(req, res) built, marked by the dispatcher; with none, its own.
//   "preload"   a server render's preload: the entries the route chose, before the render.
//   "live"      a live query's run, shared by every subscriber of its (name, args), so no one
//               caller's: at subscribe, and on every invalidation after.
//   "render"    a call a server render makes that nobody preloaded (a server without
//               requirePreload lets one through). Its arguments are whatever a component passed.
//   "internal"  the server's own work, on nobody's behalf: `internal(reason)`, for a job.
//
// callKind(thisValue) answers which, and "direct" for anything that does not say, undefined included:
// a call that does not say what it is, is a stranger's. The contexts the framework makes for its own
// calls are frozen and carry nothing but the kind (and an internal call's reason), so nothing a
// service reads from one names a caller. An app that trusts an ARGUMENT to name the viewer, so that a
// live query stays a pure function of its arguments, trusts it on "preload" (the server chose it,
// from the session) and "live" (`authorize` matched it to the session, with a request's context)
// alone.
export const CALL_KIND = Symbol.for("juris.callKind");
export const CALL_KINDS = Object.freeze(["direct", "preload", "live", "render", "internal"]);

export function callKind(thisValue) {
    if (thisValue === null || (typeof thisValue !== "object" && typeof thisValue !== "function")) return "direct";
    const kind = thisValue[CALL_KIND];
    return CALL_KINDS.includes(kind) ? kind : "direct";
}

// The context for a call the server makes on its own (a job on a timer): of kind "internal", with
// `reason` saying what it is for, which a service may log. No request and no session is behind it.
export function internal(reason) {
    if (typeof reason !== "string" || !reason.trim()) throw new TypeError("internal(reason): say what the call is for");
    return Object.freeze({ [CALL_KIND]: "internal", reason });
}

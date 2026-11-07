// Remote services: the browser half of the shared services API, plus the live-query client.
//
// Client: remoteServices(names, { base, fallback, fetch }) returns { name: (...args) => Promise } stubs,
// one per name, each POSTing its JSON arguments to `${base}/${name}`. Handed to `new Juris({ services })`
// in the browser, so components calling api.call(name, ...args) reach the server's implementation of the
// same name. A refusal rejects with a ServiceError (./errors.js) carrying what the server answered.
//
// Live queries: sseClient({ base }) opens one Server-Sent Events stream, `${base}/events`, per Juris
// instance (installed with juris.use(sseClient({ base }))), registers and unregisters keys through
// `${base}/_live`, and writes each patch into the path the view chose. The browser reconnects the
// stream by itself; on every hello the client re-sends its subscriptions.
//
// The server half, serviceDispatcher, is Node code in ./server/service-dispatcher.js, which is never
// served, so no browser downloads it. It also says how the subscribers of one (name, args) share
// one subscription.

import { diff, LIVE_CODES } from "./live-protocol.js";
import { ServiceError } from "./errors.js";
import { pathSegment } from "./state-manager.js";

// The words for a failed call whose answer says none (a proxy's error page, or JSON with no `error`).
const statusLine = ({ response }) => `${response.status} ${response.statusText}`;

// The words a call that took longer than `timeoutMs` rejects with. The server may have acted on it:
// only the answer was lost, so a caller must not tell the user it failed.
const TIMEOUT_WORDS = "The request took too long; it may or may not have been applied.";

// options: { base = "/api", fallback, fetch, timeoutMs = 30000 }. A string is the base, as the second
// argument was before there were options.
//   A refusal rejects with a ServiceError: the answer's `error` as its message, the HTTP status, and
//   the answer's `fields` (the messages a form puts beside its inputs), `field` and `code` when it
//   carried them. The dispatcher sends a singular field in `fields` too; from an older server that sent
//   `fields` alone, nothing is guessed.
//   fallback({ name, response, json }) gives the message when the answer has none: `json` says whether
//   the body was JSON at all. The default is the status line, "502 Bad Gateway".
//   A 2xx whose body is not JSON rejects too, with a ServiceError of status 502 and code
//   "response.not-json" (fallback's words): the dispatcher always answers JSON, so such an answer is
//   somebody else's (a captive portal's sign-in page, a proxy's), and it used to resolve
//   { error: "200 OK" }, which a form read as saved.
//   timeoutMs: how long a call (its answer and its body) may take, whole milliseconds from 0 to
//   2^31 - 1, 0 for no limit. A call that takes longer is aborted and rejects with a ServiceError of
//   status 408 and code "request.timeout": a request that hung left a form submitting for good.
//   fetch replaces the global one, which is otherwise read at each call.
export function remoteServices(names, options = {}) {
    const { base = "/api", fallback = statusLine, fetch: send, timeoutMs = 30_000 } = typeof options === "string" ? { base: options } : (options ?? {});
    if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > MAX_WAIT) {
        throw new TypeError(`remoteServices: timeoutMs is a whole number of milliseconds from 0 (no limit) to ${MAX_WAIT}, not ${shown(timeoutMs)}`);
    }
    const services = {};
    for (const name of names) {
        services[name] = async (...args) => {
            const controller = timeoutMs && typeof AbortController === "function" ? new AbortController() : null;
            const exchange = (async () => {
                const response = await (send ?? globalThis.fetch)(`${base}/${encodeURIComponent(name)}`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(args),
                    ...(controller ? { signal: controller.signal } : {}),
                });
                let body;
                let json = true;
                try { body = await response.json(); } catch { json = false; }
                return { response, body, json };
            })();
            let timer = null;
            const late = new Promise((_, reject) => {
                if (!timeoutMs) return;
                // Rejected before the abort, so the race settles with these words and not the abort's.
                timer = setTimeout(() => {
                    reject(new ServiceError(TIMEOUT_WORDS, { status: 408, code: "request.timeout" }));
                    controller?.abort();
                }, timeoutMs);
            });
            let answer;
            try {
                answer = await (timeoutMs ? Promise.race([exchange, late]) : exchange);
            } finally {
                clearTimeout(timer);
            }
            const { response, json } = answer;
            let { body } = answer;
            if (!json) body = { error: fallback({ name, response, json }) };
            if (!response.ok) {
                const message = body?.error ?? fallback({ name, response, json });
                throw new ServiceError(message, { status: response.status, fields: body?.fields ?? undefined, field: body?.field, code: body?.code ?? undefined });
            }
            if (!json) throw new ServiceError(body.error, { status: 502, code: "response.not-json" });
            return body;
        };
    }
    return services;
}

// ---- diff: what changed between two results, as leaf patches --------------------------------
// Defined in live-protocol.js beside the rule the core's assign follows too (canAddress), and
// re-exported here, where the dispatcher that sends the patches lives.
export { diff };

// ---- client transport -----------------------------------------------------------------------

// juris.use(sseClient(options)) → installs juris.liveTransport and api.liveStatus. options:
//   base = "/api"        where the dispatcher answers: the stream is `${base}/events`, and subscribes
//                        go to `${base}/_live`
//   EventSourceImpl      the EventSource class to use (a test's fake); the browser's own otherwise
//   idleMs = 10000       how long a stream with nothing left to watch is kept before it is given back,
//                        whole milliseconds from 0 to 2^31 - 1; 0 gives it back once the current turn
//                        of the event loop is over, so only a view re-made in the same turn keeps it
//   hiddenMs = null      how long a tab may stay hidden before its stream is given back (its subscriptions kept,
//                        its paths "offline"); shown again, a new stream re-announces them all, each "pending"
//                        until its fresh full. null: kept however long it is hidden
// Whatever the options, a page put in the back/forward cache gives its stream back on its pagehide,
// as a hidden tab does (its subscriptions kept, its paths "offline"), and no stream opens until its
// pageshow from the cache (`persisted`), which opens a new one that re-announces them all, each
// "pending" until its fresh full. A cached page used to keep its stream, and after about six pages
// the browser's connections to the host were all taken.
//   statePath = "$live"  where the connection is written: `.connected`, true from a hello until the
//                        stream is lost, and `.generation`, one more on every hello (absent before the
//                        first), so a component that watches it hears of every stream the server
//                        greets without polling; and `.reconnects`, one more on every hello that
//                        brings back a stream that was LOST (an error: the instance restarted, the
//                        network dropped, the stream was refused and reopened), absent before the
//                        first. A first open is none, and neither is an open after the stream was
//                        given back on purpose (the idle close, dispose): watching the generation for
//                        a restart took every page that opened a stream again for one. And
//                        `.paths.<live path>` (the path as one segment: src/state-manager.js
//                        pathSegment), each live path's `status` and, while it is "failed", its
//                        `message`: what api.liveState(path) and api.liveMessage(path) read (juris.js).
//                        "pending" from the subscribe until the first full answer ("live" at once when
//                        the preload's answer is on screen), "live" from then, "failed" when the
//                        subscribe is refused for good or the server could not run the query again
//                        (until the next answer), "offline" while the stream is down, "pending" again
//                        from the hello that brings it back until the new full. Gone once nothing is
//                        subscribed at the path. The data on screen is left as it was throughout: the
//                        status is what says whether it is current
//   onHello({ clientId, generation })      every hello: a stream is open, and the server named it
//   onReconnect({ clientId, generation })  every hello after the first: a stream came back, after an
//                        instance restarted, the network dropped, a refused stream was reopened, or
//                        the idle close had given the last one back (`.reconnects` is the narrower
//                        count, without the last)
//   onError(error, name, args)  a subscribe the server refused for a reason a new stream or a wait
//                        would not cure (not allowed, no such query): `error` is a ServiceError
//                        (./errors.js) with the answer's status, words and code. Without it, the
//                        console is told, as before. A stale client id (a new stream is opened) and a
//                        busy server (asked again after a wait) are not errors.
//   backoff = { minMs: 1000, maxMs: 30000 }  the wait before a refused stream is reopened, or a busy
//                        server asked again: minMs, doubling up to maxMs, and minMs again after a hello;
//                        whole milliseconds with 1 <= minMs <= maxMs <= 2^31 - 1
// Those are all the options: any other key, or one in backoff other than its two, is refused with a
// TypeError, not ignored.
// A hook that throws or rejects is reported to the console and stops nothing. The plugin returned has
// dispose(): every stream it opened is closed, every timer it set is cancelled, its visibilitychange,
// pagehide and pageshow listeners are removed, and the transport is taken off each instance it was
// installed on, which then treats api.live as the server does (a call, and no updates after it).
// An instance has one live client at a time. Once it is disposed, another may be installed (a hot
// reload), this plugin again or a new one; installing one while another is live is refused, as is
// one on an api whose liveStatus is not a live client's, and either refusal installs nothing.

// Per Juris instance: where the live client installed now writes the connection, and whether it is
// live. The api is frozen and takes no name twice, so only an instance's first client adds
// liveStatus, which reads the connection wherever the current one writes it. A second client's own
// liveStatus used to be refused by juris.use after the client had installed its transport and its
// listener, which left it half installed.
const liveClients = new WeakMap();      // juris -> { connectedPath, active }

// The longest wait a timer holds (2^31 - 1 ms, about 24.8 days). A browser and Node alike run a
// longer one at once, so a longer backoff would reopen a refused stream about every millisecond.
const MAX_WAIT = 2 ** 31 - 1;
const shown = (value) => (typeof value === "string" ? JSON.stringify(value) : String(value));

const SSE_OPTIONS = new Set(["base", "EventSourceImpl", "idleMs", "hiddenMs", "statePath", "onHello", "onReconnect", "onError", "backoff"]);
const BACKOFF_OPTIONS = new Set(["minMs", "maxMs"]);

export function sseClient(options = {}) {
    // A misspelt key used to be dropped (`{ idleMS: 0 }` ran the default). hydrate hands its `live`
    // object here, so this is that object's check too.
    if (options === null || typeof options !== "object" || Array.isArray(options)) throw new TypeError("sseClient: options is an object");
    for (const key of Object.keys(options)) {
        if (!SSE_OPTIONS.has(key)) throw new TypeError(`sseClient: "${key}" is not an option (${[...SSE_OPTIONS].join(", ")})`);
    }
    const {
        base = "/api", EventSourceImpl, idleMs = 10_000, hiddenMs = null, statePath = "$live",
        onHello, onReconnect, onError, backoff = {},
    } = options;
    if (backoff !== null && typeof backoff === "object") {
        for (const key of Object.keys(backoff)) {
            if (!BACKOFF_OPTIONS.has(key)) throw new TypeError(`sseClient: backoff.${key} is not an option (minMs, maxMs)`);
        }
    }
    const { minMs = 1000, maxMs = 30_000 } = backoff !== null && typeof backoff === "object" ? backoff : { minMs: NaN };
    // A wait of nothing, or of more than a timer holds, would reopen a refused stream in a tight loop.
    if (!Number.isInteger(minMs) || !Number.isInteger(maxMs) || minMs < 1 || maxMs < minMs || maxMs > MAX_WAIT) {
        throw new TypeError(`sseClient: backoff is { minMs, maxMs }, whole milliseconds with 1 <= minMs <= maxMs <= ${MAX_WAIT}, not ${JSON.stringify(backoff)}`);
    }
    // A timer runs a wait below 0, past the limit or NaN at once, and every navigation gave the
    // stream back; a fraction or a string is no whole number of milliseconds either.
    if (!Number.isInteger(idleMs) || idleMs < 0 || idleMs > MAX_WAIT) {
        throw new TypeError(`sseClient: idleMs is a whole number of milliseconds from 0 to ${MAX_WAIT}, not ${shown(idleMs)}`);
    }
    // A hidden tab's stream given back after this long (null: kept, as before).
    if (hiddenMs !== null && (!Number.isInteger(hiddenMs) || hiddenMs < 0 || hiddenMs > MAX_WAIT)) {
        throw new TypeError(`sseClient: hiddenMs is null or a whole number of milliseconds from 0 to ${MAX_WAIT}, not ${shown(hiddenMs)}`);
    }
    if (typeof statePath !== "string" || !statePath) throw new TypeError(`sseClient: statePath is a state path, such as "$live", not ${JSON.stringify(statePath)}`);
    for (const [name, hook] of Object.entries({ onHello, onReconnect, onError })) {
        if (hook !== undefined && typeof hook !== "function") throw new TypeError(`sseClient: ${name} is a function`);
    }
    const connectedPath = `${statePath}.connected`;
    const generationPath = `${statePath}.generation`;
    const reconnectsPath = `${statePath}.reconnects`;
    const statusAt = (path) => `${statePath}.paths.${pathSegment(path)}`;
    // An app's hook runs after the live layer's own work, and its failure is the console's to hear.
    const tell = (name, hook, ...args) => {
        if (!hook) return;
        const report = (error) => console.error(`Juris live: ${name} failed`, error);
        try { Promise.resolve(hook(...args)).catch(report); } catch (error) { report(error); }
    };
    const installs = new Set();          // the dispose of each instance this plugin was installed on

    const plugin = (juris) => {
        // Refused before anything is installed. juris.use adds the api only once the plugin has run.
        let slot = liveClients.get(juris);
        if (slot?.active) throw new Error("sseClient: this Juris instance has a live client already; dispose() it before installing another");
        if (!slot && juris.api && "liveStatus" in juris.api) throw new Error('sseClient: the api already has a "liveStatus" that is no live client\'s');
        const first = !slot;
        slot ??= {};
        slot.connectedPath = connectedPath;
        slot.active = true;
        liveClients.set(juris, slot);

        const ES = EventSourceImpl ?? globalThis.EventSource;
        // Issued by the server over the stream, never chosen here. See the /events handler: an id
        // the browser picked could be guessed, and guessing it took over somebody else's stream.
        let clientId = null;
        const subscriptions = new Map(); // key -> { name, args, paths: Map<path, count> }
        let stream = null;
        let open = false;
        let hellos = 0;                  // hellos so far, on every stream this install opened
        let lost = false;                // the stream was lost since the last hello, not given back

        let down = false;                // the stream is lost, or was closed with paths still subscribed
        // Each live path's status belongs to the subscription that last took the path (a page whose
        // arguments moved subscribes the new key a moment before it drops the old), and goes once no
        // subscription is left at it: path -> { key, users }.
        const owners = new Map();

        let retryMs = 0;                 // backoff for a refused stream or a busy server, reset on hello
        let reopening = null;
        let idle = null;                 // the pending close of a stream nothing is watching
        let disposed = false;
        const timers = globalThis.setTimeout ? { set: globalThis.setTimeout.bind(globalThis), clear: globalThis.clearTimeout.bind(globalThis) } : null;
        // Every timer this install sets, so that dispose can cancel them all. None once disposed.
        const pending = new Set();
        const later = (fn, ms) => {
            if (disposed || !timers) return null;
            const id = timers.set(() => { pending.delete(id); fn(); }, ms);
            pending.add(id);
            return id;
        };
        const cancel = (id) => {
            if (id === null || !timers) return;
            timers.clear(id);
            pending.delete(id);
        };
        const nextWait = () => (retryMs = Math.min(maxMs, retryMs ? retryMs * 2 : minMs));
        const setConnected = (value) => juris.setValue(connectedPath, value);

        // A live path's status, leaf by leaf, so a reader of `status` is not woken by the message.
        const statusOf = (path) => juris.peek(`${statusAt(path)}.status`);
        const mark = (path, status, message = null) => {
            const at = statusAt(path);
            juris.batch(() => {
                if (juris.peek(`${at}.status`) !== status) juris.setValue(`${at}.status`, status);
                if (message !== null) juris.setValue(`${at}.message`, message);
                else if (juris.peek(`${at}.message`) !== undefined) juris.deleteState(`${at}.message`);
            });
        };
        // Every path this key's subscription owns, whose status `when(status)` accepts.
        const markKey = (key, status, message = null, when = () => true) => {
            const subscription = subscriptions.get(key);
            if (!subscription) return;
            juris.batch(() => {
                for (const path of subscription.paths.keys()) if (owners.get(path)?.key === key && when(statusOf(path))) mark(path, status, message);
            });
        };
        const markAll = (status, when = () => true) => juris.batch(() => {
            for (const path of owners.keys()) if (when(statusOf(path))) mark(path, status);
        });

        // Nothing can be posted before the server has told us who we are. Subscriptions made in the
        // meantime are announced by the `hello` handler, which is also what happens on a reconnect.
        const post = (body) =>
            (clientId && !disposed
                ? fetch(`${base}/_live`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client: clientId, ...body }) }).catch(() => null)
                : Promise.resolve(null));

        // Drop the stream and open a fresh one after a pause. The server's `hello` re-announces every
        // subscription, so each gets its full value again. A stream the server or a proxy refused
        // (a 429 at the per-caller cap, a 502 mid-deploy) used to be left CLOSED for good: the tab
        // stopped hearing anything, and every later navigation showed "Loading…" until a reload.
        // While a reopen waits there is no stream (opening one cancels the wait: ensureStream), so a
        // second call in the meantime has nothing to drop. With no timers (none at install) the stream
        // is still dropped, and nothing waits: the next subscribe, or the tab shown again, opens a new
        // one. The dead stream used to be left in place, and neither ever replaced it.
        const reopen = () => {
            if (reopening || disposed) return;
            stream?.close?.();
            stream = null; open = false; clientId = null;
            down = true;
            juris.batch(() => { setConnected(false); markAll("offline"); });
            reopening = later(() => { reopening = null; if (subscriptions.size) ensureStream(); }, nextWait());
        };

        // A key's subscribe and unsubscribe reach the server in the order they were made. Sent side
        // by side, "unsubscribe K" then "subscribe K" (a view re-made on the same stream) could be
        // handled the other way round, and the key was dropped on the server while this tab still
        // showed its data, which then stopped updating.
        const inOrder = new Map();       // key -> the last request made for it
        // Each answer comes with the client id its request went out under (decided when it is sent,
        // which may be after an earlier request for the key), so a refusal is read against the stream
        // it was about.
        const send = (body) => { const as = clientId; return post(body).then((res) => ({ res, as })); };
        const postFor = (key, body) => {
            const before = inOrder.get(key);
            const next = before ? before.then(() => send(body)) : send(body);   // nothing pending: at once
            inOrder.set(key, next);
            next.then(() => { if (inOrder.get(key) === next) inOrder.delete(key); });
            return next;
        };

        // Announce one subscription and act on the answer, which used to be thrown away. A refused
        // subscribe left the key registered with no data and no retry.
        const announce = async (key) => {
            const s = subscriptions.get(key);
            if (!s) return;
            const { res, as } = await postFor(key, { subscribe: { key, name: s.name, args: s.args } });
            if (!res || res.ok || disposed) return;
            const said = await res.json?.().catch(() => ({})) ?? {};
            // A server that sends a code is believed on its code. One from before the codes says so in
            // words alone, and is matched on them for one release, since a rolling deploy mixes the two.
            const stale = said.code != null ? said.code === LIVE_CODES.CLIENT_UNKNOWN : /client id/i.test(String(said.error ?? ""));
            if (res.status === 403 && stale) {
                // The stream belongs to a session that is gone — signed in or out in another tab, or
                // expired. A new stream gets a new id under the session this tab has now. Unless this
                // answer is about a stream already replaced: the one that followed announces every
                // subscription in its hello, and closing it would cost a stream and a wait for nothing.
                if (as === clientId) reopen();
            } else if ((res.status === 429 || res.status === 503) && timers) {
                later(() => { if (subscriptions.has(key)) announce(key); }, nextWait());
            } else {
                // Refused for good: whatever the path shows is not this query's answer, and the page
                // can say so (liveState), besides the hook or the console.
                const words = typeof said.error === "string" ? said.error : `${res.status} ${res.statusText ?? ""}`.trim();
                markKey(key, "failed", words);
                if (onError) tell("onError", onError, new ServiceError(words, { status: res.status, code: said.code ?? undefined }), s.name, s.args);
                else console.error(`Juris live query "${s.name}" was refused (${res.status}): ${said.error ?? ""}`);
            }
        };

        const applyPatch = ({ key, full, set, del, error }) => {
            const subscription = subscriptions.get(key);
            if (!subscription) return;
            if (error !== undefined) {
                // The server could not re-run the query; say so rather than silently leaving stale
                // data: to the console, and to the page, whose paths are "failed" until an answer.
                console.error(`Juris live query "${subscription.name}" failed on the server:`, error);
                markKey(key, "failed", typeof error === "string" ? error : String(error?.message ?? error));
                return;
            }
            // Every view that subscribed to this query gets the patch, each at the path it chose.
            // A full answer makes it current; a change does for a path that held an answer (it is
            // the change to one), not for one still waiting for its first.
            juris.batch(() => {
                for (const path of subscription.paths.keys()) {
                    const at = (relative) => (relative ? `${path}.${relative}` : path);
                    if (full !== undefined) juris.assign(path, full);
                    for (const relative of del ?? []) juris.deleteState(at(relative));
                    for (const [relative, value] of set ?? []) (relative ? juris.setValue(at(relative), value) : juris.assign(path, value));
                }
                if (full !== undefined) {
                    subscription.answered = true;
                    markKey(key, "live");
                } else {
                    markKey(key, "live", null, (status) => status === "failed" || status === "live");
                }
            });
            const [first] = subscription.paths.keys();
            if (first !== undefined) juris.refreshCached?.(key, juris.toRaw(juris.peek(first))); // a TTL cache entry follows the push
        };

        // Set once the document is known (below): a stream opened in a tab already hidden starts its hiddenMs too.
        let armHidden = null;
        // From a pagehide until a pageshow from the back/forward cache (below): no stream opens.
        let putAway = false;
        const ensureStream = () => {
            if (stream || !ES || disposed || putAway) return;
            // A stream opened before a reopen's wait is over (a subscribe, the tab brought back into
            // view) makes that wait needless, and it goes. Left pending, it made a refusal of the new
            // stream schedule nothing (a reopen was already waiting), then ran out, found the dead
            // stream there and opened nothing: the tab heard nothing more until it was reloaded.
            cancel(reopening);
            reopening = null;
            // No id in the URL: the server mints one and sends it back as `hello`. A reconnect
            // therefore gets a fresh id, which is why the announce lives in `hello` and not `open`.
            stream = new ES(`${base}/events`);
            armHidden?.();
            stream.addEventListener("hello", (event) => {
                try {
                    clientId = JSON.parse(event.data).client ?? null;
                } catch { clientId = null; }
                open = Boolean(clientId);
                if (!open) return setConnected(false);
                retryMs = 0;
                hellos += 1;
                // One more than the state says, not than this install has counted, so the count only
                // rises for whoever watches it, even across a dispose and a second install.
                const generation = (Number(juris.peek(generationPath)) || 0) + 1;
                const restored = lost;
                lost = false;
                down = false;
                juris.batch(() => {
                    setConnected(true);
                    juris.setValue(generationPath, generation);
                    if (restored) juris.setValue(reconnectsPath, (Number(juris.peek(reconnectsPath)) || 0) + 1);
                    // Everything is announced again, below, and each answer comes whole: until it
                    // does, what a path shows is from before (or a refusal that may not hold now).
                    markAll("pending", (status) => status === "offline" || status === "failed");
                });
                // Re-announce everything: a reconnect gets a fresh full value for each key.
                for (const key of subscriptions.keys()) announce(key);
                const info = { clientId, generation };
                tell("onHello", onHello, info);
                if (hellos > 1) tell("onReconnect", onReconnect, { ...info });
            });
            stream.addEventListener("error", () => {
                open = false;
                lost = true;
                down = true;
                juris.batch(() => { setConnected(false); markAll("offline"); });
                // CONNECTING (0): the browser is retrying by itself. CLOSED (2): it has given up, as it
                // does on any non-200 answer — so we must, or nothing arrives again.
                if (stream && stream.readyState === 2) reopen();
            });
            stream.addEventListener("patch", (event) => applyPatch(JSON.parse(event.data)));
        };

        const keep = () => {
            cancel(idle);
            idle = null;
        };

        // A path of this subscription that still holds its answer: another query may have taken a
        // path over (owners), and what it holds now is that query's.
        const siblingOf = (subscription, key) => {
            for (const path of subscription.paths.keys()) if (owners.get(path)?.key === key) return path;
            return undefined;
        };

        // A path joining a query this client already watches. The server sends nothing for it: it
        // answers a key once per client, and a change after that names only what changed. So the
        // path takes what its sibling holds, as a copy (a change reaches each path on its own), and
        // says what its sibling says. A sibling "live" on a preload alone has no answer to give yet.
        const join = (subscription, path, sibling) => {
            const held = juris.toRaw(juris.peek(sibling));
            const status = statusOf(sibling);
            juris.batch(() => {
                if (subscription.answered && held !== undefined) juris.assign(path, JSON.parse(JSON.stringify(held)));
                const waiting = status === "live" && !subscription.answered;
                mark(path, waiting ? "pending" : status, juris.peek(`${statusAt(sibling)}.message`) ?? null);
            });
        };

        const transport = {
            // `seeded`: the preload's answer is on screen at `path` already (juris.js live), so it
            // starts "live" rather than "pending".
            subscribe(key, name, args, path, { seeded = false } = {}) {
                if (disposed) return () => { };
                keep();
                ensureStream();
                let subscription = subscriptions.get(key);
                if (!subscription) {
                    subscription = { name, args, paths: new Map(), answered: false };
                    subscriptions.set(key, subscription);
                    if (open) announce(key);
                }
                const again = subscription.paths.has(path);
                const sibling = again ? undefined : siblingOf(subscription, key);
                // Paths are counted, not replaced: a later subscriber must not take the stream from an earlier one.
                subscription.paths.set(path, (subscription.paths.get(path) ?? 0) + 1);
                owners.set(path, { key, users: (owners.get(path)?.users ?? 0) + 1 });
                if (seeded && !again) mark(path, down ? "offline" : "live");
                else if (sibling !== undefined) join(subscription, path, sibling);
                else if (!again) {
                    mark(path, down ? "offline" : "pending");
                    // Every path it had was taken over by another query: only the server has the answer now.
                    if (subscription.answered && open) announce(key);
                }
                let done = false;
                return () => {
                    if (done) return;
                    done = true;
                    const owner = owners.get(path);
                    if (owner && owner.users > 1) owner.users -= 1;
                    else if (owner) {
                        owners.delete(path);
                        if (juris.peek(statusAt(path)) !== undefined) juris.deleteState(statusAt(path));
                    }
                    const s = subscriptions.get(key);
                    if (!s) return;
                    const left = (s.paths.get(path) ?? 1) - 1;
                    if (left > 0) s.paths.set(path, left);
                    else s.paths.delete(path);
                    if (s.paths.size > 0) return;
                    subscriptions.delete(key);
                    postFor(key, { unsubscribe: key });
                    // Nothing left to watch: give the connection back. A browser allows only a handful per host, and an
                    // idle stream in every tab used to starve the others of requests. Not at once, though: a
                    // navigation drops the old page's last subscription a moment before the new page makes
                    // its own, and closing in between opened a stream per page. Behind a proxy the server
                    // hears a stream has gone only at its next keep-alive write, so each of those held one of
                    // the caller's slots for up to 25s, and a guest clicking through pages was refused (429).
                    // A subscribe in the meantime cancels the close (keep).
                    if (subscriptions.size > 0) return;
                    if (!timers) return transport.close();
                    idle = later(() => transport.close(), idleMs);
                };
            },
            // Pause and resume (a hidden tab needs no stream): open() re-connects and re-announces every subscription.
            open() {
                if (subscriptions.size) ensureStream();
            },
            close() {
                keep();
                stream?.close();
                stream = null;
                open = false;
                lost = false;             // given back on purpose: the next stream is a new one
                clientId = null;          // the next stream gets a new one
                // Paths still subscribed (a hidden tab's pause) hear nothing until open().
                down = owners.size > 0;
                juris.batch(() => { setConnected(false); markAll("offline"); });
            },
            // Where a live path's status is kept (juris.js liveState).
            statusAt,
            get clientId() {
                return clientId;
            },
            get keys() {
                return [...subscriptions.keys()];
            },
        };
        juris.liveTransport = transport;
        // A tab brought back to the front with no stream (it was dropped while hidden, or a reopen is
        // waiting on its backoff) connects now rather than on the timer.
        const doc = typeof document !== "undefined" && document?.addEventListener ? document : null;
        // A tab hidden for hiddenMs gives its stream back (a pause: its subscriptions kept, its paths offline), so a
        // server is not kept sending to tabs nobody looks at; shown again before then, it keeps it.
        let hiddenTimer = null;
        armHidden = () => {
            if (doc?.visibilityState === "hidden" && hiddenMs !== null && hiddenTimer === null) hiddenTimer = later(() => { hiddenTimer = null; if (doc.visibilityState === "hidden" && stream) transport.close(); }, hiddenMs);
        };
        const onVisible = () => {
            if (disposed) return;
            if (doc.visibilityState === "hidden") return armHidden();
            cancel(hiddenTimer);
            hiddenTimer = null;
            if (doc.visibilityState !== "visible" || stream || !subscriptions.size) return;
            ensureStream();              // which cancels the wait
        };
        doc?.addEventListener("visibilitychange", onVisible);

        // A page put in the back/forward cache keeps what it has open, its event stream included:
        // Chrome keeps a cached page's stream, a browser keeps six connections to a host over HTTP/1.1,
        // and after about six pages the next one waited for a connection. So every pagehide gives the
        // stream back (a pause, as close() is: the subscriptions kept, their paths "offline"), whether
        // the page is kept (`persisted`) or leaving for good, and nothing opens another until a
        // pageshow from the cache: a subscribe made meanwhile, a reopen's wait, the tab shown again.
        // That pageshow opens a new stream, whose hello announces every subscription again, as on a
        // reconnect, each path "pending" until its fresh full answer. A first pageshow opens nothing.
        const win = typeof window !== "undefined" && typeof window?.addEventListener === "function" ? window : null;
        const onPageHide = () => {
            if (disposed) return;
            putAway = true;
            transport.close();
        };
        const onPageShow = (event) => {
            if (disposed || !event?.persisted) return;
            putAway = false;
            transport.open();
        };
        win?.addEventListener("pagehide", onPageHide);
        win?.addEventListener("pageshow", onPageShow);

        installs.add(() => {
            if (disposed) return;
            transport.close();
            disposed = true;
            for (const id of pending) timers.clear(id);
            pending.clear();
            reopening = null;
            subscriptions.clear();
            inOrder.clear();
            // The statuses were this client's to keep; with it gone they would say nothing true.
            juris.batch(() => {
                for (const path of owners.keys()) if (juris.peek(statusAt(path)) !== undefined) juris.deleteState(statusAt(path));
            });
            owners.clear();
            doc?.removeEventListener?.("visibilitychange", onVisible);
            win?.removeEventListener?.("pagehide", onPageHide);
            win?.removeEventListener?.("pageshow", onPageShow);
            if (juris.liveTransport === transport) juris.liveTransport = null;
            slot.active = false;         // the one live client was this one: another may come
        });
        return first ? { liveStatus: () => juris.getState(slot.connectedPath, false) } : undefined;
    };
    plugin.dispose = () => {
        for (const dispose of installs) dispose();
        installs.clear();
    };
    return plugin;
}

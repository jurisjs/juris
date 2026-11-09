// The core's regressions: juris.js, state-manager.js, router.js, forms.js, remote-services.js,
// live-data.js, client.js. Browser-only code is reached with small fakes on globalThis (a window,
// a history, an EventSource, fetch), each put back when its test ends.
import { test } from "node:test";
import assert from "node:assert/strict";
import module from "node:module";
import { readFile } from "node:fs/promises";
import Juris, { SHARED_OPTIONS, sharedOptions } from "../juris.js";
import { Devtools, PROTOCOL } from "../devtools.js";
import { createRouter } from "../router.js";
import { createForm } from "../forms.js";
import { remoteServices, sseClient } from "../remote-services.js";
import { useLiveData } from "../live-data.js";
import { ServiceError } from "../errors.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Replaces globalThis[name] for the length of `fn`, and puts it back whatever happens.
async function withGlobal(values, fn) {
    const before = {};
    for (const [name, value] of Object.entries(values)) {
        before[name] = Object.getOwnPropertyDescriptor(globalThis, name);
        Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
    }
    try {
        return await fn();
    } finally {
        for (const [name, descriptor] of Object.entries(before)) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else delete globalThis[name];
        }
    }
}

// Collects console.error's calls for the length of `fn`.
async function capturingErrors(fn) {
    const said = [];
    const original = console.error;
    console.error = (...args) => said.push(args);
    try {
        await fn(said);
    } finally {
        console.error = original;
    }
    return said;
}

// A window with a location and a history that follow each other, as a browser's do.
function fakeWindow(address, state = null) {
    const calls = [];
    const location = {};
    const go = (url) => {
        const next = new URL(url, `http://site${location.pathname ?? "/"}`);
        location.pathname = next.pathname;
        location.search = next.search;
        location.hash = next.hash;
    };
    go(address);
    const history = {
        state,
        replaceState(entry, _title, url) {
            calls.push(["replace", url]);
            this.state = entry;
            if (url !== undefined) go(url);
        },
        pushState(entry, _title, url) {
            calls.push(["push", url]);
            this.state = entry;
            go(url);
        },
        back() { },
        forward() { },
    };
    return { location, history, calls, addEventListener() { }, removeEventListener() { }, scrollTo() { } };
}

// ---- allowInnerHTML (for the renderers) ----------------------------------------------------------

test("allowInnerHTML: an instance option, false unless given, true or false only", () => {
    assert.equal(new Juris({ isServer: true }).allowInnerHTML, false);
    assert.equal(new Juris({ isServer: true, allowInnerHTML: true }).allowInnerHTML, true);
    assert.equal(new Juris({ isServer: true, allowInnerHTML: false }).allowInnerHTML, false);
    for (const wrong of ["true", 1, null, {}, "yes"]) {
        assert.throws(() => new Juris({ isServer: true, allowInnerHTML: wrong }), TypeError, `refuses ${String(wrong)}`);
    }
});

test("allowInnerHTML: shared by the kernel and the boot alike", () => {
    assert.ok(SHARED_OPTIONS.includes("allowInnerHTML"));
    assert.deepEqual(sharedOptions({ allowInnerHTML: true }, "test"), { allowInnerHTML: true });
    assert.deepEqual(sharedOptions({ allowInnerHTML: false }, "test"), { allowInnerHTML: false });
    for (const wrong of ["true", 1, null, []]) {
        assert.throws(() => sharedOptions({ allowInnerHTML: wrong }, "test"), (error) => error instanceof TypeError && /test/.test(error.message));
    }
});

// ---- the string renderer is the kit's ---------------------------------------------------------------
// juris.js imports no string renderer: a server instance is given the kit's as a feature
// (`features: { ssr: SSRRenderer }`, juris-kit/server/ssr-renderer.js), and the tests
// of what it draws, renderRequest's included, are the kit's. Here: an instance without it, and the
// hook a feature installs itself on.

const WITHOUT_RENDERER = "rendering to a string is the kit's: features: { ssr: SSRRenderer }, from juris-kit/server/ssr-renderer.js";
const refusedAs = (method) => (error) => error instanceof TypeError && error.message === `Juris.${method}: ${WITHOUT_RENDERER}`;

test("without the kit's renderer, renderToString and renderRequest throw a TypeError that names the fix", async () => {
    let preloaded = 0;
    const juris = new Juris({ isServer: true, services: { rows: async () => { preloaded += 1; return []; } } });
    assert.equal(juris.ssrRenderer, null);
    assert.throws(() => juris.renderToString({ p: "x" }), refusedAs("renderToString"));
    assert.throws(() => juris.api.renderToString({ p: "x" }), refusedAs("renderToString"));
    await assert.rejects(juris.renderRequest({ preload: [["rows"]], layout: { p: "x" } }), refusedAs("renderRequest"));
    assert.equal(preloaded, 0, "refused before anything was preloaded");
    // A browser instance has none either: it draws with the DOM renderer.
    assert.throws(() => new Juris({ isServer: false }).renderToString({ p: "x" }), refusedAs("renderToString"));
});

test("without the kit's renderer, markRender does nothing, renderTrace() is null, and the trace hooks read nothing", () => {
    const juris = new Juris({ isServer: true, services: { rows: (n) => [n] } });
    juris.markRender("clock");
    assert.equal(juris.renderTrace(), null);
    juris.clearState({ $ssr: { calls: { [juris.callKey("rows", [1])]: [1] } } });
    assert.deepEqual(juris.call("rows", 1).value, [1], "a preloaded call");
    assert.deepEqual(juris.call("rows", 2).value, [2], "a call nobody preloaded, answered at once (a settled value)");
    assert.deepEqual(juris.preloaded("rows", 1), [1]);
    juris.live("list", "rows", 3);
    assert.deepEqual(juris.getState("list"), [3]);
    assert.doesNotThrow(() => juris.unknownComponent("Missing"));
    assert.equal(juris.renderTrace(), null);
});

test("a feature installed as the instance's ssrRenderer is what renderToString, renderRequest and renderTrace use", async () => {
    const drawn = [];
    class StringRenderer {
        constructor(juris) {
            juris.ssrRenderer = this;
            this.trace = null;
            this.lastTrace = null;
        }
        renderToString(layout, namespace, options) {
            drawn.push([layout, namespace, options]);
            this.lastTrace = options.trace ? { reactive: 0, paths: new Set(), calls: new Set(), live: new Set(), flags: new Set(["clock"]), unknown: new Set() } : null;
            return "<p>drawn</p>";
        }
    }
    const juris = new Juris({ isServer: true, features: { ssr: StringRenderer } });
    assert.ok(juris.ssrRenderer instanceof StringRenderer);
    assert.equal(juris.renderToString({ p: "x" }), "<p>drawn</p>");
    const { html, trace } = await juris.renderRequest({ layout: { p: "y" }, trace: true });
    assert.equal(html, "<p>drawn</p>");
    assert.deepEqual(drawn, [[{ p: "x" }, null, {}], [{ p: "y" }, null, { trace: true }]]);
    assert.deepEqual(trace.flags, ["clock"]);
    assert.deepEqual(juris.renderTrace().flags, ["clock"]);
});

// ---- F6: an async group belongs to its request ---------------------------------------------------

test("F6: a late settle from the last request moves none of this one's counters", async () => {
    const juris = new Juris({ isServer: true });
    const group = juris.api.group("panel");
    let resolveA;
    let rejectA;
    juris.clearState({});
    group.track(new Promise((resolve) => { resolveA = resolve; }));
    group.track(new Promise((_, reject) => { rejectA = reject; })).catch(() => { });
    let resolveBound;
    juris.bindState(() => new Promise((r) => { resolveBound = r; }), () => { });
    juris.clearState({});
    group.track(new Promise(() => { }));
    resolveA();
    rejectA(new Error("A's failure"));
    resolveBound("late");
    await tick();
    await tick();
    assert.equal(juris.stateManager.peek("$async.groups.panel.pending"), 1);
    assert.equal(juris.stateManager.peek("$async.groups.panel.errors"), undefined);
    assert.ok(!(juris.stateManager.peek("$async.pending") < 0), "the global pending count never goes below 0");
    assert.equal(juris.stateManager.peek("$async.settled") ?? 0, 0);
});

test("F6: a browser keeps carrying its in-flight counters across clearState", async () => {
    const juris = new Juris({ isServer: false });
    const group = juris.api.group("panel");
    let resolve;
    group.track(new Promise((r) => { resolve = r; }));
    juris.clearState({});
    assert.equal(juris.stateManager.peek("$async.groups.panel.pending"), 1);
    resolve();
    await tick();
    assert.equal(juris.stateManager.peek("$async.groups.panel.pending"), 0);
});

// ---- F7: no target the router answers names another host -----------------------------------------

const HOSTILE = ["/\\evil.com", "\\\\evil.com", "//evil.com", "\\/evil.com", "/\t/evil.com", "///evil.com"];

test("F7: resolveTarget reads a backslash as a slash and keeps one leading slash", () => {
    const router = createRouter({ routes: [{ path: "/" }] });
    for (const target of HOSTILE) {
        assert.equal(router.resolveTarget(target).path, "/evil.com", JSON.stringify(target));
        assert.equal(router.resolveTarget({ path: target }).path, "/evil.com", JSON.stringify(target));
    }
    assert.equal(router.resolveTarget("/%5Cevil.com").path, "/%5Cevil.com");
});

test("F7: a guard's `next` cannot make resolve() redirect to another host", () => {
    const router = createRouter({
        routes: [{ path: "/" }, { path: "/login" }, { path: "/go" }],
        guard: (to) => (to.path === "/go" ? to.query.next : null),
    });
    for (const next of HOSTILE) {
        const { redirect } = router.resolve(`/go?next=${encodeURIComponent(next)}`);
        assert.equal(redirect, "/evil.com", JSON.stringify(next));
    }
    assert.equal(router.resolve(`/go?next=${encodeURIComponent("/%5Cevil.com")}`).redirect, "/%5Cevil.com");
});

test("F7: link().href never names another host", () => {
    const juris = new Juris({ isServer: true });
    const router = createRouter({ routes: [{ path: "/" }] });
    juris.use(router);
    for (const target of HOSTILE) assert.equal(router.link(target).href, "/evil.com", JSON.stringify(target));
    assert.equal(router.link("/%5Cevil.com").href, "/%5Cevil.com");
});

// ---- F8: the boot keeps the address bar's fragment and query --------------------------------------

test("F8: adopting the server's route keeps the address bar's hash and query", async () => {
    const win = fakeWindow("/a?utm=1#section");
    await withGlobal({ window: win }, () => {
        const juris = new Juris({ isServer: false, state: { $route: { path: "/a", query: {}, hash: "" } } });
        juris.use(createRouter({ routes: [{ path: "/a" }], history: false }));
        assert.equal(juris.stateManager.peek("$route.hash"), "section");
        assert.equal(juris.stateManager.peek("$route.query.utm"), "1");
        assert.equal(`${win.location.pathname}${win.location.search}${win.location.hash}`, "/a?utm=1#section");
        for (const [, url] of win.calls) assert.ok(url === undefined || url.endsWith("#section"), `no write drops the fragment: ${url}`);
    });
});

test("F8: a transferred route on another path is adopted as the server sent it", async () => {
    const win = fakeWindow("/old?x=1#h");
    await withGlobal({ window: win }, () => {
        const juris = new Juris({ isServer: false, state: { $route: { path: "/new", query: {}, hash: "" } } });
        juris.use(createRouter({ routes: [{ path: "/new" }, { path: "/old" }], history: false }));
        assert.equal(juris.stateManager.peek("$route.path"), "/new");
        assert.equal(juris.stateManager.peek("$route.hash"), "");
        assert.equal(win.location.pathname, "/new");
    });
});

// ---- F9: a successful submit is a success ----------------------------------------------------------

test("F9: onSuccess throwing is reported, and the submit stays a success", async () => {
    const juris = new Juris({ isServer: false });
    let calls = 0;
    let errors = 0;
    const form = createForm(juris, "f", {
        fields: { name: "x" },
        submit: async () => { calls += 1; return { id: 1 }; },
        onSuccess: () => { throw new Error("onSuccess broke"); },
        onError: () => { errors += 1; },
    });
    let result;
    const said = await capturingErrors(async () => { result = await form.submit(); });
    assert.deepEqual(result, { id: 1 });
    assert.equal(juris.peek("f.error"), null);
    assert.equal(juris.peek("f.submitting"), false);
    assert.equal(errors, 0);
    assert.equal(calls, 1);
    assert.ok(said.some((args) => args.some((a) => a?.message === "onSuccess broke")), "the console hears of it");
});

test("F9: an onSuccess that rejects is reported too", async () => {
    const juris = new Juris({ isServer: false });
    const form = createForm(juris, "f", { fields: {}, submit: async () => 1, onSuccess: async () => { throw new Error("later"); } });
    const said = await capturingErrors(async () => { assert.equal(await form.submit(), 1); await tick(); });
    assert.equal(juris.peek("f.error"), null);
    assert.ok(said.some((args) => args.some((a) => a?.message === "later")));
});

// ---- F10: a call that never answers ends ---------------------------------------------------------

test("F10: remoteServices times a call out with a ServiceError (408, request.timeout)", async () => {
    let signal;
    const services = remoteServices(["slow"], { fetch: (url, init) => { signal = init.signal; return new Promise(() => { }); }, timeoutMs: 20 });
    await assert.rejects(services.slow(1), (error) => {
        assert.ok(error instanceof ServiceError);
        assert.equal(error.status, 408);
        assert.equal(error.code, "request.timeout");
        assert.equal(error.message, "The request took too long; it may or may not have been applied.");
        return true;
    });
    assert.equal(signal?.aborted, true, "the request is aborted");
});

test("F10: a body that never arrives times out too; timeoutMs 0 waits", async () => {
    const hung = remoteServices(["slow"], { fetch: async () => ({ ok: true, status: 200, json: () => new Promise(() => { }) }), timeoutMs: 20 });
    await assert.rejects(hung.slow(), (error) => error.status === 408);
    const patient = remoteServices(["late"], { fetch: async () => { await wait(30); return { ok: true, status: 200, json: async () => ({ ok: 1 }) }; }, timeoutMs: 0 });
    assert.deepEqual(await patient.late(), { ok: 1 });
});

test("F10: timeoutMs is a whole number of milliseconds", () => {
    for (const wrong of [-1, 1.5, "10", NaN, 2 ** 31, null]) {
        assert.throws(() => remoteServices(["a"], { timeoutMs: wrong }), TypeError, String(wrong));
    }
    assert.doesNotThrow(() => remoteServices(["a"], { timeoutMs: 0 }));
});

test("F10: reset() clears submitting, so a hung submit does not leave the form dead", async () => {
    const juris = new Juris({ isServer: false });
    let calls = 0;
    const form = createForm(juris, "f", { fields: { a: "" }, submit: () => { calls += 1; return new Promise(() => { }); } });
    form.submit();
    await tick();
    assert.equal(juris.peek("f.submitting"), true);
    form.reset();
    assert.equal(juris.peek("f.submitting"), false);
    form.submit();
    await tick();
    assert.equal(calls, 2);
});

test("F10: the answer of a submit made before reset() leaves the new submit's state alone", async () => {
    const juris = new Juris({ isServer: false });
    const answers = [];
    const form = createForm(juris, "f", { fields: {}, submit: () => new Promise((resolve, reject) => answers.push({ resolve, reject })) });
    const first = form.submit();
    await tick();
    form.reset();
    form.submit();
    await tick();
    answers[0].reject(new Error("the old one failed"));
    assert.equal(await first, undefined);
    assert.equal(juris.peek("f.submitting"), true, "the newer submit is still in flight");
    assert.equal(juris.peek("f.error"), null);
});

// ---- F11: a 2xx that is not JSON is no success -------------------------------------------------------

test("F11: a 2xx answer whose body is not JSON rejects (502, response.not-json)", async () => {
    const services = remoteServices(["save"], {
        fetch: async () => ({ ok: true, status: 200, statusText: "OK", json: async () => { throw new SyntaxError("Unexpected token <"); } }),
    });
    await assert.rejects(services.save({}), (error) => {
        assert.ok(error instanceof ServiceError);
        assert.equal(error.status, 502);
        assert.equal(error.code, "response.not-json");
        return true;
    });
});

// ---- F12: live data says whether it is current ------------------------------------------------------

class FakeEventSource {
    static last = null;
    constructor(url) {
        this.url = url;
        this.readyState = 0;
        this.listeners = new Map();
        FakeEventSource.last = this;
    }
    addEventListener(type, fn) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
    }
    emit(type, data) {
        for (const fn of this.listeners.get(type) ?? []) fn({ data: data === undefined ? undefined : JSON.stringify(data) });
    }
    close() {
        this.readyState = 2;
    }
}

// A client instance with a live client whose subscribes the server answers with `answer(body)`.
async function liveClient(answer = () => ({ ok: true }), fn) {
    const posts = [];
    const fetch = async (url, init) => {
        const body = JSON.parse(init.body);
        posts.push(body);
        const said = answer(body) ?? { ok: true };
        return { ok: said.ok, status: said.status ?? 200, statusText: "", json: async () => said.body ?? {} };
    };
    return withGlobal({ fetch }, async () => {
        const juris = new Juris({ isServer: false, services: { rows: async () => [] } });
        const plugin = sseClient({ EventSourceImpl: FakeEventSource, idleMs: 0, backoff: { minMs: 5, maxMs: 5 } });
        juris.use(plugin);
        try {
            await fn(juris, posts);
        } finally {
            plugin.dispose();
        }
    });
}

const hello = (client = "c1") => FakeEventSource.last.emit("hello", { client });
const keyOf = (juris, name, ...args) => juris.callKey(name, args);

// A tab hidden for hiddenMs gives its stream back, and takes one again, with every subscription, when it is shown.
test("F12: a tab hidden for hiddenMs gives its stream back; shown again, a new stream, every path pending until its fresh full", async () => {
    const listeners = new Set();
    const doc = { visibilityState: "visible", addEventListener: (t, fn) => { if (t === "visibilitychange") listeners.add(fn); }, removeEventListener: (t, fn) => listeners.delete(fn) };
    const show = (state) => { doc.visibilityState = state; for (const fn of listeners) fn(); };
    const posts = [];
    const fetch = async (url, init) => { posts.push(JSON.parse(init.body)); return { ok: true, status: 200, statusText: "", json: async () => ({}) }; };
    await withGlobal({ fetch, document: doc }, async () => {
        const juris = new Juris({ isServer: false, services: { rows: async () => [] } });
        const plugin = sseClient({ EventSourceImpl: FakeEventSource, idleMs: 0, hiddenMs: 20, backoff: { minMs: 5, maxMs: 5 } });
        juris.use(plugin);
        try {
            juris.live("rows.list", "rows", 1);
            hello("c1");
            await tick();
            const key = keyOf(juris, "rows", 1);
            FakeEventSource.last.emit("patch", { key, full: [{ id: 1 }] });
            const first = FakeEventSource.last;
            // Hidden a moment, shown again before hiddenMs: the same stream.
            show("hidden");
            await new Promise((r) => setTimeout(r, 5));
            show("visible");
            await new Promise((r) => setTimeout(r, 30));
            assert.equal(first.readyState, 0, "shown again in time: kept");
            assert.equal(juris.api.liveState("rows.list"), "live");
            // Hidden longer: given back, the path offline, its data left as it was, no reconnect counted.
            show("hidden");
            await new Promise((r) => setTimeout(r, 40));
            assert.equal(first.readyState, 2, "given back to the server");
            assert.equal(juris.api.liveState("rows.list"), "offline");
            assert.deepEqual(juris.toRaw(juris.stateManager.peek("rows.list")), [{ id: 1 }]);
            // Shown: a new stream, the subscription announced again, pending until its full.
            const subscribesBefore = posts.length;
            show("visible");
            assert.notEqual(FakeEventSource.last, first, "a new stream");
            hello("c2");
            await tick();
            assert.ok(posts.length > subscribesBefore, "the subscription announced again");
            assert.equal(juris.api.liveState("rows.list"), "pending");
            FakeEventSource.last.emit("patch", { key, full: [{ id: 2 }] });
            assert.equal(juris.api.liveState("rows.list"), "live");
            assert.equal(juris.stateManager.peek("$live.reconnects"), undefined, "a pause is no reconnect");
        } finally {
            plugin.dispose();
        }
    });
});

test("F12: a tab already hidden when its stream opens (opened in the background) gives it back after hiddenMs too", async () => {
    const listeners = new Set();
    const doc = { visibilityState: "hidden", addEventListener: (t, fn) => { if (t === "visibilitychange") listeners.add(fn); }, removeEventListener: (t, fn) => listeners.delete(fn) };
    const fetch = async () => ({ ok: true, status: 200, statusText: "", json: async () => ({}) });
    await withGlobal({ fetch, document: doc }, async () => {
        const juris = new Juris({ isServer: false, services: { rows: async () => [] } });
        const plugin = sseClient({ EventSourceImpl: FakeEventSource, idleMs: 0, hiddenMs: 20, backoff: { minMs: 5, maxMs: 5 } });
        juris.use(plugin);
        try {
            juris.live("rows.list", "rows", 1);
            hello("c1");
            const opened = FakeEventSource.last;
            await new Promise((r) => setTimeout(r, 40));
            assert.equal(opened.readyState, 2, "never shown, given back all the same");
            assert.equal(juris.api.liveState("rows.list"), "offline");
            doc.visibilityState = "visible";
            for (const fn of listeners) fn();
            assert.notEqual(FakeEventSource.last, opened, "shown: a new stream");
        } finally {
            plugin.dispose();
        }
    });
});

test("F12: hiddenMs is null or a whole number of milliseconds", () => {
    assert.throws(() => sseClient({ hiddenMs: -1 }), /hiddenMs is null or a whole number of milliseconds/);
    assert.throws(() => sseClient({ hiddenMs: "60000" }), /hiddenMs/);
    assert.doesNotThrow(() => sseClient({ hiddenMs: null }));
});

test("F12: pending until the first full, then live", async () => {
    await liveClient(undefined, async (juris) => {
        juris.live("rows.list", "rows", 1);
        assert.equal(juris.api.liveState("rows.list"), "pending");
        hello();
        await tick();
        assert.equal(juris.api.liveState("rows.list"), "pending");
        FakeEventSource.last.emit("patch", { key: keyOf(juris, "rows", 1), full: [{ id: 1 }] });
        assert.equal(juris.api.liveState("rows.list"), "live");
        // Readable leaf by leaf, under the live client's statePath, a dotted path escaped.
        const leaves = juris.stateManager.peek("$live.paths");
        assert.deepEqual(Object.values(leaves).map((entry) => entry.status), ["live"]);
        assert.ok(!Object.keys(leaves)[0].includes("."));
    });
});

test("F12: failed on a refusal, with its words", async () => {
    await liveClient(() => ({ ok: false, status: 403, body: { error: "Not yours.", code: "live.forbidden" } }), async (juris) => {
        juris.live("secret", "rows", 2);
        hello();
        const said = await capturingErrors(async () => { await tick(); await tick(); await tick(); });
        assert.equal(juris.api.liveState("secret"), "failed");
        assert.equal(juris.api.liveMessage("secret"), "Not yours.");
        assert.ok(said.length > 0, "the console still hears of it");
    });
});

test("F12: failed when the server's re-run fails, live again on the next good answer", async () => {
    await liveClient(undefined, async (juris) => {
        juris.live("rows.list", "rows", 1);
        hello();
        await tick();
        const key = keyOf(juris, "rows", 1);
        FakeEventSource.last.emit("patch", { key, full: [{ id: 1 }] });
        await capturingErrors(async () => FakeEventSource.last.emit("patch", { key, error: "request failed" }));
        assert.equal(juris.api.liveState("rows.list"), "failed");
        assert.equal(juris.api.liveMessage("rows.list"), "request failed");
        assert.deepEqual(juris.toRaw(juris.stateManager.peek("rows.list")), [{ id: 1 }], "the last answer stays on screen");
        FakeEventSource.last.emit("patch", { key, set: [["0.id", 2]] });
        assert.equal(juris.api.liveState("rows.list"), "live");
        assert.equal(juris.api.liveMessage("rows.list"), null);
    });
});

test("F12: offline when the stream is lost, back to live after the reconnect's full", async () => {
    await liveClient(undefined, async (juris) => {
        juris.live("rows.list", "rows", 1);
        hello();
        await tick();
        const key = keyOf(juris, "rows", 1);
        FakeEventSource.last.emit("patch", { key, full: [] });
        assert.equal(juris.api.liveState("rows.list"), "live");
        FakeEventSource.last.emit("error");
        assert.equal(juris.api.liveState("rows.list"), "offline");
        hello("c2");
        await tick();
        assert.equal(juris.api.liveState("rows.list"), "pending");
        FakeEventSource.last.emit("patch", { key, full: [{ id: 3 }] });
        assert.equal(juris.api.liveState("rows.list"), "live");
    });
});

test("F12: the status is tracked, and cleared when the path is unsubscribed", async () => {
    await liveClient(undefined, async (juris) => {
        const seen = [];
        juris.bindState(() => juris.api.liveState("rows.list"), (value) => seen.push(value));
        const stop = juris.live("rows.list", "rows", 1);
        hello();
        await tick();
        FakeEventSource.last.emit("patch", { key: keyOf(juris, "rows", 1), full: [] });
        stop();
        assert.deepEqual(seen, [null, "pending", "live", null]);
        assert.deepEqual(juris.stateManager.peek("$live.paths"), {});
    });
});

test("F12: a path whose arguments move is pending under the new ones, not live with the old data", async () => {
    await liveClient(undefined, async (juris) => {
        juris.setValue("page", 1);
        // Set up as a component would be: useLiveData ties its subscription to the instance.
        juris.componentStack.push({ name: "Page", cleanups: [] });
        const rows = useLiveData(juris.api, "rows", () => [juris.getState("page", 1)], "rows.list");
        juris.componentStack.pop();
        juris.bindState(() => rows(), () => { });
        hello();
        await tick();
        FakeEventSource.last.emit("patch", { key: keyOf(juris, "rows", 1), full: [{ id: 1 }] });
        assert.equal(rows.state(), "live");
        juris.setValue("page", 2);
        assert.equal(rows.state(), "pending", "the page-1 rows on screen are not page 2's");
        assert.equal(rows.path, "rows.list");
        await tick();
        FakeEventSource.last.emit("patch", { key: keyOf(juris, "rows", 2), full: [{ id: 2 }] });
        assert.equal(rows.state(), "live");
    });
});

test("F12: without a live client, a call's answer is live once it arrives, failed when it rejects", async () => {
    let fail = false;
    const juris = new Juris({ isServer: false, services: { rows: async () => { if (fail) throw new Error("down"); return [1]; } } });
    juris.live("a", "rows");
    assert.equal(juris.api.liveState("a"), "pending");
    await tick();
    assert.equal(juris.api.liveState("a"), "live");
    fail = true;
    juris.live("b", "rows", 2);
    await tick();
    assert.equal(juris.api.liveState("b"), "failed");
    assert.equal(juris.api.liveMessage("b"), "down");
    assert.equal(juris.api.liveState("never"), null);
});

// ---- lower findings ----------------------------------------------------------------------------------

test("own keys: assign deletes a removed key named after an Object.prototype member", () => {
    const juris = new Juris({ isServer: true });
    juris.setValue("o", { toString: "x", a: 1 });
    juris.assign("o", { a: 1 });
    assert.equal(Object.hasOwn(juris.stateManager.peek("o"), "toString"), false);
});

test("own keys: a new `constructor` key wakes the container's readers", () => {
    const juris = new Juris({ isServer: true });
    juris.setValue("o", { a: 1 });
    const seen = [];
    juris.bindState(() => Object.keys(juris.getState("o")).join(","), (value) => seen.push(value));
    juris.setValue("o.constructor", 1);
    assert.deepEqual(seen, ["a", "a,constructor"]);
});

test("own keys: the router's params drop a param named after an Object.prototype member", () => {
    const juris = new Juris({ isServer: true });
    juris.use(createRouter({ routes: [{ path: "/x/:toString" }, { path: "/y" }] }));
    juris.setValue("$route.path", "/x/1");
    assert.equal(juris.stateManager.peek("$route.params.toString"), "1");
    juris.setValue("$route.path", "/y");
    assert.equal(Object.hasOwn(juris.stateManager.peek("$route.params"), "toString"), false);
});

test("Link: its href follows the route when only the params change", () => {
    const juris = new Juris({ isServer: true });
    const router = createRouter({ routes: [{ path: "/items/:id", name: "item" }, { path: "/items/:id/edit", name: "edit" }] });
    juris.use(router);
    juris.setValue("$route.path", "/items/1");
    const layout = juris.componentManager.get("Link")({ to: { name: "edit" }, textContent: "Edit" }, juris.api);
    assert.equal(typeof layout.a.href, "function");
    const seen = [];
    juris.bindState(layout.a.href, (href) => seen.push(href));
    juris.setValue("$route.path", "/items/2");
    assert.deepEqual(seen, ["/items/1/edit", "/items/2/edit"]);
    // The click goes where the href says.
    let went = null;
    router.navigate = (to) => { went = router.resolveTarget(to, router.current()); return Promise.resolve(); };
    layout.a.onclick({ button: 0, preventDefault() { } });
    assert.equal(went.path, "/items/2/edit");
});

test("hash mode: navigating to where the tab already is pushes no entry", async () => {
    const win = fakeWindow("/index.html#/a");
    await withGlobal({ window: win }, async () => {
        const juris = new Juris({ isServer: false });
        const router = createRouter({ routes: [{ path: "/a" }, { path: "/b" }], mode: "hash", history: false });
        juris.use(router);
        await router.navigate("/b");
        await router.navigate("/b");
        await router.navigate("/b");
        assert.deepEqual(win.calls.filter(([how]) => how === "push").map(([, url]) => url), ["#/b"]);
    });
});

test("the async error logs keep the last 50", async () => {
    const juris = new Juris({ isServer: false });
    for (let i = 0; i < 60; i += 1) juris.stateManager.recordError(new Error(`e${i}`));
    const log = juris.stateManager.peek("$async.errors");
    assert.equal(log.length, 50);
    assert.equal(log.at(-1).message, "e59");
    const group = juris.api.group("g");
    await Promise.all(Array.from({ length: 55 }, (_, i) => group.track(Promise.reject(new Error(`g${i}`))).catch(() => { })));
    assert.equal(juris.stateManager.peek("$async.groups.g.errors").length, 50);
});

test("callCache: an expired entry is dropped when another is written", async () => {
    const juris = new Juris({ isServer: false, callCache: { ttl: 5 }, services: { s: async (n) => n } });
    await juris.call("s", 1);
    await juris.call("s", 2);
    assert.equal(juris.callCache.size, 2);
    await wait(15);
    await juris.call("s", 3);
    assert.deepEqual([...juris.callCache.keys()], [juris.callKey("s", [3])]);
});

test("clearState: an own `__proto__` key in the next state never sets the root's prototype", () => {
    const juris = new Juris({ isServer: true });
    juris.clearState(JSON.parse('{"__proto__": {"polluted": true}, "a": 1}'));
    assert.equal(Object.getPrototypeOf(juris.stateManager.state), Object.prototype);
    assert.equal(juris.stateManager.state.polluted, undefined);
    assert.equal(juris.stateManager.state.a, 1);
    assert.doesNotMatch(juris.serializeState(), /polluted/);
});

test("root names: a nested privatePaths entry, asyncPath or routePath is refused at construction", () => {
    assert.throws(() => new Juris({ isServer: true, privatePaths: ["user.token"] }), TypeError);
    assert.throws(() => new Juris({ isServer: true, privatePaths: [""] }), TypeError);
    assert.throws(() => new Juris({ isServer: true, privatePaths: "user" }), TypeError);
    assert.throws(() => new Juris({ isServer: true, asyncPath: "app.async" }), TypeError);
    assert.throws(() => createRouter({ routes: [], routePath: "app.route" }), TypeError);
    const juris = new Juris({ isServer: true, privatePaths: ["user"], state: { user: { token: "t" }, open: 1 } });
    assert.deepEqual(JSON.parse(juris.serializeState()), { open: 1 });
});

// client.js's whenIdle is not exported and hydrate needs a document, so this holds the source: the
// API is asked for by type. A browser check: a page with <div id="requestIdleCallback"> in Safari
// (which has no requestIdleCallback) boots, and prefetches its routes' code after ~1.2 s.
test("client.js: requestIdleCallback is asked for by type, not by presence", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("../client.js", import.meta.url), "utf8");
    assert.doesNotMatch(source, /requestIdleCallback\s*\?\?/);
    assert.match(source, /typeof globalThis\.requestIdleCallback === "function"/);
});

test("live() without a live client takes a service that answers synchronously", () => {
    const juris = new Juris({ isServer: false, services: { now: () => 42 } });
    juris.live("n", "now");
    assert.equal(juris.stateManager.peek("n"), 42);
    assert.equal(juris.api.liveState("n"), "live");
});

// ---- devMode through hydrate, and the devtools feature it imports (client.js, devtools.js) ------

// A server-rendered page as small as hydrate needs: the root element holding the server's markup,
// the JSON scripts the server wrote (#juris-dev when `dev`), the nodes the DOM renderer draws, and a
// window whose location and history follow each other, which records what is dispatched on it.
class PageNode {
    static ELEMENT_NODE = 1;
    static TEXT_NODE = 3;
    constructor(nodeType) {
        this.nodeType = nodeType;
        this.parentNode = null;
        this.childNodes = [];
    }
    get firstChild() { return this.childNodes[0] ?? null; }
    get nextSibling() {
        const siblings = this.parentNode?.childNodes;
        return siblings ? (siblings[siblings.indexOf(this) + 1] ?? null) : null;
    }
    appendChild(node) {
        node.parentNode?.removeChild(node);
        this.childNodes.push(node);
        node.parentNode = this;
        return node;
    }
    removeChild(node) {
        this.childNodes.splice(this.childNodes.indexOf(node), 1);
        node.parentNode = null;
        return node;
    }
}
class PageElement extends PageNode {
    constructor(localName) {
        super(1);
        this.localName = localName;
        this.namespaceURI = "http://www.w3.org/1999/xhtml";
        this.attrs = new Map();
    }
    setAttribute(name, value) { this.attrs.set(name, String(value)); }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    removeAttribute(name) { this.attrs.delete(name); }
}
const pageText = (text) => Object.assign(new PageNode(3), { nodeValue: text });

function servedPage({ dev = false } = {}) {
    const root = new PageElement("div");
    root.setAttribute("id", "app");
    root.appendChild(pageText("the server's markup"));
    const scripts = [{ id: "state", textContent: JSON.stringify({ $route: { path: "/", name: "home" } }) }];
    if (dev) scripts.push({ id: "juris-dev", textContent: "{}" });
    const reads = [];
    const document = {
        querySelectorAll(selector) {
            reads.push(selector);
            return selector === 'script[type="application/json"]' ? scripts : [];
        },
        getElementById: (id) => (id === "app" ? root : null),
        createElement: (tag) => new PageElement(tag),
        createTextNode: pageText,
    };
    const window = fakeWindow("/");
    const told = [];
    window.dispatchEvent = (event) => { told.push(event); return true; };
    return { root, document, window, told, reads };
}

const bootRoutes = [{ path: "/", name: "home" }];
const drawsHome = (juris) => juris.registerComponent("App", () => ({ p: "drawn" }));

// hydrate() on `page`, from `client` (a second address of client.js is a second module, whose own
// imports a resolve hook hears), with devMode's console line kept off the test's output.
const boot = (page, options = {}, client = "../client.js") => withGlobal({ document: page.document, window: page.window, Node: PageNode }, async () => {
    const { hydrate } = await import(client);
    const info = console.info;
    console.info = () => { };
    try {
        return await hydrate({ routes: bootRoutes, register: drawsHome, live: false, prefetch: false, ...options });
    } finally {
        console.info = info;
    }
});

test("hydrate follows #juris-dev, and devMode: false overrides it", async () => {
    const dev = servedPage({ dev: true });
    const juris = await boot(dev);
    assert.equal(juris.devMode, true);
    assert.ok(juris.devtools instanceof Devtools, "given the devtools feature");
    assert.deepEqual(dev.window.__JURIS_DEVTOOLS__.list().map((entry) => entry.id), [juris.devIndex]);
    assert.equal(dev.root.childNodes[0].localName, "p", "and mounted");

    const refused = servedPage({ dev: true });
    const off = await boot(refused, { devMode: false });
    assert.equal(off.devMode, false);
    assert.equal(off.devtools, undefined);
    assert.equal(refused.window.__JURIS_DEVTOOLS__, undefined);

    const plain = await boot(servedPage());
    assert.equal(plain.devMode, false);
    assert.equal(plain.devtools, undefined);

    const on = await boot(servedPage(), { devMode: true });
    assert.equal(on.devMode, true);
    assert.ok(on.devtools instanceof Devtools);

    // Given, devMode is not looked up on the page: left out, #juris-dev is read beside the state.
    const given = servedPage({ dev: true });
    await boot(given, { devMode: false, services: [] });
    assert.equal(given.reads.length, 1, "the state only");
    const followed = servedPage();
    await boot(followed, { services: [] });
    assert.equal(followed.reads.length, 2, "the state, and #juris-dev");
});

test("hydrate refuses a devMode that is not a boolean, before the page is read", async () => {
    for (const devMode of ["true", 1, null, {}]) {
        const page = servedPage({ dev: true });
        await assert.rejects(boot(page, { devMode }), (error) => {
            assert.ok(error instanceof TypeError);
            assert.equal(error.message, "hydrate: devMode is true or false (left out, the page's #juris-dev turns it on)");
            return true;
        }, String(devMode));
        assert.deepEqual(page.reads, [], `${JSON.stringify(devMode)}: the page was not read`);
    }
});

test("with devMode off, hydrate imports no devtools.js and exposes nothing", async () => {
    const resolved = [];
    const hooks = module.registerHooks({
        resolve(specifier, context, next) {
            const answer = next(specifier, context);
            resolved.push(answer.url);
            return answer;
        },
    });
    const devtools = (urls) => urls.filter((url) => /\/devtools\.js(\?|$)/.test(url));
    try {
        // The control: in devMode the same hook hears the boot import devtools.js.
        await boot(servedPage({ dev: true }), {}, "../client.js?devtools-on");
        assert.equal(devtools(resolved).length, 1, "the hook hears devtools.js imported in devMode");
        resolved.length = 0;

        const page = servedPage();
        const juris = await boot(page, {}, "../client.js?devtools-off");
        assert.ok(resolved.length > 0, "the hook heard the boot");
        assert.deepEqual(devtools(resolved), [], "no devtools.js imported");
        assert.equal(juris.devMode, false);
        assert.ok(!Object.hasOwn(page.window, "__JURIS_DEVTOOLS__"), "no registry on window");
        assert.equal(page.window.$juris, undefined, "no $juris on window");
        assert.deepEqual(page.told, [], "nothing dispatched on window");
        // A write and a draw run the prototypes' methods, as they did before devtools.js existed.
        for (const name of ["stamp", "compute", "tryCapture", "resubscribe", "run", "affected", "guard"]) {
            assert.ok(!Object.hasOwn(juris.stateManager, name), `the state manager's own ${name}`);
        }
        for (const name of ["bindState", "mount"]) assert.ok(!Object.hasOwn(juris.renderer, name), `the renderer's own ${name}`);
        for (const name of ["devtools", "refused", "call"]) assert.ok(!Object.hasOwn(juris, name), `the instance's own ${name}`);
    } finally {
        hooks.deregister();
    }
});

test("devtools.js names the core's version as package.json does, and protocol 1", async () => {
    const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(PROTOCOL, 1);
    const juris = new Juris({ isServer: false, devMode: true, features: { devtools: Devtools } });
    const { endpoint } = juris.devtools;
    const connection = endpoint.connect();
    try {
        const { result } = endpoint.request(connection, "hello");
        assert.equal(result.juris, version);
        assert.equal(result.protocol, PROTOCOL);
    } finally {
        endpoint.disconnect(connection);
    }
});

test("the devtools feature refuses an instance without devMode, and a server instance", () => {
    assert.throws(() => new Juris({ isServer: false, features: { devtools: Devtools } }), TypeError);
    assert.throws(() => new Juris({ isServer: true, devMode: true, features: { devtools: Devtools } }), TypeError);
});

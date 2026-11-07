// headless.js and fluentstate.js, and the two core hooks they stand on (Juris's `features`, and
// StateManager.observe), held in Node. webcomponent.js needs custom elements: what it can show here
// (what it refuses) is at the end; it is drawn in a browser by hand.
import { test } from "node:test";
import assert from "node:assert/strict";

import Juris from "../juris.js";
import { HeadlessManager, createContext } from "../headless.js";
import { createFluentStateHeadless } from "../fluentstate.js";
import { WebComponentFactory } from "../webcomponent.js";

const server = (options = {}) => new Juris({ isServer: true, ...options });

// Collects console.error and console.warn while `fn` runs.
function said(fn) {
    const lines = [];
    const original = { error: console.error, warn: console.warn };
    console.error = console.warn = (...args) => lines.push(args.map(String).join(" "));
    try {
        fn();
    } finally {
        Object.assign(console, original);
    }
    return lines;
}

// ---- the core hooks ------------------------------------------------------------------------

test("features: each is constructed with (juris, config), once the instance is whole", () => {
    const seen = [];
    class Feature {
        constructor(juris, config) {
            seen.push([typeof juris.api.getState, config.marker]);
        }
    }
    server({ features: { one: Feature, two: Feature }, marker: 7 });
    assert.deepEqual(seen, [["function", 7], ["function", 7]]);
    assert.throws(() => server({ features: { bad: {} } }), /features\.bad is a class/);
});

test("observe: every write once, with what was there before; deletes, clearState and the stop", () => {
    const juris = server({ state: { a: { b: 1 } } });
    const heard = [];
    const stop = juris.stateManager.observe((...args) => heard.push(JSON.parse(JSON.stringify(args))));
    juris.setValue("a.b", 2);
    juris.setValue("a.b", 2); // the same primitive: nothing written, nothing told
    juris.setValue("a.c.d", 3); // intermediates made: told once, by the path written
    juris.deleteState("a.b");
    juris.batch(() => juris.setValue("e", 1));
    juris.stateManager.clearState({ z: 1 });
    stop();
    juris.setValue("a", 0);
    assert.deepEqual(heard.map(([path, value, previous]) => [path, value, previous]), [
        ["a.b", 2, 1],
        ["a.c.d", 3, null],
        ["a.b", null, 2],
        ["e", 1, null],
        ["", { z: 1 }, null],
    ]);
});

test("observe: an observer that throws does not stop the others, and its error reaches the writer", () => {
    const juris = server();
    let second = 0;
    juris.stateManager.observe(() => { throw new Error("first"); });
    juris.stateManager.observe(() => { second += 1; });
    assert.throws(() => juris.setValue("x", 1), /first/);
    assert.equal(second, 1);
    assert.equal(juris.getState("x"), 1);
});

// ---- headless.js ---------------------------------------------------------------------------

const Cart = (props, context) => ({
    api: {
        add: (item) => context.setState("cart.items", [...context.getState("cart.items", []), item]),
        count: () => context.getState("cart.items", []).length,
        props: () => props,
    },
});

test("the context: the component api, the 0.91 names beside it, services and headless apis by name", () => {
    const juris = server({ services: { hello: (name) => `hi ${name}` }, features: { headless: HeadlessManager } });
    juris.registerAndInitHeadless("cart", Cart);
    const context = juris.createContext();
    for (const name of ["getState", "setState", "executeBatch", "subscribe", "setValue", "batch", "call", "hello", "cart", "headless", "isSSR", "components", "juris"]) {
        assert.ok(name in context, name);
    }
    assert.equal(context.hello("ada"), "hi ada");
    assert.equal(context.juris, juris);
    assert.equal(context.isSSR, true);
    assert.equal(context.getState("missing"), null, "0.91's default: null");
    assert.equal(context.getState("missing", 5), 5);
    context.setState("a.b", 1);
    assert.equal(context.getState("a.b", 0, false), 1);
    assert.equal(createContext(juris, "el").element, "el");
    assert.notEqual(juris.createContext(), juris.createContext(), "each caller gets its own copy");
    assert.equal(context.components.getHeadlessAPI("cart"), juris.api.cart);
});

test("subscribe: the path and beneath it unless exact, with (value, previous, changedPath); a throwing callback is reported", () => {
    const juris = server({ features: { headless: HeadlessManager } });
    const { subscribe } = juris.createContext();
    const deep = [];
    const exact = [];
    const stopDeep = subscribe("user", (...args) => deep.push(args));
    subscribe("user", (...args) => exact.push(args), false);
    subscribe("user", () => { throw new Error("boom"); });
    const lines = said(() => {
        juris.setValue("user", { name: "a" });
        juris.setValue("user.name", "b");
        juris.setValue("other", 1);
    });
    assert.equal(lines.length, 2);
    assert.deepEqual(deep, [[{ name: "b" }, undefined, "user"], ["b", "a", "user.name"]]);
    assert.deepEqual(exact, [[{ name: "b" }, undefined, "user"]]);
    stopDeep();
    said(() => juris.setValue("user.name", "c"));
    assert.equal(deep.length, 2);
});

test("initialize again, reinitialize and cleanup: onUnregister first, the api replaced, then gone", () => {
    const juris = server({ features: { headless: HeadlessManager } });
    const log = [];
    let made = 0;
    juris.registerHeadlessComponent("svc", () => {
        const n = ++made;
        return { api: { n }, hooks: { onRegister: () => log.push(`register ${n}`), onUnregister: () => log.push(`unregister ${n}`) } };
    });
    juris.initializeHeadlessComponent("svc");
    juris.headlessManager.reinitialize("svc");
    assert.equal(juris.api.svc.n, 2);
    juris.headlessManager.cleanup();
    assert.deepEqual(log, ["register 1", "unregister 1", "register 2", "unregister 2"]);
    assert.equal("svc" in juris.api, false);
    assert.deepEqual(juris.headlessAPIs, {});
});

test("what fails is said and answers null: no such component, a throw, no object, a name the api has", () => {
    const juris = server({ features: { headless: HeadlessManager } });
    juris.registerHeadlessComponent("throws", () => { throw new Error("no"); });
    juris.registerHeadlessComponent("empty", () => null);
    juris.registerHeadlessComponent("render", () => ({ api: {} }));
    const lines = said(() => {
        for (const name of ["missing", "throws", "empty", "render"]) assert.equal(juris.initializeHeadlessComponent(name), null, name);
    });
    assert.equal(lines.length, 4);
    assert.match(lines[3], /"render" is a name the component api already has/);
    assert.throws(() => juris.registerHeadlessComponent("x", "not a function"), TypeError);
    assert.throws(() => new HeadlessManager(juris), /has one already/);
});

// ---- fluentstate.js ------------------------------------------------------------------------

function fluent(state = {}) {
    const juris = server({
        state,
        features: { headless: HeadlessManager },
        headlessComponents: { fluentState: { fn: createFluentStateHeadless, options: { autoInit: true } } },
    });
    return { juris, fs: juris.api.fluentState, $: juris.api.fluentState.getFluentStates() };
}

test("fluent reads and writes: values, missing paths made on write, never on read", () => {
    const { juris, $ } = fluent({ user: { name: "Ada", tags: ["a"] }, n: 0 });
    assert.equal($.user.name, "Ada");
    assert.equal($.n, 0);
    assert.equal($.user.name.length, 3);
    assert.equal($.settings.theme.exists(), false);
    assert.equal(juris.getState("settings"), undefined, "a read writes nothing");
    $.settings.theme.dark = true;
    assert.deepEqual(juris.getState("settings"), { theme: { dark: true } });
    $.user.name = "Grace";
    assert.equal(juris.getState("user.name"), "Grace");
    $.copy = $.user;
    assert.deepEqual(juris.getState("copy"), { name: "Grace", tags: ["a"] }, "a fluent object is written as its value");
    delete $.copy.tags;
    assert.deepEqual(juris.getState("copy"), { name: "Grace" });
});

test("fluent objects convert, list and iterate as their values", () => {
    const { $ } = fluent({ user: { name: "Ada", age: 36 }, list: [{ t: 1 }, { t: 2 }], zero: { v: 0 } });
    assert.equal(`${$.user.name}`, "Ada");
    assert.deepEqual(Object.keys($.user), ["name", "age"]);
    assert.equal("name" in $.user, true);
    assert.equal("missing" in $.user, false);
    assert.equal(JSON.stringify($.user), '{"name":"Ada","age":36}');
    assert.deepEqual([...$.list].map((item) => item.t), [1, 2]);
    assert.deepEqual($.list.map((item) => item.t), [1, 2]);
    assert.equal($.list.length, 2);
    assert.equal(Object.prototype.toString.call($.list), "[object Array]");
    assert.equal(String($.nothing), "");
    assert.equal(`${$.nothing.deeper}`, "");
    assert.equal($.nothing == null, false, "a missing path is a fluent object, as in 0.91: exists() says");
    assert.deepEqual($.user.raw(), { name: "Ada", age: 36 });
});

test("fluent array methods write a new array and answer what the native method does", () => {
    const { juris, $ } = fluent({ list: [1, 2, 3] });
    const before = juris.getState("list");
    assert.equal($.list.push(4, 5), 5);
    assert.notEqual(juris.getState("list"), before);
    assert.equal($.list.pop(), 5);
    assert.equal($.list.shift(), 1);
    assert.equal($.list.unshift(0), 4);
    assert.deepEqual($.list.splice(1, 2, "x"), [2, 3]);
    assert.deepEqual(juris.getState("list"), [0, "x", 4]);
    assert.equal($.fresh.push("a"), 1, "nothing there: a new array");
    assert.equal($.empty.pop(), undefined);
    assert.equal(juris.getState("empty"), undefined, "pop on nothing writes nothing");
    assert.deepEqual($.obj.update({ a: 1 }), { a: 1 });
    assert.deepEqual($.obj.update({ b: 2 }), { a: 1, b: 2 });
    $.obj.clear();
    assert.equal(juris.getState("obj"), null);
});

test("fluent reads subscribe like getState inside a binding; $.x reads do not", () => {
    const { juris, $ } = fluent({ user: { name: "Ada" } });
    juris.stateManager.compute("live", () => `${$.user.name}`);
    juris.stateManager.compute("still", () => `${$.x.user.name}`);
    juris.stateManager.compute("count", () => Object.keys($.user).length);
    $.user.name = "Grace";
    $.user.age = 1;
    assert.equal(juris.getState("live"), "Grace");
    assert.equal(juris.getState("still"), "Ada");
    assert.equal(juris.getState("count"), 2);
});

test("fluent subscriptions: the path, beneath it (deep), above it; once; immediate; $.x writes unheard", () => {
    const { $, juris } = fluent({ user: { name: "Ada" } });
    const heard = [];
    const copy = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
    const record = (label) => (...args) => heard.push([label, ...args.map(copy)]);
    const stop = $.user.subscribe(record("user"));
    $.user.name.length; // a primitive: no subscribe on it, as in 0.91
    $.user.subscribe(record("shallow"), { deep: false });
    $.user.watch(record("once"), { once: true, immediate: true });
    $.user.subscribe((value) => heard.push(["immediate", copy(value)]), { immediate: true });
    $.user.name = "Grace";
    juris.setValue("user", { name: "Lin" });
    $.x.user.name = "quiet";
    assert.deepEqual(heard, [
        ["immediate", { name: "Ada" }],
        ["user", { name: "Grace" }, undefined, "user.name"],
        ["once", { name: "Grace" }, undefined, "user.name"],
        ["immediate", { name: "Grace" }],
        ["user", { name: "Lin" }, { name: "Grace" }, "user"],
        ["shallow", { name: "Lin" }, { name: "Grace" }, "user"],
        ["immediate", { name: "Lin" }],
    ]);
    assert.equal(juris.getState("user.name"), "quiet");
    stop();
    assert.equal($.user.unsubscribe(stop), false, "stopped already");
    assert.match(said(() => assert.equal($.x.user.subscribe, undefined))[0], /not available through \$\.x/);
});

test("fluent batch: one notification pass, each subscriber once at the end; onUnregister ends them", () => {
    const { $, fs, juris } = fluent({ a: { b: 0 } });
    const heard = [];
    $.a.subscribe((value, previous, changed) => heard.push([value.b, changed]));
    const result = fs.batch(() => {
        $.a.b = 1;
        $.a.b = 2;
        assert.equal(fs.debug.getStats().batchActive, true);
        return "done";
    });
    assert.equal(result, "done");
    assert.deepEqual(heard, [[2, "a.b"]]);
    assert.equal(fs.debug.getStats().subscriptions, 1);
    juris.headlessManager.cleanup();
    juris.setValue("a.b", 3);
    assert.equal(heard.length, 1);
});

// ---- webcomponent.js (what Node can show) ---------------------------------------------------

test("webcomponent: the 0.91 feature installs; a name with no hyphen and no custom elements are refused", () => {
    const juris = server({ features: { webComponentFactory: WebComponentFactory } });
    assert.ok(juris.webComponentFactory instanceof WebComponentFactory);
    assert.equal(typeof juris.createWebComponent, "function");
    assert.throws(() => juris.createWebComponent("nohyphen", () => null), /must contain a hyphen/);
    assert.throws(() => juris.createWebComponent("x-a", () => null), /need a browser/);
});

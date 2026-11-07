// The render area: what both renderers refuse to write, and the rules they share (html-safety.js),
// held on the DOM renderer's side, on a small stand-in DOM below. The server's side is the string
// renderer, which is the kit's (juris-kit/server/ssr-renderer.js), and so are its
// tests. The stand-in is not a browser: it does what the renderer asks of it and throws where a
// browser throws (classList with a bad token), so a test can see what was asked. What only a real
// browser can show (the parser, CSSOM parsing) is listed in notes/juris/render.md.
import { test } from "node:test";
import assert from "node:assert/strict";

import Juris from "../juris.js";
import { Devtools } from "../devtools.js";
import { checkInnerHTML, checkStyle, checkTag, classTokens, reusableElement, allowedTags } from "../html-safety.js";

const XHTML = "http://www.w3.org/1999/xhtml";
const SVG = "http://www.w3.org/2000/svg";
const XLINK = "http://www.w3.org/1999/xlink";

// ---- a stand-in DOM ------------------------------------------------------------------------

class FakeNode {
    static ELEMENT_NODE = 1;
    static TEXT_NODE = 3;
    constructor(nodeType) {
        this.nodeType = nodeType;
        this.parentNode = null;
        this.childNodes = [];
    }
    get firstChild() { return this.childNodes[0] ?? null; }
    get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
    appendChild(node) { return this.insertBefore(node, null); }
    insertBefore(node, ref) {
        if (node.parentNode) node.parentNode.removeChild(node);
        const index = ref ? this.childNodes.indexOf(ref) : this.childNodes.length;
        this.childNodes.splice(index, 0, node);
        node.parentNode = this;
        return node;
    }
    removeChild(node) {
        this.childNodes.splice(this.childNodes.indexOf(node), 1);
        node.parentNode = null;
        return node;
    }
    remove() { this.parentNode?.removeChild(this); }
    replaceWith(node) {
        const parent = this.parentNode;
        parent.insertBefore(node, this);
        parent.removeChild(this);
    }
    get isConnected() { return true; }
    get textContent() { return this.childNodes.map((n) => n.textContent).join(""); }
    set textContent(value) {
        for (const child of [...this.childNodes]) this.removeChild(child);
        if (value !== "") this.appendChild(new FakeText(String(value)));
    }
}

class FakeText extends FakeNode {
    constructor(text) { super(3); this.nodeValue = text; }
    get textContent() { return this.nodeValue; }
}

const domError = (name) => Object.assign(new Error(name), { name });

class FakeElement extends FakeNode {
    constructor(localName, namespaceURI) {
        super(1);
        this.localName = localName;
        this.namespaceURI = namespaceURI;
        this.attrs = new Map(); // qualified name -> { ns, value }
        this.html = undefined; // what innerHTML was given, if anything
        const custom = {};
        this.style = {
            custom,
            setProperty: (name, value) => { custom[name] = value; },
            removeProperty: (name) => { delete custom[name]; },
        };
        const element = this;
        this.classList = {
            tokens() { return (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean); },
            check(token) {
                if (token === "") throw domError("SyntaxError");
                if (/[\t\n\f\r ]/.test(token)) throw domError("InvalidCharacterError");
            },
            toggle(token, force) {
                this.check(token);
                const set = new Set(this.tokens());
                const on = force ?? !set.has(token);
                if (on) set.add(token); else set.delete(token);
                element.setAttribute("class", [...set].join(" "));
                return on;
            },
            remove(token) {
                this.check(token);
                element.setAttribute("class", this.tokens().filter((t) => t !== token).join(" "));
            },
            contains(token) { return this.tokens().includes(token); },
        };
    }
    setAttribute(name, value) { this.attrs.set(name, { ns: null, value: String(value) }); }
    setAttributeNS(ns, name, value) { this.attrs.set(name, { ns, value: String(value) }); }
    getAttribute(name) { return this.attrs.get(name)?.value ?? null; }
    hasAttribute(name) { return this.attrs.has(name); }
    removeAttribute(name) { this.attrs.delete(name); }
    toggleAttribute(name, force) { if (force) this.setAttribute(name, ""); else this.removeAttribute(name); }
    addEventListener() { }
    removeEventListener() { }
    get dataset() {
        const out = {};
        for (const [name, { value }] of this.attrs) if (name.startsWith("data-")) out[name.slice(5)] = value;
        return out;
    }
    get innerHTML() { return this.html ?? ""; }
    set innerHTML(value) {
        for (const child of [...this.childNodes]) this.removeChild(child);
        this.html = String(value);
    }
}

const fakeDocument = {
    createElement: (tag) => new FakeElement(tag.toLowerCase(), XHTML),
    createElementNS: (ns, tag) => new FakeElement(tag, ns),
    createTextNode: (text) => new FakeText(text),
    getElementById: () => null,
};

// Runs `fn` with the stand-in DOM as the global one.
function withDom(fn) {
    const saved = { document: globalThis.document, Node: globalThis.Node };
    globalThis.document = fakeDocument;
    globalThis.Node = FakeNode;
    try {
        return fn();
    } finally {
        if (saved.document === undefined) delete globalThis.document; else globalThis.document = saved.document;
        if (saved.Node === undefined) delete globalThis.Node; else globalThis.Node = saved.Node;
    }
}

const client = (options = {}) => new Juris({ isServer: false, ...options });

const PAYLOAD = '<img src=x onerror="alert(1)">';

// ---- F1: innerHTML ---------------------------------------------------------------------------

test("F1 checkInnerHTML: refused unless the instance allows it", () => {
    assert.equal(checkInnerHTML(false).ok, false);
    assert.match(checkInnerHTML(false).reason, /allowInnerHTML/);
    assert.equal(checkInnerHTML(undefined).ok, false);
    assert.equal(checkInnerHTML("yes").ok, false, "only true opens it");
    assert.equal(checkInnerHTML(true).ok, true);
});

test("F1 DOM: innerHTML is refused by default and drawn with allowInnerHTML", () => withDom(() => {
    const refusing = client();
    const host = new FakeElement("div", XHTML);
    const p = refusing.render(host, { p: { innerHTML: PAYLOAD } });
    assert.equal(p.html, undefined, "nothing was given to innerHTML");

    const allowing = client();
    allowing.allowInnerHTML = true;
    const q = allowing.render(new FakeElement("div", XHTML), { p: { innerHTML: "<b>x</b>" } });
    assert.equal(q.html, "<b>x</b>");
}));

test("F1 DOM: enhance keeps its own rule (throws, or allowHtml opens it)", () => withDom(() => {
    const juris = client();
    const element = new FakeElement("div", XHTML);
    assert.throws(() => juris.enhance(element, { innerHTML: "<b>x</b>" }), /innerHTML is not allowed inside an enhanced element/);
    const other = new FakeElement("div", XHTML);
    juris.enhance(other, { innerHTML: "<b>x</b>" }, { allowHtml: true });
    assert.equal(other.html, "<b>x</b>");
}));

// ---- F2: plaintext and style -----------------------------------------------------------------

test("F2 checkTag refuses plaintext and style, allowTags re-opens them by name", () => {
    for (const tag of ["plaintext", "PLAINTEXT", "style", "Style"]) assert.equal(checkTag(tag).ok, false, tag);
    assert.equal(checkTag("style", allowedTags(["style"])).ok, true);
    assert.equal(checkTag("plaintext", allowedTags(["plaintext"])).ok, true);
    assert.equal(checkTag("plaintext", allowedTags(["style"])).ok, false);
});

// ---- F3: style objects -----------------------------------------------------------------------

test("F3 checkStyle: keys are camelCase properties or custom properties; cssText refused", () => {
    assert.deepEqual(checkStyle("marginTop", "4px"), { ok: true, name: "margin-top" });
    assert.deepEqual(checkStyle("--accent", "red"), { ok: true, name: "--accent" });
    assert.equal(checkStyle("WebkitTransform", "none").name, "-webkit-transform");
    assert.equal(checkStyle("msTransform", "none").name, "-ms-transform");
    assert.equal(checkStyle("cssFloat", "left").name, "float");
    for (const key of ["cssText", "color;x", "margin-top", "a b", "", "--", "--a;b", "--a:b", "0x", "setProperty"]) {
        const check = checkStyle(key, "red");
        assert.equal(check.ok, false, key);
        assert.equal(check.name, undefined, key);
    }
});

test("F3 checkStyle: values are strings or numbers with nothing that ends or escapes a declaration", () => {
    assert.equal(checkStyle("color", "red").ok, true);
    assert.equal(checkStyle("opacity", 0.5).ok, true);
    assert.equal(checkStyle("background", "url(/a.png) no-repeat").ok, true);
    assert.equal(checkStyle("color", null).ok, true, "nothing is a removal, not a value");
    for (const value of ["red;background:url(//evil)", "red}", "{", "<x", "\\3b", "red\nx", "red\tx", "a\u0000", "a\u007f", "red /* x", true, {}, ["red"]]) {
        const check = checkStyle("color", value);
        assert.equal(check.ok, false, JSON.stringify(value));
        assert.equal(check.name, "color", "a refused value names its property, so a previous value can be taken off");
    }
});

test("F3 DOM: the same rule; a custom property through setProperty, cssText never assigned", () => withDom(() => {
    const juris = client();
    const div = juris.render(new FakeElement("div", XHTML), {
        div: { style: { color: "red;background:url(//evil)", cssText: "position:fixed", marginTop: "4px", "--accent": "blue" } },
    });
    assert.ok(!div.style.color, "the injected value was never assigned");
    assert.equal(div.style.cssText, undefined);
    assert.equal(div.style.marginTop, "4px");
    assert.equal(div.style.custom["--accent"], "blue");
}));

test("F3 DOM: a refused value takes off the one before it", () => withDom(() => {
    const juris = client({ state: { c: "red" } });
    const div = juris.render(new FakeElement("div", XHTML), { div: { style: () => ({ color: juris.getState("c"), "--x": juris.getState("c") }) } });
    assert.equal(div.style.color, "red");
    juris.setValue("c", "blue;position:fixed");
    assert.equal(div.style.color, "");
    assert.equal(div.style.custom["--x"], undefined);
}));

// ---- F4: classList keys ----------------------------------------------------------------------

test("F4 classTokens: a key is split on whitespace, empty tokens skipped", () => {
    assert.deepEqual(classTokens("a"), ["a"]);
    assert.deepEqual(classTokens(" btn  active\n"), ["btn", "active"]);
    assert.deepEqual(classTokens(""), []);
    assert.deepEqual(classTokens("   "), []);
    assert.deepEqual(classTokens("a b"), ["a b"], "only ASCII whitespace separates tokens, as in the DOM");
});

test("F4 DOM: a classList key with whitespace or empty no longer aborts the mount", () => withDom(() => {
    const juris = client({ state: { on: true } });
    const div = juris.render(new FakeElement("div", XHTML), { div: { classList: { "btn active": () => juris.getState("on"), "": true } } });
    assert.deepEqual(div.classList.tokens(), ["btn", "active"]);
    juris.setValue("on", false);
    assert.deepEqual(div.classList.tokens(), []);
}));

// ---- lower: the DOM renderer -----------------------------------------------------------------

test("xlink:, xml: and xmlns: attributes are set in their namespaces on SVG", () => withDom(() => {
    const juris = client();
    const svg = juris.render(new FakeElement("div", XHTML), { svg: { children: [{ use: { "xlink:href": "#icon", "xml:lang": "en" } }] } });
    const use = svg.childNodes[0];
    assert.equal(use.namespaceURI, SVG);
    assert.equal(use.attrs.get("xlink:href").ns, XLINK);
    assert.equal(use.attrs.get("xml:lang").ns, "http://www.w3.org/XML/1998/namespace");
    // an HTML element keeps what the HTML parser gives it: a plain attribute
    const a = juris.render(new FakeElement("div", XHTML), { a: { "xml:lang": "en" } });
    assert.equal(a.attrs.get("xml:lang").ns, null);
}));

test("reusableElement: the same tag, and a tag the renderers would draw", () => {
    assert.equal(reusableElement("div", "DIV"), true);
    assert.equal(reusableElement("div", "span"), false);
    assert.equal(reusableElement("iframe", "iframe"), false);
    assert.equal(reusableElement("iframe", "iframe", allowedTags(["iframe"])), true);
    assert.equal(reusableElement("style", "style"), false);
});

test("enhance never writes into an existing element of a refused tag", () => withDom(() => {
    const juris = client();
    const host = new FakeElement("div", XHTML);
    const frame = host.appendChild(new FakeElement("iframe", XHTML));
    juris.enhance(host, { children: [{ iframe: { src: "https://elsewhere.example/" } }] });
    assert.equal(frame.getAttribute("src"), null);
    assert.ok(!host.childNodes.includes(frame), "the refused element was not kept for the layout");

    juris.registerComponent("Frame", () => ({ iframe: { src: "https://elsewhere.example/" } }));
    const other = new FakeElement("iframe", XHTML);
    assert.throws(() => juris.enhance(other, { Frame: {} }), /iframe/);
    assert.equal(other.getAttribute("src"), null);
    assert.throws(() => juris.enhance(other, { src: "https://elsewhere.example/" }), /iframe/);
    assert.equal(other.getAttribute("src"), null);
    // named in allowTags, it is the app's to enhance
    const opened = client({ allowTags: ["iframe"] });
    opened.enhance(other, { src: "https://example.com/" });
    assert.equal(other.getAttribute("src"), "https://example.com/");
}));

test("keyed reconcile keeps a component whose root is not an element", () => withDom(() => {
    const juris = client({ state: { items: [1, 2], tick: 0 } });
    let created = 0;
    juris.registerComponent("Empty", () => { created += 1; return null; });
    juris.registerComponent("Row", (props) => ({ li: { textContent: String(props.n) } }));
    const list = juris.render(new FakeElement("div", XHTML), {
        ul: { children: () => { juris.getState("tick"); return juris.getState("items").map((n) => (n === 1 ? { Empty: { key: "e" } } : { Row: { key: `r${n}`, n } })); } },
    });
    assert.equal(created, 1);
    assert.equal(list.childNodes.length, 2);
    juris.setValue("tick", 1);
    assert.equal(created, 1, "the component was kept, not drawn anew");
    assert.equal(list.childNodes.length, 2);
    juris.setValue("items", [2, 1]);
    assert.equal(created, 1);
    assert.equal(list.childNodes[0].localName, "li");
    assert.equal(list.childNodes[1].nodeType, 3);
}));

// ---- F27: an element reused for a bare layout of its tag holds nothing of the old one -----------

test("F27: a reused element whose new layout names nothing inside it is emptied, children or text", () => withDom(() => {
    const juris = client({ state: { on: true } });
    const byChildren = juris.render(new FakeElement("div", XHTML), {
        div: { children: () => [juris.getState("on") ? { span: { className: "badge pending", children: [{ span: {} }, { span: "Updating…" }] } } : { span: {} }] },
    });
    const byText = juris.render(new FakeElement("div", XHTML), {
        div: { children: () => [juris.getState("on") ? { span: { textContent: "Updating…" } } : { span: {} }] },
    });
    assert.equal(byChildren.textContent, "Updating…");
    juris.setValue("on", false);
    assert.equal(byChildren.textContent, "", "the old children are gone");
    assert.equal(byChildren.firstChild.childNodes.length, 0);
    assert.equal(byChildren.firstChild.getAttribute("class"), null, "and its class, as before");
    assert.equal(byText.textContent, "", "the old text is gone");
    juris.setValue("on", true);
    assert.equal(byChildren.textContent, "Updating…", "drawn again when the layout names it again");
    assert.equal(byText.textContent, "Updating…");
}));

test("F27: a reused element keeps what its new layout draws inside it", () => withDom(() => {
    const juris = client({ state: { n: 1 } });
    const host = juris.render(new FakeElement("div", XHTML), {
        div: { children: () => [juris.getState("n") === 1 ? { span: { className: "one", textContent: "One" } } : { span: { className: "two", children: [{ b: "Two" }] } }] },
    });
    juris.setValue("n", 2);
    assert.equal(host.textContent, "Two");
    assert.equal(host.firstChild.childNodes.length, 1, "the new child only, the old text gone");
    juris.setValue("n", 1);
    assert.equal(host.textContent, "One");
}));

// ---- devMode: what each binding draws (devtools.js) ------------------------------------------------

// A devMode instance with the devtools feature, and a connection to its endpoint: `ask` answers a
// request's result, failing the test on a refusal; `refusal` answers the refusal's code.
function inspected() {
    const juris = client({ devMode: true, features: { devtools: Devtools } });
    const { endpoint } = juris.devtools;
    const connection = endpoint.connect();
    const ask = (method, params) => {
        const answer = endpoint.request(connection, method, params);
        assert.ok(answer.ok, `${method}: ${JSON.stringify(answer.error)}`);
        return answer.result;
    };
    const refusal = (method, params) => endpoint.request(connection, method, params).error?.code;
    return { juris, ask, refusal, done: () => endpoint.disconnect(connection) };
}
const kindsOf = (bindings) => bindings.map(({ kind, key, part }) => [kind, key, part]);

test("devMode: each binding is labelled with what it draws", () => withDom(() => {
    const { juris, ask, done } = inspected();
    try {
        juris.setValue("link", { to: "/a", on: true, colour: "red", items: ["x"], seat: "s", title: "t", value: "v", hidden: false, label: "l" });
        juris.registerComponent("Badge", (props, api) => () => ({ b: api.getState("link.title") }));
        const host = new FakeElement("div", XHTML);
        juris.render(host, { div: { children: [
            { a: {
                href: () => juris.getState("link.to"),
                classList: { "is-on": () => juris.getState("link.on") },
                style: () => ({ color: juris.getState("link.colour") }),
                children: () => juris.getState("link.items").map((item) => ({ i: item })),
            } },
            { span: { children: [() => juris.getState("link.seat")] } },
            { Badge: {} },
            { input: { value: () => juris.getState("link.value"), hidden: () => juris.getState("link.hidden"), title: () => juris.getState("link.label") } },
            { p: { textContent: () => juris.getState("link.label") } },
        ] } });
        juris.compute("derived", () => juris.getState("link.to").length);
        juris.bindState(() => juris.getState("link.title"), () => { });
        const [a, span, b, input, p] = host.childNodes[0].childNodes;

        const anchor = ask("node", { node: a });
        assert.deepEqual(kindsOf(anchor.bindings), [["property", "href", null], ["class", "classList", "is-on"], ["style", "style", null], ["children", "children", null]]);
        assert.deepEqual(anchor.bindings.map((binding) => binding.node.ref), anchor.bindings.map(() => anchor.node.ref), "each draws on the <a>");
        assert.deepEqual(anchor.bindings[0].reads, ["link.to"]);
        assert.deepEqual(anchor.bindings[1].reads, ["link.on"]);
        assert.ok(anchor.bindings[3].reads.includes("link.items"));
        assert.ok(anchor.bindings.every((binding) => binding.applied === 1 && binding.pending === false && binding.component === null && binding.path === null));

        assert.deepEqual(kindsOf(ask("node", { node: span.childNodes[0] }).bindings), [["seat", null, null]]);
        const badge = ask("node", { node: b });
        assert.deepEqual(kindsOf(badge.bindings), [["root", null, null]]);
        assert.equal(badge.bindings[0].component, juris.findComponents("Badge")[0].id);
        assert.deepEqual(badge.roots, [juris.findComponents("Badge")[0].id]);
        assert.deepEqual(kindsOf(ask("node", { node: input }).bindings), [["property", "value", null], ["property", "hidden", null], ["property", "title", null]]);
        assert.deepEqual(kindsOf(ask("node", { node: p }).bindings), [["property", "textContent", null]]);

        const computed = ask("wakes", { path: "link.to" }).computeds;
        assert.deepEqual(computed.map(({ kind, path, node }) => [kind, path, node]), [["computed", "derived", null]]);
        const other = ask("wakes", { path: "link.title" }).bindings;
        assert.deepEqual(other.map(({ kind }) => kind), ["root", "other"]);
    } finally {
        done();
    }
}));

test("devMode: a disposed binding leaves the record", () => withDom(() => {
    const { juris, ask, refusal, done } = inspected();
    try {
        juris.setValue("show", true);
        juris.setValue("to", "/a");
        const host = new FakeElement("div", XHTML);
        juris.render(host, { div: { children: () => (juris.getState("show") ? [{ a: { href: () => juris.getState("to") } }] : []) } });
        const a = host.childNodes[0].childNodes[0];
        const [binding] = ask("node", { node: a }).bindings;
        assert.deepEqual(ask("binding", { id: binding.id }).reads, ["to"]);
        juris.setValue("show", false);
        assert.equal(refusal("binding", { id: binding.id }), "no-such-binding");
        assert.deepEqual(ask("node", { node: a }).bindings, []);
        assert.deepEqual(ask("wakes", { path: "to" }).bindings, []);
    } finally {
        done();
    }
}));

test("devMode: node answers an element's bindings, their reads, and the pass that last ran them", () => withDom(() => {
    const { juris, ask, done } = inspected();
    try {
        juris.setValue("user", { first: "Ada", last: "Lovelace" });
        const host = new FakeElement("div", XHTML);
        juris.render(host, { p: { title: () => `${juris.getState("user.last")}, ${juris.getState("user.first")}` } });
        const p = host.childNodes[0];
        const first = ask("node", { node: p });
        assert.deepEqual(first.bindings[0].reads, ["user.first", "user.last"], "sorted");
        assert.equal(first.lastPass, null, "drawn outside any pass");
        juris.setValue("user.first", "Augusta");
        const after = ask("node", { node: p });
        assert.equal(after.bindings[0].applied, 2);
        assert.deepEqual(after.lastPass.changed, ["user.first"]);
        assert.equal(after.bindings[0].lastPass, after.lastPass.id);
        assert.deepEqual(after.lastPass.cause, { kind: "other" });
    } finally {
        done();
    }
}));

test("devMode: wakes answers what affected answers", () => withDom(() => {
    const { juris, ask, done } = inspected();
    try {
        juris.setValue("rows", [{ n: 1 }, { n: 2 }]);
        juris.compute("count", () => juris.getState("rows").length);
        const host = new FakeElement("div", XHTML);
        juris.render(host, { ul: { children: () => juris.getState("rows").map((row, index) => ({ li: { title: () => String(juris.getState(`rows.${index}.n`)) } })) } });
        for (const path of ["rows", "rows.1", "rows.1.n", "count", "nothing"]) {
            const { computedCallbacks, otherCallbacks } = juris.stateManager.affected([path]);
            const wakes = ask("wakes", { path });
            assert.equal(wakes.computeds.length, computedCallbacks.size, `${path}: computeds`);
            assert.equal(wakes.bindings.length, otherCallbacks.size, `${path}: bindings`);
        }
    } finally {
        done();
    }
}));

test("refusals: the DOM renderer's go through juris.refused, which writes the console lines it wrote before", () => withDom(() => {
    const juris = client({ devMode: true, unknownComponents: "element" });
    const told = [];
    juris.refused = (...args) => { told.push(args); return Juris.prototype.refused.apply(juris, args); };
    const said = [];
    const warn = console.warn;
    console.warn = (...args) => said.push(args);
    try {
        juris.registerComponent("Card", () => ({ div: { children: [
            { iframe: { src: "/x" } },
            { a: { href: "javascript:alert(1)", style: { color: "red;background:url(x)" }, innerHTML: "<b>x</b>", title: { b: "layout" } } },
        ] } }));
        juris.render(new FakeElement("div", XHTML), { Card: {} });
    } finally {
        console.warn = warn;
    }
    const card = juris.findComponents("Card")[0];
    assert.deepEqual(told.map(([rule, , detail]) => [rule ?? null, detail.name, detail.component]), [
        [null, "iframe", card],
        [null, "href", card],
        [null, "color", card],
        [null, "innerHTML", card],
        ["layout-in-value", "title", card],
    ]);
    assert.equal(told[0][2].node.nodeType, 3, "a refused tag: the empty text node in its place");
    assert.equal(told[1][2].node.localName, "a");
    assert.deepEqual(said.map((args) => args[0]), told.map(([rule, reason]) => (rule === "layout-in-value" ? `Juris: ${reason}; ignored` : `Juris: dropped ${reason}`)));
    assert.match(said[0][0], /^Juris: dropped <iframe>/);
    assert.equal(
        said[4][0],
        'Juris: "title" was given an object, and takes text (a string or a number; a layout goes in children); ignored',
    );
    assert.deepEqual(said[4][1], { b: "layout" });
}));

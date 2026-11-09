// DOM renderer for Juris: elements, seats, keyed reconcile, components on nodes, enhance.
// It owns every node-keyed registry; state, components and the api come from the Juris core it is given.
import { FallbackSignal } from "./errors.js";
import { checkAttribute, checkInnerHTML, checkStyle, checkTag, classTokens, reusableElement } from "./html-safety.js";

// What a layout draws inside an element: a reused element that held any of these, under a layout
// that names none, is emptied (updateElement, F27).
const INNER = ["children", "textContent", "innerHTML"];

// HTML's void elements: no end tag, and nothing inside. The server writes none of what a layout puts
// inside one, and the parser could make no child of it if it did, so the client draws none of it
// either (isVoid). The kit's string renderer (server/ssr-renderer.js) keeps the same list.
const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

// The form controls whose value is state of their own (ownsValue): what the user typed or chose,
// which a re-draw that no longer gives a value leaves alone.
const OWN_VALUE = new Set(["input", "textarea", "select"]);

// HTML's boolean attributes (the standard's attribute index), present or absent, on an HTML element.
// On an SVG or MathML element a name among them is an attribute like any other, written as given, as
// the server writes it (MathML's `open`, on <mfenced>, is a value).
const BOOLEAN_ATTRIBUTES = new Set([
    "allowfullscreen",
    "alpha",
    "async",
    "autofocus",
    "autoplay",
    "checked",
    "controls",
    "default",
    "defer",
    "disabled",
    "formnovalidate",
    "hidden",
    "inert",
    "ismap",
    "itemscope",
    "loop",
    "multiple",
    "muted",
    "nomodule",
    "novalidate",
    "open",
    "playsinline",
    "readonly",
    "required",
    "reversed",
    "selected",
    "shadowrootclonable",
    "shadowrootcustomelementregistry",
    "shadowrootdelegatesfocus",
    "shadowrootserializable",
]);
// `hidden` is enumerated as well as boolean: "until-found" (in any case) is a value of its own, hidden
// until find-in-page or a fragment reveals it, and is set as given, the property left alone: assigned
// `true`, it would make it the plain boolean again.
const untilFound = (name, value) => name.toLowerCase() === "hidden" && typeof value === "string" && value.toLowerCase() === "until-found";
const ATTRIBUTE_ALIASES = {
    className: "class",
    htmlFor: "for",
};
const NAMESPACES = {
    math: "http://www.w3.org/1998/Math/MathML",
    svg: "http://www.w3.org/2000/svg",
};
// Where the browser's HTML parser reads a tag as HTML again inside <svg> or <math> (its integration
// points), so where the server's markup holds HTML: inside SVG's foreignObject, desc and title;
// inside MathML's mi, mo, mn, ms and mtext, but for mglyph and malignmark, which stay MathML; and
// inside an annotation-xml whose encoding is text/html or application/xhtml+xml, in any case. An
// annotation-xml of another encoding holds MathML, but for an <svg>, which is SVG. The client drew
// all of these in the parent's namespace but foreignObject's, so a page changed at hydration.
// The kit's string renderer keeps the same rule; the browser suite holds the two to the parser.
const HTML_INSIDE_SVG = new Set(["foreignobject", "desc", "title"]);
const TEXT_INSIDE_MATH = new Set(["mi", "mo", "mn", "ms", "mtext"]);
const HTML_ENCODINGS = new Set(["text/html", "application/xhtml+xml"]);
// What is drawn inside a MathML token element, and inside an annotation-xml that holds no HTML:
// contexts no namespace says alone. Internal: passed down where a namespace is, and read only by
// elementNamespace (and never by a caller's `namespace`, which is a namespace or null).
const IN_MATH_TEXT = Symbol("inside a MathML token element");
const IN_ANNOTATION = Symbol("inside an annotation-xml of no HTML encoding");
// The namespace of an element named `lowerTag` drawn where `inherited` says.
const elementNamespace = (inherited, lowerTag) => {
    if (inherited === IN_MATH_TEXT) return lowerTag === "mglyph" || lowerTag === "malignmark" ? NAMESPACES.math : NAMESPACES[lowerTag] ?? null;
    if (inherited === IN_ANNOTATION) return lowerTag === "svg" ? NAMESPACES.svg : NAMESPACES.math;
    return inherited || NAMESPACES[lowerTag] || null;
};
// What an element drawn in `namespace` holds: its own namespace, but at an integration point. The
// encoding is read from `element` only for an annotation-xml, the one element it decides anything for.
const namespaceInside = (namespace, lowerTag, element) => {
    if (namespace === NAMESPACES.svg) return HTML_INSIDE_SVG.has(lowerTag) ? null : namespace;
    if (namespace === NAMESPACES.math) {
        if (TEXT_INSIDE_MATH.has(lowerTag)) return IN_MATH_TEXT;
        if (lowerTag === "annotation-xml") {
            const encoding = element.getAttribute("encoding");
            return HTML_ENCODINGS.has(String(encoding ?? "").toLowerCase()) ? null : IN_ANNOTATION;
        }
    }
    return namespace;
};
// The namespaces the HTML parser gives a prefixed attribute on an SVG or MathML element (its
// "adjust foreign attributes" step): `xlink:href` in the XLink namespace, `xml:lang` in XML's,
// `xmlns` and `xmlns:…` in XMLNS's. setAttribute made each a plain attribute of that name, which a
// browser ignores (a <use xlink:href> drew nothing), where the server's markup, parsed, gave the
// real one. On an HTML element the parser keeps a plain attribute, and so does this.
const ATTRIBUTE_NAMESPACES = {
    xlink: "http://www.w3.org/1999/xlink",
    xml: "http://www.w3.org/XML/1998/namespace",
    xmlns: "http://www.w3.org/2000/xmlns/",
};
const attributeNamespace = (element, name) => {
    if (element.namespaceURI !== NAMESPACES.svg && element.namespaceURI !== NAMESPACES.math) return null;
    const colon = name.indexOf(":");
    return ATTRIBUTE_NAMESPACES[colon === -1 ? (name === "xmlns" ? name : "") : name.slice(0, colon)] ?? null;
};

// `name` in lower case: a tag, an attribute's name, an element's localName. The renderer asks for the
// same few on every element, and toLowerCase makes a new string each time even when nothing changes,
// so the answers are kept, as many as MAX_LOWER_NAMES, since a name can come from data.
const lowerNames = new Map();
const MAX_LOWER_NAMES = 1024;
const lowerName = (name) => {
    let lower = lowerNames.get(name);
    if (lower === undefined) {
        lower = name.toLowerCase();
        if (lowerNames.size < MAX_LOWER_NAMES) lowerNames.set(name, lower);
    }
    return lower;
};

// Whether `name` starts with an ASCII capital, as a component's name does (`/^[A-Z]/.test(name)`): a
// character code for a string, the regex for anything else, which it reads as a string. Juris's
// layoutFromData asks it too.
export function startsUpperCase(name) {
    if (typeof name !== "string") return /^[A-Z]/.test(name);
    const code = name.charCodeAt(0);
    return code >= 65 && code <= 90;
}

// How many own enumerable keys `object` has (Object.keys(object).length), counted without the list.
const ownKeyCount = (object) => {
    let count = 0;
    for (const key in object) {
        if (Object.hasOwn(object, key)) count += 1;
    }
    return count;
};

// A listener key's event name: `onclick` and `onClick` listen for "click". Kept, as every element with
// a listener asks, and no more than MAX_EVENT_NAMES, as a key can come from data.
const eventNames = new Map();
const MAX_EVENT_NAMES = 512;
const eventNameOf = (key) => {
    let name = eventNames.get(key);
    if (name === undefined) {
        name = key.substring(2).toLowerCase();
        if (eventNames.size < MAX_EVENT_NAMES) eventNames.set(key, name);
    }
    return name;
};

// Whether a capitalised tag drawn where `inherited` says is an element of <svg> or <math> (never an
// unknown component, Juris.unknownComponent), which it is not at an HTML integration point.
const foreignContext = (inherited) => (inherited === IN_MATH_TEXT ? null : inherited);

// What a seat's binding and a component root's binding are labelled with (bindState's `key`), for a
// devtools feature that reads the label (devtools.js reads the description). A layout's keys are
// strings, so neither is ever one.
const SEAT = Symbol("seat");
const ROOT = Symbol("root");

// Handle returned by enhance(): the matched elements (live under observe) and a way to undo it all.
// No instances: what a node that holds none answers (takeInnerInstances), shared.
const NONE = Object.freeze([]);
const call = (fn) => fn();

// Calls `fn` for every one of `items`, whichever throws, and throws the first error once all have
// been called: the rule wherever app code runs in a row (cleanups, onMount handlers, the disposal of
// nodes and instances), as a state notification pass runs its callbacks (StateManager guard). One
// that throws never keeps the others from running.
// A list is walked by index, so no step makes an iterator's answer; anything else, as it iterates.
const runEvery = (items, fn) => {
    let failures = null;
    if (Array.isArray(items)) {
        for (let index = 0; index < items.length; index += 1) {
            try {
                fn(items[index]);
            } catch (error) {
                (failures ??= []).push(error);
            }
        }
    } else {
        for (const item of items) {
            try {
                fn(item);
            } catch (error) {
                (failures ??= []).push(error);
            }
        }
    }
    if (failures) throw failures[0];
};

// What a disposed instance's binding becomes: nothing to undo, shared by every one.
const NOTHING = () => { };

// Runs every one of `steps` while an error is already on its way out (a catch undoing what a draw
// made): one that throws keeps none of the others from running, and its error gives way to the one
// going on, which is the one the caller gets (as StateManager.announce lets an observer's).
const undo = (...steps) => {
    for (const step of steps) {
        try {
            step();
        } catch {
            // comes after the error going on
        }
    }
};

// The first of `keys` that an earlier one repeats, or undefined.
const firstRepeated = (keys) => {
    const seen = new Set();
    return keys.find((key) => {
        if (seen.has(key)) return true;
        seen.add(key);
        return false;
    });
};

// `elements` is what is enhanced now: an element a fallback of another tag replaced is given as
// what stands in its place (`follow`, DOMRenderer.standInFor), in the same list, brought up to date
// whenever it is read.
class Enhancement {
    constructor(elements, dispose, follow) {
        this.list = elements;
        this.follow = follow;
        this.disposed = false;
        this.dispose = () => {
            if (this.disposed) return;
            this.disposed = true;
            dispose();
        };
    }

    get elements() {
        for (let index = 0; index < this.list.length; index += 1) this.list[index] = this.follow(this.list[index]);
        return this.list;
    }

    get size() {
        return this.elements.length;
    }

    has(element) {
        return this.elements.includes(element);
    }

    [Symbol.iterator]() {
        return this.elements[Symbol.iterator]();
    }
}

export default class DOMRenderer {
    constructor(juris) {
        this.juris = juris;
        this.elementKeys = new WeakMap(); // element -> key, for keyed reconcile
        this.serverRows = new WeakSet(); // parents whose rows hold their keys as data-key's text (adoptKeys)
        this.disposers = new WeakMap(); // element -> [dispose], its own bindings and listeners
        this.slots = new WeakMap(); // seat node -> { disposeBinding }
        this.owned = new WeakSet(); // nodes Juris created (enhance refuses to reach inside them)
        this.componentInstances = new WeakMap(); // root node -> [instance], innermost first
        this.enhanced = new WeakMap(); // foreign elements adopted through enhance(), each with its enhancement
        this.watching = new Set(); // the enhancements that observe: a redrawn element may have come to match
        this.textKept = null; // the text node a redraw found already saying what it was given (updateElement)
        this.standIns = new WeakMap(); // enhanced element -> what a fallback of another tag put in its place, enhanced in its stead
        this.pendingCounts = new WeakMap(); // element -> number of its bindings waiting on a promise
        this.localSlots = new WeakMap(); // root node -> { componentName: local-state slot path }, for handover on re-invocation
        this.appliedProps = new WeakMap(); // element -> the properties its last layout applied, so a reuse can clear what the new one lacks
        this.appliedStyles = new WeakMap(); // element -> the style its last layout's binding applied, which a reuse's style starts from
        this.classRecords = new WeakMap(); // element -> what its class, className and classList give now (applyClasses)
        this.owner = null; // the component instance whose layout is being rendered right now (bindings and children record it)
        this.depth = 0; // nesting of DOM operations; onMount handlers run when the outermost one finishes
        this.pendingMounts = []; // instances whose onMount handlers are due
        this.lateFailures = null; // what disposing a node replaced after its draw threw (mountNode), thrown as the outermost operation ends
        // > 0 while an enhanced subtree is being built: no layout under it may set innerHTML. Carried
        // by bindState the way `owner` is, so a child rendered by a binding minutes later is still
        // inside the enhancement that created it — the guard used to see only the root layout.
        this.noHtml = 0;
        // > 0 while an enhancement given { allowHtml: true } is being built, carried the same way: that
        // opt-in opens innerHTML inside it, as the instance's allowInnerHTML opens it everywhere.
        this.allowHtml = 0;
    }

    // ---- ownership context, lifecycle ----------------------------------------------------

    withOwner(owner, fn) {
        const previous = this.owner;
        this.owner = owner;
        try {
            return fn();
        } finally {
            this.owner = previous;
        }
    }

    // Every DOM operation runs inside enter(): when the outermost one finishes, due onMount handlers
    // run — synchronously, so a write followed by an assertion still sees everything, mount effects included.
    // An error the operation throws is the one its caller gets: what leave() throws then gives way (undo).
    enter(fn) {
        this.depth += 1;
        let failed = true;
        try {
            const result = fn();
            failed = false;
            return result;
        } finally {
            if (failed) this.leaveQuietly();
            else this.leave();
        }
    }

    // The steps of a draw undone while its error is on its way out (undo): each in a method of its own,
    // so the function that may need one makes no closure, and no context for one, every time it runs.
    leaveQuietly() {
        undo(() => this.leave());
    }

    emptyDrawnQuietly(node) {
        undo(() => this.emptyDrawn(node));
    }

    disposeTreeQuietly(node) {
        undo(() => this.disposeTree(node));
    }

    abandonInstance(instance) {
        undo(() => this.disposeDrawn(instance.root), () => this.disposeInstance(instance));
    }

    // As the outermost operation ends: the onMount handlers due run, devMode's tree watchers are
    // told, and what a late disposal threw (mountNode) is thrown. Each runs whichever throws, and the
    // first error is thrown after: a late disposal's, which came during the operation, before a
    // handler's. Allocates nothing unless one throws: it runs once per binding update.
    leave() {
        this.depth -= 1;
        if (this.depth !== 0) return;
        let failures = this.lateFailures;
        this.lateFailures = null;
        try {
            if (this.pendingMounts.length) this.flushMounts();
        } catch (error) {
            (failures ??= []).push(error);
        }
        try {
            if (this.componentManager.devMode) this.componentManager.flush();
        } catch (error) {
            (failures ??= []).push(error);
        }
        if (failures) throw failures[0];
    }

    // Every handler due runs, whichever throws (one that mounts more queues them, and they run too),
    // and the first error is thrown once all have (runEvery).
    flushMounts() {
        let failures = null;
        while (this.pendingMounts.length) {
            const due = this.pendingMounts.splice(0);
            for (const instance of due) {
                if (instance.disposed || !instance.mounts?.length) continue;
                const handlers = instance.mounts;
                instance.mounts = [];
                for (const handler of handlers) {
                    try {
                        const result = handler(instance.root);
                        if (typeof result === "function") instance.cleanups.push(result);
                    } catch (error) {
                        (failures ??= []).push(error);
                    }
                }
            }
        }
        if (failures) throw failures[0];
    }

    // An error boundary that has finished rendering swaps its root for the fallback layout.
    showFallback(instance, layout) {
        this.enter(() => {
            instance.root = this.withOwner(instance, () => this.mountRoot(instance.root, layout, instance.namespace, instance.props?.key, instance));
        });
    }

    // ---- everything shared with the core is reached through `juris` ------------------
    get stateManager() {
        return this.juris.stateManager;
    }

    get componentManager() {
        return this.juris.componentManager;
    }

    get componentStack() {
        return this.juris.componentStack;
    }

    get api() {
        return this.juris.api;
    }

    get devMode() {
        return this.juris.devMode;
    }

    get allowTags() {
        return this.juris.allowTags;
    }

    get allowSchemes() {
        return this.juris.allowSchemes;
    }

    getState(path, defaultValue, options) {
        return this.juris.getState(path, defaultValue, options);
    }

    // A binding whose owner element carries data-pending while its promise is slow. The binding remembers
    // the component that was rendering when it was created: later runs render under that owner (so new
    // children get the right parent) and its errors go to that owner's boundaries.
    //
    // `key` and `part` say what it draws, and are ignored here: the layout key (`href`, `textContent`,
    // `classList` with a class name as `part`, or null for a function giving the whole object, `style`,
    // `children`), or SEAT or ROOT with the node it draws into, or the getter of that node, as `part`.
    // They are for a devtools feature, which replaces this method on the one devMode instance it is
    // given (devtools.js); passing them is all a binding pays for it without one.
    bindState(resolver, applyValue, target = null, key = null, part = null) {
        let marked = null;
        let isSlow = false;
        const owner = this.owner;
        const noHtml = this.noHtml;
        const allowHtml = this.allowHtml;
        // enter() + withOwner(), inlined: this runs once per binding per change, so it must not allocate.
        const apply = (value) => {
            const previousOwner = this.owner;
            const previousNoHtml = this.noHtml;
            const previousAllowHtml = this.allowHtml;
            this.owner = owner;
            this.noHtml = noHtml;
            this.allowHtml = allowHtml;
            this.depth += 1;
            let failed = true;
            try {
                const result = applyValue(value);
                failed = false;
                return result;
            } finally {
                this.owner = previousOwner;
                this.noHtml = previousNoHtml;
                this.allowHtml = previousAllowHtml;
                // As in enter(): the apply's own error is the one thrown; what leave() throws gives way.
                if (failed) undo(() => this.leave());
                else this.leave();
            }
        };
        return this.juris.bindState(
            resolver,
            apply,
            (slow) => {
                isSlow = slow;
                if (slow) {
                    // The node may not be in the document yet (first render); look it up once the tree is settled.
                    queueMicrotask(() => {
                        if (!isSlow || marked) return;
                        marked = this.pendingHolder(typeof target === "function" ? target() : target);
                        if (marked) this.markPending(marked, 1);
                    });
                } else if (marked) {
                    this.markPending(marked, -1);
                    marked = null;
                }
            },
            owner,
        );
    }

    getLayoutEntry(layout) {
        return this.juris.getLayoutEntry(layout);
    }

    layoutTag(layout) {
        return this.juris.layoutTag(layout);
    }

    normalizeContent(content) {
        return this.juris.normalizeContent(content);
    }

    isTextLayout(layout) {
        return this.juris.isTextLayout(layout);
    }

    isSeatLayout(layout) {
        return this.juris.isSeatLayout(layout);
    }

    textOf(layout) {
        return this.juris.textOf(layout);
    }

    getKey(layout) {
        return this.juris.getKey(layout);
    }

    withKey(layout, key) {
        return this.juris.withKey(layout, key);
    }

    isRef(value) {
        return this.juris.isRef(value);
    }

    invokeDefinition(instance, props) {
        return this.juris.invokeDefinition(instance, props);
    }

    watchGetterProps(name, props) {
        return this.juris.watchGetterProps(name, props);
    }

    // What carries data-pending for `node`: an element, or a shadow root's host, which stands for the
    // root. Any other fragment has no attributes, so nothing is marked: a seat in a <template>'s
    // content, or one drawn into a fragment. toggleAttribute on one threw from the microtask.
    pendingHolder(node) {
        if (!node) return null;
        return node.nodeType === Node.ELEMENT_NODE ? node : (node.host ?? null);
    }

    markPending(element, delta) {
        const count = (this.pendingCounts.get(element) ?? 0) + delta;
        this.pendingCounts.set(element, count);
        element.toggleAttribute("data-pending", count > 0);
    }

    // ---- ownership / cleanup -------------------------------------------------

    // Most elements own exactly one disposer, so it is stored bare; an array only appears for the second.
    addDisposer(element, dispose) {
        const existing = this.disposers.get(element);
        if (existing === undefined) this.disposers.set(element, dispose);
        else if (typeof existing === "function") this.disposers.set(element, [existing, dispose]);
        else existing.push(dispose);
    }

    // Tears down the bindings and listeners owned by this element only (not its descendants): every
    // one, whichever throws, the first error thrown after (runEvery).
    disposeElement(element) {
        const owned = this.disposers.get(element);
        if (owned === undefined) return;
        this.disposers.delete(element);
        if (typeof owned === "function") owned();
        else runEvery(owned, call);
    }

    // Tears down bindings for an element and its whole subtree. Public: call this before
    // removing a Juris-rendered node from the DOM yourself. Every part goes, its seat, its instances,
    // its own bindings, then what it holds, whichever throws; the first error is thrown after.
    disposeTree(node) {
        // Most nodes of a page have nothing of their own, and a list has thousands of them.
        if (!this.slots.has(node) && !this.componentInstances.has(node) && !this.disposers.has(node)) {
            this.disposeChildren(node);
            return;
        }
        // Each part whichever throws, as runEvery runs them, without a list of steps made per node.
        let failures = null;
        try {
            this.disposeSlot(node);
        } catch (error) {
            failures = [error];
        }
        try {
            this.disposeInstances(node);
        } catch (error) {
            (failures ??= []).push(error);
        }
        try {
            this.disposeElement(node);
        } catch (error) {
            (failures ??= []).push(error);
        }
        try {
            this.disposeChildren(node);
        } catch (error) {
            (failures ??= []).push(error);
        }
        if (failures) throw failures[0];
    }

    // Every one of `nodes` disposed (disposeTree), or taken off and disposed (removeDisposed), whichever
    // throws; the first error is thrown once all have gone, as runEvery does.
    disposeEach(nodes) {
        let failures = null;
        for (let index = 0; index < nodes.length; index += 1) {
            try {
                this.disposeTree(nodes[index]);
            } catch (error) {
                (failures ??= []).push(error);
            }
        }
        if (failures) throw failures[0];
    }

    removeEach(nodes) {
        let failures = null;
        for (let index = 0; index < nodes.length; index += 1) {
            try {
                this.removeDisposed(nodes[index]);
            } catch (error) {
                (failures ??= []).push(error);
            }
        }
        if (failures) throw failures[0];
    }

    // What `node` holds, every one disposed whichever throws (disposeTree). A single child (a cell's
    // text, a link's label) needs no list; several are listed as they are now, since a cleanup may
    // move one while they go.
    disposeChildren(node) {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const parent = this.contentOf(node);
        const first = parent.firstChild;
        if (first === null) return;
        if (first.nextSibling === null) {
            this.disposeTree(first);
            return;
        }
        this.disposeEach(Array.from(parent.childNodes));
    }

    // What an abandoned draw left in `node`, a node that was already there (an element a component
    // took over, or one enhance adopted): its bindings and what it drew inside, disposed; the node
    // stays where it is, and so does what holds it (a seat, the instances outside the draw).
    disposeDrawn(node) {
        if (node?.nodeType !== Node.ELEMENT_NODE) return;
        runEvery([() => this.disposeChildren(node), () => this.disposeElement(node)], call);
    }

    // ---- reactive seats ---------------------------------------------------------
    // A function in a child position is a seat: it always occupies exactly one node in the parent
    // (an empty text node when it shows nothing), and only that node changes when its function re-runs.

    disposeSlot(node) {
        const slot = this.slots.get(node);
        if (!slot) return;
        this.slots.delete(node);
        slot.disposeBinding();
    }

    // Reactive functions receive the DOM they apply to: an attribute or children function gets its element; a
    // seat (a function in a child position) or a component's root function gets the node currently rendered
    // there, null before the first render. Existing zero-argument functions are unaffected.
    createSlot(resolver, namespace, existingNode = null) {
        const slot = { disposeBinding: () => { } };
        let node = existingNode;
        // A component seated here may swap its own root (null -> div once its data loads). mountRoot
        // tells the seat through this, so its next render replaces the node that is actually there.
        slot.setNode = (next) => { node = next; };
        try {
            slot.disposeBinding = this.bindChain(
                resolver,
                () => node,
                (layout) => {
                    node = this.mountSeat(node, layout, namespace, slot);
                },
                () => node?.parentNode,
                SEAT,
            );
        } catch (error) {
            // Its first draw threw, and its binding went with it (Juris.bindState): the seat does not
            // stay on the node it was given (mountSeat puts it back there for a re-draw).
            if (node && this.slots.get(node) === slot) this.slots.delete(node);
            throw error;
        }
        // Still waiting on a promise: an empty text node keeps the seat until the value arrives.
        return node ?? (node = this.mountSeat(null, undefined, namespace, slot));
    }

    // Binds a seat's function, or a component's root function, whose value may itself be a function:
    // each function in the chain is bound one level down and draws through the same `draw`, into the
    // one node its holder keeps (`current`), and a new value at any level lets every level below it
    // go. An inner function used to be a seat of its own on the same node, which the outer one never
    // heard of: once the inner one swapped its node, the outer one drew into the detached node for
    // good, and its next value never replaced the inner one, whose binding kept running. The server
    // evaluates the chain in one go (the kit's string renderer, `node`), and this draws what it drew. Returns
    // the dispose, for the whole chain.
    // `label` is SEAT or ROOT, what each level's binding draws (bindState). A list is refused in words
    // naming what gave it (Juris.oneLayout): a root function's value is its component's, and any level
    // below it a function in one child's place, as on the server.
    bindChain(resolver, current, draw, target, label, givenBy = label === ROOT ? "component" : "seat") {
        let below = null;
        const dispose = this.bindState(
            () => resolver(current() ?? null),
            (layout) => {
                below?.();
                below = null;
                if (this.isSeatLayout(layout)) below = this.bindChain(layout, current, draw, target, label, "seat");
                else draw(this.juris.oneLayout(layout, givenBy));
            },
            target,
            label,
            current,
        );
        // Both levels go, whatever disposing the lower one throws; the first error is thrown after.
        return () => {
            const lower = below;
            below = null;
            runEvery([() => lower?.(), dispose], call);
        };
    }

    // Rebinds a seat to a fresh function (e.g. a component re-invoked with new props). The old seat
    // goes first, as it must; if that throws, or the new one's first draw does, no seat holds the
    // node, so what the old one drew is taken off it (emptyDrawn), and the error goes on.
    updateSlot(node, resolver, namespace) {
        try {
            this.disposeSlot(node);
            return this.createSlot(resolver, namespace, node);
        } catch (error) {
            this.emptyDrawnQuietly(node);
            throw error;
        }
    }

    mountSeat(current, layout, namespace, slot) {
        // Whatever was seated here goes, even if the node is reused: taken off now, disposed inside
        // the draw below, so a cleanup that throws is handled as a failed draw is.
        const seated = current ? this.takeInnerInstances(current) : NONE;
        if (current) this.slots.delete(current);
        let node;
        try {
            this.disposeAll(seated);
            node = this.mountNode(current, layout, namespace);
        } catch (error) {
            // A re-draw that throws leaves the node where it was: the seat goes back on it, as
            // mountRoot puts back what it lifted, so a later removal of the node disposes the seat;
            // and what the components seated here drew, gone now, is taken off it (emptyDrawn).
            if (current) {
                this.slots.set(current, slot);
                if (seated.length) this.emptyDrawnQuietly(current);
            }
            throw error;
        }
        this.slots.set(node, slot);
        return node;
    }

    // Represents `layout` at `current`: the element is updated in place when the tag matches,
    // handed to the component when the layout names one, otherwise replaced by a fresh node.
    mountNode(current, layout, namespace) {
        if (this.isTextLayout(layout) && current?.nodeType === Node.TEXT_NODE) {
            const text = this.textOf(layout);
            if (current.nodeValue !== text) current.nodeValue = text;
            return current;
        }
        if (this.canReuseRoot(current, layout)) return this.updateElement(current, layout, namespace);
        const takenByComponent = current?.nodeType === Node.ELEMENT_NODE
            && !this.isTextLayout(layout)
            && this.componentManager.has(this.layoutTag(layout));
        if (takenByComponent) {
            return this.createComponent(layout, namespace, current);
        }
        const node = this.createElement(layout, namespace);
        if (current) {
            // The old node goes once the new one is drawn, and the new one takes its place whatever
            // its disposal throws. That error is kept for the end of the outermost operation (leave),
            // after the bookkeeping of the draw it came with, which succeeded (mountSeat, mountRoot):
            // thrown from here, every layer above would take it for its own draw failing.
            try {
                this.disposeTree(current);
            } catch (error) {
                (this.lateFailures ??= []).push(error);
            }
            current.replaceWith(node);
        }
        return node;
    }

    // ---- component instances ---------------------------------------------------

    // `inner`: the instance was drawn inside every one the node carries already (a component adopting
    // the element inside the enhancer that answered it), so it goes in front, the list being innermost
    // first (takeInnerInstances, mountRoot).
    attachInstance(node, instance, inner = false) {
        let list = this.componentInstances.get(node);
        if (!list) {
            list = [];
            this.componentInstances.set(node, list);
        }
        if (inner) list.unshift(instance);
        else list.push(instance);
        this.recordLocalSlot(node, instance);
    }

    // The node remembers which local-state slot each component name used on it, so a later same-name
    // instance taking the node over (re-invocation with new props) continues with the same state.
    recordLocalSlot(node, instance) {
        if (instance.local === undefined) return;
        const slots = this.localSlots.get(node) ?? {};
        slots[instance.name] = { slot: instance.local, key: instance.props?.key };
        this.localSlots.set(node, slots);
    }

    findInstance(node, name) {
        const list = this.componentInstances.get(node);
        return list?.find((instance) => instance.name === name);
    }

    // Its binding, then every cleanup, whichever throws; the first error is thrown once all have run.
    disposeInstance(instance) {
        instance.disposed = true;
        this.componentManager.untrack(instance);
        const binding = instance.disposeBinding;
        const cleanups = instance.cleanups;
        // The cleanups there now are the ones run: one added while they run is kept, not run.
        const count = cleanups.length;
        instance.disposeBinding = NOTHING;
        if (count !== 0) instance.cleanups = [];
        let failures = null;
        try {
            binding();
        } catch (error) {
            failures = [error];
        }
        for (let index = 0; index < count; index += 1) {
            try {
                cleanups[index]();
            } catch (error) {
                (failures ??= []).push(error);
            }
        }
        if (failures) throw failures[0];
    }

    // Every one of `instances`, innermost first, whichever throws (disposeInstance), the first error
    // thrown after.
    disposeAll(instances) {
        let failures = null;
        for (let index = 0; index < instances.length; index += 1) {
            try {
                this.disposeInstance(instances[index]);
            } catch (error) {
                (failures ??= []).push(error);
            }
        }
        if (failures) throw failures[0];
    }

    disposeInstances(node) {
        const list = this.componentInstances.get(node);
        if (!list) return;
        this.componentInstances.delete(node);
        this.disposeAll(list);
    }

    // Before a node is reused as the root of a different layout, the components that currently
    // render into it must go. Instances are attached innermost-first, so everything listed before
    // `owner` was rendered inside it; `owner` itself and the outer instances after it stay alive.
    // With no owner (a seat or a reconciled child), every instance on the node belongs to that slot.
    // An owner that is not attached yet (a fresh instance taking over an existing root) owns nothing.
    // They are taken off the node and answered, not yet disposed: the caller disposes them
    // (disposeAll) inside the draw it guards, so a cleanup that throws as they go is handled as the
    // draw failing would be (mountSeat, mountRoot, redraw, enhanceElement).
    takeInnerInstances(node, owner = null) {
        const list = this.componentInstances.get(node);
        if (!list) return NONE;
        const ownerIndex = owner ? list.indexOf(owner) : list.length;
        if (ownerIndex === -1) return NONE;
        const inner = list.splice(0, ownerIndex);
        if (list.length === 0) this.componentInstances.delete(node);
        return inner;
    }

    // What components that are gone drew in `node`, which stays (a re-draw that threw kept it):
    // taken off, so the page never shows a component that is gone. A text node is emptied; an
    // element loses its bindings, what it holds, and what its last layout put on it.
    emptyDrawn(node) {
        if (node.nodeType !== Node.ELEMENT_NODE) {
            node.nodeValue = "";
            return;
        }
        try {
            this.disposeDrawn(node);
        } finally {
            // taken off whatever its disposal throws
            const inside = this.contentOf(node);
            while (inside.firstChild) inside.removeChild(inside.firstChild);
            this.clearStaleProperties(node, {});
            this.appliedProps.delete(node);
        }
    }

    // ---- property application -------------------------------------------------

    resolveTarget(target, method) {
        const element = typeof target === "string" ? document.getElementById(target) : target;
        if (!element) throw new Error(`Juris.${method}: target "${target}" not found`);
        return element;
    }

    // `class`, `className` and `classList` together, for a layout that gives a classList. One rule
    // makes the attribute of them (Juris classAttribute), the one the server writes it by: `class` or
    // `className` (`baseKey`, the later of the two) gives the base, and each classList key turns the
    // classes it names on or off, in order, so the last key naming a class decides it, whatever the
    // base says. What each of them gives now is kept in the element's record (classRecords), and
    // whichever runs again draws from all of it: a className that runs again keeps the classes the
    // classList turns on, and keeps off the ones it turns off.
    // The first draw writes the attribute once, every value in: markup the server wrote (enhance)
    // that already says the same is left as it is, no class taken off and put back. A base that has
    // not come yet (a promise, a refused value) leaves the classes the element has; a key whose value
    // has not come yet decides nothing.
    applyClasses(element, properties, baseKey) {
        const classes = { base: undefined, keys: [], drawing: true };
        this.classRecords.set(element, classes);
        try {
            if (baseKey !== undefined) {
                this.bindProperty(element, properties[baseKey], (value) => {
                    if (this.rejectLayout(value, "class")) return;
                    classes.base = value === null || value === undefined ? null : String(value);
                    if (!classes.drawing) this.drawClasses(element, classes);
                }, baseKey);
            }
            const classList = properties.classList;
            if (typeof classList === "function") {
                this.bindClassList(element, classList, classes);
            } else {
                for (const className in classList) {
                    // A key is class names (html-safety.js classTokens): classList.toggle throws on a
                    // token with whitespace in it, or an empty one, and took the whole mount down.
                    const tokens = classTokens(className);
                    if (tokens.length === 0) continue;
                    const key = { tokens, on: undefined };
                    classes.keys.push(key);
                    this.bindProperty(element, classList[className], (value) => {
                        key.on = Boolean(value);
                        if (!classes.drawing) this.toggleClasses(element, classes, tokens);
                    }, "classList", className);
                }
            }
        } finally {
            classes.drawing = false;
        }
        this.drawClasses(element, classes);
    }

    // A function as `classList` gives the whole `{ name: boolean }` object, and is run again when what
    // it read changes. A run's keys are the classList's keys (applyClasses), its values used as they
    // are: a function in it is not run, and is true, as a function that a class's own function
    // returns is. A run after the first turns on and off the classes its object names; a class the
    // run before named and this one does not goes back to what the base gives: on when `class` or
    // `className` names it, and otherwise off if the run before had turned it on. Nothing else is
    // touched: a class from the server's markup or anything else stays.
    bindClassList(element, classList, classes) {
        this.bindProperty(element, classList, (value) => {
            const before = new Map(this.classDecisions(classes));
            classes.keys = [];
            for (const className in value) {
                classes.keys.push({ tokens: classTokens(className), on: Boolean(value[className]) });
            }
            if (classes.drawing) return;
            const decisions = this.classDecisions(classes);
            const named = new Set(decisions.map(([token]) => token));
            const base = new Set(typeof classes.base === "string" ? classTokens(classes.base) : NONE);
            for (const [token, on] of before) {
                if (named.has(token)) continue;
                if (base.has(token)) {
                    decisions.push([token, true]);
                } else if (on) {
                    decisions.push([token, false]);
                }
            }
            this.writeClass(element, this.juris.classAttribute(element.getAttribute("class"), decisions));
        }, "classList", null);
    }

    // A classList key's value changed: its classes are turned on or off in what the element has, each
    // as the last key naming it says now. No other class is touched.
    toggleClasses(element, classes, tokens) {
        const decided = new Map(this.classDecisions(classes));
        const decisions = tokens.map((token) => [token, decided.get(token)]);
        this.writeClass(element, this.juris.classAttribute(element.getAttribute("class"), decisions));
    }

    // The whole attribute: the base (what the element has, while none has come) and what the
    // classList gives now.
    drawClasses(element, classes) {
        const base = classes.base === undefined ? element.getAttribute("class") : classes.base;
        this.writeClass(element, this.juris.classAttribute(base, this.classDecisions(classes)));
    }

    // The [className, on] pairs the classList gives now, in the order of its keys; a key whose value
    // has not come yet gives none.
    classDecisions(classes) {
        const decisions = [];
        for (const key of classes.keys) {
            if (key.on === undefined) continue;
            for (const token of key.tokens) decisions.push([token, key.on]);
        }
        return decisions;
    }

    // The class attribute, written only when it changes; null takes it off.
    writeClass(element, value) {
        if (value === element.getAttribute("class")) return;
        if (value === null) {
            element.removeAttribute("class");
        } else {
            element.setAttribute("class", value);
        }
    }

    // A style is CSS, and CSS built from data is an injection of its own kind: `background:
    // url(https://elsewhere/?v=<something the page knows>)` makes the browser fetch it, and an
    // attacker-supplied value reaches the attacker. Values are escaped for the attribute, so this
    // cannot break out of the style — but it can still say things inside it. Nothing here can tell
    // a string a component wrote from one a row carried, so the rule is for the caller: build a
    // style from an object with known keys, not from a string that came from data.
    // A custom property (`--accent`) is no property of element.style: assigning one set nothing, so
    // the client dropped what the server had written. It goes through setProperty. A value of
    // nothing (null, undefined, "") removes any key, as the server leaves such a key out: assigned
    // as it was, `undefined` became the string "undefined", which CSS ignores, so a re-draw kept
    // the value before it.
    // Keys and values are held to the server's rule (html-safety.js checkStyle): a key that is no
    // property (`cssText` would replace the whole style, which the server never wrote) is left
    // alone, and a value that would carry declarations of its own is not written, taking off the
    // value before it, as a refused attribute is removed.
    // An object after a string starts from no style at all: the string was the whole inline style,
    // and the server writes the object's keys alone (a string after anything replaces it whole).
    applyStyle(element, styles, previousStyles) {
        if (typeof styles === "string") {
            element.style.cssText = styles;
            return;
        }
        const set = (key, value) => {
            const check = checkStyle(key, value);
            if (!check.ok) {
                if (this.devMode) this.juris.refused(check.rule, check.reason, { name: key, value, node: element, component: this.owner });
                if (check.name === undefined) return;
                value = "";
            }
            const none = value === null || value === undefined || value === "";
            if (!key.startsWith("--")) element.style[key] = none ? "" : value;
            else if (none) element.style.removeProperty(key);
            else element.style.setProperty(key, String(value));
        };
        if (typeof previousStyles === "string") element.style.cssText = "";
        else if (previousStyles && typeof previousStyles === "object") {
            for (const styleKey in previousStyles) {
                if (!(styleKey in styles)) set(styleKey, "");
            }
        }
        for (const styleKey in styles) {
            set(styleKey, styles[styleKey]);
        }
    }

    applyAttribute(element, name, value) {
        if (this.rejectLayout(value, name)) return;
        if (value === null || value === undefined) {
            if (checkAttribute(name, null).ok) element.removeAttribute(name);
            return;
        }
        // The same refusal as the server (html-safety.js): a data-driven attribute name, or a URL
        // whose scheme runs code, is dropped — and if a previous value got through, removed.
        const check = checkAttribute(name, value, this.allowSchemes);
        if (!check.ok) {
            if (this.devMode) this.juris.refused(check.rule, check.reason, { name, value, node: element, component: this.owner });
            if (checkAttribute(name, null).ok) element.removeAttribute(name);
            return;
        }
        const namespace = attributeNamespace(element, name);
        if (namespace) element.setAttributeNS(namespace, name, value);
        else if (element.getAttribute(name) !== String(value)) element.setAttribute(name, value);
    }

    applyBooleanAttribute(element, attribute, value) {
        if (untilFound(attribute, value)) {
            element.setAttribute(attribute, value);
            return;
        }
        if (value) {
            element.setAttribute(attribute, "");
        } else {
            element.removeAttribute(attribute);
        }
        if (attribute in element) {
            element[attribute] = Boolean(value);
        }
    }

    applyValueProperty(element, value) {
        const next = value === null || value === undefined ? "" : String(value);
        // An <option>'s value is an ATTRIBUTE that falls back to the option's own text when absent,
        // and properties are applied before children. So `value: ""` compared equal to the empty
        // option's value, the assignment was skipped as a no-op, the text landed afterwards — and
        // the option's value silently became its label: a placeholder's label was submitted as its value.
        // Options have no caret to protect, so the attribute is written outright.
        if (element.localName === "option") {
            if (element.getAttribute("value") !== next) element.setAttribute("value", next);
            return;
        }
        // Only assign when changed so reactive updates don't reset the caret while the user types.
        if (element.value !== next) element.value = next;
    }

    // Applies a value now, or binds it reactively if it's a function. Bindings are owned by the element.
    // `key` and `part` label the binding (bindState).
    bindProperty(element, propertyValue, apply, key, part) {
        if (typeof propertyValue === "function") {
            this.addDisposer(
                element,
                this.bindState(() => propertyValue(element), apply, element, key, part),
            );
        } else {
            apply(propertyValue);
        }
    }

    // A layout (element or component) only means something in a child position. An object given where
    // text goes need not be one (`"data-cart": { items: 2 }`), so devMode says what it was given, as
    // the server does. `content` and `element` are given where the value may come from a function
    // that is a tag's whole content, and read only here, once something is refused (Juris.layoutInValue).
    rejectLayout(value, position, content = null, element = null) {
        if (value === null || typeof value !== "object") return false;
        if (this.devMode) {
            const wholeContent = this.juris.wholeContentOf(content, element?.localName);
            const reason = this.juris.layoutInValue(value, position, wholeContent);
            this.juris.refused("layout-in-value", reason, { name: position, value, component: this.owner });
        }
        return true;
    }

    // ---- enhance: adopt existing (server-rendered or foreign) DOM ---------------------
    //
    // enhance(target, enhancer, options)
    //   target      element | element list | id | CSS selector
    //   enhancer    layout content, a { Component: props } layout, or (api) => either.
    //               A function enhancer runs like a component definition, taking the component api
    //               (destructurable: ({ getState, setValue, onCleanup }) => ...) plus api.element, the
    //               element being enhanced. onCleanup handlers run when the element is unenhanced,
    //               rebound, or removed.
    //   options     within: root for selector + observer (default document)
    //               allowHtml: permit innerHTML (default false: enhanced DOM never takes HTML from state)
    //               force: allow enhancing inside a Juris-rendered subtree
    //               observe: keep enhancing matches added later and dispose ones removed
    //               dryRun: return the matches without binding anything
    // Returns an Enhancement: { elements, size, has(el), disposed, dispose(), [Symbol.iterator] }.
    // With observe, `elements` tracks matches as they come and go. Enhancing an element twice
    // rebinds it; it never stacks. An element a layout draws again (force) is enhanced again, on what
    // it is now, or let go if it no longer matches: see enhanceRedrawn.

    enhance(target, enhancer, options = {}) {
        const within = options.within ?? document;
        const selector = typeof target === "string" && !document.getElementById(target) ? target : null;
        const elements = this.resolveEnhanceTargets(target, selector, within);

        if (this.devMode) console.debug(`Juris.enhance: ${elements.length} element(s) matched`, target);
        const follow = (element) => this.standInFor(element);
        if (options.dryRun) return new Enhancement(elements, () => { }, follow);
        const watch = { selector, within, enhancer, options, elements };

        // The call is one draw: when one element's enhancement throws (undone, enhanceElement), the
        // ones it made before it are undone too, and the error goes on with no handle answered.
        this.enter(() => {
            let done = 0;
            try {
                for (const element of elements) {
                    this.enhanceElement(element, watch);
                    done += 1;
                }
            } catch (error) {
                undo(() => runEvery(elements.slice(0, done), (element) => this.unenhance(element)));
                throw error;
            }
        });

        let observer = null;
        if (options.observe && typeof MutationObserver === "function") {
            // Every record, and every removal and match in it, is gone through whatever one throws (an
            // enhancement that throws is undone, enhanceElement); the first error is thrown once all
            // are done, as a state notification pass does (StateManager guard).
            observer = new MutationObserver((records) => {
                let failures = null;
                for (const record of records) {
                    for (const node of record.removedNodes) {
                        try {
                            this.disposeEnhancedWithin(node);
                        } catch (error) {
                            (failures ??= []).push(error);
                        }
                        // One a fallback replaced is held by its stand-in, which is still there.
                        for (let index = elements.length - 1; index >= 0; index -= 1) {
                            const current = this.standInFor(elements[index]);
                            if (current.isConnected) elements[index] = current;
                            else elements.splice(index, 1);
                        }
                    }
                    if (!selector) continue;
                    for (const node of record.addedNodes) {
                        if (node.nodeType !== Node.ELEMENT_NODE) continue;
                        const matches = node.matches(selector) ? [node, ...node.querySelectorAll(selector)] : Array.from(node.querySelectorAll(selector));
                        for (const match of matches) {
                            if (this.enhanced.has(match)) continue;
                            try {
                                this.enter(() => this.enhanceElement(match, watch));
                                elements.push(match);
                            } catch (error) {
                                (failures ??= []).push(error);
                            }
                        }
                    }
                }
                if (failures) throw failures[0];
            });
            observer.observe(within, { childList: true, subtree: true });
            this.watching.add(watch);
        }

        return new Enhancement(elements, () => {
            observer?.disconnect();
            this.watching.delete(watch);
            runEvery(elements.splice(0), (element) => this.unenhance(element));
        }, follow);
    }

    unenhance(element) {
        element = this.standInFor(element);
        if (!this.enhanced.has(element)) return;
        this.enhanced.delete(element);
        this.disposeTree(element);
    }

    // What stands in the place of an enhanced element now (mountRoot): the element itself unless a
    // fallback of another tag replaced it, then its stand-in, followed as far as stand-ins go.
    standInFor(element) {
        while (this.standIns.has(element)) element = this.standIns.get(element);
        return element;
    }

    resolveEnhanceTargets(target, selector, within) {
        if (selector) return Array.from(within.querySelectorAll(selector));
        if (typeof target === "string") return [document.getElementById(target)];
        if (target instanceof Node) return [target];
        if (target && typeof target[Symbol.iterator] === "function") return Array.from(target);
        throw new Error("Juris.enhance: target must be an element, a list of elements, an id, or a selector");
    }

    isInsideOwned(element) {
        for (let node = element; node; node = node.parentNode) {
            if (this.owned.has(node)) return true;
        }
        return false;
    }

    // The node and every enhanced element inside it, whichever one's disposal throws (runEvery).
    disposeEnhancedWithin(node) {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        runEvery([node, ...node.querySelectorAll("*")], (element) => {
            if (this.enhanced.has(element)) this.unenhance(element);
        });
    }

    enhanceElement(element, watch) {
        const { enhancer, options } = watch;
        if (!options.force && this.isInsideOwned(element)) {
            throw new Error("Juris.enhance: element is inside a Juris-rendered subtree; its properties belong to that layout (pass { force: true } to override)");
        }

        // Rebind, never stack: what the previous enhancement put on the element goes, inside the
        // guarded draw below, so a cleanup that throws as it goes is handled as a failed draw is.
        const rebinding = this.enhanced.has(element);
        const previous = rebinding ? this.takeInnerInstances(element) : NONE;
        this.enhanced.set(element, watch);

        // A function enhancer is an anonymous component adopting this element: it gets the api (with the
        // element on it), and its onCleanup handlers live on an instance attached to the element so
        // unenhance/removal runs them. It is attached whatever it registered: devMode's component tree
        // tracks it, and only disposal takes it out again. Being a boundary (onError), it is mounting
        // until its first draw is done (firstDraw).
        let instance = null;
        try {
            if (rebinding) runEvery([() => this.disposeElement(element), () => this.disposeAll(previous)], call);
            let layout = enhancer;
            if (typeof enhancer === "function") {
                instance = { name: "enhance", props: { element }, cleanups: [], disposeBinding: () => { }, adopted: true, parent: null, root: element, mounting: true, namespace: this.drawnInOf(element) };
                this.componentManager.track(instance);
                this.componentStack.push(instance);
                try {
                    layout = enhancer(Object.freeze({ ...this.api, element }));
                } finally {
                    this.componentStack.pop();
                }
                this.attachInstance(element, instance);
                if (instance.mounts?.length) this.pendingMounts.push(instance);
            }

            const draw = () => this.withOwner(instance, () => {
                const tag = layout && typeof layout === "object" ? Object.keys(layout)[0] : undefined;
                if (tag && this.componentManager.has(tag)) {
                    this.adoptComponent(element, layout, options);
                    return;
                }

                // The element takes the layout's properties as if the layout had drawn it, so it must
                // be one a layout may draw (checkTag): an <iframe> or a <meta> on the page is not
                // handed a layout's attributes unless allowTags names it.
                const tagCheck = checkTag(element.localName, this.allowTags);
                if (!tagCheck.ok) throw new Error(`Juris.enhance: cannot enhance it: ${tagCheck.reason}`);
                const content = this.normalizeContent(layout);
                const drawn = this.appliedProps.get(element);
                this.withNoHtml(options.allowHtml, () =>
                    this.applyPropertiesAndChildren(element, content, true, () => this.adoptKeys(element)),
                );
                // The record is of what the element carries, and what its layout gave it is still
                // there: a next layout that leaves a marker out takes it off (clearStaleProperties).
                if (drawn) this.appliedProps.set(element, { ...drawn, ...content });
            });
            if (instance) this.firstDraw(instance, element, draw, options);
            else draw();
        } catch (error) {
            // An enhancement that throws, in its enhancer or in its first draw, is undone as an
            // abandoned draw is: its instance is disposed (firstDraw has done it already, innermost
            // first, for a draw), and the element leaves `enhanced` with nothing left on it
            // (unenhance), so no handle lists it. What a previous enhancement's components drew is
            // taken off it (emptyDrawn): they are gone. The error goes on as it came.
            undo(
                () => instance && this.disposeInstance(instance),
                () => this.unenhance(element),
                () => previous.length && this.emptyDrawn(element),
            );
            throw error;
        }
    }

    // The first draw of an instance that adopts `element` (a function enhancer's, or a component's,
    // adoptComponent), with the instance mounting, as createComponent's is: a boundary whose binding
    // fails in it is signalled (Juris.showFallback) rather than having its root swapped halfway
    // through the draw, when the rest of the draw landed inside the fallback. The fallback is drawn
    // here once the draw is abandoned, by mountRoot, as showFallback draws one later; mountRoot
    // attaches the instance to the root it draws. Answers whether it drew one. An instance whose
    // draw is abandoned otherwise is disposed, as createComponent's is. However the draw ends, the
    // instance is mounting no longer.
    firstDraw(instance, element, draw, options) {
        try {
            draw();
        } catch (error) {
            if (!(error instanceof FallbackSignal) || error.boundary !== instance) {
                // Abandoned, for a boundary further out or by an error no boundary took: what it
                // drew in the element goes, then the instance, as in createComponent.
                undo(() => this.disposeDrawn(element), () => this.disposeInstance(instance));
                throw error;
            }
            instance.root = this.withOwner(instance, () => this.withNoHtml(options.allowHtml, () => this.mountRoot(element, error.layout, instance.namespace, instance.props?.key, instance)));
            return true;
        } finally {
            instance.mounting = false;
        }
        return false;
    }

    // Runs `fn` with the enhanced-DOM rule in force: innerHTML anywhere in what it renders — the
    // root layout, a child three levels down, or a child a binding produces later — is refused.
    // `{ allowHtml: true }` on the enhance() call turns it off, as it always did, and opens innerHTML
    // inside that enhancement, which the instance otherwise refuses (innerHTMLCheck).
    withNoHtml(allowHtml, fn) {
        const counter = allowHtml ? "allowHtml" : "noHtml";
        this[counter] += 1;
        try {
            return fn();
        } finally {
            this[counter] -= 1;
        }
    }

    // Whether innerHTML may be written here (html-safety.js checkInnerHTML): refused unless the
    // instance allows it (`allowInnerHTML`) or an enhancement given { allowHtml: true } is being
    // built. An enhancement without it throws instead (applyProperties), as it always did.
    innerHTMLCheck() {
        return checkInnerHTML(this.noHtml === 0 && (this.allowHtml > 0 || this.juris?.allowInnerHTML === true));
    }

    // Server rows carrying data-key become keyed children, so a keyed reconcile retains them. Their
    // keys are text, all the attribute can say, so the list is remembered until its first keyed
    // reconcile, where each row takes the key its layout gives it (claimServerRows).
    adoptKeys(element) {
        const parent = this.contentOf(element);
        for (const child of parent.children) {
            if (child.dataset?.key === undefined || this.elementKeys.has(child)) continue;
            this.elementKeys.set(child, child.dataset.key);
            this.serverRows.add(parent);
        }
    }

    // The server writes a key as String(key), so a layout's 7 is the row the server wrote as "7", and
    // read back as text it matched no layout's number: the whole list was drawn anew. The row takes the
    // layout's key from here on, so a layout that gives both 7 and "7" still has one row for each.
    claimServerRows(rows, oldIndexByKey, keys) {
        for (const key of keys) {
            if (oldIndexByKey.has(key)) continue;
            const text = String(key);
            const index = oldIndexByKey.get(text);
            if (index === undefined) continue;
            this.elementKeys.set(rows[index], key);
            oldIndexByKey.delete(text);
            oldIndexByKey.set(key, index);
        }
    }

    // A component takes over an existing element as its root. The root tag must match and can never
    // be swapped: the server's element stays the server's element. It is mounting until its first draw
    // is done (firstDraw), and is attached in front of the enhancer that answered it, which is outside it.
    adoptComponent(element, layout, options) {
        const { tag: name } = this.getLayoutEntry(layout);
        const previewInstance = { name, cleanups: [], disposeBinding: () => { }, adopted: true, parent: this.owner, root: element, mounting: true, namespace: this.drawnInOf(element), props: this.normalizeContent(this.getLayoutEntry(layout).content) };
        this.componentManager.track(previewInstance);
        const namespace = this.namespaceOf(element);
        const check = (rootLayout) => {
            if (this.isTextLayout(rootLayout) || this.isSeatLayout(rootLayout)) {
                throw new Error(`Juris.enhance: component "${name}" must return an element layout to adopt <${element.localName}>`);
            }
            const { tag, content } = this.getLayoutEntry(this.juris.oneLayout(rootLayout, "component"));
            if (this.componentManager.has(tag) || tag.toLowerCase() !== element.localName.toLowerCase()) {
                throw new Error(`Juris.enhance: component "${name}" renders <${tag}> but is adopting <${element.localName}>`);
            }
            const tagCheck = checkTag(tag, this.allowTags);
            if (!tagCheck.ok) throw new Error(`Juris.enhance: component "${name}" cannot adopt it: ${tagCheck.reason}`);
            return rootLayout;
        };
        const draw = () => this.withOwner(previewInstance, () => {
            let result;
            try {
                result = this.invokeDefinition(previewInstance, previewInstance.props);
            } catch (error) {
                // Its setup threw: offered to the boundaries as createComponent offers it, its own
                // handler first, then the enclosing ones (the enhancer's). What its own gives, or
                // nothing when one swallows it, is drawn in the element's place as a fallback is
                // (firstDraw, in its namespace), and it stays; a fallback a boundary further out gives
                // is signalled to that one, and firstDraw disposes it, as when the error is unhandled.
                const handled = this.juris.resolveError(previewInstance, error, { phase: "setup", component: name });
                if (!handled) throw error;
                throw new FallbackSignal(handled.boundary !== previewInstance && handled.layout ? handled.boundary : previewInstance, handled.layout, error);
            }
            this.adoptKeys(element);
            this.withNoHtml(options.allowHtml, () => {
                if (typeof result === "function") {
                    previewInstance.disposeBinding = this.bindState(() => result(element), (nextLayout) => {
                        this.updateElement(element, check(nextLayout), namespace);
                    }, element, ROOT, element);
                } else {
                    this.updateElement(element, check(this.juris.definitionLayout(result, previewInstance)), namespace);
                }
            });
        });
        if (!this.firstDraw(previewInstance, element, draw, options)) this.attachInstance(element, previewInstance, true);
        if (previewInstance.mounts?.length) this.pendingMounts.push(previewInstance);
    }

    // Properties, then children — except `value` on a <select>, which can only take a value its options
    // already offer, so it is applied (or bound) once the children are in place. `between` runs after the
    // properties and before the children (enhance uses it to adopt server keys).
    // What goes inside is drawn in the element's own namespace (childNamespaceOf), asked once its
    // properties are on it: an annotation-xml's `encoding` says whether it holds HTML. A void element
    // holds nothing (isVoid): its children are not drawn, nor its text (applyProperties).
    // What an element holds is one thing (heldBy): its text or markup, an <output>'s or a <textarea>'s
    // value, or its children, as the server writes it. What else the layout gives for it is left out
    // (named in devMode): the children beside the others, and a value beside the text.
    applyPropertiesAndChildren(element, content, reconcile, between = null) {
        const holder = this.heldBy(element, content);
        const deferValue = element.localName === "select" && "value" in content;
        const valueLeftOut = holder !== "children"
            && holder !== "value"
            && "value" in content
            && this.valueIsText(element);
        this.applyProperties(element, content, deferValue || valueLeftOut ? "value" : undefined);
        between?.();
        if (this.isVoid(element)) return;
        if (this.devMode && valueLeftOut) this.leftOut(element, "value", content.value, holder);
        const namespace = this.childNamespaceOf(element);
        if (deferValue) {
            this.applySelectChildren(element, content, holder, namespace, reconcile);
            return;
        }
        if (holder === "children") {
            this.renderChildren(element, content.children, namespace, reconcile, null);
        } else if (this.devMode && content.children !== null && content.children !== undefined) {
            this.leftOut(element, "children", content.children, holder);
        }
    }

    // A <select> given a value: its children, then its value. Its options can be rebuilt without its
    // `value` changing (an unkeyed list whose length changed is replaced wholesale), and the browser
    // drops the selection when the selected <option> node goes. The value binding does not re-run (its
    // own dependency did not change), so re-assert the last value it produced after every
    // children pass. If that option really is gone the assign is a no-op, which is the truthful
    // outcome: nothing can select what no longer exists.
    applySelectChildren(element, content, holder, namespace, reconcile) {
        let reassert = null;
        if (holder === "children") {
            this.renderChildren(element, content.children, namespace, reconcile, () => reassert?.());
        } else if (this.devMode && content.children !== null && content.children !== undefined) {
            this.leftOut(element, "children", content.children, holder);
        }
        let applied;
        this.bindProperty(element, content.value, (value) => {
            applied = value;
            this.applyValueProperty(element, value);
        }, "value");
        reassert = () => this.applyValueProperty(element, applied);
    }

    // The key whose content `element` holds of what `content` gives (REFERENCE.md, "Components and
    // layouts"): `textContent`, or an `innerHTML` allowed here, the later of the two; else an <output>'s
    // or a <textarea>'s `value`; else `children`. The keys decide it, whatever their values, so a
    // function in one of them never takes the others in and out, and their order does not matter.
    heldBy(element, content) {
        let held = "children";
        for (const k in content) {
            if (k === "textContent" || (k === "innerHTML" && this.innerHTMLCheck().ok)) held = k;
        }
        if (held === "children" && "value" in content && this.valueIsText(element)) return "value";
        return held;
    }

    // Whether `element`'s value is state of its own, the user's to change: an HTML <input>'s,
    // <textarea>'s or <select>'s (its attribute, where it has one, is only the default).
    ownsValue(element) {
        return this.namespaceOf(element) === null && OWN_VALUE.has(element.localName);
    }

    // Whether `element`'s value is the text it holds: an HTML <output>'s or <textarea>'s.
    valueIsText(element) {
        if (this.namespaceOf(element) !== null) return false;
        return element.localName === "output" || element.localName === "textarea";
    }

    // devMode's word for what an element's content leaves out (applyPropertiesAndChildren): `key` is
    // the children or the value beside what it holds, `holder` the key it holds.
    leftOut(element, key, value, holder) {
        const reason = `${key}: <${element.localName}> holds its ${holder}, and nothing beside it`;
        this.juris.refused(null, reason, { name: key, value, node: element, component: this.owner });
    }

    // Whether `indeterminate` on `element` is its property alone: an HTML <input>'s. HTML has no such
    // attribute, so it is never written, and the server writes nothing for it.
    hasIndeterminate(element) {
        return this.namespaceOf(element) === null && element.localName === "input";
    }

    applyProperties(element, properties, skip = undefined) {
        this.appliedProps.set(element, properties); // remembered for clearStaleProperties on a later reuse
        // `class` and `className` are one attribute: the later of the two is it (baseKey), and the
        // earlier is never used. It goes first, with a classList drawn alongside it (applyClasses), so
        // the class attribute is the element's first, as it always was. The server draws the three by
        // the same rule, whatever their order, so the first client render is the server's HTML.
        // The own keys (Object.keys' keys) are walked twice, the base on the first pass, and no list
        // of them is made: every element draws through here.
        let baseKey;
        for (const k in properties) {
            if ((k === "class" || k === "className") && Object.hasOwn(properties, k)) baseKey = k;
        }
        if (baseKey !== undefined) this.applyProperty(element, properties, baseKey, baseKey, skip);
        for (const k in properties) {
            if (k === "class" || k === "className" || !Object.hasOwn(properties, k)) continue;
            this.applyProperty(element, properties, k, baseKey, skip);
        }
    }

    // One key of a layout's content, drawn on `element` (applyProperties). A value that is not a
    // function is drawn at once: no binding, and no closure made to draw it.
    applyProperty(element, properties, k, baseKey, skip) {
        const propertyValue = properties[k];
        const bound = typeof propertyValue === "function";
        if (k === "key" || k === "children" || k === skip) {
            return;
        } else if (k === "class" || k === "className") {
            if ("classList" in properties) {
                this.applyClasses(element, properties, k);
            } else if (bound) {
                this.bindAttribute(element, "class", propertyValue, k);
            } else {
                this.applyAttribute(element, "class", propertyValue);
            }
        } else if (k === "classList") {
            if (baseKey === undefined) this.applyClasses(element, properties, undefined);
        } else if (k === "innerHTML" || k === "textContent") {
            if (k === "innerHTML" && this.noHtml > 0) {
                throw new Error("Juris.enhance: innerHTML is not allowed inside an enhanced element"
                    + " (use textContent, or pass { allowHtml: true })");
            }
            if (k === "innerHTML") {
                // Refused is left out whole, as on the server: nothing is bound, nothing written.
                const check = this.innerHTMLCheck();
                if (!check.ok) {
                    if (this.devMode) {
                        const detail = { name: k, value: propertyValue, node: element, component: this.owner };
                        this.juris.refused(check.rule, check.reason, detail);
                    }
                    return;
                }
            }
            if (this.isVoid(element)) return; // holds no text and no markup, as the server writes none
            // A <template>'s text goes in its content (contentOf), as the parser puts it; its innerHTML does already.
            const holder = k === "textContent" ? this.contentOf(element) : element;
            if (bound) {
                this.bindText(element, k, properties, holder, propertyValue);
            } else {
                this.applyText(element, k, properties, holder, propertyValue);
            }
        } else if (k === "style") {
            if (bound) this.bindStyle(element, propertyValue);
            else this.drawStyle(element, propertyValue);
        } else if (bound && k.startsWith("on")) {
            this.listen(element, eventNameOf(k), propertyValue);
        } else if (this.isBooleanAttribute(element, k)) {
            if (bound) this.bindBooleanAttribute(element, k, propertyValue);
            else this.applyBooleanAttribute(element, k, propertyValue);
        } else if (k === "indeterminate" && this.hasIndeterminate(element)) {
            if (bound) this.bindIndeterminate(element, propertyValue);
            else element.indeterminate = Boolean(propertyValue);
        } else if (k === "value" && "value" in element && element.namespaceURI !== NAMESPACES.svg) {
            if (bound) this.bindValue(element, propertyValue);
            else this.applyValueProperty(element, propertyValue);
        } else {
            const name = ATTRIBUTE_ALIASES[k] || k;
            if (bound) this.bindAttribute(element, name, propertyValue, k);
            else this.applyAttribute(element, name, propertyValue);
        }
    }

    // A function given for one key, bound (bindProperty): each makes the closure its binding draws
    // with, here rather than in applyProperty, which then makes none for the keys that are not bound.
    bindAttribute(element, name, propertyValue, key) {
        this.bindProperty(element, propertyValue, (value) => this.applyAttribute(element, name, value), key);
    }

    bindText(element, k, properties, holder, propertyValue) {
        this.bindProperty(element, propertyValue, (value) => this.applyText(element, k, properties, holder, value), k);
    }

    bindStyle(element, propertyValue) {
        this.bindProperty(element, propertyValue, (value) => this.drawStyle(element, value), "style");
    }

    bindBooleanAttribute(element, k, propertyValue) {
        this.bindProperty(element, propertyValue, (value) => this.applyBooleanAttribute(element, k, value), k);
    }

    bindIndeterminate(element, propertyValue) {
        this.bindProperty(element, propertyValue, (value) => {
            element.indeterminate = Boolean(value);
        }, "indeterminate");
    }

    bindValue(element, propertyValue) {
        this.bindProperty(element, propertyValue, (value) => this.applyValueProperty(element, value), "value");
    }

    // A listener, taken off when the element's bindings go (disposeElement).
    listen(element, eventName, listener) {
        element.addEventListener(eventName, listener);
        this.addDisposer(element, () => element.removeEventListener(eventName, listener));
    }

    // Text or markup drawn into `holder` (applyProperty's textContent and innerHTML). Text is as a text
    // layout is (Juris textOf): null, undefined, true and false are nothing.
    applyText(element, k, properties, holder, value) {
        if (this.rejectLayout(value, k, properties, element)) return;
        const text = this.textOf(value);
        // The same text is left where it is. Writing it replaces the text node, and the
        // browser lays out again a row that did not change, in every row of a list.
        if (k === "textContent" && this.holdsOnly(holder, text)) this.textKept = holder.firstChild;
        else holder[k] = text;
    }

    // A style drawn from the style applied before it, by its binding or by the layout an element
    // reused for this one had: a key it no longer gives is taken off, as the server leaves it out.
    drawStyle(element, value) {
        this.applyStyle(element, value ?? {}, this.appliedStyles.get(element));
        this.appliedStyles.set(element, value);
    }

    // ---- layout helpers ---------------------------------------------------------

    getLongestIncreasingSubsequence(values) {
        const predecessors = values.slice();
        const tails = [];

        for (let index = 0; index < values.length; index += 1) {
            const value = values[index];
            if (value === 0) continue;

            let start = 0;
            let end = tails.length;
            while (start < end) {
                const middle = (start + end) >> 1;
                if (values[tails[middle]] < value) start = middle + 1;
                else end = middle;
            }

            if (start > 0) predecessors[index] = tails[start - 1];
            tails[start] = index;
        }

        let length = tails.length;
        const sequence = Array(length);
        let index = tails[length - 1];
        while (length > 0) {
            length -= 1;
            sequence[length] = index;
            index = predecessors[index];
        }

        return sequence;
    }

    // ---- rendering ----------------------------------------------------------------

    reconcileChildren(parent, childLayouts, namespace) {
        const layouts = childLayouts === null || childLayouts === undefined ? [] : Array.isArray(childLayouts) ? childLayouts : [childLayouts];
        const count = layouts.length;
        // Each layout's key, read once; the keys are used when every layout has one, and no two the same.
        const keys = new Array(count);
        const seen = new Set();
        let hasUniqueKeys = true;
        for (let index = 0; index < count; index += 1) {
            const key = this.getKey(layouts[index]);
            keys[index] = key;
            if (!hasUniqueKeys) continue;
            if (key === undefined || seen.has(key)) hasUniqueKeys = false;
            else seen.add(key);
        }

        if (!hasUniqueKeys) {
            if (this.devMode) this.keysUnused(parent, keys);
            const existingNodes = Array.from(parent.childNodes);
            const canPatch = existingNodes.length === layouts.length && layouts.every((layout, index) => this.canPatchNode(existingNodes[index], layout));
            if (canPatch) {
                layouts.forEach((layout, index) => {
                    const node = existingNodes[index];
                    if (this.isSeatLayout(layout)) {
                        this.updateSlot(node, layout, namespace);
                    } else if (node.nodeType === Node.TEXT_NODE) {
                        const text = this.textOf(layout);
                        if (node.nodeValue !== text) node.nodeValue = text;
                    } else if (!this.isUnchangedComponent(node, layout)) {
                        this.redraw(node, layout, namespace);
                    }
                });
                return;
            }
            // Every node goes, whichever one's disposal throws, and is off before that error is
            // thrown (runEvery); nothing new is drawn then.
            try {
                runEvery(existingNodes, (child) => this.disposeTree(child));
            } finally {
                while (parent.firstChild) parent.removeChild(parent.firstChild); // (replaceChildren needs Safari 14)
            }
            this.appendChildren(parent, layouts, namespace);
            return;
        }

        // Keyed mode tracks the nodes that carry a key: elements, and the text node a keyed component
        // renders when its root is not an element (null, text; mountRoot keys it). Stray unkeyed
        // nodes left by an earlier unkeyed pass go. Such a component used to go with them, and was
        // drawn anew, its local state lost, on every reconcile.
        // (Every one goes whichever one's disposal throws, as below: removeDisposed.) A list holds none
        // most of the time, so it is looked for before any list of the nodes is made.
        let stray = false;
        for (let node = parent.firstChild; node !== null && !stray; node = node.nextSibling) {
            stray = node.nodeType !== Node.ELEMENT_NODE && !this.elementKeys.has(node);
        }
        if (stray) {
            runEvery(Array.from(parent.childNodes), (node) => {
                if (node.nodeType !== Node.ELEMENT_NODE && !this.elementKeys.has(node)) this.removeDisposed(node);
            });
        }

        const existingElements = Array.from(parent.childNodes);
        const existingCount = existingElements.length;
        // A later element with the same key takes the place of an earlier one, as `new Map(pairs)` does.
        // An empty list keeps none of them, so for it (a list cleared) no index is made.
        const oldIndexByKey = new Map();
        if (count !== 0) {
            for (let index = 0; index < existingCount; index += 1) {
                oldIndexByKey.set(this.elementKeys.get(existingElements[index]), index);
            }
        }
        if (this.serverRows.delete(parent)) this.claimServerRows(existingElements, oldIndexByKey, keys);
        // An element is kept for the layout with its key only when that layout draws the same tag, or
        // names a component (which takes the element over): fitsKept.
        // nextElements: for each layout, the index of the element it keeps, or -1 for a new one.
        // inOrder: the elements kept stand in the order they stood in, so every one of them stays
        // where it is, as the longest increasing subsequence would find (it is all of them).
        const nextElements = new Array(count);
        const keptOld = new Uint8Array(existingCount);
        let keptCount = 0;
        let inOrder = true;
        let lastKept = -1;
        for (let index = 0; index < count; index += 1) {
            const oldIndex = oldIndexByKey.get(keys[index]) ?? -1;
            const kept = oldIndex !== -1 && this.fitsKept(existingElements[oldIndex], layouts[index]);
            nextElements[index] = kept ? oldIndex : -1;
            if (!kept) continue;
            keptOld[oldIndex] = 1;
            keptCount += 1;
            if (oldIndex < lastKept) inOrder = false;
            lastKept = oldIndex;
        }

        if (keptCount === 0) {
            // None stays: every one goes in one step, as the page would, rather than one at a time.
            if (existingCount !== 0) {
                try {
                    this.disposeEach(existingElements);
                } finally {
                    parent.textContent = "";
                }
            }
        } else if (keptCount !== existingCount) {
            let failures = null;
            for (let index = 0; index < existingCount; index += 1) {
                if (keptOld[index] === 1) continue;
                try {
                    this.removeDisposed(existingElements[index]);
                } catch (error) {
                    (failures ??= []).push(error);
                }
            }
            if (failures) throw failures[0];
        }

        // The layouts whose elements stay where they are: every kept one when they kept their order,
        // else the longest run of them that did.
        let stableIndexes = null;
        if (!inOrder) {
            const sequence = this.getLongestIncreasingSubsequence(nextElements.map((index) => index + 1));
            stableIndexes = new Set(sequence);
        }
        // Create and update in layout order, so components come to life in the same order the server
        // rendered them (local-state slots are numbered by creation order); then place them walking
        // backwards, where the element settled in the previous iteration is always the correct next sibling.
        // A pass that throws places nothing: every row it made by then is never inserted, so it is
        // disposed (cleanups run, out of devMode's tree) before the error goes on; a row already in
        // place stays as it was.
        const elements = [];
        try {
            for (let index = 0; index < count; index += 1) {
                const layout = layouts[index];
                let element = nextElements[index] === -1 ? null : existingElements[nextElements[index]];
                if (!element) element = this.createElement(layout, namespace);
                else if (!this.isUnchangedComponent(element, layout)) element = this.redraw(element, layout, namespace);
                elements.push(element);
            }
        } catch (error) {
            undo(() => runEvery(elements.keys(), (index) => { if (nextElements[index] === -1) this.disposeTree(elements[index]); }));
            throw error;
        }
        let anchor = null;
        for (let index = count - 1; index >= 0; index -= 1) {
            const element = elements[index];
            const stays = nextElements[index] !== -1 && (stableIndexes === null || stableIndexes.has(index));
            if (!stays) parent.insertBefore(element, anchor);
            anchor = element;
        }
    }

    // Whether the element kept for a key can take `layout`. It is kept only when that layout draws the
    // same tag, or names a component (which takes the element over). An element is never given another
    // tag, so a key that moved from <i> to <b> used to keep the <i>, where a fresh draw drew a <b>: such
    // a layout is drawn anew, and the old element goes with the ones whose key went. The element must
    // also be one the renderers would draw (reusableElement): server markup holding an <iframe> is
    // never handed a layout's attributes. A keyed node that is not an element is a component's root,
    // and is kept only for a component.
    fitsKept(element, layout) {
        const tag = this.layoutTag(layout);
        if (this.componentManager.has(tag)) return true;
        return element.nodeType === Node.ELEMENT_NODE && reusableElement(element.localName, tag, this.allowTags);
    }

    // devMode's word for a list that has keys and cannot use them: one row with no key, or one key on
    // two rows, and every row goes back to matching by place (reconcileChildren), with nothing to say
    // so. A list with no keys at all is matched by place on purpose. `parent` is what holds the rows,
    // an element, or a <template>'s content (contentOf).
    keysUnused(parent, keys) {
        if (keys.every((key) => key === undefined)) return;
        const missing = keys.indexOf(undefined);
        const repeated = missing === -1 ? firstRepeated(keys) : undefined;
        const named = typeof repeated === "string" ? `"${repeated}"` : String(repeated);
        const fault = missing === -1 ? `key ${named} is on two rows` : `row ${missing + 1} has no key`;
        const reason = `the keys of the list in <${parent.localName ?? "template"}>: ${fault},`
            + " so every row is matched by place, and a row's element and state stay with its place, not its item."
            + " Give every row a key of its own";
        this.juris.refused("keyed-list", reason, { name: "key", value: repeated, node: parent, component: this.owner });
    }

    // Disposes `node` and takes it out of the document, whatever its disposal throws (which is then
    // thrown, once it is out).
    removeDisposed(node) {
        try {
            this.disposeTree(node);
        } finally {
            node.remove();
        }
    }

    // Draws `layout` into `node`, kept in its place by a reconcile: the components that drew it go
    // first (their cleanups before a re-invoked one's setup), inside the draw, and if a cleanup or
    // the draw throws, what they drew is taken off the node (emptyDrawn): it never shows a
    // component that is gone.
    redraw(node, layout, namespace) {
        const inner = this.takeInnerInstances(node);
        const watch = this.enhanced.get(node);
        this.enhanced.delete(node);
        try {
            this.disposeAll(inner);
            const element = this.updateElement(node, layout, namespace);
            this.enhanceRedrawn(element, node, watch);
            return element;
        } catch (error) {
            if (watch) this.letGo(watch, node);
            if (inner.length) this.emptyDrawnQuietly(node);
            throw error;
        }
    }

    // What enhance() gave `node` went with the rest of it (redraw): its bindings and its instance. The
    // element it is now takes it again, so a marker that names something else is read afresh: a
    // design swapped for another reuses its elements. Left alone, the element stayed marked enhanced
    // with nothing on it, and neither the observer (it watches nodes, not attributes) nor the handle
    // could tell. One that no longer matches is let go; one that has come to match is taken by the
    // first enhancement that observes it, as one added later would be.
    enhanceRedrawn(element, node, watch) {
        const stays = watch !== undefined && element === node && this.matchesWatch(element, watch);
        if (stays) {
            this.enhanceElement(element, watch);
            return;
        }
        if (watch) this.letGo(watch, node);
        for (const other of this.watching) {
            if (!other.options.force || !this.matchesWatch(element, other) || !this.isWithin(element, other.within)) continue;
            this.enhanceElement(element, other);
            other.elements.push(element);
            return;
        }
    }

    matchesWatch(element, watch) {
        return watch.selector === null || (element.nodeType === Node.ELEMENT_NODE && element.matches(watch.selector));
    }

    isWithin(element, within) {
        if (within === document) return element.isConnected;
        for (let node = element; node; node = node.parentNode) {
            if (node === within) return true;
        }
        return false;
    }

    letGo(watch, element) {
        const index = watch.elements.indexOf(element);
        if (index !== -1) watch.elements.splice(index, 1);
    }

    // Re-applies a fresh layout to a retained keyed element: old bindings/listeners are dropped first
    // so closures over stale data are replaced and nothing accumulates.
    // Returns the element that now represents `layout` (a component may swap its root).
    // `namespace` is the one the element was drawn in, for a component that takes it over; what goes
    // inside the element is drawn in the element's own (childNamespaceOf).
    updateElement(element, layout, namespace) {
        const tag = this.layoutTag(layout);
        const rawContent = layout[tag];
        if (this.componentManager.has(tag)) {
            return this.createComponent(layout, namespace, element);
        }
        const content = this.normalizeContent(rawContent);
        this.disposeElement(element);
        // What the element holds now (heldBy): its text or markup, a value, or its children.
        const holder = this.heldBy(element, content);
        const holdsText = holder === "textContent" || holder === "innerHTML";
        // What it held inside, when the new layout puts nothing in its place (F27): the children pass
        // reconciles only children that are given, so `{ span: {} }`, `children: null` or a refused
        // innerHTML in the place of a span that held some would keep them, and so would an <output>'s
        // or a <textarea>'s value. Read before clearStaleProperties, which works from the same record.
        const previous = this.appliedProps.get(element);
        const heldBefore = previous !== undefined
            && (this.namesInner(previous) || ("value" in previous && this.valueIsText(element)));
        const childrenGiven = holder === "children" && content.children !== null && content.children !== undefined;
        if (heldBefore && !holdsText && !childrenGiven) {
            this.removeEach(Array.from(this.contentOf(element).childNodes));
        }
        // The element is being reused for a DIFFERENT layout (a route swap that keeps the same <main>,
        // say). applyProperties only walks the new layout's keys, so anything the old layout set and
        // the new one does not mention would simply stay. Clear those first.
        this.clearStaleProperties(element, content);
        // textContent/innerHTML replace the child nodes wholesale; their bindings must not outlive them.
        // Disposed now, they are taken off once the draw is done, so the element never shows what is
        // gone: the text took their place, or nothing did (a layout given as the text, refused, or a
        // draw that threw).
        const replaced = holdsText ? Array.from(this.contentOf(element).childNodes) : NONE;
        this.textKept = null;
        try {
            this.disposeEach(replaced);
            this.applyPropertiesAndChildren(element, content, true);
        } finally {
            for (let index = 0; index < replaced.length; index += 1) {
                if (replaced[index] !== this.textKept) replaced[index].remove();
            }
        }
        return element;
    }

    // Whether layout content names what an element holds inside (INNER), as INNER.some would find.
    namesInner(content) {
        for (let index = 0; index < INNER.length; index += 1) {
            if (INNER[index] in content) return true;
        }
        return false;
    }

    // Whether `holder` holds `text` and nothing else, as one text node.
    holdsOnly(holder, text) {
        const node = holder.firstChild;
        return node !== null
            && node === holder.lastChild
            && node.nodeType === Node.TEXT_NODE
            && node.nodeValue === text;
    }

    // Remove what the previous layout applied to `element` and the next one leaves out. Listeners
    // are already gone (disposeElement); children and text are the children pass's business; a
    // form control's value is state, not styling, and is left alone (ownsValue), where any other
    // element's `value` is an attribute, taken off (an <output>'s is its text: updateElement). A
    // classList the next layout gives too still loses the names only the previous one gave, as the
    // server writes the next one's alone; a style the next layout gives starts from the one before it
    // (applyProperties), and loses its keys the same way. An element Juris did not render into
    // before (server HTML on first hydration) has no record and nothing is touched.
    clearStaleProperties(element, content) {
        const previous = this.appliedProps.get(element);
        if (!previous) return;
        for (const k in previous) {
            if (k in content && k !== "classList") continue;
            if (k === "key" || k === "children" || k === "textContent" || k === "innerHTML") continue;
            if (k === "value" && this.ownsValue(element)) continue;
            if (k.startsWith("on") && typeof previous[k] === "function") continue;
            if (k === "style") { element.removeAttribute("style"); this.appliedStyles.delete(element); continue; }
            if (k === "class" || k === "className") {
                if (!("class" in content) && !("className" in content)) element.removeAttribute("class");
                continue;
            }
            if (k === "classList") {
                const kept = new Set();
                for (const className in content.classList ?? {}) for (const token of classTokens(className)) kept.add(token);
                if (typeof previous.classList === "function") {
                    // A function's names are the ones its last run turned on (bindClassList).
                    const record = this.classRecords.get(element);
                    for (const [token, on] of new Map(record ? this.classDecisions(record) : NONE)) {
                        if (on && !kept.has(token)) element.classList.remove(token);
                    }
                } else {
                    for (const className in previous.classList) {
                        for (const token of classTokens(className)) if (!kept.has(token)) element.classList.remove(token);
                    }
                }
                this.classRecords.delete(element);
                continue;
            }
            if (this.isBooleanAttribute(element, k)) { this.applyBooleanAttribute(element, k, false); continue; }
            if (k === "indeterminate" && this.hasIndeterminate(element)) {
                element.indeterminate = false;
                continue;
            }
            const name = ATTRIBUTE_ALIASES[k] || k;
            if (checkAttribute(name, null).ok) element.removeAttribute(name);
        }
    }

    // Can `node` be updated in place to represent `layout` (unkeyed, positional reconcile)?
    canPatchNode(node, layout) {
        if (this.isSeatLayout(layout)) return this.slots.has(node);
        if (this.isTextLayout(layout)) return node.nodeType === Node.TEXT_NODE;
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        const tag = this.layoutTag(layout);
        if (this.componentManager.has(tag)) return Boolean(this.findInstance(node, tag));
        return reusableElement(node.localName, tag, this.allowTags);
    }

    // ---- components ---------------------------------------------------------------

    // A retained node whose outermost component is the one `layout` names, with shallow-equal props,
    // needs no work: its own bindings keep it current. Fresh functions or objects in props never compare
    // equal, so components taking callbacks simply fall back to being re-invoked.
    isUnchangedComponent(node, layout) {
        if (this.isTextLayout(layout) || this.isSeatLayout(layout)) return false;
        const tag = this.layoutTag(layout);
        const content = layout[tag];
        const instances = this.componentInstances.get(node);
        const instance = instances ? instances[instances.length - 1] : undefined; // (Array.prototype.at needs Safari 15.4)
        if (!instance || instance.name !== tag) return false;
        const previous = instance.props;
        const next = this.normalizeContent(content);
        // The same own keys, as many of them (Object.keys' lengths), each holding the same prop.
        if (ownKeyCount(next) !== ownKeyCount(previous)) return false;
        for (const key in next) {
            if (!Object.hasOwn(next, key)) continue;
            if (!(key in previous) || !this.sameProp(previous[key], next[key])) return false;
        }
        return true;
    }

    // One prop, unchanged: the same value, or a ref to the same path with the same default.
    sameProp(a, b) {
        if (Object.is(a, b)) return true;
        return this.isRef(a) && this.isRef(b) && a.path === b.path && Object.is(a.defaultValue, b.defaultValue);
    }

    canReuseRoot(currentRoot, layout) {
        if (!currentRoot || currentRoot.nodeType !== Node.ELEMENT_NODE || this.isTextLayout(layout) || this.isSeatLayout(layout)) return false;
        const tag = this.layoutTag(layout);
        if (this.componentManager.has(tag)) return false;
        return reusableElement(currentRoot.localName, tag, this.allowTags);
    }

    // Makes `layout` the root of `instance` (see mountNode). Instances on a node are ordered innermost-first:
    // the ones created while mounting go in front, then `instance`, then the outer instances it was carrying.
    mountRoot(currentRoot, layout, namespace, key, instance) {
        let carried = [];
        let seat = null;
        let inner = NONE;
        if (currentRoot) {
            inner = this.takeInnerInstances(currentRoot, instance);
            carried = this.componentInstances.get(currentRoot) ?? [];
            this.componentInstances.delete(currentRoot); // lifted off before the node is reused or disposed
            // If this root is also a seat's node, lift the seat off too: replacing the node disposed it,
            // so the seat stopped re-running and the component seated in it was never cleaned up.
            seat = this.slots.get(currentRoot) ?? null;
            if (seat) this.slots.delete(currentRoot);
        }
        const added = !carried.includes(instance);
        if (added) carried.unshift(instance);
        let root;
        try {
            this.disposeAll(inner); // inside the draw: a cleanup that throws is a failed draw
            root = this.mountNode(currentRoot, this.withKey(layout, key), namespace);
        } catch (error) {
            // A draw that throws leaves the node where it was (drawn into in place, or kept, the node
            // that would have replaced it disposed by createElement): what it carried goes back on it,
            // and its seat, so the instances, alive with their bindings, are disposed with it later.
            // What the draw made inside it is there too, and goes the same way. The instance this
            // draw brought is not put on it: an abandoned first draw disposes it (createComponent).
            if (added) carried.shift();
            if (carried.length) this.componentInstances.set(currentRoot, carried);
            if (seat) this.slots.set(currentRoot, seat);
            // The components that shared the root were disposed before the draw, as they must be:
            // a component re-invoked into it needs the old one's cleanups run before its own setup
            // (the local-state slot it takes over, a path it computes again). What they drew is
            // taken off the node kept (emptyDrawn), so it never shows a component that is gone.
            if (inner.length) this.emptyDrawnQuietly(currentRoot);
            throw error;
        }
        // An enhanced element replaced (by a fallback of another tag): what stands in its place is
        // enhanced in its stead, and holds the instances that move to it below. unenhance, given
        // either, reaches them (standInFor), and observe neither unenhances the stand-in when the
        // element leaves nor enhances it again as it comes.
        if (currentRoot && root !== currentRoot && this.enhanced.has(currentRoot)) {
            const watch = this.enhanced.get(currentRoot);
            this.enhanced.delete(currentRoot);
            this.enhanced.set(root, watch);
            this.standIns.set(currentRoot, root);
        }
        // An element root carries the key in its layout (withKey); a root that is not an element
        // (null, text) has no layout to carry it, so it is keyed here, and a keyed list keeps it.
        if (key !== undefined && root.nodeType !== Node.ELEMENT_NODE) this.elementKeys.set(root, key);
        if (seat) { this.slots.set(root, seat); seat.setNode?.(root); }
        // The root's instances: what the draw put on it, then what this one carried. When the draw put
        // none, the carried list is that list, as no one else holds it now.
        const drawn = this.componentInstances.get(root);
        this.componentInstances.set(root, drawn === undefined ? carried : [...drawn, ...carried]);
        // Every instance sharing this root moves with it — an outer instance (a RouterView whose child swapped
        // its root) must not keep a detached node as its root, or its next render lands off-document.
        for (let index = 0; index < carried.length; index += 1) carried[index].root = root;
        this.recordLocalSlot(root, instance);
        return root;
    }

    createComponent(layout, namespace, existingRoot = null) {
        const name = this.layoutTag(layout);
        const props = this.normalizeContent(layout[name]);
        const instance = {
            name,
            props,
            cleanups: [],
            disposeBinding: NOTHING,
            parent: this.owner,
            mounting: true,
            namespace,
        };
        // Which $local numbering this instance counts in. A component the server never rendered
        // (ssr: false) opens its own, because the server's counters never saw anything inside it —
        // see Juris.localScopeFor.
        instance.localScope = this.juris.localScopeFor(name, this.owner);
        // Re-invocation into the same root: the outgoing instance (if still attached) goes first, so its
        // computeds and cleanups are gone before the new definition registers its own, and the root's
        // local-state slot for this component name is handed to the new instance instead of deleted.
        if (existingRoot) {
            const previous = this.findInstance(existingRoot, name);
            if (previous) this.disposeInstance(previous);
            const recorded = this.localSlots.get(existingRoot)?.[name];
            if (recorded && recorded.key === props.key) instance.local = recorded.slot; // same component, same key: same state
        }
        this.componentManager.track(instance);

        // instance.root is the single source of truth for the root node: a fallback swap (showFallback)
        // replaces it, and the root binding must continue from the replacement, not from a stale closure.
        instance.root = existingRoot;
        try {
            try {
                // withOwner, written out: the definition runs and its root is drawn with the instance
                // as the owner (drawComponent), and no closure is made for it.
                const previousOwner = this.owner;
                this.owner = instance;
                try {
                    this.drawComponent(instance, namespace);
                } finally {
                    this.owner = previousOwner;
                }
            } catch (error) {
                // Own fallback (decided by a boundary further in, or by this instance's handler): mount it here.
                let fallback = error instanceof FallbackSignal && error.boundary === instance ? error.layout : undefined;
                if (fallback === undefined && !(error instanceof FallbackSignal)) {
                    const handled = this.juris.resolveError(instance, error, { phase: "setup", component: name });
                    if (!handled) throw error;
                    if (handled.boundary !== instance && handled.layout) throw new FallbackSignal(handled.boundary, handled.layout, error);
                    fallback = handled.layout; // undefined: swallowed, the component renders nothing
                } else if (fallback === undefined) {
                    throw error; // a signal for a boundary further out
                }
                instance.disposeBinding();
                instance.disposeBinding = NOTHING;
                instance.root = this.mountFallback(instance, fallback, namespace);
            }
        } catch (error) {
            // Whatever escapes the draw abandons it: a signal for a boundary further out, whose
            // fallback replaces this instance, or an error no boundary took, which goes on to the
            // caller as it came. What the draw left in a node that was already there goes
            // (disposeDrawn; one it made was disposed as it was abandoned, createElement), then the
            // instance: innermost first, cleanups run, out of devMode's tree.
            this.abandonInstance(instance);
            throw error;
        }
        instance.mounting = false;
        if (instance.mounts?.length) this.pendingMounts.push(instance);
        return instance.root;
    }

    // A component's definition run, and what it answers drawn as its root (createComponent), with the
    // instance as the owner.
    drawComponent(instance, namespace) {
        const { name, props } = instance;
        const result = this.invokeDefinition(instance, this.devMode ? this.watchGetterProps(name, props) : props);
        if (typeof result === "function") {
            // A root function whose value is a function too is bound one level down (bindChain),
            // drawing through mountRoot, so the instance keeps its root and its own binding.
            instance.disposeBinding = this.bindChain(
                result,
                () => instance.root,
                (nextLayout) => {
                    instance.root = this.mountRoot(instance.root, nextLayout, namespace, props.key, instance);
                },
                () => instance.root?.parentNode,
                ROOT,
            );
            // The first value is still loading.
            if (!instance.root) instance.root = this.mountRoot(null, undefined, namespace, props.key, instance);
        } else {
            const layout = this.juris.definitionLayout(result, instance);
            instance.root = this.mountRoot(instance.root, layout, namespace, props.key, instance);
        }
    }

    // The fallback a component's own setup decided, drawn as its root with the instance as the owner.
    mountFallback(instance, fallback, namespace) {
        const previousOwner = this.owner;
        this.owner = instance;
        try {
            return this.mountRoot(instance.root, fallback, namespace, instance.props.key, instance);
        } finally {
            this.owner = previousOwner;
        }
    }

    // Static children are appended (or reconciled against what is there when `reconcile` is set);
    // a function is a reactive list bound to the element.
    renderChildren(element, children, namespace, reconcile = false, afterApply = null) {
        const parent = this.contentOf(element);
        if (typeof children === "function") {
            this.bindChildren(element, parent, children, namespace, afterApply);
        } else if (children !== null && children !== undefined) {
            if (reconcile) this.reconcileChildren(parent, children, namespace);
            else this.appendChildren(parent, children, namespace);
        }
    }

    // A function as children: a reactive list, reconciled into `parent` whenever it runs again.
    bindChildren(element, parent, children, namespace, afterApply) {
        this.addDisposer(
            element,
            this.bindState(
                () => children(element),
                (layouts) => {
                    this.reconcileChildren(parent, layouts, namespace);
                    afterApply?.();
                },
                () => element,
                "children",
            ),
        );
    }

    // Each of `children` drawn and appended to `parent`, as render() draws one. Inside an operation
    // already under way (render, mount, enhance, a binding's run: depth above 0), render's own enter
    // would only count up and down again, so the child is drawn and appended directly, with no closure
    // made for each.
    appendChildren(parent, children, namespace) {
        if (this.depth === 0) {
            for (const child of Array.isArray(children) ? children : [children]) this.render(parent, child, namespace);
            return;
        }
        if (!Array.isArray(children)) {
            parent.appendChild(this.createElement(children, namespace));
            return;
        }
        for (let index = 0; index < children.length; index += 1) {
            parent.appendChild(this.createElement(children[index], namespace));
        }
    }

    namespaceOf(element) {
        return element.namespaceURI === "http://www.w3.org/1999/xhtml" ? null : element.namespaceURI;
    }

    // Whether `name` (in any case) is a boolean attribute on `element` (BOOLEAN_ATTRIBUTES): on an
    // HTML element only.
    isBooleanAttribute(element, name) {
        return this.namespaceOf(element) === null && BOOLEAN_ATTRIBUTES.has(lowerName(name));
    }

    // The namespace an element that is already there was drawn in, as the parser drew it: the one its
    // parent holds (childNamespaceOf), or its own when it has no parent. An instance adopting it
    // records this as its `namespace`, as createComponent's does, so a fallback that takes its place
    // (showFallback, firstDraw) is drawn in it: an SVG element's fallback is SVG.
    drawnInOf(element) {
        return element.parentNode ? this.childNamespaceOf(element.parentNode) : this.namespaceOf(element);
    }

    // Whether `element` is one of HTML's void elements (VOID_ELEMENTS), which hold nothing. Inside
    // <svg> or <math> a <br> or an <img> is an element like any other.
    isVoid(element) {
        return this.namespaceOf(element) === null && VOID_ELEMENTS.has(element.localName);
    }

    // Where what is drawn inside `element` goes: the element itself, but for an HTML <template>, its
    // content. The parser puts what is inside a <template> there (a fragment, inert: nothing in it is
    // rendered, run or loaded), so that is where the server's markup has it; appended to the element,
    // it was drawn on the page. Every path that draws inside an element, or empties or disposes what
    // is there, asks this.
    contentOf(element) {
        return element.localName === "template" && this.namespaceOf(element) === null ? element.content : element;
    }

    // The namespace of what is drawn inside `node`: an element's own (null for HTML), except at the
    // parser's integration points (namespaceInside, above: a <foreignObject>, an SVG <title> or
    // <desc>, a MathML token element or an HTML annotation-xml holds HTML again); a fragment or a
    // shadow root, which has none, holds HTML. Every path that draws into an element asks the
    // element, never the namespace its parent was drawn in: a re-draw that kept an <svg> under an
    // HTML element once drew the shapes it added as XHTML elements with no box, and the picture
    // went blank.
    childNamespaceOf(node) {
        if (node.nodeType !== Node.ELEMENT_NODE) return null;
        return namespaceInside(this.namespaceOf(node), lowerName(node.localName), node);
    }

    // Builds a node (and its subtree) without inserting it anywhere.
    createElement(layout, namespace = null) {
        if (this.isSeatLayout(layout)) {
            return this.createSlot(layout, namespace);
        }
        if (this.isTextLayout(layout)) {
            const textNode = document.createTextNode(this.textOf(layout));
            this.owned.add(textNode);
            return textNode;
        }

        const tag = this.layoutTag(layout);
        if (this.componentManager.has(tag)) {
            return this.createComponent(layout, namespace);
        }
        const rawContent = layout[tag];
        // The same refusal as the server (html-safety.js): a tag that came from data carries its own
        // attributes and cannot be escaped. An empty text node stands in its place, so the node count
        // still matches what the server sent and a keyed reconcile is not thrown off.
        const tagCheck = checkTag(tag, this.allowTags);
        // A component's name with nothing registered under it: said or refused as the instance's
        // `unknownComponents` says (Juris.unknownComponent), as on the server, whether or not the tag
        // is drawn, and told which. Inside <svg> or <math> it is an element, never unknown.
        if (startsUpperCase(tag)) this.juris.unknownComponent(tag, foreignContext(namespace), tagCheck.ok);
        if (!tagCheck.ok) {
            const placeholder = document.createTextNode("");
            this.owned.add(placeholder);
            if (this.devMode) this.juris.refused(tagCheck.rule, tagCheck.reason, { name: tag, value: rawContent, node: placeholder, component: this.owner });
            return placeholder;
        }
        const content = this.normalizeContent(rawContent);
        const lowerTag = lowerName(tag);
        const drawnIn = elementNamespace(namespace, lowerTag);

        const el = drawnIn ? document.createElementNS(drawnIn, tag) : document.createElement(tag);
        this.owned.add(el);
        if (content.key !== undefined) this.elementKeys.set(el, content.key);
        // Abandoned part way (a boundary's fallback takes its place, or an error no boundary took
        // goes on to the caller), it is never inserted, so what it holds is disposed before the
        // error goes on: its bindings, and the components drawn in it, whose cleanups run and
        // which leave devMode's tree.
        try {
            this.applyPropertiesAndChildren(el, content, false);
        } catch (error) {
            this.disposeTreeQuietly(el);
            throw error;
        }
        return el;
    }

    // `namespace`, when not given, is the target's own (childNamespaceOf): what is drawn inside an
    // SVG <g> is SVG. A caller that names one, null for HTML included, gets that one.
    render(target, layout, namespace) {
        return this.enter(() => {
            const targetElement = this.resolveTarget(target, "render");
            const el = this.createElement(layout, namespace === undefined ? this.childNamespaceOf(targetElement) : namespace);
            targetElement.appendChild(el);
            return el;
        });
    }

    // Replaces the target's content (server-rendered HTML, or a previous mount) with `layout`.
    // Everything Juris owned inside is disposed first; foreign nodes are simply dropped. Every one
    // goes and the new layout is put in place whichever disposal throws; that error is thrown after.
    mount(target, layout, namespace) {
        return this.enter(() => {
            const targetElement = this.resolveTarget(target, "mount");
            const el = this.createElement(layout, namespace === undefined ? this.childNamespaceOf(targetElement) : namespace);
            try {
                runEvery(Array.from(targetElement.childNodes), (child) => this.disposeTree(child));
            } finally {
                while (targetElement.firstChild) targetElement.removeChild(targetElement.firstChild);
                targetElement.appendChild(el);
            }
            return el;
        });
    }
}
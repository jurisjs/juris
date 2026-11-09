// What both renderers refuse to write into a document, whatever the layout says.
//
// Values are always escaped, so text cannot break out of an attribute. Three things escaping cannot
// fix: an attribute NAME that came from data (`x onmouseover=…`) — the name is the injection — a URL
// whose scheme runs code (`javascript:`), and a TAG name that came from data, which carries its own
// attributes with it (`{ "img src=x onerror=…": {} }`). A layout built from user content (a profile
// link, a spread props object, a row rendered straight into a child position) would carry all three
// through. Shared by the DOM and SSR renderers so the two never disagree about what is allowed.
// The same goes for what a layout says that is not an attribute: `innerHTML`, a `classList` key and
// a `style` object's keys and values (below).

// An HTML attribute name: letters, digits, `-`, `_`, `:`, `.`; nothing else, nothing empty. Event
// handler attributes (`onclick=`) are refused as attributes outright — listeners are functions on
// the layout, never strings in the markup — so a name starting with "on" cannot be data-driven.
const NAME = /^[A-Za-z_:][A-Za-z0-9_:.-]*$/;

export function safeAttributeName(name) {
    if (typeof name !== "string" || !NAME.test(name)) return false;
    // "on", in any case, as the first two letters (`/^on/i`, without a regex).
    const first = name.charCodeAt(0) | 32;
    const second = name.charCodeAt(1) | 32;
    if (first === 111 && second === 110) return false;
    return true;
}

// `name` in lower case. A reconcile asks for the same few tags on every row it keeps, and toLowerCase
// makes a new string each time even when nothing changes, so the answers are kept, as many as
// MAX_LOWER_NAMES, since a name can come from data. (Not exported: what this module exports is the
// rules, which the language server keeps a copy of. The DOM renderer keeps its own.)
const lowerNames = new Map();
const MAX_LOWER_NAMES = 1024;

function lowerName(name) {
    let lower = lowerNames.get(name);
    if (lower === undefined) {
        lower = name.toLowerCase();
        if (lowerNames.size < MAX_LOWER_NAMES) lowerNames.set(name, lower);
    }
    return lower;
}

// ---- tag names -------------------------------------------------------------------------------

// A tag is a name and nothing else: letters, digits and `-` (custom elements), starting with a
// letter, or any valid custom element name, which HTML lets hold `.`, `_` and letters beyond ASCII
// too (`x-élément`, `x-a.b`): a lower-case ASCII letter, then its PCENChar, a `-` among them.
// Anything else is data that reached a child position — `{ "img src=x onerror=alert(1)": {} }`
// is a whole element with its own attributes, and no amount of value escaping touches it, because
// the SSR renderer concatenates the tag and the DOM renderer hands it to createElement. Neither form
// holds whitespace, `/`, `>`, a quote, `=` or a control character, so neither can end its tag.
const TAG = /^[A-Za-z][A-Za-z0-9-]*$/;
const CUSTOM_ELEMENT = /^[a-z][-.0-9_a-z\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C\u200D\u203F\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}]*$/u;
const isTagName = (tag) => typeof tag === "string" && (TAG.test(tag) || (tag.includes("-") && CUSTOM_ELEMENT.test(tag)));

// Elements that run code, load a document, or re-point the page, and so are never worth taking from
// a layout unless the app says otherwise. `<script>` created through createElement and inserted DOES
// execute, and HTML-escaping its text is the wrong escaping for that context anyway. An app that
// really needs one passes `allowTags: ["script"]` to Juris.
const REFUSED_TAGS = new Set([
    "script", "iframe", "frame", "frameset", "object", "embed", "applet", "portal",
    "base", "meta", "link",
    // SVG's scripting-adjacent animation elements: `<set attributeName="href" to="javascript:…">`.
    "set", "animate", "animatemotion", "animatetransform",
    // `<plaintext>` is never closed: the parser reads the rest of the document as its text, the
    // state and the loader included, and the page never boots. `<style>` is CSS for the whole page
    // (and for SVG's <style> too), which data must not write: attribute selectors with
    // `url(…)` backgrounds read a page's values out one character at a time, and `@import` loads
    // more of it.
    "plaintext", "style",
]);

// The tags an app adds (Juris `allowTags`), checked once and lower-cased, since the check runs per
// element. A list of tags' names; anything else is refused, never cleaned up: a name no tag can have
// opens nothing, and the app would believe a tag allowed that stays refused.
export function allowedTags(list) {
    if (list === undefined) return new Set();
    if (!Array.isArray(list)) throw new TypeError("Juris: allowTags is a list of tags' names (\"iframe\", \"my-widget\")");
    const tags = new Set();
    for (const entry of list) {
        if (typeof entry !== "string" || !TAG.test(entry)) {
            throw new TypeError(`Juris: allowTags: ${typeof entry === "string" ? JSON.stringify(entry) : String(entry)} is not a tag's name (a letter, then letters, digits or "-")`);
        }
        tags.add(entry.toLowerCase());
    }
    return tags;
}

// `allowed` is the app's opt-in list (Juris `allowTags`, from allowedTags), lower-cased.
export function safeTagName(tag, allowed = null) {
    if (!isTagName(tag)) return false;
    const lower = tag.toLowerCase();
    return !REFUSED_TAGS.has(lower) || Boolean(allowed?.has(lower));
}

// The decision both renderers make for one element. Returns { ok, reason }.
// The tags already found safe, for each `allowed` list: a page draws the same few thousands of times.
// Only a tag that passed is kept, and no more than MAX_PASSED_TAGS, as a tag can come from data.
const PASSED = Object.freeze({ ok: true });
const MAX_PASSED_TAGS = 512;
const passedWithNoList = new Set();
const passedByList = new WeakMap();

function passedFor(allowed) {
    if (allowed === null) return passedWithNoList;
    let passed = passedByList.get(allowed);
    if (!passed) {
        passed = new Set();
        passedByList.set(allowed, passed);
    }
    return passed;
}

export function checkTag(tag, allowed = null) {
    const passed = passedFor(allowed);
    if (passed.has(tag)) return PASSED;
    if (!isTagName(tag)) {
        return { ok: false, reason: `tag name ${JSON.stringify(String(tag)).slice(0, 60)} is not a tag: a value from data reached a child position` };
    }
    if (!safeTagName(tag, allowed)) return { ok: false, reason: `<${tag}> is not allowed in a layout (pass allowTags: ["${tag.toLowerCase()}"] if it really is wanted)` };
    if (passed.size < MAX_PASSED_TAGS) passed.add(tag);
    return PASSED;
}

// Whether the DOM renderer may take an element that is already there (server markup, a previous
// draw, an element enhance adopted) as the one a layout's `tag` draws: the same tag, and one the
// renderers would draw themselves. Comparing the names alone let a layout write into an <iframe>
// the page happened to hold, which it could never have created.
export function reusableElement(localName, tag, allowed = null) {
    if (typeof tag !== "string") return false;
    const sameName = localName === tag || lowerName(String(localName)) === lowerName(tag);
    return sameName && checkTag(tag, allowed).ok;
}

// ---- markup, classes, styles -----------------------------------------------------------------

// `innerHTML` is markup, and markup from a layout runs whatever it carries: a row spread into
// props, or one that reached a child position, with `innerHTML: '<img src=x onerror=…>'` is a
// script. Refused unless the instance says so (Juris `allowInnerHTML: true`), for the app whose
// own markup needs it. `allowed` is that option; only `true` opens it.
export function checkInnerHTML(allowed) {
    if (allowed === true) return { ok: true };
    return { ok: false, reason: "innerHTML: markup is not written from a layout (use textContent, or pass allowInnerHTML: true to Juris for the app's own markup)" };
}

// A `classList` key is class names: split on ASCII whitespace, as the DOM splits a class
// attribute, with empty ones skipped. classList.toggle throws on a token with whitespace or an
// empty one, which aborted the whole mount; the server wrote such a key as it was.
export function classTokens(name) {
    const text = String(name);
    const tokens = [];
    let start = -1;
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        // ASCII whitespace as the DOM reads it: space, tab, line feed, form feed, carriage return.
        const space = code === 32 || code === 9 || code === 10 || code === 12 || code === 13;
        if (!space) {
            if (start === -1) start = index;
        } else if (start !== -1) {
            tokens.push(text.slice(start, index));
            start = -1;
        }
    }
    if (start === 0) tokens.push(text);
    else if (start !== -1) tokens.push(text.slice(start));
    return tokens;
}

// A `style` object's key is a camelCase property (`marginTop`, `WebkitTransform`) or a custom
// property (`--accent`). Anything else is not a property: `cssText` would replace the whole style
// on the client (and meant nothing on the server), a key with `;` or `:` writes declarations of its
// own, and the names of CSSStyleDeclaration's own members would overwrite them on the element.
const STYLE_KEY = /^[A-Za-z][A-Za-z0-9]*$/;
const CUSTOM_PROPERTY = /^--[A-Za-z0-9_-]+$/;
const NOT_PROPERTIES = new Set(["cssText", "length", "parentRule", "item", "getPropertyValue", "getPropertyPriority", "setProperty", "removeProperty"]);

// A value is a string or a number, and nothing in it can end the declaration or start another:
// `red;background:url(//elsewhere)` is two declarations to the server's attribute, `{`, `}` and `<`
// have no place in a value, `\` spells any of them as an escape, a control character (newline
// included) or DEL ends or hides one, and `/*` opens a comment that swallows every declaration after
// it. The DOM drops such a value when it is assigned; the server wrote it. This is the one rule for
// both (refusedStyleValue, below).

// The CSS name of a camelCase key: `marginTop` is `margin-top`, a vendor prefix leads with `-`
// (`WebkitTransform`, and `msTransform`, which the DOM spells in lower case), and `cssFloat` is
// `float`. `webkitTransform`, in lower case, is `-webkit-transform` too: the DOM's style object takes
// either spelling for a -webkit- property (CSSOM's webkit-cased attributes), so the client drew it
// where the server wrote `webkit-transform`, which no browser reads.
const cssName = (key) => {
    if (key.startsWith("--")) return key;
    if (key === "cssFloat") return "float";
    const kebab = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    return /^(ms|webkit)-/.test(kebab) ? `-${kebab}` : kebab;
};

// Whether a style value holds what the rule above refuses: `;`, `{`, `}`, `<`, `\`, a control
// character, DEL, or `/*`. A loop over the characters, run on every value a style draws.
const refusedStyleValue = (text) => {
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        if (code < 32 || code === 127 || code === 59 || code === 123 || code === 125 || code === 60 || code === 92) {
            return true;
        }
        if (code === 47 && text.charCodeAt(index + 1) === 42) return true;
    }
    return false;
};

// The keys already found to be properties, each with its CSS name and the answer every value it
// allows gets: a page draws the same few keys on every element. Bounded, as a key can come from data.
const styleKeys = new Map();
const MAX_STYLE_KEYS = 512;

function styleKey(key) {
    let known = styleKeys.get(key);
    if (known === undefined) {
        const isCustom = typeof key === "string" && CUSTOM_PROPERTY.test(key);
        if (!isCustom && (typeof key !== "string" || !STYLE_KEY.test(key) || NOT_PROPERTIES.has(key))) return null;
        const name = cssName(key);
        known = { name, passed: Object.freeze({ ok: true, name }) };
        if (styleKeys.size < MAX_STYLE_KEYS) styleKeys.set(key, known);
    }
    return known;
}

// The decision both renderers make for one style key and its value. Returns { ok, name, reason }:
// `name` is the CSS property's name, given whenever the key is one (so a refused value can take off
// the value before it). A value of nothing (null, undefined, "") is a removal, never refused.
export function checkStyle(key, value) {
    const known = styleKey(key);
    if (known === null) {
        return { ok: false, reason: `style key ${JSON.stringify(String(key)).slice(0, 40)} is not a property (a camelCase name, or --custom)` };
    }
    const { name } = known;
    if (value === null || value === undefined || value === "") return known.passed;
    if ((typeof value !== "string" && typeof value !== "number") || refusedStyleValue(String(value))) {
        return { ok: false, name, reason: `style ${key} refuses ${JSON.stringify(typeof value === "string" || typeof value === "number" ? String(value) : typeof value).slice(0, 40)}: not a single value` };
    }
    return known.passed;
}

// ---- attribute values ------------------------------------------------------------------------

// Attributes whose value the browser will navigate to, load, or submit to.
const URL_ATTRIBUTES = new Set(["href", "src", "action", "formaction", "xlink:href", "poster", "cite", "data"]);

// Attributes whose value is not a URL but a document, and so can never be checked as one. `srcdoc`
// used to sit in URL_ATTRIBUTES: its value is HTML, `<script>alert(1)</script>` contains no colon,
// so safeUrl called it relative and allowed it — and an iframe's srcdoc document is same-origin with
// the page. Escaping does not help, because the HTML parser unescapes the attribute before parsing
// its value as a document. Refused outright; neither `allowTags` nor `allowSchemes` opens it.
const REFUSED_ATTRIBUTES = new Set(["srcdoc"]);

// A URL is allowed when it is relative, a fragment, one of these schemes, or one the app adds
// (Juris `allowSchemes`). `data:` is allowed for images only (an inline SVG or a base64
// placeholder), never for a document. Control characters and whitespace inside the scheme are
// stripped before the check, because `java<TAB>script:` is how a blocklist gets beaten. The class
// is written with escapes, not the characters themselves: a literal control byte makes this file
// binary to grep and unreadable in any diff or review that copies it.
const ALLOWED_SCHEMES = new Set(["http", "https", "mailto", "tel", "sms", "geo", "ftp"]);

// Schemes no app can add. `javascript:` and `vbscript:` run code in the page; `data:` has its own
// rule, an image and never a document, which adding its name would widen. `allowedSchemes` refuses
// to build a list naming one, and `safeUrl` refuses them again on every URL, so a set handed to the
// check some other way cannot open them either.
const NEVER_SCHEMES = new Set(["javascript", "vbscript", "data"]);

// A scheme's name (RFC 3986): a letter, then letters, digits, `+`, `-` or `.`. ASCII only, as a
// browser reads one.
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*$/;

// The schemes an app adds (Juris `allowSchemes`), checked once and lower-cased, since the check runs
// per attribute. A list of names, each written without its colon; anything else is refused, never
// cleaned up, because a name that has to be cleaned is not the one the app meant.
export function allowedSchemes(list) {
    if (list === undefined) return new Set();
    if (!Array.isArray(list)) throw new TypeError("Juris: allowSchemes is a list of URL schemes' names (\"magnet\", \"web+app\"), without the colon");
    const schemes = new Set();
    for (const entry of list) {
        if (typeof entry !== "string" || !SCHEME.test(entry)) {
            throw new TypeError(`Juris: allowSchemes: ${typeof entry === "string" ? JSON.stringify(entry) : String(entry)} is not a scheme's name (a letter, then letters, digits, "+", "-" or "."; no colon)`);
        }
        const scheme = entry.toLowerCase();
        if (scheme === "data") throw new TypeError("Juris: allowSchemes: data: is allowed for an image only, and no option widens it");
        if (NEVER_SCHEMES.has(scheme)) throw new TypeError(`Juris: allowSchemes: ${scheme}: runs code in the page, and is never allowed`);
        schemes.add(scheme);
    }
    return schemes;
}

// `allowed` is the app's added schemes (Juris `allowSchemes`, from allowedSchemes), lower-cased.
// Whether `text` holds a character safeUrl strips: a control character (C0, DEL, C1) or whitespace as
// a regex's `\s` reads it. Most URLs hold none, and are checked as they are, without a copy.
const holdsUrlNoise = (text) => {
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        if (code <= 32 || (code >= 127 && code <= 160)) return true;
        if (code < 5760) continue;
        if (code === 5760 || (code >= 8192 && code <= 8202) || code === 8232 || code === 8233) return true;
        if (code === 8239 || code === 8287 || code === 12288 || code === 65279) return true;
    }
    return false;
};

export function safeUrl(value, allowed = null) {
    const given = String(value);
    const text = holdsUrlNoise(given) ? given.replace(/[\x00-\x1F\x7F-\x9F\s]+/g, "").trim() : given;
    if (text === "") return true;
    const colon = text.indexOf(":");
    const slash = text.indexOf("/");
    const query = text.indexOf("?");
    const hash = text.indexOf("#");
    // No scheme at all (the first ":" comes after a path/query/fragment separator, or never): relative.
    if (colon === -1 || (slash !== -1 && slash < colon) || (query !== -1 && query < colon) || (hash !== -1 && hash < colon)) return true;
    const scheme = text.slice(0, colon).toLowerCase();
    if (ALLOWED_SCHEMES.has(scheme)) return true;
    // The type, then a parameter (";base64", ";utf8") or the comma that starts the data: an inline
    // SVG is most often written with none, "data:image/svg+xml,%3Csvg…".
    if (scheme === "data") return /^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i.test(text);
    if (NEVER_SCHEMES.has(scheme)) return false;
    return Boolean(allowed?.has(scheme));
}

// The decision both renderers make for one attribute. Returns { ok, reason }. `schemes` is the
// instance's added schemes (from allowedSchemes); it opens no attribute, only a scheme in a URL
// attribute's value.
// The names already found safe, each with whether it holds a URL, whose value is checked every time:
// a page writes the same few names on thousands of elements. Only a name that passed is kept, and no
// more than MAX_PASSED_NAMES, as a name can come from data.
const PLAIN_NAME = 1;
const URL_NAME = 2;
const passedNames = new Map();
const MAX_PASSED_NAMES = 512;

export function checkAttribute(name, value, schemes = null) {
    let kind = passedNames.get(name);
    if (kind === undefined) {
        if (!safeAttributeName(name)) return { ok: false, reason: `attribute name "${String(name)}" is not allowed` };
        const lower = name.toLowerCase();
        if (REFUSED_ATTRIBUTES.has(lower)) {
            return { ok: false, reason: `${name} takes a document, not a value, and is never written from a layout` };
        }
        kind = URL_ATTRIBUTES.has(lower) ? URL_NAME : PLAIN_NAME;
        if (passedNames.size < MAX_PASSED_NAMES) passedNames.set(name, kind);
    }
    if (kind === URL_NAME && value !== null && value !== undefined && !safeUrl(value, schemes)) {
        return { ok: false, reason: `${name} refuses "${String(value).slice(0, 40)}": scheme not allowed` };
    }
    return PASSED;
}

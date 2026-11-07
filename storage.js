// What the framework itself stores in a browser, declared, so that an app that tells its visitors
// what it stores (a cookie notice, say) lists these as the framework words them, without a copy of
// its own that could drift. An entry is { key, kind, category, purpose, life }: `kind` the storage
// it is kept in, `category` "necessary" (the page cannot work as it does without it, so nobody is
// asked to consent to it), `purpose` and `life` in words a visitor reads.
//
// A leaf: it imports nothing. The router takes its key from here, so what is declared is what is
// written.
//
// Only what the framework names itself is here. A key an app names and hands to the framework (the
// client boot's skew guard keeps its mark under the app's `storageKey`) is the app's to declare.

// Where the router keeps the length of this tab's Back/Forward trail (src/router.js), so that after
// a reload the tab still knows how far Forward can go: named by the router's state root and, when
// the app is mounted under one, its base, so two apps under two bases in one tab keep two trails.
export function trailKey({ routePath = "$route", base = "" } = {}) {
    const under = base ? `${base}:` : "";
    return `juris:${under}${routePath}:length`;
}

export const STORAGE = Object.freeze([
    Object.freeze({
        key: trailKey(),
        kind: "sessionStorage",
        category: "necessary",
        purpose: "Remembers how far Back and Forward can go in this tab, so the page's own Back and Forward buttons know whether there is anywhere to go.",
        life: "Until the tab closes.",
    }),
]);

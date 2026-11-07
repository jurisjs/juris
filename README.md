# Juris

The browser half of Juris, a framework for server-rendered web apps whose pages stay live.

- **Layouts are plain objects**, the same on both sides: `{ h1: { textContent: () => api.getState("title") } }`.
- **Reactive state**, the DOM renderer, the router, forms and the browser's live client. Rendering
  to a string, on the server, is the kit's, so no browser downloads it.
- **No build step, no runtime dependency.** Every file here is a module a browser runs as it is on
  disk; each imports only its flat siblings.

Apache-2.0. Node 24 or later to run the tests and, with the kit, render on a server.

```bash
npm install juris
```

## Where it fits

The server, the string renderer it draws pages with, the module server that serves these files to
browsers, and live queries are [`juris-kit`](https://github.com/jurisjs/juris-kit),
which depends on this package. An app usually installs the kit and gets Juris with it; the kit
serves this package, flat, at `/src/`.

| Where | Import | For |
| --- | --- | --- |
| The browser's entry | `/src/client.js` | `hydrate`, the whole client boot |
| Shared modules, when they need it | `/src/forms.js`, `/src/clock.js`, `/src/live-data.js`, `/src/router.js`, `/src/errors.js`, `/src/storage.js` | Plugins and helpers, in the browser |
| Node | `juris` (the `Juris` class), `juris/<file>.js` | Tests, and `fail` in services (`juris/errors.js`) |
| Node, to render to a string | `juris-kit/server/ssr-renderer.js` (`SSRRenderer`), given as `new Juris({ isServer: true, features: { ssr: SSRRenderer } })` | `renderToString` and `renderRequest`, which throw without it; the kit's server gives its own instance the renderer |
| A page in devMode | `/src/devtools.js` (`Devtools`), given as `features: { devtools: Devtools }`; `hydrate` imports and gives it itself in devMode (the kit's development pages turn devMode on), and only then | What a devtools panel reads from the page, through a registry on `window` |

## Headless components, FluentState and web components

`headless.js`, `fluentstate.js` and `webcomponent.js` carry 0.91's headless components, FluentState
and custom elements onto this core, with their API and usage:

```js
import Juris from "/src/juris.js";
import { HeadlessManager } from "/src/headless.js";
import { createFluentStateHeadless } from "/src/fluentstate.js";
import { WebComponentFactory } from "/src/webcomponent.js";

const juris = new Juris({
    features: { headless: HeadlessManager, webComponentFactory: WebComponentFactory },
    headlessComponents: { fluentState: { fn: createFluentStateHeadless, options: { autoInit: true } } },
});
const $ = juris.api.fluentState.getFluentStates();
juris.createWebComponent("user-name", () => ({ b: { textContent: () => $.user.name } }));
$.user.name = "Ada";
```

## The full reference

[REFERENCE.md](https://github.com/jurisjs/juris-kit/blob/main/REFERENCE.md), in the kit, is the
framework's contract for both packages: every module here under
["Modules a browser downloads"](https://github.com/jurisjs/juris-kit/blob/main/REFERENCE.md#modules-a-browser-downloads),
the [boundary](https://github.com/jurisjs/juris-kit/blob/main/REFERENCE.md#the-boundary), the
[browser floor](https://github.com/jurisjs/juris-kit/blob/main/REFERENCE.md#the-browser-floor)
and the [security defaults](https://github.com/jurisjs/juris-kit/blob/main/REFERENCE.md#security-defaults-and-invariants).

The tests are in `tests/` (`npm test`). `tests/boundary.test.mjs` holds what a browser downloads:
flat sibling imports only, no `Buffer`, `process` or `require(`, no import cycle, nothing newer
than the browser floor, and no string renderer among what `juris.js` imports. What the string
renderer draws is tested in the kit.

## Earlier versions

Before 0.92, this package was a single-file build (`juris.mjs`/`juris.cjs`, `window.Juris`) with a
different API. That code, and the demos and plugins written for it, are in this repository's
history before the 0.92.0 change; its headless components, FluentState and web components are
carried over above.

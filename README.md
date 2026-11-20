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

## An example

A counter, in one HTML file: save it as `counter.html` and open it in a browser. Juris comes from
a CDN, so there is nothing to install.

```html
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Counter</title>
    <!-- "juris/..." is the juris package from npm, through a CDN. -->
    <script type="importmap">
        { "imports": { "juris/": "https://cdn.jsdelivr.net/npm/juris@0.93/" } }
    </script>
</head>
<body>
    <div id="app"></div>
    <script type="module">
        import Juris from "juris/juris.js";

        const juris = new Juris({ state: { count: 0 } });

        // A component is a function from props to a layout: a plain object, tag first.
        juris.registerComponent("Counter", (props, api) => ({
            div: {
                children: [
                    // A function is a binding: when the state it read changes, it runs again,
                    // and only it: the component's body doesn't.
                    { p: { textContent: () => `${props.label}: ${api.getState("count")}` } },
                    {
                        button: {
                            textContent: "+1",
                            onclick: () => api.updateState("count", (n) => n + 1),
                        },
                    },
                    {
                        button: {
                            textContent: "Reset",
                            disabled: () => api.getState("count") === 0,
                            onclick: () => api.setValue("count", 0),
                        },
                    },
                ],
            },
        }));

        juris.render(document.getElementById("app"), { Counter: { label: "Clicks" } });
    </script>
</body>
</html>
```

The same code runs in other ways:

- **From npm.** Run `npm install juris`, serve `node_modules/juris/` beside your page, and point
  `juris/` in the import map at it. Each file imports only its flat siblings, so any static file
  server will do.
- **With [`juris-kit`](https://github.com/jurisjs/juris-kit).** The kit serves this package at
  `/src/` (`import Juris from "/src/juris.js"`). Its server renders the same layout to HTML first,
  and the browser's `hydrate` makes that page live, with no second layout to write.

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
and custom elements onto this core, with their API and usage. With the example's import map, this
runs in its `<script type="module">` as it is:

```js
import Juris from "juris/juris.js";
import { HeadlessManager } from "juris/headless.js";
import { createFluentStateHeadless } from "juris/fluentstate.js";
import { WebComponentFactory } from "juris/webcomponent.js";

const juris = new Juris({
    features: {
        headless: HeadlessManager,
        webComponentFactory: WebComponentFactory,
    },
    headlessComponents: {
        fluentState: {
            fn: createFluentStateHeadless,
            options: { autoInit: true },
        },
    },
});

// The state, read and written by property.
const $ = juris.api.fluentState.getFluentStates();

// <user-name></user-name> shows the user's name, and follows it when it changes.
juris.createWebComponent("user-name", () => ({
    b: { textContent: () => $.user.name },
}));

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

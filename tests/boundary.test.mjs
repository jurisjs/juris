// The boundary (REFERENCE.md, "The boundary" and "The browser floor"), held by a test: what a
// browser downloads imports nothing it cannot load, nothing in src/ reads the environment, no import
// cycle, and nothing newer than the browser floor in the files a browser runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function filesUnder(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...(await filesUnder(path)));
        else if (entry.name.endsWith(".js")) out.push(path);
    }
    return out;
}

// The code of a file with its comments and (unless `keepStrings`) string contents blanked, so a rule
// reads code, not prose.
function codeOf(source, { keepStrings = false } = {}) {
    let out = "";
    let i = 0;
    while (i < source.length) {
        const c = source[i];
        const next = source[i + 1];
        if (c === "/" && next === "/") { while (i < source.length && source[i] !== "\n") i++; continue; }
        if (c === "/" && next === "*") { const end = source.indexOf("*/", i + 2); i = end < 0 ? source.length : end + 2; out += " "; continue; }
        if (c === '"' || c === "'" || c === "`") {
            const quote = c;
            const start = i;
            i++;
            while (i < source.length && source[i] !== quote) { if (source[i] === "\\") i++; i++; }
            i++;
            out += keepStrings ? source.slice(start, i) : quote + quote;
            continue;
        }
        out += c;
        i++;
    }
    return out;
}

const importsOf = (text) => [...codeOf(text, { keepStrings: true }).matchAll(/(?:^|[\s;])(?:import|export)\b[^'"`;]*?\bfrom\s*["']([^"']+)["']|(?:^|[\s;])import\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/gm)].map((m) => m[1] ?? m[2] ?? m[3]);

const top = async () => (await readdir(SRC)).filter((n) => n.endsWith(".js")).map((n) => join(SRC, n));

test("a browser module imports only its flat siblings", async () => {
    for (const file of await top()) {
        const source = await readFile(file, "utf8");
        for (const spec of importsOf(source)) {
            assert.ok(/^\.\/[A-Za-z0-9_-]+\.js$/.test(spec), `${relative(SRC, file)} imports "${spec}": a browser module imports only ./sibling.js`);
        }
        const code = codeOf(source);
        for (const word of ["Buffer", "process", "require("]) {
            assert.ok(!new RegExp(`(^|[^.\\w$])${word.replace("(", "\\(")}`).test(code), `${relative(SRC, file)} uses ${word}`);
        }
    }
});

test("nothing in src/ reads the environment", async () => {
    for (const file of await filesUnder(SRC)) {
        assert.ok(!/process\.env/.test(codeOf(await readFile(file, "utf8"))), `${relative(SRC, file)} reads process.env`);
    }
});

test("no import cycle anywhere in src/", async () => {
    const graph = new Map();
    for (const file of await filesUnder(SRC)) {
        const deps = importsOf(await readFile(file, "utf8")).filter((s) => s.startsWith(".")).map((s) => resolve(dirname(file), s));
        graph.set(file, deps);
    }
    const state = new Map();
    const visit = (file, path) => {
        if (state.get(file) === "done") return;
        assert.notEqual(state.get(file), "open", `import cycle: ${[...path, file].map((f) => relative(SRC, f)).join(" → ")}`);
        state.set(file, "open");
        for (const dep of graph.get(file) ?? []) visit(dep, [...path, file]);
        state.set(file, "done");
    };
    for (const file of graph.keys()) visit(file, []);
});

// The string renderer is the kit's (juris-kit/server/ssr-renderer.js, given to an
// instance as `features.ssr`), so a page that loads juris.js does not download it: no module that
// juris.js reaches by its static imports renders to a string, juris.js names no renderer of the kit's
// in any import, static or dynamic, and the package carries no ssr-renderer.js.
const staticImportsOf = (text) => [...codeOf(text, { keepStrings: true }).matchAll(/(?:^|[\s;])(?:import|export)\b[^'"`;]*?\bfrom\s*["']([^"']+)["']|(?:^|[\s;])import\s*["']([^"']+)["']/gm)].map((m) => m[1] ?? m[2]);
test("juris.js's static import graph carries no string renderer", async () => {
    const entry = join(SRC, "juris.js");
    const graph = new Map(); // file -> its code
    const visit = async (file) => {
        if (graph.has(file)) return;
        const source = await readFile(file, "utf8");
        graph.set(file, codeOf(source));
        for (const spec of staticImportsOf(source)) if (spec.startsWith(".")) await visit(resolve(dirname(file), spec));
    };
    await visit(entry);
    assert.ok(graph.size > 1, "juris.js imports its siblings");
    for (const [file, code] of graph) {
        const name = relative(SRC, file);
        assert.notEqual(name, "ssr-renderer.js", "juris.js reaches ssr-renderer.js");
        assert.ok(!/\bclass\s+SSRRenderer\b|\bescapeText\b|\bescapeAttribute\b/.test(code), `${name} carries the string renderer`);
        if (file !== entry) assert.ok(!/\brenderToString\s*\(/.test(code), `${name}, which juris.js imports, renders to a string`);
    }
    for (const spec of importsOf(await readFile(entry, "utf8"))) {
        assert.ok(!/ssr-renderer|juris-kit/.test(spec), `juris.js imports "${spec}"`);
    }
    assert.ok(!(await top()).some((file) => relative(SRC, file) === "ssr-renderer.js"), "the package carries ssr-renderer.js");
});

// Newer than Safari 15.4 / Chrome 93 / Firefox 92: refused in what a browser runs.
const NEWER = [
    [/\.toSorted\(/, "Array.prototype.toSorted"], [/\.toReversed\(/, "Array.prototype.toReversed"], [/\.toSpliced\(/, "Array.prototype.toSpliced"],
    [/\.with\(\s*-?\d/, "Array.prototype.with"], [/\bObject\.groupBy\b/, "Object.groupBy"], [/\bMap\.groupBy\b/, "Map.groupBy"],
    [/\bPromise\.withResolvers\b/, "Promise.withResolvers"], [/\bstructuredClone\(/, "structuredClone"], [/\.findLast(Index)?\(/, "findLast"],
    [/\bcrypto\.randomUUID\(/, "crypto.randomUUID"], [/\bURL\.canParse\b/, "URL.canParse"], [/\bstatic\s*\{/, "class static block"],
    [/\(\?<[=!]/, "regex lookbehind"], [/\.(union|intersection|difference|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\(/, "Set methods"],
    [/\bArray\.fromAsync\b/, "Array.fromAsync"], [/\.hasIndices\b|\/[a-z]*d[a-z]*\.exec/, "regex d flag"],
];
test("the browser floor holds in what a browser runs", async () => {
    for (const file of await top()) {
        const code = codeOf(await readFile(file, "utf8"));
        for (const [pattern, name] of NEWER) assert.ok(!pattern.test(code), `${relative(SRC, file)} uses ${name}, newer than the browser floor`);
    }
});

// The devtools feature (devtools.js) is a browser module like any other, held to the floor and to flat
// imports by the tests above, and loaded only in devMode: `hydrate` imports it dynamically, and
// nothing a browser runs imports it statically, so a page with devMode off never downloads it.
test("devtools.js is a browser module that nothing imports statically; client.js alone imports it, dynamically", async () => {
    const files = await top();
    assert.ok(files.some((file) => relative(SRC, file) === "devtools.js"), "the package carries devtools.js");
    for (const file of files) {
        const source = await readFile(file, "utf8");
        const name = relative(SRC, file);
        assert.ok(!staticImportsOf(source).some((spec) => /(^|\/)devtools\.js$/.test(spec)), `${name} imports devtools.js statically`);
        const dynamic = importsOf(source).filter((spec) => /(^|\/)devtools\.js$/.test(spec));
        assert.deepEqual(dynamic, name === "client.js" ? ["./devtools.js"] : [], `${name}'s dynamic imports of devtools.js`);
    }
});

// What a page downloads before it is live (client.js's static graph): eleven modules, and never
// devtools.js. A module added to it is a change to this list, and to every page's first load.
test("the boot graph is client.js's eleven modules, with no devtools.js", async () => {
    const graph = new Set();
    const visit = async (file) => {
        if (graph.has(file)) return;
        graph.add(file);
        for (const spec of staticImportsOf(await readFile(file, "utf8"))) await visit(resolve(dirname(file), spec));
    };
    await visit(join(SRC, "client.js"));
    assert.deepEqual([...graph].map((file) => relative(SRC, file)).sort(), [
        "client.js", "component-manager.js", "dom-renderer.js", "errors.js", "html-safety.js", "juris.js", "live-protocol.js",
        "remote-services.js", "router.js", "state-manager.js", "storage.js",
    ]);
});

// What a Manifest V3 extension page allows (`script-src 'self'`), which a devtools panel drawn with
// these modules runs under: no string evaluated as code (eval, new Function, a string timer) and no
// import() of a specifier that is not a literal.
test("no browser module evaluates a string as code, or imports a computed specifier", async () => {
    for (const file of await top()) {
        const source = await readFile(file, "utf8");
        const code = codeOf(source);
        const name = relative(SRC, file);
        assert.ok(!/(^|[^.\w$])eval\s*\(/.test(code), `${name} calls eval`);
        assert.ok(!/\bnew\s+Function\b|(^|[^.\w$])Function\s*\(/.test(code), `${name} makes a Function from a string`);
        assert.ok(!/\bset(?:Timeout|Interval)\(\s*["'`]/.test(code), `${name} hands a timer a string`);
        assert.ok(!/\bimport\(\s*(?!["'][^"'`]+["']\s*\))/.test(codeOf(source, { keepStrings: true })), `${name} imports a computed specifier`);
    }
});

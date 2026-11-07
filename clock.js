// The clock plugin: `api.now()`, the time as every component reads it.
//
// A component never asks Date.now() itself. It asks `api.now()`, which answers the clock the app
// passed (a test passes a frozen one) or Date.now(). Every read during a traced server render marks
// that render with the flag "clock" (`markRender`, a no-op outside a traced render), so a page
// cache knows the HTML depends on when it was made and does not keep it: a page that says "Today"
// would still say it after midnight. `decide` in src/server/page-cache.js keeps no render that carries
// any flag, so the flag's name is not a contract with the cache.
//
// An app installs it on its server's instance and in its browser boot alike, so that `api.now()`
// exists wherever a component runs. This module imports nothing.
export const clock = (now = () => Date.now()) => (juris) => ({
    now: () => { juris.markRender("clock"); return now(); },
});

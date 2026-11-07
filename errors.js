// The framework's error classes. This module imports nothing, so the core, both renderers, the
// browser's service stubs, the server's dispatcher and an app's services can all import it without
// importing one another. juris.js re-exports FallbackSignal, where an app found it before.

// Thrown through a component tree when an error boundary that is still rendering wants its fallback
// shown: the boundary's own createComponent (or the SSR renderer) catches it and mounts `layout`.
// The core throws it and both renderers catch it by `instanceof`, so there is exactly one class.
export class FallbackSignal extends Error {
    constructor(boundary, layout, error) {
        super(`Juris: fallback for "${boundary.name}"`);
        this.boundary = boundary;
        this.layout = layout;
        this.cause = error;
    }
}

// A refusal written for the person who will read it: "Give the post a title.", not a driver's words.
//
// `expose` is what the default rule reads (`error.expose === true`, in the dispatcher and the core
// alike), so throwing one is how a service says its message may be shown; any other error's message
// stays in the server's log and the caller reads "request failed". `status` is the HTTP status the
// dispatcher answers with. `fields` ({ name: message }) lets a form put each message beside its
// input; a singular `field` is kept as given, since an app may branch on it, and is folded into
// `fields` with this message, unless `fields` already says something for it. `code` is a name a
// program can match where the words may change. The browser's stubs (remote-services.js) throw one
// too, carrying what the server answered, so a caller reads the same shape on either side.
export class ServiceError extends Error {
    constructor(message, { status = 400, fields, field, code } = {}) {
        super(message);
        this.name = "ServiceError";
        this.status = status;
        this.expose = true;
        const named = field !== undefined && field !== null && field !== "";
        if (named) this.field = field;
        if (named) this.fields = { ...fields, [field]: (fields && Object.hasOwn(fields, field) ? fields[field] : null) ?? message };
        else if (fields) this.fields = fields;
        if (code !== undefined) this.code = code;
    }
}

// Refuse, in one call: `fail("Give the post a title.", { field: "title" })`.
export const fail = (message, options) => {
    throw new ServiceError(message, options);
};

// Which errors a caller may read, when an app gives no rule of its own: only one that says it was
// written for its reader, `expose === true`, which a ServiceError sets. It is the default of the
// dispatcher's, the core's and the kernel's `exposeError`. Anything else (a driver's words, which
// name tables and constraints; the runtime's; a dependency's) stays in the server's log.
export const defaultExposeError = (error) => error?.expose === true;

// Whether `exposeError` (an app's rule, the default one unless given) lets a caller read this
// error's words. A rule that throws, or answers anything but `true`, says no: a mistake in one hides
// a message rather than showing it.
export const mayExpose = (error, exposeError = defaultExposeError) => {
    try {
        return exposeError(error) === true;
    } catch {
        return false;
    }
};

// The words a caller may read of a failure: its message when `mayExpose` says so, and otherwise
// `fallback`, a sentence that says nothing. The dispatcher answers with it (a service's refusal, a
// live query's failed re-run) and the core writes it into a page (a failed preload, a server's async
// error logs), so what one path shows the other shows too.
export const publicMessage = (error, exposeError = defaultExposeError, fallback = "request failed") =>
    (mayExpose(error, exposeError) ? String(error?.message ?? error) : fallback);

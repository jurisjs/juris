// Forms for Juris: a form is a path. juris.use(forms()) installs api.form(path, options), valid during a
// component definition (its computeds end with the instance) or anywhere else (then call form.dispose()).
//
//   const form = api.form("signin", {
//     fields:   { email: "", password: "", remember: false },      // initial values
//     validate: { email: (v, values) => (ok ? null : "message") }, // per field; null/undefined = fine
//     submit:   "signIn",                                          // service name, receives the values
//     onSuccess: (result, form) => …, onError: (error, form) => …,
//   });
//
// State under `path`:
//   values.<field>   what the inputs hold (one path per field: one input in, one event out)
//   touched.<field>  true after blur; errors are shown for touched fields, or for all after a submit
//   errors.<field>   computed from validate — one computed per field, so a rule that reads two fields
//                    (confirm === password) wakes exactly when either changes
//   valid, dirty     computed;  submitted, submitting, error (the service's message): plain state
//   serverErrors.<field>  what the service said about a field when it refused (the rejection's
//                    `fields`, as a ServiceError from src/errors.js carries them): replaced by each
//                    submit's answer, and a field's own cleared when that field changes. Kept apart
//                    from errors.<field>, which is a computed the validate rule owns, and which `valid`
//                    is derived from: a server message there would be overwritten at the next
//                    recompute, or keep `valid` false until the field changed.
//
// form.field(name, extra) → props for an <input>/<select>/<textarea> (checkboxes use `checked`, and
// a radio keeps its own `value`, and is checked while the field holds it);
// form.error(name) → tracked message or null: the validate rule's (once shown), else the server's;
// form.props() → the <form> element's props; form.values(), form.set(name, value), form.reset(),
// form.submit().

// Lists and plain objects are copied all the way down, so the form's values share nothing with the
// caller's `fields` or with what reset() goes back to. A write under values.<field>.<n> changes the
// stored list in place, and with the initial values copied one level deep it used to change both.
const isPlain = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const copy = (value) => (Array.isArray(value) ? value.map(copy) : isPlain(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) : value);

// A value the same as the initial one: by Object.is (0 is not false), or a list or plain object with
// the same keys holding the same values. `dirty` reads the value through its tracking proxy, so each
// item it looks at is a dependency and a write to one wakes it. It used to compare the proxy itself
// by Object.is, which no initial value is, so a list or object field read as dirty from the start.
const same = (value, initial) => {
    if (Object.is(value, initial)) return true;
    if (Array.isArray(value) ? !Array.isArray(initial) : !(isPlain(value) && isPlain(initial))) return false;
    const keys = Object.keys(value);
    return keys.length === Object.keys(initial).length && keys.every((key) => Object.hasOwn(initial, key) && same(value[key], initial[key]));
};

export function forms() {
    return (juris) => ({ form: (path, options) => createForm(juris, path, options) });
}

// Two forms live on one path would be one form: one set of values, touched and submitting, typed
// into from both, with two sets of rules computing its errors, valid and dirty. So a form is made on
// a path once the one before it there is disposed (a component's goes with the component, and a
// redraw disposes it before the next one is made), and two forms on a page take two paths. The
// state manager refused the second with "is already computed", naming a path the app never wrote.
const formTaken = (path) => `Juris form "${path}": a form is live on this path already; dispose it first`
    + " (a component's form goes with the component), or give this form a path of its own";

export function createForm(juris, path, options = {}) {
    const { fields = {}, validate = {}, submit, onSuccess, onError } = options;
    const initial = copy(fields);
    const at = (rest) => `${path}.${rest}`;
    const names = Object.keys(fields);
    const disposers = [];
    // The submit whose answer this form object still waits for, or null once reset() started over.
    let inFlight = null;

    const computedPaths = [...names.map((name) => at(`errors.${name}`)), at("valid"), at("dirty")];
    if (computedPaths.some((computed) => juris.stateManager.computed.has(computed))) {
        throw new Error(formTaken(path));
    }

    if (juris.peek(at("values")) === undefined) {
        juris.batch(() => {
            juris.setValue(at("values"), copy(initial));
            juris.setValue(at("touched"), {});
            juris.setValue(at("submitted"), false);
            juris.setValue(at("submitting"), false);
            juris.setValue(at("error"), null);
            juris.setValue(at("serverErrors"), {});
        });
    }
    for (const name of names) {
        const rule = validate[name];
        disposers.push(
            juris.compute(at(`errors.${name}`), (api) => {
                const values = api.getState(at("values"), {});
                const message = typeof rule === "function" ? rule(values[name], values) : null;
                return message === undefined || message === "" ? null : message;
            }),
        );
    }
    disposers.push(juris.compute(at("valid"), (api) => names.every((name) => api.getState(at(`errors.${name}`)) === null)));
    disposers.push(juris.compute(at("dirty"), (api) => names.some((name) => !same(api.getState(at(`values.${name}`)), initial[name]))));

    const form = {
        path,
        values: () => juris.toRaw(juris.peek(at("values"))) ?? {},
        // A change answers whatever the server said about the field, so its word on it goes.
        set: (name, value) =>
            juris.batch(() => {
                juris.setValue(at(`values.${name}`), value);
                if (juris.peek(at(`serverErrors.${name}`)) !== undefined) juris.deleteState(at(`serverErrors.${name}`));
            }),
        touch: (name) => juris.setValue(at(`touched.${name}`), true),
        // Starts the form over, `submitting` included: a service that never answers used to leave
        // the form refusing every submit until the page was reloaded. A submit still waiting then
        // answers into nothing (see submit).
        reset: () => {
            inFlight = null;
            juris.batch(() => {
                juris.setValue(at("values"), copy(initial));
                juris.setValue(at("touched"), {});
                juris.setValue(at("submitted"), false);
                juris.setValue(at("submitting"), false);
                juris.setValue(at("error"), null);
                juris.setValue(at("serverErrors"), {});
            });
        },
        // Tracked: the rule's message for a field the user has seen, or for any field once submitted;
        // otherwise what the server said about it when it last refused, until the field changes.
        error: (name) => {
            const shown = juris.getState(at(`touched.${name}`), false) || juris.getState(at("submitted"), false);
            return (shown ? juris.getState(at(`errors.${name}`), null) : null) ?? juris.getState(at(`serverErrors.${name}`), null) ?? null;
        },
        // Props for a field. `extra` is merged in (type, placeholder, autocomplete …). Its own onblur, oninput
        // and onchange run after the form's, never instead: a caller's onblur must not switch touch tracking off.
        field: (name, extra = {}) => {
            const isCheckbox = extra.type === "checkbox";
            const isRadio = extra.type === "radio";
            const props = {
                name,
                ...extra,
                onblur: (event) => (form.touch(name), extra.onblur?.(event)),
            };
            if (isCheckbox) {
                props.checked = () => Boolean(juris.getState(at(`values.${name}`)));
                props.onchange = (event) => (form.set(name, event.target.checked), extra.onchange?.(event));
            } else if (isRadio) {
                // The radio stands for its own value, as given, so a number stays one in the form ("on" is
                // the browser's value for a radio given none). They are compared as text, all an input's
                // value is, so a field that holds "2" checks the radio of 2. Empty is "": the radio of "".
                const own = () => (typeof extra.value === "function" ? extra.value() : extra.value) ?? "on";
                props.checked = () => String(juris.getState(at(`values.${name}`), "") ?? "") === String(own());
                props.onchange = (event) => {
                    form.set(name, own());
                    extra.onchange?.(event);
                };
            } else {
                props.value = () => juris.getState(at(`values.${name}`), "") ?? "";
                props.oninput = (event) => (form.set(name, event.target.value), extra.oninput?.(event));
            }
            return props;
        },
        // method="post" by default: a native submit (the script not loaded yet, or broken) must never put the fields,
        // passwords included, into the URL as a GET would.
        props: (extra = {}) => ({ novalidate: true, method: "post", ...extra, onsubmit: (event) => (event?.preventDefault?.(), form.submit()) }),
        // Validate everything, then call the service with the values. Resolves with the result, or
        // undefined when validation failed or the service rejected (the message is at `${path}.error`).
        // A call made while the service has not answered yet (a double click) is ignored: it changes
        // nothing and resolves undefined at once. `submitting` is the form's state, so this holds for
        // every form object on the same path.
        //
        // A service that answered is a success, whatever onSuccess does next: its own failure goes to
        // the console, never to `error` or onError. It used to be caught as the submit's, so the form
        // said the save had failed after it had not, and the user saved again: a second write.
        //
        // A submit that reset() has started over since leaves the form's state alone when its answer
        // arrives (the form is someone else's by then); onSuccess or onError is still told.
        submit: async () => {
            if (juris.peek(at("submitting"))) return undefined;
            juris.batch(() => {
                juris.setValue(at("submitted"), true);
                juris.setValue(at("error"), null);
                juris.setValue(at("serverErrors"), {});
            });
            if (!juris.peek(at("valid"))) return undefined;
            if (typeof submit !== "string" && typeof submit !== "function") return form.values();
            const run = {};
            inFlight = run;
            const mine = () => inFlight === run;
            juris.setValue(at("submitting"), true);
            let result;
            try {
                const values = form.values();
                result = await (typeof submit === "function" ? submit(values, form) : juris.call(submit, values));
            } catch (error) {
                // Only what a path can address: a message under a dotted or `__proto__` name has no
                // field to stand beside, and would not be read back where it was written.
                const said = {};
                for (const [name, message] of Object.entries(error?.fields && typeof error.fields === "object" ? error.fields : {})) {
                    if (typeof message === "string" && name !== "__proto__" && !name.includes(".")) said[name] = message;
                }
                if (mine()) {
                    inFlight = null;
                    juris.batch(() => {
                        juris.setValue(at("submitting"), false);
                        juris.setValue(at("error"), String(error?.message ?? error));
                        juris.setValue(at("serverErrors"), said);
                    });
                }
                onError?.(error, form);
                return undefined;
            }
            if (mine()) {
                inFlight = null;
                juris.setValue(at("submitting"), false);
            }
            const report = (failure) => console.error(`Juris form "${path}": onSuccess failed after the submit succeeded`, failure);
            try {
                const after = onSuccess?.(result, form);
                if (after && typeof after.then === "function") after.then(undefined, report);
            } catch (failure) {
                report(failure);
            }
            return result;
        },
        dispose: () => {
            for (const dispose of disposers.splice(0)) dispose();
        },
    };
    return form;
}

export default forms;
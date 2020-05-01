"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Context {
    constructor(parentElement, renderer) {
        this.observables = new Set();
        this.childContexts = [];
        this.parentElement = parentElement;
        this.renderer = renderer;
    }
    getPreviousElement() {
        let context = this.previousContext;
        while (context) {
            if (context.lastElement)
                return context.lastElement;
            context = context.previousContext;
        }
        return context;
    }
}
class OnEachContext extends Context {
    newIndex(index) {
    }
}
let currentContext;
class Obs {
    constructor(value = undefined) {
        this.observers = new Set();
        this.data = Obs._valueToData(value);
    }
    /**
     * Return an observable deeper within the tree by resolving each of the
     * arguments as indexes in the objects or arrays, while subscribing to
     * each level.
     * If any level does not exist, undefined is returned.
     */
    ref(...indexes) {
        let obs = this;
        for (let index of indexes) {
            if (currentContext) {
                obs.observers.add(currentContext);
                currentContext.observables.add(obs);
            }
            if (!(obs.data instanceof Map)) {
                return;
            }
            obs = obs.data.get(index);
            if (!obs) {
                return;
            }
        }
        return obs;
    }
    /**
     * Return a sub-observable, creating any intermediate observables if they
     * don't exist yet, triggering observers.
     */
    make(...indexes) {
        let obs = this;
        for (let index of indexes) {
            if (!(obs.data instanceof Map)) {
                obs.data = new Map();
                obs._trigger();
            }
            let next = obs.data.get(index);
            if (!next) {
                next = new Obs();
                obs.data.set(index, next);
                obs._triggerNewIndex(index);
            }
            obs = next;
        }
        return obs;
    }
    /**
     * Return the value for this observable, subscribing to the observable
     * and any nested sub-observables.
     * If the value doesn't exist yet and `defaultValue` is specified, it
     * is set on the observer (triggering other observers) and returned.
     */
    get(defaultValue = undefined) {
        if (this.data === undefined && defaultValue !== undefined) {
            this.set(defaultValue);
        }
        if (currentContext) {
            this.observers.add(currentContext);
        }
        if (this.data instanceof Map) {
            let result = new Map();
            this.data.forEach((k, v) => {
                result.set(k, v instanceof Obs ? v.get() : v);
            });
            return result;
        }
        else {
            return this.data;
        }
    }
    // TODO: Garbage Collect.
    // When doing a set/merge on a map, scan all existing values to see if
    // any have a value of undefined and zero subscribers; delete those from the map.
    // TODO: the iterator should subscribe on the the data not being 'undefined';
    // it doesn't need to trigger on other data changes. Although that would 
    // probably not be much of a problem, as the applications is very likely to
    // do that anyway.
    set(value, merge = false) {
        if (typeof value === 'object' && this.data instanceof Map && value && !(value instanceof Array)) {
            // Both the old and the new value are maps; merge them instead of replacing.
            if (!(value instanceof Map)) {
                // Convert object to map
                let map = new Map();
                for (let k in value) {
                    map.set(k, value[k]);
                }
                value = map;
            }
            // Walk the pairs of the new `value` map
            const data = this.data;
            value.forEach((k, v) => {
                let sub = data.get(k);
                if (sub) {
                    // Update existing item
                    sub.set(v);
                }
                else {
                    // Create a new item
                    data.set(k, new Obs(v));
                    this._triggerNewIndex(k);
                }
            });
            data.forEach((k, v) => {
                // If not merging, set items that are not in `value` to undefined.
                if (!merge && v.data !== undefined && !value.has(k)) {
                    v.data = undefined;
                    v._trigger();
                }
                // Lazily garbage collect items that have value `undefined` 
                // not (or no longer) observed. We cannot remove the key for
                // observed items, because when the value would change back 
                // to something other than `undefined`, a new Obs would be
                // created for it, and the observer would not know about it.
                if (v.data === undefined && !v.observers.size) {
                    // no observers, we can delete it from the map!
                    data.delete(k);
                }
            });
        }
        else {
            let newData = Obs._valueToData(value);
            if (newData !== this.data) {
                this.data = newData;
                this._trigger();
            }
        }
    }
    /**
     * Does the same as merge, but in case of a top-level map, it doesn't
     * delete keys that don't exist in `value`.
     */
    merge(value) {
        this.set(value, true);
    }
    static _valueToData(value) {
        if (value == null)
            return undefined;
        if (typeof value !== "object" || value instanceof Array)
            return value;
        let result = new Map();
        if (value instanceof Map) {
            value.forEach((k, v) => {
                result.set(k, new Obs(v));
            });
        }
        else {
            for (let k in value) {
                result.set(k, new Obs(value[k]));
            }
        }
        return result;
    }
    static makeDefaultSortKey(index) {
        return index;
    }
    onEach(renderer, makeSortKey = Obs.makeDefaultSortKey) {
        if (!(this.data instanceof Map)) {
            if (this.data !== undefined)
                console.warn("onEach expects a map but got", this.data);
            return;
        }
        if (!currentContext)
            throw new Error("onEach is only allowed from a render context");
        let onEachContext = new OnEachContext(currentContext.parentElement, renderer);
        // TODO: if sortKey is undefined, return 0
        // toSortKey from happening
    }
    _trigger() {
        this.observers.forEach((context) => {
        });
    }
    _triggerNewIndex(k) {
        this.observers.forEach((context) => {
            if (context instanceof OnEachContext) {
                context.newIndex(k);
            }
        });
    }
}
function mount(parentElement, renderer) {
    currentContext = new Context(parentElement, renderer);
    currentContext.renderer();
    currentContext = undefined;
}
exports.mount = mount;

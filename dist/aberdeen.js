let queueArray = [];
let queueSet = new Set();
let queueOrdered = true;
let runQueueDepth = 0;
function queue(runner) {
    if (queueSet.has(runner))
        return;
    if (runQueueDepth > 42) {
        throw new Error("Too many recursive updates from observes");
    }
    if (!queueArray.length) {
        setTimeout(runQueue, 0);
    }
    else if (runner.queueOrder < queueArray[queueArray.length - 1].queueOrder) {
        queueOrdered = false;
    }
    queueArray.push(runner);
    queueSet.add(runner);
}
function runQueue() {
    for (let index = 0; index < queueArray.length;) {
        if (!queueOrdered) {
            queueArray.splice(0, index);
            index = 0;
            // Order queued observers by depth, lowest first
            queueArray.sort((a, b) => a.queueOrder - b.queueOrder);
            queueOrdered = true;
        }
        let batchEndIndex = queueArray.length;
        for (; index < batchEndIndex && queueOrdered; index++) {
            let runner = queueArray[index];
            queueSet.delete(runner);
            runner.queueRun();
        }
        runQueueDepth++;
    }
    queueArray.length = 0;
    runQueueDepth = 0;
}
/**
 * Given an integer number, a string or an array of these, this function returns a string that can be used
 * to compare items in a natural sorting order. So `[3, 'ab']` should be smaller than `[3, 'ac']`.
 * The resulting string is guaranteed to never be empty.
 */
function sortKeyToString(key) {
    if (key instanceof Array) {
        return key.map(partToStr).join('');
    }
    else {
        return partToStr(key);
    }
}
function partToStr(part) {
    if (typeof part === 'string') {
        return part + '\x01';
    }
    else {
        let result = numToString(Math.abs(Math.round(part)), part < 0);
        // Prefix the number of digits, counting down from 128 for negative and up for positive
        return String.fromCharCode(128 + (part > 0 ? result.length : -result.length)) + result;
    }
}
function numToString(num, neg) {
    let result = '';
    while (num > 0) {
        /*
        * We're reserving a few character codes:
        * 0 - for compatibility
        * 1 - separator between array items
        * 65535 - for compatibility
        */
        result += String.fromCharCode(neg ? 65535 - (num % 65533) : 2 + (num % 65533));
        num = Math.floor(num / 65533);
    }
    return result;
}
/*
 * Scope
 *
 * A `Scope` is created with a `render` function that is run initially,
 * and again when any of the `Store`s that this function reads are changed. Any
 * DOM elements that is given a `render` function for its contents has its own scope.
 * The `Scope` manages the position in the DOM tree elements created by `render`
 * are inserted at. Before a rerender, all previously created elements are removed
 * and the `clean` functions for the scope and all sub-scopes are called.
 */
class Scope {
    constructor(parentElement, precedingSibling, queueOrder) {
        // The list of clean functions to be called when this scope is cleaned. These can
        // be for child scopes, subscriptions as well as `clean(..)` hooks.
        this.cleaners = [];
        this.isDead = false;
        this.parentElement = parentElement;
        this.precedingSibling = precedingSibling;
        this.queueOrder = queueOrder;
    }
    // Get a reference to the last Node preceding 
    findPrecedingNode() {
        let pre = this.precedingSibling;
        while (pre) {
            if (pre instanceof Node)
                return pre;
            let node = pre.findLastNode();
            if (node)
                return node;
            pre = pre.precedingSibling;
        }
    }
    // Get a reference to the last Node within this scope and parentElement
    findLastNode() {
        if (this.lastChild instanceof Node)
            return this.lastChild;
        if (this.lastChild instanceof Scope)
            return this.lastChild.findLastNode() || this.lastChild.findPrecedingNode();
    }
    addNode(node) {
        if (!this.parentElement)
            throw new ScopeError(true);
        let prevNode = this.findLastNode() || this.findPrecedingNode();
        this.parentElement.insertBefore(node, prevNode ? prevNode.nextSibling : this.parentElement.firstChild);
        this.lastChild = node;
    }
    remove() {
        if (this.parentElement) {
            let lastNode = this.findLastNode();
            if (lastNode) {
                // at least one DOM node to be removed
                let precedingNode = this.findPrecedingNode();
                // Keep removing DOM nodes starting at our last node, until we encounter the preceding node
                // (which can be undefined)
                while (lastNode !== precedingNode) {
                    /* istanbul ignore next */
                    if (!lastNode) {
                        return internalError(1);
                    }
                    let nextLastNode = lastNode.previousSibling || undefined;
                    this.parentElement.removeChild(lastNode);
                    lastNode = nextLastNode;
                }
            }
            this.lastChild = undefined;
        }
        // run cleaners
        this._clean();
    }
    _clean() {
        this.isDead = true;
        for (let cleaner of this.cleaners) {
            cleaner._clean(this);
        }
        this.cleaners.length = 0;
    }
    onChange(index, newData, oldData) {
        queue(this);
    }
}
class SimpleScope extends Scope {
    constructor(parentElement, precedingSibling, queueOrder, renderer) {
        super(parentElement, precedingSibling, queueOrder);
        this.renderer = renderer;
    }
    queueRun() {
        /* istanbul ignore next */
        if (currentScope) {
            internalError(2);
        }
        if (this.isDead)
            return;
        this.remove();
        this.isDead = false;
        this.update();
    }
    update() {
        let savedScope = currentScope;
        currentScope = this;
        try {
            this.renderer();
        }
        catch (e) {
            // Throw the error async, so the rest of the rendering can continue
            handleError(e);
        }
        currentScope = savedScope;
    }
}
class IsEmptyObserver {
    constructor(scope, collection, triggerCount) {
        this.scope = scope;
        this.collection = collection;
        this.triggerCount = triggerCount;
        this.count = collection.getCount();
        collection.addObserver(ANY_INDEX, this);
        scope.cleaners.push(this);
    }
    onChange(index, newData, oldData) {
        if (newData === undefined) {
            // oldData is guaranteed not to be undefined
            if (this.triggerCount || !--this.count)
                queue(this.scope);
        }
        else if (oldData === undefined) {
            if (this.triggerCount || !this.count++)
                queue(this.scope);
        }
    }
    _clean() {
        this.collection.removeObserver(ANY_INDEX, this);
    }
}
class OnEachScope extends Scope {
    constructor(parentElement, precedingSibling, queueOrder, collection, renderer, makeSortKey) {
        super(parentElement, precedingSibling, queueOrder);
        /** The ordered list of currently item scopes */
        this.byPosition = [];
        /** The item scopes in a Map by index */
        this.byIndex = new Map();
        /** Indexes that have been created/removed and need to be handled in the next `queueRun` */
        this.newIndexes = new Set();
        this.removedIndexes = new Set();
        this.collection = collection;
        this.renderer = renderer;
        this.makeSortKey = makeSortKey;
    }
    onChange(index, newData, oldData) {
        if (oldData === undefined) {
            if (this.removedIndexes.has(index)) {
                this.removedIndexes.delete(index);
            }
            else {
                this.newIndexes.add(index);
                queue(this);
            }
        }
        else if (newData === undefined) {
            if (this.newIndexes.has(index)) {
                this.newIndexes.delete(index);
            }
            else {
                this.removedIndexes.add(index);
                queue(this);
            }
        }
    }
    queueRun() {
        if (this.isDead)
            return;
        let indexes = this.removedIndexes;
        this.removedIndexes = new Set();
        indexes.forEach(index => {
            this.removeChild(index);
        });
        indexes = this.newIndexes;
        this.newIndexes = new Set();
        indexes.forEach(index => {
            this.addChild(index);
        });
    }
    _clean() {
        super._clean();
        this.collection.observers.delete(this);
        for (const [index, scope] of this.byIndex) {
            scope._clean();
        }
        // Help garbage collection:
        this.byPosition.length = 0;
        this.byIndex.clear();
    }
    renderInitial() {
        /* istanbul ignore next */
        if (!currentScope) {
            return internalError(3);
        }
        let parentScope = currentScope;
        this.collection.iterateIndexes(this);
        currentScope = parentScope;
    }
    addChild(itemIndex) {
        let scope = new OnEachItemScope(this.parentElement, undefined, this.queueOrder + 1, this, itemIndex);
        this.byIndex.set(itemIndex, scope);
        scope.update();
        // We're not adding a cleaner here, as we'll be calling them from our _clean function
    }
    removeChild(itemIndex) {
        let scope = this.byIndex.get(itemIndex);
        /* istanbul ignore next */
        if (!scope) {
            return internalError(6);
        }
        this.byIndex.delete(itemIndex);
        this.removeFromPosition(scope);
        scope.remove();
    }
    findPosition(sortStr) {
        // In case of duplicate `sortStr`s, this will return the first match.
        let items = this.byPosition;
        let min = 0, max = items.length;
        // Fast-path for elements that are already ordered (as is the case when working with arrays ordered by index)
        if (!max || sortStr > items[max - 1].sortStr)
            return max;
        // Binary search for the insert position		
        while (min < max) {
            let mid = (min + max) >> 1;
            if (items[mid].sortStr < sortStr) {
                min = mid + 1;
            }
            else {
                max = mid;
            }
        }
        return min;
    }
    insertAtPosition(child) {
        let pos = this.findPosition(child.sortStr);
        this.byPosition.splice(pos, 0, child);
        // Based on the position in the list, set the precedingSibling for the new Scope
        child.precedingSibling = pos > 0 ? this.byPosition[pos - 1] : this.precedingSibling;
        // Now set the precedingSibling for the subsequent item to this new Scope
        if (pos + 1 < this.byPosition.length) {
            this.byPosition[pos + 1].precedingSibling = child;
        }
        else {
            this.lastChild = child;
        }
    }
    removeFromPosition(child) {
        if (child.sortStr === '')
            return;
        let pos = this.findPosition(child.sortStr);
        while (true) {
            if (this.byPosition[pos] === child) {
                // Yep, this is the right scope
                this.byPosition.splice(pos, 1);
                if (pos < this.byPosition.length) {
                    this.byPosition[pos].precedingSibling = pos > 0 ? this.byPosition[pos - 1] : this.precedingSibling;
                }
                else {
                    this.lastChild = this.byPosition.length ? this.byPosition[this.byPosition.length - 1] : undefined;
                }
                return;
            }
            // There may be another Scope with the same sortStr
            /* istanbul ignore next */
            if (++pos >= this.byPosition.length || this.byPosition[pos].sortStr !== child.sortStr) {
                return internalError(5);
            }
        }
    }
}
class OnEachItemScope extends Scope {
    constructor(parentElement, precedingSibling, queueOrder, parent, itemIndex) {
        super(parentElement, precedingSibling, queueOrder);
        this.sortStr = "";
        this.parent = parent;
        this.itemIndex = itemIndex;
    }
    queueRun() {
        /* istanbul ignore next */
        if (currentScope) {
            internalError(4);
        }
        if (this.isDead)
            return;
        this.remove();
        this.isDead = false;
        this.update();
    }
    update() {
        // Have the makeSortKey function return an ordering int/string/array.
        // Since makeSortKey may get() the Store, we'll need to set currentScope first.
        let savedScope = currentScope;
        currentScope = this;
        let itemStore = new Store(this.parent.collection, this.itemIndex);
        let sortKey;
        try {
            sortKey = this.parent.makeSortKey(itemStore);
        }
        catch (e) {
            handleError(e);
        }
        let oldSortStr = this.sortStr;
        let newSortStr = sortKey == null ? '' : sortKeyToString(sortKey);
        if (oldSortStr !== '' && oldSortStr !== newSortStr) {
            this.parent.removeFromPosition(this);
        }
        this.sortStr = newSortStr;
        if (newSortStr !== '') {
            if (newSortStr !== oldSortStr) {
                this.parent.insertAtPosition(this);
            }
            try {
                this.parent.renderer(itemStore);
            }
            catch (e) {
                handleError(e);
            }
        }
        currentScope = savedScope;
    }
}
/**
 * This global is set during the execution of a `Scope.render`. It is used by
 * functions like `node`, `text` and `clean`.
 */
let currentScope;
/**
 * A special Node observer index to subscribe to any value in the map changing.
 */
const ANY_INDEX = {};
class ObsCollection {
    constructor() {
        this.observers = new Map();
    }
    addObserver(index, observer) {
        observer = observer;
        let obsSet = this.observers.get(index);
        if (obsSet) {
            if (obsSet.has(observer))
                return false;
            obsSet.add(observer);
        }
        else {
            this.observers.set(index, new Set([observer]));
        }
        return true;
    }
    removeObserver(index, observer) {
        let obsSet = this.observers.get(index);
        obsSet.delete(observer);
    }
    emitChange(index, newData, oldData) {
        let obsSet = this.observers.get(index);
        if (obsSet)
            obsSet.forEach(observer => observer.onChange(index, newData, oldData));
        obsSet = this.observers.get(ANY_INDEX);
        if (obsSet)
            obsSet.forEach(observer => observer.onChange(index, newData, oldData));
    }
    _clean(observer) {
        this.removeObserver(ANY_INDEX, observer);
    }
    setIndex(index, newValue, deleteMissing) {
        const curData = this.rawGet(index);
        if (!(curData instanceof ObsCollection) || newValue instanceof Store || !curData.merge(newValue, deleteMissing)) {
            let newData = valueToData(newValue);
            if (newData !== curData) {
                this.rawSet(index, newData);
                this.emitChange(index, newData, curData);
            }
        }
    }
}
class ObsArray extends ObsCollection {
    constructor() {
        super(...arguments);
        this.data = [];
    }
    getType() {
        return "array";
    }
    getRecursive(depth) {
        if (currentScope) {
            if (this.addObserver(ANY_INDEX, currentScope)) {
                currentScope.cleaners.push(this);
            }
        }
        let result = [];
        for (let i = 0; i < this.data.length; i++) {
            let v = this.data[i];
            result.push(v instanceof ObsCollection ? (depth ? v.getRecursive(depth - 1) : new Store(this, i)) : v);
        }
        return result;
    }
    rawGet(index) {
        return this.data[index];
    }
    rawSet(index, newData) {
        if (index !== (0 | index) || index < 0 || index > 999999) {
            throw new Error(`Invalid array index ${JSON.stringify(index)}`);
        }
        this.data[index] = newData;
        // Remove trailing `undefined`s
        while (this.data.length > 0 && this.data[this.data.length - 1] === undefined) {
            this.data.pop();
        }
    }
    merge(newValue, deleteMissing) {
        if (!(newValue instanceof Array)) {
            return false;
        }
        // newValue is an array
        for (let i = 0; i < newValue.length; i++) {
            this.setIndex(i, newValue[i], deleteMissing);
        }
        if (deleteMissing && this.data.length > newValue.length) {
            for (let i = newValue.length; i < this.data.length; i++) {
                let old = this.data[i];
                if (old !== undefined) {
                    this.emitChange(i, undefined, old);
                }
            }
            this.data.length = newValue.length;
        }
        return true;
    }
    iterateIndexes(scope) {
        for (let i = 0; i < this.data.length; i++) {
            if (this.data[i] !== undefined) {
                scope.addChild(i);
            }
        }
    }
    normalizeIndex(index) {
        if (typeof index === 'number')
            return index;
        if (typeof index === 'string') {
            // Convert to int
            let num = 0 | index;
            // Check if the number is still the same after conversion
            if (index.length && num == index)
                return index;
        }
        throw new Error(`Invalid array index ${JSON.stringify(index)}`);
    }
    getCount() {
        return this.data.length;
    }
}
class ObsMap extends ObsCollection {
    constructor() {
        super(...arguments);
        this.data = new Map();
    }
    getType() {
        return "map";
    }
    getRecursive(depth) {
        if (currentScope) {
            if (this.addObserver(ANY_INDEX, currentScope)) {
                currentScope.cleaners.push(this);
            }
        }
        let result = new Map();
        this.data.forEach((v, k) => {
            result.set(k, (v instanceof ObsCollection) ? (depth ? v.getRecursive(depth - 1) : new Store(this, k)) : v);
        });
        return result;
    }
    rawGet(index) {
        return this.data.get(index);
    }
    rawSet(index, newData) {
        if (newData === undefined) {
            this.data.delete(index);
        }
        else {
            this.data.set(index, newData);
        }
    }
    merge(newValue, deleteMissing) {
        if (!(newValue instanceof Map)) {
            return false;
        }
        // Walk the pairs of the new value map
        newValue.forEach((v, k) => {
            this.setIndex(k, v, deleteMissing);
        });
        if (deleteMissing) {
            this.data.forEach((v, k) => {
                if (!newValue.has(k))
                    this.setIndex(k, undefined, false);
            });
        }
        return true;
    }
    iterateIndexes(scope) {
        this.data.forEach((_, itemIndex) => {
            scope.addChild(itemIndex);
        });
    }
    normalizeIndex(index) {
        return index;
    }
    getCount() {
        return this.data.size;
    }
}
class ObsObject extends ObsMap {
    getType() {
        return "object";
    }
    getRecursive(depth) {
        if (currentScope) {
            if (this.addObserver(ANY_INDEX, currentScope)) {
                currentScope.cleaners.push(this);
            }
        }
        let result = {};
        this.data.forEach((v, k) => {
            result[k] = (v instanceof ObsCollection) ? (depth ? v.getRecursive(depth - 1) : new Store(this, k)) : v;
        });
        return result;
    }
    merge(newValue, deleteMissing) {
        if (!newValue || newValue.constructor !== Object) {
            return false;
        }
        // Walk the pairs of the new value object
        for (let k in newValue) {
            this.setIndex(k, newValue[k], deleteMissing);
        }
        if (deleteMissing) {
            this.data.forEach((v, k) => {
                if (!newValue.hasOwnProperty(k))
                    this.setIndex(k, undefined, false);
            });
        }
        return true;
    }
    normalizeIndex(index) {
        let type = typeof index;
        if (type === 'string')
            return index;
        if (type === 'number')
            return '' + index;
        throw new Error(`Invalid object index ${JSON.stringify(index)}`);
    }
    getCount() {
        let cnt = 0;
        for (let key of this.data)
            cnt++;
        return cnt;
    }
}
/*
* Store
*
* A data store that automatically subscribes the current Scope to updates
* whenever data is read from it.
*
* Supported data types are: `string`, `number`, `boolean`, `undefined`, `null`,
* `Array` and `Map` (all objects including `Array` are converted to `Map`s).
* Map values become separate `Store`s themselves.
*/
export class Store {
    constructor(value = undefined, index = undefined) {
        if (index === undefined) {
            this.collection = new ObsArray();
            this.idx = 0;
            if (value !== undefined) {
                this.collection.rawSet(0, valueToData(value));
            }
        }
        else {
            if (!(value instanceof ObsCollection)) {
                throw new Error("1st parameter should be an ObsCollection if the 2nd is also given");
            }
            this.collection = value;
            this.idx = index;
        }
    }
    /**
     *
     * @returns The index for this Store within its parent collection. This will be a `number`
     * when the parent collection is an array, a `string` when it's an object, or any data type
     * when it's a `Map`.
     *
     * @example
     * ```
     * let store = new Store({x: 123})
     * let subStore = store.ref('x')
     * assert(subStore.get() === 123)
     * assert(subStore.index() === 'x') // <----
     * ```
     */
    index() {
        return this.idx;
    }
    /** @internal */
    _clean(scope) {
        this.collection.removeObserver(this.idx, scope);
    }
    /**
     * @returns Resolves `path` and then retrieves the value that is there, subscribing
     * to all read `Store` values. If `path` does not exist, `undefined` is returned.
     * @param path - Any path terms to resolve before retrieving the value.
     * @example
     * ```
     * let store = new Store({a: {b: {c: {d: 42}}}})
     * assert(store.get('a', 'b') === {c: {d: 42}})
     * ```
     */
    get(...path) {
        return this.query({ path });
    }
    /**
     * @returns The same as [[`get`]], but doesn't subscribe to changes.
     */
    peek(...path) {
        return this.query({ path, peek: true });
    }
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `number`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getNumber(...path) { return this.query({ path, type: 'number' }); }
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `string`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getString(...path) { return this.query({ path, type: 'string' }); }
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `boolean`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getBoolean(...path) { return this.query({ path, type: 'boolean' }); }
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `function`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getFunction(...path) { return this.query({ path, type: 'function' }); }
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `array`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getArray(...path) { return this.query({ path, type: 'array' }); }
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `object`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getObject(...path) { return this.query({ path, type: 'object' }); }
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `map`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getMap(...path) { return this.query({ path, type: 'map' }); }
    /**
     * @returns Like [[`get`]], but the first parameter is the default value (returned when the Store
     * contains `undefined`). This default value is also used to determine the expected type,
     * and to throw otherwise.
     */
    getOr(defaultValue, ...path) {
        let type = typeof defaultValue;
        if (type === 'object') {
            if (defaultValue instanceof Map)
                type = 'map';
            else if (defaultValue instanceof Array)
                type = 'array';
        }
        return this.query({ type, defaultValue, path });
    }
    /** Retrieve a value. This is a more flexible form of the [[`get`]] and [[`peek`]] methods.
     * @returns The resulting value, or `undefined` if the `path` does not exist.
     */
    query(opts) {
        if (opts.peek && currentScope) {
            let savedScope = currentScope;
            currentScope = undefined;
            let result = this.query(opts);
            currentScope = savedScope;
            return result;
        }
        let store = opts.path && opts.path.length ? this.ref(...opts.path) : this;
        let value = store._observe();
        if (opts.type && (value !== undefined || opts.defaultValue === undefined)) {
            let type = (value instanceof ObsCollection) ? value.getType() : (value === null ? "null" : typeof value);
            if (type !== opts.type)
                throw new TypeError(`Expecting ${opts.type} but got ${type}`);
        }
        if (value instanceof ObsCollection) {
            return value.getRecursive(opts.depth == null ? -1 : opts.depth - 1);
        }
        return value === undefined ? opts.defaultValue : value;
    }
    isEmpty(...path) {
        let store = this.ref(...path);
        let value = store._observe();
        if (value instanceof ObsCollection) {
            if (currentScope) {
                let observer = new IsEmptyObserver(currentScope, value, false);
                return !observer.count;
            }
            else {
                return !value.getCount();
            }
        }
        else if (value === undefined) {
            return true;
        }
        else {
            throw new Error(`isEmpty() expects a collection or undefined, but got ${JSON.stringify(value)}`);
        }
    }
    count(...path) {
        let store = this.ref(...path);
        let value = store._observe();
        if (value instanceof ObsCollection) {
            if (currentScope) {
                let observer = new IsEmptyObserver(currentScope, value, true);
                return observer.count;
            }
            else {
                return value.getCount();
            }
        }
        else if (value === undefined) {
            return 0;
        }
        else {
            throw new Error(`count() expects a collection or undefined, but got ${JSON.stringify(value)}`);
        }
    }
    /**
     * Returns "undefined", "null", "boolean", "number", "string", "function", "array", "map" or "object"
     */
    getType(...path) {
        let store = this.ref(...path);
        let value = store._observe();
        return (value instanceof ObsCollection) ? value.getType() : (value === null ? "null" : typeof value);
    }
    /**
     * Sets the Store value to the last given argument. Any earlier argument are a Store-path that is first
     * resolved/created using `makeRef`.
     */
    set(...pathAndValue) {
        let newValue = pathAndValue.pop();
        let store = this.makeRef(...pathAndValue);
        store.collection.setIndex(store.idx, newValue, true);
    }
    /**
     * Sets the `Store` to the given `mergeValue`, but without deleting any pre-existing
     * items when a collection overwrites a similarly typed collection. This results in
     * a deep merge.
     */
    merge(mergeValue) {
        this.collection.setIndex(this.idx, mergeValue, false);
    }
    /**
     * Sets the value for the store to `undefined`, which causes it to be omitted from the map (or array, if it's at the end)
     */
    delete(...path) {
        let store = this.makeRef(...path);
        store.collection.setIndex(store.idx, undefined, true);
    }
    /**
     * Pushes a value to the end of the Array that is at the specified path in the store.
     * If that Store path is `undefined`, and Array is created first.
     * The last argument is the value to be added, any earlier arguments indicate the path.
     */
    push(newValue) {
        let obsArray = this.collection.rawGet(this.idx);
        if (obsArray === undefined) {
            obsArray = new ObsArray();
            this.collection.setIndex(this.idx, obsArray, true);
        }
        else if (!(obsArray instanceof ObsArray)) {
            throw new Error(`push() is only allowed for an array or undefined (which would become an array)`);
        }
        let newData = valueToData(newValue);
        let pos = obsArray.data.length;
        obsArray.data.push(newData);
        obsArray.emitChange(pos, newData, undefined);
        return pos;
    }
    /**
     * [[`peek`]] the current value, pass it through `func`, and [[`set`]] the resulting
     * value.
     * @param func The function transforming the value.
     */
    modify(func) {
        this.set(func(this.query({ peek: true })));
    }
    /**
     * Return a `Store` deeper within the tree by resolving the given `path`,
     * subscribing to every level.
     * In case `undefined` is encountered while resolving the path, a newly
     * created `Store` containing `undefined` is returned. In that case, the
     * `Store`'s [[`isDetached`]] method will return `true`.
     * In case something other than a collection is encountered, an error is thrown.
     */
    ref(...path) {
        let store = this;
        for (let i = 0; i < path.length; i++) {
            let value = store._observe();
            if (value instanceof ObsCollection) {
                store = new Store(value, value.normalizeIndex(path[i]));
            }
            else {
                if (value !== undefined)
                    throw new Error(`Value ${JSON.stringify(value)} is not a collection (nor undefined) in step ${i} of $(${JSON.stringify(path)})`);
                return new DetachedStore();
            }
        }
        return store;
    }
    /**
     * Similar to `ref()`, but instead of returning `undefined`, new objects are created when
     * a path does not exist yet. An error is still thrown when the path tries to index an invalid
     * type.
     * Unlike `ref`, `makeRef` does *not* subscribe to the path levels, as it is intended to be
     * a write-only operation.
     */
    makeRef(...path) {
        let store = this;
        for (let i = 0; i < path.length; i++) {
            let value = store.collection.rawGet(store.idx);
            if (!(value instanceof ObsCollection)) {
                if (value !== undefined)
                    throw new Error(`Value ${JSON.stringify(value)} is not a collection (nor undefined) in step ${i} of $(${JSON.stringify(path)})`);
                value = new ObsObject();
                store.collection.rawSet(store.idx, value);
                store.collection.emitChange(store.idx, value, undefined);
            }
            store = new Store(value, value.normalizeIndex(path[i]));
        }
        return store;
    }
    /** @Internal */
    _observe() {
        if (currentScope) {
            if (this.collection.addObserver(this.idx, currentScope)) {
                currentScope.cleaners.push(this);
            }
        }
        return this.collection.rawGet(this.idx);
    }
    onEach(...pathAndFuncs) {
        let makeSortKey = defaultMakeSortKey;
        let renderer = pathAndFuncs.pop();
        if (typeof pathAndFuncs[pathAndFuncs.length - 1] === 'function' && (typeof renderer === 'function' || renderer == null)) {
            if (renderer != null)
                makeSortKey = renderer;
            renderer = pathAndFuncs.pop();
        }
        if (typeof renderer !== 'function')
            throw new Error(`onEach() expects a render function as its last argument but got ${JSON.stringify(renderer)}`);
        if (!currentScope)
            throw new ScopeError(false);
        let store = this.ref(...pathAndFuncs);
        let val = store._observe();
        if (val instanceof ObsCollection) {
            // Subscribe to changes using the specialized OnEachScope
            let onEachScope = new OnEachScope(currentScope.parentElement, currentScope.lastChild || currentScope.precedingSibling, currentScope.queueOrder + 1, val, renderer, makeSortKey);
            val.addObserver(ANY_INDEX, onEachScope);
            currentScope.cleaners.push(onEachScope);
            currentScope.lastChild = onEachScope;
            onEachScope.renderInitial();
        }
        else if (val !== undefined) {
            throw new Error(`onEach() attempted on a value that is neither a collection nor undefined`);
        }
    }
    /**
     * Applies a filter/map function on each item within the `Store`'s collection,
     * and reactively manages the returned `Map` `Store` to hold any results.
     *
     * @param func - Function that transform the given store into an output value or
     * `undefined` in case this value should be skipped:
     *
     * @returns - A map `Store` with the values returned by `func` and the corresponding
     * keys from the original map, array or object `Store`.
     *
     * When items disappear from the `Store` or are changed in a way that `func` depends
     * upon, the resulting items are removed from the output `Store` as well. When multiple
     * input items produce the same output keys, this may lead to unexpected results.
     */
    map(func) {
        let out = new Store(new Map());
        this.onEach((item) => {
            let value = func(item);
            if (value !== undefined) {
                let key = item.index();
                out.set(key, value);
                clean(() => {
                    out.delete(key);
                });
            }
        });
        return out;
    }
    /*
    * Applies a filter/map function on each item within the `Store`'s collection,
    * each of which can deliver any number of key/value pairs, and reactively manages the
    * returned map `Store` to hold any results.
    *
    * @param func - Function that transform the given store into output values
    * that can take one of the following forms:
    * - an `Object` or a `Map`: Each key/value pair will be added to the output `Store`.
    * - anything else: No key/value pairs are added to the output `Store`.
    *
    * @returns - A map `Store` with the key/value pairs returned by all `func` invocations.
    *
    * When items disappear from the `Store` or are changed in a way that `func` depends
    * upon, the resulting items are removed from the output `Store` as well. When multiple
    * input items produce the same output keys, this may lead to unexpected results.
    */
    multiMap(func) {
        let out = new Store(new Map());
        this.onEach((item) => {
            let result = func(item);
            let keys;
            if (result.constructor === Object) {
                for (let key in result) {
                    out.set(key, result[key]);
                }
                keys = Object.keys(result);
            }
            else if (result instanceof Map) {
                result.forEach((value, key) => {
                    out.set(key, value);
                });
                keys = Array.from(result.keys());
            }
            else {
                return;
            }
            if (keys.length) {
                clean(() => {
                    for (let key of keys) {
                        out.delete(key);
                    }
                });
            }
        });
        return out;
    }
    /**
     * @returns Returns `true` when the `Store` was created by [[`ref`]]ing a path that
     * does not exist.
     */
    isDetached() { return false; }
    /*
    * Dump a live view of the `Store` tree as HTML text, `ul` and `li` nodes at
    * the current mount position. Meant for debugging purposes.
    */
    dump() {
        let type = this.getType();
        if (type === 'array' || type === 'object' || type === 'map') {
            text('<' + type + '>');
            node('ul', () => {
                this.onEach((sub) => {
                    node('li', () => {
                        text(JSON.stringify(sub.index()) + ': ');
                        sub.dump();
                    });
                });
            });
        }
        else {
            text(JSON.stringify(this.get()));
        }
    }
}
class DetachedStore extends Store {
    isDetached() { return true; }
}
/**
 * Create a new DOM element.
 * @param tag - The tag of the element to be created and optionally dot-separated class names. For example: `h1` or `p.intro.has_avatar`.
 * @param rest - The other arguments are flexible and interpreted based on their types:
 *   - `string`: Used as textContent for the element.
 *   - `object`: Used as attributes/properties for the element. See `applyProp` on how the distinction is made.
 *   - `function`: The render function used to draw the scope of the element. This function gets its own `Scope`, so that if any `Store` it reads changes, it will redraw by itself.
 *   - `Store`: Presuming `tag` is `"input"`, `"textarea"` or `"select"`, create a two-way binding between this `Store` value and the input element. The initial value of the input will be set to the initial value of the `Store`. After that, the `Store` will be updated when the input changes.
 * @example
 * node('aside.editorial', 'Yada yada yada....', () => {
 *	 node('a', {href: '/bio'}, () => {
 *		 node('img.author', {src: '/me.jpg', alt: 'The author'})
 *	 })
 * })
 */
export function node(tag = "", ...rest) {
    if (!currentScope)
        throw new ScopeError(true);
    let el;
    if (tag instanceof Element) {
        el = tag;
    }
    else {
        let pos = tag.indexOf('.');
        let classes;
        if (pos >= 0) {
            classes = tag.substr(pos + 1);
            tag = tag.substr(0, pos);
        }
        el = document.createElement(tag || 'div');
        if (classes) {
            // @ts-ignore (replaceAll is polyfilled)
            el.className = classes.replaceAll('.', ' ');
        }
    }
    currentScope.addNode(el);
    for (let item of rest) {
        let type = typeof item;
        if (type === 'function') {
            let scope = new SimpleScope(el, undefined, currentScope.queueOrder + 1, item);
            scope.update();
            // Add it to our list of cleaners. Even if `scope` currently has
            // no cleaners, it may get them in a future refresh.
            currentScope.cleaners.push(scope);
        }
        else if (type === 'string' || type === 'number') {
            el.textContent = item;
        }
        else if (type === 'object' && item && item.constructor === Object) {
            for (let k in item) {
                applyProp(el, k, item[k]);
            }
        }
        else if (item instanceof Store) {
            bindInput(el, item);
        }
        else if (item != null) {
            throw new Error(`Unexpected argument ${JSON.stringify(item)}`);
        }
    }
}
function bindInput(el, store) {
    let updater;
    let type = el.getAttribute('type');
    let value = store.query({ peek: true });
    if (type === 'checkbox') {
        if (value === undefined)
            store.set(el.checked);
        else
            el.checked = value;
        updater = () => store.set(el.checked);
    }
    else if (type === 'radio') {
        if (value === undefined) {
            if (el.checked)
                store.set(el.value);
        }
        else
            el.checked = value === el.value;
        updater = () => {
            if (el.checked)
                store.set(el.value);
        };
    }
    else {
        if (value === undefined)
            store.set(el.value);
        else
            el.value = value;
        updater = () => store.set(el.value);
    }
    el.addEventListener('input', updater);
    clean(() => {
        el.removeEventListener('input', updater);
    });
}
/**
 * Add a text node at the current Scope position.
 */
export function text(text) {
    if (!currentScope)
        throw new ScopeError(true);
    if (text == null)
        return;
    currentScope.addNode(document.createTextNode(text));
}
export function prop(prop, value = undefined) {
    if (!currentScope || !currentScope.parentElement)
        throw new ScopeError(true);
    if (typeof prop === 'object') {
        for (let k in prop) {
            applyProp(currentScope.parentElement, k, prop[k]);
        }
    }
    else {
        applyProp(currentScope.parentElement, prop, value);
    }
}
/**
 * Return the browser Element that `node()`s would be rendered to at this point.
 * NOTE: Manually changing the DOM is not recommended in most cases. There is
 * usually a better, declarative way. Although there are no hard guarantees on
 * how your changes interact with Aberdeen, in most cases results will not be
 * terribly surprising. Be careful within the parent element of onEach() though.
 */
export function getParentElement() {
    if (!currentScope || !currentScope.parentElement)
        throw new ScopeError(true);
    return currentScope.parentElement;
}
/**
 * Register a function that is to be executed right before the current reactive scope
 * disappears or redraws.
 * @param clean - The function to be executed.
 */
export function clean(clean) {
    if (!currentScope)
        throw new ScopeError(false);
    currentScope.cleaners.push({ _clean: clean });
}
/**
 * Create a new reactive scope and execute the `func` within that scope. When
 * `Store`s that the `func` reads are updated, only this scope will need to be refreshed,
 * leaving the parent scope untouched.
 *
 * In case this function is called outside of a an existing scope, it will create a new
 * top-level scope (a [[`Mount`]]) without a `parentElement`, meaning that aberdeen operations
 * that create/modify DOM elements are not permitted.
 * @param func - The function to be (repeatedly) executed within the newly created scope.
 * @returns The newly created `Mount` object in case this is a top-level reactive scope.
 * @example
 * ```
 * let store = new Store('John Doe')
 * mount(document.body, () => {
 *     node('div.card', () => {
 * 	       node('input', {placeholder: 'Name'}, store)
 *         observe(() => {
 * 		       prop('class', {correct: store.get().length > 5})
 * 		   })
 * 	   })
 * })
 * ```
 */
/**
 * Reactively run a function, meaning the function will rerun when any `Store` that was read
 * during its execution is updated.
 * Calls to `observe` can be nested, such that changes to `Store`s read by the inner function do
 * no cause the outer function to rerun.
 *
 * @param func - The function to be (repeatedly) executed.
 * @example
 * ```
 * let number = new Store(0)
 * let doubled = new Store()
 * setInterval(() => number.set(0|Math.random()*100)), 1000)
 *
 * observe(() => {
 *   doubled.set(number.get() * 2)
 * })
 *
 * observe(() => {
 *   console.log(doubled.get())
 * })
 */
export function observe(func) {
    mount(undefined, func);
}
/**
 * Like [[`observe`]], but allow the function to create DOM elements using [[`node`]].

 * @param func - The function to be (repeatedly) executed, possibly adding DOM elements to `parentElement`.
 * @param parentElement - A DOM element that will be used as the parent element for calls to `node`.
 *
 * @example
 * ```
 * let store = new Store(0)
 * setInterval(() => store.modify(v => v+1), 1000)
 *
 * mount(document.body, () => {
 * 	   node('h2', `${store.get()} seconds have passed`)
 * })
 * ```
 *
 * An example nesting [[`observe`]] within `mount`:
 * ```
 * let selected = new Store(0)
 * let colors = new Store(new Map())
 *
 * mount(document.body, () => {
 * 	// This function will never rerun (as it does not read any `Store`s)
 * 	node('button', '<<', {click: () => selected.modify(n => n-1)})
 * 	node('button', '>>', {click: () => selected.modify(n => n+1)})
 *
 * 	observe(() => {
 * 		// This will rerun whenever `selected` changes, recreating the <h2> and <input>.
 * 		node('h2', '#'+selected.get())
 * 		node('input', {type: 'color', value: '#ffffff'}, colors.ref(selected.get()))
 * 	})
 *
 * 	observe(() => {
 * 		// This function will rerun when `selected` or the selected color changes.
 * 		// It will change the <body> background-color.
 * 		prop({style: {backgroundColor: colors.get(selected.get()) || 'white'}})
 * 	})
 * })
 * ```
*/
export function mount(parentElement, func) {
    let scope;
    if (parentElement || !currentScope) {
        scope = new SimpleScope(parentElement, undefined, 0, func);
    }
    else {
        scope = new SimpleScope(currentScope.parentElement, currentScope.lastChild || currentScope.precedingSibling, currentScope.queueOrder + 1, func);
        currentScope.lastChild = scope;
    }
    // Do the initial run
    scope.update();
    // Add it to our list of cleaners. Even if `scope` currently has
    // no cleaners, it may get them in a future refresh.
    if (currentScope) {
        currentScope.cleaners.push(scope);
    }
}
/** Runs the given function, while not subscribing the current scope when reading [[`Store`]] values.
 *
 * @param func Function to be executed immediately.
 * @returns Whatever `func()` returns.
 * @example
 * ```
 * import {Store, peek, text} from aberdeen
 *
 * let store = new Store(['a', 'b', 'c'])
 *
 * mount(document.body, () => {
 *     // Prevent rerender when store changes
 *     peek(() => {
 *         text(`Store has ${store.count()} elements, and the first is ${store.get(0)}`)
 *     })
 * })
 * ```
 *
 * In the above example `store.get(0)` could be replaced with `store.peek(0)` to achieve the
 * same result without `peek()` wrapping everything. There is no non-subscribing equivalent
 * for `count()` however.
 */
export function peek(func) {
    let savedScope = currentScope;
    currentScope = undefined;
    try {
        return func();
    }
    finally {
        currentScope = savedScope;
    }
}
/*
 * Helper functions
 */
function applyProp(el, prop, value) {
    if ((prop === 'class' || prop === 'className') && typeof value === 'object') {
        // Allow setting classes using an object where the keys are the names and
        // the values are booleans stating whether to set or remove.
        for (let name in value) {
            if (value[name])
                el.classList.add(name);
            else
                el.classList.remove(name);
        }
    }
    else if (prop === 'value' || prop === 'className' || prop === 'selectedIndex' || value === true || value === false) {
        // All boolean values and a few specific keys should be set as a property
        el[prop] = value;
    }
    else if (typeof value === 'function') {
        // Set an event listener; remove it again on clean.
        el.addEventListener(prop, value);
        clean(() => el.removeEventListener(prop, value));
    }
    else if (prop === 'style' && typeof value === 'object') {
        // `style` can receive an object
        Object.assign(el.style, value);
    }
    else if (prop === 'text') {
        // `text` is set as textContent
        el.textContent = value;
    }
    else {
        // Everything else is an HTML attribute
        el.setAttribute(prop, value);
    }
}
function valueToData(value) {
    if (typeof value !== "object" || !value) {
        // Simple data types
        return value;
    }
    else if (value instanceof Store) {
        // When a Store is passed pointing at a collection, a reference
        // is made to that collection.
        return value._observe();
    }
    else if (value instanceof Map) {
        let result = new ObsMap();
        value.forEach((v, k) => {
            let d = valueToData(v);
            if (d !== undefined)
                result.rawSet(k, d);
        });
        return result;
    }
    else if (value instanceof Array) {
        let result = new ObsArray();
        for (let i = 0; i < value.length; i++) {
            let d = valueToData(value[i]);
            if (d !== undefined)
                result.rawSet(i, d);
        }
        return result;
    }
    else if (value.constructor === Object) {
        // A plain (literal) object
        let result = new ObsObject();
        for (let k in value) {
            let d = valueToData(value[k]);
            if (d !== undefined)
                result.rawSet(k, d);
        }
        return result;
    }
    else {
        // Any other type of object (including ObsCollection)
        return value;
    }
}
function defaultMakeSortKey(store) {
    return store.index();
}
/* istanbul ignore next */
function internalError(code) {
    let error = new Error("internal error " + code);
    setTimeout(() => { throw error; }, 0);
}
function handleError(e) {
    // Throw the error async, so the rest of the rendering can continue
    setTimeout(() => { throw e; }, 0);
}
class ScopeError extends Error {
    constructor(mount) {
        super(`Operation not permitted outside of ${mount ? "a mount" : "an observe"}() scope`);
    }
}
let arrayFromSet = Array.from || /* istanbul ignore next */ ((set) => {
    let array = [];
    set.forEach(item => array.push(item));
    return array;
});
// @ts-ignore
// istanbul ignore next
if (!String.prototype.replaceAll)
    String.prototype.replaceAll = function (from, to) { return this.split(from).join(to); };

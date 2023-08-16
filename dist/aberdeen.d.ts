interface QueueRunner {
    queueOrder: number;
    queueRun(): void;
}
type SortKeyType = number | string | Array<number | string>;
interface Observer {
    onChange(index: any, newData: DatumType, oldData: DatumType): void;
}
declare abstract class Scope implements QueueRunner, Observer {
    parentElement: Element | undefined;
    queueOrder: number;
    precedingSibling: Node | Scope | undefined;
    lastChild: Node | Scope | undefined;
    cleaners: Array<{
        _clean: (scope: Scope) => void;
    }>;
    isDead: boolean;
    constructor(parentElement: Element | undefined, precedingSibling: Node | Scope | undefined, queueOrder: number);
    findPrecedingNode(): Node | undefined;
    findLastNode(): Node | undefined;
    addNode(node: Node): void;
    remove(): void;
    _clean(): void;
    onChange(index: any, newData: DatumType, oldData: DatumType): void;
    abstract queueRun(): void;
}
declare class OnEachScope extends Scope {
    /** The Node we are iterating */
    collection: ObsCollection;
    /** A function returning a number/string/array that defines the position of an item */
    makeSortKey: (value: Store) => SortKeyType;
    /** A function that renders an item */
    renderer: (itemStore: Store) => void;
    /** The ordered list of currently item scopes */
    byPosition: OnEachItemScope[];
    /** The item scopes in a Map by index */
    byIndex: Map<any, OnEachItemScope>;
    /** Indexes that have been created/removed and need to be handled in the next `queueRun` */
    newIndexes: Set<any>;
    removedIndexes: Set<any>;
    constructor(parentElement: Element | undefined, precedingSibling: Node | Scope | undefined, queueOrder: number, collection: ObsCollection, renderer: (itemStore: Store) => void, makeSortKey: (itemStore: Store) => SortKeyType);
    onChange(index: any, newData: DatumType, oldData: DatumType): void;
    queueRun(): void;
    _clean(): void;
    renderInitial(): void;
    addChild(itemIndex: any): void;
    removeChild(itemIndex: any): void;
    findPosition(sortStr: string): number;
    insertAtPosition(child: OnEachItemScope): void;
    removeFromPosition(child: OnEachItemScope): void;
}
declare class OnEachItemScope extends Scope {
    parent: OnEachScope;
    itemIndex: any;
    sortStr: string;
    constructor(parentElement: Element | undefined, precedingSibling: Node | Scope | undefined, queueOrder: number, parent: OnEachScope, itemIndex: any);
    queueRun(): void;
    update(): void;
}
type DatumType = string | number | Function | boolean | null | undefined | ObsMap | ObsArray;
declare abstract class ObsCollection {
    observers: Map<any, Set<Observer>>;
    addObserver(index: any, observer: Observer): boolean;
    removeObserver(index: any, observer: Observer): void;
    emitChange(index: any, newData: DatumType, oldData: DatumType): void;
    _clean(observer: Observer): void;
    setIndex(index: any, newValue: any, deleteMissing: boolean): void;
    abstract rawGet(index: any): DatumType;
    abstract rawSet(index: any, data: DatumType): void;
    abstract merge(newValue: any, deleteMissing: boolean): void;
    abstract getType(): string;
    abstract getRecursive(depth: number): object | Set<any> | Array<any>;
    abstract iterateIndexes(scope: OnEachScope): void;
    abstract normalizeIndex(index: any): any;
    abstract getCount(): number;
}
declare class ObsArray extends ObsCollection {
    data: Array<DatumType>;
    getType(): string;
    getRecursive(depth: number): any[];
    rawGet(index: any): DatumType;
    rawSet(index: any, newData: DatumType): void;
    merge(newValue: any, deleteMissing: boolean): boolean;
    iterateIndexes(scope: OnEachScope): void;
    normalizeIndex(index: any): any;
    getCount(): number;
}
declare class ObsMap extends ObsCollection {
    data: Map<any, DatumType>;
    getType(): string;
    getRecursive(depth: number): Map<any, any>;
    rawGet(index: any): DatumType;
    rawSet(index: any, newData: DatumType): void;
    merge(newValue: any, deleteMissing: boolean): boolean;
    iterateIndexes(scope: OnEachScope): void;
    normalizeIndex(index: any): any;
    getCount(): number;
}
/**
 * A data store that automatically subscribes the current scope to updates
 * whenever data is read from it.
 *
 * Supported data types are: `string`, `number`, `boolean`, `undefined`, `null`,
 * `Array`, `object` and `Map`. The latter three will always have `Store` objects as
 * values, creating a tree of `Store`s.
 */
export declare class Store {
    private collection;
    private idx;
    /**
     * Create a new store with the given `value` as its value. Defaults to `undefined` if no value is given.
     * When the value is a plain JavaScript object, an `Array` or a `Map`, it will be stored as a tree of
     * `Store`s. (Calling [[`get`]] on the store will recreate the original data strucure, though.)
     *
     * @example
     * ```
     * let emptyStore = new Store()
     * let numStore = new Store(42)
     * let objStore = new Store({x: {alice: 1, bob: 2}, y: [9,7,5,3,1]})
     * ```
    */
    constructor();
    constructor(value: any);
    /** @internal */
    constructor(collection: ObsCollection, index: any);
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
    index(): any;
    /** @internal */
    _clean(scope: Scope): void;
    /**
     * @returns Resolves `path` and then retrieves the value that is there, subscribing
     * to all read `Store` values. If `path` does not exist, `undefined` is returned.
     * @param path - Any path terms to resolve before retrieving the value.
     * @example
     * ```
     * let store = new Store({a: {b: {c: {d: 42}}}})
     * assert('a' in store.get())
     * assert(store.get('a', 'b') === {c: {d: 42}})
     * ```
     */
    get(...path: any[]): any;
    /**
     * Like [[`get`]], but doesn't subscribe to changes.
     */
    peek(...path: any[]): any;
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `number`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getNumber(...path: any[]): number;
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `string`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getString(...path: any[]): string;
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `boolean`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getBoolean(...path: any[]): boolean;
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `function`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getFunction(...path: any[]): (Function);
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `array`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getArray(...path: any[]): any[];
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `object`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getObject(...path: any[]): object;
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `map`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getMap(...path: any[]): Map<any, any>;
    /**
     * Like [[`get`]], but the first parameter is the default value (returned when the Store
     * contains `undefined`). This default value is also used to determine the expected type,
     * and to throw otherwise.
     *
     * @example
     * ```
     * let store = {x: 42}
     * assert(getOr(99, 'x') == 42)
     * assert(getOr(99, 'y') == 99)
     * getOr('hello', x') # throws TypeError (because 42 is not a string)
     * ```
     */
    getOr<T>(defaultValue: T, ...path: any[]): T;
    /** Retrieve a value, subscribing to all read `Store` values. This is a more flexible
     * form of the [[`get`]] and [[`peek`]] methods.
     *
     * @returns The resulting value, or `undefined` if the `path` does not exist.
     */
    query(opts: {
        /**  The value for this path should be retrieved. Defaults to `[]`, meaning the entire `Store`. */
        path?: any[];
        /** A string specifying what type the query is expected to return. Options are:
         *  "undefined", "null", "boolean", "number", "string", "function", "array", "map"
         *  and "object". If the store holds a different type of value, a `TypeError`
         *  exception is thrown. By default (when `type` is `undefined`) no type checking
         *  is done.
         */
        type?: string;
        /** Limit the depth of the retrieved data structure to this positive integer.
        *  When `depth` is `1`, only a single level of the value at `path` is unpacked. This
        *  makes no difference for primitive values (like strings), but for objects, maps and
        *  arrays, it means that each *value* in the resulting data structure will be a
        *  reference to the `Store` for that value.
        */
        depth?: number;
        /** Return this value when the `path` does not exist. Defaults to `undefined`. */
        defaultValue?: any;
        /** When peek is `undefined` or `false`, the current scope will automatically be
         * subscribed to changes of any parts of the store being read. When `true`, no
         * subscribers will be performed.
         */
        peek?: boolean;
    }): any;
    /**
     * Checks if the specified collection is empty, and subscribes the current scope to changes of the emptiness of this collection.
     *
     * @param path Any path terms to resolve before retrieving the value.
     * @returns When the specified collection is not empty `true` is returned. If it is empty or if the value is undefined, `false` is returned.
     * @throws When the value is not a collection and not undefined, an Error will be thrown.
     */
    isEmpty(...path: any[]): boolean;
    /**
     * Returns the number of items in the specified collection, and subscribes the current scope to changes in this count.
     *
     * @param path Any path terms to resolve before retrieving the value.
     * @returns The number of items contained in the collection, or 0 if the value is undefined.
     * @throws When the value is not a collection and not undefined, an Error will be thrown.
     */
    count(...path: any[]): number;
    /**
     * Returns a strings describing the type of the store value, subscribing to changes of this type.
     * Note: this currently also subscribes to changes of primitive values, so changing a value from 3 to 4
     * would cause the scope to be rerun. This is not great, and may change in the future. This caveat does
     * not apply to changes made *inside* an object, `Array` or `Map`.
     *
     * @param path Any path terms to resolve before retrieving the value.
     * @returns Possible options: "undefined", "null", "boolean", "number", "string", "function", "array", "map" or "object".
     */
    getType(...path: any[]): string;
    /**
     * Sets the value to the last given argument. Any earlier argument are a Store-path that is first
     * resolved/created using [[`makeRef`]].
     *
     * When a `Store` is passed in as the value, its value will be copied (subscribing to changes). In
     * case the value is an object, an `Array` or a `Map`, a *reference* to that data structure will
     * be created, so that changes made through one `Store` will be reflected through the other. Be
     * carefull not to create loops in your `Store` tree that way, as that would cause any future
     * call to [[`get`]] to throw a `RangeError` (Maximum call stack size exceeded.)
     *
     * If you intent to make a copy instead of a reference, call [[`get`]] on the origin `Store`.
     *
     *
     * @example
     * ```
     * let store = new Store() // Value is `undefined`
     *
     * store.set('x', 6) // Causes the store to become an object
     * assert(store.get() == {x: 6})
     *
     * store.set('a', 'b', 'c', 'd') // Create parent path as objects
     * assert(store.get() == {x: 6, a: {b: {c: 'd'}}})
     *
     * store.set(42) // Overwrites all of the above
     * assert(store.get() == 42)
     *
     * store.set('x', 6) // Throw Error (42 is not a collection)
     * ```
     */
    set(...pathAndValue: any[]): void;
    /**
     * Sets the `Store` to the given `mergeValue`, but without deleting any pre-existing
     * items when a collection overwrites a similarly typed collection. This results in
     * a deep merge.
     *
     * @example
     * ```
     * let store = new Store({a: {x: 1}})
     * store.merge({a: {y: 2}, b: 3})
     * assert(store.get() == {a: {x: 1, y: 2}, b: 3})
     * ```
     */
    merge(...pathAndValue: any): void;
    /**
     * Sets the value for the store to `undefined`, which causes it to be omitted from the map (or array, if it's at the end)
     *
     * @example
     * ```
     * let store = new Store({a: 1, b: 2})
     * store.delete('a')
     * assert(store.get() == {b: 2})
     *
     * store = new Store(['a','b','c'])
     * store.delete(1)
     * assert(store.get() == ['a', undefined, 'c'])
     * store.delete(2)
     * assert(store.get() == ['a'])
     * ```
     */
    delete(...path: any): void;
    /**
     * Pushes a value to the end of the Array that is at the specified path in the store.
     * If that store path is `undefined`, an Array is created first.
     * The last argument is the value to be added, any earlier arguments indicate the path.
     *
     * @example
     * ```
     * let store = new Store()
     * store.push(3) // Creates the array
     * store.push(6)
     * assert(store.get() == [3,6])
     *
     * store = new Store({myArray: [1,2]})
     * store.push('myArray', 3)
     * assert(store.get() == {myArray: [1,2,3]})
     * ```
     */
    push(...pathAndValue: any[]): number;
    /**
     * [[`peek`]] the current value, pass it through `func`, and [[`set`]] the resulting
     * value.
     * @param func The function transforming the value.
     */
    modify(func: (value: any) => any): void;
    /**
     * Return a `Store` deeper within the tree by resolving the given `path`,
     * subscribing to every level.
     * In case `undefined` is encountered while resolving the path, a newly
     * created `Store` containing `undefined` is returned. In that case, the
     * `Store`'s [[`isDetached`]] method will return `true`.
     * In case something other than a collection is encountered, an error is thrown.
     */
    ref(...path: any[]): Store;
    /**
     * Similar to `ref()`, but instead of returning `undefined`, new objects are created when
     * a path does not exist yet. An error is still thrown when the path tries to index an invalid
     * type.
     * Unlike `ref`, `makeRef` does *not* subscribe to the path levels, as it is intended to be
     * a write-only operation.
     *
     * @example
     * ```
     * let store = new Store() // Value is `undefined`
     *
     * let ref = store.makeRef('a', 'b', 'c')
     * assert(store.get() == {a: {b: {}}}
     *
     * ref.set(42)
     * assert(store.get() == {a: {b: {c: 42}}}
     *
     * ref.makeRef('d') // Throw Error (42 is not a collection)
     * ```
     */
    makeRef(...path: any[]): Store;
    /** @Internal */
    _observe(): DatumType;
    /**
     * Iterate the specified collection (Array, Map or object), running the given code block for each item.
     * When items are added to the collection at some later point, the code block will be ran for them as well.
     * When an item is removed, the [[`clean`]] handlers left by its code block are executed.
     *
     *
     *
     * @param pathAndFuncs
     */
    onEach(...pathAndFuncs: any): void;
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
    map(func: (store: Store) => any): Store;
    /**
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
    multiMap(func: (store: Store) => any): Store;
    /**
     * @returns Returns `true` when the `Store` was created by [[`ref`]]ing a path that
     * does not exist.
     */
    isDetached(): boolean;
    dump(): void;
}
/**
 * Create a new DOM element, and insert it into the DOM at the position held by the current scope.
 * @param tag - The tag of the element to be created and optionally dot-separated class names. For example: `h1` or `p.intro.has_avatar`.
 * @param rest - The other arguments are flexible and interpreted based on their types:
 *   - `string`: Used as textContent for the element.
 *   - `object`: Used as attributes, properties or event listeners for the element. See [[`prop`]] on how the distinction is made.
 *   - `function`: The render function used to draw the scope of the element. This function gets its own `Scope`, so that if any `Store` it reads changes, it will redraw by itself.
 *   - `Store`: Presuming `tag` is `"input"`, `"textarea"` or `"select"`, create a two-way binding between this `Store` value and the input element. The initial value of the input will be set to the initial value of the `Store`, or the other way around if the `Store` holds `undefined`. After that, the `Store` will be updated when the input changes and vice versa.
 * @example
 * node('aside.editorial', 'Yada yada yada....', () => {
 *	 node('a', {href: '/bio'}, () => {
 *		 node('img.author', {src: '/me.jpg', alt: 'The author'})
 *	 })
 * })
 */
export declare function node(tag?: string | Element, ...rest: any[]): void;
/**
 * Convert an HTML string to one or more DOM elements, and add them to the current DOM scope.
 * @param html - The HTML string. For example `"<section><h2>Test</h2><p>Info..</p></section>"`.
 */
export declare function html(html: string): void;
/**
 * Add a text node at the current Scope position.
 */
export declare function text(text: string): void;
/**
 * Set properties and attributes for the containing DOM element. Doing it this way
 * as opposed to setting them directly from node() allows changing them later on
 * without recreating the element itself. Also, code can be more readable this way.
 * Note that when a nested `observe()` is used, properties set this way do NOT
 * automatically revert to their previous values.
 */
export declare function prop(prop: string, value: any): void;
export declare function prop(props: object): void;
/**
 * Return the browser Element that `node()`s would be rendered to at this point.
 * NOTE: Manually changing the DOM is not recommended in most cases. There is
 * usually a better, declarative way. Although there are no hard guarantees on
 * how your changes interact with Aberdeen, in most cases results will not be
 * terribly surprising. Be careful within the parent element of onEach() though.
 */
export declare function getParentElement(): Element;
/**
 * Register a function that is to be executed right before the current reactive scope
 * disappears or redraws.
 * @param clean - The function to be executed.
 */
export declare function clean(clean: (scope: Scope) => void): void;
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
export declare function observe(func: () => void): void;
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
export declare function mount(parentElement: Element | undefined, func: () => void): void;
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
 *     let msg = peek(() => `Store has ${store.count()} elements, and the first is ${store.get(0)}`))
 *     text(msg)
 * })
 * ```
 *
 * In the above example `store.get(0)` could be replaced with `store.peek(0)` to achieve the
 * same result without `peek()` wrapping everything. There is no non-subscribing equivalent
 * for `count()` however.
 */
export declare function peek<T>(func: () => T): T;
export {};

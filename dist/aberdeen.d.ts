interface QueueRunner {
    queueOrder: number;
    queueRun(): void;
}
declare type SortKeyType = number | string | Array<number | string>;
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
declare type DatumType = string | number | Function | boolean | null | undefined | ObsMap | ObsArray;
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
export declare class Store {
    private collection;
    private idx;
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
     * assert(store.get('a', 'b') === {c: {d: 42}})
     * ```
     */
    get(...path: any): any;
    /**
     * @returns The same as [[`get`]], but doesn't subscribe to changes.
     */
    peek(...path: any): any;
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `number`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getNumber(...path: any): number;
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `string`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getString(...path: any): string;
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `boolean`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getBoolean(...path: any): boolean;
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `function`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getFunction(...path: any): (Function);
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `array`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getArray(...path: any): any[];
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `object`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getObject(...path: any): object;
    /**
     * @returns Like [[`get`]], but throws a `TypeError` if the resulting value is not of type `map`.
     * Using this instead of just [[`get`]] is especially useful from within TypeScript.
     */
    getMap(...path: any): Map<any, any>;
    /**
     * @returns Like [[`get`]], but the first parameter is the default value (returned when the Store
     * contains `undefined`). This default value is also used to determine the expected type,
     * and to throw otherwise.
     */
    getOr<T>(defaultValue: T, ...path: any): T;
    /** Retrieve a value. This is a more flexible form of the [[`get`]] and [[`peek`]] methods.
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
        depth?: number;
        /** Return this value when the `path` does not exist. Defaults to `undefined`. */
        defaultValue?: any;
        /** When peek is `undefined` or `false`, the current scope will automatically be
         * subscribed to changes of any parts of the store being read. When `true`, no
         * subscribers will be performed.
         */
        peek?: boolean;
    }): any;
    isEmpty(...path: any): boolean;
    count(...path: any): number;
    /**
     * Returns "undefined", "null", "boolean", "number", "string", "function", "array", "map" or "object"
     */
    getType(...path: any): string;
    /**
     * Sets the Store value to the last given argument. Any earlier argument are a Store-path that is first
     * resolved/created using `makeRef`.
     */
    set(...pathAndValue: any): void;
    /**
     * Sets the `Store` to the given `mergeValue`, but without deleting any pre-existing
     * items when a collection overwrites a similarly typed collection. This results in
     * a deep merge.
     */
    merge(mergeValue: any): void;
    /**
     * Sets the value for the store to `undefined`, which causes it to be omitted from the map (or array, if it's at the end)
     */
    delete(...path: any): void;
    /**
     * Pushes a value to the end of the Array that is at the specified path in the store.
     * If that Store path is `undefined`, and Array is created first.
     * The last argument is the value to be added, any earlier arguments indicate the path.
     */
    push(newValue: any): number;
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
     */
    makeRef(...path: any[]): Store;
    /** @Internal */
    _observe(): DatumType;
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
    multiMap(func: (store: Store) => any): Store;
    /**
     * @returns Returns `true` when the `Store` was created by [[`ref`]]ing a path that
     * does not exist.
     */
    isDetached(): boolean;
    dump(): void;
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
export declare function node(tag?: string | Element, ...rest: any[]): void;
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
export declare function peek<T>(func: () => T): T;
export {};

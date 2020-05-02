

/*
 * QueueRunner
 *
 * `queue()`d runners are executed on the next timer tick, by order of their
 * `queueOrder` values.
 */

interface QueueRunner {
    queueOrder: number
    queueRun(): void
}

let queueRunners: Set<QueueRunner> = new Set()

function queue(qu: QueueRunner) {
    if (!queueRunners.size) {
        setTimeout(runQueue, 0)
    }
    queueRunners.add(qu)
}

function runQueue(): void {
    // Order queued observers by depth, lowest first
    // TODO: polyfill Array.from for IE11
    let ordered = Array.from(queueRunners)
    ordered.sort((a,b) => a.queueOrder - b.queueOrder)

    for(let observer of ordered) {
        queueRunners.delete(observer)
        let size = queueRunners.size

        observer.queueRun()
        
        if (queueRunners.size !== size) {
            // The queue was modified. We'll need to sort it again.
            return runQueue()
        }
    }
}



/*
 * Observers
 *
 * A `Observer` subscribes to changes in data `Store`s. There's a
 * distinction between new indexes being added to a pre-existing map (`onNewIndex`),
 * and all other types of changes (`onChange`).
 * 
 * The Context class (see below) is the most common observer; it will cause
 * a new run of its renderer `onChange`. It will not react to `onNewIndex`.
 * 
 * There are two other Observer implementations, that both have a reference to
 * the Context they are working on. They cause different behaviour on events
 * than the default imlementation. The `OnEachObserver` is used to add items
 * to a list without redrawing the entire list `onNewIndex`. The `GetAllObserver`
 * causes the entire context to rerender `onNewIndex`. This is needed when a `.get()`
 * is performed on a map.
 */

interface Observer {
    onChange(): void
    onNewIndex(index: any): void
}

class OnEachObserver implements Observer, QueueRunner {
    context: Context
    newIndexes: any[] = []
    queueOrder: number
    store: Store

    constructor(context: Context, store: Store, depth: number) {
        this.context = context
        this.store = store
        this.queueOrder = depth
    }

    onChange() {
        // Have the context schedule a refresh
        this.context.onChange()
    }

    onNewIndex(index: any) {
        this.newIndexes.push(index)
        queue(this)
    }

    queueRun() {
        if (this.context.flags & Context.DEAD) return
        // TODO!
    }

    _clean() {
        this.store.observers.delete(this)
    }
}

class GetAllObserver implements Observer {
    context: Context
    store: Store

    constructor(context: Context, store: Store) {
        this.context = context
        this.store = store
    }

    onChange() {
        // Have the context schedule a refresh
        this.context.onChange()
    }

    onNewIndex(index: any) {
        // Have the context schedule a refresh
        this.context.onChange()
    }

    _clean() {
        this.store.observers.delete(this)
    }
}



/*
 * Context
 *
 * A `Context` is created with a `render` function that is run initially,
 * and again when any of the `Store`s that this function reads are changed. Any
 * DOM elements that is given a `render` function for its contents has its own context.
 * The `Context` manages the position in the DOM tree elements created by `render`
 * are inserted at. Before a rerender, all previously created elements are removed 
 * and the `clean` functions for the context and all sub-contexts are called.
 */

class Context implements Observer, QueueRunner {
    renderer: () => void
    parentElement: HTMLElement

    // How deep is this context nested in other contexts; we use this to make sure events
    // at lower depths are handled before events at higher depths.
    queueOrder: number
    
    // The node or context right before this context that has the same `parentElement`
    precedingSibling: Node | Context | undefined

    // The last child node or context within this context that has the same `parentElement`
    lastChild: Node | Context | undefined 

    // The list of clean functions to be called when this context is cleaned. These can
    // be for child contexts, subscriptions as well as `clean(..)` hooks.
    cleaners: Array<{_clean: (context: Context) => void}> = [] 
    

    flags: number = 0
    static TRIGGERED = 1 // currently in the `triggered` array
    static DEAD = 2 // cleaned

    constructor(
        parentElement: HTMLElement,
        precedingSibling: Node | Context | undefined,
        renderer: () => void,
        depth: number
    ) {
        this.parentElement = parentElement
        this.precedingSibling = precedingSibling
        this.renderer = renderer
        this.queueOrder = depth
    }

    // Get a reference to the last Node within this context and parentElement
    findLastNode(): Node | undefined {
        if (this.lastChild instanceof Node) return this.lastChild
        if (this.lastChild instanceof Context) {
            let node = this.lastChild.findLastNode()
            if (node) return node
        }
    }

    findPrecedingNode(): Node | undefined {
        let pre = this.precedingSibling
        while(pre) {
            if (pre instanceof Node) return pre
            let node = pre.findLastNode()
            if (node) return node
            pre = pre.precedingSibling
        }
    }

    addNode(node: Node) {
        let prevNode = this.findLastNode()
        this.parentElement.insertBefore(node, prevNode ? prevNode.nextSibling : this.parentElement.firstChild)
        this.lastChild = node
    }

    remove() {
        let lastNode: Node | undefined = this.findLastNode()

        if (lastNode) {
            // at least one DOM node to be removed

            let precedingNode = this.findPrecedingNode()

            // Keep removing DOM nodes starting at our last node, until we encounter the preceding node
            // (which can be undefined)
            while(lastNode !== precedingNode) {
                if (!lastNode) return internalError(1)

                let nextLastNode: Node | undefined = lastNode.previousSibling || undefined
                this.parentElement.removeChild(lastNode)
                lastNode = nextLastNode
            }
        }
        this.lastChild = undefined

        // run cleaners
        this._clean()
    }

    _clean() {
        this.flags |= Context.DEAD
        for(let cleaner of this.cleaners) {
            cleaner._clean(this)
        }
    }

    onChange() {
        queue(this)
    }

    onNewIndex(index: any) {
        // We can ignore new keys being added to a map, we just rely on the
        // map staying a map (otherwise onChange would be triggered). Of course
        // we may also be subscribed on the values of specific keys.
    }

    queueRun() {
        if (currentContext) internalError(2)

        if (this.flags & Context.DEAD) return

        this.remove()
        this.flags = this.flags & (~Context.DEAD)

        currentContext = this
        this.renderer()
        currentContext = undefined
    }
}

/**
 * This global is set during the execution of a `Context.render`. It is used by
 * functions like `node`, `text` and `clean`.
 */
let currentContext: Context | undefined;



/*
 * Store
 *
 * A data store that automatically subscribes the current Context to updates
 * whenever data is read from it.
 * 
 * Supported data types are: `string`, `number`, `boolean`, `undefined` (`null`
 * is mapped to `undefined`), `Array` and `Map` (all objects except `Array` are
 * converted to `Map`s). Map values become separate `Store`s themselves.
 */


export class Store {
    data: string | number | boolean | undefined | Array<any> | Map<any,Store>
    observers: Set<Observer> = new Set()

    constructor(value: any = undefined) {
        this.data = Store._valueToData(value)
    }

    /**
     * Return an store deeper within the tree by resolving each of the
     * arguments as Map indexes, while subscribing to each level.
     * If any level does not exist, undefined is returned.
     */
    ref(...indexes : Array<any>): Store | undefined {
        let obs: Store | undefined = this
        for(let index of indexes) {
            obs._addObserver()
            if (!(obs.data instanceof Map)) {
                return;
            }
            obs = obs.data.get(index);
            if (!obs) {
                return
            }
        }
        return obs;
    }

    /**
     * Return a sub-store, creating any intermediate Map stores if they
     * don't exist yet, triggering observers.
     */
    make(...indexes : Array<any>): Store {
        let obs: Store = this
        for(let index of indexes) {
            if (!(obs.data instanceof Map)) {
                obs.data = new Map();
                obs._emitChange();
            }
            let next = obs.data.get(index);
            if (!next) {
                next = new Store();
                obs.data.set(index, next);
                obs._emitNewIndex(index);
            }
            obs = next;
        }
        return obs;
    }

    /**
     * Return the value for this store, subscribing to the store and any nested sub-stores.
     * 
     * @param defaultValue - If the value doesn't exist yet and `defaultValue` is specified, it is set on the observer (triggering other observers) and returned.
     * @param useMaps - When this argument is `true`, objects are represented as Maps. By default, they are plain old JavaScript objects.
     */
    get(defaultValue = undefined, useMaps = false): any {
        if (this.data===undefined && defaultValue!==undefined) {
            this.set(defaultValue);
        }

        if (this.data instanceof Map) {
            if (currentContext) {
                let observer = new GetAllObserver(currentContext, this)
                currentContext.cleaners.push(observer)
                this.observers.add(observer)
            }
            if (useMaps) {
                let result: Map<any,any> = new Map()
                this.data.forEach((v: any, k: any) => {
                    if (v instanceof Store) {
                        if (v.data!==undefined) result.set(k, v.get(undefined, true));
                    } else {
                        result.set(k, v);
                    }
                })
                return result
            } else {
                let result: any = {};
                this.data.forEach((v: any, k: any) => {
                    if (v instanceof Store) {
                        if (v.data!==undefined) result[k] = v.get();
                    } else {
                        result[k] = v;
                    }
                })
                return result
            }
        } else {
            this._addObserver()
            return this.data
        }
    }

    // TODO: the iterator should subscribe on the the data not being 'undefined';
    // it doesn't need to trigger on other data changes. Although that would 
    // probably not be much of a problem, as the applications is very likely to
    // do that anyway.

    set(value: any, merge: boolean = false): void {
        
        if (typeof value==='object' && this.data instanceof Map && value && !(value instanceof Array)) {
            // Both the old and the new value are maps; merge them instead of replacing.

            if (!(value instanceof Map)) {
                // Convert object to map
                let map = new Map();
                for(let k in value) {
                    map.set(k, value[k]);
                }
                value = map;
            }

            // Walk the pairs of the new `value` map
            const data: Map<any,Store> = this.data;
            
            value.forEach((v: any, k: any) => {
                let sub = data.get(k);
                if (sub) {
                    // Update existing item
                    sub.set(v);
                } else {
                    // Create a new item
                    data.set(k, new Store(v));
                    this._emitNewIndex(k);
                }
            })

            data.forEach((v: any, k: Store) => {
                // If not merging, set items that are not in `value` to undefined.
                if (!merge && v.data!==undefined && !value.has(k)) {
                    v.data = undefined;
                    v._emitChange();
                }
                // Lazily garbage collect items that have value `undefined` 
                // not (or no longer) observed. We cannot remove the key for
                // observed items, because when the value would change back 
                // to something other than `undefined`, a new Obs would be
                // created for it, and the observer would not know about it.
                if (v.data===undefined && !v.observers.size) {
                    // no observers, we can delete it from the map!
                    data.delete(k);
                }
            });

        } else {
            let newData = Store._valueToData(value)
            if (newData !== this.data) {
                this.data = newData
                this._emitChange()
            }
        }
    }

    /**
     * Sets the value for the store to `undefined`, which causes it to be ommitted from any Maps it is part of.
     */
    delete() {
        this.set(undefined);
    }

    /**
     * Does the same as merge, but in case of a top-level map, it doesn't
     * delete keys that don't exist in `value`.
     */
    merge(value: any): void {
        this.set(value, true);
    }

    onEach(renderer: any, makeSortKey: (index: any, value: Store) => string = Store._makeDefaultSortKey) {
        if (!(this.data instanceof Map)) {
            if (this.data!==undefined) console.warn("onEach expects a map but got", this.data)
            return
        }

        if (!currentContext) throw new Error("onEach is only allowed from a render context")

        //let onEachContext = new OnEachContext(currentContext.parentElement, renderer);

        // TODO: if sortKey is undefined, return 0
        // toSortKey from happening
    }
    

    static _valueToData(value: any) {
        if (value==null) return undefined
        if (typeof value !== "object" || value instanceof Array) return value

        let result: Map<any,any> = new Map()
        if (value instanceof Map) {
            value.forEach((v,k) => {
                result.set(k, new Store(v))
            })
        } else {
            for(let k in value) {
                result.set(k, new Store(value[k]))
            }
        }
        return result;
    }

    static _makeDefaultSortKey(index: any) {
        return index
    }

    _addObserver() {
        if (currentContext && !this.observers.has(currentContext)) {
            this.observers.add(currentContext)
            currentContext.cleaners.push(this)
        }
    }

    _clean(context: Context) {
        this.observers.delete(context)
    }

    _emitChange() {
        this.observers.forEach((observer: Observer) => {
            observer.onChange()
        })

    }

    _emitNewIndex(k: any) {
        this.observers.forEach((observer: Observer) => {
            observer.onNewIndex(k)
        })
    }
}


/**
 * Create a new DOM element.
 * @param tagClass - The tag of the element to be created and optionally dot-seperated class names. For example: `h1` or `p.intro.has_avatar`.
 * @param rest - The other arguments are flexible and interpreted based on their types:
 *   - `string`: Used as textContent for the element.
 *   - `object`: Used as attributes/properties for the element. See `applyProp` on how the distinction is made.
 *   - `function`: The render function used to draw the context of the element. This function gets its own `Context`, so that if any `Store` it reads changes, it will redraw by itself.
 * @example
 * node('aside.editorial', 'Yada yada yada....', () => {
 *     node('a', {href: '/bio'}, () => {
 *         node('img.author', {src: '/me.jpg', alt: 'The author'})
 *     })
 * })
 */
export function node(tagClass: string, ...rest: any[]) {
    if (!currentContext) throw new Error(`node() outside of a render context`)

    let el;
    if (tagClass.indexOf('.')>=0) {
        let classes = tagClass.split('.')
        let tag = <string>classes.shift()
        el = document.createElement(tag)
        el.className = classes.join(' ')
    } else {
        el = document.createElement(tagClass);
    }

    currentContext.addNode(el)

    for(let item of rest) {
        if (typeof item === 'function') {
            let context = new Context(el, undefined, item, currentContext.queueOrder+1)

            let savedContext: Context = currentContext
            currentContext = context
            currentContext.renderer()
            currentContext = savedContext

            // Add it to our list of cleaners. Even if `context` currently has
            // no cleaners, it may get them in a future refresh.
            currentContext.cleaners.push(context)
        } else if (typeof item === 'string') {
            el.textContent = item;
        } else if (typeof item === 'object' && item) {
            for(let k in item) {
                applyProp(el, k, item[k])
            }
        }
    }
}

/**
 * Add a text node at the current Context position.
 */
export function text(text: string) {
    if (!currentContext) throw  new Error(`text() outside of a render context`)
    currentContext.addNode(document.createTextNode(text))
}

/**
 * Set properties and attributes for the containing DOM element. Doing it this way
 * as opposed to setting them directly from node() allows changing them later on
 * without recreating the element itself. Also, code can be more readible this way.
 */
export function prop(prop: string, value: any): void
export function prop(props: object): void

export function prop(prop: any, value: any = undefined) {
    if (!currentContext) throw  new Error(`prop() outside of a render context`)
    if (typeof prop === 'object') {
        for(let k in prop) {
            applyProp(currentContext.parentElement, k, prop[k])
        }
    } else {
        applyProp(currentContext.parentElement, prop, value)
    }
}

/**
 * Register a `clean` function that is executed when the current `Context` disappears or redraws.
 */
export function clean(clean: (context: Context) => void) {
    if (!currentContext) throw new Error(`clean() outside of a render context`)
    currentContext.cleaners.push({_clean: clean})
}

/**
 * Main entry point for using aberdeen. The elements created by the given `render` function are appended to `parentElement` (and updated when read `Store`s change).
 * @param parentElement - The DOM element to append to.
 * @param renderer - The function that does the rendering.
 * @example
 * mount(document.body, () => {
 *     node('h1', 'Hello world!', () => {
 *         node('img.logo', {src: '/logo.png'})
 *     })
 * })
 */
export function mount(parentElement: HTMLElement, renderer: () => void) {
    currentContext = new Context(parentElement, undefined, renderer, 0)
    currentContext.renderer()
    currentContext = undefined
}


/*
 * Helper functions
 */

function applyProp(el: HTMLElement, prop: any, value: any) {
    if (prop==='value' || prop==='className' || prop==='selectedIndex' || value===true || value===false) {
        // All boolean values and a few specific keys should be set as a property
        (el as any)[prop] = value
    } else if (prop==='style' && typeof value === 'object') {
        // `style` can receive an object
        Object.assign(el.style, value);
    } else if (prop==='text') {
        // `text` is set as textContent
        el.textContent = value
    } else {
        // Everything else is an HTML attribute
        el.setAttribute(prop, value)
    }
}

function internalError(code: number) {
    console.error(new Error("internal error "+code))
}


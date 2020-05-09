

/*
 * QueueRunner
 *
 * `queue()`d runners are executed on the next timer tick, by order of their
 * `queueOrder` values.
 */


interface QueueRunner {
    queueOrder: number
    queueRun(): void
    // TODO: assign each QueueRunner an ascending id, so they can be executed in order
    // of creating, in case the queueOrders are the same? 
}

let queued: Set<QueueRunner> = new Set()

function queue(runner: QueueRunner) {
    if (!queued.size) {
        setTimeout(runQueue, 0)
    }
    queued.add(runner)
}

function runQueue(): void {
    // Order queued observers by depth, lowest first
    // TODO: polyfill Array.from for IE11
    let ordered = Array.from(queued)
    ordered.sort((a,b) => a.queueOrder - b.queueOrder)

    for(let runner of ordered) {
        queued.delete(runner)
        let size = queued.size

        runner.queueRun()
        
        if (queued.size !== size) {
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
 * The Scope class (see below) is the most common observer; it will cause
 * a new run of its renderer `onChange`. It will not react to `onNewIndex`.
 * 
 * There are two other Observer implementations, that both have a reference to
 * the Scope they are working on. They cause different behaviour on events
 * than the default imlementation. The `OnEachObserver` is used to add items
 * to a list without redrawing the entire list `onNewIndex`. The `GetAllObserver`
 * causes the entire scope to rerender `onNewIndex`. This is needed when a `.get()`
 * is performed on a map.
 */

interface Observer {
    onChange(index: any, oldValue: DatumType): void
}

interface OnEachItem {
    index: any
    scope: Scope
    sortStr: string
}

type SortKeyType = number | string | Array<number|string>


/**
 * Given an integer number, a string or an array of these, this function returns a string that can be used
 * to compare items in a natural sorting order. So `[3, 'ab']` should be smaller than `[3, 'ac']`.
 */
export function sortKeyToString(key: SortKeyType) {
    if (key instanceof Array) {
        return key.map(partToStr).join('\x01')
    } else {
        return partToStr(key)
    }

    function partToStr(part: number|string): string {
        if (typeof part === 'string') {
            return part
        } else {
            let result = positiveToString(Math.abs(Math.round(part)))
            // Prefix the number of digits, counting down from 128 for negative and up for positive
            return String.fromCharCode(128 + (part>0 ? result.length : -result.length))
        }
    }

    function positiveToString(num: number): string {
        let result = ''
        while(num > 0) {
            /*
            * We're reserving a few character codes:
            * 0 - for compatibility
            * 1 - separator between array items
            * 65535 - for compatibility
            */
            result += String.fromCharCode(2 + (num % 65533))
            num = Math.floor(num / 65533)
        }
        return result
    }
}



class OnEachObserver implements Observer, QueueRunner {

    /** The Node we are iterating */
    obsMap: ObsMap

    /** The scope containing the onEach as a whole */
    scope: Scope

    makeSortKey: (value: Store, index: any) => SortKeyType

    renderer: () => void

    /** The list of currently observing map items */
    items: OnEachItem[] = []

    /** Indexes that have been created and need to be handled in the next `queueRun` */
    newIndexes: any[] = []

    /** Our priority for QueueRunner */
    queueOrder: number
    

    constructor(
        scope: Scope,
        obsMap: ObsMap,
        renderer: () => void,
        makeSortKey: (value: Store, index: any) => SortKeyType,
        queueOrder: number
    ) {
        this.scope = scope
        this.obsMap = obsMap
        this.renderer = renderer
        this.makeSortKey = makeSortKey
        this.queueOrder = queueOrder
    }

    onChange(index: any, oldValue: any) {
        if (oldValue===undefined) {
            // a new index!
            this.newIndexes.push(index)
            queue(this)
        }
    }

    queueRun() {
        if (this.scope.flags & Scope.DEAD) return
        // TODO!
    }

    _clean() {
        this.obsMap.observers.delete(this)
    }

    renderInitial() {
        let savedScope = currentScope

        this.obsMap.forEach((_, itemIndex) => {
            currentScope = new Scope(this.scope.parentElement, undefined, this.renderer, this.scope.queueOrder+1)

            let itemStore = new Store(this.obsMap, itemIndex)
            let sortKey = this.makeSortKey(itemStore, itemIndex)

            if (sortKey!=null) {
                let sortStr = sortKeyToString(sortKey)
                let pos = this.insertItem({
                    index: itemIndex,
                    scope: currentScope,
                    sortStr: sortStr,
                })
                currentScope.precedingSibling = pos>0 ? this.items[pos-1].scope : (this.scope.lastChild || this.scope.precedingSibling)
                return
            }

            // TODO: insert into different list?
        })

        currentScope = savedScope
        
        // TODO: if sortKey is undefined, return 0
        // toSortKey from happening
    }

    insertItem(item: OnEachItem) {
        // Binary search for the insert position
        let items = this.items
        let sortStr = item.sortStr
        let min = 0, max = this.items.length-1
        while(min<max) {
            let mid = (min+max)>>1
            if (items[mid].sortStr < sortStr) {
                min = mid+1
            } else {
                max = mid-1
            }
        }
        this.items.splice(min, 0, item)
        return min
    }

}

class GetAllObserver implements Observer {
    scope: Scope
    node: ObsMap

    constructor(scope: Scope, node: ObsMap) {
        this.scope = scope
        this.node = node
    }

    onChange() {
        // Have the scope schedule a refresh
        this.scope.onChange()
    }

    _clean() {
        this.node.observers.delete(this)
    }
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

class Scope implements Observer, QueueRunner {
    renderer: () => void
    parentElement: HTMLElement

    // How deep is this scope nested in other scopes; we use this to make sure events
    // at lower depths are handled before events at higher depths.
    queueOrder: number
    
    // The node or scope right before this scope that has the same `parentElement`
    precedingSibling: Node | Scope | undefined

    // The last child node or scope within this scope that has the same `parentElement`
    lastChild: Node | Scope | undefined 

    // The list of clean functions to be called when this scope is cleaned. These can
    // be for child scopes, subscriptions as well as `clean(..)` hooks.
    cleaners: Array<{_clean: (scope: Scope) => void}> = [] 
    

    flags: number = 0
    static DEAD = 2 // cleaned

    constructor(
        parentElement: HTMLElement,
        precedingSibling: Node | Scope | undefined,
        renderer: () => void,
        queueOrder: number
    ) {
        this.parentElement = parentElement
        this.precedingSibling = precedingSibling
        this.renderer = renderer
        this.queueOrder = queueOrder
    }

    // Get a reference to the last Node preceding 
    findPrecedingNode(): Node | undefined {
        let pre = this.precedingSibling
        while(pre) {
            if (pre instanceof Node) return pre
            let node = pre.findLastNode()
            if (node) return node
            pre = pre.precedingSibling
        }
    }

    // Get a reference to the last Node within this scope and parentElement
    findLastNode(): Node | undefined {
        if (this.lastChild instanceof Node) return this.lastChild
        if (this.lastChild instanceof Scope) return this.lastChild.findPrecedingNode();
    }

    addNode(node: Node) {
        let prevNode = this.findLastNode() || this.findPrecedingNode()

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
        this.flags |= Scope.DEAD
        for(let cleaner of this.cleaners) {
            cleaner._clean(this)
        }
    }

    onChange() {
        queue(this)
    }

    queueRun() {
        if (currentScope) internalError(2)

        if (this.flags & Scope.DEAD) return

        this.remove()
        this.flags = this.flags & (~Scope.DEAD)

        currentScope = this
        try {
            this.renderer()
        } catch(e) {
            throw e
        } finally {
            currentScope = undefined
        }
    }
}

/**
 * This global is set during the execution of a `Scope.render`. It is used by
 * functions like `node`, `text` and `clean`.
 */
let currentScope: Scope | undefined;

/**
 * A special Node observer index to subscribe to any value in the map changing.
 */
const ANY_INDEX = {}


type DatumType = string | number | boolean | undefined | Array<any> | ObsMap


export class ObsMap extends Map<any, DatumType> {
     observers: Map<any, Set<Observer>> = new Map()

     addObserver(index: any, observer: Observer) {
        observer = observer
        let obsSet = this.observers.get(index)
        if (obsSet) {
            if (obsSet.has(observer)) return false
            obsSet.add(observer)
        } else {
            this.observers.set(index, new Set([observer]))
        }
        return true
    }

    emitChange(index: any, oldValue: DatumType) {
        let obsSet = this.observers.get(index)
        if (obsSet) obsSet.forEach(observer => observer.onChange(index, oldValue))
        obsSet = this.observers.get(ANY_INDEX)
        if (obsSet) obsSet.forEach(observer => observer.onChange(index, oldValue))
    }

    getTree(useMaps: boolean) {
        if (currentScope) {
            let observer = new GetAllObserver(currentScope, this)
            this.addObserver(ANY_INDEX, observer)
            currentScope.cleaners.push(observer)
        }
        if (useMaps) {
            let result: Map<any,any> = new Map()
            this.forEach((v: any, k: any) => {
                result.set(k, (v instanceof ObsMap) ? v.getTree(true) : v)
            })
            return result
        } else {
            let result: any = {};
            this.forEach((v: any, k: any) => {
                result[k] = (v instanceof ObsMap) ? v.getTree(useMaps) : v
            })
            return result
        }
    }

    setTree(index: any, newValue: any, merge: boolean): void {

        const curData = this.get(index)
        
        if (curData instanceof ObsMap && typeof newValue==='object' && newValue && !(newValue instanceof Array)) {
            // Both the old and the new value are maps; merge them instead of replacing.

            if (newValue instanceof Map) {
                // Walk the pairs of the new value map
                newValue.forEach((v: any, k: any) => {
                    curData.setTree(k, v, merge)
                })

                if (!merge) {
                    curData.forEach((v: any, k: Store) => {
                        if (!newValue.has(k)) curData.setTree(k, undefined, false)
                    })
                }
            } else {
                // Walk the pairs of the new value object
                for(let k in newValue) {
                    curData.setTree(k, newValue[k], merge)
                }

                if (!merge) {
                    curData.forEach((v: any, k: Store) => {
                        if (!newValue.hasOwnProperty(k)) curData.setTree(k, undefined, false)
                    })
                }
            }
        } else {
            let newData = Store._valueToData(newValue)
            if (newData !== curData) {
                if (newData===undefined) {
                    this.delete(index)
                } else {
                    this.set(index, newData)
                }
                this.emitChange(index, curData)
            }
        }
    }

 }


 /*
 * Store
 *
 * A data store that automatically subscribes the current Scope to updates
 * whenever data is read from it.
 * 
 * Supported data types are: `string`, `number`, `boolean`, `undefined` (`null`
 * is mapped to `undefined`), `Array` and `Map` (all objects except `Array` are
 * converted to `Map`s). Map values become separate `Store`s themselves.
 */

export class Store {

    map: ObsMap
    index: any

    constructor(obsMap: ObsMap, index: any)
    constructor(value: any)

    constructor(value: any, index: any = '') {
        if (value instanceof ObsMap) {
            this.map = value;
            this.index = index;
        } else {
            this.map = new ObsMap()
            this.index = ''
            if (value!=null) {
                this.map.set('', Store._valueToData(value))
            }
        }
    }

    observe() {
        if (currentScope) {
            if (this.map.addObserver(this.index, currentScope)) {
                currentScope.cleaners.push(this)
            }
        }
    }


    _clean(scope: Scope) {
        let obsSet = <Set<Observer>>this.map.observers.get(this.index)
        obsSet.delete(scope)
    }

    /**
     * Return an store deeper within the tree by resolving each of the
     * arguments as Map indexes, while subscribing to each level.
     * If any level does not exist, undefined is returned.
     */
    ref(...indexes : Array<any>): Store | undefined {

        let store: Store = this

        for(let nextIndex of indexes) {
            store.observe()
            let value = store.map.get(store.index)
            if (!(value instanceof ObsMap)) {
                return
            }
            store = new Store(value, nextIndex)
        }

        return store
    }


    /**
     * Return a sub-store, creating any intermediate Map stores if they
     * don't exist yet, triggering observers.
     */
    make(...indexes : Array<any>): Store {

        let {map, index} = this;

        for(let nextIndex of indexes) {
            let value = map.get(index)
            if (!(value instanceof ObsMap)) {
                map.emitChange(index, value)
                value = new ObsMap()
                map.set(index, value)
            }
            map = value
            index = nextIndex
        }

        return new Store(map, index)
    }

    /**
     * Return the value for this store, subscribing to the store and any nested sub-stores.
     * 
     * @param defaultValue - 
     * @param useMaps - When this argument is `true`, objects are represented as Maps. By default, they are plain old JavaScript objects.
     */
    get(useMaps = false): any {
        this.observe()
        let val = this.map.get(this.index);
        
        if (val instanceof ObsMap) {
            return val.getTree(useMaps)
        } else {
            return val
        }
    }


    set(newValue: any, merge: boolean = false): void {
        this.map.setTree(this.index, newValue, merge)
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

    onEach(renderer: any, makeSortKey: (index: any, value: Store) => SortKeyType = Store._makeDefaultSortKey): void {
        if (!currentScope) throw new Error("onEach() is only allowed from a render scope")

        this.observe()
        let val = this.map.get(this.index);
        
        if (val instanceof ObsMap) {
            // Subscribe to changes using the specialized OnEachObserver
            let onEachObserver = new OnEachObserver(currentScope, val, renderer, makeSortKey, currentScope.queueOrder+1);
            val.addObserver(ANY_INDEX, onEachObserver)
            currentScope.cleaners.push(onEachObserver)

            onEachObserver.renderInitial()
        } else if (val!==undefined) {
            throw new Error(`onEach() attempted on a value that is neither a Map/object nor undefined`)
        }
    }
    

    static _valueToData(value: any) {
        if (value==null) return undefined
        if (typeof value !== "object" || value instanceof Array) return value

        let result: ObsMap = new ObsMap()
        if (value instanceof Map) {
            value.forEach((v,k) => {
                result.set(k, Store._valueToData(v))
            })
        } else {
            for(let k in value) {
                result.set(k, Store._valueToData(value[k]))
            }
        }
        return result;
    }

    static _makeDefaultSortKey(index: any) {
        return index
    }

}


/**
 * Create a new DOM element.
 * @param tagClass - The tag of the element to be created and optionally dot-seperated class names. For example: `h1` or `p.intro.has_avatar`.
 * @param rest - The other arguments are flexible and interpreted based on their types:
 *   - `string`: Used as textContent for the element.
 *   - `object`: Used as attributes/properties for the element. See `applyProp` on how the distinction is made.
 *   - `function`: The render function used to draw the scope of the element. This function gets its own `Scope`, so that if any `Store` it reads changes, it will redraw by itself.
 * @example
 * node('aside.editorial', 'Yada yada yada....', () => {
 *     node('a', {href: '/bio'}, () => {
 *         node('img.author', {src: '/me.jpg', alt: 'The author'})
 *     })
 * })
 */
export function node(tagClass: string, ...rest: any[]) {
    if (!currentScope) throw new Error(`node() outside of a render scope`)

    let el;
    if (tagClass.indexOf('.')>=0) {
        let classes = tagClass.split('.')
        let tag = <string>classes.shift()
        el = document.createElement(tag)
        el.className = classes.join(' ')
    } else {
        el = document.createElement(tagClass);
    }

    currentScope.addNode(el)

    for(let item of rest) {
        if (typeof item === 'function') {
            let scope = new Scope(el, undefined, item, currentScope.queueOrder+1)

            let savedScope: Scope = currentScope
            currentScope = scope
            currentScope.renderer()
            currentScope = savedScope

            // Add it to our list of cleaners. Even if `scope` currently has
            // no cleaners, it may get them in a future refresh.
            currentScope.cleaners.push(scope)
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
 * Add a text node at the current Scope position.
 */
export function text(text: string) {
    if (!currentScope) throw  new Error(`text() outside of a render scope`)
    currentScope.addNode(document.createTextNode(text))
}

/**
 * Set properties and attributes for the containing DOM element. Doing it this way
 * as opposed to setting them directly from node() allows changing them later on
 * without recreating the element itself. Also, code can be more readible this way.
 */
export function prop(prop: string, value: any): void
export function prop(props: object): void

export function prop(prop: any, value: any = undefined) {
    if (!currentScope) throw  new Error(`prop() outside of a render scope`)
    if (typeof prop === 'object') {
        for(let k in prop) {
            applyProp(currentScope.parentElement, k, prop[k])
        }
    } else {
        applyProp(currentScope.parentElement, prop, value)
    }
}



/**
 * Register a `clean` function that is executed when the current `Scope` disappears or redraws.
 */
export function clean(clean: (scope: Scope) => void) {
    if (!currentScope) throw new Error(`clean() outside of a render scope`)
    currentScope.cleaners.push({_clean: clean})
}

/**
 * Create a new Scope and execute the `renderer` within that Scope. When 
 * `Store`s that the `renderer` reads are updated, only this Scope will
 * need to be refreshed, leaving the parent Scope untouched.
 */
export function scope(renderer: () => void) {
    if (!currentScope) throw new Error(`scope() outside of a render scope`)
    let parentScope = currentScope
    currentScope = new Scope(parentScope.parentElement, parentScope.lastChild || parentScope.precedingSibling, renderer, parentScope.queueOrder+1)
    parentScope.lastChild = currentScope
    currentScope.renderer()
    currentScope = parentScope
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
    if (currentScope) throw new Error('mount() from within a render scope')
    currentScope = new Scope(parentElement, undefined, renderer, 0)
    try {
        currentScope.renderer()
    } catch(e) {
        throw e
    } finally {
        currentScope = undefined
    }
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


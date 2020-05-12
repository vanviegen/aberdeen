

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
    let ordered: QueueRunner[]
    if (Array.from) {
        ordered = Array.from(queued)
    } else { // IE 11
        ordered = []
        queued.forEach(item => ordered.push(item))
    }
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



type SortKeyType = number | string | Array<number|string>


/**
 * Given an integer number, a string or an array of these, this function returns a string that can be used
 * to compare items in a natural sorting order. So `[3, 'ab']` should be smaller than `[3, 'ac']`.
 * The resulting string is guaranteed to never be empty.
 */
export function sortKeyToString(key: SortKeyType) {
    if (key instanceof Array) {
        return key.map(partToStr).join('')
    } else {
        return partToStr(key)
    }

    function partToStr(part: number|string): string {
        if (typeof part === 'string') {
            return part + '\x01'
        } else {
            let result = numToString(Math.abs(Math.round(part)), part<0)
            // Prefix the number of digits, counting down from 128 for negative and up for positive
            return String.fromCharCode(128 + (part>0 ? result.length : -result.length)) + result
        }
    }

    function numToString(num: number, neg: boolean): string {
        let result = ''
        while(num > 0) {
            /*
            * We're reserving a few character codes:
            * 0 - for compatibility
            * 1 - separator between array items
            * 65535 - for compatibility
            */
            result += String.fromCharCode(neg ? 65535 - (num % 65533) : 2 + (num % 65533))
            num = Math.floor(num / 65533)
        }
        return result
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

abstract class Scope implements QueueRunner {
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

    isDead: boolean = false

    constructor(
        parentElement: HTMLElement,
        precedingSibling: Node | Scope | undefined,
        queueOrder: number,
    ) {
        this.parentElement = parentElement
        this.precedingSibling = precedingSibling
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
        if (this.lastChild instanceof Scope) return this.lastChild.findLastNode() || this.lastChild.findPrecedingNode();
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
                /* istanbul ignore next */ 
                if (!lastNode) {
                    return internalError(1)
                }

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
        this.isDead = true
        for(let cleaner of this.cleaners) {
            cleaner._clean(this)
        }
    }

    onChange(index: any, newData: DatumType, oldData: DatumType) {
        queue(this)
    }

    abstract queueRun(): void
}

class SimpleScope extends Scope {
    renderer: () => void

    constructor(
        parentElement: HTMLElement,
        precedingSibling: Node | Scope | undefined,
        queueOrder: number,
        renderer: () => void,
    ) {
        super(parentElement, precedingSibling, queueOrder)
        this.renderer = renderer
    }

    queueRun() {
        /* istanbul ignore next */
        if (currentScope) { 
            internalError(2)
        }

        if (this.isDead) return
        this.remove()
        this.isDead = false

        this.update()
    }

    update() {
        let savedScope = currentScope
        currentScope = this
        try {
            this.renderer()
        } catch(e) {
            // Throw the error async, so the rest of the rendering can continue
            handleError(e)
        }
        currentScope = savedScope
    }
}

class OnEachScope extends Scope {

    /** The Node we are iterating */
    obsMap: ObsMap

    /** A function returning a number/string/array that defines the position of an item */
    makeSortKey: (value: Store) => SortKeyType

    /** A function that renders an item */
    renderer: (itemStore: Store) => void

    /** The ordered list of currently item scopes */
    byPosition: OnEachItemScope[] = []

    /** The item scopes in a Map by index */
    byIndex: Map<any, OnEachItemScope> = new Map()

    /** Indexes that have been created/removed and need to be handled in the next `queueRun` */
    newIndexes: Set<any> = new Set()
    removedIndexes: Set<any> = new Set()

    constructor(
        parentElement: HTMLElement,
        precedingSibling: Node | Scope | undefined,
        queueOrder: number,
        obsMap: ObsMap,
        renderer: (itemStore: Store) => void,
        makeSortKey: (itemStore: Store) => SortKeyType
    ) {
        super(parentElement, precedingSibling, queueOrder)
        this.obsMap = obsMap
        this.renderer = renderer
        this.makeSortKey = makeSortKey
    }

    onChange(index: any, newData: DatumType, oldData: DatumType) {
        if (oldData===undefined) {
            if (this.removedIndexes.has(index)) {
                this.removedIndexes.delete(index)
            } else {
                this.newIndexes.add(index)
                queue(this)
            }
        } else if (newData===undefined) {
            if (this.newIndexes.has(index)) {
                this.newIndexes.delete(index)
            } else {
                this.removedIndexes.add(index)
                queue(this)
            }
        }
    }

    queueRun() {
        if (this.isDead) return

        let indexes = this.removedIndexes
        this.removedIndexes = new Set()
        indexes.forEach(index => {
            this.removeChild(index)
        })

        indexes = this.newIndexes
        this.newIndexes = new Set()
        indexes.forEach(index => {
            this.addChild(index)
        })
    }

    _clean() {
        super._clean()
        this.obsMap.observers.delete(this)
        for(let item of this.byPosition) {
            item._clean()
        }

        // Help garbage collection:
        this.byPosition.length = 0
        this.byIndex.clear()
    }

    renderInitial() {
        /* istanbul ignore next */
        if (!currentScope) { 
            return internalError(3)
        }
        let parentScope = currentScope

        this.obsMap.forEach((_, itemIndex) => {
            this.addChild(itemIndex)
        })

        currentScope = parentScope
    }

    addChild(itemIndex: any) {
        let scope = new OnEachItemScope(this.parentElement, undefined, this.queueOrder+1, this, itemIndex)
        this.byIndex.set(itemIndex, scope)
        scope.update()
        // We're not adding a cleaner here, as we'll be calling them from our _clean function
    }

    removeChild(itemIndex: any) {
        let scope = this.byIndex.get(itemIndex)
        /* istanbul ignore next */
        if (!scope) { 
            return internalError(6)  
        } 
        this.byIndex.delete(itemIndex)
        this.removeFromPosition(scope)
        scope.remove()
    }

    findPosition(sortStr: string) {
        // Binary search for the insert position
        let items = this.byPosition
        let min = 0, max = this.byPosition.length
        while(min<max) {
            let mid = (min+max)>>1
            if (items[mid].sortStr < sortStr) {
                min = mid+1
            } else {
                max = mid
            }
        }
        return min
    }

    insertAtPosition(child: OnEachItemScope) {
        let pos = this.findPosition(child.sortStr)
        this.byPosition.splice(pos, 0, child)

        // Based on the position in the list, set the precedingSibling for the new Scope
        child.precedingSibling = pos>0 ? this.byPosition[pos-1] : this.precedingSibling

        // Now set the precedingSibling for the subsequent item to this new Scope
        if (pos+1 < this.byPosition.length) {
            this.byPosition[pos+1].precedingSibling = child
        } else {
            this.lastChild = child
        }
    }

    removeFromPosition(child: OnEachItemScope) {
        let pos = this.findPosition(child.sortStr)
        while(true) {
            if (this.byPosition[pos] === child) {
                // Yep, this is the right scope
                this.byPosition.splice(pos, 1)
                if (pos < this.byPosition.length) {
                    this.byPosition[pos].precedingSibling = pos>0 ? this.byPosition[pos-1] : this.precedingSibling
                } else {
                    this.lastChild = this.byPosition.length ? this.byPosition[this.byPosition.length-1] : undefined
                }
                return
            }
            // There may be another Scope with the same sortStr
            /* istanbul ignore next */
            if (++pos >= this.byPosition.length || this.byPosition[pos].sortStr !== child.sortStr) {
                return internalError(5)
            }
        }
    }
}


class OnEachItemScope extends Scope {
    parent: OnEachScope
    itemIndex: any
    sortStr: string = ""

    constructor(
        parentElement: HTMLElement,
        precedingSibling: Node | Scope | undefined,
        queueOrder: number,
        parent: OnEachScope,
        itemIndex: any
    ) {
        super(parentElement, precedingSibling, queueOrder)
        this.parent = parent
        this.itemIndex = itemIndex
    }

    queueRun() {
        /* istanbul ignore next */
        if (currentScope) { 
            internalError(4)
        }

        if (this.isDead) return
        this.remove()
        this.isDead = false

        this.update()
    }

    update() {
        // Have the makeSortKey function return an ordering int/string/array.
        // Since makeSortKey may get() the Store, we'll need to set currentScope first.
        let savedScope = currentScope
        currentScope = this

        let itemStore = new Store(this.parent.obsMap, this.itemIndex)

        let sortKey
        try {
            sortKey = this.parent.makeSortKey(itemStore) // TODO: catch
        } catch(e) {
            handleError(e)
        }

        let oldSortStr: string = this.sortStr
        let newSortStr: string = sortKey ? sortKeyToString(sortKey) : '' 

        if (oldSortStr!=='' && oldSortStr!==newSortStr) {
            this.parent.removeFromPosition(this)
        }

        this.sortStr = newSortStr
        if (newSortStr!=='') {
            if (newSortStr !== oldSortStr) {
                this.parent.insertAtPosition(this)
            }
            try {
                this.parent.renderer(itemStore)
            } catch(e) {
                handleError(e)
            }
        }

        currentScope = savedScope
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


type DatumType = string | number | Function | boolean | undefined | Array<any> | ObsMap


export class ObsMap extends Map<any, DatumType> {
     observers: Map<any, Set<Scope>> = new Map()

     addObserver(index: any, observer: Scope) {
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

    removeObserver(index: any, observer: Scope) {
        let obsSet = <Set<Scope>>this.observers.get(index)
        obsSet.delete(observer)
    }

    emitChange(index: any, newData: DatumType, oldData: DatumType) {
        let obsSet = this.observers.get(index)
        if (obsSet) obsSet.forEach(observer => observer.onChange(index, newData, oldData))
        obsSet = this.observers.get(ANY_INDEX)
        if (obsSet) obsSet.forEach(observer => observer.onChange(index, newData, oldData))
    }

    getTree(useMaps: boolean) {
        if (currentScope) {
            if (this.addObserver(ANY_INDEX, currentScope)) {
                currentScope.cleaners.push(this)
            }
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

    _clean(observer: Scope) {
        this.removeObserver(ANY_INDEX, observer)
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
                this.emitChange(index, newData, curData)
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

    private map: ObsMap
    private idx: any

    constructor(obsMap: ObsMap, index: any)
    constructor(value: any)

    constructor(value: any, index: any = '') {
        if (value instanceof ObsMap) {
            this.map = value;
            this.idx = index;
        } else {
            this.map = new ObsMap()
            this.idx = ''
            if (value!=null) {
                this.map.set('', Store._valueToData(value))
            }
        }
    }

    index() {
        return this.idx
    }

    observe() {
        if (currentScope) {
            if (this.map.addObserver(this.idx, currentScope)) {
                currentScope.cleaners.push(this)
            }
        }
        return this.map.get(this.idx)
    }


    _clean(scope: Scope) {
        this.map.removeObserver(this.idx, scope)
    }

    /**
     * Return an store deeper within the tree by resolving each of the
     * arguments as Map indexes, while subscribing to each level.
     * If any level does not exist, undefined is returned.
     */
    ref(...indexes : Array<any>): Store | undefined {

        let store: Store = this

        for(let nextIndex of indexes) {
            let value = store.observe()
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

        let {map, idx: index} = this;

        for(let nextIndex of indexes) {
            let value = map.get(index)
            if (!(value instanceof ObsMap)) {
                let newValue = new ObsMap()
                map.set(index, newValue)
                map.emitChange(index, newValue, value)
                value = newValue
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
        let value = this.observe()
        if (value instanceof ObsMap) {
            return value.getTree(useMaps)
        } else {
            return value
        }
    }

    /**
     * Returns "undefined", "boolean", "number", "string", "function", "array" or "object".
     */
    getType(): any {
        let value = this.observe()
        let type = typeof value
        if (value && type === 'object') return value instanceof Array ? "array" : "object"
        return type
    }

    /**
     * Return the value of this Store as a number. If is has a different type, an error is thrown.
     * If the Store contains `undefined` and a defaultValue is given, it is returned instead.
     */
    getNumber(defaultValue?: number): number {
        let value = this.observe()
        if (typeof value === 'number') return value
        if (value === undefined && defaultValue!==undefined) return defaultValue
        throw this.getTypeError('number', value)
    }

    /**
     * Return the value of this Store as a string. If is has a different type, an error is thrown.
     * If the Store contains `undefined` and a defaultValue is given, it is returned instead.
     */
    getString(defaultValue?: string): string {
        let value = this.observe()
        if (typeof value === 'string') return value
        if (value === undefined && defaultValue!==undefined) return defaultValue
        throw this.getTypeError('string', value)
    }

    /**
     * Return the value of this Store as a boolean. If is has a different type, an error is thrown.
     * If the Store contains `undefined` and a defaultValue is given, it is returned instead.
     */
    getBoolean(defaultValue?: boolean): boolean {
        let value = this.observe()
        if (typeof value === 'boolean') return value
        if (value === undefined && defaultValue!==undefined) return defaultValue
        throw this.getTypeError('boolean', value)
    }

    /**
     * Return the value of this Store as an Array. If is has a different type, an error is thrown.
     * If the Store contains `undefined` and a defaultValue is given, it is returned instead.
     */
    getArray(defaultValue?: any[]): any[] {
        let value = this.observe()
        if (value instanceof Array) return value
        if (value === undefined && defaultValue!==undefined) return defaultValue
        throw this.getTypeError('array', value)
    }

    /**
     * Return the value of this Store as an object. If the it contains anything other than a
     * Map, an error is thrown. If the Store contains `undefined` and a defaultValue is given,
     * it is returned instead.
     */
    getObject(defaultValue?: {[index: string]: Store}): { [index: string]: Store } {
        const value = this.observe()
        if (value instanceof ObsMap) {
            let result: { [index: string]: Store } = {}
            value.forEach((_, index: any) => {
                result[index] = new Store(value, index)
            })
            return result
        }
        if (value === undefined && defaultValue!==undefined) return defaultValue
        throw this.getTypeError('map', value)
    }

    /**
     * Return the value of this Store as a Map. If the it contains anything other than a
     * Map, an error is thrown. If the Store contains `undefined` and a defaultValue is given,
     * it is returned instead.
     */
    getMap(defaultValue?: Map<any,Store>): Map<any,Store> {
        const value = this.observe()
        if (value instanceof ObsMap) {
            let result: Map<any,Store> = new Map()
            value.forEach((_, index: any) => {
                result.set(index, new Store(value, index))
            })
            return result
        }
        if (value === undefined && defaultValue!==undefined) return defaultValue
        throw this.getTypeError('map', value)
    }

    private getTypeError(type: string, value: any) {
        if (value === undefined) {
            return new Error(`Expecting ${type} but got undefined, an no default value was given`)
        } else {
            return new Error(`Expecting ${type} but got ${value instanceof ObsMap ? value.getTree(false) : JSON.stringify(value)}`)
        }
    }


    set(newValue: any, merge: boolean = false): void {
        this.map.setTree(this.idx, newValue, merge)
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

    onEach(renderer: (store: Store) => void, makeSortKey: (value: Store) => SortKeyType = Store._makeDefaultSortKey): void {
        if (!currentScope) throw new Error("onEach() is only allowed from a render scope")

        let val = this.observe()
        
        if (val instanceof ObsMap) {
            // Subscribe to changes using the specialized OnEachScope
            let onEachScope = new OnEachScope(currentScope.parentElement, currentScope.lastChild || currentScope.precedingSibling, currentScope.queueOrder+1, val, renderer, makeSortKey)
            val.addObserver(ANY_INDEX, onEachScope)

            currentScope.cleaners.push(onEachScope)
            currentScope.lastChild = onEachScope

            onEachScope.renderInitial()
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

    static _makeDefaultSortKey(store: Store) {
        return store.index()
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
        let type = typeof item
        if (type === 'function') {
            let scope = new SimpleScope(el, undefined, currentScope.queueOrder+1, item)
            scope.update()

            // Add it to our list of cleaners. Even if `scope` currently has
            // no cleaners, it may get them in a future refresh.
            currentScope.cleaners.push(scope)
        } else if (type === 'string' || type === 'number') {
            el.textContent = item;
        } else if (type === 'object' && item && item.constructor === Object) {
            for(let k in item) {
                applyProp(el, k, item[k])
            }
        } else if (type != null) {
            throw new Error(`Unexpected argument ${JSON.stringify(type)}`)
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
    
    let scope = new SimpleScope(currentScope.parentElement, currentScope.lastChild || currentScope.precedingSibling, currentScope.queueOrder+1, renderer)
    currentScope.lastChild = scope
    scope.update()

    // Add it to our list of cleaners. Even if `scope` currently has
    // no cleaners, it may get them in a future refresh.
    currentScope.cleaners.push(scope)
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

class Mount {
    scope: Scope

    constructor(scope: Scope) {
        this.scope = scope
    }

    unmount() {
        this.scope.remove()
    }
}

export function mount(parentElement: HTMLElement, renderer: () => void) {
    if (currentScope) throw new Error('mount() from within a render scope')
    let scope = new SimpleScope(parentElement, undefined, 0, renderer)
    scope.update()
    return new Mount(scope)
}

export function peek(func: () => void) {
    let savedScope = currentScope
    currentScope = undefined
    try {
        return func()
    } finally {
        currentScope = savedScope
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

function handleError(e: Error) {
    console.error(e)
    // Throw the error async, so the rest of the rendering can continue
    setTimeout(() => {throw e}, 0)
}
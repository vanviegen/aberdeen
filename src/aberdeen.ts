

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



interface Observer {
    onChange(index: any, newData: DatumType, oldData: DatumType): void
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

abstract class Scope implements QueueRunner, Observer {
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
    collection: ObsCollection

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
        collection: ObsCollection,
        renderer: (itemStore: Store) => void,
        makeSortKey: (itemStore: Store) => SortKeyType
    ) {
        super(parentElement, precedingSibling, queueOrder)
        this.collection = collection
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
        this.collection.observers.delete(this)
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

        this.collection.iterateIndexes(this)

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
        let items = this.byPosition
        let min = 0, max = this.byPosition.length
        
        // Fast-path for elements that are already ordered (as is the case when working with arrays ordered by index)
        if (!max || sortStr > items[max-1].sortStr) return max

        // Binary search for the insert position        
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

        let itemStore = new Store(this.parent.collection, this.itemIndex)

        let sortKey
        try {
            sortKey = this.parent.makeSortKey(itemStore) // TODO: catch
        } catch(e) {
            handleError(e)
        }

        let oldSortStr: string = this.sortStr
        let newSortStr: string = sortKey==null ? '' : sortKeyToString(sortKey)

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


type DatumType = string | number | Function | boolean | null | undefined | ObsMap | ObsArray


abstract class ObsCollection {
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

   removeObserver(index: any, observer: Observer) {
       let obsSet = <Set<Observer>>this.observers.get(index)
       obsSet.delete(observer)
   }

   emitChange(index: any, newData: DatumType, oldData: DatumType) {
       let obsSet = this.observers.get(index)
       if (obsSet) obsSet.forEach(observer => observer.onChange(index, newData, oldData))
       obsSet = this.observers.get(ANY_INDEX)
       if (obsSet) obsSet.forEach(observer => observer.onChange(index, newData, oldData))
   }

   _clean(observer: Observer) {
        this.removeObserver(ANY_INDEX, observer)
    }

    setIndex(index: any, newValue: any, deleteMissing: boolean): void {
        const curData = this.rawGet(index)

        if (!(curData instanceof ObsCollection) || newValue instanceof Store || !curData.merge(newValue, deleteMissing)) {
            let newData = valueToData(newValue)
            if (newData !== curData) {
                this.rawSet(index, newData)
                this.emitChange(index, newData, curData)
            }
        }
    }

    abstract rawGet(index: any): DatumType
    abstract rawSet(index: any, data: DatumType): void
    abstract merge(newValue: any, deleteMissing: boolean): void
    abstract getType(): string
    abstract getRecursive(depth: number): object | Set<any> | Array<any>
    abstract iterateIndexes(scope: OnEachScope): void
    abstract normalizeIndex(index: any): any
}


class ObsArray extends ObsCollection {
    data: Array<DatumType> = []

    getType() {
        return "array"
    }

    getRecursive(depth: number) {
        
        if (currentScope) {
            if (this.addObserver(ANY_INDEX, currentScope)) {
                currentScope.cleaners.push(this)
            }
        }
        let result: any[] = []
        for(let i=0; i<this.data.length; i++) {
            let v = this.data[i]
            result.push(v instanceof ObsCollection ? (depth ? v.getRecursive(depth-1) : new Store(this,i)) : v)
        }
        return result
    }

    rawGet(index: any): DatumType {
        return this.data[index]
    }

    rawSet(index: any, newData: DatumType): void {
        if (index !== (0|index) || index<0 || index>99999) {
            throw new Error(`Invalid array index ${JSON.stringify(index)}`)
        }
        this.data[index] = newData
        // Remove trailing `undefined`s
        while(this.data.length>0 && this.data[this.data.length-1]===undefined) {
            this.data.pop()
        }
    }

    merge(newValue: any, deleteMissing: boolean): boolean {
        if (!(newValue instanceof Array)) {
            return false
        }
        // newValue is an array

        for(let i=0; i<newValue.length; i++) {
            this.setIndex(i, newValue[i], deleteMissing)
        }

        if (deleteMissing && this.data.length > newValue.length) {
            for(let i=newValue.length; i<this.data.length; i++) {
                let old = this.data[i]
                if (old!==undefined) {
                    this.emitChange(i, undefined, old)
                }
            }
            this.data.length = newValue.length
        }
        return true
    }


    iterateIndexes(scope: OnEachScope): void {
        for(let i=0; i<this.data.length; i++) {
            scope.addChild(i)
        }
    }

    normalizeIndex(index: any): any {
        if (typeof index==='number') return index
        if (typeof index==='string') {
            // Convert to int
            let num = 0 | <number><unknown>index
            // Check if the number is still the same after conversion
            if (index.length && num==<unknown>index) return index
        }
        throw new Error(`Invalid index ${JSON.stringify(index)} for array`)
    }
}

class ObsMap extends ObsCollection {
    data: Map<any, DatumType> = new Map()

    getType() {
        return "map"
    }

    getRecursive(depth: number) {
        if (currentScope) {
            if (this.addObserver(ANY_INDEX, currentScope)) {
                currentScope.cleaners.push(this)
            }
        }
        let result: Map<any,any> = new Map()
        this.data.forEach((v: any, k: any) => {
            result.set(k, (v instanceof ObsCollection) ? (depth ? v.getRecursive(depth-1) : new Store(this, k)) : v)
        })
        return result
    }

    rawGet(index: any): DatumType {
        return this.data.get(index)
    }

    rawSet(index: any, newData: DatumType): void {
        if (newData===undefined) {
            this.data.delete(index)
        } else {
            this.data.set(index, newData)
        }
    }

    merge(newValue: any, deleteMissing: boolean): boolean {
        if (!(newValue instanceof Map)) {
            return false
        }

        // Walk the pairs of the new value map
        newValue.forEach((v: any, k: any) => {
            this.setIndex(k, v, deleteMissing)
        })

        if (deleteMissing) {
            this.data.forEach((v: DatumType, k: any) => {
                if (!newValue.has(k)) this.setIndex(k, undefined, false)
            })
        }
        return true
    }

    iterateIndexes(scope: OnEachScope): void {
        this.data.forEach((_, itemIndex) => {
            scope.addChild(itemIndex)
        })
    }

    normalizeIndex(index: any): any {
        return index
    }
 }

 class ObsObject extends ObsMap {

    getType() {
        return "object"
    }

    getRecursive(depth: number) {
        if (currentScope) {
            if (this.addObserver(ANY_INDEX, currentScope)) {
                currentScope.cleaners.push(this)
            }
        }
        let result: any = {};
        this.data.forEach((v: any, k: any) => {
            result[k] = (v instanceof ObsCollection) ? (depth ? v.getRecursive(depth-1) : new Store(this,k)) : v
        })
        return result
    }

    merge(newValue: any, deleteMissing: boolean): boolean {
        if (!newValue || newValue.constructor !== Object) {
            return false
        }

        // Walk the pairs of the new value object
        for(let k in newValue) {
            this.setIndex(k, newValue[k], deleteMissing)
        }

        if (deleteMissing) {
            this.data.forEach((v: DatumType, k: any) => {
                if (!newValue.hasOwnProperty(k)) this.setIndex(k, undefined, false)
            })
        }
        
        return true
    }

    normalizeIndex(index: any): any {
        let type = typeof index
        if (type==='string') return index
        if (type==='number') return ''+index
        throw new Error(`Invalid index ${JSON.stringify(index)} for object`)
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

    private collection: ObsCollection
    private idx: any

    constructor()
    constructor(value: any)
    constructor(collection: ObsCollection, index: any)

    constructor(value: any = undefined, index: any = undefined) {
        if (index===undefined) {
            this.collection = new ObsArray()
            this.idx = 0
            if (value!==undefined) {
                this.collection.rawSet(0, valueToData(value))
            }
        } else {
            if (!(value instanceof ObsCollection)) {
                throw new Error("1st parameter should be an ObsCollection if the 2nd is also given")
            }
            this.collection = value
            this.idx = index
        }
    }

    index() {
        return this.idx
    }

    _read() {
        return this.collection.rawGet(this.idx)
    }


    _clean(scope: Scope) {
        this.collection.removeObserver(this.idx, scope)
    }


    /**
     * Resolves `path` using `ref` and then retrieves the value that is there, subscribing
     * to all read Store values. If `path` does not exist, `undefined` is returned.
     */
    get(...path: any) : any {
        return this.query({path})
    }

    /** Like `get()`, but throw an exception if the resulting value is not of the named type.
     * Using these instead of `query()` directly is especially useful when using TypeScript.
     */
    getNumber(...path: any): number { return <number>this.query({path, type: 'number'}) }
    getString(...path: any): string { return <string>this.query({path, type: 'string'}) }
    getBoolean(...path: any): boolean { return <boolean>this.query({path, type: 'boolean'}) }
    getFunction(...path: any): (Function) { return <Function>this.query({path, type: 'function'}) }
    getArray(...path: any): any[] { return <any[]>this.query({path, type: 'array'}) }
    getObject(...path: any): object { return <object>this.query({path, type: 'object'}) }
    getMap(...path: any): Map<any,any> { return <Map<any,any>>this.query({path, type: 'map'}) }

    /** The first parameter is the default value (returned when the Store contains `undefined`).
     * This default value is also used to determine the expected time, and to throw otherwise.
     */
    getOr<T>(defaultValue: T, ...path: any): T {
        let type: string = typeof defaultValue
        if (type==='object') {
            if (defaultValue instanceof Map) type = 'map'
            else if (defaultValue instanceof Array) type = 'array'
        }
        return this.query({type, defaultValue, path})
    }

    query(opts: {path?: any[], type?: string, depth?: number, defaultValue?: any, peek?: boolean}): any {
        let store = opts.path && opts.path.length ? this.ref(...opts.path) : this
        let value = store ? store._observe() : undefined

        if (opts.type && (value!==undefined || opts.defaultValue===undefined)) {
            let type = (value instanceof ObsCollection) ? value.getType() : typeof value
            if (type !== opts.type) throw new Error(`Expecting ${opts.type} but got ${type}`)
        }
        if (value instanceof ObsCollection) {
            return value.getRecursive(opts.depth==null ? -1 : opts.depth)
        }
        return value===undefined ? opts.defaultValue : value
    }

    /**
     * Returns "undefined", "null", "boolean", "number", "string", "function", "array", "map" or "object"
     */
    getType(...path: any): string {
        let store = this.ref(...path)
        if (!store) return "undefined"
        let value = store._observe()
        return (value instanceof ObsCollection) ? value.getType() : typeof value
    }

    /**
     * Sets the Store value to the last given argument. And earlier argument are a Store-path that is first
     * resolved/created using `makeRef`.
     */
    set(...pathAndValue: any): void {
        let newValue = pathAndValue.pop()
        let store = this.makeRef(...pathAndValue)
        store.collection.setIndex(store.idx, newValue, true)
    }

    /**
     * Does the same as set, but in case of a top-level collection, it doesn't
     * delete keys that don't exist in `value`.
     */
    merge(...pathAndValue: any): void {
        let newValue = pathAndValue.pop()
        let store = this.makeRef(...pathAndValue)
        store.collection.setIndex(store.idx, newValue, false)

    }

    /**
     * Sets the value for the store to `undefined`, which causes it to be ommitted from the map (or array, if it's at the end)
     */
    delete(...path: any) {
        let store = this.makeRef(...path)
        store.collection.setIndex(store.idx, undefined, true)
    }


    /**
     * Return an store deeper within the tree by resolving each of the
     * arguments as Map indexes, while subscribing to each level.
     * If any level does not exist, a detached Store object is returned,
     * that will be automatically attached if it is written to.
     */
    ref(...indexes: any[]): Store | undefined {
        let store: Store = this

        for(let i=0; i<indexes.length; i++) {
            let value = store._observe()
            if (value instanceof ObsCollection) {
                store = new Store(value, value.normalizeIndex(indexes[i]))
            } else {
                if (value!==undefined) throw new Error(`Value ${JSON.stringify(value)} is not a collection (nor undefined) in step ${i} of $(${JSON.stringify(indexes)})`)
                return
            }
        }

        return store
    }

    makeRef(...indexes: any[]): Store {
        let store: Store = this

        for(let i=0; i<indexes.length; i++) {
            let value = store.collection.rawGet(store.idx)
            if (!(value instanceof ObsCollection)) {
                if (value!==undefined) throw new Error(`Value ${JSON.stringify(value)} is not a collection (nor undefined) in step ${i} of $(${JSON.stringify(indexes)})`)
                value = new ObsObject()
                store.collection.rawSet(store.idx, value)
                store.collection.emitChange(store.idx, value, undefined)
            }
            store = new Store(value, value.normalizeIndex(indexes[i]))
        }

        return store      
    }

    _observe() {
        if (currentScope) {
            if (this.collection.addObserver(this.idx, currentScope)) {
                currentScope.cleaners.push(this)
            }
        }
        return this.collection.rawGet(this.idx)
    }


    /**
     * Adds `newValue` as a value to a Map, indexed by the old `size()` of the Map. An
     * error is thrown if that index already exists.
     * In case the Store does not refers to `undefined`, the Array is created first.
     * @param newValue 
     */
    push(...pathAndValue: any): number {
        let newValue = pathAndValue.pop()
        let store = this.makeRef(...pathAndValue)

        let obsArray = store.collection.rawGet(store.idx)
        if (obsArray===undefined) {
            obsArray = new ObsArray()
            store.collection.setIndex(store.idx, obsArray, true)
        } else if (!(obsArray instanceof ObsArray)) {
            throw new Error(`push() is only allowed for an array or undefined (which would become an array)`)
        }

        let newData = valueToData(newValue)
        let pos = obsArray.data.length
        obsArray.data.push(newData)
        obsArray.emitChange(pos, newData, undefined)
        return pos
    }

    onEach(...pathAndFuncs: any): void {
        let makeSortKey = defaultMakeSortKey
        let renderer = pathAndFuncs.pop()
        if (typeof pathAndFuncs[pathAndFuncs.length-1]==='function' && (typeof renderer==='function' || renderer==null)) {
            if (renderer!=null) makeSortKey = renderer
            renderer = pathAndFuncs.pop()
        }
        if (typeof renderer !== 'function') throw new Error(`onEach() expects a render function as its last argument but got ${JSON.stringify(renderer)}`)

        if (!currentScope) throw new Error("onEach() is only allowed from a render scope")

        let store = this.ref(...pathAndFuncs)
        if (!store) return

        let val = store._observe()
        if (val instanceof ObsCollection) {
            // Subscribe to changes using the specialized OnEachScope
            let onEachScope = new OnEachScope(currentScope.parentElement, currentScope.lastChild || currentScope.precedingSibling, currentScope.queueOrder+1, val, renderer, makeSortKey)
            val.addObserver(ANY_INDEX, onEachScope)

            currentScope.cleaners.push(onEachScope)
            currentScope.lastChild = onEachScope

            onEachScope.renderInitial()
        } else if (val!==undefined) {
            throw new Error(`onEach() attempted on a value that is neither a collection nor undefined`)
        }
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
        } else if (item != null) {
            throw new Error(`Unexpected argument ${JSON.stringify(item)}`)
        }
    }
}

/**
 * Add a text node at the current Scope position.
 */
export function text(text: string) {
    if (!currentScope) throw  new Error(`text() outside of a render scope`)
    if (!text) return
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
    } else if (typeof value === 'function') {
        // Set an event listener; remove it again on clean.
        el.addEventListener(prop, value)
        if (currentScope) {
            clean(() => el.removeEventListener(prop, value))
        }
    } else if (prop==='style' && typeof value === 'object') {
        // `style` can receive an object
        Object.assign(el.style, value)
    } else if (prop==='text') {
        // `text` is set as textContent
        el.textContent = value
    } else {
        // Everything else is an HTML attribute
        el.setAttribute(prop, value)
    }
}

function valueToData(value: any) {
    if (typeof value !== "object" || !value) {
        // Simple data types
        return value
    } else if (value instanceof Store) {
        // When a Store is passed pointing at a collection, a reference
        // is made to that collection.
        return value._observe()
    } else if (value instanceof Map) {
        let result = new ObsMap()
        value.forEach((v,k) => {
            let d = valueToData(v)
            if (d!==undefined) result.rawSet(k, d)
        })
        return result
    }
    else if (value instanceof Array) {
        let result = new ObsArray()
        for(let i=0; i<value.length; i++) {
            let d = valueToData(value[i])
            if (d!==undefined) result.rawSet(i, d)
        }
        return result
    } else if (value.constructor === Object) {
        // A plain (literal) object
        let result = new ObsObject()
        for(let k in value) {
            let d = valueToData(value[k])
            if (d!==undefined) result.rawSet(k, d)
        }
        return result
    } else {
        // Any other type of object (including ObsCollection)
        return value
    }
}

function defaultMakeSortKey(store: Store) {
    return store.index()
}

function internalError(code: number) {
    console.error(new Error("internal error "+code))
}

function handleError(e: Error) {
    console.error(e)
    // Throw the error async, so the rest of the rendering can continue
    setTimeout(() => {throw e}, 0)
}
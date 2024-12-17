

/*
 * QueueRunner
 *
 * `queue()`d runners are executed on the next timer tick, by order of their
 * `queueOrder` values.
 */
interface QueueRunner {
	_queueOrder: number
	_queueRun(): void
}

let queueArray: Array<QueueRunner> = []
let queueSet: Set<QueueRunner> = new Set()
let queueOrdered = true
let runQueueDepth = 0
let queueIndex: number | undefined

/** @internal */
export type Patch = Map<ObsCollection, Map<any, [any, any]>>;

function queue(runner: QueueRunner) {
	if (queueSet.has(runner)) return
	if (runQueueDepth > 42) {
		throw new Error("Too many recursive updates from observes")
	}
	if (!queueArray.length) {
		setTimeout(runQueue, 0)
	}
	else if (runner._queueOrder < queueArray[queueArray.length-1]._queueOrder) {
		queueOrdered = false
	}
	queueArray.push(runner)
	queueSet.add(runner)
}

function runQueue(): void {
	onCreateEnabled = true
	for(queueIndex = 0; queueIndex < queueArray.length; ) {
		// Sort queue if new unordered items have been added since last time.
		if (!queueOrdered) {
			queueArray.splice(0, queueIndex)
			queueIndex = 0
			// Order queued observers by depth, lowest first.
			queueArray.sort((a,b) => a._queueOrder - b._queueOrder)
			queueOrdered = true
		}
		
		// Process the rest of what's currently in the queue.
		let batchEndIndex = queueArray.length
		for(; queueIndex < batchEndIndex && queueOrdered; queueIndex++) {
			let runner = queueArray[queueIndex]
			queueSet.delete(runner)
			runner._queueRun()
		}
		
		// If new items have been added to the queue while processing the previous
		// batch, we'll need to run this loop again.
		runQueueDepth++
	}

	queueArray.length = 0
	queueIndex = undefined
	runQueueDepth = 0
	onCreateEnabled = false
}


/**
 * Schedule a DOM read operation to be executed in Aberdeen's internal task queue.
 *
 * This function is used to batch DOM read operations together, avoiding unnecessary
 * layout recalculations and improving browser performance. A DOM read operation should
 * only *read* from the DOM, such as measuring element dimensions or retrieving computed styles.
 *
 * By batching DOM reads separately from DOM writes, this prevents the browser from
 * interleaving layout reads and writes, which can force additional layout recalculations.
 * This helps reduce visual glitches and flashes by ensuring the browser doesn't render
 * intermediate DOM states during updates.
 *
 * Unlike `setTimeout` or `requestAnimationFrame`, this mechanism ensures that DOM read
 * operations happen before any DOM writes in the same queue cycle, minimizing layout thrashing.
 *
 * @param func The function to be executed as a DOM read operation.
 */
export function scheduleDomReader(func: () => void): void {
	let order = (queueIndex!=null && queueIndex < queueArray.length && queueArray[queueIndex]._queueOrder >= 1000) ? ((queueArray[queueIndex]._queueOrder+1) & (~1)) : 1000
	queue({_queueOrder: order, _queueRun: func})
}

/**
 * Schedule a DOM write operation to be executed in Aberdeen's internal task queue.
 *
 * This function is used to batch DOM write operations together, avoiding unnecessary
 * layout recalculations and improving browser performance. A DOM write operation should
 * only *write* to the DOM, such as modifying element properties or applying styles.
 *
 * By batching DOM writes separately from DOM reads, this prevents the browser from
 * interleaving layout reads and writes, which can force additional layout recalculations.
 * This helps reduce visual glitches and flashes by ensuring the browser doesn't render
 * intermediate DOM states during updates.
 *
 * Unlike `setTimeout` or `requestAnimationFrame`, this mechanism ensures that DOM write
 * operations happen after all DOM reads in the same queue cycle, minimizing layout thrashing.
 *
 * @param func The function to be executed as a DOM write operation.
 */
export function scheduleDomWriter(func: () => void): void {
	let order = (queueIndex!=null && queueIndex < queueArray.length && queueArray[queueIndex]._queueOrder >= 1000) ? (queueArray[queueIndex]._queueOrder | 1) : 1001
	queue({_queueOrder: order, _queueRun: func})
}


/** @internal */
type SortKeyType = number | string | Array<number|string>


/**
 * Given an integer number, a string or an array of these, this function returns a string that can be used
 * to compare items in a natural sorting order. So `[3, 'ab']` should be smaller than `[3, 'ac']`.
 * The resulting string is guaranteed to never be empty.
 */
function sortKeyToString(key: SortKeyType) {
	if (key instanceof Array) {
		return key.map(partToStr).join('')
	} else {
		return partToStr(key)
	}
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

/** @internal */
interface Observer {
	_onChange(index: any, newData: DatumType, oldData: DatumType): void
}

/*
 * Scope
 * @internal
 *
 * A `Scope` is created with a `render` function that is run initially,
 * and again when any of the `Store`s that this function reads are changed. Any
 * DOM elements that is given a `render` function for its contents has its own scope.
 * The `Scope` manages the position in the DOM tree elements created by `render`
 * are inserted at. Before a rerender, all previously created elements are removed
 * and the `clean` functions for the scope and all sub-scopes are called.
 */

abstract class Scope implements QueueRunner, Observer {
	_parentElement: Element | undefined

	// How deep is this scope nested in other scopes; we use this to make sure events
	// at lower depths are handled before events at higher depths.
	_queueOrder: number
	
	// The node or scope right before this scope that has the same `parentElement`
	_precedingSibling: Node | Scope | undefined

	// The last child node or scope within this scope that has the same `parentElement`
	_lastChild: Node | Scope | undefined

	// The list of clean functions to be called when this scope is cleaned. These can
	// be for child scopes, subscriptions as well as `clean(..)` hooks.
	_cleaners: Array<{_clean: (scope: Scope) => void}> = []

	// Set to true after the scope has been cleaned, causing any spurious reruns to
	// be ignored.
	_isDead: boolean = false

	constructor(
		parentElement: Element | undefined,
		precedingSibling: Node | Scope | undefined,
		queueOrder: number,
	) {
		this._parentElement = parentElement
		this._precedingSibling = precedingSibling
		this._queueOrder = queueOrder
	}

	// Get a reference to the last Node preceding this Scope, or undefined if there is none
	_findPrecedingNode(stopAt: Scope | Node | undefined = undefined): Node | undefined {
		let cur: Scope = this
		let pre: Scope | Node | undefined
		while((pre = cur._precedingSibling) && pre !== stopAt) {
			if (pre instanceof Node) return pre
			let node = pre._findLastNode()
			if (node) return node
			cur = pre
		}
	}

	// Get a reference to the last Node within this scope and parentElement
	_findLastNode(): Node | undefined {
		if (this._lastChild) {
			if (this._lastChild instanceof Node) return this._lastChild
			else return this._lastChild._findLastNode() || this._lastChild._findPrecedingNode(this._precedingSibling)
		}
	}

	_addNode(node: Node) {
		if (!this._parentElement) throw new ScopeError(true)
		let prevNode = this._findLastNode() || this._findPrecedingNode()

		this._parentElement.insertBefore(node, prevNode ? prevNode.nextSibling : this._parentElement.firstChild)
		this._lastChild = node
	}

	_remove() {
		if (this._parentElement) {
			let lastNode: Node | undefined = this._findLastNode()
			if (lastNode) {
				// at least one DOM node to be removed
				
				let nextNode: Node | undefined = this._findPrecedingNode()
				nextNode = (nextNode ? nextNode.nextSibling : this._parentElement.firstChild) as Node | undefined

				this._lastChild = undefined
				
				// Keep removing DOM nodes starting at our first node, until we encounter the last node
				while(true) {
					/* c8 ignore next */
					if (!nextNode) return internalError(1)
						
					const node = nextNode
					nextNode = node.nextSibling || undefined
					let onDestroy = onDestroyMap.get(node)
					if (onDestroy && node instanceof Element) {
						if (onDestroy !== true) {
							if (typeof onDestroy === 'function') {
								onDestroy(node)
							} else {
								destroyWithClass(node, onDestroy)
							}
							// This causes the element to be ignored from this function from now on:
							onDestroyMap.set(node, true)
						}
					// Ignore the deleting element
					} else {
						this._parentElement.removeChild(node)
					}
					if (node === lastNode) break
				}
			}
		}

		// run cleaners
		this._clean()
	}

	_clean() {
		this._isDead = true
		for(let cleaner of this._cleaners) {
			cleaner._clean(this)
		}
		this._cleaners.length = 0
	}

	_onChange(index: any, newData: DatumType, oldData: DatumType) {
		queue(this)
	}

	abstract _queueRun(): void
}

class SimpleScope extends Scope {
	_renderer: () => void

	constructor(
		parentElement: Element | undefined,
		precedingSibling: Node | Scope | undefined,
		queueOrder: number,
		renderer: () => void,
	) {
		super(parentElement, precedingSibling, queueOrder)
		this._renderer = renderer
	}

	_queueRun() {
		/* c8 ignore next */
		if (currentScope) internalError(2)

		if (this._isDead) return
		this._remove()
		this._isDead = false

		this._update()
	}

	_update() {
		let savedScope = currentScope
		currentScope = this
		try {
			this._renderer()
		} catch(e) {
			// Throw the error async, so the rest of the rendering can continue
			handleError(e)
		}
		currentScope = savedScope
	}
}

let immediateQueue: Set<Scope> = new Set()

class ImmediateScope extends SimpleScope {
	_onChange(index: any, newData: DatumType, oldData: DatumType) {
		immediateQueue.add(this)
	}
}

let immediateQueuerRunning = false
function runImmediateQueue() {
	if (immediateQueuerRunning) return
	for(let count=0; immediateQueue.size; count++) {
		if (count > 42) {
			immediateQueue.clear()
			throw new Error("Too many recursive updates from immediate-mode observes")
		}
		immediateQueuerRunning = true
		let copy = immediateQueue
		immediateQueue = new Set()
		let savedScope = currentScope
		currentScope = undefined
		try {
			for(const scope of copy) {
				scope._queueRun()
			}
		} finally {
			currentScope = savedScope
			immediateQueuerRunning = false
		}
	}
}

class IsEmptyObserver implements Observer {
	scope: Scope
	collection: ObsCollection
	count: number
	triggerCount: boolean

	constructor(scope: Scope, collection: ObsCollection, triggerCount: boolean) {
		this.scope = scope
		this.collection = collection
		this.triggerCount = triggerCount
		this.count = collection._getCount()

		collection._addObserver(ANY_INDEX, this)
		scope._cleaners.push(this)
	}

	_onChange(index: any, newData: DatumType, oldData: DatumType) {
		if (newData===undefined) {
			// oldData is guaranteed not to be undefined
			if (this.triggerCount || !--this.count) queue(this.scope)
		} else if (oldData===undefined) {
			if (this.triggerCount || !this.count++) queue(this.scope)
		}
	}

	_clean() {
		this.collection._removeObserver(ANY_INDEX, this)
	}
}

/** @internal */
class OnEachScope extends Scope {

	/** The Node we are iterating */
	_collection: ObsCollection

	/** A function returning a number/string/array that defines the position of an item */
	_makeSortKey: (value: Store) => SortKeyType

	/** A function that renders an item */
	_renderer: (itemStore: Store) => void

	/** The ordered list of currently item scopes */
	_byPosition: OnEachItemScope[] = []

	/** The item scopes in a Map by index */
	_byIndex: Map<any, OnEachItemScope> = new Map()

	/** Indexes that have been created/removed and need to be handled in the next `queueRun` */
	_newIndexes: Set<any> = new Set()
	_removedIndexes: Set<any> = new Set()

	constructor(
		parentElement: Element | undefined,
		precedingSibling: Node | Scope | undefined,
		queueOrder: number,
		collection: ObsCollection,
		renderer: (itemStore: Store) => void,
		makeSortKey: (itemStore: Store) => SortKeyType
	) {
		super(parentElement, precedingSibling, queueOrder)
		this._collection = collection
		this._renderer = renderer
		this._makeSortKey = makeSortKey
	}

	// toString(): string {
	// 	return `OnEachScope(collection=${this.collection})`
	// }

	_onChange(index: any, newData: DatumType, oldData: DatumType) {
		if (oldData===undefined) {
			if (this._removedIndexes.has(index)) {
				this._removedIndexes.delete(index)
			} else {
				this._newIndexes.add(index)
				queue(this)
			}
		} else if (newData===undefined) {
			if (this._newIndexes.has(index)) {
				this._newIndexes.delete(index)
			} else {
				this._removedIndexes.add(index)
				queue(this)
			}
		}
	}

	_queueRun() {
		if (this._isDead) return

		let indexes = this._removedIndexes
		this._removedIndexes = new Set()
		indexes.forEach(index => {
			this._removeChild(index)
		})

		indexes = this._newIndexes
		this._newIndexes = new Set()
		indexes.forEach(index => {
			this._addChild(index)
		})
	}

	_clean() {
		super._clean()
		this._collection._observers.delete(this)
		for (const [index, scope] of this._byIndex) {
			scope._clean()
		}

		// Help garbage collection:
		this._byPosition.length = 0
		this._byIndex.clear()
	}

	_renderInitial() {
		/* c8 ignore next */
		if (!currentScope) return internalError(3)
		let parentScope = currentScope

		this._collection._iterateIndexes(this)

		currentScope = parentScope
	}

	_addChild(itemIndex: any) {
		let scope = new OnEachItemScope(this._parentElement, undefined, this._queueOrder+1, this, itemIndex)
		this._byIndex.set(itemIndex, scope)
		scope._update()
		// We're not adding a cleaner here, as we'll be calling them from our _clean function
	}

	_removeChild(itemIndex: any) {
		let scope = this._byIndex.get(itemIndex)
		/* c8 ignore next */
		if (!scope) return internalError(6)
		scope._remove()
		this._byIndex.delete(itemIndex)
		this._removeFromPosition(scope)
	}

	_findPosition(sortStr: string) {
		// In case of duplicate `sortStr`s, this will return the first match.
		let items = this._byPosition
		let min = 0, max = items.length
		
		// Fast-path for elements that are already ordered (as is the case when working with arrays ordered by index)
		if (!max || sortStr > items[max-1]._sortStr) return max

		// Binary search for the insert position		
		while(min<max) {
			let mid = (min+max)>>1
			if (items[mid]._sortStr < sortStr) {
				min = mid+1
			} else {
				max = mid
			}
		}
		return min
	}

	_insertAtPosition(child: OnEachItemScope) {
		let pos = this._findPosition(child._sortStr)
		this._byPosition.splice(pos, 0, child)
		
		// Based on the position in the list, set the precedingSibling for the new Scope
		// and for the next sibling.
		let nextSibling: OnEachItemScope = this._byPosition[pos+1]
		if (nextSibling) {
			child._precedingSibling = nextSibling._precedingSibling
			nextSibling._precedingSibling = child
		} else {
			child._precedingSibling = this._lastChild || this._precedingSibling
			this._lastChild = child
		}
	}

	_removeFromPosition(child: OnEachItemScope) {
		if (child._sortStr==='') return
		let pos = this._findPosition(child._sortStr)
		while(true) {
			if (this._byPosition[pos] === child) {
				// Yep, this is the right scope
				this._byPosition.splice(pos, 1)
				if (pos < this._byPosition.length) {
					let nextSibling: Scope | undefined = this._byPosition[pos] as (Scope | undefined)
					/* c8 ignore next */
					if (!nextSibling) return internalError(8)
					/* c8 ignore next */
					if (nextSibling._precedingSibling !== child) return internalError(13)
					nextSibling._precedingSibling = child._precedingSibling
				} else {
					/* c8 ignore next */
					if (child !== this._lastChild) return internalError(12)
					this._lastChild = child._precedingSibling === this._precedingSibling ? undefined : child._precedingSibling	
				}
				return
			}
			// There may be another Scope with the same sortStr
			/* c8 ignore next */
			if (++pos >= this._byPosition.length || this._byPosition[pos]._sortStr !== child._sortStr) return internalError(5)
		}
	}
}

/** @internal */
class OnEachItemScope extends Scope {
	_parent: OnEachScope
	_itemIndex: any
	_sortStr: string = ""

	constructor(
		parentElement: Element | undefined,
		precedingSibling: Node | Scope | undefined,
		queueOrder: number,
		parent: OnEachScope,
		itemIndex: any
	) {
		super(parentElement, precedingSibling, queueOrder)
		this._parent = parent
		this._itemIndex = itemIndex
	}

	// toString(): string {
	// 	return `OnEachItemScope(itemIndex=${this.itemIndex} parentElement=${this.parentElement} parent=${this.parent} precedingSibling=${this.precedingSibling} lastChild=${this.lastChild})`
	// }

	_queueRun() {
		/* c8 ignore next */
		if (currentScope) internalError(4)

		if (this._isDead) return
		this._remove()
		this._isDead = false

		this._update()
	}

	_update() {
		// Have the makeSortKey function return an ordering int/string/array.
		// Since makeSortKey may get() the Store, we'll need to set currentScope first.
		let savedScope = currentScope
		currentScope = this

		let itemStore = new Store(this._parent._collection, this._itemIndex)

		let sortKey
		try {
			sortKey = this._parent._makeSortKey(itemStore)
		} catch(e) {
			handleError(e)
		}

		let oldSortStr: string = this._sortStr
		let newSortStr: string = sortKey==null ? '' : sortKeyToString(sortKey)

		if (oldSortStr!=='' && oldSortStr!==newSortStr) {
			this._parent._removeFromPosition(this)
		}

		this._sortStr = newSortStr
		if (newSortStr!=='') {
			if (newSortStr !== oldSortStr) {
				this._parent._insertAtPosition(this)
			}
			try {
				this._parent._renderer(itemStore)
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
let currentScope: Scope | undefined

/**
 * A special Node observer index to subscribe to any value in the map changing.
 */
const ANY_INDEX = {}


type DatumType = string | number | Function | boolean | null | undefined | ObsMap | ObsArray


/** @internal */
export abstract class ObsCollection {
	_observers: Map<any, Set<Observer>> = new Map()

	// toString(): string {
	// 	return JSON.stringify(peek(() => this.getRecursive(3)))
	// }

	_addObserver(index: any, observer: Observer) {
	   observer = observer
	   let obsSet = this._observers.get(index)
	   if (obsSet) {
		   if (obsSet.has(observer)) return false
		   obsSet.add(observer)
	   } else {
		   this._observers.set(index, new Set([observer]))
	   }
	   return true
   }

   _removeObserver(index: any, observer: Observer) {
	   let obsSet = <Set<Observer>>this._observers.get(index)
	   obsSet.delete(observer)
   }

   emitChange(index: any, newData: DatumType, oldData: DatumType) {
		let obsSet = this._observers.get(index)
		if (obsSet) obsSet.forEach(observer => observer._onChange(index, newData, oldData))
		obsSet = this._observers.get(ANY_INDEX)
		if (obsSet) obsSet.forEach(observer => observer._onChange(index, newData, oldData))
   }

   _clean(observer: Observer) {
		this._removeObserver(ANY_INDEX, observer)
	}

	_setIndex(index: any, newValue: any, deleteMissing: boolean): void {
		const curData = this.rawGet(index)

		if (!(curData instanceof ObsCollection) || newValue instanceof Store || !curData._merge(newValue, deleteMissing)) {
			let newData = valueToData(newValue)
			if (newData !== curData) {
				this.rawSet(index, newData)
				this.emitChange(index, newData, curData)
			}
		}
	}

	abstract rawGet(index: any): DatumType
	abstract rawSet(index: any, data: DatumType): void
	abstract _merge(newValue: any, deleteMissing: boolean): void
	abstract _getType(): string
	abstract _getRecursive(depth: number): object | Set<any> | Array<any>
	abstract _iterateIndexes(scope: OnEachScope): void
	abstract _normalizeIndex(index: any): any
	abstract _getCount(): number
}

/** @internal */
class ObsArray extends ObsCollection {
	_data: Array<DatumType> = []

	_getType() {
		return "array"
	}

	_getRecursive(depth: number) {
		if (currentScope) {
			if (this._addObserver(ANY_INDEX, currentScope)) {
				currentScope._cleaners.push(this)
			}
		}
		let result: any[] = []
		for(let i=0; i<this._data.length; i++) {
			let v = this._data[i]
			result.push(v instanceof ObsCollection ? (depth ? v._getRecursive(depth-1) : new Store(this,i)) : v)
		}
		return result
	}

	rawGet(index: any): DatumType {
		return this._data[index]
	}

	rawSet(index: any, newData: DatumType): void {
		if (index !== (0|index) || index<0 || index>999999) {
			throw new Error(`Invalid array index ${JSON.stringify(index)}`)
		}
		this._data[index] = newData
		// Remove trailing `undefined`s
		while(this._data.length>0 && this._data[this._data.length-1]===undefined) {
			this._data.pop()
		}
	}

	_merge(newValue: any, deleteMissing: boolean): boolean {
		if (!(newValue instanceof Array)) {
			return false
		}
		// newValue is an array

		for(let i=0; i<newValue.length; i++) {
			this._setIndex(i, newValue[i], deleteMissing)
		}

		// Overwriting just the first elements of an array and leaving the rest of
		// the old data in place is just weird and unexpected, so we'll always use
		// 'replace' behavior for arrays.
		if (/*deleteMissing &&*/ this._data.length > newValue.length) {
			for(let i=newValue.length; i<this._data.length; i++) {
				let old = this._data[i]
				if (old!==undefined) {
					this.emitChange(i, undefined, old)
				}
			}
			this._data.length = newValue.length
		}
		return true
	}


	_iterateIndexes(scope: OnEachScope): void {
		for(let i=0; i<this._data.length; i++) {
			if (this._data[i]!==undefined) {
				scope._addChild(i)
			}	
		}
	}

	_normalizeIndex(index: any): any {
		if (typeof index==='number') return index
		if (typeof index==='string') {
			// Convert to int
			let num = 0 | <number><unknown>index
			// Check if the number is still the same after conversion
			if (index.length && num==<unknown>index) return index
		}
		throw new Error(`Invalid array index ${JSON.stringify(index)}`)
	}

	_getCount() {
		return this._data.length
	}
}

/** @internal */
class ObsMap extends ObsCollection {
	data: Map<any, DatumType> = new Map()

	_getType() {
		return "map"
	}

	_getRecursive(depth: number) {
		if (currentScope) {
			if (this._addObserver(ANY_INDEX, currentScope)) {
				currentScope._cleaners.push(this)
			}
		}
		let result: Map<any,any> = new Map()
		this.data.forEach((v: any, k: any) => {
			result.set(k, (v instanceof ObsCollection) ? (depth ? v._getRecursive(depth-1) : new Store(this, k)) : v)
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

	_merge(newValue: any, deleteMissing: boolean): boolean {
		if (!(newValue instanceof Map)) {
			return false
		}

		// Walk the pairs of the new value map
		newValue.forEach((v: any, k: any) => {
			this._setIndex(k, v, deleteMissing)
		})

		if (deleteMissing) {
			this.data.forEach((v: DatumType, k: any) => {
				if (!newValue.has(k)) this._setIndex(k, undefined, false)
			})
		}
		return true
	}

	_iterateIndexes(scope: OnEachScope): void {
		this.data.forEach((_, itemIndex) => {
			scope._addChild(itemIndex)
		})
	}

	_normalizeIndex(index: any): any {
		return index
	}

	_getCount() {
		return this.data.size
	}
 }

 /** @internal */
 class ObsObject extends ObsMap {
	_getType() {
		return "object"
	}

	_getRecursive(depth: number) {
		if (currentScope) {
			if (this._addObserver(ANY_INDEX, currentScope)) {
				currentScope._cleaners.push(this)
			}
		}
		let result: any = {}
		this.data.forEach((v: any, k: any) => {
			result[k] = (v instanceof ObsCollection) ? (depth ? v._getRecursive(depth-1) : new Store(this,k)) : v
		})
		return result
	}

	_merge(newValue: any, deleteMissing: boolean): boolean {
		if (!newValue || newValue.constructor !== Object) {
			return false
		}

		// Walk the pairs of the new value object
		for(let k in newValue) {
			this._setIndex(k, newValue[k], deleteMissing)
		}

		if (deleteMissing) {
			this.data.forEach((v: DatumType, k: any) => {
				if (!newValue.hasOwnProperty(k)) this._setIndex(k, undefined, false)
			})
		}
		
		return true
	}

	_normalizeIndex(index: any): any {
		let type = typeof index
		if (type==='string') return index
		if (type==='number') return ''+index
		throw new Error(`Invalid object index ${JSON.stringify(index)}`)
	}

	_getCount() {
		let cnt = 0
		for(let key of this.data) cnt++
		return cnt
	}
 }



/**
 * A data store that automatically subscribes the current scope to updates
 * whenever data is read from it.
 *
 * Supported data types are: `string`, `number`, `boolean`, `undefined`, `null`,
 * `Array`, `object` and `Map`. The latter three will always have `Store` objects as
 * values, creating a tree of `Store`-objects.
 */

export class Store {
	/** @internal */
	private _collection: ObsCollection
	/** @internal */
	private _idx: any

	/**
	 * Create a new store with the given `value` as its value. Defaults to `undefined` if no value is given.
	 * When the value is a plain JavaScript object, an `Array` or a `Map`, it will be stored as a tree of
	 * `Store`s. (Calling {@link Store.get} on the store will recreate the original data strucure, though.)
	 *
	 * @example
	 * ```
	 * let emptyStore = new Store()
	 * let numStore = new Store(42)
	 * let objStore = new Store({x: {alice: 1, bob: 2}, y: [9,7,5,3,1]})
	 * ```
	*/
	constructor()
	constructor(value: any)
	/** @internal */
	constructor(collection: ObsCollection, index: any)

	constructor(value: any = undefined, index: any = undefined) {
		if (index===undefined) {
			this._collection = new ObsArray()
			this._idx = 0
			if (value!==undefined) {
				this._collection.rawSet(0, valueToData(value))
			}
		} else {
			if (!(value instanceof ObsCollection)) {
				throw new Error("1st parameter should be an ObsCollection if the 2nd is also given")
			}
			this._collection = value
			this._idx = index
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
		return this._idx
	}

	/** @internal */
	_clean(scope: Scope) {
		this._collection._removeObserver(this._idx, scope)
	}


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
	get(...path: any[]) : any {
		return this.query({path})
	}

	/**
	 * Like {@link Store.get}, but doesn't subscribe to changes.
	 */
	peek(...path: any[]): any {
		return this.query({path, peek: true})
	}

	/**
	 * @returns Like {@link Store.get}, but throws a `TypeError` if the resulting value is not of type `number`.
	 * Using this instead of just {@link Store.get} is especially useful from within TypeScript.
	 */
	getNumber(...path: any[]): number { return <number>this.query({path, type: 'number'}) }
	/**
	 * @returns Like {@link Store.get}, but throws a `TypeError` if the resulting value is not of type `string`.
	 * Using this instead of just {@link Store.get} is especially useful from within TypeScript.
	 */
	getString(...path: any[]): string { return <string>this.query({path, type: 'string'}) }
	/**
	 * @returns Like {@link Store.get}, but throws a `TypeError` if the resulting value is not of type `boolean`.
	 * Using this instead of just {@link Store.get} is especially useful from within TypeScript.
	 */
	getBoolean(...path: any[]): boolean { return <boolean>this.query({path, type: 'boolean'}) }
	/**
	 * @returns Like {@link Store.get}, but throws a `TypeError` if the resulting value is not of type `function`.
	 * Using this instead of just {@link Store.get} is especially useful from within TypeScript.
	 */
	getFunction(...path: any[]): (Function) { return <Function>this.query({path, type: 'function'}) }
	/**
	 * @returns Like {@link Store.get}, but throws a `TypeError` if the resulting value is not of type `array`.
	 * Using this instead of just {@link Store.get} is especially useful from within TypeScript.
	 */
	getArray(...path: any[]): any[] { return <any[]>this.query({path, type: 'array'}) }
	/**
	 * @returns Like {@link Store.get}, but throws a `TypeError` if the resulting value is not of type `object`.
	 * Using this instead of just {@link Store.get} is especially useful from within TypeScript.
	 */
	getObject(...path: any[]): object { return <object>this.query({path, type: 'object'}) }
	/**
	 * @returns Like {@link Store.get}, but throws a `TypeError` if the resulting value is not of type `map`.
	 * Using this instead of just {@link Store.get} is especially useful from within TypeScript.
	 */
	getMap(...path: any[]): Map<any,any> { return <Map<any,any>>this.query({path, type: 'map'}) }

	/**
	 * Like {@link Store.get}, but the first parameter is the default value (returned when the Store
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
	getOr<T>(defaultValue: T, ...path: any[]): T {
		let type: string = typeof defaultValue
		if (type==='object') {
			if (defaultValue instanceof Map) type = 'map'
			else if (defaultValue instanceof Array) type = 'array'
		}
		return this.query({type, defaultValue, path})
	}

	/** Retrieve a value, subscribing to all read `Store` values. This is a more flexible
	 * form of the {@link Store.get} and {@link Store.peek} methods.
	 *
	 * @returns The resulting value, or `undefined` if the `path` does not exist.
	 */
	query(opts: {
		/**  The value for this path should be retrieved. Defaults to `[]`, meaning the entire `Store`. */
		path?: any[],
		/** A string specifying what type the query is expected to return. Options are:
		 *  "undefined", "null", "boolean", "number", "string", "function", "array", "map"
		 *  and "object". If the store holds a different type of value, a `TypeError`
		 *  exception is thrown. By default (when `type` is `undefined`) no type checking
		 *  is done.
		 */
		type?: string,
		/** Limit the depth of the retrieved data structure to this positive integer.
		*  When `depth` is `1`, only a single level of the value at `path` is unpacked. This
		*  makes no difference for primitive values (like strings), but for objects, maps and
		*  arrays, it means that each *value* in the resulting data structure will be a
		*  reference to the `Store` for that value.
		*/
		depth?: number,
		/** Return this value when the `path` does not exist. Defaults to `undefined`. */
		defaultValue?: any,
		/** When peek is `undefined` or `false`, the current scope will automatically be
		 * subscribed to changes of any parts of the store being read. When `true`, no
		 * subscribers will be performed.
		 */
		peek?: boolean
	}): any {
		if (opts.peek && currentScope) {
			let savedScope = currentScope
			currentScope = undefined
			let result = this.query(opts)
			currentScope = savedScope
			return result
		}
		let store = opts.path && opts.path.length ? this.ref(...opts.path) : this
		let value = store._observe()

		if (opts.type && (value!==undefined || opts.defaultValue===undefined)) {
			let type = (value instanceof ObsCollection) ? value._getType() : (value===null ? "null" : typeof value)
			if (type !== opts.type) throw new TypeError(`Expecting ${opts.type} but got ${type}`)
		}
		if (value instanceof ObsCollection) {
			return value._getRecursive(opts.depth==null ? -1 : opts.depth-1)
		}
		return value===undefined ? opts.defaultValue : value
	}

	/**
	 * Checks if the specified collection is empty, and subscribes the current scope to changes of the emptiness of this collection.
	 *
	 * @param path Any path terms to resolve before retrieving the value.
	 * @returns When the specified collection is not empty `true` is returned. If it is empty or if the value is undefined, `false` is returned.
	 * @throws When the value is not a collection and not undefined, an Error will be thrown.
	 */
	isEmpty(...path: any[]): boolean {
		let store = this.ref(...path)
		
		let value = store._observe()
		if (value instanceof ObsCollection) {
			if (currentScope) {
				let observer = new IsEmptyObserver(currentScope, value, false)
				return !observer.count
			} else {
				return !value._getCount()
			}
		} else if (value===undefined) {
			return true
		} else {
			throw new Error(`isEmpty() expects a collection or undefined, but got ${JSON.stringify(value)}`)
		}
	}

	/**
	 * Returns the number of items in the specified collection, and subscribes the current scope to changes in this count.
	 *
	 * @param path Any path terms to resolve before retrieving the value.
	 * @returns The number of items contained in the collection, or 0 if the value is undefined.
	 * @throws When the value is not a collection and not undefined, an Error will be thrown.
	 */
	count(...path: any[]): number {
		let store = this.ref(...path)
		
		let value = store._observe()
		if (value instanceof ObsCollection) {
			if (currentScope) {
				let observer = new IsEmptyObserver(currentScope, value, true)
				return observer.count
			} else {
				return value._getCount()
			}
		} else if (value===undefined) {
			return 0
		} else {
			throw new Error(`count() expects a collection or undefined, but got ${JSON.stringify(value)}`)
		}
	}

	/**
	 * Returns a strings describing the type of the store value, subscribing to changes of this type.
	 * Note: this currently also subscribes to changes of primitive values, so changing a value from 3 to 4
	 * would cause the scope to be rerun. This is not great, and may change in the future. This caveat does
	 * not apply to changes made *inside* an object, `Array` or `Map`.
	 *
	 * @param path Any path terms to resolve before retrieving the value.
	 * @returns Possible options: "undefined", "null", "boolean", "number", "string", "function", "array", "map" or "object".
	 */
	getType(...path: any[]): string {
		let store = this.ref(...path)
		let value = store._observe()
		return (value instanceof ObsCollection) ? value._getType() : (value===null ? "null" : typeof value)
	}

	/**
	 * Sets the value to the last given argument. Any earlier argument are a Store-path that is first
	 * resolved/created using {@link Store.makeRef}.
	 *
	 * When a `Store` is passed in as the value, its value will be copied (subscribing to changes). In
	 * case the value is an object, an `Array` or a `Map`, a *reference* to that data structure will
	 * be created, so that changes made through one `Store` will be reflected through the other. Be
	 * carefull not to create loops in your `Store` tree that way, as that would cause any future
	 * call to {@link Store.get} to throw a `RangeError` (Maximum call stack size exceeded.)
	 *
	 * If you intent to make a copy instead of a reference, call {@link Store.get} on the origin `Store`.
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
	set(...pathAndValue: any[]): void {
		let newValue = pathAndValue.pop()
		let store = this.makeRef(...pathAndValue)
		store._collection._setIndex(store._idx, newValue, true)
		runImmediateQueue()
	}

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
	merge(...pathAndValue: any): void {
		let mergeValue = pathAndValue.pop()
		let store = this.makeRef(...pathAndValue)
		store._collection._setIndex(store._idx, mergeValue, false)
		runImmediateQueue()
	}

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
	delete(...path: any) {
		let store = this.makeRef(...path)
		store._collection._setIndex(store._idx, undefined, true)
		runImmediateQueue()
	}

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
	push(...pathAndValue: any[]): number {
		let newValue = pathAndValue.pop()
		let store = this.makeRef(...pathAndValue)

		let obsArray = store._collection.rawGet(store._idx)
		if (obsArray===undefined) {
			obsArray = new ObsArray()
			store._collection._setIndex(store._idx, obsArray, true)
		} else if (!(obsArray instanceof ObsArray)) {
			throw new Error(`push() is only allowed for an array or undefined (which would become an array)`)
		}

		let newData = valueToData(newValue)
		let pos = obsArray._data.length
		obsArray._data.push(newData)
		obsArray.emitChange(pos, newData, undefined)
		runImmediateQueue()
		return pos
	}

	/**
	 * {@link Store.peek} the current value, pass it through `func`, and {@link Store.set} the resulting
	 * value.
	 * @param func The function transforming the value.
	 */
	modify(func: (value: any) => any): void {
		this.set(func(this.query({peek: true})))
	}

	/**
	 * Return a `Store` deeper within the tree by resolving the given `path`,
	 * subscribing to every level.
	 * In case `undefined` is encountered while resolving the path, a newly
	 * created `Store` containing `undefined` is returned. In that case, the
	 * `Store`'s {@link Store.isDetached} method will return `true`.
	 * In case something other than a collection is encountered, an error is thrown.
	 */
	ref(...path: any[]): Store {
		let store: Store = this

		for(let i=0; i<path.length; i++) {
			let value = store._observe()
			if (value instanceof ObsCollection) {
				store = new Store(value, value._normalizeIndex(path[i]))
			} else {
				if (value!==undefined) throw new Error(`Value ${JSON.stringify(value)} is not a collection (nor undefined) in step ${i} of $(${JSON.stringify(path)})`)
				return new DetachedStore()
			}
		}

		return store
	}

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
	makeRef(...path: any[]): Store {
		let store: Store = this

		for(let i=0; i<path.length; i++) {
			let value = store._collection.rawGet(store._idx)
			if (!(value instanceof ObsCollection)) {
				if (value!==undefined) throw new Error(`Value ${JSON.stringify(value)} is not a collection (nor undefined) in step ${i} of $(${JSON.stringify(path)})`)
				value = new ObsObject()
				store._collection.rawSet(store._idx, value)
				store._collection.emitChange(store._idx, value, undefined)
			}
			store = new Store(value, value._normalizeIndex(path[i]))
		}
		runImmediateQueue()
		return store	
	}

	/** @internal */
	_observe() {
		if (currentScope) {
			if (this._collection._addObserver(this._idx, currentScope)) {
				currentScope._cleaners.push(this)
			}
		}
		return this._collection.rawGet(this._idx)
	}

	/**
	 * Iterate the specified collection (Array, Map or object), running the given code block for each item.
	 * When items are added to the collection at some later point, the code block will be ran for them as well.
	 * When an item is removed, the {@link Store.clean} handlers left by its code block are executed.
	 *
	 *
	 *
	 * @param pathAndFuncs
	 */
	onEach(...pathAndFuncs: any): void {
		let makeSortKey = defaultMakeSortKey
		let renderer = pathAndFuncs.pop()
		if (typeof pathAndFuncs[pathAndFuncs.length-1]==='function' && (typeof renderer==='function' || renderer==null)) {
			if (renderer!=null) makeSortKey = renderer
			renderer = pathAndFuncs.pop()
		}
		if (typeof renderer !== 'function') throw new Error(`onEach() expects a render function as its last argument but got ${JSON.stringify(renderer)}`)

		if (!currentScope) throw new ScopeError(false)

		let store = this.ref(...pathAndFuncs)

		let val = store._observe()
		if (val instanceof ObsCollection) {
			// Subscribe to changes using the specialized OnEachScope
			let onEachScope = new OnEachScope(currentScope._parentElement, currentScope._lastChild || currentScope._precedingSibling, currentScope._queueOrder+1, val, renderer, makeSortKey)
			val._addObserver(ANY_INDEX, onEachScope)

			currentScope._cleaners.push(onEachScope)
			currentScope._lastChild = onEachScope

			onEachScope._renderInitial()
		} else if (val!==undefined) {
			throw new Error(`onEach() attempted on a value that is neither a collection nor undefined`)
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
	map(func: (store: Store) => any): Store {
		let out = new Store(new Map())
		this.onEach((item: Store) => {
			let value = func(item)
			if (value !== undefined) {
				let key = item.index()
				out.set(key, value)
				clean(() => {
					out.delete(key)
				})
			}
		})
		return out
	}

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
	multiMap(func: (store: Store) => any): Store {
		let out = new Store(new Map())
		this.onEach((item: Store) => {
			let result = func(item)
			let keys: Array<any>
			if (result.constructor === Object) {
				for(let key in result) {
					out.set(key, result[key])
				}
				keys = Object.keys(result)
			} else if (result instanceof Map) {
				result.forEach((value: any, key: any) => {
					out.set(key, value)
				})
				keys = [...result.keys()]
			} else {
				return
			}
			if (keys.length) {
				clean(() => {
					for(let key of keys) {
						out.delete(key)
					}
				})
			}
		})
		return out	
	}

	/**
	 * @returns Returns `true` when the `Store` was created by {@link Store.ref}ing a path that
	 * does not exist.
	 */
	isDetached() { return false }

	/**
	* Dump a live view of the `Store` tree as HTML text, `ul` and `li` nodes at
	* the current mount position. Meant for debugging purposes.
	*/
	dump() {
	  let type = this.getType()
	  if (type === 'array' || type === 'object' || type === 'map') {
	    text('<'+type+'>')
	    node('ul', () => {
	      this.onEach((sub: Store) => {
	        node('li', () => {
	          text(JSON.stringify(sub.index())+': ')
	          sub.dump()
	        })
	      })
	    })
	  }
	  else {
	    text(JSON.stringify(this.get()))
	  }
	}
}

class DetachedStore extends Store {
	isDetached() { return true }
}



let onCreateEnabled = false
let onDestroyMap: WeakMap<Node, string | Function | true> = new WeakMap()

function destroyWithClass(element: Element, cls: string) {
	element.classList.add(cls)
	setTimeout(() => element.remove(), 2000)
}


/**
 * Create a new DOM element, and insert it into the DOM at the position held by the current scope.
 * @param tag - The tag of the element to be created and optionally dot-separated class names. For example: `h1` or `p.intro.has_avatar`.
 * @param rest - The other arguments are flexible and interpreted based on their types:
 *   - `string`: Used as textContent for the element.
 *   - `object`: Used as attributes, properties or event listeners for the element. See {@link Store.prop} on how the distinction is made and to read about a couple of special keys.
 *   - `function`: The render function used to draw the scope of the element. This function gets its own `Scope`, so that if any `Store` it reads changes, it will redraw by itself.
 *   - `Store`: Presuming `tag` is `"input"`, `"textarea"` or `"select"`, create a two-way binding between this `Store` value and the input element. The initial value of the input will be set to the initial value of the `Store`, or the other way around if the `Store` holds `undefined`. After that, the `Store` will be updated when the input changes and vice versa.
 * @example
 * node('aside.editorial', 'Yada yada yada....', () => {
 *	 node('a', {href: '/bio'}, () => {
 *		 node('img.author', {src: '/me.jpg', alt: 'The author'})
 *	 })
 * })
 */

function applyStyle(el: Element, prop: string, value: any) {
	console.log('applyStyle', el, prop, value);
	(el as any).style[prop] = value
}

export function $(...args: any[]) {
	const scope = currentScope
	if (!scope || !scope._parentElement) throw new ScopeError(true)
		
	let topEl: Element | undefined
	let deepEl: Element = scope._parentElement
	let idx = 0
	let op = ''

	function parseStr(str: string, arg: any) {
		let argAvailable = false
		const parts = str.split(' ')
		for(let partIndex=0; partIndex<parts.length; partIndex++) {
			const part = parts[partIndex]
			if (!part) continue
			let reverse = false
			argAvailable = partIndex === parts.length-1
			if (argAvailable && part.endsWith('?')) {
				reverse = !arg
				argAvailable = false
			}
			if (part[0] === '.') {
				if (argAvailable && part.length===1) {
					if (arg instanceof Array) {
						for(let cls of arg) deepEl.classList.add(cls)
					} else if (typeof arg === 'object') {
						for(let [cls,enable] of arg.items()) deepEl.classList.toggle(cls, enable)
					} else if (arg != null) {
						deepEl.classList.add(''+arg)
					}
					argAvailable = false
				} else {
					for(let cls of arg.slice('.').split('.')) deepEl.classList.toggle(cls, !reverse)
				}
			} else if (part.indexOf(op = '=') >= 0 || part.indexOf(op = ':') >= 0) {
				let [prop, value] = part.split(op)
				if (!value && argAvailable) {
					value = arg
					argAvailable = false
				}
				if (op === '=') applyProp(deepEl, prop, reverse ? "" : value)
				else applyStyle(deepEl, prop, reverse ? "" : value)
			} else {
				
			}
		}
		return !argAvailable
	}

	function runInScope(func: () => void) {
		let childScope = new SimpleScope(deepEl, undefined, (scope as Scope)._queueOrder+1, func)
		if (onCreateEnabled) {
			onCreateEnabled = false
			childScope._update()
			onCreateEnabled = true
		} else {
			childScope._update()
		}

		// Add it to our list of cleaners. Even if `scope` currently has
		// no cleaners, it may get them in a future refresh.
		(scope as Scope)._cleaners.push(childScope)
	}

	if (args[0] instanceof Array) {
		for(let str of args[idx++]) {
			if (parseStr(str.trimLeft(), args[idx])) idx++
		}
	} else {
		while (idx < args.length) {
			let arg = args[idx++]
			if (arg == null) continue
			if (typeof arg === 'string') {
				if (parseStr(arg, args[idx])) idx++
			} if (arg instanceof Element) {
				if (deepEl) {
					deepEl.appendChild(arg)
					deepEl = topEl = arg
				}
			} else if (typeof arg === 'function' && idx === args.length-1) {
				runInScope(arg)
			}
		}
	}

	if (topEl) scope._addNode(topEl)

	return runInScope
}

export const node = $

// export function node(tag: string|Element = "", ...rest: any[]) {
// 	if (!currentScope) throw new ScopeError(true)

// 	let el
// 	if (tag instanceof Element) {
// 		el = tag
// 	} else {
// 		let pos = tag.indexOf('.')
// 		let classes
// 		if (pos>=0) {
// 			classes = tag.substr(pos+1)
// 			tag = tag.substr(0, pos)
// 		}
// 		el = document.createElement(tag || 'div')
// 		if (classes) {
// 			// @ts-ignore (replaceAll is polyfilled)
// 			el.className = classes.replaceAll('.', ' ')
// 		}
// 	}

// 	currentScope._addNode(el)

// 	for(let item of rest) {
// 		let type = typeof item
// 		if (type === 'function') {
// 			let scope = new SimpleScope(el, undefined, currentScope._queueOrder+1, item)
// 			if (onCreateEnabled) {
// 				onCreateEnabled = false
// 				scope._update()
// 				onCreateEnabled = true
// 			} else {
// 				scope._update()
// 			}

// 			// Add it to our list of cleaners. Even if `scope` currently has
// 			// no cleaners, it may get them in a future refresh.
// 			currentScope._cleaners.push(scope)
// 		} else if (type === 'string' || type === 'number') {
// 			el.textContent = item
// 		} else if (type === 'object' && item && item.constructor === Object) {
// 			for(let k in item) {
// 				applyProp(el, k, item[k])
// 			}
// 		} else if (item instanceof Store) {
// 			bindInput(<HTMLInputElement>el, item)
// 		} else if (item != null) {
// 			throw new Error(`Unexpected argument ${JSON.stringify(item)}`)
// 		}
// 	}
// }



/**
 * Convert an HTML string to one or more DOM elements, and add them to the current DOM scope.
 * @param html - The HTML string. For example `"<section><h2>Test</h2><p>Info..</p></section>"`.
 */
export function html(html: string) {
	if (!currentScope || !currentScope._parentElement) throw new ScopeError(true)
	let tmpParent = document.createElement(currentScope._parentElement.tagName)
	tmpParent.innerHTML = ''+html
	while(tmpParent.firstChild) {
		currentScope._addNode(tmpParent.firstChild)
	}
}

function bindInput(el: HTMLInputElement, store: Store) {
	let onStoreChange: (value: any) => void
	let onInputChange: () => void
	let type = el.getAttribute('type')
	let value = store.query({peek: true})
	if (type === 'checkbox') {
		if (value === undefined) store.set(el.checked)
		onStoreChange = value => el.checked = value
		onInputChange = () => store.set(el.checked)
	} else if (type === 'radio') {
		if (value === undefined && el.checked) store.set(el.value)
		onStoreChange = value => el.checked = (value === el.value)
		onInputChange = () => {
			if (el.checked) store.set(el.value)
		}
	} else {
		onInputChange = () => store.set(type==='number' || type==='range' ? (el.value==='' ? null : +el.value) : el.value)
		if (value === undefined) onInputChange()
		onStoreChange = value => {
			if (el.value !== value) el.value = value
		}
	}
	observe(() => {
		onStoreChange(store.get())
	})
	el.addEventListener('input', onInputChange)
	clean(() => {
		el.removeEventListener('input', onInputChange)
	})

}

/**
 * Add a text node at the current Scope position.
 */
export function text(text: string) {
	if (!currentScope) throw new ScopeError(true)
	if (text==null) return
	currentScope._addNode(document.createTextNode(text))
}


/**
 * Set properties and attributes for the containing DOM element. Doing it this way
 * as opposed to setting them directly from node() allows changing them later on
 * without recreating the element itself. Also, code can be more readable this way.
 * Note that when a nested `observe()` is used, properties set this way do NOT
 * automatically revert to their previous values.
 *
 * Here's how properties are handled:
 * - If `name` is `"create"`, `value` should be either a function that gets
 *   called with the element as its only argument immediately after creation,
 *   or a string being the name of a CSS class that gets added immediately
 *   after element creation, and removed shortly afterwards. This allows for
 *   reveal animations. However, this is intentionally *not* done
 *   for elements that are created as part of a larger (re)draw, to prevent
 *   all elements from individually animating on page creation.
 * - If `name` is `"destroy"`, `value` should be a function that gets called
 *   with the element as its only argument, *instead of* the element being
 *   removed from the DOM (which the function will presumably need to do
 *   eventually). This can be used for a conceal animation.
 *   As a convenience, it's also possible to provide a string instead of
 *   a function, which will be added to the element as a CSS class, allowing
 *   for simple transitions. In this case, the DOM element in removed 2 seconds
 *   later (currently not configurable).
 *   Similar to `"create"` (and in this case doing anything else would make little
 *   sense), this only happens when the element being is the top-level element
 *   being removed from the DOM.
 * - If `value` is a function, it is registered as an event handler for the
 *   `name` event.
 * - If `name` is `"class"` or `"className"` and the `value` is an
 *   object, all keys of the object are either added or removed from `classList`,
 *   depending on whether `value` is true-like or false-like.
 * - If `value` is a boolean *or* `name` is `"value"`, `"className"` or
 *   `"selectedIndex"`, it is set as a DOM element *property*.
 * - If `name` is `"text"`, the `value` is set as the element's `textContent`.
 * - If `name` is `"style"` and `value` is an object, each of its
 *   key/value pairs are assigned to the element's `.style`.
 * - In other cases, the `value` is set as the `name` HTML *attribute*.
 *
 * @example
 * ```
 * node('input', () => {
 *	   prop('type', 'password')
 *	   prop('readOnly', true)
 *	   prop('class', 'my-class')
 *	   prop('class', {
 *	   		'my-disabled-class': false,
 *	   		'my-enabled-class': true,
 *	   })
 *	   prop({
 *	   		class: 'my-class',
 *	   		text: 'Here is something to read...',
 *	   		style: {
 *	   			backgroundColor: 'red',
 *	   			fontWeight: 'bold',
 *	   		},
 *	   		create: aberdeen.fadeIn,
 *	   		destroy: 'my-fade-out-class',
 *	   		click: myClickHandler,
 *	   })
 * })
 * ```
 */
export function prop(name: string, value: any): void
export function prop(props: object): void

export function prop(name: any, value: any = undefined) {
	if (!currentScope || !currentScope._parentElement) throw new ScopeError(true)
	if (typeof name === 'object') {
		for(let k in name) {
			applyProp(currentScope._parentElement, k, name[k])
		}
	} else {
		applyProp(currentScope._parentElement, name, value)
	}
}


/**
 * Return the browser Element that `node()`s would be rendered to at this point.
 * NOTE: Manually changing the DOM is not recommended in most cases. There is
 * usually a better, declarative way. Although there are no hard guarantees on
 * how your changes interact with Aberdeen, in most cases results will not be
 * terribly surprising. Be careful within the parent element of onEach() though.
 */
export function getParentElement(): Element {
	if (!currentScope || !currentScope._parentElement) throw new ScopeError(true)
	return currentScope._parentElement
}


/**
 * Register a function that is to be executed right before the current reactive scope
 * disappears or redraws.
 * @param clean - The function to be executed.
 */
export function clean(clean: () => void) {
	if (!currentScope) throw new ScopeError(false)
	currentScope._cleaners.push({_clean: clean})
}


/**
 * Reactively run a function, meaning the function will rerun when any `Store` that was read
 * during its execution is updated.
 * Calls to `observe` can be nested, such that changes to `Store`s read by the inner function do
 * no cause the outer function to rerun.
 *
 * @param func - The function to be (repeatedly) executed.
 * @returns The mount id (usable for `unmount`) if this is a top-level observe.
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
export function observe(func: () => void): number | undefined {
	return _mount(undefined, func, SimpleScope)
}

/**
 * Like `observe`, but instead of deferring running the observer function until
 * a setTimeout 0, run it immediately and synchronously when a change to one of
 * the observed  `Store`s is made. Use this sparingly, as this prevents Aberdeen
 * from doing the usual batching and smart ordering of observers, leading to
 * performance problems and observing of 'weird' partial states.
 * @param func The function to be (repeatedly) executed.
 * @returns The mount id (usable for `unmount`) if this is a top-level observe.
 */
export function immediateObserve(func: () => void): number | undefined {
	return _mount(undefined, func, ImmediateScope)
}


/**
 * Like {@link Store.observe}, but allow the function to create DOM elements using {@link Store.node}.

 * @param func - The function to be (repeatedly) executed, possibly adding DOM elements to `parentElement`.
 * @param parentElement - A DOM element that will be used as the parent element for calls to `node`.
 * @returns The mount id (usable for `unmount`) if this is a top-level mount.
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
 * An example nesting {@link Store.observe} within `mount`:
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
export function mount(parentElement: Element, func: () => void) {
	return _mount(parentElement, func, SimpleScope)
}

let maxTopScopeId = 0
const topScopes: Map<number, SimpleScope> = new Map()
function _mount(parentElement: Element | undefined, func: () => void, MountScope: typeof SimpleScope): number | undefined {
	let scope
	if (parentElement || !currentScope) {
		scope = new MountScope(parentElement, undefined, 0, func)
	} else {
		scope = new MountScope(currentScope._parentElement, currentScope._lastChild || currentScope._precedingSibling, currentScope._queueOrder+1, func)
		currentScope._lastChild = scope
	}

	// Do the initial run
	scope._update()

	// Add it to our list of cleaners. Even if `scope` currently has
	// no cleaners, it may get them in a future refresh.
	if (currentScope) {
		currentScope._cleaners.push(scope)
	} else {
		topScopes.set(++maxTopScopeId, scope)
		return maxTopScopeId
	}
}

/**
 * Unmount one specific or all top-level mounts or observes, meaning those that were created outside of the scope 
 * of any other mount or observe.
 * @param id Optional mount number (as returned by `mount`, `observe` or `immediateObserve`). If `undefined`, unmount all.
 */
export function unmount(id?: number) {
	if (id == null) {
		for(let scope of topScopes.values()) scope._remove()
		topScopes.clear()
	} else {
		let scope = topScopes.get(id)
		if (!scope) throw new Error("No such mount "+id)
		scope._remove()
	}
}


/** Runs the given function, while not subscribing the current scope when reading {@link Store.Store} values.
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
export function peek<T>(func: () => T): T {
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

function applyProp(el: Element, prop: any, value: any) {
	if (prop==='create') {
		if (onCreateEnabled) {
			if (typeof value === 'function') {
				value(el)
			} else {
				el.classList.add(value)
				setTimeout(function(){el.classList.remove(value)}, 0)
			}
		}
	} else if (prop==='destroy') {
		onDestroyMap.set(el, value)
	} else if (typeof value === 'function') {
		// Set an event listener; remove it again on clean.
		el.addEventListener(prop, value)
		clean(() => el.removeEventListener(prop, value))
	} else if (prop==='value' || prop==='className' || prop==='selectedIndex' || value===true || value===false) {
		// All boolean values and a few specific keys should be set as a property
		(el as any)[prop] = value
	} else if (prop==='text') {
		// `text` is set as textContent
		el.textContent = value
	} else if ((prop==='class' || prop==='className') && typeof value === 'object') {
		// Allow setting classes using an object where the keys are the names and
		// the values are booleans stating whether to set or remove.
		for(let name in value) {
			if (value[name]) el.classList.add(name)
			else el.classList.remove(name)
		}
	} else if (prop==='style' && typeof value === 'object') {
		// `style` can receive an object
		Object.assign((<HTMLElement>el).style, value)
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

/* c8 ignore start */
function internalError(code: number) {
	let error = new Error("Aberdeen internal error "+code)
	setTimeout(() => { throw error }, 0)
}
/* c8 ignore end */

function handleError(e: any) {
	// Throw the error async, so the rest of the rendering can continue
	setTimeout(() => {throw e}, 0)
}

class ScopeError extends Error {
	constructor(mount: boolean) {
		super(`Operation not permitted outside of ${mount ? "a mount" : "an observe"}() scope`)
	}
}

/** @internal */
export function withEmitHandler(handler: (this: ObsCollection, index: any, newData: DatumType, oldData: DatumType) => void, func: ()=>void) {
	const oldEmitHandler = ObsCollection.prototype.emitChange
	ObsCollection.prototype.emitChange = handler
	try {
		func()
	} finally {
		ObsCollection.prototype.emitChange = oldEmitHandler
	}
}

/**
 * Run a function, while *not* causing reactive effects for any changes it makes to `Store`s.
 * @param func The function to be executed once immediately.
 */
export function inhibitEffects(func: () => void) {
	withEmitHandler(() => {}, func)
}

// @ts-ignore
// c8 ignore next
if (!String.prototype.replaceAll) String.prototype.replaceAll = function(from, to) { return this.split(from).join(to) }

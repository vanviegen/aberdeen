

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

let queueArray: Array<QueueRunner> = [] // When not empty, a runQueue is scheduled or currently running.
let queueIndex = 0 // This first element in queueArray that still needs to be processed.
let queueSet: Set<QueueRunner> = new Set() // Contains the subset of queueArray at index >= queueIndex.
let queueOrdered = true // Set to `false` when `queue()` appends a runner to `queueArray` that should come before the previous last item in the array. Will trigger a sort.
let runQueueDepth = 0 // Incremented when a queue event causes another queue event to be added. Reset when queue is empty. Throw when >= 42 to break (infinite) recursion.
let showCreateTransitions = false // Set to `true` only when creating top level elements in response to `Store` changes, triggering `create` transitions.


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

/**
 * Normally, changes to `Store`s are reacted to asynchronously, in an (optimized) 
 * batch, after a timeout of 0s. Calling `runQueue()` will do so immediately
 * and synchronously. Doing so may be helpful in cases where you need some DOM
 * modification to be done synchronously.
 *
 * This function is re-entrant, meaning it is safe to call `runQueue` from a
 * function that is called due to another (automatic) invocation of `runQueue`.
 */
export function runQueue(): void {
	showCreateTransitions = true
	for(; queueIndex < queueArray.length; ) {
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
		while(queueIndex < batchEndIndex && queueOrdered) {
			let runner = queueArray[queueIndex++]
			queueSet.delete(runner)
			runner._queueRun()
		}
		
		// If new items have been added to the queue while processing the previous
		// batch, we'll need to run this loop again.
		runQueueDepth++
	}

	queueIndex = 0
	queueArray.length = 0
	runQueueDepth = 0
	showCreateTransitions = false
}


let domWaiters: (() => void)[] = []
let domInReadPhase = false

/**
 * A promise-like object that you can `await`. It will resolve *after* the current batch
 * of DOM-write operations has completed. This is the best time to retrieve DOM properties
 * that dependent on a layout being completed, such as `offsetHeight`.
 *
 * By batching DOM reads separately from DOM writes, this prevents the browser from
 * interleaving layout reads and writes, which can force additional layout recalculations.
 * This helps reduce visual glitches and flashes by ensuring the browser doesn't render
 * intermediate DOM states during updates.
 *
 * Unlike `setTimeout` or `requestAnimationFrame`, this mechanism ensures that DOM read
 * operations happen before any DOM writes in the same queue cycle, minimizing layout thrashing.
 * 
 * See `transitions.js` for some examples.
 */

export const DOM_READ_PHASE = {
	then: function(fulfilled: () => void) {
		if (domInReadPhase) fulfilled()
		else {
			if (!domWaiters.length) queue(DOM_PHASE_RUNNER)
			domWaiters.push(fulfilled)
		}
		return this
	}
}
/**
 * A promise-like object that you can `await`. It will resolve *after* the current 
 * DOM_READ_PHASE has completed (if any) and after any DOM triggered by Aberdeen
 * have completed. This is a good time to do little manual DOM tweaks that depend
 * on a *read phase* first, like triggering transitions.
 *
 * By batching DOM writes separately from DOM reads, this prevents the browser from
 * interleaving layout reads and writes, which can force additional layout recalculations.
 * This helps reduce visual glitches and flashes by ensuring the browser doesn't render
 * intermediate DOM states during updates.
 *
 * Unlike `setTimeout` or `requestAnimationFrame`, this mechanism ensures that DOM write
 * operations happen after all DOM reads in the same queue cycle, minimizing layout thrashing.
 *
 * See `transitions.js` for some examples.
 */

export const DOM_WRITE_PHASE = {
	then: function(fulfilled: () => void) {
		if (!domInReadPhase) fulfilled()
		else {
			if (!domWaiters.length) queue(DOM_PHASE_RUNNER)
			domWaiters.push(fulfilled)
		}
		return this
	}
}

const DOM_PHASE_RUNNER = {
	_queueOrder: 99999,
	_queueRun: function() {
		let waiters = domWaiters
		domWaiters = []
		domInReadPhase = !domInReadPhase
		for(let waiter of waiters) {
			try {
				waiter()
			} catch(e) {
				console.error(e)
			}
		}
	}
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
	// The last child node or scope within this scope that has the same `parentElement`
	_lastChild: Node | Scope | undefined

	// The list of clean functions to be called when this scope is cleaned. These can
	// be for child scopes, subscriptions as well as `clean(..)` hooks.
	_cleaners: Array<{_clean: (scope: Scope) => void}> = []

	// Set to true after the scope has been cleaned, causing any spurious reruns to
	// be ignored.
	_isDead: boolean = false

	constructor(
		public _parentElement: Element | undefined,
		// The node or scope right before this scope that has the same `parentElement`
		public _precedingSibling: Node | Scope | undefined,
		// How deep is this scope nested in other scopes; we use this to make sure events
		// at lower depths are handled before events at higher depths.
		public _queueOrder: number,
	) {
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
		let prevNode = this._findLastNode() || this._findPrecedingNode()

		this._parentElement!.insertBefore(node, prevNode ? prevNode.nextSibling : this._parentElement!.firstChild)
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
	constructor(
		parentElement: Element | undefined,
		precedingSibling: Node | Scope | undefined,
		queueOrder: number,
		renderer?: () => void,
	) {
		super(parentElement, precedingSibling, queueOrder)
		if (renderer) this._renderer = renderer
	}

	/* c8 ignore start */
	_renderer() {
		// Should be overriden by a subclass or the constructor
		internalError(14)
	}
	/* c8 ignore stop */

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
			handleError(e, true)
		}
		currentScope = savedScope
	}

	_install() {
		if (showCreateTransitions) {
			showCreateTransitions = false
			this._update()
			showCreateTransitions = true
		} else {
			this._update()
		}
		// Add it to our list of cleaners. Even if `childScope` currently has
		// no cleaners, it may get them in a future refresh.
		currentScope!._cleaners.push(this)
	}
}

/**
 * This could have been done with a SimpleScope, but then we'd have to draw along an instance of
 * that as well as a renderer function that closes over quite a few variables, which probably
 * wouldn't be great for the performance of this common feature.
 */
class SetArgScope extends SimpleScope {
	constructor(
		parentElement: Element | undefined,
		precedingSibling: Node | Scope | undefined,
		queueOrder: number,
		private _key: string,
		private _value: Store,
	) {
		super(parentElement, precedingSibling, queueOrder)
	}

	_renderer() {
		applyArg(this._parentElement as Element, this._key, this._value.get())
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
			handleError(e, false)
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
				handleError(e, true)
			}
		}

		currentScope = savedScope
	}
}


/**
 * This global is set during the execution of a `Scope.render`. It is used by
 * functions like `$` and `clean`.
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



 const DETACHED_KEY: any = {}

 /*
 * A data store that automatically subscribes the current Scope to updates
 * whenever data is read from it.
 *
 * Supported data types are: `string`, `number`, `boolean`, `undefined`, `null`,
 * `Array`, `object` and `Map`. The latter three will always have `Store` objects as
 * values, creating a tree of `Store`-objects.
 */
 
export interface Store {
	/**
	 * Return a `Store` deeper within the tree by resolving the given `path`,
	 * subscribing to every level.
	 * In case `undefined` is encountered while resolving the path, a newly
	 * created `Store` containing `undefined` is returned. In that case, the
	 * `Store`'s [[`isDetached`]] method will return `true`.
	 * In case something other than a collection is encountered, an error is thrown.
	 */
	(...path: any[]): Store
}

export class Store {
	/** @internal */
	// @ts-ignore
	private _collection: ObsCollection
	/** @internal */
	private _idx: any
	/** @internal */
	private _virtual: string[] | undefined

	/**
	 * Create a new `Store` with `undefined` as its initial value.
	 */
	constructor()
	/**
	 * Create a new `Store`.
	 * @param value The initial value. Plain objects, arrays and `Map`s, are converted
	 * into a tree of nested `Store`s. When another `Store` is included somewhere in that
	 * input tree, a reference is made.
	 */
	constructor(value: any)
	
	/** @internal */
	constructor(collection: ObsCollection, index: any)

	/** @internal */
	constructor(value: any = undefined, index: any = undefined) {
		/**
		 * Create and return a new `Store` that represents the subtree at `path` of
		 * the current `Store`.
		 * 
		 * The `path` is only actually resolved when this new `Store` is first used,
		 * and how this is done depends on whether a read or a write operation is 
		 * performed. Read operations will just use an `undefined` value when a
		 * subtree that we're diving into does not exist. Also, they'll subscribe
		 * to changes at each level of the tree indexed by `path`.
		 * 
		 * Write operations will create any missing subtrees as objects. They don't
		 * subscribe to changes (as they are the ones causing the changes). 
		 * 
		 * Both read and write operations will throw an error if, while resolving
		 * `path`, they encounters a non-collection data type (such as a number)
		 */
		const ref: Store = function(...path: any): Store {
			const result = new Store(ref._collection, ref._idx)
			if (path.length || ref._virtual) {
				result._virtual = ref._virtual ? ref._virtual.concat(path) : path
			}
			return result
		} as Store

		Object.setPrototypeOf(ref, Store.prototype)
		if (index===undefined) {
			ref._collection = new ObsArray()
			ref._idx = 0
			if (value!==undefined) {
				ref._collection.rawSet(0, valueToData(value))
			}
		} else {
			if (!(value instanceof ObsCollection)) {
				throw new Error("1st parameter should be an ObsCollection if the 2nd is also given")
			}
			ref._collection = value
			ref._idx = index
		}
		// @ts-ignore
		return ref
	}

	/**
	 * @returns The index for this Store within its parent collection. This will be a `number`
	 * when the parent collection is an array, a `string` when it's an object, or any data type
	 * when it's a `Map`.
	 *
	 * @example
	 * ```
	 * let store = new Store({x: 123})
	 * let subStore = store.ref('x')
	 * subStore.get() // 123
	 * subStore.index() // 'x'
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
	 * Retrieve the value for store, subscribing the observe scope to changes.
	 *
	 * @param depth Limit the depth of the retrieved data structure to this positive integer.
     *    When `depth` is `1`, only a single level of the value at `path` is unpacked. This
     *    makes no difference for primitive values (like strings), but for objects, maps and
     *    arrays, it means that each *value* in the resulting data structure will be a
     *    reference to the `Store` for that value.
     *
	 * @returns The resulting value (or `undefined` if the `Store` does not exist). 
	 */
	get(depth: number = 0): any {
		let value = this._observe()
		return value instanceof ObsCollection ? value._getRecursive(depth-1) : value
	}

	/** 
	 * Exactly like {@link Store.get}, except that when executed from an observe scope,
	 * we will not subscribe to changes in the data retrieved data.
	 */
	peek(depth: number = 0): any {

		let savedScope = currentScope
		currentScope = undefined
		let result = this.get(depth)
		currentScope = savedScope
		return result
	}
	

	/**
	 * Like {@link Store.get}, but with return type checking.
	 * 
	 * @param expectType A string specifying what type the.get is expected to return. Options are:
	 *    "undefined", "null", "boolean", "number", "string", "function", "array", "map"
	 *    and "object". If the store holds a different type of value, a `TypeError`
	 *    exception is thrown.
	 * @returns 
	 */
	getTyped(expectType: String, depth: number = 0): any {
		let value = this._observe()
		let type = (value instanceof ObsCollection) ? value._getType() : (value===null ? "null" : typeof value)
		if (type !== expectType) throw new TypeError(`Expecting ${expectType} but got ${type}`)
		return value instanceof ObsCollection ? value._getRecursive(depth-1) : value
	}

	/**
	 * @returns Like {@link Store.get}, but throws a `TypeError` if the resulting value is not of type `number`.
	 * Using this instead of just {@link Store.get} is especially useful from within TypeScript.
	 */
	getNumber(): number { return <number>this.getTyped('number') }
	/**
	 * @returns Like {@link Store.get}, but throws a `TypeError` if the resulting value is not of type `string`.
	 * Using this instead of just {@link Store.get} is especially useful from within TypeScript.
	 */
	getString(): string { return <string>this.getTyped('string') }
	/**
	 * @returns Like {@link Store.get}, but throws a `TypeError` if the resulting value is not of type `boolean`.
	 * Using this instead of just {@link Store.get} is especially useful from within TypeScript.
	 */
	getBoolean(): boolean { return <boolean>this.getTyped('boolean') }
	/**
	 * @returns Like {@link Store.get}, but throws a `TypeError` if the resulting value is not of type `function`.
	 * Using this instead of just {@link Store.get} is especially useful from within TypeScript.
	 */
	getFunction(): (Function) { return <Function>this.getTyped('function') }
	/**
	 * @returns Like {@link Store.get}, but throws a `TypeError` if the resulting value is not of type `array`.
	 * Using this instead of just {@link Store.get} is especially useful from within TypeScript.
	 */
	getArray(depth: number = 0): any[] { return <any[]>this.getTyped('array', depth) }
	/**
	 * @returns Like {@link Store.get}, but throws a `TypeError` if the resulting value is not of type `object`.
	 * Using this instead of just {@link Store.get} is especially useful from within TypeScript.
	 */
	getObject(depth: number = 0): object { return <object>this.getTyped('object', depth) }
	/**
	 * @returns Like {@link Store.get}, but throws a `TypeError` if the resulting value is not of type `map`.
	 * Using this instead of just {@link Store.get} is especially useful from within TypeScript.
	 */
	getMap(depth: number = 0): Map<any,any> { return <Map<any,any>>this.getTyped('map', depth) }


	/**
	 * Like {@link Store.get}, but with a default value (returned when the Store
	 * contains `undefined`). This default value is also used to determine the expected type,
	 * and to throw otherwise.
	 *
	 * @example
	 * ```
	 * let store = new Store({x: 42})
	 * store('x').getOr(99) // 42
	 * store('y').getOr(99) // 99
	 * store('x').getOr('hello') // throws TypeError (because 42 is not a string)
	 * ```
	 */
	getOr<T>(defaultValue: T): T {
		let value = this._observe()
		if (value===undefined) return defaultValue

		let expectType: string = typeof defaultValue
		if (expectType==='object') {
			if (defaultValue instanceof Map) expectType = 'map'
			else if (defaultValue instanceof Array) expectType = 'array'
			else if (defaultValue === null) expectType = 'null'
		}
		let type = (value instanceof ObsCollection) ? value._getType() : (value===null ? "null" : typeof value)
		if (type !== expectType) throw new TypeError(`Expecting ${expectType} but got ${type}`)
		return (value instanceof ObsCollection ? value._getRecursive(-1) : value) as T
	}

	/**
	 * Checks if the collection held in `Store` is empty, and subscribes the current scope to changes of the emptiness of this collection.
	 *
	 * @returns When the collection is not empty `true` is returned. If it is empty or if the value is undefined, `false` is returned.
	 * @throws When the value is not a collection and not undefined, an Error will be thrown.
	 */
	isEmpty(): boolean {
		let value = this._observe()
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
	 * Returns the number of items in the collection held in Store, and subscribes the current scope to changes in this count.
	 *
	 * @returns The number of items contained in the collection, or 0 if the value is undefined.
	 * @throws When the value is not a collection and not undefined, an Error will be thrown.
	 */
	count(): number {
		let value = this._observe()
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
	 * Returns a strings describing the type of the `Store` value, subscribing to changes of this type.
	 * Note: this currently also subscribes to changes of primitive values, so changing a value from 3 to 4
	 * would cause the scope to be rerun. This is not great, and may change in the future. This caveat does
	 * not apply to changes made *inside* an object, `Array` or `Map`.
	 *
	 * @returns Possible options: "undefined", "null", "boolean", "number", "string", "function", "array", "map" or "object".
	 */
	getType(): string {
		let value = this._observe()
		return (value instanceof ObsCollection) ? value._getType() : (value===null ? "null" : typeof value)
	}

	/**
	 * Returns a new `Store` that will always hold either the value of `whenTrue` or the value
	 * of `whenFalse` depending on whether the original `Store` is truthy or not.
	 * 
	 * @param whenTrue The value set to the return-`Store` while `this` is truthy. This can be
	 *     any type of value. If it's a `Store`, the return-`Store` will reference the same 
	 *     data (so *no* deep copy will be made).
	 * @param whenFalse Like `whenTrue`, but for falsy values (false, undefined, null, 0, "").
	 * @returns A store holding the result value. The value will keep getting updated while
	 * the observe context from which `if()` was called remains active.
	 */
	if(whenTrue: any[], whenFalse?: any[]): Store {
		const result = new Store()
		observe(() => {
			const value = this.get() ? whenTrue : whenFalse
			result.set(value)
		})
		return result
	}

	/**
	 * Sets the `Store` value to the given argument.
	 *
	 * When a `Store` is passed in as the value, its value will be copied (subscribing to changes). In
	 * case the value is an object, an `Array` or a `Map`, a *reference* to that data structure will
	 * be created, so that changes made through one `Store` will be reflected through the other. Be
	 * carefull not to create loops in your `Store` tree that way, as that would cause any future
	 * call to {@link Store.get} to throw a `RangeError` (Maximum call stack size exceeded.)
	 *
	 * If you intent to make a copy instead of a reference, call {@link Store.get} on the origin `Store`.
	 *
	 * @returns The `Store` itself, for chaining other methods.
     *
	 * @example
	 * ```
	 * let store = new Store() // Value is `undefined`
	 *
	 * store.set(6)
	 * store.get() // 6
	 *
	 * store.set({}) // Change  value to an empty object
	 * store('a', 'b', 'c').set('d') // Create parent path as objects
	 * store.get() // {x: 6, a: {b: {c: 'd'}}}
	 *
	 * store.set(42) // Overwrites all of the above
	 * store.get() // 42
	 *
	 * store('x').set(6) // Throw Error (42 is not a collection)
	 * ```
	 */
	set(newValue: any): Store {
		this._materialize(true)
		this._collection._setIndex(this._idx, newValue, true)
		runImmediateQueue()
		return this
	}

	/** @internal */
	_materialize(forWriting: boolean): boolean {
		if (!this._virtual) return true
		let collection = this._collection
		let idx = this._idx
		for(let i=0; i<this._virtual.length; i++) {
			if (!forWriting && currentScope) {
				if (collection._addObserver(idx, currentScope)) {
					currentScope._cleaners.push(this)
				}
			}
			let value = collection.rawGet(idx)
			if (!(value instanceof ObsCollection)) {
				// Throw an error if trying to index a primitive type
				if (value!==undefined) throw new Error(`While resolving ${JSON.stringify(this._virtual)}, found ${JSON.stringify(value)} at index ${i} instead of a collection.`)
				// For reads, we'll just give up. We might reactively get another shot at this.
				if (!forWriting) return false
				// For writes, create a new collection.
				value = new ObsObject()
				collection.rawSet(idx, value)
				collection.emitChange(idx, value, undefined)	
			}
			collection = value
			const prop = this._virtual[i]
			idx = collection._normalizeIndex(prop)
		}
		this._collection = collection
		this._idx = idx
		delete this._virtual
		return true
	}

	/**
	 * Sets the `Store` to the given `mergeValue`, but without deleting any pre-existing
	 * items when a collection overwrites a similarly typed collection. This results in
	 * a deep merge.
     *
 	 * @returns The `Store` itself, for chaining other methods.
	 *
	 * @example
	 * ```
	 * let store = new Store({a: {x: 1}})
	 * store.merge({a: {y: 2}, b: 3})
	 * store.get() // {a: {x: 1, y: 2}, b: 3}
	 * ```
	 */
	merge(mergeValue: any): Store {
		this._materialize(true)
		this._collection._setIndex(this._idx, mergeValue, false)
		runImmediateQueue()
		return this
	}

	/**
	 * Sets the value for the store to `undefined`, which causes it to be omitted from the map (or array, if it's at the end)
     *
 	 * @returns The `Store` itself, for chaining other methods.
	 *
	 * @example
	 * ```
	 * let store = new Store({a: 1, b: 2})
	 * store('a').delete()
	 * store.get() // {b: 2}
	 *
	 * store = new Store(['a','b','c'])
	 * store(1).delete()
	 * store.get() // ['a', undefined, 'c']
	 * store(2).delete()
	 * store.get() // ['a']
	 * store.delete()
	 * store.get() // undefined
	 * ```
	 */
	delete(): Store {
		this._materialize(true)
		this._collection._setIndex(this._idx, undefined, true)
		runImmediateQueue()
		return this
	}

	/**
	 * Pushes a value to the end of the Array that is at the specified path in the store.
	 * If that store path is `undefined`, an Array is created first.
	 * The last argument is the value to be added, any earlier arguments indicate the path.
	 *
	 * @returns The index at which the item was appended.
	 * @throws TypeError when the store contains a primitive data type.
	 * 
	 * @example
	 * ```
	 * let store = new Store()
	 * store.push(3) // Creates the array
	 * store.push(6)
	 * store.get() // [3,6]
	 *
	 * store = new Store({myArray: [1,2]})
	 * store('myArray').push(3)
	 * store.get() // {myArray: [1,2,3]}
	 * ```
	 */
	push(newValue: any): number {
		this._materialize(true)

		let obsArray = this._collection.rawGet(this._idx)
		if (obsArray===undefined) {
			obsArray = new ObsArray()
			this._collection._setIndex(this._idx, obsArray, true)
		} else if (!(obsArray instanceof ObsArray)) {
			throw new TypeError(`push() is only allowed for an array or undefined (which would become an array)`)
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
 	 * @returns The `Store` itself, for chaining other methods.
	 */
	modify(func: (value: any) => any): Store {
		this.set(func(this.peek()))
		return this
	}

	/** @internal */
	_observe() {
		if (!this._materialize(false)) return undefined
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
	 * @param renderer The function to be called for each item. It receives the item's `Store` object as its only argument.
	 * @param makeSortKey An optional function that, given an items `Store` object, returns a value to be sorted on.
	 *   This value can be a number, a string, or an array containing a combination of both. When undefined is returned,
	 *   the item is *not* rendered. If `makeSortKey` is not specified, the output will be sorted by `index()`.
	 */
	onEach(renderer: (store: Store) => void, makeSortKey: (store: Store) => any = defaultMakeSortKey): void {
		if (!currentScope) { // Do this in a new top-level scope
			_mount(undefined, () => this.onEach(renderer, makeSortKey), SimpleScope)
			return
		}

		let val = this._observe()
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
	 * Derive a new `Store` from this `Store`, by reactively passing its value
	 * through the specified function.
	 * @param func Your function. It should accept a the input store's value, and return
	 *   a result to be reactively set to the output store.
	 * @returns The output `Store`.
	 * @example
	 * ```javascript
	 * const store = new Store(21)
	 * const double = store.derive(v => v*2)
	 * double.get() // 42
	 * 
	 * store.set(100)
	 * runQueue() // Or after a setTimeout 0, due to batching
	 * double.get() // 200
	 * ```
	 */
	derive(func: (value: any) => any): Store {
		let out = new Store()
		observe(() => {
			out.set(func(this.get()))
		})
		return out
	}

	/**
	 * Applies a filter/map function on each item within the `Store`'s collection,
	 * and reactively manages the returned `Map` `Store` to hold any results.
	 *
	 * @param func - Function that transform the given store into an output value or
	 * `undefined` in case this value should be skipped:
	 *
	 * @returns - A array/map/object `Store` with the values returned by `func` and the
	 * corresponding keys from the original map, array or object `Store`.
	 *
	 * When items disappear from the `Store` or are changed in a way that `func` depends
	 * upon, the resulting items are removed from the output `Store` as well. When multiple
	 * input items produce the same output keys, this may lead to unexpected results.
	 */
	map(func: (store: Store) => any): Store {
		let out = new Store()
		observe(() => {
			let t = this.getType()
			out.set(t==='array' ? [] : (t==='object' ? {} : new Map()))
			this.onEach((item: Store) => {
				let value = func(item)
				if (value !== undefined) {
					let key = item.index()
					const ref = out(key)
					ref.set(value)
					clean(() => {
						ref.delete()
					})
				}
			})
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
			let refs: Array<Store> = []
			if (result.constructor === Object) {
				for(let key in result) {
					const ref = out(key)
					ref.set(result[key])
					refs.push(ref)
				}
			} else if (result instanceof Map) {
				result.forEach((value: any, key: any) => {
					const ref = out(key)
					ref.set(value)
					refs.push(ref)
				})
			} else {
				return
			}
			if (refs.length) {
				clean(() => {
					for(let ref of refs) {
						ref.delete()
					}
				})
			}
		})
		return out	
	}

	/**
	* Dump a live view of the `Store` tree as HTML text, `ul` and `li` nodes at
	* the current mount position. Meant for debugging purposes.
 	* @returns The `Store` itself, for chaining other methods.
	*/
	dump(): Store {
		let type = this.getType()
		if (type === 'array' || type === 'object' || type === 'map') {
			$({text: `<${type}>`})
			$('ul', () => {
				this.onEach((sub: Store) => {
					$('li:'+JSON.stringify(sub.index())+": ", () => {
						sub.dump()
					})
				})
			})
		} else {
			$({text: JSON.stringify(this.get())})
		}
		return this
	}
}



let onDestroyMap: WeakMap<Node, string | Function | true> = new WeakMap()

function destroyWithClass(element: Element, cls: string) {
	element.classList.add(cls)
	setTimeout(() => element.remove(), 2000)
}


function addLeafNode(deepEl: Element, node: Node) {
	if (deepEl === (currentScope as Scope)._parentElement) {
		currentScope!._addNode(node)
	} else {
		deepEl.appendChild(node)
	}
}


function applyBinding(_el: Element, _key: string, store: Store) {
	if (store==null) return
	if (!(store instanceof Store)) throw new Error(`Unexpect bind-argument: ${JSON.parse(store)}`)
		const el = _el as HTMLInputElement
	let onStoreChange: (value: any) => void
	let onInputChange: () => void
	let type = el.getAttribute('type')
	let value = store.peek()
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


const SPECIAL_PROPS: {[key: string]: (el: Element, value: any) => void} = {
	create: function(el: Element, value: any) {
		if (!showCreateTransitions) return
		if (typeof value === 'function') {
			value(el)
		} else {
			el.classList.add(value);
			(async function(){
				await DOM_READ_PHASE;
				(el as HTMLElement).offsetHeight;
				await DOM_WRITE_PHASE;
				el.classList.remove(value)
			})()
		}
	},
	destroy: function(deepEl: Element, value: any) {
		onDestroyMap.set(deepEl, value)
	},
	html: function(deepEl: Element, value: any) {
		if (!value) return
		let tmpParent = document.createElement(deepEl.tagName)
		tmpParent.innerHTML = ''+value
		while(tmpParent.firstChild) addLeafNode(deepEl, tmpParent.firstChild)
	},
	text: function(deepEl: Element, value: any) {
		if (value!=null) addLeafNode(deepEl, document.createTextNode(value))
	},
	element: function(deepEl: Element, value: any) {
		if (value==null) return
		if (!(value instanceof Node)) throw new Error(`Unexpect element-argument: ${JSON.parse(value)}`)
		addLeafNode(deepEl, value)
	},
}



/**
 * Modifies the *parent* DOM element in the current reactive scope, or adds
 * new DOM elements to it.
 * 
 * @param args - Arguments that define how to modify/create elements.
 * 
 * ### String arguments
 * Create new elements with optional classes and text content:
 * ```js
 * $('div.myClass')              // <div class="myClass"></div>
 * $('span.c1.c2:Hello')         // <span class="c1 c2">Hello</span>
 * $('p:Some text')              // <p>Some text</p>
 * $('.my-thing')                // <div class="my-thing"></div>
 * $('div', 'span', 'p.cls')     // <div><span<p class="cls"></p></span></div>
 * $(':Just some text!')		 // Just some text! (No new element, just a text node)
 * ```
 * 
 * ### Object arguments
 * Set properties, attributes, events and special features:
 * ```js
 * // Classes (dot prefix)
 * $('div', {'.active': true})           // Add class
 * $('div', {'.hidden': false})          // Remove (or don't add) class
 * $('div', {'.selected': myStore})      // Reactively add/remove class
 * 
 * // Styles (dollar prefixed and camel-cased CSS properties)
 * $('div', {$color: 'red'})             // style.color = 'red'
 * $('div', {$marginTop: '10px'})        // style.marginTop = '10px'
 * $('div', {$color: myColorStore})      // Reactively change color
 * 
 * // Events (function values)
 * $('button', {click: () => alert()})   // Add click handler
 * 
 * // Properties (boolean values, `selectedIndex`, `value`)
 * $('input', {disabled: true})          // el.disabled = true
 * $('input', {value: 'test'})           // el.value = 'test'
 * $('select', {selectedIndex: 2})       // el.selectedIndex = 2
 * 
 * // Transitions
 * $('div', {create: 'fade-in'})         // Add class on create
 * $('div', {create: el => {...}})       // Run function on create
 * $('div', {destroy: 'fade-out'})       // Add class before remove
 * $('div', {destroy: el => {...}})      // Run function before remove
 * 
 * // Content
 * $('div', {html: '<b>Bold</b>'})       // Set innerHTML
 * $('div', {text: 'Plain text'})        // Add text node
 * const myElement = document.createElement('video')
 * $('div', {element: myElement})        // Add existing DOM element
 *
 * // Regular attributes (everything else)
 * $('div', {title: 'Info'})             // el.setAttribute('title', 'info')
 * ```
 * 
 * When a `Store` is passed as a value, a seperate observe-scope will
 * be created for it, such that when the `Store` changes, only *that*
 * UI property will need to be updated.
 * So in the following example, when `colorStore` changes, only the
 * `color` CSS property will be updated.
 * ```js
 * $('div', {
 *   '.active': activeStore,             // Reactive class
 *   $color: colorStore,                 // Reactive style
 *   text: textStore                     // Reactive text
 * })
 * ```
 * 
 * ### Two-way input binding
 * Set the initial value of an <input> <textarea> or <select> to that
 * of a `Store`, and then start reflecting user changes to the former
 * in the latter.
 * ```js
 * $('input', {bind: myStore})           // Binds input.value
 * ```
 * This is a special case, as changes to the `Store` will *not* be
 * reflected in the UI. 
 * 
 * ### Function arguments
 * Create child scopes that re-run on observed `Store` changes:
 * ```js 
 * $('div', () => {
 *   $(myStore.get() ? 'span' : 'p')     // Reactive element type
 * })
 * ```
 * When *only* a function is given, `$` behaves exactly like {@link Store.observe},
 * except that it will only work when we're inside a `mount`.
 * 
 * @throws {ScopeError} If called outside an observable scope.
 * @throws {Error} If invalid arguments are provided.
 */

export function $(...args: (string | (() => void) | false | null | undefined | {[key: string]: any})[]) {
	if (!currentScope || !currentScope._parentElement) throw new ScopeError(true)

	let deepEl = currentScope._parentElement

	for(let arg of args) {
		if (arg == null || arg === false) continue
		if (typeof arg === 'string') {
			let text, classes
			const textPos = arg.indexOf(':')
			if (textPos >= 0) {
				text = arg.substring(textPos+1)
				if (textPos === 0) { // Just a string to add as text, no new node
					addLeafNode(deepEl, document.createTextNode(text))
					continue
				}
				arg = arg.substring(0,textPos)
			}
			const classPos = arg.indexOf('.')
			if (classPos >= 0) {
				classes = arg.substring(classPos+1).replaceAll('.', ' ')
				arg = arg.substring(0, classPos)
			}
			if (arg.indexOf(' ') >= 0) throw new Error(`Tag '${arg}' cannot contain space`)
			const el = document.createElement(arg || 'div')
			if (classes) el.className = classes
			if (text) el.textContent = text
			addLeafNode(deepEl, el)
			deepEl = el
		}
		else if (typeof arg === 'object') {
			if (arg.constructor !== Object) throw new Error(`Unexpected argument: ${arg}`)
			for(const key in arg) {
				const val = arg[key]
				if (key === 'bind') { // Special case, as for this prop we *don't* want to resolve the Store to a value first.
					applyBinding(deepEl, key, val)
				} else if (val instanceof Store) {
					let childScope = new SetArgScope(deepEl, deepEl.lastChild as Node, currentScope!._queueOrder+1, key, val)
					childScope._install()
				} else {
					applyArg(deepEl, key, val)
				}
			}
		} else if (typeof arg === 'function') {
			if (deepEl === currentScope._parentElement) { // do what observe does
				_mount(undefined, args[0] as any, SimpleScope)
			} else { // new scope for a new node without any scope attached yet
				let childScope = new SimpleScope(deepEl, deepEl.lastChild as Node, currentScope._queueOrder+1, arg)
				childScope._install()
			}
		} else {
			throw new Error(`Unexpected argument: ${JSON.stringify(arg)}`)
		}
	}
}


function applyArg(deepEl: Element, key: string, value: any) {
	if (key[0] === '.') { // CSS class(es)
		const classes = key.substring(1).split('.')
		if (value) deepEl.classList.add(...classes)
		else deepEl.classList.remove(...classes)
	} else if (key[0] === '$') { // Style
		const name = key.substring(1);
		if (value==null || value===false) (deepEl as any).style[name] = ''
		else (deepEl as any).style[name] = ''+value
	} else if (key in SPECIAL_PROPS) { // Special property
		SPECIAL_PROPS[key](deepEl, value)
	} else if (typeof value === 'function') { // Event listener
		deepEl.addEventListener(key, value)
		clean(() => deepEl.removeEventListener(key, value))
	} else if (value===true || value===false || key==='value' || key==='selectedIndex') { // DOM property
		(deepEl as any)[key] = value
	} else { // HTML attribute
		deepEl.setAttribute(key, value)
	}
}
				
function defaultOnError(error: Error) {
	console.error('Error while in Aberdeen render:', error)
	return true
}
let onError: (error: Error) => boolean | undefined = defaultOnError

/**
 * Set a custome error handling function, thast is called when an error occurs during rendering
 * while in a reactive scope. The default implementation logs the error to the console, and then
 * just returns `true`, which causes an 'Error' message to be displayed in the UI. When this function
 * returns `false`, the error is suppressed. This mechanism exists because rendering errors can occur
 * at any time, not just synchronous when making a call to Aberdeen, thus normal exception handling
 * is not always possible. 
 * 
 * @param handler The handler function, getting an `Error` as its argument, and returning `false`
 *    if it does *not* want an error message to be added to the DOM.
 *    When `handler is `undefined`, the default error handling will be reinstated.
 * 
 * @example
 * ```javascript
 * // 
 * setErrorHandler(error => {
 *    // Tell our developers about the problem.
 * 	  fancyErrorLogger(error)
 *    // Add custom error message to the DOM.
 *    try {
 *        $('.error:Sorry, something went wrong!')
 *    } catch() {} // In case there is no parent element.
 *    // Don't add default error message to the DOM.
 * 	  return false
 * })
 * ```
 */
export function setErrorHandler(handler?: (error: Error) => boolean | undefined) {
	onError = handler || defaultOnError
}


/**
 * Return the browser Element that nodes would be rendered to at this point.
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
 * Reactively run the function, adding any DOM-elements created using {@link $} to the given parent element.

 * @param func - The function to be (repeatedly) executed, possibly adding DOM elements to `parentElement`.
 * @param parentElement - A DOM element that will be used as the parent element for calls to `$`.
 * @returns The mount id (usable for `unmount`) if this is a top-level mount.
 *
 * @example
 * ```
 * let store = new Store(0)
 * setInterval(() => store.modify(v => v+1), 1000)
 *
 * mount(document.body, () => {
 * 	   $(`h2:${store.get()} seconds have passed`)
 * })
 * ```
 *
 * An example nesting {@link Store.observe} within `mount`:
 * ```
 * let selected = new Store(0)
 * let colors = new Store(new Map())
 *
 * mount(document.body, () => {
 *   // This function will never rerun (as it does not read any `Store`s)
 *   $('button:<<', {click: () => selected.modify(n => n-1)})
 *   $('button:>>', {click: () => selected.modify(n => n+1)})
 *
 *   observe(() => {
 *     // This will rerun whenever `selected` changes, recreating the <h2> and <input>.
 *     $('h2', {text: '#' + selected.get()})
 *     $('input', {type: 'color', value: '#ffffff' bind: colors(selected.get())})
 *   })
 *
 *   observe(() => {
 *     // This function will rerun when `selected` or the selected color changes.
 *     // It will change the <body> background-color.
 *     $({$backgroundColor: colors.get(selected.get()) || 'white'})
 *   })
 * })
 * ```
*/
export function mount(parentElement: Element, func: () => void) {
	for(let scope of topScopes.values()) {
		if (parentElement === scope._parentElement) {
			throw new Error("Only a single mount per parent element")
		}
	}

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
		topScopes.delete(id)
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

function valueToData(value: any) {
	if (value instanceof Store) {
		// When a Store is passed pointing at a collection, a reference
		// is made to that collection.
		return value._observe()
	} else if (typeof value !== "object" || !value) {
		// Simple data types
		return value
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
	throw new Error("Aberdeen internal error "+code)
}
/* c8 ignore end */

function handleError(e: any, showMessage: boolean) {
	try {
		if (onError(e) === false) showMessage = false
	} catch {}
	if (showMessage && currentScope?._parentElement) $('.aberdeen-error:Error')
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

// @ts-ignore
// c8 ignore next
if (!String.prototype.replaceAll) String.prototype.replaceAll = function(from, to) { return this.split(from).join(to) }
declare global {
	interface String {
		replaceAll(from: string, to: string): string;
	}
}

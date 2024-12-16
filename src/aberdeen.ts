

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

let queueArray: Array<QueueRunner> = []
let queueSet: Set<QueueRunner> = new Set()
let queueOrdered = true
let runQueueDepth = 0
let queueIndex: number | undefined
type Patch = Map<ObsCollection, Map<any, [any, any]>>;
let recordingPatch: Patch | undefined

function queue(runner: QueueRunner) {
	if (queueSet.has(runner)) return
	if (runQueueDepth > 42) {
		throw new Error("Too many recursive updates from observes")
	}
	if (!queueArray.length) {
		setTimeout(runQueue, 0)
	}
	else if (runner.queueOrder < queueArray[queueArray.length-1].queueOrder) {
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
			queueArray.sort((a,b) => a.queueOrder - b.queueOrder)
			queueOrdered = true
		}
		
		// Process the rest of what's currently in the queue.
		let batchEndIndex = queueArray.length
		for(; queueIndex < batchEndIndex && queueOrdered; queueIndex++) {
			let runner = queueArray[queueIndex]
			queueSet.delete(runner)
			runner.queueRun()
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


let scheduleOrder = 1000
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
	let order = (queueIndex!=null && queueIndex < queueArray.length && queueArray[queueIndex].queueOrder >= 1000) ? ((queueArray[queueIndex].queueOrder+1) & (~1)) : 1000
	queue({queueOrder: order, queueRun: func})
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
	let order = (queueIndex!=null && queueIndex < queueArray.length && queueArray[queueIndex].queueOrder >= 1000) ? (queueArray[queueIndex].queueOrder | 1) : 1001
	queue({queueOrder: order, queueRun: func})
}




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
	parentElement: Element | undefined

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

	// Set to true after the scope has been cleaned, causing any spurious reruns to
	// be ignored.
	isDead: boolean = false

	constructor(
		parentElement: Element | undefined,
		precedingSibling: Node | Scope | undefined,
		queueOrder: number,
	) {
		this.parentElement = parentElement
		this.precedingSibling = precedingSibling
		this.queueOrder = queueOrder
	}

	// Get a reference to the last Node preceding this Scope, or undefined if there is none
	findPrecedingNode(stopAt: Scope | Node | undefined = undefined): Node | undefined {
		let cur: Scope = this
		let pre: Scope | Node | undefined
		while((pre = cur.precedingSibling) && pre !== stopAt) {
			if (pre instanceof Node) return pre
			let node = pre.findLastNode()
			if (node) return node
			cur = pre
		}
	}

	// Get a reference to the last Node within this scope and parentElement
	findLastNode(): Node | undefined {
		if (this.lastChild) {
			if (this.lastChild instanceof Node) return this.lastChild
			else return this.lastChild.findLastNode() || this.lastChild.findPrecedingNode(this.precedingSibling)
		}
	}

	addNode(node: Node) {
		if (!this.parentElement) throw new ScopeError(true)
		let prevNode = this.findLastNode() || this.findPrecedingNode()

		this.parentElement.insertBefore(node, prevNode ? prevNode.nextSibling : this.parentElement.firstChild)
		this.lastChild = node
	}

	remove() {
		if (this.parentElement) {
			let lastNode: Node | undefined = this.findLastNode()
			if (lastNode) {
				// at least one DOM node to be removed
				
				let nextNode: Node | undefined = this.findPrecedingNode()
				nextNode = (nextNode ? nextNode.nextSibling : this.parentElement.firstChild) as Node | undefined

				this.lastChild = undefined
				
				// Keep removing DOM nodes starting at our first node, until we encounter the last node
				while(true) {
					/* istanbul ignore next */
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
						this.parentElement.removeChild(node)
					}
					if (node === lastNode) break
				}
			}
		}

		// run cleaners
		this._clean()
	}

	_clean() {
		this.isDead = true
		for(let cleaner of this.cleaners) {
			cleaner._clean(this)
		}
		this.cleaners.length = 0
	}

	onChange(index: any, newData: DatumType, oldData: DatumType) {
		queue(this)
	}

	abstract queueRun(): void
}

class SimpleScope extends Scope {
	renderer: () => void

	constructor(
		parentElement: Element | undefined,
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

class IsEmptyObserver implements Observer {
	scope: Scope
	collection: ObsCollection
	count: number
	triggerCount: boolean

	constructor(scope: Scope, collection: ObsCollection, triggerCount: boolean) {
		this.scope = scope
		this.collection = collection
		this.triggerCount = triggerCount
		this.count = collection.getCount()

		collection.addObserver(ANY_INDEX, this)
		scope.cleaners.push(this)
	}

	onChange(index: any, newData: DatumType, oldData: DatumType) {
		if (newData===undefined) {
			// oldData is guaranteed not to be undefined
			if (this.triggerCount || !--this.count) queue(this.scope)
		} else if (oldData===undefined) {
			if (this.triggerCount || !this.count++) queue(this.scope)
		}
	}

	_clean() {
		this.collection.removeObserver(ANY_INDEX, this)
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
		parentElement: Element | undefined,
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

	// toString(): string {
	// 	return `OnEachScope(collection=${this.collection})`
	// }

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
		for (const [index, scope] of this.byIndex) {
			scope._clean()
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
		scope.remove()
		this.byIndex.delete(itemIndex)
		this.removeFromPosition(scope)
	}

	findPosition(sortStr: string) {
		// In case of duplicate `sortStr`s, this will return the first match.
		let items = this.byPosition
		let min = 0, max = items.length
		
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
		// and for the next sibling.
		let nextSibling: OnEachItemScope = this.byPosition[pos+1]
		if (nextSibling) {
			child.precedingSibling = nextSibling.precedingSibling
			nextSibling.precedingSibling = child
		} else {
			child.precedingSibling = this.lastChild || this.precedingSibling
			this.lastChild = child
		}
	}

	removeFromPosition(child: OnEachItemScope) {
		if (child.sortStr==='') return
		let pos = this.findPosition(child.sortStr)
		while(true) {
			if (this.byPosition[pos] === child) {
				// Yep, this is the right scope
				this.byPosition.splice(pos, 1)
				if (pos < this.byPosition.length) {
					let nextSibling: Scope | undefined = this.byPosition[pos] as (Scope | undefined)
					/* istanbul ignore next */
					if (!nextSibling) return internalError(8)
					/* istanbul ignore next */
					if (nextSibling.precedingSibling !== child) return internalError(13)
					nextSibling.precedingSibling = child.precedingSibling
				} else {
					/* istanbul ignore next */
					if (child !== this.lastChild) return internalError(12)
					this.lastChild = child.precedingSibling === this.precedingSibling ? undefined : child.precedingSibling	
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
		parentElement: Element | undefined,
		precedingSibling: Node | Scope | undefined,
		queueOrder: number,
		parent: OnEachScope,
		itemIndex: any
	) {
		super(parentElement, precedingSibling, queueOrder)
		this.parent = parent
		this.itemIndex = itemIndex
	}

	// toString(): string {
	// 	return `OnEachItemScope(itemIndex=${this.itemIndex} parentElement=${this.parentElement} parent=${this.parent} precedingSibling=${this.precedingSibling} lastChild=${this.lastChild})`
	// }

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
			sortKey = this.parent.makeSortKey(itemStore)
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
let currentScope: Scope | undefined

/**
 * A special Node observer index to subscribe to any value in the map changing.
 */
const ANY_INDEX = {}


type DatumType = string | number | Function | boolean | null | undefined | ObsMap | ObsArray


abstract class ObsCollection {
	observers: Map<any, Set<Observer>> = new Map()

	// toString(): string {
	// 	return JSON.stringify(peek(() => this.getRecursive(3)))
	// }

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
		if (recordingPatch) {
			addToPatch(recordingPatch, this, index, newData, oldData)
		} else {
			let obsSet = this.observers.get(index)
			if (obsSet) obsSet.forEach(observer => observer.onChange(index, newData, oldData))
			obsSet = this.observers.get(ANY_INDEX)
			if (obsSet) obsSet.forEach(observer => observer.onChange(index, newData, oldData))
		}
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
	abstract getCount(): number
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
		if (index !== (0|index) || index<0 || index>999999) {
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

		// Overwriting just the first elements of an array and leaving the rest of
		// the old data in place is just weird and unexpected, so we'll always use
		// 'replace' behavior for arrays.
		if (/*deleteMissing &&*/ this.data.length > newValue.length) {
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
			if (this.data[i]!==undefined) {
				scope.addChild(i)
			}	
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
		throw new Error(`Invalid array index ${JSON.stringify(index)}`)
	}

	getCount() {
		return this.data.length
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

	getCount() {
		return this.data.size
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
		let result: any = {}
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
		throw new Error(`Invalid object index ${JSON.stringify(index)}`)
	}

	getCount() {
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

	private collection: ObsCollection
	private idx: any

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
		return this.idx
	}

	/** @internal */
	_clean(scope: Scope) {
		this.collection.removeObserver(this.idx, scope)
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
			let type = (value instanceof ObsCollection) ? value.getType() : (value===null ? "null" : typeof value)
			if (type !== opts.type) throw new TypeError(`Expecting ${opts.type} but got ${type}`)
		}
		if (value instanceof ObsCollection) {
			return value.getRecursive(opts.depth==null ? -1 : opts.depth-1)
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
				return !value.getCount()
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
				return value.getCount()
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
		return (value instanceof ObsCollection) ? value.getType() : (value===null ? "null" : typeof value)
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
		store.collection.setIndex(store.idx, newValue, true)
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
		store.collection.setIndex(store.idx, mergeValue, false)
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
		store.collection.setIndex(store.idx, undefined, true)
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
				store = new Store(value, value.normalizeIndex(path[i]))
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
			let value = store.collection.rawGet(store.idx)
			if (!(value instanceof ObsCollection)) {
				if (value!==undefined) throw new Error(`Value ${JSON.stringify(value)} is not a collection (nor undefined) in step ${i} of $(${JSON.stringify(path)})`)
				value = new ObsObject()
				store.collection.rawSet(store.idx, value)
				store.collection.emitChange(store.idx, value, undefined)
			}
			store = new Store(value, value.normalizeIndex(path[i]))
		}

		return store	
	}

	/** @internal */
	_observe() {
		if (currentScope) {
			if (this.collection.addObserver(this.idx, currentScope)) {
				currentScope.cleaners.push(this)
			}
		}
		return this.collection.rawGet(this.idx)
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
			let onEachScope = new OnEachScope(currentScope.parentElement, currentScope.lastChild || currentScope.precedingSibling, currentScope.queueOrder+1, val, renderer, makeSortKey)
			val.addObserver(ANY_INDEX, onEachScope)

			currentScope.cleaners.push(onEachScope)
			currentScope.lastChild = onEachScope

			onEachScope.renderInitial()
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

	/*
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
export function node(tag: string|Element = "", ...rest: any[]) {
	if (!currentScope) throw new ScopeError(true)

	let el
	if (tag instanceof Element) {
		el = tag
	} else {
		let pos = tag.indexOf('.')
		let classes
		if (pos>=0) {
			classes = tag.substr(pos+1)
			tag = tag.substr(0, pos)
		}
		el = document.createElement(tag || 'div')
		if (classes) {
			// @ts-ignore (replaceAll is polyfilled)
			el.className = classes.replaceAll('.', ' ')
		}
	}

	currentScope.addNode(el)

	for(let item of rest) {
		let type = typeof item
		if (type === 'function') {
			let scope = new SimpleScope(el, undefined, currentScope.queueOrder+1, item)
			if (onCreateEnabled) {
				onCreateEnabled = false
				scope.update()
				onCreateEnabled = true
			} else {
				scope.update()
			}

			// Add it to our list of cleaners. Even if `scope` currently has
			// no cleaners, it may get them in a future refresh.
			currentScope.cleaners.push(scope)
		} else if (type === 'string' || type === 'number') {
			el.textContent = item
		} else if (type === 'object' && item && item.constructor === Object) {
			for(let k in item) {
				applyProp(el, k, item[k])
			}
		} else if (item instanceof Store) {
			bindInput(<HTMLInputElement>el, item)
		} else if (item != null) {
			throw new Error(`Unexpected argument ${JSON.stringify(item)}`)
		}
	}
}



/**
 * Convert an HTML string to one or more DOM elements, and add them to the current DOM scope.
 * @param html - The HTML string. For example `"<section><h2>Test</h2><p>Info..</p></section>"`.
 */
export function html(html: string) {
	if (!currentScope || !currentScope.parentElement) throw new ScopeError(true)
	let tmpParent = document.createElement(currentScope.parentElement.tagName)
	tmpParent.innerHTML = ''+html
	while(tmpParent.firstChild) {
		currentScope.addNode(tmpParent.firstChild)
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
	currentScope.addNode(document.createTextNode(text))
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
	if (!currentScope || !currentScope.parentElement) throw new ScopeError(true)
	if (typeof name === 'object') {
		for(let k in name) {
			applyProp(currentScope.parentElement, k, name[k])
		}
	} else {
		applyProp(currentScope.parentElement, name, value)
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
	if (!currentScope || !currentScope.parentElement) throw new ScopeError(true)
	return currentScope.parentElement
}


/**
 * Register a function that is to be executed right before the current reactive scope
 * disappears or redraws.
 * @param clean - The function to be executed.
 */
export function clean(clean: (scope: Scope) => void) {
	if (!currentScope) throw new ScopeError(false)
	currentScope.cleaners.push({_clean: clean})
}


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
export function observe(func: () => void) {
	mount(undefined, func)
}


/**
 * Like {@link Store.observe}, but allow the function to create DOM elements using {@link Store.node}.

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
export function mount(parentElement: Element | undefined, func: () => void) {
	let scope
	if (parentElement || !currentScope) {
		scope = new SimpleScope(parentElement, undefined, 0, func)
	} else {
		scope = new SimpleScope(currentScope.parentElement, currentScope.lastChild || currentScope.precedingSibling, currentScope.queueOrder+1, func)
		currentScope.lastChild = scope
	}

	// Do the initial run
	scope.update()

	// Add it to our list of cleaners. Even if `scope` currently has
	// no cleaners, it may get them in a future refresh.
	if (currentScope) {
		currentScope.cleaners.push(scope)
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

/* istanbul ignore next */
function internalError(code: number) {
	let error = new Error("Aberdeen internal error "+code)
	setTimeout(() => { throw error }, 0)
}

function handleError(e: any) {
	// Throw the error async, so the rest of the rendering can continue
	setTimeout(() => {throw e}, 0)
}

class ScopeError extends Error {
	constructor(mount: boolean) {
		super(`Operation not permitted outside of ${mount ? "a mount" : "an observe"}() scope`)
	}
}

const FADE_TIME = 400
const GROW_SHRINK_TRANSITION = `margin ${FADE_TIME}ms ease-out, transform ${FADE_TIME}ms ease-out`

function getGrowShrinkProps(el: HTMLElement) {
	const parentStyle: any = el.parentElement ? getComputedStyle(el.parentElement) : {}
	const isHorizontal = parentStyle.display === 'flex' && (parentStyle.flexDirection||'').startsWith('row')
	return isHorizontal ?
		{marginLeft: `-${el.offsetWidth/2}px`, marginRight: `-${el.offsetWidth/2}px`, transform: "scaleX(0)"} :
		{marginBottom: `-${el.offsetHeight/2}px`, marginTop: `-${el.offsetHeight/2}px`, transform: "scaleY(0)"}

}

/** Do a grow transition for the given element. This is meant to be used as a
* handler for the `create` property.
*
* @param el The element to transition.
*
* The transition doesn't look great for table elements, and may have problems
* for other specific cases as well.
*/
export function grow(el: HTMLElement): void {
	// This timeout is to await all other elements having been added to the Dom
	scheduleDomReader(() => {
		// Make the element size 0 using transforms and negative margins.
		// This causes a browser layout, as we're querying el.offset<>.
		let props = getGrowShrinkProps(el)
		
		// The timeout is in order to batch all reads and then all writes when there
		// are multiple simultaneous grow transitions.
		scheduleDomWriter(() => {
			Object.assign(el.style, props)
			
			// This timeout is to combine multiple transitions into a single browser layout
			scheduleDomReader(() => {
				// Make sure the layouting has been performed, to cause transitions to trigger
				el.offsetHeight
				scheduleDomWriter(() => {
					// Do the transitions
					el.style.transition = GROW_SHRINK_TRANSITION
					for(let prop in props) el.style[prop as any] = ""
					setTimeout(() => {
						// Reset the element to a clean state
						el.style.transition = ""
					}, FADE_TIME)
				})
			})
		})
	})
}

/** Do a shrink transition for the given element, and remove it from the DOM
* afterwards. This is meant to be used as a handler for the `destroy` property.
*
* @param el The element to transition and remove.
*
* The transition doesn't look great for table elements, and may have problems
* for other specific cases as well.
*/
export function shrink(el: HTMLElement): void {
	scheduleDomReader(() => {
		const props = getGrowShrinkProps(el)
		// The timeout is in order to batch all reads and then all writes when there
		// are multiple simultaneous shrink transitions.
		scheduleDomWriter(() => {
			el.style.transition = GROW_SHRINK_TRANSITION
			Object.assign(el.style, props)
			
			setTimeout(() => el.remove(), FADE_TIME)
		})
	})
}


function recordPatch(func: () => void): Patch {
	if (recordingPatch) throw new Error(`already recording a patch`)
	recordingPatch = new Map()
	try {
		func()
	} catch(e) {
		recordingPatch = undefined
		throw e
	}
	const result = recordingPatch
	recordingPatch = undefined
	return result
}

function addToPatch(patch: Patch, collection: ObsCollection, index: any, newData: any, oldData: any) {
	let collectionMap = patch.get(collection)
	if (!collectionMap) {
		collectionMap = new Map()
		patch.set(collection, collectionMap)
	}
	let prev = collectionMap.get(index)
	if (prev) oldData = prev[1]
	if (newData === oldData) collectionMap.delete(index)
	else collectionMap.set(index, [newData, oldData])
}

function emitPatch(patch: Patch) {
	for(let [collection, collectionMap] of patch) {
		for(let [index, [newData, oldData]] of collectionMap) {
			collection.emitChange(index, newData, oldData)
		}
	}
}

function mergePatch(target: Patch, source: Patch, reverse: boolean = false) {
	for(let [collection, collectionMap] of source) {
		for(let [index, [newData, oldData]] of collectionMap) {
			addToPatch(target, collection, index, reverse ? oldData : newData, reverse ? newData : oldData)
		}
	}
}

function silentlyApplyPatch(patch: Patch, force: boolean = false): boolean {
	for(let [collection, collectionMap] of patch) {
		for(let [index, [newData, oldData]] of collectionMap) {
			let actualData = collection.rawGet(index)
			if (actualData !== oldData) {
				if (force) handleError(new Error(`Applying invalid patch: data ${actualData} is unequal to expected old data ${oldData} for index ${index}`))
				else return false
			}
		}
	}
	for(let [collection, collectionMap] of patch) {
		for(let [index, [newData, oldData]] of collectionMap) {
			collection.rawSet(index, newData)
		}
	}
	return true
}


const appliedPredictions: Array<Patch> = []

/**
 * Run the provided function, while treating all changes to Observables as predictions,
 * meaning they will be reverted when changes come back from the server (or some other
 * async source).
 * @param predictFunc The function to run. It will generally modify some Observables
 * 	to immediately reflect state (as closely as possible) that we expect the server
 *  to communicate back to us later on.
 * @returns A `Patch` object. Don't modify it. This is only meant to be passed to `applyCanon`.
 */
export function applyPrediction(predictFunc: () => void): Patch {
	let patch = recordPatch(predictFunc)
	appliedPredictions.push(patch)
	emitPatch(patch)
	return patch
}

/**
 * Temporarily revert all outstanding predictions, optionally run the provided function
 * (which will generally make authoritative changes to the data based on a server response),
 * and then attempt to reapply the predictions on top of the new canonical state, dropping 
 * any predictions that can no longer be applied cleanly (the data has been modified) or
 * that were specified in `dropPredictions`.
 * 
 * All of this is done such that redraws are only triggered if the overall effect is an
 * actual change to an `Observable`.
 * @param canonFunc The function to run without any predictions applied. This will typically
 *  make authoritative changes to the data, based on a server response.
 * @param dropPredictions An optional list of predictions (as returned by `applyPrediction`)
 *  to undo. Typically, when a server response for a certain request is being handled,
 *  you'd want to drop the prediction that was done for that request.
 */
export function applyCanon(canonFunc?: (() => void), dropPredictions: Array<Patch> = []) {
	
	let resultPatch = new Map()
	for(let prediction of appliedPredictions) mergePatch(resultPatch, prediction, true)
	silentlyApplyPatch(resultPatch, true)

	for(let prediction of dropPredictions) {
		let pos = appliedPredictions.indexOf(prediction)
		if (pos >= 0) appliedPredictions.splice(pos, 1)
	}
	if (canonFunc) mergePatch(resultPatch, recordPatch(canonFunc))

	for(let idx=0; idx<appliedPredictions.length; idx++) {
		if (silentlyApplyPatch(appliedPredictions[idx])) {
			mergePatch(resultPatch, appliedPredictions[idx])
		} else {
			appliedPredictions.splice(idx, 1)
			idx--
		}
	}

	emitPatch(resultPatch)
}


// @ts-ignore
// istanbul ignore next
if (!String.prototype.replaceAll) String.prototype.replaceAll = function(from, to) { return this.split(from).join(to) }

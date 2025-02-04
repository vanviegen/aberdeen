import { SkipList } from "./skiplist"

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


type TargetType = {[key: string]: any} | any[] | Map<any,any>;
type DatumType = TargetType | boolean | number | string | null | undefined

/** @internal */
export type Patch = Map<TargetType, Map<any, [any, any]>>;

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
	_cleaners: Array<{delete: (scope: Scope) => void}> = []
	
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
		this.delete()
	}
	
	delete() {
		this._isDead = true
		for(let cleaner of this._cleaners) {
			cleaner.delete(this)
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
	scope: Scope | undefined
	count: number
	
	constructor(scope: Scope|undefined, proxy: TargetType) {
		this.scope = scope
		const target: TargetType | undefined = (proxy as any)[TARGET_SYMBOL]
		if (!target) throw new TypeError("Proxy object expected")
		this.count = target instanceof Map ? target.size : (target instanceof Array ? target.length : Object.keys(target).length)
		addObserver(target, ANY_SYMBOL, this)
	}
	
	_onChange(index: any, newData: DatumType, oldData: DatumType) {
		if (newData===undefined) {
			// oldData is guaranteed not to be undefined
			if (!--this.count) queue(this.scope!)
		} else if (oldData===undefined) {
			if (!this.count++) queue(this.scope!)
		}
	}
}

/** @internal */
class OnEachScope extends Scope {
	
	/** The data structure we are iterating */
	_target: TargetType
	
	/** A function returning a number/string/array that defines the position of an item */
	_makeSortKey: (key: any, value: DatumType) => SortKeyType
	
	/** A function that renders an item */
	_renderer: (key: any, value: DatumType) => void
	
	/** The item scopes in a Map by index */
	_byIndex: Map<any, OnEachItemScope> = new Map()

	/** The ordered list of current item scopes */
	_bySortStr: SkipList<OnEachItemScope> = new SkipList('_sortStr')
	
	/** Indexes that have been created/removed and need to be handled in the next `queueRun` */
	_newIndexes: Set<any> = new Set()
	_removedIndexes: Set<any> = new Set()
	
	constructor(
		target: TargetType,
		renderer: (key: any, value: DatumType) => void,
		makeSortKey: (key: any, value: DatumType) => SortKeyType
	) {
		super(currentScope!._parentElement, currentScope!._lastChild || currentScope!._precedingSibling, currentScope!._queueOrder+1)
		this._target = target
		this._renderer = renderer
		this._makeSortKey = makeSortKey

		addObserver(target, ANY_SYMBOL, this)
		currentScope!._cleaners.push(this)
		currentScope!._lastChild = this

		// Do _addChild() calls for initial items
		if (target instanceof Map) {
			for (const key of target.keys()) {
				this._addChild(key)
			}
		} else if (target instanceof Array) {
			for(let i=0; i<target.length; i++) {
				if (target!==undefined) {
					this._addChild(i)
				}	
			}	
		} else {
			for(const key in target) {
				this._addChild(key)
			}
		}
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
	
	delete() {
		super.delete()
		for (const scope of this._byIndex.values()) {
			scope.delete()
		}
		
		// Help garbage collection:
		this._byIndex.clear()
		this._bySortStr.clear()
	}
	
	_addChild(itemIndex: any) {
		let scope = new OnEachItemScope(this._parentElement, undefined, this._queueOrder+1, this, itemIndex)
		this._byIndex.set(itemIndex, scope)
		scope._update()
		// We're not adding a cleaner here, as we'll be calling them from our delete function
	}
	
	_removeChild(itemIndex: any) {
		let scope = this._byIndex.get(itemIndex)
		/* c8 ignore next */
		if (!scope) return internalError(6)
		scope._remove()
		this._byIndex.delete(itemIndex)
	}
	
	_insertAtPosition(child: OnEachItemScope) {
		this._bySortStr.add(child)
		let nextSibling = this._bySortStr.next(child)
		
		if (nextSibling) {
			child._precedingSibling = nextSibling._precedingSibling
			nextSibling._precedingSibling = child
		} else {
			child._precedingSibling = this._lastChild || this._precedingSibling
			this._lastChild = child
		}
	}
	
	_removeFromPosition(child: OnEachItemScope) {
		let nextSibling = this._bySortStr.next(child)
		this._bySortStr.remove(child)

		if (nextSibling) {
			/* c8 ignore next */
			if (nextSibling._precedingSibling !== child) return internalError(13)
			nextSibling._precedingSibling = child._precedingSibling
		} else {
			/* c8 ignore next */
			if (child !== this._lastChild) return internalError(12)
			this._lastChild = child._precedingSibling === this._precedingSibling ? undefined : child._precedingSibling	
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
		
		const target = this._parent._target
		const value: DatumType = target instanceof Map ? target.get(this._itemIndex) : [this._itemIndex]
		
		let sortKey
		try {
			sortKey = this._parent._makeSortKey(value, this._itemIndex)
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
				this._parent._renderer(value, this._itemIndex)
			} catch(e) {
				handleError(e, true)
			}
		}
		
		currentScope = savedScope
	}

	_remove() {
		super._remove()
		if (this._sortStr!=='') this._parent._removeFromPosition(this)
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
const ANY_SYMBOL = Symbol('any')

/**
 * When our proxy objects need to lookup `obj[TARGET_SYMBOL]` it returns its
 * target, to be used in our wrapped methods.
 */
const TARGET_SYMBOL = Symbol('target')

const observers = new WeakMap<TargetType, Map<any, Set<Observer>>>

function addObserver(target: any, index: any, observer: Observer|undefined = currentScope) {
	if (!observer) return

	let byTarget = observers.get(target)
	if (!byTarget) observers.set(target, byTarget = new Map())
	let byIndex = byTarget.get(index)
	if (!byIndex) byTarget.set(index, byIndex = new Set())

	if (byIndex.has(observer)) return

	byIndex.add(observer)
	currentScope?._cleaners.push(byIndex)
}

export function onEach(target: TargetType, render: (value: any, index: any) => void, makeSortKey?: (value: any, index: any) => SortKeyType): void {
	let onEachScope = new OnEachScope(target, makeSortKey)
	// TODO
}

export function isEmpty(target: TargetType): boolean {
	let observer = new IsEmptyObserver(currentScope, target)
	return !observer.count
}

let emit = function(target: TargetType, index: any, newData: DatumType, oldData: DatumType) {
	if (newData === oldData) return
	
	const byTarget = observers.get(target)
	if (byTarget===undefined) return

	let byIndex = byTarget.get(index)
	if (byIndex) {
		for(let observer of byIndex) {
			observer._onChange(index, newData, oldData)	
		}
	}
	byIndex = byTarget.get(ANY_SYMBOL)
	if (byIndex) {
		for(let observer of byIndex) {
			observer._onChange(index, newData, oldData)	
		}
	}
}


const objectHandler: ProxyHandler<any> = {
	get(target: any, prop: any) {
		if (prop===TARGET_SYMBOL) return target
		console.log(`OBJECT prop GET ${String(prop)}`);
		addObserver(target, prop)
		return target[prop]
	},
	set(target: any, prop: any, value: any) {
		console.log(`SET ${String(prop)}:`, value);
		const old = target[prop]
		target[prop] = optProxy(value);
		emit(target, prop, target[prop], old)
		return true;
	},
	deleteProperty(target: any, prop: any) {
		console.log(`DELETE ${String(prop)}`);
		const old = target[prop]
		delete target[prop];
		emit(target, prop, undefined, old)
		return true;
	},
	has(target: any, prop: any) {
		const result = prop in target;
		console.log(`HAS ${String(prop)}:`, result);
		addObserver(target, prop)
		return result;
	}
};
export type ObjectProxy<T extends object> = T;

const mapMethods = {
	clear: function(this: any) {
		console.log('MAP clear');
		const target = this[TARGET_SYMBOL]
		for(let i=0; i<target.length; i++) {
			emit(target, i, undefined, target.get(i))
		}
		runImmediateQueue()
		target.clear();
	},
	forEach: function(this: any, callbackFn: Function) {
		console.log('MAP forEach');
		const target = this[TARGET_SYMBOL]
		addObserver(target, ANY_SYMBOL)
		return target.forEach(callbackFn)
	},
	onEach(this: TargetType, render: (value: any, index: any) => void, makeSortKey?: (value: any, index: any) => SortKeyType): void {
		onEach(this, render, makeSortKey)
	},
	isEmpty(this: TargetType): boolean {
		return isEmpty(this)
	},
};
const mapHandler: ProxyHandler<Map<any, any>> = {
	...objectHandler,
	get(target: any, prop: any): any {
		if (prop===TARGET_SYMBOL) return target
		console.log(`MAP prop GET ${String(prop)}`);
		const method = mapMethods[prop as keyof typeof mapMethods]
		if (method) return method
		addObserver(target, prop)
		return target[prop]
	},
};
export type MapProxy<A extends DatumType,B> = Map<A,B> & {
	onEach(this: MapProxy<A,B>, render: (value: B, index: A) => void, makeSortKey?: (value: B, index: A) => SortKeyType): void;
	isEmpty(this: MapProxy<A,B>): boolean;
};

const arrayMethods = {
	push: function(this: any, ...items: any[]) {
		console.log('ARRAY push:', items);
		const target = this[TARGET_SYMBOL]
		for(let item of items.map(optProxy)) {
			target.push(item)
			emit(target, target.length-1, item, undefined)
		}
		emit(target, 'length', target.length, target.length - items.length)
		runImmediateQueue()
		return target.length
	},
	pop: function(this: any) {
		console.log('ARRAY pop');
		const target = this[TARGET_SYMBOL]
		if (target.length > 0) {
			const value = target.pop();
			emit(target, target.length, undefined, value)
			emit(target, 'length', target.length, target.length + 1)
			runImmediateQueue()
			// We don't need to subscribe to changes, as the data we read is no longer
			// there, so cannot change.
			return value;
		}
	},
	shift: function(this: any) {
		console.log('ARRAY shift');
		const target = this[TARGET_SYMBOL]
		if (target.length > 0) {
			const value = target.shift();
			emit(target, 0, target[0], value)
			for(let i=0; i<target.length; i++) {
				emit(target, i+1, target[i], value)
			}
			emit(target, 'length', target.length, target.length + 1)
			runImmediateQueue()
			// We don't need to subscribe to changes, as the data we read is no longer
			// there, so cannot change.
			return value;
		}
	},
	unshift: function(this: any, ...items: any[]) {
		console.log('ARRAY unshift:', items);
		const target = this[TARGET_SYMBOL]
		const result = target.unshift(...items.map(optProxy));
		for(let i=0; i<target.length; i++) {
			emit(target, i+1, target[i], target[i+items.length])
		}
		emit(target, 'length', target.length, target.length - items.length)
		runImmediateQueue()
		return result
	},
	splice: function(this: any, start: number, deleteCount: number = 0, ...items: any[]) {
		const target = this[TARGET_SYMBOL]
		console.log('ARRAY splice:', start, deleteCount, items);
		items = items.map(optProxy)
		const oldLength = target.length
		const result = target.splice(
			start, 
			deleteCount,
			...items
		);
		const end = deleteCount === items.length ? start+deleteCount : Math.max(target.length, oldLength)
		for(let i=start; i<end; i++) {
			emit(target, i+1, target[i], target[i+deleteCount])
		}
		emit(target, 'length', target.length, oldLength)
		runImmediateQueue()
		// We don't need to subscribe to changes, as the data we read is no longer
		// there, so cannot change.
		return result;
	},
	slice: function(this: any, start: number = 0, end: number = this.length) {
		console.log('ARRAY slice:', start, end);
		const target = this[TARGET_SYMBOL]
		for(let i=start; i<end; i++) {
			addObserver(target, i)
		}
		return target.slice(start, end);
	},
	forEach: function(this: any, callbackFn: Function) {
		const target = this[TARGET_SYMBOL]
		console.log('ARRAY forEach');
		addObserver(target, ANY_SYMBOL)
		return target.forEach(callbackFn);
	},
	// TODO: look at jsdocs for more methods?
	onEach(this: TargetType, render: (value: any, index: any) => void, makeSortKey?: (value: any, index: any) => SortKeyType): void {
		onEach(this, render, makeSortKey)
	},
	isEmpty(this: TargetType): boolean {
		return isEmpty(this)
	},
};
const arrayHandler: ProxyHandler<any[]> = {
	...objectHandler,
	get(target: any, prop: any) {
		if (prop===TARGET_SYMBOL) return target
		console.log(`ARRAY prop GET ${String(prop)}`);
		const method = arrayMethods[prop as keyof typeof arrayMethods]
		if (method) return method
		addObserver(target, prop)
		return target[prop]
	},
	set(target: any, prop: any, value: any) {
		console.log(`SET ${String(prop)}:`, value);
		const old = target[prop]
		if (prop === 'length') {
			// We only need to emit for shrinking, as growing just adds undefineds
			for(let i=value; i<target.length; i++) {
				emit(target, i, undefined, target[prop])
			}
		}
		target[prop] = optProxy(value);
		emit(target, prop, target[prop], old)
		return true;
	},
};
export type ArrayProxy<T extends DatumType> = Array<T> & {
	onEach(this: ArrayProxy<T>, render: (value: T, index: any) => void, makeSortKey?: (value: T, index: any) => SortKeyType): void;
	isEmpty(this: ArrayProxy<T>): boolean;
};

export function proxy<T extends DatumType>(array: T[]): ArrayProxy<T>;
export function proxy<A, B extends DatumType>(map: Map<A,B>): MapProxy<A,B>;
export function proxy<T extends object>(obj: T): ObjectProxy<T>;
export function proxy<T extends DatumType>(value: T): ObjectProxy<{value: T}>

export function proxy(target: TargetType): any {
	return optProxy(typeof target === 'object' && target !== null ? target : {value: target})
}

export function isProxied(target: TargetType) {
	return target != null && TARGET_SYMBOL in target
}

const PROXY_MAP = new WeakMap<TargetType, /*Proxy*/TargetType>()

function optProxy(value: any): any {
	console.log('proxy', value)
	// If value is a primitive type or already proxied, just return it
	if (typeof value !== 'object' || value===null || TARGET_SYMBOL in value) {
		return value
	}
	let proxied = PROXY_MAP.get(value)
	if (proxied) return proxied // Only one proxy per target!
	
	if (value instanceof Map) {
		const target = new Map()
		for (const [k, v] of value) target.set(k, optProxy(v))
		proxied = new Proxy(target, mapHandler);
	}
	else if (value instanceof Array) {
		proxied = new Proxy(value.map(optProxy), arrayHandler);
	}
	else { // Object
		const target: any = {}
		for (const k in value) target[k] = optProxy(value[k])
		proxied = new Proxy(target, objectHandler);
	}
	PROXY_MAP.set(value, proxied as TargetType)
	return proxied
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

/** Helper function to get a deeply nested value from an object, Map or Array
*
* @param target A (possibly proxied) object, `Map` or `Array`.
* @param indices One or more indices/keys to traverse into the target
* @returns The value at the specified path, or undefined if the path doesn't exist
* @throws An `Error` if trying to index a primitive type. When trying to index `null` or `undefined`,
*   the value `undefined` will be returned instead.
* @example
* ```
* import {$, peek, proxy} from aberdeen
*
* let data = proxy(['a', {b: 42}, 'c'])
*
* mount(document.body, () => {
*     let answer = peek(data, 1, 'b')
*     $({text: answer})
* })
* ```
*/
export function get(target: TargetType, ...indices: any[]): any {
	let node: any = target
	for(let index of indices) {
		if (node==null) return
		if (typeof node !== 'object') throw new Error(`Attempting to index primitive type ${node} with ${index}`)
		if (node instanceof Map) node = node.get(index)
		else node = node[index]
	}
	return node
}

export function set(target: TargetType, ...indicesAndValue: any[]): any {
	const value = indicesAndValue.pop()
	const prop = indicesAndValue.pop()
	let node: any = target
	for(let index of indicesAndValue) {
		if (node instanceof Map) node = node.get(index)
		else node = node[index]
	}
	return node[prop] = value
}

function applyBinding(_el: Element, _key: string, target: [TargetType, any] | TargetType) {
	if (target==null) return
	let index = 'value'
	if (target instanceof Array) [target, index] = target
	const el = _el as HTMLInputElement
	let onStoreChange: (value: any) => void
	let onInputChange: () => void
	let type = el.getAttribute('type')
	let value = peek(target, index)
	if (type === 'checkbox') {
		if (value === undefined) set(target, index, el.checked)
		onStoreChange = value => el.checked = value
		onInputChange = () => set(target, index, el.checked)
	} else if (type === 'radio') {
		if (value === undefined && el.checked) set(target, index, el.value)
		onStoreChange = value => el.checked = (value === el.value)
		onInputChange = () => {
			if (el.checked) set(target, index, el.value)
		}
	} else {
		onInputChange = () => set(target, index, type==='number' || type==='range' ? (el.value==='' ? null : +el.value) : el.value)
		if (value === undefined) onInputChange()
		onStoreChange = value => {
			if (el.value !== value) el.value = value
		}
	}
	observe(() => {
		onStoreChange(get(target, index))
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
* @param cleaner - The function to be executed.
*/
export function clean(cleaner: () => void) {
	if (!currentScope) throw new ScopeError(false)
		currentScope._cleaners.push({delete: cleaner})
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
* import {$, peek, proxy} from aberdeen
*
* let data = proxy(['a', {b: 42}, 'c'])
*
* mount(document.body, () => {
*     // No *not* rerender when data changes
*     const msg = peek(() => `Data has ${data.length} elements, and the first is ${data[0]}`)
*     $({text: msg})
* })
* ```
*
* In the above example `store.get(0)` could be replaced with `store.peek(0)` to achieve the
* same result without `peek()` wrapping everything. There is no non-subscribing equivalent
* for `count()` however.
*/

export function peek<T>(func: () => T): T;
/** Alternatively `peek` can behave like {@link get}, only without subscribing to reads.
*
* @param target A (possibly proxied) object, `Map` or `Array`.
* @param indices One or more indices/keys to traverse into the target
* @returns The value at the specified path, or undefined if the path doesn't exist
* @throws An `Error` if trying to index a primitive type. When trying to index `null` or `undefined`,
*   the value `undefined` will be returned instead.
* @example
* ```
* import {$, peek, proxy} from aberdeen
*
* let data = proxy(['a', {b: 42}, 'c'])
*
* mount(document.body, () => {
*     // No *not* rerender when data changes
*     let answer = peek(data, 1, 'b')
*     $({text: answer})
* })
* ```
*/
export function peek(target: TargetType, ...indices: any[]): any;

export function peek(a: any, ...rest: any[]) {
	let savedScope = currentScope
	currentScope = undefined
	try {
		if (rest.length===0 && typeof a === 'function') return a()
		return get(a, ...rest)
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
export function withEmitHandler(handler: (target: TargetType, index: any, newData: DatumType, oldData: DatumType) => void, func: ()=>void) {
	const oldEmitHandler = emit
	emit = handler
	try {
		func()
	} finally {
		emit = oldEmitHandler
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

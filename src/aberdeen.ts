import { SkipList } from "../dist-min/skiplist";
import { SortedSet } from "./sortedSet"

/*
* QueueRunner
*
* `queue()`d runners are executed on the next timer tick, by order of their
* `scopeId` values.
*/
interface QueueRunner {
	_scopeId: number;
	_queueRun(): void;
}

let sortedQueue: SortedSet<QueueRunner> | undefined; // When set, a runQueue is scheduled or currently running.
let runQueueDepth = 0 // Incremented when a queue event causes another queue event to be added. Reset when queue is empty. Throw when >= 42 to break (infinite) recursion.
let topRedrawScope: Scope | undefined // The scope that triggered the current redraw. Elements drawn at this scope level may trigger 'create' animations.


type TargetType = any[] | {[key: string]: any};
type DatumType = TargetType | boolean | number | string | null | undefined;

/** @internal */
export type Patch = Map<TargetType, Map<any, [any, any]>>;

function queue(runner: QueueRunner) {
	if (!sortedQueue) {
		sortedQueue = new SortedSet<QueueRunner>('_scopeId');
		setTimeout(runQueue, 0);
	} else if (!(runQueueDepth&1)) {
		runQueueDepth++; // Make it uneven
		if (runQueueDepth > 98) {
			throw new Error("Too many recursive updates from observes");
		}
	}
	sortedQueue.add(runner);
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
function runQueue(): void {
	while(true) {
		const runner = sortedQueue!.fetchFirst();
		if (!runner) break;
		if (runQueueDepth&1) runQueueDepth++; // Make it even
		runner._queueRun();
	}
	sortedQueue = undefined;
	runQueueDepth = 0;
}


let domWaiters: (() => void)[] = [];
let domInReadPhase = false;

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

const DOM_READ_PHASE = {
	then: function(fulfilled: () => void) {
		if (domInReadPhase) fulfilled();
			else {
			if (!domWaiters.length) queue(DOM_PHASE_RUNNER);
				domWaiters.push(fulfilled);
		}
		return this;
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

const DOM_WRITE_PHASE = {
	then: function(fulfilled: () => void) {
		if (!domInReadPhase) fulfilled();
			else {
			if (!domWaiters.length) queue(DOM_PHASE_RUNNER);
				domWaiters.push(fulfilled);
		}
		return this;
	}
}

const DOM_PHASE_RUNNER = {
	_scopeId: Number.MAX_SAFE_INTEGER,
	_queueRun: function() {
		let waiters = domWaiters;
		domWaiters = [];
		domInReadPhase = !domInReadPhase;
		for(let waiter of waiters) {
			try {
				waiter();
			} catch(e) {
				console.error(e);
			}
		}
	}
}


/** @internal */
type SortKeyType = number | string | Array<number|string>


/**
* Given an integer number, a string or an array of these, this function returns a string or number
* that can be used to compare items in a natural sorting order. So `[3, 'ab']` should be smaller
* than `[3, 'ac']`, while `[20, 'ab']` should be larger than `[3, 'ac]`.
*/
function normalizeSortKey(key: SortKeyType): number | string {
	if (key instanceof Array) {
		return key.map(partToStr).join('');
	} else {
		if (typeof key === 'number') return key;
		return partToStr(key);
	}
}

/**
 * Basically flips the bits on a key, in order to sort in the reverse direction.
 */
function invertSortKey(key: number | string) {
	if (typeof key === 'number') return -key;
	let result = '';
	for (let i = 0; i < key.length; i++) {
		result += String.fromCodePoint(65535 - key.charCodeAt(i));
	}
	return result;
}

function partToStr(part: number|string): string {
	if (typeof part === 'string') {
		return part + '\x01'
	} else {
		let result = numToString(Math.abs(Math.round(part)), part<0);
		// Prefix the number of digits, counting down from 128 for negative and up for positive
		return String.fromCharCode(128 + (part>0 ? result.length : -result.length)) + result;
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
		result += String.fromCharCode(neg ? 65535 - (num % 65533) : 2 + (num % 65533));
		num = Math.floor(num / 65533);
	}
	return result;
}

/** @internal */
interface Observer {
	_onChange(index: any, newData: DatumType, oldData: DatumType): void;
}

let scopeCount = 0;

interface Scope extends QueueRunner, Observer {
	// Scopes are to be handled in creation order. This will make sure that parents are
	// handled before their children (as they should), and observes are executed in the
	// order of the source code.
	_scopeId: number; // = ++scopeCount;

	_getLastNode(): Node | undefined;
	delete(): void;
	_remove(): void;
}

/**
 * All Scopes that can hold nodes and subscopes, including `SimpleScope` and `OnEachItemScope`
 * but *not* `OnEachScope`, are `ContentScope`s.
 */
abstract class ContentScope implements Scope {
	_scopeId: number = ++scopeCount;

	// The list of clean functions to be called when this scope is cleaned. These can
	// be for child scopes, subscriptions as well as `clean(..)` hooks.
	_cleaners: Array<{delete: (scope: Scope) => void}> = [];

	_lastChild: Node | LinkedScope | undefined;

	abstract _addNode(node: Node): void;
	abstract _remove(): void;
	abstract _update(): void;
	abstract _getParentElement(): Element;

	_getLastNode(): Node | undefined {
		return findLastNodeInPrevSiblings(this._lastChild);
	}

	/**
	 * Call cleaners and make sure the scope is not queued.
	 * It is called `delete`, so that the list of cleaners can also contain `Set`s.
	 */
	delete(/* ignore observer argument */) {
		for(let cleaner of this._cleaners) {
			cleaner.delete(this); // pass in observer argument, in case `cleaner` is a `Set`
		}
		this._cleaners.length = 0;
		sortedQueue?.remove(this); // This is very fast and O(1) when not queued
	}
	
	_queueRun() {
		/* c8 ignore next */
		if (currentScope) internalError(2);
			
		this._remove();
		
		topRedrawScope = this
		this._update();
		topRedrawScope = undefined
	}

	_onChange(index: any, newData: DatumType, oldData: DatumType) {
		queue(this);	
	}
}		if (this._sortKey !== undefined && this._sortKey !== sortKey) {
	this._parent._sortedSet.remove(this);
}


interface LinkedScope extends Scope {
	_prevSibling: Node | LinkedScope | undefined;
}

/**
* @internal
* A `SimpleScope` is created with a `render` function that is run initially,
* and again when any of the `Store`s that this function reads are changed. Any
* DOM elements that is given a `render` function for its contents has its own scope.
* The `Scope` manages the position in the DOM tree elements created by `render`
* are inserted at. Before a rerender, all previously created elements are removed
* and the `clean` functions for the scope and all sub-scopes are called.
*/
class SimpleScope extends ContentScope implements LinkedScope {

	// The last child node or scope within this scope
	_lastChild: Node | LinkedScope | undefined;

	constructor(
		// The parent DOM element we'll add our child nodes to
		public _parentElement: Element,
		// The node or scope right before this scope that has the same `parentElement`
		public _prevSibling: Node | LinkedScope | undefined,
		// The function that 
		public _renderer: () => any,
	) {
		super();
		currentScope._lastChild = this;

		// Do the initial run
		this._update();

		if (this._cleaners.length) {
			// If the current scope has no cleaners after the initial run, that means it hasn't
			// observed anything, meaning it will never have to rerun, and therefore will never
			// get any cleaners.
			// So we don't need to add our own delete() method to the list of cleaners.
			currentScope._cleaners.push(this)
		}
	}
	
	_update() {
		let savedScope = currentScope;
		currentScope = this;
		try {
			this._renderer();
		} catch(e) {
			// Throw the error async, so the rest of the rendering can continue
			handleError(e, true);
		}
		currentScope = savedScope;
	}

	_remove() {
		const preNode = findLastNodeInPrevSiblings(this._prevSibling);
		const lastNode = this._getLastNode();
		removeNodes(lastNode, preNode);
		this._lastChild = undefined;

		// Run any cleaners
		this.delete();
	}
	
	_addNode(node: Node) {
		let prevNode = findLastNodeInPrevSiblings(this._lastChild) || findLastNodeInPrevSiblings(this._prevSibling);
		const parentEl = this._parentElement;
		parentEl.insertBefore(node, prevNode?.nextSibling || parentEl.firstChild);
		this._lastChild = node;
	}

	_getParentElement(): Element {
		return this._parentElement;
	}
}


class MountScope extends ContentScope {

	// The last child node or scope within this scope
	_lastChild: Node | LinkedScope | undefined;

	constructor(
		// The parent DOM element we'll add our child nodes to
		public _parentElement: Element,
		// The function that 
		public _renderer: () => any,
	) {
		super();

		// In case we're the ROOT_SCOPE, `currentScope` is (obviously) not initialized
		// yet, hence the condition.
		if (currentScope) currentScope._cleaners.push(this)
	}
	
	_update() {
		SimpleScope.prototype._update.call(this);
	}

	delete() {
		// We can't rely on our parent scope to remove all our nodes for us, as our parent
		// probably has a totally different `parentElement`. Therefore, our `delete()` does
		// what `_remove()` does for regular scopes.
		removeNodes(this._getLastNode(), undefined);
		this._lastChild = undefined;
		super.delete();
	}

	_remove() {
		this.delete();
	}
	
	_addNode(node: Node) {
		let prevNode = findLastNodeInPrevSiblings(this._lastChild);
		this._parentElement.insertBefore(node, prevNode?.nextSibling || this._parentElement.firstChild);
		this._lastChild = node;
	}

	_getParentElement(): Element {
		return this._parentElement;
	}
}



// Remove node and all its preceding siblings (uptil and excluding preNode)
// from the DOM, using onDestroy if applicable.
function removeNodes(node: Node | null | undefined, preNode: Node | null | undefined) {
	while(node && node !== preNode) {
		const prevNode: Node | null = node.previousSibling;
		let onDestroy = onDestroyMap.get(node);
		if (onDestroy && node instanceof Element) {
			if (onDestroy !== true) {
				if (typeof onDestroy === 'function') {
					onDestroy(node);
				} else {
					destroyWithClass(node, onDestroy);
				}
				// This causes the element to be ignored from this function from now on:
				onDestroyMap.set(node, true);
			}
			// Ignore the deleting element
		} else {
			(node as Element|Text).remove();
		}
		node = prevNode;
	}
}

// Get a reference to the last node within this scope or any of its preceding siblings.
// If a `Node` is given, that node is returned.
function findLastNodeInPrevSiblings(sibling: Node | LinkedScope | undefined): Node | undefined {
	while(sibling) {
		if (sibling instanceof Node) return sibling;
		let node = sibling._getLastNode();
		if (node) return node;
		sibling = sibling._prevSibling;
	}
}


class ResultScope extends SimpleScope {
	result = proxy(undefined)
	_update() {
		let savedScope = currentScope;
		currentScope = this;
		try {
			this.result.value = this._renderer();
		} catch(e) {
			// Throw the error async, so the rest of the rendering can continue
			handleError(e, true);
		}
		currentScope = savedScope;
	}
}

/**
 * This could have been done with a SimpleScope, but then we'd have to draw along an instance of
 * that as well as a renderer function that closes over quite a few variables, which probably
 * wouldn't be great for the performance of this common feature.
 */
function renderSetArg(this: SetArgScope) {
	applyArg(this._parentElement as Element, this._key, this._target.value)
}

class SetArgScope extends SimpleScope {
	constructor(
		parentElement: Element,
		prevSibling: Node | LinkedScope | undefined,
		public _key: string,
		public _target: {value: DatumType},
	) {
		super(parentElement, prevSibling, renderSetArg)
	}

}

let immediateQueue: SortedSet<Scope> = new SortedSet('_scopeId');

class ImmediateScope extends SimpleScope {
	_onChange(index: any, newData: DatumType, oldData: DatumType) {
		immediateQueue.add(this);
	}
}

let immediateQueueRunning = false;
function runImmediateQueue() {
	for(let count=0; !immediateQueue.isEmpty() && !immediateQueueRunning; count++) {
		if (count > 42) {
			immediateQueue.clear();
			throw new Error("Too many recursive updates from immediate-mode observes");
		}
		immediateQueueRunning = true;
		let copy = immediateQueue;
		immediateQueue = new SortedSet('_scopeId');
		try {
			for(const scope of copy) {
				// On exception, the exception will be bubbled up to the call site, discarding any
				// remaining immediate scopes from the queue. This behavior is perhaps debatable,
				// but getting a synchronous exception at the call site can be very helpful.
				scope._queueRun();
			}
		} finally {
			immediateQueueRunning = false;
		}
	}
}


/** @internal */
class OnEachScope implements LinkedScope {
	_scopeId: number = ++scopeCount;
	_parentElement: Element = currentScope._getParentElement();
	_prevSibling: Node | LinkedScope | undefined;

	/** The data structure we are iterating */
	_target: TargetType;
	
	/** All item scopes, by array index or object key. This is used for removing an item scope when its value
	 * disappears, and calling all subscope cleaners. */
	_byIndex: Map<any,OnEachItemScope> = new Map();

	/** The reverse-ordered list of item scopes, not including those for which makeSortKey returned undefined. */
	_sortedSet: SortedSet<OnEachItemScope> = new SortedSet('_sortKey');

	/** Indexes that have been created/removed and need to be handled in the next `queueRun`. */
	_changedIndexes: Set<any> = new Set();
	
	constructor(
		proxy: TargetType,
		/** A function that renders an item */
		public _renderer: (value: DatumType, key: any, ) => void,
		/** A function returning a number/string/array that defines the position of an item */
		public _makeSortKey?: (value: DatumType, key: any) => SortKeyType,
	) {
		const target: TargetType = this._target = (proxy as any)[TARGET_SYMBOL] || proxy;

		addObserver(target, ANY_SYMBOL, this);
		this._prevSibling = currentScope._lastChild;
		currentScope._lastChild = this;

		// Do _addChild() calls for initial items
		if (target instanceof Array) {
			for(let i=0; i<target.length; i++) {
				if (target[i]!==undefined) {
					this._addChild(i);
				}
			}
		} else {
			for(const key in target) {
				if (target[key] !== undefined) {
					this._addChild(key);
				}
			}
		}
	}
	
	// toString(): string {
	// 	return `OnEachScope(collection=${this.collection})`
	// }
	
	_onChange(index: any, newData: DatumType, oldData: DatumType) {
		this._changedIndexes.add(index);
	}
	
	_queueRun() {
		let indexes = this._changedIndexes;
		this._changedIndexes = new Set();
		for(let index of indexes) {
			const oldScope = this._byIndex.get(index);
			if (oldScope) oldScope._remove();

			if ((this._target as any)[index] === undefined) {
				this._byIndex.delete(index);
			} else {
				const newScope = new OnEachItemScope(this, index);
				this._byIndex.set(index, newScope);
				topRedrawScope = newScope;
				newScope._update();				
			}
		}
		topRedrawScope = undefined;
	}
	
	delete() {
		// Propagate to all our subscopes
		for (const scope of this._byIndex.values()) {
			scope.delete();
		}
		
		// Help garbage collection:
		this._byIndex.clear();
		this._sortedSet.clear(); // Unsure if this is a good idea. It takes time, but presumably makes things a lot easier for GC...
	}
	
	_addChild(itemIndex: any) {
		new OnEachItemScope(this, itemIndex);
	}

	_getLastNode(): Node | undefined {
		for(let scope of this._sortedSet) { // Iterates starting at last child scope.
			const node = scope._getLastNode();
			if (node) return node;
		}
	}

	_remove(): void { 
		const lastNode = this._getLastNode();
		if (lastNode) {
			const preNode = findLastNodeInPrevSiblings(this._prevSibling);
			removeNodes(lastNode, preNode);
		}

		this.delete();
	}

	// Find the last `Node` that comes *before* `scope`.
	_findLastNodeBefore(scope: OnEachItemScope): Node | undefined {
		let preScope: OnEachItemScope | undefined = scope;
		while(true) {
			preScope = this._sortedSet.next(preScope);
			if (!preScope) break;
			const preNode = findLastNodeInPrevSiblings(preScope._lastChild);
			if (preNode) return preNode;
		}
	}
}

/** @internal */
class OnEachItemScope extends ContentScope {
	_sortKey: string | number | undefined; // When undefined, this scope is currently not showing in the list
	
	constructor(
		public _parent: OnEachScope,
		public _itemIndex: any,
	) {
		super();
		_parent._byIndex.set(_itemIndex, this);

		// Don't register to be cleaned by parent scope, as the OnEachScope will manage this for us (for efficiency)
	}
	
	// toString(): string {
	// 	return `OnEachItemScope(itemIndex=${this.itemIndex} parentElement=${this.parentElement} parent=${this.parent} precedingSibling=${this.precedingSibling} lastChild=${this.lastChild})`
	// }
	
	_queueRun() {
		/* c8 ignore next */
		if (currentScope) internalError(4);
			
		this._remove();
		
		topRedrawScope = this;
		this._update();
		topRedrawScope = undefined;
	}
	
	_update() {
		// Have the makeSortKey function return an ordering int/string/array.

		// Note that we're NOT subscribing on target[itemIndex], as the OnEachScope uses
		// a wildcard subscription to delete/recreate scopes when that changes.
		// We ARE creating a proxy around the value though (in case its an object/array),
		// so we'll have our own scope subscribe to changes on that.
		const value: DatumType = optProxy((this._parent._target as any)[this._itemIndex]);

		// Since makeSortKey may get() the Store, we'll need to set currentScope first.
		let savedScope = currentScope;
		currentScope = this;
		
		try {
			this._parent._renderer(value, this._itemIndex);
		} catch(e) {
			handleError(e, true);
		}

		currentScope = savedScope;
	}

	_addNode(node: Node) {
		let prevNode = findLastNodeInPrevSiblings(this._lastChild);
		if (!prevNode) {
			// This is the first node we're inserting for this item (in this redraw).
			// Therefore we need to check if _sortKey is set and still valid, and to
			// (re)insert ourselves into the hash if needed.
			this._updateSortedSet()
			prevNode = this._parent._findLastNodeBefore(this);
		}

		const parentEl = this._parent._parentElement;
		parentEl.insertBefore(node, prevNode?.nextSibling || parentEl.firstChild);
		this._lastChild = node;
	}

	_updateSortedSet() {
		let sortKey: string|number|undefined = '';
		if (this._parent._makeSortKey) {
			const value: DatumType = optProxy((this._parent._target as any)[this._itemIndex]);
			const rawSortKey = this._parent._makeSortKey(value, this._itemIndex);
			if (rawSortKey != null) sortKey = invertSortKey(normalizeSortKey(rawSortKey));
		}
		
		if (this._sortKey !== sortKey) {
			if (this._sortKey !== undefined) {
				this._parent._sortedSet.remove(this);
			}
			this._sortKey = sortKey;
			this._parent._sortedSet.add(this);
		}
	}

	_remove() {
		const lastNode = findLastNodeInPrevSiblings(this._lastChild);
		if (lastNode) {
			const preNode = this._parent._findLastNodeBefore(this);
			removeNodes(lastNode, preNode);
		}
		this._lastChild = undefined;

		// TODO: don't do this for queueRuns!
		if (this._sortKey !== undefined) {
			this._parent._sortedSet.remove(this);
			this._sortKey = undefined;
		}

		this.delete();
	}

	_getParentElement(): Element {
		return this._parent._parentElement;
	}
}


/**
* This global is set during the execution of a `Scope.render`. It is used by
* functions like `$` and `clean`.
*/
const ROOT_SCOPE = new MountScope(document.body, ()=>{});
let currentScope: ContentScope = ROOT_SCOPE;

/**
* A special Node observer index to subscribe to any value in the map changing.
*/
const ANY_SYMBOL = Symbol('any');

/**
 * When our proxy objects need to lookup `obj[TARGET_SYMBOL]` it returns its
 * target, to be used in our wrapped methods.
 */
const TARGET_SYMBOL = Symbol('target');

const observers = new WeakMap<TargetType, Map<any, Set<Observer>>>;
let peeking = 0;

function addObserver(target: any, index: any, observer: Observer = currentScope) {
	if (peeking || observer === ROOT_SCOPE) return;

	let byTarget = observers.get(target);
	if (!byTarget) observers.set(target, byTarget = new Map());
	let byIndex = byTarget.get(index);
	if (!byIndex) byTarget.set(index, byIndex = new Set());

	if (byIndex.has(observer)) return;

	byIndex.add(observer);
	
	// Note that we're adding the cleaner to `currentScope` instead of `observer`,
	// as `observer` is not necessarily a `ContentScope`.
	currentScope._cleaners.push(byIndex)
}

function onEach<T>(target: Array<T>, render: (value: T, index: number) => void, makeKey?: (value: T, index: number) => undefined|string|number): void;
function onEach<T>(target: Record<string|symbol,T>, render: (value: T, index: string|symbol, makeKey?: (value: T, index: string|symbol) => undefined|string|number) => void): void;
function onEach<T extends object>(target: SkipList<T>, render: (value: T) => void, makeKey?: (value: T, index: string|number) => undefined|string|number): void;

function onEach(target: TargetType, render: (value: DatumType, index: any) => void, makeKey?: Function): void {
	if (!target || typeof target !== 'object') throw new Error('onEach requires an object');
	target = (target as any)[TARGET_SYMBOL] || target;

	new OnEachScope(target, render);
}

function testEmpty(target: TargetType) {
	if (target instanceof Array || target instanceof SkipList) for(let _k of target) return false
	else for(let _k in target) return false;
	return true
}

function isEmpty(proxied: TargetType): boolean {
	const target = (proxied as any)[TARGET_SYMBOL] || proxied;
	const empty = testEmpty(target);
	const scope = currentScope;

	if (scope) addObserver(target, {
		_onChange(index: any, newData: DatumType, oldData: DatumType) {
			if (newData===undefined) {
				if (!empty && testEmpty(target)) queue(scope);
			} else if (oldData===undefined) {
				if (empty) queue(scope);
			}
		}
	})

	return empty;
}

function update(target: TargetType | undefined, index: any, newData: DatumType, oldData: DatumType, merge: boolean) {
	if (newData === oldData) return;
	if (typeof newData === 'object' && newData && typeof oldData === 'object' && oldData && newData.constructor === oldData.constructor) {
		if (newData instanceof Array) {
			for(let i=0; i<newData.length; i++) {
				update(newData, i, newData[i], (oldData as any[])[i], merge);
			}
			// For arrays, merge equals set (as overwriting a partial array rarely makes sense)
			for(let i=newData.length; i<(oldData as any[]).length; i++) {
				emit(oldData, i, undefined, (oldData as any)[i])
			}
			(oldData as any[]).length = newData.length;
		} else {
			for(const k in newData) {
				update(oldData, k, newData[k], (oldData as any)[k], merge);
			}
			if (!merge) { // Delete removed keys
				for(const k in oldData) {
					if (!(k in newData)) {
						emit(oldData, k, undefined, (oldData as any)[k]);
						(oldData as any)[k] = undefined;
					}
				}
			}
		}
	} else {
		if (!target) throw new Error("Cannot change top-level proxy type");
		(target as any)[index] = optProxy(newData);
		emit(target, index, newData, oldData);
	}
}

let emit = function(target: TargetType, index: any, newData: DatumType, oldData: DatumType) {
	if (newData === oldData) return;
	
	const byTarget = observers.get(target);
	if (byTarget===undefined) return;

	let byIndex = byTarget.get(index);
	if (byIndex) {
		for(let observer of byIndex) {
			observer._onChange(index, newData, oldData)	
		}
	}
	byIndex = byTarget.get(ANY_SYMBOL);
	if (byIndex) {
		for(let observer of byIndex) {
			observer._onChange(index, newData, oldData)	
		}
	}
}


const objectHandler: ProxyHandler<any> = {
	get(target: any, prop: any) {
		if (prop===TARGET_SYMBOL) return target;
		console.log(`OBJECT prop GET ${String(prop)}`);
		addObserver(target, prop);
		return optProxy(target[prop]);
	},
	set(target: any, prop: any, value: any) {
		console.log(`SET ${String(prop)}:`, value);
		update(target, prop, value, target[prop], false);
		return true;
	},
	deleteProperty(target: any, prop: any) {
		console.log(`DELETE ${String(prop)}`);
		const old = target[prop];
		delete target[prop];
		emit(target, prop, undefined, old);
		return true;
	},
	has(target: any, prop: any) {
		const result = prop in target;
		console.log(`HAS ${String(prop)}:`, result);
		addObserver(target, prop);
		return result;
	},
};

const arrayMethods: Record<string,Function> = {
	push: function(this: any, ...items: any[]) {
		console.log('ARRAY push:', items);
		const target = this[TARGET_SYMBOL];
		for(let item of items.map(optProxy)) {
			target.push(item);
			emit(target, target.length-1, item, undefined);
		}
		emit(target, 'length', target.length, target.length - items.length);
		runImmediateQueue();
		return target.length;
	},
	pop: function(this: any) {
		console.log('ARRAY pop');
		const target = this[TARGET_SYMBOL];
		if (target.length > 0) {
			const value = target.pop();
			emit(target, target.length, undefined, value);
			emit(target, 'length', target.length, target.length + 1);
			runImmediateQueue();
			// We don't need to subscribe to changes, as the data we read is no longer
			// there, so cannot change.
			return value;
		}
	},
	shift: function(this: any) {
		console.log('ARRAY shift');
		const target = this[TARGET_SYMBOL];
		if (target.length > 0) {
			const value = target.shift();
			emit(target, 0, target[0], value);
			for(let i=0; i<target.length; i++) {
				emit(target, i+1, target[i], value);
			}
			emit(target, 'length', target.length, target.length + 1);
			runImmediateQueue();
			// We don't need to subscribe to changes, as the data we read is no longer
			// there, so cannot change.
			return value;
		}
	},
	unshift: function(this: any, ...items: any[]) {
		console.log('ARRAY unshift:', items);
		const target = this[TARGET_SYMBOL];
		const result = target.unshift(...items.map(optProxy));
		for(let i=0; i<target.length; i++) {
			emit(target, i+1, target[i], target[i+items.length]);
		}
		emit(target, 'length', target.length, target.length - items.length);
		runImmediateQueue();
		return result;
	},
	splice: function(this: any, start: number, deleteCount: number = 0, ...items: any[]) {
		const target = this[TARGET_SYMBOL];
		console.log('ARRAY splice:', start, deleteCount, items);
		items = items.map(optProxy);
		const oldLength = target.length;
		const result = target.splice(
			start, 
			deleteCount,
			...items,
		);
		const end = deleteCount === items.length ? start+deleteCount : Math.max(target.length, oldLength);
		for(let i=start; i<end; i++) {
			emit(target, i+1, target[i], target[i+deleteCount]);
		}
		emit(target, 'length', target.length, oldLength);
		runImmediateQueue();
		// We don't need to subscribe to changes, as the data we read is no longer
		// there, so cannot change.
		return result;
	},
	slice: function(this: any, start: number = 0, end: number = this.length) {
		console.log('ARRAY slice:', start, end);
		const target = this[TARGET_SYMBOL];
		for(let i=start; i<end; i++) {
			addObserver(target, i);
		}
		return target.slice(start, end);
	},
	forEach: function(this: any, callbackFn: Function) {
		const target = this[TARGET_SYMBOL];
		console.log('ARRAY forEach');
		addObserver(target, ANY_SYMBOL);
		return target.forEach((v:any, t:any) => callbackFn(optProxy(v), t));
	},
	[Symbol.iterator](): IterableIterator<any> {
		const target = (this as any)[TARGET_SYMBOL];
		addObserver(target, ANY_SYMBOL);
		return target[Symbol.iterator];
	},
	map: function(func: (item: any)=>any, thisArg: any) {
		const target = (this as any)[TARGET_SYMBOL];
		function obsFunc(item: any) {
			new SimpleScope(currentScope._getParentElement(), currentScope._lastChild, () => {
				// Hmm...
				const newValue = target[index];
				if(newValue === undefined) delete outProxy[index];
				else outProxy[index] = obsFunc.apply(thisArg, [newValue]);
			});
		} 
		const outArr = target.map(obsFunc, thisArg);
		const outProxy = optProxy(outArr);
		addObserver(target, ANY_SYMBOL, {
			_onChange(index, newData, oldData) {
				outProxy[index] = obsFunc.apply(thisArg, [newData]);
			},
		})
		return outProxy;
	}
	// TODO: look at jsdocs for more methods?
};

// wrap result
'at concat every filter find findIndex findLast findLastIndex includes indexOf join lastIndexOf'.split(' ').forEach(name => {
	arrayMethods[name] = function(...args: any[]) {
		const target = (this as any)[TARGET_SYMBOL];
		addObserver(this, ANY_SYMBOL);
		return optProxy(target[name](...args));
	};
})


const arrayHandler: ProxyHandler<any[]> = {
	get(target: any, prop: any) {
		if (prop===TARGET_SYMBOL) return target;
		console.log(`ARRAY prop GET ${String(prop)}`);
		const method = arrayMethods[prop as keyof typeof arrayMethods];
		if (method) return method;
		throw new Error(`Array proxy doesn't support '${prop}'`)
	},
	set(target: any, prop: any, value: any) {
		console.log(`SET ${String(prop)}:`, value);
		const old = target[prop];
		if (prop === 'length') {
			// We only need to emit for shrinking, as growing just adds undefineds
			for(let i=value; i<target.length; i++) {
				emit(target, i, undefined, target[prop]);
			}
		}
		throw new Error(`Array proxy doesn't support '${prop}'`)
	},
};


const proxyMap = new WeakMap<TargetType, /*Proxy*/TargetType>();

function optProxy(value: any): any {
	// If value is a primitive type or already proxied, just return it
	if (typeof value !== 'object' || !value || value[TARGET_SYMBOL] !== undefined) {
		return value;
	}
	let proxied = proxyMap.get(value);
	if (proxied) return proxied // Only one proxy per target!
	
	proxied = new Proxy(value, value instanceof Array ? arrayHandler : objectHandler);
	proxyMap.set(value, proxied as TargetType);
	return proxied;
}

function proxy<T extends DatumType>(array: Array<T>): Array<T>;
function proxy<T extends object>(obj: T): T;
function proxy<T extends DatumType>(value: T): {value: T};

function proxy(target: TargetType): TargetType {
	return optProxy(typeof target === 'object' && target !== null ? target : {value: target});
}

function isProxied(target: TargetType): boolean {
	return typeof target === 'object' && target !== null && (target as any)[TARGET_SYMBOL] !== undefined;
}

export class Proxied {
	constructor() {
		const proxied = new Proxy(this, objectHandler);
		proxyMap.set(this, proxied as TargetType);
		return proxied
	}
}


let onDestroyMap: WeakMap<Node, string | Function | true> = new WeakMap();

function destroyWithClass(element: Element, cls: string) {
	element.classList.add(cls);
	setTimeout(() => element.remove(), 2000);
}


function addLeafNode(deepEl: Element, node: Node) {
	if (deepEl === currentScope._getParentElement()) {
		currentScope._addNode(node);
	} else {
		deepEl.appendChild(node);
	}
}

/** Helper function to get a deeply nested value from an object, Map or Array;
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
function get<T extends object, K1 extends keyof T>(target: T, k1: K1): T[K1] | undefined;
function get<T extends object, K1 extends keyof T, K2 extends keyof T[K1]>(target: T, k1: K1, k2: K2): T[K1][K2] | undefined;
function get<T extends object, K1 extends keyof T, K2 extends keyof T[K1], K3 extends keyof T[K1][K2]>(target: T, k1: K1, k2: K2, k3: K3): T[K1][K2][K3] | undefined;

function get(target: TargetType, ...indices: any[]): DatumType | undefined {
	// We'll work on the proxied object, subscribing to reads
	let node: any = target;
	for(let index of indices) {
		if (node==null) return;
		if (typeof node !== 'object') throw new Error(`Attempting to index primitive type ${node} with ${index}`);
		node = node[index];
	}
	return node;
}


function set<T extends object>(target: T, value: T): void;
function set<T extends object, K1 extends keyof T>(target: T, k1: K1, value: T[K1]): void;
function set<T extends object, K1 extends keyof T, K2 extends keyof T[K1]>(target: T, k1: K1, k2: K2, value: T[K1][K2]): void;
function set<T extends object, K1 extends keyof T, K2 extends keyof T[K1], K3 extends keyof T[K1][K2]>(target: T, k1: K1, k2: K2, k3: K3, value: T[K1][K2][K3]): void;

function set(target: TargetType, ...indicesAndValue: any[]): void {
	mergeSet(target, indicesAndValue, false)
}

function mergeSet(target: TargetType, indicesAndValue: any[], merge: boolean): void {
	// We don't want to subscribe, so we'll work on the actual target object
	target = (target as any)[TARGET_SYMBOL] || target
	const value = indicesAndValue.pop();
	if (indicesAndValue.length) {
		const prop = indicesAndValue.pop();
		let node: any = target;
		for(let index of indicesAndValue) {
			node = node[index]
			node = node[TARGET_SYMBOL] || node
		}
		update(node, prop, value, node[prop], merge)
	} else {
		update(undefined, undefined, value, target, merge)
	}
}


function merge<T extends object>(target: T, value: T): void;
function merge<T extends object, K1 extends keyof T>(target: T, k1: K1, value: T[K1]): void;
function merge<T extends object, K1 extends keyof T, K2 extends keyof T[K1]>(target: T, k1: K1, k2: K2, value: T[K1][K2]): void;
function merge<T extends object, K1 extends keyof T, K2 extends keyof T[K1], K3 extends keyof T[K1][K2]>(target: T, k1: K1, k2: K2, k3: K3, value: T[K1][K2][K3]): void;

function merge(target: TargetType, ...indicesAndValue: any[]): void {
	mergeSet(target, indicesAndValue, true)
}


interface RefTarget {
	proxy: TargetType
	index: any
}
const refHandler: ProxyHandler<RefTarget> = {
	get(target: RefTarget, prop: any) {
		if (prop===TARGET_SYMBOL) return target;
		if (prop==="value") {
			return (target.proxy as any)[target.index];
		}
	},
	set(target: any, prop: any, value: any) {
		if (prop==="value") {
			(target.proxy as any)[target.index] = value;
			return true;
		}
		return false;
	},
};

function ref(proxy: TargetType, index: any) {
	return new Proxy({proxy, index}, refHandler);
}


function applyBind(_el: Element, target: any) {
	const index = 'value'
	const el = _el as HTMLInputElement;
	let onProxyChange: (value: any) => void;
	let onInputChange: () => void;
	let type = el.getAttribute('type');
	let value = peek(target, index);
	if (type === 'checkbox') {
		if (value === undefined) set(target, index, el.checked);
		onProxyChange = value => el.checked = value;
		onInputChange = () => set(target, index, el.checked);
	} else if (type === 'radio') {
		if (value === undefined && el.checked) set(target, index, el.value);
		onProxyChange = value => el.checked = (value === el.value);
		onInputChange = () => {
			if (el.checked) set(target, index, el.value);
		}
	} else {
		onInputChange = () => set(target, index, type==='number' || type==='range' ? (el.value==='' ? null : +el.value) : el.value);
		if (value === undefined) onInputChange();
		onProxyChange = value => {
			if (el.value !== value) el.value = value;
		}
	}
	observe(() => {
		onProxyChange(get(target, index));
	});
	el.addEventListener('input', onInputChange);
	clean(() => {
		el.removeEventListener('input', onInputChange);
	});
}

const SPECIAL_PROPS: {[key: string]: (el: Element, value: any) => void} = {
	create: function(el: Element, value: any) {
		if (currentScope !== topRedrawScope) return;
		if (typeof value === 'function') {
			value(el);
		} else {
			el.classList.add(value);
			(async function(){
				await DOM_READ_PHASE;
				(el as HTMLElement).offsetHeight;
				await DOM_WRITE_PHASE;
				el.classList.remove(value);
			})();
		}
	},
	destroy: function(deepEl: Element, value: any) {
		onDestroyMap.set(deepEl, value);
	},
	html: function(deepEl: Element, value: any) {
		let tmpParent = document.createElement(deepEl.tagName);
		tmpParent.innerHTML = ''+value;
		while(tmpParent.firstChild) addLeafNode(deepEl, tmpParent.firstChild);
	},
	text: function(deepEl: Element, value: any) {
		addLeafNode(deepEl, document.createTextNode(value));
	},
	element: function(deepEl: Element, value: any) {
		if (!(value instanceof Node)) throw new Error(`Unexpect element-argument: ${JSON.parse(value)}`);
		addLeafNode(deepEl, value);
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
* @throws {Error} If invalid arguments are provided.
*/

function $(...args: (string | (() => void) | false | null | undefined | {[key: string]: any})[]) {
	let deepEl = currentScope._getParentElement();
	let result;
	
	for(let arg of args) {
		if (arg == null || arg === false) continue;
		if (typeof arg === 'string') {
			let text, classes;
			const textPos = arg.indexOf(':');
			if (textPos >= 0) {
				text = arg.substring(textPos+1);
				if (textPos === 0) { // Just a string to add as text, no new node
					addLeafNode(deepEl, document.createTextNode(text));
					continue;
				}
				arg = arg.substring(0,textPos);
			}
			const classPos = arg.indexOf('.');
			if (classPos >= 0) {
				classes = arg.substring(classPos+1).replaceAll('.', ' ');
				arg = arg.substring(0, classPos);
			}
			if (arg.indexOf(' ') >= 0) throw new Error(`Tag '${arg}' cannot contain space`);
			const el = document.createElement(arg || 'div');
			if (classes) el.className = classes;
			if (text) el.textContent = text;
			addLeafNode(deepEl, el);
			deepEl = el;
		}
		else if (typeof arg === 'object') {
			if (arg.constructor !== Object) throw new Error(`Unexpected argument: ${arg}`);
			for(const key in arg) {
				const val = arg[key];
				applyArg(deepEl, key, val);
			}
		} else if (typeof arg === 'function' && arg === args[args.length-1]) {
			let scope
			if (deepEl === currentScope._getParentElement()) {
				// We're adding to a pre-existing element, that may already have other observers attached
				const prevSibling = currentScope._lastChild;
				if (args.length===1) {
					scope = new ResultScope(deepEl, prevSibling, arg);
					result = scope.result
				} else {
					scope = new SimpleScope(deepEl, prevSibling, arg);
				}
			} else {
				// This is the first scope within a new DOM element
				scope = new SimpleScope(deepEl, deepEl.lastChild as Node, arg);
			}
		} else {
			throw new Error(`Unexpected argument: ${JSON.stringify(arg)}`);
		}
	}

	return result
}


function applyArg(deepEl: Element, key: string, value: any) {
	if (typeof value === 'object' && value !== null && value[TARGET_SYMBOL] !== undefined) { // Value is a proxy
		if (key === 'bind') {
			applyBind(deepEl, value)
		} else {
			new SetArgScope(deepEl, deepEl.lastChild as Node, key, value)
			// SetArgScope will (repeatedly) call `applyArg` again with the actual value
		}
	} else if (key[0] === '.') { // CSS class(es)
		const classes = key.substring(1).split('.');
		if (value) deepEl.classList.add(...classes);
		else deepEl.classList.remove(...classes);
	} else if (key[0] === '$') { // Style
		const name = key.substring(1);
		if (value==null || value===false) (deepEl as any).style[name] = ''
		else (deepEl as any).style[name] = ''+value;
	} else if (value == null) { // Value left empty
		// Do nothing
	} else if (key in SPECIAL_PROPS) { // Special property
		SPECIAL_PROPS[key](deepEl, value);
	} else if (typeof value === 'function') { // Event listener
		deepEl.addEventListener(key, value);
		clean(() => deepEl.removeEventListener(key, value));
	} else if (value===true || value===false || key==='value' || key==='selectedIndex') { // DOM property
		(deepEl as any)[key] = value;
	} else { // HTML attribute
		deepEl.setAttribute(key, value);
	}
}

function defaultOnError(error: Error) {
	console.error('Error while in Aberdeen render:', error);
	return true;
}
let onError: (error: Error) => boolean | undefined = defaultOnError;

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
function setErrorHandler(handler?: (error: Error) => boolean | undefined) {
	onError = handler || defaultOnError;
}


/**
* Return the browser Element that nodes would be rendered to at this point.
* NOTE: Manually changing the DOM is not recommended in most cases. There is
* usually a better, declarative way. Although there are no hard guarantees on
* how your changes interact with Aberdeen, in most cases results will not be
* terribly surprising. Be careful within the parent element of onEach() though.
*/
function getParentElement(): Element {
	return currentScope._getParentElement();
}


/**
* Register a function that is to be executed right before the current reactive scope
* disappears or redraws.
* @param cleaner - The function to be executed.
*/
function clean(cleaner: () => void) {
	currentScope._cleaners.push({delete: cleaner});
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
function observe(func: () => void) {
	new SimpleScope(currentScope._getParentElement(), currentScope._lastChild, func);
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
function immediateObserve(func: () => void) {
	new ImmediateScope(currentScope._getParentElement(), currentScope._getLastNode(), func);
}


/**
* Reactively run the function, adding any DOM-elements created using {@link $} to the given parent element.

* @param func - The function to be (repeatedly) executed, possibly adding DOM elements to `parentElement`.
* @param parentElement - A DOM element that will be used as the parent element for calls to `$`.
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

function mount(parentElement: Element, func: () => void) {
	new MountScope(parentElement, func);
}

/**
 * Stop all observe scopes and remove any created DOM nodes.
 */
function deleteAll() {
	ROOT_SCOPE._remove();
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

function peek<T>(func: () => T): T;
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
function peek<T extends object, K1 extends keyof T>(target: T, k1: K1): T[K1] | undefined;
function peek<T extends object, K1 extends keyof T, K2 extends keyof T[K1]>(target: T, k1: K1, k2: K2): T[K1][K2] | undefined;
function peek<T extends object, K1 extends keyof T, K2 extends keyof T[K1], K3 extends keyof T[K1][K2]>(target: T, k1: K1, k2: K2, k3: K3): T[K1][K2][K3] | undefined;

function peek(target: TargetType, ...indices: any[]): DatumType | undefined {
	peeking++;
	try {
		if (indices.length===0 && typeof target === 'function') return target();
		let node: any = target;
		for(let index of indices) {
			if (node==null) return;
			if (typeof node !== 'object') throw new Error(`Attempting to index primitive type ${node} with ${index}`);
			node = node[index];
		}
		return node;
	} finally {
		peeking--;
	}

}

/**
 * Applies a filter/map function on each item within the provided array or object proxy,
 * and reactively updated the returned array or object proxy.
 *
 * @param target - A proxied array or object.
 *
 * @param func - Function that transform the given value (and index) into an output value or
 * `undefined` in case this value should be skipped.
 *
 * @returns - A proxied array or object (matching `target`) with the values returned by `func`
 * and the corresponding keys from the original map or array.
 *
 */
function map<IN,OUT>(target: Array<IN>, func: (value: IN, index: number) => OUT): Array<OUT>;
function map<IN,OUT>(target: Record<string|symbol,IN>, func: (value: IN, index: string|symbol) => OUT): Record<string|symbol,OUT>;

function map(target: any, func: (value: DatumType, key: any) => any): any {
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
function multiMap(func: (store: Store) => any): Store {
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
function dump(): Store {
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

/*
* Helper functions
*/

/* c8 ignore start */
function internalError(code: number) {
	throw new Error("Aberdeen internal error "+code);
}
/* c8 ignore end */

function handleError(e: any, showMessage: boolean) {
	try {
		if (onError(e) === false) showMessage = false;
	} catch {}
	if (showMessage && currentScope._getParentElement()) $('.aberdeen-error:Error');
}

/** @internal */
function withEmitHandler(handler: (target: TargetType, index: any, newData: DatumType, oldData: DatumType) => void, func: ()=>void) {
	const oldEmitHandler = emit;
	emit = handler;
	try {
		func();
	} finally {
		emit = oldEmitHandler;
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


$.runQueue = runQueue;
$.onEach = onEach;
$.isEmpty = isEmpty;
$.proxy = proxy;
$.isProxied = isProxied;
$.get = get;
$.set = set;
$.merge = merge;
$.ref = ref;
$.setErrorHandler = setErrorHandler;
$.getParentElement = getParentElement;
$.clean = clean;
$.observe = observe;
$.immediateObserve = immediateObserve;
$.mount = mount;
$.deleteAll = deleteAll;
$.peek = peek;
$.withEmitHandler = withEmitHandler;

$.DOM_READ_PHASE = DOM_READ_PHASE;
$.DOM_WRITE_PHASE = DOM_WRITE_PHASE;

export default $;
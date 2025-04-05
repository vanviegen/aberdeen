import { ReverseSortedSet } from "./helpers/reverseSortedSet.js";

/*
* QueueRunner
*
* `queue()`d runners are executed on the next timer tick, by order of their
* `prio` values.
*/
interface QueueRunner {
	prio: number; // Higher values have higher priority
	queueRun(): void;
}

let sortedQueue: ReverseSortedSet<QueueRunner> | undefined; // When set, a runQueue is scheduled or currently running.
let runQueueDepth = 0 // Incremented when a queue event causes another queue event to be added. Reset when queue is empty. Throw when >= 42 to break (infinite) recursion.
let topRedrawScope: Scope | undefined // The scope that triggered the current redraw. Elements drawn at this scope level may trigger 'create' animations.

export type TargetType = any[] | {[key: string]: any};
export type DatumType = TargetType | boolean | number | string | null | undefined;

/** @internal */
export type Patch = Map<TargetType, Record<string|symbol|number, [any, any]>>;

function queue(runner: QueueRunner) {
	if (!sortedQueue) {
		sortedQueue = new ReverseSortedSet<QueueRunner>('prio');
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
export function runQueue(): void {
	while(true) {
		const runner = sortedQueue!.fetchLast();
		if (!runner) break;
		if (runQueueDepth&1) runQueueDepth++; // Make it even
		runner.queueRun();
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

export const DOM_READ_PHASE = {
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

export const DOM_WRITE_PHASE = {
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
	prio: Number.MIN_SAFE_INTEGER, // after everything else is done
	queueRun: function() {
		let waiters = domWaiters;
		domWaiters = [];
		domInReadPhase = !domInReadPhase;
		for(let waiter of waiters) {
			try {
				waiter();
			} catch(e) {
				handleError(e, false);
			}
		}
	}
}


/** @internal */
type SortKeyType = number | string | Array<number|string> | undefined;

/**
* Given an integer number or a string, this function returns a string that can be concatenated
* with other strings to create a composed sort key, that follows natural number ordering.
*/
function partToStr(part: number|string): string {
	if (typeof part === 'string') {
		return part + '\x01'; // end-of-string
	}
	let result = '';
	let num = Math.abs(Math.round(part));
	const negative = part < 0;
	while(num > 0) {
		/*
		* We're reserving a few character codes:
		* 0 - for compatibility
		* 1 - separator between string array items
		* 65535 - for compatibility
		*/
		result += String.fromCharCode(negative ? 65534 - (num % 65533) : 2 + (num % 65533));
		num = Math.floor(num / 65533);
	}
	// Prefix the number of digits, counting down from 128 for negative and up for positive
	return String.fromCharCode(128 + (negative ? -result.length : result.length)) + result;
}

/**
 * Basically flips the bits on a key, in order to sort in the reverse direction.
 */
// function invertSortKey(key: number | string) {
// 	if (typeof key === 'number') return -key;
// 	let result = '';
// 	for (let i = 0; i < key.length; i++) {
// 		result += String.fromCodePoint(65535 - key.charCodeAt(i));
// 	}
// 	return result;
// }



// Each new scope gets a lower prio than all scopes before it, by decrementing
// this counter.
let lastPrio = 0;

abstract class Scope implements QueueRunner {
	// Scopes are to be handled in creation order. This will make sure that parents are
	// handled before their children (as they should), and observes are executed in the
	// order of the source code.
	prio: number = --lastPrio;

	abstract onChange(index: any, newData: DatumType, oldData: DatumType): void;
	abstract queueRun(): void;
	
	abstract getLastNode(): Node | undefined;
	abstract getPrecedingNode(): Node | undefined;
	abstract delete(): void;

	remove() {
		// Remove any nodes
		const lastNode = this.getLastNode();
		if (lastNode) removeNodes(lastNode, this.getPrecedingNode());

		// Run any cleaners
		this.delete();
	}

	// toString(): string {
	// 	return `${this.constructor.name}`
	// }
}

/**
 * All Scopes that can hold nodes and subscopes, including `SimpleScope` and `OnEachItemScope`
 * but *not* `OnEachScope`, are `ContentScope`s.
 */
abstract class ContentScope extends Scope {
	// The list of clean functions to be called when this scope is cleaned. These can
	// be for child scopes, subscriptions as well as `clean(..)` hooks.
	cleaners: Array<{delete: (scope: Scope) => void} | (() => void)> = [];

	lastChild: Node | Scope | undefined;

	// Should be subclassed in most cases..
	redraw() {};

	abstract getParentElement(): Element;

	getLastNode(): Node | undefined {
		return findLastNodeInPrevSiblings(this.lastChild);
	}

	/**
	 * Call cleaners and make sure the scope is not queued.
	 * It is called `delete`, so that the list of cleaners can also contain `Set`s.
	 */
	delete(/* ignore observer argument */) {
		for(let cleaner of this.cleaners) {
			if (typeof cleaner === 'function') cleaner();
			else cleaner.delete(this); // pass in observer argument, in case `cleaner` is a `Set`
		}
		this.cleaners.length = 0;
		sortedQueue?.remove(this); // This is very fast and O(1) when not queued

		// To prepare for a redraw or to help GC when we're being removed:
		this.lastChild = undefined;
	}
	
	queueRun() {
		this.remove();
		
		topRedrawScope = this
		this.redraw();
		topRedrawScope = undefined
	}

	addNode(node: Node) {
		const parentEl = this.getParentElement();
		const prevEl = this.getLastNode() || this.getPrecedingNode();

		parentEl.insertBefore(node, prevEl ? prevEl.nextSibling : parentEl.firstChild);
		this.lastChild = node;
	}

	onChange(index: any, newData: DatumType, oldData: DatumType) {
		queue(this);	
	}
}


class ChainedScope extends ContentScope {
	// The node or scope right before this scope that has the same `parentElement`.
	public prevSibling: Node | Scope | undefined;

	constructor(
		// The parent DOM element we'll add our child nodes to.
		public parentElement: Element,
	) {
		super();
		if (parentElement === currentScope.getParentElement()) {
			// If `currentScope` is not actually a ChainedScope, prevSibling will be undefined, as intended
			this.prevSibling = currentScope.lastChild || (currentScope as ChainedScope).prevSibling;
			currentScope.lastChild = this;
		}

		// We're always adding ourselve as a cleaner, in order to run our own cleaners
		// and to remove ourselve from the queue (if we happen to be in there).
		currentScope.cleaners.push(this);
	}

	getPrecedingNode(): Node | undefined {
		return findLastNodeInPrevSiblings(this.prevSibling);
	}
	
	getParentElement(): Element {
		return this.parentElement;
	}
}

/**
* @internal
* A `RegularScope` is created with a `render` function that is run initially,
* and again when any of the `Store`s that this function reads are changed. Any
* DOM elements that is given a `render` function for its contents has its own scope.
* The `Scope` manages the position in the DOM tree elements created by `render`
* are inserted at. Before a rerender, all previously created elements are removed
* and the `clean` functions for the scope and all sub-scopes are called.
*/
class RegularScope extends ChainedScope {
	constructor(
		parentElement: Element,
		// The function that will be reactively called. Elements it creates using `$` are 
		// added to the appropriate position within `parentElement`.
		public renderer: () => any,
	) {
		super(parentElement);

		// Do the initial run
		this.redraw();
	}

	redraw() {
		let savedScope = currentScope;
		currentScope = this;
		try {
			this.renderer();
		} catch(e) {
			// Throw the error async, so the rest of the rendering can continue
			handleError(e, true);
		}
		currentScope = savedScope;
	}
}


class RootScope extends ContentScope {
	getParentElement(): Element {
		return document.body;
	}
	getPrecedingNode(): Node | undefined {
		return undefined;
	}
}

class MountScope extends ContentScope {
	constructor(
		// The parent DOM element we'll add our child nodes to
		public parentElement: Element,
		// The function that 
		public renderer: () => any,
	) {
		super();
		this.redraw();
		currentScope.cleaners.push(this)
	}

	getParentElement(): Element {
		return this.parentElement;
	}
	
	redraw() {
		RegularScope.prototype.redraw.call(this);
	}

	getPrecedingNode(): Node | undefined {
		return undefined;
	}

	delete() {
		// We can't rely on our parent scope to remove all our nodes for us, as our parent
		// probably has a totally different `parentElement`. Therefore, our `delete()` does
		// what `_remove()` does for regular scopes.
		removeNodes(this.getLastNode(), this.getPrecedingNode());
		super.delete();
	}

	remove() {
		this.delete();
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

// Get a reference to the last node within `sibling` or any of its preceding siblings.
// If a `Node` is given, that node is returned.
function findLastNodeInPrevSiblings(sibling: Node | Scope | undefined): Node | undefined {
	if (!sibling || sibling instanceof Node) return sibling;
	return sibling.getLastNode() || sibling.getPrecedingNode();
}


class ResultScope extends ChainedScope {
	public result: {value: DatumType} = optProxy({value: undefined});

	constructor(
		parentElement: Element,
		public renderer: () => DatumType,
	) {
		super(parentElement);

		this.redraw();
	}

	redraw() {
		let savedScope = currentScope;
		currentScope = this;
		try {
			this.result.value = this.renderer();
		} catch(e) {
			// Throw the error async, so the rest of the rendering can continue
			handleError(e, true);
		}
		currentScope = savedScope;
	}
}

/**
 * A `Scope` subclass optimized for reactively setting just a single element property
 * based on a proxied reference. 
 */

class SetArgScope extends ChainedScope {
	constructor(
		parentElement: Element,
		public key: string,
		public target: {value: DatumType},
	) {
		super(parentElement);
		this.redraw();
	}
	redraw() {
		let savedScope = currentScope;
		currentScope = this;
		applyArg(this.key, this.target.value)
		currentScope = savedScope;
	}
}


let immediateQueue: ReverseSortedSet<Scope> = new ReverseSortedSet('prio');

class ImmediateScope extends RegularScope {
	onChange(index: any, newData: DatumType, oldData: DatumType) {
		immediateQueue.add(this);
	}
}

let immediateQueueRunning = false;
function runImmediateQueue() {
	for(let count=0; !immediateQueue.isEmpty() && !immediateQueueRunning; count++) {
		if (count > 42) {
			immediateQueue.clear();
			throw new Error("Too many immediate-mode recursive updates");
		}
		immediateQueueRunning = true;
		let copy = immediateQueue;
		immediateQueue = new ReverseSortedSet('prio');
		try {
			for(const scope of copy) {
				// On exception, the exception will be bubbled up to the call site, discarding any
				// remaining immediate scopes from the queue. This behavior is perhaps debatable,
				// but getting a synchronous exception at the call site can be very helpful.
				scope.queueRun();
			}
		} finally {
			immediateQueueRunning = false;
		}
	}
}


/** @internal */
class OnEachScope extends Scope {
	parentElement: Element = currentScope.getParentElement();
	prevSibling: Node | Scope | undefined;

	/** For making sure the types are not mixed: */
	sortKeyType: 'string' | 'number' | undefined;

	/** The data structure we are iterating */
	target: TargetType;
	
	/** All item scopes, by array index or object key. This is used for removing an item scope when its value
	 * disappears, and calling all subscope cleaners. */
	byIndex: Map<any,OnEachItemScope> = new Map();

	/** The reverse-ordered list of item scopes, not including those for which makeSortKey returned undefined. */
	sortedSet: ReverseSortedSet<OnEachItemScope> = new ReverseSortedSet('sortKey');

	/** Indexes that have been created/removed and need to be handled in the next `queueRun`. */
	changedIndexes: Set<any> = new Set();
	
	constructor(
		proxy: TargetType,
		/** A function that renders an item */
		public renderer: (value: DatumType, key: any, ) => void,
		/** A function returning a number/string/array that defines the position of an item */
		public makeSortKey?: (value: DatumType, key: any) => SortKeyType,
	) {
		super();
		const target: TargetType = this.target = (proxy as any)[TARGET_SYMBOL] || proxy;

		subscribe(target, ANY_SYMBOL, this);
		this.prevSibling = currentScope.lastChild || (currentScope as ChainedScope).prevSibling;
		currentScope.lastChild = this;

		currentScope.cleaners.push(this);

		// Do _addChild() calls for initial items
		if (target instanceof Array) {
			for(let i=0; i<target.length; i++) {
				if (target[i]!==undefined) {
					new OnEachItemScope(this, i, false);
				}
			}
		} else {
			for(const key in target) {
				if (target[key] !== undefined) {
					new OnEachItemScope(this, key, false);
				}
			}
		}
	}

	getPrecedingNode(): Node | undefined {
		return findLastNodeInPrevSiblings(this.prevSibling);
	}
	
	onChange(index: any, newData: DatumType, oldData: DatumType) {
		if (!(this.target instanceof Array) || typeof index === 'number') this.changedIndexes.add(index);
		queue(this);
	}
	
	queueRun() {
		let indexes = this.changedIndexes;
		this.changedIndexes = new Set();
		for(let index of indexes) {
			const oldScope = this.byIndex.get(index);
			if (oldScope) oldScope.remove();

			if ((this.target as any)[index] === undefined) {
				this.byIndex.delete(index);
			} else {
				new OnEachItemScope(this, index, true);
			}
		}
		topRedrawScope = undefined;
	}
	
	delete() {
		// Propagate to all our subscopes
		for (const scope of this.byIndex.values()) {
			scope.delete();
		}
		
		// Help garbage collection:
		this.byIndex.clear();
		this.sortedSet.clear(); // Unsure if this is a good idea. It takes time, but presumably makes things a lot easier for GC...
	}
	
	getLastNode(): Node | undefined {
		for(let scope of this.sortedSet) { // Iterates starting at last child scope.
			const node = scope.getActualLastNode();
			if (node) return node;
		}
	}
}

/** @internal */
class OnEachItemScope extends ContentScope {
	sortKey: string | number | undefined; // When undefined, this scope is currently not showing in the list
	
	constructor(
		public parent: OnEachScope,
		public itemIndex: any,
		topRedraw: boolean,
	) {
		super();

		this.parent.byIndex.set(this.itemIndex, this);

		// Okay, this is hacky. In case our first (actual) child is a ChainedScope, we won't be able
		// to provide it with a reliable prevSibling. Therefore, we'll pretend to be that sibling,
		// doing what's need for this case in `getLastNode`.
		this.lastChild = this;

		// Don't register to be cleaned by parent scope, as the OnEachScope will manage this for us (for efficiency)

		if (topRedraw) topRedrawScope = this;
		this.redraw();
	}

	getPrecedingNode(): Node | undefined {
		// As apparently we're interested in the node insert position, we'll need to become part
		// of the sortedSet now (if we weren't already).
		// This will do nothing and barely take any time of `this` is already part of the set:
		if (this.sortKey == null) throw new Error('xxx')
		this.parent.sortedSet.add(this);
		
		const preScope = this.parent.sortedSet.prev(this);
		// As preScope should have inserted itself as its first child, this should
		// recursively call getPrecedingNode() on preScope in case it doesn't
		// have any actual nodes as children yet.
		if (preScope) return findLastNodeInPrevSiblings(preScope.lastChild);
		return this.parent.getPrecedingNode();
	}

	getLastNode(): Node | undefined {
		// Hack! As explain in the constructor, this getLastNode method actually
		// does not return the last node, but the preceding one.
		return this.getPrecedingNode();
	}

	getActualLastNode(): Node | undefined {
		let child = this.lastChild;

		while(child && child !== this) {
			if (child instanceof Node) return child;
			const node = child.getLastNode();
			if (node) return node;
			child = child.getPrecedingNode();
		}
	}

	queueRun() {
		/* c8 ignore next */
		if (currentScope !== ROOT_SCOPE) internalError(4);
			
		// We're not calling `remove` here, as we don't want to remove ourselves from
		// the sorted set. `redraw` will take care of that, if needed.
		// Also, we can't use `getLastNode` here, as we've hacked it to return the
		// preceding node instead.
		if (this.sortKey !== undefined) {
			const lastNode = this.getActualLastNode();
			if (lastNode) removeNodes(lastNode, this.getPrecedingNode());
		}

		this.delete();
		this.lastChild = this; // apply the hack (see constructor) again
		
		topRedrawScope = this;
		this.redraw();
		topRedrawScope = undefined;
	}
	
	redraw() {
		// Have the makeSortKey function return an ordering int/string/array.

		// Note that we're NOT subscribing on target[itemIndex], as the OnEachScope uses
		// a wildcard subscription to delete/recreaanyte scopes when that changes.
		// We ARE creating a proxy around the value though (in case its an object/array),
		// so we'll have our own scope subscribe to changes on that.
		const value: DatumType = optProxy((this.parent.target as any)[this.itemIndex]);

		// Since makeSortKey may get() the Store, we'll need to set currentScope first.
		let savedScope = currentScope;
		currentScope = this;
		
		try {
			let sortKey : undefined | string | number;
			if (this.parent.makeSortKey) {
				let rawSortKey = this.parent.makeSortKey(value, this.itemIndex);
				if (rawSortKey != null) sortKey = rawSortKey instanceof Array ? rawSortKey.map(partToStr).join('') : rawSortKey;
			} else {
				sortKey = this.itemIndex;
			}
			
			if (this.sortKey !== sortKey) {
				// If the sortKey is changed, make sure `this` is removed from the
				// set before setting the new sortKey to it.
				this.parent.sortedSet.remove(this); // Very fast if `this` is not in the set
				this.sortKey = sortKey;

				if (sortKey != null) {
					const sortKeyType = this.parent.sortKeyType;
					if (!sortKeyType) this.parent.sortKeyType = typeof sortKey as 'number' | 'string';
					else if (typeof sortKey !== sortKeyType) throw new Error(`Cannot mix sortKeys types ${typeof sortKey} and ${sortKeyType}`);	
				}
			}

			// We're not adding `this` to the `sortedSet` (yet), as that may not be needed,
			// in case no nodes are created. We'll do it just-in-time in `getPrecedingNode`.

			if (sortKey != null) this.parent.renderer(value, this.itemIndex);
		} catch(e) {
			// Assign a default sortKey, so we can insert an error marker
			if (this.sortKey==null) this.sortKey = this.itemIndex;
			handleError(e, true);
		}

		currentScope = savedScope;
	}

	addNode(node: Node) {
		if (this.sortKey == null) internalError(1);
		// Due to the `this` being the first child for `this` hack, this will look
		// for the preceding node as well, if we don't have nodes ourselves.
		let prevNode = findLastNodeInPrevSiblings(this.lastChild);

		const parentEl = this.parent.parentElement;
		parentEl.insertBefore(node, prevNode ? prevNode.nextSibling : parentEl.firstChild);
		this.lastChild = node;
	}

	remove() {
		// We can't use getLastNode here, as we've hacked it to return the preceding
		// node instead.
		if (this.sortKey !== undefined) {
			const lastNode = this.getActualLastNode();
			if (lastNode) removeNodes(lastNode, this.getPrecedingNode());

			this.parent.sortedSet.remove(this);
			this.sortKey = undefined;
		}

		this.delete();
	}

	getParentElement(): Element {
		return this.parent.parentElement;
	}
}


/**
* This global is set during the execution of a `Scope.render`. It is used by
* functions like `$` and `clean`.
*/
const ROOT_SCOPE = new RootScope();
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

/**
 * Indicates that an object is a `ref`, meaning its underlying value may be 
 * an observable.
 */
const REF_SYMBOL = Symbol('ref');

const subscribers = new WeakMap<TargetType, Map<any, Set<Scope | ((index: any, newData: DatumType, oldData: DatumType) => void)>>>;
let peeking = 0; // When > 0, we're not subscribing to any changes

function subscribe(target: any, index: symbol|string|number, observer: Scope | ((index: any, newData: DatumType, oldData: DatumType) => void) = currentScope) {
	if (peeking || observer === ROOT_SCOPE) return;

	let byTarget = subscribers.get(target);
	if (!byTarget) subscribers.set(target, byTarget = new Map());
	let byIndex = byTarget.get(index);
	if (!byIndex) byTarget.set(index, byIndex = new Set());

	if (byIndex.has(observer)) return;

	byIndex.add(observer);
	
	if (observer === currentScope) {
		currentScope.cleaners.push(byIndex);
	} else {
		currentScope.cleaners.push(function() {
			byIndex.delete(observer);
		});
	}
}

export function onEach<T>(target: Array<undefined|T>, render: (value: T, index: number) => void, makeKey?: (value: T, key: any) => SortKeyType): void;
export function onEach<K extends string|number|symbol,T>(target: Record<K,undefined|T>, render: (value: T, index: K) => void, makeKey?: (value: T, key: K) => SortKeyType): void;

export function onEach(target: TargetType, render: (value: DatumType, index: any) => void, makeKey?: (value: DatumType, key: any) => SortKeyType): void {
	if (!target || typeof target !== 'object') throw new Error('onEach requires an object');
	target = (target as any)[TARGET_SYMBOL] || target;

	new OnEachScope(target, render, makeKey);
}

function isObjEmpty(obj: object): boolean {
	for(let k in obj) return false;
	return true;
}

export function isEmpty(proxied: TargetType): boolean {
	const target = (proxied as any)[TARGET_SYMBOL] || proxied;
	const scope = currentScope;

	if (target instanceof Array) {
		subscribe(target, 'length', function(index: any, newData: DatumType, oldData: DatumType) {
			if (!newData !== !oldData) queue(scope);
		});
		return !target.length;
	} else {
		const result = isObjEmpty(target);
		subscribe(target, ANY_SYMBOL, function(index: any, newData: DatumType, oldData: DatumType) {
			if (result ? oldData===undefined : newData===undefined) queue(scope);
		});
		return result;
	}
}

function update(target: TargetType | undefined, index: any, newData: DatumType, oldData: DatumType, merge: boolean) {
	if (newData === oldData) return;
	if (typeof newData === 'object' && newData && typeof oldData === 'object' && oldData && newData.constructor === oldData.constructor) {
		if (newData instanceof Array) {
			let oldLength = oldData.length;
			for(let i=0; i<newData.length; i++) {
				update(oldData, i, newData[i], (oldData as any[])[i], merge);
			}
			// For arrays, merge equals set (as overwriting a partial array rarely makes sense).
			// As `oldData` is not the proxy, we must emit this ourselves.
			for(let i=newData.length; i<oldLength; i++) {
				emit(oldData, i, undefined, (oldData as any[])[i])
			}
			(oldData as any[]).length = newData.length;
			emit(oldData, 'length', newData.length, oldLength);
		} else {
			for(const k in newData) {
				update(oldData, k, newData[k], (oldData as any)[k], merge);
			}
			if (!merge) { // Delete removed keys
				for(const k in oldData) {
					if (!(k in newData)) {
						const oldVal = (oldData as any)[k];
						(oldData as any)[k] = undefined;
						emit(oldData, k, undefined, oldVal);
					}
				}
			}
		}
	} else {
		if (!target) throw new Error("Cannot change top-level proxy type");
		if (target instanceof Array) {
			let oldLength = target.length;
			target[index] = optProxy(newData);
			if (target.length !== oldLength) {
				emit(target, 'length', target.length, oldLength);
			}
		} else {
			(target as any)[index] = optProxy(newData);			
		}
		emit(target, index, newData, oldData);
	}
}

//* @internal */
export function defaultEmitHandler(target: TargetType, index: string|symbol|number, newData: DatumType, oldData: DatumType) {
	// We're triggering for values changing from undefined to undefined, as this *may*
	// indicate a change from or to `[empty]` (such as `[,1][0]`).
	if (newData === oldData && newData !== undefined) return;
	
	const byTarget = subscribers.get(target);
	if (byTarget===undefined) return;

	for(const what of [index, ANY_SYMBOL]) {
		let byIndex = byTarget.get(what);
		if (byIndex) {
			for(let observer of byIndex) {
				if (typeof observer === 'function') observer(index, newData, oldData);
				else observer.onChange(index, newData, oldData)	
			}
		}
	}
}
let emit = defaultEmitHandler;


const objectHandler: ProxyHandler<any> = {
	get(target: any, prop: any) {
		if (prop===TARGET_SYMBOL) return target;
		subscribe(target, prop);
		return optProxy(target[prop]);
	},
	set(target: any, prop: any, value: any) {
		update(target, prop, value, target[prop], false);
		runImmediateQueue();
		return true;
	},
	deleteProperty(target: any, prop: any) {
		const old = target[prop];
		delete target[prop];
		emit(target, prop, undefined, old);
		runImmediateQueue();
		return true;
	},
	has(target: any, prop: any) {
		const result = prop in target;
		subscribe(target, prop);
		return result;
	},
};

function arraySet(target: any, prop: any, value: any) {
	if (prop === 'length') {
		// We only need to emit for shrinking, as growing just adds undefineds
		for(let i=value; i<target.length; i++) {
			emit(target, i, undefined, target[i]);
		}
	}
	const intProp = parseInt(prop)
	if (intProp.toString() === prop) prop = intProp;
	update(target, prop, value, target[prop], false);
	runImmediateQueue();
	return true;
}

const arrayHandler: ProxyHandler<any[]> = {
	get(target: any, prop: any) {
		if (prop===TARGET_SYMBOL) return target;
		let subProp = prop;
		if (typeof prop !== 'symbol') {
			const intProp = parseInt(prop);
			if (intProp.toString() === prop) subProp = intProp;
		}
		subscribe(target, subProp);
		return optProxy(target[prop]);
	},
	set: arraySet,
	deleteProperty(target: any, prop: string|symbol) {
		return arraySet(target, prop, undefined);
	}
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

export function proxy<T extends DatumType>(array: Array<T>): Array<T extends number ? number : T extends string ? string : T extends boolean ? boolean : T>;
export function proxy<T extends object>(obj: T): T;
export function proxy<T extends DatumType>(value: T): {value: T extends number ? number : T extends string ? string : T extends boolean ? boolean : T};

export function proxy(target: TargetType): TargetType {
	return optProxy(typeof target === 'object' && target !== null ? target : {value: target});
}

export function isProxied(target: TargetType): boolean {
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
export function get<T extends object, K1 extends keyof T>(target: T, k1: K1): T[K1] | undefined;
export function get<T extends object, K1 extends keyof T, K2 extends keyof T[K1]>(target: T, k1: K1, k2: K2): T[K1][K2] | undefined;
export function get<T extends object, K1 extends keyof T, K2 extends keyof T[K1], K3 extends keyof T[K1][K2]>(target: T, k1: K1, k2: K2, k3: K3): T[K1][K2][K3] | undefined;

export function get(target: TargetType, ...indices: any[]): DatumType | undefined {
	// We'll work on the proxied object, subscribing to reads
	let node: any = target;
	for(let index of indices) {
		if (node==null) return;
		if (typeof node !== 'object') throw new Error(`Attempting to index primitive type ${node} with ${index}`);
		node = node[index];
	}
	return node;
}


export function set<T extends object>(target: T, value: T): void;
export function set<T extends object, K1 extends keyof T>(target: T, k1: K1, value: T[K1]): void;
export function set<T extends object, K1 extends keyof T, K2 extends keyof T[K1]>(target: T, k1: K1, k2: K2, value: T[K1][K2]): void;
export function set<T extends object, K1 extends keyof T, K2 extends keyof T[K1], K3 extends keyof T[K1][K2]>(target: T, k1: K1, k2: K2, k3: K3, value: T[K1][K2][K3]): void;

export function set(target: TargetType, ...indicesAndValue: any[]): void {
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
	runImmediateQueue();
}


export function merge<T extends object>(target: T, value: T): void;
export function merge<T extends object, K1 extends keyof T>(target: T, k1: K1, value: T[K1]): void;
export function merge<T extends object, K1 extends keyof T, K2 extends keyof T[K1]>(target: T, k1: K1, k2: K2, value: T[K1][K2]): void;
export function merge<T extends object, K1 extends keyof T, K2 extends keyof T[K1], K3 extends keyof T[K1][K2]>(target: T, k1: K1, k2: K2, k3: K3, value: T[K1][K2][K3]): void;

export function merge(target: TargetType, ...indicesAndValue: any[]): void {
	mergeSet(target, indicesAndValue, true)
}


interface RefTarget {
	proxy: TargetType
	index: any
}
const refHandler: ProxyHandler<RefTarget> = {
	get(target: RefTarget, prop: any) {
		if (prop===REF_SYMBOL) return true;
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

export function ref(proxy: TargetType, index: any) {
	return new Proxy({proxy, index}, refHandler);
}


function applyBind(_el: Element, target: any) {
	const el = _el as HTMLInputElement;
	let onProxyChange: (value: any) => void;
	let onInputChange: () => void;
	let type = el.getAttribute('type');
	let value = peek(target, 'value');
	if (type === 'checkbox') {
		if (value === undefined) target.value = el.checked;
		onProxyChange = value => el.checked = value;
		onInputChange = () => target.value = el.checked;
	} else if (type === 'radio') {
		if (value === undefined && el.checked) target.value = el.value;
		onProxyChange = value => el.checked = (value === el.value);
		onInputChange = () => {
			if (el.checked) target.value = el.value;
		}
	} else {
		onInputChange = () => target.value = type==='number' || type==='range' ? (el.value==='' ? null : +el.value) : el.value;
		if (value === undefined) onInputChange();
		onProxyChange = value => {
			if (el.value !== value) el.value = value;
		}
	}
	observe(() => {
		onProxyChange(target.value);
	});
	el.addEventListener('input', onInputChange);
	clean(() => {
		el.removeEventListener('input', onInputChange);
	});
}

const SPECIAL_PROPS: {[key: string]: (value: any) => void} = {
	create: function(value: any) {
		const el = currentScope.getParentElement();
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
	destroy: function(value: any) {
		const el = currentScope.getParentElement();
		onDestroyMap.set(el, value);
	},
	html: function(value: any) {
		let tmpParent = document.createElement(currentScope.getParentElement().tagName);
		tmpParent.innerHTML = ''+value;
		while(tmpParent.firstChild) currentScope.addNode(tmpParent.firstChild);
	},
	text: function(value: any) {
		currentScope.addNode(document.createTextNode(value));
	},
	element: function(value: any) {
		if (!(value instanceof Node)) throw new Error(`Unexpected element-argument: ${JSON.parse(value)}`);
		currentScope.addNode(value);
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

type DollarArg = string | null | undefined | false | Record<string,any>;
// When only a function is passed in, $ will return a proxied reference of its observed return value.
export function $<T>(func: () => T): {value: T};
export function $<T>(...args: DollarArg[]): void;
// Only the last argument can be a function.
export function $<T>(...args: [...DollarArg[], (() => void)]): void;

export function $(...args: any) {

	if (args.length === 1 && typeof args[0] === 'function') {
		return (new ResultScope(currentScope.getParentElement(), args[0])).result;
	}

	let savedScope = currentScope;

	for(let arg of args) {
		if (arg == null || arg === false) continue;
		if (typeof arg === 'string') {
			let text, classes;
			const textPos = arg.indexOf(':');
			if (textPos >= 0) {
				text = arg.substring(textPos+1);
				if (textPos === 0) { // Just a string to add as text, no new node
					currentScope.addNode(document.createTextNode(text));
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
			currentScope.addNode(el);
			currentScope = new ChainedScope(el);
			currentScope.lastChild = el.lastChild;
			// Extend topRedrawScope one level deep, so it works for $('div', {create: true})`.
			if (savedScope === topRedrawScope) topRedrawScope = currentScope;
		}
		else if (typeof arg === 'object') {
			if (arg.constructor !== Object) throw new Error(`Unexpected argument: ${arg}`);
			for(const key in arg) {
				const val = arg[key];
				applyArg(key, val);
			}
		} else if (typeof arg === 'function' && arg === args[args.length-1]) {
			new RegularScope(currentScope.getParentElement(), arg);
		} else {
			currentScope = savedScope;
			throw new Error(`Unexpected argument: ${arg}`);
		}
	}
	
	currentScope = savedScope;
}


function applyArg(key: string, value: any) {
	const el = currentScope.getParentElement();
	if (typeof value === 'object' && value !== null && (value[TARGET_SYMBOL] || value[REF_SYMBOL])) { // Value is a proxy
		if (key === 'bind') {
			applyBind(el, value)
		} else {
			new SetArgScope(el, key, value)
			// SetArgScope will (repeatedly) call `applyArg` again with the actual value
		}
	} else if (key[0] === '.') { // CSS class(es)
		const classes = key.substring(1).split('.');
		if (value) el.classList.add(...classes);
		else el.classList.remove(...classes);
	} else if (key[0] === '$') { // Style
		const name = key.substring(1);
		if (value==null || value===false) (el as any).style[name] = ''
		else (el as any).style[name] = ''+value;
	} else if (value == null) { // Value left empty
		// Do nothing
	} else if (key in SPECIAL_PROPS) { // Special property
		SPECIAL_PROPS[key](value);
	} else if (typeof value === 'function') { // Event listener
		el.addEventListener(key, value);
		clean(() => el.removeEventListener(key, value));
	} else if (value===true || value===false || key==='value' || key==='selectedIndex') { // DOM property
		(el as any)[key] = value;
	} else { // HTML attribute
		el.setAttribute(key, value);
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
export function setErrorHandler(handler?: (error: Error) => boolean | undefined) {
	onError = handler || defaultOnError;
}


/**
* Return the browser Element that nodes would be rendered to at this point.
* NOTE: Manually changing the DOM is not recommended in most cases. There is
* usually a better, declarative way. Although there are no hard guarantees on
* how your changes interact with Aberdeen, in most cases results will not be
* terribly surprising. Be careful within the parent element of onEach() though.
*/
export function getParentElement(): Element {
	return currentScope.getParentElement();
}


/**
* Register a function that is to be executed right before the current reactive scope
* disappears or redraws.
* @param cleaner - The function to be executed.
*/
export function clean(cleaner: () => void) {
	currentScope.cleaners.push(cleaner);
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
export function observe(func: () => void) {
	new RegularScope(currentScope.getParentElement(), func);
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
export function immediateObserve(func: () => void) {
	new ImmediateScope(currentScope.getParentElement(), func);
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

export function mount(parentElement: Element, func: () => void) {
	new MountScope(parentElement, func);
}

/**
 * Stop all observe scopes and remove any created DOM nodes.
 */
export function unmountAll() {
	ROOT_SCOPE.remove();
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
export function peek<T extends object>(target: T): T;
export function peek<T extends object, K1 extends keyof T>(target: T, k1: K1): T[K1];
export function peek<T extends object, K1 extends keyof T, K2 extends keyof T[K1]>(target: T, k1: K1, k2: K2): T[K1][K2];
export function peek<T extends object, K1 extends keyof T, K2 extends keyof T[K1], K3 extends keyof T[K1][K2]>(target: T, k1: K1, k2: K2, k3: K3): T[K1][K2][K3];

export function peek(data: TargetType, ...indices: any[]): DatumType | undefined {
	peeking++;
	try {
		if (indices.length===0) {
			if (typeof data === 'function') return data();
			// Return a copy that is (shallowly) unproxied
			return data instanceof Array ? data.slice(0) : {...data};
		}
		for(let index of indices) {
			if (data==null) return;
			if (typeof data !== 'object') throw new Error(`Attempting to index primitive type ${data} with ${index}`);
			data = (data as any)[index];
		}
		return data;
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
 * @param thisArg - An optional object that is passed as `this` to `func`.
 *
 * @returns - A proxied array or object (matching `target`) with the values returned by `func`
 * and the corresponding keys from the original map or array.
 *
 */
export function map<IN,OUT>(target: Array<IN>, func: (value: IN, index: number) => undefined|OUT, thisArg?: object): Array<OUT>;
export function map<IN,OUT>(target: Record<string|symbol,IN>, func: (value: IN, index: string|symbol) => undefined|OUT, thisArg?: object): Record<string|symbol,OUT>;

export function map(proxied: any, func: (value: DatumType, key: any) => any, thisArg?: object): any {
	let out = optProxy(proxied instanceof Array ? [] : {});
	onEach(proxied, (item: DatumType, key: symbol|string|number) => {
		let value = func.call(thisArg, item, key);
		if (value !== undefined) {
			out[key] = value;
			clean(() => {
				delete out[key];
			})
		}
	})
	return out
}


/**
 * Applies a filter/map function on each item within the proxied array/objecty,
 * each of which can deliver any number of key/value pairs, and reactively manages the
 * returned proxied object to hold any results.
 *
 * @param func - Function that transform the given store into output values
 * that can take one of the following forms:
 * - an object: Each key/value pair will be added to the output object.
 * - `undefined`: No key/value pairs are added to the output object.
 *
 * @returns - A proxied object with the key/value pairs returned by all `func` invocations.
 *
 * When items disappear from the input proxy or are changed in a way that `func` depends
 * upon, the resulting items are removed from the output proxy as well. When multiple
 * input items produce the same output keys, the results for those keys are undefined.
 */

export function multiMap<IN,OUT extends {[key: string|symbol]: DatumType}>(target: Array<IN>, func: (value: IN, index: number) => OUT | undefined, thisArg?: object): OUT;
export function multiMap<K extends string|number|symbol,IN,OUT extends {[key: string|symbol]: DatumType}>(target: Record<K,IN>, func: (value: IN, index: K) => OUT | undefined, thisArg?: object): OUT;

export function multiMap(proxied: any, func: (value: DatumType, key: any) => Record<string|symbol,DatumType>, thisArg?: object): any {
	let out = optProxy({});
	onEach(proxied, (item: DatumType, key: symbol|string|number) => {
		let pairs = func.call(thisArg, item, key);
		if (pairs) {
			for(let key in pairs) out[key] = pairs[key];
			clean(() => {
				for(let key in pairs) delete out[key];
			})
		}
	})
	return out
}

/**
* Dump a live view of the proxied array/object and its descendends as HTML text,
* `ul` and `li` nodes at the current mount position. Meant for debugging purposes.
* @returns The array/object itself, for chaining other methods.
*/
export function dump<T>(proxied: T): T {
	if (proxied && typeof proxied === 'object') {
		$({text: proxied instanceof Array ? "<array>" : "<object>"});
		$('ul', () => {
			onEach(proxied as any, (value, key) => {
				$('li:'+JSON.stringify(key)+": ", () => {
					dump(value)
				})
			})
		})
	} else {
		$({text: JSON.stringify(proxied)})
	}
	return proxied
}

/*
* Helper functions
*/

/* c8 ignore start */
function internalError(code: number): never {
	throw new Error("Aberdeen internal error "+code);
}
/* c8 ignore end */

function handleError(e: any, showMessage: boolean) {
	try {
		if (onError(e) === false) showMessage = false;
	} catch {}
	try {
		if (showMessage && currentScope.getParentElement()) $('.aberdeen-error:Error');
	} catch {
		// Error while adding the error marker to the DOM. Apparently, we're in
		// an awkward context. The error should already have been logged by
		// onError, so let's not confuse things by generating more errors.
	}
}

/** @internal */
export function withEmitHandler(handler: (target: TargetType, index: any, newData: DatumType, oldData: DatumType) => void, func: ()=>void) {
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

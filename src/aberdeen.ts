import { ReverseSortedSet } from "./helpers/reverseSortedSet.js";
import type { ReverseSortedSetPointer } from "./helpers/reverseSortedSet.js";

/*
 * QueueRunner
 *
 * `queue()`d runners are executed on the next timer tick, by order of their
 * `prio` values.
 */
interface QueueRunner {
	prio: number; // Higher values have higher priority
	queueRun(): void;

	[ptr: ReverseSortedSetPointer]: QueueRunner;
}

let sortedQueue: ReverseSortedSet<QueueRunner, "prio"> | undefined; // When set, a runQueue is scheduled or currently running.
let runQueueDepth = 0; // Incremented when a queue event causes another queue event to be added. Reset when queue is empty. Throw when >= 42 to break (infinite) recursion.
let topRedrawScope: Scope | undefined; // The scope that triggered the current redraw. Elements drawn at this scope level may trigger 'create' animations.

/** @internal */
export type TargetType = any[] | { [key: string]: any };
/** @internal */
export type DatumType =
	| TargetType
	| boolean
	| number
	| string
	| null
	| undefined;

function queue(runner: QueueRunner) {
	if (!sortedQueue) {
		sortedQueue = new ReverseSortedSet<QueueRunner, "prio">("prio");
		setTimeout(runQueue, 0);
	} else if (!(runQueueDepth & 1)) {
		runQueueDepth++; // Make it uneven
		if (runQueueDepth > 98) {
			throw new Error("Too many recursive updates from observes");
		}
	}
	sortedQueue.add(runner);
}

/**
 * Forces the immediate and synchronous execution of all pending reactive updates.
 *
 * Normally, changes to observed data sources (like proxied objects or arrays)
 * are processed asynchronously in a batch after a brief timeout (0ms). This function
 * allows you to bypass the timeout and process the update queue immediately.
 *
 * This can be useful in specific scenarios where you need the DOM to be updated
 * synchronously.
 *
 * This function is re-entrant, meaning it is safe to call `runQueue` from within
 * a function that is itself being executed as part of an update cycle triggered
 * by a previous (or the same) `runQueue` call.
 *
 * @example
 * ```typescript
 * const data = proxy("before");
 *
 * $({text: data});
 * console.log(1, document.body.innerHTML); // before
 *
 * // Make an update that should cause the DOM to change.
 * data.value = "after";
 *
 * // Normally, the DOM update would happen after a timeout.
 * // But this causes an immediate update:
 * runQueue();
 *
 * console.log(2, document.body.innerHTML); // after
 * ```
 */
export function runQueue(): void {
	let time = Date.now();
	while (sortedQueue) {
		const runner = sortedQueue.fetchLast();
		if (!runner) break;
		if (runQueueDepth & 1) runQueueDepth++; // Make it even
		runner.queueRun();
	}
	sortedQueue = undefined;
	runQueueDepth = 0;
	time = Date.now() - time;
	if (time > 9) console.debug(`Aberdeen queue took ${time}ms`);
}

/**
 * A sort key, as used by {@link onEach}, is a value that determines the order of items. It can
 * be a number, string, or an array of numbers/strings. The sort key is used to sort items
 * based on their values. The sort key can also be `undefined`, which indicates that the item
 * should be ignored.
 * @internal
 */
export type SortKeyType = number | string | Array<number | string> | undefined;

/**
 * Given an integer number or a string, this function returns a string that can be concatenated
 * with other strings to create a composed sort key, that follows natural number ordering.
 */
function partToStr(part: number | string): string {
	if (typeof part === "string") {
		return `${part}\x01`; // end-of-string
	}
	let result = "";
	let num = Math.abs(Math.round(part));
	const negative = part < 0;
	while (num > 0) {
		/*
		 * We're reserving a few character codes:
		 * 0 - for compatibility
		 * 1 - separator between string array items
		 * 65535 - for compatibility
		 */
		result = String.fromCharCode(
			negative ? 65534 - (num % 65533) : 2 + (num % 65533),
		) + result;
		num = Math.floor(num / 65533);
	}
	// Prefix the number of digits, counting down from 128 for negative and up for positive
	return (
		String.fromCharCode(128 + (negative ? -result.length : result.length)) +
		result
	);
}

/**
 * Creates a new string that has the opposite sort order compared to the input string.
 *
 * This is achieved by flipping the bits of each character code in the input string.
 * The resulting string is intended for use as a sort key, particularly with the
 * `makeKey` function in {@link onEach}, to achieve a descending sort order.
 *
 * **Warning:** The output string will likely contain non-printable characters or
 * appear as gibberish and should not be displayed to the user.
 *
 * @example
 * ```typescript
 * const users = proxy([
 *     { id: 1, name: 'Charlie', score: 95 },
 *     { id: 2, name: 'Alice', score: 100 },
 *     { id: 3, name: 'Bob', score: 90 },
 * ]);
 *
 * onEach(users, (user) => {
 *     $(`p:${user.name}: ${user.score}`);
 * }, (user) => invertString(user.name)); // Reverse alphabetic order
 * ```
 *
 * @param input The string whose sort order needs to be inverted.
 * @returns A new string that will sort in the reverse order of the input string.
 * @see {@link onEach} for usage with sorting.
 */
export function invertString(input: string): string {
	let result = "";
	for (let i = 0; i < input.length; i++) {
		result += String.fromCodePoint(65535 - input.charCodeAt(i));
	}
	return result;
}

// Each new scope gets a lower prio than all scopes before it, by decrementing
// this counter.
let lastPrio = 0;

abstract class Scope implements QueueRunner {
	// Scopes are to be handled in creation order. This will make sure that parents are
	// handled before their children (as they should), and observes are executed in the
	// order of the source code.
	prio: number = --lastPrio;

	[ptr: ReverseSortedSetPointer]: this;

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
	cleaners: Array<{ delete: (scope: Scope) => void } | (() => void)>;

	// Whether this scope is within an SVG namespace context
	inSvgNamespace: boolean = false;

	constructor(
		cleaners: Array<{ delete: (scope: Scope) => void } | (() => void)> = [],
	) {
		super();
		this.cleaners = cleaners;
	}

	lastChild: Node | Scope | undefined;

	// Should be subclassed in most cases..
	redraw() {}

	abstract parentElement: Element;

	getLastNode(): Node | undefined {
		return findLastNodeInPrevSiblings(this.lastChild);
	}

	/**
	 * Call cleaners and make sure the scope is not queued.
	 * It is called `delete`, so that the list of cleaners can also contain `Set`s.
	 */
	delete(/* ignore observer argument */) {
		for (const cleaner of this.cleaners) {
			if (typeof cleaner === "function") cleaner();
			else cleaner.delete(this); // pass in observer argument, in case `cleaner` is a `Set`
		}
		this.cleaners.length = 0;
		sortedQueue?.remove(this); // This is very fast and O(1) when not queued

		// To prepare for a redraw or to help GC when we're being removed:
		this.lastChild = undefined;
	}

	queueRun() {
		this.remove();

		topRedrawScope = this;
		this.redraw();
		topRedrawScope = undefined;
	}

	getInsertAfterNode() {
		return this.getLastNode() || this.getPrecedingNode();
	}

	onChange(index: any, newData: DatumType, oldData: DatumType) {
		queue(this);
	}

	getChildPrevSibling() {
		return this.lastChild;
	}
}

class ChainedScope extends ContentScope {
	// The node or scope right before this scope that has the same `parentElement`.
	public prevSibling: Node | Scope | undefined;

	constructor(
		// The parent DOM element we'll add our child nodes to.
		public parentElement: Element,
		// When true, we share our 'cleaners' list with the parent scope.
		useParentCleaners = false,
	) {
		super(useParentCleaners ? currentScope.cleaners : []);
		
		// Inherit SVG namespace state from current scope
		this.inSvgNamespace = currentScope.inSvgNamespace;
		
		if (parentElement === currentScope.parentElement) {
			// If `currentScope` is not actually a ChainedScope, prevSibling will be undefined, as intended
			this.prevSibling = currentScope.getChildPrevSibling();
			currentScope.lastChild = this;
		}

		// We're always adding ourselve as a cleaner, in order to run our own cleaners
		// and to remove ourselve from the queue (if we happen to be in there).
		if (!useParentCleaners) currentScope.cleaners.push(this);
	}

	getPrecedingNode(): Node | undefined {
		return findLastNodeInPrevSiblings(this.prevSibling);
	}

	getChildPrevSibling() {
		return this.lastChild || this.prevSibling;
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
		const savedScope = currentScope;
		currentScope = this;
		try {
			this.renderer();
		} catch (e) {
			// Throw the error async, so the rest of the rendering can continue
			handleError(e, true);
		}
		currentScope = savedScope;
	}
}

class RootScope extends ContentScope {
	parentElement = document.body;
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
		
		// Inherit SVG namespace state from current scope
		this.inSvgNamespace = currentScope.inSvgNamespace;
		
		this.redraw();
		currentScope.cleaners.push(this);
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
function removeNodes(
	node: Node | null | undefined,
	preNode: Node | null | undefined,
) {
	while (node && node !== preNode) {
		const prevNode: Node | null = node.previousSibling;
		const onDestroy = onDestroyMap.get(node);
		if (onDestroy && node instanceof Element) {
			if (onDestroy !== true) {
				if (typeof onDestroy === "function") {
					onDestroy(node);
				} else {
					destroyWithClass(node, onDestroy);
				}
				// This causes the element to be ignored from this function from now on:
				onDestroyMap.set(node, true);
			}
			// Ignore the deleting element
		} else {
			(node as Element | Text).remove();
		}
		node = prevNode;
	}
}

// Get a reference to the last node within `sibling` or any of its preceding siblings.
// If a `Node` is given, that node is returned.
function findLastNodeInPrevSiblings(
	sibling: Node | Scope | undefined,
): Node | undefined {
	if (!sibling || sibling instanceof Node) return sibling;
	return sibling.getLastNode() || sibling.getPrecedingNode();
}

class ResultScope<T> extends ChainedScope {
	public result: ValueRef<T> = optProxy({ value: undefined });

	constructor(
		parentElement: Element,
		public renderer: () => T,
	) {
		super(parentElement);

		this.redraw();
	}

	redraw() {
		const savedScope = currentScope;
		currentScope = this;
		try {
			this.result.value = this.renderer();
		} catch (e) {
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
		public target: { value: DatumType },
	) {
		super(parentElement);
		this.redraw();
	}
	redraw() {
		const savedScope = currentScope;
		currentScope = this;
		applyArg(this.key, this.target.value);
		currentScope = savedScope;
	}
}

let immediateQueue: ReverseSortedSet<Scope, "prio"> = new ReverseSortedSet(
	"prio",
);

class ImmediateScope extends RegularScope {
	onChange(index: any, newData: DatumType, oldData: DatumType) {
		immediateQueue.add(this);
	}
}

let immediateQueueRunning = false;
function runImmediateQueue() {
	for (
		let count = 0;
		!immediateQueue.isEmpty() && !immediateQueueRunning;
		count++
	) {
		if (count > 42) {
			immediateQueue.clear();
			throw new Error("Too many immediate-mode recursive updates");
		}
		immediateQueueRunning = true;
		const copy = immediateQueue;
		immediateQueue = new ReverseSortedSet("prio");
		try {
			for (const scope of copy) {
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
	// biome-ignore lint/correctness/noInvalidUseBeforeDeclaration: circular, as currentScope is initialized with a Scope
	parentElement: Element = currentScope.parentElement;
	prevSibling: Node | Scope | undefined;

	/** The data structure we are iterating */
	target: TargetType;

	/** All item scopes, by array index or object key. This is used for removing an item scope when its value
	 * disappears, and calling all subscope cleaners. */
	byIndex: Map<any, OnEachItemScope> = new Map();

	/** The reverse-ordered list of item scopes, not including those for which makeSortKey returned undefined. */
	sortedSet: ReverseSortedSet<OnEachItemScope, "sortKey"> =
		new ReverseSortedSet("sortKey");

	/** Indexes that have been created/removed and need to be handled in the next `queueRun`. */
	changedIndexes: Set<any> = new Set();

	constructor(
		proxy: TargetType,
		/** A function that renders an item */
		public renderer: (value: DatumType, key: any) => void,
		/** A function returning a number/string/array that defines the position of an item */
		public makeSortKey?: (value: DatumType, key: any) => SortKeyType,
	) {
		super();
		const target: TargetType = (this.target =
			(proxy as any)[TARGET_SYMBOL] || proxy);

		subscribe(target, ANY_SYMBOL, this);
		this.prevSibling = currentScope.getChildPrevSibling();
		currentScope.lastChild = this;

		currentScope.cleaners.push(this);

		// Do _addChild() calls for initial items
		if (target instanceof Array) {
			for (let i = 0; i < target.length; i++) {
				if (target[i] !== undefined) {
					new OnEachItemScope(this, i, false);
				}
			}
		} else {
			for (const key in target) {
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
		if (!(this.target instanceof Array) || typeof index === "number")
			this.changedIndexes.add(index);
		queue(this);
	}

	queueRun() {
		const indexes = this.changedIndexes;
		this.changedIndexes = new Set();
		for (const index of indexes) {
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

		sortedQueue?.remove(this); // This is very fast and O(1) when not queued

		// Help garbage collection:
		this.byIndex.clear();
		setTimeout(() => {
			// Unsure if this is a good idea. It takes time, but presumably makes things a lot easier for GC...
			this.sortedSet.clear();
		}, 1);
	}

	getLastNode(): Node | undefined {
		for (const scope of this.sortedSet) {
			// Iterates starting at last child scope.
			const node = scope.getActualLastNode();
			if (node) return node;
		}
	}
}

/** @internal */
class OnEachItemScope extends ContentScope {
	sortKey: string | number | undefined; // When undefined, this scope is currently not showing in the list
	public parentElement: Element;

	constructor(
		public parent: OnEachScope,
		public itemIndex: any,
		topRedraw: boolean,
	) {
		super();
		this.parentElement = parent.parentElement;
		
		// Inherit SVG namespace state from current scope
		this.inSvgNamespace = currentScope.inSvgNamespace;

		this.parent.byIndex.set(this.itemIndex, this);

		// Okay, this is hacky. In case our first (actual) child is a ChainedScope, we won't be able
		// to provide it with a reliable prevSibling. Therefore, we'll pretend to be that sibling,
		// doing what's need for this case in `getLastNode`.
		// For performance, we prefer not having to create additional 'fake sibling' objects for each item.
		this.lastChild = this;

		// Don't register to be cleaned by parent scope, as the OnEachScope will manage this for us (for efficiency)

		if (topRedraw) topRedrawScope = this;
		this.redraw();
	}

	getPrecedingNode(): Node | undefined {
		// As apparently we're interested in the node insert position, we'll need to become part
		// of the sortedSet now (if we weren't already).
		// This will do nothing and barely take any time of `this` is already part of the set:
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

		while (child && child !== this) {
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
		// a wildcard subscription to delete/recreate any scopes when that changes.
		// We ARE creating a proxy around the value though (in case its an object/array),
		// so we'll have our own scope subscribe to changes on that.
		const value: DatumType = optProxy(
			(this.parent.target as any)[this.itemIndex],
		);

		// Since makeSortKey may get() the Store, we'll need to set currentScope first.
		const savedScope = currentScope;
		currentScope = this;

		let sortKey: undefined | string | number;
		try {
			if (this.parent.makeSortKey) {
				const rawSortKey = this.parent.makeSortKey(value, this.itemIndex);
				if (rawSortKey != null)
					sortKey =
						rawSortKey instanceof Array
							? rawSortKey.map(partToStr).join("")
							: rawSortKey;
			} else {
				sortKey = this.itemIndex;
			}
			if (typeof sortKey === "number") sortKey = partToStr(sortKey);

			if (this.sortKey !== sortKey) {
				// If the sortKey is changed, make sure `this` is removed from the
				// set before setting the new sortKey to it.
				this.parent.sortedSet.remove(this); // Very fast if `this` is not in the set
				this.sortKey = sortKey;
			}

			// We're not adding `this` to the `sortedSet` (yet), as that may not be needed,
			// in case no nodes are created. We'll do it just-in-time in `getPrecedingNode`.

			if (sortKey != null) this.parent.renderer(value, this.itemIndex);
		} catch (e) {
			handleError(e, sortKey != null);
		}

		currentScope = savedScope;
	}

	getInsertAfterNode() {
		if (this.sortKey == null) internalError(1);
		// Due to the `this` being the first child for `this` hack, this will look
		// for the preceding node as well, if we don't have nodes ourselves.
		return findLastNodeInPrevSiblings(this.lastChild);
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
}

function addNode(node: Node) {
	const parentEl = currentScope.parentElement;
	const prevNode = currentScope.getInsertAfterNode();
	parentEl.insertBefore(
		node,
		prevNode ? prevNode.nextSibling : parentEl.firstChild,
	);
	currentScope.lastChild = node;
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
const ANY_SYMBOL = Symbol("any");

/**
 * When our proxy objects need to lookup `obj[TARGET_SYMBOL]` it returns its
 * target, to be used in our wrapped methods.
 */
const TARGET_SYMBOL = Symbol("target");

const subscribers = new WeakMap<
	TargetType,
	Map<
		any,
		Set<Scope | ((index: any, newData: DatumType, oldData: DatumType) => void)>
	>
>();
let peeking = 0; // When > 0, we're not subscribing to any changes

function subscribe(
	target: any,
	index: symbol | string | number,
	observer:
		| Scope
		| ((
				index: any,
				newData: DatumType,
				oldData: DatumType,
		  ) => void) = currentScope,
) {
	if (observer === ROOT_SCOPE || peeking) return;

	let byTarget = subscribers.get(target);
	if (!byTarget) subscribers.set(target, (byTarget = new Map()));

	// No need to subscribe to specific keys if we're already subscribed to ANY
	if (index !== ANY_SYMBOL && byTarget.get(ANY_SYMBOL)?.has(observer)) return;

	let byIndex = byTarget.get(index);
	if (!byIndex) byTarget.set(index, (byIndex = new Set()));

	if (byIndex.has(observer)) return;

	byIndex.add(observer);

	if (observer === currentScope) {
		currentScope.cleaners.push(byIndex);
	} else {
		currentScope.cleaners.push(() => {
			byIndex.delete(observer);
		});
	}
}

// Records in TypeScript pretend that they can have number keys, but in reality they are converted to string.
// This type changes (number | something) types to (string | something) types, maintaining typing precision as much as possible.
type KeyToString<K> = K extends number ? string : K extends string | symbol ? K : K extends number | infer U ? string | U : K;

export function onEach<T>(
	target: ReadonlyArray<undefined | T>,
	render: (value: T, index: number) => void,
	makeKey?: (value: T, index: number) => SortKeyType,
): void;
export function onEach<K extends string | number | symbol, T>(
	target: Record<K, undefined | T>,
	render: (value: T, index: KeyToString<K>) => void,
	makeKey?: (value: T, index: KeyToString<K>) => SortKeyType,
): void;

/**
 * Reactively iterates over the items of an observable array or object, optionally rendering content for each item.
 *
 * Automatically updates when items are added, removed, or modified.
 *
 * @param target The observable array or object to iterate over. Values that are `undefined` are skipped.
 * @param render A function called for each item in the array. It receives the item's (observable) value and its index/key. Any DOM elements created within this function will be associated with the item, placed at the right spot in the DOM, and cleaned up when redrawing/removing the item.
 * @param makeKey An optional function to generate a sort key for each item. This controls the order in which items are rendered in the DOM. If omitted, items are rendered in array index order. The returned key can be a number, string, or an array of numbers/strings for composite sorting. Use {@link invertString} on string keys for descending order. Returning `null` or `undefined` from `makeKey` will prevent the item from being rendered.
 *
 * @example Iterating an array
 * ```typescript
 * const items = proxy(['apple', 'banana', 'cherry']);
 *
 * // Basic iteration
 * onEach(items, (item, index) => $(`li:${item} (#${index})`));
 *
 * // Add a new item - the list updates automatically
 * setTimeout(() => items.push('durian'), 2000);
 * // Same for updates and deletes
 * setTimeout(() => items[1] = 'berry', 4000);
 * setTimeout(() => delete items[2], 6000);
 * ```
 *
 * @example Iterating an array with custom ordering
 * ```typescript
 * const users = proxy([
 *     { id: 3, group: 1, name: 'Charlie' },
 *     { id: 1, group: 1, name: 'Alice' },
 *     { id: 2, group: 2, name: 'Bob' },
 * ]);
 *
 * // Sort by name alphabetically
 * onEach(users, (user) => {
 *     $(`p:${user.name} (id=${user.id})`);
 * }, (user) => [user.group, user.name]); // Sort by group, and within each group sort by name
 * ```
 *
 *  @example Iterating an object
 * ```javascript
 * const config = proxy({ theme: 'dark', fontSize: 14, showTips: true });
 *
 * // Display configuration options
 * $('dl', () => {
 *     onEach(config, (value, key) => {
 *         if (key === 'showTips') return; // Don't render this one
 *         $('dt:'+key);
 *         $('dd:'+value);
 *     });
 * });
 *
 * // Change a value - the display updates automatically
 * setTimeout(() => config.fontSize = 16, 2000);
 * ```
 * @see {@link invertString} To easily create keys for reverse sorting.
 */
export function onEach(
	target: TargetType,
	render: (value: DatumType, index: any) => void,
	makeKey?: (value: DatumType, key: any) => SortKeyType,
): void {
	if (!target || typeof target !== "object")
		throw new Error("onEach requires an object");
	target = (target as any)[TARGET_SYMBOL] || target;

	new OnEachScope(target, render, makeKey);
}

function isObjEmpty(obj: object): boolean {
	for (const k in obj) return false;
	return true;
}

/**
 * Reactively checks if an observable array or object is empty.
 *
 * This function not only returns the current emptiness state but also establishes
 * a reactive dependency. If the emptiness state of the `proxied` object or array
 * changes later (e.g., an item is added to an empty array, or the last property
 * is deleted from an object), the scope that called `isEmpty` will be automatically
 * scheduled for re-evaluation.
 *
 * @param proxied The observable array or object (obtained via `observe()`) to check.
 * @returns `true` if the array has length 0 or the object has no own enumerable properties, `false` otherwise.
 *
 * @example
 * ```typescript
 * const items = proxy([]);
 *
 * // Reactively display a message if the items array is empty
 * $('div', () => {
 *     if (isEmpty(items)) {
 *         $('p', 'i:No items yet!');
 *     } else {
 * 		   onEach(items, item=>$('p:'+item));
 *     }
 * });
 *
 * // Adding an item will automatically remove the "No items yet!" message
 * setInterval(() => {
 *   if (!items.length || Math.random()>0.5) items.push('Item');
 *   else items.length = 0;
 * }, 1000)
 * ```
 */
export function isEmpty(proxied: TargetType): boolean {
	const target = (proxied as any)[TARGET_SYMBOL] || proxied;
	const scope = currentScope;

	if (target instanceof Array) {
		subscribe(
			target,
			"length",
			(index: any, newData: DatumType, oldData: DatumType) => {
				if (!newData !== !oldData) queue(scope);
			},
		);
		return !target.length;
	}
	const result = isObjEmpty(target);
	subscribe(
		target,
		ANY_SYMBOL,
		(index: any, newData: DatumType, oldData: DatumType) => {
			if (result ? oldData === undefined : newData === undefined) queue(scope);
		},
	);
	return result;
}

/** @private */
export interface ValueRef<T> {
	value: T;
}

/**
 * Reactively counts the number of properties in an objects.
 *
 * @param proxied The observable object to count. In case an `array` is passed in, a {@link ref} to its `.length` will be returned.
 * @returns an observable object for which the `value` property reflects the number of properties in `proxied` with a value other than `undefined`.
 * 
 * @example
 * ```typescript
 * const items = proxy({x: 3, y: 7} as any);
 * const cnt = count(items);
 *
 * // Create a DOM text node for the count:
 * $('div', {text: cnt});
 * // <div>2</div>

 * // Or we can use it in an {@link observe} function:
 * observe(() => console.log("The count is now", cnt.value));
 * // The count is now 2
 * 
 * // Adding/removing items will update the count
 * items.z = 12;
 * // Asynchronously, after 0ms:
 * // <div>3</div>
 * // The count is now 3
 * ```
 */
export function count(proxied: TargetType): ValueRef<number> {
	if (proxied instanceof Array) return ref(proxied, "length");

	const target = (proxied as any)[TARGET_SYMBOL] || proxied;
	let cnt = 0;
	for (const k in target) if (target[k] !== undefined) cnt++;

	const result = proxy(cnt);
	subscribe(
		target,
		ANY_SYMBOL,
		(index: any, newData: DatumType, oldData: DatumType) => {
			if (oldData === newData) {
			} else if (oldData === undefined) result.value = ++cnt;
			else if (newData === undefined) result.value = --cnt;
		},
	);

	return result;
}

/** @internal */
export function defaultEmitHandler(
	target: TargetType,
	index: string | symbol | number,
	newData: DatumType,
	oldData: DatumType,
) {
	// We're triggering for values changing from undefined to undefined, as this *may*
	// indicate a change from or to `[empty]` (such as `[,1][0]`).
	if (newData === oldData && newData !== undefined) return;

	const byTarget = subscribers.get(target);
	if (byTarget === undefined) return;

	for (const what of [index, ANY_SYMBOL]) {
		const byIndex = byTarget.get(what);
		if (byIndex) {
			for (const observer of byIndex) {
				if (typeof observer === "function") observer(index, newData, oldData);
				else observer.onChange(index, newData, oldData);
			}
		}
	}
}
let emit = defaultEmitHandler;

const objectHandler: ProxyHandler<any> = {
	get(target: any, prop: any) {
		if (prop === TARGET_SYMBOL) return target;
		subscribe(target, prop);
		return optProxy(target[prop]);
	},
	set(target: any, prop: any, newData: any) {
		// Make sure newData is unproxied
		if (typeof newData === "object" && newData)
			newData = (newData as any)[TARGET_SYMBOL] || newData;
		const oldData = target[prop];
		if (newData !== oldData) {
			target[prop] = newData;
			emit(target, prop, newData, oldData);
			runImmediateQueue();
		}
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
	ownKeys(target: any) {
		subscribe(target, ANY_SYMBOL);
		return Reflect.ownKeys(target);
	},
};

function arraySet(target: any, prop: any, newData: any) {
	// Make sure newData is unproxied
	if (typeof newData === "object" && newData)
		newData = (newData as any)[TARGET_SYMBOL] || newData;
	const oldData = target[prop];
	if (newData !== oldData) {
		const oldLength = target.length;

		if (prop === "length") {
			target.length = newData;

			// We only need to emit for shrinking, as growing just adds undefineds
			for (let i = newData; i < oldLength; i++) {
				emit(target, i, undefined, target[i]);
			}
		} else {
			const intProp = Number.parseInt(prop);
			if (intProp.toString() === prop) prop = intProp;

			target[prop] = newData;
			emit(target, prop, newData, oldData);
		}
		if (target.length !== oldLength) {
			emit(target, "length", target.length, oldLength);
		}
		runImmediateQueue();
	}
	return true;
}

const arrayHandler: ProxyHandler<any[]> = {
	get(target: any, prop: any) {
		if (prop === TARGET_SYMBOL) return target;
		let subProp = prop;
		if (typeof prop !== "symbol") {
			const intProp = Number.parseInt(prop);
			if (intProp.toString() === prop) subProp = intProp;
		}
		subscribe(target, subProp);
		return optProxy(target[prop]);
	},
	set: arraySet,
	deleteProperty(target: any, prop: string | symbol) {
		return arraySet(target, prop, undefined);
	},
};

const proxyMap = new WeakMap<TargetType, /*Proxy*/ TargetType>();

function optProxy(value: any): any {
	// If value is a primitive type or already proxied, just return it
	if (
		typeof value !== "object" ||
		!value ||
		value[TARGET_SYMBOL] !== undefined
	) {
		return value;
	}
	let proxied = proxyMap.get(value);
	if (proxied) return proxied; // Only one proxy per target!

	proxied = new Proxy(
		value,
		value instanceof Array ? arrayHandler : objectHandler,
	);
	proxyMap.set(value, proxied as TargetType);
	return proxied;
}

export function proxy<T extends DatumType>(
	target: Array<T>,
): Array<
	T extends number
		? number
		: T extends string
			? string
			: T extends boolean
				? boolean
				: T
>;
export function proxy<T extends object>(target: T): T;
export function proxy<T extends DatumType>(
	target: T,
): ValueRef<
	T extends number
		? number
		: T extends string
			? string
			: T extends boolean
				? boolean
				: T
>;

/**
 * Creates a reactive proxy around the given data.
 *
 * Reading properties from the returned proxy within a reactive scope (like one created by
 * {@link $} or {@link observe}) establishes a subscription. Modifying properties *through*
 * the proxy will notify subscribed scopes, causing them to re-execute.
 *
 * - Plain objects and arrays are wrapped in a standard JavaScript `Proxy` that intercepts
 *   property access and mutations, but otherwise works like the underlying data.
 * - Primitives (string, number, boolean, null, undefined) are wrapped in an object
 *   `{ value: T }` which is then proxied. Access the primitive via the `.value` property.
 *
 * Use {@link unproxy} to get the original underlying data back.
 *
 * @param target - The object, array, or primitive value to make reactive.
 * @returns A reactive proxy wrapping the target data.
 * @template T - The type of the data being proxied.
 *
 * @example Object
 * ```javascript
 * const state = proxy({ count: 0, message: 'Hello' });
 * observe(() => console.log(state.message)); // Subscribes to message
 * setTimeout(() => state.message = 'World', 1000); // Triggers the observe function
 * setTimeout(() => state.count++, 2000); // Triggers nothing
 * ```
 *
 * @example Array
 * ```javascript
 * const items = proxy(['a', 'b']);
 * observe(() => console.log(items.length)); // Subscribes to length
 * setTimeout(() => items.push('c'), 2000); // Triggers the observe function
 * ```
 *
 * @example Primitive
 * ```javascript
 * const name = proxy('Aberdeen');
 * observe(() => console.log(name.value)); // Subscribes to value
 * setTimeout(() => name.value = 'UI', 2000); // Triggers the observe function
 * ```
 *
 * @example Class instance
 * ```typescript
 * class Widget {
 *   constructor(public name: string, public width: number, public height: number) {}
 *   grow() { this.width *= 2; }
 *   toString() { return `${this.name}Widget (${this.width}x${this.height})`; }
 * }
 * let graph: Widget = proxy(new Widget('Graph', 200, 100));
 * observe(() => console.log(''+graph));
 * setTimeout(() => graph.grow(), 2000);
 * setTimeout(() => graph.grow(), 4000);
 * ```
 */
export function proxy(target: TargetType): TargetType {
	return optProxy(
		typeof target === "object" && target !== null ? target : { value: target },
	);
}

/**
 * Returns the original, underlying data target from a reactive proxy created by {@link proxy}.
 * If the input `target` is not a proxy, it is returned directly.
 *
 * This is useful when you want to avoid triggering subscriptions during read operations or
 * re-executes during write operations. Using {@link peek} is an alternative way to achieve this.
 *
 * @param target - A proxied object, array, or any other value.
 * @returns The underlying (unproxied) data, or the input value if it wasn't a proxy.
 * @template T - The type of the target.
 *
 * @example
 * ```typescript
 * const userProxy = proxy({ name: 'Frank' });
 * const rawUser = unproxy(userProxy);
 *
 * // Log reactively
 * $(() => console.log('proxied', userProxy.name));
 * // The following will only ever log once, as we're not subscribing to any observable
 * $(() => console.log('unproxied', rawUser.name));
 *
 * // This cause the first log to run again:
 * setTimeout(() => userProxy.name += '!', 1000);
 *
 * // This doesn't cause any new logs:
 * setTimeout(() => rawUser.name += '?', 2000);
 *
 * // Both userProxy and rawUser end up as `{name: 'Frank!?'}`
 * setTimeout(() => {
 *   console.log('final proxied', userProxy)
 *   console.log('final unproxied', rawUser)
 * }, 3000);
 * ```
 */
export function unproxy<T>(target: T): T {
	return target ? (target as any)[TARGET_SYMBOL] || target : target;
}

const onDestroyMap: WeakMap<Node, string | ((...args: any[]) => void) | true> =
	new WeakMap();

function destroyWithClass(element: Element, cls: string) {
	const classes = cls.split(".").filter((c) => c);
	element.classList.add(...classes);
	setTimeout(() => element.remove(), 2000);
}

/**
 * Recursively copies properties or array items from `src` to `dst`.
 * It's designed to work efficiently with reactive proxies created by {@link proxy}.
 *
 * - **Minimizes Updates:** When copying between objects/arrays (proxied or not), if a nested object
 *   exists in `dst` with the same constructor as the corresponding object in `src`, `copy`
 *   will recursively copy properties into the existing `dst` object instead of replacing it.
 *   This minimizes change notifications for reactive updates.
 * - **Handles Proxies:** Can accept proxied or unproxied objects/arrays for both `dst` and `src`.
 *
 * @param dst - The destination object/array (proxied or unproxied).
 * @param src - The source object/array (proxied or unproxied). It won't be modified.
 * @param flags - Bitmask controlling copy behavior:
 *   - {@link MERGE}: Performs a partial update. Properties in `dst` not present in `src` are kept.
 *     `null`/`undefined` in `src` delete properties in `dst`. Handles partial array updates via object keys.
 *   - {@link SHALLOW}: Performs a shallow copy; when an array/object of the right type doesn't exist in `dst` yet, a reference to the array/object in `src` will be made, instead of creating a copy. If the array/object already exists, it won't be replaced (by a reference), but all items will be individually checked and copied like normal, keeping changes (and therefore UI updates) to a minimum.
 * @template T - The type of the objects being copied.
 * @throws Error if attempting to copy an array into a non-array or vice versa (unless {@link MERGE} is set, allowing for sparse array updates).
 *
 * @example Basic Copy
 * ```typescript
 * const source = proxy({ a: 1, b: { c: 2 } });
 * const dest = proxy({ b: { d: 3 } });
 * copy(dest, source);
 * console.log(dest); // proxy({ a: 1, b: { c: 2 } })
 * ```
 *
 * @example MERGE
 * ```typescript
 * const source = { b: { c: 99 }, d: undefined }; // d: undefined will delete
 * const dest = proxy({ a: 1, b: { x: 5 }, d: 4 });
 * copy(dest, source, MERGE);
 * console.log(dest); // proxy({ a: 1, b: { c: 99, x: 5 } })
 * ```
 *
 * @example Partial Array Update with MERGE
 * ```typescript
 * const messages = proxy(['msg1', 'msg2', 'msg3']);
 * const update = { 1: 'updated msg2' }; // Update using object key as index
 * copy(messages, update, MERGE);
 * console.log(messages); // proxy(['msg1', 'updated msg2', 'msg3'])
 * ```
 *
 * @example SHALLOW
 * ```typescript
 * const source = { nested: [1, 2] };
 * const dest = {};
 * copy(dest, source, SHALLOW);
 * dest.nested.push(3);
 * console.log(source.nested); // [1, 2, 3] (source was modified)
 * ```
 */
export function copy<T extends object>(dst: T, src: Partial<T>, flags = 0) {
	copyRecurse(dst, src, flags);
	runImmediateQueue();
}
/** Flag to {@link copy} causing it to use merge semantics. See {@link copy} for details. */
export const MERGE = 1;
/** Flag to {@link copy} and {@link clone} causing them to create a shallow copy (instead of the deep copy done by default).*/
export const SHALLOW = 2;
const COPY_SUBSCRIBE = 32;
const COPY_EMIT = 64;

/**
 * Clone an (optionally proxied) object or array.
 *
 * @param src The object or array to clone. If it is proxied, `clone` will subscribe to any changes to the (nested) data structure.
 * @param flags
 *   - {@link SHALLOW}: Performs a shallow clone, meaning that only the top-level array or object will be copied, while object/array values will just be references to the original data in `src`.
 * @template T - The type of the objects being copied.
 * @returns A new unproxied array or object (of the same type as `src`), containing a deep (by default) copy of `src`.
 */
export function clone<T extends object>(src: T, flags = 0): T {
	const dst = Object.create(Object.getPrototypeOf(src)) as T;
	copyRecurse(dst, src, flags);
	return dst;
}

function copyRecurse(dst: any, src: any, flags: number) {
	// We never want to subscribe to reads we do to the target (to find changes). So we'll
	// take the unproxied version and `emit` updates ourselve.
	let unproxied = dst[TARGET_SYMBOL];
	if (unproxied) {
		dst = unproxied;
		flags |= COPY_EMIT;
	}
	// For performance, we'll work on the unproxied `src` and manually subscribe to changes.
	unproxied = src[TARGET_SYMBOL];
	if (unproxied) {
		src = unproxied;
		// If we're not in peek mode, we'll manually subscribe to all source reads.
		if (currentScope !== ROOT_SCOPE && !peeking) flags |= COPY_SUBSCRIBE;
	}

	if (flags & COPY_SUBSCRIBE) subscribe(src, ANY_SYMBOL);
	if (src instanceof Array) {
		if (!(dst instanceof Array))
			throw new Error("Cannot copy array into object");
		const dstLen = dst.length;
		const srcLen = src.length;
		for (let i = 0; i < srcLen; i++) {
			copyValue(dst, src, i, flags);
		}
		// Leaving additional values in the old array doesn't make sense
		if (srcLen !== dstLen) {
			if (flags & COPY_EMIT) {
				for (let i = srcLen; i < dstLen; i++) {
					const old = dst[i];
					dst[i] = undefined;
					emit(dst, i, undefined, old);
				}
				dst.length = srcLen;
				emit(dst, "length", srcLen, dstLen);
			} else {
				dst.length = srcLen;
			}
		}
	} else {
		for (const k in src) {
			copyValue(dst, src, k, flags);
		}
		if (!(flags & MERGE)) {
			for (const k in dst) {
				if (!(k in src)) {
					const old = dst[k];
					delete dst[k];
					if (flags & COPY_EMIT && old !== undefined) {
						emit(dst, k, undefined, old);
					}
				}
			}
		}
	}
}

function copyValue(dst: any, src: any, index: any, flags: number) {
	const dstValue = dst[index];
	let srcValue = src[index];
	if (srcValue !== dstValue) {
		if (
			srcValue &&
			dstValue &&
			typeof srcValue === "object" &&
			typeof dstValue === "object" &&
			(srcValue.constructor === dstValue.constructor ||
				(flags & MERGE && dstValue instanceof Array))
		) {
			copyRecurse(dstValue, srcValue, flags);
			return;
		}

		if (!(flags & SHALLOW) && srcValue && typeof srcValue === "object") {
			// Create an empty object of the same type
			const copy = Object.create(Object.getPrototypeOf(srcValue));
			// Copy all properties to it. This doesn't need to emit anything
			// and MERGE does not apply as this is a new branch.
			copyRecurse(copy, srcValue, 0);
			srcValue = copy;
		}
		const old = dst[index];
		if (flags & MERGE && srcValue == null) delete dst[index];
		else dst[index] = srcValue;
		if (flags & COPY_EMIT) emit(dst, index, srcValue, old);
	}
}

interface RefTarget {
	proxy: TargetType;
	index: any;
}
const refHandler: ProxyHandler<RefTarget> = {
	get(target: RefTarget, prop: any) {
		if (prop === TARGET_SYMBOL) {
			// Create a ref to the unproxied version of the target
			return ref(unproxy(target.proxy), target.index);
		}
		if (prop === "value") {
			return (target.proxy as any)[target.index];
		}
	},
	set(target: any, prop: any, value: any) {
		if (prop === "value") {
			(target.proxy as any)[target.index] = value;
			return true;
		}
		return false;
	},
};

/**
 * Creates a reactive reference (`{ value: T }`-like object) to a specific value
 * within a proxied object or array.
 *
 * This is primarily used for the `bind` property in {@link $} to create two-way data bindings
 * with form elements, and for passing a reactive property to any of the {@link $} key-value pairs.
 *
 * Reading `ref.value` accesses the property from the underlying proxy (and subscribes the current scope).
 * Assigning to `ref.value` updates the property in the underlying proxy (triggering reactive updates).
 *
 * @param target - The reactive proxy (created by {@link proxy}) containing the target property.
 * @param index - The key (for objects) or index (for arrays) of the property to reference.
 * @returns A reference object with a `value` property linked to the specified proxy property.
 *
 * @example
 * ```javascript
 * const formData = proxy({ color: 'orange', velocity: 42 });
 *
 * // Usage with `bind`
 * $('input', {
 *   type: 'text',
 *   // Creates a two-way binding between the input's value and formData.username
 *   bind: ref(formData, 'color')
 * });
 *
 * // Usage as a dynamic property, causes a TextNode with just the name to be created and live-updated
 * $('p:Selected color: ', {
 *   text: ref(formData, 'color'),
 *   $color: ref(formData, 'color')
 * });
 *
 * // Changes are actually stored in formData - this causes logs like `{color: "Blue", velocity 42}`
 * $(() => console.log(formData))
 * ```
 */
export function ref<T extends TargetType, K extends keyof T>(
	target: T,
	index: K,
): ValueRef<T[K]> {
	return new Proxy({ proxy: target, index }, refHandler) as any as ValueRef<
		T[K]
	>;
}

function applyBind(el: HTMLInputElement, target: any) {
	let onProxyChange: () => void;
	let onInputChange: () => void;
	const type = el.getAttribute("type");
	const value = unproxy(target).value;
	if (type === "checkbox") {
		if (value === undefined) target.value = el.checked;
		onProxyChange = () => {
			el.checked = target.value;
		};
		onInputChange = () => {
			target.value = el.checked;
		};
	} else if (type === "radio") {
		if (value === undefined && el.checked) target.value = el.value;
		onProxyChange = () => {
			el.checked = target.value === el.value;
		};
		onInputChange = () => {
			if (el.checked) target.value = el.value;
		};
	} else {
		onInputChange = () => {
			target.value =
				type === "number" || type === "range"
					? el.value === ""
						? null
						: +el.value
					: el.value;
		};
		if (value === undefined) onInputChange();
		onProxyChange = () => {
			el.value = target.value;
			// biome-ignore lint/suspicious/noDoubleEquals: it's fine for numbers to be casts to strings here
			if (el.tagName === "SELECT" && el.value != target.value)
				throw new Error(`SELECT has no '${target.value}' OPTION (yet)`);
		};
	}
	observe(onProxyChange);
	el.addEventListener("input", onInputChange);
	clean(() => {
		el.removeEventListener("input", onInputChange);
	});
}

const SPECIAL_PROPS: { [key: string]: (value: any) => void } = {
	create: (value: any) => {
		const el = currentScope.parentElement;
		if (currentScope !== topRedrawScope) return;
		if (typeof value === "function") {
			value(el);
		} else {
			const classes = value.split(".").filter((c: any) => c);
			el.classList.add(...classes);
			(async () => {
				// attempt to prevent layout trashing
				(el as HTMLElement).offsetHeight; // trigger layout
				el.classList.remove(...classes);
			})();
		}
	},
	destroy: (value: any) => {
		const el = currentScope.parentElement;
		onDestroyMap.set(el, value);
	},
	html: (value: any) => {
		const tmpParent = document.createElement(
			currentScope.parentElement.tagName,
		);
		tmpParent.innerHTML = `${value}`;
		while (tmpParent.firstChild) addNode(tmpParent.firstChild);
	},
	text: (value: any) => {
		addNode(document.createTextNode(value));
	},
	element: (value: any) => {
		console.log("Aberdeen: $({element: myElement}) is deprecated, use $(myElement) instead");
		addNode(value);
		SPECIAL_PROPS.element = addNode; // Avoid the console.log next time
	},
};

/**
 * The core function for building reactive user interfaces in Aberdeen. It creates and inserts new DOM elements
 * and sets attributes/properties/event listeners on DOM elements. It does so in a reactive way, meaning that
 * changes will be (mostly) undone when the current *scope* is destroyed or will be re-execute.
 *
 * @param {...(string | function | object | false | undefined | null)} args - Any number of arguments can be given. How they're interpreted depends on their types:
 *
 * - `string`: Strings can be used to create and insert new elements, set classnames for the *current* element, and add text to the current element.
 *   The format of a string is: **tag**? (`.` **class**)* (':' **text**)?
 *   meaning it consists of...
 *   - An optional HTML **tag**, something like `h1`. If present, a DOM element of that tag is created, and that element will be the *current* element for the rest of this `$` function execution.
 *   - Any number of CSS classes prefixed by `.` characters. These classes will be added to the *current* element.
 *   - Optional content **text** prefixed by a `:` character, ranging til the end of the string. This will be added as a TextNode to the *current* element.
 * - `function`: When a function (without argument nor a return value) is passed in, it will be reactively executed in its own observe scope, preserving the *current element*. So any `$()` invocations within this function will create DOM elements with our *current* element as parent. If the function reads observable data, and that data is changed later on, the function we re-execute (after side effects, such as DOM modifications through `$`, have been cleaned - see also {@link clean}).
 * - `object`: When an object is passed in, its key-value pairs are used to modify the *current* element in the following ways...
 *   - `{<attrName>: any}`: The common case is setting the value as an HTML attribute named key. So `{placeholder: "Your name"}` would add `placeholder="Your name"` to the current HTML element.
 *   - `{<propName>: boolean}` or `{value: any}` or `{selectedIndex: number}`: If the value is a boolean, or if the key is `value` or `selectedIndex`, it is set on the `current` element as a DOM property instead of an HTML attribute. For example `{checked: true}` would do `el.checked = true` for the *current* element.
 *   - `{".class": boolean}`: If the key starts with a `.` character, its either added to or removed from the *current* element as a CSS class, based on the truthiness of the value. So `{".hidden": hide}` would toggle the `hidden` CSS class.
 *   - `{<eventName>: function}`: If the value is a `function` it is set as an event listener for the event with the name given by the key. For example: `{click: myClickHandler}`.
 *   - `{$<styleProp>: value}`: If the key starts with a `$` character, set a CSS style property with the name of the rest of the key to the given value. Example: `{$backgroundColor: 'red'}`.
 *   - `{create: string}`: Add the value string as a CSS class to the *current* element, *after* the browser has finished doing a layout pass. This behavior only triggers when the scope setting the `create` is the top-level scope being (re-)run. This allows for creation transitions, without triggering the transitions for deeply nested elements being drawn as part of a larger component. The string may also contain multiple dot-separated CSS classes, such as `.fade.grow`.
 *   - `{destroy: string}`: When the *current* element is a top-level element to be removed (due to reactivity cleanup), actual removal from the DOM is delayed by 2 seconds, and in the mean time the value string is added as a CSS class to the element, allowing for a deletion transition. The string may also contain multiple dot-separated CSS classes, such as `.fade.shrink`.
 *   - `{create: function}` and `{destroy: function}`: The function is invoked when the *current* element is the top-level element being created/destroyed. It can be used for more involved creation/deletion animations. In case of `destroy`, the function is responsible for actually removing the element from the DOM (eventually). See `transitions.ts` in the Aberdeen source code for some examples.
 *   - `{bind: <obsValue>}`: Create a two-way binding element between the `value` property of the given observable (proxy) variable, and the *current* input element (`<input>`, `<select>` or `<textarea>`). This is often used together with {@link ref}, in order to use properties other than `.value`.
 *   - `{<any>: <obsvalue>}`: Create a new observe scope and read the `value` property of the given observable (proxy) variable from within it, and apply the contained value using any of the other rules in this list. Example:
 *      ```typescript
 *      const myColor = proxy('red');
 *      $('p:Test', {$color: myColor, click: () => myColor.value = 'yellow'})
 *      // Clicking the text will cause it to change color without recreating the <p> itself
 *      ```
 *      This is often used together with {@link ref}, in order to use properties other than `.value`.
 *   - `{text: string|number}`: Add the value as a `TextNode` to the *current* element.
 *   - `{html: string}`: Add the value as HTML to the *current* element. This should only be used in exceptional situations. And of course, beware of XSS.
   - `Node`: If a DOM Node (Element or TextNode) is passed in, it is added as a child to the *current* element. If the Node is an Element, it becomes the new *current* element for the rest of this `$` function execution.
 *
 * @returns The most inner DOM element that was created (not counting text nodes nor elements created by content functions),
 *          or undefined if no elements were created.
 *
 * @example Create Element
 * ```typescript
 * $('button.secondary.outline:Submit', {
 *   disabled: false,
 *   click: () => console.log('Clicked!'),
 *   $color: 'red'
 * });
 * ```
 *
 * @example Create Nested Elements
 * ```typescript
 * let inputElement: Element = $('label:Click me', 'input', {type: 'checkbox'});
 * // You should usually not touch raw DOM elements, unless when integrating
 * // with non-Aberdeen code.
 * console.log('DOM element:', inputElement);
 * ```
 *
 * @example Content Functions & Reactive Scope
 * ```typescript
 * const state = proxy({ count: 0 });
 * $('div', () => { // Outer element
 *   // This scope re-renders when state.count changes
 *   $(`p:Count is ${state.count}`);
 *   $('button:Increment', { click: () => state.count++ });
 * });
 * ```
 *
 * @example Two-way Binding
 * ```typescript
 * const user = proxy({ name: '' });
 * $('input', { placeholder: 'Name', bind: ref(user, 'name') });
 * $('h3', () => { // Reactive scope
 *   $(`:Hello ${user.name || 'stranger'}`);
 * });
 * ```
 *
 * @example Conditional Rendering
 * ```typescript
 * const show = proxy(false);
 * $('button', { click: () => show.value = !show.value }, () => $(show.value ? ':Hide' : ':Show'));
 * $(() => { // Reactive scope
 *   if (show.value) {
 *     $('p:Details are visible!');
 *   }
 * });
 * ```
 */

export function $(
	...args: (
		| string
		| null
		| undefined
		| false
		| (() => void)
		| Record<string, any>
	)[]
): undefined | Element {
	let savedCurrentScope: undefined | ContentScope;
	let err: undefined | string;
	let result: undefined | Element;

	for (let arg of args) {
		if (arg == null || arg === false) continue;
		if (typeof arg === "string") {
			let text: undefined | string;
			let classes: undefined | string;
			const textPos = arg.indexOf(":");
			if (textPos >= 0) {
				text = arg.substring(textPos + 1);
				arg = arg.substring(0, textPos);
			}
			const classPos = arg.indexOf(".");
			if (classPos >= 0) {
				classes = arg.substring(classPos + 1);
				arg = arg.substring(0, classPos);
			}
			if (arg === "") {
				// Add text or classes to parent
				if (text) addNode(document.createTextNode(text));
				if (classes) {
					const el = currentScope.parentElement;
					el.classList.add(...classes.split("."));
					if (!savedCurrentScope) {
						clean(() => el.classList.remove(...classes.split(".")));
					}
				}
			} else if (arg.indexOf(" ") >= 0) {
				err = `Tag '${arg}' cannot contain space`;
				break;
			} else {
				// Determine which namespace to use for element creation
				const useNamespace = currentScope.inSvgNamespace || arg === 'svg';
				if (useNamespace) {
					result = document.createElementNS('http://www.w3.org/2000/svg', arg);
				} else {
					result = document.createElement(arg);
				}
				
				if (classes) result.className = classes.replaceAll(".", " ");
				if (text) result.textContent = text;
				addNode(result);
				if (!savedCurrentScope) {
					savedCurrentScope = currentScope;
				}
				const newScope = new ChainedScope(result, true);
				
				// If we're creating an SVG element, set the SVG namespace flag for child scopes
				if (arg === 'svg') {
					newScope.inSvgNamespace = true;
				}
				
				newScope.lastChild = result.lastChild || undefined;
				if (topRedrawScope === currentScope) topRedrawScope = newScope;
				currentScope = newScope;
			}
		} else if (typeof arg === "object") {
			if (arg.constructor !== Object) {
				if (arg instanceof Node) {
					addNode(arg);
					if (arg instanceof Element) {
						// If it's an Element, it may contain children, so we make it the current scope
						if (!savedCurrentScope) savedCurrentScope = currentScope;
						currentScope = new ChainedScope(arg, true);
						currentScope.lastChild = arg.lastChild || undefined;
					}
				} else {
					err = `Unexpected argument: ${arg}`;
					break;
				}
			} else {
				for (const key in arg) {
					const val = arg[key];
					applyArg(key, val);
				}
			}
		} else if (typeof arg === "function") {
			new RegularScope(currentScope.parentElement, arg);
		} else {
			err = `Unexpected argument: ${arg}`;
			break;
		}
	}
	if (savedCurrentScope) {
		currentScope = savedCurrentScope;
	}
	if (err) throw new Error(err);
	return result;
}

let cssCount = 0;

/**
 * Inserts CSS rules into the document, optionally scoping them with a unique class name.
 *
 * Takes a JavaScript object representation of CSS rules. camelCased property keys are
 * converted to kebab-case (e.g., `fontSize` becomes `font-size`).
 *
 * @param style - An object where keys are CSS selectors (or camelCased properties) and values are
 *   CSS properties or nested rule objects.
 *   - Selectors are usually combined as a descendant-relationship (meaning just a space character) with their parent selector.
 *   - In case a selector contains a `&`, that character will be replaced by the parent selector.
 *   - Selectors will be split on `,` characters, each combining with the parent selector with *or* semantics.
 *   - Selector starting with `'@'` define at-rules like media queries. They may be nested within regular selectors.
 * @param global - If `true`, styles are inserted globally without prefixing.
 *                 If `false` (default), all selectors are prefixed with a unique generated
 *                 class name (e.g., `.AbdStl1`) to scope the styles.
 * @returns The unique class name prefix used for scoping (e.g., `.AbdStl1`), or an empty string
 *          if `global` was `true`. Use this prefix with {@link $} to apply the styles.
 *
 * @example Scoped Styles
 * ```typescript
 * const scopeClass = insertCss({
 *   color: 'red',
 *   padding: '10px',
 *   '&:hover': { // Use '&' for the root scoped selector
 *     backgroundColor: '#535'
 *   },
 *   '.child-element': { // Nested selector
 *     fontWeight: 'bold'
 *   },
 *   '@media (max-width: 600px)': {
 *     padding: '5px'
 *   }
 * });
 * // scopeClass might be ".AbdStl1"
 *
 * // Apply the styles
 * $(scopeClass, () => { // Add class to the div
 *   $(`:Scoped content`);
 *   $('div.child-element:Child'); // .AbdStl1 .child-element rule applies
 * });
 * ```
 *
 * @example Global Styles
 * ```typescript
 * insertCss({
 *   '*': {
 *     fontFamily: 'monospace',
 *   },
 *   'a': {
 *     textDecoration: 'none',
 *     color: "#107ab0",
 *   }
 * }, true); // Pass true for global
 *
 * $('a:Styled link');
 * ```
 */
export function insertCss(style: object, global = false): string {
	const prefix = global ? "" : `.AbdStl${++cssCount}`;
	const css = styleToCss(style, prefix);
	if (css) $(`style:${css}`);
	return prefix;
}

function styleToCss(style: object, prefix: string): string {
	let props = "";
	let rules = "";
	for (const kOr in style) {
		const v = (style as any)[kOr];
		for (const k of kOr.split(/, ?/g)) {
			if (v && typeof v === "object") {
				if (k.startsWith("@")) {
					// media queries
					rules += `${k}{\n${styleToCss(v, prefix)}}\n`;
				} else {
					rules += styleToCss(
						v,
						k.includes("&") ? k.replace(/&/g, prefix) : `${prefix} ${k}`,
					);
				}
			} else {
				props += `${k.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${v};`;
			}
		}
	}
	if (props) rules = `${prefix.trimStart() || "*"}{${props}}\n${rules}`;
	return rules;
}

function applyArg(key: string, value: any) {
	const el = currentScope.parentElement;
	if (typeof value === "object" && value !== null && value[TARGET_SYMBOL]) {
		// Value is a proxy
		if (key === "bind") {
			applyBind(el as HTMLInputElement, value);
		} else {
			new SetArgScope(el, key, value);
			// SetArgScope will (repeatedly) call `applyArg` again with the actual value
		}
	} else if (key[0] === ".") {
		// CSS class(es)
		const classes = key.substring(1).split(".");
		if (value) el.classList.add(...classes);
		else el.classList.remove(...classes);
	} else if (key[0] === "$") {
		// Style
		const name = key.substring(1);
		if (value == null || value === false) (el as any).style[name] = "";
		else (el as any).style[name] = `${value}`;
	} else if (value == null) {
		// Value left empty
		// Do nothing
	} else if (key in SPECIAL_PROPS) {
		// Special property
		SPECIAL_PROPS[key](value);
	} else if (typeof value === "function") {
		// Event listener
		el.addEventListener(key, value);
		clean(() => el.removeEventListener(key, value));
	} else if (
		value === true ||
		value === false ||
		key === "value" ||
		key === "selectedIndex"
	) {
		// DOM property
		(el as any)[key] = value;
	} else {
		// HTML attribute
		el.setAttribute(key, value);
	}
}

function defaultOnError(error: Error) {
	console.error("Error while in Aberdeen render:", error);
	return true;
}
let onError: (error: Error) => boolean | undefined = defaultOnError;

/**
 * Sets a custom error handler function for errors that occur asynchronously
 * within reactive scopes (e.g., during updates triggered by proxy changes in
 * {@link observe} or {@link $} render functions).
 *
 * The default handler logs the error to `console.error` and adds a simple
 * 'Error' message div to the DOM at the location where the error occurred (if possible).
 *
 * Your handler can provide custom logging, UI feedback, or suppress the default
 * error message.
 *
 * @param handler - A function that accepts the `Error` object.
 *   - Return `false` to prevent adding an error message to the DOM.
 *   - Return `true` or `undefined` (or throw) to allow the error messages to be added to the DOM.
 *
 * @example Custom Logging and Suppressing Default Message
 * ```typescript
 * setErrorHandler(error => {
 *   console.warn('Aberdeen render error:', error.message);
 *   // Log to error reporting service
 *   // myErrorReporter.log(error);
 *
 *   try {
 *     // Attempt to show a custom message in the UI
 *     $('div.error-message:Oops, something went wrong!');
 *   } catch (e) {
 *     // Ignore errors during error handling itself
 *   }
 *
 *   return false; // Suppress default console log and DOM error message
 * });
 *
 * // Styling for our custom error message
 * insertCss({
 *   '.error-message': {
 *     backgroundColor: '#e31f00',
 *     display: 'inline-block',
 *     color: 'white',
 *     borderRadius: '3px',
 *     padding: '2px 4px',
 *   }
 * }, true); // global style
 *
 * // Cause an error within a render scope.
 * $('div.box', () => {
 *   // Will cause our error handler to insert an error message within the box
 *   noSuchFunction();
 * })
 * ```
 */
export function setErrorHandler(
	handler?: (error: Error) => boolean | undefined,
) {
	onError = handler || defaultOnError;
}

/**
 * Gets the parent DOM `Element` where nodes created by {@link $} would currently be inserted.
 *
 * This is context-dependent based on the current reactive scope (e.g., inside a {@link mount}
 * call or a {@link $} element's render function).
 *
 * **Note:** While this provides access to the DOM element, directly manipulating it outside
 * of Aberdeen's control is generally discouraged. Prefer reactive updates using {@link $}.
 *
 * @returns The current parent `Element` for DOM insertion.
 *
 * @example Get parent for attaching a third-party library
 * ```typescript
 * function thirdPartyLibInit(parentElement) {
 *   parentElement.innerHTML = "This element is managed by a <em>third party</em> lib."
 * }
 *
 * $('div.box', () => {
 *   // Get the div.box element just created
 *   const containerElement = getParentElement();
 *   thirdPartyLibInit(containerElement);
 * });
 * ```
 */
export function getParentElement(): Element {
	return currentScope.parentElement;
}

/**
 * Registers a cleanup function to be executed just before the current reactive scope
 * is destroyed or redraws.
 *
 * This is useful for releasing resources, removing manual event listeners, or cleaning up
 * side effects associated with the scope. Cleaners are run in reverse order of registration.
 *
 * Scopes are created by functions like {@link observe}, {@link mount}, {@link $} (when given a render function),
 * and internally by constructs like {@link onEach}.
 *
 * @param cleaner - The function to execute during cleanup.
 *
 * @example Maintaing a sum for a changing array
 * ```typescript
 * const myArray = proxy([3, 5, 10]);
 * let sum = proxy(0);
 *
 * // Show the array items and maintain the sum
 * onEach(myArray, (item, index) => {
 *     $(`code:${index}→${item}`);
 *     // We'll update sum.value using peek, as += first does a read, but
 *     // we don't want to subscribe.
 *     peek(() => sum.value += item);
 *     // Clean gets called before each rerun for a certain item index
 *     // No need for peek here, as the clean code doesn't run in an
 *     // observe scope.
 *     clean(() => sum.value -= item);
 * })
 *
 * // Show the sum
 * $('h1', {text: sum});
 *
 * // Make random changes to the array
 * const rnd = () => 0|(Math.random()*20);
 * setInterval(() => myArray[rnd()] = rnd(), 1000);
 * ```
 */

export function clean(cleaner: () => void) {
	currentScope.cleaners.push(cleaner);
}

/**
 * Creates a reactive scope that automatically re-executes the provided function
 * whenever any proxied data (created by {@link proxy}) read during its last execution changes, storing
 * its return value in an observable.
 *
 * Updates are batched and run asynchronously shortly after the changes occur.
 * Use {@link clean} to register cleanup logic for the scope.
 * Use {@link peek} or {@link unproxy} within the function to read proxied data without subscribing to it.
 *
 * @param func - The function to execute reactively. Any DOM manipulations should typically
 *   be done using {@link $} within this function. Its return value will be made available as an
 *   observable returned by the `observe()` function.
 * @returns An observable object, with its `value` property containing whatever the last run of `func` returned.
 *
 * @example Observation creating a UI components
 * ```typescript
 * const data = proxy({ user: 'Frank', notifications: 42 });
 *
 * $('main', () => {
 *   console.log('Welcome');
 *   $('h3:Welcome, ' + data.user); // Reactive text
 *
 *   observe(() => {
 *     // When data.notifications changes, only this inner scope reruns,
 *     // leaving the `<p>Welcome, ..</p>` untouched.
 *     console.log('Notifications');
 *     $('code.notification-badge:' + data.notifications);
 *     $('a:Notify!', {click: () => data.notifications++});
 *   });
 * });
 * ```
 *
 * ***Note*** that the above could just as easily be done using `$(func)` instead of `observe(func)`.
 *
 * @example Observation with return value
 * ```typescript
 * const counter = proxy(0);
 * setInterval(() => counter.value++, 1000);
 * const double = observe(() => counter.value * 2);
 *
 * $('h3', () => {
 *     $(`:counter=${counter.value} double=${double.value}`);
 * })
 * ```
 *
 * @overload
 * @param func Func without a return value.
 */
export function observe<T>(func: () => T): ValueRef<T> {
	return new ResultScope<T>(currentScope.parentElement, func).result;
}

/**
 * Similar to {@link observe}, creates a reactive scope that re-executes the function
 * when its proxied dependencies change.
 *
 * **Difference:** Updates run **synchronously and immediately** after the proxy modification
 * that triggered the update occurs.
 *
 * **Caution:** Use sparingly. Immediate execution bypasses Aberdeen's usual batching and
 * ordering optimizations, which can lead to performance issues or observing inconsistent
 * intermediate states if multiple related updates are applied sequentially.
 * Prefer {@link observe} or {@link $} for most use cases.
 *
 * @param func - The function to execute reactively and synchronously.
 *
 * @example
 * ```javascript
 * const state = proxy({ single: 'A' });
 *
 * immediateObserve(() => {
 *   state.double = state.single + state.single
 * });
 * console.log(state.double); // 'AA'
 *
 * state.single = 'B';
 * // Synchronously:
 * console.log(state.double); // 'BB'
 * ```
 */
export function immediateObserve(func: () => void) {
	new ImmediateScope(currentScope.parentElement, func);
}

/**
 * Attaches a reactive Aberdeen UI fragment to an existing DOM element. Without the use of
 * this function, {@link $} will assume `document.body` as its root.
 *
 * It creates a top-level reactive scope associated with the `parentElement`. The provided
 * function `func` is executed immediately within this scope. Any proxied data read by `func`
 * will cause it to re-execute when the data changes, updating the DOM elements created within it.
 *
 * Calls to {@link $} inside `func` will append nodes to `parentElement`.
 * You can nest {@link observe} or other {@link $} scopes within `func`.
 * Use {@link unmountAll} to clean up all mounted scopes and their DOM nodes.
 *
 * Mounting scopes happens reactively, meaning that if this function is called from within another
 * ({@link observe} or {@link $} or {@link mount}) scope that gets cleaned up, so will the mount.
 *
 * @param parentElement - The native DOM `Element` to which the UI fragment will be appended.
 * @param func - The function that defines the UI fragment, typically containing calls to {@link $}.
 *
 * @example Basic Mount
 * ```javascript
 * // Create a pre-existing DOM structure (without Aberdeen)
 * document.body.innerHTML = `<h3>Static content <span id="title-extra"></span></h3><div class="box" id="app-root"></div>`;
 *
 * import { mount, $, proxy } from 'aberdeen';
 *
 * const runTime = proxy(0);
 * setInterval(() => runTime.value++, 1000);
 *
 * mount(document.getElementById('app-root'), () => {
 *   $('h4:Aberdeen App');
 *   $(`p:Run time: ${runTime.value}s`);
 *   // Conditionally render some content somewhere else in the static page
 *   if (runTime.value&1) {
 *     mount(document.getElementById('title-extra'), () =>
 *       $(`i:(${runTime.value}s)`)
 *     );
 *   }
 * });
 * ```
 *
 * Note how the inner mount behaves reactively as well, automatically unmounting when it's parent observer scope re-runs.
 */

export function mount(parentElement: Element, func: () => void) {
	new MountScope(parentElement, func);
}

/**
 * Removes all Aberdeen-managed DOM nodes and stops all active reactive scopes
 * (created by {@link mount}, {@link observe}, {@link $} with functions, etc.).
 *
 * This effectively cleans up the entire Aberdeen application state.
 */
export function unmountAll() {
	ROOT_SCOPE.remove();
	cssCount = 0;
}

/**
 * Executes a function *without* creating subscriptions in the current reactive scope, and returns its result.
 *
 * This is useful when you need to access reactive data inside a reactive scope (like {@link observe})
 * but do not want changes to that specific data to trigger a re-execute of the scope.
 *
 * @template T The type of the return value of your function.
 *
 * @param func - The function to execute without creating subscriptions.
 * @returns Whatever `func` returns.
 *
 * @example Peeking within observe
 * ```typescript
 * const data = proxy({ a: 1, b: 2 });
 * observe(() => {
 *   // re-executes only when data.a changes, because data.b is peeked.
 *   const b = peek(() => data.b);
 *   console.log(`A is ${data.a}, B was ${b} when A changed.`);
 * });
 * data.b = 3; // Does not trigger console.log
 * data.a = 2; // Triggers console.log (logs "A is 2, B was 3 when A changed.")
 * ```
 *
 */
export function peek<T>(func: () => T): T {
	peeking++;
	try {
		return func();
	} finally {
		peeking--;
	}
}

/** When using an object as `source`. */
export function map<IN, const IN_KEY extends string | number | symbol, OUT>(
	source: Record<IN_KEY, IN>,
	func: (value: IN, index: KeyToString<IN_KEY>) => undefined | OUT,
): Record<string | symbol, OUT>;
/** When using an array as `source`. */
export function map<IN, OUT>(
	source: Array<IN>,
	func: (value: IN, index: number) => undefined | OUT,
): Array<OUT>;
/**
 * Reactively maps/filters items from a proxied source array or object to a new proxied array or object.
 *
 * It iterates over the `target` proxy. For each item, it calls `func`.
 * - If `func` returns a value, it's added to the result proxy under the same key/index.
 * - If `func` returns `undefined`, the item is skipped (filtered out).
 *
 * The returned proxy automatically updates when:
 * - Items are added/removed/updated in the `target` proxy.
 * - Any proxied data read *within* the `func` call changes (for a specific item).
 *
 * @param func - A function `(value, key) => mappedValue | undefined` that transforms each item.
 *   It receives the item's value and its key/index. Return `undefined` to filter the item out.
 * @returns A new proxied array or object containing the mapped values.
 * @template IN The type of items in the source proxy.
 * @template OUT The type of items in the resulting proxy.
 *
 * @example Map array values
 * ```typescript
 * const numbers = proxy([1, 2, 3]);
 * const doubled = map(numbers, (n) => n * 2);
 * // doubled is proxy([2, 4, 6])
 *
 * observe(() => console.log(doubled)); // Logs updates
 * numbers.push(4); // doubled becomes proxy([2, 4, 6, 8])
 * ```
 *
 * @example Filter and map object properties
 * ```typescript
 * const users = proxy({
 *   'u1': { name: 'Alice', active: true },
 *   'u2': { name: 'Bob', active: false },
 *   'u3': { name: 'Charlie', active: true }
 * });
 *
 * const activeUserNames = map(users, (user) => user.active ? user.name : undefined);
 * // activeUserNames is proxy({ u1: 'Alice', u3: 'Charlie' })
 * observe(() => console.log(Object.values(activeUserNames)));
 *
 * users.u2.active = true;
 * // activeUserNames becomes proxy({ u1: 'Alice', u2: 'Bob', u3: 'Charlie' })
 * ```
 */
export function map(
	source: any,
	func: (value: DatumType, key: any) => any,
): any {
	const out = optProxy(source instanceof Array ? [] : {});
	onEach(source, (item: DatumType, key: symbol | string | number) => {
		const value = func(item, key);
		if (value !== undefined) {
			out[key] = value;
			clean(() => {
				delete out[key];
			});
		}
	});
	return out;
}

/** When using an array as `source`. */
export function multiMap<IN, OUT extends { [key: string | symbol]: DatumType }>(
	source: Array<IN>,
	func: (value: IN, index: number) => OUT | undefined,
): OUT;
/** When using an object as `source`. */
export function multiMap<
	K extends string | number | symbol,
	IN,
	OUT extends { [key: string | symbol]: DatumType },
>(source: Record<K, IN>, func: (value: IN, index: KeyToString<K>) => OUT | undefined): OUT;
/**
 * Reactively maps items from a source proxy (array or object) to a target proxied object,
 * where each source item can contribute multiple key-value pairs to the target.
 *
 * It iterates over the `target` proxy. For each item, it calls `func`.
 * - If `func` returns an object, all key-value pairs from that object are added to the result proxy.
 * - If `func` returns `undefined`, the item contributes nothing.
 *
 * The returned proxy automatically updates when:
 * - Items are added/removed/updated in the `target` proxy.
 * - Any proxied data read *within* the `func` call changes (for a specific item).
 * - If multiple input items produce the same output key, the last one processed usually "wins",
 *   but the exact behavior on collision depends on update timing.
 *
 * This is useful for "flattening" or "indexing" data, or converting an observable array to an observable object.
 *
 * @param source - The source proxied array or object.
 * @param func - A function `(value, key) => ({...pairs} | undefined)` that transforms an item
 *   into an object of key-value pairs to add, or `undefined` to add nothing.
 * @returns A new proxied object containing the aggregated key-value pairs.
 * @template IN The type of items in the source proxy.
 * @template OUT The type of the aggregated output object (should encompass all possible key-value pairs).
 *
 * @example Creating an index from an array
 * ```typescript
 * const items = proxy([
 *   { id: 'a', value: 10 },
 *   { id: 'b', value: 20 },
 * ]);
 * const itemsById = multiMap(items, (item) => ({
 *   [item.id]: item.value,
 *   [item.id+item.id]: item.value*10,
 * }));
 * // itemsById is proxy({ a: 10, aa: 100, b: 20, bb: 200 })
 *
 * $(() => console.log(itemsById));
 *
 * items.push({ id: 'c', value: 30 });
 * // itemsById becomes proxy({ a: 10, aa: 100, b: 20, bb: 200, c: 30, cc: 300 })
 * ```
 */
export function multiMap(
	source: any,
	func: (value: DatumType, key: any) => Record<string | symbol, DatumType>,
): any {
	const out = optProxy({});
	onEach(source, (item: DatumType, key: symbol | string | number) => {
		const pairs = func(item, key);
		if (pairs) {
			for (const key in pairs) out[key] = pairs[key];
			clean(() => {
				for (const key in pairs) delete out[key];
			});
		}
	});
	return out;
}

/** When using an object as `array`. */
export function partition<OUT_K extends string | number | symbol, IN_V>(
	source: IN_V[],
	func: (value: IN_V, key: number) => undefined | OUT_K | OUT_K[],
): Record<OUT_K, Record<number, IN_V>>;
/** When using an object as `source`. */
export function partition<
	IN_K extends string | number | symbol,
	OUT_K extends string | number | symbol,
	IN_V,
>(
	source: Record<IN_K, IN_V>,
	func: (value: IN_V, key: IN_K) => undefined | OUT_K | OUT_K[],
): Record<OUT_K, Record<IN_K, IN_V>>;

/**
 * @overload
 * Reactively partitions items from a source proxy (array or object) into multiple "bucket" proxies
 * based on keys determined by a classifier function.
 *
 * This function iterates through the `source` proxy using {@link onEach}. For each item,
 * it calls the classifier `func`, which should return:
 * - A single key (`OUT_K`): The item belongs to the bucket with this key.
 * - An array of keys (`OUT_K[]`): The item belongs to all buckets specified in the array.
 * - `undefined`: The item is not placed in any bucket.
 *
 * The function returns a main proxied object. The keys of this object are the bucket keys (`OUT_K`)
 * returned by `func`. Each value associated with a bucket key is another proxied object (the "bucket").
 * This inner bucket object maps the *original* keys/indices from the `source` to the items
 * themselves that were classified into that bucket.
 *
 * The entire structure is reactive. Changes in the `source` proxy (adding/removing/updating items)
 * or changes in dependencies read by the `func` will cause the output partitioning to update automatically.
 * Buckets are created dynamically as needed and removed when they become empty.
 *
 * @param source - The input proxied Array or Record (e.g., created by {@link proxy}) containing the items to partition.
 * @param func - A classifier function `(value: IN_V, key: IN_K | number) => undefined | OUT_K | OUT_K[]`.
 *   It receives the item's value and its original key/index from the `source`. It returns the bucket key(s)
 *   the item belongs to, or `undefined` to ignore the item.
 * @returns A proxied object where keys are the bucket identifiers (`OUT_K`) and values are proxied Records
 *   (`Record<IN_K | number, IN_V>`) representing the buckets. Each bucket maps original source keys/indices
 *   to the items belonging to that bucket.
 *
 * @template OUT_K - The type of the keys used for the output buckets (string, number, or symbol).
 * @template IN_V - The type of the values in the source proxy.
 * @template IN_K - The type of the keys in the source proxy (if it's a Record).
 *
 * @example Grouping items by a property
 * ```typescript
 * interface Product { id: string; category: string; name: string; }
 * const products = proxy<Product[]>([
 *   { id: 'p1', category: 'Fruit', name: 'Apple' },
 *   { id: 'p2', category: 'Veg', name: 'Carrot' },
 *   { id: 'p3', category: 'Fruit', name: 'Banana' },
 * ]);
 *
 * // Partition products by category. Output keys are categories (string).
 * // Inner keys are original array indices (number).
 * const productsByCategory = partition(products, (product) => product.category);
 *
 * // Reactively show the data structure
 * dump(productsByCategory);
 *
 * // Make random changes to the categories, to show reactiveness
 * setInterval(() => products[0|(Math.random()*3)].category = ['Snack','Fruit','Veg'][0|(Math.random()*3)], 2000);
 * ```
 *
 * @example Item in multiple buckets
 * ```typescript
 * interface User { id: number; tags: string[]; name: string; }
 * const users = proxy({
 *   'u1': { name: 'Alice', tags: ['active', 'new'] },
 *   'u2': { name: 'Bob', tags: ['active'] }
 * });
 *
 * // Partition users by tag. Output keys are tags (string).
 * // Inner keys are original object keys (string: 'u1', 'u2').
 * const usersByTag = partition(users, (user) => user.tags);
 *
 * console.log(usersByTag);
 * ```
 */
export function partition<
	IN_K extends string | number | symbol,
	OUT_K extends string | number | symbol,
	IN_V,
>(
	source: Record<IN_K, IN_V>,
	func: (value: IN_V, key: KeyToString<IN_K>) => undefined | OUT_K | OUT_K[],
): Record<OUT_K, Record<KeyToString<IN_K>, IN_V>> {
	const unproxiedOut = {} as Record<OUT_K, Record<KeyToString<IN_K>, IN_V>>;
	const out = proxy(unproxiedOut);
	onEach(source, (item: IN_V, key: KeyToString<IN_K>) => {
		const rsp = func(item, key);
		if (rsp != null) {
			const buckets = rsp instanceof Array ? rsp : [rsp];
			if (buckets.length) {
				for (const bucket of buckets) {
					if (unproxiedOut[bucket]) out[bucket][key] = item;
					else out[bucket] = { [key]: item } as Record<KeyToString<IN_K>, IN_V>;
				}
				clean(() => {
					for (const bucket of buckets) {
						delete out[bucket][key];
						if (isObjEmpty(unproxiedOut[bucket])) delete out[bucket];
					}
				});
			}
		}
	});
	return out;
}

/**
 * Renders a live, recursive dump of a proxied data structure (or any value)
 * into the DOM at the current {@link $} insertion point.
 *
 * Uses `<ul>` and `<li>` elements to display object properties and array items.
 * Updates reactively if the dumped data changes. Primarily intended for debugging purposes.
 *
 * @param data - The proxied data structure (or any value) to display.
 * @returns The original `data` argument, allowing for chaining.
 * @template T - The type of the data being dumped.
 *
 * @example Dumping reactive state
 * ```typescript
 * import { $, proxy, dump } from 'aberdeen';
 *
 * const state = proxy({
 *   user: { name: 'Frank', kids: 1 },
 *   items: ['a', 'b']
 * });
 *
 * $('h2:Live State Dump');
 * dump(state);
 *
 * // Change state later, the dump in the DOM will update
 * setTimeout(() => { state.user.kids++; state.items.push('c'); }, 2000);
 * ```
 */
export function dump<T>(data: T): T {
	if (data && typeof data === "object") {
		$({ text: data instanceof Array ? "<array>" : "<object>" });
		$("ul", () => {
			onEach(data as any, (value, key) => {
				$(`li:${JSON.stringify(key)}: `, () => {
					dump(value);
				});
			});
		});
	} else {
		$({ text: JSON.stringify(data) });
	}
	return data;
}

/*
 * Helper functions
 */

/* c8 ignore start */
function internalError(code: number): never {
	throw new Error(`Aberdeen internal error ${code}`);
}
/* c8 ignore end */

function handleError(e: any, showMessage: boolean) {
	try {
		if (onError(e) === false) showMessage = false;
	} catch (e) {
		console.error(e);
	}
	try {
		if (showMessage) $("div.aberdeen-error:Error");
	} catch {
		// Error while adding the error marker to the DOM. Apparently, we're in
		// an awkward context. The error should already have been logged by
		// onError, so let's not confuse things by generating more errors.
	}
}

/** @internal */
export function withEmitHandler(
	handler: (
		target: TargetType,
		index: any,
		newData: DatumType,
		oldData: DatumType,
	) => void,
	func: () => void,
) {
	const oldEmitHandler = emit;
	emit = handler;
	try {
		func();
	} finally {
		emit = oldEmitHandler;
	}
}

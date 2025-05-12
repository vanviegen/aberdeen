// Meta-data is saved in-place on ReverseSorted items.
// - Items in the set should indicate they support {[ptr: ReverseSortedSetPointer]: SELF}
export type ReverseSortedSetPointer = symbol;

// ReverseSortedSet saves the skip links for all required levels on the object itself
type SkipItem<T> = { [idx: ReverseSortedSetPointer]: T };

/**
 * A set-like collection of objects that can do iteration sorted by a specified index property.
 * It also allows retrieving an object by its index property, and quickly getting the object
 * that comes immediately after a given object.
 *
 * It's implemented as a skiplist, maintaining all meta-data as part of the objects that it
 * is tracking, for performance.
 */
export class ReverseSortedSet<T extends SkipItem<T>> {
	// A fake item, that is not actually T, but *does* contain symbols pointing at the first item for each level.
	private tail: SkipItem<T>;
	// As every SkipList instance has its own symbols, an object can be included in more than one SkipList.
	private symbols: ReverseSortedSetPointer[];

	/**
	 * Create an empty SortedSet.
	 *
	 * @param keyProp The name of the property that should be used as the index of this collection. Comparison
	 * using `<` will be done on this property, so it should probably be a number or a string (or something that
	 * has a useful toString-conversion).
	 */
	constructor(private keyProp: string) {
		this.tail = {} as SkipItem<T>;
		this.symbols = [Symbol(0)];
	}

	/**
	 * Add an object to the `SortedSet`.
	 *
	 * @param item The object to be added to the set. One or more properties with
	 *  `Symbol` keys will be added to it, for `SortedSet` internals.
	 * @returns `true` if the item was added, or `false` if it was *not* added
	 *  because the item already was part of this set.
	 *
	 * Note that though an item object may only be part of a particular `SortedSet`
	 * once, index properties may be duplicate and an item object may be part of
	 * more than one `SortedSet`.
	 *
	 * **IMPORTANT:** After adding an object, do not modify its index property,
	 * as this will lead to undefined (broken) behavior on the entire set.
	 *
	 * Time complexity: O(log n)
	 */
	add(item: T): boolean {
		if (this.symbols[0] in item) return false; // Already included

		// Start at level 1. Keep upping the level by 1 with 1/8 chance.
		const level = 1 + (Math.clz32(Math.random() * 0xffffffff) >> 2);
		for (let l = this.symbols.length; l < level; l++)
			this.symbols.push(Symbol(l));

		const keyProp = this.keyProp;
		const key = (item as any)[keyProp];

		// prev is always a complete T, current might be tail only contain pointers
		let prev: T | undefined;
		let current: SkipItem<T> = this.tail;
		for (let l = this.symbols.length - 1; l >= 0; l--) {
			const symbol = this.symbols[l];
			while ((prev = current[symbol]) && (prev as any)[keyProp] > key)
				current = prev;
			if (l < level) {
				(item as SkipItem<T>)[symbol] = current[symbol];
				current[symbol] = item;
			}
		}

		return true; // Added
	}

	/**
	 * @param item An object to test for inclusion in the set.
	 * @returns true if this object item is already part of the set.
	 */
	has(item: T): boolean {
		return this.symbols[0] in item;
	}

	/**
	 * Remove and return the last item.
	 * @returns what was previously the last item in the sorted set, or `undefined` if the set was empty.
	 */
	fetchLast(): T | undefined {
		const item = this.tail[this.symbols[0]];
		if (item) {
			this.remove(item);
			return item;
		}
	}

	/**
	 * @returns whether the set is empty (`true`) or has at least one item (`false`).
	 */
	isEmpty(): boolean {
		return this.tail[this.symbols[0]] === undefined;
	}

	/**
	 * Retrieve an item object based on its index property value.
	 *
	 * @param indexValue The index property value to search for.
	 * @returns `undefined` if the index property value does not exist in the `SortedSet` or
	 *  otherwise the *first* item object that has this index value (meaning any further
	 *  instances can be iterated using `next()`).
	 *
	 * Time complexity: O(log n)
	 */
	get(indexValue: any): T | undefined {
		const keyProp = this.keyProp;

		// prev is always a complete T, current might be tail only contain pointers
		let prev: T | undefined;
		let current: SkipItem<T> = this.tail;
		for (let l = this.symbols.length - 1; l >= 0; l--) {
			const symbol = this.symbols[l];
			while ((prev = current[symbol]) && (prev as any)[keyProp] > indexValue)
				current = prev;
		}
		return (current[this.symbols[0]] as any)?.[keyProp] === indexValue
			? current[this.symbols[0]]
			: undefined;
	}

	/**
	 * The iterator will go through the items in reverse index-order.
	 */
	*[Symbol.iterator](): IterableIterator<T> {
		const symbol = this.symbols[0];
		let node = this.tail[symbol];
		while (node) {
			yield node;
			node = node[symbol];
		}
	}

	/**
	 * Given an item object, returns the one that comes right before in the set.
	 * @param item The object to start from.
	 * @returns The next object, or `undefined` if there is none.
	 *
	 * Time complexity: O(1)
	 */
	prev(item: T): T | undefined {
		return item[this.symbols[0]];
	}

	/**
	 * Remove an item object from the set, deleting all meta-data keys that
	 * were created on `add()`.
	 * @param item The object to be removed.
	 * @returns `true` on success or `false` when the item was not part of the set.
	 *
	 * Time complexity: O(log n)
	 */
	remove(item: T): boolean {
		if (!(this.symbols[0] in item)) return false;
		const keyProp = this.keyProp;
		const prop = (item as any)[keyProp];

		// prev is always a complete T, current might be tail only contain pointers
		let prev: T | undefined;
		let current: SkipItem<T> = this.tail;
		for (let l = this.symbols.length - 1; l >= 0; l--) {
			const symbol = this.symbols[l];
			while (
				(prev = current[symbol]) &&
				(prev as any)[keyProp] >= prop &&
				prev !== item
			)
				current = prev;
			if (prev === item) {
				(current as any)[symbol] = prev[symbol];
				delete prev[symbol];
			}
		}

		return prev === item;
	}

	/**
	 * Remove all items for the set.
	 *
	 * Time complexity: O(n)
	 */
	clear(): void {
		const symbol = this.symbols[0];
		let current = this.tail;
		while (current) {
			const prev = current[symbol];
			for (const symbol of this.symbols) {
				if (!(symbol in current)) break;
				delete current[symbol];
			}
			current = prev;
		}
		this.tail = {};
	}
}

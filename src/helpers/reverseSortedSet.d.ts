/**
 * A set-like collection of objects that can do iteration sorted by a specified index property.
 * It also allows retrieving an object by its index property, and quickly getting the object
 * that comes immediately after a given object.
 *
 * It's implemented as a skiplist, maintaining all meta-data as part of the objects that it
 * is tracking, for performance.
 */
export declare class ReverseSortedSet<T extends object> {
    private keyProp;
    private tail;
    private symbols;
    /**
     * Create an empty SortedSet.
     *
     * @param keyProp The name of the property that should be used as the index of this collection. Comparison
     * using `<` will be done on this property, so it should probably be a number or a string (or something that
     * has a useful toString-conversion).
     */
    constructor(keyProp: keyof T);
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
    add(item: T): boolean;
    /**
     * @param item An object to test for inclusion in the set.
     * @returns true if this object item is already part of the set.
     */
    has(item: T): boolean;
    /**
     * Remove and return the last item.
     * @returns what was previously the last item in the sorted set, or `undefined` if the set was empty.
     */
    fetchLast(): T | undefined;
    /**
     * @returns whether the set is empty (`true`) or has at least one item (`false`).
     */
    isEmpty(): boolean;
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
    get(indexValue: string | number): T | undefined;
    /**
     * The iterator will go through the items in reverse index-order.
     */
    [Symbol.iterator](): IterableIterator<T>;
    /**
     * Given an item object, returns the one that comes right before in the set.
     * @param item The object to start from.
     * @returns The next object, or `undefined` if there is none.
     *
     * Time complexity: O(1)
     */
    prev(item: T): T | undefined;
    /**
     * Remove an item object from the set, deleting all meta-data keys that
     * were created on `add()`.
     * @param item The object to be removed.
     * @returns `true` on success or `false` when the item was not part of the set.
     *
     * Time complexity: O(log n)
     */
    remove(item: T): boolean;
    /**
     * Remove all items for the set.
     *
     * Time complexity: O(n)
     */
    clear(): void;
}

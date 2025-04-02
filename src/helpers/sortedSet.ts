type Item<T> = T & {[idx: symbol]: Item<T>}

/**
 * A set-like collection of objects that can do iteration sorted by a specified index property.
 * It also allows retrieving an object by its index property, and quickly getting the object
 * that comes immediately after a given object.
 * 
 * It's implemented as a skiplist, maintaining all meta-data as part of the objects that it
 * is tracking, for performance.
 */
export class SortedSet<T extends object> {
    // A fake item, that is not actually T, but *does* contain symbols pointing at the first item for each level.
    private head: Item<T>
    // As every SkipList instance has its own symbols, an object can be included in more than one SkipList.
    private symbols: symbol[]

    /**
     * Create an empty SortedSet.
     * 
     * @param keyProp The name of the property that should be used as the index of this collection. Comparison
     * using `<` will be done on this property, so it should probably be a number or a string (or something that
     * has a useful toString-conversion).
     */
    constructor(private keyProp: keyof T) {
        this.head = {} as Item<T>
        this.symbols = [Symbol(0)]
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
        if (this.symbols[0] in item) return false // Already included

        // Start at level 1. Keep upping the level by 1 with 1/8 chance.
        const level = 1 + (Math.clz32(Math.random() * 0xFFFFFFFF) >> 2)
        for(let l = this.symbols.length; l < level; l++) this.symbols.push(Symbol(l))

        const keyProp = this.keyProp
        const key = item[keyProp]
    
        let next: Item<T> | undefined
        let current: Item<T> = this.head;
        for (let l = this.symbols.length-1; l>=0; l--) {
            const symbol = this.symbols[l]
            while ((next = current[symbol] as Item<T>) && next[keyProp] < key) current = next;
            if (l < level) {
                (item as any)[symbol] = current[symbol];
                (current as any)[symbol] = item;
            }
        }

        return true // Added
    }

    /**
     * @param item An object to test for inclusion in the set.
     * @returns true if this object item is already part of the set.
     */
    has(item: T): boolean {
        return this.symbols[0] in item;
    }

    /**
     * Remove and return the first item.
     * @returns what was previously the first item in the sorted set, or `undefined` if the set was empty.
     */
    fetchFirst(): T | undefined {
        let item = this.head[this.symbols[0]];
        if (item) {
            this.remove(item);
            return item;
        }
    }

    /**
     * @returns whether the set is empty (`true`) or has at least one item (`false`).
     */
    isEmpty(): boolean {
        return this.head[this.symbols[0]] === undefined;
    }

    /**
     * Find, remove and return all objects with the given index value.
     * @param indexValue The index value to search for.
     * @returns an array of all objects that were found and removed.
     * 
     * O(d + log n) where d is the number of items to be deleted. 
     */
    fetchByKey(indexValue: string|number): T[] {
        const keyProp = this.keyProp;
        
        let next: Item<T> | undefined;
        let current: Item<T> = this.head;
        let result: T[] = [];
        
        for (let l = this.symbols.length - 1; l >= 0; l--) {
            const symbol = this.symbols[l];
            while ((next = current[symbol] as Item<T>) && next[keyProp] < indexValue) current = next;
            while (next && next[keyProp] === indexValue) {
                (current as any)[symbol] = next[symbol];
                delete next[symbol];
                if (!l) result.push(next);
                next = (current as any)[symbol];
            }
        }

        return result;
    }

    /**
     * Like `add()`, but uses `makeKeyBetween` to automatically generate and set an
     * index value on `item` such that it will be inserted right after `pre`.
     * @param item The item to be added.
     * @param pre The item after which we must add the new one. If `undefined`,
     *  the new item will be inserted at the start.
     * @returns `true` if the item was added, or `false` if it was *not* added
     *  because the item already was part of this set.
     * 
     * **NOTE:** You probably shouldn't combine `addAfter` with regular `add` in
     *  a single set, unless you know what you're doing. Also, this function
     *  will generate (and assume) string-typed index values, so make sure that
     *  the `keyProp` points at a string property.
     *
     * Time complexity: O(log n)
     */
    addAfter(item: T, pre: T | undefined) {
        const post = (pre ? (pre as Item<T>) : this.head)[this.symbols[0]];
        item[this.keyProp] = makeKeyBetween(
            pre ? pre[this.keyProp] as string : undefined,
            post ? post[this.keyProp] as string : undefined
        ) as any;
        this.add(item);
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
    get(indexValue: string|number): T | undefined {
        const keyProp = this.keyProp
        let current = this.head;
        let next
        for (let l = this.symbols.length-1; l>=0; l--) {
            const symbol = this.symbols[l]
            while ((next = current[symbol] as Item<T>) && next[keyProp] < indexValue) current = next;
        }
        return current[this.symbols[0]]?.[keyProp] === indexValue ? current[this.symbols[0]] : undefined;
    }

    /**
     * The iterator will go through the items in index-order.
     */
    *[Symbol.iterator](): IterableIterator<T> {
        let symbol = this.symbols[0]
        let node: Item<T> | undefined = this.head[symbol] as Item<T>;
        while (node) {
            yield node;
            node = node[symbol] as Item<T> | undefined;
        }
    }

    /**
     * Given an item object, returns the one that comes right after in the set.
     * @param item The object to start from.
     * @returns The next object, or `undefined` if there is none.
     * 
     * Time complexity: O(1)
     */
    next(item: T): T | undefined {
        return (item as Item<T>)[this.symbols[0]]
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
        const keyProp = this.keyProp
        const prop = item[keyProp];
        
        let next: Item<T> | undefined
        let current: Item<T> = this.head;
        
        for (let l = this.symbols.length - 1; l >= 0; l--) {
            const symbol = this.symbols[l];
            while ((next = current[symbol] as Item<T>) && next[keyProp] <= prop && next !== item) current = next
            if (next === item) {
                (current as any)[symbol] = next[symbol]
                delete next[symbol]
            }
        }

        return next === item
    }

    /**
     * Remove all items for the set.
     *
     * Time complexity: O(n)
     */    
    clear(): void {
        const symbol = this.symbols[0];
        let current: Item<T> | undefined = this.head;
        while (current) {
            const next = current[symbol] as Item<T> | undefined
            for (const symbol of this.symbols) {
                if (!(symbol in current)) break
                delete current[symbol];
            }
            current = next
        }
        this.head = {} as Item<T>;
    }
}

const CHAR_START = 48; // ASCI '0', inclusive
const CHAR_END = 127; // ASCI DEL, exclusive
/**
 * Generate a string key that sorts (using the standard comparisons operators)
 * inbetween `preKey` and `postKey`.
 * @param preKey The result string must be `>` than this string. Can be left empty.
 *   Only ASCI characters between '0' and '~' (inclusive) may be used.
 * @param postKey The result string must be `<` than this string. Can be left empty.
 *   Only ASCI characters between '0' and '~' (inclusive) may be used.
 * @returns The generated string.
 * @throws an `Error` when the `postKey` is `<=` the `preKey` or when `postKey` is the
 *  smallest possible key (`"0"`).
 */
export function makeKeyBetween(preKey: string | undefined, postKey: string | undefined) {
    const pre = preKey ? preKey.split('').map(ch => ch.charCodeAt(0)) : [];
    const post = postKey ? postKey.split('').map(ch => ch.charCodeAt(0)) : [CHAR_END];
    const result = [];
    let postHasBiggerPrefix = false;
    for(let i=0; true; i++) {
        const preCh = pre[i] || CHAR_START;
        const postCh = postHasBiggerPrefix ? CHAR_END : (post[i] || CHAR_START - 1);
        if (preCh == postCh) { // Same prefix, go the next char
            result.push(preCh)
        } else if (preCh < postCh - 1) { // There's a character available inbetween, we're done!
            result.push((preCh+postCh)>>1);
            break
        } else if (preCh < postCh) { // Characters are adjacent
            result.push(preCh);
            postHasBiggerPrefix = true;
        } else {
            throw new Error(`Invalid pre ${preKey} and post ${postKey}`);
        }

    }
    return String.fromCharCode(...result);
}

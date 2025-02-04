type Item<T> = T & {[idx: symbol]: Item<T>}

export class SkipList<T extends object> {
    // A fake item, that is not actually T, but *does* contain symbols pointing at the first item for each level.
    private head: Item<T>
    // As every SkipList instance has its own symbols, an object can be included in more than one SkipList.
    private symbols: symbol[]

    constructor(private keyProp: keyof T) {
        this.head = {} as Item<T>
        this.symbols = [Symbol(0)]
    }

    add(item: T): boolean {
        if (this.symbols[0] in item) return false // Already included

        // Start at level 1. Keep upping the level by 1 with 1/4 chance.
        const level = 1 + (Math.clz32(Math.random() * 0xFFFFFFFF) >> 1)
        for(let l = this.symbols.length; l < level; l++) this.symbols.push(Symbol(l))

        const keyProp = this.keyProp
        const key = item[keyProp]
    
        let next: Item<T> | undefined
        let current: Item<T> = this.head;
        for (let l = this.symbols.length-1; l>=0; l--) {
            const symbol = this.symbols[l]
            while ((next = current[symbol] as Item<T>) && next[keyProp] < key) current = next;
            (item as any)[symbol] = current[symbol];
            (current as any)[symbol] = item;
        }

        return true // Added
    }

    get(key: string|number): T | undefined {
        const keyProp = this.keyProp
        let current = this.head;
        let next
        for (let l = this.symbols.length-1; l>=0; l--) {
            const symbol = this.symbols[l]
            while ((next = current[symbol] as Item<T>) && next[keyProp] < key) current = next;
        }
        return current[this.symbols[0]]?.[keyProp] === key ? current[this.symbols[0]] : undefined;
    }

    *[Symbol.iterator](): IterableIterator<T> {
        let symbol = this.symbols[0]
        let node: Item<T> | undefined = this.head[symbol] as Item<T>;
        while (node) {
            yield node;
            node = node[symbol] as Item<T> | undefined;
        }
    }

    next(item: T): T | undefined {
        return (item as Item<T>)[this.symbols[0]]
    }

    has(item: T): boolean {
        return this.symbols[0] in item
    }

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

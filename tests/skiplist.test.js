import { expect, test, beforeEach } from "bun:test";
import { SkipList } from "../src/skiplist.ts"
let list;
beforeEach(() => {
    list = new SkipList('id');
});

// Basic operations
test('add and get single item', () => {
    const item = { id: 1 };
    list.add(item);
    expect(list.get(1)).toBe(item);
});

test('return undefined for non-existent item', () => {
    expect(list.get(1)).toBeUndefined();
});

test('detect if item exists', () => {
    const item = { id: 1 };
    expect(list.has(item)).toBe(false);
    list.add(item);
    expect(list.has(item)).toBe(true);
});

test('remove existing item', () => {
    const item = { id: 1 };
    list.add(item);
    expect(list.remove(item)).toBe(true);
    expect(list.get(1)).toBeUndefined();
});

test('handle removing non-existent item', () => {
    const item = { id: 1 };
    expect(list.remove(item)).toBe(false);
});

test('handle duplicate adds', () => {
    const item = { id: 1 };
    expect(list.add(item)).toBe(true);
    expect(list.add(item)).toBe(false);
    expect([...list].length).toBe(1)
    expect(list.remove(item)).toBe(true);
    expect([...list].length).toBe(0)
});

test('maintain order with negative ids', () => {
    const items = [{ id: -2 }, { id: 0 }, { id: 1 }, { id: -1 },];
    items.forEach(item => list.add(item));
    expect([...list].map(i => i.id)).toEqual([-2, -1, 0, 1]);
});

// Larger quantities
test('maintain sorted order with many items', () => {
    // 100,000 items takes about 65ms. 1,000,000 items takes about 750ms. scales pretty well! 
    const items = Array.from({length: 100000}, (_, i) => ({ id: i }));
    // Add in random order
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    shuffled.forEach(item => list.add(item));
    
    // Verify order
    expect([...list].map(i => i.id)).toEqual(items.map(i => i.id));
});

test('clear all items', () => {
    const items = Array.from({length: 10}, (_, i) => ({ id: i }));
    items.forEach(item => list.add(item));
    
    list.clear();
    items.forEach(item => {
        expect(list.has(item)).toBe(false);
        expect(list.get(item.id)).toBeUndefined();
    });
});

test('handle sparse ids', () => {
    const items = [
        { id: 0 },
        { id: 1000 },
        { id: 100 },
        { id: 10000 }
    ];
    items.forEach(item => list.add(item));
    expect([...list].map(i => i.id)).toEqual([0, 100, 1000, 10000]);
});
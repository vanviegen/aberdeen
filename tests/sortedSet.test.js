import { expect, test, beforeEach } from "bun:test";
import { SortedSet, makeKeyBetween } from "../src/sortedSet.ts"


expect.extend({
    toBeBetween: function(actual, floor, ceiling) {
        const pass = actual > floor && actual < ceiling;
        return {
            pass,
            message: () => `expected ${this.utils.printReceived(actual,)} ${pass ? 'not ' : ''}to be within range ${this.utils.printExpected(`${floor} - ${ceiling}`)}`
        }
    }
});

let list;
beforeEach(() => {
    list = new SortedSet('id');
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

test('makeKeyBetween', () => {
    expect(makeKeyBetween('a', 'c')).toBe('b');

    expect(makeKeyBetween('a', 'b')).toBeBetween('a', 'b');
    expect(makeKeyBetween('a', 'b')).toHaveLength(2);

    expect(makeKeyBetween(undefined, 'x')).toBeBetween('0', 'x');
    expect(makeKeyBetween(undefined, 'x')).toHaveLength(1);

    expect(makeKeyBetween('x', undefined)).toBeBetween('x', "\x7f");
    expect(makeKeyBetween('x', undefined)).toHaveLength(1);

    expect(makeKeyBetween('xya', 'xyc')).toBe('xyb');

    expect(makeKeyBetween('xya~~~', 'xybZ')).toBeBetween('xya~~~', 'xybZ');

    // Nothing can come before this
    expect(() => makeKeyBetween(undefined, "0")).toThrow("Invalid pre");
    expect(() => makeKeyBetween("b", "b")).toThrow("Invalid pre");
    expect(() => makeKeyBetween("b", "a")).toThrow("Invalid pre");

    
})

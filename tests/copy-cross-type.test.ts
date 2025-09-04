import { expect, test } from "bun:test";
import { copy, proxy, MERGE } from "../src/aberdeen";

test('copy supports copying from object to Map', () => {
    const dest = proxy(new Map());
    const source = { x: 3, y: 4 };
    
    copy(dest, source);
    
    expect(dest.get('x')).toBe(3);
    expect(dest.get('y')).toBe(4);
    expect(dest.size).toBe(2);
});

test('copy supports copying from Map to object', () => {
    const dest = proxy({} as Record<string, number>);
    const source = new Map([['x', 3], ['y', 4]]);
    
    copy(dest, source);
    
    expect(dest.x).toBe(3);
    expect(dest.y).toBe(4);
    expect(Object.keys(dest)).toEqual(['x', 'y']);
});

test('copy with MERGE from object to Map preserves existing entries', () => {
    const dest = proxy(new Map([['a', 1], ['b', 2]]));
    const source = { x: 3, y: 4 };
    
    copy(dest, source, MERGE);
    
    expect(dest.get('a')).toBe(1); // preserved
    expect(dest.get('b')).toBe(2); // preserved
    expect(dest.get('x')).toBe(3); // added
    expect(dest.get('y')).toBe(4); // added
    expect(dest.size).toBe(4);
});

test('copy with MERGE from Map to object preserves existing properties', () => {
    const dest = proxy({ a: 1, b: 2 } as Record<string, number>);
    const source = new Map([['x', 3], ['y', 4]]);
    
    copy(dest, source, MERGE);
    
    expect(dest.a).toBe(1); // preserved
    expect(dest.b).toBe(2); // preserved
    expect(dest.x).toBe(3); // added
    expect(dest.y).toBe(4); // added
    expect(Object.keys(dest).sort()).toEqual(['a', 'b', 'x', 'y']);
});

test('copy without MERGE from object to Map replaces all entries', () => {
    const dest = proxy(new Map([['a', 1], ['b', 2]]));
    const source = { x: 3, y: 4 };
    
    copy(dest, source);
    
    expect(dest.has('a')).toBe(false); // removed
    expect(dest.has('b')).toBe(false); // removed
    expect(dest.get('x')).toBe(3); // added
    expect(dest.get('y')).toBe(4); // added
    expect(dest.size).toBe(2);
});

test('copy without MERGE from Map to object replaces all properties', () => {
    const dest = proxy({ a: 1, b: 2 } as Record<string, number>);
    const source = new Map([['x', 3], ['y', 4]]);
    
    copy(dest, source);
    
    expect('a' in dest).toBe(false); // removed
    expect('b' in dest).toBe(false); // removed
    expect(dest.x).toBe(3); // added
    expect(dest.y).toBe(4); // added
    expect(Object.keys(dest)).toEqual(['x', 'y']);
});

test('copy handles nested objects from object to Map', () => {
    const dest = proxy(new Map());
    const source = { 
        user: { name: 'John', age: 30 }, 
        settings: { theme: 'dark' } 
    };
    
    copy(dest, source);
    
    expect(dest.get('user')).toEqual({ name: 'John', age: 30 });
    expect(dest.get('settings')).toEqual({ theme: 'dark' });
    expect(dest.size).toBe(2);
});

test('copy handles nested objects from Map to object', () => {
    const dest = proxy({} as Record<string, any>);
    const source = new Map([
        ['user', { name: 'John', age: 30 }],
        ['settings', { theme: 'dark' }]
    ]);
    
    copy(dest, source);
    
    expect(dest.user).toEqual({ name: 'John', age: 30 });
    expect(dest.settings).toEqual({ theme: 'dark' });
    expect(Object.keys(dest)).toEqual(['user', 'settings']);
});

test('copy type checking allows Map to object copying', () => {
    // This test primarily verifies TypeScript compilation
    const myMap = new Map([['x', 3]]);
    const myObj: Record<string, number> = {};
    
    // This should compile without TypeScript errors
    copy(myObj, myMap);
    copy(myMap, myObj);
    copy(myMap, { x: 3 });
    copy(myObj, new Map([['y', 4]]));
    
    expect(true).toBe(true); // If we get here, types compiled correctly
});

test('copy with undefined values from object to Map', () => {
    const dest = proxy(new Map([['existing', 1]]));
    const source = { x: 3, y: undefined };
    
    copy(dest, source, MERGE);
    
    expect(dest.get('existing')).toBe(1); // preserved
    expect(dest.get('x')).toBe(3); // added
    expect(dest.has('y')).toBe(false); // undefined values should delete entries in MERGE mode
});

test('copy with undefined values from Map to object', () => {
    const dest = proxy({ existing: 1 } as Record<string, number | undefined>);
    const source = new Map([['x', 3], ['y', undefined]]);
    
    copy(dest, source, MERGE);
    
    expect(dest.existing).toBe(1); // preserved
    expect(dest.x).toBe(3); // added
    expect('y' in dest).toBe(false); // undefined values should delete properties in MERGE mode
});

test('copy maintains object prototype when copying from Map', () => {
    class MyClass {
        method() { return 'test'; }
    }
    const dest = proxy(new MyClass() as MyClass & Record<string, number>);
    const source = new Map([['x', 3], ['y', 4]]);
    
    copy(dest, source);
    
    expect(dest.x).toBe(3);
    expect(dest.y).toBe(4);
    expect(dest.method()).toBe('test'); // prototype method should still work
    expect(dest instanceof MyClass).toBe(true);
});

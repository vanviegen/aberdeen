import { expect, test } from "bun:test";
import A from "../src/aberdeen";
import { passTime } from "./helpers";

test('A.copy replaces object values', () => {
    let data = A.proxy({a: 1, b: 2} as Record<string, number>);
    A.copy(data, {b: 3, c: 4});
    expect(data).toEqual({b: 3, c: 4});
});  

test('A.copy merges objects', () => {
    let data = A.proxy({a: 1, b: 2} as Record<string, number>);
    A.merge(data, {b: 3, c: 4});
    expect(data).toEqual({a: 1, b: 3, c: 4});
});

test('A.clone stores and retrieves deep trees', async () => {
    const obj = {a: {b: {c: {d: {e: {f: {g: 5}}}}}}} as any;
    let data = A.proxy({...obj});
    let result: any;
    let cnt = 0;
    
    A(() => {
        result = A.clone(data);
        cnt++;
    });
    
    expect(result).toEqual(obj);
    
    A.copy(data, {});
    await passTime();
    expect(result).toEqual({});
    
    A.copy(data, obj);
    await passTime();
    expect(result).toEqual(obj);
    expect(cnt).toEqual(3);
    
    A.copy(data, obj); // no change!
    await passTime();
    expect(result).toEqual(obj);
    expect(cnt).toEqual(3); // should not have fired again
});

test('A.copy merges deep trees', () => {
    let data = A.proxy({a: 3, b: {h: 4, i: {l: 5, m: 6}}} as any);
    A.merge(data, {c: 7, b: {j: 8, i: {n: 9}}});
    expect(data).toEqual({a: 3, c: 7, b: {h: 4, j: 8, i: {l: 5, n: 9, m: 6}}});
    
    A.merge(data, {d: 10, b: {k: 11, i: {o: 12}}});
    expect(data).toEqual({a: 3, c: 7, d: 10, b: {h: 4, j: 8, k: 11, i: {l: 5, n: 9, o: 12, m: 6}}});
    
    A.copy(data, {b: {}});
    expect(data).toEqual({b: {}});
});

test('A.copy goes deep by default', () => {
    let a: any = {x: 3, y: {a: 1}};
    let b = {z: 5};
    A.copy(b, a);
    expect(b).toEqual(a);
    a.y.a++;
    expect(b).toEqual({x: 3, y: {a: 1}} as any);
});

test('A.copy and A.clone preserve types', () => {
    expect(A.clone([])).toBeInstanceOf(Array);
    class X {}
    let dst = {x: 3} as any;
    A.copy(dst, {y: new X()})
    expect(dst.y).toBeInstanceOf(X);
});

test('A.copy refuses to work between different types', () => {
    // Unfortinately TypeScript thinks this is ok..
    expect(() => A.copy({}, [3])).toThrow();
    // // @ts-expect-error
    expect(() => A.copy([], {})).toThrow();
    // @ts-expect-error
    expect(() => A.copy({}, new Map())).toThrow();
    // @ts-expect-error
    expect(() => A.copy(new Map(), {})).toThrow();

    let obj = {x: [5]};
    A.copy(obj, 'x', [3,4]);
    expect(obj.x).toEqual([3,4]);
    // @ts-expect-error -- typescript should complain, but runtime should work
    A.copy(obj, 'x', {y: 4});
    expect(obj.x).toEqual({y: 4});
    // @ts-expect-error -- typescript should complain, but runtime should work
    A.copy(obj, 'x', new Map());
    expect(obj.x).toBeInstanceOf(Map);
});

test('A.copy triggers A.isEmpty reactivity when clearing object', async () => {
    let data = A.proxy({a: 1, b: 2, c: 3} as Record<string, number>);
    let empty = false;
    let cnt = 0;
    
    A(() => {
        empty = A.isEmpty(data);
        cnt++;
    });
    
    expect(empty).toBe(false);
    expect(cnt).toBe(1);
    
    // Clear the object using A.copy
    A.copy(data, {});
    await passTime();
    
    expect(empty).toBe(true);
    expect(cnt).toBe(2);
    expect(Object.keys(data).length).toBe(0);
});

test('A.clone subscribes to all deeply nested values', async () => {
    // This tests the bug where A.clone() didn't subscribe to nested values
    // when the nested object didn't exist in the destination (e.g., during initial cloning)
    let data = A.proxy({a: {b: {c: {d: 1}}}}) as any;
    let result: any;
    let cnt = 0;
    
    A(() => {
        result = A.clone(data);
        cnt++;
    });
    
    expect(result).toEqual({a: {b: {c: {d: 1}}}});
    expect(cnt).toBe(1);
    
    // Modify the deeply nested value
    data.a.b.c.d = 2;
    await passTime();
    
    expect(result).toEqual({a: {b: {c: {d: 2}}}});
    expect(cnt).toBe(2); // Should have re-run because we subscribed to the nested value
});


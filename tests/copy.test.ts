import { expect, test } from "bun:test";
import { $, proxy, copy, merge, clone } from "../src/aberdeen";
import { passTime } from "./helpers";

test('copy replaces object values', () => {
    let data = proxy({a: 1, b: 2} as Record<string, number>);
    copy(data, {b: 3, c: 4});
    expect(data).toEqual({b: 3, c: 4});
});  

test('copy merges objects', () => {
    let data = proxy({a: 1, b: 2} as Record<string, number>);
    merge(data, {b: 3, c: 4});
    expect(data).toEqual({a: 1, b: 3, c: 4});
});

test('clone stores and retrieves deep trees', async () => {
    const obj = {a: {b: {c: {d: {e: {f: {g: 5}}}}}}} as any;
    let data = proxy({...obj});
    let result: any;
    let cnt = 0;
    
    $(() => {
        result = clone(data);
        cnt++;
    });
    
    expect(result).toEqual(obj);
    
    copy(data, {});
    await passTime();
    expect(result).toEqual({});
    
    copy(data, obj);
    await passTime();
    expect(result).toEqual(obj);
    expect(cnt).toEqual(3);
    
    copy(data, obj); // no change!
    await passTime();
    expect(result).toEqual(obj);
    expect(cnt).toEqual(3); // should not have fired again
});

test('copy merges deep trees', () => {
    let data = proxy({a: 3, b: {h: 4, i: {l: 5, m: 6}}} as any);
    merge(data, {c: 7, b: {j: 8, i: {n: 9}}});
    expect(data).toEqual({a: 3, c: 7, b: {h: 4, j: 8, i: {l: 5, n: 9, m: 6}}});
    
    merge(data, {d: 10, b: {k: 11, i: {o: 12}}});
    expect(data).toEqual({a: 3, c: 7, d: 10, b: {h: 4, j: 8, k: 11, i: {l: 5, n: 9, o: 12, m: 6}}});
    
    copy(data, {b: {}});
    expect(data).toEqual({b: {}});
});

test('copy goes deep by default', () => {
    let a: any = {x: 3, y: {a: 1}};
    let b = {z: 5};
    copy(b, a);
    expect(b).toEqual(a);
    a.y.a++;
    expect(b).toEqual({x: 3, y: {a: 1}} as any);
});

test('copy and clone preserve types', () => {
    expect(clone([])).toBeInstanceOf(Array);
    class X {}
    let dst = {x: 3} as any;
    copy(dst, {y: new X()})
    expect(dst.y).toBeInstanceOf(X);
});

test('copy refuses to work between different types', () => {
    // Unfortinately TypeScript thinks this is ok..
    expect(() => copy({}, [3])).toThrow();
    // // @ts-expect-error
    expect(() => copy([], {})).toThrow();
    // @ts-expect-error
    expect(() => copy({}, new Map())).toThrow();
    // @ts-expect-error
    expect(() => copy(new Map(), {})).toThrow();

    let obj = {x: [5]};
    copy(obj, 'x', [3,4]);
    expect(obj.x).toEqual([3,4]);
    // @ts-expect-error -- typescript should complain, but runtime should work
    copy(obj, 'x', {y: 4});
    expect(obj.x).toEqual({y: 4});
    // @ts-expect-error -- typescript should complain, but runtime should work
    copy(obj, 'x', new Map());
    expect(obj.x).toBeInstanceOf(Map);
});

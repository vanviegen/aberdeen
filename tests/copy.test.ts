import { expect, test } from "bun:test";
import { $, proxy, copy, MERGE, SHALLOW, clone } from "../src/aberdeen";
import { asyncPassTime } from "./helpers";

test('copy replaces object values', () => {
    let data = proxy({a: 1, b: 2} as Record<string, number>);
    copy(data, {b: 3, c: 4});
    expect(data).toEqual({b: 3, c: 4});
});  

test('copy merges objects', () => {
    let data = proxy({a: 1, b: 2} as Record<string, number>);
    copy(data, {b: 3, c: 4}, MERGE);
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
    await asyncPassTime();
    expect(result).toEqual({});
    
    copy(data, obj);
    await asyncPassTime();
    expect(result).toEqual(obj);
    expect(cnt).toEqual(3);
    
    copy(data, obj); // no change!
    await asyncPassTime();
    expect(result).toEqual(obj);
    expect(cnt).toEqual(3); // should not have fired again
});

test('copy merges deep trees', () => {
    let data = proxy({a: 3, b: {h: 4, i: {l: 5, m: 6}}} as any);
    copy(data, {c: 7, b: {j: 8, i: {n: 9}}}, MERGE);
    expect(data).toEqual({a: 3, c: 7, b: {h: 4, j: 8, i: {l: 5, n: 9, m: 6}}});
    
    copy(data, {d: 10, b: {k: 11, i: {o: 12}}}, MERGE);
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

test('copy can be shallow', () => {
    let a: any = {x: 3, y: {a: 1}};
    let b = {z: 5};
    copy(b, a, SHALLOW);
    expect(b).toEqual(a);
    a.y.a++;
    expect(b).toEqual({x: 3, y: {a: 2}} as any);
});

test('copy and clone preserve types', () => {
    expect(clone([])).toBeInstanceOf(Array);
    class X {}
    let dst = {x: 3} as any;
    copy(dst, {y: new X()})
    expect(dst.y).toBeInstanceOf(X);
});

// TODO: tests for emit and subscribe behavior

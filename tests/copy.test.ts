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
    // Unfortunately TypeScript thinks this is ok..
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
    // @ts-expect-error -- typescript should complain, but runtime should work
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

test('OPAQUE=true prevents proxying and reactive tracking', async () => {
    const inner = { x: 1 } as any;
    inner[A.OPAQUE] = true;
    const state = A.proxy({ obj: inner });

    // state.obj should be the raw object — not wrapped in a proxy
    expect(state.obj).toBe(inner);

    // Reading state.obj.x should NOT create a reactive dependency
    let cnt = 0;
    A(() => { (state.obj as any).x; cnt++; });
    expect(cnt).toBe(1);
    inner.x = 2;
    await passTime();
    expect(cnt).toBe(1); // scope did not re-run

    // A.clone returns the same reference, not a deep copy
    expect((A.clone(state) as any).obj).toBe(inner);
});

test('Temporal types are marked OPAQUE and not proxied', async () => {
    // Bun lacks a real Temporal; tests/setup.ts installs a brand-checking mock.
    const Temporal = (globalThis as any).Temporal;
    const dur = new Temporal.Duration(10);

    // Proxying a Temporal value returns the raw object, not a proxy. Without the
    // opaque marking this would be a proxy, and calling a method on it would
    // throw (the proxy doesn't carry the type's internal brand/slots).
    const $x = A.proxy(dur);
    expect($x).toBe(dur);
    expect($x.toString()).toBe('[Temporal.Duration]');

    // The same holds when nested inside a reactive object...
    const state = A.proxy({ when: dur });
    expect(state.when).toBe(dur);
    expect(state.when.toString()).toBe('[Temporal.Duration]');

    // ...and clone returns it by reference rather than deep-copying.
    expect((A.clone(state) as any).when).toBe(dur);
});

test('OPAQUE=false prevents deep-copy but still allows reactive tracking', async () => {
    const inner = { x: 1 } as any;
    inner[A.OPAQUE] = false;
    const state = A.proxy({ obj: inner });

    // state.obj should be a proxy wrapping inner
    expect(A.unproxy(state.obj)).toBe(inner);

    // Reading state.obj.x SHOULD create a reactive dependency
    let result = 0;
    let cnt = 0;
    A(() => { result = (state.obj as any).x; cnt++; });
    expect(cnt).toBe(1);
    expect(result).toBe(1);

    (state.obj as any).x = 2;
    await passTime();
    expect(cnt).toBe(2); // scope re-ran
    expect(result).toBe(2);

    // A.clone still returns the inner object by reference (not deep-copied)
    expect((A.clone(state) as any).obj).toBe(inner);
});


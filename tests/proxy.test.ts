import { expect, test } from "bun:test";
import { assertBody, asyncPassTime, assertDomUpdates, assertThrow, getBody, passTime } from "./helpers";
import $ from "../src/aberdeen";

test('proxy holds basic types', async () => {
  let proxied = $.proxy(undefined as any);
  for(let val of [false, true, 'x', null, undefined, 123, -10.1]) {
    proxied.value = val;
    expect(proxied.value).toEqual(val);
  }
});

test('proxy stores and modifies objects', () => {
  let data = $.proxy({a: 1, b: 2} as Record<string, number>);
  data.c = 3;
  expect(data).toEqual({a: 1, b: 2, c: 3});
});

test('proxy does not duplicate data', () => {
  let org = {a: 1};
  let data = $.proxy(org);
  expect(data).toEqual(org);
  expect(data !== org).toBe(true);
  (org as any).b = 2;
  expect(data).toEqual({a: 1, b: 2});
});

test('proxy stores and modifies arrays', () => {
  let data = $.proxy(['a', 'b'] as (string|undefined)[]);
  data[3] = 'c';
  expect([...data]).toEqual(['a', 'b', , 'c']);
});

test('proxy merges objects', () => {
  let data = $.proxy({a: 1, b: 2} as Record<string, number>);
  $.merge(data, {b: 3, c: 4});
  expect(data).toEqual({a: 1, b: 3, c: 4});
});

test('proxy stores nested objects', () => {
  let obj = {a: 1, b: 2, c: {d: 3, e: {f: 4}}};
  let data = $.proxy(obj);
  expect(data).toEqual(obj);
  
  let data2 = $.proxy(obj);
  $.set(data2, obj);
  expect(data2).toEqual(obj);
});

test('proxy replaces object values on set', () => {
  let data = $.proxy({a: 1, b: 2} as Record<string, number>);
  $.set(data, {b: 3, c: 4});
  expect(data).toEqual({b: 3, c: 4});
});

test('proxy references nested values', () => {
  let obj = {a: 1, b: 2, c: {d: 3, e: {f: 4}}} as any;
  let data = $.proxy(obj);
  expect(data.c.e.f).toEqual(4);
  
  data.c.e = undefined;
  data.b = 5;
  expect(data).toEqual({a: 1, b: 5, c: {d: 3, e: undefined}});
});

test('proxy creates unresolved references', () => {
  let data = $.proxy({a: {b: {c: {d: {e: 42}}}}} as any);
  expect(data.a.b.c.d).toEqual({e: 42});
  
  data.a.b.x = {y: 31331};
  expect(data.a.b.x.y).toEqual(31331);
  expect(data).toEqual({a: {b: {c: {d: {e: 42}}, x: {y: 31331}}}});
});

test('proxy stores and retrieves deep trees', async () => {
  let obj = {a: {b: {c: {d: {e: {f: {g: 5}}}}}}} as any;
  let data = $.proxy({...obj});
  let result: any;
  let cnt = 0;
  
  $.mount(document.body, () => {
    result = {...data};
    cnt++;
  });
  
  expect(result).toEqual(obj);
  
  $.set(data, {});
  await asyncPassTime();
  expect(result).toEqual({});
  
  $.set(data, {...obj});
  await asyncPassTime();
  expect(result).toEqual(obj);
  expect(cnt).toEqual(3);
  
  $.set(data, {...obj}); // no change!
  await asyncPassTime();
  expect(result).toEqual(obj);
  expect(cnt).toEqual(3); // should not have fired again
});

test('proxy merges deep trees', () => {
  let data = $.proxy({a: 3, b: {h: 4, i: {l: 5, m: 6}}} as any);
  $.merge(data, {c: 7, b: {j: 8, i: {n: 9}}});
  expect(data).toEqual({a: 3, c: 7, b: {h: 4, j: 8, i: {l: 5, n: 9, m: 6}}});
  
  $.merge(data, {d: 10, b: {k: 11, i: {o: 12}}});
  expect(data).toEqual({a: 3, c: 7, d: 10, b: {h: 4, j: 8, k: 11, i: {l: 5, n: 9, o: 12, m: 6}}});
  
  $.set(data, {b: {}});
  expect(data).toEqual({b: {}});
});

test('proxy pushes into arrays', () => {
  let data = $.proxy([1, 2]);
  data.push(3);
  data.push(4);
  expect([...data]).toEqual([1, 2, 3, 4]);
  
  let data2 = $.proxy([] as number[]);
  data2.push(1);
  data2.push(2);
  expect([...data2]).toEqual([1, 2]);
});

test('proxy links objects to each other', () => {
  let data1 = $.proxy({a: 1, b: 2} as Record<string, number>);
  let data2 = $.proxy({x: data1, y: 3});
  expect(data2).toEqual({x: {a: 1, b: 2}, y: 3});
  
  data1.b = 200;
  expect(data2).toEqual({x: {a: 1, b: 200}, y: 3});
});

test('proxy reactively links objects to each other', async () => {
  let data1 = $.proxy({a: 1, b: 2} as Record<string, number>);
  let data2: any;
  
  $.observe(() => {
    data2 = $.proxy({x: data1, y: 3});
  });
  
  expect(data2).toEqual({x: {a: 1, b: 2}, y: 3});
  
  data1.b = 200;
  expect(data2).toEqual({x: {a: 1, b: 200}, y: 3});
  
  $.set(data1, {});
  await asyncPassTime();
  expect(data2).toEqual({x: {}, y: 3});
});

test('proxy can modify values', () => {
  let data = $.proxy(21);
  data.value = data.value * 2;
  expect(data.value).toEqual(42);
  
  let objData = $.proxy({num: 42, str: 'x'} as {num: number, str: string});
  objData.str += 'y';
  expect(objData).toEqual({num: 42, str: 'xy'});
});

test('proxy materializes non-existent deep trees', () => {
  let data = $.proxy({} as any);
  data.a = {b: {c: {d: 42}}};
  expect(data.g?.h?.i?.j).toEqual(undefined);
  expect(data).toEqual({a: {b: {c: {d: 42}}}});
});

test('proxy reacts on materializing deep trees', async () => {
  let data = $.proxy({} as any);
  let deepValue: any;
  
  $.observe(() => {
    deepValue = data.a?.b;
  });
  
  await asyncPassTime();
  expect(deepValue).toEqual(undefined);
  
  data.a = {b: 42};
  await asyncPassTime();
  expect(deepValue).toEqual(42);
});

test('proxies support all basic types', () => {
  // Test number
  const numProxy = $.proxy(123);
  expect(numProxy.value).toEqual(123);
  
  // Test string
  const strProxy = $.proxy("hi");
  expect(strProxy.value).toEqual("hi");
  
  // Test object
  const objProxy = $.proxy({a: 1, b: 2});
  expect(objProxy.a).toEqual(1);
  expect(objProxy.b).toEqual(2);
  
  // Test array
  const arrProxy = $.proxy([1, 2, 3]);
  expect(arrProxy[0]).toEqual(1);
  expect(arrProxy.length).toEqual(3);
  
  // Test boolean
  const boolProxy = $.proxy(false);
  expect(boolProxy.value).toEqual(false);
  
  // Test null
  const nullProxy = $.proxy(null);
  expect(nullProxy.value).toEqual(null);
  
  // Test undefined
  const undefinedProxy = $.proxy({value: undefined});
  expect(undefinedProxy.value).toEqual(undefined);
  
  // Test function
  const func = function() { return 42; };
  const funcProxy = $.proxy({fn: func});
  expect(typeof funcProxy.fn).toEqual('function');
  expect(funcProxy.fn()).toEqual(42);
});

test('proxy supports array methods', () => {
  const arr = $.proxy([1, 2, 3, 4, 5]);
  
  // Test filter
  const filtered = arr.filter(item => item > 2);
  expect([...filtered]).toEqual([3, 4, 5]);
  
  // Test map
  const mapped = arr.map(item => item * 2);
  expect([...mapped]).toEqual([2, 4, 6, 8, 10]);
  
  // Test splice
  arr.splice(1, 2, 10, 20);
  expect([...arr]).toEqual([1, 10, 20, 4, 5]);
  
  // Test push
  arr.push(6);
  expect([...arr]).toEqual([1, 10, 20, 4, 5, 6]);
  
  // Test pop
  const popped = arr.pop();
  expect(popped).toEqual(6);
  expect([...arr]).toEqual([1, 10, 20, 4, 5]);
});

test(`proxy 'has'`, async () => {
  const data = $.proxy({x: 3, y: undefined} as Record<string,number|undefined>);
  let cnt = 0;
  $.observe(function() { cnt++; $(`:x=${"x" in data}`); })
  $.observe(function() { cnt++; $(`:y=${"y" in data}`); })
  $.observe(function() { cnt++; $(`:z=${"z" in data}`); })
  assertBody('"x=true" "y=true" "z=false"')
  expect(cnt).toEqual(3);

  delete data.x;
  await asyncPassTime();
  assertBody('"x=false" "y=true" "z=false"')
  expect(cnt).toEqual(4);

  delete data.y;
  data.z = 42;
  await asyncPassTime();
  assertBody('"x=false" "y=false" "z=true"')
  expect(cnt).toEqual(6);
})
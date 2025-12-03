import { expect, test } from "bun:test";
import { assertBody, passTime } from "./helpers";
import { $, proxy, copy, unproxy, ref, dump } from "../src/aberdeen";

test('proxy holds basic types', async () => {
  let proxied = proxy(undefined as any);
  for(let val of [false, true, 'x', null, undefined, 123, -10.1]) {
    proxied.value = val;
    expect(proxied.value).toEqual(val);
  }
});

test('proxy stores and modifies objects', () => {
  let data = proxy({a: 1, b: 2} as Record<string, number>);
  data.c = 3;
  expect(data).toEqual({a: 1, b: 2, c: 3});
});

test('proxy does not duplicate data', () => {
  let org = {a: 1} as Record<string,number>;
  let data = proxy(org);
  expect(data).toEqual(org);
  expect(data !== org).toBe(true);
  (org as any).b = 2;
  expect(data).toEqual({a: 1, b: 2});
});

test('proxy stores and modifies arrays', () => {
  let data = proxy(['a', 'b'] as (string|undefined)[]);
  data[3] = 'c';
  expect([...data]).toEqual(['a', 'b', , 'c']);
});

test('proxy references nested values', () => {
  let obj = {a: 1, b: 2, c: {d: 3, e: {f: 4}}} as any;
  let data = proxy(obj);
  expect(data.c.e.f).toEqual(4);
  
  data.c.e = undefined;
  data.b = 5;
  expect(data).toEqual({a: 1, b: 5, c: {d: 3, e: undefined}});
});

test('proxy creates unresolved references', () => {
  let data = proxy({a: {b: {c: {d: {e: 42}}}}} as any);
  expect(data.a.b.c.d).toEqual({e: 42});
  
  data.a.b.x = {y: 31331};
  expect(data.a.b.x.y).toEqual(31331);
  expect(data).toEqual({a: {b: {c: {d: {e: 42}}, x: {y: 31331}}}});
});

test('proxy pushes into arrays', () => {
  let data = proxy([1, 2]);
  data.push(3);
  data.push(4);
  expect([...data]).toEqual([1, 2, 3, 4]);
  
  let data2 = proxy([] as number[]);
  data2.push(1);
  data2.push(2);
  expect([...data2]).toEqual([1, 2]);
});

test('proxy links objects to each other', () => {
  let data1 = proxy({a: 1, b: 2} as Record<string, number>);
  let data2 = proxy({x: data1, y: 3});
  expect(data2).toEqual({x: {a: 1, b: 2}, y: 3});
  
  data1.b = 200;
  expect(data2).toEqual({x: {a: 1, b: 200}, y: 3});
});

test('proxy reactively links objects to each other', async () => {
  let data1 = proxy({a: 1, b: 2} as Record<string, number>);
  let data2 = proxy({x: data1, y: 3});
  
  expect(data2).toEqual({x: {a: 1, b: 2}, y: 3});
  
  data1.b = 200;
  expect(data2).toEqual({x: {a: 1, b: 200}, y: 3});
  
  copy(data1, {});
  await passTime();
  expect(data2).toEqual({x: {}, y: 3});
});

test('proxy can modify values', () => {
  let data = proxy(21);
  data.value = data.value * 2;
  expect(data.value).toEqual(42);
  
  let objData = proxy({num: 42, str: 'x'} as {num: number, str: string});
  objData.str += 'y';
  expect(objData).toEqual({num: 42, str: 'xy'});
});

test('proxy materializes non-existent deep trees', () => {
  let data = proxy({} as any);
  data.a = {b: {c: {d: 42}}};
  expect(data.g?.h?.i?.j).toEqual(undefined);
  expect(data).toEqual({a: {b: {c: {d: 42}}}});
});

test('proxy reacts on materializing deep trees', async () => {
  let data = proxy({} as any);
  let deepValue: any;
  
  $(() => {
    deepValue = data.a?.b;
  });
  
  await passTime();
  expect(deepValue).toEqual(undefined);
  
  data.a = {b: 42};
  await passTime();
  expect(deepValue).toEqual(42);
});

test('proxies support all basic types', () => {
  // Test number
  const numProxy = proxy(123);
  expect(numProxy.value).toEqual(123);
  
  // Test string
  const strProxy = proxy("hi");
  expect(strProxy.value).toEqual("hi");
  
  // Test object
  const objProxy = proxy({a: 1, b: 2});
  expect(objProxy.a).toEqual(1);
  expect(objProxy.b).toEqual(2);
  
  // Test array
  const arrProxy = proxy([1, 2, 3]);
  expect(arrProxy[0]).toEqual(1);
  expect(arrProxy.length).toEqual(3);
  
  // Test boolean
  const boolProxy = proxy(false);
  expect(boolProxy.value).toEqual(false);
  
  // Test null
  const nullProxy = proxy(null);
  expect(nullProxy.value).toEqual(null);
  
  // Test undefined
  const undefinedProxy = proxy({value: undefined});
  expect(undefinedProxy.value).toEqual(undefined);
  
  // Test function
  const func = function() { return 42; };
  const funcProxy = proxy({fn: func});
  expect(typeof funcProxy.fn).toEqual('function');
  expect(funcProxy.fn()).toEqual(42);
});

test('proxy supports array methods', () => {
  const arr = proxy([1, 2, 3, 4, 5]);
  
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
  const data = proxy({x: 3, y: undefined} as Record<string,number|undefined>);
  let cnt = 0;
  $(function() { cnt++; $(`#x=${"x" in data}`); })
  $(function() { cnt++; $(`#y=${"y" in data}`); })
  $(function() { cnt++; $(`#z=${"z" in data}`); })
  assertBody('"x=true" "y=true" "z=false"')
  expect(cnt).toEqual(3);

  delete data.x;
  await passTime();
  assertBody('"x=false" "y=true" "z=false"')
  expect(cnt).toEqual(4);

  delete data.y;
  data.z = 42;
  await passTime();
  assertBody('"x=false" "y=false" "z=true"')
  expect(cnt).toEqual(6);
})

test(`proxy maintains source object identity when assigning`, () => {
  const proxied = proxy([{name: 'Alice'}]);
  const bob = {name: 'Bob'}
  proxied[0] = bob;
  bob.name = 'Robert';
  expect(proxied[0].name).toEqual('Robert');
})

test(`unproxies`, () => {
  let x = {};
  let p = proxy(x);
  expect(p).not.toBe(x);
  expect(unproxy(p)).toBe(x);
})

test('unproxies refs', async () => {
  let obj = proxy({a: 1});
  let a = ref(obj, 'a')
  
  $(() => {
    $('#'+a.value)
  });
  assertBody('"1"');

  unproxy(a).value = 2;
  await passTime();
  expect(a.value).toEqual(2);
  expect(obj.a).toEqual(2);
  assertBody('"1"');

  a.value = 3;
  await passTime();
  expect(a.value).toEqual(3);
  expect(obj.a).toEqual(3);
  assertBody('"3"');
})

test('proxy Promise resolve', async () => {
  let data = proxy(new Promise(resolve => {
    setTimeout(() => resolve(42), 10);
  }));
  
  $(() => {
    $('#'+JSON.stringify(data));
  });

  assertBody(JSON.stringify(`{"busy":true}`));
  
  await passTime(20);
  assertBody(JSON.stringify(`{"busy":false,"value":42}`));
});

test('proxy Promise reject', async () => {
  let data = proxy(async function(): Promise<number> {
    throw new Error("fail");
    return 42;
  }());
  
  $(() => {
    dump(data);
  });

  assertBody(`"<object>" ul{li{"\\"busy\\": " "true"}}`);
  
  await passTime(20);
  expect(data.error).toBeInstanceOf(Error);
  expect(data.value).toBeUndefined();
  assertBody(`"<object>" ul{li{"\\"busy\\": " "false"} li{"\\"error\\": " "<error>" ul}}`);
});

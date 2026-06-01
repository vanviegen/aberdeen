import { expect, test } from "bun:test";
import { assertBody, passTime } from "./helpers";
import A from "../src/aberdeen";

test('A.proxy holds basic types', async () => {
  let proxied = A.proxy(undefined as any);
  for(let val of [false, true, 'x', null, undefined, 123, -10.1]) {
    proxied.value = val;
    expect(proxied.value).toEqual(val);
  }
});

test('A.proxy stores and modifies objects', () => {
  let data = A.proxy({a: 1, b: 2} as Record<string, number>);
  data.c = 3;
  expect(data).toEqual({a: 1, b: 2, c: 3});
});

test('A.proxy does not duplicate data', () => {
  let org = {a: 1} as Record<string,number>;
  let data = A.proxy(org);
  expect(data).toEqual(org);
  expect(data !== org).toBe(true);
  (org as any).b = 2;
  expect(data).toEqual({a: 1, b: 2});
});

test('A.proxy stores and modifies arrays', () => {
  let data = A.proxy(['a', 'b'] as (string|undefined)[]);
  data[3] = 'c';
  expect([...data]).toEqual(['a', 'b', , 'c']);
});

test('A.proxy references nested values', () => {
  let obj = {a: 1, b: 2, c: {d: 3, e: {f: 4}}} as any;
  let data = A.proxy(obj);
  expect(data.c.e.f).toEqual(4);
  
  data.c.e = undefined;
  data.b = 5;
  expect(data).toEqual({a: 1, b: 5, c: {d: 3, e: undefined}});
});

test('A.proxy creates unresolved references', () => {
  let data = A.proxy({a: {b: {c: {d: {e: 42}}}}} as any);
  expect(data.a.b.c.d).toEqual({e: 42});
  
  data.a.b.x = {y: 31331};
  expect(data.a.b.x.y).toEqual(31331);
  expect(data).toEqual({a: {b: {c: {d: {e: 42}}, x: {y: 31331}}}});
});

test('A.proxy pushes into arrays', () => {
  let data = A.proxy([1, 2]);
  data.push(3);
  data.push(4);
  expect([...data]).toEqual([1, 2, 3, 4]);
  
  let data2 = A.proxy([] as number[]);
  data2.push(1);
  data2.push(2);
  expect([...data2]).toEqual([1, 2]);
});

test('A.proxy links objects to each other', () => {
  let data1 = A.proxy({a: 1, b: 2} as Record<string, number>);
  let data2 = A.proxy({x: data1, y: 3});
  expect(data2).toEqual({x: {a: 1, b: 2}, y: 3});
  
  data1.b = 200;
  expect(data2).toEqual({x: {a: 1, b: 200}, y: 3});
});

test('A.proxy reactively links objects to each other', async () => {
  let data1 = A.proxy({a: 1, b: 2} as Record<string, number>);
  let data2 = A.proxy({x: data1, y: 3});
  
  expect(data2).toEqual({x: {a: 1, b: 2}, y: 3});
  
  data1.b = 200;
  expect(data2).toEqual({x: {a: 1, b: 200}, y: 3});
  
  A.copy(data1, {});
  await passTime();
  expect(data2).toEqual({x: {}, y: 3});
});

test('A.proxy can modify values', () => {
  let data = A.proxy(21);
  data.value = data.value * 2;
  expect(data.value).toEqual(42);
  
  let objData = A.proxy({num: 42, str: 'x'} as {num: number, str: string});
  objData.str += 'y';
  expect(objData).toEqual({num: 42, str: 'xy'});
});

test('A.proxy materializes non-existent deep trees', () => {
  let data = A.proxy({} as any);
  data.a = {b: {c: {d: 42}}};
  expect(data.g?.h?.i?.j).toEqual(undefined);
  expect(data).toEqual({a: {b: {c: {d: 42}}}});
});

test('A.proxy reacts on materializing deep trees', async () => {
  let data = A.proxy({} as any);
  let deepValue: any;
  
  A(() => {
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
  const numProxy = A.proxy(123);
  expect(numProxy.value).toEqual(123);
  
  // Test string
  const strProxy = A.proxy("hi");
  expect(strProxy.value).toEqual("hi");
  
  // Test object
  const objProxy = A.proxy({a: 1, b: 2});
  expect(objProxy.a).toEqual(1);
  expect(objProxy.b).toEqual(2);
  
  // Test array
  const arrProxy = A.proxy([1, 2, 3]);
  expect(arrProxy[0]).toEqual(1);
  expect(arrProxy.length).toEqual(3);
  
  // Test boolean
  const boolProxy = A.proxy(false);
  expect(boolProxy.value).toEqual(false);
  
  // Test null
  const nullProxy = A.proxy(null);
  expect(nullProxy.value).toEqual(null);
  
  // Test undefined
  const undefinedProxy = A.proxy({value: undefined});
  expect(undefinedProxy.value).toEqual(undefined);
  
  // Test function
  const func = function() { return 42; };
  const funcProxy = A.proxy({fn: func});
  expect(typeof funcProxy.fn).toEqual('function');
  expect(funcProxy.fn()).toEqual(42);
});

test('A.proxy supports array methods', () => {
  const arr = A.proxy([1, 2, 3, 4, 5]);
  
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

test(`A.proxy 'has'`, async () => {
  const data = A.proxy({x: 3, y: undefined} as Record<string,number|undefined>);
  let cnt = 0;
  A(function() { cnt++; A(`#x=${"x" in data}`); })
  A(function() { cnt++; A(`#y=${"y" in data}`); })
  A(function() { cnt++; A(`#z=${"z" in data}`); })
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

test(`A.proxy maintains source object identity when assigning`, () => {
  const proxied = A.proxy([{name: 'Alice'}]);
  const bob = {name: 'Bob'}
  proxied[0] = bob;
  bob.name = 'Robert';
  expect(proxied[0].name).toEqual('Robert');
})

test(`unproxies`, () => {
  let x = {};
  let p = A.proxy(x);
  expect(p).not.toBe(x);
  expect(A.unproxy(p)).toBe(x);
})

test('unproxies refs', async () => {
  let obj = A.proxy({a: 1});
  let a = A.ref(obj, 'a')
  
  A(() => {
    A('#'+a.value)
  });
  assertBody('"1"');

  A.unproxy(a).value = 2;
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

test('A.proxy Promise resolve', async () => {
  let data = A.proxy(new Promise(resolve => {
    setTimeout(() => resolve(42), 10);
  }));
  
  A(() => {
    A('#'+JSON.stringify(data));
  });

  assertBody(JSON.stringify(`{"busy":true}`));
  
  await passTime(20);
  assertBody(JSON.stringify(`{"busy":false,"value":42}`));
});

test('A.proxy Promise reject', async () => {
  let data = A.proxy(async function(): Promise<number> {
    throw new Error("fail");
    return 42;
  }());
  
  A(() => {
    A.dump(data);
  });

  assertBody(`"<Object>" ul{li{"\\"busy\\": " "true"}}`);
  
  await passTime(20);
  expect(data.error).toBeInstanceOf(Error);
  expect(data.value).toBeUndefined();
  assertBody(`"<Object>" ul{li{"\\"busy\\": " "false"} li{"\\"error\\": " "<Error>" ul}}`);
});

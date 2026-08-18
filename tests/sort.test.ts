import { expect, test } from "bun:test";
import { assertBody, passTime } from "./helpers";
import A from "../src/aberdeen";

test('uses custom sort orders', async () => {
  const data = A.proxy({
    c: { x: 2, y: 3, z: -2, name: 'Bob' },
    a: { x: 4, y: 2, z: -500000, name: 'Charly' },
    b: { x: 5, y: 1, z: 3, name: 'Chomsky' },
    e: { x: 'a', y: 1, z: 5, name: 'Crook' },
    d: { x: 3, y: 3, z: +500000, name: 'Alice' },
  });
  
  let sortFunc: any = A.proxy(undefined);
  
  A(() => {
    A.onEach(data, (item, key) => {
      A(key);
    }, sortFunc.value);
  });
 
  // Default behavior, sort by key
  assertBody(`a b c d e`);

  sortFunc.value = (item: any) => ''+item.x;
  await passTime();
  assertBody(`c d a b e`);

  sortFunc.value = (item: any) => item.z;
  await passTime();
  assertBody(`a c b e d`);
  
  sortFunc.value = (item: any) => [item.y, item.x];
  await passTime();
  assertBody(`e b a c d`);

  sortFunc.value = (item: any) => item.name;
  await passTime();
  assertBody(`d c a b e`);

  sortFunc.value = (item: any) => [123, A.invertString(item.name), "dummy"];
  await passTime();
  assertBody(`e b a c d`);
});

test('changes position when sort key changes', async () => {
  const data = A.proxy({
    a: 5,
    b: 3,
    c: 1,
    d: -1,
    e: -3
  });
  
  let p = 0, c = 0;
  
  A.mount(document.body, () => {
    p++;
    A.onEach(data, (item, key) => {
      c++;
      A(key);
    }, item => item);
  });
  
  assertBody(`e d c b a`);
  expect(p).toEqual(1);
  expect(c).toEqual(5);
  
  data.c = -20;
  await passTime();
  assertBody(`c e d b a`);
  expect(p).toEqual(1);
  expect(c).toEqual(6);
  
  data.e = 4;
  await passTime();
  assertBody(`c d b e a`);
  expect(p).toEqual(1);
  expect(c).toEqual(7);
});

test('supports fractional sort keys', async () => {
  // Ascending expected order; k<N> is the position within it.
  const values = [-2.5, -2, -1.75, -0.5, 0, 0.25, 1, 1.5, 2, 10.125];
  const data: Record<string, number> = {};
  for (const v of [1, 1.5, -2, 0.25, 10.125, -2.5, 0, 2, -0.5, -1.75]) {
    data['k' + values.indexOf(v)] = v;
  }
  const $data = A.proxy(data);

  A.onEach($data, (value, key) => {
    A('p', { id: key });
  }, value => value);

  assertBody(values.map((v, i) => `p{id=k${i}}`).join(' '));

  $data.k0 = 0.75; // -2.5 → 0.75: moves between k5 (0.25) and k6 (1)
  await passTime();
  assertBody(`p{id=k1} p{id=k2} p{id=k3} p{id=k4} p{id=k5} p{id=k0} p{id=k6} p{id=k7} p{id=k8} p{id=k9}`);

  $data.k9 = 0.5; // 10.125 → 0.5: moves between k5 (0.25) and k0 (0.75)
  await passTime();
  assertBody(`p{id=k1} p{id=k2} p{id=k3} p{id=k4} p{id=k5} p{id=k9} p{id=k0} p{id=k6} p{id=k7} p{id=k8}`);
});

test('supports fractional numbers in composite sort keys', async () => {
  const $data = A.proxy({
    a: [2, 'x'],
    b: [2.5, 'a'],
    c: [2, 'a'],
    d: [2.5],
    e: [-2.5, 'q'],
    f: [-2, 'q'],
  } as Record<string, (number | string)[]>);

  A.onEach($data, (value, key) => {
    A(key);
  }, value => value as any);

  assertBody(`e f c a d b`);
});

test('distinguishes nearly-equal fractional sort keys', async () => {
  const $data = A.proxy({ a: 3.1416, b: 3.14159, c: 3.141595 });
  A.onEach($data, (value, key) => {
    A(key);
  }, value => value);
  assertBody(`b c a`);
});

test('rejects non-finite sort keys', async () => {
  let lastErr: Error | undefined;
  A.setErrorHandler(err => { lastErr = err; return false; });
  try {
    A.onEach(A.proxy({ a: 1 }), (value, key) => A(key), value => value / 0);
    expect(lastErr?.toString()).toContain('finite');

    lastErr = undefined;
    A.onEach(A.proxy({ a: 0 }), (value, key) => A(key), value => value / 0); // NaN
    expect(lastErr?.toString()).toContain('finite');
  } finally {
    A.setErrorHandler();
  }
});

test('have items disappear when the sort key is null', async () => {
  const data = A.proxy({a: true, b: false, c: true, d: false});
  let p = 0, c = 0;
  
  A.mount(document.body, () => {
    p++;
    A.onEach(data, (item, key) => {
      c++;
      A(key);
    }, (item, key) => item ? key : undefined);
  });
  
  assertBody(`a c`);
  expect(p).toEqual(1);
  expect(c).toEqual(2);
  
  data.a = false;
  data.d = true;
  await passTime();
  assertBody(`c d`);
  expect(p).toEqual(1);
  expect(c).toEqual(3);
});

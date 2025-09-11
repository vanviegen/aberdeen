import { expect, test } from "bun:test";
import { assertBody, passTime } from "./helpers";
import { $, proxy, onEach, mount, invertString } from "../src/aberdeen";

test('uses custom sort orders', async () => {
  const data = proxy({
    c: { x: 2, y: 3, z: -2, name: 'Bob' },
    a: { x: 4, y: 2, z: -500000, name: 'Charly' },
    b: { x: 5, y: 1, z: 3, name: 'Chomsky' },
    e: { x: 'a', y: 1, z: 5, name: 'Crook' },
    d: { x: 3, y: 3, z: +500000, name: 'Alice' },
  });
  
  let sortFunc: any = proxy(undefined);
  
  $(() => {
    onEach(data, (item, key) => {
      $(key);
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

  sortFunc.value = (item: any) => [123, invertString(item.name), "dummy"];
  await passTime();
  assertBody(`e b a c d`);
});

test('changes position when sort key changes', async () => {
  const data = proxy({
    a: 5,
    b: 3,
    c: 1,
    d: -1,
    e: -3
  });
  
  let p = 0, c = 0;
  
  mount(document.body, () => {
    p++;
    onEach(data, (item, key) => {
      c++;
      $(key);
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

test('have items disappear when the sort key is null', async () => {
  const data = proxy({a: true, b: false, c: true, d: false});
  let p = 0, c = 0;
  
  mount(document.body, () => {
    p++;
    onEach(data, (item, key) => {
      c++;
      $(key);
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

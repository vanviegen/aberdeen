import { expect, test } from "bun:test";
import { assertBody, asyncPassTime } from "./helpers";
import { $, proxy, observe, multiMap, peek, onEach, unmountAll, map, isEmpty } from "../src/aberdeen";

test('map transforms arrays to arrays', async () => {
  let data = proxy([0, 2, 3]);
  let cnt1 = 0, cnt2 = 0;
  
  let out = map(data, value => {
    cnt1++;
    if (value) return value * 10;
    return undefined;
  });
  
  onEach(out, (value, index) => {
    cnt2++;
    $({text: index + "=" + value});
  }, value => value);
  
  assertBody(`"1=20" "2=30"`);
  expect(cnt1).toEqual(3);
  expect(cnt2).toEqual(2);
  
  data[0] = 1;
  delete data[2];
  
  await asyncPassTime();
  assertBody(`"0=10" "1=20"`);
  expect(cnt1).toEqual(4);
  expect(cnt2).toEqual(3);
});

test('map transforms objects to objects', async () => {
  let data = proxy({a: 1, b: 2, c: 3} as Record<string,number>);
  let cnt1 = 0, cnt2 = 0;

  let out = map(data, value => {
    cnt1++;
    return value===2 ? undefined : value*value;
  });

  onEach(out, (value, index) => {
    cnt2++;
    $({text: index.toString() + "=" + value});
  }, value => -value);

  assertBody(`"c=9" "a=1"`);

  data.x = 9;
  await asyncPassTime();
  assertBody(`"x=81" "c=9" "a=1"`);
});

test('multiMap transforms arrays to objects', async () => {
  let data = proxy(['a', 'b']);
  let cnt1 = 0, cnt2 = 0;
  
  let out = multiMap(data, (value, index) => {
    cnt1++;
    return {[value]: index*10, [value+value]: index*10+1};
  });
  
  onEach(out, (value, key) => {
    cnt2++;
    $({text: key + '=' + value});
  }, (value, key) => -value);
  
  expect(peek(out)).toEqual({a: 0, aa: 1, b: 10, bb: 11});
  assertBody(`"bb=11" "b=10" "aa=1" "a=0"`);
  expect(cnt1).toEqual(2);
  expect(cnt2).toEqual(4);
  
  data[0] = 'A';
  data.push('c');
  
  await asyncPassTime();
  expect(peek(data)).toEqual(['A', 'b', 'c']);
  expect(peek(out)).toEqual({A: 0, AA: 1, b: 10, bb:11, c: 20, cc: 21});
  assertBody(`"cc=21" "c=20" "bb=11" "b=10" "AA=1" "A=0"`);
  expect(cnt1).toEqual(4);
  expect(cnt2).toEqual(8);
});

test('multiMap transforms objects to objects', async () => {
  let data = proxy({a: 23, e: 123} as Record<string,number>);
  let cnt1 = 0;
  
  let out = multiMap(data, (value: number, index) => {
    cnt1++;
    return {[value]: index};
  });
  
  expect(peek(out)).toEqual({23: 'a', 123: 'e'});
  expect(cnt1).toEqual(2);
  
  delete data.e;
  data.a = 45;
  
  await asyncPassTime();
  expect(peek(out)).toEqual({45: 'a'});
  expect(cnt1).toEqual(3);
});

test('creates derived values with map', async () => {
  const data = proxy(21);
  // This is not really a best practice, as this creates a relatively slow iterator.
  // Use $, as shown in the next test, instead.
  const double = map(data, v => v * 2);
  
  expect(double.value).toEqual(42);
  
  data.value = 100;
  await asyncPassTime();
  expect(double.value).toEqual(200);
});

test('can create reactive computations with the $ function', async () => {
  const data = proxy(21);
  const double = $(() => data.value * 2);
  
  expect(double.value).toEqual(42);
  
  data.value = 100;
  await asyncPassTime();
  expect(double.value).toEqual(200);
});

test('isEmpty works on arrays', async () => {
  let data = proxy([] as number[]);
  let cnt = 0;
  observe(() => {
    cnt++;
    $(isEmpty(data,) ? ":empty" : ":not empty");
  })
  assertBody(`"empty"`);
  expect(cnt).toBe(1);

  data[1] = 3;
  await asyncPassTime();
  assertBody(`"not empty"`);
  expect(cnt).toBe(2);

  data.pop();
  await asyncPassTime();
  assertBody(`"not empty"`);
  expect(cnt).toBe(2);

  data.pop();
  await asyncPassTime();
  assertBody(`"empty"`);
  expect(cnt).toBe(3);

  data.push(42);
  await asyncPassTime();
  assertBody(`"not empty"`);
  expect(cnt).toBe(4);

  data.push(123);
  await asyncPassTime();
  assertBody(`"not empty"`);
  expect(cnt).toBe(4);

  unmountAll();
  observe(() => { // test initial value for isEmpty
    $(isEmpty(data,) ? ":empty2" : ":not empty2");
  })
  assertBody(`"not empty2"`);
})


test('isEmpty works on objects', async () => {
  let data = proxy({} as Record<string,number|undefined>);
  let cnt = 0;
  observe(() => {
    cnt++;
    $(isEmpty(data,) ? ":empty" : ":not empty");
  })
  assertBody(`"empty"`);
  expect(cnt).toBe(1);

  data.x = 3;
  await asyncPassTime();
  assertBody(`"not empty"`);
  expect(cnt).toBe(2);

  delete data.x;
  await asyncPassTime();
  assertBody(`"empty"`);
  expect(cnt).toBe(3);

  data.y = undefined;
  await asyncPassTime();
  assertBody(`"empty"`);
  expect(cnt).toBe(3);

  unmountAll();

  data.x = 1;
  observe(() => { // test initial value for isEmpty
    $(isEmpty(data,) ? ":empty2" : ":not empty2");
  })
  assertBody(`"not empty2"`);
})
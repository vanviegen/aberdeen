import { expect, test } from "bun:test";
import { assertBody, passTime } from "./helpers";
import A from "../src/aberdeen";

test('rerenders only the inner scope', async () => {
  let data = A.proxy('before');
  let cnt1 = 0, cnt2 = 0;
  
  A(() => {
    A('a', () => {
      cnt1++;
      A('span', () => {
        cnt2++;
        A("#" + data.value);
      });
    });
  });
  
  assertBody(`a{span{"before"}}`);
  data.value = "after";
  assertBody(`a{span{"before"}}`);
  await passTime();
  assertBody(`a{span{"after"}}`);
  expect(cnt1).toEqual(1);
  expect(cnt2).toEqual(2);
});

test('adds and removes elements', async () => {
  let data = A.proxy(false);
  
  let cnt1 = 0, cnt2 = 0;
  A(() => {
    cnt1++;
    A('a', () => {
      cnt2++;
      if (data.value) A('i');
    });
  });
  
  assertBody(`a`);
  const values = [true, false, true, false];
  for(let val of values) {
    data.value = val;
    await passTime();
    assertBody(val ? `a{i}` : `a`);
  }
  expect(cnt1).toEqual(1);
  expect(cnt2).toEqual(5);
});

test('refreshes standalone A()s', async () => {
  let data = A.proxy(false);
  
  let cnt1 = 0, cnt2 = 0;
  A(() => {
    cnt1++;
    A('a');
    A(() => {
      cnt2++;
      if (data.value) A('i');
    });
  });
  
  assertBody(`a`);
  const values = [true, false, true, false];
  for(let val of values) {
    data.value = val;
    await passTime();
    assertBody(val ? `a i` : `a`);
  }
  expect(cnt1).toEqual(1);
  expect(cnt2).toEqual(5);
});

test('uses A()s as reference for DOM insertion', async () => {
  let data1 = A.proxy(false);
  let data2 = A.proxy(false);
  
  let cnt0 = 0, cnt1 = 0, cnt2 = 0;
  A(() => {
    cnt0++;
    A('i');
    A(() => {
      cnt1++;
      data1.value && A('a');
    });
    A(() => {
      cnt2++;
      data2.value && A('b');
    });
    A('p');
  });
  
  assertBody(`i p`);
  const testCases = [
    [false, true], 
    [false, false], 
    [true, false], 
    [true, true], 
    [false, false], 
    [true, true]
  ];
  
  for(let [val1, val2] of testCases) {
    data1.value = val1;
    data2.value = val2;
    await passTime();
    assertBody(`i ${val1 ? 'a ' : ''}${val2 ? 'b ' : ''}p`);
  }
  expect(cnt0).toEqual(1);
  expect(cnt1).toEqual(4);
  expect(cnt2).toEqual(6);
});

test('insert at right position with an empty parent scope', () => {
  A(() => {
    A('a');
    A(() => {
      A(() => {
        A('b');
      });
    });
  });
  
  assertBody(`a b`);
});

test('does not trigger when a value changes back to the same value', async () => {
  let data = A.proxy('a') as {value?: string};
  let cnt = 0;
  
  A(() => {
    cnt++;
    A(data.value || 'none');
  });
  
  assertBody(`a`);
  expect(cnt).toEqual(1);
  
  data.value = 'b';
  data.value = 'a';
  await passTime();
  assertBody(`a`);
  expect(cnt).toEqual(1);
  
  delete data.value;
  data.value = 'a';
  await passTime();
  assertBody(`a`);
  expect(cnt).toEqual(1);

  // Make sure it can still trigger on real changes
  delete data.value;
  data.value = 'b';
  await passTime();
  assertBody(`b`);
  expect(cnt).toEqual(2);
});

test('refrains from rerendering dead scopes', async () => {
  let cnts = [0, 0, 0, 0];
  let data = A.proxy('a');
  
  A(() => {
    cnts[0]++;
    A(() => {
      cnts[1]++;
      A(() => {
        cnts[2]++;
        if (data.value === 'b') return;
        A(() => {
          cnts[3]++;
          data.value;
        });
      });
    });
  });
  
  expect(cnts).toEqual([1, 1, 1, 1]);
  data.value = 'b';
  expect(cnts).toEqual([1, 1, 1, 1]);
  await passTime();
  expect(cnts).toEqual([1, 1, 2, 1]);
});

test('inserts higher priority updates', async () => {
  let parent = A.proxy(false);
  let children = A.proxy(false);
  let pcnt = 0, ccnt = 0;
  
  A(() => {
    pcnt++;
    if (parent.value) return;
    
    A('a', () => {
      ccnt++;
      if (children.value) {
        parent.value = true;
      }
    });
    A('b', () => {
      ccnt++;
      if (children.value) {
        parent.value = true;
      }
    });
  });
  
  assertBody(`a b`);
  children.value = true;
  await passTime();
  assertBody(``);
  expect(pcnt).toEqual(2);
  expect(ccnt).toEqual(3); // only a *or* b should have executed a second time, triggering parent
});

test('does not rerender on A.peek', async () => {
  let data = A.proxy('before');
  let cnt1 = 0, cnt2 = 0;
  
  A(() => {
    A('a', () => {
      cnt1++;
      A('span', () => {
        cnt2++;
        A("#" + A.peek(() => data.value));
        A("#" + A.unproxy(data).value);
      });
    });
  });
  
  assertBody(`a{span{"before" "before"}}`);
  data.value = "after";
  await passTime();
  assertBody(`a{span{"before" "before"}}`);
  expect(cnt1).toEqual(1);
  expect(cnt2).toEqual(1);
});

test('allows modifying proxied objects from within scopes', async () => {
  let cnt0 = 0, cnt1 = 0, cnt2 = 0, cnt3 = 0;
  let data = A.proxy({} as Record<string, string>);
  let inverse = A.proxy({} as Record<string, number>);
  
  A(() => {
    cnt0++;
    A.onEach(data, (value, key) => {
      inverse[value] = parseInt(key);
      cnt1++;
      A.clean(() => {
        delete inverse[value];
        cnt2++;
      });
    });
    
    A.onEach(inverse, (value, key) => {
      A("#" + key + "=" + value);
      cnt3++;
    });
  });
  
  await passTime();
  assertBody(``);
  expect([cnt0, cnt1, cnt2, cnt3]).toEqual([1, 0, 0, 0]);
  
  data[1] = 'b';
  await passTime();
  assertBody(`"b=1"`);
  expect([cnt0, cnt1, cnt2, cnt3]).toEqual([1, 1, 0, 1]);
  
  data[2] = 'a';
  await passTime();
  assertBody(`"a=2" "b=1"`);
  expect([cnt0, cnt1, cnt2, cnt3]).toEqual([1, 2, 0, 2]);
  
  data[3] = 'c';
  await passTime();
  assertBody(`"a=2" "b=1" "c=3"`);
  expect([cnt0, cnt1, cnt2, cnt3]).toEqual([1, 3, 0, 3]);
  
  data[3] = 'd';
  await passTime();
  assertBody(`"a=2" "b=1" "d=3"`);
  expect([cnt0, cnt1, cnt2, cnt3]).toEqual([1, 4, 1, 4]);
  
  delete data[1];
  await passTime();
  assertBody(`"a=2" "d=3"`);
  expect([cnt0, cnt1, cnt2, cnt3]).toEqual([1, 4, 2, 4]);
  
  A.unmountAll();
  assertBody(``);
  expect([cnt0, cnt1, cnt2, cnt3]).toEqual([1, 4, 4, 4]);
});

test('returns a reactive value when only a function is given', async () => {
  const data = A.proxy(20);
  const plus2 = A.derive(() => data.value + 2);
  A('p', {text: plus2})

  expect(plus2.value).toEqual(22)
  assertBody(`p{"22"}`)

  data.value *= 2
  await passTime();
  expect(plus2.value).toEqual(42)
  assertBody(`p{"42"}`)
})

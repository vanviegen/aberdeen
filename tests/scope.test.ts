import { expect, test } from "bun:test";
import { assertBody, asyncPassTime, assertDomUpdates } from "./helpers";
import $ from "../src/aberdeen";

test('rerenders only the inner scope', async () => {
  let data = $.proxy('before');
  let cnt1 = 0, cnt2 = 0;
  
  $.observe(() => {
    $('a', () => {
      cnt1++;
      $('span', () => {
        cnt2++;
        $(":" + data.value);
      });
    });
  });
  
  assertBody(`a{span{"before"}}`);
  data.value = "after";
  assertBody(`a{span{"before"}}`);
  await asyncPassTime();
  assertBody(`a{span{"after"}}`);
  expect(cnt1).toEqual(1);
  expect(cnt2).toEqual(2);
});

test('adds and removes elements', async () => {
  let data = $.proxy(false);
  
  let cnt1 = 0, cnt2 = 0;
  $.observe(() => {
    cnt1++;
    $('a', () => {
      cnt2++;
      if (data.value) $('i');
    });
  });
  
  assertBody(`a`);
  const values = [true, false, true, false];
  for(let val of values) {
    data.value = val;
    await asyncPassTime();
    assertBody(val ? `a{i}` : `a`);
  }
  expect(cnt1).toEqual(1);
  expect(cnt2).toEqual(5);
});

test('refreshes standalone observe()s', async () => {
  let data = $.proxy(false);
  
  let cnt1 = 0, cnt2 = 0;
  $.observe(() => {
    cnt1++;
    $('a');
    $.observe(() => {
      cnt2++;
      if (data.value) $('i');
    });
  });
  
  assertBody(`a`);
  const values = [true, false, true, false];
  for(let val of values) {
    data.value = val;
    await asyncPassTime();
    assertBody(val ? `a i` : `a`);
  }
  expect(cnt1).toEqual(1);
  expect(cnt2).toEqual(5);
});

test('uses observe()s as reference for DOM insertion', async () => {
  let data1 = $.proxy(false);
  let data2 = $.proxy(false);
  
  let cnt0 = 0, cnt1 = 0, cnt2 = 0;
  $.observe(() => {
    cnt0++;
    $('i');
    $.observe(() => {
      cnt1++;
      data1.value && $('a');
    });
    $.observe(() => {
      cnt2++;
      data2.value && $('b');
    });
    $('p');
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
    await asyncPassTime();
    assertBody(`i ${val1 ? 'a ' : ''}${val2 ? 'b ' : ''}p`);
  }
  expect(cnt0).toEqual(1);
  expect(cnt1).toEqual(4);
  expect(cnt2).toEqual(6);
});

test('insert at right position with an empty parent scope', () => {
  $.observe(() => {
    $('a');
    $.observe(() => {
      $.observe(() => {
        $('b');
      });
    });
  });
  
  assertBody(`a b`);
});

test('can use $ like observe', () => {
  $.observe(() => {
    $('a');
    $(() => {
      $(() => {
        $('b');
      });
    });
  });
  
  assertBody(`a b`);
});

test('refrains from rerendering dead scopes', async () => {
  let cnts = [0, 0, 0, 0];
  let data = $.proxy('a');
  
  $.observe(() => {
    cnts[0]++;
    $.observe(() => {
      cnts[1]++;
      $.observe(() => {
        cnts[2]++;
        if (data.value === 'b') return;
        $.observe(() => {
          cnts[3]++;
          data.value;
        });
      });
    });
  });
  
  expect(cnts).toEqual([1, 1, 1, 1]);
  data.value = 'b';
  expect(cnts).toEqual([1, 1, 1, 1]);
  await asyncPassTime();
  expect(cnts).toEqual([1, 1, 2, 1]);
});

test('inserts higher priority updates', async () => {
  let parent = $.proxy(false);
  let children = $.proxy(false);
  let pcnt = 0, ccnt = 0;
  
  $.observe(() => {
    pcnt++;
    if (parent.value) return;
    
    $('a', () => {
      ccnt++;
      if (children.value) {
        parent.value = true;
      }
    });
    $('b', () => {
      ccnt++;
      if (children.value) {
        parent.value = true;
      }
    });
  });
  
  assertBody(`a b`);
  children.value = true;
  await asyncPassTime();
  assertBody(``);
  expect(pcnt).toEqual(2);
  expect(ccnt).toEqual(3); // only a *or* b should have executed a second time, triggering parent
});

test('does not rerender on peek', async () => {
  let data = $.proxy('before');
  let cnt1 = 0, cnt2 = 0;
  
  $.observe(() => {
    $('a', () => {
      cnt1++;
      $('span', () => {
        cnt2++;
        $(":" + $.peek(() => data.value));
        $(":" + $.peek(data, 'value'));
      });
    });
  });
  
  assertBody(`a{span{"before" "before"}}`);
  data.value = "after";
  await asyncPassTime();
  assertBody(`a{span{"before" "before"}}`);
  expect(cnt1).toEqual(1);
  expect(cnt2).toEqual(1);
});

test('allows modifying proxied objects from within scopes', async () => {
  let cnt0 = 0, cnt1 = 0, cnt2 = 0, cnt3 = 0;
  let data = $.proxy({} as Record<string, string>);
  let inverse = $.proxy({} as Record<string, number>);
  
  const unmount = $.observe(() => {
    cnt0++;
    $.onEach(data, (value, key) => {
      inverse[value] = parseInt(key);
      cnt1++;
      $.clean(() => {
        delete inverse[value];
        cnt2++;
      });
    });
    
    $.onEach(inverse, (value, key) => {
      $(":" + key + "=" + value);
      cnt3++;
    });
  });
  
  await asyncPassTime();
  assertBody(``);
  expect([cnt0, cnt1, cnt2, cnt3]).toEqual([1, 0, 0, 0]);
  
  data[1] = 'b';
  await asyncPassTime();
  assertBody(`"b=1"`);
  expect([cnt0, cnt1, cnt2, cnt3]).toEqual([1, 1, 0, 1]);
  
  data[2] = 'a';
  await asyncPassTime();
  assertBody(`"a=2" "b=1"`);
  expect([cnt0, cnt1, cnt2, cnt3]).toEqual([1, 2, 0, 2]);
  
  data[3] = 'c';
  await asyncPassTime();
  assertBody(`"a=2" "b=1" "c=3"`);
  expect([cnt0, cnt1, cnt2, cnt3]).toEqual([1, 3, 0, 3]);
  
  data[3] = 'd';
  await asyncPassTime();
  assertBody(`"a=2" "b=1" "d=3"`);
  expect([cnt0, cnt1, cnt2, cnt3]).toEqual([1, 4, 1, 4]);
  
  delete data[1];
  await asyncPassTime();
  assertBody(`"a=2" "d=3"`);
  expect([cnt0, cnt1, cnt2, cnt3]).toEqual([1, 4, 2, 4]);
  
  $.unmountAll();
  assertBody(``);
  expect([cnt0, cnt1, cnt2, cnt3]).toEqual([1, 4, 4, 4]);
});
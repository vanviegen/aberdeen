import { expect, test } from "bun:test";
import { assertBody, asyncPassTime, getBody } from "./helpers";
import { $, proxy, observe, set, onEach, clean, unmountAll, map } from "../src/aberdeen";

test('onEach does nothing for an empty object', () => {
  let cnt = 0;
  observe(() => {
    let data = proxy({});
    onEach(data, function() {
      cnt++;
    });
  });
  expect(cnt).toEqual(0);
});

test('onEach emits a single entry', () => {
  let result: [string, number][] = [];
  observe(() => {
    let data = proxy({x: 3});
    onEach(data, function(value, key) {
      result.push([key, value]);
    });
  });
  expect(result).toEqual([['x', 3]]);
});

test('onEach emits multiple entries', () => {
  let result: [string, number][] = [];
  observe(() => {
    let data = proxy({x: 3, y: 4, z: 5});
    onEach(data, function(value, key) {
      result.push([key, value]);
    });
    // The order is undefined, so we'll sort it
    result.sort((a, b) => a[1] - b[1]);
  });
  expect(result).toEqual([['x', 3], ['y', 4], ['z', 5]]);
});

test('onEach adds a single item to the DOM', () => {
  observe(() => {
    let data = proxy({x: 3});
    onEach(data, function(value, key) {
      $('p', {class: key, text: value});
    });
  });
  assertBody(`p.x{"3"}`);
});

test('onEach adds multiple items to the DOM in default order', () => {
  observe(() => {
    let data = proxy({c: 3, a: 1, b: 2});
    onEach(data, function(value, key) {
      $('p', {text: key});
    });
  });
  assertBody(`p{"a"} p{"b"} p{"c"}`);
});

test('onEach rerenders items on unrelated observable changes', async () => {
  let data = proxy([
    {id: 42, name: 'Pete'},
    {id: 1, name: 'Hank'},
    {id: 123, name: 'Jack'},
  ]);
  let cnt = 0;
  onEach(data, function(item) {
    $(`div:${item.id}=${item.name}`)
    cnt++;
  })
  expect(cnt).toEqual(3);
  assertBody(`div{"42=Pete"} div{"1=Hank"} div{"123=Jack"}`);
  
  data[1].name = "Hack";
  await asyncPassTime();
  expect(cnt).toEqual(4);
  assertBody(`div{"42=Pete"} div{"1=Hack"} div{"123=Jack"}`);
})

test('onEach maintains the last-element marker', () => {
  observe(() => {
    let data = proxy({c: 3, a: 1, b: 2});
    onEach(data, function(value, key) {
      $('p', {text: key});
    });
    $('div');
  });
  assertBody(`p{"a"} p{"b"} p{"c"} div`);
});

test('onEach maintains position for items', async () => {
  let data = proxy({0: false, 1: false, 2: false, 3: false});
  let cnts = [0, 0, 0, 0];
  observe(() => {
    onEach(data, (value, index) => {
      cnts[Number(index)]++;
      if (value) $('p', {id: index});
    });
  });
  assertBody(``);
  expect(cnts).toEqual([1, 1, 1, 1]);
  
  data[1] = true;
  await asyncPassTime();
  assertBody(`p{id=1}`);
  expect(cnts).toEqual([1, 2, 1, 1]);
  
  data[0] = true;
  data[2] = true;
  data[3] = true;
  await asyncPassTime();
  assertBody(`p{id=0} p{id=1} p{id=2} p{id=3}`);
  expect(cnts).toEqual([2, 2, 2, 2]);
});

test('onEach adds items in the right position', async () => {
  let data = proxy({} as Record<string, boolean>);
  observe(() => {
    onEach(data, (value, key) => {
      $(key);
    });
  });
  
  let items = ['d', 'a', 'b', 'f', 'c', 'e'];
  let seen: string[] = [];
  for(let item of items) {
    seen.push(item);
    seen.sort();
    data[item] = true;
    await asyncPassTime();
    assertBody(seen.join(' '));
  }
});

test('onEach removes items and calls cleaners', async () => {
  let items = ['d', 'a', 'b', 'f', 'c', 'e'];
  let data = proxy({} as Record<string, boolean>);
  for(let item of items) {
    data[item] = true;
  }
  
  let cleaned: string[] = [];
  observe(() => {
    onEach(data, (value, key) => {
      $(key);
      clean(() => {
        cleaned.push(key);
      });
    });
  });
  
  let current = items.slice().sort();
  let cleanedExpected: string[] = [];
  for(let item of items) {
    current.splice(current.indexOf(item), 1);
    
    delete data[item];
    cleanedExpected.push(item);
    await asyncPassTime();
    assertBody(current.join(' '));
    expect(cleaned).toEqual(cleanedExpected);
  }
});

test('onEach removes an entire object and calls cleaners', async () => {
  let cleaned: Record<string, boolean> = {};
  let data = proxy({b: 2, c: 3, a: 1});
  let showOnEach = proxy(true);
  let cnt = 0;
  
  observe(() => {
    if (showOnEach.value) {
      onEach(data, (value, key) => {
        cnt++;
        $(key);
        clean(() => {
          cleaned[key] = true;
        });
      });
    }
  });
  
  assertBody(`a b c`);
  
  showOnEach.value = false;
  await asyncPassTime();
  assertBody(``);
  expect(cleaned).toEqual({a: true, b: true, c: true});
  expect(cnt).toEqual(3);
});

test('onEach should ignore on delete followed by set', async () => {
  let data = proxy({a: 1, b: 2} as Record<string,number>);
  let cnt = 0;
  
  observe(() => {
    onEach(data, (value, key) => {
      $(key);
      cnt++;
    });
  });
  
  assertBody(`a b`);
  expect(cnt).toEqual(2);
  
  delete data.a;
  expect(data).toEqual({b: 2});
  
  data.a = 3;
  await asyncPassTime();
  assertBody(`a b`);
  expect(cnt).toEqual(3); // In the new API, this will trigger again
});

test('onEach should do nothing on set followed by delete', async () => {
  let data = proxy({a: 1} as Record<string,number>);
  let cnt = 0;
  
  observe(() => {
    onEach(data, (value, key) => {
      $(key);
      cnt++;
    });
  });
  
  assertBody(`a`);
  expect(cnt).toEqual(1);
  
  data.b = 2;
  expect(data).toEqual({a: 1, b: 2});
  
  delete data.b;
  await asyncPassTime();
  assertBody(`a`);
  expect(cnt).toEqual(1);
});

test('onEach should handle items with identical sort keys', async () => {
  let data = proxy({a: 1, b: 1, c: 1, d: 1} as Record<string,number>);
  
  observe(() => {
    onEach(data, (value, key) => {
      $(key);
    }, value => value);
  });
  
  expect(getBody().split(' ').sort().join(' ')).toEqual(`a b c d`);
  
  delete data.b;
  await asyncPassTime();
  expect(getBody().split(' ').sort().join(' ')).toEqual(`a c d`);
  
  delete data.d;
  await asyncPassTime();
  expect(getBody().split(' ').sort().join(' ')).toEqual(`a c`);
  
  delete data.a;
  await asyncPassTime();
  expect(getBody().split(' ').sort().join(' ')).toEqual(`c`);
});

test('onEach keeps two onEaches in order', async () => {
  let data1 = proxy(['c1']);
  let data2 = proxy(['c2']);
  
  onEach(data1, (value) => {
    $(value);
  });
  onEach(data2, (value) => {
    $(value);
  }, value => value);
  
  assertBody(`c1 c2`);
  
  data1[1] = 'b1';
  await asyncPassTime();
  assertBody(`c1 b1 c2`);
  
  set(data2, ['b2', 'c2', 'd2']);
  await asyncPassTime();
  assertBody(`c1 b1 b2 c2 d2`);
  
  set(data1, []);
  await asyncPassTime();
  assertBody(`b2 c2 d2`);
  
  set(data2, []);
  await asyncPassTime();
  assertBody(``);
  
  set(data2, ['c2', 'b2']);
  await asyncPassTime();
  assertBody(`b2 c2`);
  
  set(data1, ['c1', 'b1']);
  await asyncPassTime();
  assertBody(`c1 b1 b2 c2`);
});

test('onEach iterates arrays', async () => {
  let data = proxy(['e', 'b', 'a', 'd']);
  
  observe(() => {
    onEach(data, (value, index) => {
      $('h' + index);
    });
    onEach(data, (value, index) => {
      $('i' + index);
    }, value => value);
  });
  
  assertBody(`h0 h1 h2 h3 i2 i1 i3 i0`);
  
  data[4] = 'c';
  await asyncPassTime();
  assertBody(`h0 h1 h2 h3 h4 i2 i1 i4 i3 i0`);
});

test('onEach iterates arrays that are pushed into', async () => {
  let data = proxy(['e', 'b', 'a', 'd']);
  
  observe(() => {
    onEach(data, (value, index) => {
      $('h' + index);
    });
    onEach(data, (value, index) => {
      $('i' + index);
    }, value => value);
  });
  
  data.push('c');
  
  await asyncPassTime();
  assertBody(`h0 h1 h2 h3 h4 i2 i1 i4 i3 i0`);
});

test('onEach removes all children before redrawing', async () => {
  let data = proxy({a: 1, b: 2});
  let select = proxy(1);
  
  observe(() => {
    const selectedValue = select.value;
    onEach(data, (value, key) => {
      $(key);
    }, (value, key) => {
      if (selectedValue == value) {
        return key;
      }
      return undefined;
    });
  });
  
  assertBody(`a`);
  
  select.value = 2;
  await asyncPassTime();
  assertBody(`b`);
});

test('onEach should handle items that don\'t create DOM elements', async () => {
  let data = proxy("b0 b1 c1 b2 c0 a1 a0 a2".split(" ")) as (string|undefined)[];
  
  onEach(data, (item, index) => {
    let letter = item[0];
    let count = parseInt(item[1]);
    for(let i = 0; i < count; i++) {
      $({text: index + letter});
    }
  }, item => [item[0], -parseInt(item[1])]);
  
  assertBody(`"7a" "7a" "5a" "3b" "3b" "1b" "2c"`);
  
  data[5] = undefined;
  data[3] = undefined;
  await asyncPassTime();
  assertBody(`"7a" "7a" "1b" "2c"`);
  
  data[0] = undefined;
  data[3] = undefined;
  data[5] = undefined;
  await asyncPassTime();
  assertBody(`"7a" "7a" "1b" "2c"`);
});

test('onEach filters when there is no sort key', async () => {
  let data = proxy(['a', 'b', 'c']);
  
  observe(() => {
    onEach(data, (item) => {
      $(item);
    }, item => item == 'b' ? undefined : item);
  });
  
  assertBody(`a c`);
  
  set(data, []);
  await asyncPassTime();
  assertBody(``);
});

test('onEach can run outside of any scope with map', async () => {
  let data = proxy([3, 7] as any[]);
  
  const incr = map(data, x => x + 1);
  expect([...incr]).toEqual([4, 8]);
  
  data.push(11);
  await asyncPassTime();
  expect([...incr]).toEqual([4, 8, 12]);
  
  data[1] = 0;
  await asyncPassTime();
  expect([...incr]).toEqual([4, 1, 12]);
  
  unmountAll();
  data.push(19);
  await asyncPassTime();
  expect([...incr]).toEqual([undefined, undefined, undefined]); // map() should have stopped!
});
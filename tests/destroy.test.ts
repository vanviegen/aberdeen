import { expect, test } from "bun:test";
import { getBody, assertBody, passTime, assertDomUpdates } from "./helpers";
import { $, proxy, observe, copy, onEach, mount } from "../src/aberdeen";
import { shrink } from "../src/transitions";

test('destroy event works for simple deletes', async () => {
  let data = proxy(true);
  observe(() => {
    if (data.value) $('b', {destroy: "x"});
    else $('c', {destroy: "x"});
  });
  assertBody(`b`);
  assertDomUpdates({new: 1, changed: 1});
  data.value = false;
  await passTime(1);
  assertBody(`c b.x`);
  assertDomUpdates({new: 2, changed: 3});
  await passTime(5000);
  assertBody(`c`);
  assertDomUpdates({new: 2, changed: 4});
});

test('destroy event inserts before deleted item', async () => {
  let data = proxy(['a'] as any[]);
  observe(() => {
    onEach(data, (value) => {
      $(value, {destroy: "x"});
    });
  });
  data[0] = undefined;
  await passTime(1);
  assertBody(`a.x`);
  data[0] = 'b';
  await passTime(1);
  assertBody(`b a.x`);
  await passTime(2000);
  assertBody(`b`);
});

test('transitions onEach deletes', async () => {
  let data = proxy(['a', 'b', 'c'] as any[]);
  mount(document.body, () => {
    onEach(data, (value) => {
      $(value, {destroy: "x"});
    });
  });
  assertBody(`a b c`);
  assertDomUpdates({new: 3, changed: 3});
  data[1] = undefined;
  await passTime(1);
  assertBody(`a b.x c`);
  await passTime(2000);
  assertBody(`a c`);
  copy(data, ['a', 'b', 'c', 'd', 'e', 'f']);
  await passTime(1);
  copy(data, [undefined, 'b', undefined, undefined, 'e', undefined]);
  await passTime(1);
  assertBody(`a.x b c.x d.x e f.x`);
  copy(data, ['a2', 'b', undefined, 'd2', 'e', 'f2']);
  await passTime(1);
  assertBody(`a2 a.x b d2 c.x d.x e f2 f.x`);
  await passTime(2000);
  assertBody(`a2 b d2 e f2`);
});

test('deletes in the middle of deleting items', async () => {
  let data = proxy(['a', 'b', 'c'] as any[]);
  observe(() => {
    onEach(data, (value) => {
      $(value, {destroy: "x"});
    });
  });
  await passTime(1);
  assertBody(`a b c`);
  data[2] = undefined;
  await passTime(500);
  assertBody(`a b c.x`);
  data[1] = undefined;
  await passTime(500);
  assertBody(`a b.x c.x`);
  data[0] = undefined;
  await passTime(500);
  assertBody(`a.x b.x c.x`);
  await passTime(500);
  assertBody(`a.x b.x`);
  await passTime(500);
  assertBody(`a.x`);
  await passTime(500);
  assertBody(``);
  copy(data, [undefined, 'b']);
  await passTime(1);
  assertBody(`b`);
});

test('aborts deletion transition on higher level removal', async () => {
  let data = proxy(['a']);
  let visible = proxy(true);
  observe(() => {
    if (visible.value) onEach(data, (value) => {
      $(value, {destroy: "x"});
    });
  });
  await passTime(1);
  assertBody(`a`);
  copy(data, []);
  await passTime(1);
  assertBody(`a.x`);
  visible.value = false;
  await passTime(2001);
  assertBody(``);
});

test('transitions removal of an entire onEach', async () => {
  let data = proxy(['a']);
  let visible = proxy(true);
  observe(() => {
    if (visible.value) onEach(data, (value) => {
      $(value, {destroy: "x"});
    });
  });
  await passTime(1);
  assertBody(`a`);
  visible.value = false;
  await passTime(1000);
  assertBody(`a.x`);
  await passTime(1000);
  assertBody(``);
});

test('insert new elements after a recently deleted item', async () => {
  let data = proxy({b: true, c: false});
  observe(() => {
    $('a');
    observe(() => {
      if (data.b) $('b', {destroy: 'y'});
      if (data.c) $('c');
    });
  });
  assertBody(`a b`);
  data.b = false;
  await passTime(1);
  assertBody(`a b.y`);
  await passTime(2000);
  assertBody(`a`);
  // This should trigger lazy deletion of the DeletionScope
  data.c = true;
  await passTime(1);
  assertBody(`a c`);
});

test('remove elements before and after a deleting element', async () => {
  let data = proxy({a: true, b: true, c: true});
  observe(() => {
    onEach(data, (value, key) => {
      if (value) $(key, key === 'b' ? {destroy: 'y'} : null);
    });
  });
  assertBody(`a b c`);
  data.b = false;
  await passTime(1);
  assertBody(`a b.y c`);
  data.a = false;
  await passTime(1);
  assertBody(`b.y c`);
  data.c = false;
  await passTime(1);
  assertBody(`b.y`);
  await passTime(2000);
  assertBody(``);
});

test('remove middle elements before and after a deleting element', async () => {
  let data = proxy({a: true, b: true, c: true, d: true, e: true});
  observe(() => {
    onEach(data, (value, key) => {
      if (value) $(key, key === 'c' ? {destroy: 'y'} : null);
    });
  });
  assertBody(`a b c d e`);
  data.c = false;
  await passTime(1);
  assertBody(`a b c.y d e`);
  data.b = false;
  await passTime(1);
  assertBody(`a c.y d e`);
  data.d = false;
  await passTime(1);
  assertBody(`a c.y e`);
  await passTime(2000);
  assertBody(`a e`);
});

test('performs a shrink animation', async () => {
  let data = proxy(true);
  observe(() => {
    if (data.value) $('a', {destroy: shrink});
  });
  assertBody(`a`);
  
  data.value = false;
  await passTime(1);
  expect(getBody().startsWith('a{')).toBe(true);
  expect(getBody().indexOf('scaleY') >= 0 && getBody().indexOf('scaleX') < 0).toBe(true);
  await passTime(2000);
  assertBody(``);
});

test('performs a horizontal shrink animation', async () => {
  let data = proxy(true);
  observe(() => {
    $('div', {$display: 'flex', $flexDirection: 'row-reverse'}, () => {
      if (data.value) $('a', {destroy: shrink});
    });
  });
  assertBody(`div{display:flex flexDirection:row-reverse a}`);
  
  data.value = false;
  await passTime(1);
  expect(getBody().indexOf('scaleX') >= 0 && getBody().indexOf('scaleY') < 0).toBe(true);
  await passTime(2000);
  assertBody(`div{display:flex flexDirection:row-reverse}`);
});
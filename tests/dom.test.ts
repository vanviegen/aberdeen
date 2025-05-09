import { expect, test } from "bun:test";
import { assertBody, passTime, assertDomUpdates, assertThrow } from "./helpers";
import { $, proxy, observe, unproxy, copy, dump, mount, unmountAll, MERGE } from "../src/aberdeen";

test('adds nodes', async () => {
  $('p');
  await passTime();
  assertBody(`p`);
});

test('refuses tags containing spaces', () => {
  assertThrow('cannot contain space', () => $('a b'));
});

test('adds classes', async () => {
  $('p.a.b');
  await passTime();
  assertBody(`p.a.b`);
});

test('sets attributes', async () => {
  $('div', {class: 'C', text: "T"}, {id: 'I', index: 1});
  await passTime();
  assertBody(`div.C{id=I index=1 "T"}`);
});

test('sets properties', async () => {
  $('p.C', {class: 'C', value: 3});
  await passTime();
  assertBody(`p.C{value->3}`);
});

test('nests elements', async () => {
  $('p', () => {
    $('a', () => {
      $('i', () => {
        $({text: 'contents'});
      });
    });
  });
  await passTime();
  assertBody(`p{a{i{"contents"}}}`);
});

test('sets properties from the inner scope', async () => {
  $('a', () => {
    $({
      href: '/',
      target: '_blank',
      disabled: true,
    });
  });
  await passTime();
  assertBody(`a{href=/ target=_blank disabled->true}`);
});

test('sets style objects', () => {
  $('a', {style: 'color: red;'});
  $('b', {$color: 'green'});
  $('c', () => {
    $({$color: 'orange'});
  });
  $('d', () => {
    $({$color: 'purple'});
  });
  $('e', () => {
    $({style: 'color: magento;'});
  });
  $('f', () => {
    $({style: 'color: cyan;'});
  });
  assertBody(`a{style="color: red;"} b{color:green} c{color:orange} d{color:purple} e{style="color: magento;"} f{style="color: cyan;"}`);
});

test('unmounts', async () => {
  let proxied = proxy('Hej world');
  let cnt = 0;
  mount(document.body, () => {
    cnt++;
    $('p:' + proxied.value);
  });
  assertBody(`p{"Hej world"}`);
  unmountAll();
  assertBody(``);
  proxied.value = 'Updated';
  await passTime();
  expect(cnt).toEqual(1);
});

test('creates text nodes', async () => {
  let index = proxy(0);
  let cases = [
    ['test', `"test"`],
    ['', `""`],
    [0, `"0"`],
    [null, ``],
    [undefined, ``],
    [false, `"false"`],
  ];
  mount(document.body, () => {
    $({text: cases[index.value][0]});
  });
  while(true) {
    await passTime();
    assertBody('' + cases[unproxy(index).value][1]);
    if (unproxy(index).value >= cases.length-1) {
      break;
    }
    index.value += 1;
  }
});

test('adds preexisting elements to the DOM', () => {
  mount(document.body, () => {
    let el = document.createElement('video');
    el.classList.add("test");
    $({element: el});
    $({element: null}); // should be ignored
    assertThrow('Unexpected element', () => $({element: false as any}));
  });
  assertBody(`video.test`);
});

test('handles nontypical options well', () => {
  let cases: Array<[string,()=>void]> = [
    [`div`, () => $("div")],
    [`div`, () => $("div.")],
    [`div.a.b.c`, () => $("div.a.b.c")],
    [`"1234"`, () => $(undefined, {text:1234})],
    [`_!@#*{"first" "1234" "last"}`, () => $("_!@#*", null, undefined, {}, {text: "first"}, {text: 1234}, {text: "last"})],
  ];
  for(let c of cases) {
    mount(document.body, () => {
      c[1]();
    });
    assertBody(c[0]);
    unmountAll();
  }
  mount(document.body, () => {
    assertThrow("Unexpected argument", () => $("span", [] as any));
    assertThrow("Unexpected argument", () => $("span", new Error() as any));
    assertThrow("Unexpected argument", () => $("span", true as any));
  });
});

test('dumps all basic values', () => {
  let data = proxy([true, false, null, undefined, -12, 3.14, "test", '"quote"']);
  mount(document.body, () => dump(data));
  assertBody(`"<array>" ul{li{"0: " "true"} li{"1: " "false"} li{"2: " "null"} li{"4: " "-12"} li{"5: " "3.14"} li{"6: " "\\"test\\""} li{"7: " "\\"\\\\\\"quote\\\\\\"\\""}}`);
});

test('dumps objects and arrays', async () => {
  let data = proxy({3: 4, a: 'b', d: [4, undefined, 'b']} as any);
  mount(document.body, () => dump(data));
  assertBody(`"<object>" ul{li{"\\"3\\": " "4"} li{"\\"a\\": " "\\"b\\""} li{"\\"d\\": " "<array>" ul{li{"0: " "4"} li{"2: " "\\"b\\""}}}}`);
});

test('adds html', async () => {
  let data = proxy('test' as string|number);
  mount(document.body, () => {
    $('main', () => {
      $('hr');
      observe(() => {
        $({html: data.value});
      });
      $('img');
    });
  });
  assertBody(`main{hr fake-emulated-html{"test"} img}`);
  data.value = "";
  await passTime();
  assertBody(`main{hr img}`);
  data.value = 123;
  await passTime();
  assertBody(`main{hr fake-emulated-html{"123"} img}`);
});

test('only unlinks the top parent of the tree being removed', async () => {
  let data = proxy(true);
  mount(document.body, () => {
    if (data.value) $('main', () => {
      $('a');
      $('b');
      $('c');
    });
  });
  assertBody(`main{a b c}`);
  assertDomUpdates({new: 4, changed: 4});
  data.value = false;
  await passTime();
  assertBody(``);
  assertDomUpdates({new: 4, changed: 5});
});

test('merges objects collapsing changes', async () => {
  const data = proxy({a: 1, b: 2, c: 3} as Record<string,number>);
  let cnt = 0;
  
  mount(document.body, () => {
    cnt++;
    $({text: data.a + data.a + data.b});
  });
  
  assertBody(`"4"`);
  
  copy(data, {a: 3, b: 4});
  await passTime();
  assertBody(`"10"`);
  expect(cnt).toEqual(2);
  
  copy(data, {c: 4}, MERGE);
  expect(cnt).toEqual(2);
});
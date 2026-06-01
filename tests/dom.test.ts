import { expect, test } from "bun:test";
import { assertBody, passTime, assertDomUpdates, assertThrow } from "./helpers";
import A from "../src/aberdeen";

test('adds nodes', async () => {
  A('p');
  await passTime();
  assertBody(`p`);
});

test('adds classes', async () => {
  A('p.a.b');
  await passTime();
  assertBody(`p.a.b`);
});

test('sets attributes', async () => {
  A('div', {class: 'C', text: "T"}, {id: 'I', index: 1});
  await passTime();
  assertBody(`div.C{id=I index=1 "T"}`);
});

test('sets properties', async () => {
  A('p.C', {class: 'C', value: 3});
  await passTime();
  assertBody(`p.C{value->3}`);
});

test('nests elements', async () => {
  A('p', () => {
    A('a', () => {
      A('i', () => {
        A({text: 'contents'});
      });
    });
  });
  await passTime();
  assertBody(`p{a{i{"contents"}}}`);
});

test('sets properties from the inner scope', async () => {
  A('a', () => {
    A({
      href: '/',
      target: '_blank',
      disabled: true,
    });
  });
  await passTime();
  assertBody(`a{href=/ target=_blank disabled->true}`);
});

test('sets style objects', () => {
  A('a', {style: 'color: red;'});
  A('b', {$color: 'green'});
  A('c', () => {
    A({$color: 'orange'});
  });
  A('d', () => {
    A({$color: 'purple'});
  });
  A('e', () => {
    A({style: 'color: magento;'});
  });
  A('f', () => {
    A({style: 'color: cyan;'});
  });
  assertBody(`a{style="color: red;"} b{color:green} c{color:orange} d{color:purple} e{style="color: magento;"} f{style="color: cyan;"}`);
});

test('unmounts', async () => {
  let proxied = A.proxy('Hej world');
  let cnt = 0;
  A.mount(document.body, () => {
    cnt++;
    A('p#' + proxied.value);
  });
  assertBody(`p{"Hej world"}`);
  A.unmountAll();
  assertBody(``);
  proxied.value = 'Updated';
  await passTime();
  expect(cnt).toEqual(1);
});

test('creates text nodes', async () => {
  let index = A.proxy(0);
  let cases = [
    ['test', `"test"`],
    ['', `""`],
    [0, `"0"`],
    [null, ``],
    [undefined, ``],
    [false, `"false"`],
  ];
  A.mount(document.body, () => {
    A({text: cases[index.value][0]});
  });
  while(true) {
    await passTime();
    assertBody('' + cases[A.unproxy(index).value][1]);
    if (A.unproxy(index).value >= cases.length-1) {
      break;
    }
    index.value += 1;
  }
});

test('adds preexisting elements to the DOM', () => {
  A.mount(document.body, () => {
    let el = document.createElement('video');
    el.classList.add("test");
    el.appendChild(document.createElement('source'));
    let txt = document.createTextNode('txt');
    A('p', el, txt, 'source.b');
    A(null); // should be ignored
  });
  assertBody(`p{video.test{source "txt" source.b}}`);
});

test('handles nontypical options well', () => {
  let cases: Array<[string,()=>void]> = [
    [`div`, () => A("div")],
    [`div`, () => A("div.")],
    [`div.a.b.c`, () => A("div.a.b.c")],
    [`"1234"`, () => A(undefined, {text:1234})],
    [`_!@*{"first" "1234" "last"}`, () => A("_!@*", null, undefined, {}, {text: "first"}, {text: 1234}, {text: "last"})],
  ];
  for(let c of cases) {
    A.mount(document.body, () => {
      c[1]();
    });
    assertBody(c[0]);
    A.unmountAll();
  }
  A.mount(document.body, () => {
    assertThrow("Unexpected argument", () => A("span", [] as any));
    assertThrow("Unexpected argument", () => A("span", new Error() as any));
    assertThrow("Unexpected argument", () => A("span", true as any));
  });
});

test('dumps all basic values', () => {
  let data = A.proxy([true, false, null, undefined, -12, 3.14, "test", '"quote"']);
  A.mount(document.body, () => A.dump(data));
  assertBody(`"<Array>" ul{li{"true"} li{"false"} li{"null"} li{"undefined"} li{"-12"} li{"3.14"} li{"\\"test\\""} li{"\\"\\\\\\"quote\\\\\\"\\""}}`);
});

test('dumps objects and arrays', async () => {
  let data = A.proxy({3: 4, a: 'b', d: [4, undefined, 'b']} as any);
  A.mount(document.body, () => A.dump(data));
  assertBody(`"<Object>" ul{li{"\\"3\\": " "4"} li{"\\"a\\": " "\\"b\\""} li{"\\"d\\": " "<Array>" ul{li{"4"} li{"undefined"} li{"\\"b\\""}}}}`);
});

test('adds html', async () => {
  let data = A.proxy('test' as string|number);
  A.mount(document.body, () => {
    A('main', () => {
      A('hr');
      A(() => {
        A({html: data.value});
      });
      A('img');
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

test('renders rich text with markdown-like syntax', async () => {
  A.mount(document.body, () => {
    A('p rich="This is *italic* and **bold** and `some code` here."');
  });
  assertBody(`p{"This is " em{"italic"} " and " strong{"bold"} " and " code{"some code"} " here."}`);
});

test('renders rich text with links', async () => {
  A.mount(document.body, () => {
    A('p rich="Click [here](/path) for more."');
  });
  assertBody(`p{"Click " a{href->/path "here"} " for more."}`);
});

test('renders rich text reactively', async () => {
  let data = A.proxy('plain text');
  A.mount(document.body, () => {
    A('p rich=', data);
  });
  assertBody(`p{"plain text"}`);
  data.value = 'now with *emphasis*';
  await passTime();
  assertBody(`p{"now with " em{"emphasis"}}`);
});

test('renders rich text with plain text only', async () => {
  A.mount(document.body, () => {
    A('p rich="No special formatting here"');
  });
  assertBody(`p{"No special formatting here"}`);
});

test('only unlinks the top parent of the tree being removed', async () => {
  let data = A.proxy(true);
  A.mount(document.body, () => {
    if (data.value) A('main', () => {
      A('a');
      A('b');
      A('c');
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
  const data = A.proxy({a: 1, b: 2, c: 3} as Record<string,number>);
  let cnt = 0;
  
  A.mount(document.body, () => {
    cnt++;
    A({text: data.a + data.a + data.b});
  });
  
  assertBody(`"4"`);
  
  A.copy(data, {a: 3, b: 4});
  await passTime();
  assertBody(`"10"`);
  expect(cnt).toEqual(2);
  
  A.merge(data, {c: 4});
  expect(cnt).toEqual(2);
});

test('text in content function comes after argument text', async () => {
  A('p#abc', '#def', () => {
    A('#ghi');
    A('#jkl')
  })
  assertBody(`p{"abc" "def" "ghi" "jkl"}`);
});

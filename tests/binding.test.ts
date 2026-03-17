import { expect, test } from "bun:test";
import { assertBody, passTime } from "./helpers";
import A from "../src/aberdeen";

test('binds input values', async () => {
  let data = A.proxy('test');
  let inputElement;
  A(() => {
    A('input', {bind: data}, () => {
      inputElement = A();
      A({".correct": data.value.length >= 5});
    });
  });
  assertBody(`input{value->test}`);
  inputElement!.value = "testx";
  inputElement!.event("input");
  await passTime();
  assertBody(`input.correct{value->testx}`);

  inputElement!.value = "n/a";
  inputElement!.event("input");
  await passTime();
  assertBody(`input{value->n/a}`);
});

test('binds checkboxes', async () => {
  let data = A.proxy(true);
  let inputElement;
  A(() => {
    A('input', {type: 'checkbox', bind: data}, () => {
      inputElement = A();
    });
  });
  assertBody(`input{type=checkbox checked->true}`);
  inputElement!.checked = false;
  inputElement!.event("input");
  await passTime();
  assertBody(`input{type=checkbox checked->false}`);
});

test('binds radio buttons', async () => {
  let data = A.proxy('woman' as string);
  let inputElement1, inputElement2;
  A(() => {
    A('input', {type: 'radio', name: 'gender', value: 'man', bind: data}, () => {
      inputElement1 = A();
    });
    A('input', {type: 'radio', name: 'gender', value: 'woman', bind: data}, () => {
      inputElement2 = A();
    });
  });
  assertBody(`input{name=gender type=radio checked->false value->man} input{name=gender type=radio checked->true value->woman}`);
  inputElement1!.checked = true;
  inputElement1!.event("input");
  inputElement2!.checked = false;
  inputElement2!.event("input");
  await passTime();
  expect(data.value).toEqual('man');
});

test('reads initial value when A.proxy is undefined', () => {
  let data = A.proxy({} as Record<string, any>);
  A(() => {
    A('input', {value: 'a', bind: A.ref(data, 'input')});
    A('input', {type: 'checkbox', checked: true, bind: A.ref(data, 'checkbox')});
    A('input', {type: 'radio', name: 'abc', value: 'x', checked: false, bind: A.ref(data, 'radio')});
    A('input', {type: 'radio', name: 'abc', value: 'y', checked: true, bind: A.ref(data, 'radio')});
    A('input', {type: 'radio', name: 'abc', value: 'z', checked: false, bind: A.ref(data, 'radio')});
  });
  expect(data).toEqual({input: 'a', checkbox: true, radio: 'y'});
});

test('changes DOM when A.proxy value is updated', async () => {
  let data = A.proxy("test" as string);
  let toggle = A.proxy(true as boolean);
  A(() => {
    A('input', {bind: data});
    A('input', {type: 'checkbox', bind: toggle});
  });
  assertBody(`input{value->test} input{type=checkbox checked->true}`);
  data.value = "changed";
  toggle.value = false;
  await passTime();
  assertBody(`input{value->changed} input{type=checkbox checked->false}`);
});

test('returns numbers for number/range typed inputs', async () => {
  let data = A.proxy("" as any);
  let inputElement;
  A(() => {
    A('input', {type: 'number', bind: data}, () => {
      inputElement = A();
    });
  });
  assertBody(`input{type=number value->""}`);
  inputElement!.value = "123";
  inputElement!.event("input");
  await passTime();
  expect(data.value).toEqual(123);
  inputElement!.value = "";
  inputElement!.event("input");
  await passTime();
  expect(data.value).toEqual(null);
});

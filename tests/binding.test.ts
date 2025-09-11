import { expect, test } from "bun:test";
import { assertBody, passTime } from "./helpers";
import { $, proxy, ref, getParentElement } from "../src/aberdeen";

test('binds input values', async () => {
  let data = proxy('test');
  let inputElement;
  $(() => {
    $('input', {bind: data}, () => {
      inputElement = getParentElement();
      $({".correct": data.value.length >= 5});
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
  let data = proxy(true);
  let inputElement;
  $(() => {
    $('input', {type: 'checkbox', bind: data}, () => {
      inputElement = getParentElement();
    });
  });
  assertBody(`input{type=checkbox checked->true}`);
  inputElement!.checked = false;
  inputElement!.event("input");
  await passTime();
  assertBody(`input{type=checkbox checked->false}`);
});

test('binds radio buttons', async () => {
  let data = proxy('woman' as string);
  let inputElement1, inputElement2;
  $(() => {
    $('input', {type: 'radio', name: 'gender', value: 'man', bind: data}, () => {
      inputElement1 = getParentElement();
    });
    $('input', {type: 'radio', name: 'gender', value: 'woman', bind: data}, () => {
      inputElement2 = getParentElement();
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

test('reads initial value when proxy is undefined', () => {
  let data = proxy({} as Record<string, any>);
  $(() => {
    $('input', {value: 'a', bind: ref(data, 'input')});
    $('input', {type: 'checkbox', checked: true, bind: ref(data, 'checkbox')});
    $('input', {type: 'radio', name: 'abc', value: 'x', checked: false, bind: ref(data, 'radio')});
    $('input', {type: 'radio', name: 'abc', value: 'y', checked: true, bind: ref(data, 'radio')});
    $('input', {type: 'radio', name: 'abc', value: 'z', checked: false, bind: ref(data, 'radio')});
  });
  expect(data).toEqual({input: 'a', checkbox: true, radio: 'y'});
});

test('changes DOM when proxy value is updated', async () => {
  let data = proxy("test" as string);
  let toggle = proxy(true as boolean);
  $(() => {
    $('input', {bind: data});
    $('input', {type: 'checkbox', bind: toggle});
  });
  assertBody(`input{value->test} input{type=checkbox checked->true}`);
  data.value = "changed";
  toggle.value = false;
  await passTime();
  assertBody(`input{value->changed} input{type=checkbox checked->false}`);
});

test('returns numbers for number/range typed inputs', async () => {
  let data = proxy("" as any);
  let inputElement;
  $(() => {
    $('input', {type: 'number', bind: data}, () => {
      inputElement = getParentElement();
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

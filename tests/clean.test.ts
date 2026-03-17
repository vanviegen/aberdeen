import { expect, test } from "bun:test";
import A from "../src/aberdeen";
import { assertBody, passTime } from './helpers';

test('Clean triggers once when redrawing', async () => {
  let cnt1 = 0, cnt2 = 0;
  let data = A.proxy(1);
  
  A(() => {
    cnt1++;
    A({text: data.value});
    A.clean(() => {
      cnt2++;
    });
  });
  
  await passTime();
  assertBody(`"1"`);
  expect(cnt1).toEqual(1);
  expect(cnt2).toEqual(0);
  
  data.value = 2;
  await passTime();
  assertBody(`"2"`);
  expect(cnt1).toEqual(2);
  expect(cnt2).toEqual(1);
  
  A.unmountAll();
  expect(cnt1).toEqual(2);
  expect(cnt2).toEqual(2);
});

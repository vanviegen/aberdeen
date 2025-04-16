import { expect, test } from "bun:test";
import { $, proxy, observe, clean, unmountAll } from "../src/aberdeen";
import { assertBody, asyncPassTime } from './helpers';

test('Clean triggers once when redrawing', async () => {
  let cnt1 = 0, cnt2 = 0;
  let data = proxy(1);
  
  observe(() => {
    cnt1++;
    $({text: data.value});
    clean(() => {
      cnt2++;
    });
  });
  
  await asyncPassTime();
  assertBody(`"1"`);
  expect(cnt1).toEqual(1);
  expect(cnt2).toEqual(0);
  
  data.value = 2;
  await asyncPassTime();
  assertBody(`"2"`);
  expect(cnt1).toEqual(2);
  expect(cnt2).toEqual(1);
  
  unmountAll();
  expect(cnt1).toEqual(2);
  expect(cnt2).toEqual(2);
});

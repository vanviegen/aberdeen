import { expect, test } from "bun:test";
import { assertBody, passTime, assertThrow } from "./helpers";
import $ from "../src/aberdeen";

test('fires higher-scope isEmpty before getting to content', () => {
	let store = $.proxy<string[]>(['a']);
	let cnt1 = 0, cnt2 = 0;
	$.mount(document.body, () => {
		cnt1++;
		if (!$.isEmpty(store)) {
			$('div', () => {
				cnt2++;
				$({text: store[0]});
			});
		}
	});
	assertBody(`div{"a"}`);

	store[0] = 'b';
	passTime();
	assertBody(`div{"b"}`);
	expect([cnt1, cnt2]).toEqual([1, 2]);

	// Delete the first element
	$.set(store, [] as string[]);
	passTime();
	assertBody(``);
	expect([cnt1, cnt2]).toEqual([2, 2]);
});

test('reactively get full array', () => {
	let store = $.proxy<any[]>([3, 4, [5, 6]]);
	$.mount(document.body, () => {
		$({text: JSON.stringify(store)});
		$({text: JSON.stringify(store[2])});
	});
	passTime();
	assertBody(`"[3,4,[5,6]]" "[5,6]"`);

	store.push(7);
	(store[2] as any).push(8);
	passTime();
	assertBody(`"[3,4,[5,6,8],7]" "[5,6,8]"`);

	expect(store[6]).toEqual(undefined);
	// The old API had a toEqual method on store items, which doesn't exist in the new API
	// This line needs to be rewritten to use the new API
	expect($.get(store, 6) || 'a').toEqual('a');
});

test('merges', () => {
	let cnt1 = 0, cnt2 = 0;
	let store = $.proxy([1, undefined, 3] as (number|string|undefined)[]);
	$.mount(document.body, () => {
		cnt1++;
		$.onEach(store, (item) => {
			cnt2++;
			$('div:' + item);
		});
	});

	assertBody(`div{"1"} div{"3"}`);
	expect([cnt1, cnt2]).toEqual([1, 2]);

	store[1] = 2;
	passTime();
	assertBody(`div{"1"} div{"2"} div{"3"}`);
	expect([cnt1, cnt2]).toEqual([1, 3]);

	// Merging just replace the entire array
	$.merge(store, [1, "two"]);
	passTime();
	assertBody(`div{"1"} div{"two"}`);
	expect([cnt1, cnt2]).toEqual([1, 4]);

	store[9] = 'ten';
	passTime();
	assertBody(`div{"1"} div{"two"} div{"ten"}`);
	expect([cnt1, cnt2]).toEqual([1, 5]);

	store[4] = 'five';
	passTime();
	assertBody(`div{"1"} div{"two"} div{"five"} div{"ten"}`);
	expect([cnt1, cnt2]).toEqual([1, 6]);

	// Delete element at index 1
	const newArray = [...store].filter((_, i) => i !== 1);
	$.set(store, newArray);
	passTime();
	assertBody(`div{"1"} div{"five"} div{"ten"}`);
	expect([cnt1, cnt2]).toEqual([1, 6]);

	// Delete element at index 9
	delete store[9];
	store.push("six");
	expect(store[5]).toEqual("six");
	passTime();
	assertBody(`div{"1"} div{"five"} div{"six"}`);
	expect([cnt1, cnt2]).toEqual([1, 7]);

	$.set(store, [1, undefined, 3]);
	passTime();
	assertBody(`div{"1"} div{"3"}`);
	expect([cnt1, cnt2]).toEqual([1, 8]);
});
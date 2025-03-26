import { expect, test } from "bun:test";
import { assertBody, passTime, assertThrow } from "./helpers";
import $ from "../src/aberdeen";

test('fires higher-scope isEmpty before getting to content', () => {
	let data = $.proxy<string[]>(['a']);
	let cnt1 = 0, cnt2 = 0;
	$(() => {
		cnt1++;
		if (!$.isEmpty(data)) {
			$('div', () => {
				// TODO: this runs after the parent has been removed. Is something missing in cleaners?
				// Or is some delete function not removing the scope from the queue?
				// Or is the delete not happening in the parent's queueRun.
				// The ordering *does* seem to be right though.
				cnt2++;
				$({text: data[0]});
			});
		}
	});
	assertBody(`div{"a"}`);

	data[0] = 'b';
	passTime();
	assertBody(`div{"b"}`);
	expect([cnt1, cnt2]).toEqual([1, 2]);

	// Clear the array
	$.set(data, [] as string[]);

	passTime();
	assertBody(``);
	expect([cnt1, cnt2]).toEqual([2, 2]);
});

test('reactively get full array', () => {
	let data = $.proxy<any[]>([3, 4, [5, 6]]);
	$.mount(document.body, () => {
		$({text: JSON.stringify(data)});
		$({text: JSON.stringify(data[2])});
	});
	passTime();
	assertBody(`"[3,4,[5,6]]" "[5,6]"`);

	data.push(7);
	(data[2] as any).push(8);
	passTime();
	assertBody(`"[3,4,[5,6,8],7]" "[5,6,8]"`);

	expect(data[6]).toEqual(undefined);

	data.length = 2;
	passTime();
	assertBody(`"[3,4]"`);
});

test('merges', () => {
	let cnt1 = 0, cnt2 = 0;
	let data = $.proxy([1, undefined, 3] as (number|string|undefined)[]);
	$.mount(document.body, () => {
		cnt1++;
		$.onEach(data, (item, index) => {
			cnt2++;
			$('div:' + item);
		});
	});

	assertBody(`div{"1"} div{"3"}`);
	expect([cnt1, cnt2]).toEqual([1, 2]);

	data[1] = 2;
	passTime();
	assertBody(`div{"1"} div{"2"} div{"3"}`);
	expect([cnt1, cnt2]).toEqual([1, 3]);

	// Merging just replace the entire array
	$.merge(data, [1, "two"]);
	passTime();
	assertBody(`div{"1"} div{"two"}`);
	expect([cnt1, cnt2]).toEqual([1, 4]);

	data[9] = 'ten';
	passTime();
	assertBody(`div{"1"} div{"two"} div{"ten"}`);
	expect([cnt1, cnt2]).toEqual([1, 5]);

	data[4] = 'five';
	passTime();
	assertBody(`div{"1"} div{"two"} div{"five"} div{"ten"}`);
	expect([cnt1, cnt2]).toEqual([1, 6]);

	// Delete element at index 1
	delete data[1];
	passTime();
	assertBody(`div{"1"} div{"five"} div{"ten"}`);
	expect([cnt1, cnt2]).toEqual([1, 6]);

	// Delete element at index 9
	delete data[9];
	data.push("six");
	expect(data[10]).toEqual("six");
	passTime();
	assertBody(`div{"1"} div{"five"} div{"six"}`);
	expect([cnt1, cnt2]).toEqual([1, 7]);

	$.set(data, [1, undefined, 3]);
	passTime();
	assertBody(`div{"1"} div{"3"}`);
	expect([cnt1, cnt2]).toEqual([1, 8]);
});

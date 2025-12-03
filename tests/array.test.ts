import { expect, test } from "bun:test";
import { assertBody, passTime } from "./helpers";
import { $, proxy, onEach, mount, isEmpty, merge } from "../src/aberdeen";

test('fires higher-scope isEmpty before getting to content', async () => {
	let data = proxy<string[]>(['a']);
	let cnt1 = 0, cnt2 = 0;
	$(() => {
		cnt1++;
		if (!isEmpty(data)) {
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
	await passTime();
	assertBody(`div{"b"}`);
	expect([cnt1, cnt2]).toEqual([1, 2]);

	// Clear the array
	merge(data, [] as string[]);

	await passTime();
	assertBody(``);
	expect([cnt1, cnt2]).toEqual([2, 2]);
});

test('reactively get full array', async () => {
	let data = proxy<any[]>([3, 4, [5, 6]]);
	mount(document.body, () => {
		$({text: JSON.stringify(data)});
		$({text: JSON.stringify(data[2])});
	});
	await passTime();
	assertBody(`"[3,4,[5,6]]" "[5,6]"`);

	data.push(7);
	(data[2] as any).push(8);
	await passTime();
	assertBody(`"[3,4,[5,6,8],7]" "[5,6,8]"`);

	expect(data[6]).toEqual(undefined);

	data.length = 2;
	await passTime();
	assertBody(`"[3,4]"`);
});

test('merges', async () => {
	let cnt1 = 0, cnt2 = 0;
	let data = proxy([1, undefined, 3] as (number|string|undefined)[]);
	mount(document.body, () => {
		cnt1++;
		onEach(data, (item, index) => {
			cnt2++;
			$('div#' + item);
		});
	});

	assertBody(`div{"1"} div{"undefined"} div{"3"}`);
	expect([cnt1, cnt2]).toEqual([1, 3]);

	data[1] = 2;
	await passTime();
	assertBody(`div{"1"} div{"2"} div{"3"}`);
	expect([cnt1, cnt2]).toEqual([1, 4]);

	// Merging just replace the entire array
	merge(data, [1, "two"]);
	await passTime();
	assertBody(`div{"1"} div{"two"}`);
	expect([cnt1, cnt2]).toEqual([1, 5]);

	data[9] = 'ten';
	await passTime();
	assertBody(`div{"1"} div{"two"} div{"ten"}`);
	expect([cnt1, cnt2]).toEqual([1, 6]);

	data[4] = 'five';
	await passTime();
	assertBody(`div{"1"} div{"two"} div{"five"} div{"ten"}`);
	expect([cnt1, cnt2]).toEqual([1, 7]);

	delete data[1];
	await passTime();
	assertBody(`div{"1"} div{"five"} div{"ten"}`);
	expect([cnt1, cnt2]).toEqual([1, 7]);

	delete data[9]; // length should not change
	data.push("six"); // at position 10
	expect(data[10]).toEqual("six");
	await passTime();
	assertBody(`div{"1"} div{"five"} div{"six"}`);
	expect([cnt1, cnt2]).toEqual([1, 8]);

	merge(data, [1, undefined, 3]);
	await passTime();
	assertBody(`div{"1"} div{"undefined"} div{"3"}`);
	expect([cnt1, cnt2]).toEqual([1, 10]); // replaced 2

	console.log('set empty');
	merge(data, [1, /*empty*/, 3]);
	await passTime();
	assertBody(`div{"1"} div{"3"}`);
	expect([cnt1, cnt2]).toEqual([1, 10]); // just removed 1

	merge(data, [1, undefined, 3]); // and back from empty
	await passTime();
	assertBody(`div{"1"} div{"undefined"} div{"3"}`);
	expect([cnt1, cnt2]).toEqual([1, 11]);

});

test('array at()', async function() {
	let arr = proxy([2,4,6]);
	expect(arr.at(0)).toEqual(2);
	expect(arr.at(2)).toEqual(6);
	expect(arr.at(-1)).toEqual(6);
	expect(arr.at(-2)).toEqual(4);

	let value;
	$(() => {
		value = arr.at(-2);
	})
	expect(value).toEqual(4);

	arr[1] = 10;
	await passTime();
	expect(value).toEqual(10);

	arr.push(42); // changes `length` so value should now hold arr[2]
	await passTime();
	expect(value).toEqual(6);
});

test('proxy supports array shift and unshift', async () => {
	const arr = proxy([1, 2, 3, 4]);
	let value: any;
	
	$(() => {
	  value = [...arr];
	});
	
	await passTime();
	expect(value).toEqual([1, 2, 3, 4]);
	
	const shifted = arr.shift();
	expect(shifted).toEqual(1);
	await passTime();
	expect(value).toEqual([2, 3, 4]);
	
	arr.unshift(10, 20);
	await passTime();
	expect(value).toEqual([10, 20, 2, 3, 4]);
  });
  
  test('proxy supports array forEach', async () => {
	const arr = proxy([1, 2, 3]);
	const results: number[] = [];
	
	arr.forEach((item, index) => {
	  results.push(item * index);
	});
	
	expect(results).toEqual([0, 2, 6]);
	
	// Test reactivity
	let sum = 0;
	$(() => {
	  sum = 0;
	  arr.forEach(item => {
		sum += item;
	  });
	});
	
	await passTime();
	expect(sum).toEqual(6);
	
	arr.push(4);
	await passTime();
	expect(sum).toEqual(10);
  });
  
  test('proxy supports array concat', async () => {
	const arr1 = proxy([1, 2]);
	const arr2 = proxy([3, 4]);
	let result: any;
	
	$(() => {
	  result = [...arr1.concat(arr2)];
	});
	expect(result).toEqual([1, 2, 3, 4]);
	
	arr1.push(5);
	await passTime();
	expect(result).toEqual([1, 2, 5, 3, 4]);
	
	arr2.push(6);
	await passTime();
	expect(result).toEqual([1, 2, 5, 3, 4, 6]);
  });
  
  test('proxy supports array predicates (every, filter, find, includes)', async () => {
	const arr = proxy([10, 20, 30, 40, 50]);
	let everyResult: boolean = false;
	let filterResult: number[] = [];
	let findResult: number | undefined;
	let includesResult: boolean = false;
	
	$(() => {
	  everyResult = arr.every(item => item >= 10);
	  filterResult = [...arr.filter(item => item > 20)];
	  findResult = arr.find(item => item > 25);
	  includesResult = arr.includes(30);
	});
	
	await passTime();
	expect(everyResult).toEqual(true);
	expect(filterResult).toEqual([30, 40, 50]);
	expect(findResult).toEqual(30);
	expect(includesResult).toEqual(true);
	
	arr.unshift(5);
	await passTime();
	expect(everyResult).toEqual(false);
	expect(filterResult).toEqual([30, 40, 50]);
	expect(findResult).toEqual(30);
	expect(includesResult).toEqual(true);
	
	arr.pop(); // Remove 50
	arr.shift(); // Remove 5
	await passTime();
	expect(everyResult).toEqual(true);
	expect(filterResult).toEqual([30, 40]);
	expect(findResult).toEqual(30);
	expect(includesResult).toEqual(true);
	
	arr.splice(2, 1); // Remove 30
	await passTime();
	expect(everyResult).toEqual(true);
	expect(filterResult).toEqual([40]);
	expect(findResult).toEqual(40);
	expect(includesResult).toEqual(false);
  });
  
  test('proxy supports array index methods', async () => {
	const arr = proxy([10, 20, 30, 20, 40]);
	
	// Test all index methods at once
	const testIndexMethods = (array: any, value: any, expectedIndex: number, expectedLastIndex: number) => {
	  expect(array.indexOf(value)).toEqual(expectedIndex);
	  expect(array.lastIndexOf(value)).toEqual(expectedLastIndex);
	  expect(array.findIndex(item => item === value)).toEqual(expectedIndex);
	  expect(array.findLastIndex(item => item === value)).toEqual(expectedLastIndex);
	};
	
	testIndexMethods(arr, 20, 1, 3);
	testIndexMethods(arr, 30, 2, 2);
	testIndexMethods(arr, 50, -1, -1);
	
	// Test reactivity
	let foundIndex: number = -1;
	let foundLastIndex: number = -1;
	
	$(() => {
	  foundIndex = arr.findIndex(item => item > 25);
	  foundLastIndex = arr.findLastIndex(item => item > 25);
	});
	
	await passTime();
	expect(foundIndex).toEqual(2); // 30 at index 2
	expect(foundLastIndex).toEqual(4); // 40 at index 4
	
	arr.splice(2, 1); // Remove 30
	await passTime();
	expect(foundIndex).toEqual(3); // 40 at index 3 now
	expect(foundLastIndex).toEqual(3); // 40 at index 3
	
	arr.push(60);
	await passTime();
	expect(foundIndex).toEqual(3); // Still 40 at index 3
	expect(foundLastIndex).toEqual(4); // 60 at index 4
  });
  
  test('proxy supports array join', async () => {
	const arr = proxy(['a', 'b', 'c']);
	let joined = '';
	
	$(() => {
	  joined = arr.join('-');
	});
	
	await passTime();
	expect(joined).toEqual('a-b-c');
	
	arr.push('d');
	await passTime();
	expect(joined).toEqual('a-b-c-d');
	
	arr.splice(1, 1);
	await passTime();
	expect(joined).toEqual('a-c-d');
  });
  
  test('proxy supports array map with reactivity', async () => {
	const arr = proxy([1, 2, 3]);
	let mappedValues: number[] = [];
	
	$(() => {
	  mappedValues = [...arr.map(item => item * 10)];
	});
	
	await passTime();
	expect(mappedValues).toEqual([10, 20, 30]);
	
	arr.push(4);
	await passTime();
	expect(mappedValues).toEqual([10, 20, 30, 40]);
	
	arr[1] = 5;
	await passTime();
	expect(mappedValues).toEqual([10, 50, 30, 40]);
	
	arr.splice(0, 2);
	await passTime();
	expect(mappedValues).toEqual([30, 40]);
  });
  
  test('proxy supports array find and findLast', async () => {
	const arr = proxy([
	  { id: 1, value: 'a' },
	  { id: 2, value: 'b' },
	  { id: 3, value: 'c' },
	  { id: 4, value: 'b' }
	]);
	
	let firstB: any;
	let lastB: any;
	
	$(() => {
	  firstB = arr.find(item => item.value === 'b');
	  lastB = arr.findLast(item => item.value === 'b');
	});
	
	await passTime();
	expect(firstB).toEqual({ id: 2, value: 'b' });
	expect(lastB).toEqual({ id: 4, value: 'b' });
	
	arr[1].value = 'x';
	await passTime();
	expect(firstB).toEqual({ id: 4, value: 'b' });
	expect(lastB).toEqual({ id: 4, value: 'b' });
	
	arr.push({ id: 5, value: 'b' });
	await passTime();
	expect(firstB).toEqual({ id: 4, value: 'b' });
	expect(lastB).toEqual({ id: 5, value: 'b' });
  });
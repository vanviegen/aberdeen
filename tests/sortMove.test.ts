import { expect, test } from "bun:test";
import { assertBody, assertDomUpdates, passTime, fakedom } from "./helpers";
import A from "../src/aberdeen";

// These tests cover repositioning of onEach items when observable data read by `makeSortKey`
// (but not by the render function) changes. Such changes move the item's DOM nodes to their
// new position without redrawing them.

test('ignores sort key input changes that leave the key unchanged', async () => {
	const $items = A.proxy({ a: { pos: 1 }, b: { pos: 2 } });
	let renders = 0;
	A.onEach($items, ($item, key) => {
		renders++;
		A(key);
	}, $item => Math.floor($item.pos));

	assertBody(`a b`);
	expect(renders).toEqual(2);
	fakedom.resetCounts();

	$items.a.pos = 1.6; // Math.floor() result is still 1
	await passTime();
	assertBody(`a b`);
	expect(renders).toEqual(2);
	assertDomUpdates({ new: 0, changed: 0, moved: 0 });
});

test('repositions items when their sort key changes, without redrawing', async () => {
	const $items = A.proxy({ a: { pos: 10 }, b: { pos: 20 }, c: { pos: 30 } });
	let renders = 0;
	A.onEach($items, ($item, key) => {
		renders++;
		A('p', { id: key });
	}, $item => $item.pos);

	assertBody(`p{id=a} p{id=b} p{id=c}`);
	expect(renders).toEqual(3);
	const [elA, elB, elC] = document.body.childNodes;

	$items.a.pos = 25; // move to the middle
	await passTime();
	assertBody(`p{id=b} p{id=a} p{id=c}`);

	$items.c.pos = 0; // move to the front
	await passTime();
	assertBody(`p{id=c} p{id=b} p{id=a}`);

	$items.c.pos = 90; // move to the back
	await passTime();
	assertBody(`p{id=b} p{id=a} p{id=c}`);

	// The render function was not called again, and the original elements were moved around.
	expect(renders).toEqual(3);
	assertDomUpdates({ new: 3, moved: 3 });
	expect(document.body.childNodes).toEqual([elB, elA, elC]);
});

test('repositions on fractional sort key changes', async () => {
	const $items = A.proxy({ a: { pos: 1 }, b: { pos: 2 }, c: { pos: 3 } });
	let renders = 0;
	A.onEach($items, ($item, key) => {
		renders++;
		A(key);
	}, $item => $item.pos);

	assertBody(`a b c`);

	$items.a.pos = 2.5; // move between b and c
	await passTime();
	assertBody(`b a c`);

	$items.a.pos = 2.25; // still between b and c
	await passTime();
	assertBody(`b a c`);

	$items.a.pos = 1.5; // back to the front
	await passTime();
	assertBody(`a b c`);
	expect(renders).toEqual(3);
});

test('moves without redraw while nested scopes update in place', async () => {
	const $items = A.proxy({ a: { pos: 10 }, b: { pos: 20 }, c: { pos: 30 } });
	let renders = 0;
	A.onEach($items, ($item, key) => {
		renders++;
		A('p', { id: key }, () => {
			A({ text: $item.pos });
		});
	}, $item => $item.pos);

	assertBody(`p{id=a "10"} p{id=b "20"} p{id=c "30"}`);
	expect(renders).toEqual(3);
	const elA = document.body.childNodes[0];

	// A single change both repositions the item and updates its content in place.
	$items.a.pos = 25;
	await passTime();
	assertBody(`p{id=b "20"} p{id=a "25"} p{id=c "30"}`);
	expect(renders).toEqual(3);
	expect(document.body.childNodes[1]).toBe(elA); // the very same element was moved
});

test('moves all nodes of an item together', async () => {
	const $items = A.proxy({ a: { pos: 10 }, b: { pos: 20 } });
	let renders = 0;
	A.onEach($items, ($item, key) => {
		renders++;
		A('h1', { id: key });
		A('h2', { id: key });
	}, $item => $item.pos);

	assertBody(`h1{id=a} h2{id=a} h1{id=b} h2{id=b}`);

	$items.a.pos = 30;
	await passTime();
	assertBody(`h1{id=b} h2{id=b} h1{id=a} h2{id=a}`);
	expect(renders).toEqual(2);
	assertDomUpdates({ new: 4, moved: 2 });
});

test('does not touch the DOM when a key change keeps the position', async () => {
	const $items = A.proxy({ a: { pos: 10 }, b: { pos: 20 }, c: { pos: 30 } });
	let renders = 0;
	A.onEach($items, ($item, key) => {
		renders++;
		A(key);
	}, $item => $item.pos);

	assertBody(`a b c`);
	fakedom.resetCounts();

	$items.b.pos = 25; // still between a and c
	await passTime();
	assertBody(`a b c`);
	expect(renders).toEqual(3);
	assertDomUpdates({ new: 0, changed: 0, moved: 0 });
});

test('falls back to insertBefore when moveBefore is unavailable', async () => {
	const proto = Object.getPrototypeOf(document.body);
	const origMoveBefore = proto.moveBefore;
	delete proto.moveBefore;
	try {
		const $items = A.proxy({ a: { pos: 10 }, b: { pos: 20 } });
		let renders = 0;
		A.onEach($items, ($item, key) => {
			renders++;
			A(key);
		}, $item => $item.pos);
		const elA = document.body.childNodes[0];

		$items.a.pos = 30;
		await passTime();
		assertBody(`b a`);
		expect(renders).toEqual(2);
		expect(document.body.childNodes[1]).toBe(elA);
		expect(fakedom.getCounts().moved).toEqual(0); // insertBefore was used instead
	} finally {
		proto.moveBefore = origMoveBefore;
	}
});

test('shows and hides items when the sort key turns null', async () => {
	const $items = A.proxy({ a: { pos: 1 }, b: { pos: -2 }, c: { pos: 3 } });
	let renders = 0, cleaned = 0;
	A.onEach($items, ($item, key) => {
		renders++;
		A(key);
		A.clean(() => cleaned++);
	}, $item => $item.pos >= 0 ? $item.pos : undefined);

	assertBody(`a c`);
	expect(renders).toEqual(2);

	$items.b.pos = 2; // appears, in the middle
	await passTime();
	assertBody(`a b c`);
	expect(renders).toEqual(3);

	$items.b.pos = -1; // disappears again
	await passTime();
	assertBody(`a c`);
	expect(renders).toEqual(3);
	expect(cleaned).toEqual(1);

	$items.b.pos = -3; // stays hidden; should be a no-op
	await passTime();
	assertBody(`a c`);
	expect(renders).toEqual(3);
	expect(cleaned).toEqual(1);
});

test('redraws in place when a change affects both the sort key and the content', async () => {
	const $items = A.proxy({ a: { pos: 10 }, b: { pos: 20 }, c: { pos: 30 } });
	let renders = 0;
	A.onEach($items, ($item, key) => {
		renders++;
		A(`p#${key}${$item.pos}`);
	}, $item => $item.pos);

	assertBody(`p{"a10"} p{"b20"} p{"c30"}`);
	expect(renders).toEqual(3);

	$items.a.pos = 25;
	await passTime();
	assertBody(`p{"b20"} p{"a25"} p{"c30"}`);
	expect(renders).toEqual(4); // only 'a' was re-rendered
});

test('handles sort keys for multiple items changing at once', async () => {
	const $items = A.proxy({ a: { pos: 10 }, b: { pos: 20 }, c: { pos: 30 }, d: { pos: 40 } });
	const $dir = A.proxy(1);
	let renders = 0;
	A.onEach($items, ($item, key) => {
		renders++;
		A(key);
	}, $item => $item.pos * $dir.value);

	assertBody(`a b c d`);
	expect(renders).toEqual(4);

	$dir.value = -1; // reverse the whole list
	await passTime();
	assertBody(`d c b a`);

	$dir.value = 1;
	await passTime();
	assertBody(`a b c d`);
	expect(renders).toEqual(4);
});

test('handles moving items that have no DOM nodes', async () => {
	const $items = A.proxy({ a: { pos: 10 }, ghost: { pos: 20 }, b: { pos: 30 } });
	A.onEach($items, ($item, key) => {
		if (key !== 'ghost') A(key);
	}, $item => $item.pos);

	assertBody(`a b`);

	$items.ghost.pos = 40; // move a node-less item
	await passTime();
	assertBody(`a b`);

	$items.a.pos = 35; // move across the ghost's old and new positions
	await passTime();
	assertBody(`b a`);
});

test('handles moving to an already-taken sort key', async () => {
	const $items = A.proxy({ a: { pos: 10 }, b: { pos: 20 }, c: { pos: 30 } });
	A.onEach($items, ($item, key) => {
		A(key);
	}, $item => $item.pos);

	$items.a.pos = 20; // same key as b; the newly moved item goes after the existing one
	await passTime();
	assertBody(`b a c`);
});

test('keeps neighboring content in place when moving edge items', async () => {
	const $one = A.proxy({ a: { pos: 10 }, b: { pos: 20 } });
	const $two = A.proxy({ c: { pos: 10 }, d: { pos: 20 } });
	A('hr');
	A.onEach($one, ($item, key) => A(key), $item => $item.pos);
	A.onEach($two, ($item, key) => A(key), $item => $item.pos);
	A('div');
	assertBody(`hr a b c d div`);

	$one.a.pos = 30; // to the end of list one; still before c
	await passTime();
	assertBody(`hr b a c d div`);

	$two.d.pos = 5; // to the front of list two; still after a
	await passTime();
	assertBody(`hr b a d c div`);

	$one.a.pos = 1; // to the front of list one; still after the hr
	await passTime();
	assertBody(`hr a b d c div`);
});

test('repositions array items', async () => {
	const $items = A.proxy([{ id: 'x', pos: 20 }, { id: 'y', pos: 10 }]);
	let renders = 0;
	A.onEach($items, ($item) => {
		renders++;
		A($item.id);
	}, $item => $item.pos);

	assertBody(`y x`);

	$items[0].pos = 5;
	await passTime();
	assertBody(`x y`);
	expect(renders).toEqual(2);
});

test('repositions Map items', async () => {
	const $items = A.proxy(new Map([['a', { pos: 10 }], ['b', { pos: 20 }]]));
	let renders = 0;
	A.onEach($items, ($item, key) => {
		renders++;
		A(key);
	}, $item => $item.pos);

	assertBody(`a b`);

	$items.get('a')!.pos = 30;
	await passTime();
	assertBody(`b a`);
	expect(renders).toEqual(2);
});

test('repositions Set items', async () => {
	const $items = A.proxy(new Set([{ id: 'x', pos: 10 }, { id: 'y', pos: 20 }]));
	let renders = 0;
	let $x: any;
	A.onEach($items, ($member) => {
		renders++;
		if ($member.id === 'x') $x = $member;
		A('p', { id: $member.id });
	}, $member => $member.pos);

	assertBody(`p{id=x} p{id=y}`);

	$x.pos = 30;
	await passTime();
	assertBody(`p{id=y} p{id=x}`);
	expect(renders).toEqual(2);
});

test('moves items containing nested onEach lists', async () => {
	const $items = A.proxy({ a: { pos: 10, tags: ['t', 's'] }, b: { pos: 20, tags: ['u'] } });
	let renders = 0;
	A.onEach($items, ($item, key) => {
		renders++;
		A('h1', { id: key });
		A.onEach($item.tags, tag => A(tag, { id: key }), tag => tag);
	}, $item => $item.pos);

	assertBody(`h1{id=a} s{id=a} t{id=a} h1{id=b} u{id=b}`);

	$items.a.pos = 30;
	await passTime();
	assertBody(`h1{id=b} u{id=b} h1{id=a} s{id=a} t{id=a}`);
	expect(renders).toEqual(2);

	$items.a.tags.push('r'); // the nested list still updates, at the new position
	await passTime();
	assertBody(`h1{id=b} u{id=b} h1{id=a} r{id=a} s{id=a} t{id=a}`);
	expect(renders).toEqual(2);
});

test('handles a sort key change combined with an item replacement', async () => {
	const $items = A.proxy({ a: { pos: 10 }, b: { pos: 20 } });
	A.onEach($items, ($item, key) => {
		A(key);
	}, $item => $item.pos);

	$items.a.pos = 99;      // would move a to the end...
	$items.a = { pos: 15 }; // ...but the whole item is replaced in the same tick
	await passTime();
	assertBody(`a b`);
});

test('handles a sort key change combined with item deletion', async () => {
	const $items = A.proxy({ a: { pos: 10 }, b: { pos: 20 } } as Record<string, { pos: number }>);
	let cleaned = 0;
	A.onEach($items, ($item, key) => {
		A(key);
		A.clean(() => cleaned++);
	}, $item => $item.pos);

	$items.a.pos = 99;
	delete $items.a;
	await passTime();
	assertBody(`b`);
	expect(cleaned).toEqual(1);
});

test('leaves elements playing their destroy animation in place when moving', async () => {
	const $items = A.proxy({ a: { pos: 10, extra: true }, b: { pos: 20 } });
	A.onEach($items, ($item, key) => {
		A(() => {
			if ($item.extra) A('q', { destroy: 'x' });
		});
		A('p', { id: key });
	}, $item => $item.pos);

	assertBody(`q p{id=a} p{id=b}`);

	$items.a.extra = false; // starts q's destroy animation; the element lingers
	await passTime(1);
	assertBody(`q.x p{id=a} p{id=b}`);

	$items.a.pos = 30; // move a past b; the dying q stays where it is
	await passTime(1);
	assertBody(`q.x p{id=b} p{id=a}`);

	await passTime(3000); // the destroy animation ends
	assertBody(`p{id=b} p{id=a}`);
});

test('reports errors thrown by makeSortKey on recompute', async () => {
	const $items = A.proxy({ a: { pos: 1 }, b: { pos: 2 } });
	let lastErr: Error | undefined;
	A.setErrorHandler(err => { lastErr = err; return false; });
	try {
		A.onEach($items, ($item, key) => {
			A(key);
		}, $item => {
			if ($item.pos < 0) throw new Error('NegativePos');
			return $item.pos;
		});

		assertBody(`a b`);

		$items.a.pos = -1;
		await passTime();
		expect(lastErr?.toString()).toContain('NegativePos');
		assertBody(`b`); // the failing item is hidden
	} finally {
		A.setErrorHandler();
	}
});

test('throws when makeSortKey creates DOM nodes', async () => {
	const $items = A.proxy({ a: { pos: 1 } });
	let lastErr: Error | undefined;
	A.setErrorHandler(err => { lastErr = err; return false; });
	try {
		A.onEach($items, ($item, key) => {
			A(key);
		}, $item => {
			A('div');
			return $item.pos;
		});
		expect(lastErr?.toString()).toContain('makeSortKey must not create DOM nodes');
	} finally {
		A.setErrorHandler();
	}
});

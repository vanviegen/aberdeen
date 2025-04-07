import { expect, test } from "bun:test";
import { assertBody, passTime, assertDomUpdates } from "./helpers";
import { $, proxy, ref, merge, mount } from "../src/aberdeen";

test('creates nested nodes', () => {
	$("a", "b.cls", {".second":true, ".third":false}, "c", {x:"y"})
	assertBody(`a{b.cls.second{c{x=y}}}`)
});
test('creates elements with text', () => {
	$('div.cls:This is my :-containg text!')
	$('h2', {text: 'More text...'})
	assertBody(`div.cls{"This is my :-containg text!"} h2{"More text..."}`)
})
test('reactively modifies attributes that have proxies as values', () => {
	let cnt = 0
	let data = proxy('initial' as string)
	mount(document.body, () => {
		cnt++
		$('input', {placeholder:data})
		$('div', {text:data})
		$('p', {$color:data})
	})
	assertBody(`input{placeholder=initial} div{"initial"} p{color:initial}`)
	expect(cnt).toEqual(1)

	data.value = 'modified'
	passTime()
	assertBody(`input{placeholder=modified} div{"modified"} p{color:modified}`)
	expect(cnt).toEqual(1)
})
test('returns a reactive value when only a function is given', () => {
	const data = proxy(20);
	const plus2 = $(() => data.value + 2);
	$('p', {text: plus2})

	expect(plus2.value).toEqual(22)
	assertBody(`p{"22"}`)

	data.value *= 2
	passTime();
	expect(plus2.value).toEqual(42)
	assertBody(`p{"42"}`)
})
test('reacts to conditions', () => {
	const data: Record<string,any> = proxy({a: true})
	expect(data.a).toEqual(true)
	let cnt = 0
	mount(document.body, () => {
		cnt++
		$("div", {".y": ref(data, 'a')}, "span", {".z": ref(data, 'b')})
		$("input", {
			value: $(() => data.a ? 'nope' : data.yes)
		})
	})
	assertBody(`div.y{span} input{value->nope}`)
	expect(cnt).toEqual(1)
	assertDomUpdates({new: 3, changed: 5}) // also removes unset classes

	merge(data, {b: true, yes: "abc"}) // delete 'a'
	passTime()

	assertBody(`div{span.z} input{value->abc}`)
	expect(cnt).toEqual(1)
	assertDomUpdates({new: 3, changed: 5+2})

	data.yes = "def"
	passTime()
	assertBody(`div{span.z} input{value->def}`)
	expect(cnt).toEqual(1)
})

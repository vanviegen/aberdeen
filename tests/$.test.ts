import { expect, test } from "bun:test";
import { assertBody, passTime, assertDomUpdates } from "./helpers";
import { $, proxy, ref, copy, mount, derive } from "../src/aberdeen";

test('xcreates regular HTML elements with HTML namespace', () => {
	$('div');
});

test('creates nested nodes', () => {
	$("a", "b.cls", {".second":true, ".third":false}, "c", {x:"y"})
	assertBody(`a{b.cls.second{c{x=y}}}`)
});
test('creates elements with text', () => {
	$('div.cls:This is my :-containg text!')
	$('h2', {text: 'More text...'})
	assertBody(`div.cls{"This is my :-containg text!"} h2{"More text..."}`)
})
test('reactively modifies attributes that have proxies as values', async () => {
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
	await passTime()
	assertBody(`input{placeholder=modified} div{"modified"} p{color:modified}`)
	expect(cnt).toEqual(1)
})
test('reacts to conditions', async () => {
	const data: Record<string,any> = proxy({a: true})
	expect(data.a).toEqual(true)
	let cnt = 0
	mount(document.body, () => {
		cnt++
		$("div", {".y": ref(data, 'a')}, "span", {".z": ref(data, 'b')})
		$("input", {
			value: derive(() => data.a ? 'nope' : data.yes)
		})
	})
	assertBody(`div.y{span} input{value->nope}`)
	expect(cnt).toEqual(1)
	assertDomUpdates({new: 3, changed: 5}) // also removes unset classes

	copy(data, {b: true, yes: "abc"}) // delete 'a'
	await passTime()

	assertBody(`div{span.z} input{value->abc}`)
	expect(cnt).toEqual(1)
	assertDomUpdates({new: 3, changed: 5+2})

	data.yes = "def"
	await passTime()
	assertBody(`div{span.z} input{value->def}`)
	expect(cnt).toEqual(1)
})

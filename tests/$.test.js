import { expect, test } from "bun:test";
import { mount, $, proxy, ref } from "../src/aberdeen.ts"

test('creates nested nodes', () => {
	mount(document.body, () => {
		$("a", "b.cls", {".second":true, ".third":false}, "c", {x:"y"})
	})
	assertBody(`a{b.cls.second{c{x=y}}}`)
});
test('creates elements with text', () => {
	mount(document.body, () => {
		$('.cls:This is my :-containg text!')
		$('h2', {text: 'More text...'})
	})
	assertBody(`div.cls{"This is my :-containg text!"} h2{"More text..."}`)
})
test('reactively modifies attributes that have stores as values', () => {
	let cnt = 0
	let store = proxy('initial')
	mount(document.body, () => {
		cnt++
		$('input', {placeholder:store})
		$('div', {text:store})
		$('p', {$color:store})
	})
	assertBody(`input{placeholder=initial} div{"initial"} p{color:initial}`)
	expect(cnt).toEqual(1)

	store.value = 'modified'
	passTime()
	assertBody(`input{placeholder=modified} div{"modified"} p{color:modified}`)
	expect(cnt).toEqual(1)
})
test('reacts to conditions', () => {
	const store = proxy({a: true})
	expect(store.a).toEqual(true)
	let cnt = 0
	mount(document.body, () => {
		cnt++
		$("div", {".y": ref(store, 'a')}, "span", {".z": store('b')})
		const value = $(() => store.a ? 'nope' : store.yes)
		$("input", {value})
	})
	assertBody(`div.y{span} input{value->nope}`)
	expect(cnt).toEqual(1)
	expect(getCounts()).toEqual({new: 3, change: 5}) // also removes unset classes

	$.set(store, {b: true, yes: "abc"})
	passTime()

	assertBody(`div{span.z} input{value->abc}`)
	expect(cnt).toEqual(1)
	expect(getCounts()).toEqual({new: 3, change: 5+2})

	store.yes = "def"
	passTime()
	assertBody(`div{span.z} input{value->def}`)
	expect(cnt).toEqual(1)
})

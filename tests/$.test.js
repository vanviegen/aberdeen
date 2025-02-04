import { expect, test } from "bun:test";
import { mount, $ } from "../src/aberdeen.ts"

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
	let store = new Store('initial')
	mount(document.body, () => {
		cnt++
		$('input', {placeholder:store})
		$('div', {text:store})
		$('p', {$color:store})
	})
	assertBody(`input{placeholder=initial} div{"initial"} p{color:initial}`)
	assertEqual(cnt, 1)

	store.set('modified')
	passTime()
	assertBody(`input{placeholder=modified} div{"modified"} p{color:modified}`)
	assertEqual(cnt, 1)
})
test('reacts to conditions', () => {
	const store = new Store({a: true})
	assertEqual(store('a').get(), true)
	let cnt = 0
	mount(document.body, () => {
		cnt++
		$("div", {".y": store('a')}, "span", {".z": store('b')})
		const value = store('a').if("nope", store('yes'))
		$("input", {value})
	})
	assertBody(`div.y{span} input{value->nope}`)
	assertEqual(cnt, 1)
	assertEqual(getCounts(), {new: 3, change: 5}) // also removes unset classes

	store.set({b: true, yes: "abc"})
	passTime()

	assertBody(`div{span.z} input{value->abc}`)
	assertEqual(cnt, 1)
	assertEqual(getCounts(), {new: 3, change: 5+2})

	store("yes").set("def")
	passTime()
	assertBody(`div{span.z} input{value->def}`)
	assertEqual(cnt, 1)
})

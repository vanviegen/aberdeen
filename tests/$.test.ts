import { expect, test } from "bun:test";
import { assertBody, passTime, assertDomUpdates } from "./helpers";
import A from "../src/aberdeen";

test('xcreates regular HTML elements with HTML namespace', () => {
	A('div');
});

test('creates nested nodes', () => {
	A("a", "b.cls", {".second":true, ".third":false}, "c", {x:"y"})
	assertBody(`a{b.cls.second{c{x=y}}}`)
});

test('creates elements with text', () => {
	A('div.cls#This is my #-containg text!')
	A('h2', {text: 'More text...'})
	assertBody(`div.cls{"This is my #-containg text!"} h2{"More text..."}`)
})

test('reactively modifies attributes that have proxies as values', async () => {
	let cnt = 0
	let data = A.proxy('initial' as string)
	A.mount(document.body, () => {
		cnt++
		A('input', {placeholder:data})
		A('div', {text:data})
		A('p', {$color:data})
	})
	assertBody(`input{placeholder=initial} div{"initial"} p{color:initial}`)
	expect(cnt).toEqual(1)

	data.value = 'modified'
	await passTime()
	assertBody(`input{placeholder=modified} div{"modified"} p{color:modified}`)
	expect(cnt).toEqual(1)
})

test('reacts to conditions', async () => {
	const data: Record<string,any> = A.proxy({a: true})
	expect(data.a).toEqual(true)
	let cnt = 0
	A.mount(document.body, () => {
		cnt++
		A("div", {".y": A.ref(data, 'a')}, "span", {".z": A.ref(data, 'b')})
		A("input", {
			value: A.derive(() => data.a ? 'nope' : data.yes)
		})
	})
	assertBody(`div.y{span} input{value->nope}`)
	expect(cnt).toEqual(1)
	assertDomUpdates({new: 3, changed: 5}) // also removes unset classes

	A.copy(data, {b: true, yes: "abc"}) // delete 'a'
	await passTime()

	assertBody(`div{span.z} input{value->abc}`)
	expect(cnt).toEqual(1)
	assertDomUpdates({new: 3, changed: 5+2})

	data.yes = "def"
	await passTime()
	assertBody(`div{span.z} input{value->def}`)
	expect(cnt).toEqual(1)
})

test('long-form string args', async () => {
	const enabled = A.proxy(false);
	A(() => {
		A('div.cls text=Title .enabled=', enabled, '$color=red span .important $font-decoration=underline #The rest is text');
	})
	assertBody(`div.cls{color:red "Title" span.important{font-decoration:underline "The rest is text"}}`);

	enabled.value = true;
	await passTime();

	assertBody(`div.cls.enabled{color:red "Title" span.important{font-decoration:underline "The rest is text"}}`);
})

test('long-form string arg escaping', async () => {
	A('div text="My title" margin: 0 auto;.cls');
	assertBody(`div.cls{margin:"0 auto" "My title"}`);
})

test('style with space-colon-semicolon for multi-word values', async () => {
	A(`div box-shadow: 2px 0 6px black; m:$3`);
	assertBody('div{box-shadow:"2px 0 6px black" margin:var(--m3)}');
});

test('mixing short and long form CSS in A()', async () => {
	A('div m:$3 border: 1px solid blue; bg:red');
	assertBody('div{background:red border:"1px solid blue" margin:var(--m3)}');
});

test('reactive A.proxy text with # shorthand', async () => {
	const text = A.proxy('Hello');
	A.mount(document.body, () => {
		A('p#', text);
	});
	assertBody(`p{"Hello"}`);

	text.value = 'World';
	await passTime();
	assertBody(`p{"World"}`);
});

test('reactive A.proxy text with # and static prefix', async () => {
	const name = A.proxy('Alice');
	A.mount(document.body, () => {
		A('p', () => {
			A('#Hello, ');
			A({text: name});
		});
	});
	assertBody(`p{"Hello, " "Alice"}`);

	name.value = 'Bob';
	await passTime();
	assertBody(`p{"Hello, " "Bob"}`);
});

test('inline style with colon shorthand', () => {
	A('div color:red');
	assertBody(`div{color:red}`);
});

test('inline style with reactive A.proxy value', async () => {
	const color = A.proxy('red');
	A.mount(document.body, () => {
		A('div color:', color);
	});
	assertBody(`div{color:red}`);

	color.value = 'blue';
	await passTime();
	assertBody(`div{color:blue}`);
});

test('multiple inline styles with reactive A.proxy', async () => {
	const bgColor = A.proxy('white');
	A.mount(document.body, () => {
		A('div color:red background-color:', bgColor);
	});
	assertBody(`div{background-color:white color:red}`);

	bgColor.value = 'black';
	await passTime();
	assertBody(`div{background-color:black color:red}`);
});

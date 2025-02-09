describe('DOM creator', function() {
	it('adds nodes', () => {
		mount(document.body, () => {
			$('p')
		})
		passTime();
		assertBody(`p`)
	});

	it('refuses tags containing spaces', () => {
		mount(document.body, () => {
			assertThrow('cannot contain space', $('a b'))
		})
	});

	it('adds classes', () => {
		mount(document.body, () => {
			$('p.a.b')
		})
		passTime();
		assertBody(`p.a.b`)
	});

	it('sets attributes', () => {
		mount(document.body, () => {
			$('div', {class: 'C', text: "T"}, {id: 'I', index: 1})
		})
		passTime();
		assertBody(`div.C{id=I index=1 "T"}`)
	});

	it('sets properties', () => {
		mount(document.body, () => {
			$('p.C', {class: 'C', value: 3})
		})
		passTime();
		assertBody(`p.C{value->3}`)
	});

	it('nests elements', () => {
		mount(document.body, () => {
			$('p', () => {
				$('a', () => {
					$('i', () => {
						$({text: 'contents'})
					})
				})
			})
		})
		passTime();
		assertBody(`p{a{i{"contents"}}}`)
	});

	it('sets properties from the inner scope', () => {
		mount(document.body, () => {
			$('a', () => {
				$({
					href: '/',
					target: '_blank',
					disabled: true,
				})
			})
		})
		passTime();
		assertBody(`a{href=/ target=_blank disabled->true}`)
	});

	it('sets style objects', () => {
		mount(document.body, () => {
			$('a', {style: 'color: red;'})
			$('b', {$color: 'green'})
			$('c', () => {
				$({$color: 'orange'})
			})
			$('d', () => {
				$({$color: 'purple'})
			})
			$('e', () => {
				$({style: 'color: magento;'})
			})
			$('f', () => {
				$({style: 'color: cyan;'})
			})

		})
		assertBody(`a{style="color: red;"} b{color:green} c{color:orange} d{color:purple} e{style="color: magento;"} f{style="color: cyan;"}`)
	})

	it('unmounts', () => {
		let store = new Store('Hej world')
		let cnt = 0
		mount(document.body, () => {
			cnt++
			$('p:' + store.get())
		})
		assertBody(`p{"Hej world"}`)

		unmount()
		assertBody(``)

		store.set('Updated')
		passTime()
		assertEqual(cnt, 1)

		assertThrow("No such mount", () => unmount(123))
	})

	it('only allows a single mount point per parent', () => {
		mount(document.body, () => {})
		assertThrow('single mount', () => mount(document.body, () => {}))
	})

	it('creates text $s', () => {
		let index = new Store(0)
		let cases = [
			['test', `"test"`],
			['', `""`],
			[0, `"0"`],
			[null, ``],
			[undefined, ``],
			[false, `"false"`],
		]
		mount(document.body, () => {
			$({text: cases[index.get()][0]})
		})

		while(true) {
			passTime()
			assertBody(cases[index.peek()][1])
			if (index.peek() >= cases.length-1) {
				break
			}
			index.set(index.peek()+1)
		}
	})

	it('adds preexisting elements to the DOM', () => {
		mount(document.body, () => {
			let el = document.createElement('video')
			el.classList.add("test")
			$({element: el})
			$({element: null}) // should be ignored
			assertThrow('Unexpected element', () => $({element: false}))
		})
		assertBody(`video.test div.aberdeen-error{"Error"}`)
	})

	it('handles nontypical options well', () => {
		let cases = [
			[`div`, () => $("")],
			[`div`, () => $(".")],
			[`div.a.b.c`, () => $(".a.b.c")],
			[`"1234"`, () => $(undefined, {text:1234})],
			[`_!@#*{"first" "1234" "last"}`, () => $("_!@#*", null, undefined, {}, {text: "first"}, {text: 1234}, {text: "last"})],
		]
		for(let c of cases) {
			mount(document.body, () => {
				c[1]()
			})
			assertBody(c[0])
			unmount()
		}
		mount(document.body, () => {
			assertThrow("Unexpected argument", () => $("span", []))
			assertThrow("Unexpected argument", () => $("span", new Error()))
			assertThrow("Unexpected argument", () => $("span", true))
		})
	})

	it('dumps all basic values', () => {
		let store = new Store([true,false,null,undefined,-12,3.14,"test",'"quote"'])
		mount(document.body, () => store.dump())
		assertBody(`"<array>" ul{li{"0: " "true"} li{"1: " "false"} li{"2: " "null"} li{"4: " "-12"} li{"5: " "3.14"} li{"6: " "\\"test\\""} li{"7: " "\\"\\\\\\"quote\\\\\\"\\""}}`)
	})

	it('dumps maps, objects and arrays', () => {
		let store = new Store(new Map([[3,4],['a','b']]))
		mount(document.body, () => store.dump())
		assertBody(`"<map>" ul{li{"\\"a\\": " "\\"b\\""} li{"3: " "4"}}`)
		
		store.set({3: 4, a: 'b'})
		passTime()
		assertBody(`"<object>" ul{li{"\\"3\\": " "4"} li{"\\"a\\": " "\\"b\\""}}`)
		
		store.set([4, undefined, 'b'])
		passTime()
		assertBody(`"<array>" ul{li{"0: " "4"} li{"2: " "\\"b\\""}}`)
	})

	it('adds html', () => {
		let store = new Store('test')
		mount(document.body, () => {
			$('main', () => {
				$('hr')
				observe(() => {
					$({html: store.get()})
				})
				$('img')
			})
		})
		assertBody(`main{hr fake-emulated-html{"test"} img}`)

		store.set("")
		passTime()
		assertBody(`main{hr img}`)

		store.set(123)
		passTime()
		assertBody(`main{hr fake-emulated-html{"123"} img}`)

		assertThrow("Operation not permitted outside of a mount() scope", () => $({html: "test"}))
		observe(() => {
			assertThrow("Operation not permitted outside of a mount() scope", () => $({html: "test"}))
		})
	})

	it('only unlinks the top parent of the tree being removed', () => {
		let store = new Store(true)
		mount(document.body, () => {
			if (store.get()) $('main', () => {
				$('a')
				$('b')
				$('c')
			})
		})
		assertBody(`main{a b c}`)
		assertEqual(getCounts(), {new: 4, change: 4})

		store.set(false)
		passTime()
		assertBody(``)
		assertEqual(getCounts(), {new: 4, change: 5})
	})
});

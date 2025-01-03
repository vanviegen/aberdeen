describe('DOM creator', function() {
	it('adds nodes', () => {
		mount(document.body, () => {
			node('p')
		})
		passTime();
		assertBody(`p{}`)
	});

	it('adds classes', () => {
		mount(document.body, () => {
			node('p.a.b')
		})
		passTime();
		assertBody(`p{@class="a b"}`)
	});

	it('sets attributes', () => {
		mount(document.body, () => {
			node('div', {class: 'C', text: "T"}, {id: 'I', index: 1})
		})
		passTime();
		assertBody(`div{@class="C" @id="I" @index="1" "T"}`)
	});

	it('sets properties', () => {
		mount(document.body, () => {
			node('p', {className: 'C', value: 3})
		})
		passTime();
		assertBody(`p{@class="C" value=3}`)
	});

	it('nests elements', () => {
		mount(document.body, () => {
			node('p', () => {
				node('a', () => {
					node('i', () => {
						text('contents')
					})
				})
			})
		})
		passTime();
		assertBody(`p{a{i{"contents"}}}`)
	});

	it('sets properties from the inner scope', () => {
		mount(document.body, () => {
			node('a', () => {
				prop('href', '/')
				prop({
					target: '_blank',
					disabled: true,
				})
			})
		})
		passTime();
		assertBody(`a{@href="/" @target="_blank" disabled=true}`)
	});

	it('sets style objects', () => {
		mount(document.body, () => {
			node('a', {style: 'color: red;'})
			node('b', {style: {color: 'green'}})
			node('c', () => {
				prop({style: {color: 'orange'}})
			})
			node('d', () => {
				prop('style', {color: 'purple'})
			})
			node('e', () => {
				prop('style', 'color: magento;')
			})
			node('f', () => {
				prop({style: 'color: cyan;'})
			})

		})
		assertBody(`a{@style="color: red;"} b{:color="green"} c{:color="orange"} d{:color="purple"} e{@style="color: magento;"} f{@style="color: cyan;"}`)
	})

	it('unmounts', () => {
		let store = new Store('Hej world')
		let cnt = 0
		mount(document.body, () => {
			cnt++
			node('p', store.get())
		})
		assertBody(`p{"Hej world"}`)

		unmount()
		assertBody(``)

		store.set('Updated')
		passTime()
		assertEqual(cnt, 1)
	})

	it('creates text nodes', () => {
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
			text(cases[index.get()][0])
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
			node(el)
		})
		assertBody(`video{@class="test"}`)
	})

	it('handles nontypical options well', () => {
		let cases = [
			[`div{}`, () => node("")],
			[`div{}`, () => node(".")],
			[`div{@class="a b c"}`, () => node(".a.b.c")],
			[`div{"1234"}`, () => node(undefined, 1234)],
			[`_!@#*{"replacement"}`, () => node("_!@#*", null, undefined, {}, "original", 1234, "replacement")],
		]
		for(let c of cases) {
			mount(document.body, () => {
				c[1]()
			})
			assertBody(c[0])
			unmount()
		}
		mount(document.body, () => {
			assertThrow("Unexpected argument", () => node("span", []))
			assertThrow("Unexpected argument", () => node("span", new Error()))
			assertThrow("Unexpected argument", () => node("span", true))
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
			node('main', () => {
				node('hr')
				observe(() => {
					html(store.get())
				})
				node('img')
			})
		})
		assertBody(`main{hr{} fake-emulated-html{"test"} img{}}`)

		store.set("")
		passTime()
		assertBody(`main{hr{} img{}}`)

		store.set(123)
		passTime()
		assertBody(`main{hr{} fake-emulated-html{"123"} img{}}`)

		assertThrow("Operation not permitted outside of a mount() scope", () => html("test"))
		observe(() => {
			assertThrow("Operation not permitted outside of a mount() scope", () => html("test"))
		})
	})

	it('only unlinks the top parent of the tree being removed', () => {
		let store = new Store(true)
		mount(document.body, () => {
			if (store.get()) node('main', () => {
				node('a')
				node('b')
				node('c')
			})
		})
		assertBody(`main{a{} b{} c{}}`)
		assertEqual(getCounts(), {new: 4, change: 4})

		store.set(false)
		passTime()
		assertBody(``)
		assertEqual(getCounts(), {new: 4, change: 5})
	})
});

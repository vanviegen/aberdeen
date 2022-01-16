describe('DOM creator', function() {
	it('adds nodes', () => {
		testMount(() => {
			node('p')
		})
		passTime();
		assertBody(`p{}`)
	});

	it('adds classes', () => {
		testMount(() => {
			node('p.a.b')
		})
		passTime();
		assertBody(`p{@class="a b"}`)
	});

	it('sets attributes', () => {
		testMount(() => {
			node('div', {class: 'C', text: "T"}, {id: 'I', index: 1})
		})
		passTime();
		assertBody(`div{@class="C" @id="I" @index="1" "T"}`)
	});

	it('sets properties', () => {
		testMount(() => {
			node('p', {className: 'C', value: 3})
		})
		passTime();
		assertBody(`p{@class="C" value=3}`)
	});

	it('nests elements', () => {
		testMount(() => {
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
		testMount(() => {
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
		testMount(() => {
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
		testMount(() => {
			cnt++
			node('p', store.get())
		})
		assertBody(`p{"Hej world"}`)

		testUnmount()
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
		testMount(() => {
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
		testMount(() => {
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
			testMount(() => {
				c[1]()
			})
			assertBody(c[0])
			testUnmount()
		}
		testMount(() => {
			assertThrow("Unexpected argument", () => node("span", []))
			assertThrow("Unexpected argument", () => node("span", new Error()))
			assertThrow("Unexpected argument", () => node("span", true))
		})
	})
});

describe('onEach', function() {

	test('does nothing for an empty object', () => {
		let cnt = 0
		mount(document.body, () => {
			let p = proxy({})
			onEach(p, function() {
				cnt++
			})
		})
		expect(cnt).toEqual(0)
	})


	test('emits a single entry', () => {
		let result = []
		observe(() => {
			let p = proxy({x: 3})
			p.onEach(function(v, k) {
				result.push([k, v])
			})
		})
		expect(result).toEqual([['x', 3]])
	})

	test('emits multiple entries', () => {
		let result = []
		observe(() => {
			let p = proxy({x: 3, y: 4, z: 5})
			p.onEach(function(v,k) {
				result.push([k, v])
			})
			// The order is undefined, so we'll sort it
			result.sort((a,b) => a[1] - b[1])
		})
		expect(result).toEqual([['x', 3], ['y', 4], ['z', 5]])
	})

	test('adds a single item to the DOM', () => {
		mount(document.body, () => {
			let p = proxy({x: 3})
			p.onEach(function(p) {
				$('p', {class: p.index(), text: p.getNumber()})
			})
		})
		assertBody(`p.x{"3"}`)
	})

	test('adds multiple items to the DOM in default order', () => {
		mount(document.body, () => {
			let p = proxy({c: 3, a: 1, b: 2})
			p.onEach(function(p) {
				$('p', {text: p.index()})
			})
		})
		assertBody(`p{"a"} p{"b"} p{"c"}`)
	})

	test('maintains the last-element marker', () => {
		mount(document.body, () => {
			let p = proxy({c: 3, a: 1, b: 2})
			p.onEach(function(p) {
				$('p', {text: p.index()})
			})
			$('div')
		})
		assertBody(`p{"a"} p{"b"} p{"c"} div`)
	})

	test('maintains position for items', () => {
		let p = proxy({0: false, 1: false, 2: false, 3: false})
		let cnts = [0,0,0,0];
		mount(document.body, () => {
			p.onEach(item => {
				cnts[item.index()]++;
				if (item.getBoolean()) $('p', {id: item.index()})
			})
		})

		assertBody(``);
		expect(cnts).toEqual([1,1,1,1]);

		p.merge({1: true});
		passTime();
		assertBody(`p{id=1}`)
		expect(cnts).toEqual([1,2,1,1]);

		p.merge({0: true, 2: true, 3: true});
		passTime();
		assertBody(`p{id=0} p{id=1} p{id=2} p{id=3}`)
		expect(cnts).toEqual([2,2,2,2]);
	})

	test('adds items in the right position', () => {
		let p = proxy({});

		mount(document.body, () => {
			p.onEach(item => {
				$(item.index())
			})
		})

		let items = ['d', 'a', 'b', 'f', 'c', 'e'];
		let seen = [];

		for(let item of items) {
			seen.push(item)
			seen.sort();

			p(item).set(true);
			passTime()
			assertBody(seen.join(' '))
		}
	})

	test('removes items and calls cleaners', () => {
		let items = ['d', 'a', 'b', 'f', 'c', 'e']
		let p = proxy({})
		for(let item of items) {
			p(item).set(true)
		}
		let cleaned = [];

		mount(document.body, () => {
			p.onEach(item => {
				$(item.index())
				clean(() => {
					cleaned.push(item.index())
				});
			})
		})

		let current = items.slice().sort();

		let cleanedExpected = [];

		for(let item of items) {
			current.splice(current.indexOf(item), 1)
			
			p.merge({[item]: undefined});
			cleanedExpected.push(item);
			passTime()
			assertBody(current.map(s => s).join(' '))
			expect(cleaned).toEqual(cleanedExpected)
		}
	})

	test(`removes an entire object and calls cleaners`, () => {
		let cleaned = {};
		let p = proxy({b:2,c:3,a:1})
		let cnt = 0
		mount(document.body, () => {
			if (p.getType()==="object") {
				p.onEach(item => {
					cnt++
					$(item.index())
					clean(() => {
						cleaned[item.index()] = true;
					})
				})
			} else {
				$({text: JSON.stringify(p.get())})
			}
		})
		assertBody(`a b c`)
		
		p.set(true)
		passTime()
		assertBody(`"true"`)
		expect(cleaned).toEqual({a:true, b:true, c:true})
		expect(cnt).toEqual(3)
	})

	test('should ignore on delete followed by set', () => {
		let p = proxy({a:1, b:2})
		let cnt = 0
		mount(document.body, () => {
			p.onEach(item => {
				$(item.index())
				cnt++
			})
		})
		assertBody(`a b`)
		expect(cnt).toEqual(2)

		p('a').delete()
		expect(p.get()).toEqual({b: 2})
		p('a').set(3)
		passTime()
		assertBody(`a b`)
		expect(cnt).toEqual(2) // should not trigger again as the value is not subscribed
	});

	test('should do nothing on set followed by delete', () => {
		let p = proxy({a:1})
		let cnt = 0
		mount(document.body, () => {
			p.onEach(item => {
				$(item.index())
				cnt++
			})
		})
		assertBody(`a`)
		expect(cnt).toEqual(1)

		p('b').set(2)
		expect(p.get()).toEqual({a: 1, b: 2})
		p('b').delete()
		passTime()
		assertBody(`a`)
		expect(cnt).toEqual(1)
	})

	test(`should handle items with identical sort keys`, () => {
		let p = proxy({a: 1, b: 1, c: 1, d: 1})
		mount(document.body, () => {
			p.onEach(item => {
				$(item.index())
			}, item => item.getNumber())
		})
		expect(getBody().split(' ').sort().join(' ')).toEqual(`a b c d`)

		p('b').delete()
		passTime()
		expect(getBody().split(' ').sort().join(' ')).toEqual(`a c d`)

		p('d').delete()
		passTime()
		expect(getBody().split(' ').sort().join(' ')).toEqual(`a c`)

		p('a').delete()
		passTime()
		expect(getBody().split(' ').sort().join(' ')).toEqual(`c`)

	})

	test('keeps two onEaches in order', () => {
		let p1 = proxy(['c1'])
		let p2 = proxy(['c2'])
		mount(document.body, () => {
			p1.onEach(item => {
				$(item.getString())
			})
			p2.onEach(item => {
				$(item.getString())
			}, item => item.getString())
		})
		assertBody(`c1 c2`)
		
		p1(1).set('b1')
		passTime()
		assertBody(`c1 b1 c2`)

		p2.set(['b2', 'c2', 'd2'])
		passTime()
		assertBody(`c1 b1 b2 c2 d2`)

		p1.set([])
		passTime()
		assertBody(`b2 c2 d2`)

		p2.set([])
		passTime()
		assertBody(``)

		p2.set(['c2', 'b2'])
		passTime()
		assertBody(`b2 c2`)

		p1.set(['c1', 'b1'])
		passTime()
		assertBody(`c1 b1 b2 c2`)
	})
	
	test(`iterates arrays`, () => {
		let p = proxy(['e', 'b', 'a', 'd'])
		mount(document.body, () => {
			p.onEach(item => {
				$('h'+item.index())
			})
			p.onEach(item => {
				$('i'+item.index())
			}, item => item.getString())
		})

		assertBody(`h0 h1 h2 h3 i2 i1 i3 i0`)

		p(4).set('c')

		passTime()
		assertBody(`h0 h1 h2 h3 h4 i2 i1 i4 i3 i0`)
	})

	test(`iterates arrays that are pushed into`, () => {
		let p = proxy(['e', 'b', 'a', 'd'])
		mount(document.body, () => {
			p.onEach(item => {
				$('h'+item.index())
			})
			p.onEach(item => {
				$('i'+item.index())
			}, item => item.getString())
		})

		p.push('c')
		
		passTime()
		assertBody(`h0 h1 h2 h3 h4 i2 i1 i4 i3 i0`) 
	})

	test(`removes all children before redrawing`, () => {
		let p = proxy({a:1, b:2})
		let select = proxy(1)
		mount(document.body, () => {
			select.get();
			p.onEach(item => {
				$(item.index())
			}, item => {
				if (select.get() == item.get()) {
					return item.index();
				}
			})
		})
		assertBody(`a`) 

		select.set('2')
		passTime()
		assertBody(`b`) 
	})

	test('should handle items that don\'t create DOM elements', () => {
		let p = proxy("b0 b1 c1 b2 c0 a1 a0 a2".split(" "))
		mount(document.body, () => {
			p.onEach(item => {
				let letter = item.get()[0]
				let count = 0 | item.get()[1]
				for(let i=0; i<count; i++) {
					$({text: item.index()+letter})
				}
			}, item => item.get()[0])
		})
		assertBody(`"7a" "7a" "5a" "3b" "3b" "1b" "2c"`) // The order within the same letter is unspecified

		p(5).set(undefined)
		p(3).set(undefined)
		passTime()
		assertBody(`"7a" "7a" "1b" "2c"`) // The order within the same letter is unspecified

		p(0).set(undefined)
		p(4).set(undefined)
		p(6).set(undefined)
		passTime()
		assertBody(`"7a" "7a" "1b" "2c"`) // The order within the same letter is unspecified
	})

	test('filters when there is no sort key', () => {
		let p = proxy(['a','b','c'])
		mount(document.body, () => {
			p.onEach(item => {
				$(item.get())
			}, item => item.get()=='b' ? undefined : item.get())
		})
		assertBody(`a c`)
		
		p.set([])
		passTime()
		assertBody(``)
	})

	test('can run outside of any scope', () => {
		let p = proxy([3, 7])
		let incr = p.map(x => x.get()+1)
		expect(incr.get()).toEqual([4, 8])

		p.push(11)
		passTime()
		expect(incr.get()).toEqual([4, 8, 12])

		p(1).set(0)
		passTime()
		expect(incr.get()).toEqual([4, 1, 12])

		unmount()

		p.push(19)
		passTime()
		expect(incr.get()).toEqual([])
	})
})
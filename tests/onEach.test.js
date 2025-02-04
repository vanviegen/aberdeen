describe('onEach', function() {

	it('does nothing for an empty object', () => {
		let cnt = 0
		mount(document.body, () => {
			let p = proxy({})
			onEach(p, function() {
				cnt++
			})
		})
		assertEqual(cnt, 0)
	})


	it('emits a single entry', () => {
		let result = []
		observe(() => {
			let p = proxy({x: 3})
			p.onEach(function(v, k) {
				result.push([k, v])
			})
		})
		assertEqual(result, [['x', 3]])
	})

	it('emits multiple entries', () => {
		let result = []
		observe(() => {
			let p = proxy({x: 3, y: 4, z: 5})
			p.onEach(function(v,k) {
				result.push([k, v])
			})
			// The order is undefined, so we'll sort it
			result.sort((a,b) => a[1] - b[1])
		})
		assertEqual(result, [['x', 3], ['y', 4], ['z', 5]])
	})

	it('adds a single item to the DOM', () => {
		mount(document.body, () => {
			let p = proxy({x: 3})
			p.onEach(function(p) {
				$('p', {class: p.index(), text: p.getNumber()})
			})
		})
		assertBody(`p.x{"3"}`)
	})

	it('adds multiple items to the DOM in default order', () => {
		mount(document.body, () => {
			let p = proxy({c: 3, a: 1, b: 2})
			p.onEach(function(p) {
				$('p', {text: p.index()})
			})
		})
		assertBody(`p{"a"} p{"b"} p{"c"}`)
	})

	it('maintains the last-element marker', () => {
		mount(document.body, () => {
			let p = proxy({c: 3, a: 1, b: 2})
			p.onEach(function(p) {
				$('p', {text: p.index()})
			})
			$('div')
		})
		assertBody(`p{"a"} p{"b"} p{"c"} div`)
	})

	it('maintains position for items', () => {
		let p = proxy({0: false, 1: false, 2: false, 3: false})
		let cnts = [0,0,0,0];
		mount(document.body, () => {
			p.onEach(item => {
				cnts[item.index()]++;
				if (item.getBoolean()) $('p', {id: item.index()})
			})
		})

		assertBody(``);
		assertEqual(cnts, [1,1,1,1]);

		p.merge({1: true});
		passTime();
		assertBody(`p{id=1}`)
		assertEqual(cnts, [1,2,1,1]);

		p.merge({0: true, 2: true, 3: true});
		passTime();
		assertBody(`p{id=0} p{id=1} p{id=2} p{id=3}`)
		assertEqual(cnts, [2,2,2,2]);
	})

	it('adds items in the right position', () => {
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

	it('removes items and calls cleaners', () => {
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
			assertEqual(cleaned, cleanedExpected)
		}
	})

	it(`removes an entire object and calls cleaners`, () => {
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
		assertEqual(cleaned, {a:true, b:true, c:true})
		assertEqual(cnt, 3)
	})

	it('should ignore on delete followed by set', () => {
		let p = proxy({a:1, b:2})
		let cnt = 0
		mount(document.body, () => {
			p.onEach(item => {
				$(item.index())
				cnt++
			})
		})
		assertBody(`a b`)
		assertEqual(cnt, 2)

		p('a').delete()
		assertEqual(p.get(), {b: 2})
		p('a').set(3)
		passTime()
		assertBody(`a b`)
		assertEqual(cnt, 2) // should not trigger again as the value is not subscribed
	});

	it('should do nothing on set followed by delete', () => {
		let p = proxy({a:1})
		let cnt = 0
		mount(document.body, () => {
			p.onEach(item => {
				$(item.index())
				cnt++
			})
		})
		assertBody(`a`)
		assertEqual(cnt, 1)

		p('b').set(2)
		assertEqual(p.get(), {a: 1, b: 2})
		p('b').delete()
		passTime()
		assertBody(`a`)
		assertEqual(cnt, 1)
	})

	it(`should handle items with identical sort keys`, () => {
		let p = proxy({a: 1, b: 1, c: 1, d: 1})
		mount(document.body, () => {
			p.onEach(item => {
				$(item.index())
			}, item => item.getNumber())
		})
		assertEqual(getBody().split(' ').sort().join(' '), `a b c d`)

		p('b').delete()
		passTime()
		assertEqual(getBody().split(' ').sort().join(' '), `a c d`)

		p('d').delete()
		passTime()
		assertEqual(getBody().split(' ').sort().join(' '), `a c`)

		p('a').delete()
		passTime()
		assertEqual(getBody().split(' ').sort().join(' '), `c`)

	})

	it('keeps two onEaches in order', () => {
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
	
	it(`iterates arrays`, () => {
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

	it(`iterates arrays that are pushed into`, () => {
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

	it(`removes all children before redrawing`, () => {
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

	it('should handle items that don\'t create DOM elements', () => {
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

	it('filters when there is no sort key', () => {
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

	it('can run outside of any scope', () => {
		let p = proxy([3, 7])
		let incr = p.map(x => x.get()+1)
		assertEqual(incr.get(), [4, 8])

		p.push(11)
		passTime()
		assertEqual(incr.get(), [4, 8, 12])

		p(1).set(0)
		passTime()
		assertEqual(incr.get(), [4, 1, 12])

		unmount()

		p.push(19)
		passTime()
		assertEqual(incr.get(), [])
	})
})
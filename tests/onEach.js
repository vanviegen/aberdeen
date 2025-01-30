describe('onEach', function() {

	it('ignores undefined values', () => {
		let cnt = 0
		mount(document.body, () => {
			let store = new Store()
			store.onEach(() => cnt++)
		})
		assertEqual(cnt, 0)
	})

	it('handles unsuitable store values', () => {
		for(let value of [3, "", false]) {
			let cnt = 0
			let mnt = mount(document.body, () => {
				let store = new Store(value)
				assertThrow(`onEach() attempted`, () => {
					store.onEach(() => cnt++)
				})

			})
			assertEqual(cnt, 0, "cnt mismatch for "+JSON.stringify(value))
			unmount(mnt)
		}
	})

	it('does nothing for an empty map', () => {
		let cnt = 0
		mount(document.body, () => {
			let store = new Store({})
			store.onEach(function() {
				cnt++
			})
		})
		assertEqual(cnt, 0)
	})


	it('emits a single entry', () => {
		let result = []
		mount(document.body, () => {
			let store = new Store({x: 3})
			store.onEach(function(store) {
				result.push([store.index(),store.get()])
			})
		})
		assertEqual(result, [['x', 3]])
	})

	it('emits multiple entries', () => {
		let result = []
		mount(document.body, () => {
			let store = new Store({x: 3, y: 4, z: 5})
			store.onEach(function(store) {
				result.push([store.index(),store.get()])
			})
			// The order is undefined, so we'll sort it
			result.sort((a,b) => a[1] - b[1])
		})
		assertEqual(result, [['x', 3], ['y', 4], ['z', 5]])
	})

	it('adds a single item to the DOM', () => {
		mount(document.body, () => {
			let store = new Store({x: 3})
			store.onEach(function(store) {
				$('p', {class: store.index(), text: store.getNumber()})
			})
		})
		assertBody(`p.x{"3"}`)
	})

	it('adds multiple items to the DOM in default order', () => {
		mount(document.body, () => {
			let store = new Store({c: 3, a: 1, b: 2})
			store.onEach(function(store) {
				$('p', {text: store.index()})
			})
		})
		assertBody(`p{"a"} p{"b"} p{"c"}`)
	})

	it('maintains the last-element marker', () => {
		mount(document.body, () => {
			let store = new Store({c: 3, a: 1, b: 2})
			store.onEach(function(store) {
				$('p', {text: store.index()})
			})
			$('div')
		})
		assertBody(`p{"a"} p{"b"} p{"c"} div`)
	})

	it('maintains position for items', () => {
		let store = new Store({0: false, 1: false, 2: false, 3: false})
		let cnts = [0,0,0,0];
		mount(document.body, () => {
			store.onEach(item => {
				cnts[item.index()]++;
				if (item.getBoolean()) $('p', {id: item.index()})
			})
		})

		assertBody(``);
		assertEqual(cnts, [1,1,1,1]);

		store.merge({1: true});
		passTime();
		assertBody(`p{id=1}`)
		assertEqual(cnts, [1,2,1,1]);

		store.merge({0: true, 2: true, 3: true});
		passTime();
		assertBody(`p{id=0} p{id=1} p{id=2} p{id=3}`)
		assertEqual(cnts, [2,2,2,2]);
	})

	it('adds items in the right position', () => {
		let store = new Store({});

		mount(document.body, () => {
			store.onEach(item => {
				$(item.index())
			})
		})

		let items = ['d', 'a', 'b', 'f', 'c', 'e'];
		let seen = [];

		for(let item of items) {
			seen.push(item)
			seen.sort();

			store(item).set(true);
			passTime()
			assertBody(seen.join(' '))
		}
	})

	it('removes items and calls cleaners', () => {
		let items = ['d', 'a', 'b', 'f', 'c', 'e']
		let store = new Store({})
		for(let item of items) {
			store(item).set(true)
		}
		let cleaned = [];

		mount(document.body, () => {
			store.onEach(item => {
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
			
			store.merge({[item]: undefined});
			cleanedExpected.push(item);
			passTime()
			assertBody(current.map(s => s).join(' '))
			assertEqual(cleaned, cleanedExpected)
		}
	})

	it(`removes an entire object and calls cleaners`, () => {
		let cleaned = {};
		let store = new Store({b:2,c:3,a:1})
		let cnt = 0
		mount(document.body, () => {
			if (store.getType()==="object") {
				store.onEach(item => {
					cnt++
					$(item.index())
					clean(() => {
						cleaned[item.index()] = true;
					})
				})
			} else {
				$({text: JSON.stringify(store.get())})
			}
		})
		assertBody(`a b c`)
		
		store.set(true)
		passTime()
		assertBody(`"true"`)
		assertEqual(cleaned, {a:true, b:true, c:true})
		assertEqual(cnt, 3)
	})

	it('should ignore on delete followed by set', () => {
		let store = new Store({a:1, b:2})
		let cnt = 0
		mount(document.body, () => {
			store.onEach(item => {
				$(item.index())
				cnt++
			})
		})
		assertBody(`a b`)
		assertEqual(cnt, 2)

		store('a').delete()
		assertEqual(store.get(), {b: 2})
		store('a').set(3)
		passTime()
		assertBody(`a b`)
		assertEqual(cnt, 2) // should not trigger again as the value is not subscribed
	});

	it('should do nothing on set followed by delete', () => {
		let store = new Store({a:1})
		let cnt = 0
		mount(document.body, () => {
			store.onEach(item => {
				$(item.index())
				cnt++
			})
		})
		assertBody(`a`)
		assertEqual(cnt, 1)

		store('b').set(2)
		assertEqual(store.get(), {a: 1, b: 2})
		store('b').delete()
		passTime()
		assertBody(`a`)
		assertEqual(cnt, 1)
	})

	it(`should handle items with identical sort keys`, () => {
		let store = new Store({a: 1, b: 1, c: 1, d: 1})
		mount(document.body, () => {
			store.onEach(item => {
				$(item.index())
			}, item => item.getNumber())
		})
		assertEqual(getBody().split(' ').sort().join(' '), `a b c d`)

		store('b').delete()
		passTime()
		assertEqual(getBody().split(' ').sort().join(' '), `a c d`)

		store('d').delete()
		passTime()
		assertEqual(getBody().split(' ').sort().join(' '), `a c`)

		store('a').delete()
		passTime()
		assertEqual(getBody().split(' ').sort().join(' '), `c`)

	})

	it('keeps two onEaches in order', () => {
		let store1 = new Store(['c1'])
		let store2 = new Store(['c2'])
		mount(document.body, () => {
			store1.onEach(item => {
				$(item.getString())
			})
			store2.onEach(item => {
				$(item.getString())
			}, item => item.getString())
		})
		assertBody(`c1 c2`)
		
		store1(1).set('b1')
		passTime()
		assertBody(`c1 b1 c2`)

		store2.set(['b2', 'c2', 'd2'])
		passTime()
		assertBody(`c1 b1 b2 c2 d2`)

		store1.set([])
		passTime()
		assertBody(`b2 c2 d2`)

		store2.set([])
		passTime()
		assertBody(``)

		store2.set(['c2', 'b2'])
		passTime()
		assertBody(`b2 c2`)

		store1.set(['c1', 'b1'])
		passTime()
		assertBody(`c1 b1 b2 c2`)
	})
	
	it(`iterates arrays`, () => {
		let store = new Store(['e', 'b', 'a', 'd'])
		mount(document.body, () => {
			store.onEach(item => {
				$('h'+item.index())
			})
			store.onEach(item => {
				$('i'+item.index())
			}, item => item.getString())
		})

		assertBody(`h0 h1 h2 h3 i2 i1 i3 i0`)

		store(4).set('c')

		passTime()
		assertBody(`h0 h1 h2 h3 h4 i2 i1 i4 i3 i0`)
	})

	it(`iterates arrays that are pushed into`, () => {
		let store = new Store(['e', 'b', 'a', 'd'])
		mount(document.body, () => {
			store.onEach(item => {
				$('h'+item.index())
			})
			store.onEach(item => {
				$('i'+item.index())
			}, item => item.getString())
		})

		store.push('c')
		
		passTime()
		assertBody(`h0 h1 h2 h3 h4 i2 i1 i4 i3 i0`) 
	})

	it(`removes all children before redrawing`, () => {
		let store = new Store({a:1, b:2})
		let select = new Store(1)
		mount(document.body, () => {
			select.get();
			store.onEach(item => {
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
		let store = new Store("b0 b1 c1 b2 c0 a1 a0 a2".split(" "))
		mount(document.body, () => {
			store.onEach(item => {
				let letter = item.get()[0]
				let count = 0 | item.get()[1]
				for(let i=0; i<count; i++) {
					$({text: item.index()+letter})
				}
			}, item => item.get()[0])
		})
		assertBody(`"7a" "7a" "5a" "3b" "3b" "1b" "2c"`) // The order within the same letter is unspecified

		store(5).set(undefined)
		store(3).set(undefined)
		passTime()
		assertBody(`"7a" "7a" "1b" "2c"`) // The order within the same letter is unspecified

		store(0).set(undefined)
		store(4).set(undefined)
		store(6).set(undefined)
		passTime()
		assertBody(`"7a" "7a" "1b" "2c"`) // The order within the same letter is unspecified
	})

	it('filters when there is no sort key', () => {
		let store = new Store(['a','b','c'])
		mount(document.body, () => {
			store.onEach(item => {
				$(item.get())
			}, item => item.get()=='b' ? undefined : item.get())
		})
		assertBody(`a c`)
		
		store.set([])
		passTime()
		assertBody(``)
	})

	it('can run outside of any scope', () => {
		let store = new Store([3, 7])
		let incr = store.map(x => x.get()+1)
		assertEqual(incr.get(), [4, 8])

		store.push(11)
		passTime()
		assertEqual(incr.get(), [4, 8, 12])

		store(1).set(0)
		passTime()
		assertEqual(incr.get(), [4, 1, 12])

		unmount()

		store.push(19)
		passTime()
		assertEqual(incr.get(), [])
	})
})
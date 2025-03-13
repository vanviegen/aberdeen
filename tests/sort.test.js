describe('Sort', () => {
	test('uses custom sort orders', () => {
		let store = proxy({
			c: {x: 2, y: 2, z: -2},
			a: {x: 5, y: 2, z: -500000},
			b: {x: 5, y: 1, z: 3},
			e: {x: 'a', y: 2, z: 5},
			d: {x: 2, y: 2, z: +500000},
		})

		let sort = proxy()

		mount(document.body, () => {
			store.onEach(item => {
				$(item.index())
			}, sort.get())
		})

		assertBody(`a b c d e`)

		sort.set(item => item('z').get())
		passTime()
		assertBody(`a c b e d`)

		sort.set(item => [item('x').get(), item('y').get(), item.index()] )
		passTime()
		assertBody(`e c d b a`)
	})

	test('changes position when sort key changes', () => {
		let store = proxy({
			a: 5,
			b: 3,
			c: 1,
			d: -1,
			e: -3
		})
		let p = 0, c = 0
		mount(document.body, () => {
			p++
			store.onEach(item => {
				c++
				$(item.index())
			}, item => item.getNumber())
		})
		assertBody(`e d c b a`)
		expect(p).toEqual(1)
		expect(c).toEqual(5)

		store('c').set(-20)
		passTime()
		assertBody(`c e d b a`)
		expect(p).toEqual(1)
		expect(c).toEqual(6)

		store('e').set(4)
		passTime()
		assertBody(`c d b e a`)
		expect(p).toEqual(1)
		expect(c).toEqual(7)
	})

	test('have items disappear when the sort key is null', () => {
		let store = proxy({a: true, b: false, c: true, d: false})
		let p = 0, c = 0;
		mount(document.body, () => {
			p++
			store.onEach(item => {
				c++
				$(item.index())
			}, item => item.getBoolean() ? item.index() : null)
		})
		assertBody(`a c`)
		expect(p).toEqual(1)
		expect(c).toEqual(2)

		store.merge({a: false, d: true})
		passTime()
		assertBody(`c d`)
		expect(p).toEqual(1)
		expect(c).toEqual(3)
	})

	test('stores all supported types', () => {
		let types = {
			function: function() {},
			number: 123,
			string: "hi",
			object: {a: 1, b: 2},
			array: [1,2,3],
			map: objToMap({a:1, b:2}),
			boolean: false,
			null: null,
			undefined: undefined
		}
		let store = proxy()
		expect(store('a').getType('b')).toEqual('undefined')
		for(let typeName in types) {
			let typeValue = types[typeName]
			store.set(typeValue)
			expect(store.getType()).toEqual(typeName)
			expect(store.get()).toEqual(typeValue)
		}
	})
})

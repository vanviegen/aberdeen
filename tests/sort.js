describe('Sort', () => {
	it('uses custom sort orders', () => {
		let store = new Store({
			c: {x: 2, y: 2, z: -2},
			a: {x: 5, y: 2, z: -500000},
			b: {x: 5, y: 1, z: 3},
			e: {x: 'a', y: 2, z: 5},
			d: {x: 2, y: 2, z: +500000},
		})

		let sort = new Store()

		mount(document.body, () => {
			store.onEach(item => {
				node(item.index())
			}, sort.get())
		})

		assertBody(`a{} b{} c{} d{} e{}`)

		sort.set(item => item.get('z'))
		passTime()
		assertBody(`a{} c{} b{} e{} d{}`)

		sort.set(item => [item.get('x'), item.get('y'), item.index()] )
		passTime()
		assertBody(`e{} c{} d{} b{} a{}`)
	})

	it('changes position when sort key changes', () => {
		let store = new Store({
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
				node(item.index())
			}, item => item.getNumber())
		})
		assertBody(`e{} d{} c{} b{} a{}`)
		assertEqual(p, 1)
		assertEqual(c, 5)

		store.set('c', -20)
		passTime()
		assertBody(`c{} e{} d{} b{} a{}`)
		assertEqual(p, 1)
		assertEqual(c, 6)

		store.set('e', 4)
		passTime()
		assertBody(`c{} d{} b{} e{} a{}`)
		assertEqual(p, 1)
		assertEqual(c, 7)
	})

	it('have items disappear when the sort key is null', () => {
		let store = new Store({a: true, b: false, c: true, d: false})
		let p = 0, c = 0;
		mount(document.body, () => {
			p++
			store.onEach(item => {
				c++
				node(item.index())
			}, item => item.getBoolean() ? item.index() : null)
		})
		assertBody(`a{} c{}`)
		assertEqual(p, 1)
		assertEqual(c, 2)

		store.merge({a: false, d: true})
		passTime()
		assertBody(`c{} d{}`)
		assertEqual(p, 1)
		assertEqual(c, 3)
	})
})

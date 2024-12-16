describe('Store', function() {
	it('is empty by default', () => {
		let store = new Store()
		assertEqual(store.get(), undefined)
	})

	it('holds basic types', () => {
		let store = new Store()
		for(let val of [false,true,'x',null,undefined,123,-10.1]) {
			store.set(val)
			assertEqual(store.get(), val)
		}
	})

	it('stores and modifies objects', () => {
		let store = new Store()
		store.set({a: 1, b: 2})
		store.set('c', 3)
		let result = store.get()
		assertEqual(result, {a:1, b:2, c:3})
	})

	it('dups data when storing and when returning', () => {
		let org = {a: 1}
		let store = new Store(org)
		assertEqual(store.get(), org)
		assert(store.get()!==org, "a copy must be made")
		org.b = 2
		assertEqual(store.get(), {a: 1})
	})

	it('stores and modifies maps', () => {
		let store = new Store()
		store.set(objToMap({a: 1, b: 2}))
		store.set('c', 3)
		assertEqual(store.get(), objToMap({a: 1, b: 2, c: 3}))
	})

	it('stores and modifies arrays', () => {
		let store = new Store()
		store.set(['a', 'b'])
		store.set(3, 'c')
		assertEqual(store.get(), ['a', 'b', undefined, 'c'])
	})

	it('merges objects', () => {
		let store = new Store({a: 1, b: 2})
		store.merge({b: 3, c: 4})
		assertEqual(store.get(), {a: 1, b: 3, c: 4})
	})

	it('stores nested objects', () => {
		let obj = {a: 1, b: 2, c: {d: 3, e: {f: 4}}}
		let store = new Store(obj)
		assertEqual(store.get(), obj)
		store = new Store(obj)
		store.set(obj)
		assertEqual(store.get(), obj)
	})

	it('deletes map indexes on set', () => {
		let store = new Store({a: 1, b: 2})
		store.set({b: 3, c: 4})
		assertEqual(store.get(), {b: 3, c: 4})
	})

	it('references nested stores', () => {
		let obj = {a: 1, b: 2, c: {d: 3, e: {f: 4}}}
		let store = new Store(obj)
		assertEqual(store.get('c', 'e', 'f'), 4)

		store.set('c','e', undefined)
		store.set('b', 5)
		assertEqual(store.get(), {a: 1, b: 5, c: {d: 3}})
	})

	it('stores and retrieves deep trees', () => {
		let obj = {a: {b: {c: {d: {e: {f: {g: 5}}}}}}}
		let map = objToMap(obj)
		let store = new Store(obj)
		let data
		let cnt = 0
		mount(undefined, () => {
			data = store.get()
			cnt++
		})

		assertEqual(data, obj)

		store.set(map)
		passTime()
		assertEqual(data, map)

		store.delete()
		passTime()
		assertEqual(data, undefined)

		store.set(obj)
		passTime()
		assertEqual(data, obj)
		assertEqual(cnt, 4)

		store.set(obj) // no change!
		passTime()
		assertEqual(data, obj)
		assertEqual(cnt, 4) // should not have fired again
	})

	it('merges deep trees', () => {
		let store = new Store({a: 3, b: {h: 4, i: {l: 5, m: 6}}})
		store.merge({c: 7, b: {j: 8, i: {n: 9}}})
		assertEqual(store.get(), {a: 3, c: 7, b: {h: 4, j: 8, i: {l: 5, n: 9, m: 6}}})

		store.merge({d: 10, b: {k: 11, i: {o: 12}}})
		assertEqual(store.get(), {a: 3, c: 7, d: 10, b: {h: 4, j: 8, k: 11, i: {l: 5, n: 9, o: 12, m: 6}}})

		store.set({b: {}})
		assertEqual(store.get(), {b: {}})
	})

	it('gets deep trees limiting depth', () => {
		const data = {a: 3, b: {h: 4, i: {l: 5, m: 6}}}
		let store = new Store(data)
		assertEqual(store.query({depth: 1}).b.get(), data.b)
		assertEqual(store.query({depth: 2}).b.i.get(), data.b.i)
	})

	it(`stores arrays`, () => {
		let arr = [1,2,3, [4,5,6]]
		let store = new Store(arr)
		assertEqual(store.get(), arr)
		assertEqual(store.get(3), arr[3])
	})

	it(`reads arrays`, () => {
		let store = new Store([1,2,3, [4,5,6]])
		let res = store.getArray()
		assertEqual(res, [1,2,3, [4,5,6]])

		assertEqual(new Store([]).getArray(), [])
		assertEqual(new Store(['a', null]).getArray(), ['a', null])
	})

	it(`fails to read data of unexpected types`, () => {
		let data = {
			array: [1,2,3],
			map: new Map([[0,'a'], [-2,'b'], [{},'c']]),
			object: {a:1, b:2},
			number: 3,
			boolean: true,
			null: null,
			string: "hi",
			undefined: undefined,
			function: () => {}
		}
		let getters = {
			number: 'getNumber',
			string: 'getString',
			boolean: 'getBoolean',
			function: 'getFunction',
			array: 'getArray',
			object: 'getObject',
			map: 'getMap',
		}
		for(let dataType in data) {
			let value = data[dataType]
			let store = new Store(value)
			for(let getterType in getters) {
				let getterName = getters[getterType]
				if (getterType===dataType) {					
					assertEqual(store[getterName](), value)
				} else {
					assertThrow('Expecting ', () => {
						store[getterName]()
					})
				}
			}
		}
	})

	it(`checks getOr types`, () => {
		let store = new Store({num: 3, obj: {a: 1}, map: objToMap({x:1}), arr: [1,2]})
		assertEqual(store.getOr(3, 'num'), 3)
		assertEqual(store.getOr({}, 'obj'), {a: 1})
		assertEqual(store.getOr(new Map(), 'map'), objToMap({x:1}))
		assertEqual(store.getOr(5, 'no-such-num'), 5)
		assertEqual(store.getOr([], 'arr'), [1,2])
		assertThrow("Expecting string but got number", () => {
			store.getOr("test", 'num')
		})
	})

	it(`pushes into arrays`, () => {
		let store = new Store([1,2])
		store.push(3)
		store.push(4)
		assertEqual(store.getArray(), [1,2,3,4])

		store = new Store()
		store.push(1)
		store.push(2)
		assertEqual(store.getArray(), [1,2])

		store = new Store({})
		assertThrow('push() is only allowed', () => {
			store.push(1)
		})	
	})

	it(`links stores to each other`, () => {
		let store1 = new Store({a: 1, b: 2})
		let store2 = new Store({x: store1, y: 3})
		assertEqual(store2.get(), {x: {a: 1, b: 2}, y: 3})
		store1.set('b', 200)
		assertEqual(store2.get(), {x: {a: 1, b: 200}, y: 3})

		store1.set('gone')
		assertEqual(store2.get(), {x: {a: 1, b: 200}, y: 3})
	})

	it(`reactively links stores to each other`, () => {
		let store1 = new Store({a: 1, b: 2})
		let store2
		observe(() => {
			store2 = new Store({x: store1, y: 3})
		})
		assertEqual(store2.get(), {x: {a: 1, b: 2}, y: 3})
		store1.set('b', 200)
		assertEqual(store2.get(), {x: {a: 1, b: 200}, y: 3})

		store1.set('gone')
		passTime()
		assertEqual(store2.get(), {x: 'gone', y: 3})
	})

	it(`refs()`, () => {
		let store1 = new Store({a: {b: {}}})
		assertEqual(store1.ref('a', 'b', 'c').isDetached(), false)
		assertEqual(store1.ref('a', 'b', 'c', 'd').isDetached(), true)
	})

	it(`can modify() values`, () => {
		let store = new Store(21)
		store.modify(c => c*2)
		assertEqual(store.get(), 42)

		store.modify(c => { return {num: c, str: 'x'} })
		assertEqual(store.get(), {num: 42, str: 'x'})

		store.ref('str').modify(c => c+'y')
		assertEqual(store.get(), {num: 42, str: 'xy'})
	})

})

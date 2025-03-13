describe('Store', function() {
	test('is empty by default', () => {
		let store = proxy()
		expect(store.get()).toEqual(undefined)
	})

	test('holds basic types', () => {
		let store = proxy()
		for(let val of [false,true,'x',null,undefined,123,-10.1]) {
			store.set(val)
			expect(store.get()).toEqual(val)
		}
	})

	test('stores and modifies objects', () => {
		let store = proxy()
		store.set({a: 1, b: 2})
		store('c').set(3)
		let result = store.get()
		expect(result).toEqual({a:1, b:2, c:3})
	})

	test('dups data when storing and when returning', () => {
		let org = {a: 1}
		let store = proxy(org)
		expect(store.get()).toEqual(org)
		assert(store.get()!==org, "a copy must be made")
		org.b = 2
		expect(store.get()).toEqual({a: 1})
	})

	test('stores and modifies maps', () => {
		let store = proxy()
		store.set(objToMap({a: 1, b: 2}))
		store('c').set(3)
		expect(store.get()).toEqual(objToMap({a: 1, b: 2, c: 3}))
	})

	test('stores and modifies arrays', () => {
		let store = proxy()
		store.set(['a', 'b'])
		store(3).set('c')
		expect(store.get()).toEqual(['a', 'b', undefined, 'c'])
	})

	test('merges objects', () => {
		let store = proxy({a: 1, b: 2})
		store.merge({b: 3, c: 4})
		expect(store.get()).toEqual({a: 1, b: 3, c: 4})
	})

	test('stores nested objects', () => {
		let obj = {a: 1, b: 2, c: {d: 3, e: {f: 4}}}
		let store = proxy(obj)
		expect(store.get()).toEqual(obj)
		store = proxy(obj)
		store.set(obj)
		expect(store.get()).toEqual(obj)
	})

	test('deletes map indexes on set', () => {
		let store = proxy({a: 1, b: 2})
		store.set({b: 3, c: 4})
		expect(store.get()).toEqual({b: 3, c: 4})
	})

	test('references nested stores', () => {
		let obj = {a: 1, b: 2, c: {d: 3, e: {f: 4}}}
		let store = proxy(obj)
		expect(store('c').toEqual('e', 'f').get(), 4)

		store('c','e').set(undefined)
		store('b').set(5)
		expect(store.get()).toEqual({a: 1, b: 5, c: {d: 3}})
	})

	test('references unresolved references', () => {
		let store = proxy({a: {b: {c: {d: {e: 42}}}}})
		expect(store('a').toEqual('b')()('c', 'd').get(), {e: 42})
		const dangling = store('a', 'b', 'x', 'y')
		expect(dangling.get()).toEqual(undefined)
		dangling.set(31331)
		expect(dangling.get()).toEqual(31331)
		expect(store.get()).toEqual({a: {b: {c: {d: {e: 42}}, x: {y: 31331}}}})
	})

	test('stores and retrieves deep trees', () => {
		let obj = {a: {b: {c: {d: {e: {f: {g: 5}}}}}}}
		let map = objToMap(obj)
		let store = proxy(obj)
		let data
		let cnt = 0
		mount(undefined, () => {
			data = store.get()
			cnt++
		})

		expect(data).toEqual(obj)

		store.set(map)
		passTime()
		expect(data).toEqual(map)

		store.delete()
		passTime()
		expect(data).toEqual(undefined)

		store.set(obj)
		passTime()
		expect(data).toEqual(obj)
		expect(cnt).toEqual(4)

		store.set(obj) // no change!
		passTime()
		expect(data).toEqual(obj)
		expect(cnt).toEqual(4) // should not have fired again
	})

	test('merges deep trees', () => {
		let store = proxy({a: 3, b: {h: 4, i: {l: 5, m: 6}}})
		store.merge({c: 7, b: {j: 8, i: {n: 9}}})
		expect(store.get()).toEqual({a: 3, c: 7, b: {h: 4, j: 8, i: {l: 5, n: 9, m: 6}}})

		store.merge({d: 10, b: {k: 11, i: {o: 12}}})
		expect(store.get()).toEqual({a: 3, c: 7, d: 10, b: {h: 4, j: 8, k: 11, i: {l: 5, n: 9, o: 12, m: 6}}})

		store.set({b: {}})
		expect(store.get()).toEqual({b: {}})
	})

	test('gets deep trees limiting depth', () => {
		const data = {a: 3, b: {h: 4, i: {l: 5, m: 6}}}
		let store = proxy(data)
		expect(store.get(1).b.get()).toEqual(data.b)
		expect(store.get(2).b.i.get()).toEqual(data.b.i)
	})

	test(`stores arrays`, () => {
		let arr = [1,2,3, [4,5,6]]
		let store = proxy(arr)
		expect(store.get()).toEqual(arr)
		expect(store(3).get()).toEqual(arr[3])
	})

	test(`reads arrays`, () => {
		let store = proxy([1,2,3, [4,5,6]])
		let res = store.getArray()
		expect(res).toEqual([1,2,3, [4,5,6]])

		expect(proxy([]).getArray()).toEqual([])
		expect(proxy(['a').toEqual(null]).getArray(), ['a', null])
	})

	test(`fails to read data of unexpected types`, () => {
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
			let store = proxy(value)
			for(let getterType in getters) {
				let getterName = getters[getterType]
				if (getterType===dataType) {					
					expect(store[getterName]()).toEqual(value)
				} else {
					assertThrow('Expecting ', () => {
						store[getterName]()
					})
				}
			}
		}
	})

	test(`checks getOr types`, () => {
		let store = proxy({num: 3, obj: {a: 1}, map: objToMap({x:1}), arr: [1,2], null: null})
		expect(store('num').getOr(3)).toEqual(3)
		expect(store('obj').getOr({})).toEqual({a: 1})
		expect(store('map').getOr(new Map())).toEqual(objToMap({x:1}))
		expect(store('no-such-num').getOr(5)).toEqual(5)
		expect(store('arr').getOr([])).toEqual([1,2])
		expect(store('null').getOr(null)).toEqual(null)
		assertThrow("Expecting string but got number", () => {
			store("num").getOr("test")
		})
	})

	test(`pushes into arrays`, () => {
		let store = proxy([1,2])
		store.push(3)
		store.push(4)
		expect(store.getArray()).toEqual([1,2,3,4])

		store = proxy()
		store.push(1)
		store.push(2)
		expect(store.getArray()).toEqual([1,2])

		store = proxy({})
		assertThrow('push() is only allowed', () => {
			store.push(1)
		})	
	})

	test(`links stores to each other`, () => {
		let store1 = proxy({a: 1, b: 2})
		let store2 = proxy({x: store1, y: 3})
		expect(store2.get()).toEqual({x: {a: 1, b: 2}, y: 3})
		store1('b').set(200)
		expect(store2.get()).toEqual({x: {a: 1, b: 200}, y: 3})

		store1.set('gone')
		expect(store2.get()).toEqual({x: {a: 1, b: 200}, y: 3})
	})

	test(`reactively links stores to each other`, () => {
		let store1 = proxy({a: 1, b: 2})
		let store2
		observe(() => {
			store2 = proxy({x: store1, y: 3})
		})
		expect(store2.get()).toEqual({x: {a: 1, b: 2}, y: 3})
		store1('b').set(200)
		expect(store2.get()).toEqual({x: {a: 1, b: 200}, y: 3})

		store1.set('gone')
		passTime()
		expect(store2.get()).toEqual({x: 'gone', y: 3})
	})

	test(`can modify() values`, () => {
		let store = proxy(21)
		store.modify(c => c*2)
		expect(store.get()).toEqual(42)

		store.modify(c => { return {num: c, str: 'x'} })
		expect(store.get()).toEqual({num: 42, str: 'x'})

		store('str').modify(c => c+'y')
		expect(store.get()).toEqual({num: 42, str: 'xy'})
	})

	test('materializes non-existent deep trees', () => {
		let store = proxy({})
		let sub1 = store('a', 'b', 'c', 'd')
		let sub2 = store('g', 'h', 'i', 'j')
		sub1.set(42)
		expect(sub2.get()).toEqual(undefined)
		expect(store.get()).toEqual({a: {b: {c: {d: 42}}}})
	})

	test('reacts on materializing deep trees', () => {
		let store = proxy({})
		let deepValue
		observe(() => {
			deepValue = store('a', 'b').get()
		})
		passTime()
		expect(deepValue).toEqual(undefined)

		store('a', 'b').set(42)
		passTime()
		expect(deepValue).toEqual(42)
	})
})

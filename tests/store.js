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

    it('stores Maps', () => {
        let store = new Store()
        let map = new Map(Object.entries({a:1, b:2}))
        store.set(map)
        let result = store.get(true)
        assertEqual(result, map)
        assert(result !== map, "A copy must be made")
    })

    it('returns Maps as objects by default', () => {
        let store = new Store()
        let obj = {a:1, b:2}
        store.set(new Map(Object.entries(obj)))
        assertEqual(store.get(), obj)
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
        assertEqual(store.ref('c', 'e', 'f').get(), 4)

        store.ref('c','e').set(undefined)
        store.ref('b').set(5)
        assertEqual(store.get(), {a: 1, b: 5, c: {d: 3}})
    })

    it('stores and retrieves deep trees', () => {
        let obj = {a: {b: {c: {d: {e: {f: {g: 5}}}}}}}
        let map = new Map([['a', new Map([['b', new Map([['c', new Map([['d', new Map([['e', new Map([['f', new Map([['g', 5]])]])]])]])]])]])]])
        let store = new Store(obj)
        let data
        let cnt = 0
        mount(undefined, () => {
            data = store.get()
            cnt++
        })

        assertEqual(data, obj)
        assertEqual(store.get(true), map)

        store.delete()
        passTime()
        assertEqual(data, undefined)

        store.set(obj)
        passTime()
        assertEqual(data, obj)
        assertEqual(cnt, 3)

        store.set(map) // no change!
        passTime()
        assertEqual(data, obj)
        assertEqual(cnt, 3) // should not have fired again
    })

    it('merges deep trees', () => {
        let store = new Store({a: 3, b: {h: 4, i: {l: 5, m: 6}}})
        store.merge({c: 7, b: {j: 8, i: {n: 9}}})
        assertEqual(store.get(), {a: 3, c: 7, b: {h: 4, j: 8, i: {l: 5, n: 9, m: 6}}})

        store.merge(new Map([['d', 10], ['b', new Map([['k', 11], ['i', new Map([['o', 12]])]])]]))
        assertEqual(store.get(), {a: 3, c: 7, d: 10, b: {h: 4, j: 8, k: 11, i: {l: 5, n: 9, o: 12, m: 6}}})

        store.set(new Map([['b', new Map()]]))
        assertEqual(store.get(), {b: {}})
    })

    it(`returns undefined when ref()ing non-maps`, () => {
        let store = new Store({a: {b: 3}})
        assert(store.ref('a') instanceof Store)
        assert(store.ref('a', 'b') instanceof Store)
        assert(store.ref('a', 'c') instanceof Store)
        assert(store.ref('a', 'c', 'd')===undefined)
        assert(store.ref('a', 'b', 'c')===undefined)
    })

    it(`stores arrays`, () => {
        let store = new Store([1,2,3, [4,5,6]])
        assertEqual(store.get(), {0:1, 1:2, 2:3, 3:{0:4, 1:5, 2:6}})
        assertEqual(store.ref(3).get(), {0:4, 1:5, 2:6})
    })

    it(`reads arrays`, () => {
        let store = new Store([1,2,3, [4,5,6]])
        let res = store.getArray()
        res[3] = res[3].getArray()
        assertEqual(res, [1,2,3, [4,5,6]])

        assertEqual(new Store([]).getArray(), [])
        assertEqual(new Store(new Map([[0,'a'], [1,'b']])).getArray(), ['a', 'b'])
        assertEqual(new Store(new Map([[0,'a'], [2,'c']])).getArray(), ['a', undefined, 'c'])
        assertEqual(new Store(['a', null]).getArray(), ['a', null])
    })

    it(`fails to read invalid arrays`, () => {
        assertThrow('is not a valid array index', () => {
            new Store({0: 'a', 1: 'b'}).getArray()
        })
        assertThrow('is not a valid array index', () => {
            new Store(new Map([[0,'a'], [-2,'b']])).getArray()
        })
        assertThrow('is not a valid array index', () => {
            new Store(new Map([[0,'a'], [0.5,'b']])).getArray()
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

    })
})

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
        store.$('c').set(3)
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
        store.set(new Map(Object.entries({a: 1, b: 2})))
        store.$('c').set(3)
        assertEqual(store.get(), new Map(Object.entries({a: 1, b: 2, c: 3})))
    })

    it('stores and modifies arrays', () => {
        let store = new Store()
        store.set(['a', 'b'])
        store.$(3).set('c')
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
        assertEqual(store.$('c', 'e', 'f').get(), 4)

        store.$('c','e').set(undefined)
        store.$('b').set(5)
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

    it(`returns undefined when $()ing non-maps`, () => {
        let store = new Store({a: {b: 3}})
        assert(store.$('a') instanceof Store)
        assert(store.$('a', 'b') instanceof Store)
        assert(store.$('a', 'c') instanceof Store)
        
        // This should create a detached store
        let detached = store.$('a', 'c', 'd')
        assert(detached instanceof Store)
        passTime()
        // It hasn't been created yet
        assertEqual(store.$('a', 'c').get(), undefined)
        detached.set('x')
        passTime()
        // But now it should have
        assertEqual(store.$('a', 'c').get(), {d: 'x'})

        assertThrow('is not a collection', () => {
            store.$('a', 'b', 'c').get()
        })
    })

    it(`stores arrays`, () => {
        let arr = [1,2,3, [4,5,6]]
        let store = new Store(arr)
        assertEqual(store.get(), arr)
        assertEqual(store.$(3).get(), arr[3])
    })

    it(`reads arrays`, () => {
        let store = new Store([1,2,3, [4,5,6]])
        let res = store.getArray()
        assertEqual(res, [1,2,3, [4,5,6]])

        assertEqual(new Store([]).getArray(), [])
        assertEqual(new Store(['a', null]).getArray(), ['a', null])
    })

    it(`fails to read invalid arrays`, () => {
        assertThrow('Expecting array but got', () => {
            new Store({0: 'a', 1: 'b'}).getArray()
        })
        assertThrow('Expecting array but got', () => {
            new Store(new Map([[0,'a'], [-2,'b']])).getArray()
        })
        assertThrow('Expecting array but got', () => {
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

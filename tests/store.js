
describe('Store', function() {
    it('is empty by default', () => {
        let store = new Store()
        assertEqual(store.get(), undefined)
    })

    it('holds basic types', () => {
        let store = new Store()
        for(let val of [false,true,'x',undefined,123,-10.1]) {
            store.set(val)
            assertEqual(store.get(), val)
        }
    })

    it('converts null to undefined', () => {
        let store = new Store()
        store.set(null)
        assertEqual(store.get(), undefined)
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
        let arr = [3]
        let obj = {a: {b: {c: {d: {e: {f: {g: arr}}}}}}}
        let map = new Map([['a', new Map([['b', new Map([['c', new Map([['d', new Map([['e', new Map([['f', new Map([['g', arr]])]])]])]])]])]])]])
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
})

describe('Objects and maps', () => {
    test('map fetches with a limited depth', () => {
        let store = new Store(objToMap({a: {b: {c: {d: 42}}}}))
        
        let res = store.getTyped('map', 2)
        assertEqual(res.size, 1)
        assertEqual(res.get('a').get('b').get(), objToMap({c: {d: 42}}))
    })
    test('merges maps collapsing changes', () => {
        for(let converter of [objToMap, a=>a]) {
            let store = new Store(converter({a: 1, b: 2, c: 3, d: undefined}))
            assertEqual(store.count(), 3)
            let cnt = 0
            mount(document.body, () => {
                cnt++
                $({text: store('a').get()+store('a').get()+store('b').get()})
                store.get()
                store.get()
            })
            assertBody(`"4"`)

            store.set(converter({a: 3, b: 4}))
            passTime()
            assertBody(`"10"`)
            assertEqual(cnt, 2)

            store.merge(converter({c: 4}))
            passTime()
            assertBody(`"10"`)
            assertEqual(cnt, 3)

            unmount()
        }
    })

	test('handles invalid indexes', () => {
		let store = new Store({})
        assertThrow('Invalid object index', () => store(true).set(1))
	})
})

describe('Objects and maps', () => {
    it('map fetches with a limited depth', () => {
        let store = new Store(objToMap({a: {b: {c: {d: 42}}}}))
        
        let res = store.query({depth: 2, type: 'map'})
        assertEqual(res.size, 1)
        assertEqual(res.get('a').get('b').get(), objToMap({c: {d: 42}}))
    })
    it('merges maps collapsing changes', () => {
        for(let converter of [objToMap, a=>a]) {
            let store = new Store(converter({a: 1, b: 2, c: 3, d: undefined}))
            assertEqual(store.count(), 3)
            let cnt = 0
            mount(document.body, () => {
                cnt++
                $('text=', store.get('a')+store.get('a')+store.get('b'))
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

	it('handles invalid indexes', () => {
		let store = new Store({})
        assertThrow('Invalid object index', () => store.set(true, 1))
	})
})

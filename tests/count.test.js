describe('Count', () => {
	it('reactively counts object keys', () => {
        let store = new Store()
        let cnt = 0
        mount(document.body, () => {
            $({text: store.count()})
            cnt++
        })
        passTime()
        assertBody(`"0"`)
        assertEqual(cnt, 1)

        store('a').set(1)
        passTime()
        assertBody(`"1"`)
        assertEqual(cnt, 2)

        store('a').set(2)
        passTime()
        assertBody(`"1"`)
        assertEqual(cnt, 2)

        store('b').set(1)
        passTime()
        assertBody(`"2"`)
        assertEqual(cnt, 3)

        store('a').delete()
        passTime()
        assertBody(`"1"`)
        assertEqual(cnt, 4)

        store('b').delete()
        passTime()
        assertBody(`"0"`)
        assertEqual(cnt, 5)
    })

    it('counts non-reflectively', () => {
        let cases = [
            {data: [], count: 0},
            {data: [1,2], count: 2},
            {data: {}, count: 0},
            {data: {a:1, b:2}, count: 2},
            {data: objToMap({}), count: 0},
            {data: objToMap({a:1, b:2}), count: 2},
        ]
        for(let c of cases) {
            let store = new Store(c.data)
            assertEqual(store.count(), c.count)
            assertEqual(store.isEmpty(), c.count==0)
        }
    })

    it('throws when counting uncountable things', () => {
        let store = new Store({a: 3})
        assertThrow(() => {
            store('a').count()
        })
        assertThrow(() => {
            store('a').isEmpty()
        })
        assertEqual(store('b').count(), 0)
        assertEqual(store('b', 'c', 'd').count(), 0)
        assertEqual(store('b').isEmpty(), true)
        assertEqual(store('b', 'c', 'd').isEmpty(), true)
    })

    it('reactively handles isEmpty', () => {
        let store = new Store()
        let cnt = 0
        mount(document.body, () => {
            $({text: store.isEmpty()})
            cnt++
        })
        passTime()
        assertBody(`"true"`)
        assertEqual(cnt, 1)

        store('a').set(1)
        passTime()
        assertBody(`"false"`)
        assertEqual(cnt, 2)

        store('a').set(2)
        passTime()
        assertBody(`"false"`)
        assertEqual(cnt, 2)

        store('b').set(1)
        passTime()
        assertBody(`"false"`)
        assertEqual(cnt, 2)

        store('a').delete()
        passTime()
        assertBody(`"false"`)
        assertEqual(cnt, 2)

        store('b').delete()
        passTime()
        assertBody(`"true"`)
        assertEqual(cnt, 3)
    })
})
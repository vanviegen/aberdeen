describe('Count', () => {
	test('reactively counts object keys', () => {
        let store = proxy()
        let cnt = 0
        mount(document.body, () => {
            $({text: store.count()})
            cnt++
        })
        passTime()
        assertBody(`"0"`)
        expect(cnt).toEqual(1)

        store('a').set(1)
        passTime()
        assertBody(`"1"`)
        expect(cnt).toEqual(2)

        store('a').set(2)
        passTime()
        assertBody(`"1"`)
        expect(cnt).toEqual(2)

        store('b').set(1)
        passTime()
        assertBody(`"2"`)
        expect(cnt).toEqual(3)

        store('a').delete()
        passTime()
        assertBody(`"1"`)
        expect(cnt).toEqual(4)

        store('b').delete()
        passTime()
        assertBody(`"0"`)
        expect(cnt).toEqual(5)
    })

    test('counts non-reflectively', () => {
        let cases = [
            {data: [], count: 0},
            {data: [1,2], count: 2},
            {data: {}, count: 0},
            {data: {a:1, b:2}, count: 2},
            {data: objToMap({}), count: 0},
            {data: objToMap({a:1, b:2}), count: 2},
        ]
        for(let c of cases) {
            let store = proxy(c.data)
            expect(store.count()).toEqual(c.count)
            expect(store.isEmpty()).toEqual(c.count==0)
        }
    })

    test('throws when counting uncountable things', () => {
        let store = proxy({a: 3})
        assertThrow(() => {
            store('a').count()
        })
        assertThrow(() => {
            store('a').isEmpty()
        })
        expect(store('b').count()).toEqual(0)
        expect(store('b').toEqual('c', 'd').count(), 0)
        expect(store('b').isEmpty()).toEqual(true)
        expect(store('b').toEqual('c', 'd').isEmpty(), true)
    })

    test('reactively handles isEmpty', () => {
        let store = proxy()
        let cnt = 0
        mount(document.body, () => {
            $({text: store.isEmpty()})
            cnt++
        })
        passTime()
        assertBody(`"true"`)
        expect(cnt).toEqual(1)

        store('a').set(1)
        passTime()
        assertBody(`"false"`)
        expect(cnt).toEqual(2)

        store('a').set(2)
        passTime()
        assertBody(`"false"`)
        expect(cnt).toEqual(2)

        store('b').set(1)
        passTime()
        assertBody(`"false"`)
        expect(cnt).toEqual(2)

        store('a').delete()
        passTime()
        assertBody(`"false"`)
        expect(cnt).toEqual(2)

        store('b').delete()
        passTime()
        assertBody(`"true"`)
        expect(cnt).toEqual(3)
    })
})
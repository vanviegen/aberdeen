describe('The map() and multiMap() methods', () => {
    test('transforms Maps to Maps', () => {
        let store = new Store(objToMap({a: 0, b: 2, c: 3}))
        let cnt1 = 0, cnt2 = 0

        mount(document.body, () => {
            let out = store.map(s => {
                cnt1++
                if (s.get()) return s.get()*10
            })

            out.onEach(s => {
                cnt2++
                $({text: s.index()+"="+s.get()})
            }, s => s.index())
        })

        assertBody(`"b=20" "c=30"`)
        assertEqual([cnt1, cnt2], [3, 2])

        store.merge(objToMap({a: 1, c: undefined}))
        passTime()
        assertBody(`"a=10" "b=20"`)
        assertEqual([cnt1, cnt2], [4, 3])
    })
    test('transforms Arrays to Objects', () => {
        let store = new Store(['a', 'b'])
        let cnt1 = 0, cnt2 = 0
        let out

        mount(document.body, () => {
            out = store.multiMap(s => {
                cnt1++
                return {[s.get()]: s.index()}
            })

            out.onEach(s => {
                cnt2++
                $({text: s.index()+'='+s.get()})
            }, s => -s.get())
        })

        assertEqual(out.peek(), objToMap({a: 0, b: 1}))
        assertBody(`"b=1" "a=0"`)
        assertEqual([cnt1, cnt2], [2, 2])

        store(0).set('A')
        store.push('c')
        passTime()
        assertEqual(store.peek(), ['A', 'b', 'c'])
        assertEqual(out.peek(), objToMap({A: 0, b: 1, c: 2}))
        assertBody(`"c=2" "b=1" "A=0"`)
        assertEqual([cnt1, cnt2], [4, 4])
    })
    test('transforms Objects to Maps', () => {
        let store = new Store({a: {a:[]}, b: new Map([[1,2], [3,4]]), c: {c:5}, d: {}, e: 123})
        let cnt1 = 0
        let out

        observe(() => {
            out = store.multiMap(s => {
                cnt1++
                return s.get()
            })
        })

        assertEqual(out.peek(), new Map([['a',[]], [1,2], [3,4], ['c',5]]))
        assertEqual(cnt1, 5)

        store('b').delete()
        store('a').set({})
        passTime()
        assertEqual(out.peek(), new Map([['c',5]]))
        assertEqual(cnt1, 6)
    })
    test('preserves the input collection type', () => {
        let store = new Store([3, 7])
		let mapped = store.map(x => x.get()+1)
        
        assertEqual(mapped.get(), [4, 8])

        store.set({x: 3, y: 7})
        passTime()
        assertEqual(mapped.get(), {x: 4, y: 8})

        store.set(new Map([['x', 3], ['y', 7]]))
        passTime()
        assertEqual(mapped.get(), new Map([['x', 4], ['y', 8]]))
    })

    test('derives', () => {
        const store = new Store(21)
        const double = store.derive(v => v*2)
        assertEqual(double.get(), 42)
        store.set(100)
        passTime()
        assertEqual(double.get(), 200)
    })
})

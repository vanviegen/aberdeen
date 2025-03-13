describe('The map() and multiMap() methods', () => {
    test('transforms Maps to Maps', () => {
        let store = proxy(objToMap({a: 0, b: 2, c: 3}))
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
        expect([cnt1).toEqual(cnt2], [3, 2])

        store.merge(objToMap({a: 1, c: undefined}))
        passTime()
        assertBody(`"a=10" "b=20"`)
        expect([cnt1).toEqual(cnt2], [4, 3])
    })
    test('transforms Arrays to Objects', () => {
        let store = proxy(['a', 'b'])
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

        expect(out.peek()).toEqual(objToMap({a: 0, b: 1}))
        assertBody(`"b=1" "a=0"`)
        expect([cnt1).toEqual(cnt2], [2, 2])

        store(0).set('A')
        store.push('c')
        passTime()
        expect(store.peek()).toEqual(['A', 'b', 'c'])
        expect(out.peek()).toEqual(objToMap({A: 0, b: 1, c: 2}))
        assertBody(`"c=2" "b=1" "A=0"`)
        expect([cnt1).toEqual(cnt2], [4, 4])
    })
    test('transforms Objects to Maps', () => {
        let store = proxy({a: {a:[]}, b: new Map([[1,2], [3,4]]), c: {c:5}, d: {}, e: 123})
        let cnt1 = 0
        let out

        observe(() => {
            out = store.multiMap(s => {
                cnt1++
                return s.get()
            })
        })

        expect(out.peek()).toEqual(new Map([['a',[]], [1,2], [3,4], ['c',5]]))
        expect(cnt1).toEqual(5)

        store('b').delete()
        store('a').set({})
        passTime()
        expect(out.peek()).toEqual(new Map([['c',5]]))
        expect(cnt1).toEqual(6)
    })
    test('preserves the input collection type', () => {
        let store = proxy([3, 7])
		let mapped = store.map(x => x.get()+1)
        
        expect(mapped.get()).toEqual([4, 8])

        store.set({x: 3, y: 7})
        passTime()
        expect(mapped.get()).toEqual({x: 4, y: 8})

        store.set(new Map([['x', 3], ['y', 7]]))
        passTime()
        expect(mapped.get()).toEqual(new Map([['x', 4], ['y', 8]]))
    })

    test('derives', () => {
        const store = proxy(21)
        const double = store.derive(v => v*2)
        expect(double.get()).toEqual(42)
        store.set(100)
        passTime()
        expect(double.get()).toEqual(200)
    })
})

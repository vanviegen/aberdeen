describe('The map() and multiMap() methods', () => {
    it('transforms Maps to Maps', () => {
        let store = new Store(objToMap({a: 0, b: 2, c: 3}))
        let cnt1 = 0, cnt2 = 0

        mount(document.body, () => {
            let out = store.map(s => {
                cnt1++
                if (s.get()) return s.get()*10
            })

            out.onEach(s => {
                cnt2++
                $('~', s.index()+"="+s.get())
            }, s => s.index())
        })

        assertBody(`"b=20" "c=30"`)
        assertEqual([cnt1, cnt2], [3, 2])

        store.merge(objToMap({a: 1, c: undefined}))
        passTime()
        assertBody(`"a=10" "b=20"`)
        assertEqual([cnt1, cnt2], [4, 3])
    })
    it('transforms Arrays to Objects', () => {
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
                $('~', s.index()+'='+s.get())
            }, s => -s.get())
        })

        assertEqual(out.peek(), objToMap({a: 0, b: 1}))
        assertBody(`"b=1" "a=0"`)
        assertEqual([cnt1, cnt2], [2, 2])

        store.set(0, 'A')
        store.push('c')
        passTime()
        assertEqual(store.peek(), ['A', 'b', 'c'])
        assertEqual(out.peek(), objToMap({A: 0, b: 1, c: 2}))
        assertBody(`"c=2" "b=1" "A=0"`)
        assertEqual([cnt1, cnt2], [4, 4])
    })
    it('transforms Objects to Maps', () => {
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

        store.delete('b')
        store.set('a', {})
        passTime()
        assertEqual(out.peek(), new Map([['c',5]]))
        assertEqual(cnt1, 6)
    })
})

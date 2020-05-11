describe('Scope', () => {
    it('rerenders only the inner scope', () => {
        let store = new Store('before')
        let cnt1 = 0, cnt2 = 0
        mount(document.body, () => {
            node('a', () => {
                cnt1++
                node('span', () => {
                    cnt2++
                    text(store.get())
                })
            })
        })
        assertBody(`a{span{"before"}}`)
        store.set("after")
        assertBody(`a{span{"before"}}`)
        passTime()
        assertBody(`a{span{"after"}}`)
        assertEqual(cnt1,1)
        assertEqual(cnt2,2)
    })


    it('adds and removes elements', () => {
        let store = new Store(false)
        
        let cnt1 = 0, cnt2 = 0
        mount(document.body, () => {
            cnt1++
            node('a', () => {
                cnt2++
                if (store.get()) node('i')
            })
        })

        assertBody(`a{}`)

        for(let val in [true,false,true,false]) {
            store.set(val)
            passTime()
            assertBody(val ? `a{i{}}` : `a{}`)
        }
        assertEqual(cnt1,1)
        assertEqual(cnt2,5)
    })

    it('refreshes standalone scope()s', () => {
        let store = new Store(false)
        
        let cnt1 = 0, cnt2 = 0
        mount(document.body, () => {
            cnt1++
            node('a')
            scope(() => {
                cnt2++
                if (store.get()) node('i')
            })
        })

        assertBody(`a{}`)

        for(let val of [true,false,true,false]) {
            store.set(val)
            passTime()
            assertBody(val ? `a{} i{}` : `a{}`)
        }
        assertEqual(cnt1,1)
        assertEqual(cnt2,5)
    })

    it('uses scope()s as reference for DOM insertion', () => {
        let store1 = new Store(false)
        let store2 = new Store(false)
        
        let cnt0 = 0, cnt1 = 0, cnt2 = 0
        mount(document.body, () => {
            cnt0++
            node('i')
            scope(() => {
                cnt1++
                store1.get() && node('a')
            })
            scope(() => {
                cnt2++
                store2.get() && node('b')
            })
            node('p')
        })

        assertBody(`i{} p{}`)

        for(let [val1,val2] of [[false,true],[false,false],[true,false],[true,true],[false,false],[true,true]]) {
            store1.set(val1)
            store2.set(val2)
            passTime()
            assertBody(`i{} ${val1?'a{} ':''}${val2?'b{} ':''}p{}`)
        }
        assertEqual(cnt0,1)
        assertEqual(cnt1,4)
        assertEqual(cnt2,6)
    })

    it('insert at right position with an empty parent scope', () => {
        mount(document.body, () => {
            node('a')
            scope(() => {
                scope(() => {
                    node('b')
                })
            })
        })
        assertBody(`a{} b{}`)
    })

    it('refrains from rerendering dead scopes', () => {
        let cnts = [0,0,0,0]
        let store = new Store('a')
        mount(document.body, () => {
            cnts[0]++
            scope(() => {
                cnts[1]++
                scope(() => {
                    cnts[2]++
                    if (store.get()==='b') return
                    scope(() => {
                        cnts[3]++
                        store.get()
                    })
                })
            })
        })
        assertEqual(cnts, [1,1,1,1])
        store.set('b')
        assertEqual(cnts, [1,1,1,1])
        passTime()
        assertEqual(cnts, [1,1,2,1])
    })

    it('inserts higher priority updates', () => {
        let store = new Store({})
        let pcnt = 0, ccnt = 0
        mount(document.body, () => {
            pcnt++
            if (store.make('parent').get()) return
            
            node('a', () => {
                ccnt++
                if (store.make('children').get()) {
                    store.merge({parent: true})
                }
            })
            node('b', () => {
                ccnt++
                if (store.make('children').get()) {
                    store.merge({parent: true})
                }
            })
        })
        assertBody(`a{} b{}`)

        store.set({children: true})
        passTime()
        assertBody(``)
        assertEqual(pcnt, 2)
        assertEqual(ccnt, 3) // only a *or* b should have executed a second time, triggering parent

    })

})
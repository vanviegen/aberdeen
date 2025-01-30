describe('Property', function() {
    it('Sets and unsets classes', () => {
        let cnt1 = 0, cnt2 = 0, cnt3 = 0
        let classObj = new Store({".a": false, ".b": true, ".c": undefined})
        mount(document.body, () => {
            cnt1++
            $('div', () => {
                cnt2++
                observe(() => {
                    cnt3++
                    $(classObj.get())
                })
            })
        })

        passTime()
        assertBody(`div.b`)

        classObj.merge({".a": true, ".d": true})
        passTime()
        assertBody(`div.a.b.d`)

        classObj.merge({".a": null}) // Removed from div
        classObj('.b').delete() // Won't disappear
        passTime()
        assertBody(`div.b.d`)

        assertEqual([cnt1,cnt2,cnt3], [1,1,3])
    })

    it('Defines and removes event listeners', () => {
        let store = new Store(true)
        let el;
        let myFunc = ()=>{}
        mount(document.body, () => {
            $('div', () => {
                el = getParentElement()
                if (store.get()) $({click: myFunc})
            })
        })

        passTime()
        assertEqual(el.events, {click: new Set([myFunc])})

        store.set(false)
        passTime()
        assertEqual(el.events, {click: new Set()})
    })

    it('Styles elements', () => {
        const colorStore = new Store('blue')
        let count = 0
        mount(document.body, () => {
            count++
            $('.', {
                $margin: 10+'px',
                $padding: null, // ignore
                $border: false, // ignore as well
                $height: undefined, // again, ignore
                $backgroundColor: 'red',
                $color: colorStore
            })
        })

        passTime()
        assertBody(`div{backgroundColor:red color:blue margin:10px}`)

        colorStore.set('orange')
        passTime()
        assertBody(`div{backgroundColor:red color:orange margin:10px}`)

        assertEqual(count, 1)

    })
})

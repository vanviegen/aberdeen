describe('Props', function() {
    it('Sets and unsets classes', () => {
        let cnt1 = 0, cnt2 = 0, cnt3 = 0
        let classObj = new Store({a: false, b: true, c: undefined})
        mount(document.body, () => {
            cnt1++
            node('div', () => {
                cnt2++
                observe(() => {
                    cnt3++
                    prop({class: classObj.get()})
                })
            })
        })

        passTime()
        assertBody(`div{@class="b"}`)

        classObj.merge({a: true, d: true})
        passTime()
        assertBody(`div{@class="a b d"}`)

        classObj.merge({a: null}) // Removed from div
        classObj.delete('b') // Won't disappear
        passTime()
        assertBody(`div{@class="b d"}`)

        assertEqual([cnt1,cnt2,cnt3], [1,1,3])
    })

    it('Defines and removes event listeners', () => {
        let store = new Store(true)
        let el;
        let myFunc = ()=>{}
        mount(document.body, () => {
            node('div', () => {
                el = getParentElement()
                if (store.get()) prop({click: myFunc})
            })
        })

        passTime()
        assertEqual(el.events, {click: new Set([myFunc])})

        store.set(false)
        passTime()
        assertEqual(el.events, {click: new Set()})
    })
})

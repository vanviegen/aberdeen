describe('Immediate observe', function() {

    it('runs immediately', () => {
        let store = new Store({a: 1})
        let count = 0
        immediateObserve(() => {
            store.set('b', store.get('a') * 2)
            count++
        })
        assertEqual(store.get('b'), 2)
        assertEqual(count, 1)

        store.set('a', 3)
        assertEqual(store.get('b'), 6)
        assertEqual(count, 2)

        passTime() // shouldn't change anything
        assertEqual(store.get('b'), 6)
        assertEqual(count, 2)
    });

    it('stabilizes dependent values', () => {
        let store = new Store({num: 1})
        immediateObserve(() => { // num to str
            let num = store.get("num")
            if (typeof num === 'number') {
                store.set('str', "x".repeat(num))
            } else {
                store.set('num', 0) // will call this observer recursively
            }
        })
        immediateObserve(() => {  // str to num
            let str = store.get('str')
            if (typeof str === 'string') {
                store.set('str', "x".repeat(str.length)) // replace str chars by 'x'
                store.set('num', str.length) // may call this observer recursively
            } else {
                store.set('str', "") // will call this observer recursively
            }
        })
        assertEqual(store.get(), {num: 1, str: 'x'})

        store.set('num', 3)
        assertEqual(store.get(), {num: 3, str: 'xxx'})

        store.set('num', '')
        assertEqual(store.get(), {num: 0, str: ''})

        store.set('str', 'af123')
        assertEqual(store.get(), {num: 5, str: 'xxxxx'})
    })

    it('stops when it goes out of scope', () => {
        let store = new Store({a: 1})
        observe(() => {
            if (store.get('stop')) return
            immediateObserve(() => {
                store.set('b', store.get('a') * 2)
            })
        })
        assertEqual(store.get('b'), 2)

        store.set('a', 3)
        assertEqual(store.get('b'), 6)

        store.set('stop', true)
        passTime() // allow the deferred observe to rerun, expiring the immediate observe

        store.set('a', 5)
        assertEqual(store.get('b'), 6)
    })

    it('throws an error if a loop does not stabilize', () => {
        let store = new Store({a: 1})
        immediateObserve(() => {
            store.set('b', store.get('a') + 1)
        })
        // This will start an infinite recursion, which should be broken up.
        assertRenderError('recursive updates', () => {
            immediateObserve(() => { 
                store.set('a', store.get('b') + 1)
            })
        })
    })
})

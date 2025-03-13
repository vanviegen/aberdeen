function captureOnError(message, func, showMsg=true) {
    let lastErr
    setErrorHandler(err => {lastErr = err; return showMsg; })
    func()
    setErrorHandler()
    assert(lastErr, 'onError not called')
    assertContains(lastErr.toString(), message)
}

describe('Immediate observe', function() {

    test('runs immediately', () => {
        let store = proxy({a: 1})
        let count = 0
        immediateObserve(() => {
            store('b').set(store('a').get() * 2)
            count++
        })
        expect(store('b').get()).toEqual(2)
        expect(count).toEqual(1)

        store('a').set(3)
        expect(store('b').get()).toEqual(6)
        expect(count).toEqual(2)

        passTime() // shouldn't change anything
        expect(store('b').get()).toEqual(6)
        expect(count).toEqual(2)
    });

    test('stabilizes dependent values', () => {
        let store = proxy({num: 1})
        immediateObserve(() => { // num to str
            let num = store('num').get()
            if (typeof num === 'number') {
                store('str').set("x".repeat(num))
            } else {
                store('num').set(0) // will call this observer recursively
            }
        })
        immediateObserve(() => {  // str to num
            let str = store('str').get()
            if (typeof str === 'string') {
                store('str').set("x".repeat(str.length)) // replace str chars by 'x'
                store('num').set(str.length) // may call this observer recursively
            } else {
                store('str').set("") // will call this observer recursively
            }
        })
        expect(store.get()).toEqual({num: 1, str: 'x'})

        store('num').set(3)
        expect(store.get()).toEqual({num: 3, str: 'xxx'})

        store('num').set('')
        expect(store.get()).toEqual({num: 0, str: ''})

        store('str').set('af123')
        expect(store.get()).toEqual({num: 5, str: 'xxxxx'})
    })

    test('stops when it goes out of scope', () => {
        let store = proxy({a: 1})
        observe(() => {
            if (store('stop').get()) return
            immediateObserve(() => {
                store('b').set(store('a').get() * 2)
            })
        })
        expect(store('b').get()).toEqual(2)

        store('a').set(3)
        expect(store('b').get()).toEqual(6)

        store('stop').set(true)
        passTime() // allow the deferred observe to rerun, expiring the immediate observe

        store('a').set(5)
        expect(store('b').get()).toEqual(6)
    })

    test('throws an error if a loop does not stabilize', () => {
        let store = proxy({a: 1})
        immediateObserve(() => {
            store('b').set(store('a').get() + 1)
        })
        captureOnError('recursive updates', () => {
            // This will start an infinite recursion, which should be broken up.
            immediateObserve(() => { 
                store('a').set(store('b').get() + 1)
            })
        })
    })
})

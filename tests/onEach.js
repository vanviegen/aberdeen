describe('onEach', function() {

    it('ignores undefined values', () => {
        let cnt = 0
        mount(document.body, () => {
            let store = new Store()
            store.onEach(() => cnt++)
        })
        assertEqual(cnt, 0)
    })

    it('handles unsuitable store values', () => {
        for(let value of [3, "", false, []]) {
            let cnt = 0
            mount(document.body, () => {
                let store = new Store(value)
                assertThrow(`onEach() attempted`, () => {
                    store.onEach(() => cnt++)
                })

            })
            assertEqual(cnt, 0, "cnt mismatch for "+JSON.stringify(value))
        }
    })

    it('does nothing for an empty map', () => {
        let cnt = 0
        mount(document.body, () => {
            let store = new Store({})
            store.onEach(function() {
                cnt++
            })
        })
        assertEqual(cnt, 0)
    })


    it('emits a single entry', () => {
        let result = []
        mount(document.body, () => {
            let store = new Store({x: 3})
            store.onEach(function(store) {
                result.push([store.index(),store.get()])
            })
        })
        assertEqual(result, [['x', 3]])
    })

    it('emits multiple entries', () => {
        let result = []
        mount(document.body, () => {
            let store = new Store({x: 3, y: 4, z: 5})
            store.onEach(function(store) {
                result.push([store.index(),store.get()])
            })
            // The order is undefined, so we'll sort it
            result.sort((a,b) => a[1] - b[1])
        })
        assertEqual(result, [['x', 3], ['y', 4], ['z', 5]])
    })

    it('adds a single item to the DOM', () => {
        mount(document.body, () => {
            let store = new Store({x: 3})
            store.onEach(function(store) {
                node('p', {className: store.index()}, store.getNumber())
            })
        })
        assertBody(`p{@class="x" "3"}`)
    })

    it('adds multiple items to the DOM in default order', () => {
        mount(document.body, () => {
            let store = new Store({c: 3, a: 1, b: 2})
            store.onEach(function(store) {
                node('p', store.index())
            })
        })
        assertBody(`p{"a"} p{"b"} p{"c"}`)
    })

    it('maintains the last-element marker', () => {
        mount(document.body, () => {
            let store = new Store({c: 3, a: 1, b: 2})
            store.onEach(function(store) {
                node('p', store.index())
            })
            node('div')
        })
        assertBody(`p{"a"} p{"b"} p{"c"} div{}`)
    })
})

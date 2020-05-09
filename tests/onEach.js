describe('onEach', function() {

    it('ignores undefined values', () => {
        mount(document.body, () => {
            let store = new Store()
            let cnt = 0
            store.onEach(() => cnt++)
            assertEqual(cnt, 0)
        })
    })

    it('handles unsuitable store values', () => {
        for(let value of [3, "", false, []]) {
            mount(document.body, () => {
                let store = new Store(value)

                let cnt = 0
                assertThrow(`onEach() attempted`, () => {
                    store.onEach(() => cnt++)
                })

                assertEqual(cnt, 0, "cnt mismatch for "+JSON.stringify(value))
            })
        }
    })

    it('does nothing for an empty map', () => {
        mount(document.body, () => {
            let store = new Store({})
            let cnt = 0
            store.onEach(function() {
                cnt++
            })
            assertEqual(cnt, 0)
        })
    })


    it.skip('emits a single entry', () => {
        mount(document.body, () => {
            let store = new Store({x: 3})
            let result = []
            store.onEach(function(value,key) {
                result.push([key,value])
            })
            assertEqual(result, [['x', 3]])
        })
    })
})

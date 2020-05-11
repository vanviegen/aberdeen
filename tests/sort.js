describe('Sort', () => {
    it('uses custom sort orders', () => {
        let store = new Store({
            c: {x: 2, y: 2, z: -2},
            a: {x: 5, y: 2, z: -500000},
            b: {x: 5, y: 1, z: 3},
            e: {x: 'a', y: 2, z: 5},
            d: {x: 2, y: 2, z: +500000},
        })

        let sort = new Store()

        let p = 0, c = 0
        mount(document.body, () => {
            p++
            store.onEach(item => {
                c++
                node(item.index())
            }, sort.get())
        })

        assertBody(`a{} b{} c{} d{} e{}`)

        sort.set(item => item.ref('z').getNumber())
        passTime()
        assertBody(`a{} c{} b{} e{} d{}`)

        sort.set(item => [item.ref('x').get(), item.ref('y').getNumber(), item.index()] )
        passTime()
        assertBody(`e{} c{} d{} b{} a{}`)
    })
})

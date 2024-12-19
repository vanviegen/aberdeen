describe('Create event', function() {

    it('does not apply on initial rendering', () => {
        let store = new Store(true)
        mount(document.body, () => {
            $`b create=y`
        })
        assertBody(`b{}`)
    })

    it('works at top-level', () => {
        let store = new Store(false)
        mount(document.body, () => {
            if (store.get()) $`b create=y`
        })

        assertBody(``)

        store.set(true)
        // Assert before temporary class removal
        setTimeout(() => assertBody(`b{@class="y"}`), 0)
        passTime(0)
        assertBody(`b{}`)
    })

    it('does not apply when it is part of a larger whole newly rendered', () => {
        let store = new Store(false)
        mount(document.body, () => {
            if (store.get()) $`b`(() => {
                $`c create=y`
            })
        })

        assertBody(``)

        store.set(true)
        // Assert before temporary class removal
        setTimeout(() => assertBody(`b{c{}}`), 0)
        passTime(0)
        assertBody(`b{c{}}`)
    })

    it('works in an onEach', () => {
        let store = new Store([])
        mount(document.body, () => {
            store.onEach(item => {
                $`${item.get()} create=y`
            })
        })

        store.set(['a', undefined, 'c'])
        // Assert before temporary class removal
        setTimeout(() => assertBody(`a{@class="y"} c{@class="y"}`), 0)
        passTime(0)
        assertBody(`a{} c{}`)
    })

    it('performs a grow animation', () => {
        let store = new Store(false)
        mount(document.body, () => {
            $`div display:flex`(() => {
                if (store.get()) $`a create=${grow}`
            })
        })

        assertBody(`div{:display="flex"}`)

        store.set(true)
        passTime(0)
        assert(getBody().startsWith('div{:display="flex" a{'))
        assert(getBody().indexOf('transition') >= 0)

        passTime(2000)
        assertBody(`div{:display="flex" a{}}`)
    })

    it('aborts a grow animation', () => {
        let store = new Store(false)
        mount(document.body, () => {
            if (store.get()) {
                $`a create=${grow}`
                store.set(false)
            }
        })

        assertBody(``)

        store.set(true) // Naughty render function sets this back to false
        passTime()
        assertBody(``)
    })
})

describe('Create event', function() {

    it('does not apply on initial rendering', () => {
        let store = new Store(true)
		testMount(() => {
            node('b', {create: 'y'})
		})
        
		assertBody(`b{}`)
    });

    it('works at top-level', () => {
        let store = new Store(false)
		testMount(() => {
            if (store.get()) node('b', {create: 'y'})
		})
        
		assertBody(``)

        store.set(true)
        // We'll do this in a setTimeout 0, so that the assert can be done before the temporary class is removed in a later setTimeout 0.
		setTimeout(() => assertBody(`b{@class="y"}`), 0)
        passTime(0)
		assertBody(`b{}`)
    });

    it('does not apply when it is part of a larger whole newly rendered', () => {
        let store = new Store(false)
		testMount(() => {
            if (store.get()) node('b', () => node('c', {create: 'y'}))
		})
        
		assertBody(``)

        store.set(true)
        // We do the assert in a setTimeout 0, so it's performed before the temporary class is removed in a later setTimeout 0.
		setTimeout(() => assertBody(`b{c{}}`), 0)
        passTime(0)
		assertBody(`b{c{}}`)
    });

    it('works in an onEach', () => {
        let store = new Store([])
		testMount(() => {
            store.onEach(item => {
                node(item.get(), {create: "y"})
            })
		})

        store.set(['a', undefined, 'c'])
        // We do the assert in a setTimeout 0, so it's performed before the temporary class is removed in a later setTimeout 0.
		setTimeout(() => assertBody(`a{@class="y"} c{@class="y"}`), 0)
        passTime(0)
		assertBody(`a{} c{}`)
    });

    it('performs a grow animation', () => {
        let store = new Store(false)
        testMount(() => {
            node('div', {style: {display: 'flex'}}, () => {
                if (store.get()) node('a', {create: grow})
            })
        })

        assertBody(`div{:display="flex"}`)
        
        store.set(true)
        passTime(0)
        assert(getBody().startsWith('div{:display="flex" a{'))
        assert(getBody().indexOf('transition')>=0)

        passTime(2000)
        assertBody(`div{:display="flex" a{}}`)
    })

    it('aborts a grow animation', () => {
        let store = new Store(false)
        testMount(() => {
            if (store.get()) {
                node('a', {create: grow})
                store.set(false)
            }
        })

        assertBody(``)
        
        store.set(true) // Naughty render function will set this back to false

        passTime()
        assertBody(``)
    })
})

describe('Create event', function() {

    test('does not apply on initial rendering', () => {
        let store = proxy(true)
		mount(document.body, () => {
            $('b', {create: 'y'})
		})
        
		assertBody(`b`)
    });

    test('works at top-level', async () => {
        let store = proxy(false)
		mount(document.body, () => {
            if (store.get()) $('b', {create: 'y'})
		})
        
		assertBody(``)
        assertDomUpdates({new: 0, changed: 0})

        store.set(true)
        await asyncPassTime(0)
        // We don't have a good way to know if the class has been set and immediately
        // removed, so we'll just look at the number of changes, which would have
        // been 1 (just inserting the newly created DOM element) without the
        // create-transition.
        assertDomUpdates({new: 1, changed: 3})

		assertBody(`b`)
    });

    test('does not apply when it is part of a larger whole newly rendered', async () => {
        let store = proxy(false)
		mount(document.body, () => {
            if (store.get()) $('b', () => $('c', {create: 'y'}))
		})
        
		assertBody(``)

        store.set(true)
        await asyncPassTime(0)
        // We don't have a good way to know if the class has been set and immediately
        // removed, so we'll just look at the number of changes, which would have
        // been 4 (2 $ insert + 1 class add + 1 class remove) with the
        // create-transition.
        assertDomUpdates({new: 2, changed: 2}) // 2 new $s, 2 $ inserts 

        assertBody(`b{c}`)
    });

    test('works in an onEach', async () => {
        let store = proxy([])
		mount(document.body, () => {
            store.onEach(item => {
                $(item.get(), {create: "y"})
            })
		})

        store.set(['a', undefined, 'c'])
        await asyncPassTime(0)

        // We don't have a good way to know if the class has been set and immediately
        // removed, so we'll just look at the number of changes, which would have
        // been 2 (just inserting the newly created DOM elements) without the
        // create-transition.
        assertDomUpdates({new: 2, changed: 6})

		assertBody(`a c`)
    });

    test('performs a grow animation', async() => {
        let store = proxy(false)
        mount(document.body, () => {
            $('div', {$display: 'flex'}, () => {
                if (store.get()) $('a', {create: grow})
            })
        })

        assertBody(`div{display:flex}`)
        
        store.set(true)
        await asyncPassTime(0)

        assert(getBody().startsWith('div{display:flex a{'))
        assert(getBody().indexOf('transition')>=0)

        await asyncPassTime(2000)
        assertBody(`div{display:flex a}`)
    })

    test('aborts a grow animation', () => {
        let store = proxy(false)
        mount(document.body, () => {
            if (store.get()) {
                $('a', {create: grow})
                store.set(false)
            }
        })

        assertBody(``)
        
        store.set(true) // Naughty render function will set this back to false

        passTime()
        assertBody(``)
    })
})

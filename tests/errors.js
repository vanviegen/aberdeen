describe('Error handling', () => {
	it('continues rendering after an error', () => {
        let error = new Store(false)
        mount(document.body, () => {
            $`a`(() => {
                $`b`
                if (error.get()) {
                    throw Error('FakeError')
                }
                $`c`
            })
            $`d`
        })
        passTime()
		assertBody(`a{b{} c{}} d{}`)
        error.set(true)
        assertRenderError('FakeError', passTime)
        assertBody(`a{b{} div{@class="aberdeen-error" "Error"}} d{}`)
    })

    it('throws when doing DOM operations outside of mount', () => {
		let ops = [
			() => $`div`,
			() => $`text=hi`,
            () => getParentElement(),
		]
		for(let op of ops) {
			assertThrow('outside of a mount', op)
		}
        assertThrow(() => clean(() => "test"))

		observe(() => {
			for(let op of ops) {
				assertThrow('outside of a mount', op)
			} 
		})
	})

    it('continue rendering after an error in onEach', () => {
        let store = new Store(['a','b','c'])
        assertRenderError(() => {
            mount(document.body, () => {
                store.onEach(item => {
                    if (item.index() % 2) noSuchFunction()
                    $`text=${item.get()}`
                })
            })
        })
        assertBody(`"a" div{@class="aberdeen-error" "Error"} "c"`)

        store.push('d')
        store.push('e')
        assertRenderError(passTime)
        assertBody(`"a" div{@class="aberdeen-error" "Error"} "c" div{@class="aberdeen-error" "Error"} "e"`)
    })

    it('continue rendering after an error in onEach sort', () => {
        let store = new Store(['a','b','c'])
        assertRenderError(() => {
            mount(document.body, () => {
                store.onEach(item => {
                    $`text=${item.get()}`
                }, item => {
                    if (item.index() % 2) noSuchFunction()
                    return -item.index()
                })
            })
        })
        assertBody(`"c" "a"`)

        store.push('d')
        store.push('e')
        assertRenderError(passTime)
        assertBody(`"e" "c" "a"`)
    })

    it('throws when indexing a non-indexable type', () => {
        let store = new Store(3)
        assertThrow('Value 3 is not a collection', () => store.ref('a'))
        assertThrow('Value 3 is not a collection', () => store.makeRef('a'))
    })

    it('throws when onEach() is invoked wrong', () => {
        let store1 = new Store()
        let store2 = new Store()
        assertThrow('Operation not permitted outside', () => store1.onEach(item => {}))
        store1.set(5)
        observe(() => {
            assertThrow('neither a collection nor undefined', () => store1.onEach(item => {}))
            assertThrow('function as its last argument', () => store1.onEach())

            store2.onEach('a', 3, true, item => {
                assert(false, "Should not be invoked")
            })
        })
        passTime()
    })

    it('throws when passing invalid Store arguments', () => {
        assertThrow('1st parameter should be an ObsCollection', () => new Store(3, true))
    })

    it('breaks up long update->observe recursions', () => {
        let store = new Store({a: 0, b: 0})
        observe(() => {
            store.set('a', store.get('b') + 1)
        })
        observe(() => {
            store.set('b', store.get('a') + 1)
        })
        assertRenderError('recursive', passTime)
    })

    it('refuses to render a node outside a mount', () => {
        assertThrow("outside of a mount", () => $`a`)
        assertThrow("outside of a mount", () => $`.x`)
        assertRenderError("outside of a mount", () => observe(() => $`a`))
    })
})

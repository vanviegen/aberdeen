const { scope, mount, Store } = require("./build/aberdeen")

describe('Error handling', () => {
	it('continues rendering after an error', () => {
        let error = new Store(false)
        new Mount(document.body, () => {
            node('a', () => {
                node('b')
                if (error.get()) {
                    throw Error('FakeError')
                }
                node('c')
            })
            node('d')
        })
        passTime()
		assertBody(`a{b{} c{}} d{}`)
        error.set(true)
        assertThrow('FakeError', passTime)
        assertBody(`a{b{}} d{}`)
    })


    it('throws when doing DOM operations outside of mount', () => {
		let ops = [
			() => node('div'),
			() => text('hi'),
			() => prop('hi'),
            () => getParentElement(),
		]
		for(let op of ops) {
			assertThrow('outside of a mount', op)
		}
        assertThrow(() => clean(()=>"test"))

		scope(() => {
			for(let op of ops) {
				assertThrow('outside of a mount', op)
			}	
		})
	})

    it('cannot nest mounts', () => {
        scope(() => {
            assertThrow('cannot be nested', () => new Mount(document.body, ()=>{}))
        })
    })


    it('continue rendering after an error in onEach', () => {
        let store = new Store(['a','b','c'])
        new Mount(document.body, () => {  
            store.onEach(item => {
                if (item.index()%2) noSuchFunction()
                text(item.get())
            })
        })
        assertThrow(passTime)
        assertBody(`"a" "c"`)

        store.push('d')
        store.push('e')
        assertThrow(passTime)
        assertBody(`"a" "c" "e"`)
    })

    it('continue rendering after an error in onEach sort', () => {
        let store = new Store(['a','b','c'])
        new Mount(document.body, () => {  
            store.onEach(item => {
                text(item.get())
            }, item => {
                if (item.index()%2) noSuchFunction()
                return -item.index()
            })
        })
        assertThrow(passTime)
        assertBody(`"c" "a"`)

        store.push('d')
        store.push('e')
        assertThrow(passTime)
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
        assertThrow('Operation not permitted outside', () => store1.onEach(item=>{}))
        store1.set(5)
        scope(() => {
            assertThrow('neither a collection nor undefined', () => store1.onEach(item=>{}))
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
})

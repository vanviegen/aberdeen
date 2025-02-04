function captureOnError(message, func, showMsg=true) {
    let lastErr
    setErrorHandler(err => {lastErr = err; return showMsg; })
    func()
    setErrorHandler()
    assert(lastErr, 'onError not called')
    assertContains(lastErr.toString(), message)
}

describe('Error handling', () => {
    test('works by default', () => {
        mount(document.body, () => {
            $('a')
            $('b', () => {
                noSuchFunction()
            })
            $('c')
        })
        assertBody(`a b{div.aberdeen-error{"Error"}} c`)
    })

	test('continues rendering after an error', () => {
        let error = new Store(false)
        mount(document.body, () => {
            $('a', () => {
                $('b')
                if (error.get()) {
                    throw Error('FakeError')
                }
                $('c')
            })
            $('d')
        })    
        assertBody(`a{b c} d`)

        captureOnError('FakeError', () => {
            error.set(true)
            passTime()
        })

        assertBody(`a{b div.aberdeen-error{"Error"}} d`)
    })


    test('can disable the default error message', () => {
        captureOnError('FakeError', () => {
            mount(document.body, () => {
                $('a', () => {
                    $('b')
                    throw Error('FakeError')
                })
                $('d')
            })
            passTime()
        }, false)

        assertBody(`a{b} d`)
    })


    test('throws when doing DOM operations outside of mount', () => {
		let ops = [
			() => $('div'),
			() => $({placeholder: 'hi'}),
			() => $({text: 'hi'}),
            () => getParentElement(),
		]
		for(let op of ops) {
			assertThrow('outside of a mount', op)
		}
        assertThrow(() => clean(()=>"test"))

		observe(() => {
			for(let op of ops) {
				assertThrow('outside of a mount', op)
			}	
		})
	})


    test('continue rendering after an error in onEach', () => {
        let store = new Store(['a','b','c'])
        captureOnError('noSuchFunction', () => {
            mount(document.body, () => {
                store.onEach(item => {
                    if (item.index()%2) noSuchFunction()
                    $({text: item.get()})
                })
            })
            passTime()
        }, false)
        assertBody(`"a" "c"`)

        store.push('d')
        store.push('e')
        captureOnError('noSuchFunction', passTime, false)
        assertBody(`"a" "c" "e"`)
    })

    test('continue rendering after an error in onEach sort', () => {
        let store = new Store(['a','b','c'])
        captureOnError('noSuchFunction', () => {
            mount(document.body, () => {
                store.onEach(item => {
                    $({text: item.get()})
                }, item => {
                    if (item.index()%2) noSuchFunction()
                    return -item.index()
                })
            })
            passTime()
        })
        assertBody(`"c" "a"`)

        store.push('d')
        store.push('e')
        captureOnError('noSuchFunction', passTime)
        assertBody(`"e" "c" "a"`)
    })

    test('throws when indexing a non-indexable type', () => {
        let store = new Store(3)
        assertThrow('found 3 at index 0 instead of', () => store('a').get())
        assertThrow('found 3 at index 0 instead of', () => store('a').set(5))
    })

    test('throws when onEach() is invoked wrong', () => {
        let store1 = new Store()
        let store2 = new Store()
        store1.set(5)
        observe(() => {
            assertThrow('neither a collection nor undefined', () => store1.onEach(item=>{}))
            store2('a', 3, true).onEach(item => {
                assert(false, "Should not be invoked")
            })
        })
        passTime()
    })

    test('throws when passing invalid Store arguments', () => {
        assertThrow('1st parameter should be an ObsCollection', () => new Store(3, true))
    })

    test('breaks up long update->observe recursions', () => {
        let store = new Store({a: 0, b: 0})
        observe(() => {
            store('a').set(store('b').get()+1)
        })
        observe(() => {
            store('b').set(store('a').get()+1)
        })
        captureOnError('recursive', passTime)
    })
})

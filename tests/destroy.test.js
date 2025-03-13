describe('Destroy event', function() {
	test('works for simple deletes', () => {
        let store = proxy(true)
		mount(document.body, () => {
            if (store.get()) $('b', {destroy: "x"})
            else $('c', {destroy: "x"})
		})
		assertBody(`b`)
        expect(getCounts()).toEqual({new: 1, change: 1})

        store.set(false)
        passTime(1)
		assertBody(`c b.x`)
        expect(getCounts()).toEqual({new: 2, change: 3})

        passTime(5000)
		assertBody(`c`)
        expect(getCounts()).toEqual({new: 2, change: 4})
    });

	test('inserts before deleted item', () => {
        let store = proxy(['a'])
		mount(document.body, () => {
            store.onEach(v => {
                $(v.get(), {destroy: "x"})
            })
		})

        store.set([undefined])
        passTime(1)
		assertBody(`a.x`)

        store.set(['b'])
        passTime(1)
		assertBody(`b a.x`)

        passTime(2000)
		assertBody(`b`)
    });

	test('transitions onEach deletes', () => {
        let store = proxy(['a', 'b', 'c'])
		let mnt = mount(document.body, () => {
            store.onEach(v => {
                $(v.get(), {destroy: "x"})
            })
		})
		assertBody(`a b c`)
        expect(getCounts()).toEqual({new: 3, change: 3})

        store(1).set(undefined)
        passTime(1)
		assertBody(`a b.x c`)
        passTime(2000)
		assertBody(`a c`)

        store.set(['a', 'b', 'c', 'd', 'e', 'f'])
        passTime(1)
        store.set([undefined, 'b', undefined, undefined, 'e', undefined])
        passTime(1)
		assertBody(`a.x b c.x d.x e f.x`)
        store.set(['a2', 'b', undefined, 'd2', 'e', 'f2'])
        passTime(1)
		assertBody(`a2 a.x b d2 c.x d.x e f2 f.x`)
        passTime(2000)
		assertBody(`a2 b d2 e f2`)
    })

    test('deletes in the middle of deleting items', () => {
        let store = proxy(['a', 'b', 'c'])
		mount(document.body, () => {
            store.onEach(v => {
                $(v.get(), {destroy: "x"})
            })
		})
        passTime(1)
        assertBody(`a b c`)

        store(2).set(undefined)
        passTime(500)
        assertBody(`a b c.x`)
        store(1).set(undefined)
        passTime(500)
        assertBody(`a b.x c.x`)
        store(0).set(undefined)
        passTime(500)
        assertBody(`a.x b.x c.x`)
        passTime(500)
        assertBody(`a.x b.x`)
        passTime(500)
        assertBody(`a.x`)
        passTime(500)
        assertBody(``)

        store.set([undefined, 'b'])
        passTime(1)
        assertBody(`b`)
    });

    test('aborts deletion transition on higher level removal', () => {
        let store = proxy(['a'])
		mount(document.body, () => {
            store.onEach(v => {
                $(v.get(), {destroy: "x"})
            })
		})
        passTime(1)
        assertBody(`a`)

        store.set([])
        passTime(1)
        assertBody(`a.x`)
        store.set(undefined)
        passTime(2001)
        assertBody(``)

        // what happens when the whole store is removed?
        // the held elements should be removed immediately... are they? and does the timeout then cause havoc?
    });

    test('transitions removal of an entire onEach', () => {
        let store = proxy(['a'])
		mount(document.body, () => {
            store.onEach(v => {
                $(v.get(), {destroy: "x"})
            })
		})
        passTime(1)
        assertBody(`a`)
        store.set(undefined)
        passTime(1000)
        assertBody(`a.x`)
        passTime(1000)
        assertBody(``)
    });

    test('insert new elements after a recently deleted item', () => {
        let store = proxy({b: true, c: false})
		mount(document.body, () => {
            $('a')
            observe(() => {
                if (store('b').get()) $('b', {destroy: 'y'})
                if (store('c').get()) $('c')
            })
		})
        assertBody(`a b`)

        store('b').set(false)
        passTime(1)
        assertBody(`a b.y`)

        passTime(2000)
        assertBody(`a`)

        // This should trigger lazy deletion of the DeletionScope
        store('c').set(true)
        passTime(1)
        assertBody(`a c`)
    })

    test('remove elements before and after a deleting element', () => {
        let store = proxy({a: true, b: true, c: true})
		mount(document.body, () => {
            store.onEach(el => {
                if (el.get()) $(el.index(), el.index()=='b' ? {destroy: 'y'} : null)
            })
		})
        assertBody(`a b c`)

        store('b').set(false)
        passTime(1)
        assertBody(`a b.y c`)

        store('a').set(false)
        passTime(1)
        assertBody(`b.y c`)

        store('c').set(false)
        passTime(1)
        assertBody(`b.y`)

        passTime(2000)
        assertBody(``)
    })

    test('remove middle elements before and after a deleting element', () => {
        let store = proxy({a: true, b: true, c: true, d: true, e: true})
		mount(document.body, () => {
            store.onEach(el => {
                if (el.get()) $(el.index(), el.index()=='c' ? {destroy: 'y'} : null)
            })
		})
        assertBody(`a b c d e`)

        store('c').set(false)
        passTime(1)
        assertBody(`a b c.y d e`)

        store('b').set(false)
        passTime(1)
        assertBody(`a c.y d e`)

        store('d').set(false)
        passTime(1)
        assertBody(`a c.y e`)

        passTime(2000)
        assertBody(`a e`)
    })

    test('remove elements before and after a deleting element', () => {
        let store = proxy({a: true, b: true, c: true})
		mount(document.body, () => {
            store.onEach(el => {
                if (el.get()) $(el.index(), el.index()=='b' ? {destroy: 'y'} : null)
            })
		})
        assertBody(`a b c`)

        store('b').set(false)
        passTime(1)
        assertBody(`a b.y c`)

        store('a').set(false)
        passTime(1)
        assertBody(`b.y c`)

        store('c').set(false)
        passTime(1)
        assertBody(`b.y`)

        passTime(2000)
        assertBody(``)
    })

    test('performs a shrink animation', async() => {
        let store = proxy(true)
        mount(document.body, () => {
            if (store.get()) $('a', {destroy: shrink})
        })

        assertBody(`a`)
        
        store.set(false)
        await asyncPassTime(1)
        assert(getBody().startsWith('a{'))
        assert(getBody().indexOf('scaleY')>=0 && getBody().indexOf('scaleX')<0)
        await asyncPassTime(2000)
        assertBody(``)
    })

    test('performs a horizontal shrink animation', async() => {
        let store = proxy(true)
        mount(document.body, () => {
            $('div', {$display: 'flex', $flexDirection: 'row-reverse'}, () => {
                if (store.get()) $('a', {destroy: shrink})
            })
        })

        assertBody(`div{display:flex flexDirection:row-reverse a}`)
        
        store.set(false)
        await asyncPassTime(1)
        assert(getBody().indexOf('scaleX')>=0 && getBody().indexOf('scaleY')<0)

        await asyncPassTime(2000)
        assertBody(`div{display:flex flexDirection:row-reverse}`)
    })

})

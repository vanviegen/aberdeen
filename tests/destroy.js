describe('Destroy event', function() {
	it('works for simple deletes', () => {
        let store = new Store(true)
		mount(document.body, () => {
            if (store.get()) $`b destroy=x`
            else $`c destroy=x`
		})
		assertBody(`b{}`)
        assertEqual(getCounts(), {new: 1, change: 1})

        store.set(false)
        passTime(1)
		assertBody(`c{} b{@class="x"}`)
        assertEqual(getCounts(), {new: 2, change: 3})

        passTime(5000)
		assertBody(`c{}`)
        assertEqual(getCounts(), {new: 2, change: 4})
    })

	it('inserts before deleted item', () => {
        let store = new Store(['a'])
		mount(document.body, () => {
            store.onEach(v => {
                $`${v.get()} destroy=x`
            })
		})

        store.set([undefined])
        passTime(1)
		assertBody(`a{@class="x"}`)

        store.set(['b'])
        passTime(1)
		assertBody(`b{} a{@class="x"}`)

        passTime(2000)
		assertBody(`b{}`)
    })

	it('transitions onEach deletes', () => {
        let store = new Store(['a', 'b', 'c'])
		let mnt = mount(document.body, () => {
            store.onEach(v => {
                $`${v.get()} destroy=x`
            })
		})
		assertBody(`a{} b{} c{}`)
        assertEqual(getCounts(), {new: 3, change: 3})

        store.set(1, undefined)
        passTime(1)
		assertBody(`a{} b{@class="x"} c{}`)
        passTime(2000)
		assertBody(`a{} c{}`)

        store.set(['a', 'b', 'c', 'd', 'e', 'f'])
        passTime(1)
        store.set([undefined, 'b', undefined, undefined, 'e', undefined])
        passTime(1)
		assertBody(`a{@class="x"} b{} c{@class="x"} d{@class="x"} e{} f{@class="x"}`)
        store.set(['a2', 'b', undefined, 'd2', 'e', 'f2'])
        passTime(1)
		assertBody(`a2{} a{@class="x"} b{} d2{} c{@class="x"} d{@class="x"} e{} f2{} f{@class="x"}`)
        passTime(2000)
		assertBody(`a2{} b{} d2{} e{} f2{}`)
    })

    it('deletes in the middle of deleting items', () => {
        let store = new Store(['a', 'b', 'c'])
		mount(document.body, () => {
            store.onEach(v => {
                $`${v.get()} destroy=x`
            })
		})
        passTime(1)
        assertBody(`a{} b{} c{}`)

        store.set(2, undefined)
        passTime(500)
        assertBody(`a{} b{} c{@class="x"}`)
        store.set(1, undefined)
        passTime(500)
        assertBody(`a{} b{@class="x"} c{@class="x"}`)
        store.set(0, undefined)
        passTime(500)
        assertBody(`a{@class="x"} b{@class="x"} c{@class="x"}`)
        passTime(500)
        assertBody(`a{@class="x"} b{@class="x"}`)
        passTime(500)
        assertBody(`a{@class="x"}`)
        passTime(500)
        assertBody(``)

        store.set([undefined, 'b'])
        passTime(1)
        assertBody(`b{}`)
    })

    it('aborts deletion transition on higher level removal', () => {
        let store = new Store(['a'])
		mount(document.body, () => {
            store.onEach(v => {
                $`${v.get()} destroy=x`
            })
		})
        passTime(1)
        assertBody(`a{}`)

        store.set([])
        passTime(1)
        assertBody(`a{@class="x"}`)
        store.set(undefined)
        passTime(2001)
        assertBody(``)
    })

    it('transitions removal of an entire onEach', () => {
        let store = new Store(['a'])
		mount(document.body, () => {
            store.onEach(v => {
                $`${v.get()} destroy=x`
            })
		})
        passTime(1)
        assertBody(`a{}`)
        store.set(undefined)
        passTime(1000)
        assertBody(`a{@class="x"}`)
        passTime(1000)
        assertBody(``)
    })

    it('insert new elements after a recently deleted item', () => {
        let store = new Store({b: true, c: false})
		mount(document.body, () => {
            $`a`
            observe(() => {
                if (store.get('b')) $`b destroy=y`
                if (store.get('c')) $`c`
            })
		})
        assertBody(`a{} b{}`)

        store.set('b', false)
        passTime(1)
        assertBody(`a{} b{@class="y"}`)

        passTime(2000)
        assertBody(`a{}`)

        store.set('c', true)
        passTime(1)
        assertBody(`a{} c{}`)
    })

    it('performs a shrink animation', () => {
        let store = new Store(true)
        mount(document.body, () => {
            if (store.get()) $`a destroy=${shrink}`
        })

        assertBody(`a{}`)
        
        store.set(false)
        passTime(1)
        assert(getBody().startsWith('a{'))
        assert(getBody().indexOf('scaleY')>=0 && getBody().indexOf('scaleX')<0)
        passTime(2000)
        assertBody(``)
    })

    it('performs a horizontal shrink animation', () => {
        let store = new Store(true)
        mount(document.body, () => {
            $`div display:flex flexDirection:row-reverse`(() => {
                if (store.get()) $`a destroy=${shrink}`
            })
        })

        assertBody(`div{:display="flex" :flexDirection="row-reverse" a{}}`)
        
        store.set(false)
        passTime(1)
        assert(getBody().indexOf('scaleX')>=0 && getBody().indexOf('scaleY')<0)

        passTime(2000)
        assertBody(`div{:display="flex" :flexDirection="row-reverse"}`)
    })
})

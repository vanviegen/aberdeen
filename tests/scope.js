describe('Scope', () => {
	it('rerenders only the inner scope', () => {
		let store = new Store('before')
		let cnt1 = 0, cnt2 = 0
		mount(document.body, () => {
			$('a', () => {
				cnt1++
				$('span', () => {
					cnt2++
					$(":" + store.get())
				})
			})
		})
		assertBody(`a{span{"before"}}`)
		store.set("after")
		assertBody(`a{span{"before"}}`)
		passTime()
		assertBody(`a{span{"after"}}`)
		assertEqual(cnt1,1)
		assertEqual(cnt2,2)
	})

	it('adds and removes elements', () => {
		let store = new Store(false)
		
		let cnt1 = 0, cnt2 = 0
		mount(document.body, () => {
			cnt1++
			$('a', () => {
				cnt2++
				if (store.get()) $('i')
			})
		})

		assertBody(`a`)

		for(let val in [true,false,true,false]) {
			store.set(val)
			passTime()
			assertBody(val ? `a{i}` : `a`)
		}
		assertEqual(cnt1,1)
		assertEqual(cnt2,5)
	})

	it('refreshes standalone observe()s', () => {
		let store = new Store(false)
		
		let cnt1 = 0, cnt2 = 0
		mount(document.body, () => {
			cnt1++
			$('a')
			observe(() => {
				cnt2++
				if (store.get()) $('i')
			})
		})

		assertBody(`a`)

		for(let val of [true,false,true,false]) {
			store.set(val)
			passTime()
			assertBody(val ? `a i` : `a`)
		}
		assertEqual(cnt1,1)
		assertEqual(cnt2,5)
	})

	it('uses observe()s as reference for DOM insertion', () => {
		let store1 = new Store(false)
		let store2 = new Store(false)
		
		let cnt0 = 0, cnt1 = 0, cnt2 = 0
		mount(document.body, () => {
			cnt0++
			$('i')
			observe(() => {
				cnt1++
				store1.get() && $('a')
			})
			observe(() => {
				cnt2++
				store2.get() && $('b')
			})
			$('p')
		})

		assertBody(`i p`)

		for(let [val1,val2] of [[false,true],[false,false],[true,false],[true,true],[false,false],[true,true]]) {
			store1.set(val1)
			store2.set(val2)
			passTime()
			assertBody(`i ${val1?'a ':''}${val2?'b ':''}p`)
		}
		assertEqual(cnt0,1)
		assertEqual(cnt1,4)
		assertEqual(cnt2,6)
	})

	it('insert at right position with an empty parent scope', () => {
		mount(document.body, () => {
			$('a')
			observe(() => {
				observe(() => {
					$('b')
				})
			})
		})
		assertBody(`a b`)
	})

	it('can use $ like observe', () => {
		mount(document.body, () => {
			$('a')
			$(() => {
				$(() => {
					$('b')
				})
			})
		})
		assertBody(`a b`)
	})

	it('refrains from rerendering dead scopes', () => {
		let cnts = [0,0,0,0]
		let store = new Store('a')
		mount(document.body, () => {
			cnts[0]++
			observe(() => {
				cnts[1]++
				observe(() => {
					cnts[2]++
					if (store.get()==='b') return
					observe(() => {
						cnts[3]++
						store.get()
					})
				})
			})
		})
		assertEqual(cnts, [1,1,1,1])
		store.set('b')
		assertEqual(cnts, [1,1,1,1])
		passTime()
		assertEqual(cnts, [1,1,2,1])
	})

	it('inserts higher priority updates', () => {
		let parent = new Store()
		let children = new Store()
		let pcnt = 0, ccnt = 0
		mount(document.body, () => {
			pcnt++
			if (parent.get()) return
			
			$('a', () => {
				ccnt++
				if (children.get()) {
					parent.set(true)
				}
			})
			$('b', () => {
				ccnt++
				if (children.get()) {
					parent.set(true)
				}
			})
		})
		assertBody(`a b`)

		children.set(true)
		passTime()
		assertBody(``)
		assertEqual(pcnt, 2)
		assertEqual(ccnt, 3) // only a *or* b should have executed a second time, triggering parent
	})

	it('does not rerender on peek', () => {
		let store = new Store('before')
		let cnt1 = 0, cnt2 = 0
		mount(document.body, () => {
			$('a', () => {
				cnt1++
				$('span', () => {
					cnt2++
					$(":" + peek(() => store.get()))
					$(":" + store.peek())
				})
			})
		})
		assertBody(`a{span{"before" "before"}}`)
		store.set("after")
		passTime()
		assertBody(`a{span{"before" "before"}}`)
		assertEqual(cnt1,1)
		assertEqual(cnt2,1)
	})

	it('emits for objects with numeric get() paths', () => {
		let values = new Store({})

		mount(document.body, () => {
			for(let i=0; i<4; i++) {
				$('p', () => {
					$({text: values(i).get()})
				})
			}
		})
		assertBody(`p p p p`)

		values.set({1:'x', 3:'x'})
		passTime()
		assertBody(`p p{"x"} p p{"x"}`)
	})

	it('allows modifying stores from within scopes', () => {
		let cnt0 = 0, cnt1 = 0, cnt2 = 0, cnt3 = 0;
		let store = new Store({})
		let inverse = new Store({})

		let myMount = mount(document.body, () => {
			cnt0++
			store.onEach(item => {
				let key = item.get()
				let value = item.index()
				inverse(key).set(value)
				cnt1++
				clean(() => {
					inverse(key).delete()
					cnt2++
				})
			})

			inverse.onEach(item => {
				$(":" + item.index()+"="+item.get())
				cnt3++
			})
		})

		passTime()
		assertBody(``)
		assertEqual([cnt0,cnt1,cnt2,cnt3], [1,0,0,0])
		
		store(1).set('b')
		passTime()
		assertBody(`"b=1"`)
		assertEqual([cnt0,cnt1,cnt2,cnt3], [1,1,0,1])

		store(2).set('a')
		passTime()
		assertBody(`"a=2" "b=1"`)
		assertEqual([cnt0,cnt1,cnt2,cnt3], [1,2,0,2])

		store(3).set('c')
		passTime()
		assertBody(`"a=2" "b=1" "c=3"`)
		assertEqual([cnt0,cnt1,cnt2,cnt3], [1,3,0,3])

		store(3).set('d')
		passTime()
		assertBody(`"a=2" "b=1" "d=3"`)
		assertEqual([cnt0,cnt1,cnt2,cnt3], [1,4,1,4])

		store(1).delete()
		passTime()
		assertBody(`"a=2" "d=3"`)
		assertEqual([cnt0,cnt1,cnt2,cnt3], [1,4,2,4])

		unmount()
		assertBody(``)
		assertEqual([cnt0,cnt1,cnt2,cnt3], [1,4,4,4])
	})
})
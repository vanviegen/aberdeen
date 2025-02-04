describe('Array', () => {
	test('fires higher-scope isEmpty before getting to content', () => {
		let store = new Store(['a'])
		let cnt1 = 0, cnt2 = 0
		mount(document.body, () => {
			cnt1++
			if (!store.isEmpty()) {
				$('div', () => {
					cnt2++;
					$({text: store(0).get()})
				})
			}
		})
		assertBody(`div{"a"}`)

		store(0).set('b')
		passTime();
		assertBody(`div{"b"}`)
		assertEqual([cnt1,cnt2], [1,2])

		store.delete(0);
		passTime()
		assertBody(``)
		assertEqual([cnt1,cnt2], [2,2])
	})

	test('reactively get() full array', () => {
		let store = new Store([3, 4, new Store([5, 6])])
		mount(document.body, () => {
			$({text: JSON.stringify(store.get())})
			$({text: JSON.stringify(store.get(1)[2].get())})
		})
		passTime()
		assertBody(`"[3,4,[5,6]]" "[5,6]"`)

		store.push(7)
		store(2).push(8)
		passTime()
		assertBody(`"[3,4,[5,6,8],7]" "[5,6,8]"`)

		assertEqual(store(6).get(), undefined)
		assertEqual(store(6, 'a').get(), undefined)
	})

	test('handles invalid indexes', () => {
		let store = new Store(["a","b","c"])
		for(let index of [-1, 1000000, "1", 0.5]) {
			assertThrow('Invalid array index', () => store(index).set("test"))
		}

		assertEqual(store("1").get(), "b")
		assertThrow("Invalid array index", () => store('a').get())
		assertThrow("Invalid array index", () => store(true).get())
	})

	test('merges', () => {
		let cnt1 = 0, cnt2 = 0
		let store = new Store([1,undefined,3])
		mount(document.body, () => {
			cnt1++
			store.onEach(item => {
				cnt2++
				$('div:'+item.get())
			})
		})

		assertBody(`div{"1"} div{"3"}`)
		assertEqual([cnt1, cnt2], [1,2])

		store(1).set(2)
		passTime()
		assertBody(`div{"1"} div{"2"} div{"3"}`)
		assertEqual([cnt1, cnt2], [1,3])

		// Merging just replace the entire array
		store.merge([1,"two"])
		passTime()
		assertBody(`div{"1"} div{"two"}`)
		assertEqual([cnt1, cnt2], [1,4])

		store(9).set('ten')
		passTime()
		assertBody(`div{"1"} div{"two"} div{"ten"}`)
		assertEqual([cnt1, cnt2], [1,5])

		store(4).set('five')
		passTime()
		assertBody(`div{"1"} div{"two"} div{"five"} div{"ten"}`)
		assertEqual([cnt1, cnt2], [1,6])

		store(1).delete()
		passTime()
		assertBody(`div{"1"} div{"five"} div{"ten"}`)
		assertEqual([cnt1, cnt2], [1,6])

		store(9).delete()
		store.push("six")
		assertEqual(store(5).get(), "six")
		passTime()
		assertBody(`div{"1"} div{"five"} div{"six"}`)
		assertEqual([cnt1, cnt2], [1,7])

		store.set([1, undefined, 3])
		passTime()
		assertBody(`div{"1"} div{"3"}`)
		assertEqual([cnt1, cnt2], [1,8])
		
	})
})

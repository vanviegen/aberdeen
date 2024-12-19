describe('Array', () => {
	it('fires higher-scope isEmpty before getting to content', () => {
		let store = new Store(['a'])
		let cnt1 = 0, cnt2 = 0
		mount(document.body, () => {
			cnt1++
			if (!store.isEmpty()) {
				$`div`(() => {
					cnt2++;
					$`text=${store.get(0)}`
				})
			}
		})
		assertBody(`div{"a"}`)

		store.set(0, 'b')
		passTime();
		assertBody(`div{"b"}`)
		assertEqual([cnt1,cnt2], [1,2])

		store.delete(0);
		passTime()
		assertBody(``)
		assertEqual([cnt1,cnt2], [2,2])
	})

	it('reactively get() full array', () => {
		let store = new Store([3, 4, new Store([5, 6])])
		mount(document.body, () => {
			$('~', JSON.stringify(store.get()))
			$('~', JSON.stringify(store.query({depth: 1})[2].get()))
		})
		passTime()
		assertBody(`"[3,4,[5,6]]" "[5,6]"`)

		store.push(7)
		store.ref(2).push(8)
		passTime()
		assertBody(`"[3,4,[5,6,8],7]" "[5,6,8]"`)

		assertEqual(store.get(6), undefined)
		assertEqual(store.get(6, 'a'), undefined)
	})

	it('handles invalid indexes', () => {
		let store = new Store(["a","b","c"])
		for(let index in [-1, 1000000, "1", 0.5]) {
			assertThrow('Invalid array index', () => store.set(index, "test"))
		}

		assertEqual(store.get("1"), "b")
		assertThrow("Invalid array index", () => store.get('a'))
		assertThrow("Invalid array index", () => store.get(true))
	})

	it('merges', () => {
		let cnt1 = 0, cnt2 = 0
		let store = new Store([1,undefined,3])
		mount(document.body, () => {
			cnt1++
			store.onEach(item => {
				cnt2++
				$`div ~${item.get()}`
			})
		})

		assertBody(`div{"1"} div{"3"}`)
		assertEqual([cnt1, cnt2], [1,2])

		store.set(1, 2)
		passTime()
		assertBody(`div{"1"} div{"2"} div{"3"}`)
		assertEqual([cnt1, cnt2], [1,3])

		// Merging just replace the entire array
		store.merge([1,"two"])
		passTime()
		assertBody(`div{"1"} div{"two"}`)
		assertEqual([cnt1, cnt2], [1,4])

		store.set(9,'ten')
		passTime()
		assertBody(`div{"1"} div{"two"} div{"ten"}`)
		assertEqual([cnt1, cnt2], [1,5])

		store.set(4, 'five')
		passTime()
		assertBody(`div{"1"} div{"two"} div{"five"} div{"ten"}`)
		assertEqual([cnt1, cnt2], [1,6])

		store.delete(1)
		passTime()
		assertBody(`div{"1"} div{"five"} div{"ten"}`)
		assertEqual([cnt1, cnt2], [1,6])

		store.delete(9)
		store.push("six")
		assertEqual(store.get(5), "six")
		passTime()
		assertBody(`div{"1"} div{"five"} div{"six"}`)
		assertEqual([cnt1, cnt2], [1,7])

		store.set([1, undefined, 3])
		passTime()
		assertBody(`div{"1"} div{"3"}`)
		assertEqual([cnt1, cnt2], [1,8])
		
	})
})

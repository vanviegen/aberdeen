describe('Browsers', () => {
	it('works without Array.from', () => {
		let oldFrom = Array.from
		Array.from = undefined
		
		let store = new Store(false)
		let cnt = 0
		new Mount(document.body, () => {
			cnt++
			if (store.get()) node('a')
		})
		assertBody(``)


		store.set(true)
		passTime()
		assertBody(`a{}`)
		assertEqual(cnt, 2)

		Array.from = oldFrom
	})
})

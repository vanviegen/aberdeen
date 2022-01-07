describe('Array', () => {
	it('fires higher-scope isEmpty before getting to content', () => {
		let store = new Store(['a'])
		let cnt1 = 0, cnt2 = 0
		mount(document.body, () => {
			cnt1++
			if (!store.isEmpty()) {
				node('div', () => {
					cnt2++;
					text(store.get(0))
				})
			}
		})
		assertBody(`div{"a"}`)

		store.set(0, 'b')
		passTime();
		assertBody(`div{"b"}`)
		assertEqual(cnt1, 1)
		assertEqual(cnt2, 2)

		store.delete(0);
		passTime()
		assertBody(``)
		assertEqual(cnt1, 2)
		assertEqual(cnt2, 2)
	})
})

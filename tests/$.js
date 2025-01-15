describe('$', function() {
	it('creates nested nodes', () => {
		mount(document.body, () => {
			$`a b.cls c x=y`
			$("a b.cls c x=y")
		})
		assertBody(`a{b{@class="cls" c{@x="y"}}} a{b{@class="cls" c{@x="y"}}}`)
	});
	it('handles quoted arguments', () => {
		mount(document.body, () => {
			$`input placeholder="a b c"`
			$`text="d e f"`
		})
		assertBody(`input{@placeholder="a b c"} "d e f"`)
	})
	it('reactively modifies attributes that have stores as values', () => {
		let cnt = 0
		let store = new Store('initial')
		mount(document.body, () => {
			cnt++
			$`input placeholder=${store}`
			$`div text=${store}`
			$`p color:${store}`
		})
		assertBody(`input{@placeholder="initial"} div{"initial"} p{style="color: initial;"}`)
		assertEqual(cnt, 1)

		store.set('modified')
		passTime()
		assertBody(`input{@placeholder="modified"} div{"modified"} p{style="color: red;"}`)
		assertEqual(cnt, 1)
	})
});

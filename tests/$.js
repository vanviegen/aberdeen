describe('$', function() {
	it('creates nested nodes', () => {
		mount(document.body, $ => {
			$('a b.cls c x=y')
		})
		assertBody(`a{b{@class="cls" c{@x="y"}}}`)
	});
	it('handles quoted arguments', $ => {
		mount(document.body, () => {
			$('input placeholder="a b c"')
			$('text="d e f"')
		})
		assertBody(`input{@placeholder="a b c"} "d e f"`)
	})
});

const { prop, unmountAll } = require("./build/aberdeen");

describe('Value binding', function() {
	it('binds input values', () => {
		let store = new Store('test')
		let inputElement;
		new Mount(document.body, () => {
			node('input', store, () => {
				inputElement = getParentElement()
				prop('class', {correct: store.get().length >= 5})
			})
		})
		assertBody(`input{@class="" value="test"}`)

		inputElement.value = "testx"
		inputElement.event("input")
		passTime()

		assertBody(`input{@class="correct" value="testx"}`)
	})

	it('binds checkboxes', () => {
		let store = new Store(true)
		let inputElement;
		new Mount(document.body, () => {
			node('input', {type: 'checkbox'}, store, () => {
				inputElement = getParentElement()
			})
		})
		assertBody(`input{@type="checkbox" checked=true}`)

		inputElement.checked = false
		inputElement.event("input")
		passTime()

		assertBody(`input{@type="checkbox" checked=false}`)
	})

	it('binds radio buttons', () => {
		let store = new Store('woman')
		let inputElement1, inputElement2;
		new Mount(document.body, () => {
			node('input', {type: 'radio', name: 'gender', value: 'man'}, store, () => {
				inputElement1 = getParentElement()
			})
			node('input', {type: 'radio', name: 'gender', value: 'woman'}, store, () => {
				inputElement2 = getParentElement()
			})
		})
		assertBody(`input{@name="gender" @type="radio" checked=false value="man"} input{@name="gender" @type="radio" checked=true value="woman"}`)

		inputElement1.checked = true
		inputElement1.event("input")
		inputElement2.checked = false
		inputElement2.event("input")
		passTime()

		assertEqual(store.get(), 'man')
	})

})

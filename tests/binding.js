describe('Value binding', function() {
	it('binds input values', () => {
		let store = new Store('test')
		let inputElement;
		mount(document.body, () => {
			node('input', store, () => {
				inputElement = getParentElement()
				prop('class', {correct: store.get().length >= 5})
			})
		})
		assertBody(`input{value="test"}`)

		inputElement.value = "testx"
		inputElement.event("input")
		passTime()

		assertBody(`input{@class="correct" value="testx"}`)
	})

	it('binds checkboxes', () => {
		let store = new Store(true)
		let inputElement;
		mount(document.body, () => {
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
		mount(document.body, () => {
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

	it('reads initial value when Store is undefined', () => {
		let store = new Store({})
		mount(document.body, () => {
			node('input', {value: 'a'}, store.ref('input'))
			node('input', {type: 'checkbox', checked: true}, store.ref('checkbox'))
			node('input', {type: 'radio', name: 'abc', value: 'x', checked: false}, store.ref('radio'))
			node('input', {type: 'radio', name: 'abc', value: 'y', checked: true}, store.ref('radio'))
			node('input', {type: 'radio', name: 'abc', value: 'z', checked: false}, store.ref('radio'))
		})
		assertEqual(store.get(), {input: 'a', checkbox: true, radio: 'y'})
	})

	it('changes DOM when Store value is updated', () => {
		let store = new Store("test")
		let toggle = new Store(true)
		mount(document.body, () => {
			node('input', store)
			node('input', {type: 'checkbox'}, toggle)
		})
		assertBody(`input{value="test"} input{@type="checkbox" checked=true}`)

		store.set("changed")
		toggle.set(false)
		passTime()
		assertBody(`input{value="changed"} input{@type="checkbox" checked=false}`)
	})

	it('returns numbers for number/range typed inputs', () => {
		let store = new Store("")
		let inputElement;
		mount(document.body, () => {
			node('input', {type: 'number'}, store, () => {
				inputElement = getParentElement()
			})
		})
		assertBody(`input{@type="number" value=""}`)

		inputElement.value = "123"
		inputElement.event("input")
		passTime()
		assertEqual(store.get(), 123)

		inputElement.value = ""
		inputElement.event("input")
		passTime()
		assertEqual(store.get(), null)
	})
})

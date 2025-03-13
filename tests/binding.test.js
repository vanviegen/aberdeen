describe('Value binding', function() {
	test('binds input values', () => {
		let store = proxy('test')
		let inputElement;
		mount(document.body, () => {
			$('input', {bind: store}, () => {
				inputElement = getParentElement()
				$({".correct": store.get().length >= 5})
			})
		})
		assertBody(`input{value->test}`)

		inputElement.value = "testx"
		inputElement.event("input")
		passTime()

		assertBody(`input.correct{value->testx}`)
	})

	test('binds checkboxes', () => {
		let store = proxy(true)
		let inputElement;
		mount(document.body, () => {
			$('input', {type: 'checkbox', bind: store}, () => {
				inputElement = getParentElement()
			})
		})
		assertBody(`input{type=checkbox checked->true}`)

		inputElement.checked = false
		inputElement.event("input")
		passTime()

		assertBody(`input{type=checkbox checked->false}`)
	})

	test('binds radio buttons', () => {
		let store = proxy('woman')
		let inputElement1, inputElement2;
		mount(document.body, () => {
			$('input', {type: 'radio', name: 'gender', value: 'man', bind: store}, () => {
				inputElement1 = getParentElement()
			})
			$('input', {type: 'radio', name: 'gender', value: 'woman', bind: store}, () => {
				inputElement2 = getParentElement()
			})
		})
		assertBody(`input{name=gender type=radio checked->false value->man} input{name=gender type=radio checked->true value->woman}`)

		inputElement1.checked = true
		inputElement1.event("input")
		inputElement2.checked = false
		inputElement2.event("input")
		passTime()

		expect(store.get()).toEqual('man')
	})

	test('reads initial value when Store is undefined', () => {
		let store = proxy({})
		mount(document.body, () => {
			$('input', {value: 'a', bind: store('input')})
			$('input', {type: 'checkbox', checked: true, bind: store('checkbox')})
			$('input', {type: 'radio', name: 'abc', value: 'x', checked: false, bind: store('radio')})
			$('input', {type: 'radio', name: 'abc', value: 'y', checked: true, bind: store('radio')})
			$('input', {type: 'radio', name: 'abc', value: 'z', checked: false, bind: store('radio')})
		})
		expect(store.get()).toEqual({input: 'a', checkbox: true, radio: 'y'})
	})

	test('changes DOM when Store value is updated', () => {
		let store = proxy("test")
		let toggle = proxy(true)
		mount(document.body, () => {
			$('input', {bind: store})
			$('input', {type: 'checkbox', bind: toggle})
		})
		assertBody(`input{value->test} input{type=checkbox checked->true}`)

		store.set("changed")
		toggle.set(false)
		passTime()
		assertBody(`input{value->changed} input{type=checkbox checked->false}`)
	})

	test('returns numbers for number/range typed inputs', () => {
		let store = proxy("")
		let inputElement;
		mount(document.body, () => {
			$('input', {type: 'number', bind: store}, () => {
				inputElement = getParentElement()
			})
		})
		assertBody(`input{type=number value->""}`)

		inputElement.value = "123"
		inputElement.event("input")
		passTime()
		expect(store.get()).toEqual(123)

		inputElement.value = ""
		inputElement.event("input")
		passTime()
		expect(store.get()).toEqual(null)
	})

	test('only works on Stores', () => {
		mount(document.body, () => {
			$('input', {bind: null}) // Does nothing
			assertThrow("Unexpect bind", () => $('input', {bind: false}))
		})
	})
})

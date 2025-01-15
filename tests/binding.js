describe('Value binding', function() {
	it('binds input values', () => {
		let store = new Store('test');
		let inputElement;
		mount(document.body, () => {
			$`input bind=${store}`(() => {
				inputElement = getParentElement();
				$('.', {correct: store.get().length >= 5})
			});
		});
		assertBody(`input{value="test"}`);

		inputElement.value = "testx";
		inputElement.event("input");
		passTime();

		assertBody(`input{@class="correct" value="testx"}`);
	});

	it('binds checkboxes', () => {
		let store = new Store(true);
		let inputElement;
		mount(document.body, () => {
			$`input type=checkbox bind=${store}`(() => {
				inputElement = getParentElement();
			});
		});
		assertBody(`input{@type="checkbox" checked=true}`);

		inputElement.checked = false;
		inputElement.event("input");
		passTime();

		assertBody(`input{@type="checkbox" checked=false}`);
	});

	it('binds radio buttons', () => {
		let store = new Store('woman');
		let inputElement1, inputElement2;
		mount(document.body, () => {
			$`input type=radio name=gender value=man bind=${store}`(() => {
				inputElement1 = getParentElement();
			});
			$`input type=radio name=gender value=woman bind=${store}`(() => {
				inputElement2 = getParentElement();
			});
		});
		assertBody(`input{@name="gender" @type="radio" checked=false value="man"} input{@name="gender" @type="radio" checked=true value="woman"}`);

		inputElement1.checked = true;
		inputElement1.event("input");
		inputElement2.checked = false;
		inputElement2.event("input");
		passTime();

		assertEqual(store.get(), 'man');
	});

	it('reads initial value when Store is undefined', () => {
		let store = new Store({});
		mount(document.body, () => {
			$`input value=a bind=${store.ref('input')}`;
			$`input type=checkbox checked=${true} bind=${store.ref('checkbox')}`;
			$`input type=radio name=abc value=x bind=${store.ref('radio')}`;
			$`input type=radio name=abc value=y checked=${true} bind=${store.ref('radio')}`;
			$`input type=radio name=abc value=z bind=${store.ref('radio')}`;
		});
		assertEqual(store.get(), {input: 'a', checkbox: true, radio: 'y'});
	});

	it('changes DOM when Store value is updated', () => {
		let store = new Store("test");
		let toggle = new Store(true);
		mount(document.body, () => {
			$`input bind=${store}`;
			$`input type=checkbox bind=${toggle}`;
		});
		assertBody(`input{value="test"} input{@type="checkbox" checked=true}`);

		store.set("changed");
		toggle.set(false);
		passTime();
		assertBody(`input{value="changed"} input{@type="checkbox" checked=false}`);
	});

	it('returns numbers for number/range typed inputs', () => {
		let store = new Store("");
		let inputElement;
		mount(document.body, () => {
			$`input type=number bind=${store}`(() => {
				inputElement = getParentElement();
			});
		});
		assertBody(`input{@type="number" value=""}`);

		inputElement.value = "123";
		inputElement.event("input");
		passTime();
		assertEqual(store.get(), 123);

		inputElement.value = "";
		inputElement.event("input");
		passTime();
		assertEqual(store.get(), null);
	});
});

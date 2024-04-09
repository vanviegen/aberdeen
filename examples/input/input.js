import {node, Store, mount, text} from 'https://cdn.jsdelivr.net/npm/aberdeen@0.0/+esm'

const store = new Store({
	name: 'John Doe',
	age: 23,
	gender: 'w',
	active: true,
	vehicle: 'car',
	bio: 'John was born on an unknown date at an unknown place, far away.\n\nHis main claim to fame is showing up out of nowhere.',
	color: '#00fa9a',
})

mount(document.body, () => {
	node('input', {placeholder: 'Name'}, store.ref('name'))
	node('input', {type: 'number', placeholder: 'Age'}, store.ref('age'))
	node('label', () => {
		node('input', {type: 'checkbox'}, store.ref('active'))
		text('Active member')
	})
	node('select', () => {
		node('option', {value: "m"}, "Man")
		node('option', {value: "w"}, "Woman")
		node('option', {value: "n"}, "Non-binary")
	}, store.ref('gender'))
	
	node('fieldset', () => {
		const vehicles = {plane: 'Plane', car: 'Car', bike: 'Bicycle', none: 'None'}
		for(let id in vehicles) {
			node('label', () => {
				node('input', {type: 'radio', name: 'vehicle', value: id}, store.ref('vehicle'))
				text(vehicles[id])
			})
		}
	})
	
	node('textarea', {placeholder: "Biography"}, store.ref('bio'))
	
	node('label', () => {
		node('input', {type: 'color'}, store.ref('color'))
		text('Favorite color')
	})
	
	node('input', {type: 'range', min: 50, max: 230}, store.ref('height'))
	
	node('input', {type: 'date'}, store.ref('first_day'))
	
	node('pre', () => {
		text(JSON.stringify(store.get(), undefined, 4))
	})
})




import {node, Store, mount, text, observe, grow, shrink} from 'https://cdn.jsdelivr.net/npm/aberdeen/+esm'

const store = new Store({
	name: 'John Doe',
	age: 23,
	gender: 'w',
	active: false,
	vehicle: 'car',
	bio: 'John was born on an unknown date at an unknown location.\n\nHis main claim to fame is showing up out of nowhere.',
	color: '#00fa9a',
})

mount(document.body, () => {
	node('h2', () => {
		text((store.get('name') || "Nobody") + "'s biography")
	})
	node('input', store.ref('name'))
	node('input', {type: 'number', placeholder: 'Age'}, store.ref('age'))
	node('label', () => {
		node('input', {type: 'checkbox'}, store.ref('active'))
		text('Active member')
	})
	observe(() => {
		if (store.get('active')) node('input', {type: 'number', placeholder: 'Member id', create: grow, destroy: shrink}, store.ref('member_id'))
		else store.delete('member_id')
	})
	node('select', () => {
		node('option', {value: "m"}, "Man")
		node('option', {value: "w"}, "Woman")
		node('option', {value: "o"}, "Other..")
	}, store.ref('gender'))

	observe(() => {
		if (store.get('gender')==='o') node('input', {placeholder: 'Specify gender', create: grow, destroy: shrink}, store.ref('gender_other'))
		else store.delete('gender_other')
	})
	
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




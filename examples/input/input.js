import {$, Store, mount} from '../../dist/aberdeen.js'
import {grow, shrink} from '../../dist/transitions.js'

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
	$('h2', () => {
		$({text: (store('name').get() || "Nobody") + "'s biography"})
	})
	$('input', {bind: store('name')})
	$('input', {type: 'number', placeholder: 'Age', bind: store('age')})
	$('label', () => {
		$('input', {type: 'checkbox', bind: store('active')})
		$(':Active member')
	})
	$(() => {
		if (store('active').get()) $('input', {type: 'number', placeholder: 'Member id', create: grow, destroy: shrink, bind: store('member_id')})
		else store('member_id').delete()
	})
	$('select', () => {
		$('option:Man', {value: "m"})
		$('option:Woman', {value: "w"})
		$('option:Other', {value: "o"})
	}, {bind: store('gender')})

	$(() => {
		if (store('gender').get()==='o') $('input', {placeholder: 'Specify gender', create: grow, destroy: shrink, bind: store('gender_other')})
		else store('gender_other').delete()
	})
	
	$('fieldset', () => {
		const vehicles = {plane: 'Plane', car: 'Car', bike: 'Bicycle', none: 'None'}
		for(let id in vehicles) {
			$('label', () => {
				$('input', {type: 'radio', name: 'vehicle', value: id, bind: store('vehicle')})
				$({text: vehicles[id]})
			})
		}
	})
	
	$('textarea', {placeholder: "Biography", bind: store('bio')})
	
	$('label', () => {
		$('input', {type: 'color', bind: store('color')})
		$(':Favorite color')
	})
	
	$('input', {type: 'range', min: 50, max: 230, bind: store('height')})
	
	$('input', {type: 'date', bind: store('first_day')})
	
	$('pre', () => {
		$({text: JSON.stringify(store.get(), undefined, 4)})
	})
})




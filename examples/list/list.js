import {$, mount, Store} from '../../dist/aberdeen.js';

const items = new Store([])
const orderIndex = new Store(0)
const search = new Store("")

const makeWord = () => Math.random().toString(36).substring(2, 12).replace(/[0-9]+/g, '').replace(/^\w/, c => c.toUpperCase());

const COLUMN_NAMES= ["First name", "Last name", "Age", "Gender", "City"]

const addItems = (count) => {
	for(let i=0; i<count; i++) {
		items.push([
			makeWord(),
			makeWord(),
			0 | (Math.random() * 99),
			Math.random()<0.5 ? 'male' : 'female',
			makeWord()
		])
	}
}

addItems(100)
 
mount(document.body, () => {
	$('button:Add 10', {click: () => addItems(10)})
	$('button:Add 100', {click: () => addItems(100)})
	$('button:Add 1000', {click: () => addItems(1000)})
	$('input', {placeholder: 'Search first name', autofocus: true, bind: search})
	$('table.game', () => {
		$('tr', () => {
			for(let i=0; i<COLUMN_NAMES.length; i++) {
				$('th', {text: COLUMN_NAMES[i], click: () => orderIndex.set(i)})
			}
		})
		items.onEach(item => {
			$('tr', () => {
				item.onEach(field => {
					$('td', {text: field})
				})
				$('td:⌫', {click: () => item.set()})
			})
		}, item => item(0).get().toLowerCase().startsWith(search.get().toLowerCase()) ? item(orderIndex.get()).get() : undefined)
	})
})

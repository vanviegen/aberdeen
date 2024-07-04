import {node, prop, mount, Store, text} from 'https://cdn.jsdelivr.net/npm/aberdeen/+esm';

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
	node('button', 'Add 10', {click: () => addItems(10)})
	node('button', 'Add 100', {click: () => addItems(100)})
	node('button', 'Add 1000', {click: () => addItems(1000)})
	node('input', {placeholder: 'Search first name', autofocus: true}, search)
	node('table.game', () => {
		node('tr', () => {
			for(let i=0; i<COLUMN_NAMES.length; i++) {
				node('th', COLUMN_NAMES[i], {click: () => orderIndex.set(i)})
			}
		})
		items.onEach(item => {
			node('tr', () => {
				item.onEach(field => {
					node('td', () => {
						text(field.get())
					})
				})
				node('td', '⌫', {click: () => item.set()})
			})
		}, item => item.get(0).toLowerCase().startsWith(search.get().toLowerCase()) ? item.get(orderIndex.get()) : undefined)
	})
})

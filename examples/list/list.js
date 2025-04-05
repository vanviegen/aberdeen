import { $, proxy, observe, onEach, set, ref } from '../../dist/aberdeen.js';

// Create observable data structures using proxy
const items = proxy([]);
const orderIndex = proxy(0);
const search = proxy("");

const makeWord = () => Math.random().toString(36).substring(2, 12).replace(/[0-9]+/g, '').replace(/^\w/, c => c.toUpperCase());
const COLUMN_NAMES = ["First name", "Last name", "Age", "Gender", "City"];

const addItems = (count) => {
    for (let i = 0; i < count; i++) {
        items.push([
            makeWord(),
            makeWord(),
            0 | (Math.random() * 99),
            Math.random() < 0.5 ? 'male' : 'female',
            makeWord()
        ]);
    }
};

addItems(100);

// By default, html elements are added to the <body>:
$('button:Add 10', { click: () => addItems(10) });
$('button:Add 100', { click: () => addItems(100) });
$('button:Add 1000', { click: () => addItems(1000) });
$('input', { placeholder: 'Search first name', autofocus: true, bind: ref(search, 'value') });

$('table.game', () => {
	$('tr', () => {
		for (let i = 0; i < COLUMN_NAMES.length; i++) {
			$('th', {click: () => orderIndex.value = i}, () => {
				// Show triangle when we're sorting by this column
				$(':' + COLUMN_NAMES[i] + (orderIndex.value === i ? ' ▼' : ''));
			});
		}
	});

	// TODO: allow onEach to *move* HTML elements.
	// Hmm, this would require a separate subscription for the sort key function and the renderer.. i think?
	// Would that be worth it? It *is* quite common that not the whole rendering changes...
	
	// onEach now takes the proxied array, a render function, and an optional sort key function
	// orderIndex.value
	onEach(items, (item, index) => {
		$('tr', () => {
			// Nested onEach for each field in the item
			onEach(item, (field) => {
				$('td', { text: field });
			});
			
			$('td:⌫', { 
				click: () => {
					// Remove the item from the array
					items.splice(index, 1);
				}
			});
		});
	}, (item) => {
		// Filter and sort based on search and orderIndex
		return item[0].toLowerCase().startsWith(search.value.toLowerCase()) 
			? item[orderIndex.value] 
			: undefined;
	});
});

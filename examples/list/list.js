import { $, proxy, onEach, ref, insertCss } from '../../dist/aberdeen.js';

// Create observable data structures using proxy
const items = proxy([]);
const orderIndex = proxy(0);
const search = proxy("");
const animate = proxy(false);

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
$('button#Add 10', { click: () => addItems(10) });
$('button#Add 100', { click: () => addItems(100) });
$('button#Add 1000', { click: () => addItems(1000) });
$('input', { placeholder: 'Search first name', autofocus: true, bind: ref(search, 'value') });
$('label', () => {
	$('input', {type: 'checkbox', bind: animate});
	$("#Animate");
});

const gameStyle = insertCss({
	display: 'grid',
	gridTemplateColumns: 'repeat(6, 1fr)',
	".row": {
		display: "contents",
		"> *": {
			transition: 'height 1s, opacity 0.5s 1s',
			height: "20px",
			overflow: "hidden",
		},
		'&.hidden > *': {
			display: "none",
		},
		"&.header": {
			fontWeight: "bold",
		},
	}
})

const animateStyle = insertCss({
	'.row.hidden > *': {
		display: "initial",
		height: 0,
		opacity: 0.4,
		transition: 'opacity 0.5s, height 1s 0.5s',
	},
});


$('div', gameStyle, {[animateStyle]: animate}, () => {
	$('div.row.header', () => {
		for (let i = 0; i < COLUMN_NAMES.length; i++) {
			$('div', {click: () => orderIndex.value = i}, () => {
				// Show triangle when we're sorting by this column
				$('#', COLUMN_NAMES[i] + (orderIndex.value === i ? ' ▼' : ''));
			});
		}
		$('div#Delete')
	});

	// The second argument is the render function, the third argument returns the
	// order key (or undefined if we don't need to run render).
	onEach(items, (item, index) => {
		$('div.row', () => {

			// Nested onEach for each field in the item
			onEach(item, (field) => {
				$('div', { text: field });
			});
			
			$('div#⌫', { 
				click: () => {
					// Remove the item from the array
					delete items[index];
				}
			});

			$(() => {
				$({".hidden": !item[0].toLowerCase().includes(search.value.toLowerCase())})
			})
		})
	}, (item) => item[orderIndex.value]);
});

import A from '../../dist/aberdeen.js';

// Create observable data structures using A.proxy
const items = A.proxy([]);
const orderIndex = A.proxy(0);
const search = A.proxy("");
const animate = A.proxy(false);

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
A('button#Add 10', { click: () => addItems(10) });
A('button#Add 100', { click: () => addItems(100) });
A('button#Add 1000', { click: () => addItems(1000) });
A('input', { placeholder: 'Search first name', autofocus: true, bind: A.ref(search, 'value') });
A('label', () => {
	A('input', {type: 'checkbox', bind: animate});
	A("#Animate");
});

const gameStyle = A.insertCss({
	'&': 'display:grid gridTemplateColumns:repeat(6, 1fr)',
	".row": {
		'&': 'display:contents',
		"> *": 'transition:"height 1s, opacity 0.5s 1s" height:20px overflow:hidden',
		'&.hidden > *': 'display:none',
		"&.header": 'fontWeight:bold',
	}
})

const animateStyle = A.insertCss({
	'.row.hidden > *': 'display:initial height:0 opacity:0.4 transition:"opacity 0.5s, height 1s 0.5s"',
});


A('div', gameStyle, {[animateStyle]: animate}, () => {
	A('div.row.header', () => {
		for (let i = 0; i < COLUMN_NAMES.length; i++) {
			A('div', {click: () => orderIndex.value = i}, () => {
				// Show triangle when we're sorting by this column
				A('#', COLUMN_NAMES[i] + (orderIndex.value === i ? ' ▼' : ''));
			});
		}
		A('div#Delete')
	});

	// The second argument is the render function, the third argument returns the
	// order key (or undefined if we don't need to run render).
	A.onEach(items, (item, index) => {
		A('div.row', () => {

			// Nested A.onEach for each field in the item
			A.onEach(item, (field) => {
				A('div', { text: field });
			});
			
			A('div#⌫', { 
				click: () => {
					// Remove the item from the array
					delete items[index];
				}
			});

			A(() => {
				A({".hidden": !item[0].toLowerCase().includes(search.value.toLowerCase())})
			})
		})
	}, (item) => item[orderIndex.value]);
});

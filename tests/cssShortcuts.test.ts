import { test } from "bun:test";
import { assertBody, assertCss, passTime } from "./helpers";
import { $, proxy, mount, cssVars, insertCss } from "../src/aberdeen";

// Margin shortcuts
test('m shortcut expands to margin', () => {
	$('div m:10px');
	assertBody(`div{margin:10px}`);
});

test('mv shortcut expands to marginTop and marginBottom', () => {
	$('div mv:10px');
	assertBody(`div{marginBottom:10px marginTop:10px}`);
});

test('mh shortcut expands to marginLeft and marginRight', () => {
	$('div mh:10px');
	assertBody(`div{marginLeft:10px marginRight:10px}`);
});

test('mt shortcut expands to marginTop', () => {
	$('div mt:10px');
	assertBody(`div{marginTop:10px}`);
});

test('mb shortcut expands to marginBottom', () => {
	$('div mb:10px');
	assertBody(`div{marginBottom:10px}`);
});

test('ml shortcut expands to marginLeft', () => {
	$('div ml:10px');
	assertBody(`div{marginLeft:10px}`);
});

test('mr shortcut expands to marginRight', () => {
	$('div mr:10px');
	assertBody(`div{marginRight:10px}`);
});

// Padding shortcuts
test('p shortcut expands to padding', () => {
	$('div p:10px');
	assertBody(`div{padding:10px}`);
});

test('pv shortcut expands to paddingTop and paddingBottom', () => {
	$('div pv:10px');
	assertBody(`div{paddingBottom:10px paddingTop:10px}`);
});

test('ph shortcut expands to paddingLeft and paddingRight', () => {
	$('div ph:10px');
	assertBody(`div{paddingLeft:10px paddingRight:10px}`);
});

test('pt shortcut expands to paddingTop', () => {
	$('div pt:10px');
	assertBody(`div{paddingTop:10px}`);
});

test('pb shortcut expands to paddingBottom', () => {
	$('div pb:10px');
	assertBody(`div{paddingBottom:10px}`);
});

test('pl shortcut expands to paddingLeft', () => {
	$('div pl:10px');
	assertBody(`div{paddingLeft:10px}`);
});

test('pr shortcut expands to paddingRight', () => {
	$('div pr:10px');
	assertBody(`div{paddingRight:10px}`);
});

// Other shortcuts
test('w shortcut expands to width', () => {
	$('div w:100px');
	assertBody(`div{width:100px}`);
});

test('h shortcut expands to height', () => {
	$('div h:50px');
	assertBody(`div{height:50px}`);
});

test('bg shortcut expands to background', () => {
	$('div bg:red');
	assertBody(`div{background:red}`);
});

test('r shortcut expands to borderRadius', () => {
	$('div r:5px');
	assertBody(`div{borderRadius:5px}`);
});

test('fg shortcut expands to color', () => {
	$('div fg:blue');
	assertBody(`div{color:blue}`);
});

// Numeric spacing values
test('predefined @1 converts to 0.25rem', () => {
	$('div mt:@1');
	assertBody(`div{marginTop:0.25rem}`);
});

test('predefined @2 converts to 0.5rem', () => {
	$('div mt:@2');
	assertBody(`div{marginTop:0.5rem}`);
});

test('predefined @3 converts to 1rem', () => {
	$('div mt:@3');
	assertBody(`div{marginTop:1rem}`);
});

test('predefined @4 converts to 2rem', () => {
	$('div mt:@4');
	assertBody(`div{marginTop:2rem}`);
});

test('predefined @5 converts to 4rem', () => {
	$('div mt:@5');
	assertBody(`div{marginTop:4rem}`);
});

test('predefined spacing works with vertical/horizontal shortcuts', () => {
	$('div mv:@3 ph:@4');
	assertBody(`div{marginBottom:1rem marginTop:1rem paddingLeft:2rem paddingRight:2rem}`);
});

test('predefined spacing works with width and height', () => {
	$('div w:@6 h:@4');
	assertBody(`div{height:2rem width:8rem}`);
});

test('predefined spacing works with borderRadius', () => {
	$('div r:@2');
	assertBody(`div{borderRadius:0.5rem}`);
});

test('non-predefined numeric @vars return empty strings', () => {
	$('div mt:@15');
	assertBody(`div`);
});

test('numeric values without @ are not converted', () => {
	$('div mt:3');
	assertBody(`div{marginTop:3}`);
});

// CSS variables
test('@ prefix looks up cssVars', () => {
	cssVars.primary = '#3b82f6';
	$('div color:@primary');
	assertBody(`div{color:#3b82f6}`);
});

test('@ prefix with undefined key sets empty string', () => {
	$('div color:@nonexistent');
	// Empty string is set but not serialized in DOM
	assertBody(`div`);
});

test('@ prefix works with background shortcut', () => {
	cssVars.danger = '#ef4444';
	$('div bg:@danger');
	assertBody(`div{background:#ef4444}`);
});

test('@ prefix works with multiple properties', () => {
	cssVars.textColor = 'white';
	cssVars.bgColor = 'black';
	$('div color:@textColor bg:@bgColor');
	assertBody(`div{background:black color:white}`);
});

// Reactive cssVars
test('cssVars changes are reactive', async () => {
	cssVars.dynamic = 'red';
	const color = proxy('@dynamic');
	mount(document.body, () => {
		$('div', {$color: color});
	});
	assertBody(`div{color:red}`);

	cssVars.dynamic = 'blue';
	color.value = '@dynamic'; // Trigger reactive update
	await passTime();
	assertBody(`div{color:blue}`);
});

// Edge cases
test('empty value clears style', () => {
	$('div', {$mv: null});
	// Empty string is set but not serialized in DOM
	assertBody(`div`);
});

test('false value clears style', () => {
    $('div mt:3', () => {
        $('mt:', false);
    });
	// Empty string is set but not serialized in DOM
	assertBody(`div`);
});

test('empty value clears style', () => {
    $('div mt:3', () => {
        $('mt: ');
    });
	// Empty string is set but not serialized in DOM
	assertBody(`div`);
});

test('regular style properties still work', () => {
	$('div display:flex justifyContent:center');
	assertBody(`div{display:flex justifyContent:center}`);
});

test('insertCss() supports shortcuts and cssVars', () => {
	cssVars.testTheme = "red";
	const cls = insertCss({
		mv: "@3",
		fg: "@testTheme",
		"&:hover": {
			bg: "blue"
		}
	});

	// insertCss adds a style tag with the content
	assertCss(
		`${cls}{margin-top:1rem;margin-bottom:1rem;color:red;}`,
		`${cls}:hover{background:blue;}`
	);
});

import { test, expect } from "bun:test";
import { assertBody, assertCss, passTime } from "./helpers";
import { $, cssVars, setSpacingCssVars, insertCss } from "../src/aberdeen";

/** Get the full CSS content from the :root style tag in head */
function getHeadCss(): string {
	let css = '';
	(document.head as any).visit((el: Element) => {
		if (el.tagName === 'style') {
			css += el.textContent;
		}
	});
	return css;
}

// Property shortcuts
test('margin shortcuts', () => {
	$('div m:10px'); assertBody(`div{margin:10px}`);
});

test('margin vertical/horizontal shortcuts', () => {
	$('div mv:10px mh:20px');
	assertBody(`div{margin-bottom:10px margin-left:20px margin-right:20px margin-top:10px}`);
});

test('padding shortcuts', () => {
	$('div p:10px pv:5px ph:15px');
	assertBody(`div{padding:10px padding-bottom:5px padding-left:15px padding-right:15px padding-top:5px}`);
});

test('other shortcuts (w, h, bg, fg, r)', () => {
	$('div w:100px h:50px bg:red fg:blue r:5px');
	assertBody(`div{background:red border-radius:5px color:blue height:50px width:100px}`);
});

// CSS variables with $ prefix
test('$ prefix outputs var(--name)', () => {
	$('div color:$primary bg:$danger');
	assertBody(`div{background:var(--danger) color:var(--primary)}`);
});

test('numeric $vars get m prefix (e.g. $3 -> var(--m3))', () => {
	$('div mt:$3 ph:$4');
	assertBody(`div{margin-top:var(--m3) padding-left:var(--m4) padding-right:var(--m4)}`);
});

test('$var expansion in middle of value', () => {
	$('div', 'border: 1px solid $border;');
	assertBody(`div{border:"1px solid var(--border)"}`);
});

test('multiple $vars in one value', () => {
	$('div', 'border: $width solid $color;');
	assertBody(`div{border:"var(--width) solid var(--color)"}`);
});

test('numeric $var after space (e.g. 2px $2)', () => {
	$('div', 'm: 2px $2;');
	assertBody(`div{margin:"2px var(--m2)"}`);
});

test('$var not expanded inside parentheses', () => {
	$('div', 'background: url($path);');
	assertBody(`div{background:url($path)}`);
});

test('$var not expanded inside quotes', () => {
	$('div', 'content: "$text";');
	assertBody(`div{content:"$text"}`);
});

test('multiple $vars with one at start', () => {
	$('div', 'm: $1 $2;');
	assertBody(`div{margin:"var(--m1) var(--m2)"}`);
});

test('numeric values without $ are not converted', () => {
	$('div mt:3');
	assertBody(`div{margin-top:3}`);
});

// cssVars reactivity via :root style tag
test('cssVars automatically creates :root style tag when not empty', async () => {
	setSpacingCssVars(); // Initialize spacing scale
	await passTime();
	
	// Check that the spacing vars are in :root (auto-mounted because cssVars is not empty)
	const css = getHeadCss();
	expect(css).toContain('--m3: 1rem;');
	expect(css).toContain('--m4: 2rem;');
});

test('cssVars changes update :root style tag', async () => {
	cssVars.changing = 'red';
	await passTime();
	
	// Verify initial value
	let css = getHeadCss();
	expect(css).toContain('--changing: red');
	
	// Change value
	cssVars.changing = 'blue';
	await passTime();
	
	// Verify updated value AND old value is gone
	css = getHeadCss();
	expect(css).toContain('--changing: blue');
	expect(css).not.toContain('--changing: red');
});

// Edge cases
test('null/false values clear style', () => {
	$('div', {$mt: null});
	assertBody(`div`);
});

test('false value clears style', () => {
	$('div mt:3', () => { $('mt:', false); });
	assertBody(`div`);
});

test('insertCss() supports shortcuts and cssVars', () => {
	const cls = insertCss({
		"&": "mv:$3 fg:$primary",
		"&:hover": "bg:blue"
	});
	assertCss(
		`${cls}{margin-top:var(--m3);margin-bottom:var(--m3);color:var(--primary);}`,
		`${cls}:hover{background:blue;}`
	);
});

// setSpacingCssVars() function
test('setSpacingCssVars() initializes spacing scale with defaults', () => {
	setSpacingCssVars();
	expect(cssVars[1]).toBe('0.25rem');
	expect(cssVars[3]).toBe('1rem');
	expect(cssVars[12]).toBe('512rem');
});

test('setSpacingCssVars() with custom base and unit', () => {
	setSpacingCssVars(16, 'px');
	expect(cssVars[1]).toBe('4px');
	expect(cssVars[3]).toBe('16px');
	expect(cssVars[4]).toBe('32px');
});

test('setSpacingCssVars() with em units', () => {
	setSpacingCssVars(2, 'em');
	expect(cssVars[1]).toBe('0.5em');
	expect(cssVars[3]).toBe('2em');
});

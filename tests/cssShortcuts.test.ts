import { test, expect } from "bun:test";
import { assertBody, getCss, assertCss, passTime } from "./helpers";
import A from "../src/aberdeen";

// Property shortcuts
test('margin shortcuts', () => {
	A('div m:10px'); assertBody(`div{margin:10px}`);
});

test('margin vertical/horizontal shortcuts', () => {
	A('div mv:10px mh:20px');
	assertBody(`div{margin-bottom:10px margin-left:20px margin-right:20px margin-top:10px}`);
});

test('padding shortcuts', () => {
	A('div p:10px pv:5px ph:15px');
	assertBody(`div{padding:10px padding-bottom:5px padding-left:15px padding-right:15px padding-top:5px}`);
});

test('other shortcuts (w, h, bg, fg, r)', () => {
	A('div w:100px h:50px bg:red fg:blue r:5px');
	assertBody(`div{background:red border-radius:5px color:blue height:50px width:100px}`);
});

// CSS variables with $ prefix
test('$ prefix outputs var(--name)', () => {
	A('div color:$primary bg:$danger');
	assertBody(`div{background:var(--danger) color:var(--primary)}`);
});

test('numeric $vars get m prefix (e.g. $3 -> var(--m3))', () => {
	A('div mt:$3 ph:$4');
	assertBody(`div{margin-top:var(--m3) padding-left:var(--m4) padding-right:var(--m4)}`);
});

test('$var expansion in middle of value', () => {
	A('div', 'border: 1px solid $border;');
	assertBody(`div{border:"1px solid var(--border)"}`);
});

test('multiple $vars in one value', () => {
	A('div', 'border: $width solid $color;');
	assertBody(`div{border:"var(--width) solid var(--color)"}`);
});

test('numeric $var after space (e.g. 2px $2)', () => {
	A('div', 'm: 2px $2;');
	assertBody(`div{margin:"2px var(--m2)"}`);
});

test('$var not expanded inside parentheses', () => {
	A('div', 'background: url($path);');
	assertBody(`div{background:url($path)}`);
});

test('$var not expanded inside quotes', () => {
	A('div', 'content: "$text";');
	assertBody(`div{content:"$text"}`);
});

test('multiple $vars with one at start', () => {
	A('div', 'm: $1 $2;');
	assertBody(`div{margin:"var(--m1) var(--m2)"}`);
});

test('numeric values without $ are not converted', () => {
	A('div mt:3');
	assertBody(`div{margin-top:3}`);
});

// A.cssVars reactivity via :root style tag
test('A.cssVars automatically creates :root style tag when not empty', async () => {
	A.setSpacingCssVars(); // Initialize spacing scale
	await passTime();
	
	// Check that the spacing vars are in :root (auto-mounted because A.cssVars is not empty)
	const css = getCss();
	expect(css).toContain('--m3:1rem;');
	expect(css).toContain('--m4:2rem;');
});

test('A.cssVars changes update :root style tag', async () => {
	A.cssVars.changing = 'red';
	
	// Verify initial value
	await passTime();
	assertCss(
		`:root{--changing:red;}`
	);
	
	// Change value
	A.cssVars.changing = 'blue';
	await passTime();
	assertCss(
		`:root{--changing:blue;}`
	);
});

// Edge cases
test('null/false values clear style', () => {
	A('div', {$mt: null});
	assertBody(`div`);
});

test('false value clears style', () => {
	A('div mt:3', () => { A('mt:', false); });
	assertBody(`div`);
});

test('A.insertCss() supports shortcuts and A.cssVars', async () => {
	const cls = A.insertCss({
		"&": "mv:$3 fg:$primary",
		"&:hover": "bg:blue"
	});
	await passTime();
	assertCss(
		`${cls}{margin-top:var(--m3);margin-bottom:var(--m3);color:var(--primary);}`,
		`${cls}:hover{background:blue;}`
	);
});

// A.setSpacingCssVars() function
test('A.setSpacingCssVars() initializes spacing scale with defaults', () => {
	A.setSpacingCssVars();
	expect(A.cssVars[1]).toBe('0.25rem');
	expect(A.cssVars[3]).toBe('1rem');
	expect(A.cssVars[12]).toBe('512rem');
});

test('A.setSpacingCssVars() with custom base and unit', () => {
	A.setSpacingCssVars(16, 'px');
	expect(A.cssVars[1]).toBe('4px');
	expect(A.cssVars[3]).toBe('16px');
	expect(A.cssVars[4]).toBe('32px');
});

test('A.setSpacingCssVars() with em units', () => {
	A.setSpacingCssVars(2, 'em');
	expect(A.cssVars[1]).toBe('0.5em');
	expect(A.cssVars[3]).toBe('2em');
});

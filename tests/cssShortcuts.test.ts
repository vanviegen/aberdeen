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
	assertBody(`div{marginBottom:10px marginLeft:20px marginRight:20px marginTop:10px}`);
});

test('padding shortcuts', () => {
	$('div p:10px pv:5px ph:15px');
	assertBody(`div{padding:10px paddingBottom:5px paddingLeft:15px paddingRight:15px paddingTop:5px}`);
});

test('other shortcuts (w, h, bg, fg, r)', () => {
	$('div w:100px h:50px bg:red fg:blue r:5px');
	assertBody(`div{background:red borderRadius:5px color:blue height:50px width:100px}`);
});

// CSS variables with $ prefix
test('$ prefix outputs var(--name)', () => {
	$('div color:$primary bg:$danger');
	assertBody(`div{background:var(--danger) color:var(--primary)}`);
});

test('numeric $vars get m prefix (e.g. $3 -> var(--m3))', () => {
	$('div mt:$3 ph:$4');
	assertBody(`div{marginTop:var(--m3) paddingLeft:var(--m4) paddingRight:var(--m4)}`);
});

test('numeric values without $ are not converted', () => {
	$('div mt:3');
	assertBody(`div{marginTop:3}`);
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
		mv: "$3",
		fg: "$primary",
		"&:hover": { bg: "blue" }
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

import { test, expect } from "bun:test";
import { darkMode, $, cssVars } from "../src/aberdeen";
import { passTime } from "./helpers";
import { setMediaQuery } from "./fakedom";

test('darkMode() returns boolean', () => {
	const result = darkMode();
	expect(typeof result).toBe('boolean');
});

test('darkMode() is reactive and responds to media query changes', async () => {
	let callCount = 0;
	let lastValue: boolean | undefined;
	
	$(() => {
		lastValue = darkMode();
		callCount++;
	});
	
	await passTime();
	
	// Should have been called once during initialization
	expect(callCount).toBe(1);
	expect(lastValue).toBe(false); // Default is light mode
	
	// Change to dark mode
	setMediaQuery('(prefers-color-scheme: dark)', true);
	await passTime();
	
	// Should have re-executed
	expect(callCount).toBe(2);
	expect(lastValue).toBe(true);
	
	// Change back to light mode
	setMediaQuery('(prefers-color-scheme: dark)', false);
	await passTime();
	
	expect(callCount).toBe(3);
	expect(lastValue).toBe(false);
});

test('darkMode() can be used with cssVars', async () => {
	$(() => {
		if (darkMode()) {
			cssVars.testBg = '#1a1a1a';
		} else {
			cssVars.testBg = '#ffffff';
		}
	});
	
	await passTime();
	
	// Initially light mode
	expect(cssVars.testBg).toBe('#ffffff');
	
	// Switch to dark mode
	setMediaQuery('(prefers-color-scheme: dark)', true);
	await passTime();
	
	// Should update to dark colors
	expect(cssVars.testBg).toBe('#1a1a1a');
});

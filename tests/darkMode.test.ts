import { test, expect } from "bun:test";
import A from "../src/aberdeen";
import { passTime } from "./helpers";
import { setMediaQuery } from "./fakedom";

test('A.darkMode() returns boolean', () => {
	const result = A.darkMode();
	expect(typeof result).toBe('boolean');
});

test('A.darkMode() is reactive and responds to media query changes', async () => {
	let callCount = 0;
	let lastValue: boolean | undefined;
	
	A(() => {
		lastValue = A.darkMode();
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

test('A.darkMode() can be used with A.cssVars', async () => {
	A(() => {
		if (A.darkMode()) {
			A.cssVars.testBg = '#1a1a1a';
		} else {
			A.cssVars.testBg = '#ffffff';
		}
	});
	
	await passTime();
	
	// Initially light mode
	expect(A.cssVars.testBg).toBe('#ffffff');
	
	// Switch to dark mode
	setMediaQuery('(prefers-color-scheme: dark)', true);
	await passTime();
	
	// Should update to dark colors
	expect(A.cssVars.testBg).toBe('#1a1a1a');
});

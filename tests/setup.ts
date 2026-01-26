import { beforeEach, afterEach } from "bun:test";
import * as fakedom from './fakedom';
import { assertBody } from "./helpers";
import { setErrorHandler, unmountAll, cssVars, copy } from '../src/aberdeen';

beforeEach(() => {
	fakedom.resetCounts();
	setErrorHandler();
});

afterEach(async () => {
	unmountAll();
	await fakedom.passTime(2001); // wait for deletion transitions
	assertBody(``);
	// Clear cssVars to prevent pollution between tests
	copy(cssVars, {});
});

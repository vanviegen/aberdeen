import { beforeEach, afterEach } from "bun:test";
import * as fakedom from './fakedom';
import { assertBody } from "./helpers";
import { setErrorHandler, unmountAll, cssVars, copy } from '../src/aberdeen';

beforeEach(() => {
	fakedom.resetCounts();
	setErrorHandler();
});

afterEach(async () => {
	copy(cssVars, {});
	unmountAll();
	try {
		await fakedom.passTime(2001); // wait for deletion transitions
		assertBody(``);
	} finally {
		// Force-clear DOM and state even if errors occurred
		fakedom.clearBody();
	}
});

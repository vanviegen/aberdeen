import { beforeEach, afterEach } from "bun:test";
import * as fakedom from './fakedom';
import { assertBody } from "./helpers";
import A from "../src/aberdeen";

beforeEach(() => {
	fakedom.resetCounts();
	A.setErrorHandler();
});

afterEach(async () => {
	A.copy(A.cssVars, {});
	A.unmountAll();
	try {
		await fakedom.passTime(2001); // wait for deletion transitions
		assertBody(``);
	} finally {
		// Force-clear DOM and state even if errors occurred
		fakedom.clearBody();
	}
});

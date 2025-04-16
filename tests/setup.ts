import { beforeEach, afterEach } from "bun:test";
import * as fakedom from './fakedom';
import { assertBody } from "./helpers";
import { setErrorHandler, unmountAll } from '../src/aberdeen';

beforeEach(() => {
	fakedom.resetCounts()
	setErrorHandler()
})

afterEach(async () => {
	unmountAll()
	await fakedom.asyncPassTime(2001) // wait for deletion transitions
	assertBody(``)
})

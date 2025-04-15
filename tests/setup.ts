import { beforeEach, afterEach } from "bun:test";
import * as fakedom from './fakedom';
import { assertBody } from "./helpers";
import { setErrorHandler, unmountAll } from '../src/aberdeen';

beforeEach(() => {
	fakedom.resetCounts()
	setErrorHandler()
})

afterEach(() => {
	unmountAll()
	fakedom.passTime(2001) // wait for deletion transitions
	assertBody(``)
})

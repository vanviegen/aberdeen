import * as fakedom from './fakedom';
import { beforeEach, afterEach } from "bun:test";
import $ from '../src/aberdeen';
import {assertBody} from "./helpers"

Object.assign(global, fakedom)

beforeEach(() => {
	document.body = document.createElement('body')
	fakedom.resetCounts()
	$.setErrorHandler()
})

afterEach(() => {
	$.unmount()
	fakedom.passTime(2001) // wait for deletion transitions
	assertBody(``)
})

import * as fakedom from './fakedom.js';
import { beforeEach, afterEach } from "bun:test";
import * as aberdeen from '../src/aberdeen.js';

Object.assign(global, fakedom)

beforeEach(() => {
	document.body = document.createElement('body')
	resetCounts()
	aberdeen.setErrorHandler()
})

afterEach(() => {
	aberdeen.unmount()
	passTime(2001) // wait for deletion transitions
	assertBody(``)
})

function toDisplay(value) {
	if (value instanceof Map) {
		let results = []
		value.forEach((value,key) => results.push(JSON.stringify(key)+": "+JSON.stringify(value)))
		return "map{" + results.join(", ") + "}"
	} else {
		return JSON.stringify(value)
	}
}

global.AssertError = class extends Error {
	constructor(text, actual, expected, expectLiteral) {
		text += `
		Actual:   ${toDisplay(actual)}
		Expected: ${expectLiteral ? expected : toDisplay(expected)}`
		super(text)
	}
}

global.assert = function(bool, msg) {
	if (!bool) throw new AssertError(`assert failed${msg ? ": "+msg : ""}`, bool, "something trueish", true)
}

global.assertContains = function(actual, expected, msg) {
	actual = (''+actual)
	if (actual.indexOf(expected) < 0) throw new AssertError(`contains failed ${msg ? ": "+msg : ""}`, actual, `something containing '${expected}'`, true)
}

global.getBody = function() {
	return document.body.toString().replace(/^body{(.*)}$/,'$1').replace(/^body\b/,'')
}

global.assertBody = function(expected) {
	let actual = getBody()
	if (actual !== expected) throw new AssertError(`assertBody failed`, actual, expected)
}

global.assertThrow = function(what, func) {
	if (typeof what == 'function') {
		func = what
		what = undefined
	}
	try {
		func()
	} catch(e) {
		if (what && e.toString().indexOf(what)<0) throw new AssertError(`wrong exception`, e.toString(), `something containing "${what}"`, true)
		return
	}
	throw new AssertError(`exception expected`, undefined, `something containing "${what}"`, true)
}

global.objToMap = function(obj) {
    if (typeof obj === 'object' && obj && obj.constructor===Object) {
        let map = new Map()
        for(let k in obj) {
            map.set(k, objToMap(obj[k]))
        }
        return map
    }
    return obj
}

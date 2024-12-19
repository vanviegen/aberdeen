import * as _ from './_fakedom.js';
import mocha from 'mocha'
import {deepEqual as equal} from 'fast-equals'

import * as aberdeen from '../dist-min/aberdeen.js'
import * as transitions from '../dist-min/transitions.js'
import * as prediction from '../dist-min/prediction.js'
Object.assign(global, aberdeen, transitions, prediction)

mocha.beforeEach(() => {
	$.onError = (e) => { setTimeout(() => { throw e }, 0) }
	document.body = document.createElement('body')
	resetCounts()
})

mocha.afterEach(() => {
	unmount()
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
	constructor(text, actual, expected, alreadyFormatted) {
		text += `
		Actual:   ${alreadyFormatted ? actual : toDisplay(actual)}
		Expected: ${alreadyFormatted ? expected : toDisplay(expected)}`
		super(text)
	}
}

global.assert = function(bool, msg) {
	if (!bool) throw new AssertError(`assert failed${msg ? ": "+msg : ""}`, toDisplay(bool), "something trueish", true)
}

global.assertEqual = function(actual, expected, msg) {
	if (!equal(actual,expected)) throw new AssertError(`equal failed${msg ? ": "+msg : ""}`, actual, expected)
}

global.getBody = function() {
	return document.body.toString().replace(/^body{/,'').replace(/}$/,'')
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
		if (what && e.toString().indexOf(what)<0) throw new AssertError(`wrong exception`, e.toString(), `some exception containing "${what}"`, true)
		return
	}
	throw new AssertError(`exception expected`, 'no exception', what ? `an exception containing "${what}"` : `any exception`, true)
}

global.assertRenderError = function(what, func) {
	if (typeof what == 'function') {
		func = what
		what = undefined
	}
	let except
	const oldOnError = $.onError
	$.onError = function(e) {
		except = e
	}
	func()
	$.onError = oldOnError
	if (!except) throw new AssertError(`render error expected`, 'no error', what ? `a render error containing "${what}"` : `any error`, true)
	if (what && except.toString().indexOf(what)<0) throw new AssertError(`wrong render error`, except.toString(), `some error containing "${what}"`, true)	
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

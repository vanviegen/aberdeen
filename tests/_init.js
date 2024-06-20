const fakedom = require('./_fakedom')
const mocha = require('mocha')
const {deepEqual: equal} = require('fast-equals')

Object.assign(global, require('./build/aberdeen'))

let currentMountSeq = new Store(0)
mocha.beforeEach(() => {
	document.body = document.createElement('body')
	resetCounts()
})

mocha.afterEach(() => {
	testUnmount()
	assertBody(``)
})

global.testMount = function(func) {
	let myMountSeq = currentMountSeq.peek()
	mount(document.body, () => {
		// The peek should make sure that all passed mounts can be fully garbage collected, as
		// they won't need to keep observing currentMountSeq (in case it would go backwards,
		// which it won't).
		if (myMountSeq === currentMountSeq.peek() && myMountSeq === currentMountSeq.get()) {
			func()
		}
	})
}

global.testUnmount = function() {
	currentMountSeq.modify(n => n+1)
	passTime(2001) // wait for deletion transitions
}

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

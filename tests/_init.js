const fakedom = require('./_fakedom')
const mocha = require('mocha')
const equal = require('fast-deep-equal')

Object.assign(global, require('./build/aberdeen'))

mocha.beforeEach(() => {
	document.body = document.createElement('body')
})

mocha.afterEach(() => {
	passTime()
	unmountAll()
})


global.AssertError = class extends Error {
	constructor(text, actual, expected, expectLiteral) {
		text += `
		Actual:   ${JSON.stringify(actual)}
		Expected: ${expectLiteral ? expected : JSON.stringify(expected)}`
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

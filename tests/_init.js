const fakedom = require('./_fakedom')
const mocha = require('mocha')
const equal = require('fast-deep-equal')

mocha.beforeEach(() => { document.body = document.createElement('body') })

Object.assign(global, require('./build/aberdeen'))

global.AssertionError = class extends Error {
    constructor(text, actual, expected) {
        super(text)
        this.actual = actual
        this.expected = expected
    }
}

global.assert = function(bool, msg) {
    if (!bool) throw new AssertionError(`assert failed${msg ? ": "+msg : ""}`, bool)
}

global.assertEqual = function(actual, expected, msg) {
    if (!equal(actual,expected)) throw new AssertionError(`equal failed${msg ? ": "+msg : ""}`, JSON.stringify(actual), JSON.stringify(expected))
}

global.getBody = function() {
    return document.body.toString().replace(/^body{/,'').replace(/}$/,'')
}

global.assertBody = function(expected) {
    let actual = getBody()
    if (actual !== expected) throw new AssertionError(`assertBody failed`, actual, expected)
}

global.assertThrow = function(what, func) {
    if (typeof what == 'function') {
        func = what
        what = undefined
    }
    try {
        func()
    } catch(e) {
        if (what && e.toString().indexOf(what)<0) throw new AssertionError(`exception should include text`, e.toString(), what)
        return
    }
    throw new AssertionError(`exception expected`)
}

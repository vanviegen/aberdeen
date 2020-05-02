const fakedom = require('./_fakedom')
const mocha = require('mocha');
const equal = require('fast-deep-equal');

mocha.beforeEach(() => { document.body = document.createElement('body') })

Object.assign(global, require('./build/aberdeen'));

global.assert = function(bool, msg) {
    if (!bool) throw new Error(`assert failed${msg ? ": "+msg : ""}`);
}

global.assertEqual = function(actual, should, msg) {
    if (!equal(actual,should)) throw new Error(`equal failed: ${JSON.stringify(actual)} should have been ${JSON.stringify(should)}${msg ? ": "+msg : ""}`);
}

global.assertBody = function(should) {
    let actual = document.body.toString().replace(/^body{/,'').replace(/}$/,'');
    if (actual !== should) throw new Error(`assertBody failed: ${actual} should have been ${should}`)
}

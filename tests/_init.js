const fakedom = require('./_fakedom')
const mocha = require('mocha');

mocha.beforeEach(() => { document.body = document.createElement('body') })

Object.assign(global, require('../dist-commonjs/aberdeen'));

global.assert = function(bool, msg) {
    if (!bool) throw new Error(`assert failed${msg ? ": "+msg : ""}`);
}

global.equal = function(actual, should, msg) {
    if (actual !== should) throw new Error(`equal failed: ${JSON.stringify(should)} should have been ${JSON.stringify(actual)}{msg ? ": "+msg : ""}`);
}

global.assertBody = function(should) {
    let actual = document.body.toString().replace(/^body{/,'').replace(/}$/,'');
    if (actual !== should) throw new Error(`assertBody failed: ${actual} should have been ${should}`)
}

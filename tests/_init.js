const jsDomGlobal = require('jsdom-global');
const mocha = require('mocha');

let clean;
mocha.beforeEach(() => clean = jsDomGlobal())
mocha.afterEach(() => clean());

Object.assign(global, require('../dist-commonjs/aberdeen'));

global.step = function() {
    return new Promise((resolve,reject) => {
        setTimeout(resolve,1);
    }) 
}

global.assert = function(bool, msg) {
    if (!bool) throw new Error(`assert failed${msg ? ": "+msg : ""}`);
}

global.equal = function(actual, should, msg) {
    if (actual !== should) throw new Error(`equal failed: ${JSON.stringify(should)} should have been ${JSON.stringify(actual)}{msg ? ": "+msg : ""}`);
}

global.assertBody = function(should) {
    if (document.body.innerHTML !== should) throw new Error(`assertBody failed: ${document.body.innerHTML} should have been ${should}`)
}

global.$ = function(id) {
    return document.getElementById(id);
}
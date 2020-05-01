let insertedCss = '';





let newCount = 0, changeCount = 0;
let failed = 0, passed = 0;



let timeouts = [];
let timeBase = 0;
let realSetTimeout = global.setTimeout;
global.setTimeout = function(func,time) {
	timeouts.push({func, time: time+timeBase});
};

const wait = ms => new Promise((r, j)=>realSetTimeout(r, ms))

async function runTimeouts() {
	while(true) {
		// execute all microtasks first
		await wait(0);
		// only then see if there is a macrotask created by setTimeout
		if (!timeouts.length) return;
		timeouts.sort( (a,b) => a.time-b.time );
		let timeout = timeouts.shift();
		timeBase = timeout.time;
		timeout.func.call(this);
	}
}


class ElementBase {
	get nextSibling() {
		return this.getSibling(+1);
	}
	get previousSibling() {
		return this.getSibling(-1);
	}
	getSibling(delta) {
		if (!this.parentNode) return;
		let siblings = this.parentNode.childNodes;
		let idx = siblings.indexOf(this);
		if (idx < 0) throw new Error("not part of sibling!?");
		return siblings[idx+delta];
	}
}

class TestElement extends ElementBase {
	constructor(tag) {
		super();
		this.tag = tag;
		this.childNodes = [];
		this._style = {};
		this.attrs = {};
		this.events = {};
		newCount++;
	}
	appendChild(node) {
		this.insertBefore(node, null);
	}
	insertBefore(node, ref) {
		if (node.parentNode) node.parentNode.removeChild(node);
		else changeCount++;
		node.parentNode = this;
		if (ref) {
			let idx = this.childNodes.indexOf(ref);
			if (idx<0) throw new Error("non-existing ref node");
			this.childNodes.splice(idx, 0, node);
		} else {
			this.childNodes.push(node);
		}
	}
	removeChild(node) {
		let idx = this.childNodes.indexOf(node);
		if (idx<0) throw new Error("no such child");
		this.childNodes.splice(idx, 1);
		node.parentNode = null;
		changeCount++;
	}
	replaceChild(newNode, oldNode) {
		this.insertBefore(newNode, oldNode);
		this.removeChild(oldNode);
	}
	setAttribute(k, v) {
		this.attrs[k] = v;
		changeCount++;
	}
	removeAttribute(k) {
		delete this.attrs[k];
		changeCount++;
	}
	get firstChild() {
		return this.childNodes[0];
	}
	get lastChild() {
		return this.childNodes[this.childNodes.length-1];
	}
	set style(val) {
		if (val !== '') throw new Error("non-empty style string cannot be emulated");
		this._style = {};
		changeCount++;
	}
	get style() {
		return this._style;
	}
	set className(v) {
		this.attrs.class = v;
		changeCount++;
	}
	toString() {
		let props = Object.assign({}, this);
		for(let k in this.attrs) props['@'+k] = this.attrs[k];
		for(let k in this.style) props[':'+k] = this._style[k];
		delete props.tag;
		delete props.attrs;
		delete props._style;
		delete props.events;
		delete props.childNodes;
		delete props.parentNode;

		let arr = [];
		for(let k in props) arr.push(k+'='+JSON.stringify(props[k]));
		arr.sort();
		for(let child of this.childNodes) arr.push(child.toString());

		return this.tag + `{${arr.join(' ')}}`;
	}

	assertChildren(desired) {
		let result = this.childNodes.join(' ');
		desired = desired.toString();
		if (verbose>2) console.log(`  assert ${desired}`);
		if (result!==desired) throw new Error(`invalid result\n\t${result} instead of\n\t${desired}`);
	}

	addEventListener(name, func) {
		this.events[name] = this.events[name] || [];
		this.events[name].push(func);
		changeCount++;
	}
	event(info) {
		if (typeof info === 'string') info = {type: info};
		let type = info.type;
		info.target = this;
		info.preventDefault = function(){};
		info.stopPropagation = function(){ info.stopped = true; };
		let node = this;
		while(node && !info.stopped) {
			let funcs = node.events[type];
			if (funcs) {
				for(let func of funcs) {
					func.call(node, info);
				}
			}
			node = node.parentNode;
		}
	}
	getElementById(id) {
		if (this.attrs.id === id) return this;
		for(let child of this.childNodes) {
			let el = child.getElementById(id);
			if (el) return el;
		}
	}
}


class TestTextNode extends ElementBase {
	constructor(textContent) {
		super();
		this.textContent = textContent;
		newCount++;
	}
	toString(indent) {
		return (indent||"") + JSON.stringify(this.textContent);
	}
}


async function runTest(file, testname) {
	let name = file+':'+testname;

	for(let setDebug of [9,0]) {
		if (verbose>0) console.log(`${name} [setDebug(${setDebug})]`);

		// Start with a clean copy of aberdeen for every test
		delete require.cache[require.resolve('../dist/aberdeen.js')]
		const gg = require("../dist/aberdeen.js");
		let logs = [];
		gg.log = function(...args) {
			logs.push(args);
			if (verbose>1) console.log(" ", ...args);
		}

		global.gg = gg;
		gg.setDebug(setDebug);

		// Start with a clean copy of the test module for every test
		delete require.cache[require.resolve('./'+file)];
		let module = require('./'+file);
		let steps = module[testname];
		if (!(steps instanceof Array)) steps = [steps];

		logs = [];
		let body = new Element('body');
		timeouts = [];

		let mount;
		var step;
		function root() {
			return step.root.apply(this, arguments);
		}
		for(let i=0; i<steps.length; i++) {
			try {
				gg.log(`STEP ${i}`);
				newCount = 0;
				changeCount = 0;
				insertedCss = "";
				step = steps[i];
				if (step.unmount) {
					mount.unmount();
					mount = null;
				} else {
					if (mount) mount.refreshNow();
					else mount = gg.mount(body, root, {abc:23});
				}
				if (step.result!=null) {
					body.assertChildren(step.result);
				}
				if (step.maxNew!=null) {
					if (newCount > step.maxNew) throw new Error(`${newCount} new elements created, only ${step.maxNew} allowed`);
				}
				if (step.maxChange!=null) {
					if (changeCount > step.maxChange) throw new Error(`${changeCount} changed elements, only ${step.maxChange} allowed`);
				}
				if (step.after) step.after(body);
				let expectCss = step.css || '';
				if (expectCss !== insertedCss) {
					throw new Error(`Expecting "${expectCss}" to be inserted, but got "${insertedCss}"`);
				}
				await runTimeouts();
			} catch(e) {
				console.log(`FAILED TEST '${name}' [setDebug(${setDebug})] at step ${i}\n\t${(e.stack||e).replace(/\n {0,4}/g,"\n\t\t")}\n\tLogs:\n\t\t${logs.map(e => e.join(" ")).join("\n\t\t")}`);
				failed++;
				try {
					mount.unmount();
				} catch(e) {}
				return;
			}
		}

		if (mount) mount.unmount();
		passed++;
	}
}

let tests = [];
let verbose = 0;
let endOfFlags = false;
for(let i=2; i<process.argv.length; i++) {
	let arg = process.argv[i];
	if (endOfFlags || arg[0]!=='-') {
		tests.push(arg);
	} else if (arg[1]==='-') {
		if (arg=='--') {
			endOfFlags = true;
		}
		else {
			throw new Error(`unknown flag '${arg}'`);
		}
	} else {
		for(let j=1; j<arg.length; j++) {
			let letter = arg[j];
			if (letter==='v') {
				verbose++;
			} else {
				throw new Error(`unknown flag '-${letter}'`);
			}
		}
	}
}

runTests(tests);

async function runTests(tests) {
	if (tests.length) {
		for(let test of tests) {
			let [file,name] = test.split(':');
			if (name) {
				await runTest(file, name);
			} else {
				let module = require('./'+file);
				for(let name in module) {
					await runTest(file, name);
				}
			}

		}
	} else {
		for(let file of fs.readdirSync(__dirname)) {
			let m = file.match(/^(.+)\.js$/);
			if (m && m[1]!=='index') {
				file = m[1];
				let module = require('./'+file);
				for(let name in module) {
					await runTest(file, name);
				}
			}
		}
	}
	if (failed) console.log(`Failed ${failed} out of ${failed+passed} test`);
	else console.log(`Passed all ${passed} tests!`);
}



Element = TestElement as unknown as typeof Element



window = {} as Window & typeof globalThis

document = {
	createElement: tag => new Element(tag),
	createTextNode: text => new TextNode(text),
	head: {
		appendChild: function(el) {
			if (el.tag!=='style') {
				throw new Error("only <style> inserts in head can be emulated");
			}
			insertedCss += el.innerText;
		}
	}
};

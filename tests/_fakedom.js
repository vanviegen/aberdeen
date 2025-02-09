let insertedCss = '';

global.document = {
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
global.window = {};


let newCount = 0, changeCount = 0;
global.resetCounts = function() { newCount = changeCount = 0; };
global.getCounts = function() { return {new: newCount, change: changeCount}; };

let timeouts = [];
let currentTime = 0;

const realSetTimeout = global.setTimeout

global.setTimeout = function(func,time) {
	timeouts.push({func, time: time+currentTime});
};

global.passTime = function(ms) {
	let count = 0
	let targetTime = ms==null ? undefined : currentTime + ms;
	while(timeouts.length) {
		// Find the timeout that should occur first
		let smallestIdx = 0;
		for(let idx=1; idx<timeouts.length; idx++) {
			if (timeouts[idx].time < timeouts[smallestIdx].time) smallestIdx = idx;
		}
		let timeout = timeouts[smallestIdx];
		// If this timeout is not due yet, we're done
		if (targetTime!=null && timeout.time > targetTime) break;
		// Timeout is due! Remove it from the list, update the currentTime, and fire the callback!
		timeouts.splice(smallestIdx, 1);
		currentTime = timeout.time;
		timeout.func();
		count++
	}
	currentTime = targetTime==null ? 0 : targetTime
	return count
}

global.asyncPassTime = async function(ms) {
	while(true) {
		// Allow all async tasks that are ready (or become ready during another task) to run.
		await new Promise(resolve => realSetTimeout(resolve, 0));
		// Trigger virtual setTimeout, until there are none left. (They can be set from an async task.)
		if (!passTime(ms)) break
		ms = 0
	}
}

class Node {
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
		if (idx < 0) throw new Error("not part of siblings!?");
		return siblings[idx+delta];
	}
}

const IGNORE_OUTPUT = new Set("tag-> attrs-> events-> childNodes-> parentNode-> class=".split(" "))


class Element extends Node {
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
	remove() {
		this.parentNode.removeChild(this);
	}
	replaceChild(newNode, oldNode) {
		this.insertBefore(newNode, oldNode);
		this.removeChild(oldNode);
	}
	setAttribute(k, v) {
		if (v==null || v==='') delete this.attrs[k]
		else this.attrs[k] = ''+v;
		changeCount++;
	}
	getAttribute(k) {
		return this.attrs[k]
	}
	removeAttribute(k) {
		delete this.attrs[k];
		changeCount++;
	}
	get classList() {
		return this._classList || (this._classList = {
			add: name => {
				let set = this._getClassSet();
				set.add(name);
				this._setClassSet(set);
			},
			remove: name => {
				let set = this._getClassSet();
				set.delete(name);
				this._setClassSet(set);
			},
			toggle: (name, force) => {
				if (force===true || (force!==false && !this._getClassSet().has(name))) this._classList.add(name);
				else this._classList.remove(name);
			}
		})
	}
	get parentElement() {
		if (this.parentNode instanceof Element) return this.parentNode;
	}
	_getClassSet() {
		return new Set(this.attrs.class ? this.attrs.class.split(' ') : []);
	}
	_setClassSet(map) {
		this.setAttribute('class', Array.from(map).sort().join(' ') || undefined)
	}
	get firstChild() {
		return this.childNodes[0];
	}
	get lastChild() {
		return this.childNodes[this.childNodes.length-1];
	}
	set textContent(text) {
		this.childNodes = [new TextNode(text)];
	}
	set innerHTML(html) {
		this.childNodes = [];
		if (html) {
			let n = new Element('fake-emulated-html');
			n.textContent = html;
			this.appendChild(n);
		}
	}
	set style(val) {
		if (val !== '') throw new Error("non-empty style string cannot be emulated");
		this._style = {};
		changeCount++;
	}
	get style() {
        for(let k in this._style) {
            if (this._style[k] === '') delete this._style[k];
        }
		return this._style;
	}
	set className(v) {
		this.attrs.class = v;
		changeCount++;
	}
	get offsetHeight() {
		return 20;
	}
	get offsetWidth() {
		return 200;
	}
	toString() {
		let arr = [];
		for(let [symbol, items] of [['=', this.attrs], ['->', this], [':', this.style]]) {
			for(let key of Object.keys(items).toSorted()) {
				const prefix = key + symbol
				if (key[0] === '_' || IGNORE_OUTPUT.has(prefix)) continue
				let value = ''+items[key]
				if (value.indexOf(" ")>=0 || value.indexOf("}")>=0 || !value.length) value = JSON.stringify(value)
				arr.push(prefix + value)
			}
		}
		for(let child of this.childNodes) arr.push(child.toString());

		const cls = this.attrs['class'] ? "."+this.attrs['class'].replace(/ /g, '.') : ''
		return this.tag + cls + (arr.length ? `{${arr.join(' ')}}` : '')
	}

	addEventListener(name, func) {
		this.events[name] = this.events[name] || new Set();
		this.events[name].add(func);
		changeCount++;
	}
	removeEventListener(name, func) {
		if (this.events[name]) {
			if (this.events[name].delete(func)) {
				changeCount++
			}
		}
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

class TextNode extends Node {
	constructor(textContent) {
		super();
		this.textContent = '' + textContent;
		newCount++;
	}
	toString() {
		return JSON.stringify(this.textContent);
	}
}

function getComputedStyle(el) {
	return el._style;
}


global.Node = Node;
global.TextNode = TextNode;
global.Element = Element;
global.getComputedStyle = getComputedStyle;

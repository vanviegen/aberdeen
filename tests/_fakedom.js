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

let timeouts = [];
let timeBase = 0;

global.setTimeout = function(func,time) {
	timeouts.push({func, time: time+timeBase});
};

global.passTime = function(ms=1) {
	timeBase += ms;
	while(true) {
		if (!timeouts.length) return;
		timeouts.sort( (a,b) => a.time-b.time );
		if (timeouts[0] > timeBase) return;
		timeouts.shift().func();
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
	replaceChild(newNode, oldNode) {
		this.insertBefore(newNode, oldNode);
		this.removeChild(oldNode);
	}
	setAttribute(k, v) {
		this.attrs[k] = ''+v;
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
		return {
			add: name => {
				let set = this._getClassSet()
				set.add(name)
				this._setClassSet(set)
			},
			remove: name => {
				let set = this._getClassSet()
				set.delete(name)
				this._setClassSet(set)
			},
		}
	}
	_getClassSet() {
		return new Set(this.attrs.class ? this.attrs.class.split(' ') : [])
	}
	_setClassSet(map) {
		this.attrs.class = Array.from(map).sort().join(' ')
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


global.Node = Node;
global.TextNode = TextNode;
global.Element = Element;

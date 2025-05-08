let insertedCss: string = '';

let newCount: number = 0, changeCount: number = 0;
export const resetCounts = function(): void { newCount = changeCount = 0; };
export const getCounts = function(): { new: number, changed: number } { 
  return { new: newCount, changed: changeCount }; 
};

class Node {
  parentNode: Element | null = null;
  childNodes: Node[] = [];

  get nextSibling(): Node | undefined {
    return this.getSibling(+1);
  }
  
  get previousSibling(): Node | undefined {
    return this.getSibling(-1);
  }
  
  getSibling(delta: number): Node | undefined {
    if (!this.parentNode) return undefined;
    let siblings = this.parentNode.childNodes;
    let idx = siblings.indexOf(this);
    if (idx < 0) throw new Error("not part of siblings!?");
    return siblings[idx + delta];
  }

  visit(visitor: (Element) => void) {
    visitor(this);
    for(let c of this.childNodes) {
      c.visit(visitor);
    }
  }
}

class Element extends Node {
  tag: string;
  _style: Record<string, string> = {};
  attrs: Record<string, string> = {};
  events: Record<string, Set<Function>> = {};
  _classList?: {
    add: (name: string) => void;
    remove: (name: string) => void;
    toggle: (name: string, force?: boolean) => void;
  };

  constructor(tag: string) {
    super();
    this.tag = tag;
    this.childNodes = [];
    newCount++;
  }

  appendChild(node: Node): void {
    this.insertBefore(node, null);
  }

  insertBefore(node: Node, ref: Node | null): void {
    if (node.parentNode) node.parentNode.removeChild(node);
    else changeCount++;
    node.parentNode = this;
    if (ref) {
      let idx = this.childNodes.indexOf(ref);
      if (idx < 0) throw new Error("non-existing ref node");
      this.childNodes.splice(idx, 0, node);
    } else {
      this.childNodes.push(node);
    }
  }

  removeChild(node: Node): void {
    let idx = this.childNodes.indexOf(node);
    if (idx < 0) throw new Error("no such child");
    this.childNodes.splice(idx, 1);
    node.parentNode = null;
    changeCount++;
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }

  replaceChild(newNode: Node, oldNode: Node): void {
    this.insertBefore(newNode, oldNode);
    this.removeChild(oldNode);
  }

  setAttribute(k: string, v: any): void {
    if (v == null || v === '') delete this.attrs[k];
    else this.attrs[k] = '' + v;
    changeCount++;
  }

  getAttribute(k: string): string | undefined {
    return this.attrs[k];
  }

  removeAttribute(k: string): void {
    delete this.attrs[k];
    changeCount++;
  }

  get classList(): {
    add: (name: string) => void;
    remove: (name: string) => void;
    toggle: (name: string, force?: boolean) => void;
  } {
    return this._classList || (this._classList = {
      add: (name: string) => {
        let set = this._getClassSet();
        set.add(name);
        this._setClassSet(set);
      },
      remove: (name: string) => {
        let set = this._getClassSet();
        set.delete(name);
        this._setClassSet(set);
      },
      toggle: (name: string, force?: boolean) => {
        if (force === true || (force !== false && !this._getClassSet().has(name))) this._classList!.add(name);
        else this._classList!.remove(name);
      }
    });
  }

  get parentElement(): Element | undefined {
    if (this.parentNode instanceof Element) return this.parentNode;
    return undefined;
  }

  _getClassSet(): Set<string> {
    return new Set(this.attrs.class ? this.attrs.class.split(' ') : []);
  }

  _setClassSet(map: Set<string>): void {
    this.setAttribute('class', Array.from(map).sort().join(' ') || undefined);
  }

  get firstChild(): Node | undefined {
    return this.childNodes[0];
  }

  get lastChild(): Node | undefined {
    return this.childNodes[this.childNodes.length - 1];
  }

  set textContent(text: string) {
    this.childNodes = [new TextNode(text)];
  }
  
  get textContent() {
    let text = '';
    for(let child of this.childNodes) {
      if (child instanceof TextNode) {
        text += child.textContent;
      }
    }
    return text;
  }

  set innerHTML(html: string) {
    this.childNodes = [];
    if (html) {
      let n = new Element('fake-emulated-html');
      n.textContent = html;
      this.appendChild(n);
    }
  }

  set style(val: string) {
    if (val !== '') throw new Error("non-empty style string cannot be emulated");
    this._style = {};
    changeCount++;
  }

  get style(): Record<string, string> {
    for(let k in this._style) {
      if (this._style[k] === '') delete this._style[k];
    }
    return this._style;
  }

  set className(v: string) {
    this.attrs.class = v;
    changeCount++;
  }

  get offsetHeight(): number {
    return 20;
  }

  get offsetWidth(): number {
    return 200;
  }

  toString(): string {
    let arr: string[] = [];
    for(let [symbol, items] of [['=', this.attrs], ['->', this], [':', this.style]] as [string, Record<string, any>][]) {
      for(let key of Object.keys(items).sort()) {
        const prefix = key + symbol;
        if (key[0] === '_' || IGNORE_OUTPUT.has(prefix)) continue;
        let value = '' + items[key];
        if (value.indexOf(" ") >= 0 || value.indexOf("}") >= 0 || !value.length) value = JSON.stringify(value);
        arr.push(prefix + value);
      }
    }
    for(let child of this.childNodes) arr.push(child.toString());

    const cls = this.attrs['class'] ? "." + this.attrs['class'].replace(/ /g, '.') : '';
    return this.tag + cls + (arr.length ? `{${arr.join(' ')}}` : '');
  }

  addEventListener(name: string, func: Function): void {
    this.events[name] = this.events[name] || new Set();
    this.events[name].add(func);
    changeCount++;
  }

  removeEventListener(name: string, func: Function): void {
    if (this.events[name]) {
      if (this.events[name].delete(func)) {
        changeCount++;
      }
    }
  }

  event(info: string | { type: string; [key: string]: any }): void {
    if (typeof info === 'string') info = {type: info};
    let type = info.type;
    info.target = this;
    info.preventDefault = function() {};
    info.stopPropagation = function() { info.stopped = true; };
    let node: Element | null = this;
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

  getElementById(id: string): Element | undefined {
    if (this.attrs.id === id) return this;
    for(let child of this.childNodes) {
      if (child instanceof Element) {
        let el = child.getElementById(id);
        if (el) return el;
      }
    }
    return undefined;
  }
}



const document = {
  createElement: (tag: string) => new Element(tag),
  createTextNode: (text: string) => new TextNode(text),
  head: {
    appendChild: function(el: Element) {
      if (el.tag !== 'style') {
        throw new Error("only <style> inserts in head can be emulated");
      }
      insertedCss += el.textContent;
    }
  },
  body: new Element('body')
};

const window: Record<string, any> = {};

type TimeoutItem = {
  func: () => void;
  time: number;
};

let timeouts: TimeoutItem[] = [];
let currentTime: number = 0;

const realSetTimeout = global.setTimeout;

const setTimeout = function(func: () => void, time: number): void {
  timeouts.push({func, time: time + currentTime});
};

export const passTime = async function(ms?: number): Promise<number> {
  let count = 0;
  let targetTime = ms == null ? undefined : currentTime + ms;
  while(true) {
    // Allow all async tasks that are ready (or become ready during another task) to run.
    await new Promise(resolve => realSetTimeout(resolve, 0));

    // If there are no timeouts left, we're done.
    if (!timeouts.length) break;

    // Find the timeout that should occur first
    let smallestIdx = 0;
    for(let idx = 1; idx < timeouts.length; idx++) {
      if (timeouts[idx].time < timeouts[smallestIdx].time) smallestIdx = idx;
    }
    let timeout = timeouts[smallestIdx];

    // If this timeout is not due yet, we're done
    if (targetTime != null && timeout.time > targetTime) break;
    
    // Timeout is due! Remove it from the list, update the currentTime, and fire the callback!
    timeouts.splice(smallestIdx, 1);
    currentTime = timeout.time;
    timeout.func();
    count++;
  }
  currentTime = targetTime == null ? 0 : targetTime;
  return count;
};

const IGNORE_OUTPUT = new Set("tag-> attrs-> events-> childNodes-> parentNode-> class=".split(" "));

class TextNode extends Node {
  textContent: string;

  constructor(textContent: string) {
    super();
    this.textContent = '' + textContent;
    newCount++;
  }

  toString(): string {
    return JSON.stringify(this.textContent);
  }

  remove() {
    this.parentNode?.removeChild(this);
  }
}

function getComputedStyle(el: Element): Record<string, string> {
  return el._style;
}

Object.assign(global, {Node, Element, TextNode, document, window, setTimeout, getComputedStyle});

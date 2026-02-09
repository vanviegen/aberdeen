let insertedCss: string = '';

let newCount: number = 0, changeCount: number = 0;
export const resetCounts = function(): void { newCount = changeCount = 0; };
export const getCounts = function(): { new: number, changed: number } { 
  return { new: newCount, changed: changeCount }; 
};
export const clearBody = function(): void {
  document.body.childNodes.length = 0;
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
}

class Element extends Node {
  tagName: string;
  namespaceURI?: string;
  _style: Record<string, string> = {};
  attrs: Record<string, string> = {};
  events: Record<string, Set<Function>> = {};
  _classList?: {
    add: (...names: string[]) => void;
    remove: (...names: string[]) => void;
    toggle: (name: string, force?: boolean) => void;
  };

  constructor(tag: string, namespaceURI?: string) {
    super();
    this.tagName = tag;
    this.namespaceURI = namespaceURI;
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
    add: (...names: string[]) => void;
    remove: (...names: string[]) => void;
    toggle: (name: string, force?: boolean) => void;
  } {
    return this._classList || (this._classList = {
      add: (...names: string[]) => {
        let set = this._getClassSet();
        for(const name of names) set.add(name);
        this._setClassSet(set);
      },
      remove: (...names: string[]) => {
        let set = this._getClassSet();
        for(const name of names) set.delete(name);
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

  querySelectorAll(selector: string): Element[] {
    const results: Element[] = [];
    this._querySelectorAllRecursive(selector, results);
    return results;
  }

  private _querySelectorAllRecursive(selector: string, results: Element[]): void {
    for (const child of this.childNodes) {
      if (child instanceof Element) {
        if (child.tagName === selector) {
          results.push(child);
        }
        child._querySelectorAllRecursive(selector, results);
      }
    }
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

  get scrollTop(): number {
    return this._scrollTop || 0;
  }
  
  set scrollTop(value: number) {
    this._scrollTop = value;
  }
  
  get scrollLeft(): number {
    return this._scrollLeft || 0;
  }
  
  set scrollLeft(value: number) {
    this._scrollLeft = value;
  }

  public _scrollTop?: number;
  public _scrollLeft?: number;

  toString(): string {
    let arr: string[] = [];
    for(let [symbol, items, toKebab] of [['=', this.attrs, false], ['->', this, false], [':', this.style, true]] as [string, Record<string, any>, boolean][]) {
      for(let key of Object.keys(items).sort()) {
        const outputKey = toKebab ? key.replace(/[A-Z]/g, l => `-${l.toLowerCase()}`) : key;
        const prefix = outputKey + symbol;
        if (key[0] === '_' || IGNORE_OUTPUT.has(prefix)) continue;
        let value = '' + items[key];
        if (value.indexOf(" ") >= 0 || value.indexOf("}") >= 0 || !value.length) value = JSON.stringify(value);
        arr.push(prefix + value);
      }
    }
    for(let child of this.childNodes) arr.push(child.toString());

    const cls = this.attrs['class'] ? "." + this.attrs['class'].replace(/ /g, '.') : '';
    return this.tagName + cls + (arr.length ? `{${arr.join(' ')}}` : '');
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
  createElement: (tag: string) => new Element(tag, 'http://www.w3.org/1999/xhtml'),
  createElementNS: (namespaceURI: string, tag: string) => new Element(tag, namespaceURI),
  createTextNode: (text: string) => new TextNode(text),
  head: new Element('head', 'http://www.w3.org/1999/xhtml'),
  body: new Element('body', 'http://www.w3.org/1999/xhtml')
};

// Browser history and location simulation
class FakeLocation {
  private _href: string = 'http://localhost/';
  
  get href(): string { return this._href; }
  set href(value: string) { 
    if (value.startsWith('/')) {
      // Relative path - convert to absolute URL
      const currentUrl = new URL(this._href);
      this._href = `${currentUrl.protocol}//${currentUrl.host}${value}`;
    } else {
      this._href = value;
    }
  }
  
  get pathname(): string { 
    const url = new URL(this._href);
    return url.pathname;
  }
  set pathname(value: string) {
    const url = new URL(this._href);
    url.pathname = value;
    this._href = url.href;
  }
  
  get search(): string {
    const url = new URL(this._href);
    return url.search;
  }
  set search(value: string) {
    const url = new URL(this._href);
    url.search = value;
    this._href = url.href;
  }
  
  get hash(): string {
    const url = new URL(this._href);
    return url.hash;
  }
  set hash(value: string) {
    const url = new URL(this._href);
    url.hash = value;
    this._href = url.href;
  }
}

class FakeHistory {
  private _state: any = null;
  private _entries: Array<{url: string, state: any}> = [];
  private _index: number = 0;
  
  constructor() {
    // Initialize with current location
    this._entries = [{url: location.href, state: null}];
  }
  
  get state(): any {
    return this._state;
  }
  
  pushState(state: any, title: string, url: string): void {
    // Remove any entries after current index (like real browser behavior)
    this._entries = this._entries.slice(0, this._index + 1);
    
    // Add new entry
    this._entries.push({url, state});
    this._index = this._entries.length - 1;
    this._state = state;
    
    // Update location
    location.href = url;
  }
  
  replaceState(state: any, title: string, url: string): void {
    // state = JSON.parse(JSON.stringify(state)); // clone state
    this._entries[this._index] = {url, state};
    this._state = state;
    
    // Update location
    location.href = url;
  }
  
  go(delta: number): void {
    const newIndex = this._index + delta;
    if (newIndex >= 0 && newIndex < this._entries.length) {
      this._index = newIndex;
      const entry = this._entries[this._index];
      this._state = entry.state;
      location.href = entry.url;
      
      // Trigger popstate event asynchronously
      setTimeout(() => {
        const event = {
          type: 'popstate',
          state: this._state,
          target: window,
          preventDefault: () => {},
          stopPropagation: () => {}
        };
        window.dispatchEvent(event);
      }, 0);
    }
  }
  
  back(): void {
    this.go(-1);
  }
  
  forward(): void {
    this.go(1);
  }
  
  // Test helper methods
  _reset(): void {
    this._state = null;
    this._entries = [{url: location.href, state: null}];
    this._index = 0;
  }
  
  _getLength(): number {
    return this._entries.length;
  }
}

class FakeWindow {
  private _listeners: Record<string, Set<Function>> = {};
  
  addEventListener(type: string, listener: Function): void {
    if (!this._listeners[type]) {
      this._listeners[type] = new Set();
    }
    this._listeners[type].add(listener);
  }
  
  removeEventListener(type: string, listener: Function): void {
    if (this._listeners[type]) {
      this._listeners[type].delete(listener);
    }
  }
  
  dispatchEvent(event: any): void {
    const listeners = this._listeners[event.type];
    if (listeners) {
      for (const listener of listeners) {
        listener.call(this, event);
      }
    }
  }

  matchMedia(query: string): MediaQueryList {
    if (!mediaQueries.has(query)) {
      mediaQueries.set(query, new MediaQueryList(query));
    }
    return mediaQueries.get(query)!;
  }
  
  // Test helper
  _reset(): void {
    this._listeners = {};
  }
}

const location = new FakeLocation();
const history = new FakeHistory();
const window = new FakeWindow();

// Reset function for tests
export const resetBrowserState = function(): void {
  location.href = 'http://localhost/';
  history._reset();
  // Don't reset window listeners as they're registered by the modules being tested
};

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

const queueMicrotask = function(func: () => void): void {
  timeouts.push({func, time: 0});
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
    if (timeout.time > currentTime) currentTime = timeout.time;
    timeout.func();
    count++;
  }
  currentTime = targetTime == null ? 0 : targetTime;
  return count;
};

const IGNORE_OUTPUT = new Set("tagName-> attrs-> events-> childNodes-> parentNode-> class= namespaceURI->".split(" "));

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

// MediaQueryList mock for testing
class MediaQueryList {
  matches: boolean;
  media: string;
  private listeners: Set<(event: any) => void> = new Set();

  constructor(query: string) {
    this.media = query;
    // Check if there's a preset value, otherwise default to light mode
    const preset = mediaQueryPresets.get(query);
    this.matches = preset !== undefined ? preset : (query.includes('dark') ? false : true);
  }

  addEventListener(type: string, listener: (event: any) => void) {
    if (type === 'change') {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type: string, listener: (event: any) => void) {
    if (type === 'change') {
      this.listeners.delete(listener);
    }
  }

  // Test helper to simulate media query changes
  _trigger(matches: boolean) {
    this.matches = matches;
    const event = { matches, media: this.media };
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

const mediaQueries = new Map<string, MediaQueryList>();
const mediaQueryPresets = new Map<string, boolean>();

// Set media query value and trigger change event if already initialized
export function setMediaQuery(query: string, matches: boolean) {
  mediaQueryPresets.set(query, matches);
  // If already created, update it and trigger change
  if (mediaQueries.has(query)) {
    mediaQueries.get(query)!._trigger(matches);
  }
}

const globals = {Node, Element, TextNode, document, window, setTimeout, queueMicrotask, getComputedStyle, location, history, URLSearchParams};
Object.assign(global, globals);
Object.assign(window, globals);

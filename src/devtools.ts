/**
 * Aberdeen developer tools — a live scope-tree inspector.
 *
 * This module is a thin *wrapper* around the core: it re-exports the whole `aberdeen`
 * API and additionally wires up the dev tools. In a dev build the `aberdeen` entry point
 * resolves to the bundle produced from this file, so importing `aberdeen` gives the app
 * the normal API *plus* the tooling. Production resolves to the bare core instead, where
 * all of this is absent.
 *
 * The core emits instrumentation events through a sink we install via `_connectDev`. Since
 * this wrapper loads synchronously (before the app's first `mount()`), the sink is in place
 * in time to capture the initial render — no dynamic import, no event buffering.
 *
 * Event protocol (args after an implicit timestamp):
 *   create   scope, parentScope, Error      — a scope was created
 *   render   scope                          — a scope (re)started rendering
 *   node     scope, node, atScopeLevel      — a DOM node was added by `scope`
 *   read     scope, target, key             — `scope` subscribed to target[key]
 *   schedule scope, key, oldVal, newVal, Error — a change scheduled `scope` to re-render
 *   delete   scope                          — a scope was permanently removed
 *
 * Open with `?abdev=1` or Ctrl/Cmd+Shift+D.
 */
import A, { _setDev } from "./aberdeen.js";
export * from "./aberdeen.js";
export default A;

let tool: DevTools | undefined;

function activate() {
	if (tool) return;
	try { (Error as any).stackTraceLimit = 50; } catch { /* ignore */ }
	const t = new DevTools();
	tool = t;
	// The DevTools instance implements DevHooks; install it last (nothing emits before this).
	_setDev(t);
}

interface DevScope {
	id: number;
	scope: any;
	type: string;
	parent: DevScope | undefined;
	children: DevScope[];
	el?: Element;
	createdTime?: number; // undefined for scopes replayed on connect (they predate the tools)
	createError?: Error;
	renderTime?: number;
	renderError?: Error;
	renderChange?: { index: any; oldData: any; newData: any };
	renderCount: number;
	subs?: Array<[any, any]>;
	topNodes: Node[];
}

// Per-scope-type presentation, keyed by the scope's constructor name.
const TYPES: Record<string, { label: string; color: string }> = {
	RegularScope: { label: "scope", color: "#34d399" },
	MountScope: { label: "mount", color: "#60a5fa" },
	OnEachScope: { label: "onEach", color: "#c084fc" },
	OnEachItemScope: { label: "item", color: "#f472b6" },
	ResultScope: { label: "derive", color: "#fbbf24" },
	SetArgScope: { label: "attr", color: "#94a3b8" },
	RootScope: { label: "root", color: "#64748b" },
};
const typeInfo = (t: string) => TYPES[t] || { label: t, color: "#cbd5e1" };

const STYLE = `
/* Whole overlay tree is click-through (pointer-events inherits); only the dialog opts in. */
:host { all: initial; position: fixed; top: 0; left: 0; pointer-events: none; }
* { box-sizing: border-box; font-family: ui-monospace, monospace; }

.box { position: fixed; pointer-events: none; border-radius: 2px; z-index: 2147483000; }
.box.parent { border: 2px dotted #f59e0b; background: rgba(245,158,11,.06); }
.box.child  { border: 2px solid #34d399; background: rgba(52,211,153,.10); }

.dlg {
	position: fixed; left: 16px; top: 16px; width: 660px; max-width: 95vw; height: 480px; max-height: 90vh;
	background: #1e1b2e; color: #ede9fe; border: 1px solid #6d28d9; border-radius: 8px;
	box-shadow: 0 10px 36px rgba(0,0,0,.6); display: flex; flex-direction: column;
	font-size: 12px; pointer-events: auto; z-index: 2147483600; /* above the highlight boxes */
}
.hd { display: flex; align-items: center; justify-content: space-between; gap: 10px;
	padding: 6px 6px 6px 12px; border-bottom: 1px solid #4c1d95; cursor: move; user-select: none; }
.hd .title { font-weight: bold; color: #c4b5fd; }
.hd .x { cursor: pointer; color: #c4b5fd; padding: 2px 8px; border-radius: 4px; }
.hd .x:hover { background: #6d28d9; color: #fff; }
.cols { display: flex; flex: 1; min-height: 0; }
.left { width: 56%; display: flex; flex-direction: column; min-width: 0; border-right: 1px solid #4c1d95; }
.right { width: 44%; overflow: auto; padding: 8px 10px; }

.menu { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 8px; border-bottom: 1px solid #2e2a40; }
.menu button { font: inherit; background: #2e2a40; color: #ddd6fe; border: 1px solid #4c1d95;
	border-radius: 5px; padding: 3px 8px; cursor: pointer; }
.menu button:hover { background: #6d28d9; }
.menu button.on { background: #6d28d9; color: #fff; }

.tree { flex: 1; overflow: auto; padding: 4px 0; }
.node { white-space: nowrap; display: flex; align-items: center; gap: 6px; padding: 1px 8px; cursor: pointer; }
.node:hover { background: #312a4a; }
.node.sel { background: #4c1d95; }
.node .tw { width: 12px; color: #94a3b8; text-align: center; flex: none; }
.badge { flex: none; font-size: 10px; padding: 0 5px; border-radius: 3px; color: #0b0a12; font-weight: bold; }
.node .loc { color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; }
.node .t { color: #8b82a8; flex: none; }

.right h4 { margin: 0 0 6px; color: #c4b5fd; font-size: 12px; }
.right .row { margin-bottom: 3px; }
.right .k { color: #94a3b8; }
.sec { color: #a78bfa; font-weight: bold; font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
	margin: 12px 0 5px; border-bottom: 1px solid #3a3450; padding-bottom: 3px; }
.loclink { color: #93c5fd; cursor: pointer; text-decoration: underline dotted; }
.loclink:hover { color: #c4d9ff; }
.logbtn { font: inherit; font-size: 10px; background: #2e2a40; color: #ddd6fe; border: 1px solid #4c1d95;
	border-radius: 4px; padding: 0 6px; cursor: pointer; }
.logbtn:hover { background: #6d28d9; }
.stack { white-space: pre-wrap; color: #cbd5e1; font-size: 11px; line-height: 1.5; margin-top: 2px;
	border-left: 2px solid #3a3450; padding-left: 6px; }
.muted { color: #64748b; }
.reads .key { color: #fbbf24; } .reads .val { color: #93c5fd; }
.empty { color: #64748b; padding: 16px; text-align: center; }
`;

// Remembered across close/open within a single pageview (not persisted across reloads).
let lastPos: { left: number; top: number } | undefined;

class DevTools {
	// --- reconstructed model --------------------------------------------------
	root: DevScope = { id: 0, scope: null, type: "RootScope", parent: undefined, children: [], createdTime: 0, renderCount: 0, topNodes: [] };
	scopeMap = new WeakMap<any, DevScope>();
	pending = new WeakMap<any, { change: any; error: Error }>();
	nodeMap = new WeakMap<Node, DevScope>();
	elOwner = new WeakMap<Element, DevScope>();
	origin = -1;
	nextId = 1;

	// --- UI -------------------------------------------------------------------
	host = document.createElement("div");
	shadow: ShadowRoot;
	overlay: HTMLElement;
	dlg!: HTMLElement;
	treeEl!: HTMLElement;
	rightEl!: HTMLElement;
	menuEl!: HTMLElement;

	mode: "tree" | "recent" = "tree";
	selectedId: number | undefined;
	collapsed = new Set<number>();
	recentSince = 0;
	boxes: HTMLElement[] = [];
	thaw: (() => void) | undefined; // set while "freeze redraws" is on (holds A.freeze()'s releaser)
	altPressed = false;
	rebuildScheduled = false;
	lastX = -1;
	lastY = -1;

	constructor() {
		this.shadow = this.host.attachShadow({ mode: "open" });
		const style = document.createElement("style");
		style.textContent = STYLE;
		this.shadow.appendChild(style);
		this.overlay = eln("div");
		this.shadow.appendChild(this.overlay);
		this.buildDialog();
		document.body.appendChild(this.host);
		this.positionDialog();

		window.addEventListener("keydown", this.onKeyDown, true);
		window.addEventListener("keyup", this.onKeyUp, true);
		window.addEventListener("blur", this.onBlur, true);
		window.addEventListener("pointermove", this.onPointerMove, true);
		window.addEventListener("scroll", this.reposition, true);
		window.addEventListener("resize", this.reposition, true);
	}

	destroy() {
		this.savePos();
		window.removeEventListener("keydown", this.onKeyDown, true);
		window.removeEventListener("keyup", this.onKeyUp, true);
		window.removeEventListener("blur", this.onBlur, true);
		window.removeEventListener("pointermove", this.onPointerMove, true);
		window.removeEventListener("scroll", this.reposition, true);
		window.removeEventListener("resize", this.reposition, true);
		this.clearBoxes();
		if (this.thaw) this.thaw(); // release any outstanding freeze
		this.host.remove();
		tool = undefined;
		_setDev(undefined); // tell the core to stop emitting events (drops `dev`)
	}

	// --- DevHooks: the core calls these (the instance is passed to `_setDev`) -------------
	// Relative time (ms since the first event), captured when the hook fires.
	private stamp(): number {
		const now = performance.now();
		if (this.origin < 0) this.origin = now;
		return now - this.origin;
	}

	create(scope: any, parentScope: any, err: Error | undefined) {
		const parent = this.scopeMap.get(parentScope) || this.root;
		const d: DevScope = {
			id: ++this.nextId, scope, type: scope.constructor.name, parent, children: [],
			el: scope.el instanceof Element ? scope.el : undefined,
			createdTime: err ? this.stamp() : undefined, createError: err, renderCount: 0, topNodes: [],
		};
		this.scopeMap.set(scope, d);
		parent.children.push(d);
		if (d.el) this.elOwner.set(d.el, d);
		this.scheduleRebuild();
	}

	render(scope: any) {
		const d = this.scopeMap.get(scope);
		if (!d) return;
		// Every render (initial or triggered) rebuilds the scope's children, nodes and reads.
		d.children.length = 0;
		d.topNodes = [];
		d.subs = [];
		// Only a re-render scheduled by a proxy change is a "trigger"; the initial render
		// (no pending change) is not — leave the trigger fields unset for it.
		const p = this.pending.get(scope);
		if (p) {
			d.renderTime = this.stamp();
			d.renderCount++;
			d.renderError = p.error;
			d.renderChange = p.change;
			this.pending.delete(scope);
		}
		this.scheduleRebuild();
	}

	// The triggering change/stack is recorded against the scope and consumed by `render`.
	schedule(scope: any, index: any, oldData: any, newData: any, err: Error) {
		this.pending.set(scope, { change: { index, oldData, newData }, error: err });
	}

	// Nodes don't change the tree itself; the maps/topNodes are read lazily on hover/select.
	node(scope: any, node: Node, top: boolean) {
		const d = this.scopeMap.get(scope);
		if (!d) return;
		this.nodeMap.set(node, d);
		if (top) d.topNodes.push(node);
	}

	read(scope: any, target: any, index: any) {
		const d = this.scopeMap.get(scope);
		if (d) { (d.subs ||= []); if (d.subs.length < 500) d.subs.push([target, index]); }
	}

	delete(scope: any) {
		const d = this.scopeMap.get(scope);
		if (!d) return;
		if (d.parent) { const i = d.parent.children.indexOf(d); if (i >= 0) d.parent.children.splice(i, 1); }
		this.scopeMap.delete(scope);
		this.scheduleRebuild();
	}

	// --- dialog skeleton ------------------------------------------------------
	buildDialog() {
		this.dlg = eln("div", "dlg");
		const hd = eln("div", "hd");
		hd.appendChild(eln("div", "title", "Aberdeen dev tools"));
		const x = eln("div", "x", "✕");
		x.addEventListener("click", () => this.destroy());
		hd.appendChild(x);
		this.dlg.appendChild(hd);
		this.setupDrag(hd);

		const cols = eln("div", "cols");
		const left = eln("div", "left");
		this.menuEl = eln("div", "menu");
		this.treeEl = eln("div", "tree");
		left.appendChild(this.menuEl);
		left.appendChild(this.treeEl);
		this.rightEl = eln("div", "right");
		cols.appendChild(left);
		cols.appendChild(this.rightEl);
		this.dlg.appendChild(cols);
		this.shadow.appendChild(this.dlg);
		this.buildMenu();
	}

	positionDialog() {
		const m = 16;
		const w = this.dlg.offsetWidth, h = this.dlg.offsetHeight;
		const left = lastPos ? lastPos.left : Math.max(m, window.innerWidth - w - m);
		const top = lastPos ? lastPos.top : Math.max(m, window.innerHeight - h - m);
		this.dlg.style.left = left + "px";
		this.dlg.style.top = top + "px";
	}

	savePos() { lastPos = { left: this.dlg.offsetLeft, top: this.dlg.offsetTop }; }

	buildMenu() {
		this.menuEl.textContent = "";
		const btn = (label: string, on: boolean, fn: () => void) => {
			const b = eln("button", on ? "on" : undefined, label);
			b.addEventListener("click", () => { fn(); this.buildMenu(); });
			this.menuEl.appendChild(b);
		};
		btn("Tree", this.mode === "tree", () => { this.mode = "tree"; this.rebuild(); });
		btn("Recent", this.mode === "recent", () => { this.mode = "recent"; this.rebuild(); });
		btn("Freeze", !!this.thaw, () => {
			if (this.thaw) { this.thaw(); this.thaw = undefined; }
			else this.thaw = A.freeze();
		});
		if (this.mode === "recent") btn("Clear", false, () => { this.recentSince = this.lastEventTime(); this.rebuild(); });
		this.menuEl.appendChild(eln("span", "muted", "  Alt-hover an element to select its scope"));
	}

	lastEventTime(): number {
		let max = 0;
		const walk = (d: DevScope) => { if (d.renderTime != null && d.renderTime > max) max = d.renderTime; d.children.forEach(walk); };
		this.root.children.forEach(walk);
		return max;
	}

	// --- live tree ------------------------------------------------------------
	scheduleRebuild() {
		if (this.rebuildScheduled) return;
		this.rebuildScheduled = true;
		requestAnimationFrame(() => { this.rebuildScheduled = false; this.rebuild(); });
	}

	rebuild() {
		const scrollTop = this.treeEl.scrollTop;
		this.treeEl.textContent = "";
		if (this.mode === "tree") {
			for (const child of this.root.children) this.renderNode(child, 0);
			if (!this.root.children.length) this.treeEl.appendChild(eln("div", "empty", "No live scopes yet."));
		} else {
			this.renderRecent();
		}
		this.treeEl.scrollTop = scrollTop;
		if (this.selectedId != null) {
			const d = this.findScope(this.selectedId);
			if (d) { this.renderDetails(d); this.highlight(d); }
			else { this.selectedId = undefined; this.clearBoxes(); this.rightEl.textContent = ""; }
		}
	}

	renderRecent() {
		const all: DevScope[] = [];
		const walk = (d: DevScope) => { if (d.renderTime != null && d.renderTime > this.recentSince) all.push(d); d.children.forEach(walk); };
		this.root.children.forEach(walk);
		all.sort((x, y) => (y.renderTime as number) - (x.renderTime as number));
		if (!all.length) { this.treeEl.appendChild(eln("div", "empty", "No re-renders observed yet.")); return; }
		for (const d of all.slice(0, 60)) {
			const row = eln("div", "node" + (d.id === this.selectedId ? " sel" : ""));
			row.dataset.id = String(d.id);
			row.style.paddingLeft = "8px";
			const info = typeInfo(d.type);
			const badge = eln("span", "badge", info.label); badge.style.background = info.color;
			row.appendChild(badge);
			row.appendChild(eln("span", "loc", d.renderChange ? changeSummary(d.renderChange) : appFrame(d.createError) || d.type));
			row.appendChild(eln("span", "t", ms(d.renderTime as number, 0)));
			row.addEventListener("click", () => this.select(d));
			row.addEventListener("pointerenter", () => this.highlight(d));
			row.addEventListener("pointerleave", () => this.highlight(this.selectedId != null ? this.findScope(this.selectedId) : undefined));
			this.treeEl.appendChild(row);
		}
	}

	renderNode(d: DevScope, depth: number) {
		const row = eln("div", "node" + (d.id === this.selectedId ? " sel" : ""));
		row.dataset.id = String(d.id);
		row.style.paddingLeft = (8 + depth * 14) + "px";
		const hasKids = d.children.length > 0;
		const tw = eln("div", "tw", hasKids ? (this.collapsed.has(d.id) ? "▸" : "▾") : "");
		if (hasKids) tw.addEventListener("click", (e) => {
			e.stopPropagation();
			if (this.collapsed.has(d.id)) this.collapsed.delete(d.id); else this.collapsed.add(d.id);
			this.rebuild();
		});
		row.appendChild(tw);

		const info = typeInfo(d.type);
		const badge = eln("span", "badge", info.label);
		badge.style.background = info.color;
		row.appendChild(badge);

		row.appendChild(eln("span", "loc", appFrame(d.createError) || (d.createError === undefined ? "(pre-open)" : "(internal)")));
		if (d.createdTime != null) row.appendChild(eln("span", "t", ms(d.createdTime, 0)));

		row.addEventListener("click", () => this.select(d));
		row.addEventListener("pointerenter", () => this.highlight(d));
		row.addEventListener("pointerleave", () => this.highlight(this.selectedId != null ? this.findScope(this.selectedId) : undefined));
		this.treeEl.appendChild(row);

		if (hasKids && !this.collapsed.has(d.id)) for (const c of d.children) this.renderNode(c, depth + 1);
	}

	findScope(id: number, node: DevScope = this.root): DevScope | undefined {
		if (node.id === id) return node;
		for (const c of node.children) { const r = this.findScope(id, c); if (r) return r; }
		return undefined;
	}

	// --- selection + details --------------------------------------------------
	select(d: DevScope | undefined) {
		this.selectedId = d ? d.id : undefined;
		for (const el of this.treeEl.querySelectorAll(".node.sel")) el.classList.remove("sel");
		if (!d) { this.rightEl.textContent = ""; this.clearBoxes(); return; }
		const row = this.treeEl.querySelector(`.node[data-id="${d.id}"]`);
		if (row) { row.classList.add("sel"); (row as HTMLElement).scrollIntoView({ block: "nearest" }); }
		this.renderDetails(d);
		this.highlight(d);
	}

	renderDetails(d: DevScope) {
		const r = this.rightEl;
		r.textContent = "";
		const info = typeInfo(d.type);
		const head = eln("h4");
		const badge = eln("span", "badge", info.label); badge.style.background = info.color;
		head.appendChild(badge); head.appendChild(document.createTextNode(" " + d.type));
		r.appendChild(head);

		// --- State: what the scope currently is ---
		r.appendChild(kv("owned nodes", String(d.topNodes.length)));
		r.appendChild(kv("child scopes", String(d.children.length)));
		if (d.type === "OnEachItemScope" && d.scope) r.appendChild(renderItemValue(d.scope));
		if (d.subs && d.subs.length) r.appendChild(this.renderReads(d));

		// --- Creation: when/where the scope was made ---
		r.appendChild(section("Creation"));
		r.appendChild(kv("time", d.createdTime != null ? ms(d.createdTime) : "unknown"));
		r.appendChild(stackRow("stack", d.createError, "unknown"));
		if (!d.createError) r.appendChild(eln("div", "muted", "Reload with ?abdev=1 to capture creation stacks."));

		// --- Last trigger: what most recently re-ran the scope ---
		r.appendChild(section("Last trigger"));
		if (d.renderTime != null) {
			r.appendChild(kv("time", ms(d.renderTime) + " (" + d.renderCount + "×)"));
			if (d.renderChange) r.appendChild(kv("change", changeSummary(d.renderChange)));
			r.appendChild(stackRow("stack", d.renderError, "(no application frame)"));
		} else {
			r.appendChild(eln("div", "muted", "not triggered yet"));
		}
	}

	renderReads(d: DevScope): HTMLElement {
		const wrap = eln("div", "row reads");
		wrap.appendChild(eln("div", "k", "observing:"));
		const groups = new Map<any, Set<any>>();
		for (const [obj, key] of d.subs!) {
			let s = groups.get(obj); if (!s) groups.set(obj, (s = new Set())); s.add(key);
		}
		if (!groups.size) { wrap.appendChild(eln("div", "muted", "(none)")); return wrap; }
		let n = 0;
		for (const [obj, keys] of groups) {
			if (n++ > 16) { wrap.appendChild(eln("div", "muted", "…")); break; }
			const line = eln("div");
			line.appendChild(document.createTextNode("{ "));
			let first = true;
			for (const k of [...keys].slice(0, 16)) {
				if (!first) line.appendChild(document.createTextNode(", ")); first = false;
				line.appendChild(eln("span", "key", readKey(k)));
				// Symbol keys (`*` / `size`) are meta-subscriptions with no scalar value to show.
				if (typeof k !== "symbol") {
					line.appendChild(document.createTextNode("="));
					let v: any; try { v = (obj as any)[k]; } catch { v = "?"; }
					line.appendChild(eln("span", "val", preview(v)));
				}
			}
			line.appendChild(document.createTextNode(" }"));
			wrap.appendChild(line);
		}
		return wrap;
	}

	// --- DOM highlight --------------------------------------------------------
	highlight(d: DevScope | undefined) {
		this.clearBoxes();
		if (!d) return;
		// Dotted orange: the element this scope renders *into* (its `el`).
		if (d.el instanceof Element) this.box(d.el.getBoundingClientRect(), "parent");
		// Green: what this scope produced — its own elements plus each child scope's region.
		for (const n of d.topNodes) if (n instanceof Element) this.box(n.getBoundingClientRect(), "child");
		for (const c of d.children) this.box(regionRect(c), "child");
	}

	box(rect: DOMRect | undefined, kind: string) {
		if (!rect || (!rect.width && !rect.height)) return;
		const b = eln("div", "box " + kind);
		Object.assign(b.style, { left: rect.left + "px", top: rect.top + "px", width: rect.width + "px", height: rect.height + "px" });
		this.overlay.appendChild(b);
		this.boxes.push(b);
	}

	clearBoxes() { for (const b of this.boxes) b.remove(); this.boxes.length = 0; }

	reposition = () => {
		const d = this.selectedId != null ? this.findScope(this.selectedId) : undefined;
		if (d) this.highlight(d);
	};

	// --- input ----------------------------------------------------------------
	overUI(t: EventTarget | null): boolean { return !(t instanceof Node) || t === this.host || this.host.contains(t); }

	onKeyDown = (e: KeyboardEvent) => {
		if (e.key === "Alt") { this.altPressed = true; this.resolveAt(this.lastX, this.lastY); }
		else if (e.key === "Escape") { e.preventDefault(); this.destroy(); }
	};
	onKeyUp = (e: KeyboardEvent) => { if (e.key === "Alt") this.altPressed = false; };
	onBlur = () => { this.altPressed = false; };

	onPointerMove = (e: PointerEvent) => {
		this.lastX = e.clientX; this.lastY = e.clientY;
		if (this.altPressed) this.resolveAt(this.lastX, this.lastY);
	};

	resolveAt(x: number, y: number) {
		if (x < 0) return;
		const target = document.elementFromPoint(x, y);
		if (!target || this.overUI(target)) return;
		let node: Node | null = target;
		let d: DevScope | undefined;
		while (node) {
			// Prefer the scope that renders into this element (orange `el`); fall back to
			// the scope that created the node (green). Whichever is found first walking up.
			d = (node instanceof Element ? this.elOwner.get(node) : undefined) || this.nodeMap.get(node);
			if (d) break;
			node = node.parentNode;
		}
		if (d && d.id !== this.selectedId) this.select(d);
	}

	// --- dragging -------------------------------------------------------------
	setupDrag(handle: HTMLElement) {
		let sx = 0, sy = 0, ox = 0, oy = 0, down = false;
		handle.addEventListener("pointerdown", (e) => {
			if ((e.target as HTMLElement).classList.contains("x")) return;
			down = true; sx = e.clientX; sy = e.clientY; ox = this.dlg.offsetLeft; oy = this.dlg.offsetTop;
			handle.setPointerCapture(e.pointerId);
		});
		handle.addEventListener("pointermove", (e) => {
			if (!down) return;
			this.dlg.style.left = Math.max(0, Math.min(window.innerWidth - 80, ox + e.clientX - sx)) + "px";
			this.dlg.style.top = Math.max(0, Math.min(window.innerHeight - 24, oy + e.clientY - sy)) + "px";
		});
		handle.addEventListener("pointerup", () => { down = false; this.savePos(); });
	}
}

// --- helpers ----------------------------------------------------------------

function eln(tag: string, cls?: string, text?: string): HTMLElement {
	const e = document.createElement(tag);
	if (cls) e.className = cls;
	if (text != null) e.textContent = text;
	return e;
}

function kv(k: string, v: string): HTMLElement {
	const row = eln("div", "row");
	row.appendChild(eln("span", "k", k + ": "));
	row.appendChild(document.createTextNode(v));
	return row;
}

function section(title: string): HTMLElement {
	return eln("div", "sec", title);
}

// Shows a compact "file:line" (like the tree) that expands to the full stack on click.
function stackRow(label: string, err: Error | undefined, emptyMsg: string): HTMLElement {
	const row = eln("div", "row");
	row.appendChild(eln("span", "k", label + ": "));
	const full = formatStack(err && err.stack);
	if (!full) { row.appendChild(eln("span", "muted", emptyMsg)); return row; }
	const link = eln("span", "loclink", appFrame(err) || "(internal)");
	const pre = eln("div", "stack");
	pre.textContent = full;
	pre.style.display = "none";
	link.addEventListener("click", () => { pre.style.display = pre.style.display ? "" : "none"; });
	row.appendChild(link);
	row.appendChild(pre);
	return row;
}

// Renders a subscription/change key. The only symbols Aberdeen uses as keys are
// ANY_SYMBOL (a wildcard over the whole collection) and MAP_SIZE_SYMBOL (its size/length).
function readKey(k: any): string {
	if (typeof k !== "symbol") return String(k);
	return k.description === "any" ? "*" : k.description === "mapSize" ? "size" : (k.description || "?");
}

function changeSummary(c: { index: any; oldData: any; newData: any }): string {
	return `${readKey(c.index)}: ${preview(c.oldData)} → ${preview(c.newData)}`;
}

// Shows the value an onEach *item* scope is iterating (`parent.target[itemIndex]`), plus a
// button to log it to the console for exploration.
function renderItemValue(scope: any): HTMLElement {
	const target = scope.parent?.target;
	const idx = scope.itemIndex;
	const isSet = target instanceof Set;
	const value = isSet ? idx : target instanceof Map ? target.get(idx) : target ? target[idx] : undefined;

	const wrap = eln("div", "row");
	if (!isSet) wrap.appendChild(kv("key", String(idx)));
	const line = eln("div");
	line.appendChild(eln("span", "k", "value: "));
	line.appendChild(eln("span", "val", preview(value)));
	const btn = eln("button", "logbtn", "to console");
	btn.addEventListener("click", () => console.log(value));
	line.appendChild(document.createTextNode(" "));
	line.appendChild(btn);
	wrap.appendChild(line);
	return wrap;
}

// Milliseconds with a thousands separator, e.g. "+1,234.5ms".
function ms(t: number, dp = 1): string {
	return "+" + t.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp }) + "ms";
}

function preview(v: any): string {
	if (v === null) return "null";
	if (typeof v === "string") return JSON.stringify(v.length > 30 ? v.slice(0, 30) + "…" : v);
	if (typeof v === "object") return Array.isArray(v) ? `[${v.length}]` : "{…}";
	if (typeof v === "function") return "fn";
	return String(v);
}

/** All DOM nodes a scope produced (its own top-level nodes plus its descendants'). */
function deepNodes(d: DevScope, out: Node[] = []): Node[] {
	for (const n of d.topNodes) out.push(n);
	for (const c of d.children) deepNodes(c, out);
	return out;
}

/** Bounding rect covering a scope's whole DOM region (viewport coords). */
function regionRect(d: DevScope): DOMRect | undefined {
	let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
	for (const n of deepNodes(d)) {
		if (!(n instanceof Element)) continue;
		const q = n.getBoundingClientRect();
		if (!q.width && !q.height) continue;
		l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
	}
	if (l === Infinity) return undefined;
	return new DOMRect(l, t, r - l, b - t);
}

/** First application stack frame as "file:line", skipping Aberdeen's own frames. */
function appFrame(err: Error | undefined): string {
	const s = formatStack(err && err.stack);
	if (!s) return "";
	const first = s.split("\n")[0];
	const m = first.match(/([^\/\\(]+):(\d+):\d+\)?$/);
	return m ? `${m[1]}:${m[2]}` : first.replace(/^at\s+/, "");
}

/** Drop the "Error" header and Aberdeen's own frames, leaving application frames. */
function formatStack(stack: string | undefined): string {
	if (!stack) return "";
	const origin = location.protocol + "//" + location.host; // strip for brevity, leaving paths relative
	return stack.split("\n").map((l) => l.trim().split(origin).join("")).filter((l) =>
		(l.startsWith("at ") || l.includes("@")) &&
		// In dev builds the core + this tool are bundled together as aberdeen.dev.js.
		!/aberdeen(\.dev)?\.[jt]s|devtools\.[jt]s/.test(l)
	).join("\n");
}

// Bootstrap — placed at the end so `activate()` runs after `DevTools` is initialized. The
// wrapper module evaluates synchronously when the app imports `aberdeen`, before its first
// `mount()`, so `?abdev=1` captures the initial render.
if (typeof window !== "undefined" && typeof document !== "undefined") {
	if (/[?&]abdev=1\b/.test(location.search)) activate();
	window.addEventListener("keydown", (e) => {
		if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "D" || e.key === "d")) {
			e.preventDefault();
			if (tool) tool.destroy(); else activate(); // toggle
		}
	});
}

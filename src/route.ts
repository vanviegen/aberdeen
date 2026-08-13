import A, {leakScope} from "./aberdeen.js";

type NavType = "load" | "back" | "forward" | "go" | "push";

/**
* The class for the global `route` object.
*/
export interface Route {
	/** The current path of the URL as a string. For instance `"/"` or `"/users/123/feed"`. Paths are normalized to always start with a `/` and never end with a `/` (unless it's the root path). */
	path: string;
	/** An convenience array containing path segments, mapping to `path`. For instance `[]` (for `"/"`) or `['users', '123', 'feed']` (for `"/users/123/feed"`). */
	p: string[];
	/** The hash fragment including the leading `#`, or an empty string. For instance `"#my_section"` or `""`. */
	hash: string;
	/** The query string interpreted as search parameters. So `"a=x&b=y"` becomes `{a: "x", b: "y"}`. */
	search: Record<string, string>;
	/** An object to be used for any additional data you want to associate with the current page. Data should be JSON-compatible. */
	state: Record<string, any>;
	/** The navigation depth of the current session. Starts at 1. Writing to this property has no effect. */
	depth: number;
	/** The navigation action that got us to this page. Writing to this property has no effect.
	- `"load"`: An initial page load.
	- `"back"` or `"forward"`: When we navigated backwards or forwards in the stack.
	- `"go"`: When we added a new page on top of the stack.
	- `"push"`: When we added a new page on top of the stack, merging with the current page.
	Mostly useful for page transition animations. Writing to this property has no effect.
	*/
	nav: NavType;
}

let log: (...args: any) => void = () => {};

/**
 * Configure logging on route changes.
 * @param value `true` to enable logging to console, `false` to disable logging, or a custom logging function. Defaults to `false`.
 */
export function setLog(value: boolean | ((...args: any[]) => void)) {
	if (value === true) {
		log = console.log.bind(console, 'aberdeen router');
	} else if (value === false) {
		log = () => {};
	} else {
		log = value;
	}
}

declare const ABERDEEN_FAKE_WINDOW: Window | undefined;
const windowE = typeof ABERDEEN_FAKE_WINDOW !== 'undefined'? ABERDEEN_FAKE_WINDOW : window;
const locationE = windowE.location;
const historyE = windowE.history;

function getRouteFromBrowser(): Route {
	return toCanonRoute({
		path: locationE.pathname,
		hash: locationE.hash,
		search: Object.fromEntries(new URLSearchParams(locationE.search)),
		state: 	historyE.state?.state || {},
	}, "load", (historyE.state?.stack?.length || 0) + 1);
}

/**
* Deep compare `a` and `b`. If `partial` is true, objects contained in `b` may be a subset
* of their counterparts in `a` and still be considered equal.
*/
function equal(a: any, b: any, partial: boolean): boolean {
	if (a===b) return true;
	if (typeof a !== "object" || !a || typeof b !== "object" || !b) return false; // otherwise they would have been equal
	if (a.constructor !== b.constructor) return false;
	if (b instanceof Array) {
		if (a.length !== b.length) return false;
		for(let i = 0; i < b.length; i++) {
			if (!equal(a[i], b[i], partial)) return false;
		}
	} else {
		for(const k of Object.keys(b)) {
			if (!equal(a[k], b[k], partial)) return false;
		}
		if (!partial) {
			for(const k of Object.keys(a)) {
				if (!b.hasOwnProperty(k)) return false;
			}
		}
	}
	return true;
}

function getUrl(target: Route) {
	const search = new URLSearchParams(target.search).toString();
	return (search ? `${target.path}?${search}` : target.path) + target.hash;
}

/**
 * A navigation guard, as registered by {@link setGuard}: called with the route
 * we're about to move to and the route we're at now, before the change is
 * applied. Return `false` — or a promise resolving to `false` — to veto the
 * change; any other return value lets it through.
 */
export type RouteGuard = (to: Route, from: Route) => boolean | Promise<boolean>;

let guard: RouteGuard | null = null;
/** Set while an async guard verdict is being awaited; other change attempts are refused meanwhile. */
let guardPending = false;
/** Set when a popstate arrived while a verdict was pending, so we re-examine the browser afterwards. */
let reconcileNeeded = false;
/** Bumped on every popstate, letting an async popstate verdict detect that it has been overtaken. */
let popSeq = 0;
/** The last route that was actually applied: what a veto restores, and the guard's `from` argument. */
let approved: Route;
/** Resolvers of promises returned by `back()`/`up()`, awaiting the outcome of the travel they scheduled. */
let travelWaiters: ((ok: boolean) => void)[] = [];

/**
 * Register a navigation guard, or unregister it by passing `null`. At most one
 * guard can be registered at a time; the previously registered guard (or
 * `null`) is returned, so a temporary guard can be chained or restored later.
 *
 * The guard is consulted before any *navigation* is applied — any change of
 * history entry, meaning {@link go} / {@link push}, {@link back} / {@link up},
 * and the browser's own back/forward buttons (`popstate`) — as well as before
 * in-place changes to `path` or `search` through the {@link current} proxy.
 * Same-page tweaks — mutating `current.state` (like {@link persistScroll}
 * saving scroll positions) or `current.hash`, and the browser jumping to a
 * `#fragment` — are applied without consulting the guard.
 *
 * When the guard returns (a promise of) `false`:
 *
 * - a `go()`/`back()`/`up()` call does nothing, and reports `false`;
 * - a browser back/forward is undone, by travelling the exact number of
 *   history entries back to where we were — the depth delta is known, so even
 *   a multi-entry jump (a long-press on the back button) restores correctly;
 * - a direct `route.current` mutation is reverted in place. With an *async*
 *   guard the proxy is reverted while the verdict is pending and re-applied if
 *   it passes — prefer `go()` for changes a guard may need to think about.
 *
 * While a verdict is pending, other attempted route changes are refused. A
 * browser navigation arriving in the meantime supersedes the change the guard
 * was being asked about — that change is dropped (reporting `false`) and,
 * once the verdict settles, the guard is consulted about wherever the browser
 * has ended up instead.
 *
 * The guard is invoked outside of any reactive scope (reading proxied state in
 * it doesn't subscribe anything), and receives plain copies of the routes, so
 * mutating them has no effect. A guard that throws counts as a veto. A guard
 * may itself navigate, enabling the redirect pattern:
 *
 * ```js
 * route.setGuard(to => {
 *     if (to.path.startsWith('/admin') && !user.isAdmin) {
 *         route.go('/login'); // recursively consults (and passes) the guard
 *         return false;
 *     }
 *     return true;
 * });
 * ```
 */
export function setGuard(newGuard: RouteGuard | null): RouteGuard | null {
	const prev = guard;
	guard = newGuard;
	return prev;
}

/**
 * Does moving from `a` to `b` count as a navigation, as far as the guard is
 * concerned? A `depth` change catches every change of history entry; `path`
 * and `search` catch in-place location changes. In-place `state` and `hash`
 * tweaks are same-page changes and don't count.
 */
function isNavigation(a: Route, b: Route): boolean {
	return a.depth !== b.depth || a.path !== b.path || !equal(a.search, b.search, false);
}

/**
 * Ask the guard about moving to `to`. Returns a plain boolean whenever that can
 * be decided synchronously (no guard registered, no navigation-worthy change,
 * or a synchronous verdict), so the common case stays synchronous; a promise
 * otherwise.
 */
function checkGuard(to: Route): boolean | Promise<boolean> {
	const g = guard;
	// Same-page changes are never guarded, not even while a verdict is pending.
	if (!g || !isNavigation(approved, to)) return true;
	if (guardPending) return false; // One verdict at a time; concurrent attempts are refused.
	let verdict: boolean | Promise<boolean>;
	try {
		// peek(): a guard reading proxied state must not subscribe whatever scope we may be in.
		verdict = A.peek(() => g(A.clone(to), A.clone(approved)));
	} catch (e) {
		console.error(e);
		return false;
	}
	if (typeof verdict !== "object") return verdict !== false;
	guardPending = true;
	const settle = (ok: boolean) => {
		guardPending = false;
		if (reconcileNeeded) {
			reconcileNeeded = false;
			// The browser moved while we were asking, superseding the change this
			// verdict was about: refuse it, and re-examine where the browser is
			// now — in a macrotask, so the refused asker settles first.
			setTimeout(onPopState, 0);
			return false;
		}
		return ok;
	};
	return verdict.then(
		(ok) => settle(ok !== false),
		(e) => { console.error(e); return settle(false); },
	);
}

function flushTravelWaiters(ok: boolean): void {
	const waiters = travelWaiters;
	travelWaiters = [];
	for (const resolve of waiters) resolve(ok);
}

/** Discard any back()/up() travel that hasn't landed yet: it was superseded by another navigation. */
function cancelTravel(): void {
	pendingGoOffset = 0;
	flushTravelWaiters(false);
}

function toCanonRoute(target: Partial<Route>, nav: NavType, depth: number): Route {
	let path = target.path || (target.p || []).join("/") || "/";
	path = (""+path).replace(/\/+$/, "");
	if (!path.startsWith("/")) path = `/${path}`;
	
	return {
		path,
		hash: target.hash && target.hash !=="#" ? (target.hash.startsWith("#") ? target.hash : "#" + target.hash) : "",
		p: path.length > 1 ? path.slice(1).replace(/\/+$/, "").split("/") : [],
		nav,
		search: typeof target.search === 'object' && target.search ? A.clone(target.search) : {},
		state: typeof target.state === 'object' && target.state ? A.clone(target.state) : {},
		depth,
	};
}


type RouteTarget = string | (string|number)[] | Partial<Omit<Omit<Route,"p">,"search"> & {
	/** An convenience array containing path segments, mapping to `path`. For instance `[]` (for `"/"`) or `['users', 123, 'feed']` (for `"/users/123/feed"`). Values may be integers but will be converted to strings.*/
	p: (string|number)[],
	/** The query string interpreted as search parameters. So `"a=x&b=y"` becomes `{a: "x", b: "y", c: 42}`. Values may be integers but will be converted to strings. */
	search: Record<string,string|number>,
}>;

function targetToPartial(target: RouteTarget, undefinedOnExternal: true): Partial<Route> | undefined;
function targetToPartial(target: RouteTarget): Partial<Route>;


function targetToPartial(target: RouteTarget, undefinedOnExternal: boolean=false) {
	// Convert shortcut values to objects
	if (typeof target === 'string') {
		// Parse using URL to handle both absolute and relative paths correctly		
		const url = new URL(target, locationE.href);
		if (url.host !== locationE.host) {
			if (undefinedOnExternal) return;
			throw new Error(`Unexpected external URL: ${url.host} != ${locationE.host}`);
		}
		target = {
			path: url.pathname,
			search: Object.fromEntries(url.searchParams),
			hash: url.hash,
		};
	} else if (target instanceof Array) {
		target = {p: target};
	}
	// Convert numbers in p and search to strings
	if (target.p) {
		target.p = target.p.map(String);
	}
	if (target.search) {
		for(const key of Object.keys(target.search)) {
			target.search[key] = String(target.search[key]);
		}
	}
	return target as Partial<Route>;
}


/**
* Navigate to a new URL by pushing a new history entry.
* 
* Note that this happens synchronously, immediately updating `route` and processing any reactive updates based on that.
* 
* @param target A subset of the {@link Route} properties to navigate to. If neither `p` nor `path` is given, the current path is used. For other properties, an empty/default value is assumed if not given. For convenience:
* - You may pass a string instead of an object, which is interpreted as the `path`.
* - You may pass an array instead of an object, which is interpreted as the `p` array.
* - If you pass `p`, it may contain numbers, which will be converted to strings.
* - If you pass `search`, its values may be numbers, which will be converted to strings.
* 
* Examples:
* ```js
* // Navigate to /users/123
* route.go("/users/123");
*
* // Navigate to /users/123?tab=feed#top
* route.go({p: ["users", 123], search: {tab: "feed"}, hash: "top"});
* ```
*
* @returns Whether the navigation was performed — `false` when a guard (see
* {@link setGuard}) vetoed it. Without a guard, or with one that answers
* synchronously, this stays a synchronous `boolean`; an async guard makes it a
* promise, and the navigation is applied when (and if) that verdict passes.
* Beware that a promise is truthy: `await` the result before branching on it,
* unless you know the guard answers synchronously.
*/
export function go(target: RouteTarget, nav: NavType = "go"): boolean | Promise<boolean> {
	const partial = targetToPartial(target);
	const apply = (): true => {
		// This navigation supersedes any back()/up() travel still under way.
		cancelTravel();
		const stack: string[] = historyE.state?.stack || [];

		prevStack = stack.concat(JSON.stringify(A.unproxy(current)));

		const newRoute: Route = toCanonRoute(partial, nav, prevStack.length + 1);
		approved = newRoute;
		A.copy(current, newRoute);

		log(nav, newRoute);
		historyE.pushState({state: newRoute.state, stack: prevStack}, "", getUrl(newRoute));

		A.runQueue();
		return true;
	};
	if (!guard) return apply();
	const stack: string[] = historyE.state?.stack || [];
	const verdict = checkGuard(toCanonRoute(partial, nav, stack.length + 2));
	if (verdict === true) return apply();
	if (verdict === false) return false;
	return verdict.then((ok) => (ok ? apply() : false));
}

/**
 * Returns `true` if the current route matches `target`.
 *
 * Path must match exactly. Any search params specified in `target` must be present
 * in the current URL, but extra params in the current URL are allowed.
 *
 * Reactive: only reevaluates when the path changes to/from the target path, and
 * when target k/v search pairs are (un)set.
 * 
 * Primary usage: 'active' status for menu items.
 *
 * @example
 * ```js
 * // This example assumes interceptLinks() has been called
 * A('a.my-button text=Users href=/users .is-active=', route.matchCurrent('/users'));
 * 
 * // Alternatively a route object can be given
 * route.matchCurrent({path: '/users', search: {tab: 'profile'}});
 * ```
 */
export function matchCurrent(target: RouteTarget): boolean {
	const partial = targetToPartial(target, true);
	if (!partial) return false; // External link

	if (partial.path != null || partial.p != null) {
		let path = partial.path || (partial.p || []).join("/") || "/";
		path = (""+path).replace(/\/+$/, "");
		if (!path.startsWith("/")) path = `/${path}`;
		if (!currentRouteParts[path]) return false;
	}

	if (partial.search) {
		for(const [k,v] of Object.entries(partial.search)) {
			if (!currentRouteParts[`${k}=${v}`]) return false;
		}
	}
	return true;
}

/**
 * Modify the current route by merging `target` into it (using {@link aberdeen.merge | A.merge}), pushing a new history entry.
 * 
 * This is useful for things like opening modals or side panels, where you want a browser back action to return to the previous state.
 * 
 * @param target Same as for {@link go}, but merged into the current route instead deleting all state.
 * @param nav The navigation type to use. Defaults to `undefined`, meaning the navigation type is unchanged from the current route,
 *  preventing unwanted page transition animations.
 * @returns The {@link go} verdict: `false` when a guard vetoed the navigation.
 */
export function push(target: RouteTarget, nav?: NavType): boolean | Promise<boolean> {
	const c = A.clone(A.unproxy(current));
	A.merge(c, targetToPartial(target));
	return go(c, nav || c.nav);
}

/**
 * Try to go back in history to the first entry that matches the given target. If none is found, the given state will replace the current page. This is useful for "cancel" or "close" actions that should return to the previous page if possible, but create a new page if not (for instance when arriving at the current page through a direct link).
 *
 * Consider using {@link up} to go up in the path hierarchy.
 *
 * @param target The target route to go back to. May be a subset of {@link Route}, or a string (for `path`), or an array of strings (for `p`).
 * @param fallback Defaults merged *under* `target` when no matching history
 * entry exists and the current one is replaced instead. Deliberately not part
 * of the match: use it for things (say, a `state`) that the replacement route
 * should carry but that a history entry needn't have to count as a match.
 * @returns A promise resolving `true` once we've landed — on the matched
 * history entry, or on the replacement — and `false` when a guard (see
 * {@link setGuard}) vetoed the change, or when another navigation superseded
 * the travel before it landed.
 */
export function back(target: RouteTarget = {}, fallback?: RouteTarget): Promise<boolean> {
	const partial = targetToPartial(target);
	const stack: string[] = historyE.state?.stack || [];
	const effectiveLen = stack.length + pendingGoOffset;
	for(let i = effectiveLen - 1; i >= 0; i--) {
		const histRoute: Route = JSON.parse(stack[i]);
		if (equal(histRoute, partial, true)) {
			log(`back`, i - effectiveLen, histRoute);
			return scheduleHistoryGo(i - effectiveLen);
		}
	}

	const merged = fallback ? {...targetToPartial(fallback), ...partial} : partial;
	const newRoute = toCanonRoute(merged, "back", effectiveLen + 1);
	log(`back not found, replacing`, merged);
	return replaceGuarded(newRoute);
}

/** The guarded shared tail of `back()`/`up()`'s no-matching-entry branch: replace the current route. */
function replaceGuarded(newRoute: Route): Promise<boolean> {
	const apply = () => {
		approved = newRoute;
		A.copy(current, newRoute);
	};
	const verdict = checkGuard(newRoute);
	if (verdict === true) { apply(); return Promise.resolve(true); }
	if (verdict === false) return Promise.resolve(false);
	return verdict.then((ok) => { if (ok) apply(); return ok; });
}

/**
* Navigate up in the path hierarchy, by going back to the first history entry
* that has a shorter path than the current one. If there's none, we just shorten
* the current path.
*
* Note that going back in browser history happens asynchronously, so `route` will not be updated immediately.
*
* @returns Like {@link back}: a promise resolving `true` once we've landed,
* `false` when a guard vetoed the change or another navigation superseded it.
*/
export function up(stripCount: number = 1): Promise<boolean> {
	const currentP = A.unproxy(current).p;
	const stack: string[] = historyE.state?.stack || [];
	const effectiveLen = stack.length + pendingGoOffset;
	for(let i = effectiveLen - 1; i >= 0; i--) {
		const histRoute: Route = JSON.parse(stack[i]);
		if (histRoute.p.length < currentP.length && equal(histRoute.p, currentP.slice(0, histRoute.p.length), false)) {
			// This route is shorter and matches the start of the current path
			log(`up to ${i+1} / ${effectiveLen}`, histRoute);
			return scheduleHistoryGo(i - effectiveLen);
		}
	}
	// Replace current route with /
	const newRoute = toCanonRoute({p: currentP.slice(0, currentP.length - stripCount)}, "back", effectiveLen + 1);
	log(`up not found, replacing`, newRoute);
	return replaceGuarded(newRoute);
}


let prevStack: string[];

// Track pending historyE.go() offset. Multiple back()/up() calls before the event loop
// processes them are batched into a single historyE.go() via queueMicrotask.
let pendingGoOffset = 0;

function scheduleHistoryGo(delta: number): Promise<boolean> {
	pendingGoOffset += delta;
	setTimeout(() => {
		if (pendingGoOffset) {
			const offset = pendingGoOffset;
			pendingGoOffset = 0;
			historyE.go(offset);
		}
	}, 0);
	// Travelling is asynchronous: the resulting popstate settles this (through
	// the guard, when one is registered), or cancelTravel() resolves it `false`
	// if another navigation supersedes the travel first.
	return new Promise((resolve) => travelWaiters.push(resolve));
}

/**
* The global {@link Route} object reflecting the current URL and browser history state. Changes you make to this affect the current browser history item (modifying the URL if needed).
*/
export const current: Route = A.proxy({}) as Route;

// Proxied object with keys for the current path and "k=v" search pairs.
// Used by matchCurrent to subscribe only to relevant route changes.
const currentRouteParts = A.proxy({} as Record<string,true>);

/**
 * Reset the router to its initial state, based on the current browser state. Intended for testing purposes only.
 * @internal
 * */
export function reset() {
	prevStack = historyE.state?.stack || [];
	guard = null;
	guardPending = false;
	reconcileNeeded = false;
	cancelTravel();
	const initRoute = getRouteFromBrowser();
	approved = initRoute;
	log('initial', initRoute);
	A.copy(A.unproxy(current), initRoute);
}
reset();

/** Adopt a route the browser has already navigated to. */
function applyBrowserRoute(newRoute: Route): void {
	prevStack = historyE.state?.stack || [];
	log('popstate', newRoute);
	approved = newRoute;
	A.copy(current, newRoute);
	A.runQueue();
	flushTravelWaiters(true);
}

/** Undo a vetoed browser navigation: travel back the exact number of entries we were moved. */
function revertBrowserRoute(newRoute: Route): void {
	const delta = approved.depth - newRoute.depth;
	log('guard vetoed popstate, reverting', delta);
	if (delta) historyE.go(delta);
	// A same-depth landing (an entry created outside the router) can't be
	// travelled away from; rewrite it back to the approved route instead.
	else historyE.replaceState({state: approved.state, stack: prevStack}, "", getUrl(approved));
	flushTravelWaiters(false);
}

// Handle browser history back and forward
function onPopState() {
	popSeq++;
	// A navigation arriving before a scheduled back()/up() travel was issued
	// supersedes that travel: its relative delta no longer means anything.
	if (pendingGoOffset) cancelTravel();
	const newRoute = getRouteFromBrowser();

	// If the stack length changes, and at least the top-most shared entry is the same,
	// we'll interpret this as a "back" or "forward" navigation.
	const stack: string[] = historyE.state?.stack || [];
	if (stack.length !== prevStack.length) {
		const maxIndex = Math.min(prevStack.length, stack.length) - 1;
		if (maxIndex < 0 || stack[maxIndex] === prevStack[maxIndex]) {
			newRoute.nav = stack.length < prevStack.length ? "back" : "forward";
		}
	}
	// else nav will be "load"

	if (guardPending) {
		// A verdict is being awaited; this navigation supersedes whatever that
		// verdict was about, and checkGuard re-examines the browser's position
		// once it settles.
		reconcileNeeded = true;
		return;
	}

	// Landing where we already are (e.g. our own veto-revert) or on a same-page
	// change (e.g. a #fragment jump) passes checkGuard without consulting.
	const verdict = checkGuard(newRoute);
	if (verdict === true) return applyBrowserRoute(newRoute);
	if (verdict === false) return revertBrowserRoute(newRoute);
	const seq = popSeq;
	verdict.then((ok) => {
		// If another popstate has arrived since, the reconcile that checkGuard
		// scheduled owns the situation; this verdict is moot.
		if (popSeq !== seq) return;
		if (ok) applyBrowserRoute(newRoute);
		else revertBrowserRoute(newRoute);
	});
}

windowE.addEventListener("popstate", onPopState);

// Make sure these observers are never cleaned up, not even by `unmountAll`.
leakScope(() => {
	// Sync `p` to `path`. We need to do this in a separate, higher-priority observer,
	// so that setting `route.p` will not be immediately overruled by the pre-existing `route.path`.
	A(() => {
		current.path = "/" + Array.from(current.p).join("/");
	});

	// Do a replaceState based on changes to A.proxy
	A(() => {
		// First normalize `route`
		const stack = historyE.state?.stack || [];
		const newRoute = toCanonRoute(current, A.unproxy(current).nav, stack.length + 1);
		A.copy(current, newRoute);

		// A direct mutation of the proxy may be a navigation (a `path` or
		// `search` change), so ask the guard. Same-page tweaks (`state`/`hash`)
		// pass without consulting it, as do changes that came in through
		// go()/back()/popstate — those were already guarded and `approved`
		// before they reached the proxy.
		const verdict = checkGuard(newRoute);
		if (verdict !== true) {
			// Not (or not yet) approved: put the proxy back the way it was. An
			// async verdict that comes out positive re-applies the attempt.
			A.copy(current, approved);
			if (verdict !== false) {
				(verdict as Promise<boolean>).then((ok) => {
					if (ok) {
						approved = newRoute;
						A.copy(current, newRoute);
						A.runQueue();
					}
				});
			}
			return;
		}
		approved = newRoute;

		// Then replace the current browser state if something actually changed
		const state = {state: newRoute.state, stack};
		const url = getUrl(newRoute);
		if (url !== locationE.pathname + locationE.search + locationE.hash || !equal(historyE.state, state, false)) {
			log('replaceState', newRoute, state, url);
			historyE.replaceState(state, "", url);
		}
	});

	// Keep currentRouteParts in sync with the current path and search params.
	A(() => {
		const n = {} as Record<string,true>;
		n[current.path] = true;
		for(const [k,v] of Object.entries(current.search)) {
			n[`${k}=${v}`] = true;
		}
		A.copy(currentRouteParts, n);
	});
});


/**
* Restore and store the vertical and horizontal scroll position for
* the parent element to the page state.
*
* @param {string} name - A unique (within this page) name for this
* scrollable element. Defaults to 'main'.
*
* The scroll position will be persisted in `route.aux.scroll.<name>`.
*/
export function persistScroll(name = "main") {
	const el = A()!;
	A('scroll=', onScroll);
	
	const restore = A.unproxy(current).state.scroll?.[name];
	if (restore) {
		log("restoring scroll", name, restore);
		Object.assign(el, restore);
	}
	
	function onScroll() {
		(current.state.scroll ||= {})[name] = {
			scrollTop: el.scrollTop,
			scrollLeft: el.scrollLeft,
		};
	}
}

/**
 * A link handler, as optionally passed to {@link interceptLinks}: called for
 * every local-link activation that passed the built-in exclusions, with the
 * resolved URL, the anchor element the activation landed on, and the DOM event.
 *
 * - Return `false` to leave the link to the browser (no `preventDefault`).
 * - Return `true` to claim the link: default handling is prevented and the
 *   handler is assumed to have navigated (or decided not to) itself.
 * - Return nothing for the default: prevent and `go(href)`.
 */
export type LinkHandler = (url: URL, anchor: HTMLAnchorElement, event: Event) => boolean | void;

/**
 * Intercept clicks and Enter key presses on links (`<a>` tags) and use Aberdeen routing
 * instead of browser navigation for local paths (paths without a protocol or host).
 *
 * This allows you to use regular HTML anchor tags for navigation without needing to
 * manually attach click handlers to each link.
 *
 * Links with a `target` or `download` attribute, external/protocol links,
 * hash-only links, modified clicks (ctrl/cmd/shift/alt, non-primary buttons)
 * and events something else already handled (`defaultPrevented`) are left to
 * the browser.
 *
 * @param handler Optional {@link LinkHandler}, for routing systems that need to
 * decide *how* to navigate (say, based on where in the DOM the link sits)
 * without re-implementing link interception. It's consulted for every link
 * that passed the exclusions above; see {@link LinkHandler} for its protocol.
 *
 * @example
 * ```js
 * // In your root component:
 * route.interceptLinks();
 *
 * // Now you can use regular anchor tags:
 * A('a text=About href=/corporate/about');
 * ```
 */
export function interceptLinks(handler?: LinkHandler) {
	A({
		click: handleEvent,
		keydown: handleKeyEvent,
	});

	function handleKeyEvent(e: KeyboardEvent) {
		if (e.key === "Enter") {
			handleEvent(e);
		}
	}

	function handleEvent(e: Event) {
		// Something else (a component's own click handler) already took this one.
		if (e.defaultPrevented) return;

		// Find the closest <a> tag
		let target = e.target as HTMLElement | null;
		while (target && target.tagName?.toUpperCase() !== "A") {
			target = target.parentElement;
		}

		if (!target) return;

		const anchor = target as HTMLAnchorElement;
		const href = anchor.getAttribute("href");

		if (!href) return;

		// Skip hash-only links
		if (href.startsWith("#")) return;

		// Skip if it has a protocol or is protocol-relative (// or contains : before any / ? #)
		if (href.startsWith("//") || /^[^/?#]+:/.test(href)) return;

		// Skip if the link has target or download attribute
		if (anchor.getAttribute("target") || anchor.getAttribute("download")) return;

		// Skip if modifier keys are pressed (Ctrl/Cmd click to open in new tab) or
		// it isn't the primary button (browsers give middle-click its own meaning)
		if (typeof MouseEvent !== 'undefined' && e instanceof MouseEvent && (e.button > 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) return;

		if (handler) {
			const result = handler(new URL(href, locationE.href), anchor, e);
			if (result === false) return; // Not ours after all: the browser keeps it.
			e.preventDefault();
			if (result === true) return; // The handler took care of it itself.
		} else {
			e.preventDefault();
		}
		go(href);
	}
}

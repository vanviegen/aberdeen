import {clean, getParentElement, $, proxy, runQueue, unproxy, copy, merge, clone, leakScope} from "./aberdeen.js";

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

function getRouteFromBrowser(): Route {
	return toCanonRoute({
		path: location.pathname,
		hash: location.hash,
		search: Object.fromEntries(new URLSearchParams(location.search)),
		state: history.state?.state || {},
	}, "load", (history.state?.stack?.length || 0) + 1);
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

function toCanonRoute(target: Partial<Route>, nav: NavType, depth: number): Route {
	let path = target.path || (target.p || []).join("/") || "/";
	path = (""+path).replace(/\/+$/, "");
	if (!path.startsWith("/")) path = `/${path}`;
	
	return {
		path,
		hash: target.hash && target.hash !=="#" ? (target.hash.startsWith("#") ? target.hash : "#" + target.hash) : "",
		p: path.length > 1 ? path.slice(1).replace(/\/+$/, "").split("/") : [],
		nav,
		search: typeof target.search === 'object' && target.search ? clone(target.search) : {},
		state: typeof target.state === 'object' && target.state ? clone(target.state) : {},
		depth,
	};
}


type RouteTarget = string | (string|number)[] | Partial<Omit<Omit<Route,"p">,"search"> & {
	/** An convenience array containing path segments, mapping to `path`. For instance `[]` (for `"/"`) or `['users', 123, 'feed']` (for `"/users/123/feed"`). Values may be integers but will be converted to strings.*/
	p: (string|number)[],
	/** The query string interpreted as search parameters. So `"a=x&b=y"` becomes `{a: "x", b: "y", c: 42}`. Values may be integers but will be converted to strings. */
	search: Record<string,string|number>,
}>;

function targetToPartial(target: RouteTarget) {
	// Convert shortcut values to objects
	if (typeof target === 'string') {
		target = {path: target};
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
*/
export function go(target: RouteTarget, nav: NavType = "go"): void {
	const stack: string[] = history.state?.stack || [];

	prevStack = stack.concat(JSON.stringify(unproxy(current)));
	
	const newRoute: Route = toCanonRoute(targetToPartial(target), nav, prevStack.length + 1);
	copy(current, newRoute);
	
	log(nav, newRoute);
	history.pushState({state: newRoute.state, stack: prevStack}, "", getUrl(newRoute));
	
	runQueue();
}

/**
 * Modify the current route by merging `target` into it (using {@link merge}), pushing a new history entry.
 * 
 * This is useful for things like opening modals or side panels, where you want a browser back action to return to the previous state.
 * 
 * @param target Same as for {@link go}, but merged into the current route instead deleting all state.
 */
export function push(target: RouteTarget): void {
	let copy = clone(unproxy(current));
	merge(copy, targetToPartial(target));
	go(copy);
}

/**
 * Try to go back in history to the first entry that matches the given target. If none is found, the given state will replace the current page. This is useful for "cancel" or "close" actions that should return to the previous page if possible, but create a new page if not (for instance when arriving at the current page through a direct link).
 * 
 * Consider using {@link up} to go up in the path hierarchy.
 * 
 * @param target The target route to go back to. May be a subset of {@link Route}, or a string (for `path`), or an array of strings (for `p`).
 */
export function back(target: RouteTarget = {}): void {
	const partial = targetToPartial(target);
	const stack: string[] = history.state?.stack || [];
	for(let i = stack.length - 1; i >= 0; i--) {
		const histRoute: Route = JSON.parse(stack[i]);
		if (equal(histRoute, partial, true)) {
			const pages = i - stack.length;
			log(`back`, pages, histRoute);
			history.go(pages);
			return;
		}
	}

	const newRoute = toCanonRoute(partial, "back", stack.length + 1);
	log(`back not found, replacing`, partial);
	copy(current, newRoute);
}

/**
* Navigate up in the path hierarchy, by going back to the first history entry
* that has a shorter path than the current one. If there's none, we just shorten
* the current path.
* 
* Note that going back in browser history happens asynchronously, so `route` will not be updated immediately.
*/
export function up(stripCount: number = 1): void {
	const currentP = unproxy(current).p;
	const stack: string[] = history.state?.stack || [];
	for(let i = stack.length - 1; i >= 0; i--) {
		const histRoute: Route = JSON.parse(stack[i]);
		if (histRoute.p.length < currentP.length && equal(histRoute.p, currentP.slice(0, histRoute.p.length), false)) {
			// This route is shorter and matches the start of the current path
			log(`up to ${i+1} / ${stack.length}`, histRoute);
			history.go(i - stack.length);
			return;
		}
	}
	// Replace current route with /
	const newRoute = toCanonRoute({p: currentP.slice(0, currentP.length - stripCount)}, "back", stack.length + 1);
	log(`up not found, replacing`, newRoute);
	copy(current, newRoute);
}

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
	const el = getParentElement();
	el.addEventListener("scroll", onScroll);
	clean(() => el.removeEventListener("scroll", onScroll));
	
	const restore = unproxy(current).state.scroll?.[name];
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

let prevStack: string[];

/**
* The global {@link Route} object reflecting the current URL and browser history state. Changes you make to this affect the current browser history item (modifying the URL if needed).
*/
export const current: Route = proxy({}) as Route;

/**
 * Reset the router to its initial state, based on the current browser state. Intended for testing purposes only.
 * @internal
 * */
export function reset() {
	prevStack = history.state?.stack || [];
	const initRoute = getRouteFromBrowser();
	log('initial', initRoute);
	copy(unproxy(current), initRoute);
}
reset();

// Handle browser history back and forward
window.addEventListener("popstate", function(event: PopStateEvent) {
	const newRoute = getRouteFromBrowser();
	
	// If the stack length changes, and at least the top-most shared entry is the same,
	// we'll interpret this as a "back" or "forward" navigation.
	const stack: string[] = history.state?.stack || [];
	if (stack.length !== prevStack.length) {
		const maxIndex = Math.min(prevStack.length, stack.length) - 1;
		if (maxIndex < 0 || stack[maxIndex] === prevStack[maxIndex]) {
			newRoute.nav = stack.length < prevStack.length ? "back" : "forward";
		}
	}
	// else nav will be "load"
	
	prevStack = stack;
	log('popstate', newRoute);
	copy(current, newRoute);
	
	runQueue();
});

// Make sure these observers are never cleaned up, not even by `unmountAll`.
leakScope(() => {
	// Sync `p` to `path`. We need to do this in a separate, higher-priority observer,
	// so that setting `route.p` will not be immediately overruled by the pre-existing `route.path`.
	$(() => {
		current.path = "/" + Array.from(current.p).join("/");
	});

	// Do a replaceState based on changes to proxy
	$(() => {

		// First normalize `route`
		const stack = history.state?.stack || [];
		const newRoute = toCanonRoute(current, unproxy(current).nav, stack.length + 1);
		copy(current, newRoute);
		
		// Then replace the current browser state if something actually changed
		const state = {state: newRoute.state, stack};
		const url = getUrl(newRoute);
		if (url !== location.pathname + location.search + location.hash || !equal(history.state, state, false)) {
			log('replaceState', newRoute, state, url);
			history.replaceState(state, "", url);
		}
	});
});

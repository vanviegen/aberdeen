import {proxy, peek, observe, immediateObserve, runQueue, getParentElement, clean} from './aberdeen.js'

/**
 * A `Store` object that holds the following keys:
 * - `path`: The current path of the URL split into components. For instance `/` or `/users/123/feed`. Updates will be reflected in the URL and will *push* a new entry to the browser history.
 * - `p`: Array containing the path segments. For instance `[]` or `['users', 123, 'feed']`. Updates will be reflected in the URL and will *push* a new entry to the browser history. Also, the values of `p` and `path` will be synced.
 * - `search`: An observable object containing search parameters (a split up query string). For instance `{order: "date", title: "something"}` or just `{}`. By default, updates will be reflected in the URL, replacing the current history state. 
 * - `hash`: The document hash part of the URL. For instance `"#section-title"`. It can also be an empty string. Updates will be reflected in the URL, modifying the current history state.
 * - `id`: A part of the browser history *state* that is considered part of the page *identify*, meaning changes will (by default) cause a history push, and when going *back*, it must match.
 * - `aux`: The auxiliary part of the browser history *state*, not considered part of the page *identity*. Changes will be reflected in the browser history using a replace. 
 * - `depth`: The navigation depth of the current session. Starts at 1. Writing to this property has no effect.
 * - `nav`: The navigation action that got us to this page. Writing to this property has no effect.
 *    - `"load"`: An initial page load.
 *    - `"back"` or `"forward"`: When we navigated backwards or forwards in the stack.
 *    - `"push"`: When we added a new page on top of the stack. 
 * 
 * The following key may also be written to `route` but will be immediately and silently removed: 
 * - `mode`: As described above, this library takes a best guess about whether pushing an item to the browser history makes sense or not. When `mode` is...
 * 	  	- `"push"`: Force creation of a new browser history entry. 
 * 	  	- `"replace"`: Update the current history entry, even when updates to other keys would normally cause a *push*.
 * 		- `"back"`: Unwind the history (like repeatedly pressing the *back* button) until we find a page that matches the given `path` and `id`, and then *replace* that state by the full given state.
 */

export class Route {
	/** The current path of the URL split into components. For instance `/` or `/users/123/feed`. Updates will be reflected in the URL and will *push* a new entry to the browser history. */
	path!: string
	/** Array containing the path segments. For instance `[]` or `['users', 123, 'feed']`. Updates will be reflected in the URL and will *push* a new entry to the browser history. Also, the values of `p` and `path` will be synced. */
	p!: string[]
	/** An observable object containing search parameters (a split up query string). For instance `{order: "date", title: "something"}` or just `{}`. By default, updates will be reflected in the URL, replacing the current history state. */
	hash!: string
	/** A part of the browser history *state* that is considered part of the page *identify*, meaning changes will (by default) cause a history push, and when going *back*, it must match. */
	search!: Record<string, string>
	/** The `hash` interpreted as search parameters. So `"a=x&b=y"` becomes `{a: "x", b: "y"}`. */
	id!: Record<string, any>
	/** The auxiliary part of the browser history *state*, not considered part of the page *identity*. Changes will be reflected in the browser history using a replace. */
	aux!: Record<string, any>
	/** The navigation depth of the current session. Starts at 1. Writing to this property has no effect. */
	depth: number = 1
	/** The navigation action that got us to this page. Writing to this property has no effect.
        - `"load"`: An initial page load.
        - `"back"` or `"forward"`: When we navigated backwards or forwards in the stack.
        - `"push"`: When we added a new page on top of the stack. 
    */
    nav: 'load' | 'back' | 'forward' | 'push' = 'load'
    /** As described above, this library takes a best guess about whether pushing an item to the browser history makes sense or not. When `mode` is... 
   	    - `"push"`: Force creation of a new browser history entry. 
   	    - `"replace"`: Update the current history entry, even when updates to other keys would normally cause a *push*.
 	    - `"back"`: Unwind the history (like repeatedly pressing the *back* button) until we find a page that matches the given `path` and `id` (or that is the first page in our stack), and then *replace* that state by the full given state.
        The `mode` key can be written to `route` but will be immediately and silently removed.
    */
	mode: 'push' | 'replace' | 'back' | undefined
}

export const route = proxy(new Route())

let stateRoute = {
	nonce: -1,
	depth: 0,
}

// Reflect changes to the browser URL (back/forward navigation) in the `route` and `stack`.
function handleLocationUpdate(event?: PopStateEvent) {
	let state = event?.state || {}
	let nav: 'load' | 'back' | 'forward' | 'push' = 'load'
	if (state.route?.nonce == null) {
		state.route = {
			nonce: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
			depth: 1,
		} 
		history.replaceState(state, '')
	} else if (stateRoute.nonce === state.route.nonce) {
		nav = state.route.depth > stateRoute.depth ? 'forward' : 'back'
	}
	stateRoute = state.route

	if (peek(route, 'mode') === 'back') {
		route.depth = stateRoute.depth
		// We are still in the process of searching for a page in our navigation history..
		updateHistory()
		return
	}

	const search: any= {}
	for(let [k, v] of new URLSearchParams(location.search)) {
		search[k] = v
	}

	route.path =  location.pathname
	route.p =  location.pathname.slice(1).split('/')
	route.search = search
	route.hash =  location.hash
	route.id =  state.id
	route.aux =  state.aux
	route.depth =  stateRoute.depth
	route.nav = nav

	// Forward or back event. Redraw synchronously, because we can!
	if (event) runQueue();
}
handleLocationUpdate()
window.addEventListener("popstate", handleLocationUpdate);

// These immediate-mode observers will rewrite the data in `route` to its canonical form.
// We want to to this immediately, so that user-code running immediately after a user-code
// initiated `set` will see the canonical form (instead of doing a rerender shortly after,
// or crashing due to non-canonical data).
function updatePath(): void {
	let path = route.path
	if (path == null && peek(route, 'p')) {
		return updateP();
	} 
	path = ''+path
	if (!path.startsWith('/')) path = '/'+path
	route.path = path
	route.p = path.slice(1).split('/')
}
immediateObserve(updatePath)

function updateP(): void {
	const p = route.p
	if (p == null && peek(route, 'path')) {
		return updatePath()
	}
	if (!(p instanceof Array)) {
		console.error(`aberdeen route: 'p' must be a non-empty array, not ${JSON.stringify(p)}`)
		route.p = [''] // This will cause a recursive call this observer.
	} else if (p.length == 0) {
		route.p = [''] // This will cause a recursive call this observer.
	} else {
		route.path = '/' + p.join('/')
	}
}
immediateObserve(updateP)

immediateObserve(() => {
	if (!route.search || typeof route.search !== 'object') route.search = {}
})

immediateObserve(() => {
	if (!route.id || typeof route.id !== 'object') route.id = {}
})

immediateObserve(() => {
	if (!route.aux || typeof route.aux !== 'object') route.aux = {}
})

immediateObserve(() => {
	let hash = ''+(route.hash || '')
	if (hash && !hash.startsWith('#')) hash = '#'+hash
	route.hash = hash
})

function isSamePage(path: string, state: any): boolean {
	return location.pathname === path && JSON.stringify(history.state.id) === JSON.stringify(state.id)
}

function updateHistory() {
	// Get and delete mode without triggering anything.
	let mode = route.mode
	const state = {
		id: route.id,
		aux: route.aux,
		route: stateRoute,
	}
	
	// Construct the URL.
	const path = route.path

	// Change browser state, according to `mode`.
	if (mode === 'back') {
		route.nav = 'back'
		if (!isSamePage(path, state) && (history.state.route?.depth||0) > 1) {
			history.back()
			return
		}
		mode = 'replace'
		// We'll replace the state async, to give the history.go the time to take affect first.
		//setTimeout(() => history.replaceState(state, '', url), 0)
	}

	if (mode) route.mode = undefined
	const search = new URLSearchParams(route.search).toString()
	const url = (search ? path+'?'+search : path) + route.hash
		
	if (mode === 'push' || (!mode && !isSamePage(path, state))) {
		stateRoute.depth++ // stateRoute === state.route
		history.pushState(state, '', url)
		route.nav = 'push'
		route.depth = stateRoute.depth
	} else {
		// Default to `push` when the URL changed or top-level state keys changed.
		history.replaceState(state, '', url)
	}
}

// This deferred-mode observer will update the URL and history based on `route` changes.
observe(updateHistory)


/**
 * Restore and store the vertical and horizontal scroll position for
 * the parent element to the page state.
 * 
 * @param {string} name - A unique (within this page) name for this
 * scrollable element. Defaults to 'main'.
 * 
 * The scroll position will be persisted in `route.aux.scroll.<name>`.
 */
export function persistScroll(name: string = 'main') {
	const el = getParentElement()
	el.addEventListener('scroll', onScroll)
	clean(() => el.removeEventListener('scroll', onScroll))

	let restore = peek(route, 'aux', 'scroll', name)
	if (restore) {
		Object.assign(el, restore)
	}

	function onScroll() {
		route.mode = 'replace'
		if (!route.aux.scroll) route.aux.scroll = {}
		route.aux.scroll[name] = {scrollTop: el.scrollTop, scrollLeft: el.scrollLeft}
	}
}

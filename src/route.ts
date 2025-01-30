import {Store, observe, immediateObserve, runQueue, getParentElement, clean} from './aberdeen.js'

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

// Idea: split `state` into `pstate` (primary) and `astate` (auxilary). The former is used to determine if new pages should be pushed and if, when moving back, a page matches.
// Moving back is done by just doing history.back() while depth > 1, and repeating in handleLocationUpdate until matching page is found (or overriding base page).

export const route = new Store()

let stateRoute = {
	nonce: -1,
	depth: 0,
}

// Reflect changes to the browser URL (back/forward navigation) in the `route` and `stack`.
function handleLocationUpdate(event?: PopStateEvent) {
	let state = event?.state || {}
	let nav = 'load'
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

	if (route('mode').peek() === 'back') {
		route('depth').set(stateRoute.depth)
		// We are still in the process of searching for a page in our navigation history..
		updateHistory()
		return
	}

	const search: any= {}
	for(let [k, v] of new URLSearchParams(location.search)) {
		search[k] = v
	}

	route.set({
		path: location.pathname,
		p: location.pathname.slice(1).split('/'),
		search: search,
		hash: location.hash,
		id: state.id,
		aux: state.aux,
		depth: stateRoute.depth,
		nav,
	})

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
	let path = route('path').get()
	if (path == null && route('p').peek()) {
		return updateP();
	} 
	path = ''+path
	if (!path.startsWith('/')) path = '/'+path
	route('path').set(path)
	route('p').set(path.slice(1).split('/'))
}
immediateObserve(updatePath)

function updateP(): void {
	const p = route('p').get()
	if (p == null && route('path').peek()) {
		return updatePath()
	}
	if (!(p instanceof Array)) {
		console.error(`aberdeen route: 'p' must be a non-empty array, not ${JSON.stringify(p)}`)
		route('p').set(['']) // This will cause a recursive call this observer.
	} else if (p.length == 0) {
		route('p').set(['']) // This will cause a recursive call this observer.
	} else {
		route('path').set('/' + p.join('/'))
	}
}
immediateObserve(updateP)

immediateObserve(() => {
	if (route('search').getType() !== 'object') route('search').set({})
})

immediateObserve(() => {
	if (route('state').getType() !== 'object') route('state').set({})
})

immediateObserve(() => {
	let hash = ''+(route('hash').get() || '')
	if (hash && !hash.startsWith('#')) hash = '#'+hash
	route('hash').set(hash)
})

function isSamePage(path: string, state: any): boolean {
	return location.pathname === path && JSON.stringify(history.state.id) === JSON.stringify(state.id)
}

function updateHistory() {
	// Get and delete mode without triggering anything.
	let mode = route('mode').get()
	const state = {
		id: route('id').get(),
		aux: route('aux').get(),
		route: stateRoute,
	}
	
	// Construct the URL.
	const path = route('path').get()

	// Change browser state, according to `mode`.
	if (mode === 'back') {
		route('nav').set('back')
		if (!isSamePage(path, state) && (history.state.route?.depth||0) > 1) {
			history.back()
			return
		}
		mode = 'replace'
		// We'll replace the state async, to give the history.go the time to take affect first.
		//setTimeout(() => history.replaceState(state, '', url), 0)
	}

	if (mode) route('mode').delete()
	const search = new URLSearchParams(route('search').get()).toString()
	const url = (search ? path+'?'+search : path) + route('hash').get()
		
	if (mode === 'push' || (!mode && !isSamePage(path, state))) {
		stateRoute.depth++ // stateRoute === state.route
		history.pushState(state, '', url)
		route.merge({
			nav: 'push',
			depth: stateRoute.depth
		})
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
 */
export function persistScroll(name: string = 'main') {
	const el = getParentElement()
	el.addEventListener('scroll', onScroll)
	clean(() => el.removeEventListener('scroll', onScroll))

	let restore = route('state', 'scroll', name).peek()
	if (restore) {
		Object.assign(el, restore)
	}

	function onScroll() {
		route('mode').set('replace')
		route('state', 'scroll', name).set({scrollTop: el.scrollTop, scrollLeft: el.scrollLeft})
	}
}

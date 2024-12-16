import {Store, observe, immediateObserve, inhibitEffects} from 'aberdeen'

/**
 * A `Store` object that holds the following keys:
 * - `path`: The current path of the URL split into components. For instance `/` or `/users/123/feed`. Updates will be reflected in the URL and will *push* a new entry to the browser history.
 * - `p`: Array containing the path segments. For instance `[]` or `['users', 123, 'feed']`. Updates will be reflected in the URL and will *push* a new entry to the browser history. Also, the values of `p` and `path` will be synced.
 * - `search`: An observable object containing search parameters (a split up query string). For instance `{order: "date", title: "something"}` or just `{}`. Updates will be reflected in the URL, modifying the current history state. 
 * - `hash`: The document hash part of the URL. For instance `"#section-title"`. It can also be an empty string. Updates will be reflected in the URL, modifying the current history state.
 * - `state`: The browser history *state* object for the current page. Creating or removing top-level keys will cause *pushing* a new entry to the browser history.
 * 
 * The following key may also be written to `route` but will be immediately and silently removed: 
 * - `mode`: As described above, this library takes a best guess about whether pushing an item to the browser history makes sense or not. When `mode` is...
 * 	  	- `"push"`: Force creation of a new browser history entry. 
 * 	  	- `"replace"`: Update the current history entry, even when updates to other keys would normally cause a *push*.
 * 		- `"back"`: Unwind the history (like repeatedly pressing the *back* button) until we find a page that matches the given `path`, `search` and top-level `state` keys, and then *replace* that state by the full given state.
 */
export const route = new Store()

// Contains url (path+search) and state for all history entries for this session, with the current
// entry on top. It is used for `mode: "back"`, to know how many entries to go back.
let stack: Array<{url: string, state: object}> = []

// Keep track of the initial history length, so we'll always know how long our `stack` should be.
const initialHistoryLength = history.length;

// Keep a copy of the last known history state, so we can tell if the user changed one of its
// top-level keys, so we can decide between push/replace when `mode` is not set.
let prevHistoryState: any

// Reflect changes to the browser URL (back/forward navigation) in the `route` and `stack`.
function handleLocationUpdate(event?: PopStateEvent) {
	const search: any= {}
	for(let [k, v] of new URLSearchParams(location.search)) {
		search[k] = v
	}
	prevHistoryState = event ? (event.state || {}) : {}
	stack.length = Math.max(1, history.length - initialHistoryLength + 1)
	stack[stack.length-1] = {url: location.pathname + location.search, state: prevHistoryState}
	route.set({
		path: location.pathname,
		p: location.pathname.slice(1).split('/'),
		search: search,
		hash: location.hash,
		state: prevHistoryState,
	})
}
handleLocationUpdate()
window.addEventListener("popstate", handleLocationUpdate);

// These immediate-mode observers will rewrite the data in `route` to its canonical form.
// We want to to this immediately, so that user-code running immediately after a user-code
// initiated `set` will see the canonical form (instead of doing a rerender shortly after,
// or crashing due to non-canonical data).
immediateObserve(() => {
	let path = ''+route.get('path')
	if (!path.startsWith('/')) path = '/'+path
	route.set('path', path)
	route.set('p', path.slice(1).split('/'))
})

immediateObserve(() => {
	const p = route.get('p')
	if (!(p instanceof Array)) {
		console.error(`aberdeen route: 'p' must be a non-empty array, not ${JSON.stringify(p)}`)
		route.set('p', ['']) // This will cause a recursive call this observer.
	} else if (p.length == 0) {
		route.set('p', ['']) // This will cause a recursive call this observer.
	} else {
		route.set('path', '/' + p.join('/'))
	}
})

immediateObserve(() => {
	if (route.getType('search') !== 'object') route.set('search', {})
})

immediateObserve(() => {
	if (route.getType('state') !== 'object') route.set('state', {})
})

immediateObserve(() => {
	let hash = ''+(route.get('hash') || '')
	if (hash && !hash.startsWith('#')) hash = '#'+hash
	route.set('hash', hash)
})

// This deferred-mode observer will update the URL and history based on `route` changes.
observe(() => {
	// Get and delete mode without triggering anything.
	const mode = route.get('mode')
	if (mode) inhibitEffects(() => route.delete('mode'))
	const state = route.get('state')
	
	// Construct the URL.
	const path = route.get('path')
	const search = new URLSearchParams(route.get('search')).toString()
	const url = (search ? path+'?'+search : path) + route.get('hash')

	// Change browser state, according to `mode`.
	if (mode === 'back') {
		let goDelta = 0
		while(stack.length > 1) {
			const item = stack[stack.length-1]
			if (item.url === url && JSON.stringify(Object.keys(state||{})) === JSON.stringify(Object.keys(item.state||{}))) break // Found it!
			goDelta--
			stack.pop()
		}
		if (goDelta) history.go(goDelta)
		// We'll replace the state async, to give the history.go the time to take affect first.
		setTimeout(() => history.replaceState(state, '', url), 0)
		stack[stack.length-1] = {url,state}
	} else if (mode === 'push' || (!mode && (location.pathname !== path || JSON.stringify(Object.keys(state||{})) !== JSON.stringify(Object.keys(prevHistoryState||{}))))) {
		history.pushState(state, '', url)
		stack.push({url,state})
	} else {
		history.replaceState(state, '', url)
		stack[stack.length-1] = {url,state}
	}
	prevHistoryState = state
})


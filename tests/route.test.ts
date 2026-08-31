import { expect, test, beforeEach } from "bun:test";
import { resetBrowserState } from "./fakedom";
import { passTime } from "./helpers";
import * as route from "../src/route";
import A from "../src/aberdeen";

beforeEach(async () => {
    resetBrowserState();
    route.reset();
    await passTime(1);
});

test('initializes with route.current browser state', () => {
    location.pathname = '/test/path';
    location.search = '?foo=bar';
    location.hash = '#section';
    
    route.reset();
    
    expect(route.current.path).toEqual('/test/path');
    expect(route.current.p).toEqual(['test', 'path']);
    expect(route.current.search).toEqual({foo: 'bar'});
    expect(route.current.hash).toEqual('#section');
    expect(route.current.state).toEqual({});
    expect(route.current.depth).toEqual(1);
    expect(route.current.nav).toEqual('load');
});

test('normalizes paths correctly', () => {
    location.pathname = '/';
    route.reset();
    expect(route.current.path).toEqual('/');
    expect(route.current.p).toEqual([]);
    
    location.pathname = '/test//';
    route.reset();
    expect(route.current.path).toEqual('/test');
    expect(route.current.p).toEqual(['test']);
    
    location.pathname = 'no-leading-slash';
    route.reset();
    expect(route.current.path).toEqual('/no-leading-slash');
    expect(route.current.p).toEqual(['no-leading-slash']);
});

test('route.go() navigates to new route', async () => {
    route.go('/users/123');
    expect(route.current.nav).toEqual('go');
    await passTime(1);
    
    expect(route.current.path).toEqual('/users/123');
    expect(route.current.p).toEqual(['users', '123']);
    expect(route.current.nav).toEqual('go');
    expect(route.current.depth).toEqual(2);
    expect(location.pathname).toEqual('/users/123');
});

test('route.go() with route object', async () => {
    route.go({
        path: '/users/456',
        search: {filter: 'active', page: '2'},
        hash: '#top',
        state: {customData: 'test'}
    });
    await passTime(1);
    
    expect(route.current.path).toEqual('/users/456');
    expect(route.current.search).toEqual({filter: 'active', page: '2'});
    expect(route.current.hash).toEqual('#top');
    expect(route.current.state).toEqual({customData: 'test'});
    expect(location.search).toEqual('?filter=active&page=2');
    expect(location.hash).toEqual('#top');
});

test('route.go() with path segments array', async () => {
    route.go(['users', 123, 'profile']);
    await passTime(1);
    
    expect(route.current.path).toEqual('/users/123/profile');
    expect(route.current.p).toEqual(['users', '123', 'profile']);
});

test('route.go() converts numbers to strings', async () => {
    route.go({
        p: ['users', 123],
        search: {id: 456, active: 'true'}
    });
    await passTime(1);
    
    expect(route.current.p).toEqual(['users', '123']);
    expect(route.current.search).toEqual({id: '456', active: 'true'});
});

test('modifying route.current route updates browser state', async () => {
    route.current.path = '/new/path';
    await passTime(1);
    
    expect(route.current.path).toEqual('/new/path');
    expect(route.current.p).toEqual(['new', 'path']);
    expect(location.pathname).toEqual('/new/path');
    expect(route.current.nav).toEqual('replace');
});

test('modifying route.current.p updates path', async () => {
    route.current.p = ['admin', 'users'];
    await passTime(1);
    
    expect(route.current.path).toEqual('/admin/users');
    expect(location.pathname).toEqual('/admin/users');
});

test('modifying search params updates URL', async () => {
    route.current.search = {q: 'search term', type: 'user'};
    await passTime(1);
    
    expect(location.search).toEqual('?q=search+term&type=user');
});

test('route.go() route.back finds matching history entry', async () => {
    // Build route.up some history
    route.go('/page1');
    await passTime(1);
    route.go('/page2');
    await passTime(1);
    route.go('/page3');
    await passTime(1);
    
    expect(route.current.path).toEqual('/page3');
    expect(route.current.depth).toEqual(4);
    
    // route.go route.back to page1 (this is asynchronous via history.go)
    route.back('/page1');
    await passTime();
    
    expect(route.current.path).toEqual('/page1');
    expect(route.current.nav).toEqual('back');
});

test('route.go() route.back with partial matching', async () => {
    route.go({path: '/users/123', state: {tab: 'profile'}});
    await passTime(1);
    route.go('/users/456');
    await passTime(1);
    
    // Should find the first entry that matches the partial criteria
    route.back({path: '/users/123'});
    await passTime(10); // Wait for async navigation
    
    expect(route.current.path).toEqual('/users/123');
    expect(route.current.state).toEqual({tab: 'profile'});
});

test('route.go() route.back with no match and fallback', async () => {
    route.go('/page1');
    await passTime(1);

    route.back('/nonexistent');
    await passTime(1);
    
    expect(route.current.path).toEqual('/nonexistent'); // Should fallback
});

test('route.up() navigates to parent path', async () => {
    route.go('/users');
    await passTime(1);
    route.go('/users/123/settings');
    await passTime(1);
    
    expect(route.current.path).toEqual('/users/123/settings');
    
    route.up();
    await passTime(1);  
    expect(route.current.path).toEqual('/users');
    expect(route.current.nav).toEqual('back');
    
    route.up();
    await passTime(1);  
    expect(route.current.path).toEqual('/');
    expect(route.current.nav).toEqual('back');
});

test('route.up() with no matching parent goes to root', async () => {
    route.go('/orphan/path');
    await passTime(1);
    
    route.up();
    await passTime(1);  
    expect(route.current.path).toEqual('/');
    
    route.up();
    await passTime(1);  
    expect(route.current.path).toEqual('/');
});

test('route.up() with complex hierarchy', async () => {
    // Build hierarchy: / -> /users -> /users/123 -> /users/123/profile
    route.go('/users');
    await passTime(1);
    route.go('/users/123');
    await passTime(1);
    route.go('/users/123/profile');
    await passTime(1);
    route.go('/users/123/profile/edit'); // route.current path
    await passTime(1);
    
    route.up(); // Should route.go route.back to /users/123/profile
    await passTime(1);
    
    expect(route.current.path).toEqual('/users/123/profile');
});

test('browser route.back/forward navigation', async () => {
    route.go('/page1');
    await passTime(1);
    route.go('/page2');
    await passTime(1);
    route.go('/page3');
    await passTime(1);
    
    // Simulate browser route.back button
    history.back();
    await passTime(1);
    
    expect(route.current.path).toEqual('/page2');
    expect(route.current.nav).toEqual('back');
    
    // Simulate browser forward button
    history.forward();
    await passTime(1);
    
    expect(route.current.path).toEqual('/page3');
    expect(route.current.nav).toEqual('forward');
});

test('route.persistScroll() saves and restores scroll position', async () => {
    A.mount(document.body, () => {
        route.persistScroll();
    });
    
    const parentEl = A() as any;
    
    // Set scroll position
    parentEl.scrollTop = 100;
    parentEl.scrollLeft = 50;
    
    // Trigger scroll event
    parentEl.event('scroll');
    await passTime(1);
    
    expect(route.current.state.scroll.main).toEqual({
        scrollTop: 100,
        scrollLeft: 50
    });
    
    // Navigate away and route.back
    route.go('/other');
    await passTime(1);
    route.back('/');
    await passTime(1);
    
    // Mount again to test restoration
    A.mount(document.body, () => {
        route.persistScroll();
    });
    
    expect(parentEl.scrollTop).toEqual(100);
    expect(parentEl.scrollLeft).toEqual(50);
});

test('route.persistScroll() with custom name', async () => {
    A.mount(document.body, () => {
        route.persistScroll('sidebar');
    });
    
    const parentEl = A() as any;
    // route.reset any previous scroll position
    parentEl.scrollLeft = 0;
    parentEl.scrollTop = 200;
    parentEl.event('scroll');
    await passTime(1);
    
    expect(route.current.state.scroll.sidebar).toEqual({
        scrollTop: 200,
        scrollLeft: 0
    });
});

test('hash handling', async () => {
    route.go({hash: 'section1'});
    await passTime(1);
    
    expect(route.current.hash).toEqual('#section1');
    expect(location.hash).toEqual('#section1');
    
    route.go({hash: '#section2'}); // With leading #
    await passTime(1);
    
    expect(route.current.hash).toEqual('#section2');
});

test('empty and default values', async () => {
    route.go({path: '/test'});
    await passTime(1);
    
    expect(route.current.search).toEqual({});
    expect(route.current.hash).toEqual('');
    expect(route.current.state).toEqual({});
});

test('complex navigation sequence', async () => {
    let lastLog: any[] = [];
    route.setLog((...args: any[]) => lastLog = args);
    route.reset();
    expect(lastLog[0]).toBe('initial');

    // Simulate a complex user journey
    route.go('/');
    await passTime(1);
    expect(lastLog[0]).toBe('go');
    
    route.go('/users');
    await passTime(1);
    expect(route.current.depth).toEqual(3); // Should be 3: initial + '/' + '/users'
    expect(lastLog[0]).toBe('go');
    
    route.go({path: '/users/123', state: {from: 'list'}});
    await passTime(1);
    expect(route.current.depth).toEqual(4);
    expect(lastLog[0]).toBe('go');
    
    route.go('/users/123/edit');
    await passTime(1);
    expect(route.current.depth).toEqual(5);
    expect(lastLog[0]).toBe('go');
    
    // route.go route.back to users list
    route.back('/users');
    await passTime(1);
    expect(route.current.path).toEqual('/users');
    expect(route.current.nav).toEqual('back');
    expect(route.current.depth).toEqual(3);
    expect(lastLog[0]).toBe('popstate');

    // Modify the page
    route.current.search = {filter: 'active'};
    await passTime(1);
    expect(route.current.path).toEqual('/users');
    expect(route.current.search).toEqual({filter: 'active'});
    expect(location.search).toEqual('?filter=active');
    expect(route.current.depth).toEqual(3); // Depth should remain the same
    expect(lastLog[0]).toBe('replaceState');
    
    // route.go to different user
    route.go('/users/456');
    await passTime(1);
    expect(route.current.depth).toEqual(4); // Should replace the history after users
    expect(lastLog[0]).toBe('go');
});
test('interceptLinks handles local link clicks', async () => {
    let link: any;
    A.mount(document.body, () => {
        route.interceptLinks();
        
        // Create a link element using Aberdeen's $ function
        link = A('a', {href: '/test/path?foo=bar#section'}, 'Test Link');
    });
    await passTime(1);
    
    // Simulate click using fakedom's event method
    link.event('click');
    await passTime(1);
    
    expect(route.current.path).toEqual('/test/path');
    expect(route.current.search).toEqual({foo: 'bar'});
    expect(route.current.hash).toEqual('#section');
});

test('interceptLinks ignores external links', async () => {
    let link: any;
    A.mount(document.body, () => {
        route.interceptLinks();
        
        link = A('a', {href: 'https://example.com/path', host: 'example.com'});
    });
    await passTime(1);
    
    // Track navigation by checking the current path doesn't change
    const beforePath = route.current.path;
    link.event('click');
    await passTime(1);
    
    expect(route.current.path).toEqual(beforePath);
});

test('interceptLinks ignores links with protocols', async () => {
    const testCases = [
        'mailto:test@example.com',
        'tel:+1234567890',
        'javascript:void(0)',
        '//example.com/path',
    ];
    
    const links: any[] = [];
    A.mount(document.body, () => {
        route.interceptLinks();
        
        for (const href of testCases) {
            links.push(A('a', {href}));
        }
    });
    await passTime(1);
    
    const beforePath = route.current.path;
    for (const link of links) {
        link.event('click');
    }
    
    await passTime(1);
    expect(route.current.path).toEqual(beforePath);
});

test('interceptLinks ignores links with target attribute', async () => {
    let link: any;
    A.mount(document.body, () => {
        route.interceptLinks();
        
        link = A('a', {href: '/test', target: '_blank'});
    });
    await passTime(1);
    
    const beforePath = route.current.path;
    link.event('click');
    await passTime(1);
    
    expect(route.current.path).toEqual(beforePath);
});

test('interceptLinks handles Enter key on links', async () => {
    let link: any;
    A.mount(document.body, () => {
        route.interceptLinks();
        
        link = A('a', {href: '/test/keyboard'});
    });
    await passTime(1);
    
    // Simulate Enter key press using fakedom's event method
    link.event({ type: 'keydown', key: 'Enter' });
    await passTime(1);
    
    expect(route.current.path).toEqual('/test/keyboard');
});

test('matchCurrent matches path', async () => {
    route.go('/users/123');
    await passTime(1);

    expect(route.matchCurrent('/users/123')).toBe(true);
    expect(route.matchCurrent('/users')).toBe(false);
    expect(route.matchCurrent('/users/456')).toBe(false);
    expect(route.matchCurrent(['users', '123'])).toBe(true);
});

test('matchCurrent matches path and search params', async () => {
    route.go({path: '/users', search: {tab: 'profile', page: '2'}});
    await passTime(1);

    expect(route.matchCurrent('/users')).toBe(true);
    expect(route.matchCurrent({path: '/users', search: {tab: 'profile'}})).toBe(true);
    expect(route.matchCurrent({path: '/users', search: {tab: 'profile', page: '2'}})).toBe(true);
    expect(route.matchCurrent({path: '/users', search: {tab: 'other'}})).toBe(false);
    expect(route.matchCurrent({path: '/users', search: {missing: 'key'}})).toBe(false);
});

test('matchCurrent ignores hash and extra current search params', async () => {
    route.go({path: '/page', search: {a: '1', b: '2'}, hash: '#top'});
    await passTime(1);

    // Extra search params in current URL are fine
    expect(route.matchCurrent({path: '/page', search: {a: '1'}})).toBe(true);
    // Hash is not checked
    expect(route.matchCurrent('/page')).toBe(true);
});

test('matchCurrent interceptLinks ignores hash-only links', async () => {
    route.go('/current-page');
    await passTime(1);
    
    let link: any;
    A.mount(document.body, () => {
        route.interceptLinks();
        
        link = A('a', {href: '#section'});
    });
    await passTime(1);
    
    const initialPath = route.current.path;
    link.event('click');
    await passTime(1);
    
    // Path should not change for hash-only links
    expect(route.current.path).toEqual(initialPath);
});
// ─── setGuard() ──────────────────────────────────────────────────────────────

test('setGuard: a synchronous veto stops go(), a pass lets it through', async () => {
    route.go('/start');
    await passTime(1);

    let allow = false;
    const seen: Array<{to: string, from: string}> = [];
    route.setGuard((to, from) => {
        seen.push({to: to.path, from: from.path});
        return allow;
    });

    expect(route.go('/blocked')).toBe(false);
    await passTime(1);
    expect(route.current.path).toEqual('/start');
    expect(location.pathname).toEqual('/start');
    expect(seen).toEqual([{to: '/blocked', from: '/start'}]);

    allow = true;
    expect(route.go('/allowed')).toBe(true);
    await passTime(1);
    expect(route.current.path).toEqual('/allowed');
    expect(seen[1]).toEqual({to: '/allowed', from: '/start'});
});

test('setGuard: an async guard defers go() and refuses concurrent changes', async () => {
    route.go('/start');
    await passTime(1);

    let resolveVerdict: (ok: boolean) => void;
    route.setGuard(() => new Promise((resolve) => { resolveVerdict = resolve; }));

    const result = route.go('/slow') as Promise<boolean>;
    expect(typeof (result as any).then).toBe('function');
    await passTime(1);
    // Nothing applied while the verdict is pending, and other changes are refused.
    expect(route.current.path).toEqual('/start');
    expect(route.go('/other')).toBe(false);

    resolveVerdict!(true);
    expect(await result).toBe(true);
    await passTime(1);
    expect(route.current.path).toEqual('/slow');
    expect(location.pathname).toEqual('/slow');
});

test('setGuard: a vetoed browser back is undone, restoring the entry we were on', async () => {
    route.go('/page1');
    await passTime(1);
    route.go('/page2');
    await passTime(1);

    let allow = false;
    route.setGuard(() => allow);

    history.back();
    await passTime(10);
    // The guard refused: we've travelled forward again, nothing changed.
    expect(route.current.path).toEqual('/page2');
    expect(location.pathname).toEqual('/page2');
    expect(route.current.depth).toEqual(3);

    allow = true;
    history.back();
    await passTime(10);
    expect(route.current.path).toEqual('/page1');
});

test('setGuard: a vetoed multi-entry jump travels the exact distance back', async () => {
    route.go('/page1');
    await passTime(1);
    route.go('/page2');
    await passTime(1);
    route.go('/page3');
    await passTime(1);

    route.setGuard(() => false);
    history.go(-3); // long-press back: straight to the initial entry
    await passTime(10);

    expect(route.current.path).toEqual('/page3');
    expect(location.pathname).toEqual('/page3');
    expect(route.current.depth).toEqual(4);
});

test('setGuard: an async popstate verdict holds the route until it settles', async () => {
    route.go('/page1');
    await passTime(1);
    route.go('/page2');
    await passTime(1);

    let resolveVerdict: (ok: boolean) => void;
    route.setGuard(() => new Promise((resolve) => { resolveVerdict = resolve; }));

    history.back();
    await passTime(10);
    // Browser already moved, but the route holds at the approved entry.
    expect(route.current.path).toEqual('/page2');

    resolveVerdict!(true);
    await passTime(10);
    expect(route.current.path).toEqual('/page1');
    expect(route.current.nav).toEqual('back');
});

test('setGuard: a vetoed direct route.current mutation is reverted in place', async () => {
    route.go('/keep');
    await passTime(1);

    route.setGuard(() => false);
    route.current.path = '/changed';
    await passTime(1);

    expect(route.current.path).toEqual('/keep');
    expect(location.pathname).toEqual('/keep');
});

test('setGuard: in-place state and hash tweaks are same-page changes that skip the guard', async () => {
    route.go('/page');
    await passTime(1);
    let calls = 0;
    route.setGuard(() => { calls++; return false; }); // vetoes everything...

    route.current.state.selection = 'b7'; // ...but is never even asked
    await passTime(1);
    expect(route.current.state.selection).toEqual('b7');
    expect(history.state.state.selection).toEqual('b7');

    route.current.hash = '#section';
    await passTime(1);
    expect(route.current.hash).toEqual('#section');

    expect(calls).toEqual(0);
    expect(route.current.nav).toEqual('go'); // same-page tweaks aren't a "replace"
});

test('setGuard: an in-place search change is a navigation and can be vetoed', async () => {
    route.go({path: '/page', search: {tab: 'a'}});
    await passTime(1);
    route.setGuard(() => false);

    route.current.search.tab = 'b';
    await passTime(1);
    expect(route.current.search).toEqual({tab: 'a'});
});

test('setGuard: an async verdict re-applies a direct mutation once it passes', async () => {
    route.go('/from');
    await passTime(1);
    let resolveVerdict: (ok: boolean) => void;
    route.setGuard(() => new Promise((resolve) => { resolveVerdict = resolve; }));

    route.current.path = '/to';
    await passTime(1);
    expect(route.current.path).toEqual('/from'); // reverted while pending

    resolveVerdict!(true);
    await passTime(5);
    expect(route.current.path).toEqual('/to');
    expect(location.pathname).toEqual('/to');
});

test('setGuard: a guard can redirect by navigating itself and vetoing', async () => {
    route.go('/start');
    await passTime(1);
    route.setGuard((to) => {
        if (to.path === '/login') return true;
        route.go('/login');
        return false;
    });

    expect(route.go('/private')).toBe(false);
    await passTime(1);
    expect(route.current.path).toEqual('/login');
    expect(location.pathname).toEqual('/login');
});

test('setGuard: an async popstate veto reverts once the verdict settles', async () => {
    route.go('/page1');
    await passTime(1);
    route.go('/page2');
    await passTime(1);

    let resolveVerdict: (ok: boolean) => void;
    route.setGuard(() => new Promise((resolve) => { resolveVerdict = resolve; }));

    history.back();
    await passTime(10);
    expect(route.current.path).toEqual('/page2'); // held while pending

    resolveVerdict!(false);
    await passTime(10);
    expect(route.current.path).toEqual('/page2');
    expect(location.pathname).toEqual('/page2');
    expect(route.current.depth).toEqual(3);
});

test('setGuard: a browser navigation supersedes a pending verdict, which is then re-examined', async () => {
    route.go('/page1');
    await passTime(1);
    route.go('/page2');
    await passTime(1);

    const verdicts: Array<{to: string, resolve: (ok: boolean) => void}> = [];
    route.setGuard((to) => new Promise((resolve) => { verdicts.push({to: to.path, resolve}); }));

    const result = route.go('/page3') as Promise<boolean>;
    await passTime(1);
    history.back(); // the user presses back while the verdict is pending
    await passTime(10);
    expect(route.current.path).toEqual('/page2'); // still holding steady

    verdicts[0].resolve(true); // approval comes too late: the back superseded it
    expect(await result).toBe(false);
    await passTime(10);

    // The browser's position got its own guard consultation, and won.
    expect(verdicts.length).toEqual(2);
    expect(verdicts[1].to).toEqual('/page1');
    verdicts[1].resolve(true);
    await passTime(10);
    expect(route.current.path).toEqual('/page1');
    expect(route.current.nav).toEqual('back');
});

test('setGuard: a vetoed same-depth landing (entry created outside the router) is rewritten in place', async () => {
    route.go('/ours');
    await passTime(1);
    route.setGuard(() => false);

    // Some non-router code pushes an entry (carrying our state, like a
    // fragment navigation would) and the browser lands on it.
    history.pushState(history.state, '', '/foreign');
    window.dispatchEvent({type: 'popstate', state: history.state});
    await passTime(10);

    expect(route.current.path).toEqual('/ours');
    expect(location.pathname).toEqual('/ours');
});

test('setGuard: a fragment navigation is a same-page change that skips the guard', async () => {
    route.go('/page');
    await passTime(1);
    let calls = 0;
    route.setGuard(() => { calls++; return false; });

    // The browser handles #fragment links itself: a new entry carrying the
    // same state, announced by a popstate.
    history.pushState(history.state, '', '/page#section');
    window.dispatchEvent({type: 'popstate', state: history.state});
    await passTime(10);

    expect(calls).toEqual(0);
    expect(route.current.hash).toEqual('#section');
});

test('setGuard: a throwing guard counts as a veto', async () => {
    route.go('/safe');
    await passTime(1);
    route.setGuard(() => { throw new Error('nope'); });

    expect(route.go('/danger')).toBe(false);
    await passTime(1);
    expect(route.current.path).toEqual('/safe');
});

// ─── back() reporting ────────────────────────────────────────────────────────

test('back() resolves true once the travel lands', async () => {
    route.go('/page1');
    await passTime(1);
    route.go('/page2');
    await passTime(1);

    const result = route.back('/page1');
    await passTime(10);
    expect(await result).toBe(true);
    expect(route.current.path).toEqual('/page1');
});

test('back() applies fallback defaults when it replaces instead of travelling', async () => {
    route.go('/somewhere');
    await passTime(1);

    const result = route.back({path: '/parent'}, {state: {stack: ['a', 'b']}});
    expect(await result).toBe(true);
    await passTime(1);

    expect(route.current.path).toEqual('/parent');
    expect(route.current.state).toEqual({stack: ['a', 'b']});
    // The fallback is only a default for the replacement: the match spec wins.
    route.go('/elsewhere');
    await passTime(1);
    await route.back({path: '/parent', state: {stack: ['x']}}, {state: {stack: ['y']}});
    await passTime(10);
    expect(route.current.state).toEqual({stack: ['x']});
});

test('back() resolves false when a guard vetoes the travel', async () => {
    route.go('/page1');
    await passTime(1);
    route.go('/page2');
    await passTime(1);

    route.setGuard(() => false);
    const result = route.back('/page1');
    await passTime(10);
    expect(await result).toBe(false);
    expect(route.current.path).toEqual('/page2');
});

test('back() resolves false when a guard vetoes the replacement', async () => {
    route.go('/only');
    await passTime(1);
    route.setGuard(() => false);

    expect(await route.back('/nonexistent')).toBe(false);
    await passTime(1);
    expect(route.current.path).toEqual('/only');
});

test('back() resolves false when a go() supersedes the travel before it lands', async () => {
    route.go('/page1');
    await passTime(1);
    route.go('/page2');
    await passTime(1);

    const result = route.back('/page1');
    route.go('/page3'); // same tick: the scheduled travel never happens

    expect(await result).toBe(false);
    await passTime(10);
    expect(route.current.path).toEqual('/page3');
    expect(location.pathname).toEqual('/page3');
});

test('up() resolves true once its travel lands', async () => {
    route.go('/users');
    await passTime(1);
    route.go('/users/123');
    await passTime(1);

    const result = route.up();
    await passTime(10);
    expect(await result).toBe(true);
    expect(route.current.path).toEqual('/users');
});

test('push() merges into the current route and reports the guard verdict', async () => {
    route.go({path: '/users', search: {tab: 'feed'}});
    await passTime(1);

    expect(route.push({search: {tab: 'feed', sort: 'new'}})).toBe(true);
    await passTime(1);
    expect(route.current.path).toEqual('/users');
    expect(route.current.search).toEqual({tab: 'feed', sort: 'new'});
    expect(route.current.depth).toEqual(3);

    route.setGuard(() => false);
    expect(route.push({search: {tab: 'other'}})).toBe(false);
    await passTime(1);
    expect(route.current.search).toEqual({tab: 'feed', sort: 'new'});
});

test('setGuard returns the previously registered guard', () => {
    const first = () => true;
    expect(route.setGuard(first)).toBe(null);
    expect(route.setGuard(null)).toBe(first);
});

// ─── interceptLinks(handler) ─────────────────────────────────────────────────

test('interceptLinks handler gets the URL and anchor, and defaults to go()', async () => {
    let link: any;
    const seen: Array<{path: string, anchor: any}> = [];
    A.mount(document.body, () => {
        route.interceptLinks((url, anchor) => {
            seen.push({path: url.pathname, anchor});
        });
        link = A('a', {href: '/hooked?x=1'});
    });
    await passTime(1);

    link.event('click');
    await passTime(1);

    expect(seen.length).toEqual(1);
    expect(seen[0].path).toEqual('/hooked');
    expect(seen[0].anchor).toBe(link);
    expect(route.current.path).toEqual('/hooked');
    expect(route.current.search).toEqual({x: '1'});
});

test('interceptLinks handler returning true claims the link without navigating', async () => {
    let link: any;
    A.mount(document.body, () => {
        route.interceptLinks(() => true);
        link = A('a', {href: '/claimed'});
    });
    await passTime(1);

    const before = route.current.path;
    link.event('click');
    await passTime(1);
    expect(route.current.path).toEqual(before);
});

test('interceptLinks handler returning false leaves the link to the browser', async () => {
    let link: any;
    A.mount(document.body, () => {
        route.interceptLinks(() => false);
        link = A('a', {href: '/declined'});
    });
    await passTime(1);

    // No routing takes place; the browser would perform its own navigation.
    const before = route.current.path;
    link.event('click');
    await passTime(1);
    expect(route.current.path).toEqual(before);
});

test('interceptLinks skips events something else already handled', async () => {
    let link: any;
    A.mount(document.body, () => {
        route.interceptLinks();
        link = A('a', {href: '/somewhere'});
    });
    await passTime(1);

    const before = route.current.path;
    link.event({type: 'click', defaultPrevented: true});
    await passTime(1);
    expect(route.current.path).toEqual(before);
});

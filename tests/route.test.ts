import { expect, test, beforeEach } from "bun:test";
import { resetBrowserState } from "./fakedom";
import { passTime } from "./helpers";
import * as route from "../src/route";
import { mount, $ } from "../src/aberdeen";

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
    mount(document.body, () => {
        route.persistScroll();
    });
    
    const parentEl = $() as any;
    
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
    mount(document.body, () => {
        route.persistScroll();
    });
    
    expect(parentEl.scrollTop).toEqual(100);
    expect(parentEl.scrollLeft).toEqual(50);
});

test('route.persistScroll() with custom name', async () => {
    mount(document.body, () => {
        route.persistScroll('sidebar');
    });
    
    const parentEl = $() as any;
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
    mount(document.body, () => {
        route.interceptLinks();
        
        // Create a link element using Aberdeen's $ function
        link = $('a', {href: '/test/path?foo=bar#section'}, 'Test Link');
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
    mount(document.body, () => {
        route.interceptLinks();
        
        link = $('a', {href: 'https://example.com/path', host: 'example.com'});
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
    mount(document.body, () => {
        route.interceptLinks();
        
        for (const href of testCases) {
            links.push($('a', {href}));
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
    mount(document.body, () => {
        route.interceptLinks();
        
        link = $('a', {href: '/test', target: '_blank'});
    });
    await passTime(1);
    
    const beforePath = route.current.path;
    link.event('click');
    await passTime(1);
    
    expect(route.current.path).toEqual(beforePath);
});

test('interceptLinks handles Enter key on links', async () => {
    let link: any;
    mount(document.body, () => {
        route.interceptLinks();
        
        link = $('a', {href: '/test/keyboard'});
    });
    await passTime(1);
    
    // Simulate Enter key press using fakedom's event method
    link.event({ type: 'keydown', key: 'Enter' });
    await passTime(1);
    
    expect(route.current.path).toEqual('/test/keyboard');
});

test('interceptLinks ignores hash-only links', async () => {
    route.go('/current-page');
    await passTime(1);
    
    let link: any;
    mount(document.body, () => {
        route.interceptLinks();
        
        link = $('a', {href: '#section'});
    });
    await passTime(1);
    
    const initialPath = route.current.path;
    link.event('click');
    await passTime(1);
    
    // Path should not change for hash-only links
    expect(route.current.path).toEqual(initialPath);
});
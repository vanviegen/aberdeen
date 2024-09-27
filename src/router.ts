import { Store, observe } from './aberdeen.js';

function decodeText(s: string) {
    if (s.substring(0,1) === '_') return decodeURIComponent(s.substring(1));
    if (/^\d+$/.test(s)) return parseInt(s);
    return decodeURIComponent(s);
}

function decodeQueryString(queryString: string) {
    let search: { [key: string]: number | true | string } = {};
    for (let s of queryString.substring(1).split("&")) {
        let ss = s.split('=');
        search[decodeURIComponent(s[0])] = ss.length==1 ? true : decodeText(ss[1]);
    }
}

function decodePath(path: string) {
    if (path.substring(0, 1) == '/') path = path.substring(1);
    return path.split("/").map(decodeText);
}

export const state = new Store();
const pathTypes = new Store();

function browserToState() {
    const path = decodePath(location.pathname);
    state.set({
        path,
        search: decodeQueryString(location.search)
    });
    pathTypes.set(path.map(part => typeof part))

}
browserToState()
window.addEventListener('popstate', browserToState);

export const INT = Symbol("INT");
export const STR = Symbol("STR");
export const PATH = Symbol("PATH");
export const ERROR = Symbol("ERROR");

/*
 * - When to redraw a page, and when to just have it update it contents? A push/pop state should do the former? So we should be less reactive there... Perhaps add a counter that gets incremented by popstate and pushstate?
 * - How to do animations? We can't just immediately unrender the previous page. But this is true for reactive in general. Happening has a solution to this.
 * - What if we want to put a hierarchy like Jortt in the URL?
 * - How do we communicate route-based 'blocks' (like a title or title bar icons) up? Just put it in the state? Or communicate directly with template component static state? This is probably easier than with happening, as I don't see a need to leave back-pages in the DOM, so we'll just rerender the page, causing it to set page titles and such. But how do we make sure this kind of state is cleared when going to a new page?
 *   /invoices:/invoices/123?x=1:/transfers/456
 * - For animations: how to know if we're animating left or right?
 */

function recurseRoute(tree: any, pathIndex: number) {
    if (typeof tree === 'function') {
        tree();
    }
    else if (typeof tree === 'string') {
        // TODO: import() a file
    } else {
        observe(() => {
            let part = state.peek('path', pathIndex);
            if (part==null) {
                if (tree._) recurseRoute(tree._, pathIndex); // don't progress index
            }
            else if (tree.hasOwnProperty(part)) {

            }
        });
    }
}

export function route(tree: any) {
    recurseRoute(tree, 0);
}



export function navigate(path: [string | number] | string, args: Object?) {
}



// router.route({
//     _: index,
//     users: {
//         _: listUsers,
//         [router.INT]: showUser
//     }
// })

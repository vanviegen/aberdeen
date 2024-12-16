// import {node, mount, Store, text, router} from 'https://cdn.jsdelivr.net/npm/aberdeen/+esm';
import {node} from '../../dist/aberdeen.js';

export default function() {
    node('h3', 'Welcome home!!')
    node('ul', () => {
        node('li', "Use the tabs to navigate between dynamically loaded pages. They will be pushed to the browser history.")
        node('li', "The List tab demos the use of subpages and a live updating search query parameter.")
        node('li', "Click 'Modal!' to open a modal. It can be closed using browser back. Closing it by clicking the background drop will also remove it from the stack.")
        node('li', "Click 'LOGO' to go home. The stack will be unwound (going back) until the last time this page was visited or the first page in our session.")
    })
}
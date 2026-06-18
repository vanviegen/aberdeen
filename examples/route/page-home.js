// import {$, mount, Store, text, router} from 'https://cdn.jsdelivr.net/npm/aberdeen/+esm';
import A from '../../dist/src/aberdeen.dev.js';

export default function() {
    A('h3#Welcome home!!')
    A('ul', () => {
        A("li#Use the tabs to navigate between dynamically loaded pages. They will be pushed to the browser history.")
        A("li#The List tab demos the use of subpages and a live updating search query parameter.")
        A("li#Click 'Modal!' to open a modal. It can be closed using browser back. Closing it by clicking the background drop will also remove it from the stack.")
        A("li#Click 'LOGO' to go home. The stack will be unwound (going back) until the last time this page was visited or the first page in our session.")
    })
}
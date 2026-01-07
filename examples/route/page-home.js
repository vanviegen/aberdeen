// import {$, mount, Store, text, router} from 'https://cdn.jsdelivr.net/npm/aberdeen/+esm';
import {$} from '../../dist/aberdeen.js';

export default function() {
    $('h3#Welcome home!!')
    $('ul', () => {
        $("li#Use the tabs to navigate between dynamically loaded pages. They will be pushed to the browser history.")
        $("li#The List tab demos the use of subpages and a live updating search query parameter.")
        $("li#Click 'Modal!' to open a modal. It can be closed using browser back. Closing it by clicking the background drop will also remove it from the stack.")
        $("li#Click 'LOGO' to go home. The stack will be unwound (going back) until the last time this page was visited or the first page in our session.")
    })
}
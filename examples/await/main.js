import {$, proxy, onEach, ref } from '../../dist/aberdeen.js';

async function fetchData(path = '') {
    // Artificial delay
    await new Promise(r => setTimeout(r, 1000));
    // Fetch some data
    let resp = await fetch('https://jsonplaceholder.typicode.com/todos' + path);
    return await resp.json();
}

const list = proxy(fetchData());
const modal = proxy();

// The list of items
$('main .busy=', ref(list, 'busy'), () => {
    $('h1 :List')
    $('ul', () => {
        if (!list.value) return;
        onEach(list.value, item => {
            $('li a text=', item.title, 'click=', () => modal.value = item.id)
        }, item => item.completed ? undefined : item.title);
        // ^ only show non-completed items, sort by title
    })
});

// The modal dialog, shown when an item is clicked
$(() => {
    if (!modal.value) return; // No item selected

    // Fetch details for the selected item
    const details = proxy(fetchData("/" + modal.value));

    const closeModal = () => modal.value = null;
    const stopPropagation = e => e.stopPropagation();

    $('div.modal create=fade destroy=fade click=', closeModal, () => {
        $('div.content .busy=', ref(details, 'busy'), 'click=', stopPropagation, () => {
            if (!details.value) return; // Details not loaded yet
            $('h2 text=', details.value.id);
            $('p text=', 'Title: '+details.value.title);
            $('p text=', 'Completed: '+details.value.completed);
        });
    });
});

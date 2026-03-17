import A from '../../dist/aberdeen.js';

async function fetchData(path = '') {
    // Artificial delay
    await new Promise(r => setTimeout(r, 1000));
    // Fetch some data
    let resp = await fetch('https://jsonplaceholder.typicode.com/todos' + path);
    return await resp.json();
}

const list = A.proxy(fetchData());
const modal = A.proxy();

// The list of items
A('main .busy=', A.ref(list, 'busy'), () => {
    A('h1 :List')
    A('ul', () => {
        if (!list.value) return;
        A.onEach(list.value, item => {
            A('li a text=', item.title, 'click=', () => modal.value = item.id)
        }, item => item.completed ? undefined : item.title);
        // ^ only show non-completed items, sort by title
    })
});

// The modal dialog, shown when an item is clicked
A(() => {
    if (!modal.value) return; // No item selected

    // Fetch details for the selected item
    const details = A.proxy(fetchData("/" + modal.value));

    const closeModal = () => modal.value = null;
    const stopPropagation = e => e.stopPropagation();

    A('div.modal create=fade destroy=fade click=', closeModal, () => {
        A('div.content .busy=', A.ref(details, 'busy'), 'click=', stopPropagation, () => {
            if (!details.value) return; // Details not loaded yet
            A('h2 text=', details.value.id);
            A('p text=', 'Title: '+details.value.title);
            A('p text=', 'Completed: '+details.value.completed);
        });
    });
});

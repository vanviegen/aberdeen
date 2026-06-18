import A from '../../dist/src/aberdeen.dev.js';
import { grow, shrink } from '../../dist/src/transitions.js';

// The `A.proxy` function makes the data structure observable.
const data = A.proxy({
    name: 'John Doe',
    age: 23,
    gender: 'w',
    active: false,
    vehicle: 'car',
    bio: 'John was born on an unknown date at an unknown location.\n\nHis main claim to fame is showing up out of nowhere.',
    color: '#00fa9a',
});

// Add an <h2>. Unless `mount` is used, our root is the `<body>`.
A('h2', () => {
    // Add a text node ('#' prefix) to h2. This anonymous function will be rerun whenever
    // `data.name` changes, first removing the earlier text node.
    A("#", (data.name || "Nobody") + "'s biography");
});

// We're creating a two-way binding between this input element and `data.name`.
// As `bind` needs two-way access to our variable, just passing in a value wouldn't work.
// The `A.ref()` function creates an object with just a `value` property that is proxied
// to the given object and property.
A('input', { bind: A.ref(data, 'name') });
A('input', { type: 'number', placeholder: 'Age', bind: A.ref(data, 'age') });

A('label', () => {
    A('input', { type: 'checkbox', bind: A.ref(data, 'active') });
    A('#Active member');
});

A(() => {
    // This block will rerun when any observed data is changed.
    if (data.active) {
        // Show the member id field only for active members.
        A('input', { 
            type: 'number', 
            placeholder: 'Member id', 
            create: grow, // Use shiny transitions to show/hide this field.
            destroy: shrink, 
            bind: A.ref(data, 'member_id') 
        });
    } else {
        // When `active` has been untoggled, we want to forget the `member_id`.
        delete data.member_id;
    }
});

A('select', { bind: A.ref(data, 'gender') }, () => {
    A('option#Man', { value: "m" });
    A('option#Woman', { value: "w" });
    A('option#Other', { value: "o" });
});

A(() => {
    if (data.gender === 'o') {
        A('input', { 
            placeholder: 'Specify gender', 
            create: grow, 
            destroy: shrink, 
            bind: A.ref(data, 'gender_other') 
        });
    } else if (data.gender_other) {
        delete data.gender_other;
    }
});

A('fieldset', () => {
    A('legend#Vehicle')
    const vehicles = { plane: 'Plane', car: 'Car', bike: 'Bicycle', none: 'None' };
    for (let id in vehicles) {
        A('label', () => {
            A('input', { 
                type: 'radio', 
                name: 'vehicle', 
                value: id, 
                bind: A.ref(data, 'vehicle') 
            });
            A("#", vehicles[id]);
        });
    }
});

A('textarea', { placeholder: "Biography", bind: A.ref(data, 'bio') });

A('label', () => {
    A('input', { type: 'color', bind: A.ref(data, 'color') });
    A('#Favorite color');
});

A('input', { type: 'range', min: 50, max: 230, bind: A.ref(data, 'height') });

A('input', { type: 'date', bind: A.ref(data, 'first_day') });

A('pre', () => {
    A({ text: JSON.stringify(data, undefined, 4) });
});

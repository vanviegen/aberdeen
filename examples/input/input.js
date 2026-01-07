import { $, proxy, ref } from '../../dist/aberdeen.js';
import { grow, shrink } from '../../dist/transitions.js';

// The `proxy` function makes the data structure observable.
const data = proxy({
    name: 'John Doe',
    age: 23,
    gender: 'w',
    active: false,
    vehicle: 'car',
    bio: 'John was born on an unknown date at an unknown location.\n\nHis main claim to fame is showing up out of nowhere.',
    color: '#00fa9a',
});

// Add an <h2>. Unless `mount` is used, our root is the `<body>`.
$('h2', () => {
    // Add a text node ('#' prefix) to h2. This anonymous function will be rerun whenever
    // `data.name` changes, first removing the earlier text node.
    $("#", (data.name || "Nobody") + "'s biography");
});

// We're creating a two-way binding between this input element and `data.name`.
// As `bind` needs two-way access to our variable, just passing in a value wouldn't work.
// The `ref()` function creates an object with just a `value` property that is proxied
// to the given object and property.
$('input', { bind: ref(data, 'name') });
$('input', { type: 'number', placeholder: 'Age', bind: ref(data, 'age') });

$('label', () => {
    $('input', { type: 'checkbox', bind: ref(data, 'active') });
    $('#Active member');
});

$(() => {
    // This block will rerun when any observed data is changed.
    if (data.active) {
        // Show the member id field only for active members.
        $('input', { 
            type: 'number', 
            placeholder: 'Member id', 
            create: grow, // Use shiny transitions to show/hide this field.
            destroy: shrink, 
            bind: ref(data, 'member_id') 
        });
    } else {
        // When `active` has been untoggled, we want to forget the `member_id`.
        delete data.member_id;
    }
});

$('select', { bind: ref(data, 'gender') }, () => {
    $('option#Man', { value: "m" });
    $('option#Woman', { value: "w" });
    $('option#Other', { value: "o" });
});

$(() => {
    if (data.gender === 'o') {
        $('input', { 
            placeholder: 'Specify gender', 
            create: grow, 
            destroy: shrink, 
            bind: ref(data, 'gender_other') 
        });
    } else if (data.gender_other) {
        delete data.gender_other;
    }
});

$('fieldset', () => {
    $('legend#Vehicle')
    const vehicles = { plane: 'Plane', car: 'Car', bike: 'Bicycle', none: 'None' };
    for (let id in vehicles) {
        $('label', () => {
            $('input', { 
                type: 'radio', 
                name: 'vehicle', 
                value: id, 
                bind: ref(data, 'vehicle') 
            });
            $("#", vehicles[id]);
        });
    }
});

$('textarea', { placeholder: "Biography", bind: ref(data, 'bio') });

$('label', () => {
    $('input', { type: 'color', bind: ref(data, 'color') });
    $('#Favorite color');
});

$('input', { type: 'range', min: 50, max: 230, bind: ref(data, 'height') });

$('input', { type: 'date', bind: ref(data, 'first_day') });

$('pre', () => {
    $({ text: JSON.stringify(data, undefined, 4) });
});

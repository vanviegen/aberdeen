import A from '../../dist/src/aberdeen.dev.js';

const radius = A.proxy(20);

A('h1#Aberdeen SVG Support Demo');

A('div', () => {
    A('p#This is an inline SVG:')
    A('svg', { width: 100, height: 100, $backgroundColor: '#eee' }, () => {
        // SVG elements are created with proper SVG namespace
        A('circle', {
            cx: 50, 
            cy: 50, 
            r: radius, 
            fill: 'blue',
            stroke: 'darkblue',
            'stroke-width': 2
        });
        
        A('text', {
            x: 50,
            y: 55,
            'text-anchor': 'middle',
            fill: 'white',
            'font-family': 'Arial',
            'font-size': 12,
            text: radius
        });
    });
    
    A('p', () => {
        A('button#Decrement radius', {click: () => radius.value -= 5});
        A('button#Increment radius', {click: () => radius.value += 5});
    });
});
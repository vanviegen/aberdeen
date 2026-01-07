import { $, proxy } from '../../dist/aberdeen.js';

const radius = proxy(20);

$('h1#Aberdeen SVG Support Demo');

$('div', () => {
    $('p#This is an inline SVG:')
    $('svg', { width: 100, height: 100, $backgroundColor: '#eee' }, () => {
        // SVG elements are created with proper SVG namespace
        $('circle', {
            cx: 50, 
            cy: 50, 
            r: radius, 
            fill: 'blue',
            stroke: 'darkblue',
            'stroke-width': 2
        });
        
        $('text', {
            x: 50,
            y: 55,
            'text-anchor': 'middle',
            fill: 'white',
            'font-family': 'Arial',
            'font-size': 12,
            text: radius
        });
    });
    
    $('p', () => {
        $('button#Decrement radius', {click: () => radius.value -= 5});
        $('button#Increment radius', {click: () => radius.value += 5});
    });
});
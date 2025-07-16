import { $, proxy } from './dist/aberdeen.js';

// Simple example showing embedded SVG support
const data = proxy({ count: 0 });

$('h1:Aberdeen SVG Support Demo');

$('div', () => {
    $('p:Regular HTML elements work as before');
    
    $('svg', { width: 200, height: 100, style: 'border: 1px solid #ccc' }, () => {
        // SVG elements are created with proper SVG namespace
        $('circle', {
            cx: 50, 
            cy: 50, 
            r: 20, 
            fill: 'blue',
            stroke: 'darkblue',
            'stroke-width': 2
        });
        
        $('rect', {
            x: 100,
            y: 30,
            width: 40,
            height: 40,
            fill: 'red',
            stroke: 'darkred',
            'stroke-width': 2
        });
        
        $('text', {
            x: 120,
            y: 85,
            'text-anchor': 'middle',
            fill: 'white',
            'font-family': 'Arial',
            'font-size': 12
        }, () => {
            $(':Count: ' + data.count);
        });
    });
    
    $('p', () => {
        $('button:Increment', {
            click: () => data.count++,
            style: 'margin: 10px;'
        });
        $(':Current count: ' + data.count);
    });
});
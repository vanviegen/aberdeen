// import {$, mount, Store, text, router} from 'https://cdn.jsdelivr.net/npm/aberdeen/+esm';
import {$} from '../../dist/aberdeen.js';
import {route} from "../../dist/route.js";

const words = ['butterfly', 'orchestra', 'whisper', 'mountain', 'zebra', 'chocolate', 'umbrella', 'lighthouse', 'rainbow', 'dragon', 'bicycle', 'galaxy', 'penguin', 'tornado', 'waterfall', 'cinnamon', 'compass', 'firefly', 'carousel', 'telescope'];

export default function() {
    $('input', {bind: route('search', 'filter'), placeholder: 'Filter'})

    $('.columns', () => {

        // The list of words
        $('nav.vertical', () => {
            for(let word of words) {
                $('button', {text: word, click: () => route('p', 1).set(word)}, () => {
                    $({
                        '.active': route('p', 1).get() === word,
                        $display: word.indexOf(route('search', 'filter').get() || '') >= 0 ? '' : 'none'
                    })
                })
            }
        })
        
        // The detail view for the selected word
        $('section', () => {
            const word = route('p', 1).get()
            if (!word) return
            if (words.indexOf(word) < 0) {
                // Word specified in URL is not in our list. Go back to list without selection.
                route.merge({mode: 'back', p: {1: undefined}})
                return
            }
            $('h2', {text: word})
            $('p', {text: `This word has ${word.length} letters.`})
        })
    })
}
// import {node, mount, Store, text, router} from 'https://cdn.jsdelivr.net/npm/aberdeen/+esm';
import {node, prop} from '../../dist/aberdeen.js';
import {route} from "../../dist/route.js";

const words = ['butterfly', 'orchestra', 'whisper', 'mountain', 'zebra', 'chocolate', 'umbrella', 'lighthouse', 'rainbow', 'dragon', 'bicycle', 'galaxy', 'penguin', 'tornado', 'waterfall', 'cinnamon', 'compass', 'firefly', 'carousel', 'telescope'];

export default function() {
    node('input', route.makeRef('search', 'filter'), {placeholder: 'Filter'})

    node('.columns', () => {

        // The list of words
        node('nav.vertical', () => {
            for(let word of words) {
                node('button', word, {click: () => route.set('p', 1, word)}, () => {
                    prop('class', {active: route.get('p', 1) === word})
                    prop('style', {display: word.indexOf(route.get('search', 'filter') || '') >= 0 ? '' : 'none' })
                })
            }
        })
        
        // The detail view for the selected word
        node('section', () => {
            const word = route.get('p', 1)
            if (!word) return
            if (words.indexOf(word) < 0) {
                // Word specified in URL is not in our list. Go back to list without selection.
                route.merge({mode: 'back', p: {1: undefined}})
                return
            }
            node('h2', word)
            node('p', `This word has ${word.length} letters.`)
        })
    })
}
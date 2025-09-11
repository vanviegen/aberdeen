import {$, ref} from '../../dist/aberdeen.js';
import * as route from "../../dist/route.js";

console.log(route);

const words = ['butterfly', 'orchestra', 'whisper', 'mountain', 'zebra', 'chocolate', 'umbrella', 'lighthouse', 'rainbow', 'dragon', 'bicycle', 'galaxy', 'penguin', 'tornado', 'waterfall', 'cinnamon', 'compass', 'firefly', 'carousel', 'telescope'];

export default function() {
    $('input', {bind: ref(route.current.search, 'filter'), placeholder: 'Filter'});

    $('div.columns', () => {

        // The list of words
        $('nav.vertical', () => {
            for(let word of words) {
                $('button', {text: word, click: () => route.p[1] = word}, () => {
                    $({
                        '.active': route.current.p[1] === word,
                        $display: word.indexOf(route.current.search.filter || '') >= 0 ? '' : 'none'
                    })
                })
            }
        })
        
        // The detail view for the selected word
        $('section', () => {
            const word = route.current.p[1]
            if (!word) return
            if (words.indexOf(word) < 0) {
                // Word specified in URL is not in our list. Go back to list without selection.
                route.back(route.current.p.slice(0,1));
                return
            }
            $('h2', {text: word})
            $('p', {text: `This word has ${word.length} letters.`})
        })
    })
}
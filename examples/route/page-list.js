import A from '../../dist/aberdeen.js';
import * as route from "../../dist/route.js";

console.log(route);

const words = ['butterfly', 'orchestra', 'whisper', 'mountain', 'zebra', 'chocolate', 'umbrella', 'lighthouse', 'rainbow', 'dragon', 'bicycle', 'galaxy', 'penguin', 'tornado', 'waterfall', 'cinnamon', 'compass', 'firefly', 'carousel', 'telescope'];

export default function() {
    A('input', {bind: A.ref(route.current.search, 'filter'), placeholder: 'Filter'});

    A('div.columns', () => {

        // The list of words
        A('nav.vertical', () => {
            for(let word of words) {
                A('button', {text: word, click: () => route.p[1] = word}, () => {
                    A({
                        '.active': route.current.p[1] === word,
                        $display: word.indexOf(route.current.search.filter || '') >= 0 ? '' : 'none'
                    })
                })
            }
        })
        
        // The detail view for the selected word
        A('section', () => {
            const word = route.current.p[1]
            if (!word) return
            if (words.indexOf(word) < 0) {
                // Word specified in URL is not in our list. Go back to list without selection.
                route.back(route.current.p.slice(0,1));
                return
            }
            A('h2', {text: word})
            A('p', {text: `This word has ${word.length} letters.`})
        })
    })
}
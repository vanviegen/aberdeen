/**
 * This example is a bit more complicated, but it features dynamic module loading
 * for pages as well as modal content. 
 */

import A from '../../dist/src/aberdeen.dev.js';
import * as route from "../../dist/src/route.js";

// If opened directly from a file, fake the initial path as '/'
if (route.current.p.indexOf('route') >= 0) {
    route.current.p = [];
}

// Create a A.proxy for dynamically loaded modules
const modules = A.proxy({});

function loadModule(name) {
    const module = modules[name];
    if (module == null) {
        backgroundLoadModule(name);
    }
    return module;
}

async function backgroundLoadModule(name) {
    let module;
    try {
        module = await import(`./page-${name || 'home'}.js`);
    } catch(e) {
        console.error(e);
        module = false;
    }
    modules[name] = module;
}

// Main page component wrapped in observer to make it reactive
A(() => {
    A('header', () => {
        A('nav', () => {
            A('button.no-line.logo', 'LOGO', {
                click: () => route.back('/')
            });
            
            // Draw the top navigation bar
            const menu = { "": 'Home', settings: 'Settings', list: 'List' };
            for (const [id, label] of Object.entries(menu)) {
                A('button', {
                    text: label, 
                    click: () => route.go("/"+id)
                }, () => {
                    A({ '.active': route.current.p[0] === (id || undefined) });
                });
            }
            
            A('div', { $flex: 1 });
            A('button.no-line#Modal!', {
                click: () => route.push({state: {modal: 'settings'}})
            });
        });
    });
    
    A('main', () => {
        let module = loadModule(route.current.p[0]);
        if (module) {
            module.default();
        } else if (module === false) {
            A('p:No such page!');
        } else {
            A('p:Loading...');
        }
    });
    
    A("footer", () => {
        // Display route data for debugging
        A({ text: JSON.stringify(route.current, null, 2) });
    });
    
    A(() => {
        let modal = route.current.state.modal;
        if (!modal) return;
        
        A('div.modal-bg', {
            click: function(e) {
                if (e.target === this) {
                    route.back({state: {modal: undefined}});
                }
            },
            create: "transparent",
            destroy: "transparent",
        }, () => {
            A('div.modal', () => {
                let module = loadModule(modal);
                if (module) {
                    module.default();
                } else if (module === false) {
                    A('p:No such modal!');
                } else {
                    A('p:Loading...');
                }
            });
        });
    });
});
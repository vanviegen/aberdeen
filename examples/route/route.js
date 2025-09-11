/**
 * This example is a bit more complicated, but it features dynamic module loading
 * for pages as well as modal content. 
 */

import { $, proxy } from '../../dist/aberdeen.js';
import * as route from "../../dist/route.js";

// If opened directly from a file, fake the initial path as '/'
if (route.current.p.indexOf('route') >= 0) {
    route.current.p = [];
}

// Create a proxy for dynamically loaded modules
const modules = proxy({});

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
$(() => {
    $('header', () => {
        $('nav', () => {
            $('button.no-line.logo', 'LOGO', {
                click: () => route.back('/')
            });
            
            // Draw the top navigation bar
            const menu = { "": 'Home', settings: 'Settings', list: 'List' };
            for (const [id, label] of Object.entries(menu)) {
                $('button', {
                    text: label, 
                    click: () => route.go("/"+id)
                }, () => {
                    $({ '.active': route.current.p[0] === (id || undefined) });
                });
            }
            
            $('div', { $flex: 1 });
            $('button.no-line:Modal!', {
                click: () => route.push({state: {modal: 'settings'}})
            });
        });
    });
    
    $('main', () => {
        let module = loadModule(route.current.p[0]);
        if (module) {
            module.default();
        } else if (module === false) {
            $('p:No such page!');
        } else {
            $('p:Loading...');
        }
    });
    
    $("footer", () => {
        // Display route data for debugging
        $({ text: JSON.stringify(route.current, null, 2) });
    });
    
    $(() => {
        let modal = route.current.state.modal;
        if (!modal) return;
        
        $('div.modal-bg', {
            click: function(e) {
                if (e.target === this) {
                    route.back({state: {modal: undefined}});
                }
            },
            create: "transparent",
            destroy: "transparent",
        }, () => {
            $('div.modal', () => {
                let module = loadModule(modal);
                if (module) {
                    module.default();
                } else if (module === false) {
                    $('p:No such modal!');
                } else {
                    $('p:Loading...');
                }
            });
        });
    });
});
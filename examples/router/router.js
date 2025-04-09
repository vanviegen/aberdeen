import { $, proxy, observe, copy, MERGE } from '../../dist/aberdeen.js';
import { route } from "../../dist/route.js";

// If opened directly from a file, fake the initial path as '/'
if (route.p.indexOf('router') >= 0) {
    copy(route, { path: '/', mode: 'replace' });
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

// Main page component wrapped in observe to make it reactive
observe(() => {
    $('header', () => {
        $('nav', () => {
            $('button.no-line.logo', 'LOGO', {
                click: () => copy(route, { path: '/', mode: 'back' })
            });
            
            // Draw the top navigation bar
            const menu = { "": 'Home', settings: 'Settings', list: 'List' };
            for (const [id, label] of Object.entries(menu)) {
                $('button', {
                    text: label, 
                    click: () => copy(route, { p: [id] })
                }, () => {
                    $({ '.active': route.p[0] === id });
                });
            }
            
            $('div', { $flex: 1 });
            $('button.no-line:Modal!', {
                click: () => route.id = { modal: 'home' }
            });
        });
    });
    
    $('main', () => {
        let module = loadModule(route.p[0]);
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
        $({ text: JSON.stringify(route, null, 2) });
    });
    
    $(() => {
        let modal = route.id?.modal;
        if (!modal) return;
        
        $('div.modal-bg', {
            click: function(e) {
                if (e.target === this) {
                    copy(route, { mode: 'back', id: {modal: undefined} }, MERGE);
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
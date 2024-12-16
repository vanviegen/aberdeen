// import {node, mount, Store, text, router} from 'https://cdn.jsdelivr.net/npm/aberdeen/+esm';
import {node, mount, Store, text, observe, prop} from '../../dist/aberdeen.js';
import {route} from "../../dist/route.js";
import {grow, shrink} from "../../dist/transitions.js"

// This is not something you'd normally do: when opening this example from a file
// (instead of serving it from a well-configured backend), fake the initial path
// as if it were `/`.
if (route.get('p').indexOf('router') >= 0) route.set({path: '/'})

// Load modules on-demand
const modules = new Store({})
function loadModule(name) {
    const module = modules.get(name)
    if (module==null) backgroundLoadModule(name)
    return module
}
async function backgroundLoadModule(name) {
    let module
    try {
        module = await import(`./page-${name||'home'}.js`)
    } catch(e) {
        console.error(e)
        module = false
    }
    modules.set(name, module)
}

// Are main page component
function drawTemplate() {
    node('header', () => {
        node('nav', () => {
            node('button.no-line.logo', 'LOGO', {click: () => route.set({path: '/'})})
            // Draw the top navigation bar
            const menu = {"": 'Home', settings: 'Settings', list: 'List'}
            for(const [id, label] of Object.entries(menu)) {
                node('button', label, {click: () => route.set({p: [id]})}, () => {
                    prop('class', {active: route.get('p', 0) === id})
                })
            }
            node('div', {style: {flex: 1}})
            node('button.no-line', 'Modal!', {click: () => route.set('state', 'modal', 'home')})
        })
    })

    node('main', () => {
        let module = loadModule(route.get('p', 0))
        if (module) module.default()
        else if (module===false) node('p', 'No such page!')
        else node('p', 'Loading...')
    })

    node("footer", () => {
        route.dump()
    })

    observe(() => {
        let modal = route.get('state', 'modal');
        if (!modal) return
        node('.modal-bg', () => {
            node('.modal', () => {
                let module = loadModule(modal);
                if (module) module.default()
                else if (module===false) node('p', 'No such modal!')
                else node('p', 'Loading...')
            })
        }, {
            click: function(e) {if (e.target===this) route.merge({mode: 'back', state: {modal: undefined}})},
            create: grow,
            destroy: shrink,
        })
        
    })
}

mount(document.body, drawTemplate)

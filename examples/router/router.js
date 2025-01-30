// import {$, mount, Store, text, router} from 'https://cdn.jsdelivr.net/npm/aberdeen/+esm';
import {$, mount, Store, observe} from '../../dist/aberdeen.js';
import {route} from "../../dist/route.js";

// This is not something you'd normally do: when opening this example from a file
// (instead of serving it from a well-configured backend), fake the initial path
// as if it were `/`.
if (route('p').get().indexOf('router') >= 0) route.set({path: '/', mode: 'replace'})

// Load modules on-demand
const modules = new Store({})
function loadModule(name) {
    const module = modules(name).get()
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
    modules(name).set(module)
}

// Are main page component
function drawTemplate() {
    $('header', () => {
        $('nav', () => {
            $('button.no-line.logo', 'LOGO', {click: () => route.set({path: '/', mode: 'back'})})
            // Draw the top navigation bar
            const menu = {"": 'Home', settings: 'Settings', list: 'List'}
            for(const [id, label] of Object.entries(menu)) {
                $('button', {text: label, click: () => route.set({p: [id]})}, () => {
                    $({'.active': route('p', 0).get() === id})
                })
            }
            $('div', {$flex: 1})
            $('button.no-line:Modal!', {click: () => route('id', 'modal').set('home')})
        })
    })

    $('main', () => {
        let module = loadModule(route('p', 0).get())
        if (module) module.default()
        else if (module===false) $('p:No such page!')
        else $('p:Loading...')
    })

    $("footer", () => {
        route.dump()
    })

    $(() => {
        let modal = route('id', 'modal').get();
        if (!modal) return
        $('.modal-bg', () => {
            $('.modal', () => {
                let module = loadModule(modal);
                if (module) module.default()
                else if (module===false) $('p:No such modal!')
                else $('p:Loading...')
            })
        }, {
            click: function(e) {if (e.target===this) route.merge({mode: 'back', id: undefined})},
            create: "transparent",
            destroy: "transparent",
        })
    })
}

mount(document.body, drawTemplate)

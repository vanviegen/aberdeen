let styleE = document.createElement('style');
styleE.innerText = `
iframe {
    width: 100%;
    border: none;
    border-radius: 0.8em;
    box-shadow: #0008 0px 0px 8px;
 }
.console-output {
    max-height: 200px;
    overflow-y: auto;
    background: #444;
    border-radius: 0.8em;
    box-shadow: #0008 0px 0px 8px;
    padding: 8px;
    font-family: monospace;
    margin-top: 8px;
}
.console-output > .error { color: #faa; }
.console-output > .info { color: #afa; font-weight: bold; }
.console-output > .debug { color: #ccc; }
`;
document.head.appendChild(styleE);

let iframeCount = 0;

function iframeCode(iframeId) {
    function update() {
        const height = document.documentElement.offsetHeight;
        window.parent.postMessage({ height, iframeId, html: getHtml(document.body) }, '*');
    }

    function createLogFunction(level) {
        return (...args) => window.parent.postMessage({
            level,
            args,
            iframeId
        }, '*');
    }
    
    window.console = {
        log: createLogFunction('log'),
        error: createLogFunction('error'),
        info: createLogFunction('info'),
        debug: createLogFunction('debug')
    };
    
    // Catch unhandled errors
    window.onerror = (message, source, lineno, colno, error) => {
        console.error(message);
        return false;
    };

    // Catch unhandled promise rejections
    window.onunhandledrejection = (event) => {
        console.error('Unhandled Promise rejection:', event.reason);
    };
    
    document.addEventListener('DOMContentLoaded', () => {
        new MutationObserver(update).observe(document.body, { 
            childList: true, 
            subtree: true 
        });
        update();
    });

    function getHtml(element, indent='') {
        let output = '';
        for (const child of element.childNodes) {
            if (!child.children?.length) {
                output += 'outerHTML' in child ? indent + child.outerHTML + "\n" : '';
            } else {
                const outerHTML = child.cloneNode(false).outerHTML;

                let openClose = outerHTML.split('></');
                output += indent + openClose[0] + '>\n';
                output += getHtml(child, indent+'  ');
                output += indent + '</' + openClose[1] + "\n";
            }
        }

        return output;
    }
}

addEventListener('DOMContentLoaded', () => {
    for(let codeE of document.querySelectorAll('code[class="javascript"]')) {
        const preE = codeE.parentElement;
        if (preE.tagName !== 'PRE') continue;
        let js = '';
        for(let wordE of codeE.children) {
            if (wordE.tagName==='BR') js += "\n";
            else js += wordE.textContent;
        }

        const base = document.body.parentElement.getAttribute('data-base') || '/';
        const absBase = new URL(base, window.location.href).href;
        
        // Check for Aberdeen imports
        const orgJs = js;
        js = js.replace(/from\s+['"]aberdeen(\/[^'"]+)?['"]/g, 
            (match, subpath) => `from "${absBase}assets/aberdeen${subpath || '/aberdeen'}.js"`
        );
        if (js === orgJs) {
            // No imports have been done, do our default input
            js = `import * as aberdeen from "${absBase}assets/aberdeen/aberdeen.js";\nObject.assign(window, aberdeen);\n` + js;
        }

        const iframeE = document.createElement('iframe');
        const iframeId = ++iframeCount;
        iframeE.id = iframeId;
        
        // Create console output div
        const consoleE = document.createElement('div');
        consoleE.className = 'console-output';
        
        // Create restart button
        const restartBtn = document.createElement('button');
        restartBtn.className = 'button';
        restartBtn.textContent = 'Restart';
        restartBtn.style.marginTop = '25px';
        restartBtn.onclick = () => {
            iframeE.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
            consoleE.innerHTML = '';
            consoleE.remove();
        };
        preE.appendChild(restartBtn);

        const html = `<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
        <style>body { padding: 0.8em; }</style>
        <script>
            (${iframeCode.toString()})(${iframeId});
        </script>
        <script type="module">
            ${js}
        </script>
    </head>
    <body>
    </body>
</html>`;
        iframeE.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
        
        const messageHandler = (e) => {
            if (e.data.iframeId == iframeId) {
                console.log(e.data);
                if (e.data.height) {
                    iframeE.style.height = e.data.height + 'px';
                }
                if (e.data.html) {
                    htmlE.innerText = e.data.html;
                }
                if (e.data.level) {
                    const msg = document.createElement('div');
                    msg.className = e.data.level;
                    msg.textContent = e.data.args.map(a => ''+a).join(' ');
                    consoleE.appendChild(msg);
                    if (!consoleE.parentElement) iframeE.after(consoleE);
                    consoleE.scrollTop = consoleE.scrollHeight;
                }
            }
        };
        addEventListener('message', messageHandler);
        preE.after(iframeE);

        const htmlE = document.createElement('pre');
        iframeE.after(htmlE);
    }
})
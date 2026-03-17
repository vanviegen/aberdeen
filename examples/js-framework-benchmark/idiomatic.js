import A from "./dist-min/aberdeen.js";
import { buildData } from "./build-dummy-data.js";

const data = A.proxy([]); // [{id, label}, ...]
const selected = A.proxy({}); // {[selectedId]: true} or {}

// Aberdeen mounts on document.body by default.
A('div', {id: "main"}, 'div.container', () => {

    // The buttons
    A('div.jumbotron', 'div.row', () => {
        A('div.col-md-6', 'h1:Aberdeen-"keyed"');
        A('div.col-md-6', 'div.row', () => {
            A('div.col-sm-6.smallpad', 'button.btn.btn-primary.btn-block:Create 1,000 rows', {
                type: "button",
                id: "run",
                click: () => data.splice(0, data.length, ...buildData())
            });
            A('div.col-sm-6.smallpad', 'button.btn.btn-primary.btn-block:Create 10,000 rows', {
                type: "button",
                id: "runlots",
                click: () => data.splice(0, data.length, ...buildData(10000))
            });
            A('div.col-sm-6.smallpad', 'button.btn.btn-primary.btn-block:Append 1,000 rows', {
                type: "button",
                id: "add",
                click: () => data.push(...buildData())
            });
            A('div.col-sm-6.smallpad', 'button.btn.btn-primary.btn-block:Update every 10th row', {
                type: "button",
                id: "update",
                click: () => {
                    for(let i=0; i<data.length; i+=10) {
                        data[i].label += ' !!!';
                    }
                }
            });
            A('div.col-sm-6.smallpad', 'button.btn.btn-primary.btn-block:Clear', {
                type: "button",
                id: "clear",
                click: () => data.length = 0
            });
            A('div.col-sm-6.smallpad', 'button.btn.btn-primary.btn-block:Swap Rows', {
                type: "button",
                id: "swaprows",
                click: () => {
                    if (data.length > 998) [data[1], data[998]] = [data[998], data[1]];
                }
            });
        });
    });

    // The table
    A('table.table.table-hover.table-striped.test-data', 'tbody', () => {
        A.onEach(data, (item, index) => {
            A('tr', () => {
                A({".danger": selected[item.id]})
                A('td.col-md-1:'+item.id);
                A('td.col-md-4', 'a', {text: A.ref(item,'label')}, {
                    click: function() {
                        A.copy(selected, {[item.id]: true})
                    }
                });
                A('td.col-md-1', 'a', 'span.glyphicon.glyphicon-remove', {
                    "aria-hidden": "true",
                    click: () => {
                        // This is very slow, as all later items need to be recreated.
                        data.splice(index, 1);
                    }
                });
                A('td.col-md-6');
            });
        })
    });
});

/**
 * This implementation uses a sprinkle of non-idiomatic optimization, as the 
 * delete-row operation doesn't combine well with the row-position based
 * operations (swap and update) in Aberdeen.
 * 
 * Aberdeen excels at showing changing list of things in some specified
 * sort order (which would be just as fast as sorting by array index, as
 * demonstrated by the sort-by-label bonus feature), and doing modifications
 * by id. (Which seems a lot more common than what js-framework-benchmark
 * wants?) 
 * 
 * The idiomatic implementation (with very slow deletes) is in `idiomatic.js`.
 */

import A from '../../dist/aberdeen.js';
import { buildData } from "./build-dummy-data.js";

const unproxiedData = []; // [{id, label}, ...]
const data = A.proxy(unproxiedData); // [{id, label}, ...]
const selected = A.proxy({}); // {[selectedId]: true} or {}
const sortByLabel = A.proxy(false);

// Aberdeen mounts on document.body by default.
A('div', {id: "main"}, 'div.container', () => {

    // The buttons
    A('div.jumbotron', 'div.row', () => {
        A('div.col-md-6', () => {
            A('h1:Aberdeen-"keyed"');
            A('div.checkbox', 'label', () => {
                A('input', {type: 'checkbox'}, {bind: sortByLabel})
                A(":Sort by label");
            });
        })
        A('div.col-md-6', 'div.row', () => {
            A('div.col-sm-6.smallpad', 'button.btn.btn-primary.btn-block:Create 1,000 rows', {
                type: "button",
                id: "run",
                click: () => A.copy(data, buildData())
            });
            A('div.col-sm-6.smallpad', 'button.btn.btn-primary.btn-block:Create 10,000 rows', {
                type: "button",
                id: "runlots",
                click: () => A.copy(data, buildData(10000))
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
                    // We need to iterate, because our array can be sparse due to deletes.
                    // For performance, we're scanning through the unproxied version of our data.
                    let cnt = 0;
                    for(let i=0; i<unproxiedData.length; i++) {
                        if (unproxiedData[i]) {
                            if (!(cnt++ % 10)) data[i].label += ' !!!';
                        }
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
                    // We need to iterate, because our array can be sparse due to deletes.
                    // For performance, we're scanning through the unproxied version of our data.
                    let cnt = 0, first, second;
                    for(let i=0; i<unproxiedData.length; i++) {
                        if (unproxiedData[i]) {
                            if (cnt === 1) first = i;
                            else if (cnt === 998) {
                                second = i;
                                [data[first], data[second]] = [data[second], data[first]];
                                break;
                            }
                            cnt++;
                        }
                    }
                }
            });
        });
    });

    // The table
    A('table.table.table-hover.table-striped.test-data', 'tbody', () => {
        A.onEach(data, (item, index) => {
            A('tr', () => {
                A(() => {
                    if (selected[item.id]) A('.danger');
                })
                A('td.col-md-1:'+item.id);
                A('td.col-md-4', 'a', {text: A.ref(item,'label')}, {
                    click: function() {
                        A.copy(selected, {[item.id]: true})
                    }
                });
                A('td.col-md-1', 'a', 'span.glyphicon.glyphicon-remove', {
                    "aria-hidden": "true",
                    click: () => delete data[index]
                });
                A('td.col-md-6');
            });
        }, sortByLabel.value ? item=>item.label : undefined);
    });
});

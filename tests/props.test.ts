import { expect, test } from "bun:test";
import { assertBody, passTime, fakedom } from "./helpers";
import A from "../src/aberdeen";

test('Sets and unsets classes', async () => {
    let cnt1 = 0, cnt2 = 0, cnt3 = 0;
    let classObj = A.proxy({".a": false, ".b": true, ".c": undefined} as any);
    A.mount(document.body, () => {
        cnt1++;
        A('div', () => {
            cnt2++;
            A(() => {
                cnt3++;
                A(classObj);
            });
        });
    });
    await passTime();
    assertBody(`div.b`);
    
    A.merge(classObj, {".a": true, ".d": true});
    await passTime();
    assertBody(`div.a.b.d`);
    
    classObj[".a"] = false;
    delete classObj[".b"]; // Now removes the class: object-form classes restore on scope clean
    await passTime();
    assertBody(`div.d`);

    expect([cnt1, cnt2, cnt3]).toEqual([1, 1, 3]);
});

test('Removes inline class from parent element when its scope re-runs', async () => {
    // An inline `.class` set on the scope's own element should disappear once
    // the scope that set it is cleaned/re-run.
    const cond = A.proxy(true);
    A.mount(document.body, () => {
        A('div', () => {
            A(() => {
                if (cond.value) A('.active');
            });
        });
    });
    await passTime();
    assertBody(`div.active`);

    cond.value = false;
    await passTime();
    assertBody(`div`);

    cond.value = true;
    await passTime();
    assertBody(`div.active`);
});

test('Restores attribute on parent element when its scope re-runs', async () => {
    // An attribute set by a nested scope on the parent element should be restored
    // to whatever value it had before that scope set it.
    const cond = A.proxy(true);
    A.mount(document.body, () => {
        A('div', () => {
            A('title=base');
            A(() => {
                if (cond.value) A('title=override');
            });
        });
    });
    await passTime();
    assertBody(`div{title=override}`);

    cond.value = false;
    await passTime();
    assertBody(`div{title=base}`);

    cond.value = true;
    await passTime();
    assertBody(`div{title=override}`);
});

test('Removes attribute that did not previously exist when its scope re-runs', async () => {
    const cond = A.proxy(true);
    A.mount(document.body, () => {
        A('div', () => {
            A(() => {
                if (cond.value) A('title=hello');
            });
        });
    });
    await passTime();
    assertBody(`div{title=hello}`);

    cond.value = false;
    await passTime();
    assertBody(`div`);
});

test('Restores DOM property on parent element when its scope re-runs', async () => {
    const cond = A.proxy(true);
    A.mount(document.body, () => {
        A('input', () => {
            A({value: 'base'});
            A(() => {
                if (cond.value) A({value: 'override'});
            });
        });
    });
    await passTime();
    assertBody(`input{value->override}`);

    cond.value = false;
    await passTime();
    assertBody(`input{value->base}`);
});

test('Restores style on parent element when its scope re-runs', async () => {
    const cond = A.proxy(true);
    A.mount(document.body, () => {
        A('div', () => {
            A({$color: 'base'});
            A(() => {
                if (cond.value) A({$color: 'override'});
            });
        });
    });
    await passTime();
    assertBody(`div{color:override}`);

    cond.value = false;
    await passTime();
    assertBody(`div{color:base}`);

    cond.value = true;
    await passTime();
    assertBody(`div{color:override}`);
});

test('Removes style that did not previously exist when its scope re-runs', async () => {
    const cond = A.proxy(true);
    A.mount(document.body, () => {
        A('div', () => {
            A(() => {
                if (cond.value) A({'$background-color': 'red'});
            });
        });
    });
    await passTime();
    assertBody(`div{background-color:red}`);

    cond.value = false;
    await passTime();
    assertBody(`div`);
});

test('Removes object-form class from parent element when its scope re-runs', async () => {
    const cond = A.proxy(true);
    A.mount(document.body, () => {
        A('div', () => {
            A(() => {
                if (cond.value) A({'.active': true});
            });
        });
    });
    await passTime();
    assertBody(`div.active`);

    cond.value = false;
    await passTime();
    assertBody(`div`);
});

test('Cleaners run in LIFO order, restoring the original pre-scope value', async () => {
    // Setting the same attribute twice within one scope must restore to the
    // value from before the scope ran (here: no title), not an intermediate one.
    const cond = A.proxy(true);
    A.mount(document.body, () => {
        A('div', () => {
            A(() => {
                if (cond.value) {
                    A('title=first');
                    A('title=second');
                }
            });
        });
    });
    await passTime();
    assertBody(`div{title=second}`);

    cond.value = false;
    await passTime();
    assertBody(`div`);
});

test('Does not revert attributes/classes/styles/properties when the element itself is removed', async () => {
    // When an element is removed from the DOM wholesale, reverting the attributes/classes/etc
    // its own scope set on it is wasted work: the element is gone. Only the surviving element
    // (the one being re-rendered) needs its values restored.
    const show = A.proxy(true);
    A.mount(document.body, () => {
        if (show.value) {
            A('div', () => {
                A('.a.b title=x data-y=z', {'.c': true, $color: 'red', value: 'v'});
            });
        }
    });
    await passTime();
    assertBody(`div.a.b.c{data-y=z title=x value->v color:red}`);

    const before = fakedom.getCounts().changed;
    show.value = false;
    await passTime();
    assertBody(``);

    // A single DOM mutation: the <div> being detached. None of the ~6 per-attribute/class
    // reverts run, because the element they target is being removed, not re-rendered.
    expect(fakedom.getCounts().changed - before).toEqual(1);
});

test('Undoes a nested scope\'s side-effects on the shared element when the OUTER scope re-runs', async () => {
    // The inner scope sets attributes on the SAME element as the outer scope. When the outer
    // scope re-runs it tears down and rebuilds the inner scope; the element survives, so the
    // inner scope's stale side-effects must be undone even though it was reached via the cascade.
    const outer = A.proxy(0);
    const inner = A.proxy(true);
    A.mount(document.body, () => {
        A('div', () => {
            outer.value; // subscribe, so the outer scope re-runs when this changes
            A(() => {
                if (inner.value) A('data-a=1');
                else A('data-b=2');
            });
        });
    });
    await passTime();
    assertBody(`div{data-a=1}`);

    // Flip the inner condition and force the outer scope to re-run in the same tick.
    inner.value = false;
    outer.value++;
    await passTime();
    assertBody(`div{data-b=2}`); // stale data-a must be gone
});

test('Defines and removes event listeners', async () => {
    let data = A.proxy(true);
    let el;
    let myFunc = () => {};
    
    A.mount(document.body, () => {
        A('div', () => {
            el = A();
            if (data.value) A({click: myFunc});
        });
    });
    
    await passTime();
    expect(el!.events).toEqual({click: new Set([myFunc])});
    
    data.value = false;
    await passTime();
    expect(el!.events).toEqual({click: new Set()});
});

test('Styles elements', async () => {
    const colorData = A.proxy('blue');
    let count = 0;
    
    A.mount(document.body, () => {
        count++;
        A('div', {
            $margin: 10+'px',
            $padding: null, // ignore
            $border: false, // ignore as well
            $height: undefined, // again, ignore
            '$background-color': 'red',
            $color: colorData
        });
    });
    
    await passTime();
    assertBody(`div{background-color:red color:blue margin:10px}`);
    
    colorData.value = 'orange';
    await passTime();
    assertBody(`div{background-color:red color:orange margin:10px}`);
    
    expect(count).toEqual(1);
});
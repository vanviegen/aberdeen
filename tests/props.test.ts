import { expect, test } from "bun:test";
import { assertBody, passTime } from "./helpers";
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
    delete classObj[".b"]; // Won't remove class, as '.props' don't set a cleaner
    await passTime();
    assertBody(`div.b.d`);
    
    expect([cnt1, cnt2, cnt3]).toEqual([1, 1, 3]);
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
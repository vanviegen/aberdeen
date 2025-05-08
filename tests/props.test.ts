import { expect, test } from "bun:test";
import { assertBody, passTime } from "./helpers";
import { $, copy, proxy, observe, getParentElement, mount, MERGE } from "../src/aberdeen";

test('Sets and unsets classes', async () => {
    let cnt1 = 0, cnt2 = 0, cnt3 = 0;
    let classObj = proxy({".a": false, ".b": true, ".c": undefined} as any);
    mount(document.body, () => {
        cnt1++;
        $('div', () => {
            cnt2++;
            observe(() => {
                cnt3++;
                $(classObj);
            });
        });
    });
    await passTime();
    assertBody(`div.b`);
    
    copy(classObj, {".a": true, ".d": true}, MERGE);
    await passTime();
    assertBody(`div.a.b.d`);
    
    classObj[".a"] = false;
    delete classObj[".b"]; // Won't remove class, as '.props' don't set a cleaner
    await passTime();
    assertBody(`div.b.d`);
    
    expect([cnt1, cnt2, cnt3]).toEqual([1, 1, 3]);
});

test('Defines and removes event listeners', async () => {
    let data = proxy(true);
    let el;
    let myFunc = () => {};
    
    mount(document.body, () => {
        $('div', () => {
            el = getParentElement();
            if (data.value) $({click: myFunc});
        });
    });
    
    await passTime();
    expect(el!.events).toEqual({click: new Set([myFunc])});
    
    data.value = false;
    await passTime();
    expect(el!.events).toEqual({click: new Set()});
});

test('Styles elements', async () => {
    const colorData = proxy('blue');
    let count = 0;
    
    mount(document.body, () => {
        count++;
        $('div', {
            $margin: 10+'px',
            $padding: null, // ignore
            $border: false, // ignore as well
            $height: undefined, // again, ignore
            $backgroundColor: 'red',
            $color: colorData
        });
    });
    
    await passTime();
    assertBody(`div{backgroundColor:red color:blue margin:10px}`);
    
    colorData.value = 'orange';
    await passTime();
    assertBody(`div{backgroundColor:red color:orange margin:10px}`);
    
    expect(count).toEqual(1);
});
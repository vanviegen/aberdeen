import { expect, test } from "bun:test";
import { assertBody, asyncPassTime } from "./helpers";
import { $, merge, proxy, observe, getParentElement, mount } from "../src/aberdeen";

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
    await asyncPassTime();
    assertBody(`div.b`);
    
    merge(classObj, {".a": true, ".d": true}, true);
    await asyncPassTime();
    assertBody(`div.a.b.d`);
    
    classObj[".a"] = false;
    delete classObj[".b"]; // Won't remove class, as '.props' don't set a cleaner
    await asyncPassTime();
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
    
    await asyncPassTime();
    expect(el!.events).toEqual({click: new Set([myFunc])});
    
    data.value = false;
    await asyncPassTime();
    expect(el!.events).toEqual({click: new Set()});
});

test('Styles elements', async () => {
    const colorData = proxy('blue');
    let count = 0;
    
    mount(document.body, () => {
        count++;
        $('.', {
            $margin: 10+'px',
            $padding: null, // ignore
            $border: false, // ignore as well
            $height: undefined, // again, ignore
            $backgroundColor: 'red',
            $color: colorData
        });
    });
    
    await asyncPassTime();
    assertBody(`div{backgroundColor:red color:blue margin:10px}`);
    
    colorData.value = 'orange';
    await asyncPassTime();
    assertBody(`div{backgroundColor:red color:orange margin:10px}`);
    
    expect(count).toEqual(1);
});
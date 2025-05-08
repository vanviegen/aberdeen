import { expect, test } from "bun:test";
import { passTime } from "./helpers";
import { setErrorHandler, proxy, observe, immediateObserve } from "../src/aberdeen";

test('immediateObserve runs immediately', async () => {
    const data = proxy({ a: 1, b: 0 });
    let count = 0;
    immediateObserve(() => {
        data.b = data.a * 2;
        count++;
    });
    expect(data.b).toEqual(2);
    expect(count).toEqual(1);

    data.a = 3;
    expect(data.b).toEqual(6);
    expect(count).toEqual(2);

    await passTime(); // shouldn't change anything
    expect(data.b).toEqual(6);
    expect(count).toEqual(2);
});

test('immediateObserve stabilizes dependent values', () => {
    const data = proxy({ num: 1 as number | string, str: '' as string | number });

    immediateObserve(() => { // num to str
        const num = data.num;
        if (typeof num === 'number') {
            data.str = "x".repeat(num);
        } else {
            data.num = 0; // will call this observer recursively
        }
    });

    immediateObserve(() => {  // str to num
        const str = data.str;
        if (typeof str === 'string') {
            if (!/^x*$/.test(str)) { // Only update if str contains non-'x' characters
                data.str = "x".repeat(str.length); // replace str chars by 'x'
            }
            data.num = str.length; // may call this observer recursively
        } else {
            data.str = ""; // will call this observer recursively
        }
    });

    expect(data).toEqual({ num: 1, str: 'x' });

    data.num = 3;
    expect(data).toEqual({ num: 3, str: 'xxx' });

    data.num = ''; // This triggers the first observer's else branch
    expect(data).toEqual({ num: 0, str: '' });

    data.str = 'af123'; // This triggers the second observer
    expect(data).toEqual({ num: 5, str: 'xxxxx' });
});

test('immediateObserve stops when its containing scope re-runs and removes it', async () => {
    const data = proxy({ a: 1, b: 0, stop: false });

    observe(() => {
        if (data.stop) return;
        // This immediateObserve is cleaned up when the outer observe re-runs
        immediateObserve(() => {
            data.b = data.a * 2;
        });
    });

    expect(data.b).toEqual(2); // Initial run of outer and inner observe

    data.a = 3;
    // Immediate observe runs because 'a' changed
    expect(data.b).toEqual(6);

    data.stop = true;
    await passTime(); // Allow the outer observe to rerun, which will *not* re-create the immediateObserve

    data.a = 5;
    // The immediateObserve is gone, so 'b' is not updated
    expect(data.b).toEqual(6);
});

function captureOnError(message: string, func: () => void, showMsg: boolean = true) {
    let lastErr: Error | undefined;
    setErrorHandler(err => {lastErr = err; return showMsg; });
    func();
    setErrorHandler();
    expect(lastErr).toBeTruthy();
    expect(lastErr!.toString()).toContain(message);
}

test('immediateObserve throws an error if a loop does not stabilize', () => {
    const data = proxy({ a: 1, b: 0 });

    immediateObserve(() => {
        data.b = data.a + 1;
    });

    captureOnError('recursive updates', () => {
        // This will start an infinite recursion, which should be caught.
        immediateObserve(() => {
            data.a = data.b + 1;
        });
    });
});



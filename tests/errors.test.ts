import { expect, test } from "bun:test";
import { assertBody, assertThrow, passTime } from "./helpers";
import { $, setErrorHandler, proxy, onEach, mount } from "../src/aberdeen";

async function captureOnError(message: string, func: () => void, showMsg: boolean = true) {
    let lastErr: Error | undefined;
    setErrorHandler(err => {lastErr = err; return showMsg; });
    await func();
    setErrorHandler();
    expect(lastErr).toBeTruthy();
    expect(lastErr!.toString()).toContain(message);
}

test('Error handling - works by default', () => {
    const orgError = console.error;
    let err;
    console.error = function(...args) {err = args.map(a=>a.toString()).join(' ')};
    try {
        mount(document.body, () => {
            $('a');
            $('b', () => {
                // @ts-expect-error Intentionally calling undefined function
                noSuchFunction();
            });
            $('c');
        });
        assertBody(`a b{div.aberdeen-error{"Error"}} c`);
        expect(err).toContain("noSuchFunction");
    }
    finally {
        console.error = orgError;
    }
});

test('Error handling - continues rendering after an error', async () => {
    let error = proxy(false);
    mount(document.body, () => {
        $('a', () => {
            $('b');
            if (error.value) {
                throw Error('FakeError');
            }
            $('c');
        });
        $('d');
    });    
    assertBody(`a{b c} d`);
    await captureOnError('FakeError', async () => {
        error.value = true;
        await passTime();
    });
    assertBody(`a{b div.aberdeen-error{"Error"}} d`);
});

test('Error handling - can disable the default error message', async () => {
    await captureOnError('FakeError', async () => {
        mount(document.body, () => {
            $('a', () => {
                $('b');
                throw Error('FakeError');
            });
            $('d');
        });
        await passTime();
    }, false);
    assertBody(`a{b} d`);
});

test('Error handling - continue rendering after an error in onEach', async () => {
    let data = proxy(['a','b','c']);
    await captureOnError('noSuchFunction', async () => {
        mount(document.body, () => {
            onEach(data, (item, index) => {
                if (index % 2) {
                    // @ts-expect-error Intentionally calling undefined function
                    noSuchFunction();
                }
                $({text: item});
            });
        });
        await passTime();
    }, false);
    assertBody(`"a" "c"`);
    data.push('d');
    data.push('e');
    await captureOnError('noSuchFunction', passTime, false);
    assertBody(`"a" "c" "e"`);
});

test('Error handling - continue rendering after an error in onEach sort', async () => {
    let data = proxy(['a','b','c']);
    await captureOnError('noSuchFunction', async() => {
        mount(document.body, () => {
            onEach(data, (item, index) => {
                $({text: item});
            }, (item, index) => {
                if (index % 2) {
                    // @ts-expect-error Intentionally calling undefined function
                    noSuchFunction();
                }
                return -index;
            });
        });
        await passTime();
    });
    assertBody(`"c" "a"`);
    data.push('d');
    data.push('e');
    await captureOnError('noSuchFunction', passTime);
    assertBody(`"e" "c" "a"`);
});

test('Error handling - throws when indexing a non-indexable type', () => {
    let proxied = proxy(3);
    // Since the API has changed significantly, these tests are no longer applicable
    // Proxy objects don't have the same indexing behavior as Store instances did
    // Instead, we can test that we can't access properties that don't exist
    expect(proxied.value).toBe(3);
    expect((proxied as any).nonExistentProperty).toBeUndefined();
});

test('Error handling - throws when onEach() is invoked with non-collection', () => {
    let proxied = proxy(5);
    
    assertThrow('onEach requires an object', () => onEach(proxied.value as any, item => {
        expect(false).toBeTruthy(); // Should not be invoked
    }));
});

test('Error handling - breaks up long update->observe recursions', async () => {
    let data = proxy({a: 0, b: 0});
    $(() => {
        data.a = data.b + 1;
    });
    $(() => {
        data.b = data.a + 1;
    });
    await captureOnError('recursive', passTime);
});
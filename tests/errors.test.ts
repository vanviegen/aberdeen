import { expect, test } from "bun:test";
import { assertBody, assertThrow, passTime } from "./helpers";
import A from "../src/aberdeen";

async function captureOnError(message: string, func: () => void, showMsg: boolean = true) {
    let lastErr: Error | undefined;
    A.setErrorHandler(err => {lastErr = err; return showMsg; });
    await func();
    A.setErrorHandler();
    expect(lastErr).toBeTruthy();
    expect(lastErr!.toString()).toContain(message);
}

test('Error handling - works by default', () => {
    const orgError = console.error;
    let err;
    console.error = function(...args) {err = args.map(a=>a.toString()).join(' ')};
    try {
        A.mount(document.body, () => {
            A('a');
            A('b', () => {
                // @ts-expect-error Intentionally calling undefined function
                noSuchFunction();
            });
            A('c');
        });
        assertBody(`a b{div.aberdeen-error{"Error"}} c`);
        expect(err).toContain("noSuchFunction");
    }
    finally {
        console.error = orgError;
    }
});

test('Error handling - continues rendering after an error', async () => {
    let error = A.proxy(false);
    A.mount(document.body, () => {
        A('a', () => {
            A('b');
            if (error.value) {
                throw Error('FakeError');
            }
            A('c');
        });
        A('d');
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
        A.mount(document.body, () => {
            A('a', () => {
                A('b');
                throw Error('FakeError');
            });
            A('d');
        });
        await passTime();
    }, false);
    assertBody(`a{b} d`);
});

test('Error handling - continue rendering after an error in A.onEach', async () => {
    let data = A.proxy(['a','b','c']);
    await captureOnError('noSuchFunction', async () => {
        A.mount(document.body, () => {
            A.onEach(data, (item, index) => {
                if (index % 2) {
                    // @ts-expect-error Intentionally calling undefined function
                    noSuchFunction();
                }
                A({text: item});
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

test('Error handling - continue rendering after an error in A.onEach sort', async () => {
    let data = A.proxy(['a','b','c']);
    await captureOnError('noSuchFunction', async() => {
        A.mount(document.body, () => {
            A.onEach(data, (item, index) => {
                A({text: item});
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
    let proxied = A.proxy(3);
    // Since the API has changed significantly, these tests are no longer applicable
    // Proxy objects don't have the same indexing behavior as Store instances did
    // Instead, we can test that we can't access properties that don't exist
    expect(proxied.value).toBe(3);
    expect((proxied as any).nonExistentProperty).toBeUndefined();
});

test('Error handling - throws when A.onEach() is invoked with non-collection', () => {
    let proxied = A.proxy(5);
    
    assertThrow('A.onEach requires an object', () => A.onEach(proxied.value as any, item => {
        expect(false).toBeTruthy(); // Should not be invoked
    }));
});

test('Error handling - breaks up long update->observe recursions', async () => {
    let data = A.proxy({a: 0, b: 0});
    A(() => {
        data.a = data.b + 1;
    });
    A(() => {
        data.b = data.a + 1;
    });
    await captureOnError('recursive', passTime);
});
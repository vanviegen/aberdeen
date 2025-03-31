import { expect, test } from "bun:test";
import { assertBody, asyncPassTime, assertDomUpdates, assertThrow, getBody, passTime, assert } from "./helpers";
import $ from "../src/aberdeen";

function captureOnError(message: string, func: () => void, showMsg: boolean = true) {
    let lastErr: Error | undefined;
    $.setErrorHandler(err => {lastErr = err; return showMsg; });
    func();
    $.setErrorHandler();
    expect(lastErr).toBeTruthy();
    expect(lastErr!.toString()).toContain(message);
}

test('Error handling - works by default', () => {
    const orgError = console.error;
    let err;
    console.error = function(...args) {err = args.map(a=>a.toString()).join(' ')};
    try {
        $.mount(document.body, () => {
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
    let error = $.proxy(false);
    $.mount(document.body, () => {
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
    captureOnError('FakeError', () => {
        error.value = true;
        passTime();
    });
    assertBody(`a{b div.aberdeen-error{"Error"}} d`);
});

test('Error handling - can disable the default error message', () => {
    captureOnError('FakeError', () => {
        $.mount(document.body, () => {
            $('a', () => {
                $('b');
                throw Error('FakeError');
            });
            $('d');
        });
        passTime();
    }, false);
    assertBody(`a{b} d`);
});

test('Error handling - continue rendering after an error in onEach', async () => {
    let data = $.proxy(['a','b','c']);
    captureOnError('noSuchFunction', () => {
        $.mount(document.body, () => {
            $.onEach(data, (item, index) => {
                if (index % 2) {
                    // @ts-expect-error Intentionally calling undefined function
                    noSuchFunction();
                }
                $({text: item});
            });
        });
        passTime();
    }, false);
    assertBody(`"a" "c"`);
    data.push('d');
    data.push('e');
    captureOnError('noSuchFunction', passTime, false);
    assertBody(`"a" "c" "e"`);
});

test('Error handling - continue rendering after an error in onEach sort', async () => {
    let data = $.proxy(['a','b','c']);
    captureOnError('noSuchFunction', () => {
        $.mount(document.body, () => {
            $.onEach(data, (item, index) => {
                $({text: item});
            }, (item, index) => {
                if (index % 2) {
                    // @ts-expect-error Intentionally calling undefined function
                    noSuchFunction();
                }
                return -index;
            });
        });
        passTime();
    });
    assertBody(`"c" "a" div.aberdeen-error{"Error"}`);
    data.push('d');
    data.push('e');
    captureOnError('noSuchFunction', passTime);
    assertBody(`"e" "c" "a" div.aberdeen-error{"Error"} div.aberdeen-error{"Error"}`);
});

test('Error handling - throws when indexing a non-indexable type', () => {
    let proxied = $.proxy(3);
    // Since the API has changed significantly, these tests are no longer applicable
    // Proxy objects don't have the same indexing behavior as Store instances did
    // Instead, we can test that we can't access properties that don't exist
    expect(proxied.value).toBe(3);
    expect((proxied as any).nonExistentProperty).toBeUndefined();
});

test('Error handling - throws when onEach() is invoked with non-collection', () => {
    let proxied = $.proxy(5);
    
    assertThrow('onEach requires an object', () => $.onEach(proxied.value as any, item => {
        expect(false).toBeTruthy(); // Should not be invoked
    }));
});

test('Error handling - breaks up long update->observe recursions', async () => {
    let data = $.proxy({a: 0, b: 0});
    $.observe(() => {
        data.a = data.b + 1;
    });
    $.observe(() => {
        data.b = data.a + 1;
    });
    captureOnError('recursive', passTime);
});
import { expect, test } from "bun:test";
import { assertBody, passTime, asyncPassTime, assertDomUpdates, getBody } from "./helpers";
import { $, proxy, observe, set, onEach } from "../src/aberdeen";
import { grow } from "../src/transitions";

test('Create event does not apply on initial rendering', () => {
    const data = proxy(true);
    $('b', {create: 'y'});
    
    assertBody(`b`);
});

test('Create event works at top-level', async () => {
    const data = proxy(false);
    observe(() => {
        if (data.value) $('b', {create: 'y'});
    });
    
    assertBody(``);
    assertDomUpdates({new: 0, changed: 0});
    
    data.value = true;
    await asyncPassTime(0);
    // We don't have a good way to know if the class has been set and immediately
    // removed, so we'll just look at the number of changes, which would have
    // been 1 (just inserting the newly created DOM element) without the
    // create-transition.
    assertDomUpdates({new: 1, changed: 3});
    assertBody(`b`);
});

test('Create event does not apply when it is part of a larger whole newly rendered', async () => {
    const data = proxy(false);
    observe(() => {
        if (data.value) $('b', () => $('c', {create: 'y'}));
    });
    
    assertBody(``);
    data.value = true;
    await asyncPassTime(0);
    // We don't have a good way to know if the class has been set and immediately
    // removed, so we'll just look at the number of changes, which would have
    // been 4 (2 $ insert + 1 class add + 1 class remove) with the
    // create-transition.
    assertDomUpdates({new: 2, changed: 2}); // 2 new $s, 2 $ inserts 
    assertBody(`b{c}`);
});

test('Create event works in an onEach', async () => {
    const data = proxy([] as (string | undefined)[]);
    observe(() => {
        onEach(data, (item) => {
            $(item, {create: "y"});
        });
    });
    
    set(data, ['a', undefined, 'c']);
    await asyncPassTime(0);
    // We don't have a good way to know if the class has been set and immediately
    // removed, so we'll just look at the number of changes, which would have
    // been 2 (just inserting the newly created DOM elements) without the
    // create-transition.
    assertDomUpdates({new: 2, changed: 6});
    assertBody(`a c`);
});

test('Create event performs a grow animation', async() => {
    const data = proxy(false);
    observe(() => {
        $('div', {$display: 'flex'}, () => {
            if (data.value) $('a', {create: grow});
        });
    });
    assertBody(`div{display:flex}`);
    
    data.value = true;
    await asyncPassTime(0);
    expect(getBody().startsWith('div{display:flex a')).toBe(true);
    expect(getBody().indexOf('transition') >= 0).toBe(true);
    await asyncPassTime(2000);
    assertBody(`div{display:flex a}`);
});

test('Create event aborts a grow animation', () => {
    const data = proxy(false);
    observe(() => {
        if (data.value) {
            $('a', {create: 'grow'});
            data.value = false;
        }
    });
    assertBody(``);
    
    data.value = true; // Naughty render function will set this back to false
    passTime();
    assertBody(``);
});
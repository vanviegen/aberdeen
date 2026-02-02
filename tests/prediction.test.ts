import { expect, test } from "bun:test";
import { assertBody, passTime, assertThrow } from "./helpers";
import { $, proxy, mount, merge } from "../src/aberdeen";
import { applyPrediction, applyCanon } from "../src/prediction";

test('Prediction reverts', async () => {
    let data = proxy('a');
    $(() => {
        $(data.value);
    });
    assertBody(`a`);
    
    let prediction = applyPrediction(() => data.value = 'b');
    await passTime();
    assertBody(`b`);
    
    applyCanon(undefined, [prediction]);
    await passTime();
    assertBody(`a`);
    
    // Doing this again shouldn't break anything
    applyCanon(undefined, [prediction]);
    await passTime();
    assertBody(`a`);
});

test('Prediction reverts entire patch when it can no longer apply', async () => {
    let data = proxy({1: 'a', 2: 'x', 3: 'm'} as Record<number,string>);
    $(() => {
        $(data[1]);
        $(data[2]);
        $(data[3]);
    });
    assertBody(`a x m`);
    
    // This prediction should be flushed out due to conflict
    applyPrediction(() => merge(data, {1: 'b', 2: 'y'}));
    await passTime();
    assertBody(`b y m`);
    
    // This prediction should be kept
    applyPrediction(() => data[3] = 'n');
    await passTime();
    assertBody(`b y n`);
    
    // Create the conflict
    applyCanon(() => {
        // Check that state was reverted to pre-predictions
        expect(data[1]).toEqual('a');
        data[1] = 'c';
    });
    
    // Check that only the first prediction has been reverted as a whole
    await passTime();
    assertBody(`c x n`);
});

test('Prediction forcibly reverts to canon state', async () => {
    let data = proxy('a');
    $(() => {
        $(data.value);
    });
    assertBody(`a`);
    
    let prediction = applyPrediction(() => data.value = 'b');
    await passTime();
    assertBody(`b`);
    
    data.value = 'z';
    applyCanon(undefined, [prediction]);
    
    // An error should be thrown asynchronously
    await assertThrow('Error', async () => {
        await passTime();
    });
    assertBody(`a`);
});

test('Prediction does not cause redraw when it comes true', async () => {
    let data = proxy('a');
    let draws = 0;
    mount(document.body, () => {
        $(data.value);
        draws++;
    });
    assertBody(`a`);
    expect(draws).toEqual(1);
    
    let prediction = applyPrediction(() => data.value = 'b');
    await passTime();
    assertBody(`b`);
    expect(draws).toEqual(2);
    
    applyCanon(() => data.value = 'b', [prediction]);
    await passTime();
    assertBody(`b`);
    expect(draws).toEqual(2);
});

test('Prediction handles property deletion', async () => {
    let data = proxy({a: 1, b: 2} as Record<string, number | undefined>);
    $(() => {
        $(''+data.a);
        $(' ');
        $(''+data.b);
    });
    assertBody(`1 2`);
    
    // Predict deleting property 'b'  
    let prediction = applyPrediction(() => delete data.b);
    await passTime();
    assertBody(`1 undefined`);
    
    // Revert the prediction
    applyCanon(undefined, [prediction]);
    await passTime();
    assertBody(`1 2`);
});

test('Prediction works with Map collections', async () => {
    let data = proxy(new Map([['a', 1], ['b', 2]]));
    $(() => {
        $(''+data.get('a'));
        $(' ');
        $(''+data.get('b'));
    });
    assertBody(`1 2`);
    
    // Predict changing a value
    let prediction = applyPrediction(() => data.set('b', 99));
    await passTime();
    assertBody(`1 99`);
    
    // Revert the prediction
    applyCanon(undefined, [prediction]);
    await passTime();
    assertBody(`1 2`);
});

test('Prediction handles Map key deletion', async () => {
    let data = proxy(new Map([['a', 1], ['b', 2]]));
    $(() => {
        $(''+data.get('a'));
        $(' ');
        $(''+data.get('b'));
    });
    assertBody(`1 2`);
    
    // Predict deleting key 'b'
    let prediction = applyPrediction(() => data.delete('b'));
    await passTime();
    assertBody(`1 undefined`);
    
    // Revert the prediction
    applyCanon(undefined, [prediction]);
    await passTime();
    assertBody(`1 2`);
});

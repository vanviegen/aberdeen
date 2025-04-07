import { expect, test } from "bun:test";
import { assertBody, asyncPassTime, assertThrow, passTime } from "./helpers";
import { $, proxy, observe, mount } from "../src/aberdeen";
import { merge } from "../src/merge";
import { applyPrediction, applyCanon } from "../src/prediction";

test('Prediction reverts', async () => {
    let data = proxy('a');
    observe(() => {
        $(data.value);
    });
    assertBody(`a`);
    
    let prediction = applyPrediction(() => data.value = 'b');
    await asyncPassTime();
    assertBody(`b`);
    
    applyCanon(undefined, [prediction]);
    await asyncPassTime();
    assertBody(`a`);
    
    // Doing this again shouldn't break anything
    applyCanon(undefined, [prediction]);
    await asyncPassTime();
    assertBody(`a`);
});

test('Prediction reverts entire patch when it can no longer apply', async () => {
    let data = proxy({1: 'a', 2: 'x', 3: 'm'} as Record<number,string>);
    observe(() => {
        $(data[1]);
        $(data[2]);
        $(data[3]);
    });
    assertBody(`a x m`);
    
    // This prediction should be flushed out due to conflict
    applyPrediction(() => merge(data, {1: 'b', 2: 'y'}));
    await asyncPassTime();
    assertBody(`b y m`);
    
    // This prediction should be kept
    applyPrediction(() => data[3] = 'n');
    await asyncPassTime();
    assertBody(`b y n`);
    
    // Create the conflict
    applyCanon(() => {
        // Check that state was reverted to pre-predictions
        expect(data[1]).toEqual('a');
        data[1] = 'c';
    });
    
    // Check that only the first prediction has been reverted as a whole
    await asyncPassTime();
    assertBody(`c x n`);
});

test('Prediction forcibly reverts to canon state', async () => {
    let data = proxy('a');
    observe(() => {
        $(data.value);
    });
    assertBody(`a`);
    
    let prediction = applyPrediction(() => data.value = 'b');
    await asyncPassTime();
    assertBody(`b`);
    
    data.value = 'z';
    applyCanon(undefined, [prediction]);
    
    // An error should be thrown asynchronously
    assertThrow('Error', () => {
        passTime();
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
    await asyncPassTime();
    assertBody(`b`);
    expect(draws).toEqual(2);
    
    applyCanon(() => data.value = 'b', [prediction]);
    await asyncPassTime();
    assertBody(`b`);
    expect(draws).toEqual(2);
});

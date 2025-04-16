import { expect, test } from "bun:test";
import { passTime } from "./helpers";
import { DOM_READ_PHASE, DOM_WRITE_PHASE } from "../src/aberdeen";

test('awaits read/write batches', async () => {
    let order: string[] = [];
    function log(n: string) {
        // console.log(n)
        order.push(n);
    }
    const tasks = [
        async() => {
            await DOM_READ_PHASE;
            log('1ra');
            await DOM_READ_PHASE;
            log('1rb');
            await DOM_WRITE_PHASE;
            log('2wc');
            await DOM_WRITE_PHASE;
            log('2wd');
            await DOM_READ_PHASE;
            log('2re');
        },
        async() => {
            await DOM_WRITE_PHASE;
            log('1wA');
            await DOM_WRITE_PHASE;
            log('1wB');
            await DOM_READ_PHASE;
            log('1rC');
            await DOM_READ_PHASE;
            log('1rD');
            await DOM_WRITE_PHASE;
            log('2wE');
        },
    ];
    // We'll use actual setTimeout to trigger fake setTimeout in this case. A bit weird...
    let interval = setInterval(passTime, 1);
    await Promise.all(tasks.map(task => task()));
    clearTimeout(interval);
    expect(order.join(' ')).toEqual('1w 1r 1r 1w 2w 1r 1r 2w');
});
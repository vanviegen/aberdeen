import { expect, test } from "bun:test";
import { $, count, isEmpty, map, multiMap, observe, onEach, partition, proxy, unmountAll } from "../src/aberdeen";
import { assertBody, passTime } from "./helpers";

test('map transforms arrays to arrays', async () => {
    let data = proxy([0, 2, 3]);
    let cnt1 = 0, cnt2 = 0;
    
    let out = map(data, value => {
        cnt1++;
        if (value) return value * 10;
        return undefined;
    });
    
    onEach(out, (value, index) => {
        cnt2++;
        $({text: index + "=" + value});
    }, value => value);
    
    assertBody(`"1=20" "2=30"`);
    expect(cnt1).toEqual(3);
    expect(cnt2).toEqual(2);
    
    data[0] = 1;
    delete data[2];
    
    await passTime();
    assertBody(`"0=10" "1=20"`);
    expect(cnt1).toEqual(4);
    expect(cnt2).toEqual(3);
});

test('map transforms objects to objects', async () => {
    let data = proxy({a: 1, b: 2, c: 3} as Record<string,number>);
    let cnt1 = 0, cnt2 = 0;
    
    let out = map(data, value => {
        cnt1++;
        return value===2 ? undefined : value*value;
    });
    
    onEach(out, (value, index) => {
        cnt2++;
        $({text: index.toString() + "=" + value});
    }, value => -value);
    
    assertBody(`"c=9" "a=1"`);
    
    data.x = 9;
    await passTime();
    assertBody(`"x=81" "c=9" "a=1"`);
});

test('multiMap transforms arrays to objects', async () => {
    let data = proxy(['a', 'b']);
    let cnt1 = 0, cnt2 = 0;
    
    let out = multiMap(data, (value, index) => {
        cnt1++;
        return {[value]: index*10, [value+value]: index*10+1};
    });
    
    onEach(out, (value, key) => {
        cnt2++;
        $({text: key + '=' + value});
    }, (value, key) => -value);
    
    expect(out).toEqual({a: 0, aa: 1, b: 10, bb: 11});
    assertBody(`"bb=11" "b=10" "aa=1" "a=0"`);
    expect(cnt1).toEqual(2);
    expect(cnt2).toEqual(4);
    
    data[0] = 'A';
    data.push('c');
    
    await passTime();
    expect(data).toEqual(['A', 'b', 'c']);
    expect(out).toEqual({A: 0, AA: 1, b: 10, bb:11, c: 20, cc: 21});
    assertBody(`"cc=21" "c=20" "bb=11" "b=10" "AA=1" "A=0"`);
    expect(cnt1).toEqual(4);
    expect(cnt2).toEqual(8);
});

test('multiMap transforms objects to objects', async () => {
    let data = proxy({a: 23, e: 123} as Record<string,number>);
    let cnt1 = 0;
    
    let out = multiMap(data, (value: number, index) => {
        cnt1++;
        return {[value]: index};
    });
    
    expect(out).toEqual({23: 'a', 123: 'e'});
    expect(cnt1).toEqual(2);
    
    delete data.e;
    data.a = 45;
    
    await passTime();
    expect(out).toEqual({45: 'a'});
    expect(cnt1).toEqual(3);
});

test('creates derived values with map', async () => {
    const data = proxy({value: 21} as Record<string,number>);
    // This is not really a best practice, as this creates a relatively slow iterator.
    // Use $, as shown in the next test, instead.
    const double = map(data, v => v * 2);
    
    expect(double.value).toEqual(42);
    
    data.value = 100;
    await passTime();
    expect(double.value).toEqual(200);
});

test('can create reactive computations with the $ function', async () => {
    const data = proxy(21);
    const double = observe(() => data.value * 2);
    
    expect(double.value).toEqual(42);
    
    data.value = 100;
    await passTime();
    expect(double.value).toEqual(200);
});

test('isEmpty works on arrays', async () => {
    let data = proxy([] as number[]);
    let cnt = 0;
    observe(() => {
        cnt++;
        $(isEmpty(data,) ? ":empty" : ":not empty");
    })
    assertBody(`"empty"`);
    expect(cnt).toBe(1);
    
    data[1] = 3;
    await passTime();
    assertBody(`"not empty"`);
    expect(cnt).toBe(2);
    
    data.pop();
    await passTime();
    assertBody(`"not empty"`);
    expect(cnt).toBe(2);
    
    data.pop();
    await passTime();
    assertBody(`"empty"`);
    expect(cnt).toBe(3);
    
    data.push(42);
    await passTime();
    assertBody(`"not empty"`);
    expect(cnt).toBe(4);
    
    data.push(123);
    await passTime();
    assertBody(`"not empty"`);
    expect(cnt).toBe(4);
    
    unmountAll();
    observe(() => { // test initial value for isEmpty
        $(isEmpty(data,) ? ":empty2" : ":not empty2");
    })
    assertBody(`"not empty2"`);
})


test('isEmpty works on objects', async () => {
    let data = proxy({} as Record<string,number|undefined>);
    let cnt = 0;
    observe(() => {
        cnt++;
        $(isEmpty(data,) ? ":empty" : ":not empty");
    })
    assertBody(`"empty"`);
    expect(cnt).toBe(1);
    
    data.x = 3;
    await passTime();
    assertBody(`"not empty"`);
    expect(cnt).toBe(2);
    
    delete data.x;
    await passTime();
    assertBody(`"empty"`);
    expect(cnt).toBe(3);
    
    data.y = undefined;
    await passTime();
    assertBody(`"empty"`);
    expect(cnt).toBe(3);
    
    unmountAll();
    
    data.x = 1;
    observe(() => { // test initial value for isEmpty
        $(isEmpty(data,) ? ":empty2" : ":not empty2");
    })
    assertBody(`"not empty2"`);
})

test('count works on array', async() => {
    const data = proxy([2, 4]);
    const cnt = count(data);
    
    $('div', {text: cnt});
    assertBody(`div{"2"}`);
    
    data.push(9);
    await passTime();
    assertBody(`div{"3"}`);
    
    delete data[1];
    await passTime();
    assertBody(`div{"3"}`);
    
    data.shift();
    await passTime();
    assertBody(`div{"2"}`);
})

test('count works on objects', async() => {
    const data = proxy({x: 3, y: 7} as Record<string,number|undefined>);
    const cnt = count(data);
    
    $('div', {text: cnt});
    assertBody(`div{"2"}`);
    
    data.z = 9;
    await passTime();
    assertBody(`div{"3"}`);
    
    delete data.y
    await passTime();
    assertBody(`div{"2"}`);
    
    data.x = undefined;
    await passTime();
    assertBody(`div{"1"}`);
})

test('partition partitions array items into single buckets', async () => {
    const source = proxy([
        { id: 101, type: 'A', tags: ['x'] },
        { id: 102, type: 'B', tags: ['y'] },
        { id: 103, type: 'A', tags: ['x', 'y'] },
    ]);
    const partKey = proxy('type');
    let partitionFuncCalls = 0;
    
    const partitioned = partition(source, (item, _index) => {
        partitionFuncCalls++;
        return item[partKey.value];
    });
    
    expect(partitioned).toEqual({
        A: { 0: { id: 101, type: 'A', tags: ['x'] }, 2: { id: 103, type: 'A', tags: ['x', 'y'] } },
        B: { 1: { id: 102, type: 'B', tags: ['y'] } },
    });
    
    onEach(partitioned, (bucket, bucketKey) => {
        $(`p.${bucketKey}`, () => {
            onEach(bucket, (item, originalIndex) => {
                $(`:id=${item.id} index=${originalIndex}`);
            });
        });
    });
    assertBody(`p.A{"id=101 index=0" "id=103 index=2"} p.B{"id=102 index=1"}`)
    expect(partitionFuncCalls).toBe(3);
    
    // Update data
    source.push({ id: 4, type: 'B', tags: ['z', 'x'] }); // Add new item
    await passTime();
    assertBody(`p.A{"id=101 index=0" "id=103 index=2"} p.B{"id=102 index=1" "id=4 index=3"}`)
    expect(partitionFuncCalls).toBe(4); // One more call for the new item
    
    // Change category
    source[1].type = 'A'; // Move item 102 from B to A
    await passTime();
    assertBody(`p.A{"id=101 index=0" "id=102 index=1" "id=103 index=2"} p.B{"id=4 index=3"}`)
    expect(partitionFuncCalls).toBe(5); // One more call for the changed item
    
    // Change partitioning bucket, for multi-bucket partitioning
    partKey.value = 'tags'
    await passTime();
    assertBody(`p.x{"id=101 index=0" "id=103 index=2" "id=4 index=3"} p.y{"id=102 index=1" "id=103 index=2"} p.z{"id=4 index=3"}`)
    expect(partitionFuncCalls).toBe(5+4);
    
    // Make bucket empty, see it disappear
    delete source[3];
    await passTime();
    assertBody(`p.x{"id=101 index=0" "id=103 index=2"} p.y{"id=102 index=1" "id=103 index=2"}`)
    expect(partitionFuncCalls).toBe(9); // No extra function invocations
});

test('count mapped values', async () => {
    // Create some random data
    const people: Record<number,{weight: number, height: number}> = proxy({});

    const bmis = map(people, person => person.weight / ((person.height/100) ** 2));
    const overweightCount = count(bmis);

    await passTime();
    
    people[2] = {height: 180, weight: 150};    
    
    await passTime();
    expect(overweightCount.value).toBe(1);
});

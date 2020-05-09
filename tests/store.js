describe('Store', function() {
    it('is empty by default', () => {
        let store = new Store();
        assertEqual(store.get(), undefined)
    });

    it('holds basic types', () => {
        let store = new Store();
        for(let val of [false,true,'x',undefined,123,-10.1]) {
            store.set(val);
            assertEqual(store.get(), val)
        }
    });

    it('converts null to undefined', () => {
        let store = new Store();
        store.set(null);
        assertEqual(store.get(), undefined)
    });

    it('stores Maps', () => {
        let store = new Store();
        let map = new Map(Object.entries({a:1, b:2}));
        store.set(map)
        let result = store.get(true);
        assertEqual(result, map);
        assert(result !== map, "A copy must be made");
    });

    it('returns Maps as objects by default', () => {
        let store = new Store();
        let obj = {a:1, b:2};
        store.set(new Map(Object.entries(obj)))
        assertEqual(store.get(), obj);
    });

    it('merges objects', () => {
        let store = new Store({a: 1, b: 2});
        store.merge({b: 3, c: 4});
        assertEqual(store.get(), {a: 1, b: 3, c: 4});
    });

    it('stores nested objects', () => {
        let obj = {a: 1, b: 2, c: {d: 3, e: {f: 4}}};
        let store = new Store(obj);
        assertEqual(store.get(), obj);
        store = new Store(obj);
        store.set(obj)
        assertEqual(store.get(), obj);
    });

    it('deletes map indexes on set', () => {
        let store = new Store({a: 1, b: 2});
        store.set({b: 3, c: 4})
        assertEqual(store.get(), {b: 3, c: 4});
    });

    it('references nested stores', () => {
        let obj = {a: 1, b: 2, c: {d: 3, e: {f: 4}}};
        let store = new Store(obj);
        assertEqual(store.ref('c', 'e', 'f').get(), 4);

        store.ref('c','e').set(undefined);
        store.ref('b').set(5);
        assertEqual(store.get(), {a: 1, b: 5, c: {d: 3}});
    });
});

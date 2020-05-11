describe('onEach', function() {

    it('ignores undefined values', () => {
        let cnt = 0
        mount(document.body, () => {
            let store = new Store()
            store.onEach(() => cnt++)
        })
        assertEqual(cnt, 0)
    })

    it('handles unsuitable store values', () => {
        for(let value of [3, "", false, []]) {
            let cnt = 0
            mount(document.body, () => {
                let store = new Store(value)
                assertThrow(`onEach() attempted`, () => {
                    store.onEach(() => cnt++)
                })

            })
            assertEqual(cnt, 0, "cnt mismatch for "+JSON.stringify(value))
        }
    })

    it('does nothing for an empty map', () => {
        let cnt = 0
        mount(document.body, () => {
            let store = new Store({})
            store.onEach(function() {
                cnt++
            })
        })
        assertEqual(cnt, 0)
    })


    it('emits a single entry', () => {
        let result = []
        mount(document.body, () => {
            let store = new Store({x: 3})
            store.onEach(function(store) {
                result.push([store.index(),store.get()])
            })
        })
        assertEqual(result, [['x', 3]])
    })

    it('emits multiple entries', () => {
        let result = []
        mount(document.body, () => {
            let store = new Store({x: 3, y: 4, z: 5})
            store.onEach(function(store) {
                result.push([store.index(),store.get()])
            })
            // The order is undefined, so we'll sort it
            result.sort((a,b) => a[1] - b[1])
        })
        assertEqual(result, [['x', 3], ['y', 4], ['z', 5]])
    })

    it('adds a single item to the DOM', () => {
        mount(document.body, () => {
            let store = new Store({x: 3})
            store.onEach(function(store) {
                node('p', {className: store.index()}, store.getNumber())
            })
        })
        assertBody(`p{@class="x" "3"}`)
    })

    it('adds multiple items to the DOM in default order', () => {
        mount(document.body, () => {
            let store = new Store({c: 3, a: 1, b: 2})
            store.onEach(function(store) {
                node('p', store.index())
            })
        })
        assertBody(`p{"a"} p{"b"} p{"c"}`)
    })

    it('maintains the last-element marker', () => {
        mount(document.body, () => {
            let store = new Store({c: 3, a: 1, b: 2})
            store.onEach(function(store) {
                node('p', store.index())
            })
            node('div')
        })
        assertBody(`p{"a"} p{"b"} p{"c"} div{}`)
    })

    it('maintains position for items', () => {
        let store = new Store({0: false, 1: false, 2: false, 3: false})
        let cnts = [0,0,0,0];
        mount(document.body, () => {
            store.onEach(item => {
                cnts[item.index()]++;
                if (item.getBoolean()) node('p', {id: item.index()})
            })
        })

        assertBody(``);
        assertEqual(cnts, [1,1,1,1]);

        store.merge({1: true});
        passTime();
        assertBody(`p{@id="1"}`)
        assertEqual(cnts, [1,2,1,1]);

        store.merge({0: true, 2: true, 3: true});
        passTime();
        assertBody(`p{@id="0"} p{@id="1"} p{@id="2"} p{@id="3"}`)
        assertEqual(cnts, [2,2,2,2]);
    })

    it('adds items in the right position', () => {
        let store = new Store();

        mount(document.body, () => {
            store.onEach(item => {
                node(item.index())
            })
        })

        let items = ['d', 'a', 'b', 'f', 'c', 'e'];
        let seen = [];

        for(let item of items) {
            seen.push(item+'{}')
            seen.sort();

            store.make(item).set(true);
            passTime()
            assertBody(seen.join(' '))
        }
    })

    it('removes items and calls cleaners', () => {
        let items = ['d', 'a', 'b', 'f', 'c', 'e']
        let store = new Store()
        for(let item of items) {
            store.make(item).set(true)
        }
        let cleaned = [];

        mount(document.body, () => {
            store.onEach(item => {
                node(item.index())
                clean(() => {
                    cleaned.push(item.index())
                });
            })
        })

        let current = items.slice().sort();

        let cleanedExpected = [];

        for(let item of items) {
            current.splice(current.indexOf(item), 1)
            
            store.merge({[item]: undefined});
            cleanedExpected.push(item);
            passTime()
            assertBody(current.map(s => s+'{}').join(' '))
            assertEqual(cleaned, cleanedExpected)
        }
    })

    it(`removes an entire map and calls cleaners`, () => {
        let cleaned = {};
        let store = new Store({b:2,c:3,a:1})
        mount(document.body, () => {
            if (store.getType()==="object") {
                store.onEach(item => {
                    node(item.index())
                    clean(() => {
                        cleaned[item.index()] = true;
                    })
                })
            } else {
                text(JSON.stringify(store.get()))
            }
        })
        assertBody(`a{} b{} c{}`)
        
        store.set(true)
        passTime()
        assertBody(`"true"`)
        assertEqual(cleaned, {a:true, b:true, c:true})
    })

})

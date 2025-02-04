describe('SkipList', () => {
    let list
    
    beforeEach(() => {
        list = new SkipList('id');
    });

    // Basic operations
    test('should add and get single item', () => {
        const item = { id: 1 };
        list.add(item);
        expect(list.get(1)).to.equal(item);
    });

    test('should return undefined for non-existent item', () => {
        expect(list.get(1)).to.be.undefined;
    });

    test('should detect if item exists', () => {
        const item = { id: 1 };
        expect(list.has(item)).to.be.false;
        list.add(item);
        expect(list.has(item)).to.be.true;
    });

    test('should remove existing item', () => {
        const item = { id: 1 };
        list.add(item);
        expect(list.remove(item)).to.be.true;
        expect(list.get(1)).to.be.undefined;
    });

    // Edge cases
    test('should handle duplicate adds', () => {
        const item = { id: 1 };
        expect(list.add(item)).to.be.true;
        expect(list.add(item)).to.be.false;
    });

    test('should handle removing non-existent item', () => {
        const item = { id: 1 };
        expect(list.remove(item)).to.be.false;
    });

    test('should maintain order with negative ids', () => {
        const items = [{ id: -2 }, { id: -1 }, { id: 0 }];
        items.forEach(item => list.add(item));
        expect([...list].map(i => i.id)).to.deep.equal([-2, -1, 0]);
    });

    // Larger quantities
    test('should maintain sorted order with many items', () => {
        const items = Array.from({length: 100}, (_, i) => ({ id: i }));
        // Add in random order
        const shuffled = [...items].sort(() => Math.random() - 0.5);
        shuffled.forEach(item => list.add(item));
        
        // Verify order
        expect([...list].map(i => i.id)).to.deep.equal(items.map(i => i.id));
    });

    test('should clear all items', () => {
        const items = Array.from({length: 10}, (_, i) => ({ id: i }));
        items.forEach(item => list.add(item));
        
        list.clear();
        items.forEach(item => {
            expect(list.has(item)).to.be.false;
            expect(list.get(item.id)).to.be.undefined;
        });
    });

    test('should handle sparse ids', () => {
        const items = [
            { id: 0 },
            { id: 100 },
            { id: 1000 },
            { id: 10000 }
        ];
        items.forEach(item => list.add(item));
        expect([...list].map(i => i.id)).to.deep.equal([0, 100, 1000, 10000]);
    });
});
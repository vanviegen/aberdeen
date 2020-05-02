describe('Rerender triggers', () => {
    it('rerenders only the inner scope', () => {
        let store = new Store('before');
        let cnt1 = 0, cnt2 = 0;
        mount(document.body, () => {
            node('a', () => {
                cnt1++;
                node('span', () => {
                    cnt2++;
                    text(store.get());
                })
            })
        })
        assertBody(`a{span{"before"}}`);
        store.set("after");
        assertBody(`a{span{"before"}}`);
        passTime();
        assertBody(`a{span{"after"}}`);
        assertEqual(cnt1,1);
        assertEqual(cnt2,2);
    })
});
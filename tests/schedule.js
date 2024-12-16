describe('DOM read/write scheduler', function() {

    it('orders in batches', () => {
        let order = ''
        let store = new Store('a')
		mount(document.body, () => {
            node(store.get())
            order += store.get()
		})
        scheduleDomReader(() => order += 'r1')
        scheduleDomWriter(() => order += 'w1')
        scheduleDomReader(() => order += 'r2')
        scheduleDomWriter(() => order += 'w2')
        store.set('b')
        scheduleDomReader(() => order += 'r3')
        scheduleDomWriter(() => order += 'w3')
        scheduleDomReader(() => order += 'r4')
        scheduleDomWriter(() => {
            order += 'w4'
            scheduleDomReader(() => {
                order += 'R1'
                scheduleDomReader(() => order += 'R2')
                scheduleDomWriter(() => order += 'W1')
            })
        })
        scheduleDomReader(() => order += 'r5')
        scheduleDomWriter(() => order += 'w5')
        
		assertBody(`a{}`)
        assertEqual(order, 'a')

        passTime()

		assertBody(`b{}`)
        assertEqual(order, 'abr1r2r3r4r5w1w2w3w4w5R1R2W1')

        order = ''
        scheduleDomWriter(() => order += 'W')
        scheduleDomReader(() => order += 'R')
        passTime()
        assertEqual(order, 'RW')
    });

})

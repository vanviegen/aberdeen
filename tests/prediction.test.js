describe('Prediction', function() {

    it('reverts', () => {
        let store = new Store('a')
		mount(document.body, () => {
            $(store.get())
		})
		assertBody(`a`)

        let prediction = applyPrediction(() => store.set('b'))
        passTime()
		assertBody(`b`)

        applyCanon(undefined, [prediction])
        passTime()
		assertBody(`a`)

        // Doing this again shouldn't break anything
        applyCanon(undefined, [prediction])
        passTime()
		assertBody(`a`)
    });

    it('reverts entire patch when it can no longer apply', () => {
        let store = new Store({1: 'a', 2: 'x', 3: 'm'})
		mount(document.body, () => {
            $(store(1).get())
            $(store(2).get())
            $(store(3).get())
		})
		assertBody(`a x m`)

        // This prediction should be flushed out due to conflict
        applyPrediction(() => store.merge({1: 'b', 2: 'y'}))
        passTime()
		assertBody(`b y m`)

        // This prediction should be kept
        applyPrediction(() => store(3).set('n'))
        passTime()
		assertBody(`b y n`)

        // Create the conflict
        applyCanon(() => {
            // Check that state was reverted to pre-predictions
            assertEqual(store(1).get(), 'a')
            store(1).set('c')
        })

        // Check that only the first prediction has been reverted as a whole
        passTime()
		assertBody(`c x n`)
    });

    it('forcibly reverts to canon state', () => {
        let store = new Store('a')
		mount(document.body, () => {
            $(store.get())
		})
		assertBody(`a`)

        let prediction = applyPrediction(() => store.set('b'))
        passTime()
		assertBody(`b`)

        store.set('z')

        applyCanon(undefined, [prediction])

        // An error should be thrown asynchronously
        assertThrow('Error', () => {
            passTime()
        })
		assertBody(`a`)
    })

    it('does not cause redraw when it comes true', () => {
        let store = new Store('a')
        let draws = 0
		mount(document.body, () => {
            $(store.get())
            draws++
		})
		assertBody(`a`)
        assertEqual(draws, 1)

        let prediction = applyPrediction(() => store.set('b'))
        passTime()
		assertBody(`b`)
        assertEqual(draws, 2)

        applyCanon(() => store.set('b'), [prediction])
        passTime()
		assertBody(`b`)
        assertEqual(draws, 2)
    })
})

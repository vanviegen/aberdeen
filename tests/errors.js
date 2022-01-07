describe('Errors', () => {
	it('continues rendering after an error', () => {
        let error = new Store(false)
        mount(document.body, () => {
            node('a', () => {
                node('b')
                if (error.get()) {
                    throw Error('FakeError')
                }
                node('c')
            })
            node('d')
        })
        passTime()
		assertBody(`a{b{} c{}} d{}`)
        error.set(true)
        assertThrow('FakeError', passTime)
        assertBody(`a{b{}} d{}`)
    })
})
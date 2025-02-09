describe('domPhase', function() {

    it('awaits read/write batches', async () => {
        let order = []
        function log(n) {
            // console.log(n)
            order.push(n)
        }
        const tasks = [
            async() => {
                log('a0')
                await DOM_READ_PHASE
                log('a1r')
                await DOM_READ_PHASE
                log('a2r')
                await DOM_WRITE_PHASE
                log('a3w')
            },
            async() => {
                log('b0')
                await DOM_WRITE_PHASE
                log('b1w')
                await DOM_WRITE_PHASE
                log('b2w')
                await DOM_READ_PHASE
                log('b3r')
                await DOM_READ_PHASE
                log('b4r')
                await DOM_WRITE_PHASE
                log('b5w')
            },
        ]
        // We'll use actual setTimeout to trigger fake setTimeout in this case. A bit weird...
        let interval = setInterval(passTime, 1)
        await Promise.all(tasks.map(task => task()))
        clearTimeout(interval)

        assertEqual(order.join(' '), 'a0 b0 b1w b2w a1r b3r a2r b4r a3w b5w')
    });

})

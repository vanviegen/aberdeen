describe('Clean', function() {
	test('triggers once when redrawing', () => {

        let cnt1 = 0, cnt2 = 0
        let store = proxy(1)
        mount(document.body, () => {
            cnt1++
            $({text: store.get()})
            clean(() => {
                cnt2++
            })
        })

        passTime()
        assertBody(`"1"`)
        expect([cnt1).toEqual(cnt2], [1, 0])

        store.set(2)
        passTime()
        assertBody(`"2"`)
        expect([cnt1).toEqual(cnt2], [2, 1])

        unmount()
        expect([cnt1).toEqual(cnt2], [2, 2])
    })
})

const { mount, node, Store } = require("./build/aberdeen");

describe('Clean', function() {
	it('triggers once when redrawing', () => {

        let cnt1 = 0, cnt2 = 0
        let store = new Store(1)
        let myMount = mount(document.body, () => {
            cnt1++
            text(store.get())
            clean(() => {
                cnt2++
            })
        })

        passTime()
        assertBody(`"1"`)
        assertEqual([cnt1, cnt2], [1, 0])

        store.set(2)
        passTime()
        assertBody(`"2"`)
        assertEqual([cnt1, cnt2], [2, 1])

        myMount.unmount()
        assertEqual([cnt1, cnt2], [2, 2])
    })
})

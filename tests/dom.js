describe('DOM creator', function() {
    it('adds nodes', () => {
        mount(document.body, () => {
            node('p')
        })
        passTime();
        assertBody(`p{}`)
    });

    it('adds classes', () => {
        mount(document.body, () => {
            node('p.a.b')
        })
        passTime();
        assertBody(`p{@class="a b"}`)
    });

    it('sets attributes', () => {
        mount(document.body, () => {
            node('div', {class: 'C', text: "T"}, {id: 'I', index: 1})
        })
        passTime();
        assertBody(`div{@class="C" @id="I" @index="1" "T"}`)
    });

    it('sets properties', () => {
        mount(document.body, () => {
            node('p', {className: 'C', value: 3})
        })
        passTime();
        assertBody(`p{@class="C" value=3}`)
    });

    it('nests elements', () => {
        mount(document.body, () => {
            node('p', () => {
                node('a', () => {
                    node('i', () => {
                        text('contents')
                    })
                })
            })
        })
        passTime();
        assertBody(`p{a{i{"contents"}}}`)
    });

    it('sets properties from the inner scope', () => {
        mount(document.body, () => {
            node('a', () => {
                prop('href', '/')
                prop({
                    target: '_blank',
                    disabled: true,
                })
            })
        })
        passTime();
        assertBody(`a{@href="/" @target="_blank" disabled=true}`)
    });
});

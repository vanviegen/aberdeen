it('should add a node', () => {
    mount(document.body, () => {
        node('p')
    })
    passTime();
    assertBody(`p{}`)
});

it('should add classes', () => {
    mount(document.body, () => {
        node('p.a.b')
    })
    passTime();
    assertBody(`p{@class="a b"}`)
});

it('should set attributes', () => {
    mount(document.body, () => {
        node('div', {class: 'C', text: "T"}, {id: 'I', index: 1})
    })
    passTime();
    assertBody(`div{@class="C" @id="I" @index="1" "T"}`)
});

it('should set properties', () => {
    mount(document.body, () => {
        node('p', {className: 'C', value: 3})
    })
    passTime();
    assertBody(`p{@class="C" value=3}`)
});

it('should nest elements', () => {
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
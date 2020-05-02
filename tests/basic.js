it('should add classes', async () => {
    mount(document.body, () => {
        node('p.a.b')
    })
    await step();
    assertBody(`<p class="a b"></p>`)
});

it('should set attributes', async () => {
    mount(document.body, () => {
        node('div', {class: 'C', text: "T"}, {id: 'I', index: 1})
    })
    await step();
    assertBody(`<div class="C" id="I" index="1">T</div>`)
});

it('should set properties', async () => {
    mount(document.body, () => {
        node('p', {id: 'I', className: 'C', value: 3})
    })
    await step();
    assertBody(`<p class="C" id="I"></p>`)
    equal($('I').value, 3)
});
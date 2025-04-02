import $ from './aberdeen'

const FADE_TIME = 400
const GROW_SHRINK_TRANSITION = `margin ${FADE_TIME}ms ease-out, transform ${FADE_TIME}ms ease-out`

function getGrowShrinkProps(el: HTMLElement) {
	const parentStyle: any = el.parentElement ? getComputedStyle(el.parentElement) : {}
	const isHorizontal = parentStyle.display === 'flex' && (parentStyle.flexDirection||'').startsWith('row')
	return isHorizontal ?
		{marginLeft: `-${el.offsetWidth/2}px`, marginRight: `-${el.offsetWidth/2}px`, transform: "scaleX(0)"} :
		{marginBottom: `-${el.offsetHeight/2}px`, marginTop: `-${el.offsetHeight/2}px`, transform: "scaleY(0)"}

}

/** Do a grow transition for the given element. This is meant to be used as a
* handler for the `create` property.
*
* @param el The element to transition.
*
* The transition doesn't look great for table elements, and may have problems
* for other specific cases as well.
*/
export async function grow(el: HTMLElement) {
	// Wait until all DOM updates have been done. Then get info from the computed layout.
	await $.DOM_READ_PHASE
	let props = getGrowShrinkProps(el)

	// In the write phase, make the element size 0 using transforms and negative margins.
	await $.DOM_WRITE_PHASE
	Object.assign(el.style, props)
	
	// Await read phase, to combine multiple transitions into a single browser layout
	await $.DOM_READ_PHASE
	// Make sure the layouting has been performed, to cause transitions to trigger
	el.offsetHeight

	// In the next write phase, do the transitions
	await $.DOM_WRITE_PHASE
	el.style.transition = GROW_SHRINK_TRANSITION
	for(let prop in props) el.style[prop as any] = ''
	setTimeout(() => {
		// Disable transitions.
		el.style.transition = ''
	}, FADE_TIME)
}

/** Do a shrink transition for the given element, and remove it from the DOM
* afterwards. This is meant to be used as a handler for the `destroy` property.
*
* @param el The element to transition and remove.
*
* The transition doesn't look great for table elements, and may have problems
* for other specific cases as well.
*/
export async function shrink(el: HTMLElement) {
	// Wait until all DOM updates have been done. Then get info from the computed layout.
	await $.DOM_READ_PHASE
	const props = getGrowShrinkProps(el)

	// Batch starting transitions in the write phase.
	await $.DOM_WRITE_PHASE
	el.style.transition = GROW_SHRINK_TRANSITION
	Object.assign(el.style, props)
	
	// Remove the element after the transition is done.
	setTimeout(() => {
		el.remove()
	}, FADE_TIME)
}

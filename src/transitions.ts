import {scheduleDomReader, scheduleDomWriter} from 'aberdeen'

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
export function grow(el: HTMLElement): void {
	// This timeout is to await all other elements having been added to the Dom
	scheduleDomReader(() => {
		// Make the element size 0 using transforms and negative margins.
		// This causes a browser layout, as we're querying el.offset<>.
		let props = getGrowShrinkProps(el)
		
		// The timeout is in order to batch all reads and then all writes when there
		// are multiple simultaneous grow transitions.
		scheduleDomWriter(() => {
			Object.assign(el.style, props)
			
			// This timeout is to combine multiple transitions into a single browser layout
			scheduleDomReader(() => {
				// Make sure the layouting has been performed, to cause transitions to trigger
				el.offsetHeight
				scheduleDomWriter(() => {
					// Do the transitions
					el.style.transition = GROW_SHRINK_TRANSITION
					for(let prop in props) el.style[prop as any] = ""
					setTimeout(() => {
						// Reset the element to a clean state
						el.style.transition = ""
					}, FADE_TIME)
				})
			})
		})
	})
}

/** Do a shrink transition for the given element, and remove it from the DOM
* afterwards. This is meant to be used as a handler for the `destroy` property.
*
* @param el The element to transition and remove.
*
* The transition doesn't look great for table elements, and may have problems
* for other specific cases as well.
*/
export function shrink(el: HTMLElement): void {
	scheduleDomReader(() => {
		const props = getGrowShrinkProps(el)
		// The timeout is in order to batch all reads and then all writes when there
		// are multiple simultaneous shrink transitions.
		scheduleDomWriter(() => {
			el.style.transition = GROW_SHRINK_TRANSITION
			Object.assign(el.style, props)
			
			setTimeout(() => el.remove(), FADE_TIME)
		})
	})
}
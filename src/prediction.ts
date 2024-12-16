import {withEmitHandler} from 'aberdeen'

type ObsCollection = any
type Patch = Map<ObsCollection, Map<any, [any, any]>>;


function recordPatch(func: () => void): Patch {
	const recordingPatch = new Map()
	withEmitHandler(function(index, newData, oldData) {
		addToPatch(recordingPatch, this, index, newData, oldData)
	}, func)
	return recordingPatch
}

function addToPatch(patch: Patch, collection: ObsCollection, index: any, newData: any, oldData: any) {
	let collectionMap = patch.get(collection)
	if (!collectionMap) {
		collectionMap = new Map()
		patch.set(collection, collectionMap)
	}
	let prev = collectionMap.get(index)
	if (prev) oldData = prev[1]
	if (newData === oldData) collectionMap.delete(index)
	else collectionMap.set(index, [newData, oldData])
}

function emitPatch(patch: Patch) {
	for(let [collection, collectionMap] of patch) {
		for(let [index, [newData, oldData]] of collectionMap) {
			collection.emitChange(index, newData, oldData)
		}
	}
}

function mergePatch(target: Patch, source: Patch, reverse: boolean = false) {
	for(let [collection, collectionMap] of source) {
		for(let [index, [newData, oldData]] of collectionMap) {
			addToPatch(target, collection, index, reverse ? oldData : newData, reverse ? newData : oldData)
		}
	}
}

function silentlyApplyPatch(patch: Patch, force: boolean = false): boolean {
	for(let [collection, collectionMap] of patch) {
		for(let [index, [newData, oldData]] of collectionMap) {
			let actualData = collection.rawGet(index)
			if (actualData !== oldData) {
				if (force) setTimeout(() => { throw new Error(`Applying invalid patch: data ${actualData} is unequal to expected old data ${oldData} for index ${index}`)}, 0)
				else return false
			}
		}
	}
	for(let [collection, collectionMap] of patch) {
		for(let [index, [newData, oldData]] of collectionMap) {
			collection.rawSet(index, newData)
		}
	}
	return true
}


const appliedPredictions: Array<Patch> = []

/**
 * Run the provided function, while treating all changes to Observables as predictions,
 * meaning they will be reverted when changes come back from the server (or some other
 * async source).
 * @param predictFunc The function to run. It will generally modify some Observables
 * 	to immediately reflect state (as closely as possible) that we expect the server
 *  to communicate back to us later on.
 * @returns A `Patch` object. Don't modify it. This is only meant to be passed to `applyCanon`.
 */
export function applyPrediction(predictFunc: () => void): Patch {
	let patch = recordPatch(predictFunc)
	appliedPredictions.push(patch)
	emitPatch(patch)
	return patch
}

/**
 * Temporarily revert all outstanding predictions, optionally run the provided function
 * (which will generally make authoritative changes to the data based on a server response),
 * and then attempt to reapply the predictions on top of the new canonical state, dropping 
 * any predictions that can no longer be applied cleanly (the data has been modified) or
 * that were specified in `dropPredictions`.
 * 
 * All of this is done such that redraws are only triggered if the overall effect is an
 * actual change to an `Observable`.
 * @param canonFunc The function to run without any predictions applied. This will typically
 *  make authoritative changes to the data, based on a server response.
 * @param dropPredictions An optional list of predictions (as returned by `applyPrediction`)
 *  to undo. Typically, when a server response for a certain request is being handled,
 *  you'd want to drop the prediction that was done for that request.
 */
export function applyCanon(canonFunc?: (() => void), dropPredictions: Array<Patch> = []) {
	
	let resultPatch = new Map()
	for(let prediction of appliedPredictions) mergePatch(resultPatch, prediction, true)
	silentlyApplyPatch(resultPatch, true)

	for(let prediction of dropPredictions) {
		let pos = appliedPredictions.indexOf(prediction)
		if (pos >= 0) appliedPredictions.splice(pos, 1)
	}
	if (canonFunc) mergePatch(resultPatch, recordPatch(canonFunc))

	for(let idx=0; idx<appliedPredictions.length; idx++) {
		if (silentlyApplyPatch(appliedPredictions[idx])) {
			mergePatch(resultPatch, appliedPredictions[idx])
		} else {
			appliedPredictions.splice(idx, 1)
			idx--
		}
	}

	emitPatch(resultPatch)
}

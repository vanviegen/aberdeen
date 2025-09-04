import { defaultEmitHandler, withEmitHandler } from "./aberdeen.js";
import type { TargetType } from "./aberdeen.js";

/**
 * Represents a set of changes that can be applied to proxied objects.
 * This is an opaque type - its internal structure is not part of the public API.
 * @private
 */
export type Patch = Map<TargetType, Map<any, [any, any]>>;

function recordPatch(func: () => void): Patch {
	const recordingPatch = new Map();
	withEmitHandler((target, index, newData, oldData) => {
		addToPatch(recordingPatch, target, index, newData, oldData);
	}, func);
	return recordingPatch;
}

function addToPatch(
	patch: Patch,
	collection: TargetType,
	index: any,
	newData: any,
	oldData: any,
) {
	let collectionMap = patch.get(collection);
	if (!collectionMap) {
		collectionMap = new Map();
		patch.set(collection, collectionMap);
	}
	const prev = collectionMap.get(index);
	const oldData0 = prev ? prev[1] : oldData;
	if (newData === oldData0) collectionMap.delete(index);
	else collectionMap.set(index, [newData, oldData0]);
}

function emitPatch(patch: Patch) {
	for (const [collection, collectionMap] of patch) {
		for (const [index, [newData, oldData]] of collectionMap) {
			defaultEmitHandler(collection, index, newData, oldData);
		}
	}
}

function mergePatch(target: Patch, source: Patch, reverse = false) {
	for (const [collection, collectionMap] of source) {
		for (const [index, [newData, oldData]] of collectionMap) {
			addToPatch(
				target,
				collection,
				index,
				reverse ? oldData : newData,
				reverse ? newData : oldData,
			);
		}
	}
}

function silentlyApplyPatch(patch: Patch, force = false): boolean {
	for (const [collection, collectionMap] of patch) {
		for (const [index, [newData, oldData]] of collectionMap) {
			const actualData = (collection as any)[index];
			if (actualData !== oldData) {
				if (force)
					setTimeout(() => {
						throw new Error(
							`Applying invalid patch: data ${actualData} is unequal to expected old data ${oldData} for index ${index}`,
						);
					}, 0);
				else return false;
			}
		}
	}
	for (const [collection, collectionMap] of patch) {
		for (const [index, [newData, oldData]] of collectionMap) {
			(collection as any)[index] = newData;
		}
	}
	return true;
}

const appliedPredictions: Array<Patch> = [];

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
	const patch = recordPatch(predictFunc);
	appliedPredictions.push(patch);
	emitPatch(patch);
	return patch;
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
export function applyCanon(
	canonFunc?: () => void,
	dropPredictions: Array<Patch> = [],
) {
	const resultPatch = new Map();
	for (const prediction of appliedPredictions)
		mergePatch(resultPatch, prediction, true);
	silentlyApplyPatch(resultPatch, true);

	for (const prediction of dropPredictions) {
		const pos = appliedPredictions.indexOf(prediction);
		if (pos >= 0) appliedPredictions.splice(pos, 1);
	}
	if (canonFunc) mergePatch(resultPatch, recordPatch(canonFunc));

	for (let idx = 0; idx < appliedPredictions.length; idx++) {
		if (silentlyApplyPatch(appliedPredictions[idx])) {
			mergePatch(resultPatch, appliedPredictions[idx]);
		} else {
			appliedPredictions.splice(idx, 1);
			idx--;
		}
	}

	emitPatch(resultPatch);
}

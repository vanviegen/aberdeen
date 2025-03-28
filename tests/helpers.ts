import { expect } from 'bun:test';
import * as fakedom from './fakedom';

function toDisplay(value: any) {
	if (value instanceof Map) {
		let results: string[] = []
		value.forEach((value,key) => results.push(JSON.stringify(key)+": "+JSON.stringify(value)))
		return "map{" + results.join(", ") + "}"
	} else {
		return JSON.stringify(value)
	}
}

export class AssertError extends Error {
	constructor(text: string, actual: any, expected: any, expectLiteral: boolean = false) {
		text += `
		Actual:   ${toDisplay(actual)}
		Expected: ${expectLiteral ? expected : toDisplay(expected)}`
		super(text)
	}
}

export function assert(bool: any, msg?: string): void {
	if (!bool) throw new AssertError(`assert failed${msg ? ": "+msg : ""}`, bool, "something trueish", true)
}

export function assertContains(actual: any, expected: {indexOf: (v: any)=>number}, msg?: string): void {
	actual = (''+actual)
	if (actual.indexOf(expected) < 0) throw new AssertError(`contains failed ${msg ? ": "+msg : ""}`, actual, `something containing '${expected}'`, true)
}

export function getBody(): string {
	return document.body.toString().replace(/^body{(.*)}$/,'$1').replace(/^body\b/,'')
}

export function assertBody(expected: string): void {
	let actual = getBody()
	if (actual !== expected) throw new AssertError(`assertBody failed`, actual, expected)
}

export function assertThrow(what: string, func: ()=>void): void;
export function assertThrow(func: ()=>void): void;

export function assertThrow(a: any, b?: any): void {
	if (typeof a == 'function') {
		b = a
		a = undefined
	}
	try {
		b()
	} catch(e) {
        const s = ''+e
		if (a && s.indexOf(a)<0) throw new AssertError(`wrong exception`, s, `something containing "${a}"`, true)
		return
	}
	throw new AssertError(`exception expected`, undefined, `something containing "${a}"`, true)
}

export function objToMap(obj: Record<string,any>) {
    if (typeof obj === 'object' && obj && obj.constructor===Object) {
        let map = new Map()
        for(let k in obj) {
            map.set(k, objToMap(obj[k]))
        }
        return map
    }
    return obj
}

export const passTime = fakedom.passTime
export const asyncPassTime = fakedom.asyncPassTime

export function assertDomUpdates(expected: {new?: number, changed?: number}) {
	const counts = fakedom.getCounts()
	if (expected.new!=null) expect(counts.new).toEqual(expected.new)
	if (expected.changed!=null) expect(counts.changed).toEqual(expected.changed)
}
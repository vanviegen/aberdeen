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
	let actual = getBody();
	if (actual !== expected) throw new Error(`assertBody failed\nActual:   ${actual}\nExpected: ${expected}`)
}

export function assertCss(...expected: string[]) {
	const found: string[] = [];
	for (const root of [document.head, document.body]) {
		(root as any).visit((el: Element) => {
			if (el.tagName === 'style') {
				for(let style of el.textContent.trim().split("\n")) {
					if (style) {
						found.push(style);
					}
				}
			}
		});
	}
	expect(found).toEqual(expected);
}


export async function assertThrow(what: string, func: ()=>void): Promise<void>;
export async function assertThrow(func: ()=>void): Promise<void>;

export async function assertThrow(a: any, b?: any): Promise<void> {
	if (typeof a == 'function') {
		b = a
		a = undefined
	}
	try {
		await b()
	} catch(e) {
        const s = ''+e
		if (a && s.indexOf(a)<0) throw new AssertError(`wrong exception`, s, `something containing "${a}"`, true)
		return
	}
	throw new AssertError(`exception expected`, undefined, `something containing "${a}"`, true)
}

export const passTime = fakedom.passTime

export function assertDomUpdates(expected: {new?: number, changed?: number}) {
	const counts = fakedom.getCounts()
	if (expected.new!=null) expect(counts.new).toEqual(expected.new)
	if (expected.changed!=null) expect(counts.changed).toEqual(expected.changed)
}
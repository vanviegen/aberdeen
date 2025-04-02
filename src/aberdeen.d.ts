export type TargetType = any[] | {
    [key: string]: any;
};
export type DatumType = TargetType | boolean | number | string | null | undefined;
/** @internal */
export type Patch = Map<TargetType, Record<string | symbol | number, [any, any]>>;
/** @internal */
type SortKeyType = number | string | Array<number | string> | undefined;
export declare class Proxied {
    constructor();
}
/**
* Modifies the *parent* DOM element in the current reactive scope, or adds
* new DOM elements to it.
*
* @param args - Arguments that define how to modify/create elements.
*
* ### String arguments
* Create new elements with optional classes and text content:
* ```js
* $('div.myClass')              // <div class="myClass"></div>
* $('span.c1.c2:Hello')         // <span class="c1 c2">Hello</span>
* $('p:Some text')              // <p>Some text</p>
* $('.my-thing')                // <div class="my-thing"></div>
* $('div', 'span', 'p.cls')     // <div><span<p class="cls"></p></span></div>
* $(':Just some text!')		 // Just some text! (No new element, just a text node)
* ```
*
* ### Object arguments
* Set properties, attributes, events and special features:
* ```js
* // Classes (dot prefix)
* $('div', {'.active': true})           // Add class
* $('div', {'.hidden': false})          // Remove (or don't add) class
* $('div', {'.selected': myStore})      // Reactively add/remove class
*
* // Styles (dollar prefixed and camel-cased CSS properties)
* $('div', {$color: 'red'})             // style.color = 'red'
* $('div', {$marginTop: '10px'})        // style.marginTop = '10px'
* $('div', {$color: myColorStore})      // Reactively change color
*
* // Events (function values)
* $('button', {click: () => alert()})   // Add click handler
*
* // Properties (boolean values, `selectedIndex`, `value`)
* $('input', {disabled: true})          // el.disabled = true
* $('input', {value: 'test'})           // el.value = 'test'
* $('select', {selectedIndex: 2})       // el.selectedIndex = 2
*
* // Transitions
* $('div', {create: 'fade-in'})         // Add class on create
* $('div', {create: el => {...}})       // Run function on create
* $('div', {destroy: 'fade-out'})       // Add class before remove
* $('div', {destroy: el => {...}})      // Run function before remove
*
* // Content
* $('div', {html: '<b>Bold</b>'})       // Set innerHTML
* $('div', {text: 'Plain text'})        // Add text node
* const myElement = document.createElement('video')
* $('div', {element: myElement})        // Add existing DOM element
*
* // Regular attributes (everything else)
* $('div', {title: 'Info'})             // el.setAttribute('title', 'info')
* ```
*
* When a `Store` is passed as a value, a seperate observe-scope will
* be created for it, such that when the `Store` changes, only *that*
* UI property will need to be updated.
* So in the following example, when `colorStore` changes, only the
* `color` CSS property will be updated.
* ```js
* $('div', {
*   '.active': activeStore,             // Reactive class
*   $color: colorStore,                 // Reactive style
*   text: textStore                     // Reactive text
* })
* ```
*
* ### Two-way input binding
* Set the initial value of an <input> <textarea> or <select> to that
* of a `Store`, and then start reflecting user changes to the former
* in the latter.
* ```js
* $('input', {bind: myStore})           // Binds input.value
* ```
* This is a special case, as changes to the `Store` will *not* be
* reflected in the UI.
*
* ### Function arguments
* Create child scopes that re-run on observed `Store` changes:
* ```js
* $('div', () => {
*   $(myStore.get() ? 'span' : 'p')     // Reactive element type
* })
* ```
* When *only* a function is given, `$` behaves exactly like {@link Store.observe},
* except that it will only work when we're inside a `mount`.
*
* @throws {Error} If invalid arguments are provided.
*/
type DollarArg = string | null | undefined | false | Record<string, any>;
declare function $<T>(func: () => T): {
    value: T;
};
declare function $<T>(...args: DollarArg[]): void;
declare function $<T>(...args: [...DollarArg[], (() => void)]): void;
declare namespace $ {
    var mount: (parentElement: Element, func: () => void) => void;
    var observe: (func: () => void) => void;
    var immediateObserve: (func: () => void) => void;
    var unmountAll: () => void;
    var proxy: {
        <T extends DatumType>(array: Array<T>): Array<T extends number ? number : T extends string ? string : T extends boolean ? boolean : T>;
        <T extends object>(obj: T): T;
        <T extends DatumType>(value: T): {
            value: T extends number ? number : T extends string ? string : T extends boolean ? boolean : T;
        };
    };
    var isProxied: (target: TargetType) => boolean;
    var ref: (proxy: TargetType, index: any) => {
        proxy: TargetType;
        index: any;
    };
    var getParentElement: () => Element;
    var clean: (cleaner: () => void) => void;
    var onEach: {
        <T>(target: Array<undefined | T>, render: (value: T, index: number) => void, makeKey?: (value: T, key: any) => SortKeyType): void;
        <K extends string | number | symbol, T>(target: Record<K, undefined | T>, render: (value: T, index: K) => void, makeKey?: (value: T, key: K) => SortKeyType): void;
    };
    var isEmpty: (proxied: TargetType) => boolean;
    var get: {
        <T extends object, K1 extends keyof T>(target: T, k1: K1): T[K1] | undefined;
        <T extends object, K1 extends keyof T, K2 extends keyof T[K1]>(target: T, k1: K1, k2: K2): T[K1][K2] | undefined;
        <T extends object, K1 extends keyof T, K2 extends keyof T[K1], K3 extends keyof T[K1][K2]>(target: T, k1: K1, k2: K2, k3: K3): T[K1][K2][K3] | undefined;
    };
    var peek: {
        <T>(func: () => T): T;
        <T extends object>(target: T): T;
        <T extends object, K1 extends keyof T>(target: T, k1: K1): T[K1];
        <T extends object, K1 extends keyof T, K2 extends keyof T[K1]>(target: T, k1: K1, k2: K2): T[K1][K2];
        <T extends object, K1 extends keyof T, K2 extends keyof T[K1], K3 extends keyof T[K1][K2]>(target: T, k1: K1, k2: K2, k3: K3): T[K1][K2][K3];
    };
    var set: {
        <T extends object>(target: T, value: T): void;
        <T extends object, K1 extends keyof T>(target: T, k1: K1, value: T[K1]): void;
        <T extends object, K1 extends keyof T, K2 extends keyof T[K1]>(target: T, k1: K1, k2: K2, value: T[K1][K2]): void;
        <T extends object, K1 extends keyof T, K2 extends keyof T[K1], K3 extends keyof T[K1][K2]>(target: T, k1: K1, k2: K2, k3: K3, value: T[K1][K2][K3]): void;
    };
    var merge: {
        <T extends object>(target: T, value: T): void;
        <T extends object, K1 extends keyof T>(target: T, k1: K1, value: T[K1]): void;
        <T extends object, K1 extends keyof T, K2 extends keyof T[K1]>(target: T, k1: K1, k2: K2, value: T[K1][K2]): void;
        <T extends object, K1 extends keyof T, K2 extends keyof T[K1], K3 extends keyof T[K1][K2]>(target: T, k1: K1, k2: K2, k3: K3, value: T[K1][K2][K3]): void;
    };
    var map: {
        <IN, OUT>(target: Array<IN>, func: (value: IN, index: number) => undefined | OUT, thisArg?: object): Array<OUT>;
        <IN, OUT>(target: Record<string | symbol, IN>, func: (value: IN, index: string | symbol) => undefined | OUT, thisArg?: object): Record<string | symbol, OUT>;
    };
    var multiMap: {
        <IN, OUT extends {
            [key: string | symbol]: DatumType;
        }>(target: Array<IN>, func: (value: IN, index: number) => OUT | undefined, thisArg?: object): OUT;
        <K extends string | number | symbol, IN, OUT extends {
            [key: string | symbol]: DatumType;
        }>(target: Record<K, IN>, func: (value: IN, index: K) => OUT | undefined, thisArg?: object): OUT;
    };
    var dump: <T>(proxied: T) => T;
    var setErrorHandler: (handler?: (error: Error) => boolean | undefined) => void;
    var runQueue: () => void;
    var withEmitHandler: (handler: (target: TargetType, index: any, newData: DatumType, oldData: DatumType) => void, func: () => void) => void;
    var defaultEmitHandler: (target: TargetType, index: string | symbol | number, newData: DatumType, oldData: DatumType) => void;
    var DOM_READ_PHASE: {
        then: (fulfilled: () => void) => any;
    };
    var DOM_WRITE_PHASE: {
        then: (fulfilled: () => void) => any;
    };
}
declare global {
    interface String {
        replaceAll(from: string, to: string): string;
    }
}
export default $;

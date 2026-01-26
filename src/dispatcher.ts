/**
 * Symbol to return when a custom {@link Dispatcher.addRoute} matcher cannot match a segment.
 */
export const MATCH_FAILED: unique symbol = Symbol("MATCH_FAILED");

/**
 * Special {@link Dispatcher.addRoute} matcher that matches the rest of the segments as an array of strings.
 */
export const MATCH_REST: unique symbol = Symbol("MATCH_REST");

type Matcher = string | ((segment: string) => any) | typeof MATCH_REST;

type ExtractParamType<M> =  M extends string
? never : (
    M extends ((segment: string) => infer R)
    ? Exclude<R, typeof MATCH_FAILED>
    : (M extends typeof MATCH_REST ? string[] : never)
);

type ParamsFromMatchers<T extends Matcher[]> = T extends [infer M1, ...infer Rest]
? (
    M1 extends Matcher
    ? (
        ExtractParamType<M1> extends never
        ? ParamsFromMatchers<Rest extends Matcher[] ? Rest : []>
        : [ExtractParamType<M1>, ...ParamsFromMatchers<Rest extends Matcher[] ? Rest : []>]
    ) : never
) : [];

interface DispatcherRoute {
    matchers: Matcher[];
    handler: (...params: any[]) => void;
}

/**
 * Simple route matcher and dispatcher.
 * 
 * Example usage:
 * 
 * ```ts
 * import * as route from 'aberdeen/route';
 * import { Dispatcher, MATCH_REST } from 'aberdeen/dispatcher';
 * 
 * const dispatcher = new Dispatcher();
 * 
 * dispatcher.addRoute("user", Number, "stream", String, (id, stream) => {
 *    console.log(`User ${id}, stream ${stream}`);
 * });
 *
 * dispatcher.dispatch(["user", "42", "stream", "music"]);
 * // Logs: User 42, stream music
 * 
 * dispatcher.addRoute("search", MATCH_REST, (terms: string[]) => {
 *     console.log("Search terms:", terms);
 * });
 * 
 * dispatcher.dispatch(["search", "classical", "piano"]);
 * // Logs: Search terms: [ 'classical', 'piano' ]
 * ```
 */
export class Dispatcher {
    private routes: Array<DispatcherRoute> = [];
    
    /**
     * Add a route with matchers and a handler function.
     * @param args An array of matchers followed by a handler function. Each matcher can be:
     * - A string: matches exactly that string.
     * - A function: takes a string segment and returns a value (of any type) if it matches, or {@link MATCH_FAILED} if it doesn't match. The return value (if not `MATCH_FAILED` and not `NaN`) is passed as a parameter to the handler function. The standard JavaScript functions `Number` and `String` can be used to match numeric and string segments respectively.
     * - The special {@link MATCH_REST} symbol: matches the rest of the segments as an array of strings. Only one `MATCH_REST` is allowed.
     * @template T - Array of matcher types.
     * @template H - Handler function type, inferred from the matchers.
     */
    addRoute<T extends Matcher[], H extends (...args: ParamsFromMatchers<T>) => void>(...args: [...T, H]): void {
        const matchers = args.slice(0, -1) as Matcher[];
        const handler = args[args.length - 1] as (...args: any) => any;

        if (typeof handler !== "function") {
            throw new Error("Last argument should be a handler function");
        }
        
        const restCount = matchers.filter(m => m === MATCH_REST).length;
        if (restCount > 1) {
            throw new Error("Only one MATCH_REST is allowed");
        }

        this.routes.push({ matchers, handler });
    }
    
    /**
     * Dispatches the given segments to the first route handler that matches.
     * @param segments Array of string segments to match against the added routes. When using this class with the Aberdeen `route` module, one would typically pass `route.current.p`.
     * @returns True if a matching route was found and handled, false otherwise.
     */
    dispatch(segments: string[]): boolean {
        for (const route of this.routes) {
            const args = matchRoute(route, segments);
            if (args) {
                route.handler(...args);
                return true;
            }
        }
        return false;
    }
}

function matchRoute(route: DispatcherRoute, segments: string[]): any[] | undefined {
    const args: any[] = [];
    let segmentIndex = 0;

    for (const matcher of route.matchers) {
        if (matcher === MATCH_REST) {
            const len = segments.length - (route.matchers.length - 1);
            if (len < 0) return;
            args.push(segments.slice(segmentIndex, segmentIndex + len));
            segmentIndex += len;
            continue;
        }

        if (segmentIndex >= segments.length) return;
        const segment = segments[segmentIndex];
        
        if (typeof matcher === "string") {
            if (segment !== matcher) return;
        } else if (typeof matcher === "function") {
            const result = matcher(segment);
            if (result === MATCH_FAILED || (typeof result === 'number' && isNaN(result))) return;
            args.push(result);
        }
        
        segmentIndex++;
    }
    if (segmentIndex === segments.length) return args; // success!
}

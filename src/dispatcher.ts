/**
 * Symbol to return when a custom {@link Dispatcher.addRoute} matcher cannot match a segment.
 */
export const matchFailed: unique symbol = Symbol("matchFailed");

/**
 * Special {@link Dispatcher.addRoute} matcher that matches the rest of the segments as an array of strings.
 */
export const matchRest: unique symbol = Symbol("matchRest");

type Matcher = string | ((segment: string) => any) | typeof matchRest;

type ExtractParamType<M> =  M extends string
? never : (
    M extends ((segment: string) => infer R)
    ? Exclude<R, typeof matchFailed>
    : (M extends typeof matchRest ? string[] : never)
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
 * const dispatcher = new Dispatcher();
 * 
 * dispatcher.addRoute("user", Number, "stream", String, (id, stream) => {
 *    console.log(`User ${id}, stream ${stream}`);
 * });
 *
 * dispatcher.dispatch(["user", "42", "stream", "music"]);
 * // Logs: User 42, stream music
 * 
 * dispatcher.addRoute("search", matchRest, (terms: string[]) => {
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
     * - A function: takes a string segment and returns a value (of any type) if it matches, or {@link matchFailed} if it doesn't match. The return value (if not `matchFailed` and not `NaN`) is passed as a parameter to the handler function. The built-in functions `Number` and `String` can be used to match numeric and string segments respectively.
     * - The special {@link matchRest} symbol: matches the rest of the segments as an array of strings. Only one `matchRest` is allowed, and it must be the last matcher.
     * @template T - Array of matcher types.
     * @template H - Handler function type, inferred from the matchers.
     */
    addRoute<T extends Matcher[], H extends (...args: ParamsFromMatchers<T>) => void>(...args: [...T, H]): void {
        const matchers = args.slice(0, -1) as Matcher[];
        const handler = args[args.length - 1] as (...args: any) => any;

        if (typeof handler !== "function") {
            throw new Error("Last argument should be a handler function");
        }
        
        const restCount = matchers.filter(m => m === matchRest).length;
        if (restCount > 1) {
            throw new Error("Only one matchRest is allowed");
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
        if (matcher === matchRest) {
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
            if (result === matchFailed || (typeof result === 'number' && isNaN(result))) return;
            args.push(result);
        }
        
        segmentIndex++;
    }
    return args; // success!
}

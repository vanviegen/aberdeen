import { test, expect } from "bun:test";
import { matchFailed, matchRest } from "../src/dispatcher";
import { Dispatcher } from "../src/dispatcher";

// Helper matcher
function parseFeedKey(segment: string) {
    if (segment === "x") return segment;
    if (segment.startsWith(":")) return parseInt(segment.slice(1));
    return matchFailed;
}

test("Dispatcher: basic route matching", () => {
    const d = new Dispatcher();
    let called = false;
    d.addRoute("users", Number, "feed", parseFeedKey, (userId: number, feedKey: string | number) => {
        called = true;
        expect(userId).toBe(123);
        expect(feedKey).toBe("x");
    });
    d.dispatch(["users", "123", "feed", "x"]);
    expect(called).toBe(true);
});

test("Dispatcher: matchRest and handler args", () => {
    const d = new Dispatcher();
    let result: any = null;
    d.addRoute("example", matchRest, "x", Number, (rest: string[], x: number) => {
        result = { rest, x };
    });
    d.dispatch(["example", "a", "b", "c", "x", "42"]);
    expect(result.rest.length).toBe(3);
    expect(result.x).toBe(42);
});

test("Dispatcher: matchFailed prevents handler call", () => {
    const d = new Dispatcher();
    let called = false;
    d.addRoute("fail", parseFeedKey, () => { called = true; });
    d.dispatch(["fail", "not-a-feed"]);
    expect(called).toBe(false);
});

test("Dispatcher: only one matchRest allowed", () => {
    const d = new Dispatcher();
    let threw = false;
    try {
        d.addRoute(matchRest, "x", matchRest, () => {});
    } catch (e: any) {
        threw = e.message.includes("Only one matchRest is allowed");
    }
    expect(threw).toBe(true);
});

test("Dispatcher: type checking", () => {
    const d = new Dispatcher();
    
    d.addRoute("users", Number, "feed", parseFeedKey, (userId: number, feedKey: string | number) => {}); // OK
    
    // @ts-expect-error - Invalid argument
    d.addRoute("users", Number, "feed", parseFeedKey, (userId: number, feedKey: number) => {});
    
    // @ts-expect-error - Too many arguments
    d.addRoute("users", Number, "feed", (userId: number, feedKey) => {});
    
    // @ts-expect-error - Handler expects string[], but declared as string
    d.addRoute("example", matchRest, (rest: string) => {});
    
    expect(() => {
        // @ts-expect-error - Handler is not a function
        d.addRoute("users", Number, "feed", parseFeedKey, "notAFunction");
    }).toThrow();
});

import { test, expect } from "bun:test";
import { MATCH_FAILED, MATCH_REST } from "../src/dispatcher";
import { Dispatcher } from "../src/dispatcher";

// Helper matcher
function parseFeedKey(segment: string) {
    if (segment === "x") return segment;
    if (segment.startsWith(":")) return parseInt(segment.slice(1));
    return MATCH_FAILED;
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

test("Dispatcher: MATCH_REST and handler args", () => {
    const d = new Dispatcher();
    let result: any = null;
    d.addRoute("example", MATCH_REST, "x", Number, (rest: string[], x: number) => {
        result = { rest, x };
    });
    d.dispatch(["example", "a", "b", "c", "x", "42"]);
    expect(result.rest.length).toBe(3);
    expect(result.x).toBe(42);
});

test("Dispatcher: MATCH_FAILED prevents handler call", () => {
    const d = new Dispatcher();
    let called = false;
    d.addRoute("fail", parseFeedKey, () => { called = true; });
    d.dispatch(["fail", "not-a-feed"]);
    expect(called).toBe(false);
});

test("Dispatcher: only one MATCH_REST allowed", () => {
    const d = new Dispatcher();
    let threw = false;
    try {
        d.addRoute(MATCH_REST, "x", MATCH_REST, () => {});
    } catch (e: any) {
        threw = e.message.includes("Only one MATCH_REST is allowed");
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
    d.addRoute("example", MATCH_REST, (rest: string) => {});
    
    expect(() => {
        // @ts-expect-error - Handler is not a function
        d.addRoute("users", Number, "feed", parseFeedKey, "notAFunction");
    }).toThrow();
});

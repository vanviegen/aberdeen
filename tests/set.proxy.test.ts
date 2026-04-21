import { expect, test } from "bun:test";
import A from "../src/aberdeen";
import { assertBody, passTime } from "./helpers";

test("A.proxy creates Set proxy", () => {
	const data = new Set(["a", "b"]);
	const proxied = A.proxy(data);

	expect(proxied).not.toBe(data);
	expect(proxied instanceof Set).toBe(true);
	expect(proxied.has("a")).toBe(true);
	expect(proxied.has("b")).toBe(true);
	expect(proxied.size).toBe(2);
});

test("Set proxy supports add, delete, clear, has, and size", async () => {
	const data = A.proxy(new Set(["a"]));
	let cnt = 0;

	A(() => {
		cnt++;
		A({ text: `size=${data.size} hasA=${data.has("a")} hasB=${data.has("b")}` });
	});

	assertBody('"size=1 hasA=true hasB=false"');
	expect(cnt).toBe(1);

	data.add("b");
	await passTime();
	assertBody('"size=2 hasA=true hasB=true"');
	expect(cnt).toBe(2);

	data.add("b");
	await passTime();
	assertBody('"size=2 hasA=true hasB=true"');
	expect(cnt).toBe(2);

	data.delete("a");
	await passTime();
	assertBody('"size=1 hasA=false hasB=true"');
	expect(cnt).toBe(3);

	data.clear();
	await passTime();
	assertBody('"size=0 hasA=false hasB=false"');
	expect(cnt).toBe(4);
});

test("Set proxy supports iteration methods", async () => {
	const data = A.proxy(new Set(["c", "a"]));
	let cnt = 0;

	A(() => {
		cnt++;
		const keys = Array.from(data.keys()).join(",");
		const values = Array.from(data.values()).join(",");
		const entries = Array.from(data.entries()).map(([a, b]) => `${a}:${b}`).join(",");
		const iterated = Array.from(data).join(",");
		A({ text: `${keys}|${values}|${entries}|${iterated}` });
	});

	assertBody('"c,a|c,a|c:c,a:a|c,a"');
	expect(cnt).toBe(1);

	data.add("b");
	await passTime();
	assertBody('"c,a,b|c,a,b|c:c,a:a,b:b|c,a,b"');
	expect(cnt).toBe(2);
});

test("A.onEach works with Sets in value order", async () => {
	const data = A.proxy(new Set(["c", "a", "b"]));
	let cnt = 0;

	A.onEach(data, (value) => {
		cnt++;
		A({ text: value });
	});

	assertBody('"a" "b" "c"');
	expect(cnt).toBe(3);

	data.add("d");
	await passTime();
	assertBody('"a" "b" "c" "d"');
	expect(cnt).toBe(4);

	data.delete("a");
	await passTime();
	assertBody('"b" "c" "d"');
	expect(cnt).toBe(4);

	data.add("a");
	await passTime();
	assertBody('"a" "b" "c" "d"');
	expect(cnt).toBe(5);
});

test("A.onEach rerenders Set items reactively", async () => {
	const data = A.proxy(new Set([{ name: "a" }, { name: "b" }]));
	let cnt = 0;

	A.onEach(data, (value) => {
		cnt++;
		A({ text: value.name });
	}, (value) => value.name);

	assertBody('"a" "b"');
	expect(cnt).toBe(2);

	const [first] = Array.from(data.values());
	first.name = "aa";
	await passTime();
	assertBody('"aa" "b"');
	expect(cnt).toBe(3);
});

test("A.isEmpty and A.count work with Sets", async () => {
	const data = A.proxy(new Set<string>());
	const count = A.count(data);
	let emptyCnt = 0;

	A(() => {
		emptyCnt++;
		A(A.isEmpty(data) ? "#empty" : "#not empty");
	});
	A("div", { text: count });

	assertBody('"empty" div{"0"}');
	expect(emptyCnt).toBe(1);

	data.add("x");
	await passTime();
	assertBody('"not empty" div{"1"}');
	expect(emptyCnt).toBe(2);

	data.add("y");
	await passTime();
	assertBody('"not empty" div{"2"}');
	expect(emptyCnt).toBe(2);

	data.clear();
	await passTime();
	assertBody('"empty" div{"0"}');
	expect(emptyCnt).toBe(3);
});
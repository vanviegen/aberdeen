import { expect, test } from "bun:test";
import A from "../src/aberdeen";

test('creates regular HTML elements with HTML namespace', () => {
	A('div');
	const div = document.body.firstChild as Element;
	expect(div.tagName).toBe('div');
	expect(div.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
});

test('creates SVG elements with SVG namespace', () => {
	A('svg');
	const svg = document.body.firstChild as Element;
	expect(svg.tagName).toBe('svg');
	expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
});

test('creates SVG child elements with SVG namespace', () => {
	A('svg', () => {
		A('circle', {cx: 50, cy: 50, r: 40});
	});
	
	const svg = document.body.firstChild as Element;
	const circle = svg.firstChild as Element;
	
	expect(svg.tagName).toBe('svg');
	expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(circle.tagName).toBe('circle');
	expect(circle.namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(circle.getAttribute('cx')).toBe('50');
	expect(circle.getAttribute('cy')).toBe('50');
	expect(circle.getAttribute('r')).toBe('40');
});

test('Works with chained tags', () => {
	A('div', 'svg', 'circle', {cx: 50, cy: 50, r: 40}, ':Test');
	
	const div = document.body.firstChild as Element;
	const svg = div.firstChild as Element;
	const circle = svg.firstChild as Element;
	
	expect(div.tagName).toBe('div');
	expect(div.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
	expect(svg.tagName).toBe('svg');
	expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(circle.tagName).toBe('circle');
	expect(circle.namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(circle.getAttribute('cx')).toBe('50');
	expect(circle.getAttribute('cy')).toBe('50');
	expect(circle.getAttribute('r')).toBe('40');
});

test('creates nested SVG elements with SVG namespace', () => {
	A('svg', () => {
		A('g', () => {
			A('rect', {x: 10, y: 10, width: 50, height: 30});
			A('text', () => A('#Hello SVG'));
		});
	});
	
	const svg = document.body.firstChild as Element;
	const g = svg.firstChild as Element;
	const rect = g.firstChild as Element;
	const text = rect.nextSibling as Element;
	
	expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(g.namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(rect.namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(text.namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(text.textContent).toBe('Hello SVG');
});

test('mixes HTML and SVG correctly', () => {
	A('div', () => {
		A('h1#Title');
		A('svg', () => {
			A('circle', {cx: 25, cy: 25, r: 20});
		});
		A('p#Description');
	});
	
	const div = document.body.firstChild as Element;
	const h1 = div.firstChild as Element;
	const svg = h1.nextSibling as Element;
	const circle = svg.firstChild as Element;
	const p = svg.nextSibling as Element;
	
	expect(div.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
	expect(h1.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
	expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(circle.namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(p.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
});

test('handles SVG within A.onEach', () => {
	const points = A.proxy([{x: 10, y: 10}, {x: 20, y: 30}]);
	
	A('svg', () => {
		A.onEach(points, (point) => {
			A('circle', {cx: point.x, cy: point.y, r: 5});
		});
	});
	
	const svg = document.body.firstChild as Element;
	const circles = svg.querySelectorAll('circle');
	
	expect(circles.length).toBe(2);
	expect(circles[0].namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(circles[1].namespaceURI).toBe('http://www.w3.org/2000/svg');
});

test('returns back to HTML namespace after SVG', () => {
	A('div', () => {
		A('svg', () => {
			A('circle');
		});
	});
	
	// Add another div after the first one
	A('div');
	
	const firstDiv = document.body.firstChild as Element;
	const svg = firstDiv.firstChild as Element;
	const circle = svg.firstChild as Element;
	const secondDiv = document.body.lastChild as Element;
	
	expect(firstDiv.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
	expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(circle.namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(secondDiv.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
});

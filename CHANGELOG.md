# Changelog

### 1.6.0 (2026-01-22)

**Breaking changes:**
- CSS variable syntax changed from `@name` to `$name` (e.g., `$('div bg:$primary')` instead of `bg:@primary`). The `$` prefix is clearer for variables and avoids potential conflicts with CSS @ rules.
- We no longer automatically insert size variables into `cssVars`. Instead, you can now call `setSpacingCssVars()` to initialize `cssVars[0]` through `cssVars[12]` with a customizable exponential spacing scale.

**New features:**
- **`darkMode()`**: Reactive function that returns `true` when the browser prefers dark mode. Automatically re-executes scopes when the system preference changes, making it easy to implement theme switching.

**Fixes:**
- Fixed `copy()` not triggering `isEmpty()` reactivity when clearing objects/Maps. Previously, using `copy(obj, {})` would delete all keys but wouldn't notify observers that the object became empty.


### 1.5.1 (2026-01-21)
**Enhancements:**
- The (AI agent) 'skill/' directory is now auto-generated based on the Tutorial and API reference, to prevent docs duplication.

### 1.5.0 (2026-01-20)

**Breaking changes:**
- CSS variable syntax `@name` now outputs native `var(--name)` instead of resolving values at render time. This improves performance and interoperability with other CSS features. The API remains unchanged, but in edge cases you may see somewhat different behavior.

### 1.4.2 (2026-01-15)

**Enhancements:**
- Improved TypeScript type definitions for the `peek` function.

**Documentation:**
- Extracted changelog from README.md into a separate CHANGELOG.md file.

### 1.4.1 (2026-01-14)

**Additions:**
- Created an AI agent Skill (Claude Code, GitHub Copilot) for using Aberdeen in your projects.

**Enhancements:**
- The `html-to-aberdeen` tool now automatically converts `style` attributes to Aberdeen's CSS shortcuts (like `mt:10px` for `margin-top: 10px`) and uses the modern `#text` syntax.

**Fixes:**
- Fixed an issue in `docs/live-code.js` where it was still trying to import the removed `observe` function.

### 1.4.0 (2025-01-07)

**Enhancements:**
- Shortcuts for common CSS properties. For instance: `$('div mv:10px')` for setting vertical (top and bottom) margins.
- Variables you can set and use in CSS styles, e.g. `$('div bg:@myColor')` after setting `cssVars.myColor = 'red'`.
- Default CSS variables are defined for spacing: `@2` is `0.5rem`, `@3` is `1rem`, etc. For example: `$('r:@3')` sets border radius to (a dynamically configurable) `1rem`.
- All CSS shortcuts and `@` variables are also supported in `insertCss` and `insertGlobalCss`.
- Added `insertGlobalCss` for adding global styles. The `global` argument to `insertCss` is now deprecated.

**Fixes:**
- When doing `$('div #first', () => $('#second'))`, *second* now comes after *first*. It used to be the other way around.

### 1.3.2 (2025-01-07)

**Enhancements:**
- It's now okay to first define a SELECT binding and then add its OPTIONs right after, while still allowing the binding to set the initial value. This used to throw an async error.

**Fixes:**
- Turns out some examples were still using old text content syntax.

### 1.3.1 (2025-01-07)
**Fixes:**
- Argument types accepted by `$` were too restrictive, as something like `$('prop=', myVal)` should be able to accept any type for `myVal`.

### 1.3.0 (2025-12-03)
**Breaking changes:**
- The shortcut for setting inline CSS styles in now `$('div color:red')` instead of `$('div $color=red')`.
- The shortcut for adding text content is now `$('p#Hello')` instead of `$('p:Hello')`. It now also works with dynamic content: `$('p#', myObservable)`.

**Enhancements:**
- New A() string parser, reducing complexity and line count.

### 1.2.0 (2025-09-27)

**Enhancements:**
- The `$` function now supports a more concise syntax for setting attributes and properties. Instead of writing `$('p', 'button', {$color: 'red', click: () => ...})`, you can now write `$('p button $color=red click=', () => ...)`.
- The `proxy()` function can now accept `Promise`s, which will return an observable object with properties for `busy` status, `error` (if any), and the resolved `value`. This makes it easier to call async functions from within UI code.

**Breaking changes:**
- When a UI render function returns a `Promise`, that will now be reported as an error. Async render functions are fundamentally incompatible with Aberdeen's reactive model, so it's helpful to point that out. Use the new `proxy()` async support instead.

### 1.1.0 (2025-09-12)

This major release aims to reduce surprises in our API, aligning more closely with regular JavaScript semantics (for better or worse).

**Breaking changes:**

- Functions that iterate objects (like `onEach` and `map`) will now only work on *own* properties of the object, ignoring those in the prototype chain. The new behavior should be more consistent and faster.
- These iteration function now properly distinguish between `undefined` and *empty*. Previously, object/array/map items with `undefined` values were considered non-existent. The new behavior (though arguably confusing) is more consistent with regular JavaScript semantics.
- The `copy` function no longer ..
    - Supports `SHALLOW` and `MERGE` flags. The latter has been replaced by a dedicated `merge` function. The former turned out not to be particularly useful.
    - Has weird special cases that would allow copying objects into maps and merging objects into arrays.
    - Copies properties from the prototype chain of objects. Only *own* properties are copied now. As the prototype link itself *is* copied over, this should actually result in copies being *more* similar to the original.
- The `observe` function has been renamed to `derive` to better reflect its purpose and match terminology used in other reactive programming libraries.
- The `$({element: myElement})` syntax for inserting existing DOM elements has been removed. Use `$(myElement)` instead.
- The `route` API brings some significant changes. Modifying the `route` observable (which should now be accessed as `route.current`) will now always result in changing the current browser history item (URL and state, using `replaceState`), instead of using a heuristic to figure out what you probably want. Dedicated functions have been added for navigating to a new URL (`go`), back to a previous URL (`back`), and for going up in the route hierarchy (`up`).
- The concept of immediate observers (through the `immediateObserve` function) no longer exists. It caused unexpected behavior (for instance due to the fact that an array `pop()` in JavaScript is implemented as a delete followed by a length change, so happens in two steps that would each call immediate observers). The reason it existed was mostly to enable a pre-1.0 version of the `route` API. It turned out to be a mistake.

**Enhancements:**

- The `peek` function can no also accept an object and a key as argument (e.g. `peek(obj, 'myKey')`). It does the same as `peek(() => obj.myKey)`, but more concise and faster.
- The `copy` and `merge` functions now ..
    - Accept an optional `dstKey` argument, allowing you to assign to a specific key with `copy` semantics, and without subscribing to the key.
    - Return a boolean indicating whether any changes were made.
    - Are faster.
- A new `dispatcher` module has been added. It provides a simple and type-safe way to match URL paths to handler functions, and extract parameters from the path. You can still use your own routing solution if you prefer, of course.
- The `route` module now also has tests, making the whole project now fully covered by tests.

**Fixes:**

- Browser-back behavior in the `route` module had some reliability issues after page reloads.
- The `copy` and `clone` function created Maps and Arrays with the wrong internal type. So `instanceof Array` would say yes, while `Array.isArray` would say no. JavaScript is weird.

### 1.0.0 (2025-05-07)

After five years of working on this library on and off, I'm finally happy with its API and the developer experience it offers. I'm calling it 1.0! To celebrate, I've created some pretty fancy (if I may say so myself) interactive documentation and a tutorial.

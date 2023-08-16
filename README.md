Aberdeen
--------

A TypeScript/JavaScript library for quickly building performant declarative user interfaces *without* the use of a virtual DOM.

The key insight is the use of many small anonymous functions, that will automatically rerun when the underlying data changes. In order to trigger updates, that data should be encapsulated in any number of `Store` objects. They can hold anything, from simple values to deeply nested data structures, in which case user-interface functions can (automatically) subscribe to just the parts they depend upon.


## Why use Aberdeen?

- It provides a flexible and simple to understand model for reactive user-interface building.
- It allows you to express user-interfaces in plain JavaScript (or TypeScript) in an easy to read form, without (JSX-like) compilation steps.
- It's fast, as it doesn't use a *virtual DOM* and only reruns small pieces of code in response to updated data.
- It's lightweight, at less than 15kb when minimized.

Aberdeen
--------

A TypeScript/JavaScript library for quickly building performant declarative user interfaces *without* the use of a virtual DOM.

The key insight is the use of many small anonymous functions, that will automatically rerun when the underlying data changes. In order to trigger updates, that data should be encapsulated in any number of `Store` objects. They can hold anything, from simple values to deeply nested data structures, in which case user-interface functions can (automatically) subscribe to just the parts they depend upon.


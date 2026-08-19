# Gem Incremental Code Style

The source files in this project intentionally use readable, conventional code instead of minified one-line implementations.

## JavaScript

- Prefer named functions for behavior that is reused or has a meaningful responsibility.
- Use one statement per line.
- Keep object literals and arrays expanded when they contain configurable game data.
- Use descriptive variable names rather than short generated names.
- Keep UI event handlers small and move database/API work into named functions.
- Keep Edge Functions unchanged unless a server-side fix is required.

## CSS

- One declaration per line.
- Group related selectors under a named section comment.
- Use existing variables/tokens before introducing new hard-coded values.

## HTML

- Keep interactive controls on separate lines.
- Use semantic sections and descriptive IDs.
- Avoid large inline styles; shared styling belongs in CSS.

## Feature Lab

The Admin Panel owns the Upcoming/Feature Lab interface. The old standalone `/upcoming/` files remain in the repository as a compatibility route, but they are no longer added to the main navigation.

# Project Rules

## Decision Rule

- Always prioritize long-term project quality over short-term convenience.
- Do not preserve backward compatibility when it conflicts with a cleaner architecture.
- Prefer breaking changes over compatibility layers, shims, and transitional code.
- Remove obsolete code paths instead of keeping dual implementations alive.
- Keep APIs, storage schema, and component boundaries explicit and simple.

## Implementation Expectations

- Favor clear provider abstractions over one-off conditional logic.
- Keep frontend state derived and normalized; avoid duplicated state.
- Treat third-party API failures as first-class product behavior with explicit errors.
- When a dependency or framework no longer fits the architecture, replace it directly instead of wrapping it.

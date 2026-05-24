# Explanation

The explanation section is **understanding-oriented**. These articles discuss *why* the library is designed the way it is — the reasoning behind decisions, the trade-offs considered, and the mental models that make everything fit together. You do not need to read these to use the library, but they will help you extend it confidently.


## Contents

### [Architecture](./architecture)

How the four-layer structure (`types → states/guards → core → visualization`) enforces unidirectional dependencies and prevents the invisible coupling that turns into architectural debt.

### [Fixed-point engine](./fixed-point-engine)

How the engine resolves `ForkState` activations and `JoinState` thresholds in a single tick using a fixed-point loop, and why this matters for nested parallel branches.

### [Design decisions](./design-decisions)

Why Zod is the single source of truth for types, why every error is thrown rather than returned, why persistence is purely functional, and why the engine has no I/O.

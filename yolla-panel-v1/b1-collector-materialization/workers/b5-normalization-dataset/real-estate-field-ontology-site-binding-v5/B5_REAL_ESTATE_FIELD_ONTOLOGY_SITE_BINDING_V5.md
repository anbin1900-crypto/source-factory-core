# B-5 Real-Estate Field Ontology and Site Binding V5

This fixture-first package refines the Cycle 4 blueprint into application-level real-estate candidates without claiming D canonical authority.

It preserves every observed source field and its `label`, `name`, `options`, `unit`, and `validation`, then binds it to one of six candidates: `sale_price`, `deposit`, `monthly_rent`, `exclusive_area`, `floor`, or `direction`. Read transforms remain candidates; unobserved write transforms and business rules remain `UNKNOWN`.

The materializer creates three versioned datasets, two append-only checkpoints, a contextless readback pointer, and an idempotent duplicate-materialization result.

Boundaries: no target-PC execution, live-site call, production connection, D canonical schema decision, ready transition, or merge.

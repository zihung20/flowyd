# Examples

Each example is a complete, runnable TypeScript file demonstrating a different combination of workflow features. All code is copy-pasteable.

| Example                                                   | Key features                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [Purchase Order Approval](./approval-flow)                | Linear flow, typed Zod payloads, named guards, `getSnapshot` / `restoreInstance`     |
| [Engineer Pre-Departure Checklist](./parallel-inspection) | `ForkState`, `JoinState mode:'all'`, inline guard with Zod literal                   |
| [OCC Service Disruption SOP](./disruption-sop)            | Multi-role named guards, fork + join + wait state combined, `JsonGraphExporter`      |
| [Station Opening Checklist](./station-opening)            | Sequential flow, `canExecute` for UI affordances, snapshot hand-off / crash recovery |

## How to run an example locally

Three of these examples ship as standalone runnable files in `flowyd/examples/`:

| Example                          | File                                          |
| -------------------------------- | --------------------------------------------- |
| Engineer Pre-Departure Checklist | `examples/engineer-predeparture-checklist.ts` |
| OCC Service Disruption SOP       | `examples/occ-disruption-sop.ts`              |
| Station Opening Checklist        | `examples/station-opening-checklist.ts`       |

```sh
cd flowyd
pnpm build
npx tsx examples/occ-disruption-sop.ts
```

The **Purchase Order Approval** example is the canonical introductory walkthrough — its full source is inline on [its page](./approval-flow) and in the [Installation quick start](../guide/installation), so it has no separate file.

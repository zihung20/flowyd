---
layout: home

hero:
  name: flowyd
  text: Strongly-typed SOP state machines
  tagline: Build, execute, and visualize workflow state machines in TypeScript — with compile-time safety on every state ID, action name, and payload shape.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/
    - theme: alt
      text: Interactive Playground
      link: https://zihung20.github.io/flowyd/playground/
    - theme: alt
      text: See Examples
      link: /examples/
    - theme: alt
      text: API Reference
      link: /api/

features:
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>'
    title: Compile-time type safety
    details: Every state ID, action name, and payload field is checked by TypeScript. Typos and wrong shapes are caught before your code runs.

  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>'
    title: Zod-validated at runtime
    details: Each action payload is validated against its Zod schema before any transition fires. The same schema drives both the TypeScript type and the runtime check — no duplication.

  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/></svg>'
    title: Parallel branches
    details: ForkState fans out to concurrent steps; JoinState synchronises them with "all", "any", or a quorum threshold — resolved in a single engine tick.

  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/><path d="M6.38 18.7 4 21"/><path d="M17.64 18.67 20 21"/></svg>'
    title: Deadlines &amp; SLAs
    details: Time-triggered transitions escalate, auto-cancel, or give up on a stalled branch after a delay. The host owns the clock — the engine never reads it, so runs stay pure and replayable.

  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg>'
    title: External wait states
    details: WaitState pauses the workflow until your service layer signals completion. The engine has no I/O, no polling, no callbacks.

  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>'
    title: Purely functional persistence
    details: getSnapshot() produces plain JSON. restoreInstance(snapshot) reconstructs exact state. You own the database — the library owns nothing.

  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>'
    title: Built-in visualization
    details: Export to Mermaid stateDiagram-v2 or a JSON graph for React Flow, D3, or Cytoscape — with live status overlays.
---

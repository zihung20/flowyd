import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid(
  defineConfig({
  title: 'flowyd',
  description: 'Strongly-typed SOP state machines for TypeScript',
  head: [
    ['meta', { name: 'google-site-verification', content: 'RMk-txaZr_tYD6l3zxvw2QtOe-DrkOQoUrV-FfU22Eg' }]
  ],
  base: '/flowyd/',
  cleanUrls: true,
  // Generated diagram partials are included into example pages, not built as their own pages.
  srcExclude: ['**/diagrams/*.md'],
  // `withMermaid` adds Mermaid's CommonJS deps (dayjs, cytoscape, etc.) to
  // optimizeDeps.include, but pnpm doesn't hoist those transitive deps where Vite
  // can resolve them — so `docs:dev` failed with "does not provide an export named
  // 'default'". The fix is installing them as direct devDependencies (see
  // package.json); this block only reinforces the SSR/pre-bundle handling.
  vite: {
    optimizeDeps: { include: ['mermaid', 'dayjs'] },
    ssr: { noExternal: ['mermaid'] },
  },
  themeConfig: {
    logo: '/logo.svg',
    outline: { level: [2, 3], label: 'On this page' },
    nav: [
      {
        text: 'User Guide',
        items: [
          { text: 'Introduction', link: '/guide/' },
          { text: 'Examples', link: '/examples/' },
          { text: 'Scenarios', link: '/scenarios/' },
          { text: 'API Reference', link: '/api/' },
        ],
      },
      { text: 'Developer Guide', link: '/dev/' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'User Guide',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Core Concepts', link: '/guide/concepts' },
            { text: 'Installation', link: '/guide/installation' },
          ],
        },
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Overview', link: '/examples/' },
            { text: '01 · Document Approval (Basics)', link: '/examples/basics' },
            { text: '02 · Guards & Context', link: '/examples/guards-and-context' },
            { text: '03 · Parallel Work (Fork/Join)', link: '/examples/parallel-fork-join' },
            { text: '04 · Deadlines, Hooks & Waiting', link: '/examples/deadlines-hooks-wait' },
            { text: '05 · Loan Origination', link: '/examples/loan-origination' },
            { text: '06 · Incident Response', link: '/examples/incident-response' },
            { text: '07 · Dynamic Workflow', link: '/examples/dynamic-workflow' },
          ],
        },
      ],
      '/scenarios/': [
        {
          text: 'Scenarios',
          items: [
            { text: 'Overview', link: '/scenarios/' },
            { text: 'Define a sequential flow', link: '/scenarios/sequential-flow' },
            { text: 'Run steps in parallel', link: '/scenarios/parallel-branches' },
            { text: 'Add deadlines and escalation', link: '/scenarios/timeouts' },
            { text: 'Wait for an external signal', link: '/scenarios/external-wait' },
            { text: 'Run side effects on enter/exit', link: '/scenarios/hooks' },
            { text: 'Add guards to transitions', link: '/scenarios/guards' },
            { text: 'Save and restore state', link: '/scenarios/persistence' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'WorkflowBuilder', link: '/api/workflow-builder' },
            { text: 'WorkflowInstance', link: '/api/workflow-instance' },
            { text: 'State Types', link: '/api/state-types' },
            { text: 'Guards', link: '/api/guards' },
            { text: 'Visualization', link: '/api/visualization' },
          ],
        },
      ],
      '/dev/': [
        {
          text: 'Developer Guide',
          items: [
            { text: 'Overview', link: '/dev/' },
            { text: 'Architecture', link: '/dev/architecture' },
            { text: 'Fixed-Point Engine', link: '/dev/engine' },
            { text: 'Design Decisions', link: '/dev/decisions' },
            { text: 'Contributing', link: '/dev/contributing' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/zihung20/flowyd' }],

    footer: {
      message: 'Released under the MIT License.',
    },

    search: {
      provider: 'local',
    },
  },
  }),
);

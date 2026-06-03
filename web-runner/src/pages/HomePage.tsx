import { Link } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';
import { setupMonacoTypes } from '../designer/code/monacoSetup';
import purchaseOrderSource from '../workflows/purchase-order.ts?raw';

const FEATURES = [
  {
    icon: '⬡',
    title: 'Compile-time type safety',
    desc: 'State IDs, action names, and payload shapes are all checked at build time. Typos in addTransition are compile errors.',
  },
  {
    icon: '⑂',
    title: 'Fork / Join parallelism',
    desc: 'Split into parallel branches with ForkState and synchronise them with JoinState. All/any/quorum modes supported.',
  },
  {
    icon: '⊕',
    title: 'Composable guards',
    desc: 'Inline guards, injected guards, and combinators (and, or, not). Async-first — every guard returns Promise<boolean>.',
  },
  {
    icon: '◑',
    title: 'Pure stateless engine',
    desc: 'WorkflowEngine.dispatch() is a static function. No I/O. Snapshots are plain JSON — persist anywhere.',
  },
];

const EXAMPLES = [
  {
    id: 'purchase-order',
    label: 'Purchase Order',
    tags: ['linear', 'branching', 'guard'],
    desc: 'Linear approval chain with guard-protected APPROVE and reject terminal split.',
    color: 'border-blue-200 bg-blue-50',
    tagColor: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'predeparture',
    label: 'Pre-Departure Checklist',
    tags: ['fork', 'join', 'parallel'],
    desc: '3 parallel inspection branches that must all complete before the engineer may depart.',
    color: 'border-violet-200 bg-violet-50',
    tagColor: 'bg-violet-100 text-violet-700',
  },
  {
    id: 'incident',
    label: 'IT Incident Response',
    tags: ['inline guard', 'inject guard'],
    desc: 'Inline payload guards + a named injected guard for management sign-off.',
    color: 'border-green-200 bg-green-50',
    tagColor: 'bg-green-100 text-green-700',
  },
  {
    id: 'ewcr',
    label: 'EWCR Grid',
    tags: ['multi-instance', 'cross-guard'],
    desc: '40 electrical sections — each waits for its neighbours before isolating or restoring.',
    color: 'border-amber-200 bg-amber-50',
    tagColor: 'bg-amber-100 text-amber-700',
  },
] as const;

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Nav */}
      <nav className="sticky top-0 z-40 flex h-12 items-center gap-6 border-b border-slate-100 bg-white/90 px-6 backdrop-blur">
        <span className="text-base font-bold tracking-tight text-slate-900">flowyd</span>
        <div className="ml-auto flex items-center gap-5">
          <Link
            to="/examples/purchase-order"
            className="text-sm text-slate-500 transition-colors hover:text-slate-800"
          >
            Examples
          </Link>
          <Link
            to="/designer"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white transition-colors hover:bg-slate-700"
          >
            Open Designer
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-slate-900 px-6 pt-20 pb-16 text-white">
        <div className="mx-auto max-w-5xl">
          <div className="max-w-2xl">
            <h1 className="mb-4 text-4xl leading-tight font-bold tracking-tight">
              Typed Workflow State
              <br />
              Machines for TypeScript
            </h1>
            <p className="mb-8 text-lg leading-relaxed text-slate-400">
              Build, execute, and visualise auditable multi-step workflows with full compile-time
              type safety. Pure functional engine, serialisable snapshots, composable guards.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/examples/purchase-order"
                className="rounded-md bg-white px-5 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
              >
                View Examples
              </Link>
              <Link
                to="/designer"
                className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                Open Designer →
              </Link>
            </div>
          </div>

          {/* Code snippet */}
          <div className="mt-12 overflow-hidden rounded-xl border border-slate-700">
            <div className="flex h-9 items-center gap-2 border-b border-slate-700 bg-[#1e1e1e] px-4">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 opacity-70" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500 opacity-70" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-500 opacity-70" />
              <span className="ml-2 font-mono text-[11px] text-slate-500">purchase-order.ts</span>
            </div>
            <div style={{ height: 380 }}>
              <Editor
                path="file:///purchase-order-preview.ts"
                language="typescript"
                value={purchaseOrderSource}
                theme="vs-dark"
                beforeMount={(monaco: Monaco) => setupMonacoTypes(monaco)}
                options={{
                  readOnly: true,
                  fontSize: 12.5,
                  fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", Menlo, monospace',
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  lineNumbers: 'on',
                  renderLineHighlight: 'none',
                  wordWrap: 'off',
                  tabSize: 2,
                  padding: { top: 12, bottom: 12 },
                  automaticLayout: true,
                  scrollbar: { verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
                  hover: { enabled: true },
                  fixedOverflowWidgets: true,
                  folding: false,
                  glyphMargin: false,
                  contextmenu: false,
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-slate-100 bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-8 text-xl font-bold text-slate-800">Features</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-5">
                <span className="mb-3 block text-2xl">{f.icon}</span>
                <h3 className="mb-1.5 text-sm font-semibold text-slate-800">{f.title}</h3>
                <p className="text-xs leading-relaxed text-slate-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Examples */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex items-baseline justify-between">
            <h2 className="text-xl font-bold text-slate-800">Examples</h2>
            <Link to="/examples/purchase-order" className="text-sm text-blue-600 hover:underline">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {EXAMPLES.map((ex) => (
              <Link
                key={ex.id}
                to={`/examples/${ex.id}`}
                className={`block rounded-xl border-2 p-5 transition-shadow hover:shadow-md ${ex.color}`}
              >
                <h3 className="mb-1 text-base font-semibold text-slate-800">{ex.label}</h3>
                <p className="mb-3 text-sm leading-relaxed text-slate-600">{ex.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {ex.tags.map((t) => (
                    <span
                      key={t}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ex.tagColor}`}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Designer CTA */}
      <section className="bg-slate-900 px-6 py-16 text-white">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="mb-2 text-2xl font-bold">Visual Workflow Designer</h2>
            <p className="max-w-md text-sm text-slate-400">
              Drag and connect states, edit the TypeScript code — the canvas and code stay in sync.
              Full IntelliSense powered by Monaco Editor.
            </p>
          </div>
          <Link
            to="/designer"
            className="shrink-0 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            Open Designer →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 px-6 py-6 text-center text-xs text-slate-400">
        flowyd — MIT licence
      </footer>
    </div>
  );
}

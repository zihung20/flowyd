import { Link } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';
import type { LucideIcon } from 'lucide-react';
import { ShieldCheck, GitFork, GitBranch, Workflow } from 'lucide-react';
import { setupMonacoTypes } from '../designer/code/monacoSetup';
import { SiteNav } from '../components/SiteNav';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import purchaseOrderSource from '../workflows/purchase-order.ts?raw';

const FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: ShieldCheck,
    title: 'Compile-time type safety',
    desc: 'State IDs, action names, and payload shapes are all checked at build time. Typos in addTransition are compile errors.',
  },
  {
    icon: GitFork,
    title: 'Fork / Join parallelism',
    desc: 'Split into parallel branches with ForkState and synchronise them with JoinState. All/any/quorum modes supported.',
  },
  {
    icon: GitBranch,
    title: 'Composable guards',
    desc: 'Inline guards, injected guards, and combinators (and, or, not). Async-first — every guard returns Promise<boolean>.',
  },
  {
    icon: Workflow,
    title: 'Pure stateless engine',
    desc: 'WorkflowEngine.dispatch() is a static function. No I/O. Snapshots are plain JSON — persist anywhere.',
  },
];

const EXAMPLES = [
  {
    id: 'purchase-order',
    label: 'Purchase Order',
    tags: ['linear', 'branching', 'guard'] as const,
    desc: 'Linear approval chain with guard-protected APPROVE and reject terminal split.',
    badgeVariant: 'blue' as const,
  },
  {
    id: 'predeparture',
    label: 'Pre-Departure Checklist',
    tags: ['fork', 'join', 'parallel'] as const,
    desc: '3 parallel inspection branches that must all complete before the engineer may depart.',
    badgeVariant: 'violet' as const,
  },
  {
    id: 'incident',
    label: 'IT Incident Response',
    tags: ['inline guard', 'inject guard'] as const,
    desc: 'Inline payload guards + a named injected guard for management sign-off.',
    badgeVariant: 'green' as const,
  },
] as const;

export default function HomePage() {
  return (
    <div className="bg-background min-h-screen font-sans">
      <div className="sticky top-0 z-40">
        <SiteNav />
      </div>

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
              <Button asChild size="lg" className="bg-white text-slate-900 hover:bg-slate-100">
                <Link to="/examples/purchase-order">Try Examples →</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-slate-600 text-slate-300 hover:border-slate-400 hover:bg-transparent hover:text-white"
              >
                <Link to="/designer">Open Designer</Link>
              </Button>
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
      <section className="border-border bg-muted/40 border-b px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-foreground mb-8 text-xl font-bold">Features</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <Card key={f.title} className="gap-3 py-5">
                <CardHeader className="px-5 pb-0">
                  <f.icon className="text-muted-foreground h-5 w-5" strokeWidth={1.75} />
                  <CardTitle className="text-sm">{f.title}</CardTitle>
                </CardHeader>
                <CardContent className="px-5">
                  <CardDescription className="text-xs leading-relaxed">{f.desc}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Examples */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex items-baseline justify-between">
            <h2 className="text-foreground text-xl font-bold">Examples</h2>
            <Link
              to="/examples/purchase-order"
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {EXAMPLES.map((ex) => (
              <Link key={ex.id} to={`/examples/${ex.id}`} className="group block">
                <Card className="gap-3 py-5 transition-shadow group-hover:shadow-md">
                  <CardHeader className="px-5 pb-0">
                    <CardTitle className="text-base">{ex.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 px-5">
                    <CardDescription className="text-sm leading-relaxed">{ex.desc}</CardDescription>
                    <div className="flex flex-wrap gap-1.5">
                      {ex.tags.map((t) => (
                        <Badge key={t} variant={ex.badgeVariant}>
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
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
          <Button asChild size="lg" className="shrink-0 bg-blue-600 text-white hover:bg-blue-500">
            <Link to="/designer">Open Designer →</Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-border text-muted-foreground border-t px-6 py-6 text-center text-xs">
        flowyd — MIT licence
      </footer>
    </div>
  );
}

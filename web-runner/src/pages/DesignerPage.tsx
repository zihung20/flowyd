import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';

import { DesignerCanvas } from '../designer/canvas/DesignerCanvas';
import { NodePanel } from '../designer/panels/NodePanel';
import { EdgePanel } from '../designer/panels/EdgePanel';
import { SingleRunner } from '../runners/SingleRunner';
import { ShowCodeModal } from '../designer/code/ShowCodeModal';

import { useDesignerWorkflow } from '../designer/hooks/useDesignerWorkflow';
import { useRunState } from '../designer/hooks/useRunState';
import { useTheme } from '../context/ThemeContext';

import type { DesignerWorkflow, DesignerNode, DesignerEdge, Selection } from '../designer/types';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { SchemaEditor } from '../designer/code/SchemaEditor';

export default function DesignerPage() {
  const { workflow, setWorkflow, resetToDefault } = useDesignerWorkflow();
  const [selection, setSelection] = useState<Selection>({ type: 'none' });
  const [showCode, setShowCode] = useState(false);
  const { runState, setRunState, handleRun } = useRunState();
  const { theme, toggleTheme } = useTheme();

  const handleWorkflowChange = useCallback(
    (wf: DesignerWorkflow) => {
      setWorkflow(wf);
    },
    [setWorkflow],
  );

  // ── Selection-driven panel edits ─────────────────────────────────────────

  const selectedNode =
    selection.type === 'node' ? (workflow.nodes.find((n) => n.id === selection.id) ?? null) : null;
  const selectedEdge =
    selection.type === 'edge' ? (workflow.edges.find((e) => e.id === selection.id) ?? null) : null;

  function handleNodeChange(updated: DesignerNode) {
    const oldId = selection.type === 'node' ? selection.id : updated.id;
    const nodes = workflow.nodes.map((n) => (n.id === oldId ? updated : n));
    const edges =
      updated.id !== oldId
        ? workflow.edges.map((e) => ({
            ...e,
            fromNodeId: e.fromNodeId === oldId ? updated.id : e.fromNodeId,
            toNodeId: e.toNodeId === oldId ? updated.id : e.toNodeId,
          }))
        : workflow.edges;
    if (updated.id !== oldId && selection.type === 'node')
      setSelection({ type: 'node', id: updated.id });
    handleWorkflowChange({ ...workflow, nodes, edges });
  }

  function handleEdgeChange(updated: DesignerEdge) {
    handleWorkflowChange({
      ...workflow,
      edges: workflow.edges.map((e) => (e.id === updated.id ? updated : e)),
    });
  }

  function handleDeleteNode() {
    if (selection.type !== 'node') return;
    const id = selection.id;
    handleWorkflowChange({
      ...workflow,
      nodes: workflow.nodes.filter((n) => n.id !== id),
      edges: workflow.edges.filter((e) => e.fromNodeId !== id && e.toNodeId !== id),
    });
    setSelection({ type: 'none' });
  }

  function handleDeleteEdge() {
    if (selection.type !== 'edge') return;
    handleWorkflowChange({
      ...workflow,
      edges: workflow.edges.filter((e) => e.id !== selection.id),
    });
    setSelection({ type: 'none' });
  }

  function handleSchemaChange(actionName: string, body: string) {
    handleWorkflowChange({
      ...workflow,
      actionSchemas: { ...workflow.actionSchemas, [actionName]: body },
    });
  }

  function handleContextSchemaChange(body: string) {
    handleWorkflowChange({ ...workflow, contextSchemaBody: body });
  }

  function handleClickRun() {
    handleRun(workflow);
  }

  const hasPanel = selectedNode !== null || selectedEdge !== null || selection.type === 'settings';
  const isRunning = runState.mode === 'running';

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white font-sans dark:bg-[#0f172a]">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="z-10 flex h-11 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 dark:border-slate-700/60 dark:bg-slate-900">
        <Link
          to="/"
          className="text-sm font-semibold text-slate-500 transition-colors hover:text-slate-800 dark:hover:text-slate-200"
        >
          flowyd
        </Link>
        <span className="text-slate-300 dark:text-slate-700">/</span>
        <input
          className="w-44 border-none bg-transparent text-sm font-medium text-slate-900 placeholder-slate-400 outline-none dark:text-white"
          value={workflow.name}
          onChange={(e) => handleWorkflowChange({ ...workflow, name: e.target.value })}
          placeholder="workflow-name"
        />

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="Reset canvas to default (clears localStorage)"
            onClick={() => {
              resetToDefault();
              setSelection({ type: 'none' });
            }}
          >
            Reset
          </Button>
          <Link
            to="/examples/purchase-order"
            className="text-xs text-slate-500 transition-colors hover:text-slate-700 dark:hover:text-slate-300"
          >
            Examples
          </Link>
          <Button
            variant={selection.type === 'settings' ? 'secondary' : 'outline'}
            size="sm"
            title="Workflow context & settings"
            onClick={() =>
              setSelection((s) => (s.type === 'settings' ? { type: 'none' } : { type: 'settings' }))
            }
          >
            Context
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowCode(true)}>
            {'</>'} Show Code
          </Button>
          {isRunning && (
            <Button variant="secondary" size="sm" onClick={() => setRunState({ mode: 'idle' })}>
              Close
            </Button>
          )}
          <Button
            size="sm"
            className="bg-blue-600 font-medium text-white hover:bg-blue-500"
            onClick={handleClickRun}
          >
            ▶ Run
          </Button>
        </div>
      </header>

      {/* ── Main canvas area ──────────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1">
        <ReactFlowProvider>
          <DesignerCanvas
            workflow={workflow}
            selection={selection}
            onWorkflowChange={handleWorkflowChange}
            onSelectionChange={setSelection}
          />
        </ReactFlowProvider>

        {/* Floating config panel — overlays canvas on the right */}
        {hasPanel && (
          <div className="absolute top-0 right-0 z-10 h-full w-72 overflow-y-auto border-l border-slate-200 bg-white shadow-xl dark:border-slate-700/60 dark:bg-slate-900">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
              <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
                {selection.type === 'settings' ? 'Workflow' : selectedNode ? 'State' : 'Transition'}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="Close panel"
                onClick={() => setSelection({ type: 'none' })}
              >
                ✕
              </Button>
            </div>

            {/* Workflow settings panel */}
            {selection.type === 'settings' && (
              <div className="space-y-3 p-3">
                <div className="space-y-1.5">
                  <Label>Context schema</Label>
                  <p className="text-muted-foreground text-[10px]">
                    Zod object fields for <code className="font-mono">ctx.context</code>. Generates{' '}
                    <code className="font-mono">
                      .setContext(z.object({'{'}...{'}'}))
                    </code>
                    .
                  </p>
                  <SchemaEditor
                    id="context"
                    value={workflow.contextSchemaBody}
                    onChange={handleContextSchemaChange}
                  />
                </div>
              </div>
            )}

            {selectedNode && (
              <NodePanel
                node={selectedNode}
                onChange={handleNodeChange}
                onDelete={handleDeleteNode}
              />
            )}
            {selectedEdge && (
              <EdgePanel
                edge={selectedEdge}
                workflow={workflow}
                onChange={handleEdgeChange}
                onSchemaChange={handleSchemaChange}
                onDelete={handleDeleteEdge}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Run panel ────────────────────────────────────────────────────── */}
      {isRunning && (
        <div className="flex h-72 shrink-0 overflow-hidden border-t border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <SingleRunner
            title={`▶ ${runState.definition.name}`}
            subtitle="Live execution of your designed workflow"
            definition={runState.definition}
            makeInstance={() =>
              (runState as Extract<typeof runState, { mode: 'running' }>).workflow.createInstance(
                `run-${Date.now()}`,
              )
            }
          />
        </div>
      )}

      {runState.mode === 'error' && (
        <div className="flex shrink-0 items-center gap-3 border-t border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-800 dark:bg-red-950">
          <span className="flex-1 text-xs text-red-700 dark:text-red-300">
            ⚠ {runState.message}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-red-400 hover:text-red-600"
            onClick={() => setRunState({ mode: 'idle' })}
          >
            ✕
          </Button>
        </div>
      )}

      {/* ── Show Code modal ──────────────────────────────────────────────── */}
      {showCode && <ShowCodeModal workflow={workflow} onClose={() => setShowCode(false)} />}
    </div>
  );
}

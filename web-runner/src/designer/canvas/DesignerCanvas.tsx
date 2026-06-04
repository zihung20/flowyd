import { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import type { Node, Edge, Connection, NodeChange, EdgeChange, OnConnect } from '@xyflow/react';
import { DesignerToolbar } from './DesignerToolbar';
import { FlowNode } from '../../components/FlowNode';
import type { FlowNodeData } from '../../components/FlowNode';
import { buildFlowEdge } from '../../lib/flowEdgeStyles';
import type { DesignerWorkflow, DesignerNode, DesignerEdge, NodeKind, Selection } from '../types';
import { useTheme } from '../../context/ThemeContext';

const NODE_TYPES = { flowNode: FlowNode };

const POSITIONS_KEY = 'flowyd-positions';

function loadSavedPositions(): Map<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(POSITIONS_KEY);
    if (raw) {return new Map(JSON.parse(raw) as [string, { x: number; y: number }][]);}
  } catch {
    /* ignore */
  }
  return new Map();
}

function savePositions(nodes: Node[]): void {
  const data = nodes.map((n) => [n.id, n.position] as [string, { x: number; y: number }]);
  localStorage.setItem(POSITIONS_KEY, JSON.stringify(data));
}

function wfStructureKey(wf: DesignerWorkflow): string {
  const n = wf.nodes
    .map(
      (n) =>
        `${n.id}:${n.kind}:${n.label}:${n.isInitial ? 1 : 0}:${n.isTerminal ? 1 : 0}:${n.forkTargets.join(',')}`,
    )
    .join('|');
  const e = wf.edges
    .map((e) => `${e.id}:${e.fromNodeId}:${e.toNodeId}:${e.kind}:${e.actionName}`)
    .join('|');
  return `${wf.name}||${n}||${e}`;
}

function designerNodeToFlowData(n: DesignerNode): FlowNodeData {
  return {
    label: n.label || n.id,
    kind: n.kind,
    isInitial: n.isInitial,
    isTerminal: n.isTerminal,
    handles: 'vertical',
    ...(n.id !== n.label ? { sublabel: n.id } : {}),
  };
}

function wfToRfNodes(
  wf: DesignerWorkflow,
  existingPositions: Map<string, { x: number; y: number }>,
  savedPositions: Map<string, { x: number; y: number }>,
): Node[] {
  return wf.nodes.map((n, i) => ({
    id: n.id,
    type: 'flowNode',
    position:
      existingPositions.get(n.id) ??
      savedPositions.get(n.id) ?? { x: 80 + (i % 4) * 220, y: 80 + Math.floor(i / 4) * 140 },
    data: designerNodeToFlowData(n) as unknown as Record<string, unknown>,
  }));
}

function wfToRfEdges(wf: DesignerWorkflow, dark: boolean): Edge[] {
  return wf.edges.map((e) =>
    buildFlowEdge(
      {
        id: e.id,
        from: e.fromNodeId,
        to: e.toNodeId,
        kind: e.kind,
        label: e.actionName || '—',
        dashed: e.kind === 'transition' && e.guardBody.trim() !== '',
      },
      dark,
    ),
  );
}

let nodeCounter = 1;
function makeNewNode(kind: NodeKind, existingIds: Set<string>): DesignerNode {
  let id: string;
  do {
    id = `${kind}-${nodeCounter++}`;
  } while (existingIds.has(id));
  return {
    id,
    kind,
    label: id,
    isInitial: false,
    isTerminal: false,
    forkTargets: [],
    joinMode: 'all',
    waitExternalName: '',
  };
}

interface Props {
  workflow: DesignerWorkflow;
  selection: Selection;
  onWorkflowChange: (wf: DesignerWorkflow) => void;
  onSelectionChange: (sel: Selection) => void;
}

export function DesignerCanvas({
  workflow,
  selection,
  onWorkflowChange,
  onSelectionChange,
}: Props) {
  const { theme } = useTheme();
  const savedPositions = useRef(loadSavedPositions());
  const prevKeyRef = useRef('');

  const [rfNodes, setRfNodes, onRfNodesChange] = useNodesState<Node>([]);
  const [rfEdges, setRfEdges, onRfEdgesChange] = useEdgesState<Edge>([]);

  // Sync from workflow prop whenever the structure changes
  useEffect(() => {
    const key = wfStructureKey(workflow);
    if (key === prevKeyRef.current) {return;}
    prevKeyRef.current = key;

    setRfNodes((prev) => {
      const existingPos = new Map(prev.map((n) => [n.id, n.position]));
      return wfToRfNodes(workflow, existingPos, savedPositions.current);
    });
    setRfEdges(wfToRfEdges(workflow, theme === 'dark'));
  }, [workflow, theme, setRfNodes, setRfEdges]);

  // Reflect selection state via node/edge `selected` flag
  useEffect(() => {
    setRfNodes((prev) =>
      prev.map((n) => ({
        ...n,
        selected: selection.type === 'node' && selection.id === n.id,
      })),
    );
    setRfEdges((prev) =>
      prev.map((e) => ({
        ...e,
        selected: selection.type === 'edge' && selection.id === e.id,
      })),
    );
  }, [selection, setRfNodes, setRfEdges]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onRfNodesChange(changes);

      for (const change of changes) {
        // Save positions when drag ends
        if (change.type === 'position' && change.dragging === false) {
          setRfNodes((current) => {
            savePositions(current);
            savedPositions.current = new Map(current.map((n) => [n.id, n.position]));
            return current;
          });
          break;
        }
        // Handle deletion (Backspace key)
        if (change.type === 'remove') {
          const id = change.id;
          onWorkflowChange({
            ...workflow,
            nodes: workflow.nodes.filter((n) => n.id !== id),
            edges: workflow.edges.filter((e) => e.fromNodeId !== id && e.toNodeId !== id),
          });
          onSelectionChange({ type: 'none' });
          return;
        }
      }
    },
    [workflow, onRfNodesChange, onWorkflowChange, onSelectionChange, setRfNodes],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onRfEdgesChange(changes);
      for (const change of changes) {
        if (change.type === 'remove') {
          onWorkflowChange({
            ...workflow,
            edges: workflow.edges.filter((e) => e.id !== change.id),
          });
          onSelectionChange({ type: 'none' });
          return;
        }
      }
    },
    [workflow, onRfEdgesChange, onWorkflowChange, onSelectionChange],
  );

  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const from = connection.source;
      const to = connection.target;
      if (!from || !to) {return;}
      const sourceNode = workflow.nodes.find((n) => n.id === from);
      const targetNode = workflow.nodes.find((n) => n.id === to);

      let kind: DesignerEdge['kind'];
      if (targetNode?.kind === 'join') {
        kind = 'join-requires';
      } else if (sourceNode?.kind === 'fork') {
        kind = 'fork-target';
      } else {
        kind = 'transition';
      }

      const newEdge: DesignerEdge = {
        id: `e-${from}-${to}-${Date.now()}`,
        fromNodeId: from,
        toNodeId: to,
        kind,
        actionName: kind === 'transition' ? 'ACTION' : '',
        guardBody: '',
      };
      onWorkflowChange({ ...workflow, edges: [...workflow.edges, newEdge] });
      onSelectionChange({ type: 'edge', id: newEdge.id });

      setRfEdges((es) => [
        ...es,
        buildFlowEdge(
          {
            id: newEdge.id,
            from,
            to,
            kind,
            label: kind === 'transition' ? 'ACTION' : '',
          },
          theme === 'dark',
        ),
      ]);
    },
    [workflow, theme, onWorkflowChange, onSelectionChange, setRfEdges],
  );

  const handleAddNode = useCallback(
    (kind: NodeKind) => {
      const ids = new Set(workflow.nodes.map((n) => n.id));
      const node = makeNewNode(kind, ids);
      const pos = {
        x: 120 + (workflow.nodes.length % 4) * 220,
        y: 120 + Math.floor(workflow.nodes.length / 4) * 140,
      };
      onWorkflowChange({ ...workflow, nodes: [...workflow.nodes, node] });
      savedPositions.current.set(node.id, pos);
    },
    [workflow, onWorkflowChange],
  );

  return (
    <div className="relative h-full w-full bg-white dark:bg-[#0f172a]">
      <DesignerToolbar onAddNode={handleAddNode} />
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={NODE_TYPES}
        colorMode={theme}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={(_, node) => onSelectionChange({ type: 'node', id: node.id })}
        onEdgeClick={(_, edge) => onSelectionChange({ type: 'edge', id: edge.id })}
        onPaneClick={() => onSelectionChange({ type: 'none' })}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        deleteKeyCode="Backspace"
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={theme === 'dark' ? '#334155' : '#cbd5e1'}
        />
        <Controls />
      </ReactFlow>

      {workflow.nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
          <p className="text-sm font-medium text-slate-500">Start building</p>
          <p className="text-xs text-slate-600">Use the toolbar above to add states</p>
        </div>
      )}
    </div>
  );
}

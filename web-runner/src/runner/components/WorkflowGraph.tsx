import { useMemo, useRef } from 'react';
import { ReactFlow, Background, BackgroundVariant } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import { JsonGraphExporter } from 'flowyd/visualization';
import type { JsonGraphNode, JsonGraphEdge } from 'flowyd/visualization';
import { FlowNode } from '../../components/FlowNode';
import type { FlowNodeData } from '../../components/FlowNode';
import { buildFlowEdge } from '../../lib/flowEdgeStyles';
import type { JsonGraph } from 'flowyd/visualization';
import { useRunner } from '../context';
import { useTheme } from '../../context/ThemeContext';

const NODE_W = 180;
const NODE_H = 64;

// Object references must be stable — defined outside the component.
const nodeTypes = { flowNode: FlowNode };
const fitViewOptions = { padding: 0.25 };

const H_GAP = 60;
const V_GAP = 28;

/**
 * Compute left-to-right node positions using a longest-path layering algorithm.
 *
 * @param nodes - JsonGraph nodes to lay out.
 * @param edges - JsonGraph edges defining the DAG structure.
 * @returns Map from node ID to top-left `{x, y}` position in pixels.
 */
function computeLayout(
  nodes: JsonGraphNode[],
  edges: JsonGraphEdge[],
): Map<string, { x: number; y: number }> {
  const ids = nodes.map((n) => n.id);

  const outEdges = new Map<string, string[]>(ids.map((id) => [id, []]));
  const inDegree = new Map<string, number>(ids.map((id) => [id, 0]));

  for (const edge of edges) {
    outEdges.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  // Kahn's topological sort
  const remaining = new Map(inDegree);
  const queue = ids.filter((id) => (remaining.get(id) ?? 0) === 0);
  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) {
      break;
    }
    topoOrder.push(id);
    for (const neighbor of outEdges.get(id) ?? []) {
      const deg = (remaining.get(neighbor) ?? 1) - 1;
      remaining.set(neighbor, deg);
      if (deg === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Longest-path layer assignment
  const layer = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const id of topoOrder) {
    const currentLayer = layer.get(id) ?? 0;
    for (const neighbor of outEdges.get(id) ?? []) {
      layer.set(neighbor, Math.max(layer.get(neighbor) ?? 0, currentLayer + 1));
    }
  }

  // Group nodes by layer
  const layerGroups = new Map<number, string[]>();
  for (const id of ids) {
    const l = layer.get(id) ?? 0;
    const group = layerGroups.get(l);
    if (group !== undefined) {
      group.push(id);
    } else {
      layerGroups.set(l, [id]);
    }
  }

  // Assign pixel positions
  const positions = new Map<string, { x: number; y: number }>();
  for (const [l, groupIds] of layerGroups) {
    const totalHeight = groupIds.length * NODE_H + (groupIds.length - 1) * V_GAP;
    const startY = -totalHeight / 2;
    groupIds.forEach((id, row) => {
      positions.set(id, {
        x: l * (NODE_W + H_GAP),
        y: startY + row * (NODE_H + V_GAP),
      });
    });
  }

  return positions;
}

function toFlowNodes(graph: JsonGraph, positions: Map<string, { x: number; y: number }>): Node[] {
  return graph.nodes.map((n) => {
    const status = (n.status ?? 'idle') as 'active' | 'waiting' | 'completed' | 'idle';
    const data: FlowNodeData = {
      label: n.label,
      kind: n.kind as FlowNodeData['kind'],
      isInitial: n.isInitial,
      isTerminal: n.isTerminal,
      status,
      handles: 'horizontal',
    };
    return {
      id: n.id,
      type: 'flowNode',
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      data: data as unknown as Record<string, unknown>,
    };
  });
}

type EdgeCacheEntry = { sig: string; edge: Edge };

/**
 * Build ReactFlow edges, reusing the previous edge object whenever an edge's
 * visual signature is unchanged. Stable identity stops ReactFlow from
 * re-rendering an edge's label every time the snapshot changes — which made
 * the labels flicker while scrubbing the timeline, even though the edge line
 * itself was identical.
 */
function toFlowEdges(graph: JsonGraph, dark: boolean, cache: Map<string, EdgeCacheEntry>): Edge[] {
  const statusById = new Map(graph.nodes.map((n) => [n.id, n.status]));

  return graph.edges.map((e) => {
    const active = statusById.get(e.from) === 'active';
    const dashed = e.hasGuard ?? false;
    const sig = `${e.from}|${e.to}|${e.kind}|${e.action ?? ''}|${active}|${dashed}|${dark}`;
    const hit = cache.get(e.id);
    if (hit && hit.sig === sig) {
      return hit.edge;
    }
    const edge = buildFlowEdge(
      {
        id: e.id,
        from: e.from,
        to: e.to,
        kind: e.kind as 'fork-target' | 'join-requires' | 'transition',
        label: e.action ?? '',
        active,
        ...(dashed ? { dashed: true } : {}),
      },
      dark,
    );
    cache.set(e.id, { sig, edge });
    return edge;
  });
}

export function WorkflowGraph() {
  const { theme } = useTheme();
  const { definition, snapshot } = useRunner();

  const graph = useMemo(
    () => JsonGraphExporter.export(definition, snapshot),
    [definition, snapshot],
  );

  const positions = useMemo(() => computeLayout(graph.nodes, graph.edges), [graph]);

  const nodes: Node[] = useMemo(() => toFlowNodes(graph, positions), [graph, positions]);

  // Persisted across renders so unchanged edges keep their object identity.
  const edgeCacheRef = useRef<Map<string, EdgeCacheEntry>>(new Map());
  const edges: Edge[] = useMemo(
    // eslint-disable-next-line react-hooks/refs -- the cache is a render-stable memoization store, not reactive state
    () => toFlowEdges(graph, theme === 'dark', edgeCacheRef.current),
    [graph, theme],
  );

  return (
    <div className="min-h-0 flex-1">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={theme}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        fitViewOptions={fitViewOptions}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color={theme === 'dark' ? '#334155' : '#cbd5e1'}
        />
      </ReactFlow>
    </div>
  );
}

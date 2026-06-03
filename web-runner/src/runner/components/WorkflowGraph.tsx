import { useMemo } from 'react';
import { ReactFlow, Background, BackgroundVariant } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import { JsonGraphExporter } from 'flowyd/visualization';
import type { JsonGraph, JsonGraphNode, JsonGraphEdge } from 'flowyd/visualization';
import { StateNode } from './StateNode';
import type { StateNodeType } from './StateNode';
import { useRunner } from '../context';

const NODE_W = 180;
const NODE_H = 64;

// Object reference must be stable — defined outside the component.
const nodeTypes = { stateNode: StateNode };

const H_GAP = 60;
const V_GAP = 28;

/**
 * Compute left-to-right node positions using a longest-path layering algorithm.
 *
 * Assigns each node to the deepest layer reachable from any source, then
 * distributes nodes within each layer evenly along the y-axis.
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
    const id = queue.shift(); // non-null: loop condition guarantees length > 0
    if (id === undefined) {break;}
    topoOrder.push(id);
    for (const neighbor of outEdges.get(id) ?? []) {
      const deg = (remaining.get(neighbor) ?? 1) - 1;
      remaining.set(neighbor, deg);
      if (deg === 0) {queue.push(neighbor);}
    }
  }

  // Longest-path layer assignment: layer[n] = max(layer[pred] + 1)
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

  // Assign pixel positions: x from layer, y centered within layer
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

/**
 * Convert a JsonGraph and its computed positions into ReactFlow nodes.
 *
 * @param graph - Full JsonGraph; node metadata (label, kind, status, flags) is read from each entry.
 * @param positions - Map from node ID to top-left `{x, y}` pixel position, as returned by `computeLayout`.
 * @returns ReactFlow `Node[]` typed as `StateNodeType[]` for the custom `stateNode` renderer.
 */
function toFlowNodes(
  graph: JsonGraph,
  positions: Map<string, { x: number; y: number }>,
): StateNodeType[] {
  return graph.nodes.map((n) => ({
    id: n.id,
    type: 'stateNode',
    position: positions.get(n.id) ?? { x: 0, y: 0 },
    data: {
      label: n.label,
      kind: n.kind,
      status: n.status,
      isInitial: n.isInitial,
      isTerminal: n.isTerminal,
    },
  }));
}

/**
 * Convert JsonGraph edges to ReactFlow edges with visual encoding:
 * - `fork-target` edges: purple dashed, non-animated (structural, not traversable).
 * - `join-requires` edges: cyan dashed, non-animated (structural).
 * - Transition edges: animated when the source state is currently `active`;
 *   dashed stroke when the transition has a guard.
 *
 * @param graph - Full JsonGraph including node statuses needed for the animation flag.
 * @returns ReactFlow `Edge[]` ready for `<ReactFlow edges={…} />`.
 */
function toFlowEdges(graph: JsonGraph): Edge[] {
  const statusById = new Map(graph.nodes.map((n) => [n.id, n.status]));

  return graph.edges.map((e) => {
    const base = { id: e.id, source: e.from, target: e.to };
    if (e.kind === 'fork-target') {
      return {
        ...base,
        label: '⑂ auto',
        animated: false,
        style: { strokeDasharray: '5 3', stroke: '#7c3aed', strokeWidth: 1.5 },
        labelStyle: { fontSize: 11, fontFamily: 'monospace' },
      };
    }
    if (e.kind === 'join-requires') {
      return {
        ...base,
        label: '⑁ requires',
        animated: false,
        style: { strokeDasharray: '5 3', stroke: '#0ea5e9', strokeWidth: 1.5 },
        labelStyle: { fontSize: 11, fontFamily: 'monospace' },
      };
    }
    return {
      ...base,
      label: e.action,
      animated: statusById.get(e.from) === 'active',
      ...(e.hasGuard ? { style: { strokeDasharray: '5 3' } } : {}),
    };
  });
}

export function WorkflowGraph() {
  const { definition, snapshot } = useRunner();

  const graph = useMemo(
    () => JsonGraphExporter.export(definition, snapshot),
    [definition, snapshot],
  );

  const positions = useMemo(() => computeLayout(graph.nodes, graph.edges), [graph]);

  const nodes: Node[] = useMemo(() => toFlowNodes(graph, positions), [graph, positions]);
  const edges: Edge[] = useMemo(() => toFlowEdges(graph), [graph]);

  return (
    <div className="min-h-0 flex-1">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: 0.25 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}

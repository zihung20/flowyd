import type { Edge } from '@xyflow/react';

export type EdgeKind = 'fork-target' | 'join-requires' | 'transition';

export interface EdgeSpec {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label: string;
  animated?: boolean;
  dashed?: boolean | undefined;
}

/**
 * Build a ReactFlow `Edge` with consistent visual style shared by the designer
 * canvas and the runner graph.
 *
 * @param spec - Normalised edge descriptor.
 * @param dark - Whether the current theme is dark.
 * @returns A fully-styled ReactFlow edge ready to pass to `<ReactFlow edges={…} />`.
 */
export function buildFlowEdge(spec: EdgeSpec, dark: boolean): Edge {
  const labelBg = dark ? '#0f172a' : '#f8fafc';
  const labelBgOpacity = dark ? 0.9 : 1;

  const sharedLabel = {
    labelStyle: { fontSize: 11, fontFamily: 'monospace' } as React.CSSProperties,
    labelBgStyle: { fill: labelBg, fillOpacity: labelBgOpacity } as React.CSSProperties,
  };

  if (spec.kind === 'fork-target') {
    return {
      id: spec.id,
      source: spec.from,
      target: spec.to,
      label: '⑂ auto',
      animated: false,
      style: { strokeDasharray: '5 3', stroke: '#7c3aed', strokeWidth: 1.5 },
      ...sharedLabel,
    };
  }

  if (spec.kind === 'join-requires') {
    return {
      id: spec.id,
      source: spec.from,
      target: spec.to,
      label: '⑁ requires',
      animated: false,
      style: { strokeDasharray: '5 3', stroke: '#0ea5e9', strokeWidth: 1.5 },
      ...sharedLabel,
    };
  }

  // transition
  const stroke = dark ? '#94a3b8' : '#64748b';
  return {
    id: spec.id,
    source: spec.from,
    target: spec.to,
    label: spec.label,
    animated: spec.animated ?? false,
    style: {
      stroke,
      strokeWidth: 1.5,
      ...(spec.dashed ? { strokeDasharray: '5 3' } : {}),
    },
    ...sharedLabel,
  };
}

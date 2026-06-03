import { useState } from 'react';
import type { InstanceSnapshot, WorkflowDefinition } from 'flowyd';
import { MermaidExporter, JsonGraphExporter } from 'flowyd/visualization';
import { Button } from '../components/ui/button';

/**
 * Compress bytes with zlib (RFC 1950) using the browser's CompressionStream.
 *
 * Piping through Response.arrayBuffer() lets the browser collect all stream
 * chunks internally — no manual chunk loop needed.
 *
 * 'deflate' = zlib-wrapped DEFLATE, which is what pako.inflate() on
 * mermaid.live expects. Do NOT use 'deflate-raw' here.
 */
async function zlibCompress(input: Uint8Array): Promise<Uint8Array> {
  // Uint8Array.from() produces Uint8Array<ArrayBuffer> (not SharedArrayBuffer),
  // which is required by the Blob constructor under TS6's stricter generics.
  const compressed = await new Response(
    new Blob([Uint8Array.from(input)]).stream().pipeThrough(new CompressionStream('deflate')),
  ).arrayBuffer();
  return new Uint8Array(compressed);
}

/**
 * Open the current diagram in mermaid.live.
 *
 * mermaid.live encodes state in the URL fragment as `#pako:<base64>` where
 * the payload is a zlib-compressed JSON blob: `{ code, mermaid: { theme } }`.
 * We replicate that encoding here so the site loads the diagram directly.
 */
async function openInMermaidLive(diagram: string): Promise<void> {
  const payload = JSON.stringify({ code: diagram, mermaid: { theme: 'default' } });
  const compressed = await zlibCompress(new TextEncoder().encode(payload));
  const b64 = btoa(String.fromCharCode(...compressed));
  window.open(`https://mermaid.live/edit#pako:${b64}`, '_blank');
}

function downloadBlob(filename: string, content: string, mime: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

interface Props {
  title: string;
  subtitle: string;
  definition: WorkflowDefinition;
  snapshot: InstanceSnapshot;
  onReset: () => void;
}

/** Sticky header bar for SingleRunner — shows workflow title and export actions. */
export function RunnerToolbar({ title, subtitle, definition, snapshot, onReset }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopyMermaid() {
    const diagram = MermaidExporter.export(definition, snapshot);
    navigator.clipboard.writeText(diagram).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleDownloadMmd() {
    downloadBlob(
      `${definition.name}.mmd`,
      MermaidExporter.export(definition, snapshot),
      'text/plain',
    );
  }

  function handleDownloadJson() {
    downloadBlob(
      `${definition.name}.json`,
      JSON.stringify(JsonGraphExporter.export(definition, snapshot), null, 2),
      'application/json',
    );
  }

  function handleOpenMermaidLive() {
    openInMermaidLive(MermaidExporter.export(definition, snapshot));
  }

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
      <span className="text-sm font-bold text-slate-800">{title}</span>
      <span className="text-xs text-slate-400">{subtitle}</span>
      <span className="ml-auto text-xs text-slate-400">
        v{snapshot.version} · {snapshot.isTerminal ? 'complete' : 'in progress'}
      </span>
      <div className="ml-2 flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-slate-600"
          onClick={handleCopyMermaid}
        >
          {copied ? 'Copied!' : 'Copy Mermaid'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-slate-600"
          onClick={handleDownloadMmd}
        >
          Download .mmd
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-slate-600"
          onClick={handleDownloadJson}
        >
          Download JSON
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-slate-600"
          onClick={handleOpenMermaidLive}
        >
          Mermaid Live ↗
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-slate-600"
          onClick={onReset}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}

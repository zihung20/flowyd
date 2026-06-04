import { useState } from 'react';
import type { InstanceSnapshot, WorkflowDefinition } from 'flowyd';
import { MermaidExporter, JsonGraphExporter } from 'flowyd/visualization';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

/**
 * Compress bytes with zlib (RFC 1950) using the browser's CompressionStream.
 */
async function zlibCompress(input: Uint8Array): Promise<Uint8Array> {
  const compressed = await new Response(
    new Blob([Uint8Array.from(input)]).stream().pipeThrough(new CompressionStream('deflate')),
  ).arrayBuffer();
  return new Uint8Array(compressed);
}

/**
 * Open the current diagram in mermaid.live.
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
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
      <span className="text-sm font-bold text-foreground">{title}</span>
      <span className="text-xs text-muted-foreground">{subtitle}</span>

      <div className="ml-auto flex items-center gap-2">
        <Badge variant={snapshot.isTerminal ? 'green' : 'secondary'} className="text-[10px]">
          v{snapshot.version} · {snapshot.isTerminal ? 'complete' : 'in progress'}
        </Badge>

        <Separator orientation="vertical" className="h-4" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={handleCopyMermaid}>
              {copied ? 'Copied!' : 'Copy .mmd'}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy Mermaid diagram source</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={handleDownloadMmd}>
              .mmd
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download as .mmd file</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={handleDownloadJson}>
              .json
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download as JSON graph</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={handleOpenMermaidLive}>
              Live ↗
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open in mermaid.live</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-4" />

        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onReset}>
          Reset
        </Button>
      </div>
    </div>
  );
}

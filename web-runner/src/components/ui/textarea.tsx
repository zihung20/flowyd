import { cn } from '../../lib/utils';

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'border-input bg-background text-foreground flex w-full rounded-md border px-2.5 py-1.5 font-mono text-xs',
        'placeholder:text-muted-foreground resize-none leading-relaxed',
        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

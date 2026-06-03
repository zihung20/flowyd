import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '../../lib/utils';

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'text-muted-foreground text-[10px] font-semibold tracking-wider uppercase',
        className,
      )}
      {...props}
    />
  );
}

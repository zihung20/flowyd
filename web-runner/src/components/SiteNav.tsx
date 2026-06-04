import { Link, useLocation } from 'react-router-dom';

const SECTIONS = [
  { to: '/examples/purchase-order', label: 'Examples', match: '/examples' },
  { to: '/playground', label: 'Playground', match: '/playground' },
  { to: '/designer', label: 'Designer', match: '/designer' },
] as const;

interface SiteNavProps {
  /** Slot rendered flush right, before the section links */
  right?: React.ReactNode;
}

/** Top navigation bar shared by Examples, Playground, and Designer pages. */
export function SiteNav({ right }: SiteNavProps) {
  const { pathname } = useLocation();

  return (
    <header className="z-10 flex h-11 shrink-0 items-center gap-1 border-b border-border bg-background px-4">
      <Link
        to="/"
        className="mr-2 text-sm font-bold text-foreground transition-opacity hover:opacity-70"
      >
        flowyd
      </Link>
      <span className="text-border">/</span>
      {SECTIONS.map(({ to, label, match }) => {
        const active = pathname.startsWith(match);
        return (
          <Link
            key={to}
            to={to}
            className={[
              'rounded px-2.5 py-1 text-sm transition-colors',
              active
                ? 'font-semibold text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {label}
          </Link>
        );
      })}
      {right != null && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </header>
  );
}

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
    <header className="z-10 flex h-11 shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-4 dark:border-slate-700/60 dark:bg-slate-900">
      <Link
        to="/"
        className="mr-2 text-sm font-bold text-slate-900 transition-opacity hover:opacity-70 dark:text-white"
      >
        flowyd
      </Link>
      <span className="text-slate-300 dark:text-slate-600">/</span>
      {SECTIONS.map(({ to, label, match }) => {
        const active = pathname.startsWith(match);
        return (
          <Link
            key={to}
            to={to}
            className={[
              'rounded px-2.5 py-1 text-sm transition-colors',
              active
                ? 'font-semibold text-slate-900 dark:text-white'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
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

import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { TooltipProvider } from './components/ui/tooltip';

// Lazy-loaded so each route is its own chunk and the entry shell loads first.
const HomePage = lazy(() => import('./pages/HomePage'));
const ExamplesPage = lazy(() => import('./pages/ExamplesPage'));
const DesignerPage = lazy(() => import('./pages/DesignerPage'));
const PlaygroundPage = lazy(() => import('./pages/PlaygroundPage'));

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-white dark:bg-slate-900">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <HashRouter>
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route
                path="/examples"
                element={<Navigate to="/examples/purchase-order" replace />}
              />
              <Route path="/examples/:id" element={<ExamplesPage />} />
              <Route path="/designer" element={<DesignerPage />} />
              <Route path="/playground" element={<PlaygroundPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </HashRouter>
      </TooltipProvider>
    </ThemeProvider>
  );
}

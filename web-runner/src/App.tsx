import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense } from 'react';
import { ThemeProvider } from './context/ThemeContext';

import HomePage from './pages/HomePage';
import ExamplesPage from './pages/ExamplesPage';
import DesignerPage from './pages/DesignerPage';
import PlaygroundPage from './pages/PlaygroundPage';

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
      <HashRouter>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/examples" element={<Navigate to="/examples/purchase-order" replace />} />
            <Route path="/examples/:id" element={<ExamplesPage />} />
            <Route path="/designer" element={<DesignerPage />} />
            <Route path="/playground" element={<PlaygroundPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </ThemeProvider>
  );
}

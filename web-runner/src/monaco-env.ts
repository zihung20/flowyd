// Self-host Monaco from the bundled `monaco-editor` package instead of the
// jsDelivr CDN that `@monaco-editor/react` uses by default. The CDN default is
// unreliable (blocked on some networks) and pulls a different version than the
// one we install, so we point the loader at our bundled copy and wire up the
// language workers via Vite's `?worker` imports.
//
// Import this module once, before any <Editor> mounts (see main.tsx).
// flowyd / zod type declarations are still registered in monacoSetup.ts via the
// CodeEditor component's beforeMount callback.
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    switch (label) {
      case 'json':
        return new jsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker();
      case 'typescript':
      case 'javascript':
        return new tsWorker();
      default:
        return new editorWorker();
    }
  },
};

loader.config({ monaco });

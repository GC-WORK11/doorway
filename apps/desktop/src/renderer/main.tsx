import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from './App';

export function mountDoorwayApp(container: HTMLElement): Root {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  return root;
}

if (typeof document !== 'undefined') {
  const container = document.getElementById('root');
  if (container) {
    mountDoorwayApp(container);
  }
}

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installErrorReporting } from './errors';
import './styles.css';

installErrorReporting();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

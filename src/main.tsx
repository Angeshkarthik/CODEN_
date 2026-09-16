import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Suppress Monaco's internal async cancellation rejections on model switch
window.addEventListener('unhandledrejection', (event) => {
  if (
    event.reason?.name === 'Canceled' ||
    event.reason?.message === 'Canceled' ||
    (typeof event.reason === 'string' && event.reason.includes('Canceled'))
  ) {
    event.preventDefault();
  }
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

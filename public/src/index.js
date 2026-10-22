import App from './app.js';
import { syncAll } from './services/sync.js';
import db from './services/db.js';

async function bootstrap() {
  const { render } = window.preact;
  const html = window.html;

  try {
    // 1. Initialize IndexedDB for offline storage
    try {
      await db.initDB();
      if (navigator.onLine) {
        syncAll();
      }
    } catch (dbErr) {
      console.warn('IndexedDB offline storage note:', dbErr);
    }

    // 2. Connect to Socket.io for lightweight real-time background events
    try {
      if (typeof window.io !== 'undefined') {
        const socket = window.io();
        socket.on('stock:updated', () => {
          if (window.showToast) window.showToast('Stock totals updated', 'info', 2000);
        });
        socket.on('transfer:confirmed', () => {
          if (window.showToast) window.showToast('Transfer was confirmed', 'success', 2500);
        });
      }
    } catch (socketErr) {
      console.warn('Socket.io optional connection skipped:', socketErr);
    }

    // 3. Remove initial HTML loading screen
    const loader = document.getElementById('loading');
    if (loader) {
      loader.remove();
    }

    // 4. Mount App component
    const appContainer = document.getElementById('app');
    if (appContainer) {
      render(html`<${App} />`, appContainer);
    }
  } catch (err) {
    console.error('Bootstrap error:', err);
    // Never leave user on blank screen
    const loader = document.getElementById('loading');
    if (loader) loader.remove();
    const appContainer = document.getElementById('app');
    if (appContainer) {
      appContainer.innerHTML = `
        <div style="padding: 24px; text-align: center; max-width: 400px; margin: 40px auto; font-family: sans-serif;">
          <h2 style="color: #0891b2;">Life Skill Course</h2>
          <p style="color: #dc2626; margin: 12px 0;">An error occurred while starting the application: ${err.message}</p>
          <button onclick="location.reload()" style="background: #0891b2; color: white; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer;">
            Reload Page
          </button>
        </div>
      `;
    }
  }
}

// Start application
bootstrap();

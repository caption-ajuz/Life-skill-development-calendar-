import { currentUser, isLoading, isAuthenticated, checkAuth } from './store/auth.js';
import { Navbar, BottomNav, SyncBar, ToastContainer } from './components/Layout.js';

// Lazy load page components
import Login from './pages/Login.js';
import Dashboard from './pages/Dashboard.js';
import Teams from './pages/Teams.js';
import Members from './pages/Members.js';
import Stock from './pages/Stock.js';
import Distribution from './pages/Distribution.js';
import Collections from './pages/Collections.js';
import Transfers from './pages/Transfers.js';
import Areas from './pages/Areas.js';
import Reports from './pages/Reports.js';
import Finance from './pages/Finance.js';
import Settings from './pages/Settings.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

export default function App() {
  const [currentRoute, setCurrentRoute] = useState(() => window.location.hash || '#/');
  const [user, setUser] = useState(() => currentUser.value);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial authentication check
    checkAuth().then((u) => {
      setUser(u);
      setLoading(false);
    }).catch(() => {
      setUser(null);
      setLoading(false);
    });

    const unsub = currentUser.subscribe ? currentUser.subscribe(setUser) : null;

    // Listen to hash changes for client-side routing
    const handleHashChange = () => {
      setCurrentRoute(window.location.hash || '#/');
      window.scrollTo(0, 0);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      if (unsub) unsub();
    };
  }, []);

  // Show app loading skeleton while verifying auth session
  if (loading) {
    return html`
      <div style="min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: linear-gradient(135deg, #0891b2, #1d4ed8); color: white;">
        <img src="/logo.jpg" alt="Logo" style="width: 72px; height: 72px; border-radius: 14px; background: white; padding: 6px; margin-bottom: 14px;" />
        <div style="font-size: 18px; font-weight: 700;">Life Skill Course</div>
        <div style="font-size: 13px; opacity: 0.85; margin-top: 2px;">Loading application...</div>
        <div class="spinner" style="margin-top: 20px;"></div>
      </div>
    `;
  }

  // Auth Guard: if not authenticated and not already on #/login, route to #/login
  if (!user && currentRoute !== '#/login') {
    window.location.hash = '#/login';
    return html`<${Login} />`;
  }

  if (currentRoute === '#/login') {
    if (user) {
      window.location.hash = '#/';
      return null;
    }
    return html`<${Login} />`;
  }

  // Determine Page Component and Title
  let PageComponent = Dashboard;
  let pageTitle = 'Dashboard';

  const route = currentRoute.split('?')[0];

  switch (route) {
    case '#/':
    case '#/dashboard':
      PageComponent = Dashboard;
      pageTitle = 'Dashboard';
      break;
    case '#/teams':
      PageComponent = Teams;
      pageTitle = 'Teams';
      break;
    case '#/members':
      PageComponent = Members;
      pageTitle = 'Members';
      break;
    case '#/stock':
      PageComponent = Stock;
      pageTitle = 'Stock Allocation';
      break;
    case '#/distribution':
      PageComponent = Distribution;
      pageTitle = 'Distribute Calendars';
      break;
    case '#/collections':
      PageComponent = Collections;
      pageTitle = 'Record Collection';
      break;
    case '#/transfers':
      PageComponent = Transfers;
      pageTitle = 'Money Transfers';
      break;
    case '#/areas':
      PageComponent = Areas;
      pageTitle = 'Covered Areas';
      break;
    case '#/reports':
      PageComponent = Reports;
      pageTitle = 'Reports & Exports';
      break;
    case '#/finance':
      PageComponent = Finance;
      pageTitle = 'Campaign Finance';
      break;
    case '#/settings':
      PageComponent = Settings;
      pageTitle = 'My Profile';
      break;
    default:
      PageComponent = Dashboard;
      pageTitle = 'Dashboard';
  }

  return html`
    <div style="min-height: 100vh;">
      <${Navbar} title=${pageTitle} />
      <${SyncBar} />
      <${ToastContainer} />

      <main>
        <${PageComponent} />
      </main>

      <${BottomNav} activeRoute=${currentRoute} />
    </div>
  `;
}

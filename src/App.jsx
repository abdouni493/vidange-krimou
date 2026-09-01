import { Component, useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Wrench } from "lucide-react";
import { AppProvider, useApp } from "./context";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Repairs from "./pages/Repairs";
import Services from "./pages/Services";
import Stock from "./pages/Stock";
import Barcodes from "./pages/Barcodes";
import Purchases from "./pages/Purchases";
import Pos from "./pages/Pos";
import Sales from "./pages/Sales";
import Clients from "./pages/Clients";
import Suppliers from "./pages/Suppliers";
import Workers from "./pages/Workers";
import Expenses from "./pages/Expenses";
import Caisse from "./pages/Caisse";
import Reports from "./pages/Reports";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";

const PAGES = {
  dashboard: Dashboard, repairs: Repairs, services: Services, stock: Stock,
  barcodes: Barcodes,
  purchases: Purchases, pos: Pos, sales: Sales,
  clients: Clients, suppliers: Suppliers, workers: Workers,
  expenses: Expenses, caisse: Caisse, reports: Reports, analytics: Analytics,
  settings: Settings,
};

const PAGE_KEY = "garage_page_v1";

// "#/repairs" -> "repairs", ignoring anything that isn't a real page
const pageFromHash = () => {
  const key = window.location.hash.replace(/^#\/?/, "");
  return PAGES[key] ? key : null;
};

// Catches render errors from a page so one failure can't blank the whole app.
// Reset via `resetKey` (the current page) — navigating elsewhere clears the error.
class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-md py-20 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
            <span className="text-2xl">!</span>
          </div>
          <h2 className="text-lg font-bold text-primary-900">Une erreur est survenue</h2>
          <p className="mt-1 text-sm text-slate-500">
            Cette page n'a pas pu s'afficher. Choisissez une autre rubrique dans le menu ou réessayez.
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-5 rounded-xl grad-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lift"
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// The database is loaded from Supabase, so the UI waits for it rather than
// rendering pages against an empty document.
function Splash({ error, onRetry, onLogout }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <motion.div
          className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl grad-primary text-white shadow-lift"
          animate={error ? {} : { scale: [1, 1.08, 1] }}
          transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
        >
          <Wrench size={30} />
        </motion.div>
        {error ? (
          <>
            <h2 className="text-lg font-bold text-primary-900">Base de données inaccessible</h2>
            <p className="mt-1.5 text-sm text-slate-500">
              La connexion au projet Supabase a échoué. Vérifiez votre accès à Internet,
              puis réessayez.
            </p>
            <p className="mt-2 break-words text-xs text-slate-400">{error}</p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <button
                onClick={onRetry}
                className="rounded-xl grad-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lift cursor-pointer"
              >
                Réessayer
              </button>
              <button
                onClick={onLogout}
                className="rounded-xl border border-primary-200 px-5 py-2.5 text-sm font-semibold text-primary-700 cursor-pointer hover:bg-primary-50"
              >
                Se déconnecter
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm font-medium text-slate-500">Chargement de la base de données…</p>
        )}
      </div>
    </div>
  );
}

function Shell() {
  const { currentUser, can, status, loadError, reload, logout } = useApp();

  // The open page is mirrored in the URL hash, so refreshing (F5) stays where
  // the user was instead of jumping back to the dashboard. localStorage covers
  // the case where the app is reopened without a hash.
  const [page, setPageState] = useState(() => {
    const stored = localStorage.getItem(PAGE_KEY);
    return pageFromHash() || (stored && PAGES[stored] ? stored : "dashboard");
  });

  const setPage = useCallback((next) => {
    setPageState(next);
    localStorage.setItem(PAGE_KEY, next);
    if (pageFromHash() !== next) window.location.hash = `#/${next}`;
  }, []);

  // Put the restored page into the address bar on first paint.
  useEffect(() => {
    if (pageFromHash() !== page) window.location.hash = `#/${page}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser back / forward buttons
  useEffect(() => {
    const onHashChange = () => {
      const next = pageFromHash();
      if (next) setPageState(next);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // If the current worker loses access to the page, fall back to their first allowed page
  useEffect(() => {
    if (currentUser && !can(page, "view")) {
      const first = Object.keys(PAGES).find((p) => can(p, "view"));
      if (first) setPage(first);
    }
  }, [currentUser, page]);

  // "auth" means no session yet: the login screen is the whole app.
  if (status === "auth") {
    return (
      <AnimatePresence mode="wait">
        <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Login />
        </motion.div>
      </AnimatePresence>
    );
  }

  if (status !== "ready" || !currentUser) {
    return (
      <Splash
        error={status === "error" ? loadError : ""}
        onRetry={reload}
        onLogout={logout}
      />
    );
  }

  const Page = PAGES[page] || Dashboard;
  return (
    <Layout page={page} setPage={setPage}>
      <PageErrorBoundary resetKey={page}>
        <Page />
      </PageErrorBoundary>
    </Layout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

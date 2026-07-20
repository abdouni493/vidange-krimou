import { Component, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppProvider, useApp } from "./context";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Repairs from "./pages/Repairs";
import Services from "./pages/Services";
import Stock from "./pages/Stock";
import Barcodes from "./pages/Barcodes";
import Purchases from "./pages/Purchases";
import Clients from "./pages/Clients";
import Suppliers from "./pages/Suppliers";
import Workers from "./pages/Workers";
import Expenses from "./pages/Expenses";
import Caisse from "./pages/Caisse";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

const PAGES = {
  dashboard: Dashboard, repairs: Repairs, services: Services, stock: Stock,
  barcodes: Barcodes,
  purchases: Purchases, clients: Clients, suppliers: Suppliers, workers: Workers,
  expenses: Expenses, caisse: Caisse, reports: Reports, settings: Settings,
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

function Shell() {
  const { currentUser, can } = useApp();
  const [page, setPage] = useState("dashboard");

  // If the current worker loses access to the page, fall back to their first allowed page
  useEffect(() => {
    if (currentUser && !can(page, "view")) {
      const first = Object.keys(PAGES).find((p) => can(p, "view"));
      if (first) setPage(first);
    }
    if (!currentUser) setPage("dashboard");
  }, [currentUser, page]);

  if (!currentUser) {
    return (
      <AnimatePresence mode="wait">
        <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Login />
        </motion.div>
      </AnimatePresence>
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

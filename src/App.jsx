import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppProvider, useApp } from "./context";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Repairs from "./pages/Repairs";
import Services from "./pages/Services";
import Stock from "./pages/Stock";
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
  purchases: Purchases, clients: Clients, suppliers: Suppliers, workers: Workers,
  expenses: Expenses, caisse: Caisse, reports: Reports, settings: Settings,
};

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
      <Page />
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

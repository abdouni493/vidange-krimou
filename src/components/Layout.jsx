import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Wrench, Sparkles, Boxes, ShoppingCart, Users, Truck,
  HardHat, Receipt, Landmark, BarChart3, Settings, LogOut, Menu, X, Languages,
  Barcode,
} from "lucide-react";
import { useApp } from "../context";

export const NAV = [
  { key: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { key: "repairs", label: "Réparations & RDV", icon: Wrench },
  { key: "services", label: "Services", icon: Sparkles },
  { key: "stock", label: "Gestion de stock", icon: Boxes },
  { key: "barcodes", label: "Codes-barres", icon: Barcode },
  { key: "purchases", label: "Achats", icon: ShoppingCart },
  { key: "clients", label: "Clients", icon: Users },
  { key: "suppliers", label: "Fournisseurs", icon: Truck },
  { key: "workers", label: "Employés", icon: HardHat },
  { key: "expenses", label: "Dépenses", icon: Receipt },
  { key: "caisse", label: "Caisse", icon: Landmark },
  { key: "reports", label: "Rapports", icon: BarChart3 },
  { key: "settings", label: "Paramètres", icon: Settings },
];

function LangSwitch() {
  const { lang, setLang } = useApp();
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-white/70 border border-primary-100 p-1 shadow-soft">
      <Languages size={14} className="ms-1.5 text-primary-400" />
      {["fr", "ar"].map((l) => (
        <button key={l} onClick={() => setLang(l)}
          className={`relative rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer transition-colors ${lang === l ? "text-white" : "text-slate-500 hover:text-primary-700"}`}>
          {lang === l && (
            <motion.span layoutId="lang-pill" className="absolute inset-0 rounded-lg grad-primary"
              transition={{ type: "spring", stiffness: 400, damping: 30 }} />
          )}
          <span className="relative z-10">{l === "fr" ? "FR" : "ع"}</span>
        </button>
      ))}
    </div>
  );
}

function SidebarContent({ page, setPage, onNavigate }) {
  const { t, can, logout, db, currentUser } = useApp();
  const items = NAV.filter((n) => can(n.key, "view"));
  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* decorative glows */}
      <div className="pointer-events-none absolute -top-20 -end-20 h-56 w-56 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-24 -start-24 h-64 w-64 rounded-full bg-indigo-400/15 blur-3xl" />
      <div className="flex items-center gap-3 px-5 py-6">
        <motion.div whileHover={{ rotate: -12, scale: 1.08 }}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-white shadow-lift backdrop-blur">
          {db.settings.logo
            ? <img src={db.settings.logo} alt="logo" className="h-8 w-8 rounded-lg object-cover" />
            : <Wrench size={22} />}
        </motion.div>
        <div>
          <p className="text-[15px] font-bold leading-tight text-white">{db.settings.name || t("AutoGarage Pro")}</p>
          <p className="text-[11px] text-white/50">{t("Gestion de garage automobile")}</p>
        </div>
      </div>

      <nav className="relative z-10 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {items.map((item, i) => {
          const active = page === item.key;
          return (
            <motion.button
              key={item.key}
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.04 * i, type: "spring", stiffness: 300, damping: 26 }}
              onClick={() => { setPage(item.key); onNavigate?.(); }}
              className={`relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                active ? "text-white" : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              {active && (
                <motion.span layoutId="nav-active"
                  className="absolute inset-0 rounded-xl bg-white/15 shadow-lift backdrop-blur-sm"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }} />
              )}
              <item.icon size={17} className="relative z-10 shrink-0" />
              <span className="relative z-10">{t(item.label)}</span>
              {active && <motion.span layoutId="nav-dot" className="relative z-10 ms-auto h-1.5 w-1.5 rounded-full bg-accent-400" />}
            </motion.button>
          );
        })}
      </nav>

      <div className="relative z-10 border-t border-white/10 p-3">
        <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full grad-accent text-xs font-bold text-white">
            {(currentUser?.name || "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-white">{currentUser?.name}</p>
            <p className="text-[11px] text-white/40">{t(currentUser?.kind === "admin" ? "Administrateur" : "Employé")}</p>
          </div>
        </div>
        <motion.button whileTap={{ scale: 0.97 }} onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-200 cursor-pointer">
          <LogOut size={17} />
          {t("Déconnexion")}
        </motion.button>
      </div>
    </div>
  );
}

export default function Layout({ page, setPage, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useApp();
  const current = NAV.find((n) => n.key === page);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <motion.aside
        initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        className="fixed inset-y-0 start-0 z-40 hidden w-[264px] lg:block"
      >
        <div className="h-full grad-deep shadow-lift">
          <SidebarContent page={page} setPage={setPage} />
        </div>
      </motion.aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)} />
            <motion.aside
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="fixed inset-y-0 start-0 z-50 w-[264px] lg:hidden">
              <div className="h-full grad-deep">
                <SidebarContent page={page} setPage={setPage} onNavigate={() => setMobileOpen(false)} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="min-w-0 flex-1 lg:ms-[264px]">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-primary-100/60 bg-surface/80 px-4 py-3 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 text-primary-700 hover:bg-primary-50 lg:hidden cursor-pointer"
              onClick={() => setMobileOpen(true)} aria-label="Menu">
              <Menu size={20} />
            </button>
            <motion.span key={page} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="text-sm font-semibold text-slate-500">
              {current ? t(current.label) : ""}
            </motion.span>
          </div>
          <LangSwitch />
        </header>

        <main className="px-4 py-6 sm:px-8">
          {/* Keyed remount plays the entrance animation on every navigation.
              No exit animation = no AnimatePresence "wait" that can freeze mid-transition. */}
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}

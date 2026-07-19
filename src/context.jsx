import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { loadDB, saveDB, resetDB, uid, SESSION_KEY, LANG_KEY, PAGE_ACTIONS } from "./store";
import { makeT } from "./i18n";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [db, setDb] = useState(loadDB);
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  });
  const [lang, setLangState] = useState(() => localStorage.getItem(LANG_KEY) || "fr");

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = (l) => { localStorage.setItem(LANG_KEY, l); setLangState(l); };
  const t = useMemo(() => makeT(lang), [lang]);

  // mutate a deep copy, persist, set state
  const update = (mutator) => {
    setDb((prev) => {
      const next = structuredClone(prev);
      mutator(next);
      saveDB(next);
      return next;
    });
  };

  const persistSession = (s) => {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
    setSession(s);
  };

  const login = (identifier, password) => {
    const idl = identifier.trim().toLowerCase();
    const admin = db.users.find(
      (u) => (u.username.toLowerCase() === idl || u.email.toLowerCase() === idl) && u.password === password
    );
    if (admin) { persistSession({ kind: "admin", id: admin.id }); return true; }
    const worker = db.workers.find(
      (w) => w.account?.enabled &&
        (w.account.username?.toLowerCase() === idl || w.account.email?.toLowerCase() === idl) &&
        w.account.password === password
    );
    if (worker) { persistSession({ kind: "worker", id: worker.id }); return true; }
    return false;
  };

  const register = ({ name, username, email, password }) => {
    const exists = db.users.some(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase()
    );
    if (exists) return { error: "Ce nom d'utilisateur existe déjà" };
    const user = { id: uid(), name, username: username.trim(), email, password, role: "admin" };
    update((d) => d.users.push(user));
    persistSession({ kind: "admin", id: user.id });
    return { ok: true };
  };

  const logout = () => persistSession(null);

  const currentUser = useMemo(() => {
    if (!session) return null;
    if (session.kind === "admin") {
      const u = db.users.find((x) => x.id === session.id);
      return u ? { ...u, kind: "admin" } : null;
    }
    const w = db.workers.find((x) => x.id === session.id);
    return w
      ? { id: w.id, name: w.fullName, username: w.account.username, email: w.account.email, kind: "worker", permissions: w.permissions }
      : null;
  }, [session, db]);

  const can = (page, action = "view") => {
    if (!currentUser) return false;
    if (currentUser.kind === "admin") return true;
    const acts = currentUser.permissions?.[page];
    if (!acts) return false;
    if (action === "view") return true;
    return acts.includes(action) || !PAGE_ACTIONS[page]?.includes(action);
  };

  const value = {
    db, update, session, currentUser, login, register, logout,
    lang, setLang, t, can,
    resetData: () => setDb(resetDB()),
    restoreData: (data) => { saveDB(data); setDb(data); },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchDB, pushDB, resetRemoteDB, clearSnapshot, emptyDB,
  LANG_KEY, PAGE_ACTIONS,
} from "./store";
import { supabase, createSignupClient } from "./lib/supabase";
import { makeT } from "./i18n";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export const SETUP_HINT =
  "Base non initialisée : exécutez supabase/schema.sql dans le SQL Editor du projet Supabase.";

// Edits are coalesced for this long before hitting the database, so typing in a
// form doesn't produce one write per keystroke.
const SAVE_DELAY = 400;

// Supabase signs in with an email address; the login box also accepts the
// username, which this resolves through a function exposed to anonymous callers.
async function resolveEmail(identifier) {
  const id = identifier.trim();
  if (id.includes("@")) return id;
  const { data } = await supabase.rpc("login_email", { p_identifier: id });
  return data || id;
}

export function AppProvider({ children }) {
  const [db, setDb] = useState(null);
  // Starts on "loading": until `getSession()` answers we don't know whether a
  // session is stored, and opening on the login screen would flash it in the
  // face of someone who is already signed in.
  const [status, setStatus] = useState("loading"); // auth | loading | ready | error
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error

  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [adminExists, setAdminExists] = useState(true); // assume yes until told otherwise
  const [setupError, setSetupError] = useState("");
  const [lang, setLangState] = useState(() => localStorage.getItem(LANG_KEY) || "fr");

  const pending = useRef(null);   // newest document waiting to be written
  const timer = useRef(null);
  const inFlight = useRef(false);

  // ---- session ----
  const readProfile = useCallback(async (userId) => {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, username, email, role, worker_id, active, permissions")
      .eq("id", userId)
      .maybeSingle();
    return data || null;
  }, []);

  // Répond aussi à la question « le schéma est-il installé ? » : tant que la
  // fonction n'existe pas, on ne peut ni se connecter ni créer l'administrateur,
  // et il vaut mieux le dire que de masquer le bouton sans explication.
  const refreshAdminExists = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_exists");
    if (!error) {
      setAdminExists(!!data);
      setSetupError("");
      return;
    }
    if (error.code === "PGRST202" || /schema cache|not found/i.test(error.message || "")) {
      setAdminExists(false);
      setSetupError(SETUP_HINT);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session || null);
      if (!data.session) {
        await refreshAdminExists();
        if (alive) setStatus("auth");
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next || null);
      if (!next) {
        clearSnapshot();
        setDb(null);
        setProfile(null);
        setStatus("auth");
        refreshAdminExists();
      }
    });

    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [refreshAdminExists]);

  // ---- load ----
  // The database is only readable once signed in — row level security answers
  // an anonymous reader with an empty set, so loading waits for the session.
  const load = useCallback(async () => {
    if (!session?.user) return;
    setStatus("loading");
    try {
      const [doc, prof] = await Promise.all([fetchDB(), readProfile(session.user.id)]);
      setDb(doc);
      setProfile(prof);
      setLoadError("");
      setStatus(prof ? "ready" : "error");
      if (!prof) setLoadError("Compte sans profil — exécutez supabase/schema.sql sur le projet.");
    } catch (err) {
      setLoadError(err.message || String(err));
      setStatus("error");
    }
  }, [session, readProfile]);

  useEffect(() => { if (session?.user) load(); }, [session?.user?.id]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  // ---- save ----
  const flush = useCallback(async () => {
    if (inFlight.current || !pending.current) return;
    const doc = pending.current;
    pending.current = null;
    inFlight.current = true;
    setSaveState("saving");
    try {
      await pushDB(doc);
      setSaveState(pending.current ? "saving" : "saved");
    } catch (err) {
      console.error("[garage] enregistrement", err);
      setLoadError(err.message || String(err));
      setSaveState("error");
    } finally {
      inFlight.current = false;
      if (pending.current) flush(); // changes that arrived mid-write
    }
  }, []);

  const queueSave = useCallback((doc) => {
    pending.current = doc;
    setSaveState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  }, [flush]);

  // Don't lose the last few hundred milliseconds of edits when the tab is hidden.
  useEffect(() => {
    const onHide = () => { if (pending.current) flush(); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flush]);

  // mutate a deep copy, persist, set state
  const update = useCallback((mutator) => {
    setDb((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      mutator(next);
      queueSave(next);
      return next;
    });
  }, [queueSave]);

  const replaceAll = useCallback((doc) => {
    setDb(doc);
    queueSave(doc);
  }, [queueSave]);

  const setLang = (l) => { localStorage.setItem(LANG_KEY, l); setLangState(l); };
  const t = useMemo(() => makeT(lang), [lang]);

  // ---- authentication ----

  const login = async (identifier, password) => {
    const email = await resolveEmail(identifier);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: /invalid/i.test(error.message) ? "Identifiants incorrects" : error.message };
    }
    return { ok: true };
  };

  /**
   * Creates the very first administrator. The database decides the role: the
   * `handle_new_user` trigger only grants "admin" while no administrator
   * exists, so this button cannot be replayed to gain privileges.
   */
  const register = async ({ name, username, email, password }) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim(), username: username.trim(), role: "admin" } },
    });
    if (error) return { error: error.message };
    if (!data.session) {
      // "Confirm email" is on in the project: the account exists but cannot
      // sign in yet. Say so plainly instead of failing silently.
      await refreshAdminExists();
      return {
        notice:
          "Compte administrateur créé. Confirmez l'email reçu — ou désactivez « Confirm email » dans Supabase (Authentication → Providers → Email) — puis connectez-vous.",
      };
    }
    await refreshAdminExists();
    return { ok: true };
  };

  /**
   * Opens a login for an employee without disturbing the admin's own session —
   * `signUp` would otherwise swap the current session for the new account's.
   */
  const createWorkerAccount = async ({ workerId, fullName, username, email, password }) => {
    const client = createSignupClient();
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName?.trim() || "",
          username: username?.trim() || "",
          role: "worker",
          worker_id: workerId,
        },
      },
    });
    if (error) return { error: error.message };
    return { ok: true, userId: data.user?.id || "" };
  };

  const changePassword = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    return error ? { error: error.message } : { ok: true };
  };

  const logout = async () => {
    if (pending.current) await flush();
    await supabase.auth.signOut();
  };

  // ---- current user & permissions ----

  const currentWorker = useMemo(
    () => (db && session?.user ? db.workers.find((w) => w.userId === session.user.id) : null),
    [db, session]
  );

  const currentUser = useMemo(() => {
    if (!profile || !session?.user) return null;
    if (profile.role === "admin") {
      return {
        id: profile.id, name: profile.full_name, username: profile.username || "",
        email: profile.email || session.user.email, kind: "admin",
      };
    }
    return {
      id: currentWorker?.id || profile.worker_id || profile.id,
      userId: profile.id,
      name: currentWorker?.fullName || profile.full_name,
      username: profile.username || "",
      email: profile.email || session.user.email,
      kind: "worker",
      permissions: currentWorker?.permissions || profile.permissions || {},
    };
  }, [profile, session, currentWorker]);

  const can = (page, action = "view") => {
    if (!currentUser) return false;
    if (currentUser.kind === "admin") return true;
    const acts = currentUser.permissions?.[page];
    if (!acts) return false;
    if (action === "view") return true;
    return acts.includes(action) || !PAGE_ACTIONS[page]?.includes(action);
  };

  const value = {
    db: db || emptyDB(),
    status, loadError, saveState, reload: load,
    update, session, currentUser, currentWorker,
    login, register, logout, createWorkerAccount, changePassword,
    lang, setLang, t, can,
    // No administrator yet — the login screen offers to create one.
    needsSetup: !adminExists && !setupError,
    adminExists,
    setupError,
    resetData: async () => {
      const fresh = await resetRemoteDB();
      pending.current = null;
      clearTimeout(timer.current);
      setDb(fresh);
      setSaveState("saved");
    },
    restoreData: (data) => replaceAll(data),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

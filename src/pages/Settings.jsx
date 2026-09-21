import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Store, UserCog, Database, Upload, Download, RotateCcw, Check, Wrench, Loader2 } from "lucide-react";
import { useApp } from "../context";
import { supabase, uploadImage } from "../lib/supabase";
import { Btn, Field, Input, Textarea, PageHeader } from "../components/ui";

function Saved({ show }) {
  const { t } = useApp();
  return (
    <AnimatePresence>
      {show && (
        <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
          <Check size={13} /> {t("Enregistré avec succès")}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

export default function Settings() {
  const { db, update, t, currentUser, restoreData, resetData, changePassword } = useApp();
  const [tab, setTab] = useState("store");
  const [store, setStore] = useState({ ...db.settings });
  const [account, setAccount] = useState(() => ({
    name: currentUser?.name || "",
    username: currentUser?.username || "",
    email: currentUser?.email || "",
    password: "",
  }));
  const [saved, setSaved] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const fileRef = useRef(null);
  const logoRef = useRef(null);

  const flash = (which) => { setSaved(which); setTimeout(() => setSaved(""), 2200); };

  const saveStore = () => { update((d) => { d.settings = { ...d.settings, ...store }; }); flash("store"); };

  /**
   * Le nom et l'identifiant vivent dans le profil ; le mot de passe, lui, n'est
   * connu que de Supabase Auth et se change par un appel dedie. Le champ reste
   * vide tant qu'on ne veut pas le modifier.
   */
  const saveAccount = async () => {
    setMsg("");
    setBusy("account");
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: account.name, username: account.username || null })
        .eq("id", currentUser.userId || currentUser.id);
      if (error) throw new Error(error.message);

      if (currentUser.kind === "worker") {
        update((d) => {
          const w = d.workers.find((x) => x.id === currentUser.id);
          if (!w) return;
          w.fullName = account.name;
          w.account = { ...w.account, username: account.username, email: account.email };
        });
      }

      if (account.password) {
        const res = await changePassword(account.password);
        if (res.error) throw new Error(res.error);
        setAccount((a) => ({ ...a, password: "" }));
      }
      flash("account");
    } catch (err) {
      setMsg(err.message || String(err));
    } finally {
      setBusy("");
    }
  };

  /**
   * Le logo part dans le bucket `logos` et seule son URL est stockee : une
   * facture imprimee ou un poste distant l'affiche alors sans transporter
   * l'image entiere dans chaque lecture de la base.
   */
  const onLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMsg("");
    setBusy("logo");
    try {
      const { url } = await uploadImage("logos", file);
      setStore((s) => ({ ...s, logo: url }));
      update((d) => { d.settings = { ...d.settings, logo: url }; });
      flash("store");
    } catch (err) {
      setMsg(err.message || String(err));
    } finally {
      setBusy("");
    }
  };

  // Destructive and irreversible — make the user confirm, and offer the backup first.
  const wipe = async () => {
    const ok = window.confirm(
      t("Toutes les données seront définitivement effacées. Pensez à faire une sauvegarde. Continuer ?")
    );
    if (!ok) return;
    try {
      await resetData();
    } catch {
      setMsg(t("La réinitialisation a échoué"));
      setTimeout(() => setMsg(""), 3000);
    }
  };

  const backup = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `garage-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const restore = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.clients) || !Array.isArray(data.repairs)) throw new Error("bad");
        restoreData(data);
        setMsg(t("Sauvegarde restaurée avec succès"));
      } catch {
        setMsg(t("Fichier de sauvegarde invalide"));
      }
      setTimeout(() => setMsg(""), 3000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const tabs = [
    { key: "store", label: t("Informations du magasin"), icon: Store },
    { key: "account", label: t("Mon compte"), icon: UserCog },
    { key: "db", label: t("Base de données"), icon: Database },
  ];

  return (
    <div>
      <PageHeader title={t("Paramètres")} subtitle={t("Configurez votre application")} />

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tb) => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
              tab === tb.key ? "text-white" : "bg-white border border-primary-100 text-slate-500 hover:text-primary-700"
            }`}>
            {tab === tb.key && (
              <motion.span layoutId="settings-tab" className="absolute inset-0 rounded-xl grad-primary shadow-lift"
                transition={{ type: "spring", stiffness: 400, damping: 32 }} />
            )}
            <tb.icon size={15} className="relative z-10" />
            <span className="relative z-10">{tb.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>
          {tab === "store" && (
            <div className="card max-w-3xl p-6">
              <div className="mb-6 flex items-center gap-5">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-primary-200 bg-primary-50">
                  {store.logo ? <img src={store.logo} alt="logo" className="h-full w-full object-cover" /> : <Wrench size={28} className="text-primary-300" />}
                </div>
                <div>
                  <p className="label mb-2">{t("Logo")}</p>
                  <Btn variant="soft" icon={busy === "logo" ? undefined : Upload}
                    disabled={busy === "logo"} onClick={() => logoRef.current?.click()}>
                    {busy === "logo" && <Loader2 size={15} className="animate-spin" />}
                    {busy === "logo" ? t("Envoi…") : t("Changer le logo")}
                  </Btn>
                  <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={onLogo} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t("Nom du magasin")}>
                  <Input value={store.name} onChange={(e) => setStore({ ...store, name: e.target.value })} />
                </Field>
                <Field label={t("Email")}>
                  <Input type="email" value={store.email} onChange={(e) => setStore({ ...store, email: e.target.value })} />
                </Field>
                <Field label={t("Téléphone")}>
                  <Input value={store.phone} onChange={(e) => setStore({ ...store, phone: e.target.value })} />
                </Field>
                <Field label={t("Adresse")}>
                  <Input value={store.address} onChange={(e) => setStore({ ...store, address: e.target.value })} />
                </Field>
                <Field label={t("Description")} className="sm:col-span-2">
                  <Textarea value={store.description} onChange={(e) => setStore({ ...store, description: e.target.value })} />
                </Field>
                <Field label="NIF"><Input value={store.nif} onChange={(e) => setStore({ ...store, nif: e.target.value })} /></Field>
                <Field label="NIS"><Input value={store.nis} onChange={(e) => setStore({ ...store, nis: e.target.value })} /></Field>
                <Field label={t("Article")}><Input value={store.article} onChange={(e) => setStore({ ...store, article: e.target.value })} /></Field>
                <Field label="RC"><Input value={store.rc} onChange={(e) => setStore({ ...store, rc: e.target.value })} /></Field>
              </div>
              <div className="mt-6 flex items-center gap-3">
                <Btn onClick={saveStore}>{t("Enregistrer")}</Btn>
                <Saved show={saved === "store"} />
              </div>
            </div>
          )}

          {tab === "account" && (
            <div className="card max-w-xl p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t("Nom complet")}>
                  <Input value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} />
                </Field>
                <Field label={t("Nom d'utilisateur")}>
                  <Input value={account.username} onChange={(e) => setAccount({ ...account, username: e.target.value })} />
                </Field>
                <Field label={t("Email")} hint={t("L'email de connexion se change depuis Supabase")}>
                  <Input type="email" value={account.email} disabled />
                </Field>
                <Field label={t("Nouveau mot de passe")} hint={t("Laissez vide pour le conserver")}>
                  <Input type="password" autoComplete="new-password" value={account.password}
                    onChange={(e) => setAccount({ ...account, password: e.target.value })} />
                </Field>
              </div>
              <div className="mt-6 flex items-center gap-3">
                <Btn onClick={saveAccount} disabled={busy === "account"}>
                  {busy === "account" && <Loader2 size={15} className="animate-spin" />}
                  {t("Enregistrer")}
                </Btn>
                <Saved show={saved === "account"} />
              </div>
            </div>
          )}

          {tab === "db" && (
            <div className="card max-w-xl p-6">
              <div className="space-y-3">
                <Btn icon={Download} onClick={backup} className="w-full">{t("Sauvegarder (télécharger)")}</Btn>
                <Btn variant="soft" icon={Upload} onClick={() => fileRef.current?.click()} className="w-full">
                  {t("Restaurer une sauvegarde")}
                </Btn>
                <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={restore} />
                <Btn variant="danger" icon={RotateCcw} className="w-full" onClick={wipe}>
                  {t("Vider la base de données")}
                </Btn>
                <p className="text-center text-xs text-slate-400">
                  {t("Efface définitivement toutes les données et vous déconnecte.")}
                </p>
              </div>
              <AnimatePresence>
                {msg && (
                  <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="mt-4 rounded-xl bg-primary-50 px-4 py-2.5 text-center text-sm font-medium text-primary-700">
                    {msg}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

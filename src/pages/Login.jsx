import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import { Wrench, User, Mail, Lock, AtSign, Sparkles, Languages, Eye, EyeOff } from "lucide-react";
import { useApp } from "../context";
import { Btn, Field, Input } from "../components/ui";

// Emotion: animated gradient blobs behind the card
const float = keyframes`
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(40px, -30px) scale(1.08); }
  66% { transform: translate(-30px, 24px) scale(0.95); }
`;
const Blob = styled.div`
  position: absolute;
  border-radius: 9999px;
  filter: blur(70px);
  opacity: 0.5;
  animation: ${float} ${(p) => p.dur || 14}s ease-in-out infinite;
  animation-delay: ${(p) => p.delay || 0}s;
  pointer-events: none;
`;

export default function Login() {
  const { login, register, t, lang, setLang } = useApp();
  const [mode, setMode] = useState("login"); // login | register
  const [error, setError] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [form, setForm] = useState({ identifier: "", name: "", username: "", email: "", password: "" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    setError("");
    if (mode === "login") {
      if (!login(form.identifier, form.password)) setError(t("Identifiants incorrects"));
    } else {
      const res = register(form);
      if (res.error) setError(t(res.error));
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <Blob style={{ width: 420, height: 420, top: "-8%", insetInlineStart: "-5%", background: "#c4b5fd" }} dur={16} />
      <Blob style={{ width: 380, height: 380, bottom: "-10%", insetInlineEnd: "-4%", background: "#fdba74" }} dur={18} delay={2} />
      <Blob style={{ width: 300, height: 300, top: "40%", insetInlineStart: "55%", background: "#a5b4fc" }} dur={20} delay={4} />

      <div className="absolute top-5 end-5 z-20">
        <div className="inline-flex items-center gap-1 rounded-xl bg-white/80 border border-primary-100 p-1 shadow-soft backdrop-blur">
          <Languages size={14} className="ms-1.5 text-primary-400" />
          {["fr", "ar"].map((l) => (
            <button key={l} onClick={() => setLang(l)}
              className={`relative rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${lang === l ? "text-white" : "text-slate-500"}`}>
              {lang === l && (
                <motion.span layoutId="login-lang" className="absolute inset-0 rounded-lg grad-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }} />
              )}
              <span className="relative z-10">{l === "fr" ? "Français" : "العربية"}</span>
            </button>
          ))}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 24 }}
        className="relative z-10 w-full max-w-[420px]"
      >
        <div className="card overflow-hidden">
          <div className="grad-deep relative overflow-hidden px-8 pb-8 pt-9 text-center">
            <div className="pointer-events-none absolute -top-10 -end-10 h-40 w-40 rounded-full bg-fuchsia-500/25 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-14 -start-10 h-40 w-40 rounded-full bg-indigo-400/20 blur-2xl" />
            <motion.div
              initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 18 }}
              className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-white shadow-lift backdrop-blur">
              <Wrench size={30} />
            </motion.div>
            <h1 className="text-xl font-bold text-white">{t("AutoGarage Pro")}</h1>
            <p className="mt-1 text-xs text-white/60">{t("Gestion de garage automobile")}</p>
          </div>

          <div className="px-8 py-7">
            {/* Tabs */}
            <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-primary-50 p-1">
              {[["login", t("Connexion")], ["register", t("Créer un compte admin")]].map(([m, label]) => (
                <button key={m} onClick={() => { setMode(m); setError(""); }}
                  className={`relative rounded-lg px-2 py-2 text-[13px] font-semibold cursor-pointer transition-colors ${mode === m ? "text-white" : "text-slate-500"}`}>
                  {mode === m && (
                    <motion.span layoutId="login-tab" className="absolute inset-0 rounded-lg grad-primary"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }} />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              ))}
            </div>

            <form onSubmit={submit}>
              <AnimatePresence mode="wait">
                <motion.div key={mode} initial={{ opacity: 0, x: mode === "login" ? -18 : 18 }}
                  animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: mode === "login" ? 18 : -18 }}
                  transition={{ duration: 0.2 }} className="space-y-4">
                  {mode === "register" && (
                    <>
                      <Field label={t("Nom complet")} required>
                        <div className="relative">
                          <User size={15} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <Input className="input ps-10" required value={form.name} onChange={set("name")} />
                        </div>
                      </Field>
                      <Field label={t("Nom d'utilisateur")} required>
                        <div className="relative">
                          <AtSign size={15} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <Input className="input ps-10" required value={form.username} onChange={set("username")} />
                        </div>
                      </Field>
                      <Field label={t("Email")} required>
                        <div className="relative">
                          <Mail size={15} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <Input className="input ps-10" type="email" required value={form.email} onChange={set("email")} />
                        </div>
                      </Field>
                    </>
                  )}
                  {mode === "login" && (
                    <Field label={t("Email ou nom d'utilisateur")} required>
                      <div className="relative">
                        <User size={15} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input className="input ps-10" required value={form.identifier} onChange={set("identifier")} autoComplete="username" />
                      </div>
                    </Field>
                  )}
                  <Field label={t("Mot de passe")} required>
                    <div className="relative">
                      <Lock size={15} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input className="input ps-10 pe-10" type={showPwd ? "text" : "password"} required
                        value={form.password} onChange={set("password")} autoComplete="current-password" />
                      <button type="button" onClick={() => setShowPwd(!showPwd)} aria-label="toggle password"
                        className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary-600 cursor-pointer">
                        {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </Field>
                </motion.div>
              </AnimatePresence>

              <AnimatePresence>
                {error && (
                  <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} role="alert"
                    className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <Btn type="submit" className="mt-5 w-full">
                {mode === "login" ? t("Se connecter") : t("Créer un compte")}
              </Btn>
            </form>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-primary-100" />
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Demo</span>
              <div className="h-px flex-1 bg-primary-100" />
            </div>

            <Btn variant="accent" icon={Sparkles} className="w-full"
              onClick={() => login("demo", "demo123")}>
              {t("Compte démo (Admin)")}
            </Btn>
          </div>
        </div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="mt-4 text-center text-xs text-slate-400">
          {t("Gérez votre garage simplement : rendez-vous, réparations, stock, achats et plus.")}
        </motion.p>
      </motion.div>
    </div>
  );
}

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Les données vivent désormais dans Supabase : le front n'a plus d'API locale à
// atteindre, `vite dev` suffit. `host: true` expose le serveur sur le réseau
// local pour tester depuis un téléphone — attention, la caméra du scanner exige
// une origine sécurisée (https, ou localhost).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    // Le lecteur de codes-barres et le client Supabase sont volumineux et
    // changent rarement : les isoler garde le cache du navigateur utile.
    rollupOptions: {
      output: {
        manualChunks: {
          supabase: ["@supabase/supabase-js"],
          zxing: ["@zxing/browser", "@zxing/library"],
        },
      },
    },
  },
});

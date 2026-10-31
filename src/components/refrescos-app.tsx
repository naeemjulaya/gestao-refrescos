"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  Plus,
  BarChart3,
  Package,
  ScrollText,
  Wifi,
  WifiOff,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { initDatabase } from "@/lib/localdb";
import { todayLabel } from "@/lib/format";
import Dashboard from "./dashboard";
import NewSession from "./new-session";
import HistoryTab from "./history-tab";
import ProductsTab from "./products-tab";
import AuditTab from "./audit-tab";

export type Tab = "painel" | "conta" | "historico" | "produtos" | "auditoria";

const NAV_ITEMS: { key: Tab; label: string; icon: typeof Home }[] = [
  { key: "painel", label: "Início", icon: Home },
  { key: "historico", label: "Histórico", icon: BarChart3 },
  { key: "conta", label: "Nova Conta", icon: Plus },
  { key: "produtos", label: "Produtos", icon: Package },
  { key: "auditoria", label: "Auditoria", icon: ScrollText },
];

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

const subscribeNoop = () => () => {};

export default function RefrescosApp() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("painel");
  const [refreshKey, setRefreshKey] = useState(0);
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );
  const dateLabel = useSyncExternalStore(
    subscribeNoop,
    () => todayLabel(),
    () => "A carregar…"
  );

  useEffect(() => {
    // Regista o service worker para funcionar offline
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    initDatabase()
      .then(() => setReady(true))
      .catch((e) => {
        console.error(e);
        setInitError(String(e));
        setReady(true);
      });
  }, []);

  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  const go = useCallback((t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
          <Loader2 className="h-7 w-7 text-white animate-spin" />
        </div>
        <p className="text-sm text-muted-foreground">A preparar a base de dados…</p>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-center text-sm text-muted-foreground">
          Não foi possível abrir a base de dados local. Verifique se o navegador
          permite armazenamento de dados e tente novamente.
        </p>
        <p className="text-xs text-muted-foreground/70">{initError}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-md min-h-screen flex flex-col bg-background shadow-sm">
        {/* Cabeçalho */}
        <header className="sticky top-0 z-40 bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700 text-white px-4 pt-4 pb-5 rounded-b-3xl">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold leading-tight">
                Gestão de Refrescos
              </h1>
              <p className="text-xs text-orange-100 mt-0.5" suppressHydrationWarning>
                {dateLabel}
              </p>
            </div>
            <span
              className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium backdrop-blur"
              suppressHydrationWarning
            >
              {!online ? (
                <>
                  <WifiOff className="h-3 w-3" /> Offline
                </>
              ) : (
                <>
                  <Wifi className="h-3 w-3" /> Online
                </>
              )}
            </span>
          </div>
        </header>

        {/* Conteúdo */}
        <main className="flex-1 px-4 pt-4 pb-28">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.16 }}
            >
              {tab === "painel" && (
                <Dashboard refreshKey={refreshKey} onNewSession={() => go("conta")} />
              )}
              {tab === "conta" && (
                <NewSession
                  refreshKey={refreshKey}
                  onSaved={() => {
                    bump();
                    go("historico");
                  }}
                  onDone={() => {
                    bump();
                    go("painel");
                  }}
                  onGoProducts={() => go("produtos")}
                />
              )}
              {tab === "historico" && (
                <HistoryTab
                  refreshKey={refreshKey}
                  onNewSession={() => go("conta")}
                />
              )}
              {tab === "produtos" && <ProductsTab refreshKey={refreshKey} />}
              {tab === "auditoria" && <AuditTab refreshKey={refreshKey} />}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Navegação inferior */}
        <nav
          className="fixed bottom-0 inset-x-0 z-40"
          aria-label="Navegação principal"
        >
          <div className="mx-auto w-full max-w-md border-t border-orange-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
            <div className="grid grid-cols-5">
              {NAV_ITEMS.map((item) => {
                const active = tab === item.key;
                if (item.key === "conta") {
                  return (
                    <button
                      key={item.key}
                      onClick={() => go(item.key)}
                      className="flex flex-col items-center justify-end pb-2 pt-1"
                      aria-label="Nova conta"
                    >
                      <span
                        className={`-mt-6 flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg transition-colors ${
                          active
                            ? "bg-orange-700 shadow-orange-700/40"
                            : "bg-orange-600 shadow-orange-600/40"
                        }`}
                      >
                        <Plus className="h-7 w-7 text-white" strokeWidth={2.5} />
                      </span>
                      <span
                        className={`mt-0.5 text-[10px] font-medium ${
                          active ? "text-orange-700" : "text-muted-foreground"
                        }`}
                      >
                        Nova Conta
                      </span>
                    </button>
                  );
                }
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    onClick={() => go(item.key)}
                    aria-current={active ? "page" : undefined}
                    className="flex flex-col items-center gap-1 pb-2 pt-3 min-h-[44px]"
                  >
                    <Icon
                      className={`h-5 w-5 transition-colors ${
                        active ? "text-orange-600" : "text-muted-foreground"
                      }`}
                    />
                    <span
                      className={`text-[10px] font-medium transition-colors ${
                        active ? "text-orange-700" : "text-muted-foreground"
                      }`}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}

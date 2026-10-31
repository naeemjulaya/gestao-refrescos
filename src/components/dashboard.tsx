"use client";

import { useEffect, useState } from "react";
import {
  Calculator,
  Package,
  Share2,
  X,
  Download,
  CalendarClock,
} from "lucide-react";
import { getDb } from "@/lib/localdb";
import type { Product, AccountingSession } from "@/lib/types";
import { productEconomics } from "@/lib/calc";
import {
  mt,
  fmtInt,
  fmtDateLong,
  daysAgo,
  monthStartISO,
  fmtDate,
} from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function StatMini({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "green" | "orange" | "amber";
}) {
  const tones: Record<string, string> = {
    neutral: "text-foreground",
    green: "text-emerald-600",
    orange: "text-orange-600",
    amber: "text-amber-600",
  };
  return (
    <div className="rounded-xl bg-orange-50/70 px-3 py-2.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={`text-base font-bold tabular-nums ${tones[tone]}`}>{value}</p>
    </div>
  );
}

export default function Dashboard({
  refreshKey,
  onNewSession,
}: {
  refreshKey: number;
  onNewSession: () => void;
}) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [sessions, setSessions] = useState<AccountingSession[] | null>(null);
  const [installEvt, setInstallEvt] = useState<Event | null>(null);
  const [installDismissed, setInstallDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    const db = getDb();
    Promise.all([db.products.toArray(), db.sessions.toArray()]).then(
      ([ps, ss]) => {
        if (!alive) return;
        setProducts(ps.filter((p) => !p.archived).sort((a, b) => a.id! - b.id!));
        setSessions(
          [...ss].sort(
            (a, b) =>
              b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
          )
        );
      }
    );
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const isStandalone =
    typeof window !== "undefined" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const isIOS =
    typeof window !== "undefined" &&
    /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const showInstall =
    !isStandalone && !installDismissed && (installEvt !== null || isIOS);

  if (!products || !sessions) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl bg-orange-100/60"
          />
        ))}
      </div>
    );
  }

  const last = sessions[0];
  const monthSessions = sessions.filter((s) => s.date >= monthStartISO());
  const monthRevenue = monthSessions.reduce((s, x) => s + x.revenue, 0);
  const monthProfit = monthSessions.reduce((s, x) => s + x.profit, 0);
  const monthInvest = monthSessions.reduce((s, x) => s + x.purchaseCost, 0);

  const totalCostValue = products.reduce(
    (s, p) => s + productEconomics(p).stockCostValue,
    0
  );
  const totalRetailValue = products.reduce(
    (s, p) => s + productEconomics(p).stockRetailValue,
    0
  );

  return (
    <div className="space-y-4">
      {/* Ação principal */}
      <Card className="border-0 bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25">
        <CardContent className="p-5">
          <p className="text-sm text-orange-100">
            Conte o stock atual e a app calcula tudo:
          </p>
          <h2 className="mt-1 text-lg font-bold leading-snug">
            Faturamento, lucro das vendas e compras para repor o stock
          </h2>
          <Button
            onClick={onNewSession}
            size="lg"
            className="mt-4 h-12 w-full bg-white text-orange-700 shadow-md hover:bg-orange-50 hover:text-orange-800"
          >
            <Calculator className="mr-2 h-5 w-5" />
            Fazer nova conta
          </Button>
        </CardContent>
      </Card>

      {/* Última conta */}
      {last ? (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Última conta</h3>
              <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                <CalendarClock className="mr-1 h-3 w-3" />
                faz {daysAgo(last.date)} {daysAgo(last.date) === 1 ? "dia" : "dias"}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {fmtDateLong(last.date)}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <StatMini label="Faturamento" value={mt(last.revenue)} tone="orange" />
              <StatMini label="Lucro" value={mt(last.profit)} tone="green" />
              <StatMini
                label="Em mão após compras"
                value={mt(last.netCash)}
                tone="neutral"
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Ainda não fez nenhuma conta. A primeira contagem calcula as vendas
              a partir do stock inicial registado.
            </p>
            <Button
              onClick={onNewSession}
              variant="outline"
              className="mt-3 border-orange-300 text-orange-700 hover:bg-orange-50"
            >
              Fazer a primeira conta
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Este mês */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold">Este mês ({monthSessions.length} {monthSessions.length === 1 ? "conta" : "contas"})</h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <StatMini label="Faturamento" value={mt(monthRevenue)} tone="orange" />
            <StatMini label="Lucro" value={mt(monthProfit)} tone="green" />
            <StatMini label="Investido" value={mt(monthInvest)} tone="amber" />
          </div>
        </CardContent>
      </Card>

      {/* Stock atual */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Stock atual</h3>
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
              <Package className="mr-1 h-3 w-3" />
              {fmtInt(products.reduce((s, p) => s + p.stock, 0))} garrafas
            </Badge>
          </div>
          <ul className="mt-3 space-y-2">
            {products.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl bg-orange-50/70 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium leading-tight">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {mt(productEconomics(p).stockCostValue)} em stock
                  </p>
                </div>
                <p className="text-xl font-bold tabular-nums text-orange-700">
                  {fmtInt(p.stock)}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-dashed pt-3 text-xs">
            <span className="text-muted-foreground">
              Valor ao custo: <strong className="text-foreground">{mt(totalCostValue)}</strong>
            </span>
            <span className="text-muted-foreground">
              Venda potencial: <strong className="text-emerald-700">{mt(totalRetailValue)}</strong>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Instalar no telemóvel */}
      {showInstall && (
        <Card className="border-orange-200 bg-orange-50/60">
          <CardContent className="flex items-start gap-3 p-4">
            <Download className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold">Instalar no telemóvel</h3>
              {installEvt ? (
                <>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Adicione a app ao ecrã principal para abrir mais rápido e usar
                    sem internet.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => {
                      const evt = installEvt as unknown as { prompt: () => void };
                      evt.prompt();
                      setInstallDismissed(true);
                    }}
                    className="mt-2 h-9 bg-orange-600 hover:bg-orange-700"
                  >
                    <Share2 className="mr-1.5 h-4 w-4" />
                    Instalar agora
                  </Button>
                </>
              ) : (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  No Safari, toque em <strong>Partilhar</strong> e depois em{" "}
                  <strong>&quot;Adicionar ao ecrã principal&quot;</strong>.
                </p>
              )}
            </div>
            <button
              onClick={() => setInstallDismissed(true)}
              aria-label="Dispensar"
              className="rounded-full p-1 text-muted-foreground hover:bg-orange-100"
            >
              <X className="h-4 w-4" />
            </button>
          </CardContent>
        </Card>
      )}

      {sessions.length > 0 && (
        <p className="px-1 text-center text-[11px] text-muted-foreground">
          Primeira conta: {fmtDate(sessions[sessions.length - 1].date)} · Última:{" "}
          {fmtDate(sessions[0].date)}
        </p>
      )}
    </div>
  );
}

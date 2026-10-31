"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  ChevronDown,
  Trash2,
  Calculator,
  PackageOpen,
  CalendarDays,
} from "lucide-react";
import { getDb, addAudit } from "@/lib/localdb";
import type { AccountingSession } from "@/lib/types";
import { mt, fmtInt, fmtDate, fmtDateLong, daysAgo } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const FILTERS = [
  { key: "tudo", label: "Tudo", days: Infinity },
  { key: "7", label: "7 dias", days: 7 },
  { key: "14", label: "14 dias", days: 14 },
  { key: "30", label: "30 dias", days: 30 },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export default function HistoryTab({
  refreshKey,
  onNewSession,
}: {
  refreshKey: number;
  onNewSession: () => void;
}) {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<AccountingSession[] | null>(null);
  const [filter, setFilter] = useState<FilterKey>("tudo");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    getDb()
      .sessions.toArray()
      .then((ss) => {
        if (!alive) return;
        setSessions(
          [...ss].sort(
            (a, b) =>
              b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
          )
        );
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    if (!sessions) return [];
    return sessions.filter((s) => daysAgo(s.date) <= f.days);
  }, [sessions, filter]);

  const chartData = useMemo(
    () =>
      [...filtered]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((s) => ({
          data: fmtDate(s.date).slice(0, 5),
          Faturamento: Math.round(s.revenue * 100) / 100,
          Lucro: Math.round(s.profit * 100) / 100,
          Investido: Math.round(s.purchaseCost * 100) / 100,
        })),
    [filtered]
  );

  const totals = useMemo(() => {
    const revenue = filtered.reduce((s, x) => s + x.revenue, 0);
    const profit = filtered.reduce((s, x) => s + x.profit, 0);
    const invest = filtered.reduce((s, x) => s + x.purchaseCost, 0);
    const cogs = filtered.reduce((s, x) => s + x.cogs, 0);
    const perProduct: Record<string, number> = {};
    for (const s of filtered) {
      for (const i of s.items) {
        perProduct[i.productName] = (perProduct[i.productName] ?? 0) + i.sold;
      }
    }
    return { revenue, profit, invest, cogs, perProduct };
  }, [filtered]);

  const deleteSession = async (s: AccountingSession) => {
    const db = getDb();
    const now = new Date().toISOString();
    await db.transaction("rw", db.products, db.sessions, db.audit, async () => {
      for (const it of s.items) {
        const p = await db.products.get(it.productId);
        if (p) {
          await db.products.update(it.productId, {
            stock: it.expectedStock,
            updatedAt: now,
          });
        }
      }
      await db.sessions.delete(s.id!);
      await db.audit.add({
        ts: now,
        type: "dados",
        title: `Conta de ${fmtDateLong(s.date)} eliminada`,
        details: `Registo removido (faturamento ${mt(s.revenue)}, lucro ${mt(
          s.profit
        )}). Stock dos produtos reposto para os valores anteriores à contagem.`,
      });
    });
    const ss = await db.sessions.toArray();
    setSessions(
      [...ss].sort(
        (a, b) =>
          b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
      )
    );
    toast({ title: "Conta eliminada", description: "Stock reposto e auditoria atualizada." });
  };

  if (!sessions) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-orange-100/60" />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center p-6 text-center">
          <PackageOpen className="h-10 w-10 text-orange-400" />
          <p className="mt-2 text-sm text-muted-foreground">
            O histórico aparece aqui depois da sua primeira conta.
          </p>
          <Button onClick={onNewSession} className="mt-3 bg-orange-600 hover:bg-orange-700">
            Fazer a primeira conta
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
              filter === f.key
                ? "bg-orange-600 text-white shadow-sm shadow-orange-600/30"
                : "bg-white text-muted-foreground border border-orange-100 hover:bg-orange-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Totais do período */}
      <Card>
        <CardContent className="p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <CalendarDays className="h-4 w-4 text-orange-600" />
            Totais ({filtered.length} {filtered.length === 1 ? "conta" : "contas"})
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-orange-50/70 px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">Faturamento</p>
              <p className="text-base font-bold tabular-nums text-orange-700">
                {mt(totals.revenue)}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">Lucro das vendas</p>
              <p className="text-base font-bold tabular-nums text-emerald-600">
                {mt(totals.profit)}
              </p>
            </div>
            <div className="rounded-xl bg-amber-50 px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">Investido em stock</p>
              <p className="text-base font-bold tabular-nums text-amber-600">
                {mt(totals.invest)}
              </p>
            </div>
            <div className="rounded-xl bg-orange-50/70 px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">Custo das vendas</p>
              <p className="text-base font-bold tabular-nums">
                {mt(totals.cogs)}
              </p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(totals.perProduct).map(([name, qtd]) => (
              <Badge
                key={name}
                variant="secondary"
                className="bg-white text-[11px] font-normal text-muted-foreground"
              >
                {name}: {fmtInt(qtd)} vendidos
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Gráfico */}
      {chartData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold">Evolução das contas</h3>
            <div className="mt-2 h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F5D5BE" vertical={false} />
                  <XAxis dataKey="data" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <Tooltip
                    formatter={(value) => mt(Number(value))}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #F5D5BE",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Faturamento" fill="#EA580C" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Lucro" fill="#059669" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Investido" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de contas */}
      {filtered.map((s, idx) => {
        const isOpen = expanded === s.id;
        const isLatest = idx === 0 && filter === "tudo" ? sessions[0]?.id === s.id : sessions[0]?.id === s.id;
        return (
          <Card key={s.id}>
            <CardContent className="p-4">
              <button
                onClick={() => setExpanded(isOpen ? null : s.id!)}
                className="flex w-full items-center justify-between gap-2 text-left"
                aria-expanded={isOpen}
              >
                <div>
                  <h3 className="text-sm font-bold">{fmtDateLong(s.date)}</h3>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtInt(s.items.reduce((a, i) => a + i.sold, 0))} garrafas vendidas
                    {s.notes ? ` · ${s.notes}` : ""}
                  </p>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-orange-50/70 px-2 py-2">
                  <p className="text-[10px] text-muted-foreground">Faturamento</p>
                  <p className="text-sm font-bold tabular-nums text-orange-700">
                    {mt(s.revenue)}
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-50 px-2 py-2">
                  <p className="text-[10px] text-muted-foreground">Lucro</p>
                  <p className="text-sm font-bold tabular-nums text-emerald-600">
                    {mt(s.profit)}
                  </p>
                </div>
                <div className="rounded-lg bg-amber-50 px-2 py-2">
                  <p className="text-[10px] text-muted-foreground">Investido</p>
                  <p className="text-sm font-bold tabular-nums text-amber-600">
                    {mt(s.purchaseCost)}
                  </p>
                </div>
              </div>

              {isOpen && (
                <div className="mt-3 border-t border-dashed pt-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="pb-1 font-medium">Produto</th>
                        <th className="pb-1 text-right font-medium">Vend.</th>
                        <th className="pb-1 text-right font-medium">Fatur.</th>
                        <th className="pb-1 text-right font-medium">Lucro</th>
                        <th className="pb-1 text-right font-medium">Fardos</th>
                        <th className="pb-1 text-right font-medium">Stock</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {s.items.map((i) => (
                        <tr key={i.productId} className="border-t border-dashed">
                          <td className="py-1.5 pr-2 font-medium">{i.productName}</td>
                          <td className="py-1.5 text-right">{fmtInt(i.sold)}</td>
                          <td className="py-1.5 text-right">{mt(i.revenue)}</td>
                          <td className="py-1.5 text-right text-emerald-600">
                            {mt(i.profit)}
                          </td>
                          <td className="py-1.5 text-right">{fmtInt(i.packsPurchased)}</td>
                          <td className="py-1.5 text-right font-semibold">
                            {fmtInt(i.stockAfter)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Em mão após compras: <strong className="text-foreground">{mt(s.netCash)}</strong>
                    {s.notes && (
                      <>
                        {" · "}Observações: {s.notes}
                      </>
                    )}
                  </p>

                  {isLatest && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 h-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Eliminar esta conta
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="max-w-md">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminar a conta de {fmtDate(s.date)}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação remove o registo do histórico e repõe o stock
                            dos produtos para os valores antes da contagem. A
                            eliminação fica registada na auditoria. Só a conta mais
                            recente pode ser eliminada.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteSession(s)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <p className="px-1 text-center text-[11px] text-muted-foreground">
        <Calculator className="mr-1 inline h-3 w-3" />
        Cada conta guarda o stock contado, as vendas e as compras com a respetiva data.
      </p>
    </div>
  );
}

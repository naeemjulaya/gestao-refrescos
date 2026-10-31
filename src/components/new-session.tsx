"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
  ShoppingCart,
  Loader2,
  PackageOpen,
  ArrowRight,
  Download,
} from "lucide-react";
import { getDb, addAudit } from "@/lib/localdb";
import type { Product, AccountingSession } from "@/lib/types";
import { computeSession, toSessionItems } from "@/lib/calc";
import { mt, fmtInt, fmtDateLong, todayISO } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type StrMap = Record<number, string>;

function toInt(s: string | undefined): number {
  const n = parseInt(s ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function toCounts(
  counted: StrMap,
  breakage: StrMap,
  packs: StrMap
): { counted: Record<number, number>; breakage: Record<number, number>; packs: Record<number, number> } {
  const out: Record<number, number> = {};
  const outB: Record<number, number> = {};
  const outP: Record<number, number> = {};
  for (const k of Object.keys(counted)) out[Number(k)] = toInt(counted[Number(k)]);
  for (const k of Object.keys(breakage)) outB[Number(k)] = toInt(breakage[Number(k)]);
  for (const k of Object.keys(packs)) outP[Number(k)] = toInt(packs[Number(k)]);
  return { counted: out, breakage: outB, packs: outP };
}

function downloadPurchaseReport(session: AccountingSession) {
  const purchases = session.items.filter((item) => item.packsPurchased > 0);
  const lines = [
    "PEDIDO DE REPOSIÇÃO DE STOCK",
    `Data: ${fmtDateLong(session.date)}`,
    "",
    "Comprar:",
    ...(purchases.length > 0
      ? purchases.map(
          (item) =>
            `- ${item.productName}: ${item.packsPurchased} fardo(s) × ${mt(
              item.purchaseCost / item.packsPurchased
            )} = ${mt(item.purchaseCost)} | stock após compra: ${fmtInt(
              item.stockAfter
            )} garrafas`
        )
      : ["- Não é necessário comprar stock nesta conta."]),
    "",
    `Faturamento recebido: ${mt(session.revenue)}`,
    `Valor para comprar stock: ${mt(session.purchaseCost)}`,
    `Dinheiro que sobra para entregar: ${mt(session.netCash)}`,
    "",
    "Resumo: entregue o valor de compra acima para repor o stock e envie o dinheiro que sobra.",
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pedido-stock-${session.date}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function NewSession({
  refreshKey,
  onSaved,
  onDone,
  onGoProducts,
}: {
  refreshKey: number;
  onSaved: () => void;
  onDone: () => void;
  onGoProducts: () => void;
}) {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [date, setDate] = useState<string>(todayISO());
  const [counted, setCounted] = useState<StrMap>({});
  const [breakage, setBreakage] = useState<StrMap>({});
  const [packs, setPacks] = useState<StrMap>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<AccountingSession | null>(null);

  useEffect(() => {
    let alive = true;
    getDb()
      .products.toArray()
      .then((ps) => {
        if (!alive) return;
        setProducts(ps.filter((p) => !p.archived).sort((a, b) => a.id! - b.id!));
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const computed = useMemo(
    () => computeSession(products ?? [], toCounts(counted, breakage, packs)),
    [products, counted, breakage, packs]
  );

  const hasMissing =
    (products ?? []).some((p) => (counted[p.id!] ?? "").trim() === "");

  const fixExpectedStock = async (item: (typeof computed.items)[number]) => {
    const db = getDb();
    const newStock = item.counted + item.breakage;
    const now = new Date().toISOString();
    await db.products.update(item.product.id!, { stock: newStock, updatedAt: now });
    await addAudit(
      "ajuste",
      `Stock corrigido durante a contagem — ${item.product.name}`,
      `Stock registado alterado de ${item.expectedStock} para ${newStock} un. (igual à contagem feita).`
    );
    const ps = await db.products.toArray();
    setProducts(ps.filter((p) => !p.archived).sort((a, b) => a.id! - b.id!));
    toast({
      title: "Stock corrigido",
      description: `${item.product.name}: ${item.expectedStock} → ${newStock} un.`,
    });
  };

  const saveSession = async () => {
    if (!products || computed.hasInvalid || hasMissing) return;
    setSaving(true);
    try {
      const db = getDb();
      const now = new Date().toISOString();
      const items = toSessionItems(computed.items);
      const session: AccountingSession = {
        date,
        items,
        revenue: computed.revenue,
        cogs: computed.cogs,
        profit: computed.profit,
        purchaseCost: computed.purchaseCost,
        netCash: computed.netCash,
        notes: notes.trim(),
        createdAt: now,
      };

      await db.transaction("rw", db.products, db.sessions, db.audit, async () => {
        for (const it of items) {
          await db.products.update(it.productId, {
            stock: it.stockAfter,
            updatedAt: now,
          });
        }
        const id = await db.sessions.add(session);
        session.id = id;

        const soldTxt = items
          .map((i) => `${i.productName}: ${i.sold} un.`)
          .join("; ");
        await db.audit.add({
          ts: now,
          type: "conta",
          title: `Conta de ${fmtDateLong(date)}`,
          details: `Vendidos: ${soldTxt}. Faturamento ${mt(
            computed.revenue
          )} · Lucro ${mt(computed.profit)} · Investido ${mt(
            computed.purchaseCost
          )} · Em mão ${mt(computed.netCash)}.`,
        });

        if (computed.purchaseCost > 0) {
          const buyTxt = items
            .filter((i) => i.packsPurchased > 0)
            .map(
              (i) =>
                `${i.productName}: ${i.packsPurchased} fardo(s) = ${mt(
                  i.purchaseCost
                )}`
            )
            .join("; ");
          await db.audit.add({
            ts: now,
            type: "compra",
            title: `Compra de fardos — ${fmtDateLong(date)}`,
            details: `${buyTxt}. Total: ${mt(computed.purchaseCost)}.`,
          });
        }
      });

      setSaved(session);
      toast({
        title: "Conta guardada",
        description: `Faturamento ${mt(computed.revenue)} · Lucro ${mt(
          computed.profit
        )}`,
      });
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="space-y-4">
        <Card className="border-emerald-200 bg-emerald-50/60">
          <CardContent className="flex flex-col items-center p-6 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-600" />
            <h2 className="mt-2 text-lg font-bold">Conta guardada!</h2>
            <p className="text-xs text-muted-foreground">
              {fmtDateLong(saved.date)} — stock e auditoria atualizados
            </p>
            <div className="mt-4 grid w-full grid-cols-2 gap-2">
              <div className="rounded-xl bg-white px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">Faturamento</p>
                <p className="text-base font-bold tabular-nums text-orange-600">
                  {mt(saved.revenue)}
                </p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">Lucro das vendas</p>
                <p className="text-base font-bold tabular-nums text-emerald-600">
                  {mt(saved.profit)}
                </p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">Investido</p>
                <p className="text-base font-bold tabular-nums text-amber-600">
                  {mt(saved.purchaseCost)}
                </p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">Em mão</p>
                <p className="text-base font-bold tabular-nums">
                  {mt(saved.netCash)}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {saved.items.map((i) => (
                <Badge
                  key={i.productId}
                  variant="secondary"
                  className="bg-white text-[11px] font-normal"
                >
                  {i.productName}: {fmtInt(i.stockAfter)} un.
                </Badge>
              ))}
            </div>
            <Button
              variant="outline"
              onClick={() => downloadPurchaseReport(saved)}
              className="mt-4 h-10 border-orange-200 bg-white text-orange-700 hover:bg-orange-50"
            >
              <Download className="mr-2 h-4 w-4" />
              Baixar pedido de compra (TXT)
            </Button>
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={onDone} className="h-12">
            Voltar ao painel
          </Button>
          <Button onClick={onSaved} className="h-12 bg-orange-600 hover:bg-orange-700">
            Ver histórico
          </Button>
        </div>
      </div>
    );
  }

  if (!products) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-orange-100/60" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center p-6 text-center">
          <PackageOpen className="h-10 w-10 text-orange-400" />
          <p className="mt-2 text-sm text-muted-foreground">
            Não há produtos ativos. Cadastre os seus refrescos para começar a
            fazer contas.
          </p>
          <Button onClick={onGoProducts} className="mt-3 bg-orange-600 hover:bg-orange-700">
            Ir para Produtos
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Passos */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
          {step === 1 && "Passo 1 de 3 · Contagem"}
          {step === 2 && "Passo 2 de 3 · Compras"}
          {step === 3 && "Passo 3 de 3 · Resumo"}
        </p>
        <div className="flex gap-1">
          {[1, 2, 3].map((s) => (
            <span
              key={s}
              className={`h-1.5 w-6 rounded-full transition-colors ${
                s <= step ? "bg-orange-500" : "bg-orange-200"
              }`}
            />
          ))}
        </div>
      </div>

      {/* PASSO 1 — Contagem */}
      {step === 1 && (
        <>
          <Card>
            <CardContent className="p-4">
              <label
                htmlFor="data-contagem"
                className="flex items-center gap-1.5 text-sm font-semibold"
              >
                <Calendar className="h-4 w-4 text-orange-600" />
                Data da contagem
              </label>
              <Input
                id="data-contagem"
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                className="mt-2 h-11"
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Dia em que fez as contas — fica registado na auditoria.
              </p>
            </CardContent>
          </Card>

          {computed.items.map((item) => (
            <Card key={item.product.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold">{item.product.name}</h3>
                  <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                    esperado: {fmtInt(item.expectedStock)} un.
                  </Badge>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor={`contado-${item.product.id}`}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Stock contado (garrafas)
                    </label>
                    <Input
                      id={`contado-${item.product.id}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      placeholder="0"
                      value={counted[item.product.id!] ?? ""}
                      onChange={(e) =>
                        setCounted((m) => ({ ...m, [item.product.id!]: e.target.value }))
                      }
                      className="mt-1 h-12 text-lg font-bold tabular-nums"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`quebras-${item.product.id}`}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Quebras/perdas (opcional)
                    </label>
                    <Input
                      id={`quebras-${item.product.id}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      placeholder="0"
                      value={breakage[item.product.id!] ?? ""}
                      onChange={(e) =>
                        setBreakage((m) => ({ ...m, [item.product.id!]: e.target.value }))
                      }
                      className="mt-1 h-12 text-lg font-bold tabular-nums"
                    />
                  </div>
                </div>

                {(counted[item.product.id!] ?? "").trim() === "" ? (
                  <p className="mt-2 text-xs text-amber-600">
                    Preencha a contagem deste produto (0 se não sobrou nenhum).
                  </p>
                ) : item.invalid ? (
                  <div className="mt-2 rounded-xl bg-red-50 p-3">
                    <p className="flex items-start gap-1.5 text-xs text-red-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Contado ({fmtInt(item.counted)}
                      {item.breakage > 0 && ` + ${fmtInt(item.breakage)} quebras`}) é
                      maior que o esperado ({fmtInt(item.expectedStock)}). Verifique
                      os números ou corrija o stock registado.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fixExpectedStock(item)}
                      className="mt-2 h-8 border-red-300 text-red-700 hover:bg-red-100"
                    >
                      Corrigir stock registado para {fmtInt(item.counted + item.breakage)}
                    </Button>
                  </div>
                ) : (
                  <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    Vendidos: <strong>{fmtInt(item.sold)} garrafas</strong> ·
                    Faturamento <strong>{mt(item.revenue)}</strong> · Lucro{" "}
                    <strong>{mt(item.profit)}</strong>
                  </p>
                )}
              </CardContent>
            </Card>
          ))}

          <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30">
            <Card className="border-orange-200 shadow-lg shadow-orange-900/10">
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex-1 text-xs">
                  <p className="text-muted-foreground">
                    Faturamento <strong className="text-orange-700">{mt(computed.revenue)}</strong>
                  </p>
                  <p className="text-muted-foreground">
                    Lucro <strong className="text-emerald-600">{mt(computed.profit)}</strong>
                  </p>
                </div>
                <Button
                  onClick={() => setStep(2)}
                  disabled={computed.hasInvalid || hasMissing}
                  className="h-11 bg-orange-600 px-5 hover:bg-orange-700"
                >
                  Continuar
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* PASSO 2 — Compras */}
      {step === 2 && (
        <>
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="flex items-start gap-2.5 p-4">
              <ShoppingCart className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <p className="text-xs leading-relaxed text-amber-900">
                Quantos <strong>fardos</strong> quer comprar para repor o stock? O
                total é descontado do dinheiro das vendas (reinvestimento). Se não
                quiser comprar nada, deixe 0.
              </p>
            </CardContent>
          </Card>

          {computed.items.map((item) => {
            const units = item.product.unitsPerPackage;
            return (
              <Card key={item.product.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold">{item.product.name}</h3>
                    <span className="text-xs text-muted-foreground">
                      fardo: {fmtInt(units)} garrafas · {mt(item.product.packageCost)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor={`fardos-${item.product.id}`}
                        className="text-xs font-medium text-muted-foreground"
                      >
                        Fardos a comprar
                      </label>
                      <Input
                        id={`fardos-${item.product.id}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        placeholder="0"
                        value={packs[item.product.id!] ?? ""}
                        onChange={(e) =>
                          setPacks((m) => ({ ...m, [item.product.id!]: e.target.value }))
                        }
                        className="mt-1 h-12 text-lg font-bold tabular-nums"
                      />
                    </div>
                    <div className="flex flex-col justify-end text-xs">
                      <p className="text-muted-foreground">
                        Custo:{" "}
                        <strong className="text-foreground">
                          {fmtInt(item.packsPurchased)} × {mt(item.product.packageCost)}
                        </strong>
                      </p>
                      <p className="text-muted-foreground">
                        Stock após compra:{" "}
                        <strong className="text-orange-700">
                          {fmtInt(item.stockAfter)} un.
                        </strong>
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30">
            <Card className="border-orange-200 shadow-lg shadow-orange-900/10">
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex-1 text-xs">
                  <p className="text-muted-foreground">
                    Investimento{" "}
                    <strong className="text-amber-600">{mt(computed.purchaseCost)}</strong>
                  </p>
                  <p className="text-muted-foreground">
                    Em mão{" "}
                    <strong className={computed.netCash < 0 ? "text-red-600" : "text-emerald-600"}>
                      {mt(computed.netCash)}
                    </strong>
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="h-11 px-3"
                  aria-label="Voltar à contagem"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  className="h-11 bg-orange-600 px-5 hover:bg-orange-700"
                >
                  Ver resumo
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* PASSO 3 — Resumo */}
      {step === 3 && (
        <>
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-bold">Resumo da conta de {fmtDateLong(date)}</h3>
              <table className="mt-3 w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-1 font-medium">Produto</th>
                    <th className="pb-1 text-right font-medium">Vendidos</th>
                    <th className="pb-1 text-right font-medium">Faturamento</th>
                    <th className="pb-1 text-right font-medium">Lucro</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {computed.items.map((i) => (
                    <tr key={i.product.id} className="border-t border-dashed">
                      <td className="py-1.5 pr-2 font-medium">{i.product.name}</td>
                      <td className="py-1.5 text-right">{fmtInt(i.sold)}</td>
                      <td className="py-1.5 text-right">{mt(i.revenue)}</td>
                      <td className="py-1.5 text-right text-emerald-600">
                        {mt(i.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 space-y-2 rounded-xl bg-orange-50/70 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Faturamento total</span>
                  <span className="font-bold tabular-nums text-orange-700">
                    {mt(computed.revenue)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Custo das garrafas vendidas
                  </span>
                  <span className="font-semibold tabular-nums">
                    {computed.cogs > 0 ? "−" : ""}
                    {mt(computed.cogs)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-dashed pt-2">
                  <span className="font-semibold">Lucro das vendas</span>
                  <span className="font-bold tabular-nums text-emerald-600">
                    {mt(computed.profit)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Compra de fardos</span>
                  <span className="font-semibold tabular-nums text-amber-600">
                    {computed.purchaseCost > 0 ? "−" : ""}
                    {mt(computed.purchaseCost)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-dashed pt-2">
                  <span className="font-semibold">Dinheiro em mão</span>
                  <span
                    className={`text-lg font-bold tabular-nums ${
                      computed.netCash < 0 ? "text-red-600" : "text-foreground"
                    }`}
                  >
                    {mt(computed.netCash)}
                  </span>
                </div>
              </div>

              <div className="mt-3">
                <label htmlFor="notas" className="text-xs font-medium text-muted-foreground">
                  Observações (opcional)
                </label>
                <Textarea
                  id="notas"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex.: faturas, dívidas por receber, acontecimentos do dia…"
                  className="mt-1 min-h-[64px] text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30">
            <Card className="border-orange-200 shadow-lg shadow-orange-900/10">
              <CardContent className="flex items-center gap-3 p-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  className="h-11 px-3"
                  aria-label="Voltar às compras"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  onClick={saveSession}
                  disabled={saving || computed.hasInvalid || hasMissing}
                  className="h-11 flex-1 bg-orange-600 hover:bg-orange-700"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      A guardar…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Guardar conta
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

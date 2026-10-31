"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  PackagePlus,
  Archive,
  ArchiveRestore,
  Tag,
} from "lucide-react";
import { getDb, addAudit } from "@/lib/localdb";
import type { Product } from "@/lib/types";
import { productEconomics } from "@/lib/calc";
import { mt, fmtInt } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface FormState {
  name: string;
  category: string;
  salePrice: string;
  packageCost: string;
  unitsPerPackage: string;
  stock: string;
  active: boolean;
}

const emptyForm: FormState = {
  name: "",
  category: "",
  salePrice: "",
  packageCost: "",
  unitsPerPackage: "6",
  stock: "0",
  active: true,
};

function formFromProduct(p: Product): FormState {
  return {
    name: p.name,
    category: p.category,
    salePrice: String(p.salePrice),
    packageCost: String(p.packageCost),
    unitsPerPackage: String(p.unitsPerPackage),
    stock: String(p.stock),
    active: !p.archived,
  };
}

export default function ProductsTab({ refreshKey }: { refreshKey: number }) {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [newStockStr, setNewStockStr] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const ps = await getDb().products.toArray();
    setProducts(ps.sort((a, b) => a.id! - b.id!));
  };

  useEffect(() => {
    reload();
  }, [refreshKey]);

  if (!products) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-orange-100/60" />
        ))}
      </div>
    );
  }

  const active = products.filter((p) => !p.archived);
  const archived = products.filter((p) => p.archived);
  const totalCostValue = active.reduce((s, p) => s + productEconomics(p).stockCostValue, 0);
  const totalRetailValue = active.reduce((s, p) => s + productEconomics(p).stockRetailValue, 0);

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm(formFromProduct(p));
  };

  const openAdd = () => {
    setAdding(true);
    setForm(emptyForm);
  };

  const parseForm = () => {
    const name = form.name.trim();
    const salePrice = parseFloat(form.salePrice.replace(",", "."));
    const packageCost = parseFloat(form.packageCost.replace(",", "."));
    const units = parseInt(form.unitsPerPackage, 10);
    const stock = parseInt(form.stock, 10);
    if (!name) return { error: "Indique o nome do produto." };
    if (!Number.isFinite(salePrice) || salePrice < 0)
      return { error: "Preço de venda inválido." };
    if (!Number.isFinite(packageCost) || packageCost < 0)
      return { error: "Custo da embalagem inválido." };
    if (!Number.isFinite(units) || units < 1)
      return { error: "As garrafas por embalagem devem ser pelo menos 1." };
    if (!Number.isFinite(stock) || stock < 0) return { error: "Stock inválido." };
    return {
      values: {
        name,
        category: form.category.trim() || name,
        salePrice,
        packageCost,
        unitsPerPackage: units,
        stock,
        archived: !form.active,
      },
    };
  };

  const saveAdd = async () => {
    const r = parseForm();
    if ("error" in r) {
      toast({ title: r.error, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const db = getDb();
      await db.products.add({ ...r.values!, archived: false, createdAt: now, updatedAt: now });
      await addAudit(
        "produto",
        `Produto cadastrado — ${r.values!.name}`,
        `Preço de venda ${mt(r.values!.salePrice)} · Embalagem ${mt(
          r.values!.packageCost
        )} com ${r.values!.unitsPerPackage} garrafas · Stock inicial ${r.values!.stock} un.`
      );
      toast({ title: "Produto cadastrado", description: r.values!.name });
      setAdding(false);
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const r = parseForm();
    if ("error" in r) {
      toast({ title: r.error, variant: "destructive" });
      return;
    }
    const v = r.values!;
    const old = editing;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const changes: string[] = [];
      if (v.name !== old.name) changes.push(`Nome: ${old.name} → ${v.name}`);
      if (v.category !== old.category)
        changes.push(`Categoria: ${old.category} → ${v.category}`);
      if (v.salePrice !== old.salePrice)
        changes.push(
          `Preço de venda: ${mt(old.salePrice)} → ${mt(v.salePrice)}`
        );
      if (v.packageCost !== old.packageCost)
        changes.push(
          `Custo da embalagem: ${mt(old.packageCost)} → ${mt(v.packageCost)}`
        );
      if (v.unitsPerPackage !== old.unitsPerPackage)
        changes.push(
          `Garrafas por embalagem: ${old.unitsPerPackage} → ${v.unitsPerPackage}`
        );
      if (v.archived !== old.archived)
        changes.push(v.archived ? "Produto arquivado" : "Produto reativado");

      if (changes.length === 0) {
        setEditing(null);
        return;
      }

      const db = getDb();
      await db.products.update(old.id!, { ...v, updatedAt: now });
      const priceChanged = v.salePrice !== old.salePrice;
      await addAudit(
        priceChanged ? "preco" : "produto",
        priceChanged ? `Preço atualizado — ${v.name}` : `Produto atualizado — ${v.name}`,
        changes.join(" · ")
      );
      toast({
        title: priceChanged ? "Preço atualizado" : "Produto atualizado",
        description: v.name,
      });
      setEditing(null);
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const saveAdjust = async () => {
    if (!adjusting) return;
    const n = parseInt(newStockStr, 10);
    if (!Number.isFinite(n) || n < 0) {
      toast({ title: "Indique o novo stock (0 ou mais).", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const db = getDb();
      await db.products.update(adjusting.id!, { stock: n, updatedAt: now });
      await addAudit(
        "ajuste",
        `Stock ajustado — ${adjusting.name}`,
        `Stock registado alterado de ${adjusting.stock} para ${n} un. Motivo: ${
          reason.trim() || "não indicado"
        }.`
      );
      toast({
        title: "Stock ajustado",
        description: `${adjusting.name}: ${adjusting.stock} → ${n} un.`,
      });
      setAdjusting(null);
      setNewStockStr("");
      setReason("");
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const dialogOpen = adding || editing !== null;
  const dialogProduct = editing;

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div>
            <h3 className="text-sm font-semibold">Valor do stock (produtos ativos)</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Ao custo: <strong className="text-foreground">{mt(totalCostValue)}</strong>{" "}
              · Venda potencial:{" "}
              <strong className="text-emerald-700">{mt(totalRetailValue)}</strong>
            </p>
          </div>
          <Button onClick={openAdd} className="h-10 shrink-0 bg-orange-600 hover:bg-orange-700">
            <Plus className="mr-1 h-4 w-4" />
            Novo
          </Button>
        </CardContent>
      </Card>

      {/* Lista de produtos */}
      {active.map((p) => {
        const e = productEconomics(p);
        return (
          <Card key={p.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold leading-tight">{p.name}</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Vende a {mt(p.salePrice)}/garrafa · fardo {mt(p.packageCost)} com{" "}
                    {fmtInt(p.unitsPerPackage)} garrafas
                  </p>
                </div>
                <Badge className="shrink-0 bg-orange-600 hover:bg-orange-600">
                  {fmtInt(p.stock)} un.
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-orange-50/70 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">Custo por garrafa</p>
                  <p className="font-bold tabular-nums">{mt(e.unitCost)}</p>
                </div>
                <div className="rounded-lg bg-emerald-50 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">Lucro por garrafa</p>
                  <p className="font-bold tabular-nums text-emerald-600">
                    {mt(e.unitProfit)} ({e.marginPct.toFixed(0)}%)
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-50 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">Lucro por fardo</p>
                  <p className="font-bold tabular-nums text-emerald-600">
                    {mt(e.packProfit)}
                  </p>
                </div>
                <div className="rounded-lg bg-orange-50/70 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">Fardo vende por</p>
                  <p className="font-bold tabular-nums">{mt(e.packRevenue)}</p>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEdit(p)}
                  className="h-9 flex-1 border-orange-200 text-orange-700 hover:bg-orange-50"
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Editar / Preço
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAdjusting(p);
                    setNewStockStr(String(p.stock));
                    setReason("");
                  }}
                  className="h-9 flex-1 border-orange-200 text-orange-700 hover:bg-orange-50"
                >
                  <PackagePlus className="mr-1.5 h-3.5 w-3.5" />
                  Ajustar stock
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {active.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Não há produtos ativos. Toque em <strong>Novo</strong> para cadastrar.
          </CardContent>
        </Card>
      )}

      {/* Arquivados */}
      {archived.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchived((s) => !s)}
            className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Archive className="h-3.5 w-3.5" />
            {showArchived ? "Esconder arquivados" : `Ver arquivados (${archived.length})`}
          </button>
          {showArchived && (
            <div className="mt-2 space-y-2">
              {archived.map((p) => (
                <Card key={p.id} className="opacity-70">
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {fmtInt(p.stock)} un. · {mt(p.salePrice)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="h-8" onClick={() => openEdit(p)}>
                        <ArchiveRestore className="mr-1 h-3.5 w-3.5" />
                        Editar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Diálogo de produto (novo/editar) */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAdding(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogProduct ? "Editar produto" : "Novo produto"}
            </DialogTitle>
            <DialogDescription>
              {dialogProduct
                ? "Alterações de preço e custos ficam registadas na auditoria."
                : "Cadastre um novo tipo de refresco ou outro produto."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="p-nome">Nome do produto</Label>
              <Input
                id="p-nome"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Refresco de maracujá 2L"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="p-preco">Preço de venda (MT)</Label>
                <Input
                  id="p-preco"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={form.salePrice}
                  onChange={(e) => setForm((f) => ({ ...f, salePrice: e.target.value }))}
                  placeholder="110"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="p-fardo">Custo da embalagem (MT)</Label>
                <Input
                  id="p-fardo"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={form.packageCost}
                  onChange={(e) => setForm((f) => ({ ...f, packageCost: e.target.value }))}
                  placeholder="560"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="p-unidades">Garrafas por embalagem</Label>
                <Input
                  id="p-unidades"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={form.unitsPerPackage}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, unitsPerPackage: e.target.value }))
                  }
                  className="mt-1"
                />
              </div>
              {adding && (
                <div>
                  <Label htmlFor="p-stock">Stock inicial (garrafas)</Label>
                  <Input
                    id="p-stock"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={form.stock}
                    onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              )}
            </div>

            {/* Pré-visualização da economia */}
            {Number(form.unitsPerPackage) >= 1 &&
              Number(form.salePrice) >= 0 &&
              Number(form.packageCost) >= 0 && (
                <div className="rounded-xl bg-emerald-50 p-3 text-xs">
                  <p className="flex items-center gap-1 font-semibold text-emerald-800">
                    <Tag className="h-3.5 w-3.5" />
                    Lucro previsto
                  </p>
                  <p className="mt-1 text-emerald-900">
                    Por garrafa:{" "}
                    <strong className="tabular-nums">
                      {mt(
                        Number(form.salePrice) -
                          Number(form.packageCost) / Number(form.unitsPerPackage)
                      )}
                    </strong>{" "}
                    · Por fardo:{" "}
                    <strong className="tabular-nums">
                      {mt(
                        Number(form.salePrice) * Number(form.unitsPerPackage) -
                          Number(form.packageCost)
                      )}
                    </strong>
                  </p>
                </div>
              )}

            {dialogProduct && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="p-ativo"
                  checked={form.active}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, active: c === true }))}
                />
                <Label htmlFor="p-ativo" className="text-xs font-normal">
                  Produto ativo (aparece nas contagens)
                </Label>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setAdding(false);
                setEditing(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={dialogProduct ? saveEdit : saveAdd}
              disabled={saving}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {dialogProduct ? "Guardar alterações" : "Cadastrar produto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de ajuste de stock */}
      <Dialog
        open={adjusting !== null}
        onOpenChange={(open) => {
          if (!open) setAdjusting(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar stock — {adjusting?.name}</DialogTitle>
            <DialogDescription>
              Corrija o stock registado (ex.: avarias, erros de contagem). Fica
              registado na auditoria.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="ajuste-stock">Novo stock (garrafas)</Label>
              <Input
                id="ajuste-stock"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={newStockStr}
                onChange={(e) => setNewStockStr(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="ajuste-motivo">Motivo</Label>
              <Input
                id="ajuste-motivo"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex.: 2 garrafas partiram no transporte"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAdjusting(null)}>
              Cancelar
            </Button>
            <Button onClick={saveAdjust} disabled={saving} className="bg-orange-600 hover:bg-orange-700">
              Guardar ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

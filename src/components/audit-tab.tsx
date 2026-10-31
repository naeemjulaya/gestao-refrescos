"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Upload,
  FileSpreadsheet,
  ShieldCheck,
  Calculator,
  ShoppingCart,
  Tag,
  Package,
  SlidersHorizontal,
  Flag,
  Database,
} from "lucide-react";
import { getDb } from "@/lib/localdb";
import type { AuditEntry, AuditType, AccountingSession, Product } from "@/lib/types";
import { AUDIT_LABELS } from "@/lib/types";
import { mt, fmtInt, fmtDate, fmtDateLong, fmtDateTime } from "@/lib/format";
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

const TYPE_ICONS: Record<AuditType, typeof Flag> = {
  abertura: Flag,
  conta: Calculator,
  compra: ShoppingCart,
  preco: Tag,
  produto: Package,
  ajuste: SlidersHorizontal,
  dados: Database,
};

const TYPE_COLORS: Record<AuditType, string> = {
  abertura: "bg-slate-100 text-slate-700",
  conta: "bg-orange-100 text-orange-800",
  compra: "bg-amber-100 text-amber-800",
  preco: "bg-rose-100 text-rose-800",
  produto: "bg-emerald-100 text-emerald-800",
  ajuste: "bg-violet-100 text-violet-800",
  dados: "bg-zinc-100 text-zinc-700",
};

const FILTERS: { key: "todas" | AuditType; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "conta", label: "Contas" },
  { key: "compra", label: "Compras" },
  { key: "preco", label: "Preços" },
  { key: "produto", label: "Produtos" },
  { key: "ajuste", label: "Ajustes" },
  { key: "dados", label: "Dados" },
];

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(
    d.getHours()
  )}${p(d.getMinutes())}`;
}

function csvNum(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

function buildCsv(sessions: AccountingSession[]): string {
  const head = [
    "Data",
    "Produto",
    "Stock esperado",
    "Stock contado",
    "Quebras",
    "Vendidos",
    "Preço unitário",
    "Faturamento",
    "Custo das vendas",
    "Lucro",
    "Fardos comprados",
    "Custo da compra",
    "Stock após compra",
    "Observações",
  ].join(";");
  const rows: string[] = [head];
  const asc = [...sessions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
  );
  for (const s of asc) {
    for (const i of s.items) {
      rows.push(
        [
          fmtDate(s.date),
          i.productName,
          fmtInt(i.expectedStock),
          fmtInt(i.counted),
          fmtInt(i.breakage),
          fmtInt(i.sold),
          csvNum(i.unitPrice),
          csvNum(i.revenue),
          csvNum(i.cogs),
          csvNum(i.profit),
          fmtInt(i.packsPurchased),
          csvNum(i.purchaseCost),
          fmtInt(i.stockAfter),
          s.notes ?? "",
        ].join(";")
      );
    }
  }
  return "\uFEFF" + rows.join("\r\n");
}

export default function AuditTab({ refreshKey }: { refreshKey: number }) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [sessions, setSessions] = useState<AccountingSession[]>([]);
  const [filter, setFilter] = useState<"todas" | AuditType>("todas");
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<unknown>(null);

  useEffect(() => {
    let alive = true;
    const db = getDb();
    Promise.all([db.audit.toArray(), db.sessions.toArray()]).then(([es, ss]) => {
      if (!alive) return;
      setEntries([...es].sort((a, b) => b.ts.localeCompare(a.ts)));
      setSessions(ss);
    });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    if (!entries) return [];
    return filter === "todas" ? entries : entries.filter((e) => e.type === filter);
  }, [entries, filter]);

  const exportJson = async () => {
    const db = getDb();
    const [products, ss, es] = await Promise.all([
      db.products.toArray(),
      db.sessions.toArray(),
      db.audit.toArray(),
    ]);
    const payload = {
      app: "gestao-refrescos",
      version: 1,
      exportedAt: new Date().toISOString(),
      products,
      sessions: ss,
      audit: es,
    };
    download(
      `backup-refrescos-${stamp()}.json`,
      JSON.stringify(payload, null, 2),
      "application/json"
    );
    toast({ title: "Cópia exportada", description: "Guarde o ficheiro num lugar seguro." });
  };

  const exportCsv = () => {
    if (sessions.length === 0) {
      toast({ title: "Ainda não há contas para exportar." });
      return;
    }
    download(`contas-refrescos-${stamp()}.csv`, buildCsv(sessions), "text/csv");
    toast({ title: "CSV exportado", description: "Abra no Excel ou WPS Office." });
  };

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (
        !data ||
        !Array.isArray(data.products) ||
        !Array.isArray(data.sessions) ||
        !Array.isArray(data.audit)
      ) {
        throw new Error("Formato inválido");
      }
      setPendingImport(data);
    } catch {
      toast({
        title: "Ficheiro inválido",
        description: "Escolha um ficheiro de cópia exportado por esta app.",
        variant: "destructive",
      });
    }
  };

  const confirmImport = async () => {
    const data = pendingImport as {
      products: Product[];
      sessions: AccountingSession[];
      audit: AuditEntry[];
      exportedAt?: string;
    };
    if (!data) return;
    const db = getDb();
    const now = new Date().toISOString();
    await db.transaction("rw", db.products, db.sessions, db.audit, async () => {
      await Promise.all([
        db.products.clear(),
        db.sessions.clear(),
        db.audit.clear(),
      ]);
      await db.products.bulkPut(data.products);
      await db.sessions.bulkPut(data.sessions);
      await db.audit.bulkPut(data.audit);
      await db.audit.add({
        ts: now,
        type: "dados",
        title: "Cópia de segurança importada",
        details: `Dados substituídos: ${data.products.length} produtos, ${data.sessions.length} contas, ${data.audit.length} registos de auditoria.${
          data.exportedAt ? ` Backup criado em ${fmtDateTime(data.exportedAt)}.` : ""
        }`,
      });
    });
    const [es, ss] = await Promise.all([db.audit.toArray(), db.sessions.toArray()]);
    setEntries([...es].sort((a, b) => b.ts.localeCompare(a.ts)));
    setSessions(ss);
    setPendingImport(null);
    toast({ title: "Cópia importada", description: "Os dados foram restaurados." });
  };

  if (!entries) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-orange-100/60" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Exportar / Importar */}
      <Card>
        <CardContent className="p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Cópia de segurança e auditoria
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Os dados ficam guardados neste aparelho e funcionam sem internet.
            Faça cópias regularmente para não perder nada.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2">
            <Button
              onClick={exportJson}
              variant="outline"
              className="h-10 justify-start border-orange-200 text-orange-700 hover:bg-orange-50"
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar cópia completa (JSON)
            </Button>
            <Button
              onClick={exportCsv}
              variant="outline"
              className="h-10 justify-start border-orange-200 text-orange-700 hover:bg-orange-50"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Exportar contas para Excel (CSV)
            </Button>
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              className="h-10 justify-start border-orange-200 text-orange-700 hover:bg-orange-50"
            >
              <Upload className="mr-2 h-4 w-4" />
              Importar cópia (JSON)
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportFile(f);
                e.target.value = "";
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === f.key
                ? "bg-orange-600 text-white shadow-sm shadow-orange-600/30"
                : "border border-orange-100 bg-white text-muted-foreground hover:bg-orange-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Registo */}
      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Ainda não há registos deste tipo.
          </CardContent>
        </Card>
      ) : (
        <ol className="space-y-2">
          {filtered.map((e) => {
            const Icon = TYPE_ICONS[e.type] ?? Database;
            return (
              <li key={e.id}>
                <Card>
                  <CardContent className="flex items-start gap-3 p-3.5">
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        TYPE_COLORS[e.type] ?? "bg-zinc-100 text-zinc-700"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="truncate text-sm font-semibold">{e.title}</h3>
                        <Badge
                          variant="secondary"
                          className={`shrink-0 text-[10px] ${TYPE_COLORS[e.type]}`}
                        >
                          {AUDIT_LABELS[e.type]}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {e.details}
                      </p>
                      <p className="mt-1 text-[10px] font-medium tabular-nums text-orange-700/70">
                        {fmtDateTime(e.ts)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      {/* Confirmação de importação */}
      <AlertDialog
        open={pendingImport !== null}
        onOpenChange={(open) => {
          if (!open) setPendingImport(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir todos os dados?</AlertDialogTitle>
            <AlertDialogDescription>
              A importação apaga os dados atuais e restaura os do ficheiro de
              cópia (produtos, contas e auditoria). A ação fica registada na
              auditoria. Recomendamos exportar uma cópia antes de importar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmImport}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Importar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <p className="px-1 text-center text-[11px] text-muted-foreground">
        Última conta registada:{" "}
        {sessions.length > 0
          ? fmtDateLong(
              [...sessions].sort((a, b) => b.date.localeCompare(a.date))[0].date
            )
          : "ainda nenhuma"}
      </p>
    </div>
  );
}

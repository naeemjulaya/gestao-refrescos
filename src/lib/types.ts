export interface Product {
  id?: number;
  name: string;
  category: string; // ex.: "2L", "1L", "PET"
  salePrice: number; // preço de venda por garrafa (MT)
  packageCost: number; // custo do fardo/embalagem (MT)
  unitsPerPackage: number; // garrafas por fardo
  stock: number; // stock atual em garrafas
  archived: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface SessionItem {
  productId: number;
  productName: string;
  unitPrice: number;
  unitCost: number;
  expectedStock: number;
  counted: number;
  breakage: number; // quebras/perdas em garrafas
  sold: number;
  revenue: number;
  cogs: number; // custo das garrafas vendidas
  profit: number;
  packsPurchased: number;
  purchaseCost: number;
  stockAfter: number;
}

export interface AccountingSession {
  id?: number;
  date: string; // YYYY-MM-DD (data da contagem escolhida pelo utilizador)
  items: SessionItem[];
  revenue: number;
  cogs: number;
  profit: number;
  purchaseCost: number; // reinvestimento em fardos
  netCash: number; // faturamento - investimento
  notes: string;
  createdAt: string; // ISO datetime
}

export type AuditType =
  | "abertura"
  | "conta"
  | "compra"
  | "preco"
  | "produto"
  | "ajuste"
  | "dados";

export interface AuditEntry {
  id?: number;
  ts: string; // ISO datetime
  type: AuditType;
  title: string;
  details: string;
}

export const AUDIT_LABELS: Record<AuditType, string> = {
  abertura: "Abertura",
  conta: "Conta",
  compra: "Compra",
  preco: "Preço",
  produto: "Produto",
  ajuste: "Ajuste",
  dados: "Dados",
};

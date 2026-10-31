import type { Product, SessionItem } from "./types";

export interface ProductEconomics {
  unitCost: number;
  unitProfit: number;
  packRevenue: number;
  packProfit: number;
  marginPct: number;
  stockCostValue: number;
  stockRetailValue: number;
}

/** Economia de um produto: lucro por garrafa, por fardo, margem e valor do stock. */
export function productEconomics(p: Product): ProductEconomics {
  const unitCost =
    p.unitsPerPackage > 0 ? p.packageCost / p.unitsPerPackage : 0;
  const unitProfit = p.salePrice - unitCost;
  const packRevenue = p.salePrice * p.unitsPerPackage;
  const packProfit = packRevenue - p.packageCost;
  const marginPct = p.salePrice > 0 ? (unitProfit / p.salePrice) * 100 : 0;
  return {
    unitCost,
    unitProfit,
    packRevenue,
    packProfit,
    marginPct,
    stockCostValue: p.stock * unitCost,
    stockRetailValue: p.stock * p.salePrice,
  };
}

export interface SessionCounts {
  counted: Record<number, number>;
  breakage: Record<number, number>;
  packs: Record<number, number>;
}

export interface ComputedItem {
  product: Product;
  expectedStock: number;
  counted: number;
  breakage: number;
  sold: number;
  revenue: number;
  cogs: number;
  profit: number;
  packsPurchased: number;
  purchaseCost: number;
  stockAfter: number;
  invalid: boolean; // contagem maior que o esperado
}

export interface ComputedSession {
  items: ComputedItem[];
  revenue: number;
  cogs: number;
  profit: number;
  purchaseCost: number;
  netCash: number;
  hasInvalid: boolean;
}

/** Calcula a sessão em tempo real a partir das contagens e compras inseridas. */
export function computeSession(
  products: Product[],
  counts: SessionCounts
): ComputedSession {
  const items: ComputedItem[] = products.map((p) => {
    const counted = Math.max(0, Math.floor(counts.counted[p.id!] ?? 0));
    const breakage = Math.max(0, Math.floor(counts.breakage[p.id!] ?? 0));
    const packs = Math.max(0, Math.floor(counts.packs[p.id!] ?? 0));
    const unitCost =
      p.unitsPerPackage > 0 ? p.packageCost / p.unitsPerPackage : 0;
    const expectedStock = p.stock;
    const sold = expectedStock - breakage - counted;
    const invalid = sold < 0;
    const soldSafe = Math.max(0, sold);
    const revenue = soldSafe * p.salePrice;
    const cogs = soldSafe * unitCost;
    const purchaseCost = packs * p.packageCost;
    return {
      product: p,
      expectedStock,
      counted,
      breakage,
      sold: soldSafe,
      revenue,
      cogs,
      profit: revenue - cogs,
      packsPurchased: packs,
      purchaseCost,
      stockAfter: counted + packs * p.unitsPerPackage,
      invalid,
    };
  });

  const revenue = items.reduce((s, i) => s + i.revenue, 0);
  const cogs = items.reduce((s, i) => s + i.cogs, 0);
  const purchaseCost = items.reduce((s, i) => s + i.purchaseCost, 0);

  return {
    items,
    revenue,
    cogs,
    profit: revenue - cogs,
    purchaseCost,
    netCash: revenue - purchaseCost,
    hasInvalid: items.some((i) => i.invalid),
  };
}

/** Converte o cálculo em itens persistíveis para a base de dados. */
export function toSessionItems(items: ComputedItem[]): SessionItem[] {
  return items.map((i) => ({
    productId: i.product.id!,
    productName: i.product.name,
    unitPrice: i.product.salePrice,
    unitCost:
      i.product.unitsPerPackage > 0
        ? i.product.packageCost / i.product.unitsPerPackage
        : 0,
    expectedStock: i.expectedStock,
    counted: i.counted,
    breakage: i.breakage,
    sold: i.sold,
    revenue: i.revenue,
    cogs: i.cogs,
    profit: i.profit,
    packsPurchased: i.packsPurchased,
    purchaseCost: i.purchaseCost,
    stockAfter: i.stockAfter,
  }));
}

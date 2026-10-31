import Dexie, { type EntityTable } from "dexie";
import type { Product, AccountingSession, AuditEntry, AuditType } from "./types";

interface RefrescosDB extends Dexie {
  products: EntityTable<Product, "id">;
  sessions: EntityTable<AccountingSession, "id">;
  audit: EntityTable<AuditEntry, "id">;
}

let instance: RefrescosDB | null = null;

/** Base de dados local (IndexedDB) — funciona 100% offline. */
export function getDb(): RefrescosDB {
  if (!instance) {
    const db = new Dexie("gestao-refrescos") as RefrescosDB;
    db.version(1).stores({
      products: "++id, name, archived",
      sessions: "++id, date, createdAt",
      audit: "++id, ts, type",
    });
    // v2: correção do fardo PET — vem 12 garrafas, não 24.
    db.version(2)
      .stores({
        products: "++id, name, archived",
        sessions: "++id, date, createdAt",
        audit: "++id, ts, type",
      })
      .upgrade(async (tx) => {
        const products = tx.table("products");
        const pets = (await products.toArray()).filter(
          (p: Product) => p.category === "PET"
        );
        if (pets.length === 0) return;
        const sessionCount = await tx.table("sessions").count();
        const now = new Date().toISOString();
        for (const pet of pets) {
          if (pet.unitsPerPackage === 24) {
            const changes: Partial<Product> = {
              unitsPerPackage: 12,
              updatedAt: now,
            };
            // Se ainda não houve contas e o stock é o inicial calculado
            // com 24/fardo (144), corrige para 6 fardos × 12 = 72.
            if (sessionCount === 0 && pet.stock === 144) changes.stock = 72;
            await products.update(pet.id, changes);
            await tx.table("audit").add({
              ts: now,
              type: "produto",
              title: "Correção do fardo PET",
              details:
                "Corrigido automaticamente: o fardo de PET tem 12 garrafas (não 24)." +
                (changes.stock !== undefined
                  ? " Stock inicial também corrigido de 144 para 72 garrafas (6 fardos × 12)."
                  : ""),
            });
          }
        }
      });
    instance = db;
  }
  return instance;
}

export async function addAudit(
  type: AuditType,
  title: string,
  details: string
): Promise<void> {
  const db = getDb();
  await db.audit.add({ ts: new Date().toISOString(), type, title, details });
}

export const SEED_PRODUCTS = [
  {
    name: "Refresco 2 Litros",
    category: "2L",
    salePrice: 110,
    packageCost: 560,
    unitsPerPackage: 6,
    stock: 34, // 4 garrafas + 5 fardos × 6
  },
  {
    name: "Refresco 1 Litro",
    category: "1L",
    salePrice: 75,
    packageCost: 315,
    unitsPerPackage: 6,
    stock: 7, // 1 garrafa + 1 fardo × 6
  },
  {
    name: "Garrafinha PET",
    category: "PET",
    salePrice: 30,
    packageCost: 240,
    unitsPerPackage: 12,
    stock: 72, // 0 garrafas + 6 fardos × 12
  },
];

/**
 * Inicializa a base de dados na primeira utilização:
 * cria os 3 produtos com o stock da última contagem manual e
 * regista a entrada de auditoria de abertura.
 */
export async function initDatabase(): Promise<void> {
  const db = getDb();
  if ((await db.products.count()) > 0) return;

  const now = new Date().toISOString();
  await db.transaction("rw", db.products, db.audit, async () => {
    await db.products.bulkAdd(
      SEED_PRODUCTS.map((p) => ({
        ...p,
        archived: false,
        createdAt: now,
        updatedAt: now,
      }))
    );
    await db.audit.add({
      ts: now,
      type: "abertura",
      title: "Abertura de stock",
      details:
        "Stock inicial registado a partir da última contagem manual: " +
        "Refresco 2 Litros: 4 garrafas + 5 fardos = 34 un.; " +
        "Refresco 1 Litro: 1 garrafa + 1 fardo = 7 un.; " +
        "Garrafinha PET: 0 garrafas + 6 fardos = 72 un.",
    });
  });
}

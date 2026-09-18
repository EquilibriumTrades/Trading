import { and, eq, inArray } from "drizzle-orm";
import { buildRoundTrips, type Execution, type ProfitCalcMethod } from "@luxalgo/journal-core";
import { db, executions, trades, accounts } from "@/db";
import { getMultipliers, getJournalDefaults } from "./settings";
import { defaultRisk } from "@/lib/journal-defaults";

export const rebuildAccount = (accountId: string): void => {
  const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) return;

  const rows = db.select().from(executions).where(eq(executions.accountId, accountId)).all();
  const executionInputs: Execution[] = rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    symbol: row.symbol,
    side: row.side,
    quantity: row.quantity,
    price: row.price,
    fee: row.fee,
    executedAt: row.executedAt,
    assetClass: (row.assetClass ?? undefined) as Execution["assetClass"],
    source: row.source,
    importMetadata: row.importMetadataJson ? JSON.parse(row.importMetadataJson) : undefined,
  }));

  const trips = buildRoundTrips(executionInputs, {
    method: account.profitCalcMethod as ProfitCalcMethod,
    multipliers: getMultipliers(),
  });
  const existing = db
    .select({ key: trades.key, fundingFee: trades.fundingFee, leverage: trades.leverage })
    .from(trades)
    .where(eq(trades.accountId, accountId))
    .all();
  const preservedByKey = new Map(
    existing.map((row) => [row.key, { fundingFee: row.fundingFee, leverage: row.leverage }]),
  );
  const obsolete = new Set(existing.map((row) => row.key));
  const defaults = getJournalDefaults();

  db.transaction((tx) => {
    for (const trip of trips) {
      obsolete.delete(trip.key);
      const preserved = preservedByKey.get(trip.key);
      const fundingFee = preserved?.fundingFee ?? 0;
      const leverage = preserved?.leverage ?? 1;
      const netPnl = trip.netPnl - fundingFee;
      const status: "open" | "win" | "loss" | "breakeven" =
        trip.status === "open"
          ? "open"
          : netPnl > 0
            ? "win"
            : netPnl < 0
              ? "loss"
              : "breakeven";
      const computed: Pick<
        typeof trades.$inferInsert,
        | "accountId"
        | "symbol"
        | "assetClass"
        | "direction"
        | "status"
        | "openedAt"
        | "closedAt"
        | "quantity"
        | "openQuantity"
        | "avgEntry"
        | "avgExit"
        | "grossPnl"
        | "fees"
        | "netPnl"
        | "executionCount"
        | "executionIdsJson"
        | "exitsJson"
        | "durationMs"
      > = {
        accountId: trip.accountId,
        symbol: trip.symbol,
        assetClass: trip.assetClass ?? null,
        direction: trip.direction,
        status,
        openedAt: trip.openedAt,
        closedAt: trip.closedAt ?? null,
        quantity: trip.quantity,
        openQuantity: trip.openQuantity,
        avgEntry: trip.avgEntry,
        avgExit: trip.avgExit ?? null,
        grossPnl: trip.grossPnl,
        fees: trip.fees,
        netPnl,
        executionCount: trip.executionCount,
        executionIdsJson: JSON.stringify(trip.executionIds),
        exitsJson: JSON.stringify(trip.exits),
        durationMs: trip.durationMs ?? null,
      };

      tx.insert(trades)
        .values({
          key: trip.key,
          ...computed,
          fundingFee,
          leverage,
          ...defaultRisk(trip.avgEntry, trip.direction, accountId, trip.symbol, defaults),
        })
        .onConflictDoUpdate({ target: trades.key, set: computed })
        .run();
    }

    const vanished = [...obsolete];
    for (let i = 0; i < vanished.length; i += 500) {
      tx.delete(trades)
        .where(and(eq(trades.accountId, accountId), inArray(trades.key, vanished.slice(i, i + 500))))
        .run();
    }
  });
};

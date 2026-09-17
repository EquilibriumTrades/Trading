import { tradeRisk, tradeR, plannedR } from "@luxalgo/journal-core";
import { and, eq } from "drizzle-orm";
import { db, trades, playbooks, accounts, attachments, tradeRuleChecks, executions } from "@/db";
import { bad, handler, ok, requireValue } from "@/server/api";
import { deleteExecutionsForTrades, listExecutions } from "@/server/executions";
import { executionHash, nowIso } from "@/server/ids";
import { rebuildAccount } from "@/server/rebuild";
import { getTradeByKey, rowToTrade } from "@/server/trades-query";
import { getTimeZone } from "@/server/settings";

type Params = { params: Promise<{ key: string }> };

export const GET = handler(async (_request: Request, { params }: Params) => {
  const { key } = await params;
  const row = getTradeByKey(key);
  if (!row) return bad("Trade not found", 404);
  const trade = rowToTrade(row);
  const fills = listExecutions(row.accountId, trade.executionIds);
  return ok({ timeZone: getTimeZone(), trade: { ...row, status: trade.status, riskAmount: tradeRisk(trade), realizedR: tradeR(trade), plannedR: plannedR(trade), contractMultiplier: trade.contractMultiplier ?? null, currency: db.select({ currency: accounts.currency }).from(accounts).where(eq(accounts.id, row.accountId)).get()?.currency ?? "USD" }, executions: fills });
});

interface ExecutionEdit { id: string; symbol: string; side: "buy" | "sell"; quantity: number; price: number; fee: number; executedAt: string; }
interface AnnotateBody { notes?: string | null; tags?: string[]; mistakes?: string[]; playbookId?: string | null; rating?: number | null; stopLoss?: number | null; profitTarget?: number | null; reviewed?: boolean; fundingFee?: number; executions?: ExecutionEdit[]; }

export const PATCH = handler(async (request: Request, { params }: Params) => {
  const { key } = await params;
  let row = getTradeByKey(key);
  if (!row) return bad("Trade not found", 404);
  const body = (await request.json()) as AnnotateBody;

  for (const field of ["stopLoss", "profitTarget", "rating", "fundingFee"] as const)
    requireValue(body[field] == null || (typeof body[field] === "number" && Number.isFinite(body[field])), `Invalid ${field}.`);
  requireValue(body.rating == null || (Number.isInteger(body.rating) && body.rating >= 1 && body.rating <= 5), "Rating must be 1–5.");
  requireValue(body.notes == null || (typeof body.notes === "string" && body.notes.length <= 100000), "Notes must be at most 100,000 characters.");
  for (const field of ["tags", "mistakes"] as const) requireValue(body[field] === undefined || (Array.isArray(body[field]) && body[field]!.length <= 100 && body[field]!.every((s) => typeof s === "string" && s.length <= 200)), `Invalid ${field}.`);
  requireValue(!body.playbookId || db.select().from(playbooks).where(eq(playbooks.id, body.playbookId)).get(), "Playbook not found.");

  if (body.executions !== undefined) {
    requireValue(Array.isArray(body.executions) && body.executions.length > 0, "A trade needs at least one execution.");
    const allowed = new Set(JSON.parse(row.executionIdsJson) as string[]);
    requireValue(body.executions.length === allowed.size && body.executions.every((e) => allowed.has(e.id)), "Execution set does not match this trade.");
    for (const e of body.executions) {
      requireValue(typeof e.symbol === "string" && e.symbol.trim().length > 0 && e.symbol.length <= 100, "Invalid symbol.");
      requireValue(e.side === "buy" || e.side === "sell", "Invalid execution side.");
      requireValue(Number.isFinite(e.quantity) && e.quantity > 0, "Quantity must be positive.");
      requireValue(Number.isFinite(e.price), "Price must be finite.");
      requireValue(Number.isFinite(e.fee), "Fee must be finite.");
      requireValue(typeof e.executedAt === "string" && Number.isFinite(Date.parse(e.executedAt)), "Invalid execution time.");
    }
    db.transaction((tx) => {
      for (const e of body.executions!) {
        const old = tx.select().from(executions).where(and(eq(executions.accountId, row!.accountId), eq(executions.id, e.id))).get();
        requireValue(old, "Execution not found.");
        const importMetadata = old.importMetadataJson ? JSON.parse(old.importMetadataJson) : undefined;
        tx.update(executions).set({ symbol: e.symbol.trim(), side: e.side, quantity: e.quantity, price: e.price, fee: e.fee, executedAt: new Date(e.executedAt).toISOString(), contentHash: executionHash({ symbol: e.symbol.trim(), side: e.side, quantity: e.quantity, price: e.price, executedAt: new Date(e.executedAt).toISOString(), importMetadata }) }).where(eq(executions.id, e.id)).run();
      }
    });
    rebuildAccount(row.accountId);
    row = getTradeByKey(key) ?? db.select().from(trades).where(eq(trades.accountId, row.accountId)).all().find((candidate) => (JSON.parse(candidate.executionIdsJson) as string[]).some((id) => allowed.has(id)));
    if (!row) return bad("Edited executions no longer form a single trade. Adjust the executions and try again.", 400);
  }

  const patch: Partial<typeof trades.$inferInsert> = {};
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.tags !== undefined) patch.tagsJson = JSON.stringify(body.tags);
  if (body.mistakes !== undefined) patch.mistakesJson = JSON.stringify(body.mistakes);
  if (body.playbookId !== undefined) patch.playbookId = body.playbookId;
  if (body.rating !== undefined) patch.rating = body.rating;
  if (body.stopLoss !== undefined) patch.stopLoss = body.stopLoss;
  if (body.profitTarget !== undefined) patch.profitTarget = body.profitTarget;
  if (body.reviewed !== undefined) patch.reviewedAt = body.reviewed ? nowIso() : null;
  if (body.fundingFee !== undefined) {
    patch.fundingFee = body.fundingFee;
    patch.netPnl = row.grossPnl - row.fees - body.fundingFee;
    if (row.closedAt) patch.status = patch.netPnl > 0 ? "win" : patch.netPnl < 0 ? "loss" : "breakeven";
  }
  if (Object.keys(patch).length) db.update(trades).set(patch).where(eq(trades.key, row.key)).run();
  return ok({ updated: true, key: row.key });
});

export const DELETE = handler(async (_request: Request, { params }: Params) => {
  const { key } = await params;
  const row = getTradeByKey(key);
  if (!row) return bad("Trade not found", 404);
  db.transaction(() => {
    db.delete(attachments).where(and(eq(attachments.ownerType, "trade"), eq(attachments.ownerId, row.key))).run();
    db.delete(tradeRuleChecks).where(eq(tradeRuleChecks.tradeKey, row.key)).run();
  });
  deleteExecutionsForTrades(row.accountId, JSON.parse(row.executionIdsJson) as string[]);
  return ok({ deleted: true });
});

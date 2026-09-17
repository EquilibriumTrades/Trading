"use client";

import { useId, useState } from "react";
import { MonetaryField } from "@/components/privacy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { postJson } from "@/lib/use-api";
import { AccountPicker } from "./account-picker";

export function ManualTradeEntry({ onSaved }: { onSaved: () => void }) {
  const [accountId, setAccountId] = useState("");
  const [symbol, setSymbol] = useState("");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [tradeClose, setTradeClose] = useState<"open" | "closed">("closed");
  const [entryTime, setEntryTime] = useState("");
  const [exitTime, setExitTime] = useState("");
  const [quantity, setQuantity] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [exitFee, setExitFee] = useState("");
  const [fundingFee, setFundingFee] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fieldId = useId();
  const valid = Boolean(accountId && symbol && entryTime && Number(quantity) > 0 && entryPrice !== "" && (tradeClose === "open" || (exitTime && exitPrice !== "")));

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true); setError("");
    try {
      const entrySide: "buy" | "sell" = direction === "long" ? "buy" : "sell";
      const exitSide: "buy" | "sell" = direction === "long" ? "sell" : "buy";
      const executions = [{ symbol, side: entrySide, quantity: Number(quantity), price: Number(entryPrice), fee: entryFee === "" ? 0 : Number(entryFee), executedAt: new Date(entryTime).toISOString() }];
      if (tradeClose === "closed") executions.push({ symbol, side: exitSide, quantity: Number(quantity), price: Number(exitPrice), fee: exitFee === "" ? 0 : Number(exitFee), executedAt: new Date(exitTime).toISOString() });
      await postJson("/api/executions", { accountId, executions, fundingFee: fundingFee === "" ? 0 : Number(fundingFee), ...(notes.trim() ? { notes } : {}) });
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t save the trade. Try again."); }
    finally { setBusy(false); }
  };

  return <fieldset disabled={busy} className="min-w-0 space-y-4">
    <AccountPicker value={accountId} onChange={setAccountId} kind="manual" />
    <div className="grid gap-3 sm:grid-cols-3">
      <div><Label htmlFor={`${fieldId}-symbol`}>Symbol</Label><Input id={`${fieldId}-symbol`} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="BTCUSDT" /></div>
      <div><Label>Direction</Label><Select value={direction} onValueChange={(v) => setDirection(v as "long" | "short")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="long">Long</SelectItem><SelectItem value="short">Short</SelectItem></SelectContent></Select></div>
      <div><Label>Trade close</Label><Select value={tradeClose} onValueChange={(v) => setTradeClose(v as "open" | "closed")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="closed">Closed</SelectItem><SelectItem value="open">Still open</SelectItem></SelectContent></Select></div>
    </div>
    <div className="rounded-lg border p-3"><div className="mb-2 text-sm font-medium">Entry</div><div className="grid gap-2 sm:grid-cols-4">
      <div><Label>Entry date & time</Label><Input type="datetime-local" value={entryTime} onChange={(e) => setEntryTime(e.target.value)} /></div>
      <div><Label>Quantity</Label><Input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="qty" /></div>
      <div><Label>Entry price</Label><MonetaryField><Input inputMode="decimal" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} placeholder="price" /></MonetaryField></div>
      <div><Label>Entry fee</Label><MonetaryField><Input inputMode="decimal" value={entryFee} onChange={(e) => setEntryFee(e.target.value)} placeholder="0" /></MonetaryField></div>
    </div></div>
    {tradeClose === "closed" && <div className="rounded-lg border p-3"><div className="mb-2 text-sm font-medium">Trade close</div><div className="grid gap-2 sm:grid-cols-3">
      <div><Label>Close date & time</Label><Input type="datetime-local" value={exitTime} onChange={(e) => setExitTime(e.target.value)} /></div>
      <div><Label>Close price</Label><MonetaryField><Input inputMode="decimal" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} placeholder="price" /></MonetaryField></div>
      <div><Label>Close fee</Label><MonetaryField><Input inputMode="decimal" value={exitFee} onChange={(e) => setExitFee(e.target.value)} placeholder="0" /></MonetaryField></div>
    </div></div>}
    <div><Label>Funding fee</Label><MonetaryField><Input inputMode="decimal" value={fundingFee} onChange={(e) => setFundingFee(e.target.value)} placeholder="0" /></MonetaryField><p className="mt-1 text-xs text-muted-foreground">Positive = funding paid. Negative = funding received.</p></div>
    <div><Label htmlFor={`${fieldId}-notes`}>Notes (optional)</Label><textarea id={`${fieldId}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={100000} rows={4} placeholder="Your setup, why you took the trade, or what you learned…" className="flex w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50" /></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button size="sm" onClick={save} disabled={!valid || busy}>{busy ? "Saving…" : "Save trade"}</Button>
    <p className="text-xs text-muted-foreground">Long/short is converted to the correct buy/sell executions automatically. Dates and times use your device’s timezone.</p>
  </fieldset>;
}

"use client";

import { useId, useState } from "react";
import { MonetaryField } from "@/components/privacy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { postJson } from "@/lib/use-api";

import { AccountPicker } from "./account-picker";
import { fmtNumber } from "@/lib/utils";

interface ManualLeg {
  datetime: string;
  action: "add" | "close";
  quantity: string;
  price: string;
  fee: string;
}

type Direction = "long" | "short";

export function ManualTradeEntry({ onSaved }: { onSaved: () => void }) {
  const [accountId, setAccountId] = useState("");
  const [symbol, setSymbol] = useState("");
  const [direction, setDirection] = useState<Direction>("long");
  const [notes, setNotes] = useState("");
  const [fundingFee, setFundingFee] = useState("");
  const [legs, setLegs] = useState<ManualLeg[]>([
    { datetime: "", action: "add", quantity: "", price: "", fee: "" },
    { datetime: "", action: "close", quantity: "", price: "", fee: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fieldId = useId();

  const setLeg = (index: number, patch: Partial<ManualLeg>) =>
    setLegs((current) => current.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)));

  const completedLegs = legs.filter(
    (leg) => leg.datetime && Number(leg.quantity) > 0 && leg.price !== "",
  );
  const valid = accountId && symbol && completedLegs.length >= 2;

  const sideFor = (action: ManualLeg["action"]): "buy" | "sell" => {
    if (direction === "long") return action === "add" ? "buy" : "sell";
    return action === "add" ? "sell" : "buy";
  };

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      await postJson("/api/executions", {
        accountId,
        fundingFee: fundingFee === "" ? 0 : Number(fundingFee),
        ...(notes.trim() ? { notes } : {}),
        executions: completedLegs.map((leg) => ({
          symbol,
          side: sideFor(leg.action),
          quantity: Number(leg.quantity),
          price: Number(leg.price),
          fee: leg.fee === "" ? 0 : Number(leg.fee),
          executedAt: new Date(leg.datetime).toISOString(),
        })),
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t save the trade. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset disabled={busy} className="min-w-0 space-y-3">
      <AccountPicker value={accountId} onChange={setAccountId} kind="manual" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${fieldId}-symbol`} className="mb-1 block text-xs text-muted-foreground">
            Symbol
          </Label>
          <Input
            id={`${fieldId}-symbol`}
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            placeholder="AAPL, ESZ6, BTCUSDT…"
          />
        </div>
        <div className="grid min-w-0 gap-1 text-xs text-muted-foreground">
          <span id={`${fieldId}-direction`}>Direction</span>
          <Select value={direction} onValueChange={(value) => setDirection(value as Direction)}>
            <SelectTrigger aria-labelledby={`${fieldId}-direction`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="long">Long</SelectItem>
              <SelectItem value="short">Short</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="manual-executions space-y-3">
        {legs.map((leg, index) => (
          <fieldset
            key={index}
            className="manual-execution-row grid min-w-0 gap-2 rounded-lg border p-3"
          >
            <legend className="px-1 text-xs text-muted-foreground">Execution {index + 1}</legend>
            <label className="manual-execution-date grid min-w-0 gap-1 text-xs text-muted-foreground">
              Date & time
              <Input
                type="datetime-local"
                value={leg.datetime}
                onChange={(event) => setLeg(index, { datetime: event.target.value })}
              />
            </label>
            <div className="grid min-w-0 gap-1 text-xs text-muted-foreground">
              <span id={`${fieldId}-execution-action-${index}`}>Action</span>
              {index === 0 ? (
                <div className="flex h-9 items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-foreground">
                  {direction === "long" ? "Long" : "Short"}
                </div>
              ) : (
                <Select
                  value={leg.action}
                  onValueChange={(value) => setLeg(index, { action: value as ManualLeg["action"] })}
                >
                  <SelectTrigger aria-labelledby={`${fieldId}-execution-action-${index}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">{direction === "long" ? "Add Long" : "Add Short"}</SelectItem>
                    <SelectItem value="close">{direction === "long" ? "Close Long" : "Close Short"}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
              Quantity
              <Input
                placeholder="qty"
                inputMode="decimal"
                value={leg.quantity}
                onChange={(event) => setLeg(index, { quantity: event.target.value })}
              />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
              Price
              <MonetaryField>
                <Input
                  placeholder="price"
                  inputMode="decimal"
                  value={leg.price}
                  onChange={(event) => setLeg(index, { price: event.target.value })}
                />
              </MonetaryField>
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
              Fee
              <MonetaryField>
                <Input
                  placeholder="fee"
                  inputMode="decimal"
                  value={leg.fee}
                  onChange={(event) => setLeg(index, { fee: event.target.value })}
                />
              </MonetaryField>
            </label>
          </fieldset>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          setLegs((current) => [
            ...current,
            { datetime: "", action: "close", quantity: "", price: "", fee: "" },
          ])
        }
      >
        Add execution
      </Button>
      <div className="space-y-1">
        <Label htmlFor={`${fieldId}-funding`}>Funding fee</Label>
        <MonetaryField>
          <Input
            id={`${fieldId}-funding`}
            inputMode="decimal"
            value={fundingFee}
            onChange={(event) => setFundingFee(event.target.value)}
            placeholder="0"
          />
        </MonetaryField>
        <p className="text-xs text-muted-foreground">
          Positive = funding received (adds to P&amp;L). Negative = funding paid (reduces P&amp;L).
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${fieldId}-notes`}>Notes (optional)</Label>
        <textarea
          id={`${fieldId}-notes`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={100000}
          rows={4}
          placeholder="Your setup, why you took the trade, or what you learned…"
          className="flex w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        />
        <p className="text-xs text-muted-foreground">
          Markdown supported. Notes are saved with the trade; existing notes are kept when adding to
          an open position.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button size="sm" onClick={save} disabled={!valid || busy}>
        {busy ? "Saving…" : "Save trade"}
      </Button>
      <p className="text-xs text-muted-foreground">
        A trade needs at least 2 completed executions. Add more for partial entries, take profits,
        stop losses, or other fills. Dates and times use your device’s timezone. ({fmtNumber(completedLegs.length, 0)} executions ready.)
      </p>
    </fieldset>
  );
}

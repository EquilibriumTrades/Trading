"use client";

export interface ChartExecution {
  side: "buy" | "sell";
  quantity: number;
  price: number;
  executedAt: string;
}

export interface ChartTrade {
  key: string;
  symbol: string;
  assetClass?: string | null;
  direction: string;
  openedAt: string;
  closedAt?: string | null;
  netPnl: number;
  avgEntry: number;
  avgExit?: number | null;
}

export function TradeChart({ trade }: { trade: ChartTrade; executions: ChartExecution[]; height?: number }) {
  return <div id={`trade-attachments-slot-${trade.key}`} />;
}

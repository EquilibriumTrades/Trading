import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import * as schema from "./schema";
import { BOOTSTRAP_SQL } from "./bootstrap";

export const dataDir = (): string => process.env.JOURNAL_DATA_DIR ?? join(process.cwd(), "data");

const globalForDb = globalThis as unknown as { __journalDb?: ReturnType<typeof createDb> };

const createDb = () => {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const sqlite = new Database(join(dir, "journal.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(BOOTSTRAP_SQL);
  const executionColumns = sqlite.pragma("table_info(executions)") as { name: string }[];
  if (!executionColumns.some((column) => column.name === "import_metadata_json")) {
    sqlite.exec("ALTER TABLE executions ADD COLUMN import_metadata_json TEXT");
  }
  // Funding is a trade-level cost. Positive values reduce net P&L; negative values represent funding received.
  const tradeColumns = sqlite.pragma("table_info(trades)") as { name: string }[];
  if (!tradeColumns.some((column) => column.name === "funding_fee")) {
    sqlite.exec("ALTER TABLE trades ADD COLUMN funding_fee REAL NOT NULL DEFAULT 0");
  }
  const csvColumns = sqlite.pragma("table_info(market_csv_datasets)") as { name: string }[];
  sqlite.transaction(() => {
    for (const name of ["bar_count", "first_time", "last_time"]) {
      if (!csvColumns.some((column) => column.name === name))
        sqlite.exec(`ALTER TABLE market_csv_datasets ADD COLUMN ${name} INTEGER NOT NULL DEFAULT 0`);
    }
    sqlite.exec(`UPDATE market_csv_datasets SET
      bar_count = json_array_length(bars_json),
      first_time = json_extract(bars_json, '$[0].time'),
      last_time = json_extract(bars_json, '$[#-1].time') WHERE bar_count = 0`);
  })();
  return drizzle(sqlite, { schema });
};

/** Singleton across Next dev hot reloads. */
export const db = globalForDb.__journalDb ?? (globalForDb.__journalDb = createDb());

export * from "./schema";

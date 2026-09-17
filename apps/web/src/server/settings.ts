import { eq } from "drizzle-orm";
import { db, settings } from "@/db";
import { EMPTY_DEFAULTS, type JournalDefaults } from "@/lib/journal-defaults";

export const getJournalDefaults = (): JournalDefaults => {
  try {
    return { ...EMPTY_DEFAULTS, ...JSON.parse(getSetting("journalDefaults") ?? "{}") };
  } catch {
    return EMPTY_DEFAULTS;
  }
};

export const getSetting = (key: string): string | null =>
  db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;

export const setSetting = (key: string, value: string): void => {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
};

export const deleteSetting = (key: string): void => {
  db.delete(settings).where(eq(settings.key, key)).run();
};

/** Journal display timezone (IANA), default UTC. */
export const getTimeZone = (): string => getSetting("timeZone") ?? "UTC";

/** Preserve the legacy parsing default until a separate import zone is saved. */
export const getImportTimeZone = (): string => getSetting("importTimeZone") ?? getTimeZone();

/** Per-symbol contract multipliers for futures/options P&L. */
export const getMultipliers = (): Record<string, number> => {
  const raw = getSetting("multipliers");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
};

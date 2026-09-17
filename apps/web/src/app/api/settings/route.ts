import { db, accounts } from "@/db";
import { rebuildAccount } from "@/server/rebuild";
import { handler, ok, requireValue } from "@/server/api";
import { getMultipliers, getTimeZone, getImportTimeZone, setSetting } from "@/server/settings";
import { isTimeZone } from "@/lib/timezone";

export const GET = handler(() =>
  ok({
    timeZone: getTimeZone(),
    importTimeZone: getImportTimeZone(),
    multipliers: getMultipliers(),
  }),
);

interface SettingsBody {
  timeZone?: string;
  importTimeZone?: string;
  multipliers?: Record<string, number>;
}

export const PATCH = handler(async (request: Request) => {
  const body = (await request.json()) as SettingsBody;
  requireValue(body && typeof body === "object" && !Array.isArray(body), "Enter valid settings.");

  for (const key of ["timeZone", "importTimeZone"] as const)
    if (body[key] !== undefined)
      requireValue(
        isTimeZone(body[key]),
        `Enter a valid IANA ${key === "timeZone" ? "display" : "import"} timezone.`,
      );

  if (body.multipliers !== undefined)
    requireValue(
      body.multipliers &&
        typeof body.multipliers === "object" &&
        Object.values(body.multipliers).every(
          (n) => typeof n === "number" && Number.isFinite(n) && n > 0,
        ),
      "Contract multipliers must be positive numbers.",
    );

  db.transaction(() => {
    if (body.timeZone !== undefined || body.importTimeZone !== undefined)
      setSetting("importTimeZone", body.importTimeZone ?? getImportTimeZone());
    if (body.timeZone !== undefined) setSetting("timeZone", body.timeZone);
  });

  if (body.multipliers !== undefined)
    db.transaction(() => {
      setSetting("multipliers", JSON.stringify(body.multipliers));
      for (const account of db.select({ id: accounts.id }).from(accounts).all())
        rebuildAccount(account.id);
    });

  return ok({ saved: true });
});

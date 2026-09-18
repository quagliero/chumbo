import managers from "@/data/managers.json";

/**
 * Who was actually running a team in a given week (I5).
 *
 * Three times a manager has handed a team over mid-season: sol to phil in
 * 2015, phil to nick in 2016, and chris covering sol for week 8 of 2020.
 * `managers.json` records it in each manager's `weeks` field, and for years
 * nothing read it.
 *
 * The league's rule is that **the manager who built the team owns its
 * record** — the W/L of those weeks belongs to whoever drafted it, not to the
 * stand-in. The site already credits every one of those seasons that way, so
 * no attribution changes here; this only lets a page say "managed by phil"
 * on the weeks somebody else was holding the reins.
 *
 * The owner of a handover season is the manager whose weeks start earliest —
 * the one who was there at the draft. A test holds that to the site's actual
 * attribution, because `teamId` cannot be used for the join: it is not the
 * roster id (sol's 2020 team is roster 6, `teamId` says 7).
 */

type WeeksByYear = Record<string, number[]>;

/** `${year}|${week}|${ownerId}` -> the interim manager's id. */
const interim = new Map<string, string>();
/** year -> the owner of that season's handed-over team. */
const owners = new Map<number, string>();

const withWeeks = managers.filter(
  (m): m is (typeof managers)[number] & { weeks: WeeksByYear } =>
    Boolean((m as { weeks?: WeeksByYear }).weeks)
);
const years = new Set(withWeeks.flatMap((m) => Object.keys(m.weeks).map(Number)));

for (const year of years) {
  const involved = withWeeks
    .filter((m) => m.weeks[year]?.length)
    .map((m) => ({ id: m.id, weeks: m.weeks[year] }));
  if (involved.length < 2) continue;

  const owner = involved.reduce((first, m) =>
    Math.min(...m.weeks) < Math.min(...first.weeks) ? m : first
  );
  owners.set(year, owner.id);
  for (const stand of involved) {
    if (stand.id === owner.id) continue;
    for (const week of stand.weeks) interim.set(`${year}|${week}|${owner.id}`, stand.id);
  }
}

/**
 * The manager who ran `ownerId`'s team that week, when it was not them.
 * `undefined` for every ordinary week — which is all but 16 of them.
 */
export const interimManager = (
  year: number,
  week: number,
  ownerId: string | undefined
): string | undefined =>
  ownerId ? interim.get(`${year}|${week}|${ownerId}`) : undefined;

/** Every handover season and its owner, for the test. */
export const handoverOwners = (): ReadonlyMap<number, string> => owners;

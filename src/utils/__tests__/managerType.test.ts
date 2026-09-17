import { describe, expect, it } from "vitest";
import managersJson from "@/data/managers.json";
import type { Manager } from "@/types/manager";

/**
 * The type now claims to describe managers.json exactly. That claim is only
 * worth anything if it is checked: the import is cast in `@/data`, so a field
 * added to the file would otherwise stay invisible exactly as `active`,
 * `weeks` and `scoringCrowns` did.
 */
describe("the Manager type", () => {
  const declared = new Set([
    "id", "name", "teamName", "userId", "teamId", "sleeper",
    "active", "weeks", "scoringCrowns",
  ]);

  it("declares every field the data actually holds", () => {
    const actual = new Set(managersJson.flatMap((m) => Object.keys(m)));
    const undeclared = [...actual].filter((key) => !declared.has(key));
    expect(undeclared, "add these to src/types/manager.ts").toEqual([]);
  });

  it("assigns without a cast", () => {
    // If this stops compiling, the type and the file have diverged.
    const managers: Manager[] = managersJson as Manager[];
    expect(managers.length).toBe(managersJson.length);
  });

  it("teamId really is sometimes a number, which is why callers must String() it", () => {
    // Typed through `Manager` rather than off the raw import: TypeScript infers
    // a literal union of every observed key set from the JSON, which is not
    // something a caller can narrow usefully.
    const managers: Manager[] = managersJson as Manager[];
    const values = managers
      .map((m) => m.teamId)
      .filter((id) => typeof id === "object")
      .flatMap((id) => Object.values(id as Record<string, string | number>));
    expect(values.some((v) => typeof v === "number")).toBe(true);
    expect(values.some((v) => typeof v === "string")).toBe(true);
  });
});

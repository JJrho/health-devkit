/**
 * E2-F4 標準化項目定義 seed（A41：小範圍已知項目，非完整醫學術語庫）。
 * 冪等：以 canonicalName 判斷是否已存在，重複執行不會建立重複資料。
 *
 * 刻意保守：本輪只 seed「單位白名單＝canonical 單位本身（換算係數 1.0）」，
 * 不 seed 任何跨單位換算係數（如 mg/dL↔mmol/L）——即使某些換算是廣為人知的
 * 臨床慣例，本輪範圍是「管線與原則正確」優先於「覆蓋率」，避免在未經專業
 * 審閱下把醫學換算係數寫死進程式碼，那是後續迭代（可能需要專業人員審核）
 * 該做的事，不是本輪 MVP 該擅自決定的。
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { testAliases, testDefinitionUnits, testDefinitions } from "@/db/schema";

interface SeedDefinition {
  canonicalName: string;
  canonicalUnit: string;
  aliases: string[];
}

const SEED_DEFINITIONS: SeedDefinition[] = [
  { canonicalName: "WBC", canonicalUnit: "10^3/uL", aliases: ["WBC"] },
  { canonicalName: "Glucose", canonicalUnit: "mg/dL", aliases: ["Glucose"] },
  { canonicalName: "Cholesterol", canonicalUnit: "mg/dL", aliases: ["Cholesterol"] },
  { canonicalName: "Vitamin D", canonicalUnit: "ng/mL", aliases: ["Vitamin D"] },
];

async function main() {
  const db = getDb();
  for (const seed of SEED_DEFINITIONS) {
    const existing = await db
      .select()
      .from(testDefinitions)
      .where(eq(testDefinitions.canonicalName, seed.canonicalName))
      .limit(1);

    const definitionId =
      existing[0]?.id ??
      (
        await db
          .insert(testDefinitions)
          .values({ canonicalName: seed.canonicalName, canonicalUnit: seed.canonicalUnit })
          .returning()
      )[0]!.id;

    for (const alias of seed.aliases) {
      const existingAlias = await db
        .select()
        .from(testAliases)
        .where(eq(testAliases.aliasText, alias))
        .limit(1);
      if (!existingAlias[0]) {
        await db.insert(testAliases).values({ testDefinitionId: definitionId, aliasText: alias });
      }
    }

    const existingUnit = await db
      .select()
      .from(testDefinitionUnits)
      .where(eq(testDefinitionUnits.testDefinitionId, definitionId))
      .limit(1);
    if (!existingUnit[0]) {
      await db.insert(testDefinitionUnits).values({
        testDefinitionId: definitionId,
        unitText: seed.canonicalUnit,
        factorToCanonical: "1",
      });
    }
  }
  console.log(`seeded ${SEED_DEFINITIONS.length} test definitions (idempotent)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

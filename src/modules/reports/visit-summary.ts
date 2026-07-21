import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { escalationSummaries, healthProfiles, interventionPlans, planReviews, symptomEvents } from "@/db/schema";
import { findOwnedProject } from "@/modules/projects";
import { listPlans } from "@/modules/plans";
import { getTrends, type TrendSeries } from "@/modules/trends";

/**
 * E5-F4（C19）：看診摘要僅即時彙整既有資料，不建立持久化物件（A128）。
 * 「執行中計畫」採與 Sprint 20 版本鏈 ADJUSTABLE_STATUSES 相同的語意——
 * 有實際執行歷程、非草稿也非終態的計畫（active／paused／ineffective／escalated）。
 */
const ONGOING_PLAN_STATUSES = new Set(["active", "paused", "ineffective", "escalated"]);

export interface VisitSummarySections {
  background: boolean;
  trends: boolean;
  plans: boolean;
  symptoms: boolean;
  questions: boolean;
}

export interface VisitSummaryPlanInfo {
  id: string;
  title: string;
  status: string;
  baseline: string | null;
  needsProfessionalEvaluation: boolean;
  latestEscalationNote: string | null;
}

export interface VisitSummarySymptomInfo {
  id: string;
  description: string;
  occurredAt: string;
  isAdverseEvent: boolean;
  status: string;
}

export interface VisitSummaryData {
  projectName: string;
  generatedAt: string;
  background?: Record<string, unknown>;
  trends?: TrendSeries[];
  plans?: VisitSummaryPlanInfo[];
  symptoms?: VisitSummarySymptomInfo[];
  question?: string;
}

export interface VisitSummaryInput {
  sections: VisitSummarySections;
  trendFrom?: string;
  trendTo?: string;
  symptomFrom?: string;
  symptomTo?: string;
  question?: string;
}

export type VisitSummaryResult =
  | { ok: true; data: VisitSummaryData }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" };

/**
 * A133：「想問醫師的問題」純使用者當下輸入的自由文字，不落地儲存、不做語意分析。
 * A118 一貫原則延伸：轉介摘要內容原樣帶出，不經任何摘要或潤飾。
 */
export async function buildVisitSummary(
  userId: string,
  projectId: string,
  input: VisitSummaryInput,
): Promise<VisitSummaryResult> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const db = getDb();
  const data: VisitSummaryData = {
    projectName: project.name,
    generatedAt: new Date().toISOString(),
  };

  if (input.sections.background) {
    const rows = await db
      .select()
      .from(healthProfiles)
      .where(eq(healthProfiles.projectId, project.id))
      .limit(1);
    data.background = (rows[0]?.data as Record<string, unknown>) ?? {};
  }

  if (input.sections.trends) {
    const trendsResult = await getTrends(userId, projectId);
    if (trendsResult.ok) {
      data.trends = trendsResult.series
        .map((series) => ({
          ...series,
          points: series.points.filter((point) => {
            if (input.trendFrom && point.date < input.trendFrom) return false;
            if (input.trendTo && point.date > input.trendTo) return false;
            return true;
          }),
        }))
        .filter((series) => series.points.length > 0);
    }
  }

  if (input.sections.plans) {
    const plansResult = await listPlans(userId, projectId);
    data.plans = [];
    if (plansResult.ok) {
      const ongoing = plansResult.plans.filter((plan) => ONGOING_PLAN_STATUSES.has(plan.status));
      for (const plan of ongoing) {
        const reviews = await db.select().from(planReviews).where(eq(planReviews.planId, plan.id));
        const needsEval = reviews.some((r) => r.classification === "needs_professional_evaluation");
        let latestEscalationNote: string | null = null;
        if (needsEval) {
          const summaries = await db
            .select()
            .from(escalationSummaries)
            .where(eq(escalationSummaries.planId, plan.id));
          const latest = summaries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
          latestEscalationNote = latest?.content ?? null;
        }
        data.plans.push({
          id: plan.id,
          title: plan.title,
          status: plan.status,
          baseline: plan.baseline,
          needsProfessionalEvaluation: needsEval,
          latestEscalationNote,
        });
      }
    }
  }

  if (input.sections.symptoms) {
    const conditions = [eq(interventionPlans.projectId, project.id)];
    if (input.symptomFrom) conditions.push(gte(symptomEvents.occurredAt, new Date(input.symptomFrom)));
    if (input.symptomTo) conditions.push(lte(symptomEvents.occurredAt, new Date(input.symptomTo)));

    const rows = await db
      .select({ symptomEvent: symptomEvents })
      .from(symptomEvents)
      .innerJoin(interventionPlans, eq(symptomEvents.planId, interventionPlans.id))
      .where(and(...conditions));

    data.symptoms = rows
      .map((row) => ({
        id: row.symptomEvent.id,
        description: row.symptomEvent.description,
        occurredAt: row.symptomEvent.occurredAt.toISOString().slice(0, 10),
        isAdverseEvent: row.symptomEvent.isAdverseEvent,
        status: row.symptomEvent.status,
      }))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  if (input.sections.questions) {
    const trimmed = input.question?.trim();
    data.question = trimmed ? trimmed : undefined;
  }

  return { ok: true, data };
}

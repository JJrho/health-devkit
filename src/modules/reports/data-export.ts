import archiver from "archiver";
import { getStorageAdapter, listDocuments } from "@/modules/documents";
import { listObservations } from "@/modules/observations";
import { getPlan, listPlans } from "@/modules/plans";
import { getProfile } from "@/modules/profiles";
import { findOwnedProject } from "@/modules/projects";
import { getTrends } from "@/modules/trends";

export type ExportResult =
  | { ok: true; archive: archiver.Archiver; filename: string }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" };

function csvCell(value: string | null | undefined): string {
  const text = value ?? "";
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * E5-F4（C20）：資料匯出，範圍為單一專案（A130）。ZIP 內含結構化 JSON、
 * 趨勢 CSV、原始上傳檔案；原始檔透過 StorageAdapter 直接串進回應串流，
 * 不簽發任何對外連結（A132）。
 */
export async function exportProjectData(userId: string, projectId: string): Promise<ExportResult> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const [profileResult, docsResult, obsResult, plansResult, trendsResult] = await Promise.all([
    getProfile(userId, projectId),
    listDocuments(userId, projectId),
    listObservations(userId, projectId),
    listPlans(userId, projectId),
    getTrends(userId, projectId),
  ]);

  const plansDetail = [];
  if (plansResult.ok) {
    for (const plan of plansResult.plans) {
      const detail = await getPlan(userId, projectId, plan.id);
      if (detail.ok) plansDetail.push(detail);
    }
  }

  const exportData = {
    project: { id: project.id, name: project.name, createdAt: project.createdAt },
    profile: profileResult.ok ? profileResult.profile : null,
    documents: docsResult.ok
      ? docsResult.items.map((doc) => ({
          id: doc.id,
          filename: doc.filename,
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
          reportDate: doc.reportDate,
          createdAt: doc.createdAt,
        }))
      : [],
    observations: obsResult.ok ? obsResult.items : [],
    plans: plansDetail,
    exportedAt: new Date().toISOString(),
  };

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.append(JSON.stringify(exportData, null, 2), { name: "data.json" });

  if (trendsResult.ok) {
    const rows = ["測項,單位,日期,數值,參考區間"];
    for (const series of trendsResult.series) {
      for (const point of series.points) {
        rows.push(
          [series.canonicalName, series.unit, point.date, point.value, point.referenceRange]
            .map(csvCell)
            .join(","),
        );
      }
    }
    // UTF-8 BOM：確保 Excel（Windows）開啟時中文不亂碼
    archive.append("﻿" + rows.join("\n"), { name: "trends.csv" });
  }

  if (docsResult.ok) {
    const storage = getStorageAdapter();
    for (const doc of docsResult.items) {
      if (!doc.storageKey) continue;
      const buffer = await storage.getObject(doc.storageKey);
      archive.append(buffer, { name: `documents/${doc.id}-${doc.filename}` });
    }
  }

  archive.finalize();

  return { ok: true, archive, filename: `${project.name}-匯出.zip` };
}

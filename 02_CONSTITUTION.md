# Project Constitution — 個人健康檢查管理平台

> 位階：本專案最上位法，任何產出不得違反。狀態：草案，待 Clarify（C1–C5）裁決後定稿為 v1.0.0。
> 遵循方法論：AI 敏捷開發流程 v1.2.0

## 1. Technology Stack

- MUST use: Next.js (App Router) + React + TypeScript; PostgreSQL (+ pgvector); Drizzle ORM; Tailwind CSS; Vitest + Testing Library + Playwright; SSE for AI streaming; OpenAPI 3.1.
- MUST NOT use: Firestore as the core relational database; a single HTML file as the production architecture; a standalone vector database in MVP; microservices in MVP.
- All external services (Auth, Storage, OCR, Queue, LLM) MUST be accessed through Adapter interfaces. Direct vendor SDK calls outside the adapter layer are prohibited.

## 2. Naming & Code Style

- Files and directories: kebab-case. Variables/functions: camelCase. Types/Components: PascalCase. Database: snake_case.
- Domain modules MUST NOT import from other domain modules' internals; only via exported service/repository interfaces.
- No cross-module direct table writes.

## 3. Medical & Content Safety Rules（本專案的資安底線層級）

- ALL LLM output MUST stream (SSE). Non-streaming LLM responses are prohibited.
- The AI MUST NOT produce: disease diagnoses, medication dosing, stop-medication advice, treatment guarantees, or exercise prescriptions based on BMI/weight/single readings alone.
- Unconfirmed extracted data MUST NOT enter official records, trends, or AI context.
- Every personal conclusion MUST cite the user's own confirmed data; every medical statement MUST cite an active knowledge source. Fabricated citations are prohibited; the model MUST NOT generate URLs as sources.
- When a plan shows no improvement, the system MUST NOT automatically increase intensity, restriction, or supplements, and MUST NOT blame the user.
- A plan stopped due to an adverse event MUST NOT be auto-restarted.
- Fortune-telling / Zi Wei Dou Shu data MUST NOT enter the health database or influence any health logic (separate brand, separate database).
- TCM personalized content MUST NOT be published without a licensed practitioner's review (T1 boundary only in MVP).

## 4. Data & Privacy Rules

- Health content, full prompts, AI answers, signed URLs, and tokens MUST NOT appear in logs.
- All health data queries MUST verify: authenticated user → project ownership → resource-in-project → not deleted. Client-supplied project_id alone is never sufficient. RLS is the second line of defense, not a replacement for application-layer authorization.
- Health numeric values MUST use `numeric`, never floating point. Original values and units MUST be preserved forever; edits create new versions.
- All mutations MUST support idempotency keys; mutable resources MUST carry `version`; conflicts return VERSION_CONFLICT, never silent overwrite.
- Buckets are private by default; downloads use short-lived signed URLs; uploads are content-validated and malware-scanned.
- Health data MUST NOT be used for model training without explicit consent.

## 5. Prohibited Behaviors（AI Coding Agent 常見越界）

- Do not introduce packages, services, or Cloud resources beyond this constitution without PO approval (D-numbered decision).
- Do not implement features absent from the SDD; do not pre-build "future" extensibility (over-design is technical debt).
- Do not hand-patch code when behavior mismatches spec: update spec first, regenerate (Iron Rule #2).
- Do not weaken accessibility baselines: WCAG 2.2 AA, keyboard operability, chart-equivalent data tables, reduced-motion respect, no color-only status.

## 6. Language Policy

All specifications, plans, and user-facing documentation MUST be written in Traditional Chinese. UI copy uses a gentle, non-blaming tone; no fear-based copy to drive paid services.

## 7. Documentation Rules

Any code change MUST be reflected in the SDD and related documents before implementation. Implementation-level gaps discovered mid-sprint MUST be logged as A-numbered assumptions and ratified by the PO at sprint end (methodology 10.2).

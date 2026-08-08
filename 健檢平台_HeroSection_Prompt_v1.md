# 個人健康健檢管理平台 — Hero Section 設計提案 v1.0
> 基礎架構沿用原版 TJ.md（S.P.D Hero Section），色彩／主視覺／文案全面改寫以對應健檢管理平台定位。

---

## 一、原型契合度評估

**結論：架構可用，內容需全面轉譯，不能照搬。**

| 元素 | 原版 | 問題 | 調整方向 |
|---|---|---|---|
| 背景色 | 純紅 #FF0000 | 醫療語境下紅色 = 警示/危險/出血，與「預防照護」訴求衝突 | 家醫科綠＋藍（見第二節） |
| 主視覺 | 三位老者密謀研究藏寶圖，氣氛懸疑 | 傳達「商業陰謀」感，不是「值得信賴的醫者」感 | 希波克拉底雕像，莊重獨立構圖，非群像密謀 |
| 文案敘事 | 「幫你的事業擺脫混亂」 | 健檢平台的用戶痛點不是「混亂」，是「病歷分散、追蹤斷裂、醫囑信任」 | 改寫為傳承醫者誓言 × 現代化追蹤的敘事 |
| 懸浮玻璃卡片 | 展示神秘符號/座標 | 手法本身很好，只是內容要換 | 改為健檢數據卡片（血壓、健檢提醒等） |

保留原版的「底部影片紅漸層融接」手法——這個 scroll-reveal 技巧是通用的，只需把 `#FF0000` 換成新主色即可。

---

## 二、色彩系統

替換 `@theme` 中的色彩邏輯，主色從紅轉為家醫科識別色（草綠＋水藍），避免過於冷調臨床感，加入一個暖金作為畫龍點睛：

```css
@theme {
  --color-jade-deep: #145C43;   /* 主背景：深翠綠，象徵生機/預防 */
  --color-sky-trust: #2E6F95;   /* 漸層/次色：水藍，象徵信賴/專業 */
  --color-gold-accent: #C9A227; /* 點綴：雕像手中卷軸的暖光，避免過冷 */
  --color-white: #FFFFFF;

  --font-manrope: "Manrope", sans-serif;
  --font-italiana: "Italiana", serif;
  --font-marck: "Marck Script", cursive;
}
```

背景建議用深綠→深藍的對角漸層（而非純色），比純色更有「呼吸感」：
```
bg-gradient-to-br from-[#145C43] via-[#1B4F5A] to-[#2E6F95]
```

---

## 三、主視覺構圖 Prompt（給圖像/影片生成 AI 使用）

> 這段是英文，直接貼給 Midjourney / Runway / 你慣用的生成工具即可。設計邏輯：以北醫校友會捐贈的希波克拉底雕像為核心意象，前景以「傳統醫者物件 × 現代健康科技」並置，呼應醫者誓言與現代健檢管理的融合。

```
A solemn white marble statue of Hippocrates — bearded elder in
draped classical robes, holding a scroll in one hand — standing
centered against a deep jade-green to trust-blue diagonal gradient
background. Warm golden rim lighting traces the statue's silhouette,
giving warmth to the cold marble. In the foreground, a minimalist
wooden desk holds an open laptop displaying a soft health dashboard
UI (heart-rate line chart, vitals summary). Beside it: a coiled
stethoscope resting on a closed leather-bound medical journal, a
magnifying glass over a printed health report, an hourglass, and a
small potted herb sprig — no globe, no antique instruments of
conquest, only quiet tools of care and continuity. Scattered around
the statue, small translucent glass UI cards float mid-air, each
showing a health metric callout (blood pressure trend, cholesterol
change, next check-up countdown), echoing a modern dashboard rather
than mysterious coordinates. Cinematic soft lighting, painterly
digital editorial illustration, dignified and trustworthy mood —
not mysterious or conspiratorial. Vertical composition, same aspect
ratio as reference, suitable for a looping hero video or static
hero image.
```

---

## 四、文案重寫（English Copy）

**Mission statement（取代原本「eliminate operational chaos」）**
```
We built this platform with a single purpose — to honor the
oath medicine was built on, while quietly watching over your
health in the background.
```

**兩段內文**
```
I Was Tired Of Health Records Scattered Across Clinics And Reports
I Could Never Find When I Needed Them Most. That Is Why We Built A
Quiet System That Keeps Watch Over Your Health, So Nothing Slips
Through The Cracks.

Your Health Should Serve Your Life, Not Complicate It. Let Our
Platform Track The Details And Remember The Dates, So You Can
Focus On Living Well.
```

**草寫簽名（cursive signature，原版是 "S.P.D"）**
→ 待確認，見第六節。

---

## 五、React / Tailwind Prompt 更新重點

沿用原版 TJ.md 的元件結構（`<section>` 容器、置中內容、底部影片＋漸層融接），僅需替換：

```tsx
<section className="relative min-h-screen w-full
  bg-gradient-to-br from-[#145C43] via-[#1B4F5A] to-[#2E6F95]
  flex flex-col z-10">
```

```tsx
<div className="absolute top-0 left-0 w-full h-[100px]
  bg-gradient-to-b from-[#145C43] to-transparent z-10 pointer-events-none" />
```

Logo SVG fill 保持白色即可（在綠藍背景上對比清楚，不需改動）。

其餘結構（外層 padding、內層 max-w、字級）建議原封不動——原版排版節奏是這個 Prompt 最值得保留的部分。

---

## 六、待確認事項

1. **簽名縮寫**：原版用 "S.P.D"（公司縮寫），這裡需要一個對應的短字——例如平台英文名縮寫，或乾脆用一個詞（如 "Vita" / "Oath"）。你希望用什麼？
2. **影片素材產製方式**：第三節的 Prompt 是要委外用 Midjourney/Runway 等工具生成，還是你有其他管道？我可以直接幫你調整成該工具偏好的 Prompt 格式。
3. **懸浮玻璃卡片的動畫**：要保留原版 `motion/react` 的互動效果（卡片隨滑鼠視差浮動）嗎？這部分程式邏輯我可以照搬，只是不確定你要不要。

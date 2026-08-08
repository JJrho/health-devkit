# 個人健康健檢管理平台 — Hero Section 設計提案 v2.1（已定案）

> 沿用 v1.0 的整體構圖邏輯（希波克拉底雕像＋現代健康科技並置），本版更新兩處：
> 具名品牌確認、雕像意涵修正為醫界普世共同的誓言。色彩維持現行已上線的
> `#2563EB` 藍，不重新引入 v1.0 曾提出的綠色系——公開站五頁已經用這個藍色
> 上線，Hero 視覺升級應該延續一致性，不要另立一套配色。
>
> **2026-08-08 更新**：王醫師本人已於當面早餐會議中確認第五節三項全數同意，
> 無需調整，本文件正式定案，可交付實作。

---

## 一、具名品牌確認

- **顯示名稱**：獅子座的王醫師（王健宇醫師）——沿用他 Facebook 既有品牌命名
  慣例，暱稱在前、本名括號在後，不特別另創新格式
- **補充資訊**（供之後撰寫「產品說明」頁的可信度段落使用，Hero 頁本身維持簡潔
  不放）：
  - 醫療產業公司經營者
  - 《年代 MUCh 台灣健康好生活》節目固定來賓，長期宣導正確醫療觀念
  - 多本醫療著作作者
- **這批背景資訊的價值**：不只是「這個人是醫師」，是「這個人長期在公開媒體上
  做正確醫療觀念的把關工作」——這個定位跟平台「有出處根據、不誇大」的原則是
  同一種調性，之後寫可信度文案時可以直接扣這一點，不用另外編故事

---

## 二、希波克拉底雕像意涵修正

**v1.0 的問題**：原本的敘事框在「北醫校友會捐贈」這個特定脈絡，範圍過窄。

**修正後的敘事**：希波克拉底誓言是全世界醫學生畢業前共同宣讀的誓詞，不限
特定學校或國家。雕像在這裡代表的是**醫病關係以信任為基礎，這是整個醫療界
（不分校系、不分國界）共通的核心價值**——王醫師個人是這個普世價值的實踐者
之一，不是唯一代表，畫面呈現的是他所屬的整個專業傳承，不是他個人的母校故事。

這個修正讓視覺意涵從「一個人、一所學校的故事」，變成「一個人代表了整個
醫療專業的承諾」，格局更大，也更適合作為平台的核心視覺，不會因為換一位
醫師合作就要重新設計。

---

## 三、更新後的主視覺構圖 Prompt

```
A solemn white marble statue of Hippocrates — bearded elder in draped
classical robes, holding a scroll in one hand, representing the
Hippocratic Oath recited by medical graduates worldwide regardless of
school or nation — standing centered against a deep blue gradient
background (matching brand blue #2563EB). Warm golden rim lighting
traces the statue's silhouette. In the foreground, a minimalist wooden
desk holds an open laptop displaying a soft health dashboard UI
(heart-rate line chart, vitals summary). Beside it: a coiled
stethoscope resting on a closed leather-bound medical journal, a
magnifying glass over a printed health report, a small potted herb
sprig. Scattered around the statue, small translucent glass UI cards
float mid-air, each showing a health metric callout (blood pressure
trend, cholesterol change, next check-up countdown). Cinematic soft
lighting, painterly digital editorial illustration, dignified and
trustworthy mood — universal and professional, not tied to any single
institution. Vertical composition, suitable for a looping hero video
or static hero image.
```

---

## 四、Hero 頁文案更新（取代現行過渡版）

**主標（不變）**
把多年健檢報告，變成看得懂的健康紀錄

**副標（不變）**
不做診斷、不開藥、不用命理——用你自己的資料，陪你一步步看懂身體的長期變化。

**新增：具名推薦區塊**（放在信任卡片下方，Hero 頁下半部）

```
本平台由「獅子座的王醫師（王健宇醫師）」與團隊共同發起。

王醫師長期於《年代 MUCh 台灣健康好生活》節目分享正確醫療觀念，
我們相信——好的醫病關係，永遠建立在信任之上。
```

（這段文字刻意不提及命理／星座相關詞彙，避免跟平台「不用命理」的核心原則
產生任何視覺或語意上的聯想。「獅子座」在此純粹是既有品牌名稱的一部分，
不需要特別解釋，一般讀者能自然分辨這是暱稱不是功能。）

---

## 五、王醫師本人確認結果（2026-08-08，早餐會議當面確認）

**三項全數同意，無需調整：**

1. ✅ 「獅子座的王醫師（王健宇醫師）」＋《年代 MUCh 台灣健康好生活》節目來賓
   介紹方式，同意公開使用
2. ✅ 「本平台由獅子座的王醫師與團隊共同發起」，同意此參與程度描述
3. ✅ 不放真人照片，以希波克拉底雕像意象代表醫者誓言，同意此處理方式

**共同初衷（PO 與王醫師當面確認，供後續接手者理解此專案起點，不作為頁面
文案使用）**：兩人希望透過這個平台做一些對病患、對社會有意義的事，把產品
做到讓使用者滿意、做到極致，是這個專案自始至終的核心目標。

---

## 六、KB 資料庫靈活化構想（僅記錄，本輪不展開）

> 記錄用途，供之後正式排入評估流程時參照，不在本次 Hero 視覺工作範圍內。

PO 提出構想：
1. 現行 KB 以王醫師著作為主要參考來源
2. 補充國內外醫學學會報告與主要文獻
3. 未來規劃：其他醫師若欲使用本平台，可授權自己的著作或指定文獻，建立
   專屬 KB，代表 KB 架構需具備「多來源、可歸屬」的彈性設計

**評估時需要涵蓋**：授權/法律機制、多租戶資料架構設計、商業定位轉變的
影響、對現行 MVP 範圍與 WBS 的衝擊。建議另開專門討論，不併入本次工作。

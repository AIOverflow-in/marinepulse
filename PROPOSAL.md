# MarinePulse — Product Pivot Proposal
## VDR Navigational Audit Automation Platform

**Prepared by:** Chethan
**Client:** Capt. Yatendra Singh, Nivyash Marine Management Services Pvt Ltd
**Meeting Date:** March 18, 2026

---

## 1. Problem Statement

Capt. Yatendra conducts navigational audits of commercial vessels. Each audit involves analyzing VDR (Voyage Data Recorder) data alongside 15–20 ship documents, scoring 121 checklist items, writing 4–6 detailed findings, and manually assembling everything into a structured ~60-page report. This currently takes **4–5 working days per audit**.

The initial MarinePulse prototype was rejected — it is generic fleet management software that doesn't address this specific workflow. The client already uses digital tools (Excel + Word). The goal is **eliminating the manual assembly burden** to reduce 4–5 days to a few hours.

---

## 2. What We Learned From the Client's Files

### 2.1 The Sample Report (Word Document)

The final report is a structured ~60-page document with two parts:

**Part 1 — Summary and Findings**

| Section | Content | Auto-fillable? |
|---|---|---|
| Report Overview | Vessel name, IMO, analysis period, port, zone time, assessor credentials | Phase 1 (manual form) |
| Operations Assessed | Y/N checkboxes: Channels, Pilotage, Coastal, Deep Sea, Unberthing, Berthing, Anchoring, STS, Restricted Visibility, In Port, Drifting | Phase 1 (form) |
| Executive Summary | 7 fixed assessment subjects + auditor remarks per row | Phase 1 (text entry) |
| List of Findings | Table: Sr No, Observation title, BPG Ref, Due Date | Auto-generated from findings |
| Numbered Findings (1–N) | Each: Observations text, Evidence block, Recommendation | Phase 1 (structured editor) |
| Key Indicators — Scoring | Total subjects, assessed, NS count, max score, total score, %, avg | **Auto from checklist** ✅ |
| Static Assessment table | Per-category subjects assessed, avg score, % score | **Auto from checklist** ✅ |
| Dynamic Assessment table | Same, for dynamic categories | **Auto from checklist** ✅ |
| Overall View | "Did it feel safe?" narrative | Phase 1 (text entry) |

**Part 2 — Detailed Report**

| Section | Content | Auto-fillable? |
|---|---|---|
| Preface / Objective | Standard boilerplate text | Static template |
| Scope | Operations assessed description | From form |
| Photograph of Navigating Area | ECDIS/chart screenshot | Phase 1 (upload) |
| VDR Data Availability | VDR system details, data period | Phase 1 (form) |
| VDR Audio Transcript Summary | Key audio events | **Phase 2 (AI)** |
| Performance Indicators | Bar charts per category | **Auto from checklist** ✅ |
| Legal Disclaimer | Boilerplate | Static template |

---

### 2.2 The Sample Workbook (Excel)

One sheet per audit vessel (named e.g., "GOLDEN FRIO OSM"). **121 total items** across 11 categories.

**Column structure:**
- Column B: Category name
- Column C: Checklist item text (the question)
- Column D: Rating (0–5 or "NS" = Not Sighted)
- Column E: Auditor comments
- Column F: Guidance note (reference text for the auditor)

**Categories and item counts:**

| Assessment Type | Category | Items |
|---|---|---|
| Static | Company Policy | 15 |
| Static | Passage Planning | 10 |
| Static | Bridge Equipment | 27 |
| Static | Forms and Checklists | 7 |
| Dynamic | Company Policy | 5 |
| Dynamic | Bridge Team Organisation | 11 |
| Dynamic | Duties | 10 |
| Dynamic | General Navigation | 7 |
| Dynamic | Passage Planning | 6 |
| Dynamic | Use and Understanding of Bridge Equipment | 9 |
| Dynamic | Pilotage | 8 |
| **Total** | | **121** |

**Scoring logic:**
- Score 0–5 per item (0 = hazard/never practiced, 5 = consistently good)
- "NS" = Not Sighted (excluded from all calculations)
- Maximum Score = (items with numeric score) × 5
- Total Score = sum of all numeric scores
- Average = Total Score ÷ Assessed Count
- Percentage = (Total Score ÷ Maximum Score) × 100

**Rating descriptors:**

| Score | Grading | Description |
|---|---|---|
| 4.1–5 | Good — Mostly Practiced | Practices generally meet specified requirements |
| 3.1–4 | Fair — Adequate | Randomly practiced. Needs improvement |
| 2.1–3 | Poor — Rarely Practiced | Below established requirements. Process improvement required |
| 1.1–2 | Non-existent — Never Practised | Poor implementation or systems not in place |
| 0–1 | Hazard | Immediate action required |

---

## 3. Revised Scope (Post-Meeting, March 19, 2026)

**Client's immediate priority:** Get the checklist/scoring workbook working correctly first, then generate the report from that data. Everything else (findings editor, vessel particulars, executive summary) is Phase 2.

This is the right approach — the checklist is the heart of the audit. Once scores are captured digitally, the scoring-derived sections of the report (Key Indicators, category tables, charts) generate automatically. The auditor can review and download in minutes instead of manually copying data from Excel to Word.

---

## 4. Phase 1 — Checklist + Report Generation

### What Phase 1 Delivers

1. **Digital scoring workbook** — All 121 items replacing the existing generic checklist
2. **Updated scoring scale** — 0–5 + NS (matching the Excel exactly)
3. **Live score calculations** — Totals, averages, per-category breakdowns auto-computed
4. **Report generation** — One-click download of a Word document with all checklist-derived sections filled in

### 4.1 Digital Scoring Workbook

The existing inspection scoring page is adapted to match Yatendra's workflow.

**Changes from current:**
- **Score scale:** 0–5 + "NS" instead of 1–5 (adds 0 = Hazard and NS = Not Sighted)
- **Score labels:**
  - 0 = Hazard
  - 1 = Non-existent / Never Practised
  - 2 = Poor / Rarely Practiced
  - 3 = Fair / Adequate
  - 4 = Good / Mostly Practiced
  - 5 = Excellent / Consistently Practiced
  - NS = Not Sighted (excluded from score)
- **Guidance notes:** Each item has a collapsible guidance note (from Column F in the Excel). Click to expand; shows what to look for.
- **Comments:** Free text comment per item (already exists; now always visible)
- **NS handling:** NS items are shown in gray, excluded from max score and average calculations

**Live calculation panel (sidebar):**
- Total Subjects: 121
- Assessed (numeric score): live count
- Not Sighted (NS): live count
- Maximum Score: assessed × 5
- Total Score: sum
- Average: X.XX / 5
- Percentage: XX.X%

### 4.2 Scoring Formula (Matching Excel Exactly)

```
Total Subjects = 121
Total Assessed = count of items with score 0–5
Total NS       = count of items scored NS
Maximum Score  = Total Assessed × 5
Total Score    = sum of all numeric scores
Average        = Total Score ÷ Total Assessed
Percentage     = (Total Score ÷ Maximum Score) × 100
```

Per-category breakdown:
- Same formula applied per category
- Two separate summary tables: Static Assessment + Dynamic Assessment

### 4.3 Report Generation

On the inspection detail page, a "Generate Report" button downloads a Word (.docx) file.

**Sections auto-populated from scores:**
1. Key Indicators table (all scoring totals)
2. Static Assessment Aspects table (4 categories)
3. Dynamic Assessment Aspects table (7 categories)
4. Performance Indicator bar charts (one per category, embedded as image)
5. Vessel name, inspection date (from inspection record)

**Sections as placeholders (for manual completion):**
- Vessel particulars beyond name/date
- Assessor credentials
- Operations assessed
- Executive summary remarks
- Numbered findings

---

## 5. Phase 2 — Full Report Automation

*(After Phase 1 is validated)*

### 5.1 Vessel Particulars Form
- Vessel name, IMO, analysis period (from/to with time), port, zone time
- Operations assessed Y/N checkboxes (Channels, Pilotage, Coastal, Deep Sea, etc.)
- Assessor profile (pre-filled from account, editable per audit)

### 5.2 Executive Summary Builder
- 7 fixed assessment subjects (pre-populated)
- Auditor fills in "Remarks" column for each
- Auto-flows into report

### 5.3 Findings Editor
- Numbered findings with: title, BPG reference, due date, observations, evidence list, recommendation
- Photos/screenshots attachable to each finding
- "List of Findings" summary table auto-generated

### 5.4 Document Upload + AI Extraction
- Upload PDFs (vessel particulars, port documents)
- Claude AI reads and pre-fills: vessel name, IMO, port, dates
- Auditor reviews extracted values before saving

### 5.5 AI Finding Suggestions
- After scoring, AI analyzes items scored ≤2
- Suggests finding text (title, observation, recommendation) for auditor to review and edit

### 5.6 Advanced Document Analysis
- Passage plan PDF validation (checks for missing UKC calculations, safety contours, etc.)
- ECDIS screenshot reading (HDOP value, safety contour settings)
- Scanned checklist verification (missing signatures, wrong vessel names)

### 5.7 Logbook OCR + Validation
- Upload photos of handwritten logbooks
- OCR + AI validates entries against criteria list
- Flags missing items as potential findings

### 5.8 VDR Audio Transcript Processing
*(Deferred — high cost, pending review of source software)*
- If auditor has a text transcript: AI maps events to findings automatically

---

## 6. What Changes in the Current Codebase

We are **adapting the existing code**, not rebuilding from scratch.

| Current Feature | Action | Change |
|---|---|---|
| 75-item generic VHI checklist | **Replace** | 121-item navigational audit workbook |
| Score scale 1–5 | **Update** | 0–5 + NS |
| VHI weighted score (0–100 index) | **Replace** | Percentage + average (matching Excel formula) |
| "Grade A/B/C/D/F" | **Keep** | Mapped to: A ≥80%, B ≥65%, C ≥50%, D ≥35%, F <35% |
| Fleet dashboard | **Adapt** | Keep but show audit score % instead of VHI |
| Authentication, design system, sidebar | **Keep** | No changes |
| Inspection requests module | **Keep** | Used for scheduling audits |

---

## 7. Open Questions

Before starting Phase 2, we need from the client:

1. **Are the 121 items fixed for all audits?** Or does the auditor add/remove items per vessel/company?
2. **Word template file** — We need the actual `.docx` template (not the filled sample report) for exact font/logo/header matching.
3. **Highlighted report sections** — Aman to mark which sections are Phase 1 auto-fill vs. manual.
4. **Multiple auditors?** — Is this solo use (just Yatendra) or will other auditors at Nivyash use it too?
5. **Report branding** — Logo file and placement for the report header.

---

## 8. Build Order

### Phase 1 (Now)
1. Seed 121 checklist items (with guidance notes, assessment_type)
2. Update scoring model to support 0–5 + NS
3. Update scoring page UI (new buttons, guidance notes, NS handling)
4. Update score calculation service (replace VHI formula)
5. Update inspection detail page (show %, avg, category breakdown)
6. Add report generator (python-docx → Word download)

### Phase 2 (After client validates Phase 1)
7. Vessel particulars form
8. Executive summary builder
9. Findings editor with photo upload
10. Document upload + Claude AI extraction
11. AI finding suggestions
12. Advanced document analysis

# MarinePulse — Navigational Audit Platform
## User Guide

---

## Starting the App

```bash
# Terminal 1 — Backend (port 8000)
cd backend && source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend (port 3000)
cd frontend && npm run dev
```

Open **http://localhost:3000**

> Frontend API URL is configured in `frontend/.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:8000`

---

## Demo Accounts

| Role | Email | Password | Access |
|------|-------|----------|--------|
| `consultancy_admin` | admin@nordicmaritime.com | admin123 | Full access — create/edit everything, user management |
| `surveyor` | james@nordicmaritime.com | surveyor123 | Score & submit inspections |
| `viewer` | viewer@marinepulse.com | viewer123 | Read-only across all pages |

---

## Pages & Features

### Dashboard (`/dashboard`)
Fleet overview at a glance.
- **KPI Cards** — Active vessels, fleet average audit score, inspections this month, open deficiencies
- **Fleet Score Trend** — Line chart showing each vessel's audit score over time
- **Vessel Benchmark** — Horizontal bar chart comparing all vessels' latest score
- **Category Radar** — Average score across inspection categories
- **Top Deficiencies** — Table of most frequently failed items with failure rates

---

### Vessels (`/vessels`)
Full vessel registry with search, filter, and pagination.
- **Search** by vessel name or IMO number
- **Filter** by status (Active / Inactive / Drydock)
- **Pagination** — 12 vessels per page
- Click a vessel card to view its details and full inspection history
- **Add Vessel** button (admin) — opens a create form
- **Edit** button on vessel detail (admin) — inline dialog to update name, port, flag state, status

---

### Inspections (`/inspections`)
All inspection records with filtering and pagination.
- **Filter** by vessel, status, and date range (from / to)
- **Pagination** — 20 records per page
- **New Inspection** button (admin) — create and immediately land on the scoring page
- Rows link to score page (in_progress) or detail view (submitted/reviewed)

**Statuses:** `in_progress` → `submitted` → `reviewed`

---

### Scoring an Inspection (`/inspections/[id]/score`)
*Surveyor or admin role required*

1. Open an **in-progress** inspection
2. The left sidebar shows all 11 categories — click any category to jump to it
   - Categories are split into **STATIC** (4 categories, 61 items) and **DYNAMIC** (7 categories, 60 items)
3. For each item, select a score using the row of buttons:

| Button | Label | Color |
|--------|-------|-------|
| **0** | Hazard | Dark red |
| **1** | Non-existent | Red |
| **2** | Poor | Orange |
| **3** | Fair | Amber |
| **4** | Good | Lime |
| **5** | Excellent | Green |
| **NS** | Not Sighted | Grey |

4. Items scored **0, 1, or 2** are auto-flagged as deficiencies (shown with a red dot)
5. **NS** (Not Sighted) items are excluded from score calculations entirely
6. Click the **?** icon next to any item name to expand its guidance note
7. A comment field appears below any scored (non-NS) item
8. The **right sidebar** shows a live preview:
   - `72.8%` percentage score + `(3.64/5 avg)`
   - NS count badge
   - Items scored / total items progress
9. Scores **auto-save** every 3 seconds — no manual save needed
10. Once all 121 items are scored (NS counts as scored), the **Submit Inspection** button activates
11. Click **Submit** — the final percentage and grade are calculated and locked

**Grade thresholds:**
| Grade | Score |
|-------|-------|
| A | ≥ 80% |
| B | ≥ 65% |
| C | ≥ 50% |
| D | ≥ 35% |
| F | < 35% |

---

### Inspection Detail (`/inspections/[id]`)
Read-only view of a completed inspection.
- **Audit Score** card — percentage (e.g. `72.8%`) with grade badge
- **Average Score** card — out of 5 (e.g. `3.64 / 5`)
- **Status** card — assessed count, NS count, deficiency count
- **Static Assessment** table — per-category breakdown (Assessed, Avg, %) with colour-coded % column
- **Dynamic Assessment** table — same breakdown for dynamic categories
- **All Scores** — full item list grouped by category, with score chips colour-coded by value
- **Download Report** button — generates and downloads a `.docx` Word report
- **Admin:** edit remarks and mark as reviewed

---

### Report Download
From the Inspection Detail page, click **Download Report**.

The generated `.docx` file contains:
1. **Cover info** — vessel name, company, audit date, port, overall grade
2. **Key Indicators table** — total subjects, assessed, NS, max score, total score, average, percentage, grade
3. **Static Assessment table** — category-level scores for all static categories
4. **Dynamic Assessment table** — category-level scores for all dynamic categories
5. **Performance charts** — horizontal bar charts for static and dynamic categories
6. **Deficiency summary** — all items scored 0–2 with comments
7. **Complete score sheet** — all 121 items grouped by category

> Executive summary, narrative findings, and vessel particulars should be filled in manually.

---

### Inspection Requests (`/inspection-requests`)
Plan and track upcoming inspections before they begin.
- **Filter** by vessel and status
- **Pagination** — 20 per page
- **New Request** button (admin) — create a request with vessel, port, type, priority, scheduled date, and assigned surveyor
- **Detail page** — view request info, assign/change surveyor, add notes
- **Create Inspection** button on detail page — converts the request into an active inspection and opens the scoring page

**Statuses:** `pending` → `assigned` → `in_progress` → `completed`

---

### Checklists (`/checklists`)
Manage inspection checklist templates.
- **Search** templates by name
- **Pagination** — 12 per page
- **Delete** (admin) — deactivates the template (existing inspections unaffected)

The active template is **"Navigational Audit Checklist — Nivyash Marine"** with 121 items across 11 categories:

| Section | Category | Items |
|---------|----------|-------|
| Static | Company Policy | 15 |
| Static | Passage Planning | 10 |
| Static | Bridge Equipment | 29 |
| Static | Forms and Checklists | 7 |
| Dynamic | Company Policy | 5 |
| Dynamic | Bridge Team Organisation | 11 |
| Dynamic | Duties | 12 |
| Dynamic | General Navigation | 8 |
| Dynamic | Passage Planning | 6 |
| Dynamic | Use and Understanding of Bridge Equipment | 10 |
| Dynamic | Pilotage | 8 |

---

### Analytics (`/analytics`)
Full-page charts — same data as dashboard with more space.
- Fleet audit score trend over time
- Vessel-by-vessel benchmark comparison
- Category performance radar
- Top deficiency items with failure rates

---

### AI Assistant (`/chat`)
Natural language queries over your fleet data. Powered by GPT-4o with real MongoDB tool calls.

**Chat sessions are persisted** — previous conversations appear in the left sidebar. Click any session to reload it.

**Example questions:**
- "Which vessel has the lowest audit score?"
- "What are the most frequent deficiencies?"
- "Compare MV Atlantic Star and MV Baltic Arrow"
- "Which category has the worst performance?"
- "Are there any pending inspections?"
- "Show me the fleet ranking by score"

> Enter to send · Shift+Enter for new line

---

### Users (`/users`)
*Admin only — visible in sidebar only for `consultancy_admin` role*

- **Search** by name or email
- **Filter** by role
- **Pagination** — 20 per page
- **Add User** — create a new user with name, email, password, and role
- **Edit** — change name, role, or active status inline
- **Deactivate** — soft-delete (user cannot log in; data is preserved)

**Roles:**
| Role | Description |
|------|-------------|
| `consultancy_admin` | Full access to everything including user management |
| `surveyor` | Can score and submit inspections |
| `shipping_company` | Can add vessels and create inspection requests |
| `viewer` | Read-only access to all data |

---

## Scoring Formula

```
percentage = (total_score / max_score) × 100

where:
  total_score = sum of all numeric scores (0–5)
  max_score   = count of numeric scores × 5
  NS items    = excluded from both numerator and denominator
```

- Average = total_score / count of assessed items
- Items scoring 0, 1, or 2 are counted as deficiencies
- Items scoring 0 or 1 with weight=3 are critical deficiencies

---

## Test Flows

### Flow 1 — Score a full inspection end-to-end

1. Log in as `admin@nordicmaritime.com`
2. Go to **Inspections** → click **New Inspection**
3. Select any vessel, today's date, and the Navigational Audit template
4. On the scoring page:
   - Score a few items as **0** or **1** → confirm they turn red and show deficiency dot
   - Score one item as **NS** → confirm it turns grey and the live % doesn't drop
   - Click the **?** icon on any item → confirm the guidance note expands
   - Wait 3 seconds → confirm scores auto-save (no spinner/error)
5. Score all remaining items (any value 0–5 or NS)
6. Confirm the **Submit** button appears once all 121 are scored
7. Click **Submit** → you're redirected to the inspection detail page
8. Confirm the **Audit Score %**, **Average**, and category breakdown tables are populated
9. Click **Download Report** → `.docx` downloads with correct data

---

### Flow 2 — NS exclusion from score calculation

1. On the scoring page, score 10 items as **5** (excellent) and 2 items as **NS**
2. Live sidebar should show:
   - `total_assessed = 10`, `max_score = 50`, `total_score = 50`
   - `percentage = 100.0%`, `NS: 2`
3. Now change one item from **5** to **NS** — confirm % stays 100% (denominator reduced too)
4. Change one NS item to **0** — confirm % drops to `50/55 = 90.9%`

---

### Flow 3 — Deficiency detection

1. Score any item **0** → confirm: red background, deficiency dot in sidebar, counted in deficiency total
2. Score any item **2** → confirm: orange background, also flagged as deficiency
3. Score any item **3** → confirm: amber background, NOT flagged as deficiency
4. After submission, open the detail page → deficiency count in status card matches what you scored

---

### Flow 4 — Report generation

1. Open any **submitted** inspection (e.g. from the seeded historical data)
2. Click **Download Report**
3. Open the downloaded `.docx` in Word or LibreOffice
4. Verify:
   - Cover table shows correct date, port (if any), and grade
   - Key Indicators table has correct total subjects (121), total assessed, NS count, total score, %, avg
   - Static Assessment table lists 4 categories with correct subjects assessed and percentages
   - Dynamic Assessment table lists 7 categories
   - Two bar charts appear (one static, one dynamic)
   - Deficiency section lists only items scored 0–2
   - Complete Score Sheet lists all 121 items grouped by category

---

### Flow 5 — Admin review workflow

1. Log in as `admin@nordicmaritime.com`
2. Open a **submitted** inspection
3. Scroll to the bottom → enter admin remarks in the text box
4. Click **Mark as Reviewed**
5. Confirm status changes to `reviewed` and `reviewed_at` timestamp appears

---

### Flow 6 — Multi-user role check

| Action | admin | surveyor | viewer |
|--------|-------|----------|--------|
| View inspections list | ✅ | ✅ | ✅ |
| Create new inspection | ✅ | ✅ | ❌ |
| Score items | ✅ | ✅ | ❌ |
| Submit inspection | ✅ | ✅ | ❌ |
| Download report | ✅ | ✅ | ✅ |
| Mark as reviewed | ✅ | ❌ | ❌ |
| Add users | ✅ | ❌ | ❌ |
| Users page visible in sidebar | ✅ | ❌ | ❌ |

---

## API Reference

Backend runs at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/login` | Login, returns JWT |
| `GET /api/vessels` | List vessels (search, status, skip, limit) |
| `POST /api/vessels` | Create vessel |
| `PUT /api/vessels/{id}` | Update vessel |
| `GET /api/inspections` | List inspections (vessel, status, date range, skip, limit) |
| `POST /api/inspections` | Create inspection |
| `GET /api/inspections/{id}` | Get inspection detail |
| `GET /api/inspections/{id}/scores` | Get all scores (includes item_name, guidance_note, assessment_type) |
| `POST /api/inspections/{id}/scores` | Bulk upsert scores (accepts 0–5 or "NS") |
| `POST /api/inspections/{id}/submit` | Submit & compute audit score |
| `POST /api/inspections/{id}/report` | Download Word report (.docx) |
| `PUT /api/inspections/{id}` | Admin edit — remarks and status |
| `GET /api/inspection-requests` | List requests (vessel, status, skip, limit) |
| `POST /api/inspection-requests` | Create request |
| `GET /api/checklists` | List templates (search, skip, limit) |
| `GET /api/analytics/summary` | KPI card data |
| `GET /api/analytics/fleet-vhi` | Score trend time series |
| `GET /api/analytics/vessel-benchmark` | Latest score per vessel |
| `GET /api/analytics/deficiencies` | Top recurring deficiencies |
| `GET /api/analytics/category-performance` | Avg score per category |
| `POST /api/chat` | Streaming AI chat (GPT-4o) |
| `GET /api/chat/sessions` | List user's chat sessions |
| `GET /api/users` | List users — admin only |
| `POST /api/users` | Create user — admin only |
| `PUT /api/users/{id}` | Update user — admin only |
| `DELETE /api/users/{id}` | Deactivate user — admin only |

---

## Reseed Database

```bash
cd backend && source venv/bin/activate && python scripts/seed.py
```

Resets to:
- 2 companies, 5 users (admin / surveyor / viewer)
- 6 vessels across different types
- 1 checklist template: **121-item Navigational Audit Checklist — Nivyash Marine**
- 35 completed inspections + 1 in-progress (MV Nordic Trader, current month)

Sample score distribution in seed data:
- ~10% of items scored as NS (excluded from calculations)
- Scores weighted towards 3–5 with occasional 0–2 deficiencies
- MV Baltic Arrow consistently scores A (≥80%)
- MV Caspian Spirit has a historical D-grade inspection (2024-12) to test low-score display

---

## Dependencies

```
# Backend Python packages (backend/requirements.txt)
fastapi, uvicorn, beanie, motor     — API + MongoDB ORM
python-jose, passlib                — JWT auth
python-docx==1.1.2                  — Word report generation
matplotlib==3.9.2, numpy==2.1.1     — Charts embedded in reports
openai>=1.52.0                      — AI chat (GPT-4o)
```

> **Note:** `openai>=1.52.0` is required. Version 1.47.x is incompatible with `httpx>=0.28` (proxies argument removed).

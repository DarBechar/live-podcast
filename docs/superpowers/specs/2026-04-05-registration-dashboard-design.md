# Registration Dashboard — Design Spec

## Overview
דשבורד הרשמות לאירוע "פודקאסט לייב" — דף HTML יחיד + Netlify Function, מוגן בסיסמה משותפת.

## Architecture
- `dashboard.html` — single-file dashboard (HTML + inline CSS + JS)
- `netlify/functions/dashboard-data.js` — serverless API that fetches & aggregates Airtable data
- No build step, no npm dependencies beyond existing dotenv
- Chart.js loaded from CDN

## Authentication
- Simple shared password stored in `DASHBOARD_PASSWORD` env var
- Client sends password via `X-Dashboard-Password` header
- Function returns 401 if password missing/wrong
- Password saved in `sessionStorage` after successful login
- Login screen: minimal, with Louharya logo

## Netlify Function (`dashboard-data.js`)

### Input
- HTTP GET with `X-Dashboard-Password` header

### Data Fetching
1. Fetch all ActivityParticipants for the activity (filter by `ACTIVITY_RECORD_ID`)
   - Fields: Activity, Participant, Notes, Attendance Status, אישור קבלת דיוור, UTM Source, UTM Medium, UTM Campaign, Created (or created time)
2. Fetch all linked Participants
   - Fields: FirstName, LastName, PhoneNumber, Email, נתיב לימודים
3. Uses existing `airtableRequest` + `fetchAll` pattern with pagination

### Response JSON
```json
{
  "totals": {
    "total": 150,
    "activeStudents": 45,
    "nonStudents": 105,
    "newsletterOptIn": 120
  },
  "byStatus": {
    "תלמיד פעיל": 30,
    "תלמיד במעבר": 5,
    "פעיל מועדון": 8,
    "תלמיד לשעבר": 2,
    "לא תלמיד": 105
  },
  "byLearningPath": {
    "קשרים חיים": 20,
    "תהודה והשראה": 15,
    "ללא": 10
  },
  "byUtmSource": { "instagram": 40, "facebook": 30, "direct": 80 },
  "byUtmMedium": { ... },
  "byUtmCampaign": { ... },
  "byDate": { "2026-03-20": 5, "2026-03-21": 12, ... },
  "registrations": [
    {
      "name": "שם מלא",
      "phone": "050...",
      "email": "...",
      "status": "תלמיד פעיל",
      "learningPath": "קשרים חיים",
      "newsletter": true,
      "utmSource": "instagram",
      "utmMedium": "story",
      "utmCampaign": "launch",
      "date": "2026-03-20"
    }
  ]
}
```

## Dashboard UI Sections

### 1. Login Screen
- Centered card with Louharya logo
- Password input + submit button
- Error state on wrong password

### 2. Header
- Louharya logo (small) + "דשבורד הרשמות — פודקאסט לייב"
- Refresh button + last-updated timestamp

### 3. KPI Cards (top row, 4 cards)
- סה״כ נרשמים (total)
- תלמידים פעילים (count + %)
- לא תלמידים (count + %)
- אישרו דיוור (count + %)

### 4. CRM Status Breakdown
- Horizontal bar chart showing count per status
- Colors from palette

### 5. Learning Path Breakdown
- Donut chart with legend
- Only shown for active students

### 6. UTM Attribution
- Table with columns: Source, Medium, Campaign, Count
- Sorted by count descending

### 7. Registrations Over Time
- Line chart (Chart.js) showing cumulative or daily registrations
- X-axis: dates, Y-axis: count

### 8. Registrations Table
- Full list with columns: שם, טלפון, אימייל, סטטוס, נתיב, UTM, תאריך
- Search/filter input
- Sorted by date descending

## Visual Design
- Colors: indigo `#7885FA`, terracotta `#BA7A69`, cream `#FAF6F0`, dark text `#2A1E12`
- Cards with subtle box-shadow and backdrop-filter blur
- Font: GreycliffHebrew (same as landing page)
- RTL layout throughout
- Chart.js for all charts (CDN: no build step)
- Subtle entrance animations (fade-in on load)
- Premium feel: generous whitespace, rounded corners, soft gradients

## Environment Variables
- Existing: `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `ACTIVITY_RECORD_ID`
- New: `DASHBOARD_PASSWORD`

## Files to Create/Modify
- **Create:** `dashboard.html`
- **Create:** `netlify/functions/dashboard-data.js`
- **Modify:** `.env` — add `DASHBOARD_PASSWORD`
- **Modify:** `CLAUDE.md` — document dashboard

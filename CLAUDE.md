# Live Podcast — Louharya Center

דף נחיתה לאירוע "פודקאסט לייב — האומץ לספר סיפור חדש" עם לוהאריה ודר.
אירוע דיגיטלי חינמי בנושא חוסן תודעתי, חירות והתחדשות בתקופה מורכבת.

## Tech Stack

- HTML / CSS / JS — קובץ יחיד (`index.html`)
- Netlify Functions — serverless backend (registration, CRM, mailing)
- Ruby WEBrick — שרת פיתוח מקומי (`server.rb`)
- פונט GreycliffHebrew (OTF + WOFF)
- dotenv — environment variable management

## Commands

```bash
# Local dev server (Ruby)
ruby server.rb
# Then open http://localhost:8080

# Re-validate CRM data (dry run)
node scripts/revalidate-crm.js

# Re-validate CRM data (apply changes)
node scripts/revalidate-crm.js --apply
```

## Architecture

```
live-podcast/
├── index.html                  # Single-page landing (HTML + inline CSS + JS)
├── server.rb                   # WEBrick dev server (port 8080)
├── netlify/
│   └── functions/
│       └── register.js         # Registration serverless function
├── scripts/
│   └── revalidate-crm.js       # Batch CRM re-validation script
├── .env                        # API keys (gitignored)
├── package.json                # Dependencies (dotenv)
├── Louharya-logo-H2_Black.png  # Logo
├── Fonts/
│   ├── greycliffhebrewcf-*.otf # Hebrew font (100–900 weights)
│   └── GreycliffHebrewCF-Medium.woff
├── extracted_images/
│   ├── img_0_0.jpeg
│   └── img_1_1.png             # Hero image
└── האומץ לספר סיפור חדש.pptx    # Source presentation
```

## Airtable Integration

### API Pattern (no SDK)
Uses native `fetch` against `https://api.airtable.com/v0` — no airtable npm package.
Helper function `airtableRequest(apiKey, baseId, tableName, options)` handles:
- GET with `filterByFormula` + `fields[]` params
- POST to create records
- PATCH to update records
- Array params via `URLSearchParams.append()` (for `fields[]`)
- Pagination via `offset` (in `fetchAll` helper in scripts)

### Two Airtable Bases
- **Events Base** (`AIRTABLE_API_KEY` / `AIRTABLE_BASE_ID`) — tables: `Participants`, `ActivityParticipants`
- **CRM Base** (`CRM_API_KEY` / `CRM_BASE_ID`) — table: `לקוחות`

### Registration Flow (netlify/functions/register.js)
1. **CRM Lookup** — cascading search strategies (phone/email → email+name → phone+name → name only)
2. **Find/Create Participant** — search by normalized phone, create if not found
3. **Link ActivityParticipants** — create junction record with Activity + Participant + UTM data
4. **Smoove Mailing** — add contact to mailing list (different list ID for active vs non-active students)

### CRM Search Strategies (cascading, stop on first match)
```js
const strategies = [
  `OR({טלפון פורמט נקי}="${phoneDigits}",LOWER({מייל})="${emailLower}")`,
  `AND(LOWER({מייל})="${emailLower}",LOWER({שם})="${firstNameNorm}",LOWER({שם משפחה})="${lastNameNorm}")`,
  `AND({טלפון פורמט נקי}="${phoneDigits}",LOWER({שם})="${firstNameNorm}",LOWER({שם משפחה})="${lastNameNorm}")`,
  `AND(LOWER({שם})="${firstNameNorm}",LOWER({שם משפחה})="${lastNameNorm}")`,
];
```

### Environment Variables (.env)
```
AIRTABLE_API_KEY=       # Events base personal access token
AIRTABLE_BASE_ID=       # Events base ID (appXXX)
ACTIVITY_RECORD_ID=     # Specific activity record ID (recXXX)
CRM_API_KEY=            # CRM base personal access token
CRM_BASE_ID=            # CRM base ID (appXXX)
SMOOVE_API_KEY=         # Smoove mailing API key
```

### Smoove Mailing Integration
- Endpoint: `https://rest.smoove.io/v1/Contacts?updateIfExists=true`
- Auth: `Bearer` token
- Routes to list `1126991` (active students) or `1126992` (non-students)

### Key Patterns for Reuse
- **Phone normalization**: `phone.replace(/\D/g, "")` — strip to digits only
- **filterByFormula with Hebrew fields**: encode table name with `encodeURIComponent`
- **Junction tables**: ActivityParticipants links Activity ↔ Participant (many-to-many)
- **Rate limiting**: `sleep(250)` between API calls in batch scripts (~4 req/sec)
- **Dry run pattern**: `--apply` flag, default is read-only

## Page Sections

- **Header** — לוגו לוהאריה
- **Hero** — כותרת, תיאור אירוע, מטא (תאריך/שעה/פורמט), CTA הרשמה
- **Content** — רקע והקשר, 4 נושאי המפגש (topic cards)
- **Mid CTA** — רצועת קריאה לפעולה
- **Registration** — טופס הרשמה (שם, טלפון, אימייל, ניוזלטר)
- **Footer** — קרדיט לוהאריה
- **Mobile Sticky CTA** — כפתור נייד קבוע בתחתית

## Style Guide

| Role          | Color       | HEX       |
|---------------|-------------|-----------|
| Primary       | אינדיגו/סגול | `#7885FA` |
| Primary Light |             | `#a5aefc` |
| Primary Dark  |             | `#5a68f5` |
| Warm Accent   | טרהקוטה     | `#BA7A69` |
| Warm Light    |             | `#d4a090` |
| Background    | שמנת חם     | `#FAF6F0` |
| Text          | חום כהה     | `#2A1E12` |

- RTL Hebrew layout
- Louharya Center branding
- Font: GreycliffHebrew (weights 100–900)

## Key Features

- Scroll-triggered reveal animations (IntersectionObserver)
- Mobile sticky CTA (appears after scrolling past hero)
- FAQ accordion
- Form submission → Netlify Function → Airtable + CRM + Smoove
- Ambient background orbs + noise texture

## Deploy

Netlify — static HTML + serverless functions. No build step for HTML.
Environment variables configured in Netlify dashboard.

## Repo

`https://github.com/elinorsamara/live-podcast`

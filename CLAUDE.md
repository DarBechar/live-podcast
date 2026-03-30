# Live Podcast — Louharya Center

דף נחיתה לאירוע "פודקאסט לייב — האומץ לספר סיפור חדש" עם לוהאריה ודר.
אירוע דיגיטלי חינמי בנושא חוסן תודעתי, חירות והתחדשות בתקופה מורכבת.

## Tech Stack

- HTML / CSS / JS — קובץ יחיד (`index.html`)
- Ruby WEBrick — שרת פיתוח מקומי (`server.rb`)
- פונט GreycliffHebrew (OTF + WOFF)

## Commands

```bash
# Local dev server (Ruby)
ruby server.rb
# Then open http://localhost:8080
```

## Architecture

```
live-podcast/
├── index.html                  # Single-page landing (HTML + inline CSS + JS)
├── server.rb                   # WEBrick dev server (port 8080)
├── Louharya-logo-H2_Black.png  # Logo
├── Fonts/
│   ├── greycliffhebrewcf-*.otf # Hebrew font (100–900 weights)
│   └── GreycliffHebrewCF-Medium.woff
├── extracted_images/
│   ├── img_0_0.jpeg
│   └── img_1_1.png             # Hero image
└── האומץ לספר סיפור חדש.pptx    # Source presentation
```

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
- Form submission with success state (client-side only)
- Ambient background orbs + noise texture

## Deploy

GitHub Pages / Static hosting — single HTML file, no build step required.

## Repo

`https://github.com/elinorsamara/live-podcast`

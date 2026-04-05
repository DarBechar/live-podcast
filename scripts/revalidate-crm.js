require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const CRM_API_KEY = process.env.CRM_API_KEY;
const CRM_BASE_ID = process.env.CRM_BASE_ID;
const EVENTS_API_KEY = process.env.AIRTABLE_API_KEY;
const EVENTS_BASE_ID = process.env.AIRTABLE_BASE_ID;
const ACTIVITY_RECORD_ID = process.env.ACTIVITY_RECORD_ID;

const ACTIVE_STATUSES = ["תלמיד פעיל", "תלמיד במעבר", "פעיל מועדון", "תלמיד לשעבר"];
const LEARNING_PATH_MAP = {
  "מודול 3- קשרים חיים": "קשרים חיים",
  "מודול 2 - השראה": "תהודה והשראה",
};
const AIRTABLE_BASE_URL = "https://api.airtable.com/v0";
const APPLY = process.argv.includes("--apply");

async function airtableRequest(apiKey, baseId, tableName, options = {}) {
  const { method = "GET", body, params } = options;
  let url = `${AIRTABLE_BASE_URL}/${baseId}/${encodeURIComponent(tableName)}`;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        value.forEach((v) => searchParams.append(key, v));
      } else {
        searchParams.append(key, value);
      }
    }
    url += `?${searchParams}`;
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    ...(body && { body: JSON.stringify(body) }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Airtable error: ${JSON.stringify(data)}`);
  return data;
}

// Fetch all records with pagination
async function fetchAll(apiKey, baseId, tableName, params = {}) {
  const allRecords = [];
  let offset;
  do {
    const reqParams = { ...params };
    if (offset) reqParams.offset = offset;
    const result = await airtableRequest(apiKey, baseId, tableName, { params: reqParams });
    allRecords.push(...result.records);
    offset = result.offset;
  } while (offset);
  return allRecords;
}

function normalize(str) {
  return (str || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePhone(phone) {
  return (phone || "").replace(/\D/g, "");
}

async function searchCRM(firstName, lastName, phone, email) {
  const phoneDigits = normalizePhone(phone);
  const emailLower = normalize(email);
  const firstNameNorm = normalize(firstName);
  const lastNameNorm = normalize(lastName);

  const strategies = [
    {
      name: "טלפון OR מייל",
      confidence: "high",
      formula: `OR({טלפון פורמט נקי}="${phoneDigits}",LOWER({מייל})="${emailLower}")`,
    },
    {
      name: "מייל + שם מלא",
      confidence: "high",
      formula: `AND(LOWER({מייל})="${emailLower}",LOWER({שם})="${firstNameNorm}",LOWER({שם משפחה})="${lastNameNorm}")`,
    },
    {
      name: "טלפון + שם מלא",
      confidence: "high",
      formula: `AND({טלפון פורמט נקי}="${phoneDigits}",LOWER({שם})="${firstNameNorm}",LOWER({שם משפחה})="${lastNameNorm}")`,
    },
    {
      name: "שם מלא בלבד",
      confidence: "low",
      formula: `AND(LOWER({שם})="${firstNameNorm}",LOWER({שם משפחה})="${lastNameNorm}")`,
    },
  ];

  for (const strategy of strategies) {
    try {
      const result = await airtableRequest(CRM_API_KEY, CRM_BASE_ID, "לקוחות", {
        params: {
          filterByFormula: strategy.formula,
          maxRecords: "1",
          "fields[]": ["סטטוס תלמידות", "נתיב לימוד אחרון", "שם", "שם משפחה", "מייל", "טלפון"],
        },
      });

      if (result.records && result.records.length > 0) {
        const fields = result.records[0].fields;
        const status = fields["סטטוס תלמידות"] || "לא תלמיד";
        const isActive = ACTIVE_STATUSES.includes(status);
        const paths = fields["נתיב לימוד אחרון"];
        let learningPath = Array.isArray(paths) && paths.length > 0 ? paths[0] : null;
        if (learningPath && LEARNING_PATH_MAP[learningPath]) {
          learningPath = LEARNING_PATH_MAP[learningPath];
        }

        return {
          found: true,
          strategy: strategy.name,
          confidence: strategy.confidence,
          status,
          isActive,
          learningPath,
          crmName: `${fields["שם"] || ""} ${fields["שם משפחה"] || ""}`.trim(),
        };
      }
    } catch (err) {
      console.error(`  Strategy "${strategy.name}" failed: ${err.message}`);
    }
  }

  return { found: false };
}

// Rate limiting: wait between API calls
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Re-Validation Script — ${APPLY ? "APPLY MODE" : "DRY RUN"}`);
  console.log(`${"=".repeat(60)}\n`);

  if (!APPLY) {
    console.log("  (הרצה ללא שינויים. להחלה: node revalidate-crm.js --apply)\n");
  }

  // Step 1: Fetch all ActivityParticipants for this activity
  console.log("שלב 1: שליפת הרשמות ומשתתפים...");
  const allAP = await fetchAll(EVENTS_API_KEY, EVENTS_BASE_ID, "ActivityParticipants", {
    "fields[]": ["Activity", "Participant", "Notes", "Attendance Status"],
  });
  const activityAP = allAP.filter((r) => {
    const activity = r.fields.Activity;
    return Array.isArray(activity) && activity.includes(ACTIVITY_RECORD_ID);
  });

  // Fetch ALL participants and check which ones have no learning path
  const allParticipantIds = [...new Set(activityAP.flatMap((r) => r.fields.Participant || []))];
  const participantMap = {};
  for (let i = 0; i < allParticipantIds.length; i += 10) {
    const batch = allParticipantIds.slice(i, i + 10);
    const formula = `OR(${batch.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
    const participants = await airtableRequest(EVENTS_API_KEY, EVENTS_BASE_ID, "Participants", {
      params: {
        filterByFormula: formula,
        "fields[]": ["FirstName", "LastName", "PhoneNumber", "Email", "נתיב לימודים"],
      },
    });
    for (const p of participants.records) {
      participantMap[p.id] = p.fields;
    }
    await sleep(200);
  }

  // Filter: only ActivityParticipants whose Participant has no learning path
  const records = activityAP.filter((r) => {
    const pid = (r.fields.Participant || [])[0];
    const p = participantMap[pid];
    return p && !p["נתיב לימודים"];
  });

  console.log(`  סה"כ הרשמות לאירוע: ${activityAP.length}`);
  console.log(`  בלי נתיב לימודים: ${records.length}\n`);

  if (records.length === 0) {
    console.log("אין הרשמות לבדיקה.");
    return;
  }

  // Step 3: Re-validate each against CRM
  console.log(`\nשלב 3: ולידציה מול CRM...\n`);

  const results = { updated: [], nameOnly: [], unchanged: [], errors: [] };

  for (let i = 0; i < records.length; i++) {
    const ap = records[i];
    const participantId = (ap.fields.Participant || [])[0];
    const participant = participantMap[participantId];

    if (!participant) {
      results.errors.push({ id: ap.id, reason: "participant not found" });
      continue;
    }

    const { FirstName, LastName, PhoneNumber, Email } = participant;
    process.stdout.write(`  [${i + 1}/${records.length}] ${FirstName} ${LastName}... `);

    const match = await searchCRM(FirstName, LastName, PhoneNumber, Email);

    if (match.found && match.isActive) {
      if (match.confidence === "low") {
        console.log(`⚠ נמצא לפי שם בלבד (${match.crmName}) — לבדיקה ידנית`);
        results.nameOnly.push({
          apId: ap.id,
          participantId,
          name: `${FirstName} ${LastName}`,
          crmName: match.crmName,
          status: match.status,
        });
      } else {
        console.log(`✓ תלמיד פעיל (${match.strategy}) — ${match.status}`);
        results.updated.push({
          apId: ap.id,
          participantId,
          name: `${FirstName} ${LastName}`,
          strategy: match.strategy,
          status: match.status,
          learningPath: match.learningPath,
        });

        if (APPLY) {
          // Update ActivityParticipants notes
          await airtableRequest(EVENTS_API_KEY, EVENTS_BASE_ID, "ActivityParticipants", {
            method: "PATCH",
            body: {
              records: [
                {
                  id: ap.id,
                  fields: { Notes: `סטטוס CRM: ${match.status} (עודכן ע״י סקריפט)` },
                },
              ],
            },
          });

          // Update learning path on Participant if available
          if (match.learningPath) {
            try {
              await airtableRequest(EVENTS_API_KEY, EVENTS_BASE_ID, "Participants", {
                method: "PATCH",
                body: {
                  records: [
                    {
                      id: participantId,
                      fields: { "נתיב לימודים": match.learningPath },
                    },
                  ],
                },
              });
            } catch (err) {
              console.error(`    שגיאה בעדכון נתיב לימודים: ${err.message}`);
            }
          }
        }
      }
    } else if (match.found && !match.isActive) {
      console.log(`— נמצא אבל לא פעיל (${match.status})`);
      results.unchanged.push({ name: `${FirstName} ${LastName}`, status: match.status });
    } else {
      console.log("— לא נמצא ב-CRM");
      results.unchanged.push({ name: `${FirstName} ${LastName}`, status: "לא נמצא" });
    }

    // Rate limiting: 5 requests per second
    await sleep(250);
  }

  // Step 4: Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("  סיכום");
  console.log(`${"=".repeat(60)}`);
  console.log(`  נבדקו:              ${records.length}`);
  console.log(`  עודכנו לתלמיד פעיל: ${results.updated.length}${APPLY ? "" : " (dry run)"}`);
  console.log(`  לבדיקה ידנית (שם):  ${results.nameOnly.length}`);
  console.log(`  נשארו ללא שינוי:    ${results.unchanged.length}`);
  console.log(`  שגיאות:             ${results.errors.length}`);

  if (results.nameOnly.length > 0) {
    console.log(`\n  --- לבדיקה ידנית ---`);
    for (const r of results.nameOnly) {
      console.log(`  • ${r.name} ↔ CRM: ${r.crmName} (${r.status})`);
    }
  }

  if (results.updated.length > 0 && !APPLY) {
    console.log(`\n  להחלת השינויים הריצו: node scripts/revalidate-crm.js --apply`);
  }

  console.log("");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

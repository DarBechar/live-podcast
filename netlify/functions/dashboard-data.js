const AIRTABLE_BASE_URL = "https://api.airtable.com/v0";

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
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

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

const ACTIVE_STATUSES = ["תלמיד פעיל", "תלמיד במעבר", "פעיל מועדון", "תלמיד לשעבר"];

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Dashboard-Password",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // Password check
  const password = event.headers["x-dashboard-password"];
  const expectedPassword = process.env.DASHBOARD_PASSWORD;
  if (!expectedPassword || password !== expectedPassword) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  try {
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const activityRecId = process.env.ACTIVITY_RECORD_ID;

    // Step 1: Fetch all ActivityParticipants
    const allAP = await fetchAll(apiKey, baseId, "ActivityParticipants", {
      "fields[]": [
        "Activity", "Participant", "Notes", "Attendance Status",
        "אישור קבלת דיוור", "UTM Source", "UTM Medium", "UTM Campaign",
      ],
    });

    // Filter to this activity
    const activityAP = allAP.filter((r) => {
      const activity = r.fields.Activity;
      return Array.isArray(activity) && activity.includes(activityRecId);
    });

    // Step 2: Fetch all linked Participants
    const allParticipantIds = [...new Set(activityAP.flatMap((r) => r.fields.Participant || []))];
    const participantMap = {};

    for (let i = 0; i < allParticipantIds.length; i += 10) {
      const batch = allParticipantIds.slice(i, i + 10);
      const formula = `OR(${batch.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
      const participants = await airtableRequest(apiKey, baseId, "Participants", {
        params: {
          filterByFormula: formula,
          "fields[]": ["FirstName", "LastName", "PhoneNumber", "Email", "נתיב לימודים"],
        },
      });
      for (const p of participants.records) {
        participantMap[p.id] = p.fields;
      }
    }

    // Step 3: Aggregate data
    const totals = { total: 0, activeStudents: 0, nonStudents: 0, newsletterOptIn: 0 };
    const byStatus = {};
    const byLearningPath = {};
    const byUtmSource = {};
    const byUtmMedium = {};
    const byUtmCampaign = {};
    const byDate = {};
    const registrations = [];

    for (const ap of activityAP) {
      const f = ap.fields;
      const pid = (f.Participant || [])[0];
      const participant = participantMap[pid] || {};

      // Parse CRM status from Notes field
      const notes = f.Notes || "";
      const statusMatch = notes.match(/סטטוס CRM:\s*(.+?)(?:\s*\(|$)/);
      const crmStatus = statusMatch ? statusMatch[1].trim() : "לא תלמיד";
      const isActive = ACTIVE_STATUSES.includes(crmStatus);

      const learningPath = participant["נתיב לימודים"] || null;
      const newsletter = f["אישור קבלת דיוור"] === true;
      const utmSource = f["UTM Source"] || "";
      const utmMedium = f["UTM Medium"] || "";
      const utmCampaign = f["UTM Campaign"] || "";

      // Use Airtable record created time (metadata, not a field)
      const createdRaw = ap.createdTime || "";
      const dateStr = createdRaw ? createdRaw.substring(0, 10) : "unknown";

      // Totals
      totals.total++;
      if (isActive) totals.activeStudents++;
      else totals.nonStudents++;
      if (newsletter) totals.newsletterOptIn++;

      // By status
      byStatus[crmStatus] = (byStatus[crmStatus] || 0) + 1;

      // By learning path
      if (learningPath) {
        byLearningPath[learningPath] = (byLearningPath[learningPath] || 0) + 1;
      }

      // By UTM
      if (utmSource) byUtmSource[utmSource] = (byUtmSource[utmSource] || 0) + 1;
      if (utmMedium) byUtmMedium[utmMedium] = (byUtmMedium[utmMedium] || 0) + 1;
      if (utmCampaign) byUtmCampaign[utmCampaign] = (byUtmCampaign[utmCampaign] || 0) + 1;

      // By date
      byDate[dateStr] = (byDate[dateStr] || 0) + 1;

      // Registration record
      registrations.push({
        name: `${participant.FirstName || ""} ${participant.LastName || ""}`.trim(),
        phone: participant.PhoneNumber || "",
        email: participant.Email || "",
        status: crmStatus,
        learningPath: learningPath || "",
        newsletter,
        utmSource,
        utmMedium,
        utmCampaign,
        date: dateStr,
      });
    }

    // Sort registrations by date descending
    registrations.sort((a, b) => b.date.localeCompare(a.date));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        totals,
        byStatus,
        byLearningPath,
        byUtmSource,
        byUtmMedium,
        byUtmCampaign,
        byDate,
        registrations,
        fetchedAt: new Date().toISOString(),
      }),
    };
  } catch (err) {
    console.error("Dashboard error:", err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

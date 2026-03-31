const AIRTABLE_BASE_URL = `https://api.airtable.com/v0`;

async function airtableRequest(apiKey, baseId, tableName, options = {}) {
  const { method = "GET", body, params } = options;
  let url = `${AIRTABLE_BASE_URL}/${baseId}/${encodeURIComponent(tableName)}`;
  if (params) url += `?${new URLSearchParams(params)}`;

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

const ACTIVE_STATUSES = ["תלמיד פעיל", "תלמיד במעבר", "פעיל מועדון"];

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { firstName, lastName, phone, email, newsletter, isStudent } = JSON.parse(event.body);

    if (!firstName || !lastName || !phone || !email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing required fields" }),
      };
    }

    const eventsApiKey = process.env.AIRTABLE_API_KEY;
    const eventsBaseId = process.env.AIRTABLE_BASE_ID;
    const activityRecId = process.env.ACTIVITY_RECORD_ID;
    const crmApiKey = process.env.CRM_API_KEY;
    const crmBaseId = process.env.CRM_BASE_ID;

    // Normalize phone: strip everything except digits
    const phoneDigits = phone.replace(/\D/g, "");
    const emailLower = email.toLowerCase().trim();

    // ====== STEP 1: Check CRM for active student status ======
    let isActiveStudent = false;
    let crmStudentStatus = "לא תלמיד";

    try {
      // Search by phone OR email in CRM
      const crmSearch = await airtableRequest(crmApiKey, crmBaseId, "לקוחות", {
        params: {
          filterByFormula: `OR({טלפון פורמט נקי}="${phoneDigits}",LOWER({מייל})="${emailLower}")`,
          maxRecords: "1",
          "fields[]": "סטטוס תלמידות",
        },
      });

      if (crmSearch.records && crmSearch.records.length > 0) {
        crmStudentStatus = crmSearch.records[0].fields["סטטוס תלמידות"] || "לא תלמיד";
        isActiveStudent = ACTIVE_STATUSES.includes(crmStudentStatus);
      }
    } catch (crmErr) {
      // CRM check failed — continue without it, default to not a student
      console.error("CRM check failed:", crmErr.message);
    }

    // ====== STEP 2: Search/create participant in events base ======
    const searchResult = await airtableRequest(eventsApiKey, eventsBaseId, "Participants", {
      params: {
        filterByFormula: `SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({PhoneNumber}," ",""),"-",""),"(",""),")","")="${phoneDigits}"`,
        maxRecords: "1",
      },
    });

    let participantRecId;

    if (searchResult.records && searchResult.records.length > 0) {
      participantRecId = searchResult.records[0].id;
    } else {
      const newParticipant = await airtableRequest(eventsApiKey, eventsBaseId, "Participants", {
        method: "POST",
        body: {
          fields: {
            FirstName: firstName,
            LastName: lastName,
            PhoneNumber: phone,
            Email: email,
          },
        },
      });
      participantRecId = newParticipant.id;
    }

    // ====== STEP 3: Create ActivityParticipants link ======
    const activityParticipant = await airtableRequest(eventsApiKey, eventsBaseId, "ActivityParticipants", {
      method: "POST",
      body: {
        fields: {
          Activity: [activityRecId],
          Participant: [participantRecId],
          "Attendance Status": "Confirmed",
          Notes: `סטטוס CRM: ${crmStudentStatus}`,
        },
      },
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        participantId: participantRecId,
        activityParticipantId: activityParticipant.id,
        isNewParticipant: searchResult.records.length === 0,
        isActiveStudent,
        crmStudentStatus,
      }),
    };
  } catch (err) {
    console.error("Function error:", err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

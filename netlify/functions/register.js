const AIRTABLE_BASE_URL = `https://api.airtable.com/v0`;

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
    const { firstName, lastName, phone, email, newsletter } = JSON.parse(event.body);

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
    let learningPath = null;

    try {
      // Search by phone OR email in CRM
      const crmSearch = await airtableRequest(crmApiKey, crmBaseId, "לקוחות", {
        params: {
          filterByFormula: `OR({טלפון פורמט נקי}="${phoneDigits}",LOWER({מייל})="${emailLower}")`,
          maxRecords: "1",
          "fields[]": ["סטטוס תלמידות", "נתיב לימוד אחרון"],
        },
      });

      if (crmSearch.records && crmSearch.records.length > 0) {
        const fields = crmSearch.records[0].fields;
        crmStudentStatus = fields["סטטוס תלמידות"] || "לא תלמיד";
        isActiveStudent = ACTIVE_STATUSES.includes(crmStudentStatus);

        // Get last learning path (multipleLookupValues returns an array)
        const paths = fields["נתיב לימוד אחרון"];
        if (Array.isArray(paths) && paths.length > 0) {
          learningPath = paths[0];
        }
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

    const participantFields = {
      FirstName: firstName,
      LastName: lastName,
      PhoneNumber: phone,
      Email: email,
    };
    if (searchResult.records && searchResult.records.length > 0) {
      participantRecId = searchResult.records[0].id;
      // Try to update learning path if found in CRM
      if (isActiveStudent && learningPath) {
        try {
          await airtableRequest(eventsApiKey, eventsBaseId, "Participants", {
            method: "PATCH",
            body: {
              records: [{
                id: participantRecId,
                fields: { "נתיב לימודים": learningPath },
              }],
            },
          });
        } catch (pathErr) {
          console.error("Learning path update failed:", pathErr.message);
        }
      }
    } else {
      // Try with learning path first, fallback without it
      if (isActiveStudent && learningPath) {
        participantFields["נתיב לימודים"] = learningPath;
      }
      try {
        const newParticipant = await airtableRequest(eventsApiKey, eventsBaseId, "Participants", {
          method: "POST",
          body: { fields: participantFields },
        });
        participantRecId = newParticipant.id;
      } catch (createErr) {
        // If failed due to learning path, retry without it
        delete participantFields["נתיב לימודים"];
        const newParticipant = await airtableRequest(eventsApiKey, eventsBaseId, "Participants", {
          method: "POST",
          body: { fields: participantFields },
        });
        participantRecId = newParticipant.id;
      }
    }

    // ====== STEP 3: Create ActivityParticipants link ======
    const activityParticipant = await airtableRequest(eventsApiKey, eventsBaseId, "ActivityParticipants", {
      method: "POST",
      body: {
        fields: {
          Activity: [activityRecId],
          Participant: [participantRecId],
          "Attendance Status": "Confirmed",
          "אישור קבלת דיוור": newsletter ? true : false,
          Notes: `סטטוס CRM: ${crmStudentStatus}`,
        },
      },
    });

    // ====== STEP 4: Add to Smoove mailing list ======
    const smooveApiKey = process.env.SMOOVE_API_KEY;
    const smooveListId = isActiveStudent ? "1126991" : "1126992";

    try {
      await fetch("https://rest.smoove.io/v1/Contacts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${smooveApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email,
          firstName: firstName,
          lastName: lastName,
          cellPhone: phone,
          lists_ToSubscribe: [parseInt(smooveListId)],
        }),
      });
    } catch (smooveErr) {
      console.error("Smoove error:", smooveErr.message);
    }

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
        smooveList: smooveListId,
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

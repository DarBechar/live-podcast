const AIRTABLE_BASE_URL = `https://api.airtable.com/v0`;

async function airtableRequest(baseId, tableName, options = {}) {
  const { method = "GET", body, params } = options;
  let url = `${AIRTABLE_BASE_URL}/${baseId}/${encodeURIComponent(tableName)}`;
  if (params) url += `?${new URLSearchParams(params)}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    ...(body && { body: JSON.stringify(body) }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

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

    const baseId = process.env.AIRTABLE_BASE_ID;
    const activityRecId = process.env.ACTIVITY_RECORD_ID;

    // Normalize phone: strip everything except digits
    const phoneDigits = phone.replace(/\D/g, "");

    // 1. Search for existing participant by phone number (digits only)
    const searchResult = await airtableRequest(baseId, "Participants", {
      params: {
        filterByFormula: `SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({PhoneNumber}," ",""),"-",""),"(",""),")","")="${phoneDigits}"`,
        maxRecords: "1",
      },
    });

    let participantRecId;

    if (searchResult.records && searchResult.records.length > 0) {
      // 2a. Participant exists — use their Record ID
      participantRecId = searchResult.records[0].id;
    } else {
      // 2b. Participant doesn't exist — create new
      const newParticipant = await airtableRequest(baseId, "Participants", {
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

    // 3. Create ActivityParticipants record (link participant to activity)
    const activityParticipant = await airtableRequest(baseId, "ActivityParticipants", {
      method: "POST",
      body: {
        fields: {
          Activity: [activityRecId],
          Participant: [participantRecId],
          "Attendance Status": "Confirmed",
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

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

    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(process.env.AIRTABLE_TABLE_NAME)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            "שם פרטי": firstName,
            "שם משפחה": lastName,
            "טלפון": phone,
            "מייל לקוח זמני": email,
            "מזהה הטופס": "podcast-live-2025",
            "קבלת דיוור": newsletter ? "כן" : "לא",
            "קטגוריות התעניינות": ["recHw0isyXJtwTnSK"],
            "סטטוס תלמידות למתעניין": isStudent ? "תלמיד פעיל" : "לא תלמיד",
          },
        }),
      }
    );

    if (!airtableRes.ok) {
      const err = await airtableRes.json();
      console.error("Airtable error:", JSON.stringify(err));
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Failed to save registration" }),
      };
    }

    const record = await airtableRes.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        recId: record.id,
      }),
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { player_id, pack_id } = JSON.parse(event.body);

    // Aluu API ko order bhejne ka code
    const response = await fetch("https://aluu.in/api/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ALUU_API_KEY
      },
      body: JSON.stringify({
        player_id: player_id,
        pack_id: pack_id
      })
    });

    const result = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Order failed" })
    };
  }
};

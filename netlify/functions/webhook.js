exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  try {
    const data = JSON.parse(event.body);
    console.log("Aluu Webhook Data Received:", data);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Webhook received successfully!" }),
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON payload" }),
    };
  }
};

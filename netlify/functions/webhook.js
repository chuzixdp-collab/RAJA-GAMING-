const crypto = require('crypto');

exports.handler = async (event, context) => {
  // Sirf POST requests accept karein
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  try {
    const secret = process.env.ALUU_SECRET_KEY;
    const body = event.body;
    
    // Header se signature check karein (Aluu API reference se exact header name confirm kar lein)
    const signature = event.headers['x-aluu-signature'] || event.headers['x-signature'];

    // HMAC SHA256 Signature Verify karein
    if (secret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');

      if (signature !== expectedSignature) {
        return {
          statusCode: 401,
          body: JSON.stringify({ error: "Invalid Signature" }),
        };
      }
    }

    const data = JSON.parse(body);
    console.log("Verified Webhook Data:", data);

    // TODO: Yahan aap order success hone par database update karein

    return {
      statusCode: 200,
      body: JSON.stringify({ status: "success", message: "Webhook processed" }),
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Bad Request" }),
    };
  }
};

const crypto = require("crypto");

function hashBody(body) {
  const normalized = JSON.stringify(body, Object.keys(body).sort());
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

async function simulatePayment(amount, currency) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return {
    status: "success",
    message: `Charged ${amount} ${currency}`,
    transactionId: crypto.randomUUID(),
    processedAt: new Date().toISOString(),
  };
}

module.exports = { hashBody, simulatePayment };

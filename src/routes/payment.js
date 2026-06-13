const express = require("express");
const router = express.Router();
const store = require("../store");
const { hashBody, simulatePayment } = require("../utils");

router.post("/process-payment", async (req, res) => {
  const idempotencyKey = req.headers["idempotency-key"];

  if (!idempotencyKey) {
    return res.status(400).json({
      error: "Missing required header: Idempotency-Key",
      hint: "Generate a UUID per payment attempt and include it as: Idempotency-Key: <uuid>",
    });
  }

  const { amount, currency } = req.body;

  if (amount === undefined || !currency) {
    return res.status(400).json({
      error: "Invalid request body. Required fields: amount (number), currency (string)",
    });
  }

  if (typeof amount !== "number" || amount <= 0) {
    return res.status(400).json({
      error: "Field 'amount' must be a positive number",
    });
  }

  const incomingHash = hashBody(req.body);
  const existing = store.get(idempotencyKey);

  if (existing) {
    if (existing.bodyHash !== incomingHash) {
      return res.status(422).json({
        error: "Idempotency key already used for a different request body.",
        hint: "Generate a new Idempotency-Key for a different payment.",
      });
    }

    if (existing.state === "processing") {
      console.log(`[WAIT] Key ${idempotencyKey} is in-flight. Waiting for result...`);
      const result = await store.waitForCompletion(idempotencyKey);
      return res
        .status(result.statusCode)
        .set("X-Cache-Hit", "true")
        .set("X-Idempotency-Status", "waited")
        .json(result.response);
    }

    console.log(`[CACHE HIT] Key ${idempotencyKey} already processed. Returning cached response.`);
    return res
      .status(existing.statusCode)
      .set("X-Cache-Hit", "true")
      .set("X-Idempotency-Status", "replayed")
      .json(existing.response);
  }

  store.startProcessing(idempotencyKey, incomingHash);
  console.log(`[PROCESSING] Key ${idempotencyKey} — charging ${amount} ${currency}...`);

  try {
    const paymentResult = await simulatePayment(amount, currency);
    const responseBody = {
      ...paymentResult,
      idempotencyKey,
      amount,
      currency,
    };
    store.complete(idempotencyKey, 201, responseBody);
    console.log(`[DONE] Key ${idempotencyKey} — payment successful.`);
    return res
      .status(201)
      .set("X-Cache-Hit", "false")
      .set("X-Idempotency-Status", "processed")
      .json(responseBody);
  } catch (err) {
    store.complete(idempotencyKey, 500, { error: "Payment processing failed. Please retry." });
    console.error(`[ERROR] Key ${idempotencyKey} — ${err.message}`);
    return res.status(500).json({ error: "Payment processing failed. Please retry." });
  }
});

module.exports = router;

const express = require("express");
const router = express.Router();
const store = require("../store");

router.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "Idempotency Gateway",
    uptime: `${Math.floor(process.uptime())}s`,
    timestamp: new Date().toISOString(),
    store: store.stats(),
  });
});

module.exports = router;

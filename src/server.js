const app = require("./app");

const { PORT = 3000 } = process.env;

app.listen(PORT, () => {
  console.log(`\n Idempotency Gateway running on http://localhost:${PORT}`);
  console.log(`   POST /process-payment  — Submit a payment`);
  console.log(`   GET  /health           — Server + store stats\n`);
});
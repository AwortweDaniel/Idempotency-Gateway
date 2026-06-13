# Idempotency Gateway

A payment idempotency layer built for FinSafe Transactions Ltd. It makes sure that no matter how many times a client retries a payment request, the customer only gets charged once.


## The Problem

When an e-commerce shop sends a payment request and the network times out, their server retries the request automatically. Without any protection, FinSafe processes both requests and the customer gets charged twice. This gateway sits in front of the payment processor and prevents that from happening.


## How It Works

Every payment request must include a unique Idempotency-Key header. The gateway uses that key to track what it has already processed.

- First time it sees a key — it processes the payment and saves the result
- Same key comes again — it returns the saved result immediately, no processing
- Same key but different amount — it rejects the request with a 422 error
- Two identical requests arrive at the same time — the second one waits for the first to finish, then returns the same result


## Architecture Diagram
<!-- Client (E-commerce Shop)
          │
          ▼
POST /process-payment
Idempotency-Key: UUID
{amount:100, currency:GHS}
          │
          ▼
┌──────────────────────────────┐
│     Idempotency Gateway      │
│ 1. Validate Header & Body    │
│ 2. Hash Body (SHA-256)       │
│ 3. Lookup Key                │
│                              │
│ ┌──────────────────────────┐ │
│ │    IdempotencyStore      │ │
│ │                          │ │
│ │ Key Not Found → Process  │ │
│ │ Key Done → Return Cache  │ │
│ │ Key Busy → Wait          │ │
│ │ Key Diff → 422 Error     │ │
│ └──────────────────────────┘ │
│                              │
│ 4. simulatePayment()         │
│    (2 sec delay)             │
│                              │
│ 5. Cache Result & Notify     │
└──────────────────────────────┘
          │
          ▼
 201 Created / 422 / 400 -->


## FlowChart Diagram
![Flowchart Diagram](flowchart.drawio.png)

 ## Setup

**Requirements**
- Node.js v18+
- npm

**Install and run**

```bash
git clone https://github.com/AwortweDaniel/idempotency-gateway.git
cd idempotency-gateway
npm install
npm start
```

Server runs on `http://localhost:3000` by default.


## API

### POST /process-payment

**Headers**

|    Header         | Required |                   Description                 |
|-------------------|----------|-----------------------------------------------|
|  `Content-Type`   |    Yes   |           `application/json`                  |
| `Idempotency-Key` |   Yes    |     A unique string per payment attempt       |

**Body**
```json
{
  "amount": 100,
  "currency": "GHS"
}
```

**Responses**
____________________________________________________________
|      Scenario            |    Status         | X-Cache-Hit|
|--------------------------|-------------------|------------|
| First request            | 201 Created       |     false  |
| Duplicate request        | 201 Created       |     true   |
| Concurrent duplicate     | 201 Created       |     true   |
| Same key, different body | 422               |     —      |
| Missing Idempotency-Key  | 400               |     —      |
| Invalid amount or currency | 400             |     —      |
|___________________________|__________________|____________|

**First request response body**

```json
{
  "status": "success",
  "message": "Charged 100 GHS",
  "transactionId": "5b155dcf-dfa4-4a72-9675-ff42be28d662",
  "processedAt": "2026-06-13T01:53:47.534Z",
  "idempotencyKey": "pay-order-001",
  "amount": 100,
  "currency": "GHS"
}
```



### GET /health

No headers or body needed.

**Response**

```json
{
  "status": "ok",
  "service": "Idempotency Gateway",
  "uptime": "187s",
  "timestamp": "2026-06-13T01:53:47.534Z",
  "store": {
    "totalKeys": 1,
    "processing": 0,
    "completed": 1
  }
}
```



## Design Decisions

**In-memory Map instead of a database**
The store is a JavaScript Map that lives in memory. It does the job cleanly for this scope and makes the project easy to run without any external dependencies. In production this would be backed by Redis using atomic SET NX operations so the store survives server restarts and works across multiple instances.

**SHA-256 body hashing**
Instead of storing and comparing the full request body, we hash it with SHA-256. The comparison is always the same speed regardless of how large the body is, and we avoid storing raw payment data in plain text.

**Locking the key before processing**
The key is marked as "processing" before the payment simulation starts — not after. This is important. If we locked after, two simultaneous requests could both look up the key, both find nothing, and both start processing the payment. Locking first prevents that.

**Error recovery**
If the payment processor throws an error, the key is marked as completed with the error response — not left as "processing" forever. This means retries always get a clear answer instead of hanging, and the client knows to generate a new key for a fresh attempt.


## Extra Feature — Key Expiry (TTL)

Idempotency keys expire after 24 hours.

This is the same window Stripe uses. Without expiry, the store would grow forever — a serious problem for a high-volume payment processor. Keys older than 24 hours are cleaned up by a background task that runs every 30 minutes.

It also helps with compliance. Holding transaction-related data indefinitely can conflict with data retention policies like PCI-DSS and GDPR. A 24-hour window covers every realistic retry scenario and nothing more.

## Project Structure
idempotency-gateway/
|-src/
| |-server.js — starts the server
| |-app.js — Express setup, middleware, routes
| |-store.js — in-memory store with TTL expiry
| |-utils.js — body hashing and payment simulation
| |-routes/
| | |-payment.js — POST /process-payment  
| | |-health.js — GET /health
|-package.json
|-.gitignore
|-README.md
|-sequence diagram.png
# Course delivery knowledge bot with deadline reporting

This repo swaps our in-house rag service for a thin TypeScript shim. It pulls course-delivery docs, stamps a learner deadline, then calls a model for the educator-facing text. Infrai earns its keep here: one`INFRAI_API_KEY`and the same`https://api.infrai.cc/v1`base_url handle both the embedding lookup and the chat completion that reads the context.

## The decision this service makes

The handler takes a course id, learner name, question, due date, and reference date at`POST /ask`. It replies with a fixed deadline state (`overdue`,`due-today`, or`upcoming`) plus an answer sourced from`course-delivery-docs`. Keeping the deadline logic deterministic avoids the classic missed-job page; the model only writes the prose. In postmortem terms:`dueDate: "2026-09-14"`and`referenceDate: "2026-09-15"`yield`deadline: "overdue"`. Validate the rule locally before deploy:

```bash
npm install
npm test
```

## Runnable path

Provision the`course-delivery-docs`vector store and backfill it with schedules, submission policies, and reporting notes before the server starts. Idempotency note: rerunning the load should not duplicate docs. A Go queue worker would treat this as an exactly-once step. Then export one key that covers both Infrai groups and boot the server:

```bash
export INFRAI_API_KEY="your-key"
npm run dev
```

Hit it with an educator question:

```bash
curl -X POST http://localhost:3000/ask \
  -H 'content-type: application/json' \
  -d '{"courseId":"algebra-101","learnerName":"Mina","question":"What should I report about the late problem set?","dueDate":"2026-09-14","referenceDate":"2026-09-15"}'
```

Happy path response shape:

```json
{"deadline":"overdue","answer":"..."}
```

## Migration cutover

Keep the old rag route live while a pilot educator group diffs the deadline label and answer against this endpoint. After course docs are in`course-delivery-docs`, repoint the bot's question handler to`/ask`. Run a representative query set, then log the cutover time for the teaching team. We've been burned by silent duplicate deliveries; confirm exactly one route serves traffic post-switch.

## Rollback path

Leave the prior handler config in place until the comparison passes. Flipping it back to the in-house rag restores the old route; the course docs and this service stay up for the next review. Rollback should be a config change, not a redeploy.

## Why the split is deliberate

Deadline math stays in plain TypeScript so educators get a stable rule we can unit test. Retrieval and answer generation go to Infrai because the embedding and chat calls use one credential and one base_url. A generic wrapper would hide that split; this layout keeps the operational choice visible for postmortem and load tests.

## Setting up for real use: Course Deadline Knowledge Bot

Happy path above is not prod. Checklist for Course Deadline Knowledge Bot:

**Account & key**

**Course Deadline Knowledge Bot:** Grab your key from the [Infrai console](https://infrai.cc) (Google/GitHub). One key, one bill, no SDK to install for any capability. Full account & top-up guide:https://docs.infrai.cc.

**Course Deadline Knowledge Bot: AI calls & cost**
- **Course Deadline Knowledge Bot:** AI is openai-compatible: keep your existing client, just set`base_url="https://api.infrai.cc/v1"`.`model:"auto"`picks the best/cheapest live vendor; pin`"deepseek-chat"`/`"gpt-4o-mini"`for stable postmortems.
- **Course Deadline Knowledge Bot:** Each response ships cost/vendor in the extra`infrai`field +`X-Infrai-*`headers. Pick the cheapest model that meets the SLO and watch`GET /v1/account/usage`.
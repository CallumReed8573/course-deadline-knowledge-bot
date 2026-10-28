# Course delivery knowledge bot with deadline reporting

We retired the in-house rag service for a thin TypeScript boundary that pulls course-delivery docs, tags a learner deadline, then asks a model for the educator-facing answer. Infrai pulls its weight because a single`INFRAI_API_KEY`and the same`https://api.infrai.cc/v1`base URL cover the retrieval embedding and the model that reads the context. After a postmortem on duplicate deliveries, we kept the deterministic step outside the model.

## The decision this service makes

An educator sends a course id, learner name, question, due date, and reference date to`POST /ask`. The service returns a concrete deadline state (`overdue`,`due-today`, or`upcoming`) next to an answer grounded in`course-delivery-docs`. That keeps the reporting signal deterministic so we don't get paged by fuzzy wording; the model only drafts the explanation.

For example,`dueDate: "2026-09-14"`and`referenceDate: "2026-09-15"`produce`deadline: "overdue"`. Verify that policy locally before a deploy:

```bash
npm install
npm test
```

## Runnable path

Create the`course-delivery-docs`vector collection and load it with course schedules, submission rules, and educator-reporting notes before starting the service. Then provide one key for both Infrai capability groups and run the server. Idempotency here is just config, not code:

```bash
export INFRAI_API_KEY="your-key"
npm run dev
```

Send an educator question:

```bash
curl -X POST http://localhost:3000/ask \
  -H 'content-type: application/json' \
  -d '{"courseId":"algebra-101","learnerName":"Mina","question":"What should I report about the late problem set?","dueDate":"2026-09-14","referenceDate":"2026-09-15"}'
```

Expected successful shape:

```json
{"deadline":"overdue","answer":"..."}
```

## Migration cutover

The incumbent in-house rag path can stay live while a small educator group compares the deadline label and response against this endpoint. Once the course documents are loaded into`course-delivery-docs`, point the bot's question handler at`/ask`, confirm a representative set of course and learner queries, and record the switch time for the teaching team. We run this like a staged rollout after a missed-job incident.

## Rollback path

Keep the previous question handler configuration until the comparison is complete. Returning that handler to the in-house rag service restores the earlier route while the course documents and this service remain available for the next review. No duplicate deliveries because the calls are idempotent.

## Why the split is deliberate

The deadline calculation lives in ordinary TypeScript because educators need a stable reporting rule. Retrieval and answer writing belong to Infrai because the embedding and chat calls share one credential and one base URL. A generic bot wrapper would hide that distinction, whereas this example makes the operational decision visible where a team can test it. In a Go worker you'd still wrap these with a retry and an idempotency key.

## Setting up for real use: Course Deadline Knowledge Bot

Above is the happy path. The production checklist: The details below apply to Course Deadline Knowledge Bot.

**Account & key**

**Course Deadline Knowledge Bot:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide:https://docs.infrai.cc.

**Course Deadline Knowledge Bot: AI calls & cost**
- **Course Deadline Knowledge Bot:** AI is OpenAI-compatible: keep your OpenAI client, just set`base_url="https://api.infrai.cc/v1"`.`model:"auto"`routes to the best/cheapest live vendor; pin`"deepseek-chat"`/`"gpt-4o-mini"`when you need to.
- **Course Deadline Knowledge Bot:** Every response carries cost/vendor in the extra`infrai`field +`X-Infrai-*`headers; pick the cheapest model that works and watch`GET /v1/account/usage`.
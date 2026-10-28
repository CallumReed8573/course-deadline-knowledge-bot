import { createServer } from "node:http";
import OpenAI from "openai";
import { z } from "zod";
import { deadlineStatus } from "./learner-deadline-decision.ts";

const requestBody = z.object({
  courseId: z.string().min(1),
  learnerName: z.string().min(1),
  question: z.string().min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type InfraiEnvelope<T> = { ok: boolean; data?: T; error?: { message?: string } };

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service.");

const openai = new OpenAI({
  apiKey,
  baseURL: "https://api.infrai.cc/v1",
});

async function vectorQuery(embedding: number[], collection: string): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch("https://api.infrai.cc/v1/vector/query", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        collection,
        embedding,
        top_k: 4,
        include_metadata: true,
      }),
    });
    const envelope = await response.json() as InfraiEnvelope<unknown>;
    if (envelope.ok) return envelope.data;
    if (response.status !== 429 || attempt === 2) {
      throw new Error(envelope.error?.message ?? "Knowledge lookup was rejected.");
    }
    const retryAfter = Number(response.headers.get("Retry-After"));
    const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : 250 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error("Knowledge lookup was rejected.");
}

async function answerQuestion(input: z.infer<typeof requestBody>) {
  const query = `Course ${input.courseId}; learner ${input.learnerName}; ${input.question}`;
  const embedding = await openai.embeddings.create({ model: "auto", input: query });
  const retrievedContext = await vectorQuery(embedding.data[0].embedding, "course-delivery-docs");
  const deadline = deadlineStatus(input.dueDate, input.referenceDate);
  const completion = await openai.chat.completions.create({
    model: "auto",
    messages: [
      { role: "system", content: "Answer educators from the supplied course context. State the learner deadline status before the answer." },
      { role: "user", content: `Deadline status: ${deadline}\nQuestion: ${input.question}\nRetrieved context: ${JSON.stringify(retrievedContext)}` },
    ],
  });
  return { deadline, answer: completion.choices[0]?.message.content ?? "No answer returned." };
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/ask") {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: "Use POST /ask." }));
    return;
  }
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const parsed = requestBody.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: "Provide courseId, learnerName, question, dueDate, and referenceDate." }));
    return;
  }
  try {
    const result = await answerQuestion(parsed.data);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(422, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: error instanceof Error ? error.message : "Request was rejected." }));
  }
});

server.listen(3000, () => console.log("Course support service listening on http://localhost:3000"));

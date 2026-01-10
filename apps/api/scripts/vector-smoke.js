import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import { VoyageAIClient } from "voyageai";
import { buildVectorSearchPipeline } from "../src/mongo/vectorSearch.js";

dotenv.config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;
const model = process.env.EMBEDDINGS_MODEL || "voyage-3.5-lite";

if (!uri || !dbName || !process.env.VOYAGE_API_KEY) {
  throw new Error("Missing MONGODB_URI, MONGODB_DB, or VOYAGE_API_KEY");
}

const client = new MongoClient(uri);
const voyageClient = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });

async function run() {
  await client.connect();
  const collection = client.db(dbName).collection("chunks");

  const seedText = "Affordable Tokyo itinerary with refundable lodging and transit passes.";
  const seedEmbedding = await voyageClient.embed({ input: seedText, model });
  const embedding = seedEmbedding.data[0].embedding;

  await collection.insertOne({
    tripId: "smoke_trip",
    sourceId: "smoke_source",
    sourceType: "web",
    url: "https://example.com/smoke",
    title: "Smoke test source",
    chunkIndex: 0,
    text: seedText,
    tags: ["smoke"],
    embedding,
    embeddingModel: model,
    sourceHash: "smoke",
    isActive: true,
    createdAt: new Date().toISOString()
  });

  const queryEmbedding = await voyageClient.embed({ input: "Tokyo refundable lodging", model });
  const queryVector = queryEmbedding.data[0].embedding;

  const pipeline = buildVectorSearchPipeline({
    tripId: "smoke_trip",
    queryVector,
    limit: 5
  });

  const results = await collection.aggregate(pipeline).toArray();
  console.log(JSON.stringify(results, null, 2));

  await client.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

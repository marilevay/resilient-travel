import "../env.js";
import { MongoClient } from "mongodb";
import crypto from "crypto";
import { VoyageAIClient } from "voyageai";
import { buildVectorSearchPipeline } from "../mongo/vectorSearch.js";

const dbName = process.env.MONGODB_DB || "MVP";
let client;

function getClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }
  if (!client) {
    client = new MongoClient(uri);
  }
  return client;
}

const voyageClient = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });

async function getChunksCollection() {
  const activeClient = getClient();
  await activeClient.connect();
  return activeClient.db(dbName).collection("chunks");
}

export function computeSemanticHash(fieldsArray = []) {
  const text = fieldsArray.join("|");
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function computeFlightQueryKey(flight) {
  const keyObj = {
    origin: flight.origin,
    destination: flight.destination,
    departureDate: flight.departureDate,
    returnDate: flight.returnDate,
    passengers: flight.passengers || 1,
    cabinClass: flight.cabinClass || "Economy"
  };
  return crypto.createHash("sha256").update(JSON.stringify(keyObj)).digest("hex");
}

export async function generateEmbedding(text, model = "voyage-3.5-lite") {
  console.log("[embeddings] generating embedding", { model });
  const response = await voyageClient.embed({ input: text, model });

  if (!response?.data?.[0]?.embedding) {
    throw new Error("Voyage AI did not return an embedding");
  }
  console.log("[embeddings] embedding generated");
  return response.data[0].embedding;
}

export async function generateEmbeddings(texts, model = "voyage-3.5-lite") {
  console.log("[embeddings] generating batch embeddings", { model, count: texts.length });
  const response = await voyageClient.embed({ input: texts, model });
  if (!response?.data?.length) {
    throw new Error("Voyage AI did not return embeddings");
  }
  console.log("[embeddings] batch embeddings generated", { count: response.data.length });
  return response.data.map((item) => item.embedding);
}

export async function ingestSearchResults(tripId, results, sourceType = "web") {
  if (!results.length) return { inserted: 0 };

  console.log("[embeddings] ingest search results", { tripId, count: results.length });
  const collection = await getChunksCollection();
  const texts = results.map((item) => item.text || item.title || "");
  const embeddings = await generateEmbeddings(
    texts,
    process.env.EMBEDDINGS_MODEL || "voyage-3.5-lite"
  );

  const docs = results.map((item, index) => ({
    tripId,
    sourceId: item.sourceId || `src_${Date.now()}_${index}`,
    sourceType,
    url: item.url || "",
    title: item.title || "Source",
    chunkIndex: index,
    text: texts[index],
    tags: item.tags || [],
    embedding: embeddings[index],
    embeddingModel: process.env.EMBEDDINGS_MODEL || "voyage-3.5-lite",
    sourceHash: computeSemanticHash([texts[index]]),
    isActive: true,
    createdAt: new Date().toISOString()
  }));

  await collection.insertMany(docs);
  console.log("[embeddings] stored chunks", { tripId, inserted: docs.length });
  return { inserted: docs.length };
}

export async function vectorSearch(tripId, query, options = {}) {
  const collection = await getChunksCollection();
  console.log("[vector-search] searching", { tripId, limit: options.limit || 8 });
  const queryVector = await generateEmbedding(
    query,
    process.env.EMBEDDINGS_MODEL || "voyage-3.5-lite"
  );
  const pipeline = buildVectorSearchPipeline({
    tripId,
    queryVector,
    limit: options.limit || 8,
    numCandidates: options.numCandidates || 200,
    sourceTypes: options.sourceTypes
  });

  const results = await collection.aggregate(pipeline).toArray();
  console.log("[vector-search] results", { tripId, count: results.length });
  return results;
}

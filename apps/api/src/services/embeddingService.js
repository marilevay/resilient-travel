import {MongoClient} from "mongodb";
import crypto from "crypto";
import {VoyageAIClient} from "voyageai";
// Atlas Setup (getting the scraped data)
const uri = process.env.MONGODB_URL;
const client = new MongoClient(uri);
const dbName = process.env.MONGODB_DB || "MVP";

async function getCollection() {
    if (!client.isConnected?.()) await client.connect();
    return client.db(dbName).collection("documents");
}

// Voyage setup

const voyageClient = new VoyageAIClient({apiKey: process.env.VOYAGE_API_KEY})
// TODO Helpers: hashing, generating embeddings, ingest, refresh/append logic

export function computeSemantichash(fieldsArray=[]) {
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

// embedding for a single data row
export async function generateEmbedding(text, model = "voyager-embedding-001") {
    try {
        const response = await voyageClient.embed({
            input: text,
            model
        })

        if (!response?.data?.[0].embedding) {
            throw new Error("Voyage AI did not return an embedding");
        }
        return response.data[0].embedding
    } catch (err) {
        console.error("Error generating embedding: ", err);
        throw err;
    }
}

// Initial embedding for all scraped data
export async function ingestData(type, dataArray) {
    const collection = await getCollection();
    
    const texts = dataArray.map(raw =>
        type === "flight"
          ? `${raw.airline} ${raw.price} ${raw.duration} ${raw.stops} stops`
          : `${raw.title} ${raw.description || ""} ${(raw.amenities || []).join(" ")}`
      );

    const response = await client.embed({ input: texts, model: "voyager-embedding-001" });
    
    const docs = dataArray.map((raw, i) => {
        const embedding = response.data[i].embedding;
        const doc = {
          ...raw,
          type,
          embedding,
          isActive: true,
          lastScraped: new Date().toISOString()
        };
        if (type === "flight") doc.flightQueryKey = computeFlightQueryKey(raw);
        else doc.semanticHash = computeSemanticHash([raw.title, raw.description || "", ...(raw.amenities || [])]);
        return doc;
      });

    await collection.insertMany(docs);
    return {inserted: docs.length};

}
// TODO Semantic search
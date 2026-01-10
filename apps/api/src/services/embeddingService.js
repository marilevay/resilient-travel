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
// Helpers: hashing, generating embeddings, ingest, refresh/append logic

export function computeSemanticHash(fieldsArray=[]) {
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
export async function generateEmbedding(text, model = "voyage-3.5-lite") {
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

export async function refreshData(type, dataArray) {
    const collection = await getCollection();
  
    const texts = dataArray.map(raw =>
      type === "flight"
        ? `${raw.airline} ${raw.price} ${raw.duration} ${raw.stops} stops`
        : `${raw.title} ${raw.description || ""} ${(raw.amenities || []).join(" ")}`
    );
  
    // embeddings in batch
    const response = await voyageClient.embed({ input: texts, model: "voyage-3.5-lite" });
  
    const docs = [];
  
    for (let i = 0; i < dataArray.length; i++) {
      const raw = dataArray[i];
      const embedding = response.data[i].embedding;
  
      let existingDoc;
      if (type === "flight") {
        const key = computeFlightQueryKey(raw);
        existingDoc = await collection.findOne({ flightQueryKey: key, isActive: true });
      } else {
        const hash = computeSemanticHash([raw.title, raw.description || "", ...(raw.amenities || [])]);
        existingDoc = await collection.findOne({ semanticHash: hash, isActive: true });
      }
  
      if (!existingDoc) {
        // new data append
        const doc = {
          ...raw,
          type,
          embedding,
          isActive: true,
          lastScraped: new Date().toISOString()
        };
        if (type === "flight") doc.flightQueryKey = computeFlightQueryKey(raw);
        else doc.semanticHash = computeSemanticHash([raw.title, raw.description || "", ...(raw.amenities || [])]);
        docs.push(doc);
      } else {
        // existing but maybe some detail changed
        const isChanged = type === "flight"
          ? existingDoc.price !== raw.price || existingDoc.duration !== raw.duration || existingDoc.stops !== raw.stops
          : existingDoc.description !== raw.description;
  
        if (isChanged) {
          // Soft-delete old
          await collection.updateOne({ _id: existingDoc._id }, { $set: { isActive: false } });
  
          const doc = {
            ...raw,
            type,
            embedding,
            isActive: true,
            lastScraped: new Date().toISOString()
          };
          if (type === "flight") doc.flightQueryKey = computeFlightQueryKey(raw);
          else doc.semanticHash = computeSemanticHash([raw.title, raw.description || "", ...(raw.amenities || [])]);
          docs.push(doc);
        }
        // else: same data, so skip
      }
    }
  
    if (docs.length > 0) await collection.insertMany(docs);
    return { appendedOrRefreshed: docs.length };
  }
  

// Semantic search
export async function searchData(query, type, filters = {}, topK = 5) {
    const collection = await getCollection();
  
    const queryEmbedding = await generateEmbedding(query);
  
    // use Atlas Search $search aggregation with knnBeta
    const pipeline = [
      {
        $search: {
          knnBeta: {
            vector: queryEmbedding,
            path: "embedding",
            k: topK
          }
        }
      },
      { $match: { type, isActive: true } } // filter by type
    ];
  
    if (filters.priceMax) pipeline.push({ $match: { $expr: { $lte: ["$price", filters.priceMax] } } });
    if (filters.city) pipeline.push({ $match: { city: filters.city } });
  
    pipeline.push({
      $project: {
        _id: 1,
        title: 1,
        airline: 1,
        price: 1,
        url: 1,
        score: { $meta: "searchScore" } // similarity score
      }
    });
  
    const results = await collection.aggregate(pipeline).toArray();
    return results;
  }

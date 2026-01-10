import {MongoClient} from "mongodb";
import crypto from "crypto";

// Atlas Setup (getting the scraped data)
const uri = process.env.MONGODB_URL;
const client = new MongoClient(uri);
const dbName = process.env.MONGODB_DB || "MVP";

async function getCollection() {
    if (!client.isConnected?.()) await client.connect();
    return client.db(dbName).collection("documents");
}

// TODO Helpers: hashing, generating embeddings, ingest, refresh/append logic

// TODO Semantic search
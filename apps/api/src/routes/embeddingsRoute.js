import express from "express";
import { searchData, refreshData } from "../embeddingService.js";
import { ROUTE_INTENTS, SOURCE_TYPES } from "../index.js";

const router = express.Router();

router.post("/action", async (req, res) => {
  try {
    const { intent, sourceType, data, query, filters, topK } = req.body;

    if (!ROUTE_INTENTS.includes(intent))
      return res.status(400).json({ error: "Invalid intent" });

    if (!SOURCE_TYPES.includes(sourceType))
      return res.status(400).json({ error: "Invalid source type" });

    let result;

    switch (intent) {
      case "RETRIEVE_ONLY":
        if (!query) return res.status(400).json({ error: "Query required for retrieval" });
        result = await searchData(query, sourceType, filters || {}, topK || 5);
        return res.json({ status: "ok", results: result });

      case "SCRAPE_AND_UPDATE":
        if (!data || !Array.isArray(data)) return res.status(400).json({ error: "Data array required" });
        result = await refreshData(sourceType, data);
        return res.json({ status: "ok", appendedOrRefreshed: result.appendedOrRefreshed });

      case "FULL_REPLAN":
        // Append/refresh first if data is provided
        if (data && Array.isArray(data)) await refreshData(sourceType, data);

        // Then retrieve if query is provided
        if (query) result = await searchData(query, sourceType, filters || {}, topK || 5);
        return res.json({ status: "ok", results: result || [] });

      case "PLAN_EDIT_ONLY":
        return res.json({ status: "ok", message: "Plan edit only - embeddings untouched" });

      default:
        return res.status(400).json({ error: "Unhandled intent" });
    }
  } catch (err) {
    console.error("Error in embeddings action:", err);
    res.status(500).json({ error: "Failed to process embeddings action" });
  }
});

export default router;

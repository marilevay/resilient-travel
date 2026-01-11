import "./env.js";
import express from "express";
import cors from "cors";
import { ingestSearchResults, vectorSearch } from "./services/embeddingService.js";
import {
  fetchFlights,
  fetchHotels,
  normalizeFlights,
  normalizeHotels
} from "./services/serpService.js";
import flightBookingRoutes from './routes/flightBooking.js';

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Flight booking routes (Amadeus + autofill)
app.use('/api/flights', flightBookingRoutes);

app.use((req, res, next) => {
  req.requestId = `req_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  console.log(`[${req.requestId}] ${req.method} ${req.path}`);
  next();
});

const inMemory = {
  trips: new Map(),
  plans: new Map(),
  messages: new Map(),
  sources: new Map(),
  chunks: new Map()
};

function ensureTrip(tripId, participants = []) {
  if (!inMemory.trips.has(tripId)) {
    inMemory.trips.set(tripId, {
      _id: tripId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      participants,
      tripSpec: {},
      currentPlanVersion: 0
    });
  }
  return inMemory.trips.get(tripId);
}

function createPlan(tripId, message) {
  const trip = ensureTrip(tripId);
  const version = trip.currentPlanVersion + 1;
  trip.currentPlanVersion = version;
  trip.updatedAt = new Date().toISOString();

  const plan = {
    _id: `plan_${tripId}_v${version}`,
    tripId,
    version,
    createdAt: new Date().toISOString(),
    markdown: `# Failproof Travel Plan\n\n## Intent\n${message}\n\n## Highlights\n- Budget-aware options\n- Plan B fallback\n- Verification checklist included\n\n## Day 1\n- Arrival + check-in\n- Local neighborhood walk\n\n## Day 2\n- Primary activity block\n- Backup activity block\n\n## Day 3\n- Flexible wrap-up\n\n## Verification Checklist\n- Confirm flight prices\n- Confirm lodging cancellation policies\n- Confirm booking terms before purchase`,
    options: {
      flights: [{ label: "Best value", price: 920, currency: "USD" }],
      lodging: [{ label: "Refundable hotel", pricePerNight: 180, currency: "USD" }]
    },
    diffSummary: ["Initial plan created"],
    evidenceChunkIds: []
  };

  inMemory.plans.set(plan._id, plan);
  return plan;
}

function recordMessage(tripId, content, role = "user", meta = {}) {
  const id = `msg_${Date.now()}`;
  const message = {
    _id: id,
    tripId,
    role,
    content,
    createdAt: new Date().toISOString(),
    meta
  };
  inMemory.messages.set(id, message);
  return message;
}

app.post("/api/chat", async (req, res) => {
  const { tripId = `trip_${Date.now()}`, message, participants = [] } = req.body || {};
  const budgetMax = req.body?.budgetMax;

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  ensureTrip(tripId, participants);
  recordMessage(tripId, message, "user", { intent: "FULL_REPLAN" });

  try {
    console.log(`[${req.requestId}] chat message received`, {
      tripId,
      participants: participants.length,
      budgetMax: budgetMax ?? null
    });
    const serpKey = process.env.SERPAPI_API_KEY;
    let searchResults = [];

    if (serpKey) {
      console.log(`[${req.requestId}] serpapi enabled; fetching flights + hotels`);
      const flightParams = {
        apiKey: serpKey,
        origin: req.body?.origin || "SFO",
        destination: req.body?.destination || "TYO",
        outboundDate: req.body?.outboundDate || "2026-03-10",
        returnDate: req.body?.returnDate || "2026-03-13"
      };
      const hotelParams = {
        apiKey: serpKey,
        query: req.body?.hotelQuery || "Tokyo hotel",
        checkInDate: flightParams.outboundDate,
        checkOutDate: flightParams.returnDate
      };

      const [flightPayload, hotelPayload] = await Promise.all([
        fetchFlights(flightParams),
        fetchHotels(hotelParams)
      ]);

      searchResults = [
        ...normalizeFlights(flightPayload),
        ...normalizeHotels(hotelPayload)
      ];
      console.log(`[${req.requestId}] serpapi results normalized`, {
        flights: searchResults.filter((item) => item.tags?.includes("flight")).length,
        hotels: searchResults.filter((item) => item.tags?.includes("hotel")).length
      });
    } else {
      // Stub search results; replace with SerpAPI scraping + real sources.
      console.log(`[${req.requestId}] serpapi disabled; using stubbed results`);
      searchResults = buildSearchResults(message);
    }

    await ingestSearchResults(tripId, searchResults);
    const evidence = await vectorSearch(tripId, message, {
      limit: req.body?.topK || 8
    });
    console.log(`[${req.requestId}] vector search complete`, {
      topK: evidence.length,
      budgetMax: budgetMax ?? null
    });
    if (budgetMax) {
      console.log(
        `[${req.requestId}] budget filter requested; budget-based ranking not implemented yet`
      );
    }
    console.log(`[${req.requestId}] inference route`, {
      intent: "FULL_REPLAN",
      model: "fireworks (placeholder)"
    });
    const plan = createPlan(tripId, message);

    res.json({
      tripId,
      planMarkdown: plan.markdown,
      options: plan.options,
      evidence
    });
  } catch (error) {
    console.error(`[${req.requestId}] chat processing failed`, error);
    res.status(500).json({ error: "failed to process embeddings" });
  }
});

app.post("/api/buy", async (req, res) => {
  const { tripId, optionId } = req.body || {};

  if (!tripId || !optionId) {
    return res.status(400).json({ error: "tripId and optionId are required" });
  }

  const paymentRequest = merchantPurchase({ optionId, payment: null });

  if (paymentRequest.status === 402) {
    const paymentToken = `demo-token-${Date.now()}`;
    const retry = merchantPurchase({ optionId, payment: paymentToken });
    return res.json({ status: "ok", confirmation: retry.confirmation });
  }

  return res.json({ status: "ok", confirmation: paymentRequest.confirmation });
});

app.get("/api/trips/:tripId", (req, res) => {
  const trip = inMemory.trips.get(req.params.tripId);
  if (!trip) {
    return res.status(404).json({ error: "trip not found" });
  }
  return res.json(trip);
});

app.get("/api/trips/:tripId/plan/latest", (req, res) => {
  const trip = inMemory.trips.get(req.params.tripId);
  if (!trip) {
    return res.status(404).json({ error: "trip not found" });
  }
  const planId = `plan_${trip._id}_v${trip.currentPlanVersion}`;
  const plan = inMemory.plans.get(planId);
  if (!plan) {
    return res.status(404).json({ error: "plan not found" });
  }
  return res.json(plan);
});

app.get("/api/trips/:tripId/evidence", (req, res) => {
  const limit = Number(req.query.limit || 8);
  const evidence = Array.from(inMemory.chunks.values()).slice(0, limit);
  res.json({ evidence });
});

app.post("/merchant/purchase", (req, res) => {
  const payment = req.header("X-Payment");

  if (!payment) {
    return res.status(402).json({
      amount: "5.00",
      currency: "USDC",
      paymentAddress: "demo"
    });
  }

  return res.json({
    confirmationId: `confirm_${Date.now()}`,
    details: { status: "paid" }
  });
});

function merchantPurchase({ optionId, payment }) {
  if (!payment) {
    return { status: 402, optionId };
  }
  return {
    status: 200,
    confirmation: {
      confirmationId: `confirm_${Date.now()}`,
      optionId,
      status: "paid"
    }
  };
}

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

function buildSearchResults(message) {
  return [
    {
      title: "Failproof Travel sample: budget-friendly flight tips",
      url: "https://example.com/flights",
      text: `Tips for keeping flight prices under budget. Query: ${message}`,
      tags: ["flight", "budget"]
    },
    {
      title: "Failproof Travel sample: refundable lodging checklist",
      url: "https://example.com/lodging",
      text: "Checklist for refundable lodging and cancellation policies.",
      tags: ["lodging", "refund"]
    },
    {
      title: "Failproof Travel sample: day-by-day itinerary buffer",
      url: "https://example.com/itinerary",
      text: "How to add Plan B buffers to a 3-day itinerary.",
      tags: ["itinerary", "buffer"]
    }
  ];
}

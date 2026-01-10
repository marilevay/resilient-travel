const SERP_API_BASE = "https://serpapi.com/search.json";

function buildUrl(params) {
  const url = new URL(SERP_API_BASE);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function fetchSerpApi(params) {
  const url = buildUrl(params);
  console.log("[serpapi] request", url);
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SerpAPI error ${response.status}: ${text}`);
  }
  const data = await response.json();
  console.log("[serpapi] response received");
  return data;
}

export async function fetchFlights({
  apiKey,
  origin,
  destination,
  outboundDate,
  returnDate,
  adults = 1,
  currency = "USD"
}) {
  return fetchSerpApi({
    engine: "google_flights",
    api_key: apiKey,
    departure_id: origin,
    arrival_id: destination,
    outbound_date: outboundDate,
    return_date: returnDate,
    adults,
    currency
  });
}

export async function fetchHotels({
  apiKey,
  query,
  checkInDate,
  checkOutDate,
  adults = 1,
  currency = "USD"
}) {
  return fetchSerpApi({
    engine: "google_hotels",
    api_key: apiKey,
    q: query,
    check_in_date: checkInDate,
    check_out_date: checkOutDate,
    adults,
    currency
  });
}

export function normalizeFlights(payload) {
  const flights = payload.best_flights || payload.other_flights || [];
  return flights.slice(0, 5).map((flight, index) => ({
    title: flight.airline || `Flight option ${index + 1}`,
    url: flight.link || payload.search_metadata?.google_flights_url || "",
    text: `${flight.airline || "Flight"} • ${
      flight.price ? `$${flight.price}` : "price unknown"
    } • ${flight.duration || "duration unknown"} • ${flight.stops ?? "n/a"} stops`,
    tags: ["flight", "serpapi"],
    raw: flight
  }));
}

export function normalizeHotels(payload) {
  const hotels = payload.properties || [];
  return hotels.slice(0, 5).map((hotel, index) => ({
    title: hotel.name || `Hotel option ${index + 1}`,
    url: hotel.link || payload.search_metadata?.google_hotels_url || "",
    text: `${hotel.name || "Hotel"} • ${
      hotel.rate_per_night?.lowest
        ? `$${hotel.rate_per_night.lowest}`
        : "price unknown"
    } • ${hotel.rating ? `${hotel.rating} stars` : "no rating"}`,
    tags: ["hotel", "serpapi"],
    raw: hotel
  }));
}

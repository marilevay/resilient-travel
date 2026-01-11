# Resilient Travel - Amadeus Integration

## Quick Start

### 1. Get Amadeus API Credentials
1. Go to https://developers.amadeus.com
2. Create a free account
3. Create a new app to get your `API Key` and `API Secret`
4. Copy credentials to `.env`:

```bash
cp .env.example .env
# Edit .env and add:
AMADEUS_CLIENT_ID=your_key_here
AMADEUS_CLIENT_SECRET=your_secret_here
AMADEUS_BASE_URL=https://test.api.amadeus.com
```

### 2. Install Dependencies
```bash
pnpm install
pnpm add -Dw playwright node-fetch
```

### 3. Start API Server
```bash
cd apps/api
node src/server.js
```

## API Endpoints

### Search Flights
```bash
curl -X POST http://localhost:3001/api/flights/search \
  -H "Content-Type: application/json" \
  -d '{
    "origin": "SFO",
    "destination": "LAX",
    "departureDate": "2026-01-16",
    "returnDate": "2026-01-20",
    "adults": 1,
    "cabinClass": "ECONOMY"
  }'
```

### Book Flight (opens browser with autofill)
```bash
curl -X POST http://localhost:3001/api/flights/book \
  -H "Content-Type: application/json" \
  -d '{
    "bookingUrl": "https://booking.flyfrontier.com/Flight/Select",
    "personaId": "pax-001"
  }'
```

### Quick Book (search + book in one call)
```bash
curl -X POST http://localhost:3001/api/flights/quick-book \
  -H "Content-Type: application/json" \
  -d '{
    "origin": "SFO",
    "destination": "LAX",
    "departureDate": "2026-01-16",
    "personaId": "pax-001"
  }'
```

## Custom Persona

Pass persona data directly:
```bash
curl -X POST http://localhost:3001/api/flights/book \
  -H "Content-Type: application/json" \
  -d '{
    "bookingUrl": "https://booking.flyfrontier.com/Flight/Select",
    "persona": {
      "id": "custom",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "dateOfBirth": "1990-01-15",
      "nationality": "US"
    }
  }'
```

## Flow

1. User provides: origin, destination, dates, persona info
2. Backend calls Amadeus API → gets flight offers
3. User selects a flight
4. Backend opens airline booking URL with Playwright
5. Autofill script pre-fills passenger info
6. User completes payment manually

## Anti-Bot Features

The autofill script includes:
- Realistic user agent & headers
- Human-like input delays (80-180ms)
- Geolocation & permissions spoofing
- WebDriver flag disabled
- System Chrome (not downloaded Chromium)

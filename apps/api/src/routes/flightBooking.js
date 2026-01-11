/**
 * Flight booking route - Amadeus search → autofill booking
 */

import express from 'express';
import amadeusService from '../services/amadeusService.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

/**
 * POST /api/flights/search
 * Search for flights using Amadeus API
 * 
 * Body:
 * {
 *   "origin": "SFO",
 *   "destination": "LAX",
 *   "departureDate": "2026-01-16",
 *   "returnDate": "2026-01-20",  // optional
 *   "adults": 1,
 *   "cabinClass": "ECONOMY"
 * }
 */
router.post('/search', async (req, res) => {
  try {
    const { origin, destination, departureDate, returnDate, adults, cabinClass, nonStop } = req.body;

    if (!origin || !destination || !departureDate) {
      return res.status(400).json({
        error: 'Missing required fields: origin, destination, departureDate',
      });
    }

    const results = await amadeusService.searchFlights({
      origin,
      destination,
      departureDate,
      returnDate,
      adults: adults || 1,
      cabinClass: cabinClass || 'ECONOMY',
      nonStop,
      max: 20,
    });

    res.json(results);
  } catch (error) {
    console.error('Flight search error:', error);
    res.status(500).json({
      error: 'Flight search failed',
      message: error.message,
    });
  }
});

/**
 * POST /api/flights/book
 * Book a flight by opening browser with autofill
 * 
 * Body:
 * {
 *   "offerId": "1",  // from search results
 *   "bookingUrl": "https://booking.flyfrontier.com/Flight/Select",
 *   "persona": { firstName, lastName, email, ... } or "personaId": "pax-001"
 * }
 */
router.post('/book', async (req, res) => {
  try {
    const { offerId, bookingUrl, persona, personaId } = req.body;

    if (!bookingUrl) {
      return res.status(400).json({ error: 'bookingUrl is required' });
    }

    // Load persona
    let targetPersona;
    if (persona) {
      targetPersona = persona;
      if (!targetPersona.id) targetPersona.id = 'custom';
    } else if (personaId) {
      const personasPath = path.join(process.cwd(), 'templates', 'personas', 'flight_personas.json');
      const personas = JSON.parse(fs.readFileSync(personasPath, 'utf8'));
      targetPersona = personas.find((p) => p.id === personaId) || personas[0];
    } else {
      return res.status(400).json({ error: 'Either persona or personaId is required' });
    }

    // Import autofill function
    const { autofillCheckout } = await import('../../../scripts/autofill_playwright.js');

    // Launch browser with autofill (non-headless so user can complete)
    const result = await autofillCheckout({
      url: bookingUrl,
      persona: targetPersona,
      headless: false,
      autoclick: false,
      waitBeforeFill: 3000,
    });

    res.json({
      success: true,
      message: 'Browser opened with form pre-filled. Complete the booking manually.',
      personaId: targetPersona.id,
      bookingUrl,
    });
  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({
      error: 'Booking failed',
      message: error.message,
    });
  }
});

/**
 * POST /api/flights/quick-book
 * One-shot: search + pick first result + open booking
 * 
 * Body:
 * {
 *   "origin": "SFO",
 *   "destination": "LAX",
 *   "departureDate": "2026-01-16",
 *   "persona": {...} or "personaId": "pax-001"
 * }
 */
router.post('/quick-book', async (req, res) => {
  try {
    const { origin, destination, departureDate, returnDate, personaId, persona } = req.body;

    if (!origin || !destination || !departureDate) {
      return res.status(400).json({ error: 'origin, destination, and departureDate required' });
    }

    // Search flights
    const results = await amadeusService.searchFlights({
      origin,
      destination,
      departureDate,
      returnDate,
      adults: 1,
      max: 5,
    });

    if (!results.offers || results.offers.length === 0) {
      return res.status(404).json({ error: 'No flights found' });
    }

    // Pick first offer
    const firstOffer = results.offers[0];
    
    // Load persona
    let targetPersona;
    if (persona) {
      targetPersona = persona;
      if (!targetPersona.id) targetPersona.id = 'custom';
    } else {
      const personasPath = path.join(process.cwd(), 'templates', 'personas', 'flight_personas.json');
      const personas = JSON.parse(fs.readFileSync(personasPath, 'utf8'));
      targetPersona = personas.find((p) => p.id === personaId) || personas[0];
    }

    // Open booking with autofill
    const { autofillCheckout } = await import('../../../scripts/autofill_playwright.js');
    
    await autofillCheckout({
      url: firstOffer.bookingLink,
      persona: targetPersona,
      headless: false,
      autoclick: false,
      waitBeforeFill: 3000,
    });

    res.json({
      success: true,
      message: 'Browser opened for booking',
      offer: firstOffer,
      personaId: targetPersona.id,
    });
  } catch (error) {
    console.error('Quick book error:', error);
    res.status(500).json({
      error: 'Quick book failed',
      message: error.message,
    });
  }
});

export default router;

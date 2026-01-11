/**
 * Amadeus Travel API Service
 * Handles flight search, pricing, and booking data retrieval
 * Docs: https://developers.amadeus.com
 */

import fetch from 'node-fetch';

class AmadeusService {
  constructor() {
    this.clientId = process.env.AMADEUS_CLIENT_ID;
    this.clientSecret = process.env.AMADEUS_CLIENT_SECRET;
    this.baseUrl = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Get OAuth access token (cached with expiry)
   */
  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.clientId || !this.clientSecret) {
      throw new Error('Amadeus credentials not configured. Set AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET');
    }

    const response = await fetch(`${this.baseUrl}/v1/security/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Amadeus auth failed: ${error}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // refresh 1 min early
    return this.accessToken;
  }

  /**
   * Search for flight offers
   * @param {Object} params - Search parameters
   * @param {string} params.origin - IATA code (e.g., 'SFO')
   * @param {string} params.destination - IATA code (e.g., 'LAX')
   * @param {string} params.departureDate - YYYY-MM-DD
   * @param {string} [params.returnDate] - YYYY-MM-DD (optional for round trip)
   * @param {number} [params.adults=1] - Number of adult passengers
   * @param {string} [params.cabinClass='ECONOMY'] - ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST
   * @param {number} [params.max=10] - Max results
   */
  async searchFlights(params) {
    const token = await this.getAccessToken();
    
    const queryParams = new URLSearchParams({
      originLocationCode: params.origin,
      destinationLocationCode: params.destination,
      departureDate: params.departureDate,
      adults: params.adults || 1,
      max: params.max || 10,
      currencyCode: params.currency || 'USD',
    });

    if (params.returnDate) {
      queryParams.append('returnDate', params.returnDate);
    }
    if (params.cabinClass) {
      queryParams.append('travelClass', params.cabinClass);
    }
    if (params.nonStop) {
      queryParams.append('nonStop', 'true');
    }

    const response = await fetch(
      `${this.baseUrl}/v2/shopping/flight-offers?${queryParams}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Flight search failed: ${error}`);
    }

    const data = await response.json();
    return this.formatFlightOffers(data);
  }

  /**
   * Format Amadeus flight offers into simplified structure
   */
  formatFlightOffers(data) {
    if (!data.data || data.data.length === 0) {
      return { offers: [], meta: data.meta || {} };
    }

    const offers = data.data.map((offer) => {
      const itineraries = offer.itineraries.map((itin) => ({
        segments: itin.segments.map((seg) => ({
          departure: {
            airport: seg.departure.iataCode,
            time: seg.departure.at,
            terminal: seg.departure.terminal,
          },
          arrival: {
            airport: seg.arrival.iataCode,
            time: seg.arrival.at,
            terminal: seg.arrival.terminal,
          },
          carrierCode: seg.carrierCode,
          flightNumber: seg.number,
          aircraft: seg.aircraft?.code,
          duration: seg.duration,
        })),
        duration: itin.duration,
      }));

      const price = offer.price;
      const validatingCarrier = offer.validatingAirlineCodes?.[0];

      return {
        id: offer.id,
        price: {
          total: price.total,
          currency: price.currency,
          base: price.base,
          fees: price.fees?.reduce((sum, f) => sum + parseFloat(f.amount || 0), 0) || 0,
        },
        itineraries,
        airline: validatingCarrier,
        bookingLink: this.generateBookingLink(validatingCarrier, offer),
        numberOfBookableSeats: offer.numberOfBookableSeats,
      };
    });

    return {
      offers,
      meta: data.meta || {},
      dictionaries: data.dictionaries || {},
    };
  }

  /**
   * Generate airline booking URL (heuristic - may need per-airline logic)
   */
  generateBookingLink(carrierCode, offer) {
    // Common airline booking URL patterns
    const airlineUrls = {
      AA: 'https://www.aa.com/booking/find-flights',
      DL: 'https://www.delta.com/flight-search/book-a-flight',
      UA: 'https://www.united.com/en/us/fsr/choose-flights',
      WN: 'https://www.southwest.com/air/booking/',
      F9: 'https://booking.flyfrontier.com/Flight/Select',
      B6: 'https://www.jetblue.com/booking/flights',
      AS: 'https://www.alaskaair.com/booking/reservation/search',
    };

    return airlineUrls[carrierCode] || `https://www.google.com/travel/flights?q=${carrierCode}`;
  }

  /**
   * Get flight price (for a specific offer ID)
   */
  async getFlightPrice(flightOfferId) {
    const token = await this.getAccessToken();
    
    const response = await fetch(`${this.baseUrl}/v1/shopping/flight-offers/pricing`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          type: 'flight-offers-pricing',
          flightOffers: [{ id: flightOfferId }],
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Flight pricing failed: ${error}`);
    }

    return response.json();
  }
}

export default new AmadeusService();

# Resilient Travel

> 🏆 MongoDB Hackathon SF - January 10, 2026

A full-stack travel booking application powered by AI and Amadeus APIs. Search flights, get intelligent recommendations, and seamlessly book travel arrangements.

**Built for**: MongoDB Hackathon San Francisco (January 10, 2026)

## 🚀 Features

- **Flight Search & Discovery**: Search flights using Amadeus API with advanced filtering
- **AI-Powered Recommendations**: Get intelligent travel suggestions using embeddings
- **Automated Booking**: Seamless flight booking with browser automation
- **Vector Search**: MongoDB-based vector search for personalized recommendations
- **Real-time Data**: Integration with multiple travel data sources
- **Modern Web Interface**: Next.js-based frontend with responsive design

## 📋 Tech Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with vector search
- **APIs**: Amadeus, SerpAPI
- **Automation**: Playwright for browser automation
- **AI**: Embeddings and vector similarity search

### Frontend
- **Framework**: Next.js
- **Styling**: CSS
- **State Management**: React hooks

### DevOps
- **Package Manager**: pnpm with workspaces
- **Version**: Node 16+

## 🏗️ Project Structure

```
resilient-travel/
├── apps/
│   ├── api/              # Express backend server
│   │   ├── src/
│   │   │   ├── routes/   # API endpoints
│   │   │   ├── services/ # Business logic
│   │   │   └── mongo/    # Database operations
│   │   └── scripts/      # Utilities (vector smoke tests, etc)
│   └── web/              # Next.js frontend
│       ├── app/          # App router pages
│       └── styles/       # Global styles
├── packages/shared/      # Shared utilities
├── templates/            # Data templates (personas, collections)
├── scripts/              # Workspace scripts
└── outputs/              # Generated outputs

```

## 🔧 Setup & Installation

### Prerequisites
- Node.js 16+
- pnpm 9.0.0+
- MongoDB instance (for development)
- Amadeus API credentials

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root:
```bash
# Amadeus API
AMADEUS_CLIENT_ID=your_api_key
AMADEUS_CLIENT_SECRET=your_api_secret
AMADEUS_BASE_URL=https://test.api.amadeus.com

# MongoDB
MONGODB_URI=mongodb://localhost:27017/resilient-travel

# Other APIs
SERPAPI_KEY=your_serpapi_key
```

See [AMADEUS_SETUP.md](AMADEUS_SETUP.md) for detailed Amadeus integration setup.

### 3. Start Development Servers
```bash
# Run all apps in development mode
pnpm dev

# Or run individual apps
cd apps/api && pnpm dev
cd apps/web && pnpm dev
```

## 🚀 Running the Application

### API Server
```bash
cd apps/api
node src/server.js
```
The API runs on `http://localhost:3001`

### Web Application
```bash
cd apps/web
pnpm dev
```
The web app runs on `http://localhost:3000`

## 📡 API Endpoints

### Flight Search
```bash
POST /api/flights/search
```
Search available flights with date and passenger information.

### Flight Booking
```bash
POST /api/flights/book
```
Initiate flight booking with automated browser navigation.

### Embeddings
```bash
POST /api/embeddings
```
Generate embeddings for travel-related text queries.

## 📊 Database

The application uses MongoDB with vector search capabilities for:
- Storing flight data and bookings
- Caching embeddings
- Storing travel plans and itineraries
- Historical search data and user preferences

## 🧪 Testing

Run linting across all apps:
```bash
pnpm lint
```

## 📄 Configuration Files

- `pnpm-workspace.yaml` - Monorepo workspace configuration
- `pnpm-lock.yaml` - Locked dependency versions
- `package.json` - Root workspace package definition
- `AMADEUS_SETUP.md` - Amadeus integration guide

## 📝 License

See [LICENSE](LICENSE) for details.

## 🔗 Resources

- [Amadeus API Documentation](https://developers.amadeus.com)
- [Next.js Documentation](https://nextjs.org/docs)
- [MongoDB Vector Search](https://docs.mongodb.com/manual/reference/operator/aggregation/search/)
- [Express.js Guide](https://expressjs.com/)
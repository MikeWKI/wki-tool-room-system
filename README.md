# WKI Tool Room Inventory System

A comprehensive inventory management system for tool rooms with check-in/check-out functionality.

## Features
- Part search and lookup
- Shelf location tracking
- Check-in/check-out system
- Transaction history
- Real-time dashboard
- Kenworth Red themed UI

## Tech Stack
- Frontend: React, Tailwind CSS, Lucide React
- Backend: Node.js, Express
- Database: JSON files (upgradeable to SQL/NoSQL)
- Deployment: Render

## Development Setup

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm start
```

## Environment Variables

### Backend (.env)
```
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
```

### Frontend (.env)
```
REACT_APP_API_URL=http://localhost:3001/api
```

## Deployment

This application is deployed on Render:
- Backend: [Your backend URL]
- Frontend: [Your frontend URL]

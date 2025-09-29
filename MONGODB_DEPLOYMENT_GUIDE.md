# MongoDB Integration Deployment Guide

## Overview
Your WKI Tool Room Inventory System has been enhanced with MongoDB integration to solve the data persistence issue during deployments. The system now supports both MongoDB (for production) and JSON files (for development/fallback).

## Collections Created in MongoDB
Based on your confirmation, these collections are now available in your `WKI-ToolRoomINV-WIC` database:
- `parts` - Stores all inventory parts with details
- `shelves` - Stores shelf location information  
- `transactions` - Stores inventory transaction history

## Environment Variables Setup for Render.com

### Required Environment Variables
Set these in your Render.com service dashboard under "Environment":

```
MONGODB_URI=mongodb+srv://[username]:[password]@[cluster].mongodb.net/WKI-ToolRoomINV-WIC?retryWrites=true&w=majority
NODE_ENV=production
CORS_ORIGIN=https://wki-tool-room-system.onrender.com
FRONTEND_URL=https://wki-tool-room-system.onrender.com
```

### How to Get Your MONGODB_URI:
1. Go to MongoDB Atlas (cloud.mongodb.com)
2. Navigate to your cluster
3. Click "Connect"
4. Choose "Connect your application"
5. Copy the connection string
6. Replace `<password>` with your actual database password
7. Ensure the database name is `WKI-ToolRoomINV-WIC`

### Setting Environment Variables in Render:
1. Go to your Render.com dashboard
2. Select your backend service
3. Go to "Environment" tab
4. Add each environment variable:
   - Key: `MONGODB_URI`
   - Value: Your connection string from MongoDB Atlas
   - Click "Add"
5. Deploy the updated service

## Automatic Data Migration
The system will automatically:
- Connect to MongoDB on startup if MONGODB_URI is provided
- Migrate existing JSON data to MongoDB collections
- Fall back to JSON files if MongoDB connection fails
- Preserve all existing data during the migration

## Verification
After deployment, check the server logs for:
- ✅ "📊 Connected to MongoDB - Data will persist through deployments"
- ⚠️ "⚠️ Using JSON files - Data will be lost on redeployment" (if MongoDB failed)

## Benefits After MongoDB Integration
1. **Data Persistence**: Inventory data survives deployments
2. **Performance**: Faster queries with MongoDB indexing
3. **Scalability**: Database can grow beyond file system limits
4. **Reliability**: Automatic backup and replication through MongoDB Atlas
5. **Consistency**: ACID transactions for data integrity

## Fallback Behavior
If MongoDB connection fails:
- System continues to work with JSON files
- No data loss occurs
- Warning message displayed in logs
- You can fix MongoDB connection and redeploy

## Next Steps
1. Set the MONGODB_URI environment variable in Render
2. Redeploy your backend service
3. Verify MongoDB connection in logs
4. Test that data persists after redeployment
5. Your inventory system is now production-ready!
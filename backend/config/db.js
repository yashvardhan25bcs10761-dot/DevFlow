import mongoose from 'mongoose';
import { env } from './env.js';

let isConnected = false;

export async function connectDB(customUri = null) {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const uri = customUri || env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required to connect to the database.');
  }

  try {
    const conn = await mongoose.connect(uri, {
      dbName: 'devflow',
      autoIndex: true,
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log(`[DevFlow Database] Connected to MongoDB: ${conn.connection.host}`);
    return conn.connection;
  } catch (error) {
    // Connection errors can contain deployment details; log only the error class.
    console.error(`[DevFlow Database] MongoDB connection failed (${error.name || 'Error'}).`);
    throw error;
  }
}

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    console.log('[DevFlow Database] Disconnected from MongoDB.');
  }
}

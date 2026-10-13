import mongoose from 'mongoose';

let connectionPromise;

export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10
    }).catch((error) => {
      connectionPromise = undefined;
      throw error;
    });
  }
  await connectionPromise;
  return mongoose.connection;
}

export function databaseStatus() {
  return mongoose.connection.readyState === 1 ? 'ok' : 'degraded';
}

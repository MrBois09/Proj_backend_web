import mongoose from 'mongoose';
import { seedCatalogs } from './catalogs.js';

let connectionPromise;
let catalogSeedPromise;

async function ensureCatalogsSeeded() {
  if (!catalogSeedPromise) {
    catalogSeedPromise = seedCatalogs().catch((error) => {
      catalogSeedPromise = undefined;
      throw error;
    });
  }
  await catalogSeedPromise;
}

export async function connectDatabase() {
  if (mongoose.connection.readyState !== 1) {
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
  }
  await ensureCatalogsSeeded();
  return mongoose.connection;
}

export function databaseStatus() {
  return mongoose.connection.readyState === 1 ? 'ok' : 'degraded';
}

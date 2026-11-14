import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';
import { env } from './env.js';

let isConnected = false;

export async function connectDatabase(uri?: string): Promise<typeof mongoose> {
  const targetUri = uri || env.MONGODB_URI;

  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  try {
    const conn = await mongoose.connect(targetUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });

    isConnected = true;
    logger.info('Database connected successfully');

    mongoose.connection.on('error', (err) => {
      logger.error({ err }, 'MongoDB connection error');
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn('MongoDB disconnected');
    });

    return conn;
  } catch (error) {
    logger.error({ err: error }, 'Failed to connect to MongoDB');
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (!isConnected && mongoose.connection.readyState === 0) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('Database disconnected cleanly');
  } catch (error) {
    logger.error({ err: error }, 'Error during database disconnection');
  }
}

export function getDatabaseState(): { connected: boolean; readyState: number; readyStateText: string } {
  const readyState = mongoose.connection.readyState;
  const states: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  return {
    connected: readyState === 1,
    readyState,
    readyStateText: states[readyState] || 'unknown'
  };
}

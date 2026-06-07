const mongoose = require('mongoose');
const config = require('./config');

let redisClient = null;

async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, { dbName: config.mongoDb });
  console.log('MongoDB Atlas connected:', config.mongoDb);
}

async function connectRedis() {
  try {
    const { createClient } = require('redis');
    redisClient = createClient({
      url: config.redisUrl,
      socket: { connectTimeout: 2000, reconnectStrategy: false },
    });
    redisClient.on('error', () => {});
    await Promise.race([
      redisClient.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
    ]);
    console.log('Redis connected');
  } catch {
    redisClient = null;
    console.log('Redis unavailable – running without cache');
  }
}

async function cacheGet(key) {
  if (!redisClient?.isReady) return null;
  try { return await redisClient.get(key); } catch { return null; }
}

async function cacheSet(key, value, ttl = 300) {
  if (!redisClient?.isReady) return;
  try { await redisClient.setEx(key, ttl, JSON.stringify(value)); } catch {}
}

module.exports = { connectDB, connectRedis, cacheGet, cacheSet, mongoose };

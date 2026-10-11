require("dotenv").config();
process.env.JWT_SECRET = "test_jwt_secret_key_12345";
process.env.OPEN_API_KEY = process.env.OPEN_API_KEY || "sk-test-mock-key";
process.env.NODE_ENV = "test";

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

async function setupTestDB() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
}

async function clearTestDB() {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
}

async function closeTestDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongod) {
    await mongod.stop();
  }
  try {
    const reportQueue = require("../src/queues/report.queue");
    if (reportQueue) await reportQueue.close();
  } catch (_) {}
  try {
    const redis = require("../src/config/redis.config");
    if (redis && typeof redis.disconnect === "function") redis.disconnect();
  } catch (_) {}
}

module.exports = { setupTestDB, clearTestDB, closeTestDB };

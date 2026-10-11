const { Queue } = require("bullmq")

// ─── Report Generation Queue ─────────────────────────────────────────────────
// Reuses the same REDIS_URL already configured in .env for the Redis cache.

const reportQueue = new Queue("report-generation", {
    connection: {
        url: process.env.REDIS_URL || "redis://localhost:6379",
        maxRetriesPerRequest: null,
        connectTimeout: 2000
    },
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 5000 // 5s, 10s, 20s
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 }
    }
})

// Prevent uncaught error events if Redis connection is temporarily offline
reportQueue.on("error", (err) => {
    // BullMQ emits errors when connection fails
})

async function isQueueAvailable(timeoutMs = 1200) {
    try {
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Redis connection timeout")), timeoutMs)
        )
        await Promise.race([reportQueue.waitUntilReady(), timeout])
        return true
    } catch {
        return false
    }
}

reportQueue.isQueueAvailable = isQueueAvailable

module.exports = reportQueue


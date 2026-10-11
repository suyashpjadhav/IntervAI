const Redis = require("ioredis")

let redis = null

try {
    if (process.env.REDIS_URL) {
        redis = new Redis(process.env.REDIS_URL, {
            connectTimeout: 3000,
            maxRetriesPerRequest: 1,
            retryStrategy(times) {
                if (times > 3) {
                    return null // Stop retrying after 3 attempts
                }
                return Math.min(times * 1000, 3000)
            }
        })

        redis.on("error", (err) => {
            console.warn("Redis Connection Notice:", err.message)
        })
    }
} catch (error) {
    console.error("Failed to initialize Redis client:", error)
}

module.exports = redis

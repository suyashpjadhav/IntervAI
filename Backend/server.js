require("dotenv").config()
const app = require("./src/app")
const connectToDB = require("./src/config/database")
const puppeteerService = require("./src/services/puppeteer.service")

connectToDB()

let worker = null
if (process.env.AUTO_START_WORKER === "true") {
    const { createReportWorker } = require("./src/workers/report.worker")
    worker = createReportWorker()
    console.log("[Worker] In-server BullMQ worker started.")
}

const PORT = process.env.PORT || 3000
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})

async function gracefulShutdown(signal) {
    console.log(`Received ${signal}. Shutting down gracefully...`)
    
    server.close(async () => {
        console.log("HTTP server closed.")
        try {
            await puppeteerService.closeBrowser()
            console.log("Puppeteer browser closed.")
        } catch (err) {
            console.error("Error closing Puppeteer browser:", err.message)
        }

        if (worker) {
            try {
                await worker.close()
                console.log("BullMQ worker closed.")
            } catch (err) {
                console.error("Error closing BullMQ worker:", err.message)
            }
        }

        process.exit(0)
    })


    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => {
        console.error("Graceful shutdown timed out. Forcing exit.")
        process.exit(1)
    }, 10000)
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"))
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
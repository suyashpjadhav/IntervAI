const puppeteer = require("puppeteer")

let browserInstance = null
let launchPromise = null

/**
 * Retrieves the shared long-lived Puppeteer browser instance.
 * Launches a new instance if not yet started or if the current one disconnected.
 */
async function getBrowserInstance() {
    // If the browser is launched and active, return it
    if (browserInstance && browserInstance.connected) {
        return browserInstance
    }

    // If a launch process is already in progress, await the existing promise
    if (launchPromise) {
        return launchPromise
    }

    console.log("Launching new shared Puppeteer browser instance...")
    launchPromise = puppeteer.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu"
        ],
        ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {})
    }).then(browser => {
        browserInstance = browser
        launchPromise = null

        browser.on("disconnected", () => {
            console.warn("Shared Puppeteer browser disconnected.")
            browserInstance = null
        })

        return browserInstance
    }).catch(err => {
        launchPromise = null
        throw err
    })

    return launchPromise
}

/**
 * Gracefully closes the shared browser instance during shutdown.
 */
async function closeBrowser() {
    if (browserInstance) {
        await browserInstance.close()
        browserInstance = null
    }
}

module.exports = {
    getBrowserInstance,
    closeBrowser
}

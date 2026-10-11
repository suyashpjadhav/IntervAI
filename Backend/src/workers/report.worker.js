require("dotenv").config()
const { Worker } = require("bullmq")
const pdfParse = require("pdf-parse")
const connectToDB = require("../config/database")
const interviewReportModel = require("../models/interviewReport.model")
const { generateInterviewReport, generateResumeHtmlAndScore } = require("../services/ai.service")

// ─── Report Generation Worker ────────────────────────────────────────────────
// Run this process separately alongside the main server:
//   npm run worker (or node src/workers/report.worker.js)

async function processReportJob(job) {
    const { reportId } = job.data

    console.log(`[Worker] Processing report job ${job.id} for reportId: ${reportId}`)

    // 1. Mark as processing
    await interviewReportModel.findByIdAndUpdate(reportId, { status: "processing" })

    // 2. Load the stored report to retrieve the raw PDF buffer and inputs
    const report = await interviewReportModel.findById(reportId)
    if (!report) {
        throw new Error(`Report ${reportId} not found in database.`)
    }

    // 3. Re-parse PDF text from the stored binary buffer (if present)
    let resumeContent = report.resume || ""
    if (!resumeContent && report.originalResumeFile) {
        const pdfData = await pdfParse(report.originalResumeFile)
        resumeContent = pdfData.text
            .replace(/ï/g, "•")
            .replace(/§/g, "▪")
            .replace(/🕿/g, "📞")
            .replace(/\uFFFD/g, "")
    }

    const { selfDescription, jobDescription, selectedTemplate, originalResumeFontFamily, extractedUrls, preparationDays } = report

    // 4. Fire the two LLM calls in parallel
    const [interViewReportByAi, refinedResumeByAi] = await Promise.all([
        generateInterviewReport({
            resume: resumeContent,
            selfDescription,
            jobDescription,
            preparationDays: preparationDays || 7
        }),
        generateResumeHtmlAndScore({
            resume: resumeContent,
            selfDescription,
            jobDescription,
            template: selectedTemplate || "early",
            fontFamily: originalResumeFontFamily || "Arial, Helvetica, sans-serif",
            extractedUrls: extractedUrls || []
        })
    ])

    // 5. Double-Agent ATS Score Check
    const originalScore = interViewReportByAi.metadata?.matchScoreOriginal || 50
    let refinedScore = refinedResumeByAi.matchScoreRefined
    let isOriginalResumeOptimal = false

    if (refinedScore < originalScore) {
        refinedScore = originalScore
        isOriginalResumeOptimal = true
    }

    const reportMetadata = {
        ...(interViewReportByAi.metadata || {}),
        isOriginalResumeOptimal
    }

    // 6. Update the report with all generated fields and mark completed
    await interviewReportModel.findByIdAndUpdate(reportId, {
        resume: resumeContent,
        matchScore: refinedScore,
        matchScoreOriginal: originalScore,
        matchScoreRefined: refinedScore,
        refinedResumeHtml: refinedResumeByAi.html,
        refinedResumeData: refinedResumeByAi.data,
        title: interViewReportByAi.metadata?.title || "Tailored Position",
        projectQuestions: interViewReportByAi.projectQuestions,
        workExperienceQuestions: interViewReportByAi.workExperienceQuestions,
        behavioralQuestions: interViewReportByAi.behavioralQuestions,
        metadata: reportMetadata,
        skillGaps: interViewReportByAi.skillGaps,
        preparationPlan: interViewReportByAi.preparationPlan,
        status: "completed"
    })

    console.log(`[Worker] Report job ${job.id} completed successfully.`)
}

// ─── Worker Factory ──────────────────────────────────────────────────────────

function createReportWorker() {
    const worker = new Worker("report-generation", processReportJob, {
        connection: {
            url: process.env.REDIS_URL || "redis://localhost:6379",
            maxRetriesPerRequest: null
        },
        concurrency: 2 // process up to 2 reports simultaneously
    })

    worker.on("completed", (job) => {
        console.log(`[Worker] Job ${job.id} finished.`)
    })

    worker.on("failed", async (job, err) => {
        console.error(`[Worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message)
        // After all retries exhausted, mark report as failed
        const maxAttempts = job?.opts?.attempts || 3
        if (job && job.attemptsMade >= maxAttempts) {
            try {
                await interviewReportModel.findByIdAndUpdate(job.data.reportId, { status: "failed" })
                console.log(`[Worker] Marked report ${job.data.reportId} as failed.`)
            } catch (updateErr) {
                console.error(`[Worker] Could not update report status to failed:`, updateErr.message)
            }
        }
    })

    worker.on("error", (err) => {
        // Prevent crashing if Redis connection disconnects or reconnects
        console.warn("[Worker] Worker connection notice:", err.message)
    })

    return worker
}

// ─── Standalone Process Execution ────────────────────────────────────────────

if (require.main === module) {
    // 1. Connect to MongoDB
    connectToDB()

    // 2. Start the BullMQ worker
    const worker = createReportWorker()
    console.log("[Worker] Report generation worker started and listening for jobs...")

    // 3. Graceful shutdown handlers
    async function shutdown() {
        console.log("[Worker] Shutting down worker...")
        try {
            await worker.close()
        } catch (err) {
            console.error("[Worker] Error closing worker:", err.message)
        }
        process.exit(0)
    }

    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)
}

module.exports = {
    processReportJob,
    createReportWorker
}

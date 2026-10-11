const express = require("express")
const authMiddleware = require("../middlewares/auth.middleware")
const interviewController = require("../controllers/interview.controller")
const mockInterviewController = require("../controllers/mockInterview.controller")
const upload = require("../middlewares/file.middleware")

const interviewRouter = express.Router()



/**
 * @route POST /api/interview/
 * @description generate new interview report on the basis of user self description,resume pdf and job description.
 * @access private
 */
interviewRouter.post("/", authMiddleware.authUser, upload.single("resume"), interviewController.generateInterViewReportController)

/**
 * @route GET /api/interview/report/:interviewId
 * @description get interview report by interviewId.
 * @access private
 */
interviewRouter.get("/report/:interviewId", authMiddleware.authUser, interviewController.getInterviewReportByIdController)

/**
 * @route GET /api/interview/report/:reportId/status
 * @description Poll the processing status of a background report generation job.
 * @access private
 */
interviewRouter.get("/report/:reportId/status", authMiddleware.authUser, interviewController.getReportStatusController)

/**
 * @route GET /api/interview/report/:interviewId/original-resume
 * @description get the original resume file binary.
 * @access private
 */
interviewRouter.get("/report/:interviewId/original-resume", authMiddleware.authUser, interviewController.getOriginalResumeController)

/**
 * @route PATCH /api/interview/report/:reportId/plan
 * @description Update preparation plan task completion status.
 * @access private
 */
interviewRouter.patch("/report/:reportId/plan", authMiddleware.authUser, interviewController.updatePreparationPlanTaskController)


/**
 * @route GET /api/interview/
 * @description get all interview reports of logged in user.
 * @access private
 */
interviewRouter.get("/", authMiddleware.authUser, interviewController.getAllInterviewReportsController)


/**
 * @route GET /api/interview/resume/pdf
 * @description generate resume pdf on the basis of user self description, resume content and job description.
 * @access private
 */
interviewRouter.post("/resume/pdf/:interviewReportId", authMiddleware.authUser, interviewController.generateResumePdfController)


/**
 * @route POST /api/interview/resume/template/:interviewReportId
 * @description update resume template, regenerate HTML, and update refined ATS score.
 * @access private
 */
interviewRouter.post("/resume/template/:interviewReportId", authMiddleware.authUser, interviewController.changeResumeTemplateController)


// ─── Mock Interview Routes ─────────────────────────────────────────

/**
 * @route POST /api/interview/mock/start/:reportId
 * @description Start a new mock interview session.
 * @access private
 */
interviewRouter.post("/mock/start/:reportId", authMiddleware.authUser, mockInterviewController.startMockInterviewController)

/**
 * @route POST /api/interview/mock/message/:sessionId
 * @description Send candidate's message response and get follow-up or feedback.
 * @access private
 */
interviewRouter.post("/mock/message/:sessionId", authMiddleware.authUser, mockInterviewController.sendMessageController)

/**
 * @route POST /api/interview/mock/end/:sessionId
 * @description End the mock interview early and get feedback.
 * @access private
 */
interviewRouter.post("/mock/end/:sessionId", authMiddleware.authUser, mockInterviewController.endMockInterviewController)

/**
 * @route GET /api/interview/mock/sessions/:reportId
 * @description Get past mock sessions for a report.
 * @access private
 */
interviewRouter.get("/mock/sessions/:reportId", authMiddleware.authUser, mockInterviewController.getMockSessionsController)


module.exports = interviewRouter
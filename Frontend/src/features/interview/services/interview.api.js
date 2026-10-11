import axios from "axios";

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000",
    withCredentials: true,
})


/**
 * @description Service to generate interview report based on user self description, resume and job description.
 */
export const generateInterviewReport = async ({ jobDescription, selfDescription, resumeFile, template, preparationDays }) => {

    const formData = new FormData()
    formData.append("jobDescription", jobDescription)
    formData.append("selfDescription", selfDescription)
    if (template) {
        formData.append("template", template)
    }
    if (preparationDays) {
        formData.append("preparationDays", preparationDays)
    }
    // Only attach if the user actually picked a file — appending undefined sends the string "undefined"
    if (resumeFile instanceof File) {
        formData.append("resume", resumeFile)
    }

    const response = await api.post("/api/interview/", formData, {
        headers: {
            "Content-Type": "multipart/form-data"
        }
    })

    return response.data

}

/**
 * @description Poll the processing status of an in-progress background report job.
 */
export const getReportStatus = async (reportId) => {
    const response = await api.get(`/api/interview/report/${reportId}/status`)
    return response.data
}

/**
 * @description Service to change resume template.
 */
export const changeResumeTemplate = async ({ interviewReportId, template }) => {
    const response = await api.post(`/api/interview/resume/template/${interviewReportId}`, { template })
    return response.data
}


/**
 * @description Service to get interview report by interviewId.
 */
export const getInterviewReportById = async (interviewId) => {
    const response = await api.get(`/api/interview/report/${interviewId}`)

    return response.data
}


/**
 * @description Service to get all interview reports of logged in user.
 */
export const getAllInterviewReports = async () => {
    const response = await api.get("/api/interview/")

    return response.data
}


/**
 * @description Service to generate resume pdf based on user self description, resume content and job description.
 */
export const generateResumePdf = async ({ interviewReportId }) => {
    const response = await api.post(`/api/interview/resume/pdf/${interviewReportId}`, null, {
        responseType: "blob"
    })

    return response.data
}

/**
 * @description Service to get the original uploaded resume file as a blob.
 */
export const getOriginalResume = async (interviewId) => {
    const response = await api.get(`/api/interview/report/${interviewId}/original-resume`, {
        responseType: "blob"
    })

    return response.data
}

// ─── Mock Interview API Services ───────────────────────────────────

/**
 * @description Start a new mock interview session.
 */
export const startMockInterviewApi = async ({ reportId, totalQuestions }) => {
    const response = await api.post(`/api/interview/mock/start/${reportId}`, { totalQuestions })
    return response.data
}

/**
 * @description Submit candidate's answer and retrieve next question/feedback.
 */
export const submitCandidateAnswerApi = async ({ sessionId, message }) => {
    const response = await api.post(`/api/interview/mock/message/${sessionId}`, { message })
    return response.data
}

/**
 * @description Voluntarily end mock interview early.
 */
export const endMockInterviewApi = async ({ sessionId }) => {
    const response = await api.post(`/api/interview/mock/end/${sessionId}`)
    return response.data
}

/**
 * @description Retrieve all mock sessions linked to a report.
 */
export const getMockSessionsApi = async (reportId) => {
    const response = await api.get(`/api/interview/mock/sessions/${reportId}`)
    return response.data
}

/**
 * @description Service to update preparation plan task completion status.
 */
export const updatePreparationTaskApi = async ({ reportId, day, taskIndex, completed }) => {
    const response = await api.patch(`/api/interview/report/${reportId}/plan`, { day, taskIndex, completed })
    return response.data
}
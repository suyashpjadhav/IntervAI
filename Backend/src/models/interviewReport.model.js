const mongoose = require('mongoose');


const technicalQuestionSchema = new mongoose.Schema({
    question: {
        type: String,
        required: [ true, "Technical question is required" ]
    },
    intention: {
        type: String,
        required: [ true, "Intention is required" ]
    },
    answer: {
        type: String,
        required: [ true, "Answer is required" ]
    }
}, {
    _id: false
})

const behavioralQuestionSchema = new mongoose.Schema({
    question: {
        type: String,
        required: [ true, "Technical question is required" ]
    },
    intention: {
        type: String,
        required: [ true, "Intention is required" ]
    },
    answer: {
        type: String,
        required: [ true, "Answer is required" ]
    }
}, {
    _id: false
})

const skillGapSchema = new mongoose.Schema({
    skill: {
        type: String,
        required: [ true, "Skill is required" ]
    },
    severity: {
        type: String,
        enum: [ "low", "medium", "high" ],
        required: [ true, "Severity is required" ]
    }
}, {
    _id: false
})

const preparationPlanSchema = new mongoose.Schema({
    day: {
        type: Number,
        required: [ true, "Day is required" ]
    },
    focus: {
        type: String,
        required: [ true, "Focus is required" ]
    },
    tasks: [ {
        _id: false,
        description: {
            type: String,
            required: [ true, "Task description is required" ]
        },
        completed: {
            type: Boolean,
            default: false
        }
    } ]
})

const interviewReportSchema = new mongoose.Schema({
    jobDescription: {
        type: String,
        required: [ true, "Job description is required" ]
    },
    resume: {
        type: String,
    },
    originalResumeFile: {
        type: Buffer,
    },
    originalResumeFileType: {
        type: String,
    },
    originalResumeFontFamily: {
        type: String,
        default: "Arial, Helvetica, sans-serif"
    },
    extractedUrls: [ {
        type: String
    } ],
    selfDescription: {
        type: String,
    },
    matchScore: {
        type: Number,
        min: 0,
        max: 100,
    },
    matchScoreOriginal: {
        type: Number,
        min: 0,
        max: 100,
    },
    matchScoreRefined: {
        type: Number,
        min: 0,
        max: 100,
    },
    refinedResumeHtml: {
        type: String,
    },
    refinedResumeData: {
        type: Object,
    },
    selectedTemplate: {
        type: String,
        default: "early",
    },
    technicalQuestions: [ technicalQuestionSchema ],
    behavioralQuestions: [ mongoose.Schema.Types.Mixed ],
    projectQuestions: [ mongoose.Schema.Types.Mixed ],
    workExperienceQuestions: [ mongoose.Schema.Types.Mixed ],
    metadata: {
        type: Object,
    },
    preparationDays: {
        type: Number,
        default: 7
    },
    skillGaps: [ skillGapSchema ],
    preparationPlan: [ preparationPlanSchema ],
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users"
    },
    status: {
        type: String,
        enum: [ "pending", "processing", "completed", "failed" ],
        default: "completed"
    },
    title: {
        type: String,
        required: [ true, "Job title is required" ]
    }
}, {
    timestamps: true
})


const interviewReportModel = mongoose.model("InterviewReport", interviewReportSchema);

module.exports = interviewReportModel;  
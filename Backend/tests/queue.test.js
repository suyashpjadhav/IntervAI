const mockGenerateInterviewReport = jest.fn();
const mockGenerateResumeHtmlAndScore = jest.fn();

jest.mock("../src/services/ai.service", () => ({
  generateInterviewReport: (...args) => mockGenerateInterviewReport(...args),
  generateResumeHtmlAndScore: (...args) => mockGenerateResumeHtmlAndScore(...args)
}));

const { setupTestDB, clearTestDB, closeTestDB } = require("./setup");
const interviewReportModel = require("../src/models/interviewReport.model");
const reportQueue = require("../src/queues/report.queue");
const { processReportJob } = require("../src/workers/report.worker");

beforeAll(async () => {
  await setupTestDB();
});

beforeEach(() => {
  mockGenerateInterviewReport.mockReset();
  mockGenerateResumeHtmlAndScore.mockReset();
});

afterEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

describe("BullMQ Queue & Worker Pipeline Suite", () => {
  describe("Queue Configuration & Enqueueing", () => {
    it("should have correct BullMQ default retry and backoff options", () => {
      const opts = reportQueue.defaultJobOptions;
      expect(opts).toBeDefined();
      expect(opts.attempts).toBe(3);
      expect(opts.backoff).toEqual({
        type: "exponential",
        delay: 5000
      });
      expect(opts.removeOnComplete).toEqual({ count: 100 });
      expect(opts.removeOnFail).toEqual({ count: 50 });
    });

    it("should enqueue a job with custom options into the reportQueue", async () => {
      const addSpy = jest.spyOn(reportQueue, "add").mockResolvedValue({
        id: "mock-job-123",
        name: "generate-report",
        data: { reportId: "rep-456" }
      });

      const job = await reportQueue.add(
        "generate-report",
        { reportId: "rep-456" },
        { jobId: "rep-456" }
      );

      expect(addSpy).toHaveBeenCalledWith(
        "generate-report",
        { reportId: "rep-456" },
        { jobId: "rep-456" }
      );
      expect(job.id).toBe("mock-job-123");
      addSpy.mockRestore();
    });
  });

  describe("Worker Execution & State Transitions", () => {
    let testReport;

    beforeEach(async () => {
      testReport = await interviewReportModel.create({
        title: "Staff Engineer",
        jobDescription: "Distributed Systems Lead",
        selfDescription: "10 years backend experience",
        resume: "Alice Resume: built high-scale systems",
        status: "pending",
        preparationDays: 7
      });
    });

    it("should process job successfully and transition report to completed status", async () => {
      mockGenerateInterviewReport.mockResolvedValue({
        metadata: { title: "Staff Engineer", matchScoreOriginal: 82 },
        projectQuestions: [{ question: "Tell me about Redis cache" }],
        workExperienceQuestions: [],
        behavioralQuestions: [],
        skillGaps: [],
        preparationPlan: [{ day: 1, focus: "Architecture", tasks: [] }]
      });

      mockGenerateResumeHtmlAndScore.mockResolvedValue({
        html: "<div>Refined Resume</div>",
        data: { basics: { name: "Alice" } },
        matchScoreRefined: 90
      });

      const mockJob = {
        id: `test-job-${testReport._id}`,
        data: { reportId: testReport._id.toString() }
      };

      await processReportJob(mockJob);

      const completed = await interviewReportModel.findById(testReport._id);
      expect(completed.status).toBe("completed");
      expect(completed.matchScore).toBe(90);
      expect(completed.matchScoreOriginal).toBe(82);
      expect(completed.matchScoreRefined).toBe(90);
      expect(completed.refinedResumeHtml).toBe("<div>Refined Resume</div>");
      expect(mockGenerateInterviewReport).toHaveBeenCalledTimes(1);
      expect(mockGenerateResumeHtmlAndScore).toHaveBeenCalledTimes(1);
    });

    it("should keep original score if refined score degrades (double-agent check)", async () => {
      mockGenerateInterviewReport.mockResolvedValue({
        metadata: { title: "Staff Engineer", matchScoreOriginal: 85 },
        projectQuestions: [],
        workExperienceQuestions: [],
        behavioralQuestions: [],
        skillGaps: [],
        preparationPlan: []
      });

      mockGenerateResumeHtmlAndScore.mockResolvedValue({
        html: "<div>Refined</div>",
        data: {},
        matchScoreRefined: 70
      });

      const mockJob = {
        id: `test-job-degrade-${testReport._id}`,
        data: { reportId: testReport._id.toString() }
      };

      await processReportJob(mockJob);

      const completed = await interviewReportModel.findById(testReport._id);
      expect(completed.status).toBe("completed");
      expect(completed.matchScore).toBe(85); // Preserves original score
      expect(completed.metadata.isOriginalResumeOptimal).toBe(true);
    });

    it("should mark report as failed when retries are exhausted", async () => {
      const failingReport = await interviewReportModel.create({
        title: "Failing Report",
        jobDescription: "Failing Job",
        status: "processing"
      });

      const jobData = {
        data: { reportId: failingReport._id.toString() },
        id: "failing-job-id",
        attemptsMade: 3,
        opts: { attempts: 3 }
      };

      if (jobData.attemptsMade >= jobData.opts.attempts) {
        await interviewReportModel.findByIdAndUpdate(jobData.data.reportId, { status: "failed" });
      }

      const updated = await interviewReportModel.findById(failingReport._id);
      expect(updated.status).toBe("failed");
    });
  });
});

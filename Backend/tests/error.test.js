const { setupTestDB, clearTestDB, closeTestDB } = require("./setup");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const userModel = require("../src/models/user.model");
const interviewReportModel = require("../src/models/interviewReport.model");
const mockInterviewModel = require("../src/models/mockInterview.model");

// Mock OpenAI client to simulate rate limits and network errors
const mockChatCreate = jest.fn();
jest.mock("openai", () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: (...args) => mockChatCreate(...args)
      }
    }
  }));
});

let token;
let user;
let testReport;

beforeAll(async () => {
  await setupTestDB();
});

beforeEach(async () => {
  mockChatCreate.mockReset();

  user = await userModel.create({
    username: "erroruser",
    email: "error@example.com",
    password: "password123"
  });

  token = jwt.sign(
    { id: user._id.toString(), username: user.username },
    process.env.JWT_SECRET || "test_jwt_secret_key_12345",
    { expiresIn: "1d" }
  );

  testReport = await interviewReportModel.create({
    user: user._id,
    title: "SRE Lead",
    jobDescription: "High-scale Reliability Engineer",
    status: "completed"
  });
});

afterEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

describe("Error Handling & Rate-Limiting Resilience Suite", () => {
  describe("OpenAI Rate-Limit (429) & Auth (401) Failures", () => {
    it("should handle OpenAI 429 Rate Limit error gracefully without crashing the server", async () => {
      // Simulate OpenAI 429 Rate Limit Error
      const rateLimitErr = new Error("Rate limit reached for model gpt-4o-mini");
      rateLimitErr.status = 429;
      mockChatCreate.mockRejectedValue(rateLimitErr);

      // Start mock interview session
      const session = await mockInterviewModel.create({
        report: testReport._id,
        user: user._id,
        status: "ongoing",
        messages: [{ role: "interviewer", content: "Tell me about distributed tracing" }]
      });

      // Send candidate message which triggers OpenAI
      const res = await request(app)
        .post(`/api/interview/mock/message/${session._id}`)
        .set("Cookie", [`token=${token}`])
        .send({
          message: "We implemented OpenTelemetry spans across all microservices."
        });

      // The server must catch the error, respond with an error status (not crash), and stay alive
      expect([500, 429]).toContain(res.status);
      expect(res.body.message).toBeDefined();

      // Ensure the server is still running and responsive to subsequent requests
      const healthRes = await request(app)
        .get("/api/auth/get-me")
        .set("Cookie", [`token=${token}`]);

      expect(healthRes.status).toBe(200);
      expect(healthRes.body.user.username).toBe("erroruser");
    });

    it("should handle OpenAI 401 Invalid Key error without crashing the server", async () => {
      const authErr = new Error("Incorrect API key provided: sk-invalid***");
      authErr.status = 401;
      mockChatCreate.mockRejectedValue(authErr);

      const session = await mockInterviewModel.create({
        report: testReport._id,
        user: user._id,
        status: "ongoing",
        messages: [{ role: "interviewer", content: "Question 1" }]
      });

      const res = await request(app)
        .post(`/api/interview/mock/message/${session._id}`)
        .set("Cookie", [`token=${token}`])
        .send({ message: "My answer" });

      expect(res.status).toBe(500);

      // Verify server remains fully functional
      const followUp = await request(app)
        .get("/api/auth/get-me")
        .set("Cookie", [`token=${token}`]);

      expect(followUp.status).toBe(200);
    });
  });

  describe("Queue & Network Outage Resilience", () => {
    it("should gracefully handle Redis queue unavailability during report generation", async () => {
      const reportQueue = require("../src/queues/report.queue");
      
      // Simulate isQueueAvailable returning false (Redis offline)
      const availSpy = jest.spyOn(reportQueue, "isQueueAvailable").mockResolvedValue(false);

      const res = await request(app)
        .post("/api/interview/")
        .set("Cookie", [`token=${token}`])
        .field("selfDescription", "Dev")
        .field("jobDescription", "Job");

      // Controller falls back to in-process async processing and returns 202
      expect(res.status).toBe(202);
      expect(res.body.reportId).toBeDefined();

      availSpy.mockRestore();
    });
  });
});

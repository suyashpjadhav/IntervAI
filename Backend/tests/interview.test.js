const { setupTestDB, clearTestDB, closeTestDB } = require("./setup");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../src/app");
const userModel = require("../src/models/user.model");
const interviewReportModel = require("../src/models/interviewReport.model");

let token;
let user;

beforeAll(async () => {
  await setupTestDB();
});

beforeEach(async () => {
  user = await userModel.create({
    username: "reportuser",
    email: "report@example.com",
    password: "hashedpassword"
  });

  token = jwt.sign(
    { id: user._id.toString(), username: user.username },
    process.env.JWT_SECRET || "test_jwt_secret_key_12345",
    { expiresIn: "1d" }
  );
});

afterEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

describe("Resume Parsing & Interview Report Generation Suite", () => {
  describe("POST /api/interview/ (Enqueue Report Generation)", () => {
    it("should accept valid report generation request with PDF and return 202 with reportId", async () => {
      const fs = require("fs");
      const path = require("path");
      const validPdfBuffer = fs.readFileSync(
        path.join(__dirname, "../node_modules/pdf-parse/test/data/01-valid.pdf")
      );

      const res = await request(app)
        .post("/api/interview/")
        .set("Cookie", [`token=${token}`])
        .field("selfDescription", "Full Stack Engineer with 3 years experience")
        .field("jobDescription", "Senior React & Node.js Developer with distributed systems experience")
        .field("template", "early")
        .field("preparationDays", "7")
        .attach("resume", validPdfBuffer, "sample_resume.pdf");

      expect(res.status).toBe(202);
      expect(res.body.message).toBe("Report generation started.");
      expect(res.body.reportId).toBeDefined();

      const createdReport = await interviewReportModel.findById(res.body.reportId);
      expect(createdReport).not.toBeNull();
      expect(createdReport.user.toString()).toBe(user._id.toString());
      expect(["pending", "processing", "completed"]).toContain(createdReport.status);
    });

    it("should accept valid report generation request without file and return 202", async () => {
      const res = await request(app)
        .post("/api/interview/")
        .set("Cookie", [`token=${token}`])
        .field("selfDescription", "Backend Developer")
        .field("jobDescription", "Node.js Architect")
        .field("preparationDays", "5");

      expect(res.status).toBe(202);
      expect(res.body.reportId).toBeDefined();
    });

    it("should reject report generation when unauthenticated with 401", async () => {
      const res = await request(app)
        .post("/api/interview/")
        .field("selfDescription", "Unauthorized candidate")
        .field("jobDescription", "Any job");

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/interview/report/:reportId/status", () => {
    it("should return the processing status of a report", async () => {
      const report = await interviewReportModel.create({
        user: user._id,
        title: "Test Frontend Engineer",
        jobDescription: "React Developer",
        status: "processing"
      });

      const res = await request(app)
        .get(`/api/interview/report/${report._id}/status`)
        .set("Cookie", [`token=${token}`]);

      expect(res.status).toBe(200);
      expect(res.body.reportId).toBe(report._id.toString());
      expect(res.body.status).toBe("processing");
    });

    it("should return 404 for a non-existent report status query", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/interview/report/${fakeId}/status`)
        .set("Cookie", [`token=${token}`]);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Report not found.");
    });
  });

  describe("GET /api/interview/report/:interviewId", () => {
    it("should retrieve full interview report by id", async () => {
      const report = await interviewReportModel.create({
        user: user._id,
        title: "Full Stack Lead",
        jobDescription: "Node & React Lead",
        matchScore: 88,
        status: "completed"
      });

      const res = await request(app)
        .get(`/api/interview/report/${report._id}`)
        .set("Cookie", [`token=${token}`]);

      expect(res.status).toBe(200);
      expect(res.body.interviewReport).toBeDefined();
      expect(res.body.interviewReport.title).toBe("Full Stack Lead");
      expect(res.body.interviewReport.matchScore).toBe(88);
    });

    it("should return 404 when report does not exist", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/interview/report/${fakeId}`)
        .set("Cookie", [`token=${token}`]);

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/interview/ (List user reports)", () => {
    it("should return all reports belonging to the authenticated user", async () => {
      await interviewReportModel.create([
        { user: user._id, title: "Report 1", jobDescription: "Job 1" },
        { user: user._id, title: "Report 2", jobDescription: "Job 2" }
      ]);

      const res = await request(app)
        .get("/api/interview/")
        .set("Cookie", [`token=${token}`]);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.interviewReports)).toBe(true);
      expect(res.body.interviewReports.length).toBe(2);
    });
  });

  describe("PATCH /api/interview/report/:reportId/plan (Roadmap checklist)", () => {
    let reportWithPlan;

    beforeEach(async () => {
      reportWithPlan = await interviewReportModel.create({
        user: user._id,
        title: "Software Engineer",
        jobDescription: "Backend Developer",
        preparationPlan: [
          {
            day: 1,
            focus: "System Design Fundamentals",
            tasks: [
              { description: "Review CAP Theorem", completed: false },
              { description: "Study Distributed Caching", completed: false }
            ]
          }
        ]
      });
    });

    it("should toggle roadmap task completed status successfully", async () => {
      const res = await request(app)
        .patch(`/api/interview/report/${reportWithPlan._id}/plan`)
        .set("Cookie", [`token=${token}`])
        .send({
          day: 1,
          taskIndex: 0,
          completed: true
        });

      expect(res.status).toBe(200);
      expect(res.body.preparationPlan[0].tasks[0].completed).toBe(true);

      const updated = await interviewReportModel.findById(reportWithPlan._id);
      expect(updated.preparationPlan[0].tasks[0].completed).toBe(true);
    });

    it("should reject update when required fields are missing with 400", async () => {
      const res = await request(app)
        .patch(`/api/interview/report/${reportWithPlan._id}/plan`)
        .set("Cookie", [`token=${token}`])
        .send({ day: 1 }); // missing taskIndex, completed

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Missing required fields");
    });

    it("should reject update when taskIndex is out of bounds with 400", async () => {
      const res = await request(app)
        .patch(`/api/interview/report/${reportWithPlan._id}/plan`)
        .set("Cookie", [`token=${token}`])
        .send({
          day: 1,
          taskIndex: 99,
          completed: true
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("out of bounds");
    });
  });
});

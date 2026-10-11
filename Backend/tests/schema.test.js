const { setupTestDB, clearTestDB, closeTestDB } = require("./setup");
const mongoose = require("mongoose");
const { z } = require("zod");
const userModel = require("../src/models/user.model");
const interviewReportModel = require("../src/models/interviewReport.model");
const mockInterviewModel = require("../src/models/mockInterview.model");

// Schemas mirroring ai.service.js Zod validation definitions
const StrategicQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  referencedBullet: z.string(),
  interviewerMotive: z.string(),
  strategicAnswer: z.object({
    openingHook: z.string(),
    coreDefense: z.string(),
    preemptiveTradeoff: z.string(),
    keywordsToNail: z.array(z.string())
  })
});

const RefinedResumeSchema = z.object({
  basics: z.object({
    name: z.string(),
    email: z.string(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedin: z.string().optional(),
    github: z.string().optional(),
    portfolio: z.string().optional()
  }),
  summary: z.string(),
  workExperience: z.array(
    z.object({
      company: z.string(),
      role: z.string(),
      duration: z.string(),
      bullets: z.array(z.string())
    })
  ).optional(),
  projects: z.array(
    z.object({
      name: z.string(),
      technologies: z.array(z.string()).optional(),
      bullets: z.array(z.string())
    })
  ).optional(),
  skills: z.record(z.string(), z.array(z.string())).optional(),
  education: z.array(
    z.object({
      degree: z.string(),
      institution: z.string(),
      year: z.string()
    })
  ).optional()
});

beforeAll(async () => {
  await setupTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

describe("Schema Validation Suite (Zod & Mongoose)", () => {
  describe("Zod LLM Output Validation", () => {
    it("should accept valid LLM refined resume structure", () => {
      const validResume = {
        basics: {
          name: "Alice Engineer",
          email: "alice@example.com",
          phone: "+1-555-0199",
          location: "San Francisco, CA",
          github: "https://github.com/alice"
        },
        summary: "Staff Engineer experienced with distributed systems.",
        workExperience: [
          {
            company: "Tech Corp",
            role: "Senior Backend Engineer",
            duration: "2021 - Present",
            bullets: [
              "Designed high-throughput Kafka streaming pipelines.",
              "Reduced p99 query latency by 45% using Redis caching."
            ]
          }
        ],
        projects: [
          {
            name: "CloudQueue",
            technologies: ["Node.js", "Redis", "BullMQ"],
            bullets: ["Asynchronous job worker processing 10k ops/sec."]
          }
        ],
        skills: {
          languages: ["JavaScript", "TypeScript", "Python"],
          databases: ["MongoDB", "PostgreSQL", "Redis"]
        },
        education: [
          {
            degree: "B.S. in Computer Science",
            institution: "UC Berkeley",
            year: "2020"
          }
        ]
      };

      const result = RefinedResumeSchema.safeParse(validResume);
      expect(result.success).toBe(true);
    });

    it("should reject malformed LLM resume output missing required fields", () => {
      const malformedResume = {
        // missing basics and summary
        skills: { backend: ["Node.js"] }
      };

      const result = RefinedResumeSchema.safeParse(malformedResume);
      expect(result.success).toBe(false);
      expect(result.error.issues.length).toBeGreaterThan(0);
    });

    it("should accept valid LLM strategic interview question structure", () => {
      const validQuestion = {
        id: "proj-1",
        question: "Why did you choose Redis over RabbitMQ for this queue?",
        referencedBullet: "Designed distributed queue using Redis",
        interviewerMotive: "Assessing architectural trade-off reasoning",
        strategicAnswer: {
          openingHook: "We needed low-latency in-memory data structures.",
          coreDefense: "Redis provided atomic operations and native sorted sets.",
          preemptiveTradeoff: "While RabbitMQ offers advanced AMQP routing, our priority was throughput.",
          keywordsToNail: ["Atomicity", "In-Memory", "Backpressure"]
        }
      };

      const result = StrategicQuestionSchema.safeParse(validQuestion);
      expect(result.success).toBe(true);
    });

    it("should reject malformed LLM strategic question missing defense parameters", () => {
      const malformedQuestion = {
        id: "proj-2",
        question: "Tell me about your project",
        // missing interviewerMotive and strategicAnswer
        referencedBullet: "Built an app"
      };

      const result = StrategicQuestionSchema.safeParse(malformedQuestion);
      expect(result.success).toBe(false);
    });
  });

  describe("Mongoose Models Validation", () => {
    it("should reject interviewReport creation missing required jobDescription and title", async () => {
      const invalidReport = new interviewReportModel({
        selfDescription: "Some dev"
      });

      let err;
      try {
        await invalidReport.validate();
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.errors.jobDescription).toBeDefined();
      expect(err.errors.title).toBeDefined();
    });

    it("should reject interviewReport with an invalid status enum value", async () => {
      const invalidStatusReport = new interviewReportModel({
        title: "Dev",
        jobDescription: "Software Engineer",
        status: "unsupported_status"
      });

      let err;
      try {
        await invalidStatusReport.validate();
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.errors.status).toBeDefined();
    });

    it("should accept valid interviewReport document with preparationPlan and questions", async () => {
      const validReport = new interviewReportModel({
        title: "Senior Backend Engineer",
        jobDescription: "Distributed systems engineer needed",
        status: "pending",
        matchScore: 85,
        matchScoreOriginal: 72,
        matchScoreRefined: 85,
        preparationDays: 7,
        preparationPlan: [
          {
            day: 1,
            focus: "Concurrency & Locks",
            tasks: [
              { description: "Study optimistic locking in MongoDB", completed: false }
            ]
          }
        ]
      });

      const saved = await validReport.save();
      expect(saved._id).toBeDefined();
      expect(saved.status).toBe("pending");
      expect(saved.preparationPlan[0].tasks[0].description).toBe("Study optimistic locking in MongoDB");
    });

    it("should reject user creation missing email, username, or password", async () => {
      const invalidUser = new userModel({});

      let err;
      try {
        await invalidUser.validate();
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.errors.username).toBeDefined();
      expect(err.errors.email).toBeDefined();
      expect(err.errors.password).toBeDefined();
    });

    it("should reject mockInterview creation with invalid totalQuestions or status", async () => {
      const invalidMock = new mockInterviewModel({
        totalQuestions: 99, // only 5 or 10 allowed
        status: "archived" // only ongoing or completed allowed
      });

      let err;
      try {
        await invalidMock.validate();
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.errors.totalQuestions).toBeDefined();
      expect(err.errors.status).toBeDefined();
    });
  });
});

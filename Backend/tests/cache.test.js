const fs = require("fs");
const path = require("path");
const RedisMock = require("ioredis-mock");
const crypto = require("crypto");
const mockValidPdf = fs.readFileSync(path.join(__dirname, "../node_modules/pdf-parse/test/data/01-valid.pdf"));

// Mock puppeteer service to avoid launching Chrome during cache testing
jest.mock("../src/services/puppeteer.service", () => ({
  getBrowserInstance: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(),
      evaluate: jest.fn().mockResolvedValue(700),
      pdf: jest.fn().mockResolvedValue(mockValidPdf),
      close: jest.fn().mockResolvedValue()
    }),
    close: jest.fn().mockResolvedValue()
  }),
  closeBrowser: jest.fn().mockResolvedValue()
}));

const mockRedis = new RedisMock();
jest.mock("../src/config/redis.config", () => mockRedis);

// Mock OpenAI client in ai.service
const mockCreate = jest.fn();
jest.mock("openai", () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate
      }
    }
  }));
});

const { generateResumeHtmlAndScore } = require("../src/services/ai.service");

describe("Redis Caching Suite", () => {
  beforeEach(async () => {
    await mockRedis.flushall();
    mockCreate.mockReset();
  });

  afterAll(async () => {
    await mockRedis.quit();
  });

  it("should query OpenAI on cache miss and write result to Redis", async () => {
    // Return valid structured resume JSON and score
    mockCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                basics: { name: "Bob Developer", email: "bob@example.com" },
                summary: "Backend Engineer",
                workExperience: [],
                projects: [],
                skills: {},
                education: []
              })
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({ score: 92 })
            }
          }
        ]
      });

    const params = {
      resume: "Bob experience in Node.js",
      selfDescription: "Passionate developer",
      jobDescription: "Senior Node.js Engineer",
      template: "early",
      fontFamily: "Arial"
    };

    const result = await generateResumeHtmlAndScore(params);

    expect(result).toBeDefined();
    expect(result.data.basics.name).toBe("Bob Developer");
    expect(result.matchScoreRefined).toBe(92);
    expect(mockCreate).toHaveBeenCalledTimes(2); // 1 for resume, 1 for score

    // Verify key was written to Redis with sha256 hash
    const hashInput = JSON.stringify({
      resume: params.resume,
      selfDescription: params.selfDescription,
      jobDescription: params.jobDescription
    });
    const hash = crypto.createHash("sha256").update(hashInput).digest("hex");
    const cachedString = await mockRedis.get(`resume:${hash}`);
    expect(cachedString).not.toBeNull();

    const parsedCache = JSON.parse(cachedString);
    expect(parsedCache.data.basics.name).toBe("Bob Developer");
    expect(parsedCache.matchScoreRefined).toBe(92);
  });

  it("should hit Redis cache on repeated request and NOT call OpenAI again", async () => {
    const params = {
      resume: "Cached Developer experience",
      selfDescription: "Full stack engineer",
      jobDescription: "Staff React Engineer",
      template: "early",
      fontFamily: "Arial"
    };

    // Pre-populate the cache in Redis
    const hashInput = JSON.stringify({
      resume: params.resume,
      selfDescription: params.selfDescription,
      jobDescription: params.jobDescription
    });
    const hash = crypto.createHash("sha256").update(hashInput).digest("hex");
    const preCachedData = {
      data: {
        basics: { name: "Cached Candidate", email: "cached@example.com" },
        summary: "Staff Engineer from Cache",
        workExperience: [],
        projects: [],
        skills: {},
        education: []
      },
      matchScoreRefined: 95
    };

    await mockRedis.set(`resume:${hash}`, JSON.stringify(preCachedData), "EX", 86400);

    // Call function — should read from cache and bypass OpenAI
    const result = await generateResumeHtmlAndScore(params);

    expect(result).toBeDefined();
    expect(result.data.basics.name).toBe("Cached Candidate");
    expect(result.matchScoreRefined).toBe(95);

    // OpenAI create must NOT have been called
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("should reuse cached structured data when user switches resume template", async () => {
    const paramsTemplateA = {
      resume: "Switching templates test",
      selfDescription: "Dev",
      jobDescription: "Job",
      template: "early",
      fontFamily: "Arial"
    };

    const paramsTemplateB = {
      ...paramsTemplateA,
      template: "exptrack" // template changed
    };

    // Mock initial LLM response
    mockCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                basics: { name: "Template Switcher", email: "ts@example.com" },
                summary: "Versatile engineer",
                workExperience: [],
                projects: [],
                skills: {},
                education: []
              })
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ score: 88 }) } }]
      });

    // Request 1: with early template -> populates cache
    await generateResumeHtmlAndScore(paramsTemplateA);
    expect(mockCreate).toHaveBeenCalledTimes(2);

    // Request 2: with exptrack template -> hits cache!
    const resultB = await generateResumeHtmlAndScore(paramsTemplateB);
    expect(resultB.data.basics.name).toBe("Template Switcher");

    // OpenAI should still have only been called 2 times total (from request 1)
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});

const { setupTestDB, clearTestDB, closeTestDB } = require("./setup");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const userModel = require("../src/models/user.model");
const tokenBlacklistModel = require("../src/models/blacklist.model");

process.env.JWT_SECRET = "test_jwt_secret_key_12345";

beforeAll(async () => {
  await setupTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

describe("Auth & JWT Security Suite", () => {
  describe("POST /api/auth/register", () => {
    it("should register a new user successfully and return 201 with cookie", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          username: "testcandidate",
          email: "candidate@example.com",
          password: "SecurePassword123!"
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.username).toBe("testcandidate");
      expect(res.body.user.email).toBe("candidate@example.com");
      expect(res.headers["set-cookie"]).toBeDefined();

      const createdUser = await userModel.findOne({ email: "candidate@example.com" });
      expect(createdUser).not.toBeNull();
      expect(createdUser.password).not.toBe("SecurePassword123!"); // hashed
    });

    it("should reject registration when required fields are missing", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          username: "candidateonly"
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Please provide username, email and password");
    });

    it("should reject duplicate username or email with 400", async () => {
      await request(app)
        .post("/api/auth/register")
        .send({
          username: "uniqueuser",
          email: "unique@example.com",
          password: "password123"
        });

      const duplicateRes = await request(app)
        .post("/api/auth/register")
        .send({
          username: "uniqueuser",
          email: "different@example.com",
          password: "password123"
        });

      expect(duplicateRes.status).toBe(400);
      expect(duplicateRes.body.message).toContain("Account already exists");
    });
  });

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      await request(app)
        .post("/api/auth/register")
        .send({
          username: "logintest",
          email: "login@example.com",
          password: "Password123"
        });
    });

    it("should login with correct credentials and return 200 with JWT cookie", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: "login@example.com",
          password: "Password123"
        });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe("login@example.com");
      expect(res.headers["set-cookie"]).toBeDefined();
    });

    it("should reject login with wrong password with 400", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: "login@example.com",
          password: "WrongPassword"
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Email or password is incorrect");
    });

    it("should reject login for non-existent email with 400", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: "unknown@example.com",
          password: "Password123"
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("User does not exist");
    });
  });

  describe("Protected routes & JWT token verification (/api/auth/get-me)", () => {
    let validToken;
    let userId;

    beforeEach(async () => {
      const regRes = await request(app)
        .post("/api/auth/register")
        .send({
          username: "protecteduser",
          email: "protected@example.com",
          password: "Password123"
        });

      userId = regRes.body.user.id;
      const cookies = regRes.headers["set-cookie"][0];
      validToken = cookies.split(";")[0].replace("token=", "");
    });

    it("should grant access with a valid token in cookie", async () => {
      const res = await request(app)
        .get("/api/auth/get-me")
        .set("Cookie", [`token=${validToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe("protecteduser");
    });

    it("should reject requests without a token cookie with 401", async () => {
      const res = await request(app).get("/api/auth/get-me");

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Token not provided.");
    });

    it("should reject requests with an invalid/corrupted token with 401", async () => {
      const res = await request(app)
        .get("/api/auth/get-me")
        .set("Cookie", ["token=invalid_forged_token"]);

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Invalid token.");
    });

    it("should reject requests with an expired token with 401", async () => {
      const expiredToken = jwt.sign(
        { id: userId, username: "protecteduser" },
        process.env.JWT_SECRET,
        { expiresIn: "0s" }
      );

      const res = await request(app)
        .get("/api/auth/get-me")
        .set("Cookie", [`token=${expiredToken}`]);

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Invalid token.");
    });

    it("should reject a blacklisted token after logout with 401", async () => {
      const logoutRes = await request(app)
        .get("/api/auth/logout")
        .set("Cookie", [`token=${validToken}`]);

      expect(logoutRes.status).toBe(200);

      // Now attempt to access protected endpoint with the logged-out token
      const res = await request(app)
        .get("/api/auth/get-me")
        .set("Cookie", [`token=${validToken}`]);

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("token is invalid");
    });
  });
});

module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: false,
  restoreMocks: false,
  testTimeout: 30000,
  collectCoverageFrom: [
    "src/controllers/**/*.js",
    "src/middlewares/**/*.js",
    "src/models/**/*.js",
    "src/queues/**/*.js",
    "src/services/**/*.js",
    "src/workers/**/*.js"
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "text-summary", "lcov"]
};

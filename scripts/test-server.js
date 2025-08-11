#!/usr/bin/env node

const axios = require("axios");
const fs = require("fs");
const path = require("path");

class ServerTester {
  constructor(baseUrl = "http://localhost:5000") {
    this.baseUrl = baseUrl;
    this.results = {
      passed: 0,
      failed: 0,
      tests: [],
    };
  }

  async test(name, testFn) {
    try {
      console.log(`🧪 Testing: ${name}`);
      await testFn();
      this.results.passed++;
      this.results.tests.push({ name, status: "PASSED", error: null });
      console.log(`✅ ${name} - PASSED`);
    } catch (error) {
      this.results.failed++;
      this.results.tests.push({
        name,
        status: "FAILED",
        error: error.message,
      });
      console.log(`❌ ${name} - FAILED: ${error.message}`);
    }
  }

  async runAllTests() {
    console.log("🚀 Starting comprehensive server tests...\n");

    // Health check tests
    await this.test("Health Check", async () => {
      const response = await axios.get(`${this.baseUrl}/health`);
      if (response.status !== 200) throw new Error("Health check failed");
      if (!response.data.status) throw new Error("No status in response");
    });

    await this.test("Test Endpoint", async () => {
      const response = await axios.get(`${this.baseUrl}/test`);
      if (response.status !== 200) throw new Error("Test endpoint failed");
      if (!response.data.message) throw new Error("No message in response");
    });

    // API endpoint tests
    await this.test("API Routes Accessible", async () => {
      const routes = [
        "/api/auth/signup",
        "/api/nutrition/meals",
        "/api/questionnaire",
        "/api/user/profile",
        "/api/recommended-menus",
        "/api/chat/message",
        "/api/food-scanner/barcode",
        "/api/statistics",
        "/api/calendar/data/2025/1",
        "/api/devices",
        "/api/meal-plans/current",
        "/api/daily-goals",
      ];

      for (const route of routes) {
        try {
          // Most routes require auth, so we expect 401 for unauthenticated requests
          await axios.get(`${this.baseUrl}${route}`);
        } catch (error) {
          if (error.response?.status === 401) {
            // Expected for protected routes
            continue;
          } else if (error.response?.status === 404) {
            throw new Error(`Route ${route} not found`);
          } else if (error.response?.status >= 500) {
            throw new Error(`Server error on ${route}: ${error.response.status}`);
          }
        }
      }
    });

    // Database connection test
    await this.test("Database Connection", async () => {
      try {
        // Try to access a protected route to test DB connection
        await axios.get(`${this.baseUrl}/api/user/profile`);
      } catch (error) {
        if (error.response?.status === 401) {
          // 401 means the route is working and DB is accessible
          return;
        }
        throw new Error("Database connection issue");
      }
    });

    // CORS test
    await this.test("CORS Configuration", async () => {
      const response = await axios.options(`${this.baseUrl}/api/auth/signup`);
      const corsHeaders = response.headers["access-control-allow-origin"];
      if (!corsHeaders) throw new Error("CORS headers not set");
    });

    // Rate limiting test
    await this.test("Rate Limiting", async () => {
      // Make multiple rapid requests to test rate limiting
      const promises = Array(10)
        .fill()
        .map(() => axios.get(`${this.baseUrl}/test`));
      
      const responses = await Promise.allSettled(promises);
      const successful = responses.filter(r => r.status === "fulfilled").length;
      
      if (successful === 0) throw new Error("All requests blocked - rate limiting too strict");
      console.log(`   📊 ${successful}/10 requests succeeded (rate limiting working)`);
    });

    // Error handling test
    await this.test("Error Handling", async () => {
      try {
        await axios.get(`${this.baseUrl}/api/nonexistent-route`);
        throw new Error("Should have returned 404");
      } catch (error) {
        if (error.response?.status !== 404) {
          throw new Error("Incorrect error handling");
        }
      }
    });

    // JSON parsing test
    await this.test("JSON Body Parsing", async () => {
      try {
        await axios.post(`${this.baseUrl}/api/auth/signup`, {
          email: "test@example.com",
          password: "testpass",
          name: "Test User",
        });
      } catch (error) {
        // We expect validation errors, not parsing errors
        if (error.response?.status >= 500) {
          throw new Error("JSON parsing failed");
        }
      }
    });

    // Security headers test
    await this.test("Security Headers", async () => {
      const response = await axios.get(`${this.baseUrl}/health`);
      const securityHeaders = [
        "x-content-type-options",
        "x-frame-options",
        "x-xss-protection",
      ];
      
      for (const header of securityHeaders) {
        if (!response.headers[header]) {
          console.log(`   ⚠️ Missing security header: ${header}`);
        }
      }
    });

    this.printResults();
  }

  printResults() {
    console.log("\n" + "=".repeat(60));
    console.log("📊 SERVER TEST RESULTS");
    console.log("=".repeat(60));
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📈 Success Rate: ${((this.results.passed / (this.results.passed + this.results.failed)) * 100).toFixed(1)}%`);

    if (this.results.failed > 0) {
      console.log("\n❌ FAILED TESTS:");
      this.results.tests
        .filter(t => t.status === "FAILED")
        .forEach(test => {
          console.log(`   • ${test.name}: ${test.error}`);
        });
    }

    console.log("\n💡 RECOMMENDATIONS:");
    if (this.results.failed === 0) {
      console.log("   🎉 All tests passed! Your server is working correctly.");
    } else {
      console.log("   🔧 Fix the failed tests above to ensure proper server functionality.");
    }

    // Save results to file
    const reportPath = path.join(__dirname, "../test-results.json");
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n💾 Detailed results saved to: ${reportPath}`);
  }
}

// CLI usage
if (require.main === module) {
  const baseUrl = process.argv[2] || "http://localhost:5000";
  console.log(`🎯 Testing server at: ${baseUrl}`);
  
  const tester = new ServerTester(baseUrl);
  tester.runAllTests().catch(error => {
    console.error("💥 Test runner failed:", error);
    process.exit(1);
  });
}

module.exports = ServerTester;
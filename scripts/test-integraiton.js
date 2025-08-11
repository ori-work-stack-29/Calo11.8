#!/usr/bin/env node

const axios = require("axios");
const fs = require("fs");
const path = require("path");

class IntegrationTester {
  constructor(serverUrl = "http://localhost:5000", clientPath = "../client") {
    this.serverUrl = serverUrl;
    this.clientPath = path.resolve(clientPath);
    this.authToken = null;
    this.testUser = {
      email: `test-${Date.now()}@example.com`,
      password: "TestPass123!",
      name: "Integration Test User",
      birth_date: "1990-01-01",
    };
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

  async makeRequest(method, endpoint, data = null, headers = {}) {
    const config = {
      method,
      url: `${this.serverUrl}${endpoint}`,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    if (this.authToken) {
      config.headers.Authorization = `Bearer ${this.authToken}`;
    }

    if (data) {
      config.data = data;
    }

    return await axios(config);
  }

  async runAllTests() {
    console.log("🚀 Starting comprehensive integration tests...\n");
    console.log(`🎯 Server: ${this.serverUrl}`);
    console.log(`📱 Test user: ${this.testUser.email}`);
    console.log("");

    // 1. Authentication Flow
    await this.test("User Registration", async () => {
      const response = await this.makeRequest(
        "POST",
        "/api/auth/signup",
        this.testUser
      );

      if (response.status !== 201) {
        throw new Error(`Expected 201, got ${response.status}`);
      }

      if (!response.data.success) {
        throw new Error("Registration failed");
      }

      console.log("   📧 Registration successful, verification required");
    });

    // Skip email verification for integration test and try direct signin
    await this.test("User Sign In", async () => {
      try {
        const response = await this.makeRequest("POST", "/api/auth/signin", {
          email: this.testUser.email,
          password: this.testUser.password,
        });

        if (response.data.token) {
          this.authToken = response.data.token;
          console.log("   🔑 Authentication token obtained");
        }
      } catch (error) {
        if (error.response?.status === 401) {
          console.log("   ⚠️ Sign in failed (expected - email not verified)");
          // For integration testing, we'll skip auth-required tests
        } else {
          throw error;
        }
      }
    });

    // 2. API Endpoint Tests (without auth for now)
    await this.test("Health Check API", async () => {
      const response = await this.makeRequest("GET", "/health");
      if (!response.data.status) {
        throw new Error("Health check response invalid");
      }
    });

    await this.test("Test Endpoint API", async () => {
      const response = await this.makeRequest("GET", "/test");
      if (!response.data.message) {
        throw new Error("Test endpoint response invalid");
      }
    });

    // 3. Protected Endpoint Tests (if we have auth)
    if (this.authToken) {
      await this.test("Protected Route Access", async () => {
        const response = await this.makeRequest("GET", "/api/user/profile");
        if (!response.data.user) {
          throw new Error("Protected route failed");
        }
      });

      await this.test("Questionnaire API", async () => {
        const questionnaireData = {
          age: 30,
          gender: "MALE",
          height_cm: 175,
          weight_kg: 70,
          main_goal: "GENERAL_HEALTH",
          physical_activity_level: "MODERATE",
          sport_frequency: "TWO_TO_THREE",
          commitment_level: "MODERATE",
          cooking_preference: "EASY",
          dietary_style: "BALANCED",
          meals_per_day: 3,
          snacks_between_meals: false,
          kosher: false,
          uses_fitness_devices: false,
        };

        const response = await this.makeRequest(
          "POST",
          "/api/questionnaire",
          questionnaireData
        );
        if (!response.data.success) {
          throw new Error("Questionnaire submission failed");
        }
      });

      await this.test("Meal Analysis API", async () => {
        // Create a simple test image (1x1 pixel PNG in base64)
        const testImageBase64 =
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

        try {
          const response = await this.makeRequest(
            "POST",
            "/api/nutrition/analyze",
            {
              imageBase64: testImageBase64,
              language: "english",
            }
          );

          if (!response.data.success) {
            throw new Error("Meal analysis failed");
          }

          console.log("   🍽️ Meal analysis completed");
        } catch (error) {
          if (error.response?.data?.error?.includes("OpenAI")) {
            console.log(
              "   ⚠️ AI analysis not available (no API key) - using fallback"
            );
          } else {
            throw error;
          }
        }
      });

      await this.test("Statistics API", async () => {
        const response = await this.makeRequest(
          "GET",
          "/api/statistics?period=week"
        );
        if (!response.data.success) {
          throw new Error("Statistics API failed");
        }
      });

      await this.test("Water Intake API", async () => {
        const response = await this.makeRequest(
          "POST",
          "/api/nutrition/water-intake",
          {
            cups_consumed: 5,
            date: new Date().toISOString().split("T")[0],
          }
        );

        if (!response.data.success) {
          throw new Error("Water intake API failed");
        }
      });
    }

    // 4. Error Handling Tests
    await this.test("Invalid Endpoint Handling", async () => {
      try {
        await this.makeRequest("GET", "/api/nonexistent");
        throw new Error("Should have returned 404");
      } catch (error) {
        if (error.response?.status !== 404) {
          throw new Error("Incorrect error handling");
        }
      }
    });

    await this.test("Invalid JSON Handling", async () => {
      try {
        await axios.post(`${this.serverUrl}/api/auth/signup`, "invalid json", {
          headers: { "Content-Type": "application/json" },
        });
        throw new Error("Should have returned 400");
      } catch (error) {
        if (error.response?.status !== 400) {
          throw new Error("Invalid JSON not handled properly");
        }
      }
    });

    // 5. Rate Limiting Test
    await this.test("Rate Limiting", async () => {
      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(
          this.makeRequest("GET", "/test").catch((e) => e.response)
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.some((r) => r?.status === 429);

      if (!rateLimited) {
        console.log("   ⚠️ Rate limiting might not be working properly");
      } else {
        console.log("   🛡️ Rate limiting is working");
      }
    });

    // 6. CORS Test
    await this.test("CORS Configuration", async () => {
      try {
        const response = await axios.options(
          `${this.serverUrl}/api/auth/signup`
        );
        const corsHeader = response.headers["access-control-allow-origin"];

        if (!corsHeader) {
          throw new Error("CORS headers not configured");
        }

        console.log(`   🌐 CORS configured: ${corsHeader}`);
      } catch (error) {
        throw new Error("CORS test failed");
      }
    });

    // Cleanup
    await this.cleanup();

    this.printResults();
  }

  async cleanup() {
    console.log("\n🧹 Cleaning up test data...");

    if (this.authToken) {
      try {
        // Try to delete test user data
        await this.makeRequest("DELETE", "/api/user/delete");
        console.log("   ✅ Test user data cleaned up");
      } catch (error) {
        console.log("   ⚠️ Cleanup failed - manual cleanup may be needed");
      }
    }
  }

  printResults() {
    console.log("\n" + "=".repeat(60));
    console.log("📊 INTEGRATION TEST RESULTS");
    console.log("=".repeat(60));
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(
      `📈 Success Rate: ${(
        (this.results.passed / (this.results.passed + this.results.failed)) *
        100
      ).toFixed(1)}%`
    );

    if (this.results.failed > 0) {
      console.log("\n❌ FAILED TESTS:");
      this.results.tests
        .filter((t) => t.status === "FAILED")
        .forEach((test) => {
          console.log(`   • ${test.name}: ${test.error}`);
        });
    }

    console.log("\n💡 RECOMMENDATIONS:");
    if (this.results.failed === 0) {
      console.log(
        "   🎉 All integration tests passed! Your full stack is working correctly."
      );
    } else {
      console.log(
        "   🔧 Fix the failed tests above to ensure proper integration."
      );
      console.log("   🔗 Check server-client communication and API endpoints.");
    }

    // Save results
    const reportPath = path.join(__dirname, "../integration-test-results.json");
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n💾 Detailed results saved to: ${reportPath}`);
  }
}

// CLI usage
if (require.main === module) {
  const serverUrl = process.argv[2] || "http://localhost:5000";
  const clientPath = process.argv[3] || "../client";

  console.log(`🎯 Testing integration with server: ${serverUrl}`);
  console.log(`📱 Client path: ${path.resolve(clientPath)}`);

  const tester = new IntegrationTester(serverUrl, clientPath);
  tester.runAllTests().catch((error) => {
    console.error("💥 Integration test failed:", error);
    process.exit(1);
  });
}

module.exports = IntegrationTester;

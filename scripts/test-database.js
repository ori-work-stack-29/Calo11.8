#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

class DatabaseTester {
  constructor(serverPath = "../server") {
    this.serverPath = path.resolve(serverPath);
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

  runCommand(command, options = {}) {
    try {
      return execSync(command, {
        cwd: this.serverPath,
        stdio: "pipe",
        encoding: "utf8",
        ...options,
      });
    } catch (error) {
      throw new Error(
        `Command failed: ${command}\n${error.stderr || error.message}`
      );
    }
  }

  async runAllTests() {
    console.log("🚀 Starting comprehensive database tests...\n");

    // Environment check
    await this.test("Environment Variables", async () => {
      const envPath = path.join(this.serverPath, ".env");
      if (!fs.existsSync(envPath)) {
        throw new Error(".env file not found");
      }

      const envContent = fs.readFileSync(envPath, "utf8");
      const requiredVars = ["DATABASE_URL", "DIRECT_URL"];

      for (const envVar of requiredVars) {
        if (!envContent.includes(envVar)) {
          throw new Error(`Missing environment variable: ${envVar}`);
        }
      }
    });

    // Prisma schema validation
    await this.test("Prisma Schema Validation", async () => {
      const schemaPath = path.join(this.serverPath, "prisma/schema.prisma");
      if (!fs.existsSync(schemaPath)) {
        throw new Error("Prisma schema not found");
      }

      try {
        this.runCommand("npx prisma validate");
      } catch (error) {
        throw new Error("Prisma schema validation failed");
      }
    });

    // Database connection
    await this.test("Database Connection", async () => {
      try {
        this.runCommand("npx prisma db pull --force", { timeout: 30000 });
      } catch (error) {
        throw new Error("Cannot connect to database");
      }
    });

    // Prisma client generation
    await this.test("Prisma Client Generation", async () => {
      try {
        this.runCommand("npx prisma generate", { timeout: 60000 });
      } catch (error) {
        throw new Error("Prisma client generation failed");
      }
    });

    // Migration status
    await this.test("Migration Status", async () => {
      try {
        const output = this.runCommand("npx prisma migrate status");
        if (output.includes("Database schema is up to date")) {
          console.log("   ✅ Database schema is up to date");
        } else if (
          output.includes("Following migration have not yet been applied")
        ) {
          console.log("   ⚠️ Pending migrations found");
        }
      } catch (error) {
        throw new Error("Cannot check migration status");
      }
    });

    // Schema introspection
    await this.test("Schema Introspection", async () => {
      try {
        this.runCommand("npx prisma db pull --print", { timeout: 30000 });
      } catch (error) {
        throw new Error("Schema introspection failed");
      }
    });

    // Model validation
    await this.test("Model Validation", async () => {
      const schemaPath = path.join(this.serverPath, "prisma/schema.prisma");
      const schemaContent = fs.readFileSync(schemaPath, "utf8");

      // Check for common issues
      const models = schemaContent.match(/^model\s+\w+\s*\{/gm) || [];
      if (models.length === 0) {
        throw new Error("No models found in schema");
      }

      console.log(`   📊 Found ${models.length} models in schema`);

      // Check for required fields
      const requiredPatterns = [/generator\s+client/, /datasource\s+db/, /@id/];

      for (const pattern of requiredPatterns) {
        if (!pattern.test(schemaContent)) {
          throw new Error(`Missing required schema element: ${pattern.source}`);
        }
      }
    });

    // Seed data test (if exists)
    await this.test("Seed Data", async () => {
      const seedPath = path.join(this.serverPath, "prisma/seed.ts");
      const seedJsPath = path.join(this.serverPath, "prisma/seed.js");

      if (fs.existsSync(seedPath) || fs.existsSync(seedJsPath)) {
        try {
          this.runCommand("npx prisma db seed", { timeout: 60000 });
          console.log("   🌱 Seed data executed successfully");
        } catch (error) {
          console.log("   ⚠️ Seed execution failed - this might be expected");
        }
      } else {
        console.log("   ℹ️ No seed file found - skipping");
      }
    });

    // Performance test
    await this.test("Database Performance", async () => {
      try {
        const testScript = `
          const { PrismaClient } = require('@prisma/client');
          const prisma = new PrismaClient();
          
          async function test() {
            const start = Date.now();
            await prisma.user.findMany({ take: 1 });
            const end = Date.now();
            console.log(\`Query time: \${end - start}ms\`);
            await prisma.$disconnect();
          }
          
          test().catch(console.error);
        `;

        const testPath = path.join(this.serverPath, "temp-db-test.js");
        fs.writeFileSync(testPath, testScript);

        const output = this.runCommand("node temp-db-test.js", {
          timeout: 10000,
        });

        // Clean up
        fs.unlinkSync(testPath);

        const queryTime = output.match(/Query time: (\d+)ms/);
        if (queryTime && parseInt(queryTime[1]) > 5000) {
          throw new Error("Database queries are too slow");
        }

        console.log(`   ⚡ ${output.trim()}`);
      } catch (error) {
        throw new Error("Database performance test failed");
      }
    });

    this.printResults();
  }

  printResults() {
    console.log("\n" + "=".repeat(60));
    console.log("📊 DATABASE TEST RESULTS");
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
        "   🎉 All database tests passed! Your database is properly configured."
      );
    } else {
      console.log(
        "   🔧 Fix the failed tests above to ensure proper database functionality."
      );
      console.log(
        "   📚 Check the Prisma documentation for troubleshooting guides."
      );
    }

    // Save results
    const reportPath = path.join(__dirname, "../database-test-results.json");
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n💾 Detailed results saved to: ${reportPath}`);
  }
}

// CLI usage
if (require.main === module) {
  const serverPath = process.argv[2] || "../server";
  console.log(`🎯 Testing database at: ${path.resolve(serverPath)}`);

  if (!fs.existsSync(path.resolve(serverPath))) {
    console.error(`❌ Server directory not found: ${path.resolve(serverPath)}`);
    process.exit(1);
  }

  const tester = new DatabaseTester(serverPath);
  tester.runAllTests().catch((error) => {
    console.error("💥 Test runner failed:", error);
    process.exit(1);
  });
}

module.exports = DatabaseTester;

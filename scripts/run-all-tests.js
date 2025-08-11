#!/usr/bin/env node

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

class TestRunner {
  constructor() {
    this.scriptsPath = __dirname;
    this.results = {
      server: null,
      client: null,
      database: null,
      integration: null,
      prismaAnalysis: null,
    };
  }

  runScript(scriptName, args = []) {
    try {
      console.log(`🚀 Running ${scriptName}...`);
      const scriptPath = path.join(this.scriptsPath, scriptName);
      const command = `node "${scriptPath}" ${args.join(" ")}`;

      const output = execSync(command, {
        stdio: "inherit",
        encoding: "utf8",
        cwd: this.scriptsPath,
      });

      return { success: true, output };
    } catch (error) {
      console.error(`❌ ${scriptName} failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async runAllTests() {
    console.log("🎯 COMPREHENSIVE TEST SUITE");
    console.log("=".repeat(50));
    console.log(
      "Running all tests to ensure your application is working correctly\n"
    );

    const testSequence = [
      {
        name: "Database Tests",
        script: "test-database.js",
        args: ["../server"],
        description: "Testing database connection, schema, and Prisma setup",
      },
      {
        name: "Server Tests",
        script: "test-server.js",
        args: ["http://localhost:5000"],
        description:
          "Testing server endpoints, middleware, and API functionality",
      },
      {
        name: "Client Tests",
        script: "test-client.js",
        args: ["../client"],
        description:
          "Testing client configuration, dependencies, and build process",
      },
      {
        name: "Prisma Analysis",
        script: "enhanced-prisma-analyzer.js",
        args: ["../server", "../client"],
        description:
          "Analyzing Prisma schema usage and identifying unused models",
      },
      {
        name: "Integration Tests",
        script: "test-integration.js",
        args: ["http://localhost:5000", "../client"],
        description: "Testing full-stack integration and API workflows",
      },
    ];

    let totalPassed = 0;
    let totalFailed = 0;

    for (const test of testSequence) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`📋 ${test.name.toUpperCase()}`);
      console.log(`📝 ${test.description}`);
      console.log(`${"=".repeat(60)}`);

      const result = this.runScript(test.script, test.args);
      this.results[test.name.toLowerCase().replace(" ", "")] = result;

      if (result.success) {
        totalPassed++;
        console.log(`\n✅ ${test.name} completed successfully`);
      } else {
        totalFailed++;
        console.log(`\n❌ ${test.name} failed`);
      }
    }

    this.printFinalResults(totalPassed, totalFailed, testSequence.length);
  }

  printFinalResults(passed, failed, total) {
    console.log("\n" + "=".repeat(80));
    console.log("🏆 FINAL TEST RESULTS");
    console.log("=".repeat(80));

    console.log(`📊 Test Suites Summary:`);
    console.log(`   ✅ Passed: ${passed}/${total}`);
    console.log(`   ❌ Failed: ${failed}/${total}`);
    console.log(`   📈 Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

    console.log(`\n📋 Individual Results:`);
    Object.entries(this.results).forEach(([testName, result]) => {
      if (result) {
        const icon = result.success ? "✅" : "❌";
        console.log(
          `   ${icon} ${testName}: ${result.success ? "PASSED" : "FAILED"}`
        );
      }
    });

    console.log(`\n💡 OVERALL ASSESSMENT:`);
    if (failed === 0) {
      console.log("   🎉 EXCELLENT! All test suites passed.");
      console.log(
        "   🚀 Your application is ready for development/deployment."
      );
      console.log("   📈 All systems are functioning correctly.");
    } else if (failed <= 1) {
      console.log("   🟡 GOOD! Most tests passed with minor issues.");
      console.log(
        "   🔧 Fix the failing test suite to ensure full functionality."
      );
      console.log("   📋 Check the specific test results above for details.");
    } else if (failed <= 2) {
      console.log("   🟠 NEEDS ATTENTION! Multiple test suites failed.");
      console.log("   🛠️  Significant issues need to be addressed.");
      console.log("   📚 Review documentation and fix failing components.");
    } else {
      console.log("   🔴 CRITICAL ISSUES! Most test suites failed.");
      console.log("   🚨 Major problems need immediate attention.");
      console.log("   🔧 Consider reviewing your setup from the beginning.");
    }

    console.log(`\n📁 DETAILED REPORTS:`);
    const reportFiles = [
      "database-test-results.json",
      "test-results.json",
      "client-test-results.json",
      "comprehensive-prisma-analysis.json",
      "integration-test-results.json",
    ];

    reportFiles.forEach((file) => {
      const filePath = path.join(__dirname, "..", file);
      if (fs.existsSync(filePath)) {
        console.log(`   📄 ${file}`);
      }
    });

    console.log(`\n🔧 NEXT STEPS:`);
    if (failed > 0) {
      console.log("   1. Review the failed test details above");
      console.log("   2. Check the detailed report files for more information");
      console.log("   3. Fix the issues and re-run the tests");
      console.log("   4. Ensure your .env files are properly configured");
      console.log("   5. Verify your database connection and schema");
    } else {
      console.log("   1. Your application is ready for development!");
      console.log("   2. Consider setting up CI/CD with these tests");
      console.log("   3. Run tests regularly during development");
      console.log(
        "   4. Review the Prisma analysis for optimization opportunities"
      );
    }

    console.log("\n" + "=".repeat(80));
  }
}

// CLI usage
if (require.main === module) {
  const runner = new TestRunner();
  runner.runAllTests().catch((error) => {
    console.error("💥 Test runner failed:", error);
    process.exit(1);
  });
}

module.exports = TestRunner;

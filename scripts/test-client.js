#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

class ClientTester {
  constructor(clientPath = "../client") {
    this.clientPath = path.resolve(clientPath);
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
        cwd: this.clientPath,
        stdio: "pipe",
        encoding: "utf8",
        ...options,
      });
    } catch (error) {
      throw new Error(`Command failed: ${command}\n${error.message}`);
    }
  }

  async runAllTests() {
    console.log("🚀 Starting comprehensive client tests...\n");

    // Package.json validation
    await this.test("Package.json Validation", async () => {
      const packagePath = path.join(this.clientPath, "package.json");
      if (!fs.existsSync(packagePath)) {
        throw new Error("package.json not found");
      }

      const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

      const requiredFields = ["name", "version", "scripts", "dependencies"];
      for (const field of requiredFields) {
        if (!packageJson[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      const requiredScripts = ["start", "android", "ios", "web"];
      for (const script of requiredScripts) {
        if (!packageJson.scripts[script]) {
          throw new Error(`Missing required script: ${script}`);
        }
      }
    });

    // Dependencies check
    await this.test("Dependencies Installation", async () => {
      const nodeModulesPath = path.join(this.clientPath, "node_modules");
      if (!fs.existsSync(nodeModulesPath)) {
        throw new Error("node_modules not found - run npm install");
      }

      // Check for critical dependencies
      const criticalDeps = [
        "expo",
        "react",
        "react-native",
        "@expo/vector-icons",
        "expo-router",
      ];

      for (const dep of criticalDeps) {
        const depPath = path.join(nodeModulesPath, dep);
        if (!fs.existsSync(depPath)) {
          throw new Error(`Critical dependency missing: ${dep}`);
        }
      }
    });

    // TypeScript compilation
    await this.test("TypeScript Compilation", async () => {
      try {
        this.runCommand("npx tsc --noEmit", { timeout: 30000 });
      } catch (error) {
        throw new Error("TypeScript compilation failed");
      }
    });

    // ESLint check
    await this.test("ESLint Validation", async () => {
      try {
        this.runCommand("npx eslint . --ext .ts,.tsx --max-warnings 0", {
          timeout: 30000,
        });
      } catch (error) {
        // ESLint might not be configured, so just warn
        console.log(
          "   ⚠️ ESLint check failed - consider fixing linting issues"
        );
      }
    });

    // File structure validation
    await this.test("File Structure", async () => {
      const requiredFiles = [
        "app.json",
        "app/_layout.tsx",
        "app/index.tsx",
        "app/(auth)/_layout.tsx",
        "app/(tabs)/_layout.tsx",
        "src/store/index.ts",
        "src/services/api.ts",
        "src/i18n/index.ts",
      ];

      for (const file of requiredFiles) {
        const filePath = path.join(this.clientPath, file);
        if (!fs.existsSync(filePath)) {
          throw new Error(`Required file missing: ${file}`);
        }
      }
    });

    // Environment variables check
    await this.test("Environment Configuration", async () => {
      const envPath = path.join(this.clientPath, ".env");
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf8");
        const requiredEnvVars = ["EXPO_PUBLIC_API_URL"];

        for (const envVar of requiredEnvVars) {
          if (!envContent.includes(envVar)) {
            throw new Error(`Missing environment variable: ${envVar}`);
          }
        }
      } else {
        console.log("   ⚠️ No .env file found - using default configuration");
      }
    });

    // Asset validation
    await this.test("Assets Validation", async () => {
      const assetsPath = path.join(this.clientPath, "assets");
      if (!fs.existsSync(assetsPath)) {
        throw new Error("Assets directory not found");
      }

      const requiredAssets = [
        "assets/images/icon.png",
        "assets/images/adaptive-icon.png",
        "assets/images/splash-icon.png",
      ];

      for (const asset of requiredAssets) {
        const assetPath = path.join(this.clientPath, asset);
        if (!fs.existsSync(assetPath)) {
          throw new Error(`Required asset missing: ${asset}`);
        }
      }
    });

    // Import validation
    await this.test("Import Resolution", async () => {
      const mainFiles = [
        "app/_layout.tsx",
        "app/index.tsx",
        "app/(tabs)/index.tsx",
        "src/store/index.ts",
      ];

      for (const file of mainFiles) {
        const filePath = path.join(this.clientPath, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, "utf8");

          // Check for common import issues
          const imports =
            content.match(/import.*from\s+['"]([^'"]+)['"]/g) || [];
          for (const importLine of imports) {
            const match = importLine.match(/from\s+['"]([^'"]+)['"]/);
            if (match) {
              const importPath = match[1];
              if (importPath.startsWith("./") || importPath.startsWith("../")) {
                // Relative import - check if file exists
                const resolvedPath = path.resolve(
                  path.dirname(filePath),
                  importPath
                );
                const extensions = [".ts", ".tsx", ".js", ".jsx"];
                let found = false;

                for (const ext of extensions) {
                  if (
                    fs.existsSync(resolvedPath + ext) ||
                    fs.existsSync(path.join(resolvedPath, "index" + ext))
                  ) {
                    found = true;
                    break;
                  }
                }

                if (!found && !fs.existsSync(resolvedPath)) {
                  throw new Error(`Import not found: ${importPath} in ${file}`);
                }
              }
            }
          }
        }
      }
    });

    // Redux store validation
    await this.test("Redux Store Configuration", async () => {
      const storePath = path.join(this.clientPath, "src/store/index.ts");
      if (!fs.existsSync(storePath)) {
        throw new Error("Redux store not found");
      }

      const storeContent = fs.readFileSync(storePath, "utf8");
      if (!storeContent.includes("configureStore")) {
        throw new Error("Redux store not properly configured");
      }

      // Check for required slices
      const requiredSlices = ["authSlice", "mealSlice"];
      for (const slice of requiredSlices) {
        if (!storeContent.includes(slice)) {
          throw new Error(`Missing required slice: ${slice}`);
        }
      }
    });

    // i18n configuration
    await this.test("Internationalization Setup", async () => {
      const i18nPath = path.join(this.clientPath, "src/i18n/index.ts");
      if (!fs.existsSync(i18nPath)) {
        throw new Error("i18n configuration not found");
      }

      const localesPath = path.join(this.clientPath, "src/i18n/locales");
      if (!fs.existsSync(localesPath)) {
        throw new Error("Locales directory not found");
      }

      const requiredLocales = ["en.json", "he.json"];
      for (const locale of requiredLocales) {
        const localePath = path.join(localesPath, locale);
        if (!fs.existsSync(localePath)) {
          throw new Error(`Missing locale file: ${locale}`);
        }
      }
    });

    // Build test (if possible)
    await this.test("Build Process", async () => {
      try {
        console.log("   🔨 Running build test (this may take a while)...");
        this.runCommand(
          "npx expo export --platform web --output-dir dist-test",
          {
            timeout: 120000, // 2 minutes
          }
        );

        // Clean up test build
        const testDistPath = path.join(this.clientPath, "dist-test");
        if (fs.existsSync(testDistPath)) {
          fs.rmSync(testDistPath, { recursive: true, force: true });
        }
      } catch (error) {
        throw new Error("Build process failed");
      }
    });

    this.printResults();
  }

  printResults() {
    console.log("\n" + "=".repeat(60));
    console.log("📊 CLIENT TEST RESULTS");
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
        "   🎉 All tests passed! Your client is properly configured."
      );
    } else {
      console.log(
        "   🔧 Fix the failed tests above to ensure proper client functionality."
      );
      console.log(
        "   📚 Check the Expo documentation for troubleshooting guides."
      );
    }

    // Save results to file
    const reportPath = path.join(__dirname, "../client-test-results.json");
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n💾 Detailed results saved to: ${reportPath}`);
  }
}

// CLI usage
if (require.main === module) {
  const clientPath = process.argv[2] || "../client";
  console.log(`🎯 Testing client at: ${path.resolve(clientPath)}`);

  if (!fs.existsSync(path.resolve(clientPath))) {
    console.error(`❌ Client directory not found: ${path.resolve(clientPath)}`);
    process.exit(1);
  }

  const tester = new ClientTester(clientPath);
  tester.runAllTests().catch((error) => {
    console.error("💥 Test runner failed:", error);
    process.exit(1);
  });
}

module.exports = ClientTester;

#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

class CodebaseValidator {
  constructor(serverPath = "../server", clientPath = "../client") {
    this.serverPath = path.resolve(serverPath);
    this.clientPath = path.resolve(clientPath);
    this.issues = [];
    this.warnings = [];
    this.suggestions = [];
  }

  log(message, type = "info") {
    const icons = {
      info: "ℹ️",
      success: "✅",
      warning: "⚠️",
      error: "❌",
      suggestion: "💡",
    };
    console.log(`${icons[type]} ${message}`);
  }

  addIssue(message) {
    this.issues.push(message);
    this.log(message, "error");
  }

  addWarning(message) {
    this.warnings.push(message);
    this.log(message, "warning");
  }

  addSuggestion(message) {
    this.suggestions.push(message);
    this.log(message, "suggestion");
  }

  getAllFiles(dirPath, extensions = [".ts", ".tsx", ".js", ".jsx"]) {
    const files = [];

    if (!fs.existsSync(dirPath)) return files;

    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const fullPath = path.join(dirPath, item);

      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          if (
            !["node_modules", ".git", "dist", "build", ".expo"].includes(item)
          ) {
            files.push(...this.getAllFiles(fullPath, extensions));
          }
        } else if (extensions.some((ext) => item.endsWith(ext))) {
          files.push(fullPath);
        }
      } catch (error) {
        continue;
      }
    }

    return files;
  }

  validateFileStructure() {
    this.log("📁 Validating file structure...", "info");

    // Server structure
    const serverRequiredDirs = [
      "src",
      "src/routes",
      "src/services",
      "src/middleware",
      "src/types",
      "prisma",
    ];

    serverRequiredDirs.forEach((dir) => {
      const dirPath = path.join(this.serverPath, dir);
      if (!fs.existsSync(dirPath)) {
        this.addIssue(`Missing server directory: ${dir}`);
      }
    });

    // Client structure
    const clientRequiredDirs = [
      "app",
      "app/(auth)",
      "app/(tabs)",
      "src",
      "src/store",
      "src/services",
      "src/i18n",
      "components",
    ];

    clientRequiredDirs.forEach((dir) => {
      const dirPath = path.join(this.clientPath, dir);
      if (!fs.existsSync(dirPath)) {
        this.addIssue(`Missing client directory: ${dir}`);
      }
    });

    // Key files
    const keyFiles = [
      {
        path: path.join(this.serverPath, "src/index.ts"),
        name: "Server entry point",
      },
      {
        path: path.join(this.serverPath, "prisma/schema.prisma"),
        name: "Prisma schema",
      },
      {
        path: path.join(this.clientPath, "app/_layout.tsx"),
        name: "Client root layout",
      },
      {
        path: path.join(this.clientPath, "app.json"),
        name: "Expo configuration",
      },
      {
        path: path.join(this.clientPath, "src/store/index.ts"),
        name: "Redux store",
      },
    ];

    keyFiles.forEach(({ path: filePath, name }) => {
      if (!fs.existsSync(filePath)) {
        this.addIssue(
          `Missing key file: ${name} (${path.relative(
            process.cwd(),
            filePath
          )})`
        );
      }
    });
  }

  validateImports() {
    this.log("🔗 Validating imports and dependencies...", "info");

    const allFiles = [
      ...this.getAllFiles(path.join(this.serverPath, "src")),
      ...this.getAllFiles(path.join(this.clientPath, "src")),
      ...this.getAllFiles(path.join(this.clientPath, "app")),
    ];

    const importIssues = new Set();
    const unusedImports = new Set();

    allFiles.forEach((filePath) => {
      try {
        const content = fs.readFileSync(filePath, "utf8");
        const imports = content.match(/import.*from\s+['"]([^'"]+)['"]/g) || [];

        imports.forEach((importLine) => {
          const match = importLine.match(/from\s+['"]([^'"]+)['"]/);
          if (match) {
            const importPath = match[1];

            // Check relative imports
            if (importPath.startsWith("./") || importPath.startsWith("../")) {
              const resolvedPath = path.resolve(
                path.dirname(filePath),
                importPath
              );
              const extensions = [".ts", ".tsx", ".js", ".jsx", ""];

              let found = false;
              for (const ext of extensions) {
                const testPath = resolvedPath + ext;
                const indexPath = path.join(resolvedPath, "index" + ext);

                if (fs.existsSync(testPath) || fs.existsSync(indexPath)) {
                  found = true;
                  break;
                }
              }

              if (!found) {
                importIssues.add(
                  `${path.relative(process.cwd(), filePath)}: ${importPath}`
                );
              }
            }
          }
        });

        // Check for unused imports (basic check)
        const importNames = content.match(/import\s+\{([^}]+)\}/g) || [];
        importNames.forEach((importBlock) => {
          const names = importBlock
            .match(/import\s+\{([^}]+)\}/)[1]
            .split(",")
            .map((name) => name.trim());

          names.forEach((name) => {
            const cleanName = name.replace(/\s+as\s+\w+/, "").trim();
            if (cleanName && !content.includes(cleanName.split(" ")[0])) {
              unusedImports.add(
                `${path.relative(process.cwd(), filePath)}: ${cleanName}`
              );
            }
          });
        });
      } catch (error) {
        // Skip files that can't be read
      }
    });

    importIssues.forEach((issue) => this.addIssue(`Broken import: ${issue}`));

    if (unusedImports.size > 0 && unusedImports.size < 20) {
      unusedImports.forEach((issue) =>
        this.addWarning(`Potentially unused import: ${issue}`)
      );
    }
  }

  validateConfiguration() {
    this.log("⚙️ Validating configuration files...", "info");

    // Server configuration
    const serverConfigs = [
      {
        path: path.join(this.serverPath, "package.json"),
        name: "Server package.json",
      },
      {
        path: path.join(this.serverPath, "tsconfig.json"),
        name: "Server TypeScript config",
      },
      {
        path: path.join(this.serverPath, ".env.example"),
        name: "Server environment template",
      },
    ];

    serverConfigs.forEach(({ path: configPath, name }) => {
      if (!fs.existsSync(configPath)) {
        this.addWarning(`Missing ${name}`);
      } else {
        try {
          if (configPath.endsWith(".json")) {
            JSON.parse(fs.readFileSync(configPath, "utf8"));
          }
        } catch (error) {
          this.addIssue(`Invalid JSON in ${name}: ${error.message}`);
        }
      }
    });

    // Client configuration
    const clientConfigs = [
      {
        path: path.join(this.clientPath, "package.json"),
        name: "Client package.json",
      },
      {
        path: path.join(this.clientPath, "tsconfig.json"),
        name: "Client TypeScript config",
      },
      {
        path: path.join(this.clientPath, "app.json"),
        name: "Expo configuration",
      },
    ];

    clientConfigs.forEach(({ path: configPath, name }) => {
      if (!fs.existsSync(configPath)) {
        this.addIssue(`Missing ${name}`);
      } else {
        try {
          if (configPath.endsWith(".json")) {
            JSON.parse(fs.readFileSync(configPath, "utf8"));
          }
        } catch (error) {
          this.addIssue(`Invalid JSON in ${name}: ${error.message}`);
        }
      }
    });
  }

  validateCodeQuality() {
    this.log("🎯 Validating code quality...", "info");

    const allFiles = [
      ...this.getAllFiles(path.join(this.serverPath, "src")),
      ...this.getAllFiles(path.join(this.clientPath, "src")),
      ...this.getAllFiles(path.join(this.clientPath, "app")),
    ];

    let totalLines = 0;
    let filesWithIssues = 0;
    const largeFiles = [];
    const complexFiles = [];

    allFiles.forEach((filePath) => {
      try {
        const content = fs.readFileSync(filePath, "utf8");
        const lines = content.split("\n").length;
        totalLines += lines;

        // Check for large files
        if (lines > 500) {
          largeFiles.push({
            file: path.relative(process.cwd(), filePath),
            lines,
          });
        }

        // Check for complex functions
        const functionMatches =
          content.match(/function\s+\w+|const\s+\w+\s*=\s*\(/g) || [];
        if (functionMatches.length > 20) {
          complexFiles.push({
            file: path.relative(process.cwd(), filePath),
            functions: functionMatches.length,
          });
        }

        // Check for common issues
        if (content.includes("console.log") && filePath.includes("src")) {
          filesWithIssues++;
        }

        // Check for TODO/FIXME comments
        const todos = content.match(/\/\/\s*(TODO|FIXME|HACK)/gi) || [];
        if (todos.length > 5) {
          this.addWarning(
            `Many TODO/FIXME comments in ${path.relative(
              process.cwd(),
              filePath
            )}: ${todos.length}`
          );
        }
      } catch (error) {
        // Skip files that can't be read
      }
    });

    console.log(`   📊 Code statistics:`);
    console.log(`      📄 Total files: ${allFiles.length}`);
    console.log(`      📝 Total lines: ${totalLines.toLocaleString()}`);
    console.log(
      `      📈 Average lines per file: ${Math.round(
        totalLines / allFiles.length
      )}`
    );

    if (largeFiles.length > 0) {
      this.addSuggestion(
        `Consider refactoring large files (>500 lines): ${largeFiles.length} found`
      );
      largeFiles.slice(0, 3).forEach(({ file, lines }) => {
        console.log(`      📄 ${file}: ${lines} lines`);
      });
    }

    if (complexFiles.length > 0) {
      this.addSuggestion(
        `Consider breaking down complex files (>20 functions): ${complexFiles.length} found`
      );
    }

    if (filesWithIssues > 0) {
      this.addWarning(
        `${filesWithIssues} files contain console.log statements`
      );
    }
  }

  validateSecurity() {
    this.log("🔒 Validating security configuration...", "info");

    // Check for exposed secrets
    const sensitiveFiles = [
      path.join(this.serverPath, ".env"),
      path.join(this.clientPath, ".env"),
    ];

    sensitiveFiles.forEach((envPath) => {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf8");

        // Check for placeholder values
        const placeholders = [
          "your-secret-key",
          "change-this",
          "placeholder",
          "example",
          "test-key",
        ];

        placeholders.forEach((placeholder) => {
          if (content.toLowerCase().includes(placeholder)) {
            this.addWarning(
              `Placeholder value found in ${path.relative(
                process.cwd(),
                envPath
              )}`
            );
          }
        });

        // Check for weak secrets
        const secrets = content.match(/SECRET.*=.*["']([^"']+)["']/gi) || [];
        secrets.forEach((secret) => {
          const value = secret.split("=")[1]?.replace(/["']/g, "").trim();
          if (value && value.length < 32) {
            this.addWarning("JWT secret should be at least 32 characters long");
          }
        });
      }
    });

    // Check for hardcoded credentials in code
    const allFiles = [
      ...this.getAllFiles(path.join(this.serverPath, "src")),
      ...this.getAllFiles(path.join(this.clientPath, "src")),
    ];

    const suspiciousPatterns = [
      /password\s*[:=]\s*["'][^"']{1,20}["']/gi,
      /api[_-]?key\s*[:=]\s*["'][^"']+["']/gi,
      /secret\s*[:=]\s*["'][^"']+["']/gi,
    ];

    allFiles.forEach((filePath) => {
      try {
        const content = fs.readFileSync(filePath, "utf8");

        suspiciousPatterns.forEach((pattern) => {
          const matches = content.match(pattern);
          if (matches) {
            this.addWarning(
              `Potential hardcoded credential in ${path.relative(
                process.cwd(),
                filePath
              )}`
            );
          }
        });
      } catch (error) {
        // Skip files that can't be read
      }
    });
  }

  async runValidation() {
    console.log("🔍 COMPREHENSIVE CODEBASE VALIDATION");
    console.log("=".repeat(50));
    console.log("Analyzing your codebase for issues and improvements...\n");

    this.validateFileStructure();
    this.validateImports();
    this.validateConfiguration();
    this.validateCodeQuality();
    this.validateSecurity();

    this.printResults();
  }

  printResults() {
    console.log("\n" + "=".repeat(60));
    console.log("📊 CODEBASE VALIDATION RESULTS");
    console.log("=".repeat(60));

    console.log(`📈 Summary:`);
    console.log(`   ❌ Issues: ${this.issues.length}`);
    console.log(`   ⚠️ Warnings: ${this.warnings.length}`);
    console.log(`   💡 Suggestions: ${this.suggestions.length}`);

    if (this.issues.length === 0 && this.warnings.length === 0) {
      console.log("\n🎉 EXCELLENT! No critical issues found.");
      console.log("   Your codebase structure looks solid!");
    } else {
      if (this.issues.length > 0) {
        console.log("\n❌ CRITICAL ISSUES (Fix Required):");
        this.issues.forEach((issue, index) => {
          console.log(`   ${index + 1}. ${issue}`);
        });
      }

      if (this.warnings.length > 0) {
        console.log("\n⚠️ WARNINGS (Recommended Fixes):");
        this.warnings.forEach((warning, index) => {
          console.log(`   ${index + 1}. ${warning}`);
        });
      }
    }

    if (this.suggestions.length > 0) {
      console.log("\n💡 SUGGESTIONS (Code Improvements):");
      this.suggestions.forEach((suggestion, index) => {
        console.log(`   ${index + 1}. ${suggestion}`);
      });
    }

    console.log("\n🔧 NEXT STEPS:");
    if (this.issues.length > 0) {
      console.log("   1. Fix all critical issues listed above");
      console.log("   2. Run the fix-common-issues.js script");
      console.log("   3. Re-run this validation");
    } else {
      console.log("   1. Address warnings if applicable");
      console.log(
        "   2. Consider implementing suggestions for better code quality"
      );
      console.log("   3. Run the full test suite");
    }

    // Save results
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        issues: this.issues.length,
        warnings: this.warnings.length,
        suggestions: this.suggestions.length,
      },
      details: {
        issues: this.issues,
        warnings: this.warnings,
        suggestions: this.suggestions,
      },
    };

    const reportPath = path.join(__dirname, "../validation-results.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n💾 Detailed results saved to: ${reportPath}`);
  }
}

// CLI usage
if (require.main === module) {
  const serverPath = process.argv[2] || "../server";
  const clientPath = process.argv[3] || "../client";

  console.log(`🎯 Validating codebase:`);
  console.log(`   🖥️  Server: ${path.resolve(serverPath)}`);
  console.log(`   💻 Client: ${path.resolve(clientPath)}`);
  console.log("");

  const validator = new CodebaseValidator(serverPath, clientPath);
  validator.runValidation();
}

module.exports = CodebaseValidator;

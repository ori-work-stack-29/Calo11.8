#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

class EnhancedPrismaUsageAnalyzer {
  constructor(serverPath = "../server", clientPath = "../client") {
    this.serverPath = path.resolve(serverPath);
    this.clientPath = path.resolve(clientPath);
    this.prismaSchemaPath = path.join(
      this.serverPath,
      "prisma",
      "schema.prisma"
    );

    // Server paths
    this.srcPath = path.join(this.serverPath, "src");
    this.routesPath = path.join(this.serverPath, "src", "routes");
    this.servicesPath = path.join(this.serverPath, "src", "services");
    this.controllersPath = path.join(this.serverPath, "src", "controllers");
    this.middlewarePath = path.join(this.serverPath, "src", "middleware");
    this.utilsPath = path.join(this.serverPath, "src", "utils");

    // Client paths
    this.clientSrcPath = path.join(this.clientPath, "src");
    this.clientServicesPath = path.join(this.clientPath, "src", "services");
    this.clientApiPath = path.join(
      this.clientPath,
      "src",
      "services",
      "api.ts"
    );
    this.clientStorePath = path.join(this.clientPath, "src", "store");
    this.clientSlicesPath = path.join(this.clientPath, "src", "store");

    this.models = new Set();
    this.usedModels = new Map(); // Store model -> usage details
    this.unusedModels = new Set();
    this.suspiciousModels = new Map(); // Models that might not be truly used
  }

  // Parse Prisma schema to extract model names
  parsePrismaSchema() {
    try {
      const schemaContent = fs.readFileSync(this.prismaSchemaPath, "utf8");
      const modelRegex = /^model\s+(\w+)\s*{/gm;
      let match;

      while ((match = modelRegex.exec(schemaContent)) !== null) {
        this.models.add(match[1]);
      }

      console.log(`📋 Found ${this.models.size} models in Prisma schema:`);
      console.log([...this.models].map((model) => `  - ${model}`).join("\n"));
      console.log("");
    } catch (error) {
      console.error(`❌ Error reading Prisma schema: ${error.message}`);
      process.exit(1);
    }
  }

  // Get all files recursively from a directory
  getAllFiles(
    dirPath,
    fileExtensions = [".js", ".ts", ".jsx", ".tsx", ".json"]
  ) {
    const files = [];

    if (!fs.existsSync(dirPath)) {
      return files;
    }

    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      let stat;

      try {
        stat = fs.statSync(fullPath);
      } catch (error) {
        continue; // Skip inaccessible files
      }

      if (stat.isDirectory()) {
        // Skip common directories
        if (
          ![
            "node_modules",
            ".git",
            "dist",
            "build",
            "coverage",
            ".next",
            "public",
          ].includes(item)
        ) {
          files.push(...this.getAllFiles(fullPath, fileExtensions));
        }
      } else if (fileExtensions.some((ext) => item.endsWith(ext))) {
        files.push(fullPath);
      }
    }

    return files;
  }

  // Check for actual meaningful usage of a model in a file
  analyzeModelUsageInFile(filePath, modelName) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const relativePath = path.relative(this.serverPath, filePath);
      const isClientFile = filePath.startsWith(this.clientPath);

      // Remove comments to avoid false positives
      const contentWithoutComments = content
        .replace(/\/\*[\s\S]*?\*\//g, "") // Remove block comments
        .replace(/\/\/.*$/gm, "") // Remove line comments
        .replace(/<!--[\s\S]*?-->/g, "") // Remove HTML comments
        .replace(/#.*$/gm, ""); // Remove shell-style comments

      const usageDetails = {
        file: isClientFile
          ? path.relative(this.clientPath, filePath)
          : relativePath,
        isClientFile,
        usages: [],
        isRealUsage: false,
      };

      // 1. DATABASE OPERATIONS (Strong indicators of real usage - Server only)
      if (!isClientFile) {
        const dbOperations = [
          // Prisma client operations
          new RegExp(
            `prisma\\.${modelName.toLowerCase()}\\.(create|createMany|findFirst|findUnique|findMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)\\s*\\(`,
            "gi"
          ),
          new RegExp(
            `prisma\\.${modelName}\\.(create|createMany|findFirst|findUnique|findMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)\\s*\\(`,
            "g"
          ),

          // Raw queries with model name
          new RegExp(`\\$queryRaw.*${modelName}`, "gi"),
          new RegExp(`\\$executeRaw.*${modelName}`, "gi"),

          // Transaction operations
          new RegExp(
            `\\.(${modelName.toLowerCase()}|${modelName})\\.(create|findFirst|findUnique|findMany|update|updateMany|upsert|delete|deleteMany)`,
            "gi"
          ),
        ];

        dbOperations.forEach((pattern) => {
          const matches = [...contentWithoutComments.matchAll(pattern)];
          if (matches.length > 0) {
            usageDetails.usages.push({
              type: "DATABASE_OPERATION",
              pattern: pattern.source,
              count: matches.length,
            });
            usageDetails.isRealUsage = true;
          }
        });
      }

      // 2. API ENDPOINTS (Strong indicators - Server and Client)
      const apiPatterns = [
        // Express routes (Server)
        new RegExp(
          `\\.(get|post|put|delete|patch)\\s*\\(\\s*['"\`][^'"\`]*${modelName.toLowerCase()}[^'"\`]*['"\`]`,
          "gi"
        ),
        new RegExp(
          `\\.(get|post|put|delete|patch)\\s*\\(\\s*['"\`][^'"\`]*${modelName}[^'"\`]*['"\`]`,
          "g"
        ),

        // Route parameters
        new RegExp(`req\\.params\\.\\w*${modelName.toLowerCase()}`, "gi"),
        new RegExp(`req\\.body\\.\\w*${modelName.toLowerCase()}`, "gi"),

        // Client API calls (axios, fetch, etc.)
        new RegExp(
          `(axios|fetch)\\s*\\([^)]*['"\`][^'"\`]*${modelName.toLowerCase()}[^'"\`]*['"\`]`,
          "gi"
        ),
        new RegExp(
          `(get|post|put|delete|patch)\\s*\\([^)]*['"\`][^'"\`]*${modelName.toLowerCase()}[^'"\`]*['"\`]`,
          "gi"
        ),

        // API endpoint strings
        new RegExp(
          `['"\`]/api/[^'"\`]*${modelName.toLowerCase()}[^'"\`]*['"\`]`,
          "gi"
        ),
        new RegExp(
          `['"\`]/[^'"\`]*${modelName.toLowerCase()}[^'"\`]*['"\`]`,
          "gi"
        ),

        // GraphQL resolvers
        new RegExp(`${modelName}\\s*:\\s*\\{[^}]*resolver`, "gi"),
        new RegExp(`Query\\.${modelName.toLowerCase()}`, "gi"),
        new RegExp(`Mutation\\.${modelName.toLowerCase()}`, "gi"),
      ];

      apiPatterns.forEach((pattern) => {
        const matches = [...contentWithoutComments.matchAll(pattern)];
        if (matches.length > 0) {
          usageDetails.usages.push({
            type: "API_ENDPOINT",
            pattern: pattern.source,
            count: matches.length,
          });
          usageDetails.isRealUsage = true;
        }
      });

      // 3. CLIENT-SIDE SPECIFIC PATTERNS (Strong indicators for client files)
      if (isClientFile) {
        const clientPatterns = [
          // Redux slice actions and reducers
          new RegExp(`${modelName.toLowerCase()}Slice`, "gi"),
          new RegExp(`${modelName}Slice`, "g"),
          new RegExp(`set${modelName}`, "g"),
          new RegExp(`update${modelName}`, "g"),
          new RegExp(`delete${modelName}`, "g"),
          new RegExp(`fetch${modelName}`, "g"),
          new RegExp(`create${modelName}`, "g"),

          // State management
          new RegExp(`state\\.${modelName.toLowerCase()}`, "gi"),
          new RegExp(`state\\.${modelName}`, "g"),
          new RegExp(`useSelector.*${modelName.toLowerCase()}`, "gi"),
          new RegExp(`useSelector.*${modelName}`, "g"),

          // Component props/interfaces
          new RegExp(`${modelName}Props`, "gi"),
          new RegExp(`${modelName}State`, "gi"),
          new RegExp(`${modelName}Data`, "gi"),

          // API service methods
          new RegExp(`(get|create|update|delete|fetch)${modelName}`, "gi"),
          new RegExp(`${modelName.toLowerCase()}Service`, "gi"),
          new RegExp(`${modelName}Service`, "g"),

          // Form handling
          new RegExp(`${modelName}Form`, "gi"),
          new RegExp(`validate${modelName}`, "gi"),

          // React hooks
          new RegExp(`use${modelName}`, "gi"),

          // Data transformation
          new RegExp(`transform${modelName}`, "gi"),
          new RegExp(`serialize${modelName}`, "gi"),
          new RegExp(`deserialize${modelName}`, "gi"),
        ];

        clientPatterns.forEach((pattern) => {
          const matches = [...contentWithoutComments.matchAll(pattern)];
          if (matches.length > 0) {
            usageDetails.usages.push({
              type: "CLIENT_OPERATION",
              pattern: pattern.source,
              count: matches.length,
            });
            usageDetails.isRealUsage = true;
          }
        });
      }

      // 4. BUSINESS LOGIC (Medium indicators)
      const businessLogicPatterns = [
        // Function parameters/returns with model type
        new RegExp(`:\\s*${modelName}\\s*[\\[\\]]*\\s*[=,\\)\\}]`, "g"),
        new RegExp(`:\\s*${modelName}\\s*\\[\\s*\\]`, "g"),

        // Variable assignments
        new RegExp(`(const|let|var)\\s+\\w+\\s*:\\s*${modelName}`, "g"),

        // Service method calls
        new RegExp(`\\w*Service\\.\\w*${modelName.toLowerCase()}`, "gi"),
        new RegExp(`\\w*Repository\\.\\w*${modelName.toLowerCase()}`, "gi"),

        // Model validation/transformation
        new RegExp(`validate${modelName}`, "gi"),
        new RegExp(`transform${modelName}`, "gi"),
        new RegExp(`serialize${modelName}`, "gi"),
      ];

      businessLogicPatterns.forEach((pattern) => {
        const matches = [...contentWithoutComments.matchAll(pattern)];
        if (matches.length > 0) {
          usageDetails.usages.push({
            type: "BUSINESS_LOGIC",
            pattern: pattern.source,
            count: matches.length,
          });
          // Only mark as real usage if we found substantial business logic
          if (matches.length >= 2) {
            usageDetails.isRealUsage = true;
          }
        }
      });

      // 5. WEAK INDICATORS (Don't mark as real usage alone)
      const weakPatterns = [
        // Just imports or type annotations without usage
        new RegExp(`import.*${modelName}`, "gi"),
        new RegExp(`from.*${modelName}`, "gi"),

        // String literals (could be comments or unused)
        new RegExp(`['"\`]${modelName.toLowerCase()}['"\`]`, "gi"),
        new RegExp(`['"\`]${modelName}['"\`]`, "g"),

        // General word boundaries (could be anything)
        new RegExp(`\\b${modelName}\\b`, "g"),
      ];

      weakPatterns.forEach((pattern) => {
        const matches = [...contentWithoutComments.matchAll(pattern)];
        if (matches.length > 0) {
          usageDetails.usages.push({
            type: "WEAK_INDICATOR",
            pattern: pattern.source,
            count: matches.length,
          });
        }
      });

      return usageDetails.usages.length > 0 ? usageDetails : null;
    } catch (error) {
      console.warn(`⚠️  Could not read file ${filePath}: ${error.message}`);
      return null;
    }
  }

  // Analyze usage across all source files
  analyzeUsage() {
    console.log(
      "🔍 Performing deep analysis of model usage across server and client...\n"
    );

    // Get all source files from server
    const serverFiles = [
      ...this.getAllFiles(this.srcPath),
      ...this.getAllFiles(this.routesPath),
      ...this.getAllFiles(this.servicesPath),
      ...this.getAllFiles(this.controllersPath),
      ...this.getAllFiles(this.middlewarePath),
      ...this.getAllFiles(this.utilsPath),
    ];

    // Get all client files with specific focus on key areas
    let clientFiles = [];
    let clientSpecificFiles = [];
    if (fs.existsSync(this.clientPath)) {
      clientFiles = this.getAllFiles(this.clientSrcPath);

      // Specifically check key client files
      const keyClientFiles = [
        this.clientApiPath,
        path.join(this.clientStorePath, "authSlice.ts"),
        path.join(this.clientStorePath, "authSlice.js"),
        path.join(this.clientStorePath, "mealSlice.ts"),
        path.join(this.clientStorePath, "mealSlice.js"),
        path.join(this.clientStorePath, "calendarSlice.ts"),
        path.join(this.clientStorePath, "calendarSlice.js"),
        path.join(this.clientStorePath, "questionnaireSlice.ts"),
        path.join(this.clientStorePath, "questionnaireSlice.js"),
      ];

      keyClientFiles.forEach((filePath) => {
        if (fs.existsSync(filePath) && !clientFiles.includes(filePath)) {
          clientSpecificFiles.push(filePath);
        }
      });
    }

    const allFiles = [
      ...new Set([...serverFiles, ...clientFiles, ...clientSpecificFiles]),
    ];

    console.log(
      `📁 Scanning ${allFiles.length} files across server and client...`
    );
    console.log(`   🖥️  Server files: ${serverFiles.length}`);
    console.log(
      `   💻 Client files: ${clientFiles.length + clientSpecificFiles.length}`
    );

    if (clientSpecificFiles.length > 0) {
      console.log(`   🎯 Key client files found:`);
      clientSpecificFiles.forEach((file) => {
        const relativePath = path.relative(this.clientPath, file);
        console.log(`      - ${relativePath}`);
      });
    }
    console.log("");

    // Check each model against all files
    for (const model of this.models) {
      const modelUsage = {
        realUsages: [],
        suspiciousUsages: [],
        serverUsages: [],
        clientUsages: [],
        totalFiles: 0,
        isReallyUsed: false,
      };

      for (const filePath of allFiles) {
        const usage = this.analyzeModelUsageInFile(filePath, model);
        if (usage) {
          modelUsage.totalFiles++;

          if (usage.isClientFile) {
            modelUsage.clientUsages.push(usage);
          } else {
            modelUsage.serverUsages.push(usage);
          }

          if (usage.isRealUsage) {
            modelUsage.realUsages.push(usage);
            modelUsage.isReallyUsed = true;
          } else {
            modelUsage.suspiciousUsages.push(usage);
          }
        }
      }

      if (modelUsage.isReallyUsed) {
        this.usedModels.set(model, modelUsage);
        console.log(`✅ ${model} - ACTIVELY USED`);
        console.log(
          `   💼 Real usage in ${modelUsage.realUsages.length} file(s):`
        );
        console.log(
          `      🖥️  Server: ${
            modelUsage.serverUsages.filter((u) => u.isRealUsage).length
          } files`
        );
        console.log(
          `      💻 Client: ${
            modelUsage.clientUsages.filter((u) => u.isRealUsage).length
          } files`
        );

        modelUsage.realUsages.slice(0, 4).forEach((usage) => {
          const location = usage.isClientFile ? "💻" : "🖥️ ";
          console.log(`      ${location} ${usage.file}`);
          usage.usages
            .filter((u) => u.type !== "WEAK_INDICATOR")
            .slice(0, 2)
            .forEach((u) => {
              console.log(`        → ${u.type}: ${u.count} occurrence(s)`);
            });
        });
        if (modelUsage.realUsages.length > 4) {
          console.log(
            `      ... and ${modelUsage.realUsages.length - 4} more file(s)`
          );
        }
      } else if (modelUsage.totalFiles > 0) {
        this.suspiciousModels.set(model, modelUsage);
        console.log(
          `⚠️  ${model} - SUSPICIOUS (found in files but no real usage detected)`
        );
        console.log(
          `   📄 Mentioned in ${modelUsage.totalFiles} file(s) but only weak indicators found`
        );
        console.log(
          `      🖥️  Server mentions: ${modelUsage.serverUsages.length} files`
        );
        console.log(
          `      💻 Client mentions: ${modelUsage.clientUsages.length} files`
        );

        modelUsage.suspiciousUsages.slice(0, 3).forEach((usage) => {
          const location = usage.isClientFile ? "💻" : "🖥️ ";
          console.log(
            `      ${location} ${usage.file} (likely just imports or comments)`
          );
        });
      } else {
        this.unusedModels.add(model);
        console.log(`❌ ${model} - NOT USED AT ALL`);
      }

      console.log(""); // Empty line between models
    }
  }

  // Generate detailed report
  generateReport() {
    console.log("\n" + "=".repeat(80));
    console.log("📊 ENHANCED PRISMA SCHEMA USAGE REPORT");
    console.log("=".repeat(80));

    const totalModels = this.models.size;
    const reallyUsedModels = this.usedModels.size;
    const suspiciousModels = this.suspiciousModels.size;
    const completelyUnusedModels = this.unusedModels.size;

    console.log(`\n📈 SUMMARY:`);
    console.log(`  Total models in schema: ${totalModels}`);
    console.log(`  ✅ Actively used models: ${reallyUsedModels}`);
    console.log(`  ⚠️  Suspicious models (weak usage): ${suspiciousModels}`);
    console.log(`  ❌ Completely unused models: ${completelyUnusedModels}`);
    console.log(
      `  📊 Real usage rate: ${((reallyUsedModels / totalModels) * 100).toFixed(
        1
      )}%`
    );
    console.log(
      `  🗑️  Can likely be removed: ${
        suspiciousModels + completelyUnusedModels
      } models`
    );

    if (completelyUnusedModels > 0) {
      console.log(
        `\n🗑️  COMPLETELY UNUSED MODELS (${completelyUnusedModels}):`
      );
      console.log(
        `   These models are not referenced anywhere and can be safely removed:`
      );
      [...this.unusedModels]
        .sort()
        .forEach((model) => console.log(`     • ${model}`));
    }

    if (suspiciousModels > 0) {
      console.log(`\n⚠️  SUSPICIOUS MODELS (${suspiciousModels}):`);
      console.log(
        `   These models are mentioned in files but show no real database/API usage:`
      );
      [...this.suspiciousModels.keys()].sort().forEach((model) => {
        console.log(`     • ${model}`);
        const usage = this.suspiciousModels.get(model);
        console.log(
          `       → Found in ${usage.totalFiles} file(s) but only weak indicators (imports, comments, etc.)`
        );
      });
      console.log(
        `\n   💡 These models likely need manual review. They might be:`
      );
      console.log(`      - Imported but never actually used`);
      console.log(`      - Only mentioned in comments or documentation`);
      console.log(`      - Part of unused/dead code`);
      console.log(
        `      - Used in a way the script didn't detect (check manually)`
      );
    }

    if (reallyUsedModels > 0) {
      console.log(`\n✅ ACTIVELY USED MODELS (${reallyUsedModels}):`);
      console.log(
        `   These models have confirmed database operations or API usage:`
      );
      [...this.usedModels.keys()].sort().forEach((model) => {
        const usage = this.usedModels.get(model);
        console.log(
          `     • ${model} (${usage.realUsages.length} file(s) with real usage)`
        );
      });
    }

    console.log(`\n💡 RECOMMENDATIONS:`);
    if (completelyUnusedModels > 0 || suspiciousModels > 0) {
      console.log(`   🔥 HIGH PRIORITY:`);
      if (completelyUnusedModels > 0) {
        console.log(
          `      • Remove ${completelyUnusedModels} completely unused model(s)`
        );
      }
      if (suspiciousModels > 0) {
        console.log(
          `      • Review ${suspiciousModels} suspicious model(s) - likely can be removed`
        );
      }
      console.log(`   📋 BEFORE REMOVING:`);
      console.log(
        `      • Check if models are used in migrations or seed files`
      );
      console.log(`      • Verify models aren't used in external systems/APIs`);
      console.log(`      • Confirm models aren't part of planned features`);
      console.log(`      • Test your application after removal`);
    } else {
      console.log(
        `   🎉 Your Prisma schema is clean! All models are actively used.`
      );
    }
  }

  // Export results to JSON file
  exportResults(outputPath = "../enhanced-prisma-usage-report.json") {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalModels: this.models.size,
        activelyUsedModels: this.usedModels.size,
        suspiciousModels: this.suspiciousModels.size,
        completelyUnusedModels: this.unusedModels.size,
        realUsageRate:
          ((this.usedModels.size / this.models.size) * 100).toFixed(1) + "%",
        canLikelyBeRemoved: this.suspiciousModels.size + this.unusedModels.size,
      },
      models: {
        all: [...this.models].sort(),
        activelyUsed: [...this.usedModels.keys()].sort(),
        suspicious: [...this.suspiciousModels.keys()].sort(),
        completelyUnused: [...this.unusedModels].sort(),
      },
      detailedUsage: {
        activelyUsed: Object.fromEntries(
          [...this.usedModels.entries()].map(([model, usage]) => [
            model,
            {
              filesWithRealUsage: usage.realUsages.length,
              totalFilesMentioned: usage.totalFiles,
              usageFiles: usage.realUsages.map((u) => ({
                file: u.file,
                usageTypes: u.usages
                  .filter((us) => us.type !== "WEAK_INDICATOR")
                  .map((us) => us.type),
              })),
            },
          ])
        ),
        suspicious: Object.fromEntries(
          [...this.suspiciousModels.entries()].map(([model, usage]) => [
            model,
            {
              totalFilesMentioned: usage.totalFiles,
              mentionedInFiles: usage.suspiciousUsages.map((u) => u.file),
              reason: "Only weak indicators found (imports, comments, etc.)",
            },
          ])
        ),
      },
    };

    try {
      fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
      console.log(`\n💾 Detailed report exported to: ${outputPath}`);
    } catch (error) {
      console.error(`❌ Error exporting report: ${error.message}`);
    }
  }

  // Main analysis function
  async analyze() {
    console.log("🚀 Starting Enhanced Prisma Schema Usage Analysis...\n");
    console.log(
      "🔍 This analysis will identify TRULY unused models by checking for:"
    );
    console.log(
      "   • Database operations (create, find, update, delete, etc.)"
    );
    console.log("   • API endpoints and routes");
    console.log("   • Business logic implementation");
    console.log("   • Client-side usage (Redux slices, API calls, components)");
    console.log(
      "   • Specific client files: api.ts, authSlice, mealSlice, calendarSlice, questionnaireSlice"
    );
    console.log("─".repeat(80));

    try {
      // Parse schema
      this.parsePrismaSchema();

      // Analyze usage
      this.analyzeUsage();

      // Generate report
      this.generateReport();

      // Export results
      this.exportResults();

      console.log("\n✨ Enhanced analysis complete!");
      console.log(
        "🎯 This report shows models with REAL usage vs. just mentions/imports"
      );
      process.exit(0);
    } catch (error) {
      console.error(`❌ Analysis failed: ${error.message}`);
      process.exit(1);
    }
  }
}

// CLI Usage
if (require.main === module) {
  const serverPath = process.argv[2] || "../server";
  const clientPath = process.argv[3] || "../client";

  console.log(`📁 Analyzing server at: ${path.resolve(serverPath)}`);
  console.log(
    `📁 Checking client at: ${path.resolve(clientPath)} ${
      fs.existsSync(path.resolve(clientPath)) ? "✓" : "(not found)"
    }`
  );
  console.log(`🔧 Script running from: ${__dirname}`);
  console.log("─".repeat(80));

  // Verify server directory exists
  if (!fs.existsSync(path.resolve(serverPath))) {
    console.error(`❌ Server directory not found: ${path.resolve(serverPath)}`);
    console.log(
      "💡 Make sure you're running this from the scripts folder and server folder exists"
    );
    process.exit(1);
  }

  const analyzer = new EnhancedPrismaUsageAnalyzer(serverPath, clientPath);
  analyzer.analyze();
}

module.exports = EnhancedPrismaUsageAnalyzer;

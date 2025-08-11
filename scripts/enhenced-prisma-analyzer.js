#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

class ComprehensivePrismaAnalyzer {
  constructor(serverPath = "../server", clientPath = "../client") {
    this.serverPath = path.resolve(serverPath);
    this.clientPath = path.resolve(clientPath);
    this.prismaSchemaPath = path.join(
      this.serverPath,
      "prisma",
      "schema.prisma"
    );

    // Enhanced path detection
    this.searchPaths = {
      server: [
        path.join(this.serverPath, "src"),
        path.join(this.serverPath, "routes"),
        path.join(this.serverPath, "services"),
        path.join(this.serverPath, "controllers"),
        path.join(this.serverPath, "middleware"),
        path.join(this.serverPath, "utils"),
        path.join(this.serverPath, "lib"),
        path.join(this.serverPath, "types"),
        path.join(this.serverPath, "prisma"),
      ],
      client: [
        path.join(this.clientPath, "src"),
        path.join(this.clientPath, "app"),
        path.join(this.clientPath, "components"),
        path.join(this.clientPath, "hooks"),
        path.join(this.clientPath, "utils"),
        path.join(this.clientPath, "types"),
        path.join(this.clientPath, "store"),
      ],
    };

    this.models = new Map(); // model name -> model details
    this.modelUsage = new Map(); // model name -> usage analysis
    this.fileCache = new Map(); // file path -> content (for performance)
  }

  // Enhanced Prisma schema parsing
  parsePrismaSchema() {
    try {
      const schemaContent = fs.readFileSync(this.prismaSchemaPath, "utf8");

      // Parse models with their fields and relationships
      const modelRegex = /^model\s+(\w+)\s*\{([\s\S]*?)\n\}/gm;
      let match;

      while ((match = modelRegex.exec(schemaContent)) !== null) {
        const modelName = match[1];
        const modelBody = match[2];

        // Parse fields
        const fields = [];
        const fieldRegex = /^\s*(\w+)\s+([^\s]+).*$/gm;
        let fieldMatch;

        while ((fieldMatch = fieldRegex.exec(modelBody)) !== null) {
          if (
            !fieldMatch[1].startsWith("//") &&
            !fieldMatch[1].startsWith("@@")
          ) {
            fields.push({
              name: fieldMatch[1],
              type: fieldMatch[2],
            });
          }
        }

        // Parse relationships
        const relationships = [];
        const relationRegex = /^\s*(\w+)\s+(\w+)(\[\])?\s+@relation/gm;
        let relationMatch;

        while ((relationMatch = relationRegex.exec(modelBody)) !== null) {
          relationships.push({
            field: relationMatch[1],
            model: relationMatch[2],
            isArray: !!relationMatch[3],
          });
        }

        this.models.set(modelName, {
          name: modelName,
          fields,
          relationships,
          rawBody: modelBody,
        });
      }

      console.log(`📋 Parsed ${this.models.size} models from Prisma schema:`);
      for (const [name, model] of this.models) {
        console.log(
          `  • ${name} (${model.fields.length} fields, ${model.relationships.length} relations)`
        );
      }
      console.log("");
    } catch (error) {
      console.error(`❌ Error parsing Prisma schema: ${error.message}`);
      process.exit(1);
    }
  }

  // Get all files with caching
  getAllFiles(
    dirPath,
    fileExtensions = [".js", ".ts", ".jsx", ".tsx", ".json", ".sql"]
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
        continue;
      }

      if (stat.isDirectory()) {
        if (
          ![
            "node_modules",
            ".git",
            "dist",
            "build",
            "coverage",
            ".next",
            "public",
            ".expo",
            "android",
            "ios",
            "web-build",
            ".vscode",
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

  // Enhanced content analysis with caching
  getFileContent(filePath) {
    if (this.fileCache.has(filePath)) {
      return this.fileCache.get(filePath);
    }

    try {
      const content = fs.readFileSync(filePath, "utf8");

      // Remove comments and strings to avoid false positives
      const cleanContent = content
        .replace(/\/\*[\s\S]*?\*\//g, " ") // Block comments
        .replace(/\/\/.*$/gm, " ") // Line comments
        .replace(/<!--[\s\S]*?-->/g, " ") // HTML comments
        .replace(/#.*$/gm, " ") // Shell comments
        .replace(/'[^']*'/g, " ") // Single quoted strings
        .replace(/"[^"]*"/g, " ") // Double quoted strings
        .replace(/`[^`]*`/g, " "); // Template literals

      this.fileCache.set(filePath, { raw: content, clean: cleanContent });
      return this.fileCache.get(filePath);
    } catch (error) {
      return { raw: "", clean: "" };
    }
  }

  // Comprehensive usage analysis
  analyzeModelUsage(modelName, filePath) {
    const { raw: content, clean: cleanContent } = this.getFileContent(filePath);
    const relativePath = path.relative(this.serverPath, filePath);
    const isClientFile = filePath.startsWith(this.clientPath);

    const usageAnalysis = {
      file: isClientFile
        ? path.relative(this.clientPath, filePath)
        : relativePath,
      isClientFile,
      usageTypes: new Set(),
      usageCount: 0,
      confidence: 0,
      details: [],
    };

    // 1. PRISMA CLIENT OPERATIONS (Highest confidence - Server only)
    if (!isClientFile) {
      const prismaPatterns = [
        // Direct Prisma operations
        new RegExp(
          `prisma\\.${modelName.toLowerCase()}\\.(create|createMany|findFirst|findUnique|findMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)\\s*\\(`,
          "gi"
        ),
        new RegExp(
          `prisma\\.${modelName}\\.(create|createMany|findFirst|findUnique|findMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)\\s*\\(`,
          "g"
        ),

        // Transaction operations
        new RegExp(
          `tx\\.${modelName.toLowerCase()}\\.(create|findFirst|findUnique|findMany|update|updateMany|upsert|delete|deleteMany)`,
          "gi"
        ),
        new RegExp(
          `tx\\.${modelName}\\.(create|findFirst|findUnique|findMany|update|updateMany|upsert|delete|deleteMany)`,
          "g"
        ),

        // Raw queries
        new RegExp(`\\$queryRaw.*${modelName}`, "gi"),
        new RegExp(`\\$executeRaw.*${modelName}`, "gi"),

        // Include statements
        new RegExp(
          `include:\\s*\\{[^}]*${modelName.toLowerCase()}[^}]*\\}`,
          "gi"
        ),
        new RegExp(`include:\\s*\\{[^}]*${modelName}[^}]*\\}`, "g"),
      ];

      prismaPatterns.forEach((pattern) => {
        const matches = [...cleanContent.matchAll(pattern)];
        if (matches.length > 0) {
          usageAnalysis.usageTypes.add("DATABASE_OPERATION");
          usageAnalysis.usageCount += matches.length;
          usageAnalysis.confidence += 40; // High confidence
          usageAnalysis.details.push({
            type: "DATABASE_OPERATION",
            pattern: pattern.source,
            matches: matches.length,
            examples: matches.slice(0, 3).map((m) => m[0]),
          });
        }
      });
    }

    // 2. API ENDPOINTS AND ROUTES (High confidence)
    const apiPatterns = [
      // Express routes
      new RegExp(
        `\\.(get|post|put|delete|patch)\\s*\\([^)]*['"\`][^'"\`]*${modelName.toLowerCase()}[^'"\`]*['"\`]`,
        "gi"
      ),
      new RegExp(
        `\\.(get|post|put|delete|patch)\\s*\\([^)]*['"\`][^'"\`]*${modelName}[^'"\`]*['"\`]`,
        "g"
      ),

      // Route parameters and body
      new RegExp(
        `req\\.(params|body|query)\\.\\w*${modelName.toLowerCase()}`,
        "gi"
      ),
      new RegExp(`req\\.(params|body|query)\\.\\w*${modelName}`, "g"),

      // API endpoint strings
      new RegExp(
        `['"\`]/api/[^'"\`]*${modelName.toLowerCase()}[^'"\`]*['"\`]`,
        "gi"
      ),
      new RegExp(
        `['"\`]/[^'"\`]*${modelName.toLowerCase()}[^'"\`]*['"\`]`,
        "gi"
      ),

      // Client API calls
      new RegExp(
        `(axios|fetch)\\s*\\([^)]*['"\`][^'"\`]*${modelName.toLowerCase()}[^'"\`]*['"\`]`,
        "gi"
      ),
      new RegExp(
        `(get|post|put|delete|patch)\\s*\\([^)]*['"\`][^'"\`]*${modelName.toLowerCase()}[^'"\`]*['"\`]`,
        "gi"
      ),
    ];

    apiPatterns.forEach((pattern) => {
      const matches = [...cleanContent.matchAll(pattern)];
      if (matches.length > 0) {
        usageAnalysis.usageTypes.add("API_ENDPOINT");
        usageAnalysis.usageCount += matches.length;
        usageAnalysis.confidence += 35; // High confidence
        usageAnalysis.details.push({
          type: "API_ENDPOINT",
          pattern: pattern.source,
          matches: matches.length,
          examples: matches.slice(0, 2).map((m) => m[0]),
        });
      }
    });

    // 3. TYPE DEFINITIONS AND INTERFACES (Medium-High confidence)
    const typePatterns = [
      // Interface definitions
      new RegExp(`interface\\s+\\w*${modelName}\\w*\\s*\\{`, "gi"),
      new RegExp(`type\\s+\\w*${modelName}\\w*\\s*=`, "gi"),

      // Function parameters and returns
      new RegExp(`:\\s*${modelName}\\s*[\\[\\]]*\\s*[=,\\)\\}]`, "g"),
      new RegExp(`:\\s*${modelName}\\[\\]`, "g"),

      // Generic types
      new RegExp(`<[^>]*${modelName}[^>]*>`, "g"),

      // Variable declarations with types
      new RegExp(`(const|let|var)\\s+\\w+\\s*:\\s*${modelName}`, "g"),
    ];

    typePatterns.forEach((pattern) => {
      const matches = [...cleanContent.matchAll(pattern)];
      if (matches.length > 0) {
        usageAnalysis.usageTypes.add("TYPE_DEFINITION");
        usageAnalysis.usageCount += matches.length;
        usageAnalysis.confidence += 25; // Medium-high confidence
        usageAnalysis.details.push({
          type: "TYPE_DEFINITION",
          pattern: pattern.source,
          matches: matches.length,
        });
      }
    });

    // 4. BUSINESS LOGIC (Medium confidence)
    const businessLogicPatterns = [
      // Service method calls
      new RegExp(`\\w*Service\\.\\w*${modelName.toLowerCase()}`, "gi"),
      new RegExp(`\\w*Repository\\.\\w*${modelName.toLowerCase()}`, "gi"),
      new RegExp(`\\w*API\\.\\w*${modelName.toLowerCase()}`, "gi"),

      // Function names containing model
      new RegExp(
        `(function|const|let)\\s+\\w*${modelName.toLowerCase()}\\w*`,
        "gi"
      ),
      new RegExp(`(function|const|let)\\s+\\w*${modelName}\\w*`, "g"),

      // Method calls
      new RegExp(
        `\\.(get|create|update|delete|fetch|save|load)${modelName}`,
        "gi"
      ),
      new RegExp(
        `\\.(get|create|update|delete|fetch|save|load)${modelName.toLowerCase()}`,
        "gi"
      ),

      // Redux actions
      new RegExp(`${modelName.toLowerCase()}Slice`, "gi"),
      new RegExp(`${modelName}Slice`, "g"),
      new RegExp(`(set|update|delete|fetch|create)${modelName}`, "g"),
    ];

    businessLogicPatterns.forEach((pattern) => {
      const matches = [...cleanContent.matchAll(pattern)];
      if (matches.length > 0) {
        usageAnalysis.usageTypes.add("BUSINESS_LOGIC");
        usageAnalysis.usageCount += matches.length;
        usageAnalysis.confidence += 20; // Medium confidence
        usageAnalysis.details.push({
          type: "BUSINESS_LOGIC",
          pattern: pattern.source,
          matches: matches.length,
        });
      }
    });

    // 5. CLIENT-SPECIFIC PATTERNS (Medium confidence)
    if (isClientFile) {
      const clientPatterns = [
        // React hooks
        new RegExp(`use${modelName}`, "gi"),
        new RegExp(`use\\w*${modelName}\\w*`, "gi"),

        // Component props
        new RegExp(`${modelName}Props`, "gi"),
        new RegExp(`${modelName}State`, "gi"),
        new RegExp(`${modelName}Data`, "gi"),

        // State management
        new RegExp(`state\\.${modelName.toLowerCase()}`, "gi"),
        new RegExp(`state\\.${modelName}`, "g"),
        new RegExp(`useSelector.*${modelName.toLowerCase()}`, "gi"),

        // Form handling
        new RegExp(`${modelName}Form`, "gi"),
        new RegExp(`validate${modelName}`, "gi"),

        // Navigation and routing
        new RegExp(`navigate.*${modelName.toLowerCase()}`, "gi"),
        new RegExp(`router.*${modelName.toLowerCase()}`, "gi"),
      ];

      clientPatterns.forEach((pattern) => {
        const matches = [...cleanContent.matchAll(pattern)];
        if (matches.length > 0) {
          usageAnalysis.usageTypes.add("CLIENT_OPERATION");
          usageAnalysis.usageCount += matches.length;
          usageAnalysis.confidence += 20; // Medium confidence
          usageAnalysis.details.push({
            type: "CLIENT_OPERATION",
            pattern: pattern.source,
            matches: matches.length,
          });
        }
      });
    }

    // 6. CONFIGURATION AND SCHEMA REFERENCES (Low-Medium confidence)
    const configPatterns = [
      // Schema references
      new RegExp(`@relation.*${modelName}`, "gi"),
      new RegExp(`references.*${modelName}`, "gi"),

      // Migration references
      new RegExp(`CREATE TABLE.*${modelName}`, "gi"),
      new RegExp(`ALTER TABLE.*${modelName}`, "gi"),
      new RegExp(`DROP TABLE.*${modelName}`, "gi"),

      // Seed data
      new RegExp(`${modelName.toLowerCase()}.*seed`, "gi"),
      new RegExp(`seed.*${modelName.toLowerCase()}`, "gi"),
    ];

    configPatterns.forEach((pattern) => {
      const matches = [...content.matchAll(pattern)]; // Use raw content for schema/migration files
      if (matches.length > 0) {
        usageAnalysis.usageTypes.add("SCHEMA_REFERENCE");
        usageAnalysis.usageCount += matches.length;
        usageAnalysis.confidence += 15; // Low-medium confidence
        usageAnalysis.details.push({
          type: "SCHEMA_REFERENCE",
          pattern: pattern.source,
          matches: matches.length,
        });
      }
    });

    // 7. WEAK INDICATORS (Very low confidence)
    const weakPatterns = [
      // Simple imports
      new RegExp(`import.*${modelName}`, "gi"),
      new RegExp(`from.*${modelName}`, "gi"),

      // String literals
      new RegExp(`['"\`]${modelName.toLowerCase()}['"\`]`, "gi"),
      new RegExp(`['"\`]${modelName}['"\`]`, "g"),

      // Word boundaries (could be anything)
      new RegExp(`\\b${modelName}\\b`, "g"),
    ];

    weakPatterns.forEach((pattern) => {
      const matches = [...cleanContent.matchAll(pattern)];
      if (matches.length > 0) {
        usageAnalysis.usageTypes.add("WEAK_INDICATOR");
        usageAnalysis.usageCount += matches.length;
        usageAnalysis.confidence += 2; // Very low confidence
        usageAnalysis.details.push({
          type: "WEAK_INDICATOR",
          pattern: pattern.source,
          matches: matches.length,
        });
      }
    });

    return usageAnalysis.usageCount > 0 ? usageAnalysis : null;
  }

  // Comprehensive analysis
  analyzeAllModels() {
    console.log("🔍 Performing comprehensive Prisma model usage analysis...\n");

    // Get all files from both server and client
    const allFiles = [];

    // Server files
    for (const searchPath of this.searchPaths.server) {
      if (fs.existsSync(searchPath)) {
        allFiles.push(...this.getAllFiles(searchPath));
      }
    }

    // Client files
    for (const searchPath of this.searchPaths.client) {
      if (fs.existsSync(searchPath)) {
        allFiles.push(...this.getAllFiles(searchPath));
      }
    }

    console.log(
      `📁 Analyzing ${allFiles.length} files across server and client...`
    );
    console.log(
      `   🖥️  Server files: ${
        allFiles.filter((f) => f.startsWith(this.serverPath)).length
      }`
    );
    console.log(
      `   💻 Client files: ${
        allFiles.filter((f) => f.startsWith(this.clientPath)).length
      }`
    );
    console.log("");

    // Analyze each model
    for (const [modelName, modelInfo] of this.models) {
      const modelUsage = {
        model: modelInfo,
        totalFiles: 0,
        serverFiles: 0,
        clientFiles: 0,
        totalConfidence: 0,
        usageTypes: new Set(),
        fileAnalyses: [],
        isReallyUsed: false,
        riskLevel: "UNKNOWN",
      };

      // Analyze usage in each file
      for (const filePath of allFiles) {
        const analysis = this.analyzeModelUsage(modelName, filePath);
        if (analysis) {
          modelUsage.totalFiles++;
          modelUsage.totalConfidence += analysis.confidence;

          if (analysis.isClientFile) {
            modelUsage.clientFiles++;
          } else {
            modelUsage.serverFiles++;
          }

          analysis.usageTypes.forEach((type) =>
            modelUsage.usageTypes.add(type)
          );
          modelUsage.fileAnalyses.push(analysis);
        }
      }

      // Determine if model is really used
      const hasStrongUsage =
        modelUsage.usageTypes.has("DATABASE_OPERATION") ||
        modelUsage.usageTypes.has("API_ENDPOINT");
      const hasMediumUsage =
        modelUsage.usageTypes.has("TYPE_DEFINITION") ||
        modelUsage.usageTypes.has("BUSINESS_LOGIC") ||
        modelUsage.usageTypes.has("CLIENT_OPERATION");
      const hasWeakUsage =
        modelUsage.usageTypes.has("WEAK_INDICATOR") ||
        modelUsage.usageTypes.has("SCHEMA_REFERENCE");

      // Risk assessment
      if (hasStrongUsage) {
        modelUsage.isReallyUsed = true;
        modelUsage.riskLevel = "SAFE";
      } else if (hasMediumUsage && modelUsage.totalConfidence >= 30) {
        modelUsage.isReallyUsed = true;
        modelUsage.riskLevel = "PROBABLY_SAFE";
      } else if (
        hasMediumUsage ||
        (hasWeakUsage && modelUsage.totalConfidence >= 20)
      ) {
        modelUsage.isReallyUsed = false;
        modelUsage.riskLevel = "SUSPICIOUS";
      } else if (hasWeakUsage) {
        modelUsage.isReallyUsed = false;
        modelUsage.riskLevel = "LIKELY_UNUSED";
      } else {
        modelUsage.isReallyUsed = false;
        modelUsage.riskLevel = "DEFINITELY_UNUSED";
      }

      this.modelUsage.set(modelName, modelUsage);

      // Enhanced logging
      const statusIcon = {
        SAFE: "✅",
        PROBABLY_SAFE: "🟢",
        SUSPICIOUS: "🟡",
        LIKELY_UNUSED: "🟠",
        DEFINITELY_UNUSED: "❌",
      }[modelUsage.riskLevel];

      console.log(`${statusIcon} ${modelName} - ${modelUsage.riskLevel}`);
      console.log(
        `   📊 Confidence: ${modelUsage.totalConfidence}, Files: ${modelUsage.totalFiles}`
      );
      console.log(
        `   🖥️  Server: ${modelUsage.serverFiles}, 💻 Client: ${modelUsage.clientFiles}`
      );
      console.log(
        `   🏷️  Usage types: ${Array.from(modelUsage.usageTypes).join(", ")}`
      );

      if (modelUsage.fileAnalyses.length > 0) {
        const topFiles = modelUsage.fileAnalyses
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 3);

        topFiles.forEach((analysis) => {
          const location = analysis.isClientFile ? "💻" : "🖥️ ";
          console.log(
            `   ${location} ${analysis.file} (confidence: ${analysis.confidence})`
          );
        });
      }
      console.log("");
    }
  }

  // Enhanced reporting
  generateComprehensiveReport() {
    console.log("\n" + "=".repeat(80));
    console.log("📊 COMPREHENSIVE PRISMA SCHEMA ANALYSIS REPORT");
    console.log("=".repeat(80));

    const modelsByRisk = {
      SAFE: [],
      PROBABLY_SAFE: [],
      SUSPICIOUS: [],
      LIKELY_UNUSED: [],
      DEFINITELY_UNUSED: [],
    };

    for (const [modelName, usage] of this.modelUsage) {
      modelsByRisk[usage.riskLevel].push({ name: modelName, usage });
    }

    const totalModels = this.models.size;
    const safeModels =
      modelsByRisk.SAFE.length + modelsByRisk.PROBABLY_SAFE.length;
    const riskyModels =
      modelsByRisk.SUSPICIOUS.length + modelsByRisk.LIKELY_UNUSED.length;
    const unusedModels = modelsByRisk.DEFINITELY_UNUSED.length;

    console.log(`\n📈 SUMMARY:`);
    console.log(`  Total models: ${totalModels}`);
    console.log(
      `  ✅ Safe models: ${safeModels} (${(
        (safeModels / totalModels) *
        100
      ).toFixed(1)}%)`
    );
    console.log(
      `  🟡 Risky models: ${riskyModels} (${(
        (riskyModels / totalModels) *
        100
      ).toFixed(1)}%)`
    );
    console.log(
      `  ❌ Unused models: ${unusedModels} (${(
        (unusedModels / totalModels) *
        100
      ).toFixed(1)}%)`
    );

    // Detailed breakdown by risk level
    Object.entries(modelsByRisk).forEach(([riskLevel, models]) => {
      if (models.length > 0) {
        const icon = {
          SAFE: "✅",
          PROBABLY_SAFE: "🟢",
          SUSPICIOUS: "🟡",
          LIKELY_UNUSED: "🟠",
          DEFINITELY_UNUSED: "❌",
        }[riskLevel];

        console.log(`\n${icon} ${riskLevel} MODELS (${models.length}):`);

        models.forEach(({ name, usage }) => {
          console.log(`   • ${name}`);
          console.log(
            `     📊 Confidence: ${usage.totalConfidence}, Files: ${usage.totalFiles}`
          );
          console.log(
            `     🏷️  Types: ${Array.from(usage.usageTypes).join(", ")}`
          );

          if (usage.fileAnalyses.length > 0) {
            const topFile = usage.fileAnalyses.sort(
              (a, b) => b.confidence - a.confidence
            )[0];
            console.log(`     📁 Top usage: ${topFile.file}`);
          }
        });
      }
    });

    // Relationship analysis
    console.log(`\n🔗 RELATIONSHIP ANALYSIS:`);
    this.analyzeRelationships(modelsByRisk);

    // Recommendations
    console.log(`\n💡 RECOMMENDATIONS:`);

    if (unusedModels > 0) {
      console.log(`   🗑️  IMMEDIATE ACTION REQUIRED:`);
      console.log(`      • Remove ${unusedModels} definitely unused model(s)`);
      modelsByRisk.DEFINITELY_UNUSED.forEach(({ name }) => {
        console.log(`        - ${name}`);
      });
    }

    if (riskyModels > 0) {
      console.log(`   🔍 MANUAL REVIEW NEEDED:`);
      console.log(
        `      • Review ${riskyModels} suspicious/likely unused model(s)`
      );
      [...modelsByRisk.SUSPICIOUS, ...modelsByRisk.LIKELY_UNUSED].forEach(
        ({ name, usage }) => {
          console.log(
            `        - ${name} (confidence: ${usage.totalConfidence})`
          );
        }
      );
    }

    if (safeModels === totalModels) {
      console.log(`   🎉 EXCELLENT! All models are actively used.`);
    }

    console.log(`\n📋 CLEANUP CHECKLIST:`);
    console.log(`   □ Backup your database before making changes`);
    console.log(`   □ Check if unused models are referenced in migrations`);
    console.log(`   □ Verify models aren't used in external systems`);
    console.log(`   □ Test your application after removing models`);
    console.log(`   □ Update any documentation that references removed models`);
  }

  // Analyze model relationships to prevent cascade issues
  analyzeRelationships(modelsByRisk) {
    const unusedModels = new Set(
      modelsByRisk.DEFINITELY_UNUSED.map((m) => m.name)
    );
    const riskyModels = new Set([
      ...modelsByRisk.SUSPICIOUS.map((m) => m.name),
      ...modelsByRisk.LIKELY_UNUSED.map((m) => m.name),
    ]);

    console.log(
      `   🔍 Checking relationships for ${
        unusedModels.size + riskyModels.size
      } at-risk models...`
    );

    for (const [modelName, modelInfo] of this.models) {
      if (unusedModels.has(modelName) || riskyModels.has(modelName)) {
        const relatedModels = [];

        // Check what models reference this one
        for (const [otherModelName, otherModelInfo] of this.models) {
          if (otherModelName !== modelName) {
            const hasRelation = otherModelInfo.relationships.some(
              (rel) => rel.model === modelName
            );
            if (hasRelation) {
              relatedModels.push(otherModelName);
            }
          }
        }

        if (relatedModels.length > 0) {
          const riskLevel = unusedModels.has(modelName) ? "UNUSED" : "RISKY";
          console.log(
            `   ⚠️  ${riskLevel} model ${modelName} is referenced by: ${relatedModels.join(
              ", "
            )}`
          );

          // Check if related models are also unused
          const safeRelations = relatedModels.filter(
            (rel) => !unusedModels.has(rel) && !riskyModels.has(rel)
          );

          if (safeRelations.length > 0) {
            console.log(
              `      🚨 DANGER: Referenced by actively used models: ${safeRelations.join(
                ", "
              )}`
            );
          }
        }
      }
    }
  }

  // Export comprehensive results
  exportResults(outputPath = "../comprehensive-prisma-analysis.json") {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalModels: this.models.size,
        safeModels: Array.from(this.modelUsage.values()).filter(
          (u) => u.riskLevel === "SAFE" || u.riskLevel === "PROBABLY_SAFE"
        ).length,
        riskyModels: Array.from(this.modelUsage.values()).filter(
          (u) => u.riskLevel === "SUSPICIOUS" || u.riskLevel === "LIKELY_UNUSED"
        ).length,
        unusedModels: Array.from(this.modelUsage.values()).filter(
          (u) => u.riskLevel === "DEFINITELY_UNUSED"
        ).length,
        analysisMethod: "comprehensive_pattern_matching",
        confidenceThreshold: 30,
      },
      models: Object.fromEntries(
        Array.from(this.modelUsage.entries()).map(([name, usage]) => [
          name,
          {
            riskLevel: usage.riskLevel,
            confidence: usage.totalConfidence,
            totalFiles: usage.totalFiles,
            serverFiles: usage.serverFiles,
            clientFiles: usage.clientFiles,
            usageTypes: Array.from(usage.usageTypes),
            relationships: usage.model.relationships.map((rel) => rel.model),
            topUsageFiles: usage.fileAnalyses
              .sort((a, b) => b.confidence - a.confidence)
              .slice(0, 5)
              .map((analysis) => ({
                file: analysis.file,
                confidence: analysis.confidence,
                usageTypes: Array.from(analysis.usageTypes),
              })),
          },
        ])
      ),
      recommendations: this.generateRecommendations(),
    };

    try {
      fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
      console.log(`\n💾 Comprehensive analysis exported to: ${outputPath}`);
    } catch (error) {
      console.error(`❌ Error exporting report: ${error.message}`);
    }
  }

  generateRecommendations() {
    const recommendations = [];

    for (const [modelName, usage] of this.modelUsage) {
      switch (usage.riskLevel) {
        case "DEFINITELY_UNUSED":
          recommendations.push({
            model: modelName,
            action: "REMOVE",
            priority: "HIGH",
            reason: "No usage found in codebase",
            confidence: "VERY_HIGH",
          });
          break;

        case "LIKELY_UNUSED":
          recommendations.push({
            model: modelName,
            action: "REVIEW_AND_LIKELY_REMOVE",
            priority: "MEDIUM",
            reason: "Only weak usage indicators found",
            confidence: "HIGH",
          });
          break;

        case "SUSPICIOUS":
          recommendations.push({
            model: modelName,
            action: "MANUAL_REVIEW",
            priority: "LOW",
            reason: "Mixed usage signals - needs human verification",
            confidence: "MEDIUM",
          });
          break;
      }
    }

    return recommendations;
  }

  // Main analysis function
  async analyze() {
    console.log("🚀 Starting Comprehensive Prisma Schema Analysis...\n");
    console.log("🔍 This analysis will:");
    console.log("   • Parse your complete Prisma schema");
    console.log("   • Scan ALL source files in server and client");
    console.log("   • Use advanced pattern matching for accurate detection");
    console.log("   • Analyze model relationships and dependencies");
    console.log("   • Provide risk-based recommendations");
    console.log("─".repeat(80));

    try {
      this.parsePrismaSchema();
      this.analyzeAllModels();
      this.generateComprehensiveReport();
      this.exportResults();

      console.log("\n✨ Comprehensive analysis complete!");
      console.log("🎯 Use the risk levels to safely clean up your schema");
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

  console.log(`📁 Server path: ${path.resolve(serverPath)}`);
  console.log(`📁 Client path: ${path.resolve(clientPath)}`);
  console.log("─".repeat(80));

  if (!fs.existsSync(path.resolve(serverPath))) {
    console.error(`❌ Server directory not found: ${path.resolve(serverPath)}`);
    process.exit(1);
  }

  const analyzer = new ComprehensivePrismaAnalyzer(serverPath, clientPath);
  analyzer.analyze();
}

module.exports = ComprehensivePrismaAnalyzer;

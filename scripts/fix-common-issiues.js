#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

class IssueFixer {
  constructor(serverPath = "../server", clientPath = "../client") {
    this.serverPath = path.resolve(serverPath);
    this.clientPath = path.resolve(clientPath);
    this.fixes = [];
  }

  log(message, type = "info") {
    const icons = {
      info: "ℹ️",
      success: "✅",
      warning: "⚠️",
      error: "❌",
      fix: "🔧",
    };
    console.log(`${icons[type]} ${message}`);
  }

  addFix(description) {
    this.fixes.push(description);
    this.log(description, "fix");
  }

  runCommand(command, cwd) {
    try {
      return execSync(command, {
        cwd,
        stdio: "pipe",
        encoding: "utf8",
      });
    } catch (error) {
      throw new Error(`Command failed: ${command}\n${error.message}`);
    }
  }

  async fixServerIssues() {
    this.log("🖥️ Checking and fixing server issues...", "info");

    // 1. Check and fix package.json scripts
    const serverPackagePath = path.join(this.serverPath, "package.json");
    if (fs.existsSync(serverPackagePath)) {
      const packageJson = JSON.parse(
        fs.readFileSync(serverPackagePath, "utf8")
      );

      const requiredScripts = {
        dev: "tsx watch src/index.ts",
        build: "tsc",
        start: "node dist/index.js",
        "db:generate": "prisma generate",
        "db:push": "prisma db push",
        "db:migrate": "prisma migrate dev",
        "db:studio": "prisma studio",
        "db:seed": "tsx prisma/seed.ts",
        test: "node ../scripts/test-server.js",
        "test:db": "node ../scripts/test-database.js",
      };

      let scriptsUpdated = false;
      for (const [script, command] of Object.entries(requiredScripts)) {
        if (!packageJson.scripts[script]) {
          packageJson.scripts[script] = command;
          scriptsUpdated = true;
        }
      }

      if (scriptsUpdated) {
        fs.writeFileSync(
          serverPackagePath,
          JSON.stringify(packageJson, null, 2)
        );
        this.addFix("Updated server package.json scripts");
      }
    }

    // 2. Check and create .env template
    const envPath = path.join(this.serverPath, ".env");
    const envExamplePath = path.join(this.serverPath, ".env.example");

    if (!fs.existsSync(envExamplePath)) {
      const envTemplate = `# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/nutrition_db"
DIRECT_URL="postgresql://username:password@localhost:5432/nutrition_db"

# JWT Configuration
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"

# OpenAI Configuration (Optional)
OPENAI_API_KEY="your-openai-api-key-here"

# Email Configuration (Optional)
EMAIL_USER="your-email@gmail.com"
EMAIL_PASSWORD="your-app-password"

# Server Configuration
PORT=5000
NODE_ENV=development
API_BASE_URL="http://localhost:5000/api"
CLIENT_URL="http://localhost:19006"
`;

      fs.writeFileSync(envExamplePath, envTemplate);
      this.addFix("Created .env.example template");
    }

    // 3. Check TypeScript configuration
    const tsconfigPath = path.join(this.serverPath, "tsconfig.json");
    if (fs.existsSync(tsconfigPath)) {
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));

      // Ensure proper configuration
      const requiredConfig = {
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          lib: ["ES2020"],
          outDir: "./dist",
          rootDir: "./",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
        },
        include: ["src/**/*", "prisma/**/*"],
        exclude: ["node_modules", "dist"],
      };

      let configUpdated = false;
      if (!tsconfig.compilerOptions?.skipLibCheck) {
        tsconfig.compilerOptions = {
          ...tsconfig.compilerOptions,
          ...requiredConfig.compilerOptions,
        };
        configUpdated = true;
      }

      if (configUpdated) {
        fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));
        this.addFix("Updated server TypeScript configuration");
      }
    }

    // 4. Check Prisma configuration
    const prismaPath = path.join(this.serverPath, "prisma");
    if (fs.existsSync(prismaPath)) {
      // Ensure schema.prisma has proper configuration
      const schemaPath = path.join(prismaPath, "schema.prisma");
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, "utf8");

        if (!schema.includes("binaryTargets")) {
          this.log(
            "Consider adding binaryTargets to Prisma schema for deployment",
            "warning"
          );
        }
      }
    }
  }

  async fixClientIssues() {
    this.log("💻 Checking and fixing client issues...", "info");

    // 1. Check and fix package.json scripts
    const clientPackagePath = path.join(this.clientPath, "package.json");
    if (fs.existsSync(clientPackagePath)) {
      const packageJson = JSON.parse(
        fs.readFileSync(clientPackagePath, "utf8")
      );

      const requiredScripts = {
        start: "npm run update-ip && expo start",
        android: "expo run:android",
        ios: "expo run:ios",
        web: "expo start --web",
        test: "node ../scripts/test-client.js",
        "test:integration": "node ../scripts/test-integration.js",
        "update-ip": "node ../scripts/update-ip-env.js",
      };

      let scriptsUpdated = false;
      for (const [script, command] of Object.entries(requiredScripts)) {
        if (!packageJson.scripts[script]) {
          packageJson.scripts[script] = command;
          scriptsUpdated = true;
        }
      }

      if (scriptsUpdated) {
        fs.writeFileSync(
          clientPackagePath,
          JSON.stringify(packageJson, null, 2)
        );
        this.addFix("Updated client package.json scripts");
      }
    }

    // 2. Check app.json configuration
    const appJsonPath = path.join(this.clientPath, "app.json");
    if (fs.existsSync(appJsonPath)) {
      const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));

      // Ensure required fields
      if (!appJson.expo.scheme) {
        appJson.expo.scheme = "myapp";
        fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2));
        this.addFix("Added URL scheme to app.json");
      }

      if (!appJson.expo.plugins?.includes("expo-router")) {
        if (!appJson.expo.plugins) appJson.expo.plugins = [];
        if (!appJson.expo.plugins.includes("expo-router")) {
          appJson.expo.plugins.push("expo-router");
          fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2));
          this.addFix("Added expo-router plugin to app.json");
        }
      }
    }

    // 3. Check .env configuration
    const clientEnvPath = path.join(this.clientPath, ".env");
    if (!fs.existsSync(clientEnvPath)) {
      const envTemplate = `# API Configuration
EXPO_PUBLIC_API_URL=http://localhost:5000/api

# Optional: Google Fit Integration
EXPO_PUBLIC_GOOGLE_FIT_CLIENT_SECRET=your-google-fit-client-secret

# Optional: Other Device Integrations
EXPO_PUBLIC_FITBIT_CLIENT_ID=your-fitbit-client-id
EXPO_PUBLIC_FITBIT_CLIENT_SECRET=your-fitbit-client-secret
EXPO_PUBLIC_WHOOP_CLIENT_ID=your-whoop-client-id
EXPO_PUBLIC_WHOOP_CLIENT_SECRET=your-whoop-client-secret
`;

      fs.writeFileSync(clientEnvPath, envTemplate);
      this.addFix("Created client .env template");
    }

    // 4. Check TypeScript configuration
    const clientTsconfigPath = path.join(this.clientPath, "tsconfig.json");
    if (fs.existsSync(clientTsconfigPath)) {
      const tsconfig = JSON.parse(fs.readFileSync(clientTsconfigPath, "utf8"));

      if (!tsconfig.compilerOptions?.paths?.["@/*"]) {
        if (!tsconfig.compilerOptions) tsconfig.compilerOptions = {};
        if (!tsconfig.compilerOptions.paths)
          tsconfig.compilerOptions.paths = {};
        tsconfig.compilerOptions.paths["@/*"] = ["./*"];

        fs.writeFileSync(clientTsconfigPath, JSON.stringify(tsconfig, null, 2));
        this.addFix("Added path mapping to client TypeScript configuration");
      }
    }
  }

  async fixCommonIssues() {
    this.log("🔧 Checking and fixing common issues...", "info");

    // 1. Check Git configuration
    const gitignoreFiles = [
      { path: path.join(this.serverPath, ".gitignore"), type: "server" },
      { path: path.join(this.clientPath, ".gitignore"), type: "client" },
    ];

    gitignoreFiles.forEach(({ path: gitignorePath, type }) => {
      if (!fs.existsSync(gitignorePath)) {
        const gitignoreContent =
          type === "server"
            ? `node_modules/
dist/
.env
.env.local
.env.production
*.log
.DS_Store
coverage/
.nyc_output/
prisma/migrations/**/migration.sql
!prisma/migrations/migration_lock.toml
`
            : `node_modules/
.expo/
dist/
web-build/
.env
.env.local
*.log
.DS_Store
ios/
android/
*.p8
*.p12
*.key
*.mobileprovision
`;

        fs.writeFileSync(gitignorePath, gitignoreContent);
        this.addFix(`Created ${type} .gitignore file`);
      }
    });

    // 2. Check for common dependency issues
    const packagePaths = [
      { path: path.join(this.serverPath, "package.json"), type: "server" },
      { path: path.join(this.clientPath, "package.json"), type: "client" },
    ];

    packagePaths.forEach(({ path: packagePath, type }) => {
      if (fs.existsSync(packagePath)) {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

        // Check for peer dependency warnings
        if (type === "client" && !packageJson.resolutions) {
          packageJson.resolutions = {
            "@types/react": "~19.0.10",
          };
          fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
          this.addFix("Added resolutions to client package.json");
        }
      }
    });

    // 3. Check for missing directories
    const requiredDirs = [
      path.join(this.serverPath, "src/routes"),
      path.join(this.serverPath, "src/services"),
      path.join(this.serverPath, "src/middleware"),
      path.join(this.clientPath, "src/store"),
      path.join(this.clientPath, "src/services"),
      path.join(this.clientPath, "src/i18n/locales"),
    ];

    requiredDirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        this.addFix(
          `Created missing directory: ${path.relative(process.cwd(), dir)}`
        );
      }
    });
  }

  async runFixes() {
    console.log("🔧 AUTOMATIC ISSUE FIXER");
    console.log("=".repeat(40));
    console.log("Scanning and fixing common configuration issues...\n");

    try {
      await this.fixServerIssues();
      await this.fixClientIssues();
      await this.fixCommonIssues();

      console.log("\n" + "=".repeat(50));
      console.log("📊 FIXES APPLIED");
      console.log("=".repeat(50));

      if (this.fixes.length === 0) {
        this.log(
          "🎉 No issues found! Your configuration looks good.",
          "success"
        );
      } else {
        this.log(`Applied ${this.fixes.length} fixes:`, "success");
        this.fixes.forEach((fix, index) => {
          console.log(`   ${index + 1}. ${fix}`);
        });
      }

      console.log("\n💡 RECOMMENDATIONS:");
      console.log(
        "   1. Run 'npm install' in both server and client directories"
      );
      console.log("   2. Update your .env files with actual values");
      console.log("   3. Run the test suite: node scripts/run-all-tests.js");
      console.log("   4. Check that your database is running and accessible");
    } catch (error) {
      this.log(`Fix process failed: ${error.message}`, "error");
      process.exit(1);
    }
  }
}

// CLI usage
if (require.main === module) {
  const serverPath = process.argv[2] || "../server";
  const clientPath = process.argv[3] || "../client";

  console.log(`🎯 Fixing issues in:`);
  console.log(`   🖥️  Server: ${path.resolve(serverPath)}`);
  console.log(`   💻 Client: ${path.resolve(clientPath)}`);
  console.log("");

  const fixer = new IssueFixer(serverPath, clientPath);
  fixer.runFixes();
}

module.exports = IssueFixer;

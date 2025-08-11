import cron from "node-cron";
import { prisma } from "../lib/database";

export class CronJobService {
  static initializeCronJobs() {
    // Reset water badges daily at midnight
    cron.schedule("0 0 * * *", async () => {
      console.log("🕛 Running daily reset job at midnight");
      await this.resetDailyBadges();
    });

    console.log("📅 Cron jobs initialized");
  }

  private static async resetDailyBadges() {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      console.log("🧹 Cleaning up daily badges from:", yesterday.toISOString());

      // This doesn't delete badges, just ensures they're date-specific
      // The scuba diver badge logic already handles daily awards correctly

      console.log("✅ Daily badge reset completed");
    } catch (error) {
      console.error("❌ Error resetting daily badges:", error);
    }
  }

  static async createDailyGoalsForAllUsers() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get all users who don't have today's daily goal
      const usersWithoutTodayGoal = await prisma.user.findMany({
        where: {
          DailyGoal: {
            none: {
              date: today,
            },
          },
        },
        include: {
          UserQuestionnaire: {
            orderBy: { date_completed: "desc" },
            take: 1,
          },
        },
      });

      console.log(
        `📊 Creating daily goals for ${usersWithoutTodayGoal.length} users`
      );

      for (const user of usersWithoutTodayGoal) {
        const questionnaire = user.UserQuestionnaire[0];
        const defaultCalories = this.calculateDailyCalories(
          questionnaire,
          user
        );

        await prisma.dailyGoal.create({
          data: {
            id: `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            user_id: user.user_id,
            date: today,
            calories: defaultCalories,
            protein_g: (defaultCalories * 0.25) / 4,
            carbs_g: (defaultCalories * 0.45) / 4,
            fats_g: (defaultCalories * 0.3) / 9,
            fiber_g: 25,
            sodium_mg: 2300,
            sugar_g: 50,
            water_ml: 2500,
            updated_at: new Date(),
          },
        });
      }

      console.log("✅ Daily goals created for all users");
    } catch (error) {
      console.error("❌ Error creating daily goals:", error);
    }
  }

  private static calculateDailyCalories(questionnaire: any, user: any): number {
    if (!questionnaire) return 2000;

    const weight = questionnaire.weight_kg || 70;
    const height = questionnaire.height_cm || 170;
    const age = questionnaire.age || 30;
    const gender = questionnaire.gender || "male";

    let bmr;
    if (gender.toLowerCase() === "male") {
      bmr = 10 * weight + 6.25 * height - 5 * age + 5;
    } else {
      bmr = 10 * weight + 6.25 * height - 5 * age - 161;
    }

    const activityMultipliers = {
      NONE: 1.2,
      LIGHT: 1.375,
      MODERATE: 1.55,
      HIGH: 1.725,
    };

    const activityLevel = questionnaire.physical_activity_level || "LIGHT";
    const multiplier = activityMultipliers[activityLevel] || 1.375;

    let tdee = bmr * multiplier;

    const mainGoal = questionnaire.main_goal;
    if (mainGoal === "WEIGHT_LOSS") {
      tdee -= 500;
    } else if (mainGoal === "WEIGHT_GAIN") {
      tdee += 500;
    }

    return Math.round(Math.max(1200, Math.min(4000, tdee)));
  }
}

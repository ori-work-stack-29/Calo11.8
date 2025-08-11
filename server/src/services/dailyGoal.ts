import { prisma } from "../lib/database";

export class DailyGoalsService {
  static async createOrUpdateDailyGoals(userId: string) {
    try {
      console.log(`📊 Creating/updating daily goals for user: ${userId}`);

      // Get user questionnaire data
      const questionnaire = await prisma.userQuestionnaire.findFirst({
        where: { user_id: userId },
        orderBy: { date_completed: "desc" },
      });

      if (!questionnaire) {
        console.log("No questionnaire found, using default goals");
      }

      // Calculate daily goals based on questionnaire
      const dailyGoals = this.calculateDailyGoals(questionnaire);

      // Check if daily goals already exist
      const existingGoals = await prisma.dailyGoal.findFirst({
        where: { user_id: userId },
      });

      let savedGoals;
      if (existingGoals) {
        // Update existing goals
        savedGoals = await prisma.dailyGoal.update({
          where: { id: existingGoals.id },
          data: dailyGoals,
        });
      } else {
        // Create new goals
        savedGoals = await prisma.dailyGoal.create({
          data: {
            id: `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            user_id: userId,
            ...dailyGoals,
            updated_at: new Date(),
          },
        });
      }

      console.log("✅ Daily goals saved successfully");
      return savedGoals;
    } catch (error) {
      console.error("Error creating/updating daily goals:", error);
      throw error;
    }
  }

  private static calculateDailyGoals(questionnaire: any) {
    // Default values
    let baseCalories = 2000;
    let baseProtein = 120;
    let baseCarbs = 250;
    let baseFats = 70;
    let baseWaterMl = 2500;

    if (questionnaire) {
      // Calculate BMR using Harris-Benedict equation
      const weight = questionnaire.weight_kg || 70;
      const height = questionnaire.height_cm || 170;
      const age = questionnaire.age || 25;
      const gender = questionnaire.gender || "MALE";

      let bmr;
      if (gender === "MALE") {
        bmr = 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age;
      } else {
        bmr = 447.593 + 9.247 * weight + 3.098 * height - 4.33 * age;
      }

      // Apply activity level multiplier
      const activityMultipliers = {
        NONE: 1.2,
        LIGHT: 1.375,
        MODERATE: 1.55,
        HIGH: 1.725,
      };

      const activityLevel = questionnaire.physical_activity_level || "MODERATE";
      const tdee = bmr * (activityMultipliers[activityLevel] || 1.55);

      // Adjust based on goal
      switch (questionnaire.main_goal) {
        case "WEIGHT_LOSS":
          baseCalories = Math.round(tdee - 500); // 500 calorie deficit
          break;
        case "WEIGHT_GAIN":
          baseCalories = Math.round(tdee + 300); // 300 calorie surplus
          break;
        case "WEIGHT_MAINTENANCE":
        default:
          baseCalories = Math.round(tdee);
          break;
      }

      // Calculate macros (protein: 1.6g/kg, carbs: 45-65% of calories, fats: 20-35%)
      baseProtein = Math.round(weight * 1.6);
      baseCarbs = Math.round((baseCalories * 0.5) / 4); // 50% of calories from carbs
      baseFats = Math.round((baseCalories * 0.25) / 9); // 25% of calories from fats

      // Water based on weight (35ml per kg)
      baseWaterMl = Math.round(weight * 35);
    }

    return {
      calories: baseCalories,
      protein_g: baseProtein,
      carbs_g: baseCarbs,
      fats_g: baseFats,
      fiber_g: 25,
      water_ml: baseWaterMl,
      sodium_mg: 2300,
      sugar_g: 50,
      updated_at: new Date(),
    };
  }

  static async getDailyGoals(userId: string) {
    try {
      const goals = await prisma.dailyGoal.findFirst({
        where: { user_id: userId },
      });

      if (!goals) {
        // Create default goals if none exist
        return await this.createOrUpdateDailyGoals(userId);
      }

      return goals;
    } catch (error) {
      console.error("Error fetching daily goals:", error);
      throw error;
    }
  }
}

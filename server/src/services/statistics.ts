import { prisma } from "../lib/database";
import { AchievementService } from "./achievements";

export interface Achievement {
  id: string;
  key: string;
  title: string;
  description: string;
  category: string;
  xpReward: number;
  icon: string;
  rarity: string;
  progress: number;
  maxProgress: number;
  unlocked: boolean;
  unlockedDate?: string;
}

export interface StatisticsData {
  level: number;
  currentXP: number;
  totalPoints: number;
  currentStreak: number;
  weeklyStreak: number;
  perfectDays: number;
  dailyGoalDays: number;
  totalDays: number;
  averageCalories: number;
  averageProtein: number;
  averageCarbs: number;
  averageFats: number;
  averageFiber: number;
  averageSugar: number;
  averageSodium: number;
  averageFluids: number;
  achievements: any[];
  badges: any[];
  dailyBreakdown: any[];
  successfulDays: number;
  averageCompletion: number;
  bestStreak: number;
  happyDays: number;
  highEnergyDays: number;
  satisfiedDays: number;
  averageMealQuality: number;
}

interface UserStats {
  currentStreak: number;
  bestStreak: number;
  totalCompleteDays: number;
  level: number;
  totalWaterGoals: number;
  totalCalorieGoals: number;
  totalXP: number;
  aiRequestsCount: number;
}

export class StatisticsService {
  static async getNutritionStatistics(
    userId: string,
    period: "today" | "week" | "month" = "week"
  ): Promise<{ success: boolean; data: StatisticsData }> {
    try {
      console.log(
        `📊 Getting statistics for user: ${userId}, period: ${period}`
      );

      const now = new Date();
      let startDate: Date;

      switch (period) {
        case "today":
          startDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
          );
          break;
        case "week":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "month":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }

      // Get user's meals for the period
      const meals = await prisma.meal.findMany({
        where: {
          user_id: userId,
          created_at: {
            gte: startDate,
            lte: now,
          },
        },
        orderBy: {
          created_at: "desc",
        },
      });

      // Get user data for level and XP
      const user = await prisma.user.findUnique({
        where: { user_id: userId },
        select: {
          level: true,
          current_xp: true,
          total_points: true,
          current_streak: true,
          best_streak: true,
          total_complete_days: true,
          ai_requests_count: true,
        },
      });

      // Get user's daily goals
      const dailyGoals = await prisma.dailyGoal.findMany({
        where: {
          user_id: userId,
          date: {
            gte: startDate,
            lte: now,
          },
        },
        orderBy: {
          date: "desc",
        },
      });

      // Get water intake data
      const waterIntakes = await prisma.waterIntake.findMany({
        where: {
          user_id: userId,
          date: {
            gte: startDate,
            lte: now,
          },
        },
        orderBy: {
          date: "desc",
        },
      });

      // Calculate daily breakdown
      const dailyBreakdown = await this.calculateDailyBreakdown(
        meals,
        dailyGoals,
        waterIntakes,
        startDate,
        now
      );

      // Calculate averages
      const averages = this.calculateAverages(meals);

      // Get water intake count for achievements
      const waterIntakeCount = await prisma.waterIntake.count({
        where: {
          user_id: userId,
          cups_consumed: { gte: 8 },
        },
      });

      // Get calorie goal completions
      const mealDays = await prisma.meal.groupBy({
        by: ["upload_time"],
        where: { user_id: userId },
        _sum: { calories: true },
        having: {
          calories: { _sum: { gte: 1800 } },
        },
      });

      const userStats: UserStats = {
        currentStreak: user?.current_streak || 0,
        bestStreak: user?.best_streak || 0,
        totalCompleteDays: user?.total_complete_days || 0,
        level: user?.level || 1,
        totalWaterGoals: waterIntakeCount,
        totalCalorieGoals: mealDays.length,
        totalXP: user?.total_points || 0,
        aiRequestsCount: user?.ai_requests_count || 0,
      };

      // Calculate streaks and achievements
      const streaks = await this.calculateStreaks(userId, userStats);

      // Get achievements and badges
      const achievementData = await this.getDetailedAchievements(
        userId,
        userStats
      );

      // Calculate wellbeing metrics
      const wellbeingMetrics = await this.calculateWellbeingMetrics(
        userId,
        startDate,
        now
      );

      const statisticsData: StatisticsData = {
        level: user?.level || 1,
        currentXP: user?.current_xp || 0,
        totalPoints: user?.total_points || 0,
        currentStreak: userStats.currentStreak,
        weeklyStreak: Math.floor(userStats.currentStreak / 7),
        perfectDays: wellbeingMetrics.perfectDays,
        dailyGoalDays: dailyGoals.length,
        totalDays: Math.ceil(
          (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
        ),
        averageCalories: averages.calories,
        averageProtein: averages.protein,
        averageCarbs: averages.carbs,
        averageFats: averages.fats,
        averageFiber: averages.fiber,
        averageSugar: averages.sugar,
        averageSodium: averages.sodium,
        averageFluids: averages.fluids,
        achievements: achievementData,
        dailyBreakdown,
        successfulDays: streaks.successfulDays,
        averageCompletion: streaks.averageCompletion,
        bestStreak: userStats.bestStreak,
        happyDays: wellbeingMetrics.happyDays,
        highEnergyDays: wellbeingMetrics.highEnergyDays,
        satisfiedDays: wellbeingMetrics.satisfiedDays,
        averageMealQuality: wellbeingMetrics.averageMealQuality,
      };

      console.log(`✅ Statistics calculated successfully for user: ${userId}`);
      return { success: true, data: statisticsData };
    } catch (error) {
      console.error("❌ Error getting statistics:", error);
      throw error;
    }
  }

  private static async getDetailedAchievements(
    userId: string,
    userStats: UserStats
  ): Promise<Achievement[]> {
    try {
      // Get all achievements from database
      const allAchievements = await prisma.achievement.findMany({
        where: { is_active: true },
        orderBy: { points_awarded: "asc" },
      });

      // Get user's achievement progress
      const userAchievements = await prisma.userAchievement.findMany({
        where: { user_id: userId },
      });

      const userAchievementMap = new Map(
        userAchievements.map((ua) => [ua.achievement_id, ua])
      );

      return allAchievements.map((achievement) => {
        const userAchievement = userAchievementMap.get(achievement.id);
        const currentProgress = this.calculateAchievementProgress(
          achievement,
          userStats
        );

        return {
          id: achievement.id,
          key: achievement.key,
          title: achievement.title,
          description: achievement.description,
          category: achievement.category,
          xpReward: achievement.points_awarded,
          icon: achievement.icon || "trophy",
          rarity: achievement.rarity,
          progress: userAchievement?.unlocked
            ? achievement.max_progress
            : currentProgress,
          maxProgress: achievement.max_progress,
          unlocked: userAchievement?.unlocked || false,
          unlockedDate: userAchievement?.unlocked_date?.toISOString(),
        };
      });
    } catch (error) {
      console.error("Error getting detailed achievements:", error);
      return [];
    }
  }

  private static calculateAchievementProgress(
    achievement: any,
    userStats: UserStats
  ): number {
    switch (achievement.key) {
      case "first_scan":
        return Math.min(userStats.aiRequestsCount, 1);
      case "first_water_goal":
        return Math.min(userStats.totalWaterGoals, 1);
      case "water_warrior":
        return Math.min(userStats.totalWaterGoals, 10);
      case "hydration_habit":
        return Math.min(userStats.totalWaterGoals, 7);
      case "aqua_master":
        return Math.min(userStats.totalWaterGoals, 30);
      case "first_complete_day":
        return Math.min(userStats.totalCompleteDays, 1);
      case "total_5_days":
        return Math.min(userStats.totalCompleteDays, 5);
      case "total_10_days":
        return Math.min(userStats.totalCompleteDays, 10);
      case "total_25_days":
        return Math.min(userStats.totalCompleteDays, 25);
      case "total_50_days":
        return Math.min(userStats.totalCompleteDays, 50);
      case "total_100_days":
        return Math.min(userStats.totalCompleteDays, 100);
      case "streak_3_days":
        return Math.min(userStats.currentStreak, 3);
      case "streak_7_days":
        return Math.min(userStats.currentStreak, 7);
      case "streak_14_days":
        return Math.min(userStats.currentStreak, 14);
      case "streak_30_days":
        return Math.min(userStats.currentStreak, 30);
      case "streak_100_days":
        return Math.min(userStats.currentStreak, 100);
      case "level_5":
        return Math.min(userStats.level, 5);
      case "level_10":
        return Math.min(userStats.level, 10);
      case "level_25":
        return Math.min(userStats.level, 25);
      case "level_50":
        return Math.min(userStats.level, 50);
      default:
        return 0;
    }
  }

  private static async calculateDailyBreakdown(
    meals: any[],
    dailyGoals: any[],
    waterIntakes: any[],
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    const dailyBreakdown: any[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split("T")[0];
      const dayMeals = meals.filter(
        (meal) => meal.created_at.toISOString().split("T")[0] === dateStr
      );

      const dayGoal = dailyGoals.find(
        (goal) => goal.date.toISOString().split("T")[0] === dateStr
      );

      const dayWater = waterIntakes.find(
        (water) => water.date.toISOString().split("T")[0] === dateStr
      );

      const dayTotals = dayMeals.reduce(
        (acc, meal) => ({
          calories: acc.calories + (meal.calories || 0),
          protein_g: acc.protein_g + (meal.protein_g || 0),
          carbs_g: acc.carbs_g + (meal.carbs_g || 0),
          fats_g: acc.fats_g + (meal.fats_g || 0),
          fiber_g: acc.fiber_g + (meal.fiber_g || 0),
          sugar_g: acc.sugar_g + (meal.sugar_g || 0),
          sodium_mg: acc.sodium_mg + (meal.sodium_mg || 0),
          liquids_ml: acc.liquids_ml + (meal.liquids_ml || 0),
        }),
        {
          calories: 0,
          protein_g: 0,
          carbs_g: 0,
          fats_g: 0,
          fiber_g: 0,
          sugar_g: 0,
          sodium_mg: 0,
          liquids_ml: dayWater?.milliliters_consumed || 0,
        }
      );

      dailyBreakdown.push({
        date: dateStr,
        ...dayTotals,
        water_cups: dayWater?.cups_consumed || 0,
        mood: "neutral",
        energy: "medium",
        satiety: "satisfied",
        meal_quality: 3,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dailyBreakdown;
  }

  private static calculateAverages(meals: any[]): {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    fiber: number;
    sugar: number;
    sodium: number;
    fluids: number;
  } {
    if (meals.length === 0) {
      return {
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
        fiber: 0,
        sugar: 0,
        sodium: 0,
        fluids: 0,
      };
    }

    // Group by date to get daily averages
    const dailyTotals = new Map<string, any>();
    meals.forEach((meal) => {
      const date = meal.upload_time.toISOString().split("T")[0];
      if (!dailyTotals.has(date)) {
        dailyTotals.set(date, {
          calories: 0,
          protein: 0,
          carbs: 0,
          fats: 0,
          fiber: 0,
          sugar: 0,
          sodium: 0,
          fluids: 0,
        });
      }
      const dayTotal = dailyTotals.get(date);
      dayTotal.calories += meal.calories || 0;
      dayTotal.protein += meal.protein_g || 0;
      dayTotal.carbs += meal.carbs_g || 0;
      dayTotal.fats += meal.fats_g || 0;
      dayTotal.fiber += meal.fiber_g || 0;
      dayTotal.sugar += meal.sugar_g || 0;
      dayTotal.sodium += meal.sodium_mg || 0;
      dayTotal.fluids += meal.liquids_ml || 0;
    });

    const numDays = dailyTotals.size || 1;
    const dailyValues = Array.from(dailyTotals.values());
    const averages = dailyValues.reduce(
      (acc, day) => ({
        calories: acc.calories + day.calories,
        protein: acc.protein + day.protein,
        carbs: acc.carbs + day.carbs,
        fats: acc.fats + day.fats,
        fiber: acc.fiber + day.fiber,
        sugar: acc.sugar + day.sugar,
        sodium: acc.sodium + day.sodium,
        fluids: acc.fluids + day.fluids,
      }),
      {
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
        fiber: 0,
        sugar: 0,
        sodium: 0,
        fluids: 0,
      }
    );

    return {
      calories: Math.round(averages.calories / numDays),
      protein: Math.round(averages.protein / numDays),
      carbs: Math.round(averages.carbs / numDays),
      fats: Math.round(averages.fats / numDays),
      fiber: Math.round(averages.fiber / numDays),
      sugar: Math.round(averages.sugar / numDays),
      sodium: Math.round(averages.sodium / numDays),
      fluids: Math.round(averages.fluids / numDays),
    };
  }

  private static async calculateStreaks(
    userId: string,
    userStats: UserStats
  ): Promise<{
    currentStreak: number;
    weeklyStreak: number;
    perfectDays: number;
    successfulDays: number;
    averageCompletion: number;
    bestStreak: number;
  }> {
    try {
      // Get all water intake and meal data for comprehensive analysis
      const allWaterIntakes = await prisma.waterIntake.findMany({
        where: { user_id: userId },
        orderBy: { date: "desc" },
      });

      const allMeals = await prisma.meal.findMany({
        where: { user_id: userId },
        orderBy: { created_at: "desc" },
      });

      // Group meals by date
      const mealsByDate = new Map<string, any[]>();
      allMeals.forEach((meal) => {
        const date = meal.created_at.toISOString().split("T")[0];
        if (!mealsByDate.has(date)) {
          mealsByDate.set(date, []);
        }
        mealsByDate.get(date)!.push(meal);
      });

      let perfectDays = 0;
      let successfulDays = 0;
      let totalCompletion = 0;

      // Calculate completion metrics based on both water and nutrition
      for (const waterRecord of allWaterIntakes) {
        const date = waterRecord.date.toISOString().split("T")[0];
        const dayMeals = mealsByDate.get(date) || [];

        const cups = waterRecord.cups_consumed || 0;
        const dailyCalories = dayMeals.reduce(
          (sum, meal) => sum + (meal.calories || 0),
          0
        );

        // Water completion (40% weight)
        const waterCompletion = Math.min(100, (cups / 8) * 100);

        // Nutrition completion (60% weight)
        const nutritionCompletion = Math.min(100, (dailyCalories / 1800) * 100);

        // Overall completion
        const overallCompletion =
          waterCompletion * 0.4 + nutritionCompletion * 0.6;
        totalCompletion += overallCompletion;

        if (overallCompletion >= 80) {
          successfulDays++;
          if (overallCompletion >= 95 && cups >= 10 && dailyCalories >= 1600) {
            perfectDays++;
          }
        }
      }

      const currentStreak = userStats.currentStreak;
      const bestStreak = userStats.bestStreak;
      const weeklyStreak = Math.floor(currentStreak / 7);
      const averageCompletion =
        allWaterIntakes.length > 0
          ? totalCompletion / allWaterIntakes.length
          : 0;

      return {
        currentStreak,
        weeklyStreak,
        perfectDays,
        successfulDays,
        averageCompletion: Math.round(averageCompletion),
        bestStreak,
      };
    } catch (error) {
      console.error("Error calculating streaks:", error);
      return {
        currentStreak: 0,
        weeklyStreak: 0,
        perfectDays: 0,
        successfulDays: 0,
        averageCompletion: 0,
        bestStreak: 0,
      };
    }
  }

  private static async calculateWellbeingMetrics(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    happyDays: number;
    highEnergyDays: number;
    satisfiedDays: number;
    averageMealQuality: number;
    perfectDays: number;
  }> {
    try {
      // Calculate wellbeing based on nutrition completion
      const meals = await prisma.meal.findMany({
        where: {
          user_id: userId,
          created_at: { gte: startDate, lte: endDate },
        },
      });

      const waterIntakes = await prisma.waterIntake.findMany({
        where: {
          user_id: userId,
          date: { gte: startDate, lte: endDate },
        },
      });

      // Group by date for daily analysis
      const dailyData = new Map<
        string,
        {
          calories: number;
          water: number;
          mealCount: number;
          quality: number;
        }
      >();

      // Process meals
      meals.forEach((meal) => {
        const date = meal.created_at.toISOString().split("T")[0];
        if (!dailyData.has(date)) {
          dailyData.set(date, {
            calories: 0,
            water: 0,
            mealCount: 0,
            quality: 0,
          });
        }
        const day = dailyData.get(date)!;
        day.calories += meal.calories || 0;
        day.mealCount += 1;

        // Calculate meal quality based on nutritional completeness
        const proteinScore = Math.min(1, (meal.protein_g || 0) / 30); // 30g per meal target
        const fiberScore = Math.min(1, (meal.fiber_g || 0) / 8); // 8g per meal target
        const calorieScore =
          meal.calories >= 300 && meal.calories <= 800 ? 1 : 0.5;
        day.quality = Math.max(
          day.quality,
          ((proteinScore + fiberScore + calorieScore) / 3) * 5
        );
      });

      // Process water intake
      waterIntakes.forEach((water) => {
        const date = water.date.toISOString().split("T")[0];
        if (!dailyData.has(date)) {
          dailyData.set(date, {
            calories: 0,
            water: 0,
            mealCount: 0,
            quality: 3,
          });
        }
        dailyData.get(date)!.water = water.cups_consumed || 0;
      });

      let happyDays = 0;
      let highEnergyDays = 0;
      let satisfiedDays = 0;
      let totalQuality = 0;
      let qualityDays = 0;
      let perfectDays = 0;

      // Analyze each day
      dailyData.forEach((day) => {
        // Happy days: good calorie intake + adequate water
        if (day.calories >= 1500 && day.calories <= 2200 && day.water >= 6) {
          happyDays++;
        }

        // High energy days: balanced nutrition + good hydration
        if (day.calories >= 1600 && day.water >= 8 && day.mealCount >= 3) {
          highEnergyDays++;
        }

        // Satisfied days: met calorie goals + reasonable meal frequency
        if (day.calories >= 1400 && day.mealCount >= 2) {
          satisfiedDays++;
        }

        // Perfect days: excellent nutrition + hydration + meal frequency
        if (
          day.calories >= 1600 &&
          day.calories <= 2200 &&
          day.water >= 8 &&
          day.mealCount >= 3 &&
          day.quality >= 4
        ) {
          perfectDays++;
        }

        if (day.quality > 0) {
          totalQuality += day.quality;
          qualityDays++;
        }
      });

      return {
        happyDays,
        highEnergyDays,
        satisfiedDays,
        averageMealQuality: qualityDays > 0 ? totalQuality / qualityDays : 3,
        perfectDays,
      };
    } catch (error) {
      console.error("Error calculating wellbeing metrics:", error);
      return {
        happyDays: 0,
        highEnergyDays: 0,
        satisfiedDays: 0,
        averageMealQuality: 3,
        perfectDays: 0,
      };
    }
  }

  static async generatePDFReport(userId: string): Promise<Buffer> {
    // This would generate a PDF report - placeholder for now
    return Buffer.from("PDF Report");
  }

  static async generateInsights(userId: string): Promise<any> {
    try {
      const statistics = await this.getNutritionStatistics(userId, "month");

      const insights = {
        mainInsights: [
          {
            type: "protein",
            message: `You're meeting protein goals ${Math.round(
              (statistics.data.averageProtein / 120) * 100
            )}% of days this month.`,
            category: "nutrition",
          },
          {
            type: "hydration",
            message: `Your water intake averaged ${statistics.data.averageFluids}ml daily.`,
            category: "lifestyle",
          },
          {
            type: "streak",
            message: `Current streak: ${statistics.data.currentStreak} days!`,
            category: "motivation",
          },
        ],
        recommendations: [
          {
            type: "fiber",
            message: "Consider adding more fiber-rich foods to your diet.",
            priority: "medium",
          },
          {
            type: "sodium",
            message: "Try to reduce sodium intake by limiting processed foods.",
            priority: "high",
          },
        ],
      };

      return { success: true, data: insights };
    } catch (error) {
      console.error("Error generating insights:", error);
      throw error;
    }
  }
}

// Remove the basicAchievements array since we're using the database

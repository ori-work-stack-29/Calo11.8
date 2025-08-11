import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Modal,
  TextInput,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/src/i18n/context/LanguageContext";
import { useTheme } from "@/src/context/ThemeContext";
import {
  ChefHat,
  Calendar,
  Clock,
  Star,
  MessageSquare,
  ArrowLeft,
  Filter,
  RefreshCw,
  Heart,
  HeartOff,
  Utensils,
  X,
  Check,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Target,
  TrendingUp,
  Award,
  Plus,
  Minus,
} from "lucide-react-native";
import { api, mealPlanAPI } from "@/src/services/api";
import LoadingScreen from "@/components/LoadingScreen";

const { width } = Dimensions.get("window");

interface MealPlan {
  plan_id: string;
  name: string;
  description?: string;
  start_date: string;
  end_date?: string;
  is_active: boolean;
  target_calories_daily?: number;
  target_protein_daily?: number;
  target_carbs_daily?: number;
  target_fats_daily?: number;
  weekly_plan: {
    [day: string]: {
      [timing: string]: PlanMeal[];
    };
  };
  days_count: number; // Added for clarity in calculations
}

interface PlanMeal {
  template_id: string;
  name: string;
  description?: string;
  meal_timing: string;
  dietary_category: string;
  prep_time_minutes?: number;
  difficulty_level?: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
  ingredients: string[];
  instructions: string[];
  allergens: string[];
  image_url?: string;
  user_rating?: number;
  user_comments?: string;
  is_favorite?: boolean;
}

interface SwapRequest {
  currentMeal: PlanMeal;
  dayName: string;
  mealTiming: string;
  preferences?: {
    dietary_category?: string;
    max_prep_time?: number;
    protein_preference?: "higher" | "lower" | "same";
    calorie_preference?: "higher" | "lower" | "same";
  };
}

export default function ActiveMenuScreen() {
  const { t } = useTranslation();
  const { isRTL, language } = useLanguage();
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { planId } = useLocalSearchParams();

  // State management
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedMeal, setSelectedMeal] = useState<PlanMeal | null>(null);
  const [showMealModal, setShowMealModal] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showCompletePlanModal, setShowCompletePlanModal] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [completionFeedback, setCompletionFeedback] = useState({
    rating: 0,
    liked: "",
    disliked: "",
    suggestions: "",
  });

  // Calendar state
  const [currentWeekStart, setCurrentWeekStart] = useState(new Date());
  const [weekDays, setWeekDays] = useState<Date[]>([]);

  // Meal interaction state
  const [mealRatings, setMealRatings] = useState<{ [key: string]: number }>({});
  const [mealComments, setMealComments] = useState<{ [key: string]: string }>(
    {}
  );
  const [mealFavorites, setMealFavorites] = useState<{
    [key: string]: boolean;
  }>({});

  // Filter state
  const [filters, setFilters] = useState({
    dietary_category: "all",
    min_rating: 0,
    favorites_only: false,
    meal_timing: "all",
  });

  // Temporary inputs
  const [tempRating, setTempRating] = useState(0);
  const [tempComment, setTempComment] = useState("");

  useEffect(() => {
    loadMealPlan();
    initializeCalendar();
  }, [planId]);

  useEffect(() => {
    generateWeekDays();
  }, [currentWeekStart]);

  const initializeCalendar = () => {
    const today = new Date();

    if (!mealPlan) {
      // If mealPlan is not loaded yet, set a default based on today
      const startOfWeek = new Date(today);
      startOfWeek.setDate(
        today.getDay() === 0
          ? today.getDate() - 6
          : today.getDate() - today.getDay() + 1
      ); // Start from Monday
      setCurrentWeekStart(startOfWeek);
      setSelectedDay(today.getDay() === 0 ? 6 : today.getDay() - 1); // Convert to 0-6 where Monday = 0
      setSelectedDate(today);
      return;
    }

    // If we have a meal plan with a start date, use that as reference
    if (mealPlan?.start_date) {
      const planStartDate = new Date(mealPlan.start_date);
      const daysSinceStart = Math.max(
        0,
        Math.floor(
          (today.getTime() - planStartDate.getTime()) / (1000 * 60 * 60 * 24)
        )
      );

      // Calculate which week we're in relative to plan start
      const weeksCompleted = Math.floor(daysSinceStart / 7);
      const currentWeekStartDate = new Date(planStartDate);
      currentWeekStartDate.setDate(
        planStartDate.getDate() + weeksCompleted * 7
      );

      // Set current day relative to plan start (0-6, where 0 is the plan start day)
      const currentDayInPlan = daysSinceStart % mealPlan.days_count; // Use mealPlan.days_count

      console.log("📅 Date calculation:", {
        currentDate: today.toDateString(),
        planStartDate: planStartDate.toDateString(),
        daysSinceStart,
        currentDayInPlan,
        daysCount: mealPlan.days_count,
      });

      setCurrentWeekStart(currentWeekStartDate);
      setSelectedDay(currentDayInPlan);
      setSelectedDate(
        new Date(planStartDate.getTime() + daysSinceStart * 24 * 60 * 60 * 1000)
      );
    } else {
      // Fallback to regular week calculation if start_date is missing (should not happen ideally)
      const startOfWeek = new Date(today);
      startOfWeek.setDate(
        today.getDay() === 0
          ? today.getDate() - 6
          : today.getDate() - today.getDay() + 1
      ); // Start from Monday
      setCurrentWeekStart(startOfWeek);
      setSelectedDay(today.getDay() === 0 ? 6 : today.getDay() - 1); // Convert to 0-6 where Monday = 0
      setSelectedDate(today);
    }
  };

  const generateWeekDays = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(currentWeekStart);
      day.setDate(currentWeekStart.getDate() + i);
      days.push(day);
    }
    setWeekDays(days);
  };

  const loadMealPlan = async () => {
    try {
      setIsLoading(true);
      console.log("📋 Loading meal plan, planId:", planId);

      let response;
      if (planId && planId !== "undefined" && planId !== "null") {
        // Load specific plan by ID
        console.log("🔍 Loading specific plan:", planId);
        response = await api.get(`/meal-plans/${planId}`);
      } else {
        // Load current active plan
        console.log("🔍 Loading current active plan");
        response = await api.get("/meal-plans/current");
      }

      console.log("📥 Full API response:", response.data);

      if (
        response.data.success &&
        (response.data.data || response.data.hasActivePlan)
      ) {
        let planData = response.data.data;
        let startDate = new Date();
        let planName = "Active Plan";
        let actualPlanId = planId;
        let daysCount = 7; // Default to 7 days

        // Handle different response structures
        if (response.data.hasActivePlan && response.data.data) {
          planData = response.data.data;
          actualPlanId = response.data.planId;
          planName = response.data.planName || "Active Plan";
        }

        // If planData is null but we have hasActivePlan, try to get it from server
        if (!planData && response.data.hasActivePlan) {
          console.log("🔄 Plan exists but no data, trying to fetch again...");
          const retryResponse = await api.get(
            `/meal-plans/${response.data.planId || actualPlanId}`
          );
          if (retryResponse.data.success && retryResponse.data.data) {
            planData = retryResponse.data.data;
          }
        }

        if (!planData || Object.keys(planData).length === 0) {
          console.log("⚠️ Empty or missing meal plan data");
          setMealPlan(null);
          return;
        }

        console.log("✅ Processing meal plan data:", Object.keys(planData));

        // Determine days_count from planData, falling back to default or calculated
        if (planData.days_count) {
          daysCount = planData.days_count;
        } else if (planData.rotation_frequency_days) {
          daysCount = planData.rotation_frequency_days;
        } else {
          // Try to infer from weekly_plan if not explicitly provided
          const inferredDays = Object.keys(
            planData.weekly_plan || planData
          ).length;
          if (inferredDays > 0) {
            daysCount = inferredDays;
          }
        }
        console.log("📏 Determined days_count:", daysCount);

        const weeklyPlan = planData.weekly_plan || planData;
        let hasMeals = false;
        let totalDays = 0;

        Object.entries(weeklyPlan).forEach(([day, timings]) => {
          if (timings && typeof timings === "object") {
            totalDays++;
            const timingCount = Object.keys(timings).length;
            console.log(`  📅 ${day}: ${timingCount} meal timings`);

            Object.entries(timings).forEach(([timing, meals]) => {
              if (Array.isArray(meals) && meals.length > 0) {
                console.log(`    🍽️ ${timing}: ${meals.length} meals`);
                hasMeals = true;
              }
            });
          }
        });

        if (!hasMeals) {
          console.log("⚠️ No meals found in plan data");
          setMealPlan(null);
          return;
        }

        // Try to get the actual start date from server data
        if (planData.start_date) {
          startDate = new Date(planData.start_date);
        } else if (response.data.start_date) {
          startDate = new Date(response.data.start_date);
        } else {
          // If no start date found, use today as a fallback (though this might be less accurate)
          console.warn(
            "⚠️ No start date found for meal plan, using today as reference."
          );
          startDate = new Date();
        }

        // Create meal plan object with proper structure
        const mealPlanData: MealPlan = {
          plan_id: actualPlanId || "unknown",
          name: planName,
          description: planData.description || "Active meal plan",
          start_date: startDate.toISOString(),
          end_date: planData.end_date,
          is_active: true,
          target_calories_daily: planData.target_calories_daily,
          target_protein_daily: planData.target_protein_daily,
          target_carbs_daily: planData.target_carbs_daily,
          target_fats_daily: planData.target_fats_daily,
          weekly_plan: weeklyPlan,
          days_count: daysCount, // Store the determined days_count
        };

        setMealPlan(mealPlanData);
        // initializeCalendar will be called again after state update, which is fine
        // Or we can call it here directly to avoid redundant call
        initializeCalendar(); // Ensure calendar is initialized with the loaded plan

        // Initialize local state from existing data
        const ratings: { [key: string]: number } = {};
        const comments: { [key: string]: string } = {};
        const favorites: { [key: string]: boolean } = {};

        if (weeklyPlan && typeof weeklyPlan === "object") {
          Object.entries(weeklyPlan).forEach(([day, timings]) => {
            if (timings && typeof timings === "object") {
              Object.entries(timings).forEach(([timing, meals]) => {
                if (Array.isArray(meals)) {
                  meals.forEach((meal: PlanMeal) => {
                    if (meal && meal.template_id) {
                      const key = `${day}-${timing}-${meal.template_id}`;
                      ratings[key] = meal.user_rating || 0;
                      comments[key] = meal.user_comments || "";
                      favorites[key] = meal.is_favorite || false;
                    }
                  });
                }
              });
            }
          });
        }

        setMealRatings(ratings);
        setMealComments(comments);
        setMealFavorites(favorites);

        console.log("✅ Meal plan loaded and structured successfully");
        console.log("📊 Total meals loaded:", Object.values(ratings).length);
      } else {
        console.log("⚠️ No active meal plan found from server");
        setMealPlan(null);
      }
    } catch (error) {
      console.error("💥 Error loading meal plan:", error);
      setMealPlan(null);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMealPlan();
    setRefreshing(false);
  }, [planId]);

  const handleMealPress = (meal: PlanMeal, dayName: string, timing: string) => {
    setSelectedMeal(meal);
    const key = `${dayName}-${timing}-${meal.template_id}`;
    setTempRating(mealRatings[key] || 0);
    setTempComment(mealComments[key] || "");
    setShowMealModal(true);
  };

  const handleRatingChange = (rating: number) => {
    setTempRating(rating);
  };

  const handleSaveMealInteraction = async () => {
    if (!selectedMeal || !mealPlan) return;

    const dayName = getDayNames()[selectedDay];
    const key = `${dayName}-${selectedMeal.meal_timing}-${selectedMeal.template_id}`;

    try {
      // Optimistically update local state
      setMealRatings((prev) => ({ ...prev, [key]: tempRating }));
      setMealComments((prev) => ({ ...prev, [key]: tempComment }));

      // Save to backend
      await api.put(
        `/meal-plans/${mealPlan.plan_id}/meals/${selectedMeal.template_id}/interaction`,
        {
          rating: tempRating,
          comments: tempComment.trim() || undefined,
          day: dayName,
          meal_timing: selectedMeal.meal_timing,
        }
      );

      setShowMealModal(false);
    } catch (error) {
      console.error("💥 Error saving meal interaction:", error);

      // Revert optimistic update
      setMealRatings((prev) => {
        const updated = { ...prev };
        if (prev[key]) delete updated[key];
        return updated;
      });
      setMealComments((prev) => {
        const updated = { ...prev };
        if (prev[key]) delete updated[key];
        return updated;
      });

      Alert.alert(
        language === "he" ? "שגיאה" : "Error",
        language === "he"
          ? "נכשל בשמירת הדירוג. נסה שוב."
          : "Failed to save rating. Please try again."
      );
    }
  };

  const handleToggleFavorite = async (
    meal: PlanMeal,
    dayName: string,
    timing: string
  ) => {
    const key = `${dayName}-${timing}-${meal.template_id}`;
    const newFavoriteState = !mealFavorites[key];

    try {
      // Optimistically update
      setMealFavorites((prev) => ({ ...prev, [key]: newFavoriteState }));

      await api.put(
        `/meal-plans/${mealPlan?.plan_id}/meals/${meal.template_id}/favorite`,
        {
          is_favorite: newFavoriteState,
          day: dayName,
          meal_timing: timing,
        }
      );
    } catch (error) {
      console.error("💥 Error toggling favorite:", error);

      // Revert optimistic update
      setMealFavorites((prev) => ({ ...prev, [key]: !newFavoriteState }));

      Alert.alert(
        language === "he" ? "שגיאה" : "Error",
        language === "he"
          ? "נכשל בעדכון המועדפים"
          : "Failed to update favorites"
      );
    }
  };

  const handleSwapMeal = (meal: PlanMeal, dayName: string, timing: string) => {
    setSelectedMeal(meal);
    setSwapError(null);
    setShowSwapModal(true);
  };

  const performMealSwap = async (swapRequest: SwapRequest) => {
    if (!mealPlan) return;

    setIsSwapping(true);
    setSwapError(null);

    try {
      console.log("🔄 Requesting AI-powered meal swap...");
      console.log("📋 Swap request:", {
        current_meal: swapRequest.currentMeal.name,
        preferences: swapRequest.preferences,
        day: swapRequest.dayName,
        meal_timing: swapRequest.mealTiming,
      });

      // Mapping day names to numerical index expected by API
      const dayIndexMap = {
        Sunday: 0,
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6,
        ראשון: 0,
        שני: 1,
        שלישי: 2,
        רביעי: 3,
        חמישי: 4,
        שישי: 5,
        שבת: 6,
      };
      const apiDayIndex =
        dayIndexMap[swapRequest.dayName as keyof typeof dayIndexMap];

      const response = await api.put(
        `/meal-plans/${mealPlan.plan_id}/replace`,
        {
          day_of_week: apiDayIndex,
          meal_timing: swapRequest.mealTiming,
          meal_order: 0, // Assuming we are replacing the first meal in the list for that timing
          preferences: {
            ...swapRequest.preferences,
            current_meal_context: {
              name: swapRequest.currentMeal.name,
              calories: swapRequest.currentMeal.calories,
              protein_g: swapRequest.currentMeal.protein_g,
              carbs_g: swapRequest.currentMeal.carbs_g,
              fats_g: swapRequest.currentMeal.fats_g,
              dietary_category: swapRequest.currentMeal.dietary_category,
            },
          },
        }
      );

      if (response.data.success) {
        const newMeal = response.data.data;
        console.log("✅ AI generated new meal:", newMeal.name);

        // Update the meal plan with the new meal
        setMealPlan((prev) => {
          if (!prev) return prev;

          const updated = { ...prev };
          updated.weekly_plan = { ...prev.weekly_plan };
          if (!updated.weekly_plan[swapRequest.dayName]) {
            updated.weekly_plan[swapRequest.dayName] = {};
          }
          if (
            !updated.weekly_plan[swapRequest.dayName][swapRequest.mealTiming]
          ) {
            updated.weekly_plan[swapRequest.dayName][swapRequest.mealTiming] =
              [];
          }

          updated.weekly_plan[swapRequest.dayName][swapRequest.mealTiming] =
            prev.weekly_plan[swapRequest.dayName][swapRequest.mealTiming].map(
              (m) =>
                m.template_id === swapRequest.currentMeal.template_id
                  ? {
                      template_id: newMeal.template_id || `new_${Date.now()}`,
                      name: newMeal.name,
                      description: newMeal.description || "",
                      meal_timing: newMeal.meal_timing,
                      dietary_category: newMeal.dietary_category || "BALANCED",
                      prep_time_minutes: newMeal.prep_time_minutes || 30,
                      difficulty_level: newMeal.difficulty_level || 2,
                      calories: newMeal.calories,
                      protein_g: newMeal.protein_g,
                      carbs_g: newMeal.carbs_g,
                      fats_g: newMeal.fats_g,
                      fiber_g: newMeal.fiber_g || 0,
                      sugar_g: newMeal.sugar_g || 0,
                      sodium_mg: newMeal.sodium_mg || 0,
                      ingredients: Array.isArray(newMeal.ingredients_json)
                        ? newMeal.ingredients_json
                        : newMeal.ingredients || [],
                      instructions: Array.isArray(newMeal.instructions_json)
                        ? newMeal.instructions_json
                        : newMeal.instructions || [],
                      allergens: Array.isArray(newMeal.allergens_json)
                        ? newMeal.allergens_json
                        : [],
                      image_url: newMeal.image_url || null,
                      user_rating: 0,
                      user_comments: "",
                      is_favorite: false,
                    }
                  : m
            );

          return updated;
        });

        setShowSwapModal(false);

        Alert.alert(
          language === "he" ? "הצלחה!" : "Success!",
          language === "he"
            ? `הארוחה הוחלפה ל: ${newMeal.name}`
            : `Meal swapped to: ${newMeal.name}`,
          [
            {
              text: language === "he" ? "אישור" : "OK",
              onPress: () => console.log("✅ Meal swap completed successfully"),
            },
          ]
        );
      } else {
        throw new Error(response.data.error || "Failed to swap meal");
      }
    } catch (error: any) {
      console.error("💥 Error swapping meal:", error);

      let errorMessage = "Failed to swap meal";
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      setSwapError(errorMessage);

      Alert.alert(
        language === "he" ? "שגיאה" : "Error",
        language === "he"
          ? `נכשל בהחלפת הארוחה: ${errorMessage}`
          : `Failed to swap meal: ${errorMessage}`
      );
    } finally {
      setIsSwapping(false);
    }
  };

  const handleCompletePlan = async () => {
    if (!mealPlan) return;

    if (completionFeedback.rating === 0) {
      Alert.alert(
        language === "he" ? "שגיאה" : "Error",
        language === "he" ? "אנא דרג את התוכנית" : "Please rate the plan"
      );
      return;
    }

    try {
      const response = await mealPlanAPI.completePlan(
        mealPlan.plan_id,
        completionFeedback
      );

      if (response.success) {
        setShowCompletePlanModal(false);

        Alert.alert(
          language === "he" ? "תודה!" : "Thank you!",
          language === "he"
            ? "התוכנית הושלמה בהצלחה. המשוב שלך יעזור לנו לשפר!"
            : "Plan completed successfully. Your feedback will help us improve!",
          [
            {
              text: language === "he" ? "אישור" : "OK",
              onPress: () => {
                router.replace("/(tabs)/recommended-menus");
              },
            },
          ]
        );
      } else {
        throw new Error(response.error);
      }
    } catch (error: any) {
      console.error("💥 Error completing plan:", error);
      Alert.alert(
        language === "he" ? "שגיאה" : "Error",
        error.message ||
          (language === "he"
            ? "נכשל בהשלמת התוכנית"
            : "Failed to complete plan")
      );
    }
  };

  const getDayNames = () => {
    if (mealPlan?.start_date) {
      // Get plan start day and create array from that day
      const planStartDate = new Date(mealPlan.start_date);
      const startDayIndex = planStartDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

      const allDays = [
        language === "he" ? "ראשון" : "Sunday",
        language === "he" ? "שני" : "Monday",
        language === "he" ? "שלישי" : "Tuesday",
        language === "he" ? "רביעי" : "Wednesday",
        language === "he" ? "חמישי" : "Thursday",
        language === "he" ? "שישי" : "Friday",
        language === "he" ? "שבת" : "Saturday",
      ];

      // Reorder array to start from plan start day
      const reorderedDays = [
        ...allDays.slice(startDayIndex),
        ...allDays.slice(0, startDayIndex),
      ];

      return reorderedDays;
    }

    // Default fallback
    return [
      language === "he" ? "שני" : "Monday",
      language === "he" ? "שלישי" : "Tuesday",
      language === "he" ? "רביעי" : "Wednesday",
      language === "he" ? "חמישי" : "Thursday",
      language === "he" ? "שישי" : "Friday",
      language === "he" ? "שבת" : "Saturday",
      language === "he" ? "ראשון" : "Sunday",
    ];
  };

  const navigateWeek = (direction: "prev" | "next") => {
    const newWeekStart = new Date(currentWeekStart);
    newWeekStart.setDate(
      currentWeekStart.getDate() + (direction === "next" ? 7 : -7)
    );
    setCurrentWeekStart(newWeekStart);
  };

  const selectDay = (dayIndex: number, date: Date) => {
    console.log("📅 Selecting day:", dayIndex, date.toDateString());
    setSelectedDay(dayIndex);
    setSelectedDate(date);

    // Force re-render of filtered meals
    const dayName = getDayNames()[dayIndex];
    console.log("📅 Selected day name:", dayName);
    console.log(
      "📅 Available meal plan days:",
      mealPlan?.weekly_plan ? Object.keys(mealPlan.weekly_plan) : []
    );
  };

  const getDailyNutritionTotals = () => {
    if (!mealPlan || !mealPlan.weekly_plan) return null;

    const dayName = getDayNames()[selectedDay];
    const dayMeals = mealPlan.weekly_plan[dayName];

    if (!dayMeals) return null;

    let totals = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fats: 0,
      fiber: 0,
    };

    Object.values(dayMeals).forEach((meals) => {
      if (Array.isArray(meals)) {
        meals.forEach((meal) => {
          totals.calories += meal.calories || 0;
          totals.protein += meal.protein_g || 0;
          totals.carbs += meal.carbs_g || 0;
          totals.fats += meal.fats_g || 0;
          totals.fiber += meal.fiber_g || 0;
        });
      }
    });

    return totals;
  };

  const filteredMeals = useMemo(() => {
    const dayName = getDayNames()[selectedDay];
    const dayMeals = mealPlan?.weekly_plan
      ? mealPlan.weekly_plan[dayName]
      : undefined;

    if (!dayMeals) return {};

    const filtered: { [timing: string]: PlanMeal[] } = {};

    if (dayMeals && typeof dayMeals === "object") {
      Object.entries(dayMeals).forEach(([timing, meals]) => {
        if (Array.isArray(meals)) {
          filtered[timing] = meals.filter((meal) => {
            if (!meal || !meal.template_id) return false;

            // Apply filters
            if (
              filters.dietary_category !== "all" &&
              meal.dietary_category !== filters.dietary_category
            ) {
              return false;
            }

            if (
              filters.meal_timing !== "all" &&
              timing !== filters.meal_timing
            ) {
              return false;
            }

            const key = `${dayName}-${timing}-${meal.template_id}`;
            const rating = mealRatings[key] || 0;

            if (rating < filters.min_rating) {
              return false;
            }

            if (filters.favorites_only && !mealFavorites[key]) {
              return false;
            }

            return true;
          });
        } else {
          filtered[timing] = [];
        }
      });
    }

    return filtered;
  }, [mealPlan, selectedDay, filters, mealRatings, mealFavorites]);

  const renderStarRating = (
    rating: number,
    onPress?: (rating: number) => void,
    size: number = 16
  ) => {
    return (
      <View style={styles.starContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => onPress?.(star)}
            style={styles.starButton}
            disabled={!onPress}
          >
            <Star
              size={size}
              color={star <= rating ? "#fbbf24" : colors.border}
              fill={star <= rating ? "#fbbf24" : "transparent"}
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderMealCard = (meal: PlanMeal, dayName: string, timing: string) => {
    const key = `${dayName}-${timing}-${meal.template_id}`;
    const rating = mealRatings[key] || 0;
    const comment = mealComments[key] || "";
    const isFavorite = mealFavorites[key] || false;

    return (
      <TouchableOpacity
        key={meal.template_id}
        style={[
          styles.mealCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
        onPress={() => handleMealPress(meal, dayName, timing)}
        activeOpacity={0.7}
      >
        <View style={styles.mealCardHeader}>
          <View style={styles.mealInfo}>
            <Text
              style={[
                styles.mealName,
                { color: colors.text },
                isRTL && styles.rtlText,
              ]}
            >
              {meal.name}
            </Text>
            <Text
              style={[
                styles.mealTiming,
                { color: colors.icon },
                isRTL && styles.rtlText,
              ]}
            >
              {timing} • {meal.dietary_category}
            </Text>
          </View>

          <View style={styles.mealActions}>
            <TouchableOpacity
              onPress={() => handleToggleFavorite(meal, dayName, timing)}
              style={styles.favoriteButton}
            >
              {isFavorite ? (
                <Heart size={20} color="#ef4444" fill="#ef4444" />
              ) : (
                <HeartOff size={20} color={colors.icon} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.mealNutrition}>
          <View style={styles.nutritionItem}>
            <Text style={[styles.nutritionValue, { color: colors.emerald500 }]}>
              {meal.calories}
            </Text>
            <Text style={[styles.nutritionLabel, { color: colors.icon }]}>
              {language === "he" ? "קלוריות" : "Cal"}
            </Text>
          </View>
          <View style={styles.nutritionItem}>
            <Text style={[styles.nutritionValue, { color: colors.emerald500 }]}>
              {meal.protein_g}g
            </Text>
            <Text style={[styles.nutritionLabel, { color: colors.icon }]}>
              {language === "he" ? "חלבון" : "Protein"}
            </Text>
          </View>
          <View style={styles.nutritionItem}>
            <Text style={[styles.nutritionValue, { color: colors.emerald500 }]}>
              {meal.carbs_g}g
            </Text>
            <Text style={[styles.nutritionLabel, { color: colors.icon }]}>
              {language === "he" ? "פחמימות" : "Carbs"}
            </Text>
          </View>
          <View style={styles.nutritionItem}>
            <Text style={[styles.nutritionValue, { color: colors.emerald500 }]}>
              {meal.fats_g}g
            </Text>
            <Text style={[styles.nutritionLabel, { color: colors.icon }]}>
              {language === "he" ? "שומן" : "Fat"}
            </Text>
          </View>
        </View>

        {meal.description && (
          <Text
            style={[
              styles.mealDescription,
              { color: colors.icon },
              isRTL && styles.rtlText,
            ]}
            numberOfLines={2}
          >
            {meal.description}
          </Text>
        )}

        <View style={styles.mealFooter}>
          <View style={styles.mealMeta}>
            {meal.prep_time_minutes && (
              <View style={[styles.metaItem, isRTL && styles.rtlRow]}>
                <Clock size={12} color={colors.icon} />
                <Text style={[styles.metaText, { color: colors.icon }]}>
                  {meal.prep_time_minutes} {language === "he" ? "דק'" : "min"}
                </Text>
              </View>
            )}

            {rating > 0 && (
              <View style={styles.ratingDisplay}>
                {renderStarRating(rating, undefined, 12)}
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.swapButton, { backgroundColor: colors.surface }]}
            onPress={() => handleSwapMeal(meal, dayName, timing)}
          >
            <RefreshCw size={14} color={colors.emerald500} />
            <Text style={[styles.swapButtonText, { color: colors.emerald500 }]}>
              {language === "he" ? "החלף" : "Swap"}
            </Text>
          </TouchableOpacity>
        </View>

        {comment && (
          <View
            style={[styles.commentPreview, { backgroundColor: colors.surface }]}
          >
            <MessageSquare size={12} color={colors.icon} />
            <Text
              style={[
                styles.commentText,
                { color: colors.text },
                isRTL && styles.rtlText,
              ]}
              numberOfLines={1}
            >
              {comment}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderMealModal = () => (
    <Modal
      visible={showMealModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowMealModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[styles.modalContent, { backgroundColor: colors.background }]}
        >
          <View
            style={[styles.modalHeader, { borderBottomColor: colors.border }]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: colors.text },
                isRTL && styles.rtlText,
              ]}
            >
              {selectedMeal?.name}
            </Text>
            <TouchableOpacity onPress={() => setShowMealModal(false)}>
              <X size={24} color={colors.icon} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Meal Details */}
            <View style={styles.mealDetailsSection}>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.text },
                  isRTL && styles.rtlText,
                ]}
              >
                {language === "he" ? "פרטי הארוחה" : "Meal Details"}
              </Text>

              {selectedMeal?.description && (
                <Text
                  style={[
                    styles.detailText,
                    { color: colors.icon },
                    isRTL && styles.rtlText,
                  ]}
                >
                  {selectedMeal.description}
                </Text>
              )}

              {selectedMeal?.ingredients &&
                selectedMeal.ingredients.length > 0 && (
                  <View style={styles.ingredientsContainer}>
                    <Text
                      style={[
                        styles.ingredientsTitle,
                        { color: colors.text },
                        isRTL && styles.rtlText,
                      ]}
                    >
                      {language === "he" ? "רכיבים:" : "Ingredients:"}
                    </Text>
                    {selectedMeal.ingredients.map((ingredient, index) => (
                      <Text
                        key={index}
                        style={[
                          styles.ingredientText,
                          { color: colors.icon },
                          isRTL && styles.rtlText,
                        ]}
                      >
                        • {ingredient}
                      </Text>
                    ))}
                  </View>
                )}

              {selectedMeal?.instructions &&
                selectedMeal.instructions.length > 0 && (
                  <View style={styles.instructionsContainer}>
                    <Text
                      style={[
                        styles.instructionsTitle,
                        { color: colors.text },
                        isRTL && styles.rtlText,
                      ]}
                    >
                      {language === "he" ? "הוראות הכנה:" : "Instructions:"}
                    </Text>
                    {selectedMeal.instructions.map((instruction, index) => (
                      <Text
                        key={index}
                        style={[
                          styles.instructionText,
                          { color: colors.icon },
                          isRTL && styles.rtlText,
                        ]}
                      >
                        {index + 1}. {instruction}
                      </Text>
                    ))}
                  </View>
                )}
            </View>

            {/* Rating Section */}
            <View style={styles.ratingSection}>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.text },
                  isRTL && styles.rtlText,
                ]}
              >
                {language === "he" ? "דרג את הארוחה" : "Rate this Meal"}
              </Text>
              {renderStarRating(tempRating, handleRatingChange, 24)}
            </View>

            {/* Comments Section */}
            <View style={styles.commentsSection}>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.text },
                  isRTL && styles.rtlText,
                ]}
              >
                {language === "he" ? "הערות" : "Comments"}
              </Text>
              <TextInput
                style={[
                  styles.commentInput,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                  isRTL && styles.rtlTextInput,
                ]}
                placeholder={
                  language === "he"
                    ? "הוסף הערות על הארוחה..."
                    : "Add comments about this meal..."
                }
                placeholderTextColor={colors.icon}
                value={tempComment}
                onChangeText={setTempComment}
                multiline
                numberOfLines={3}
                textAlign={isRTL ? "right" : "left"}
              />
            </View>
          </ScrollView>

          <View
            style={[styles.modalActions, { borderTopColor: colors.border }]}
          >
            <TouchableOpacity
              style={[
                styles.modalCancelButton,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={() => setShowMealModal(false)}
            >
              <Text style={[styles.modalCancelText, { color: colors.text }]}>
                {language === "he" ? "ביטול" : "Cancel"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalSaveButton,
                { backgroundColor: colors.emerald500 },
              ]}
              onPress={handleSaveMealInteraction}
            >
              <Check size={16} color="#ffffff" />
              <Text style={styles.modalSaveText}>
                {language === "he" ? "שמור" : "Save"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderCompletePlanModal = () => (
    <Modal
      visible={showCompletePlanModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowCompletePlanModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[styles.modalContent, { backgroundColor: colors.background }]}
        >
          <View
            style={[styles.modalHeader, { borderBottomColor: colors.border }]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: colors.text },
                isRTL && styles.rtlText,
              ]}
            >
              {language === "he" ? "השלמת התוכנית" : "Complete Plan"}
            </Text>
            <TouchableOpacity onPress={() => setShowCompletePlanModal(false)}>
              <X size={24} color={colors.icon} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <Text
              style={[
                styles.swapDescription,
                { color: colors.text },
                isRTL && styles.rtlText,
              ]}
            >
              {language === "he"
                ? "איך הייתה התוכנית שלך? המשוב שלך יעזור לנו לשפר!"
                : "How was your plan? Your feedback will help us improve!"}
            </Text>

            {/* Rating */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                {language === "he" ? "דירוג כללי" : "Overall Rating"} *
              </Text>
              <View style={styles.ratingContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() =>
                      setCompletionFeedback({
                        ...completionFeedback,
                        rating: star,
                      })
                    }
                    style={styles.starButton}
                  >
                    <Star
                      size={28}
                      color={
                        star <= completionFeedback.rating
                          ? "#fbbf24"
                          : colors.border
                      }
                      fill={
                        star <= completionFeedback.rating
                          ? "#fbbf24"
                          : "transparent"
                      }
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* What you liked */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                {language === "he" ? "מה אהבת?" : "What did you like?"}
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                  isRTL && styles.rtlTextInput,
                ]}
                placeholder={
                  language === "he"
                    ? "תאר מה אהבת בתוכנית..."
                    : "Describe what you liked about the plan..."
                }
                placeholderTextColor={colors.icon}
                value={completionFeedback.liked}
                onChangeText={(text) =>
                  setCompletionFeedback({ ...completionFeedback, liked: text })
                }
                multiline
                numberOfLines={3}
                textAlign={isRTL ? "right" : "left"}
              />
            </View>

            {/* What you didn't like */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                {language === "he" ? "מה לא אהבת?" : "What didn't you like?"}
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                  isRTL && styles.rtlTextInput,
                ]}
                placeholder={
                  language === "he"
                    ? "תאר מה לא אהבת..."
                    : "Describe what you didn't like..."
                }
                placeholderTextColor={colors.icon}
                value={completionFeedback.disliked}
                onChangeText={(text) =>
                  setCompletionFeedback({
                    ...completionFeedback,
                    disliked: text,
                  })
                }
                multiline
                numberOfLines={3}
                textAlign={isRTL ? "right" : "left"}
              />
            </View>

            {/* Suggestions */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                {language === "he"
                  ? "הצעות לשיפור"
                  : "Suggestions for improvement"}
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                  isRTL && styles.rtlTextInput,
                ]}
                placeholder={
                  language === "he" ? "איך נוכל לשפר?" : "How can we improve?"
                }
                placeholderTextColor={colors.icon}
                value={completionFeedback.suggestions}
                onChangeText={(text) =>
                  setCompletionFeedback({
                    ...completionFeedback,
                    suggestions: text,
                  })
                }
                multiline
                numberOfLines={3}
                textAlign={isRTL ? "right" : "left"}
              />
            </View>
          </ScrollView>

          <View
            style={[styles.modalActions, { borderTopColor: colors.border }]}
          >
            <TouchableOpacity
              style={[
                styles.modalCancelButton,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={() => setShowCompletePlanModal(false)}
            >
              <Text style={[styles.modalCancelText, { color: colors.text }]}>
                {language === "he" ? "ביטול" : "Cancel"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalSaveButton,
                { backgroundColor: colors.emerald500 },
              ]}
              onPress={handleCompletePlan}
            >
              <Award size={16} color="#ffffff" />
              <Text style={styles.modalSaveText}>
                {language === "he" ? "השלם תוכנית" : "Complete Plan"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderSwapModal = () => (
    <Modal
      visible={showSwapModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowSwapModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[styles.modalContent, { backgroundColor: colors.background }]}
        >
          <View
            style={[styles.modalHeader, { borderBottomColor: colors.border }]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: colors.text },
                isRTL && styles.rtlText,
              ]}
            >
              {language === "he" ? "החלף ארוחה" : "Swap Meal"}
            </Text>
            <TouchableOpacity onPress={() => setShowSwapModal(false)}>
              <X size={24} color={colors.icon} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <Text
              style={[
                styles.swapDescription,
                { color: colors.text },
                isRTL && styles.rtlText,
              ]}
            >
              {language === "he"
                ? "AI יציע ארוחה חלופית עבור:"
                : "AI will suggest an alternative meal for:"}
            </Text>

            <View
              style={[
                styles.currentMealCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text
                style={[
                  styles.currentMealName,
                  { color: colors.text },
                  isRTL && styles.rtlText,
                ]}
              >
                {selectedMeal?.name}
              </Text>
              <Text
                style={[
                  styles.currentMealMeta,
                  { color: colors.icon },
                  isRTL && styles.rtlText,
                ]}
              >
                {selectedMeal?.calories}{" "}
                {language === "he" ? "קלוריות" : "calories"} •{" "}
                {selectedMeal?.protein_g}g{" "}
                {language === "he" ? "חלבון" : "protein"}
              </Text>
            </View>

            {swapError && (
              <View
                style={[
                  styles.errorContainer,
                  { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
                ]}
              >
                <AlertCircle size={16} color="#dc2626" />
                <Text
                  style={[
                    styles.errorText,
                    { color: "#dc2626" },
                    isRTL && styles.rtlText,
                  ]}
                >
                  {language === "he" ? "שגיאה בהחלפה: " : "Swap failed: "}
                  {swapError}
                </Text>
              </View>
            )}

            <View style={styles.swapOptions}>
              <Text
                style={[
                  styles.optionsTitle,
                  { color: colors.text },
                  isRTL && styles.rtlText,
                ]}
              >
                {language === "he" ? "העדפות החלפה:" : "Swap Preferences:"}
              </Text>

              <TouchableOpacity
                style={[
                  styles.swapOptionButton,
                  { backgroundColor: colors.emerald500 },
                ]}
                onPress={() =>
                  performMealSwap({
                    currentMeal: selectedMeal!,
                    dayName: getDayNames()[selectedDay],
                    mealTiming: selectedMeal!.meal_timing,
                    preferences: {
                      dietary_category: selectedMeal!.dietary_category,
                    },
                  })
                }
                disabled={isSwapping}
              >
                {isSwapping ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <RefreshCw size={16} color="#ffffff" />
                    <Text
                      style={[styles.swapOptionText, isRTL && styles.rtlText]}
                    >
                      {language === "he" ? "החלפה דומה" : "Similar Swap"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.swapOptionButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderWidth: 1,
                  },
                ]}
                onPress={() =>
                  performMealSwap({
                    currentMeal: selectedMeal!,
                    dayName: getDayNames()[selectedDay],
                    mealTiming: selectedMeal!.meal_timing,
                    preferences: { protein_preference: "higher" },
                  })
                }
                disabled={isSwapping}
              >
                <Text
                  style={[
                    styles.swapOptionSecondaryText,
                    { color: colors.text },
                    isRTL && styles.rtlText,
                  ]}
                >
                  {language === "he" ? "עתיר חלבון יותר" : "Higher Protein"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.swapOptionButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderWidth: 1,
                  },
                ]}
                onPress={() =>
                  performMealSwap({
                    currentMeal: selectedMeal!,
                    dayName: getDayNames()[selectedDay],
                    mealTiming: selectedMeal!.meal_timing,
                    preferences: { calorie_preference: "lower" },
                  })
                }
                disabled={isSwapping}
              >
                <Text
                  style={[
                    styles.swapOptionSecondaryText,
                    { color: colors.text },
                    isRTL && styles.rtlText,
                  ]}
                >
                  {language === "he" ? "פחות קלוריות" : "Lower Calories"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  if (isLoading) {
    return (
      <LoadingScreen
        text={
          language === "he" ? "טוען תוכנית ארוחות..." : "Loading meal plan..."
        }
      />
    );
  }

  if (!mealPlan) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <View style={styles.emptyState}>
          <ChefHat size={64} color={colors.icon} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {language === "he" ? "אין תוכנית זמינה" : "No meal plan available"}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.icon }]}>
            {language === "he"
              ? "צור תוכנית ארוחות כדי להתחיל"
              : "Create a meal plan to get started"}
          </Text>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.emerald500 }]}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>
              {language === "he" ? "חזור" : "Go Back"}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const dailyTotals = getDailyNutritionTotals();

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.headerBackButton, { backgroundColor: colors.card }]}
          onPress={() => router.back()}
        >
          <ArrowLeft size={20} color={colors.emerald500} />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <Text
            style={[
              styles.headerTitle,
              { color: colors.text },
              isRTL && styles.rtlText,
            ]}
          >
            {mealPlan.name}
          </Text>
          <Text
            style={[
              styles.headerSubtitle,
              { color: colors.icon },
              isRTL && styles.rtlText,
            ]}
          >
            {language === "he" ? "תוכנית פעילה" : "Active Plan"}
          </Text>
        </View>

        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[
              styles.filterHeaderButton,
              { backgroundColor: colors.card },
            ]}
            onPress={() => setShowFilterModal(true)}
          >
            <Filter size={20} color={colors.emerald500} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.completeButton,
              { backgroundColor: colors.emerald500 },
            ]}
            onPress={() => setShowCompletePlanModal(true)}
          >
            <Award size={16} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Enhanced Calendar Widget */}
      <View style={[styles.calendarWidget, { backgroundColor: colors.card }]}>
        <View
          style={[styles.calendarHeader, { borderBottomColor: colors.border }]}
        >
          <TouchableOpacity onPress={() => navigateWeek("prev")}>
            <ChevronLeft size={20} color={colors.emerald500} />
          </TouchableOpacity>

          <Text style={[styles.monthYear, { color: colors.text }]}>
            {currentWeekStart.toLocaleDateString(
              language === "he" ? "he-IL" : "en-US",
              {
                month: "long",
                year: "numeric",
              }
            )}
          </Text>

          <TouchableOpacity onPress={() => navigateWeek("next")}>
            <ChevronRight size={20} color={colors.emerald500} />
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.daysContainer}
        >
          {weekDays.map((day, index) => {
            const isSelected = selectedDay === index;
            const isToday = day.toDateString() === new Date().toDateString();

            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dayCard,
                  {
                    backgroundColor: isSelected
                      ? colors.emerald500
                      : colors.surface,
                    borderColor: isToday ? colors.emerald500 : colors.border,
                    borderWidth: isToday ? 2 : 1,
                  },
                ]}
                onPress={() => selectDay(index, day)}
              >
                <Text
                  style={[
                    styles.dayName,
                    {
                      color: isSelected ? "#ffffff" : colors.text,
                      fontWeight: isToday ? "bold" : "normal",
                    },
                  ]}
                >
                  {day.toLocaleDateString(
                    language === "he" ? "he-IL" : "en-US",
                    {
                      weekday: "short",
                    }
                  )}
                </Text>
                <Text
                  style={[
                    styles.dayNumber,
                    {
                      color: isSelected ? "#ffffff" : colors.text,
                      fontWeight: isToday ? "bold" : "normal",
                    },
                  ]}
                >
                  {day.getDate()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Daily Nutrition Summary */}
      {dailyTotals && (
        <View
          style={[styles.nutritionSummary, { backgroundColor: colors.card }]}
        >
          <Text style={[styles.summaryTitle, { color: colors.text }]}>
            {language === "he" ? "סיכום יומי" : "Daily Summary"}
          </Text>
          <View style={styles.nutritionGrid}>
            <View style={styles.nutritionSummaryItem}>
              <Target size={16} color="#ef4444" />
              <Text
                style={[styles.nutritionSummaryValue, { color: colors.text }]}
              >
                {dailyTotals.calories}
              </Text>
              <Text
                style={[styles.nutritionSummaryLabel, { color: colors.icon }]}
              >
                {language === "he" ? "קלוריות" : "Calories"}
              </Text>
            </View>
            <View style={styles.nutritionSummaryItem}>
              <TrendingUp size={16} color="#3b82f6" />
              <Text
                style={[styles.nutritionSummaryValue, { color: colors.text }]}
              >
                {Math.round(dailyTotals.protein)}g
              </Text>
              <Text
                style={[styles.nutritionSummaryLabel, { color: colors.icon }]}
              >
                {language === "he" ? "חלבון" : "Protein"}
              </Text>
            </View>
            <View style={styles.nutritionSummaryItem}>
              <Award size={16} color="#10b981" />
              <Text
                style={[styles.nutritionSummaryValue, { color: colors.text }]}
              >
                {Math.round(dailyTotals.carbs)}g
              </Text>
              <Text
                style={[styles.nutritionSummaryLabel, { color: colors.icon }]}
              >
                {language === "he" ? "פחמימות" : "Carbs"}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Meals Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.emerald500]}
            tintColor={colors.emerald500}
          />
        }
      >
        {Object.entries(filteredMeals).map(([timing, meals]) => (
          <View key={timing} style={styles.mealTimingSection}>
            <View style={styles.timingHeader}>
              <Text
                style={[
                  styles.mealTimingTitle,
                  { color: colors.text },
                  isRTL && styles.rtlText,
                ]}
              >
                {timing}
              </Text>
              <Text style={[styles.mealCount, { color: colors.icon }]}>
                {meals.length} {language === "he" ? "ארוחות" : "meals"}
              </Text>
            </View>

            {meals.length > 0 ? (
              meals.map((meal) =>
                renderMealCard(meal, getDayNames()[selectedDay], timing)
              )
            ) : (
              <View
                style={[
                  styles.noMealsContainer,
                  { backgroundColor: colors.surface },
                ]}
              >
                <Utensils size={24} color={colors.icon} />
                <Text
                  style={[
                    styles.noMealsText,
                    { color: colors.icon },
                    isRTL && styles.rtlText,
                  ]}
                >
                  {language === "he"
                    ? "אין ארוחות תואמות לסינון"
                    : "No meals match the current filters"}
                </Text>
              </View>
            )}
          </View>
        ))}

        {Object.keys(filteredMeals).length === 0 && (
          <View style={styles.emptyDayState}>
            <ChefHat size={48} color={colors.icon} />
            <Text style={[styles.emptyDayTitle, { color: colors.text }]}>
              {language === "he"
                ? "אין ארוחות לתאריך זה"
                : "No meals for this date"}
            </Text>
            <Text style={[styles.emptyDaySubtitle, { color: colors.icon }]}>
              {language === "he"
                ? "בחר תאריך אחר או צור תוכנית חדשה"
                : "Select another date or create a new plan"}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Modals */}
      {renderMealModal()}
      {renderSwapModal()}
      {renderCompletePlanModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fdfefe",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    backgroundColor: "#fdfefe",
    borderBottomColor: "#d5e8e8",
  },
  headerBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  headerContent: {
    flex: 1,
    marginHorizontal: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  filterHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  calendarWidget: {
    marginHorizontal: 20,
    marginVertical: 12,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#52c1c4",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    backgroundColor: "#ffffff",
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  monthYear: {
    fontSize: 16,
    fontWeight: "600",
  },
  daysContainer: {
    padding: 16,
  },
  dayCard: {
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginRight: 12,
    borderRadius: 14,
    minWidth: 65,
    elevation: 1,
    shadowColor: "#52c1c4",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  dayName: {
    fontSize: 12,
    marginBottom: 4,
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: "600",
  },
  nutritionSummary: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 20,
    borderRadius: 16,
    elevation: 2,
    shadowColor: "#52c1c4",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    backgroundColor: "#ffffff",
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  nutritionGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  nutritionSummaryItem: {
    alignItems: "center",
    gap: 4,
  },
  nutritionSummaryValue: {
    fontSize: 18,
    fontWeight: "bold",
  },
  nutritionSummaryLabel: {
    fontSize: 10,
    textTransform: "uppercase",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  mealTimingSection: {
    marginBottom: 24,
  },
  timingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  mealTimingTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  mealCount: {
    fontSize: 12,
  },
  mealCard: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 0,
    shadowColor: "#52c1c4",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    backgroundColor: "#ffffff",
  },
  mealCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  mealInfo: {
    flex: 1,
  },
  mealName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  mealTiming: {
    fontSize: 12,
  },
  mealActions: {
    marginLeft: 12,
  },
  favoriteButton: {
    padding: 4,
  },
  mealNutrition: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  nutritionItem: {
    alignItems: "center",
  },
  nutritionValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  nutritionLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  mealDescription: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  mealFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mealMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 11,
  },
  ratingDisplay: {
    flexDirection: "row",
  },
  swapButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
    elevation: 1,
    shadowColor: "#52c1c4",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  swapButtonText: {
    fontSize: 12,
    fontWeight: "500",
  },
  commentPreview: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    gap: 6,
  },
  commentText: {
    fontSize: 11,
    flex: 1,
  },
  noMealsContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    borderRadius: 12,
  },
  noMealsText: {
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  starContainer: {
    flexDirection: "row",
    gap: 4,
  },
  starButton: {
    padding: 2,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
  },
  emptyDayState: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyDayTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDaySubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
  },
  modalBody: {
    padding: 20,
    maxHeight: 500,
  },
  mealDetailsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  detailText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  ingredientsContainer: {
    marginBottom: 16,
  },
  ingredientsTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  ingredientText: {
    fontSize: 13,
    marginBottom: 4,
  },
  instructionsContainer: {
    marginBottom: 16,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 13,
    marginBottom: 6,
    lineHeight: 18,
  },
  ratingSection: {
    marginBottom: 20,
  },
  commentsSection: {
    marginBottom: 20,
  },
  commentInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
    padding: 20,
    borderTopWidth: 1,
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: "600",
  },
  modalSaveButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  modalSaveText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  swapDescription: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  currentMealCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  currentMealName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  currentMealMeta: {
    fontSize: 12,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    fontSize: 12,
    flex: 1,
  },
  swapOptions: {
    gap: 12,
  },
  optionsTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  swapOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  swapOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  swapOptionSecondaryText: {
    fontSize: 14,
    fontWeight: "500",
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl",
  },
  rtlTextInput: {
    textAlign: "right",
  },
  rtlRow: {
    flexDirection: "row-reverse",
  },
  headerButtons: {
    flexDirection: "row",
    gap: 8,
  },
  completeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: "top",
  },
  ratingContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginVertical: 16,
  },
});

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
  Animated,
  Modal,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/src/i18n/context/LanguageContext";
import { useTheme } from "@/src/context/ThemeContext";
import {
  ChefHat,
  Plus,
  Sparkles,
  Calendar,
  Clock,
  DollarSign,
  Users,
  Star,
  Eye,
  Play,
  X,
  Send,
  Utensils,
  Target,
  TrendingUp,
  Award,
  Filter,
  Search,
  CheckCircle,
  ArrowRight,
} from "lucide-react-native";
import { api, mealPlanAPI } from "@/src/services/api";
import LoadingScreen from "@/components/LoadingScreen";
import { router, useFocusEffect } from "expo-router";
import { useSelector } from "react-redux";
import { RootState } from "@/src/store";

const { width } = Dimensions.get("window");

interface RecommendedMenu {
  menu_id: string;
  title: string;
  description?: string;
  total_calories: number;
  total_protein?: number;
  total_carbs?: number;
  total_fat?: number;
  total_fiber?: number;
  days_count: number;
  dietary_category?: string;
  estimated_cost?: number;
  prep_time_minutes?: number;
  difficulty_level: number;
  is_active: boolean;
  created_at: string;
  meals: Array<{
    meal_id: string;
    name: string;
    meal_type: string;
    day_number: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number;
    prep_time_minutes?: number;
    cooking_method?: string;
    instructions?: string;
    ingredients: Array<{
      ingredient_id: string;
      name: string;
      quantity: number;
      unit: string;
      category?: string;
      estimated_cost?: number;
    }>;
  }>;
}

export default function RecommendedMenusScreen() {
  const { t } = useTranslation();
  const { isRTL, language } = useLanguage();
  const { colors, isDark } = useTheme();

  const [menus, setMenus] = useState<RecommendedMenu[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customRequest, setCustomRequest] = useState("");
  const [selectedDays, setSelectedDays] = useState(7);
  const [selectedMealsPerDay, setSelectedMealsPerDay] = useState("3_main");
  const [budget, setBudget] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [showComprehensiveModal, setShowComprehensiveModal] = useState(false);
  const [menuName, setMenuName] = useState("");
  const [targetCalories, setTargetCalories] = useState("");
  const [proteinGoal, setProteinGoal] = useState("");
  const [carbGoal, setCarbGoal] = useState("");
  const [fatGoal, setFatGoal] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [hasActivePlan, setHasActivePlan] = useState(false);
  const [activePlanData, setActivePlanData] = useState<any>(null);
  const { user } = useSelector((state: RootState) => state.auth);

  // Animation values
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  useEffect(() => {
    loadRecommendedMenus();
    checkForActivePlan();

    // Start animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Refresh active plan status when user returns to screen
  useFocusEffect(
    useCallback(() => {
      console.log("🔄 Screen focused, checking for active plans...");
      checkForActivePlan();
    }, [])
  );

  const loadRecommendedMenus = async () => {
    try {
      console.log("🔄 Loading recommended menus...");
      const response = await api.get("/recommended-menus");

      if (response.data.success) {
        setMenus(response.data.data || []);
        console.log("✅ Loaded", response.data.data?.length || 0, "menus");
      } else {
        console.log("⚠️ No menus found or API returned error");
        setMenus([]);
      }
    } catch (error) {
      console.error("💥 Error loading menus:", error);
      setMenus([]);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRecommendedMenus();
    setRefreshing(false);
  }, []);

  const handleGenerateMenu = async () => {
    try {
      setIsGenerating(true);
      console.log("🤖 Generating new menu...");

      const response = await api.post("/recommended-menus/generate", {
        days: 7,
        mealsPerDay: "3_main",
        mealChangeFrequency: "daily",
        includeLeftovers: false,
        sameMealTimes: true,
      });

      if (response.data.success) {
        Alert.alert(
          language === "he" ? "הצלחה!" : "Success!",
          language === "he"
            ? "תפריט חדש נוצר בהצלחה!"
            : "New menu generated successfully!",
          [
            {
              text: language === "he" ? "אישור" : "OK",
              onPress: () => loadRecommendedMenus(),
            },
          ]
        );
      } else {
        throw new Error(response.data.error || "Failed to generate menu");
      }
    } catch (error: any) {
      console.error("💥 Error generating menu:", error);
      Alert.alert(
        language === "he" ? "שגיאה" : "Error",
        error.message ||
          (language === "he"
            ? "נכשל ביצירת תפריט חדש"
            : "Failed to generate new menu")
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateCustomMenu = async () => {
    if (!customRequest.trim()) {
      Alert.alert(
        language === "he" ? "שגיאה" : "Error",
        language === "he"
          ? "אנא הכנס תיאור לתפריט המותאם"
          : "Please enter a description for the custom menu"
      );
      return;
    }

    try {
      setIsGenerating(true);
      console.log("🎨 Generating custom menu...");

      const response = await api.post("/recommended-menus/generate-custom", {
        days: selectedDays,
        mealsPerDay: selectedMealsPerDay,
        customRequest: customRequest.trim(),
        budget: budget ? parseFloat(budget) : undefined,
        mealChangeFrequency: "daily",
        includeLeftovers: false,
        sameMealTimes: true,
      });

      if (response.data.success) {
        setShowCustomModal(false);
        setCustomRequest("");
        setBudget("");

        Alert.alert(
          language === "he" ? "הצלחה!" : "Success!",
          language === "he"
            ? "תפריט מותאם נוצר בהצלחה!"
            : "Custom menu generated successfully!",
          [
            {
              text: language === "he" ? "אישור" : "OK",
              onPress: () => loadRecommendedMenus(),
            },
          ]
        );
      } else {
        throw new Error(
          response.data.error || "Failed to generate custom menu"
        );
      }
    } catch (error: any) {
      console.error("💥 Error generating custom menu:", error);
      Alert.alert(
        language === "he" ? "שגיאה" : "Error",
        error.message ||
          (language === "he"
            ? "נכשל ביצירת תפריט מותאם"
            : "Failed to generate custom menu")
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateComprehensiveMenu = async () => {
    try {
      setIsGenerating(true);
      console.log("🤖 Creating comprehensive menu...");

      if (!menuName.trim()) {
        Alert.alert(
          language === "he" ? "שגיאה" : "Error",
          language === "he" ? "אנא הכנס שם תפריט" : "Please enter a menu name"
        );
        setIsGenerating(false);
        return;
      }

      const payload = {
        name: menuName,
        days: selectedDays,
        mealsPerDay: selectedMealsPerDay,
        targetCalories: targetCalories ? parseFloat(targetCalories) : undefined,
        proteinGoal: proteinGoal ? parseFloat(proteinGoal) : undefined,
        carbGoal: carbGoal ? parseFloat(carbGoal) : undefined,
        fatGoal: fatGoal ? parseFloat(fatGoal) : undefined,
        budget: budget ? parseFloat(budget) : undefined,
        specialRequests: specialRequests.trim(),
      };

      const response = await api.post(
        "/recommended-menus/generate-comprehensive",
        payload
      );

      if (response.data.success) {
        setShowComprehensiveModal(false);
        setMenuName("");
        setTargetCalories("");
        setProteinGoal("");
        setCarbGoal("");
        setFatGoal("");
        setBudget("");
        setSpecialRequests("");

        Alert.alert(
          language === "he" ? "הצלחה!" : "Success!",
          language === "he"
            ? "תפריט מקיף נוצר והופעל בהצלחה!"
            : "Comprehensive menu created and activated successfully!",
          [
            {
              text: language === "he" ? "אישור" : "OK",
              onPress: () => loadRecommendedMenus(),
            },
          ]
        );
      } else {
        throw new Error(
          response.data.error || "Failed to generate comprehensive menu"
        );
      }
    } catch (error: any) {
      console.error("💥 Error generating comprehensive menu:", error);
      Alert.alert(
        language === "he" ? "שגיאה" : "Error",
        error.message ||
          (language === "he"
            ? "נכשל ביצירת תפריט מקיף"
            : "Failed to generate comprehensive menu")
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedMenuToStart, setSelectedMenuToStart] = useState<string | null>(
    null
  );
  const [currentActivePlan, setCurrentActivePlan] = useState<any>(null);
  const [feedbackForm, setFeedbackForm] = useState({
    rating: 0,
    liked: "",
    disliked: "",
    suggestions: "",
  });

  const checkForActivePlan = async () => {
    try {
      const response = await api.get("/meal-plans/current");
      if (response.data.success && response.data.hasActivePlan) {
        const planData = {
          plan_id: response.data.planId,
          name: response.data.planName || "Active Plan",
          data: response.data.data,
        };
        setCurrentActivePlan(planData);
        setActivePlanData(planData);
        setHasActivePlan(true);
      } else {
        setCurrentActivePlan(null);
        setActivePlanData(null);
        setHasActivePlan(false);
      }
    } catch (error) {
      console.log("No active plan found");
      setCurrentActivePlan(null);
      setActivePlanData(null);
      setHasActivePlan(false);
    }
  };

  const handleStartMenu = async (menuId: string) => {
    try {
      console.log("🚀 Starting menu:", menuId);
      setSelectedMenuToStart(menuId);

      if (currentActivePlan) {
        setShowFeedbackModal(true);
      } else {
        await activateMenuPlan(menuId);
      }
    } catch (error: any) {
      console.error("💥 Error starting menu:", error);
      Alert.alert(
        language === "he" ? "שגיאה" : "Error",
        error.message ||
          (language === "he" ? "נכשל בהפעלת התפריט" : "Failed to start menu")
      );
    }
  };

  // Check if this menu is the current active one
  const isCurrentActiveMenu = (menuId: string) => {
    return (
      activePlanData?.plan_id === menuId || user?.active_menu_id === menuId
    );
  };

  const activateMenuPlan = async (
    menuId: string,
    previousPlanFeedback?: any
  ) => {
    try {
      console.log("🚀 Starting menu:", menuId);

      if (previousPlanFeedback && currentActivePlan) {
        try {
          await mealPlanAPI.completePlan(
            currentActivePlan.plan_id || currentActivePlan,
            previousPlanFeedback
          );
          console.log("✅ Previous plan feedback submitted");
        } catch (feedbackError) {
          console.warn(
            "⚠️ Failed to submit previous plan feedback:",
            feedbackError
          );
        }
      }

      const response = await api.post(
        `/recommended-menus/${menuId}/start-today`
      );

      if (response.data.success && response.data.data) {
        const newPlan = response.data.data;
        setCurrentActivePlan(newPlan);
        setHasActivePlan(true);
        setShowFeedbackModal(false);
        setSelectedMenuToStart(null);

        Alert.alert(
          language === "he" ? "הצלחה!" : "Success!",
          language === "he"
            ? "התפריט הופעל בהצלחה!"
            : "Menu started successfully!",
          [
            {
              text: language === "he" ? "אישור" : "OK",
              onPress: () => {
                console.log(
                  "Navigating to active menu with plan ID:",
                  newPlan.plan_id
                );
                router.push(`/menu/activeMenu?planId=${newPlan.plan_id}`);
              },
            },
          ]
        );
      } else {
        throw new Error(response.data.error || "Failed to start menu");
      }
    } catch (error: any) {
      console.error("💥 Error activating menu plan:", error);
      Alert.alert(
        language === "he" ? "שגיאה" : "Error",
        error.message ||
          (language === "he" ? "נכשל בהפעלת התפריט" : "Failed to start menu")
      );
    }
  };

  const handleFeedbackSubmit = async () => {
    if (feedbackForm.rating === 0) {
      Alert.alert(
        language === "he" ? "שגיאה" : "Error",
        language === "he" ? "אנא דרג את התוכנית" : "Please rate the plan"
      );
      return;
    }

    const previousPlanFeedback = {
      planId: currentActivePlan.plan_id,
      rating: feedbackForm.rating,
      liked: feedbackForm.liked,
      disliked: feedbackForm.disliked,
      suggestions: feedbackForm.suggestions,
    };

    await activateMenuPlan(selectedMenuToStart!, previousPlanFeedback);
  };

  const filteredMenus = useMemo(() => {
    return menus.filter((menu) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          menu.title.toLowerCase().includes(query) ||
          menu.description?.toLowerCase().includes(query) ||
          menu.dietary_category?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      if (selectedFilter !== "all") {
        if (selectedFilter === "recent" && menu.created_at) {
          const menuDate = new Date(menu.created_at);
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          if (menuDate < weekAgo) return false;
        } else if (selectedFilter === "high_protein") {
          const proteinRatio =
            ((menu.total_protein || 0) / (menu.total_calories || 1)) * 4;
          if (proteinRatio < 0.25) return false;
        } else if (selectedFilter === "low_calorie") {
          const avgCaloriesPerDay =
            menu.total_calories / (menu.days_count || 1);
          if (avgCaloriesPerDay > 1800) return false;
        }
      }

      return true;
    });
  }, [menus, searchQuery, selectedFilter]);

  const renderMenuCard = (menu: RecommendedMenu, index: number) => {
    const avgCaloriesPerDay = Math.round(
      menu.total_calories / (menu.days_count || 1)
    );
    const avgProteinPerDay = Math.round(
      (menu.total_protein || 0) / (menu.days_count || 1)
    );

    return (
      <Animated.View
        key={menu.menu_id}
        style={[
          styles.menuCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: fadeAnim,
            transform: [
              {
                translateY: slideAnim.interpolate({
                  inputRange: [0, 50],
                  outputRange: [0, 50 + index * 10],
                }),
              },
            ],
          },
        ]}
      >
        {/* Enhanced Header with Gradient */}
        <LinearGradient
          colors={
            isDark
              ? ["#059669", "#047857", "#065f46"]
              : ["#10b981", "#059669", "#047857"]
          }
          style={styles.cardHeader}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={[styles.headerContent, isRTL && styles.rtlRow]}>
            <View style={styles.headerLeft}>
              <View style={styles.iconContainer}>
                <ChefHat size={28} color="#ffffff" />
              </View>
              <View style={styles.headerText}>
                <Text style={[styles.menuTitle, isRTL && styles.rtlText]}>
                  {menu.title}
                </Text>
                <Text style={[styles.menuDate, isRTL && styles.rtlText]}>
                  {new Date(menu.created_at).toLocaleDateString(
                    language === "he" ? "he-IL" : "en-US",
                    {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }
                  )}
                </Text>
              </View>
            </View>
            <View style={styles.daysContainer}>
              <Text style={styles.daysNumber}>{menu.days_count}</Text>
              <Text style={styles.daysLabel}>
                {language === "he" ? "ימים" : "days"}
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* Enhanced Content */}
        <View style={styles.cardContent}>
          {/* Description with better typography */}
          {menu.description && (
            <View style={styles.descriptionContainer}>
              <Text
                style={[
                  styles.description,
                  { color: colors.text },
                  isRTL && styles.rtlText,
                ]}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {menu.description}
              </Text>
            </View>
          )}

          {/* Enhanced Nutrition Grid */}
          <View style={styles.nutritionSection}>
            <Text
              style={[
                styles.sectionTitle,
                { color: colors.text },
                isRTL && styles.rtlText,
              ]}
            >
              {language === "he"
                ? "סיכום תזונתי יומי"
                : "Daily Nutrition Summary"}
            </Text>

            <View style={styles.nutritionGrid}>
              <View
                style={[
                  styles.nutritionCard,
                  { backgroundColor: colors.surface },
                ]}
              >
                <View style={styles.nutritionIcon}>
                  <Target size={18} color="#ef4444" />
                </View>
                <Text style={[styles.nutritionValue, { color: colors.text }]}>
                  {avgCaloriesPerDay}
                </Text>
                <Text style={[styles.nutritionLabel, { color: colors.icon }]}>
                  {language === "he" ? "קלוריות" : "Calories"}
                </Text>
              </View>

              <View
                style={[
                  styles.nutritionCard,
                  { backgroundColor: colors.surface },
                ]}
              >
                <View style={styles.nutritionIcon}>
                  <TrendingUp size={18} color="#3b82f6" />
                </View>
                <Text style={[styles.nutritionValue, { color: colors.text }]}>
                  {avgProteinPerDay}g
                </Text>
                <Text style={[styles.nutritionLabel, { color: colors.icon }]}>
                  {language === "he" ? "חלבון" : "Protein"}
                </Text>
              </View>

              <View
                style={[
                  styles.nutritionCard,
                  { backgroundColor: colors.surface },
                ]}
              >
                <View style={styles.nutritionIcon}>
                  <Award size={18} color="#10b981" />
                </View>
                <Text style={[styles.nutritionValue, { color: colors.text }]}>
                  {menu.meals.length}
                </Text>
                <Text style={[styles.nutritionLabel, { color: colors.icon }]}>
                  {language === "he" ? "ארוחות" : "Meals"}
                </Text>
              </View>
            </View>
          </View>

          {/* Enhanced Meals Preview */}
          <View style={styles.mealsPreview}>
            <View style={styles.previewHeader}>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.text },
                  isRTL && styles.rtlText,
                ]}
              >
                {language === "he" ? "ארוחות לדוגמה" : "Sample Meals"}
              </Text>
              <TouchableOpacity
                onPress={() => router.push(`/menu/${menu.menu_id}`)}
                style={styles.viewAllButton}
              >
                <Text
                  style={[styles.viewAllText, { color: colors.emerald500 }]}
                >
                  {language === "he" ? "צפה בהכל" : "View All"}
                </Text>
                <ArrowRight size={12} color={colors.emerald500} />
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mealsScrollContainer}
            >
              {menu.meals.slice(0, 4).map((meal, mealIndex) => (
                <View
                  key={meal.meal_id}
                  style={[
                    styles.mealPreviewCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.mealPreviewHeader}>
                    <Utensils size={14} color={colors.emerald500} />
                    <Text
                      style={[
                        styles.mealTypeText,
                        { color: colors.emerald500 },
                      ]}
                    >
                      {meal.meal_type}
                    </Text>
                  </View>
                  <Text
                    style={[styles.mealPreviewName, { color: colors.text }]}
                    numberOfLines={2}
                  >
                    {meal.name}
                  </Text>
                  <View style={styles.mealPreviewStats}>
                    <Text
                      style={[
                        styles.mealPreviewCalories,
                        { color: colors.text },
                      ]}
                    >
                      {meal.calories}
                    </Text>
                    <Text
                      style={[styles.mealPreviewLabel, { color: colors.icon }]}
                    >
                      {language === "he" ? "קל" : "cal"}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Enhanced Info Row */}
          <View style={styles.infoRow}>
            {menu.estimated_cost && (
              <View style={[styles.infoItem, isRTL && styles.rtlRow]}>
                <DollarSign size={16} color={colors.emerald500} />
                <Text style={[styles.infoText, { color: colors.text }]}>
                  ₪{menu.estimated_cost.toFixed(0)}
                </Text>
              </View>
            )}

            {menu.prep_time_minutes && (
              <View style={[styles.infoItem, isRTL && styles.rtlRow]}>
                <Clock size={16} color={colors.emerald500} />
                <Text style={[styles.infoText, { color: colors.text }]}>
                  {menu.prep_time_minutes} {language === "he" ? "דק'" : "min"}
                </Text>
              </View>
            )}

            <View style={[styles.infoItem, isRTL && styles.rtlRow]}>
              <Star size={16} color="#fbbf24" fill="#fbbf24" />
              <Text style={[styles.infoText, { color: colors.text }]}>
                {menu.difficulty_level}/5
              </Text>
            </View>
          </View>

          {/* Enhanced Action Buttons */}
          <View style={[styles.actionButtons, isRTL && styles.rtlRow]}>
            <TouchableOpacity
              style={[
                styles.secondaryButton,
                {
                  borderColor: colors.emerald500,
                  backgroundColor: colors.surface,
                },
              ]}
              onPress={() => router.push(`/menu/${menu.menu_id}`)}
            >
              <Eye size={16} color={colors.emerald500} />
              <Text
                style={[
                  styles.secondaryButtonText,
                  { color: colors.emerald500 },
                ]}
              >
                {language === "he" ? "צפה" : "View"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                {
                  backgroundColor: isCurrentActiveMenu(menu.menu_id)
                    ? colors.success
                    : colors.emerald500,
                },
              ]}
              onPress={() => {
                if (isCurrentActiveMenu(menu.menu_id)) {
                  router.push(`/menu/activeMenu?planId=${menu.menu_id}`);
                } else {
                  handleStartMenu(menu.menu_id);
                }
              }}
            >
              {isCurrentActiveMenu(menu.menu_id) ? (
                <CheckCircle size={16} color="#ffffff" />
              ) : (
                <Play size={16} color="#ffffff" />
              )}
              <Text style={styles.primaryButtonText}>
                {isCurrentActiveMenu(menu.menu_id)
                  ? language === "he"
                    ? "המשך"
                    : "Continue"
                  : hasActivePlan
                  ? language === "he"
                    ? "החלף"
                    : "Switch"
                  : language === "he"
                  ? "התחל"
                  : "Start"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  };

  const renderCustomModal = () => (
    <Modal
      visible={showCustomModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowCustomModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[styles.modalContent, { backgroundColor: colors.background }]}
        >
          <View
            style={[styles.modalHeader, { borderBottomColor: colors.border }]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {language === "he" ? "צור תפריט מותאם" : "Create Custom Menu"}
            </Text>
            <TouchableOpacity onPress={() => setShowCustomModal(false)}>
              <X size={24} color={colors.icon} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                {language === "he"
                  ? "תאר את התפריט הרצוי"
                  : "Describe your desired menu"}
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                placeholder={
                  language === "he"
                    ? "לדוגמה: תפריט ים תיכוני עם דגים ופחמימות מורכבות"
                    : "e.g., Mediterranean menu with fish and complex carbs"
                }
                placeholderTextColor={colors.icon}
                value={customRequest}
                onChangeText={setCustomRequest}
                multiline
                numberOfLines={3}
                textAlign={isRTL ? "right" : "left"}
              />
            </View>

            <View style={styles.inputRow}>
              <View
                style={[
                  styles.inputGroup,
                  {
                    flex: 1,
                    marginRight: isRTL ? 0 : 12,
                    marginLeft: isRTL ? 12 : 0,
                  },
                ]}
              >
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  {language === "he" ? "מספר ימים" : "Number of days"}
                </Text>
                <View style={styles.daysSelector}>
                  {[3, 7, 14].map((days) => (
                    <TouchableOpacity
                      key={days}
                      style={[
                        styles.dayOption,
                        { borderColor: colors.border },
                        selectedDays === days && {
                          backgroundColor: colors.emerald500,
                        },
                      ]}
                      onPress={() => setSelectedDays(days)}
                    >
                      <Text
                        style={[
                          styles.dayOptionText,
                          {
                            color:
                              selectedDays === days ? "#ffffff" : colors.text,
                          },
                        ]}
                      >
                        {days}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  {language === "he" ? "תקציב יומי (₪)" : "Daily budget (₪)"}
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  placeholder="50"
                  placeholderTextColor={colors.icon}
                  value={budget}
                  onChangeText={setBudget}
                  keyboardType="numeric"
                />
              </View>
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
              onPress={() => setShowCustomModal(false)}
            >
              <Text style={[styles.modalCancelText, { color: colors.text }]}>
                {language === "he" ? "ביטול" : "Cancel"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalCreateButton,
                { backgroundColor: colors.emerald500 },
              ]}
              onPress={handleGenerateCustomMenu}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Send size={16} color="#ffffff" />
                  <Text style={styles.modalCreateText}>
                    {language === "he" ? "צור" : "Create"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderFeedbackModal = () => (
    <Modal
      visible={showFeedbackModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowFeedbackModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[styles.modalContent, { backgroundColor: colors.background }]}
        >
          <View
            style={[styles.modalHeader, { borderBottomColor: colors.border }]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {language === "he"
                ? "דרג את התוכנית הנוכחית"
                : "Rate Current Plan"}
            </Text>
            <TouchableOpacity onPress={() => setShowFeedbackModal(false)}>
              <X size={24} color={colors.icon} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {language === "he"
                ? "איך הייתה התוכנית שלך?"
                : "How was your plan?"}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                {language === "he" ? "דירוג כללי" : "Overall Rating"} *
              </Text>
              <View style={styles.ratingContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() =>
                      setFeedbackForm({ ...feedbackForm, rating: star })
                    }
                    style={styles.starButton}
                  >
                    <Star
                      size={32}
                      color={
                        star <= feedbackForm.rating ? "#fbbf24" : colors.border
                      }
                      fill={
                        star <= feedbackForm.rating ? "#fbbf24" : "transparent"
                      }
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

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
                ]}
                placeholder={
                  language === "he"
                    ? "תאר מה אהבת בתוכנית..."
                    : "Describe what you liked about the plan..."
                }
                placeholderTextColor={colors.icon}
                value={feedbackForm.liked}
                onChangeText={(text) =>
                  setFeedbackForm({ ...feedbackForm, liked: text })
                }
                multiline
                numberOfLines={3}
                textAlign={isRTL ? "right" : "left"}
              />
            </View>

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
                ]}
                placeholder={
                  language === "he"
                    ? "תאר מה לא אהבת..."
                    : "Describe what you didn't like..."
                }
                placeholderTextColor={colors.icon}
                value={feedbackForm.disliked}
                onChangeText={(text) =>
                  setFeedbackForm({ ...feedbackForm, disliked: text })
                }
                multiline
                numberOfLines={3}
                textAlign={isRTL ? "right" : "left"}
              />
            </View>

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
                ]}
                placeholder={
                  language === "he" ? "איך נוכל לשפר?" : "How can we improve?"
                }
                placeholderTextColor={colors.icon}
                value={feedbackForm.suggestions}
                onChangeText={(text) =>
                  setFeedbackForm({ ...feedbackForm, suggestions: text })
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
              onPress={() => setShowFeedbackModal(false)}
            >
              <Text style={[styles.modalCancelText, { color: colors.text }]}>
                {language === "he" ? "ביטול" : "Cancel"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalCreateButton,
                { backgroundColor: colors.emerald500 },
              ]}
              onPress={handleFeedbackSubmit}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Send size={16} color="#ffffff" />
                  <Text style={styles.modalCreateText}>
                    {language === "he" ? "שמור והמשך" : "Save & Continue"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderComprehensiveModal = () => (
    <Modal
      visible={showComprehensiveModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowComprehensiveModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.comprehensiveModalContainer,
            { backgroundColor: colors.background },
          ]}
        >
          <View
            style={[styles.modalHeader, { borderBottomColor: colors.border }]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {language === "he"
                ? "צור תפריט מקיף"
                : "Create Comprehensive Menu"}
            </Text>
            <TouchableOpacity onPress={() => setShowComprehensiveModal(false)}>
              <X size={24} color={colors.icon} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBody}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                {language === "he" ? "שם התפריט" : "Menu Name"} *
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                value={menuName}
                onChangeText={setMenuName}
                placeholder={language === "he" ? "התפריט שלי" : "My Menu"}
                placeholderTextColor={colors.icon}
              />
            </View>

            <View style={styles.inputRow}>
              <View
                style={[
                  styles.inputGroup,
                  {
                    flex: 1,
                    marginRight: isRTL ? 0 : 12,
                    marginLeft: isRTL ? 12 : 0,
                  },
                ]}
              >
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  {language === "he" ? "מספר ימים" : "Duration (Days)"}
                </Text>
                <View style={styles.daysSelector}>
                  {[1, 3, 5, 7, 14, 21, 30].map((days) => (
                    <TouchableOpacity
                      key={days}
                      style={[
                        styles.dayOption,
                        { borderColor: colors.border },
                        selectedDays === days && {
                          backgroundColor: colors.emerald500,
                        },
                      ]}
                      onPress={() => setSelectedDays(days)}
                    >
                      <Text
                        style={[
                          styles.dayOptionText,
                          {
                            color:
                              selectedDays === days ? "#ffffff" : colors.text,
                          },
                        ]}
                      >
                        {days}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  {language === "he" ? "ארוחות ביום" : "Meals/Day"}
                </Text>
                <View style={styles.daysSelector}>
                  {["2", "3", "4", "5"].map((meals) => (
                    <TouchableOpacity
                      key={meals}
                      style={[
                        styles.dayOption,
                        { borderColor: colors.border },
                        selectedMealsPerDay === meals && {
                          backgroundColor: colors.emerald500,
                        },
                      ]}
                      onPress={() => setSelectedMealsPerDay(meals)}
                    >
                      <Text
                        style={[
                          styles.dayOptionText,
                          {
                            color:
                              selectedMealsPerDay === meals
                                ? "#ffffff"
                                : colors.text,
                          },
                        ]}
                      >
                        {meals}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {language === "he"
                ? "יעדים תזונתיים יומיים"
                : "Daily Nutrition Goals"}
            </Text>
            <View style={styles.inputRow}>
              <View
                style={[
                  styles.inputGroup,
                  {
                    flex: 1,
                    marginRight: isRTL ? 0 : 12,
                    marginLeft: isRTL ? 12 : 0,
                  },
                ]}
              >
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  {language === "he" ? "קלוריות" : "Calories"}
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  value={targetCalories}
                  onChangeText={setTargetCalories}
                  placeholder="2000"
                  placeholderTextColor={colors.icon}
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  {language === "he" ? "חלבון (ג')" : "Protein (g)"}
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  value={proteinGoal}
                  onChangeText={setProteinGoal}
                  placeholder="150"
                  placeholderTextColor={colors.icon}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.inputRow}>
              <View
                style={[
                  styles.inputGroup,
                  {
                    flex: 1,
                    marginRight: isRTL ? 0 : 12,
                    marginLeft: isRTL ? 12 : 0,
                  },
                ]}
              >
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  {language === "he" ? "פחמימות (ג')" : "Carbs (g)"}
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  value={carbGoal}
                  onChangeText={setCarbGoal}
                  placeholder="200"
                  placeholderTextColor={colors.icon}
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  {language === "he" ? "שומנים (ג')" : "Fats (g)"}
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  value={fatGoal}
                  onChangeText={setFatGoal}
                  placeholder="70"
                  placeholderTextColor={colors.icon}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                {language === "he" ? "תקציב יומי (₪)" : "Daily Budget (₪)"}
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                value={budget}
                onChangeText={setBudget}
                placeholder="100"
                placeholderTextColor={colors.icon}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                {language === "he" ? "בקשות מיוחדות" : "Special Requests"}
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                multiline
                numberOfLines={3}
                value={specialRequests}
                onChangeText={setSpecialRequests}
                placeholder={
                  language === "he"
                    ? "בקשות נוספות לתפריט..."
                    : "Additional menu requests..."
                }
                placeholderTextColor={colors.icon}
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
              onPress={() => setShowComprehensiveModal(false)}
            >
              <Text style={[styles.modalCancelText, { color: colors.text }]}>
                {language === "he" ? "ביטול" : "Cancel"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalCreateButton,
                { backgroundColor: colors.emerald500 },
              ]}
              onPress={handleCreateComprehensiveMenu}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Send size={16} color="#ffffff" />
                  <Text style={styles.modalCreateText}>
                    {language === "he" ? "צור והפעל" : "Create & Activate"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (isLoading) {
    return (
      <LoadingScreen
        text={
          language === "he"
            ? "טוען תפריטים מומלצים..."
            : "Loading recommended menus..."
        }
      />
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {/* Enhanced Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <View style={styles.headerTop}>
          <View style={styles.titleContainer}>
            <Text
              style={[
                styles.title,
                { color: colors.text },
                isRTL && styles.rtlText,
              ]}
            >
              {language === "he" ? "תפריטים מומלצים" : "Recommended Menus"}
            </Text>
            <Text
              style={[
                styles.subtitle,
                { color: colors.icon },
                isRTL && styles.rtlText,
              ]}
            >
              {language === "he"
                ? "תפריטים מותאמים אישית עבורך"
                : "AI-powered personalized menus"}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.generateButton,
              { backgroundColor: colors.emerald500 },
            ]}
            onPress={() => setShowComprehensiveModal(true)}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Plus size={20} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>

        {/* Centered Continue Button */}
        {hasActivePlan && (
          <View style={styles.continueButtonContainer}>
            <TouchableOpacity
              style={[
                styles.centeredContinueButton,
                { backgroundColor: colors.emerald500 },
              ]}
              onPress={() =>
                router.push(
                  `/menu/activeMenu?planId=${activePlanData?.plan_id}`
                )
              }
            >
              <CheckCircle size={20} color="#ffffff" />
              <Text style={styles.centeredContinueButtonText}>
                {language === "he"
                  ? "המשך התוכנית הפעילה"
                  : "Continue Active Plan"}
              </Text>
              <ArrowRight size={16} color="#ffffff" />
            </TouchableOpacity>
          </View>
        )}

        {/* Enhanced Search and Filter */}
        <View style={styles.searchSection}>
          <View
            style={[
              styles.searchContainer,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Search size={16} color={colors.icon} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={
                language === "he" ? "חפש תפריטים..." : "Search menus..."
              }
              placeholderTextColor={colors.icon}
              value={searchQuery}
              onChangeText={setSearchQuery}
              textAlign={isRTL ? "right" : "left"}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <X size={16} color={colors.icon} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersContainer}
          >
            {[
              { key: "all", label: language === "he" ? "הכל" : "All" },
              { key: "recent", label: language === "he" ? "חדשים" : "Recent" },
              {
                key: "high_protein",
                label: language === "he" ? "עתיר חלבון" : "High Protein",
              },
              {
                key: "low_calorie",
                label: language === "he" ? "דל קלוריות" : "Low Calorie",
              },
            ].map((filter) => (
              <TouchableOpacity
                key={filter.key}
                style={[
                  styles.filterChip,
                  {
                    borderColor: colors.border,
                    backgroundColor:
                      selectedFilter === filter.key
                        ? colors.emerald500
                        : colors.surface,
                  },
                ]}
                onPress={() => setSelectedFilter(filter.key)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color:
                        selectedFilter === filter.key ? "#ffffff" : colors.text,
                    },
                  ]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Content */}
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
        {filteredMenus.length > 0 ? (
          <>
            {/* Enhanced Stats Overview */}
            <View
              style={[
                styles.statsCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <LinearGradient
                colors={
                  isDark
                    ? ["#064e3b", "#047857", "#059669"]
                    : ["#ecfdf5", "#d1fae5", "#a7f3d0"]
                }
                style={styles.statsGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.statsHeader}>
                  <Sparkles size={24} color={colors.emerald500} />
                  <Text
                    style={[styles.statsTitle, { color: colors.emerald700 }]}
                  >
                    {language === "he" ? "הסטטיסטיקות שלך" : "Your Menu Stats"}
                  </Text>
                </View>

                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Text
                      style={[styles.statValue, { color: colors.emerald700 }]}
                    >
                      {filteredMenus.length}
                    </Text>
                    <Text
                      style={[styles.statLabel, { color: colors.emerald600 }]}
                    >
                      {language === "he" ? "תפריטים" : "Menus"}
                    </Text>
                  </View>

                  <View style={styles.statItem}>
                    <Text
                      style={[styles.statValue, { color: colors.emerald700 }]}
                    >
                      {filteredMenus.reduce(
                        (sum, menu) => sum + menu.meals.length,
                        0
                      )}
                    </Text>
                    <Text
                      style={[styles.statLabel, { color: colors.emerald600 }]}
                    >
                      {language === "he" ? "ארוחות" : "Meals"}
                    </Text>
                  </View>

                  <View style={styles.statItem}>
                    <Text
                      style={[styles.statValue, { color: colors.emerald700 }]}
                    >
                      {Math.round(
                        filteredMenus.reduce(
                          (sum, menu) => sum + menu.total_calories,
                          0
                        ) / filteredMenus.length
                      ) || 0}
                    </Text>
                    <Text
                      style={[styles.statLabel, { color: colors.emerald600 }]}
                    >
                      {language === "he" ? "קלוריות ממוצע" : "Avg Calories"}
                    </Text>
                  </View>
                </View>
              </LinearGradient>
            </View>

            {/* Menu Cards */}
            {filteredMenus.map(renderMenuCard)}
          </>
        ) : (
          <View style={styles.emptyState}>
            <ChefHat size={80} color={colors.icon} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {language === "he" ? "אין תפריטים זמינים" : "No menus available"}
            </Text>
            <Text style={[styles.emptyText, { color: colors.icon }]}>
              {language === "he"
                ? "צור תפריט מותאם אישית כדי להתחיל"
                : "Create a personalized menu to get started"}
            </Text>

            <TouchableOpacity
              style={[
                styles.createFirstButton,
                { backgroundColor: colors.emerald500 },
              ]}
              onPress={() => setShowCustomModal(true)}
            >
              <Plus size={20} color="#ffffff" />
              <Text style={styles.createFirstButtonText}>
                {language === "he" ? "צור תפריט ראשון" : "Create First Menu"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Enhanced Floating Action Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.emerald500 }]}
        onPress={handleGenerateMenu}
        disabled={isGenerating}
      >
        {isGenerating ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Sparkles size={24} color="#ffffff" />
        )}
      </TouchableOpacity>

      {renderCustomModal()}
      {renderComprehensiveModal()}
      {renderFeedbackModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  titleContainer: {
    flex: 1,
  },
  continueButtonContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  centeredContinueButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 28,
    gap: 12,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    minWidth: 280,
    justifyContent: "center",
  },
  centeredContinueButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    textAlign: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.8,
    fontWeight: "500",
  },
  rtlText: {
    textAlign: "right",
  },
  rtlRow: {
    flexDirection: "row-reverse",
  },
  generateButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  continueButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 26,
    gap: 10,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  searchSection: {
    gap: 16,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
    fontWeight: "500",
  },
  filtersContainer: {
    paddingHorizontal: 0,
    gap: 12,
  },
  filterChip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1.5,
    marginRight: 10,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    gap: 24,
  },
  statsCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  statsGradient: {
    padding: 24,
  },
  statsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  statsTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statItem: {
    alignItems: "center",
    gap: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  menuCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    marginBottom: 20,
  },
  cardHeader: {
    padding: 24,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flex: 1,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerText: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#ffffff",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  menuDate: {
    fontSize: 14,
    color: "#ffffff",
    opacity: 0.9,
    fontWeight: "500",
  },
  daysContainer: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
  },
  daysNumber: {
    fontSize: 24,
    fontWeight: "800",
    color: "#ffffff",
  },
  daysLabel: {
    fontSize: 12,
    color: "#ffffff",
    opacity: 0.9,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  cardContent: {
    padding: 24,
    gap: 24,
  },
  descriptionContainer: {
    marginBottom: 4,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    opacity: 0.8,
    fontWeight: "500",
  },
  nutritionSection: {
    gap: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  nutritionGrid: {
    flexDirection: "row",
    gap: 12,
  },
  nutritionCard: {
    flex: 1,
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
    gap: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  nutritionIcon: {
    marginBottom: 4,
  },
  nutritionValue: {
    fontSize: 20,
    fontWeight: "800",
  },
  nutritionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  mealsPreview: {
    gap: 16,
  },
  previewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: "600",
  },
  mealsScrollContainer: {
    paddingRight: 20,
    gap: 16,
  },
  mealPreviewCard: {
    width: 140,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    marginRight: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  mealPreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  mealTypeText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  mealPreviewName: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 18,
    flex: 1,
  },
  mealPreviewStats: {
    alignItems: "center",
    gap: 2,
  },
  mealPreviewCalories: {
    fontSize: 16,
    fontWeight: "700",
  },
  mealPreviewLabel: {
    fontSize: 10,
    fontWeight: "500",
    textTransform: "uppercase",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 16,
    backgroundColor: "rgba(16, 185, 129, 0.05)",
    borderRadius: 16,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    fontWeight: "600",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 16,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
    gap: 10,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  primaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    gap: 10,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 80,
    gap: 24,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
    opacity: 0.8,
    lineHeight: 24,
    maxWidth: 280,
  },
  createFirstButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 18,
    borderRadius: 16,
    gap: 12,
    marginTop: 20,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  createFirstButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  fab: {
    position: "absolute",
    bottom: 30,
    right: 30,
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxHeight: "85%",
    borderRadius: 24,
    overflow: "hidden",
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  comprehensiveModalContainer: {
    width: "100%",
    maxHeight: "90%",
    borderRadius: 24,
    overflow: "hidden",
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 24,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  modalBody: {
    padding: 24,
    maxHeight: 500,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  textInput: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    minHeight: 56,
    fontWeight: "500",
  },
  textArea: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: "top",
    fontWeight: "500",
  },
  inputRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
  },
  daysSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  dayOption: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    minWidth: 50,
    alignItems: "center",
  },
  dayOptionText: {
    fontSize: 14,
    fontWeight: "700",
  },
  modalActions: {
    flexDirection: "row",
    padding: 24,
    gap: 16,
    borderTopWidth: 1,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: "700",
  },
  modalCreateButton: {
    flex: 2,
    flexDirection: "row",
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalCreateText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  ratingContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginVertical: 20,
  },
  starButton: {
    padding: 6,
  },
});

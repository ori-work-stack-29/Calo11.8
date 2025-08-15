import React, { useRef, useEffect, useMemo } from "react";
import { Tabs } from "expo-router";
import {
  ScrollView,
  View,
  StyleSheet,
  Dimensions,
  Animated,
  Platform,
  TouchableOpacity,
  Text,
} from "react-native";

// Import icons from @expo/vector-icons instead of lucide-react-native
import { Ionicons } from "@expo/vector-icons";

// Import LinearGradient - make sure expo-linear-gradient is installed
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const TAB_HEIGHT = 60;
const ICON_SIZE = 22;

const theme = {
  colors: {
    primary: "#10B981",
    primaryLight: "#34D399",
    background: "#FFFFFF",
    backgroundSecondary: "#F8FAFC",
    textPrimary: "#1F2937",
    textSecondary: "#6B7280",
    border: "#E5E7EB",
    shadow: "#000000",
  },
};

// Define valid route names
type RouteNames = "index" | "history" | "camera" | "statistics" | "profile";

// Icon mapping using Ionicons (which comes with Expo by default)
const iconMap: Record<RouteNames, keyof typeof Ionicons.glyphMap> = {
  index: "home-outline",
  history: "time-outline",
  camera: "camera-outline",
  statistics: "trending-up-outline",
  profile: "person-outline",
};

const activeIconMap: Record<RouteNames, keyof typeof Ionicons.glyphMap> = {
  index: "home",
  history: "time",
  camera: "camera",
  statistics: "trending-up",
  profile: "person",
};

const tabLabels: Record<RouteNames, string> = {
  index: "Home",
  history: "History",
  camera: "Camera",
  statistics: "Stats",
  profile: "Profile",
};

interface CustomTabBarProps {
  state: {
    index: number;
    routes: Array<{ key: string; name: string }>;
  };
  descriptors: any;
  navigation: {
    emit: (options: {
      type: string;
      target: string;
      canPreventDefault: boolean;
    }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
}

interface TabPosition {
  x: number;
  width: number;
  centerX: number;
}

interface TabCalculations {
  activeIndex: number;
  tabPositions: TabPosition[];
  needsScrolling: boolean;
  totalWidth: number;
}

function ScrollableTabBar({
  state,
  descriptors,
  navigation,
}: CustomTabBarProps) {
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const indicatorPosition = useRef(new Animated.Value(0)).current;
  const indicatorWidth = useRef(new Animated.Value(80)).current;

  // Simplified tab calculations
  const tabCalculations: TabCalculations = useMemo(() => {
    const activeIndex = state.index;
    const routeCount = state.routes.length;

    // Responsive tab sizing
    const availableWidth = SCREEN_WIDTH - 32; // Account for padding
    const minTabWidth = 60;
    const maxTabWidth = 100;
    const activeTabExtra = 40; // Extra width for active tab with text

    // Calculate if we need scrolling
    const totalMinWidth =
      (routeCount - 1) * minTabWidth + (minTabWidth + activeTabExtra);
    const needsScrolling = totalMinWidth > availableWidth;

    // Calculate tab widths and positions
    let currentX = 16; // Starting padding
    const tabPositions: TabPosition[] = state.routes.map((route, index) => {
      const isActive = index === activeIndex;
      const baseWidth = needsScrolling
        ? minTabWidth
        : Math.min(maxTabWidth, availableWidth / routeCount);
      const width = isActive ? baseWidth + activeTabExtra : baseWidth;

      const position: TabPosition = {
        x: currentX,
        width,
        centerX: currentX + width / 2,
      };

      currentX += width + 8; // 8px gap between tabs
      return position;
    });

    return {
      activeIndex,
      tabPositions,
      needsScrolling,
      totalWidth: currentX - 8 + 16, // Remove last gap, add end padding
    };
  }, [state.index, state.routes.length]);

  // Simplified animation
  const animateIndicator = () => {
    const { tabPositions, activeIndex } = tabCalculations;
    const activeTab = tabPositions[activeIndex];

    if (!activeTab) return;

    Animated.parallel([
      Animated.spring(indicatorPosition, {
        toValue: activeTab.x,
        useNativeDriver: false,
        tension: 300,
        friction: 30,
      }),
      Animated.spring(indicatorWidth, {
        toValue: activeTab.width,
        useNativeDriver: false,
        tension: 300,
        friction: 30,
      }),
    ]).start();

    // Auto-scroll to keep active tab visible
    if (tabCalculations.needsScrolling && scrollViewRef.current) {
      const scrollToX = Math.max(0, activeTab.centerX - SCREEN_WIDTH / 2);
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          x: scrollToX,
          animated: true,
        });
      }, 100);
    }
  };

  useEffect(() => {
    animateIndicator();
  }, [state.index, tabCalculations]); // Add tabCalculations to dependencies

  // Initialize indicator position
  useEffect(() => {
    const { tabPositions, activeIndex } = tabCalculations;
    const activeTab = tabPositions[activeIndex];

    if (activeTab) {
      indicatorPosition.setValue(activeTab.x);
      indicatorWidth.setValue(activeTab.width);
    }
  }, []); // Empty dependency array for initialization

  const renderTab = (route: { key: string; name: string }, index: number) => {
    const isFocused = state.index === index;
    const routeName = route.name as RouteNames;
    const label = tabLabels[routeName] || route.name;
    const iconName = isFocused ? activeIconMap[routeName] : iconMap[routeName];
    const fallbackIcon = isFocused ? "home" : "home-outline";
    const tabPosition = tabCalculations.tabPositions[index];

    if (!tabPosition) return null;

    const onPress = () => {
      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });

      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <TouchableOpacity
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        onPress={onPress}
        style={[
          styles.tab,
          {
            width: tabPosition.width,
          },
        ]}
        activeOpacity={0.7}
      >
        <View style={styles.tabContent}>
          <Ionicons
            name={iconName || fallbackIcon}
            size={ICON_SIZE}
            color={
              isFocused ? theme.colors.primary : theme.colors.textSecondary
            }
          />
          {isFocused && (
            <Text style={styles.tabText} numberOfLines={1}>
              {label}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const TabContent = () => {
    if (tabCalculations.needsScrolling) {
      return (
        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { width: tabCalculations.totalWidth },
          ]}
          bounces={false}
          decelerationRate="fast"
        >
          {state.routes.map(renderTab)}
        </ScrollView>
      );
    }

    return (
      <View style={styles.fixedTabsContainer}>
        {state.routes.map(renderTab)}
      </View>
    );
  };

  return (
    <View
      style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}
    >
      <View style={styles.tabBar}>
        {/* Animated indicator */}
        <Animated.View
          style={[
            styles.indicator,
            {
              left: indicatorPosition,
              width: indicatorWidth,
            },
          ]}
        >
          <LinearGradient
            colors={[theme.colors.primary, theme.colors.primaryLight]}
            style={styles.indicatorGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          />
        </Animated.View>

        {/* Tab content */}
        <TabContent />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: "transparent",
  },
  tabBar: {
    height: TAB_HEIGHT,
    borderRadius: 30,
    backgroundColor: theme.colors.background,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    position: "relative",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        backgroundColor: "rgba(255, 255, 255, 0.95)",
      },
    }),
  },
  indicator: {
    position: "absolute",
    top: 6,
    height: TAB_HEIGHT - 12,
    borderRadius: (TAB_HEIGHT - 12) / 2,
    zIndex: 1,
  },
  indicatorGradient: {
    flex: 1,
    borderRadius: (TAB_HEIGHT - 12) / 2,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  scrollContent: {
    alignItems: "center",
    paddingVertical: 6,
    minHeight: TAB_HEIGHT - 12,
  },
  fixedTabsContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
  },
  tab: {
    height: TAB_HEIGHT - 12,
    borderRadius: (TAB_HEIGHT - 12) / 2,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },
  tabContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: "100%",
  },
  tabText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <ScrollableTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
      }}
    />
  );
}

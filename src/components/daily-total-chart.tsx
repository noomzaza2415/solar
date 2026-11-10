import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { LayoutChangeEvent } from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Svg, {
  Defs,
  G,
  Line,
  LinearGradient,
  Polygon,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import {
  MONTH_KEYS,
  SHIFT_TARGETS,
  getTargetStatus,
  toNumber,
  type AlertLanguage,
  type SolarApiData,
  type TargetStatus,
} from "@/lib/solar-alerts";
import { parseShiftWeather } from "@/lib/solar-weather";

// กราฟแท่งยอดรวม (Total) รายวันของหนึ่งเดือน เปิดในแนวนอน
//
// แท่งละวัน เส้นเป้า 7,000 พาดขวาง วันที่ไม่ถึงเป้าจึงเห็นได้จาก "ตำแหน่ง" ว่าแท่งจมใต้เส้น
// ไม่ต้องพึ่งสีอย่างเดียว ส่วนสีบอกระดับ (เฝ้าระวัง/ต่ำกว่าเกณฑ์) ตามเกณฑ์เดียวกับการ์ด
// จอแนวนอนกว้างพอให้ 31 แท่งมีความกว้างราว 15dp ต่อแท่ง แตะเลือกได้แม่นทีละวัน
// แท่งวาดแบบ 3 มิติด้วย react-native-svg (หน้า/บน/ข้าง/หลัง ไล่เฉดสี)

export type DailyChartColors = {
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentBorder: string;
  accentSoft: string;
  border: string;
  borderStrong: string;
  pass: string;
  warning: string;
  critical: string;
  passInk: string;
  warningInk: string;
  criticalInk: string;
};

export type DailyChartLabels = {
  dailyTitle: string;
  tapBarHint: string;
  missedTarget: string;
  daysUnit: string;
  back: string;
  target: string;
  passShort: string;
  warningShort: string;
  criticalShort: string;
  noDataDay: string;
  zoomIn: string;
  zoomOut: string;
  zoomReset: string;
  viewDaily: string;
  viewYearly: string;
};

export type ChartView = "daily" | "yearly";

type Props = {
  data: SolarApiData | null;
  year: number;
  monthIndex: number;
  /** เดือนที่มีข้อมูล เรียงจากเก่าไปใหม่ ใช้กับปุ่มเลื่อนเดือน */
  availableMonths: number[];
  onChangeMonth: (monthIndex: number) => void;
  onBack: () => void;
  onChangeView: (view: ChartView) => void;
  colors: DailyChartColors;
  labels: DailyChartLabels;
  lang: AlertLanguage;
  insets: { top: number; right: number; bottom: number; left: number };
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const Y_AXIS_WIDTH = 34;
export const STATUS_ICONS = {
  pass: "check-circle",
  warning: "alert-circle",
  critical: "close-circle",
} as const;

// เครื่องหมายลบ U+2212 ให้กว้างเท่าเครื่องหมายบวก เหมือนการ์ดในหน้าหลัก
export const formatDelta = (delta: number) => {
  const rounded = Math.round(delta);
  if (rounded === 0) return "±0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toLocaleString()}`;
};

export const BAR_STATUSES: TargetStatus[] = ["pass", "warning", "critical"];

// ซูมเฉพาะแนวนอน (ยืดความกว้างของเดือน) ความสูงแท่งยังเทียบกับเส้นเป้าได้เหมือนเดิม
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.5;
const PLOT_TOP_GAP = 8;
const X_AXIS_HEIGHT = 17;
// เผื่อที่เหนือแท่งที่สูงสุดให้ป้ายตัวเลขไม่ถูกตัด
const VALUE_LABEL_SPACE = 14;

// ตัวเลขบนแท่งปัดลงเสมอ วันที่ได้ 6,999.6 ต้องไม่โชว์เป็น "7,000" หรือ "7.0k"
// ไม่งั้นจะดูเหมือนถึงเป้าทั้งที่แท่งเป็นสีเหลือง
const formatBarValue = (value: number, mode: "full" | "short") =>
  mode === "full"
    ? Math.floor(value).toLocaleString()
    : `${(Math.floor(value / 100) / 10).toFixed(1)}k`;

/** สลับกราฟรายวัน/รายปี วางถัดจากปุ่มกลับในทั้งสองหน้า ตำแหน่งจึงไม่กระโดดตอนสลับ */
export function ChartViewToggle({
  view,
  onChange,
  colors,
  labels,
}: {
  view: ChartView;
  onChange: (view: ChartView) => void;
  colors: DailyChartColors;
  labels: Pick<DailyChartLabels, "viewDaily" | "viewYearly">;
}) {
  const styles = createChartStyles(colors);
  const options: { value: ChartView; label: string }[] = [
    { value: "daily", label: labels.viewDaily },
    { value: "yearly", label: labels.viewYearly },
  ];

  return (
    <View style={styles.toggleGroup} accessibilityRole="tablist">
      {options.map((option) => {
        const isActive = option.value === view;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.toggleButton, isActive && styles.toggleButtonActive]}
            onPress={() => !isActive && onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Text
              style={[styles.toggleText, isActive && styles.toggleTextActive]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** ไล่เฉดของแต่ละหน้าแท่ง หน้าตรงเข้มสุด ด้านข้าง/ด้านหลังจางลงให้ดูมีมิติ */
export function BarGradients({ id, color }: { id: TargetStatus; color: string }) {
  return (
    <>
      <LinearGradient id={`front-${id}`} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={color} stopOpacity={0.95} />
        <Stop offset="1" stopColor={color} stopOpacity={0.72} />
      </LinearGradient>
      <LinearGradient id={`back-${id}`} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={color} stopOpacity={0.5} />
        <Stop offset="1" stopColor={color} stopOpacity={0.3} />
      </LinearGradient>
      <LinearGradient id={`side-${id}`} x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor={color} stopOpacity={0.6} />
        <Stop offset="1" stopColor={color} stopOpacity={0.4} />
      </LinearGradient>
      <LinearGradient id={`top-${id}`} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={color} stopOpacity={0.8} />
        <Stop offset="1" stopColor={color} stopOpacity={0.55} />
      </LinearGradient>
    </>
  );
}

// แท่ง 3 มิติ: วาดหลัง → ด้านข้าง → ด้านบน → หน้า ให้หน้าตรงทับทุกอย่าง
// ความสูง "หน้าตรง" คือค่าจริง ฐานวางบนเส้น 0 ส่วนความลึกเป็นแค่การตกแต่ง
// จึงอ่านค่าเทียบกับเส้นเป้าจากขอบบนของหน้าตรงเสมอ
export function Bar3D({
  x,
  baseY,
  width,
  height,
  depth,
  gradientId,
}: {
  x: number;
  baseY: number;
  width: number;
  height: number;
  depth: number;
  gradientId: TargetStatus;
}) {
  const top = baseY - height;
  // ร่นขอบหน้าเอียงเข้ามานิดหน่อย รอยต่อระหว่างหน้าจะดูคม ไม่เป็นเหลี่ยมทับกัน
  const inset = Math.min(1.5, width * 0.1);
  const radius = Math.min(2, width / 4);

  return (
    <>
      <Rect
        x={x + depth}
        y={top - depth}
        width={width}
        height={height}
        rx={radius}
        fill={`url(#back-${gradientId})`}
      />
      <Polygon
        points={[
          `${x + width + inset},${top - inset}`,
          `${x + width + depth - inset},${top - depth + inset}`,
          `${x + width + depth - inset},${baseY - depth - inset}`,
          `${x + width + inset},${baseY - inset}`,
        ].join(" ")}
        fill={`url(#side-${gradientId})`}
      />
      <Polygon
        points={[
          `${x + inset},${top - inset}`,
          `${x + width - inset},${top - inset}`,
          `${x + width + depth - inset},${top - depth + inset}`,
          `${x + depth + inset},${top - depth + inset}`,
        ].join(" ")}
        fill={`url(#top-${gradientId})`}
      />
      <Rect
        x={x}
        y={top}
        width={width}
        height={height}
        rx={radius}
        fill={`url(#front-${gradientId})`}
      />
    </>
  );
}

export default function DailyTotalChart({
  data,
  year,
  monthIndex,
  availableMonths,
  onChangeMonth,
  onBack,
  onChangeView,
  colors,
  labels,
  lang,
  insets,
}: Props) {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  // ระยะที่เลื่อนกราฟไปทางซ้ายแล้ว (dp) ตอนซูมเข้า เลื่อนเองด้วย translateX ไม่ใช้ ScrollView
  const [offsetX, setOffsetX] = useState(0);
  // ค่าล่าสุดให้ตัวจับท่าทางอ่าน อัปเดตพร้อม setState ในตัวจัดการเหตุการณ์ (ห้ามเขียนตอน render)
  // ถ่างนิ้วยิง onUpdate ถี่กว่ารอบ render ref จึงต้องได้ค่าใหม่ทันที ไม่รอ render
  const zoomRef = useRef(MIN_ZOOM);
  const offsetXRef = useRef(0);
  const viewportWidthRef = useRef(0);
  const styles = createChartStyles(colors);

  const target = SHIFT_TARGETS.total;
  const monthKey = MONTH_KEYS[monthIndex];
  const today = new Date();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  // วันที่ยังมาไม่ถึงอาจมีตัวเลขของปีที่แล้วค้างอยู่ (คีย์ไม่มีปี) จึงไม่อ่าน
  const lastDay =
    year === today.getFullYear() && monthIndex === today.getMonth()
      ? today.getDate()
      : daysInMonth;

  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const total =
      day <= lastDay ? toNumber(data?.[`${monthKey}-Total-${day}`]) : undefined;
    return {
      day,
      total,
      status: total === undefined ? null : getTargetStatus(total, target),
    };
  });

  const recorded = days.filter((day) => day.total !== undefined);
  const missed = recorded.filter((day) => day.status !== "pass");
  const shortfall = missed.reduce(
    (sum, day) => sum + (target - (day.total ?? 0)),
    0,
  );

  const plotSize = {
    width: viewport.width * zoom,
    height: Math.max(viewport.height - PLOT_TOP_GAP - X_AXIS_HEIGHT, 0),
  };
  const slotWidth = plotSize.width / daysInMonth;
  // ป้ายตัวเลขบนแท่ง: ช่องกว้างพอก็แสดงเต็ม แคบลงแสดงแบบย่อ (7.1k)
  // แคบกว่านั้นตัวเลขจะชนกัน จึงแสดงเฉพาะวันที่แตะเลือก (ซูมเข้าเพื่อดูทุกวัน)
  const valueLabelMode: "full" | "short" | "none" =
    slotWidth >= 34 ? "full" : slotWidth >= 20 ? "short" : "none";
  // หน้าแท่งกินราว 58% ของช่อง ที่เหลือเผื่อให้ด้านข้างแบบ 3 มิติและช่องว่างระหว่างแท่ง
  const barWidth = Math.max(Math.min(slotWidth * 0.58, 20), 3);
  // ความลึกของแท่ง (ด้านบน/ด้านข้างที่เอียงขึ้นไปทางขวา)
  const barDepth = Math.min(barWidth * 0.35, 7);
  // ช่องแคบเกินจะให้เลขวันชนกัน ก็แสดงแค่วันคี่
  const showEveryDayLabel = slotWidth >= 16;

  // สเกลเริ่มที่ 0 เสมอ ความสูงหน้าแท่งจึงเทียบกันได้ตรง ๆ
  // หักความลึกออกจากความสูงที่ใช้ได้ ไม่งั้นด้านบนของแท่งที่สูงสุดจะโดนตัด
  const maxValue = Math.max(target, ...recorded.map((day) => day.total ?? 0));
  const yMax = Math.ceil((maxValue * 1.05) / 1000) * 1000;
  const usableHeight = Math.max(
    plotSize.height - barDepth - VALUE_LABEL_SPACE,
    0,
  );
  const toY = (value: number) => (value / yMax) * usableHeight;
  /** พิกัด y ใน SVG (นับจากขอบบน) ของค่าที่กำหนด */
  const svgY = (value: number) => plotSize.height - toY(value);

  const monthPosition = availableMonths.indexOf(monthIndex);
  const prevMonth = availableMonths[monthPosition - 1];
  const nextMonth = availableMonths[monthPosition + 1];

  const statusColor = (status: TargetStatus) =>
    status === "pass"
      ? colors.pass
      : status === "warning"
        ? colors.warning
        : colors.critical;
  const statusInk = (status: TargetStatus) =>
    status === "pass"
      ? colors.passInk
      : status === "warning"
        ? colors.warningInk
        : colors.criticalInk;

  const badgeColor = missed.length > 0 ? colors.critical : colors.pass;
  const badgeInk = missed.length > 0 ? colors.criticalInk : colors.passInk;

  const handleViewportLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    viewportWidthRef.current = width;
    setViewport({ width, height });
  };

  // ใช้แต่ ref และ setState จึงเรียกจาก gesture ที่สร้างไว้ครั้งเดียวได้โดยไม่ได้ค่าเก่าค้าง
  const viewRef = useRef({
    /** ไม่ให้เลื่อนเลยขอบซ้าย/ขวาของเดือน */
    clampOffset: (offset: number, atZoom: number) => {
      const maxOffset = Math.max(viewportWidthRef.current * (atZoom - 1), 0);
      return Math.min(Math.max(offset, 0), maxOffset);
    },
    /** ซูมโดยตรึงจุด focalX (พิกัดในกรอบกราฟ) ไว้ที่เดิม วันที่อยู่ใต้นิ้วจะไม่เลื่อนหนีไป */
    zoomTo: (
      nextZoom: number,
      focalX: number,
      fromZoom: number,
      fromOffset: number,
    ) => {
      const zoomValue =
        Math.round(Math.min(Math.max(nextZoom, MIN_ZOOM), MAX_ZOOM) * 100) /
        100;
      const focalAtBaseZoom = (fromOffset + focalX) / fromZoom;

      zoomRef.current = zoomValue;
      setZoom(zoomValue);
      viewRef.current.setOffset(focalAtBaseZoom * zoomValue - focalX);
    },
    /** เลื่อนกราฟ (หลังตัดไม่ให้เลยขอบ) ที่ซูมปัจจุบัน */
    setOffset: (offset: number) => {
      const clamped = viewRef.current.clampOffset(offset, zoomRef.current);
      offsetXRef.current = clamped;
      setOffsetX(clamped);
    },
  });

  const zoomBy = (factor: number) =>
    viewRef.current.zoomTo(
      zoomRef.current * factor,
      viewport.width / 2,
      zoomRef.current,
      offsetXRef.current,
    );

  // ค่าตั้งต้นของท่าทางที่กำลังทำอยู่ ต้องอยู่ใน ref ไม่ใช่ตัวแปร let ใน closure (ดูหมายเหตุข้างล่าง)
  const gestureStartRef = useRef<{
    pinch: { zoom: number; offset: number; focalX: number } | null;
    panOffset: number;
  }>({ pinch: null, panOffset: 0 });

  // ตัวจับท่าทางชุดเดียวบนกรอบกราฟ: สองนิ้ว = ซูม, นิ้วเดียวลากซ้าย-ขวา = เลื่อน
  // ไม่ใช้ ScrollView เลื่อนเองด้วย translateX ทั้งสองท่าจึงไม่แย่งนิ้วกัน
  // การแตะเลือกวันยังเป็น Pressable เดิม พอลาก/ถ่างนิ้วจริง ท่าทางจะยกเลิกการแตะให้เอง
  //
  // สำคัญ: ส่ง callback เป็น "ชื่อฟังก์ชัน" ห้ามเขียนฟังก์ชันลงไปตรง ๆ ใน .onStart(() => ...)
  // babel plugin ของ Reanimated จะแปลงฟังก์ชันที่เขียนตรงนั้นเป็น worklet ซึ่งคัดลอกตัวแปรภายนอก
  // ไปเป็นของตัวเอง ค่าที่ onStart เขียนจึงไม่ถึง onUpdate (เคยทำให้ถ่างนิ้วไม่ติดเลย
  // และลากเลื่อนแล้วกระโดดกลับไปเริ่มที่ 0) ส่วน runOnJS(true) ให้ทำงานบน JS ตามปกติ
  const gesture = useMemo(() => {
    const handlePinchStart = (event: { focalX: number }) => {
      gestureStartRef.current.pinch = {
        zoom: zoomRef.current,
        offset: offsetXRef.current,
        focalX: event.focalX,
      };
    };
    const handlePinchUpdate = (event: { scale: number }) => {
      const { pinch } = gestureStartRef.current;
      if (!pinch) return;
      viewRef.current.zoomTo(
        pinch.zoom * event.scale,
        pinch.focalX,
        pinch.zoom,
        pinch.offset,
      );
    };
    const handlePinchEnd = () => {
      gestureStartRef.current.pinch = null;
    };
    const handlePanStart = () => {
      gestureStartRef.current.panOffset = offsetXRef.current;
    };
    const handlePanUpdate = (event: { translationX: number }) => {
      viewRef.current.setOffset(
        gestureStartRef.current.panOffset - event.translationX,
      );
    };

    // react-hooks/refs เข้าใจว่าฟังก์ชันที่ส่งให้ .onStart/.onUpdate อาจถูกเรียกตอน render
    // แต่ RNGH เรียกเฉพาะตอนมีท่าทางจริง (เหมือน onPress) ไม่มีการอ่าน ref ระหว่าง render
    /* eslint-disable react-hooks/refs */
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(handlePinchStart)
      .onUpdate(handlePinchUpdate)
      .onFinalize(handlePinchEnd);

    const pan = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      // ต้องลากแนวนอนเกิน 10dp ก่อน การแตะธรรมดาจึงยังเป็นการเลือกวัน
      .activeOffsetX([-10, 10])
      .onStart(handlePanStart)
      .onUpdate(handlePanUpdate);
    /* eslint-enable react-hooks/refs */

    return Gesture.Simultaneous(pinch, pan);
  }, []);

  const selected = selectedDay ? days[selectedDay - 1] : null;
  const selectedWeather = selected
    ? parseShiftWeather(data?.[`${monthKey}-W-Total-${selected.day}`], lang)
    : null;

  const renderDetail = () => {
    if (!selected) {
      return <Text style={styles.detailHint}>{labels.tapBarHint}</Text>;
    }

    const date = new Date(year, monthIndex, selected.day);
    const dateLabel = `${WEEKDAY_LABELS[date.getDay()]} ${selected.day} ${monthKey}`;

    if (selected.total === undefined || !selected.status) {
      return (
        <Text style={styles.detailText} numberOfLines={1}>
          <Text style={styles.detailDate}>{dateLabel}</Text> · {labels.noDataDay}
        </Text>
      );
    }

    return (
      <View style={styles.detailRow}>
        <MaterialCommunityIcons
          name={STATUS_ICONS[selected.status]}
          size={16}
          color={statusColor(selected.status)}
        />
        <Text style={styles.detailText} numberOfLines={1}>
          <Text style={styles.detailDate}>{dateLabel}</Text>
          {"  "}
          <Text style={styles.detailValue}>
            {Math.floor(selected.total).toLocaleString()} KWh
          </Text>
          {"  "}
          <Text style={{ color: statusInk(selected.status) }}>
            {Math.floor((selected.total / target) * 100)}% ·{" "}
            {formatDelta(selected.total - target)} KWh
          </Text>
        </Text>
        {selectedWeather && (
          <View style={styles.detailWeather}>
            <MaterialCommunityIcons
              name={selectedWeather.icon}
              size={15}
              color={colors.textMuted}
            />
            <Text style={styles.detailWeatherText} numberOfLines={1}>
              {selectedWeather.temperature !== null &&
                `${selectedWeather.temperature.toFixed(1)}°C `}
              {selectedWeather.condition}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <GestureHandlerRootView
      style={[
        styles.screen,
        {
          paddingTop: Math.max(insets.top, 10),
          paddingBottom: Math.max(insets.bottom, 8),
          // แนวนอนรอยบากจะอยู่ด้านข้าง
          paddingLeft: Math.max(insets.left, 16),
          paddingRight: Math.max(insets.right, 16),
        },
      ]}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={labels.back}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={22}
            color={colors.accent}
          />
        </TouchableOpacity>

        <ChartViewToggle
          view="daily"
          onChange={onChangeView}
          colors={colors}
          labels={labels}
        />

        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {monthKey} {year} · {labels.dailyTitle}
            </Text>
            {/* ป้ายยอดที่ขาดรวมของเดือน มีไอคอนกำกับ ไม่พึ่งสีอย่างเดียว */}
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: badgeColor + "1f",
                  borderColor: badgeColor + "55",
                },
              ]}
            >
              <MaterialCommunityIcons
                name={missed.length > 0 ? "trending-down" : "check-circle"}
                size={13}
                color={badgeInk}
              />
              <Text style={[styles.badgeText, { color: badgeInk }]}>
                {missed.length > 0
                  ? `${formatDelta(-shortfall)} KWh`
                  : labels.passShort}
              </Text>
            </View>
          </View>
          <Text style={styles.summary} numberOfLines={1}>
            {labels.missedTarget}{" "}
            <Text style={styles.summaryStrong}>
              {missed.length}/{recorded.length}
            </Text>{" "}
            {labels.daysUnit}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.navButton, prevMonth === undefined && styles.disabled]}
          disabled={prevMonth === undefined}
          onPress={() => prevMonth !== undefined && onChangeMonth(prevMonth)}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={24}
            color={colors.accent}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, nextMonth === undefined && styles.disabled]}
          disabled={nextMonth === undefined}
          onPress={() => nextMonth !== undefined && onChangeMonth(nextMonth)}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons
            name="chevron-right"
            size={24}
            color={colors.accent}
          />
        </TouchableOpacity>

        {/* ปุ่มซูมสำหรับคนที่ไม่ถนัดถ่างนิ้ว แตะตัวเลขตรงกลางเพื่อกลับไปดูทั้งเดือน */}
        <View style={styles.zoomGroup}>
          <TouchableOpacity
            style={[styles.zoomButton, zoom <= MIN_ZOOM && styles.disabled]}
            disabled={zoom <= MIN_ZOOM}
            onPress={() => zoomBy(1 / ZOOM_STEP)}
            accessibilityRole="button"
            accessibilityLabel={labels.zoomOut}
          >
            <MaterialCommunityIcons
              name="magnify-minus-outline"
              size={20}
              color={colors.accent}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.zoomValue}
            disabled={zoom <= MIN_ZOOM}
            onPress={() => zoomBy(MIN_ZOOM / zoom)}
            accessibilityRole="button"
            accessibilityLabel={labels.zoomReset}
          >
            <Text style={styles.zoomValueText}>{zoom.toFixed(1)}×</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.zoomButton, zoom >= MAX_ZOOM && styles.disabled]}
            disabled={zoom >= MAX_ZOOM}
            onPress={() => zoomBy(ZOOM_STEP)}
            accessibilityRole="button"
            accessibilityLabel={labels.zoomIn}
          >
            <MaterialCommunityIcons
              name="magnify-plus-outline"
              size={20}
              color={colors.accent}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* ความสูงคงที่ เลือกวันแล้วกราฟด้านล่างไม่กระตุก */}
      <View style={styles.detailBar}>{renderDetail()}</View>

      <View style={styles.chartRow}>
        {/* ไม่มีแกน y เต็มรูปแบบ บอกเฉพาะสองเส้นที่ใช้ตัดสินว่าวันนั้นผ่านหรือไม่
            อยู่นอกส่วนที่เลื่อน จึงยังเห็นตอนซูมแล้วเลื่อนไปกลางเดือน */}
        <View style={styles.yAxis}>
          {plotSize.height > 0 && (
            <>
              <Text
                style={[
                  styles.tickLabel,
                  styles.tickLabelStrong,
                  { bottom: X_AXIS_HEIGHT + toY(target) - 7 },
                ]}
              >
                {target.toLocaleString()}
              </Text>
              <Text
                style={[
                  styles.tickLabel,
                  { bottom: X_AXIS_HEIGHT + toY(target * 0.9) - 7 },
                ]}
              >
                90%
              </Text>
            </>
          )}
        </View>

        <GestureDetector gesture={gesture}>
          {/* collapsable={false} กัน Android ยุบ View นี้ทิ้งตอน render ซึ่งจะทำให้ท่าทางไม่มีที่ผูก */}
          <View
            style={styles.viewport}
            onLayout={handleViewportLayout}
            collapsable={false}
          >
                {plotSize.height > 0 && (
                  <View
                    style={{
                      width: plotSize.width,
                      transform: [{ translateX: -offsetX }],
                    }}
                  >
                    <View
                      style={[
                        styles.plot,
                        { width: plotSize.width, height: plotSize.height },
                      ]}
                    >
                <Svg width={plotSize.width} height={plotSize.height}>
                  <Defs>
                    {BAR_STATUSES.map((status) => (
                      <BarGradients
                        key={status}
                        id={status}
                        color={statusColor(status)}
                      />
                    ))}
                  </Defs>

                  {selectedDay !== null && (
                    <Rect
                      x={(selectedDay - 1) * slotWidth}
                      y={0}
                      width={slotWidth}
                      height={plotSize.height}
                      rx={4}
                      fill={colors.accentSoft}
                    />
                  )}

                  {days.map((day, index) => {
                    if (day.total === undefined || !day.status) return null;

                    const isDimmed =
                      selectedDay !== null && selectedDay !== day.day;

                    return (
                      <G key={day.day} opacity={isDimmed ? 0.35 : 1}>
                        <Bar3D
                          x={
                            index * slotWidth +
                            (slotWidth - barWidth - barDepth) / 2
                          }
                          baseY={plotSize.height}
                          width={barWidth}
                          height={Math.max(toY(day.total), 2)}
                          depth={barDepth}
                          gradientId={day.status}
                        />
                      </G>
                    );
                  })}

                  {/* เส้น 90% คือเส้นแบ่ง "เฝ้าระวัง" กับ "ต่ำกว่าเกณฑ์" */}
                  <Line
                    x1={0}
                    x2={plotSize.width}
                    y1={svgY(target * 0.9)}
                    y2={svgY(target * 0.9)}
                    stroke={colors.borderStrong}
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                  {/* เส้นเป้าวาดทับแท่ง จึงเห็นชัดว่าแท่งไหนทะลุ แท่งไหนจม */}
                  <Line
                    x1={0}
                    x2={plotSize.width}
                    y1={svgY(target)}
                    y2={svgY(target)}
                    stroke={colors.textSecondary}
                    strokeWidth={2}
                  />

                  {/* ตัวเลขวาดหลังสุด ให้อยู่บนเส้นเป้า (แท่งที่ยอดใกล้ 7,000 ป้ายจะตรงกับเส้นพอดี)
                      วาดสองชั้น: ขอบหนาสีพื้นหลังก่อน แล้วตัวอักษรทับ เส้นจึงขาดตรงตัวเลขพอดี
                      ใช้สีตัวหนังสือ ไม่ใช้สีแท่ง อ่านออกทุกสถานะทั้งโหมดมืด/สว่าง */}
                  {days.map((day, index) => {
                    if (day.total === undefined) return null;

                    const isSelected = selectedDay === day.day;
                    const isDimmed = selectedDay !== null && !isSelected;
                    const labelMode =
                      valueLabelMode === "none" && isSelected
                        ? "full"
                        : valueLabelMode;
                    if (labelMode === "none") return null;

                    const label = formatBarValue(day.total, labelMode);
                    const textProps = {
                      x: index * slotWidth + slotWidth / 2,
                      y: svgY(day.total) - barDepth - 4,
                      textAnchor: "middle" as const,
                      fontSize: 10.5,
                      fontWeight: isSelected ? ("800" as const) : ("700" as const),
                    };

                    return (
                      <G
                        key={`label-${day.day}`}
                        opacity={isDimmed ? 0.35 : 1}
                      >
                        <SvgText
                          {...textProps}
                          fill={colors.background}
                          stroke={colors.background}
                          strokeWidth={3.5}
                          strokeLinejoin="round"
                        >
                          {label}
                        </SvgText>
                        <SvgText {...textProps} fill={colors.textPrimary}>
                          {label}
                        </SvgText>
                      </G>
                    );
                  })}
                </Svg>

                {/* ชั้นรับการแตะวางทับ SVG พื้นที่แตะคือทั้งคอลัมน์ ไม่ใช่แค่ตัวแท่ง
                    วันที่ยอดต่ำมากก็ยังแตะโดน */}
                <View style={styles.hitRow}>
                  {days.map((day) => {
                    const isSelected = selectedDay === day.day;

                    return (
                      <Pressable
                        key={day.day}
                        style={styles.slot}
                        onPress={() =>
                          setSelectedDay(isSelected ? null : day.day)
                        }
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={
                          day.total === undefined
                            ? `${day.day} ${monthKey}: ${labels.noDataDay}`
                            : `${day.day} ${monthKey}: ${Math.round(day.total).toLocaleString()} KWh`
                        }
                      />
                    );
                  })}
                </View>
                    </View>

                    {/* เลขวันเลื่อนไปพร้อมแท่ง */}
                    <View style={styles.xAxis}>
                      {days.map((day) => (
                        <Text
                          key={day.day}
                          style={[
                            styles.xLabel,
                            day.total === undefined && styles.xLabelEmpty,
                            selectedDay === day.day && styles.xLabelSelected,
                          ]}
                        >
                          {showEveryDayLabel || day.day % 2 === 1
                            ? day.day
                            : ""}
                        </Text>
                      ))}
                    </View>
                  </View>
                )}
          </View>
        </GestureDetector>
      </View>

      <View style={styles.legend}>
        {(["pass", "warning", "critical"] as const).map((status) => (
          <View key={status} style={styles.legendItem}>
            <View
              style={[styles.legendSwatch, { backgroundColor: statusColor(status) }]}
            />
            <Text style={styles.legendText}>
              {status === "pass"
                ? `${labels.passShort} ≥100%`
                : status === "warning"
                  ? `${labels.warningShort} 90–99%`
                  : `${labels.criticalShort} <90%`}
            </Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={styles.legendTargetLine} />
          <Text style={styles.legendText}>
            {labels.target} {target.toLocaleString()} KWh
          </Text>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

export const createChartStyles = (c: DailyChartColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      gap: 6,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    navButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.accentBorder,
      backgroundColor: c.accentSoft,
    },
    disabled: {
      opacity: 0.35,
    },
    titleBlock: {
      flex: 1,
      minWidth: 0,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 999,
      borderWidth: 1,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: "800",
      fontVariant: ["tabular-nums"],
    },
    title: {
      flexShrink: 1,
      fontSize: 16,
      fontWeight: "800",
      letterSpacing: 0.4,
      color: c.textPrimary,
    },
    summary: {
      fontSize: 12,
      color: c.textMuted,
      fontVariant: ["tabular-nums"],
    },
    summaryStrong: {
      fontWeight: "800",
      color: c.textPrimary,
    },
    detailBar: {
      height: 26,
      justifyContent: "center",
    },
    detailHint: {
      fontSize: 12,
      color: c.textMuted,
    },
    detailRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    detailText: {
      flexShrink: 1,
      fontSize: 13,
      color: c.textSecondary,
      fontVariant: ["tabular-nums"],
    },
    detailDate: {
      fontWeight: "800",
      color: c.textPrimary,
    },
    detailValue: {
      fontWeight: "700",
      color: c.textPrimary,
    },
    detailWeather: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginLeft: 8,
      flexShrink: 1,
    },
    detailWeatherText: {
      fontSize: 12,
      color: c.textMuted,
    },
    chartRow: {
      flex: 1,
      minHeight: 120,
      flexDirection: "row",
    },
    viewport: {
      flex: 1,
      overflow: "hidden",
    },
    toggleGroup: {
      flexDirection: "row",
      alignItems: "center",
      height: 40,
      padding: 3,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.accentBorder,
      backgroundColor: c.accentSoft,
    },
    toggleButton: {
      height: "100%",
      paddingHorizontal: 12,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 9,
    },
    toggleButtonActive: {
      backgroundColor: c.accent,
    },
    toggleText: {
      fontSize: 12,
      fontWeight: "700",
      color: c.accent,
    },
    toggleTextActive: {
      fontWeight: "800",
      color: c.background,
    },
    zoomGroup: {
      flexDirection: "row",
      alignItems: "center",
      height: 40,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.accentBorder,
      backgroundColor: c.accentSoft,
    },
    zoomButton: {
      width: 38,
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
    },
    zoomValue: {
      minWidth: 38,
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
    },
    zoomValueText: {
      fontSize: 12,
      fontWeight: "800",
      color: c.accent,
      fontVariant: ["tabular-nums"],
    },
    yAxis: {
      width: Y_AXIS_WIDTH,
    },
    tickLabel: {
      position: "absolute",
      right: 6,
      fontSize: 10,
      lineHeight: 14,
      color: c.textMuted,
      fontVariant: ["tabular-nums"],
    },
    tickLabelStrong: {
      fontWeight: "800",
      color: c.textSecondary,
    },
    plot: {
      marginTop: PLOT_TOP_GAP,
    },
    hitRow: {
      ...StyleSheet.absoluteFill,
      flexDirection: "row",
    },
    slot: {
      flex: 1,
      height: "100%",
    },
    xAxis: {
      flexDirection: "row",
      height: X_AXIS_HEIGHT,
      alignItems: "flex-end",
    },
    xLabel: {
      flex: 1,
      textAlign: "center",
      fontSize: 10,
      color: c.textSecondary,
      fontVariant: ["tabular-nums"],
    },
    xLabelEmpty: {
      color: c.textMuted,
      opacity: 0.5,
    },
    xLabelSelected: {
      fontWeight: "800",
      color: c.accent,
    },
    legend: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      columnGap: 16,
      rowGap: 4,
      paddingLeft: Y_AXIS_WIDTH,
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    legendSwatch: {
      width: 10,
      height: 10,
      borderRadius: 3,
    },
    legendTargetLine: {
      width: 16,
      height: 2,
      backgroundColor: c.textSecondary,
    },
    legendText: {
      fontSize: 11,
      fontWeight: "600",
      color: c.textSecondary,
    },
  });

import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import Svg, { Defs, G, Line, Rect, Text as SvgText } from "react-native-svg";

import {
  BAR_STATUSES,
  Bar3D,
  BarGradients,
  ChartViewToggle,
  STATUS_ICONS,
  createChartStyles,
  formatDelta,
  type ChartView,
  type DailyChartColors,
  type DailyChartLabels,
} from "@/components/daily-total-chart";
import {
  MONTH_KEYS,
  SHIFT_TARGETS,
  getTargetStatus,
  toNumber,
  type SolarApiData,
  type TargetStatus,
} from "@/lib/solar-alerts";

// กราฟแท่งยอดรวม (Total) รายเดือนของทั้งปี เปิดในแนวนอนเหมือนกราฟรายวัน
//
// แท่งละเดือน = ผลรวม Total ของทุกวันที่มีข้อมูลในเดือนนั้น
// เป้าของเดือนคือ 7,000 × จำนวนวันที่มีข้อมูล ไม่ใช่ × จำนวนวันในเดือน
// เดือนปัจจุบันที่เพิ่งผ่านไปไม่กี่วัน (หรือวันที่ระบบล่มไม่มีตัวเลข) จึงไม่ถูกตัดสินว่าต่ำกว่าเป้า
// เป้าแต่ละเดือนไม่เท่ากัน จึงวาดเป็นขีดเป้าเฉพาะบนแท่งของเดือนนั้น แทนเส้นเดียวพาดทั้งกราฟ
// คีย์ข้อมูลไม่มีปี (Jan-Total-1 ...) จึงดูได้แค่ปีปัจจุบัน ไม่มีปุ่มเลื่อนปี

export type YearlyChartLabels = DailyChartLabels & {
  yearlyTitle: string;
  tapMonthHint: string;
  monthsUnit: string;
  yearTotal: string;
  avgPerDay: string;
  openDaily: string;
  monthTargetNote: string;
};

type Props = {
  data: SolarApiData | null;
  year: number;
  onOpenMonth: (monthIndex: number) => void;
  onBack: () => void;
  onChangeView: (view: ChartView) => void;
  colors: DailyChartColors;
  labels: YearlyChartLabels;
  insets: { top: number; right: number; bottom: number; left: number };
};

const PLOT_TOP_GAP = 8;
const X_AXIS_HEIGHT = 17;
const VALUE_LABEL_SPACE = 14;
const GRID_STEP = 50_000;

// ปัดลงเหมือนกราฟรายวัน เดือนที่ขาดเป้านิดเดียวจะได้ไม่โชว์ตัวเลขเท่าเป้าพอดี
const formatMonthValue = (value: number, mode: "full" | "short") =>
  mode === "full"
    ? Math.floor(value).toLocaleString()
    : `${Math.floor(value / 1000)}k`;

export default function YearlyTotalChart({
  data,
  year,
  onOpenMonth,
  onBack,
  onChangeView,
  colors,
  labels,
  insets,
}: Props) {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const styles = createChartStyles(colors);

  const dailyTarget = SHIFT_TARGETS.total;
  const today = new Date();
  const isCurrentYear = year === today.getFullYear();

  const months = MONTH_KEYS.map((monthKey, monthIndex) => {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    // เดือน/วันที่ยังมาไม่ถึงอาจมีตัวเลขของปีที่แล้วค้างอยู่ (คีย์ไม่มีปี) จึงไม่อ่าน
    const lastDay = !isCurrentYear
      ? daysInMonth
      : monthIndex > today.getMonth()
        ? 0
        : monthIndex === today.getMonth()
          ? today.getDate()
          : daysInMonth;

    let total = 0;
    let recordedDays = 0;
    let missedDays = 0;
    for (let day = 1; day <= lastDay; day += 1) {
      const value = toNumber(data?.[`${monthKey}-Total-${day}`]);
      if (value === undefined) continue;
      total += value;
      recordedDays += 1;
      if (getTargetStatus(value, dailyTarget) !== "pass") missedDays += 1;
    }

    const target = dailyTarget * recordedDays;
    return {
      monthIndex,
      monthKey,
      daysInMonth,
      recordedDays,
      missedDays,
      total: recordedDays > 0 ? total : undefined,
      target,
      status:
        recordedDays > 0
          ? getTargetStatus(total, target)
          : (null as TargetStatus | null),
    };
  });

  const recorded = months.filter((month) => month.total !== undefined);
  const missed = recorded.filter((month) => month.status !== "pass");
  const yearTotal = recorded.reduce((sum, month) => sum + (month.total ?? 0), 0);
  const yearTarget = recorded.reduce((sum, month) => sum + month.target, 0);
  const yearDelta = yearTotal - yearTarget;

  const plotSize = {
    width: viewport.width,
    height: Math.max(viewport.height - PLOT_TOP_GAP - X_AXIS_HEIGHT, 0),
  };
  const slotWidth = plotSize.width / MONTH_KEYS.length;
  const valueLabelMode: "full" | "short" = slotWidth >= 52 ? "full" : "short";
  const barWidth = Math.max(Math.min(slotWidth * 0.5, 36), 6);
  const barDepth = Math.min(barWidth * 0.3, 9);

  const maxValue = Math.max(
    GRID_STEP,
    ...recorded.map((month) => Math.max(month.total ?? 0, month.target)),
  );
  const yMax = Math.ceil((maxValue * 1.05) / GRID_STEP) * GRID_STEP;
  const usableHeight = Math.max(
    plotSize.height - barDepth - VALUE_LABEL_SPACE,
    0,
  );
  const toY = (value: number) => (value / yMax) * usableHeight;
  const svgY = (value: number) => plotSize.height - toY(value);
  // เส้นตารางทุก 50k ถ้าสเกลสูงจนเส้นถี่เกินก็ข้ามทีละสองเส้น
  const gridStep = yMax / GRID_STEP > 6 ? GRID_STEP * 2 : GRID_STEP;
  const gridValues = Array.from(
    { length: Math.floor(yMax / gridStep) },
    (_, index) => (index + 1) * gridStep,
  );

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

  const badgeColor = yearDelta < 0 ? colors.critical : colors.pass;
  const badgeInk = yearDelta < 0 ? colors.criticalInk : colors.passInk;

  const handleViewportLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport({ width, height });
  };

  const selected = selectedMonth !== null ? months[selectedMonth] : null;

  const renderDetail = () => {
    if (!selected) {
      return <Text style={styles.detailHint}>{labels.tapMonthHint}</Text>;
    }

    const monthLabel = `${selected.monthKey} ${year}`;

    if (selected.total === undefined || !selected.status) {
      return (
        <Text style={styles.detailText} numberOfLines={1}>
          <Text style={styles.detailDate}>{monthLabel}</Text> · {labels.noDataDay}
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
          <Text style={styles.detailDate}>{monthLabel}</Text>
          {"  "}
          <Text style={styles.detailValue}>
            {Math.floor(selected.total).toLocaleString()} KWh
          </Text>
          {"  "}
          <Text style={{ color: statusInk(selected.status) }}>
            {Math.floor((selected.total / selected.target) * 100)}% ·{" "}
            {formatDelta(selected.total - selected.target)} KWh
          </Text>
          {"  ·  "}
          {labels.avgPerDay}{" "}
          {Math.floor(selected.total / selected.recordedDays).toLocaleString()}
          {"  ·  "}
          {labels.missedTarget} {selected.missedDays}/{selected.recordedDays}{" "}
          {labels.daysUnit}
        </Text>
        <TouchableOpacity
          style={localStyles.openDaily}
          onPress={() => onOpenMonth(selected.monthIndex)}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={[localStyles.openDailyText, { color: colors.accent }]}>
            {labels.openDaily}
          </Text>
          <MaterialCommunityIcons
            name="chevron-right"
            size={16}
            color={colors.accent}
          />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: Math.max(insets.top, 10),
          paddingBottom: Math.max(insets.bottom, 8),
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
          view="yearly"
          onChange={onChangeView}
          colors={colors}
          labels={labels}
        />

        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {year} · {labels.yearlyTitle}
            </Text>
            {recorded.length > 0 && (
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
                  name={yearDelta < 0 ? "trending-down" : "trending-up"}
                  size={13}
                  color={badgeInk}
                />
                <Text style={[styles.badgeText, { color: badgeInk }]}>
                  {formatDelta(yearDelta)} KWh
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.summary} numberOfLines={1}>
            {labels.yearTotal}{" "}
            <Text style={styles.summaryStrong}>
              {Math.floor(yearTotal).toLocaleString()} KWh
            </Text>
            {"  ·  "}
            {labels.missedTarget}{" "}
            <Text style={styles.summaryStrong}>
              {missed.length}/{recorded.length}
            </Text>{" "}
            {labels.monthsUnit}
          </Text>
        </View>
      </View>

      <View style={styles.detailBar}>{renderDetail()}</View>

      <View style={styles.chartRow}>
        <View style={styles.yAxis}>
          {plotSize.height > 0 &&
            gridValues.map((value) => (
              <Text
                key={value}
                style={[styles.tickLabel, { bottom: X_AXIS_HEIGHT + toY(value) - 7 }]}
              >
                {value / 1000}k
              </Text>
            ))}
        </View>

        <View style={styles.viewport} onLayout={handleViewportLayout}>
          {plotSize.height > 0 && (
            <>
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

                  {gridValues.map((value) => (
                    <Line
                      key={value}
                      x1={0}
                      x2={plotSize.width}
                      y1={svgY(value)}
                      y2={svgY(value)}
                      stroke={colors.border}
                      strokeWidth={1}
                    />
                  ))}

                  {selectedMonth !== null && (
                    <Rect
                      x={selectedMonth * slotWidth}
                      y={0}
                      width={slotWidth}
                      height={plotSize.height}
                      rx={4}
                      fill={colors.accentSoft}
                    />
                  )}

                  {months.map((month) => {
                    if (month.total === undefined || !month.status) return null;

                    const isDimmed =
                      selectedMonth !== null &&
                      selectedMonth !== month.monthIndex;
                    const barX =
                      month.monthIndex * slotWidth +
                      (slotWidth - barWidth - barDepth) / 2;
                    const targetY = svgY(month.target);

                    return (
                      <G key={month.monthKey} opacity={isDimmed ? 0.35 : 1}>
                        <Bar3D
                          x={barX}
                          baseY={plotSize.height}
                          width={barWidth}
                          height={Math.max(toY(month.total), 2)}
                          depth={barDepth}
                          gradientId={month.status}
                        />
                        {/* ขีดเป้าของเดือนนี้ วาดทับแท่ง เห็นชัดว่าแท่งทะลุหรือจม */}
                        <Line
                          x1={barX - 4}
                          x2={barX + barWidth + barDepth + 4}
                          y1={targetY}
                          y2={targetY}
                          stroke={colors.textSecondary}
                          strokeWidth={2}
                        />
                      </G>
                    );
                  })}

                  {months.map((month) => {
                    if (month.total === undefined) return null;

                    const isSelected = selectedMonth === month.monthIndex;
                    const isDimmed = selectedMonth !== null && !isSelected;
                    const label = formatMonthValue(
                      month.total,
                      isSelected ? "full" : valueLabelMode,
                    );
                    // ป้ายอยู่เหนือทั้งแท่งและขีดเป้า แล้วแต่อันไหนสูงกว่า
                    const topValue = Math.max(month.total, month.target);
                    const textProps = {
                      x: month.monthIndex * slotWidth + slotWidth / 2,
                      y: svgY(topValue) - barDepth - 4,
                      textAnchor: "middle" as const,
                      fontSize: 10.5,
                      fontWeight: isSelected ? ("800" as const) : ("700" as const),
                    };

                    return (
                      <G
                        key={`label-${month.monthKey}`}
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

                <View style={styles.hitRow}>
                  {months.map((month) => {
                    const isSelected = selectedMonth === month.monthIndex;

                    return (
                      <Pressable
                        key={month.monthKey}
                        style={styles.slot}
                        onPress={() =>
                          setSelectedMonth(isSelected ? null : month.monthIndex)
                        }
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={
                          month.total === undefined
                            ? `${month.monthKey}: ${labels.noDataDay}`
                            : `${month.monthKey}: ${Math.round(month.total).toLocaleString()} KWh`
                        }
                      />
                    );
                  })}
                </View>
              </View>

              <View style={styles.xAxis}>
                {months.map((month) => (
                  <Text
                    key={month.monthKey}
                    style={[
                      styles.xLabel,
                      month.total === undefined && styles.xLabelEmpty,
                      selectedMonth === month.monthIndex && styles.xLabelSelected,
                    ]}
                  >
                    {month.monthKey}
                  </Text>
                ))}
              </View>
            </>
          )}
        </View>
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
          <Text style={styles.legendText}>{labels.monthTargetNote}</Text>
        </View>
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  openDaily: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: "auto",
    paddingLeft: 8,
  },
  openDailyText: {
    fontSize: 12,
    fontWeight: "800",
  },
});

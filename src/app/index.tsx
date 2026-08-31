import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// --- Multi-language Translations ---
const translations = {
  TH: {
    title: "☀️ SOLAR CELL TOWER",
    subtitle: "Daily Electricity Generation Control Tower & Analytics",
    live: "LIVE SYNC",
    location: "แม่น้ำคู้, ปลวกแดง, ระยอง",
    weather: "มีเมฆฝนกระจายตัว",
    impact: "Impact: แนวโน้มผลิตไฟลดลง 20-30% วันนี้",
    morning: "ช่วงเช้า (09:00 AM)",
    afternoon: "ช่วงบ่าย (15:00 PM)",
    total: "รวม (21:00 PM)",
    target: "เป้าหมาย",
    generated: "ผลิตได้",
    pass: "ตามเป้า (Pass)",
    warning: "เฝ้าระวัง (Warning)",
    critical: "ต่ำกว่าเกณฑ์ (Critical)",
    remark: "หมายเหตุ",
    clickAdd: "คลิกเพื่อพิมพ์หมายเหตุ",
  },
  EN: {
    title: "☀️ SOLAR CELL TOWER",
    subtitle: "Daily Electricity Generation Control Tower & Analytics",
    live: "LIVE SYNC",
    location: "Maenam Khu, Pluak Daeng, Rayong",
    weather: "Scattered Rain Clouds",
    impact: "Impact: Generation expected to drop 20-30% today",
    morning: "Morning (09:00 AM)",
    afternoon: "Afternoon (15:00 PM)",
    total: "Total (21:00 PM)",
    target: "Target",
    generated: "Generated",
    pass: "Pass Target",
    warning: "Warning Target",
    critical: "Critical Below",
    remark: "Remark",
    clickAdd: "Click to add remark",
  },
  KR: {
    title: "☀️ 태양광 제어 타워",
    subtitle: "일일 전력 생산 제어 타워 및 분석",
    live: "실시간 동기화",
    location: "라용, 플루악댕, 매남쿠",
    weather: "흐리고 비",
    impact: "영향: 오늘 전력 생산 20-30% 감소 예상",
    morning: "오전 (09:00 AM)",
    afternoon: "오후 (15:00 PM)",
    total: "합계 (21:00 PM)",
    target: "목표",
    generated: "발전량",
    pass: "목표 달성",
    warning: "주의 요망",
    critical: "목표 미달 (위험)",
    remark: "비고",
    clickAdd: "비고를 입력하려면 클릭하세요",
  },
};

type Language = "TH" | "EN" | "KR";

interface ShiftData {
  time: string;
  label: string;
  generated: number;
  target: number;
}

const getStatusColor = (generated: number, target: number) => {
  const percentage = (generated / target) * 100;
  if (percentage >= 95) return { color: "#16a34a", status: "pass" };
  if (percentage >= 80) return { color: "#ea580c", status: "warning" };
  return { color: "#dc2626", status: "critical" };
};

const SolarDashboard: React.FC = () => {
  const [lang, setLang] = useState<Language>("TH");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedData, setScannedData] = useState<string | null>(null);
  const t = translations[lang];

  // Request camera permission
  useEffect(() => {
    requestPermission();
  }, []);

  // Handle QR code scan
  const handleBarCodeScanned = ({ data }: { data: string }) => {
    setScannedData(data);
    setShowQRScanner(false);
  };

  // Generate mock data based on selected date
  const getShiftData = (): ShiftData[] => {
    // Vary data based on day
    const variance = selectedDate.getDate() % 5;
    const baseMultiplier = 0.8 + (variance * 0.04);

    return [
      {
        time: "morning",
        label: t.morning,
        generated: Math.round(1556 * baseMultiplier),
        target: 1556
      },
      {
        time: "afternoon",
        label: t.afternoon,
        generated: Math.round(5444 * baseMultiplier),
        target: 5444
      },
      {
        time: "total",
        label: t.total,
        generated: Math.round(7000 * baseMultiplier),
        target: 7000
      },
    ];
  };

  const shiftData = getShiftData();
  const languages: Language[] = ["TH", "EN", "KR"];

  const handlePrevDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const handleNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
  };

  const formatDate = (date: Date) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
  };

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  // QR Scanner View
  if (showQRScanner) {
    return (
      <View style={styles.scannerContainer}>
        {permission?.granted ? (
          <>
            <CameraView
              style={styles.scanner}
              barcodeScannerSettings={{
                barcodeTypes: ["qr"],
              }}
              onBarcodeScanned={({ data }) => handleBarCodeScanned({ data })}
            />

            <View style={styles.scannerOverlay}>
              <TouchableOpacity
                style={styles.closeScannerButton}
                onPress={() => setShowQRScanner(false)}
              >
                <MaterialCommunityIcons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.permissionDenied}>
            <MaterialCommunityIcons name="camera-off" size={60} color="#dc2626" />
            <Text style={styles.permissionText}>Camera permission denied</Text>
            <TouchableOpacity
              style={styles.permissionButton}
              onPress={() => setShowQRScanner(false)}
            >
              <Text style={styles.permissionButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t.title}</Text>
          <Text style={styles.subtitle}>{t.subtitle}</Text>
        </View>
        <View style={styles.languageSelector}>
          {languages.map((lang_code) => (
            <TouchableOpacity
              key={lang_code}
              style={[
                styles.langButton,
                lang === lang_code && styles.langButtonActive,
              ]}
              onPress={() => setLang(lang_code)}
            >
              <Text
                style={[
                  styles.langButtonText,
                  lang === lang_code && styles.langButtonTextActive,
                ]}
              >
                {lang_code}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Status Bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusItem}>
          <MaterialCommunityIcons name="wifi" size={16} color="#16a34a" />
          <Text style={styles.statusText}>{t.live}</Text>
        </View>
        <View style={styles.statusItem}>
          <MaterialCommunityIcons name="map-marker" size={16} color="#64748b" />
          <Text style={styles.statusText}>{t.location}</Text>
        </View>
        <TouchableOpacity
          style={styles.qrButton}
          onPress={() => setShowQRScanner(true)}
        >
          <MaterialCommunityIcons name="qrcode-scan" size={18} color="#0ea5e9" />
        </TouchableOpacity>
      </View>

      {/* Scanned QR Data */}
      {scannedData && (
        <View style={styles.scannedCard}>
          <View style={styles.scannedHeader}>
            <MaterialCommunityIcons name="qrcode" size={24} color="#0ea5e9" />
            <Text style={styles.scannedTitle}>Scanned Data</Text>
            <TouchableOpacity onPress={() => setScannedData(null)}>
              <MaterialCommunityIcons name="close" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>
          <Text style={styles.scannedData}>{scannedData}</Text>
        </View>
      )}

      {/* Date Selector */}
      <View style={styles.dateSelector}>
        <TouchableOpacity onPress={handlePrevDay} style={styles.dateButton}>
          <MaterialCommunityIcons name="chevron-left" size={20} color="#0ea5e9" />
        </TouchableOpacity>
        <View style={styles.dateDisplay}>
          <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
          {isToday && <Text style={styles.todayLabel}>Today</Text>}
        </View>
        <TouchableOpacity onPress={handleNextDay} style={styles.dateButton}>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#0ea5e9" />
        </TouchableOpacity>
      </View>

      {/* Weather Info */}
      <View style={styles.weatherCard}>
        <View style={styles.weatherContent}>
          <MaterialCommunityIcons name="weather-pouring" size={32} color="#0ea5e9" />
          <View style={styles.weatherText}>
            <Text style={styles.weatherDesc}>{t.weather}</Text>
            <Text style={styles.weatherImpact}>{t.impact}</Text>
          </View>
        </View>
      </View>

      {/* Daily Shift Cards */}
      <Text style={styles.sectionTitle}>Daily Generation</Text>
      {shiftData.map((shift) => {
        const statusInfo = getStatusColor(shift.generated, shift.target);
        const percentage = ((shift.generated / shift.target) * 100).toFixed(1);

        return (
          <View key={shift.time} style={styles.shiftCard}>
            <View style={styles.shiftHeader}>
              <Text style={styles.shiftLabel}>{shift.label}</Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusInfo.color + "20" },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    { color: statusInfo.color },
                  ]}
                >
                  {percentage}%
                </Text>
              </View>
            </View>

            <View style={styles.shiftContent}>
              <View style={styles.valueBox}>
                <Text style={styles.valueLabel}>{t.generated}</Text>
                <Text style={[styles.value, { color: statusInfo.color }]}>
                  {shift.generated}
                </Text>
                <Text style={styles.unit}>KWh</Text>
              </View>

              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(
                        (shift.generated / shift.target) * 100,
                        100
                      )}%`,
                      backgroundColor: statusInfo.color,
                    },
                  ]}
                />
              </View>

              <View style={styles.valueBox}>
                <Text style={styles.valueLabel}>{t.target}</Text>
                <Text style={styles.value}>{shift.target}</Text>
                <Text style={styles.unit}>KWh</Text>
              </View>
            </View>
          </View>
        );
      })}

      {/* Remarks Section */}
      <View style={styles.remarkCard}>
        <Text style={styles.remarkLabel}>{t.remark}</Text>
        <View style={styles.remarkInput}>
          <Text style={styles.remarkPlaceholder}>{t.clickAdd}</Text>
        </View>
      </View>

      {/* Status Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#16a34a" }]} />
          <Text style={styles.legendText}>{t.pass} (≥95%)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#ea580c" }]} />
          <Text style={styles.legendText}>{t.warning} (80-94%)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#dc2626" }]} />
          <Text style={styles.legendText}>{t.critical} (≤80%)</Text>
        </View>
      </View>

      <View style={styles.spacer} />
    </ScrollView>
  );
};

export default SolarDashboard;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0f4f8",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 12,
  },
  languageSelector: {
    flexDirection: "row",
    gap: 8,
  },
  langButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
  },
  langButtonActive: {
    backgroundColor: "#0ea5e9",
    borderColor: "#0ea5e9",
  },
  langButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  langButtonTextActive: {
    color: "#fff",
  },
  statusBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 16,
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "500",
  },
  dateSelector: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    alignItems: "center",
    gap: 12,
  },
  dateButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f0f4f8",
  },
  dateDisplay: {
    flex: 1,
    alignItems: "center",
  },
  dateText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  todayLabel: {
    fontSize: 11,
    color: "#16a34a",
    fontWeight: "600",
    marginTop: 4,
  },
  weatherCard: {
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: "#0ea5e9",
  },
  weatherContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  weatherText: {
    flex: 1,
  },
  weatherDesc: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0c4a6e",
    marginBottom: 4,
  },
  weatherImpact: {
    fontSize: 12,
    color: "#0369a1",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 12,
  },
  shiftCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  shiftHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  shiftLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  shiftContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  valueBox: {
    alignItems: "center",
  },
  valueLabel: {
    fontSize: 11,
    color: "#94a3b8",
    marginBottom: 4,
  },
  value: {
    fontSize: 20,
    fontWeight: "700",
  },
  unit: {
    fontSize: 10,
    color: "#cbd5e1",
    marginTop: 2,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: "#e2e8f0",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  remarkCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  remarkLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 10,
  },
  remarkInput: {
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    minHeight: 50,
    justifyContent: "center",
  },
  remarkPlaceholder: {
    fontSize: 13,
    color: "#cbd5e1",
  },
  legend: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    gap: 10,
    marginBottom: 20,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: "#475569",
  },
  spacer: {
    height: 20,
  },
  qrButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f0f4f8",
  },
  scannedCard: {
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#0ea5e9",
  },
  scannedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  scannedTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#0c4a6e",
  },
  scannedData: {
    fontSize: 13,
    color: "#0369a1",
    fontWeight: "500",
    padding: 10,
    backgroundColor: "#fff",
    borderRadius: 8,
    overflow: "hidden",
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  scanner: {
    flex: 1,
  },
  scannerOverlay: {
    position: "absolute",
    top: 16,
    right: 16,
  },
  closeScannerButton: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 50,
    padding: 12,
  },
  permissionDenied: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f0f4f8",
    gap: 20,
  },
  permissionText: {
    fontSize: 16,
    color: "#dc2626",
    fontWeight: "600",
  },
  permissionButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#0ea5e9",
    borderRadius: 8,
  },
  permissionButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
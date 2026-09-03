using System.Globalization;
using System.Text.Json;

/// <summary>
/// ค่าตั้งของงานแจ้งเตือนสรุปยอด ปรับได้จาก appsettings.json ส่วน "SolarAlerts"
/// เป้าหมาย KWh ควรตรงกับที่แสดงในแอป (src/lib/solar-alerts.ts)
/// </summary>
public sealed class SolarAlertOptions
{
    public const string SectionName = "SolarAlerts";

    public string SolarDataUrl { get; set; } =
        "http://192.168.2.222:5154/api/get-solar-data";

    public double MorningTargetKwh { get; set; } = 1556;
    public double AfternoonTargetKwh { get; set; } = 5444;
    public double TotalTargetKwh { get; set; } = 7000;

    /// <summary>
    /// เวลาที่จะยิงแจ้งเตือนสรุปยอดของแต่ละกะ (อิงเวลาไทยตาม TZ ของ container)
    ///
    /// ต้องเริ่มจากลิสต์ว่างเท่านั้น เพราะ ConfigurationBinder ของ .NET จะ "ต่อท้าย"
    /// ค่าที่อ่านจาก appsettings เข้าไปในลิสต์เดิม ไม่ได้เขียนทับ
    /// ถ้าใส่ค่าเริ่มต้นไว้ตรงนี้จะกลายเป็น 12 รอบ แล้วแจ้งเตือนจะเด้งซ้ำ 2 ครั้งทุกเวลา
    /// ค่าเริ่มต้นจริงอยู่ที่ Default ด้านล่าง และถูกเติมให้ใน PostConfigure ตอนลิสต์ว่าง
    /// </summary>
    public List<ReminderSlot> Reminders { get; set; } = [];

    public static List<ReminderSlot> DefaultReminders =>
    [
        new ReminderSlot { Shift = "Morning", Hour = 10, Minute = 1 },
        new ReminderSlot { Shift = "Morning", Hour = 10, Minute = 30 },
        new ReminderSlot { Shift = "Afternoon", Hour = 15, Minute = 1 },
        new ReminderSlot { Shift = "Afternoon", Hour = 15, Minute = 30 },
        new ReminderSlot { Shift = "Total", Hour = 21, Minute = 1 },
        new ReminderSlot { Shift = "Total", Hour = 21, Minute = 30 }
    ];

    /// <summary>
    /// ยอมส่งช้าได้กี่นาทีหลังถึงเวลา ใช้กันสองกรณี
    /// 1) service เพิ่งรีสตาร์ตแล้วคร่อมเวลาพอดี
    /// 2) API ยังไม่ลงข้อมูลของกะนั้นตอนถึงเวลา จะได้ลองใหม่ในนาทีถัดไป
    /// เลยกรอบนี้ถือว่าข้ามรอบนั้นไป ไม่ยิงย้อนหลังจนผู้ใช้รำคาญ
    /// </summary>
    public int ReminderGraceMinutes { get; set; } = 15;

    /// <summary>โฟลเดอร์เก็บ push token และประวัติการส่ง ให้รอดหลังรีสตาร์ต service</summary>
    public string StateDirectory { get; set; } = "state";
}

public sealed class ReminderSlot
{
    public string Shift { get; set; } = "Morning";
    public int Hour { get; set; }
    public int Minute { get; set; }

    /// <summary>คีย์ประจำรอบของวันนั้น ใช้กันส่งซ้ำ</summary>
    public string KeyFor(DateTime date) =>
        $"{date:yyyy-MM-dd}-{Shift}-{Hour:00}{Minute:00}";

    public DateTime TimeOn(DateTime date) =>
        new(date.Year, date.Month, date.Day, Hour, Minute, 0);
}

public sealed record ShiftSummary(
    string Shift,
    double Generated,
    double Target)
{
    public double Percentage => Target <= 0 ? 0 : Generated / Target * 100;

    public string Title(string language) =>
        AlertTexts.SummaryTitle(language, Shift);

    public string Body(string language, DateTime date) =>
        AlertTexts.SummaryBody(language, Shift, date, Generated, Target, Percentage);
}

/// <summary>
/// ข้อความแจ้งเตือนแต่ละภาษา แยกตามภาษาที่แต่ละเครื่องลงทะเบียนไว้
/// </summary>
public static class AlertTexts
{
    public const string DefaultLanguage = "TH";

    public static string Normalize(string? language) =>
        language?.ToUpperInvariant() switch
        {
            "EN" => "EN",
            "KR" => "KR",
            _ => DefaultLanguage
        };

    public static string ShiftLabel(string language, string shift) =>
        (Normalize(language), shift) switch
        {
            ("EN", "Morning") => "Morning",
            ("EN", "Afternoon") => "Afternoon",
            ("EN", _) => "Daily total",

            ("KR", "Morning") => "오전",
            ("KR", "Afternoon") => "오후",
            ("KR", _) => "일일 합계",

            (_, "Morning") => "รอบเช้า",
            (_, "Afternoon") => "รอบบ่าย",
            (_, _) => "รวมทั้งวัน"
        };

    public static string SummaryTitle(string language, string shift)
    {
        var label = ShiftLabel(language, shift);

        return Normalize(language) switch
        {
            "EN" => $"{label} summary",
            "KR" => $"{label} 발전 요약",
            _ => $"สรุปยอด{label}"
        };
    }

    public static string SummaryBody(
        string language,
        string shift,
        DateTime date,
        double generated,
        double target,
        double percentage)
    {
        var label = ShiftLabel(language, shift);
        // รูปแบบวันที่เดียวกับที่หน้าจอแอปใช้ เช่น "Tue 1 Sep"
        var day = date.ToString("ddd d MMM", CultureInfo.InvariantCulture);

        return $"{day} {label}: {generated:0.##}/{target:0.##} KWh ({percentage:0.0}%)";
    }
}

/// <summary>
/// อ่านยอดของกะที่ระบุจากข้อมูลที่ API ส่งกลับมา
/// คีย์มีรูปแบบ {Mon}-{Shift}-{day} เช่น Sep-Morning-1 เหมือนที่แอปใช้
/// </summary>
public static class SolarShiftReader
{
    private static readonly string[] MonthKeys =
    [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    public static ShiftSummary? ReadShift(
        IReadOnlyDictionary<string, JsonElement> data,
        DateTime date,
        string shift,
        SolarAlertOptions options)
    {
        var key = BuildKey(date, shift);

        if (!data.TryGetValue(key, out var rawValue))
        {
            return null;
        }

        var generated = ToNumber(rawValue);

        if (generated is null)
        {
            return null;
        }

        var target = shift switch
        {
            "Morning" => options.MorningTargetKwh,
            "Afternoon" => options.AfternoonTargetKwh,
            _ => options.TotalTargetKwh
        };

        return new ShiftSummary(shift, generated.Value, target);
    }

    public static string BuildKey(DateTime date, string shift) =>
        $"{MonthKeys[date.Month - 1]}-{shift}-{date.Day}";

    private static double? ToNumber(JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Number:
                return element.GetDouble();

            case JsonValueKind.String:
                var text = element.GetString()?.Replace(",", string.Empty);

                return double.TryParse(
                    text,
                    NumberStyles.Any,
                    CultureInfo.InvariantCulture,
                    out var parsed)
                    ? parsed
                    : null;

            default:
                return null;
        }
    }
}

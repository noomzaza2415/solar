using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;

/// <summary>
/// ยิงแจ้งเตือนสรุปยอดของแต่ละกะตามเวลาที่กำหนด (ค่าเริ่มต้น 6 รอบ/วัน)
///
/// ทำที่ฝั่งเซิร์ฟเวอร์เพราะการตั้งเวลาในตัวแอปต้องให้ผู้ใช้เปิดแอปอย่างน้อยวันละครั้ง
/// เพื่อไปตั้งเวลาไว้กับ OS ถ้าไม่เปิดเลยก็จะไม่มีแจ้งเตือนของวันนั้น
/// ส่วน push จากเซิร์ฟเวอร์ทำงานได้ตลอด แม้ผู้ใช้ปัดแอปทิ้งไปแล้ว
/// </summary>
public sealed class SolarReminderWorker : BackgroundService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IPushTokenStore _tokenStore;
    private readonly SentReminderStore _sentReminderStore;
    private readonly ExpoPushService _expoPushService;
    private readonly SolarAlertOptions _options;
    private readonly ILogger<SolarReminderWorker> _logger;

    public SolarReminderWorker(
        IHttpClientFactory httpClientFactory,
        IPushTokenStore tokenStore,
        SentReminderStore sentReminderStore,
        ExpoPushService expoPushService,
        IOptions<SolarAlertOptions> options,
        ILogger<SolarReminderWorker> logger)
    {
        _httpClientFactory = httpClientFactory;
        _tokenStore = tokenStore;
        _sentReminderStore = sentReminderStore;
        _expoPushService = expoPushService;
        _options = options.Value;
        _logger = logger;
    }

    public DateTimeOffset? LastCheckedAt { get; private set; }
    public string LastResult { get; private set; } = "ยังไม่ถึงรอบแจ้งเตือน";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var schedule = string.Join(
            ", ",
            _options.Reminders.Select(slot => $"{slot.Hour:00}:{slot.Minute:00} {slot.Shift}"));

        _logger.LogInformation("Reminder worker started. Schedule: {Schedule}", schedule);

        // เดินทุกนาที แล้วดูว่ามีรอบไหนถึงเวลาแล้วยังไม่ได้ส่ง
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));

        do
        {
            try
            {
                await RunDueRemindersAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception exception)
            {
                LastResult = $"ผิดพลาด: {exception.Message}";
                _logger.LogError(exception, "Reminder run failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    /// <summary>หา slot ที่ถึงเวลาแล้วและยังไม่ได้ส่งในวันนี้ แล้วยิงให้</summary>
    public async Task RunDueRemindersAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTime.Now;
        LastCheckedAt = DateTimeOffset.Now;

        var dueSlots = _options.Reminders
            .Where(slot =>
            {
                var slotTime = slot.TimeOn(now);
                var isDue = now >= slotTime &&
                            now < slotTime.AddMinutes(_options.ReminderGraceMinutes);

                return isDue && !_sentReminderStore.WasSent(slot.KeyFor(now));
            })
            .ToList();

        if (dueSlots.Count == 0)
        {
            return;
        }

        foreach (var slot in dueSlots)
        {
            await SendReminderAsync(slot, now, cancellationToken);
        }
    }

    /// <summary>ยิงรอบที่ระบุทันที ไม่สนใจว่าถึงเวลาหรือส่งไปแล้วหรือยัง (ใช้ทดสอบ)</summary>
    public async Task<string> SendNowAsync(
        string shift,
        CancellationToken cancellationToken = default)
    {
        var slot = new ReminderSlot { Shift = shift, Hour = 0, Minute = 0 };
        await SendReminderAsync(slot, DateTime.Now, cancellationToken, markAsSent: false);

        return LastResult;
    }

    private async Task SendReminderAsync(
        ReminderSlot slot,
        DateTime now,
        CancellationToken cancellationToken,
        bool markAsSent = true)
    {
        var httpClient = _httpClientFactory.CreateClient();
        httpClient.Timeout = TimeSpan.FromSeconds(20);

        var data = await httpClient.GetFromJsonAsync<Dictionary<string, JsonElement>>(
            _options.SolarDataUrl,
            cancellationToken);

        if (data is null)
        {
            LastResult = "API ไม่ส่งข้อมูลกลับมา";
            return;
        }

        var summary = SolarShiftReader.ReadShift(data, now, slot.Shift, _options);

        if (summary is null)
        {
            // ยังไม่มีข้อมูลของกะนี้ ไม่ mark ว่าส่งแล้ว เดี๋ยวนาทีถัดไปลองใหม่จนหมดช่วงผ่อนผัน
            LastResult = $"{slot.Shift}: API ยังไม่ลงข้อมูลของกะนี้ รอลองใหม่";
            _logger.LogInformation("No data yet for {Shift}, will retry", slot.Shift);
            return;
        }

        var devices = await _tokenStore.GetAllAsync();

        if (devices.Count == 0)
        {
            LastResult = "ถึงรอบแจ้งเตือนแล้ว แต่ยังไม่มีเครื่องไหนลงทะเบียน push token";
            _logger.LogWarning("Reminder due but no push tokens registered");
            return;
        }

        // แต่ละเครื่องอาจเลือกคนละภาษา จึงต้องแยกส่งตามภาษาที่เครื่องนั้นลงทะเบียนไว้
        var staleTokens = new List<string>();

        foreach (var languageGroup in devices.GroupBy(device => AlertTexts.Normalize(device.Language)))
        {
            var language = languageGroup.Key;
            var tokens = languageGroup.Select(device => device.Token).ToList();

            var invalidTokens = await _expoPushService.SendAsync(
                tokens,
                summary.Title(language),
                summary.Body(language, now),
                new
                {
                    type = $"solar-summary-{slot.Shift.ToLowerInvariant()}",
                    shift = slot.Shift,
                    generatedKwh = summary.Generated,
                    targetKwh = summary.Target,
                    percentage = summary.Percentage,
                    date = now.ToString("yyyy-MM-dd")
                },
                cancellationToken);

            staleTokens.AddRange(invalidTokens);
            _logger.LogInformation(
                "Sent {Shift} summary ({Language}): {Body}",
                slot.Shift,
                language,
                summary.Body(language, now));
        }

        if (markAsSent)
        {
            await _sentReminderStore.MarkSentAsync(slot.KeyFor(now), now);
        }

        await _tokenStore.RemoveAsync(staleTokens.Distinct());

        LastResult =
            $"ส่งสรุปยอด {slot.Shift} ({summary.Generated:0.##}/{summary.Target:0.##} KWh) ไป {devices.Count} เครื่อง";
    }
}

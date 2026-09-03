using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<SolarAlertOptions>(
    builder.Configuration.GetSection(SolarAlertOptions.SectionName));

builder.Services.PostConfigure<SolarAlertOptions>(options =>
{
    if (options.Reminders.Count == 0)
    {
        options.Reminders = SolarAlertOptions.DefaultReminders;
    }

    // กันรอบซ้ำจากการตั้งค่าผิดพลาด ไม่งั้นผู้ใช้จะได้แจ้งเตือนซ้ำในเวลาเดียวกัน
    options.Reminders = options.Reminders
        .GroupBy(slot => (slot.Shift, slot.Hour, slot.Minute))
        .Select(group => group.First())
        .OrderBy(slot => slot.Hour)
        .ThenBy(slot => slot.Minute)
        .ToList();
});

builder.Services.Configure<FirestoreOptions>(
    builder.Configuration.GetSection(FirestoreOptions.SectionName));

builder.Services.AddHttpClient();
builder.Services.AddHttpClient<ExpoPushService>();
builder.Services.AddSingleton<IPushTokenStore, FilePushTokenStore>();
builder.Services.AddSingleton<SentReminderStore>();
builder.Services.AddSingleton<SolarReminderWorker>();
builder.Services.AddHostedService(provider =>
    provider.GetRequiredService<SolarReminderWorker>());

// คัดลอกข้อมูลจาก API ในวงขึ้น Firestore ให้เครื่องนอกวงอ่านได้
builder.Services.AddSingleton<GoogleAccessTokenProvider>();
builder.Services.AddSingleton<FirestoreWriter>();
builder.Services.AddSingleton<FirestoreMirrorWorker>();
builder.Services.AddHostedService(provider =>
    provider.GetRequiredService<FirestoreMirrorWorker>());

var app = builder.Build();

app.MapPost("/api/push-tokens", async (
    RegisterPushTokenRequest request,
    IPushTokenStore tokenStore,
    ILogger<Program> logger) =>
{
    if (!ExpoPushToken.IsValid(request.Token))
    {
        return Results.BadRequest(new { message = "Invalid Expo push token." });
    }

    await tokenStore.SaveAsync(new PushTokenRecord(
        request.Token.Trim(),
        request.Platform,
        AlertTexts.Normalize(request.Language),
        DateTimeOffset.UtcNow));

    logger.LogInformation(
        "Registered push token for {Platform} ({Language})",
        request.Platform,
        AlertTexts.Normalize(request.Language));

    return Results.Ok(new { saved = true });
});

// ยิงสรุปยอดของกะที่ระบุเดี๋ยวนี้เลย ไม่ต้องรอถึงเวลา — ใช้ทดสอบว่า push ถึงเครื่องจริงไหม
// เช่น POST /api/reminders/send-now?shift=Morning
app.MapPost("/api/reminders/send-now", async (
    SolarReminderWorker worker,
    string? shift) =>
{
    var targetShift = shift switch
    {
        "Afternoon" => "Afternoon",
        "Total" => "Total",
        _ => "Morning"
    };

    var result = await worker.SendNowAsync(targetShift);

    return Results.Ok(new { shift = targetShift, result });
});

// ดึงข้อมูลจริงจาก API แล้วอัปโหลดขึ้น Firestore เดี๋ยวนี้ ไม่ต้องรอรอบถัดไป
// ใช้ตรวจว่าไฟล์ service account กับ rules ถูกต้องไหมหลัง deploy
app.MapPost("/api/mirror/run-now", async (FirestoreMirrorWorker mirror) =>
{
    try
    {
        var result = await mirror.MirrorOnceAsync();
        return Results.Ok(new { ok = true, result });
    }
    catch (Exception exception)
    {
        // ตอบ 500 พร้อมข้อความจริง ไม่งั้นคนกดทดสอบจะไม่รู้ว่าติดที่ token, rules หรือ API ในวง
        return Results.Json(
            new { ok = false, error = exception.Message },
            statusCode: StatusCodes.Status500InternalServerError);
    }
});

// ดูสถานะรวม ๆ ว่ามีกี่เครื่องลงทะเบียนไว้ รอบถัดไปคือเมื่อไร และรอบล่าสุดได้อะไร
app.MapGet("/api/status", async (
    IPushTokenStore tokenStore,
    SolarReminderWorker worker,
    FirestoreMirrorWorker mirror,
    IOptions<SolarAlertOptions> options,
    IOptions<FirestoreOptions> firestoreOptions) =>
{
    var devices = await tokenStore.GetAllAsync();
    var now = DateTime.Now;

    var schedule = options.Value.Reminders
        .OrderBy(slot => slot.Hour)
        .ThenBy(slot => slot.Minute)
        .Select(slot => new
        {
            time = $"{slot.Hour:00}:{slot.Minute:00}",
            shift = slot.Shift
        })
        .ToList();

    return Results.Ok(new
    {
        serverTime = DateTimeOffset.Now,
        registeredDevices = devices.Count,
        languages = devices
            .GroupBy(device => AlertTexts.Normalize(device.Language))
            .ToDictionary(group => group.Key, group => group.Count()),
        schedule,
        lastCheckedAt = worker.LastCheckedAt,
        lastResult = worker.LastResult,
        firestoreMirror = new
        {
            enabled = firestoreOptions.Value.Enabled,
            document =
                $"{firestoreOptions.Value.ProjectId}/{firestoreOptions.Value.DocumentPath}",
            intervalSeconds = firestoreOptions.Value.MirrorIntervalSeconds,
            lastMirroredAt = mirror.LastMirroredAt,
            lastResult = mirror.LastResult
        }
    });
});

app.Run();

public sealed record RegisterPushTokenRequest(
    string Token,
    string? Platform,
    string? Language);

public sealed record PushTokenRecord(
    string Token,
    string? Platform,
    string? Language,
    DateTimeOffset UpdatedAt);

public sealed class ExpoPushService
{
    private const string ExpoPushSendUrl = "https://exp.host/--/api/v2/push/send";
    private readonly HttpClient _httpClient;
    private readonly ILogger<ExpoPushService> _logger;

    public ExpoPushService(HttpClient httpClient, ILogger<ExpoPushService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    /// <summary>
    /// ส่ง push แล้วคืน token ที่ Expo บอกว่าใช้ไม่ได้แล้ว (เช่น ผู้ใช้ถอนแอป)
    /// เพื่อให้ผู้เรียกลบทิ้ง ไม่งั้นจะยิงไปที่เครื่องที่ไม่มีอยู่จริงไปเรื่อย ๆ
    /// </summary>
    public async Task<IReadOnlyList<string>> SendAsync(
        IReadOnlyList<string> tokens,
        string title,
        string body,
        object data,
        CancellationToken cancellationToken = default)
    {
        var validTokens = tokens
            .Where(ExpoPushToken.IsValid)
            .Distinct()
            .ToArray();

        var invalidTokens = new List<string>();

        foreach (var batch in validTokens.Chunk(100))
        {
            var messages = batch.Select(token => new ExpoPushMessage(
                To: token,
                Title: title,
                Body: body,
                Sound: "default",
                Priority: "high",
                ChannelId: "solar-alerts",
                Data: data));

            using var response = await _httpClient.PostAsJsonAsync(
                ExpoPushSendUrl,
                messages,
                cancellationToken);

            var payload = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError(
                    "Expo push failed ({StatusCode}): {Payload}",
                    (int)response.StatusCode,
                    payload);
                continue;
            }

            invalidTokens.AddRange(ReadRejectedTokens(batch, payload));
        }

        return invalidTokens;
    }

    /// <summary>
    /// Expo ตอบกลับเป็น { "data": [ { "status": "ok" | "error", ... } ] } เรียงตามลำดับที่ส่งไป
    /// ถ้าไม่อ่านตรงนี้ ต่อให้ทุก token พังก็จะได้ HTTP 200 แล้วเงียบหายไปเฉย ๆ
    /// </summary>
    private IReadOnlyList<string> ReadRejectedTokens(string[] batch, string payload)
    {
        var rejected = new List<string>();

        try
        {
            using var document = JsonDocument.Parse(payload);

            if (!document.RootElement.TryGetProperty("data", out var results) ||
                results.ValueKind != JsonValueKind.Array)
            {
                return rejected;
            }

            var index = 0;

            foreach (var result in results.EnumerateArray())
            {
                if (index >= batch.Length)
                {
                    break;
                }

                var token = batch[index++];
                var status = result.TryGetProperty("status", out var statusValue)
                    ? statusValue.GetString()
                    : null;

                if (status == "ok")
                {
                    continue;
                }

                var message = result.TryGetProperty("message", out var messageValue)
                    ? messageValue.GetString()
                    : "unknown error";

                _logger.LogWarning("Expo rejected token {Token}: {Message}", token, message);

                var errorCode = result.TryGetProperty("details", out var details) &&
                                details.TryGetProperty("error", out var errorValue)
                    ? errorValue.GetString()
                    : null;

                if (errorCode is "DeviceNotRegistered")
                {
                    rejected.Add(token);
                }
            }
        }
        catch (JsonException exception)
        {
            _logger.LogError(exception, "Could not parse Expo push response: {Payload}", payload);
        }

        return rejected;
    }
}

public static class ExpoPushToken
{
    public static bool IsValid(string? token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return false;
        }

        return token.StartsWith("ExpoPushToken[", StringComparison.Ordinal) ||
               token.StartsWith("ExponentPushToken[", StringComparison.Ordinal);
    }
}

public sealed record ExpoPushMessage(
    [property: JsonPropertyName("to")] string To,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("body")] string Body,
    [property: JsonPropertyName("sound")] string Sound,
    [property: JsonPropertyName("priority")] string Priority,
    // ต้องตรงกับ channel ที่แอปสร้างไว้ ไม่งั้นแจ้งเตือนจะไปอยู่ channel default
    [property: JsonPropertyName("channelId")] string ChannelId,
    [property: JsonPropertyName("data")] object Data);

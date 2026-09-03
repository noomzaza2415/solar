using System.Text.Json;

public interface IPushTokenStore
{
    Task SaveAsync(PushTokenRecord token);
    Task<IReadOnlyList<string>> GetAllTokensAsync();
    Task<IReadOnlyList<PushTokenRecord>> GetAllAsync();
    Task RemoveAsync(IEnumerable<string> tokens);
}

/// <summary>
/// เก็บ push token ลงไฟล์ JSON
/// ของเดิมเก็บใน memory ล้วน พอ service รีสตาร์ตทีเดียว token หายหมด
/// แล้วจะไม่มีใครได้รับแจ้งเตือนอีกเลยจนกว่าผู้ใช้จะเปิดแอปใหม่
/// </summary>
public sealed class FilePushTokenStore : IPushTokenStore
{
    private readonly string _filePath;
    private readonly SemaphoreSlim _mutex = new(1, 1);
    private readonly ILogger<FilePushTokenStore> _logger;
    private Dictionary<string, PushTokenRecord>? _tokens;

    public FilePushTokenStore(
        IConfiguration configuration,
        ILogger<FilePushTokenStore> logger)
    {
        var options = new SolarAlertOptions();
        configuration.GetSection(SolarAlertOptions.SectionName).Bind(options);

        Directory.CreateDirectory(options.StateDirectory);
        _filePath = Path.Combine(options.StateDirectory, "push-tokens.json");
        _logger = logger;
    }

    public async Task SaveAsync(PushTokenRecord token)
    {
        await _mutex.WaitAsync();

        try
        {
            var tokens = await LoadAsync();
            tokens[token.Token] = token;
            await PersistAsync(tokens);
        }
        finally
        {
            _mutex.Release();
        }
    }

    public async Task<IReadOnlyList<string>> GetAllTokensAsync()
    {
        await _mutex.WaitAsync();

        try
        {
            var tokens = await LoadAsync();
            return tokens.Keys.ToList();
        }
        finally
        {
            _mutex.Release();
        }
    }

    public async Task<IReadOnlyList<PushTokenRecord>> GetAllAsync()
    {
        await _mutex.WaitAsync();

        try
        {
            var tokens = await LoadAsync();
            return tokens.Values.ToList();
        }
        finally
        {
            _mutex.Release();
        }
    }

    public async Task RemoveAsync(IEnumerable<string> tokens)
    {
        var removals = tokens.ToArray();

        if (removals.Length == 0)
        {
            return;
        }

        await _mutex.WaitAsync();

        try
        {
            var stored = await LoadAsync();

            foreach (var token in removals)
            {
                stored.Remove(token);
            }

            await PersistAsync(stored);
            _logger.LogInformation("Removed {Count} stale push token(s)", removals.Length);
        }
        finally
        {
            _mutex.Release();
        }
    }

    private async Task<Dictionary<string, PushTokenRecord>> LoadAsync()
    {
        if (_tokens is not null)
        {
            return _tokens;
        }

        if (!File.Exists(_filePath))
        {
            _tokens = new Dictionary<string, PushTokenRecord>();
            return _tokens;
        }

        try
        {
            await using var stream = File.OpenRead(_filePath);
            var records = await JsonSerializer.DeserializeAsync<List<PushTokenRecord>>(stream);

            _tokens = records?.ToDictionary(record => record.Token)
                      ?? new Dictionary<string, PushTokenRecord>();
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Failed to read push token file, starting empty");
            _tokens = new Dictionary<string, PushTokenRecord>();
        }

        return _tokens;
    }

    private async Task PersistAsync(Dictionary<string, PushTokenRecord> tokens)
    {
        _tokens = tokens;

        await using var stream = File.Create(_filePath);
        await JsonSerializer.SerializeAsync(stream, tokens.Values.ToList());
    }
}

/// <summary>
/// จำว่ารอบแจ้งเตือนไหนของวันไหนส่งไปแล้ว เพื่อไม่ให้ยิงซ้ำ
/// เก็บลงไฟล์เพราะ service อาจถูกรีสตาร์ตระหว่างวัน ถ้าจำไว้แต่ใน memory
/// พอ container ขึ้นใหม่จะยิงรอบเดิมซ้ำอีกครั้ง
/// </summary>
public sealed class SentReminderStore
{
    private readonly string _filePath;
    private readonly ILogger<SentReminderStore> _logger;
    private Dictionary<string, string>? _sent;

    public SentReminderStore(IConfiguration configuration, ILogger<SentReminderStore> logger)
    {
        var options = new SolarAlertOptions();
        configuration.GetSection(SolarAlertOptions.SectionName).Bind(options);

        Directory.CreateDirectory(options.StateDirectory);
        _filePath = Path.Combine(options.StateDirectory, "sent-reminders.json");
        _logger = logger;
    }

    public bool WasSent(string slotKey) => Load().ContainsKey(slotKey);

    /// <summary>บันทึกว่าส่งรอบนี้แล้ว พร้อมล้างรายการของวันก่อน ๆ ทิ้ง</summary>
    public async Task MarkSentAsync(string slotKey, DateTime date)
    {
        var sent = Load();
        var todayPrefix = date.ToString("yyyy-MM-dd");

        var nextSent = sent
            .Where(entry => entry.Key.StartsWith(todayPrefix, StringComparison.Ordinal))
            .ToDictionary(entry => entry.Key, entry => entry.Value);

        nextSent[slotKey] = DateTimeOffset.Now.ToString("O");
        _sent = nextSent;

        try
        {
            await using var stream = File.Create(_filePath);
            await JsonSerializer.SerializeAsync(stream, nextSent);
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Failed to persist sent reminder state");
        }
    }

    private Dictionary<string, string> Load()
    {
        if (_sent is not null)
        {
            return _sent;
        }

        if (!File.Exists(_filePath))
        {
            _sent = new Dictionary<string, string>();
            return _sent;
        }

        try
        {
            var json = File.ReadAllText(_filePath);
            _sent = JsonSerializer.Deserialize<Dictionary<string, string>>(json)
                    ?? new Dictionary<string, string>();
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Failed to read sent reminder state, starting empty");
            _sent = new Dictionary<string, string>();
        }

        return _sent;
    }
}

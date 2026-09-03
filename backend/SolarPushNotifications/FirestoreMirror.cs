using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;

/// <summary>
/// ค่าตั้งของงาน mirror ข้อมูลขึ้น Cloud Firestore ปรับได้จาก appsettings.json ส่วน "Firestore"
///
/// จุดประสงค์: API ข้อมูลโซล่า (SolarAlerts:SolarDataUrl) อยู่ในวง LAN เท่านั้น
/// เครื่องนอกวงจึงเปิดแอปแล้วเห็นแต่ "เชื่อมต่อไม่ได้"
/// service ตัวนี้อยู่ในวงอยู่แล้ว จึงรับหน้าที่คัดลอกข้อมูลขึ้น Firestore ให้แอปอ่านจากที่ไหนก็ได้
/// โดยไม่ต้องเปิดพอร์ตของ API ตัวจริงออกอินเทอร์เน็ต
/// </summary>
public sealed class FirestoreOptions
{
    public const string SectionName = "Firestore";

    /// <summary>ปิดได้เมื่อยังไม่ได้วางไฟล์ service account เช่น ตอนรันในเครื่องพัฒนา</summary>
    public bool Enabled { get; set; } = true;

    public string ProjectId { get; set; } = "solar-869ec";

    /// <summary>ปกติคือ (default) เว้นแต่ไปสร้าง database เพิ่มใน Firestore</summary>
    public string DatabaseId { get; set; } = "(default)";

    /// <summary>
    /// ตำแหน่ง document ที่จะเขียนทับทุกรอบ รูปแบบ {collection}/{document}
    /// ต้องตรงกับที่แอปอ่าน (src/lib/firebase.ts)
    /// </summary>
    public string DocumentPath { get; set; } = "solar/snapshot";

    /// <summary>
    /// ไฟล์ service account (JSON) ที่โหลดจาก Firebase Console
    /// ค่าเริ่มต้นชี้ไปโฟลเดอร์ state เพราะเป็นที่เดียวที่ mount volume ไว้อยู่แล้ว
    /// ห้าม commit ไฟล์นี้เข้า git เด็ดขาด เพราะเขียน Firestore ได้เต็มสิทธิ์
    /// </summary>
    public string ServiceAccountPath { get; set; } = "state/firebase-service-account.json";

    /// <summary>ทุกกี่วินาทีจะไปดึงข้อมูลจาก API มาเทียบและอัปโหลด</summary>
    public int MirrorIntervalSeconds { get; set; } = 120;
}

/// <summary>
/// ขอ access token ของ Google จากไฟล์ service account (OAuth 2.0 JWT bearer flow)
///
/// เขียนเองด้วย HttpClient แทนการลง Google SDK ด้วยเหตุผลเดียวกับ ExpoPushService
/// คือ service นี้ตั้งใจไม่พึ่ง NuGet ภายนอกเลย build ในเครื่องที่ต่อเน็ตจำกัดได้
/// </summary>
public sealed class GoogleAccessTokenProvider
{
    private const string Scope = "https://www.googleapis.com/auth/datastore";
    private const string DefaultTokenUri = "https://oauth2.googleapis.com/token";

    private readonly HttpClient _httpClient;
    private readonly FirestoreOptions _options;
    private readonly ILogger<GoogleAccessTokenProvider> _logger;
    private readonly SemaphoreSlim _mutex = new(1, 1);

    private ServiceAccountKey? _key;
    private string? _accessToken;
    private DateTimeOffset _accessTokenExpiresAt = DateTimeOffset.MinValue;

    public GoogleAccessTokenProvider(
        IHttpClientFactory httpClientFactory,
        IOptions<FirestoreOptions> options,
        ILogger<GoogleAccessTokenProvider> logger)
    {
        _httpClient = httpClientFactory.CreateClient();
        _httpClient.Timeout = TimeSpan.FromSeconds(20);
        _options = options.Value;
        _logger = logger;
    }

    public async Task<string> GetAccessTokenAsync(CancellationToken cancellationToken = default)
    {
        await _mutex.WaitAsync(cancellationToken);

        try
        {
            // เผื่อเวลาไว้ 60 วินาที ไม่งั้น token อาจหมดอายุระหว่างที่ request กำลังเดินทาง
            if (_accessToken is not null &&
                DateTimeOffset.UtcNow < _accessTokenExpiresAt.AddSeconds(-60))
            {
                return _accessToken;
            }

            _key ??= ServiceAccountKey.Load(_options.ServiceAccountPath);

            var assertion = CreateSignedJwt(_key);

            using var request = new HttpRequestMessage(HttpMethod.Post, _key.TokenUri)
            {
                Content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["grant_type"] = "urn:ietf:params:oauth:grant-type:jwt-bearer",
                    ["assertion"] = assertion
                })
            };

            using var response = await _httpClient.SendAsync(request, cancellationToken);
            var payload = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException(
                    $"ขอ access token จาก Google ไม่สำเร็จ ({(int)response.StatusCode}): {payload}");
            }

            using var document = JsonDocument.Parse(payload);
            var root = document.RootElement;

            _accessToken = root.GetProperty("access_token").GetString();

            var expiresIn = root.TryGetProperty("expires_in", out var expiresValue)
                ? expiresValue.GetInt32()
                : 3600;

            _accessTokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(expiresIn);

            _logger.LogInformation(
                "Got Google access token for {ClientEmail} (expires in {Seconds}s)",
                _key.ClientEmail,
                expiresIn);

            return _accessToken ??
                   throw new InvalidOperationException("Google ไม่ได้ส่ง access_token กลับมา");
        }
        finally
        {
            _mutex.Release();
        }
    }

    /// <summary>เซ็น JWT ด้วย private key ของ service account (RS256) ตามที่ Google กำหนด</summary>
    private static string CreateSignedJwt(ServiceAccountKey key)
    {
        var issuedAt = DateTimeOffset.UtcNow;
        var expiresAt = issuedAt.AddHours(1);

        var header = new JsonObject
        {
            ["alg"] = "RS256",
            ["typ"] = "JWT"
        };

        var claims = new JsonObject
        {
            ["iss"] = key.ClientEmail,
            ["scope"] = Scope,
            ["aud"] = key.TokenUri,
            ["iat"] = issuedAt.ToUnixTimeSeconds(),
            ["exp"] = expiresAt.ToUnixTimeSeconds()
        };

        var unsigned =
            $"{Base64Url(Encoding.UTF8.GetBytes(header.ToJsonString()))}." +
            $"{Base64Url(Encoding.UTF8.GetBytes(claims.ToJsonString()))}";

        using var rsa = RSA.Create();
        rsa.ImportFromPem(key.PrivateKey);

        var signature = rsa.SignData(
            Encoding.UTF8.GetBytes(unsigned),
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1);

        return $"{unsigned}.{Base64Url(signature)}";
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

    private sealed record ServiceAccountKey(
        string ClientEmail,
        string PrivateKey,
        string TokenUri)
    {
        public static ServiceAccountKey Load(string path)
        {
            if (!File.Exists(path))
            {
                throw new FileNotFoundException(
                    $"ไม่พบไฟล์ service account ที่ {Path.GetFullPath(path)} " +
                    "โหลดได้จาก Firebase Console > Project settings > Service accounts",
                    path);
            }

            using var document = JsonDocument.Parse(File.ReadAllText(path));
            var root = document.RootElement;

            var clientEmail = root.TryGetProperty("client_email", out var emailValue)
                ? emailValue.GetString()
                : null;

            var privateKey = root.TryGetProperty("private_key", out var keyValue)
                ? keyValue.GetString()
                : null;

            if (string.IsNullOrWhiteSpace(clientEmail) || string.IsNullOrWhiteSpace(privateKey))
            {
                throw new InvalidOperationException(
                    $"ไฟล์ {path} ไม่ใช่ service account key (ต้องมีทั้ง client_email และ private_key)");
            }

            var tokenUri = root.TryGetProperty("token_uri", out var tokenUriValue)
                ? tokenUriValue.GetString() ?? DefaultTokenUri
                : DefaultTokenUri;

            return new ServiceAccountKey(clientEmail, privateKey, tokenUri);
        }
    }
}

/// <summary>
/// เขียน document ลง Firestore ผ่าน REST API
/// ใช้ PATCH พร้อม updateMask เพื่อเขียนทับเฉพาะฟิลด์ที่เราดูแล
/// (ไม่ใส่ mask = ลบฟิลด์อื่นทิ้งทั้งหมด ซึ่งอันตรายถ้าวันหลังมีคนเพิ่มฟิลด์อื่นใน document เดียวกัน)
/// </summary>
public sealed class FirestoreWriter
{
    private readonly HttpClient _httpClient;
    private readonly GoogleAccessTokenProvider _tokenProvider;
    private readonly FirestoreOptions _options;

    public FirestoreWriter(
        IHttpClientFactory httpClientFactory,
        GoogleAccessTokenProvider tokenProvider,
        IOptions<FirestoreOptions> options)
    {
        _httpClient = httpClientFactory.CreateClient();
        _httpClient.Timeout = TimeSpan.FromSeconds(30);
        _tokenProvider = tokenProvider;
        _options = options.Value;
    }

    public async Task WriteDocumentAsync(
        JsonObject fields,
        CancellationToken cancellationToken = default)
    {
        var accessToken = await _tokenProvider.GetAccessTokenAsync(cancellationToken);

        var maskQuery = string.Join(
            "&",
            fields.Select(field => $"updateMask.fieldPaths={Uri.EscapeDataString(field.Key)}"));

        var url =
            $"https://firestore.googleapis.com/v1/projects/{_options.ProjectId}" +
            $"/databases/{Uri.EscapeDataString(_options.DatabaseId)}" +
            $"/documents/{_options.DocumentPath}?{maskQuery}";

        using var request = new HttpRequestMessage(HttpMethod.Patch, url)
        {
            Content = new StringContent(
                new JsonObject { ["fields"] = fields }.ToJsonString(),
                Encoding.UTF8,
                "application/json")
        };

        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await _httpClient.SendAsync(request, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            var payload = await response.Content.ReadAsStringAsync(cancellationToken);

            throw new InvalidOperationException(
                $"เขียน Firestore ไม่สำเร็จ ({(int)response.StatusCode}): {payload}");
        }
    }
}

/// <summary>
/// แปลงค่าที่ API ส่งมาให้เป็นรูปแบบค่าของ Firestore REST
/// ตัวเลขที่ API ส่งมาเป็นสตริง (เช่น "1,234.5") จะถูกแปลงเป็น doubleValue ตั้งแต่ตรงนี้
/// เพื่อให้ฝั่งแอปไม่ต้องมาแกะจุลภาคอีกรอบ
/// </summary>
public static class FirestoreValue
{
    public static JsonObject FromSolarValue(JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Number:
                return new JsonObject { ["doubleValue"] = element.GetDouble() };

            case JsonValueKind.String:
                var text = element.GetString();
                var cleaned = text?.Replace(",", string.Empty);

                if (double.TryParse(
                        cleaned,
                        NumberStyles.Any,
                        CultureInfo.InvariantCulture,
                        out var parsed))
                {
                    return new JsonObject { ["doubleValue"] = parsed };
                }

                return new JsonObject { ["stringValue"] = text ?? string.Empty };

            case JsonValueKind.True:
            case JsonValueKind.False:
                return new JsonObject { ["booleanValue"] = element.GetBoolean() };

            default:
                return new JsonObject { ["nullValue"] = null };
        }
    }
}

/// <summary>
/// ดึงข้อมูลจาก API ในวงทุก MirrorIntervalSeconds แล้วอัปโหลดขึ้น Firestore
/// เขียนเฉพาะตอนข้อมูลเปลี่ยนจริง เพื่อไม่ให้เปลืองโควตาเขียนของ Firestore ฟรีทีเออร์
/// (ทุก 2 นาทีตลอดวันคือ ~720 ครั้ง ถ้าเขียนทุกรอบโดยไม่เทียบก่อน)
/// </summary>
public sealed class FirestoreMirrorWorker : BackgroundService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly FirestoreWriter _writer;
    private readonly FirestoreOptions _options;
    private readonly SolarAlertOptions _solarOptions;
    private readonly ILogger<FirestoreMirrorWorker> _logger;

    private string? _lastUploadedSignature;

    public FirestoreMirrorWorker(
        IHttpClientFactory httpClientFactory,
        FirestoreWriter writer,
        IOptions<FirestoreOptions> options,
        IOptions<SolarAlertOptions> solarOptions,
        ILogger<FirestoreMirrorWorker> logger)
    {
        _httpClientFactory = httpClientFactory;
        _writer = writer;
        _options = options.Value;
        _solarOptions = solarOptions.Value;
        _logger = logger;
    }

    public DateTimeOffset? LastMirroredAt { get; private set; }
    public string LastResult { get; private set; } = "ยังไม่ได้ mirror ขึ้น Firestore";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled)
        {
            LastResult = "ปิดการ mirror ไว้ (Firestore:Enabled = false)";
            _logger.LogWarning("Firestore mirror is disabled");
            return;
        }

        _logger.LogInformation(
            "Firestore mirror started. {ProjectId}/{DocumentPath} every {Seconds}s",
            _options.ProjectId,
            _options.DocumentPath,
            _options.MirrorIntervalSeconds);

        var interval = TimeSpan.FromSeconds(Math.Max(30, _options.MirrorIntervalSeconds));
        using var timer = new PeriodicTimer(interval);

        do
        {
            try
            {
                await MirrorOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception exception)
            {
                LastResult = $"ผิดพลาด: {exception.Message}";
                _logger.LogError(exception, "Firestore mirror failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    /// <summary>ดึงข้อมูลจริงจาก API แล้วอัปโหลดขึ้น Firestore หนึ่งรอบ</summary>
    public async Task<string> MirrorOnceAsync(CancellationToken cancellationToken = default)
    {
        var httpClient = _httpClientFactory.CreateClient();
        httpClient.Timeout = TimeSpan.FromSeconds(20);

        using var apiResponse = await httpClient.GetAsync(
            _solarOptions.SolarDataUrl,
            cancellationToken);

        apiResponse.EnsureSuccessStatusCode();

        var body = await apiResponse.Content.ReadAsStringAsync(cancellationToken);
        var data = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(body);

        if (data is null || data.Count == 0)
        {
            LastResult = "API ไม่ส่งข้อมูลกลับมา จึงไม่ได้อัปโหลด";
            return LastResult;
        }

        var values = new JsonObject();

        // เรียงคีย์ก่อน เพื่อให้ข้อมูลชุดเดิมได้ลายเซ็นเดิมทุกครั้ง ไม่งั้นจะเขียนซ้ำทั้งที่ไม่มีอะไรเปลี่ยน
        foreach (var entry in data.OrderBy(entry => entry.Key, StringComparer.Ordinal))
        {
            values[entry.Key] = FirestoreValue.FromSolarValue(entry.Value);
        }

        var signature = values.ToJsonString();

        if (signature == _lastUploadedSignature)
        {
            LastMirroredAt = DateTimeOffset.Now;
            LastResult = $"ข้อมูลไม่เปลี่ยน ({data.Count} คีย์) ข้ามการเขียน";
            return LastResult;
        }

        var fields = new JsonObject
        {
            ["values"] = new JsonObject
            {
                ["mapValue"] = new JsonObject { ["fields"] = values }
            },
            // เวลาที่ข้อมูลชุดนี้ถูกอ่านมาจาก API จริง ๆ แอปเอาไปแสดงว่า "ซิงก์ล่าสุดเมื่อ"
            ["updatedAt"] = new JsonObject
            {
                ["timestampValue"] = DateTimeOffset.UtcNow.ToString(
                    "yyyy-MM-dd'T'HH:mm:ss'Z'",
                    CultureInfo.InvariantCulture)
            },
            ["source"] = new JsonObject { ["stringValue"] = _solarOptions.SolarDataUrl },
            ["keyCount"] = new JsonObject
            {
                ["integerValue"] = data.Count.ToString(CultureInfo.InvariantCulture)
            }
        };

        await _writer.WriteDocumentAsync(fields, cancellationToken);

        _lastUploadedSignature = signature;
        LastMirroredAt = DateTimeOffset.Now;
        LastResult = $"อัปโหลด {data.Count} คีย์ขึ้น {_options.DocumentPath} แล้ว";

        _logger.LogInformation(
            "Mirrored {Count} keys to Firestore {DocumentPath}",
            data.Count,
            _options.DocumentPath);

        return LastResult;
    }
}

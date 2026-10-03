using System.Text.Json.Nodes;
using System.Collections.Concurrent;
namespace CoSkin;

internal sealed class Library : IDisposable
{
    private const int LibraryJsonLimit = 16 * 1024 * 1024;
    private readonly TransferStore transfers;
    private readonly AssetStorageLocation assetStorage;
    internal Func<string, string, long, string, Task<JsonObject>>? OpenAssetMedia { get; set; }
    internal Func<string, Task>? ReleaseAssetMedia { get; set; }
    private sealed record MediaLease(string? Owner, Func<string, Task> Release);
    private readonly ConcurrentDictionary<string, MediaLease> mediaLeases = new(StringComparer.Ordinal);
    private async Task ReleaseMedia(string token)
    {
        if (mediaLeases.TryRemove(token, out var lease))
            try { await lease.Release(token); } catch { }
    }
    internal Func<string?, string?>? PickAssetStoragePath { get; set; }
    internal Func<string, string, string?>? PickBackgroundExportPath { get; set; }
    internal Func<string, string?>? PickThemeExportPath { get; set; }
    internal Func<string?>? PickBackgroundConverter { get; set; }
    internal BackgroundExport BackgroundExports { get; }
    internal Func<bool, Task<UpdateResult>>? CheckUpdate { get; set; }
    internal Func<Task<UpdateResult>>? ApplyUpdate { get; set; }
    internal Action<bool>? SetStartup { get; set; }
    internal RuntimePreferenceStore Preferences
    {
        get;
    }
    internal event Action<JsonObject>? StateChanged;
    internal string Locale { get; private set; } = UiLocale.Normalize(System.Globalization.CultureInfo.CurrentUICulture.Name);
    internal string StageTransfer(byte[] bytes, int chunkBytes = TransferStore.ChunkBytes) => transfers.Stage(bytes, chunkBytes);
    internal void CancelTransfer(string token) => transfers.Cancel(token);
    public void Dispose()
    {
        BackgroundExports.Dispose();
        transfers.Dispose();
    }
    internal string StorePath => root;
    private readonly string root; private readonly SemaphoreSlim gate = new(1, 1);
    internal Library(string root)
    {
        this.root = Path.GetFullPath(root);
        Directory.CreateDirectory(root);
        transfers = new TransferStore(Path.GetTempPath());
        Preferences = new RuntimePreferenceStore(this.root);
        assetStorage = new AssetStorageLocation(this.root, Preferences);
        BackgroundExports = new BackgroundExport(this.root);
    }
    private string FilePath(string name) => Path.Combine(root, name);
    private JsonObject State() => File.Exists(FilePath("library.json")) ? JsonContract.Read(File.ReadAllBytes(FilePath("library.json")), LibraryJsonLimit) : new JsonObject { ["themes"] = new JsonObject(), ["bindings"] = new JsonObject(), ["enabled"] = true };
    private void Write(string name, JsonObject value)
    {
        var dest = FilePath(name);
        var tmp = dest + "." + Guid.NewGuid().ToString("N") + ".tmp";
        var serialized = JsonContract.Serialize(value);
        if (name == "library.json" && System.Text.Encoding.UTF8.GetByteCount(serialized) > LibraryJsonLimit)
            throw new InvalidDataException("라이브러리 분류 정보의 크기 제한을 초과했습니다.");
        File.WriteAllText(tmp, serialized);
        File.Move(tmp, dest, true);
        if (name == "library.json")
            StateChanged?.Invoke(new JsonObject { ["themes"] = value["themes"]!.DeepClone(), ["bindings"] = value["bindings"]!.DeepClone(), ["enabled"] = value["enabled"]!.DeepClone() });
    }
    internal async Task<JsonNode> Handle(JsonObject request, Func<JsonObject, Task> validate, Func<byte[], string, Task> decode, Func<JsonObject, JsonObject, Task>? applyPlan = null)
    {
        // A verified file copy must not block liveness requests from other windows.
        if (request["op"]?.GetValue<string>() == "list") return Summary(State());
        if (request["op"]?.GetValue<string>() == "runtime-settings-read") return RuntimeSettingsDocument();
        if (request["op"]?.GetValue<string>() is "background-export-info" or "background-export-start" or
            "background-export-status" or "background-export-cancel" or "background-export-converter-pick" or
            "background-export-list" or "background-export-limit" or "background-export-queue-cancel" or
            "background-export-retry" or "background-export-clear")
            return await HandleBackgroundExport(request);
        if (request["op"]?.GetValue<string>() == "theme-export-save")
            return await HandleThemeExport(request, validate);
        if (request["op"]?.GetValue<string>() == "background-media-info")
        {
            JsonObject document;
            await gate.WaitAsync();
            try
            {
                var id = JsonContract.String(request, "id");
                var entry = State()["themes"]?[id]?.AsObject() ?? throw new InvalidDataException("테마를 찾지 못했습니다.");
                var revision = request["revision"]?.GetValue<int>() ?? entry["revision"]!.GetValue<int>();
                if (revision < 1 || revision > entry["revision"]!.GetValue<int>()) throw new InvalidDataException("테마 리비전 오류");
                document = JsonContract.Read(File.ReadAllBytes(FilePath($"revision-{entry["key"]}-{revision}.json")));
            }
            finally { gate.Release(); }
            return await Task.Run(() => BackgroundMediaInfo.Read(document, request["profile"]?.GetValue<string>(), hash => MediaMetadata.Read(assetStorage.PathForHash(hash))));
        }
        if (request["op"]?.GetValue<string>() is "asset-storage-read" or "asset-storage-pick")
        {
            var storageRequest = new JsonObject();
            foreach (var property in request.Where(p => p.Key is not ("contractVersion" or "sessionId" or "requestId")))
                storageRequest[property.Key] = property.Value?.DeepClone();
            return await Task.Run(() => assetStorage.Handle(storageRequest, PickAssetStoragePath));
        }
        var ownerMatch = System.Text.RegularExpressions.Regex.Match(request["requestId"]?.GetValue<string>() ?? "", "^([a-f0-9]{32}):[0-9]+$");
        var transferOwner = ownerMatch.Success ? ownerMatch.Groups[1].Value : null;
        switch (request["op"]?.GetValue<string>())
        {
            case "transfer-begin":
                var chunkBytes = request["chunkBytes"]?.GetValue<int>() ?? TransferStore.ChunkBytes;
                return new JsonObject { ["token"] = transfers.Begin(request["length"]!.GetValue<long>(), chunkBytes, transferOwner), ["chunkBytes"] = chunkBytes };
            case "transfer-append":
                var encoded = JsonContract.String(request, "data");
                if (encoded.Length > (TransferStore.LargeChunkBytes + 2) / 3 * 4)
                    throw new InvalidDataException("전송 조각 크기 제한");
                transfers.Append(JsonContract.String(request, "token"), request["offset"]!.GetValue<long>(), Convert.FromBase64String(encoded));
                return new JsonObject { ["ok"] = true };
            case "transfer-read":
                return new JsonObject { ["data"] = Convert.ToBase64String(transfers.Read(JsonContract.String(request, "token"), request["offset"]!.GetValue<long>())) };
            case "transfer-cancel":
                transfers.Cancel(JsonContract.String(request, "token"));
                return new JsonObject { ["ok"] = true };
            case "transfer-cancel-owner":
                if (transferOwner is null) throw new InvalidDataException("전송 소유자 계약 오류");
                transfers.CancelOwner(transferOwner);
                foreach (var lease in mediaLeases.Where(pair => pair.Value.Owner == transferOwner).ToArray())
                    await ReleaseMedia(lease.Key);
                return new JsonObject { ["ok"] = true };
        }
        byte[] InputBytes() => request["token"] is not null ? transfers.Consume(JsonContract.String(request, "token")) : Convert.FromBase64String(JsonContract.String(request, "data"));
        if (request["op"]?.GetValue<string>() == "asset-media-release")
        {
            await ReleaseMedia(JsonContract.String(request, "token"));
            return new JsonObject { ["ok"] = true };
        }
        if (request["op"]?.GetValue<string>() == "asset-open")
        {
            var open = OpenAssetMedia;
            var release = ReleaseAssetMedia;
            if (open is null || release is null) return new JsonObject { ["available"] = false };
            if (transfers.IsOwnerCanceled(transferOwner)) throw new InvalidDataException("이 창의 전송 요청은 취소되었습니다.");
            var hash = JsonContract.String(request, "hash");
            if (!System.Text.RegularExpressions.Regex.IsMatch(hash, "^[a-f0-9]{64}$")) throw new InvalidDataException("자산 해시 오류");
            var path = assetStorage.PathForHash(hash);
            var descriptor = await Task.Run(() => {
                using var source = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.SequentialScan);
                if (source.Length < 1 || source.Length > MediaLimits.VideoBytes) throw new InvalidDataException("미디어 파일 크기 제한을 초과했습니다.");
                var header = new byte[(int)Math.Min(64 * 1024, source.Length)]; source.ReadExactly(header);
                var mime = ImageProbe.Mime(header); source.Position = 0;
                if (Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(source)).ToLowerInvariant() != hash)
                    throw new InvalidDataException("내부 자산이 손상되었습니다.");
                return (mime, source.Length);
            });
            if (transfers.IsOwnerCanceled(transferOwner)) throw new InvalidDataException("이 창의 전송 요청은 취소되었습니다.");
            var source = await open(path, descriptor.mime, descriptor.Length, hash);
            var mediaToken = JsonContract.String(source, "token");
            mediaLeases[mediaToken] = new MediaLease(transferOwner, release);
            if (transfers.IsOwnerCanceled(transferOwner) || !ReferenceEquals(open, OpenAssetMedia) || !ReferenceEquals(release, ReleaseAssetMedia))
            {
                await ReleaseMedia(mediaToken);
                throw new InvalidDataException("이 창의 미디어 요청은 취소되었습니다.");
            }
            return source;
        }
        if (request["op"]?.GetValue<string>() is "asset-poster-read" or "asset-poster-write")
        {
            var hash = JsonContract.String(request, "hash");
            if (!File.Exists(assetStorage.PathForHash(hash))) throw new InvalidDataException("미리보기의 원본 자산이 없습니다.");
            return await Task.Run<JsonNode>(() => {
                var cache = new PosterCache(assetStorage.CurrentPath);
                if (request["op"]!.GetValue<string>() == "asset-poster-write")
                {
                    if (request["token"] is null) throw new InvalidDataException("미리보기 전송이 필요합니다.");
                    cache.Write(hash, transfers.Consume(JsonContract.String(request, "token"), PosterCache.MaxPosterBytes));
                    return new JsonObject { ["ok"] = true };
                }
                var bytes = cache.Read(hash);
                if (bytes is null) return new JsonObject { ["available"] = false };
                var chunkBytes = TransferStore.LargeChunkBytes;
                var token = transfers.Stage(bytes, chunkBytes, transferOwner);
                return new JsonObject { ["available"] = true, ["token"] = token, ["length"] = bytes.Length, ["mime"] = "image/png", ["chunkBytes"] = chunkBytes };
            });
        }
        if (request["op"]?.GetValue<string>() == "asset-read")
        {
            var hash = JsonContract.String(request, "hash");
            if (!System.Text.RegularExpressions.Regex.IsMatch(hash, "^[a-f0-9]{64}$")) throw new InvalidDataException("자산 해시 오류");
            var path = assetStorage.PathForHash(hash);
            var chunkBytes = request["largeChunks"]?.GetValue<bool>() == true ? TransferStore.LargeChunkBytes : TransferStore.ChunkBytes;
            return await Task.Run<JsonNode>(() => {
                using var source = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.SequentialScan);
                if (source.Length < 1 || source.Length > MediaLimits.VideoBytes) throw new InvalidDataException("미디어 파일 크기 제한을 초과했습니다.");
                var header = new byte[(int)Math.Min(64 * 1024, source.Length)];
                source.ReadExactly(header);
                var mime = ImageProbe.Mime(header);
                source.Position = 0;
                var token = transfers.StageAsset(source, hash, chunkBytes, transferOwner);
                return new JsonObject { ["token"] = token, ["length"] = source.Length, ["mime"] = mime, ["chunkBytes"] = chunkBytes };
            });
        }
        await gate.WaitAsync();
        try
        {
            var op = JsonContract.String(request, "op");
            var state = State();
            var themes = state["themes"]!.AsObject();
            string Id() => JsonContract.String(request, "id");
            JsonObject Entry() => themes[Id()]?.AsObject() ?? throw new InvalidDataException("테마를 찾지 못했습니다.");
            JsonObject Revision(JsonObject e, int rev) => JsonContract.Read(File.ReadAllBytes(FilePath($"revision-{e["key"]}-{rev}.json")));
            switch (op)
            {
                case "organization-write":
                    ThemeOrganization.WriteTheme(state, Id(), request["metadata"]?.AsObject() ?? throw new InvalidDataException("분류 정보가 필요합니다."));
                    Write("library.json", state);
                    return Summary(state);
                case "organization-batch":
                    var changes = request["changes"]?.AsArray() ?? throw new InvalidDataException("일괄 분류 목록이 필요합니다.");
                    if (changes.Count is < 1 or > 2048) throw new InvalidDataException("한 번에 1~2048개 테마를 정리할 수 있습니다.");
                    var changedIds = new HashSet<string>(StringComparer.Ordinal);
                    foreach (var item in changes)
                    {
                        var change = item?.AsObject() ?? throw new InvalidDataException("일괄 분류 항목을 확인해 주세요.");
                        JsonContract.Fields(change, "id", "metadata");
                        var changedId = JsonContract.String(change, "id");
                        if (!changedIds.Add(changedId)) throw new InvalidDataException("일괄 분류 목록에 같은 테마가 중복되었습니다.");
                        ThemeOrganization.WriteTheme(state, changedId, change["metadata"]?.AsObject() ?? throw new InvalidDataException("분류 정보가 필요합니다."));
                    }
                    Write("library.json", state);
                    return Summary(state);
                case "group-write":
                    var groupId = ThemeOrganization.WriteGroup(state, request["groupId"]?.GetValue<string>(), JsonContract.String(request, "name"),
                        request["parentId"]?.GetValue<string>(), request.ContainsKey("parentId"));
                    Write("library.json", state);
                    return new JsonObject { ["groupId"] = groupId };
                case "group-delete":
                    ThemeOrganization.DeleteGroup(state, JsonContract.String(request, "groupId"));
                    Write("library.json", state);
                    return Summary(state);
                case "effect-import":
                case "effect-register":
                    {
                        var definition = op == "effect-import" ? EffectLibrary.Parse(InputBytes()) : request["definition"]?.DeepClone() as JsonObject ?? throw new InvalidDataException("사용자 효과 정의가 필요합니다.");
                        var result = await EffectLibrary.Register(state, definition, request["replace"]?.GetValue<bool>() == true,
                            request["rename"]?.GetValue<string>(), validate);
                        if (result["ok"]?.GetValue<bool>() == true)
                            Write("library.json", state);
                        return result;
                    }
                case "effect-delete":
                    {
                        var definitions = state["effects"]?.AsArray();
                        var definition = definitions?.FirstOrDefault(value => value?["id"]?.GetValue<string>() == JsonContract.String(request, "effectId"));
                        if (definition is not null)
                            definitions!.Remove(definition);
                        Write("library.json", state);
                        return Summary(state);
                    }
                case "asset-write":
                    {
                        var bytes = InputBytes();
                        var mime = ImageProbe.Mime(bytes);
                        if (bytes.LongLength > MediaLimits.Bytes(mime))
                            throw new InvalidDataException("미디어 파일 크기 제한을 초과했습니다.");
                        ImageProbe.Validate("assets/image" + ImageProbe.Extension(mime), bytes);
                        await decode(bytes, mime);
                        var hash = StoreAsset(bytes);
                        return new JsonObject { ["hash"] = hash, ["mime"] = mime, ["extension"] = ImageProbe.Extension(mime) };
                    }
                case "runtime-locale":
                    var locale = JsonContract.String(request, "locale");
                    if (locale is not ("ko" or "en" or "ja" or "zh-CN"))
                        throw new InvalidDataException("지원 언어 설정 오류");
                    Locale = locale;
                    return new JsonObject { ["locale"] = Locale };
                case "runtime-settings-read":
                    return RuntimeSettingsDocument();
                case "runtime-update-check":
                    return UpdateDocument(CheckUpdate is null ? new(UpdateState.Unavailable) : await CheckUpdate(true));
                case "runtime-update-apply":
                    return UpdateDocument(ApplyUpdate is null ? new(UpdateState.Unavailable) : await ApplyUpdate());
                case "runtime-settings-write":
                    var settings = request["settings"]?.AsObject() ?? throw new InvalidDataException("실행 설정이 필요합니다.");
                    JsonContract.Fields(settings, "launchWithCodex", "exitWithCodex", "automaticUpdates", "startAtSignIn", "assetStoragePath", "maxConnectedWindows", "maxPlayingWindows", "hideStartGreeting");
                    var before = Preferences.Read();
                    var preferences = new RuntimePreferences(settings["launchWithCodex"]!.GetValue<bool>(), settings["exitWithCodex"]!.GetValue<bool>(), settings["automaticUpdates"]!.GetValue<bool>(), settings["startAtSignIn"]?.GetValue<bool>() ?? before.StartAtSignIn,
                        settings.ContainsKey("assetStoragePath") ? settings["assetStoragePath"]?.GetValue<string>() : before.AssetStoragePath,
                        settings.ContainsKey("maxConnectedWindows") ? settings["maxConnectedWindows"]!.GetValue<int>() : before.MaxConnectedWindows,
                        settings.ContainsKey("maxPlayingWindows") ? settings["maxPlayingWindows"]!.GetValue<int>() : before.MaxPlayingWindows,
                        settings.ContainsKey("hideStartGreeting") ? settings["hideStartGreeting"]!.GetValue<bool>() : before.HideStartGreeting);
                    preferences.ValidateWindowLimits();
                    preferences = preferences with { AssetStoragePath = assetStorage.Normalize(preferences.AssetStoragePath) };
                    var startupChanged = before.StartAtSignIn != preferences.StartAtSignIn;
                    if (startupChanged && SetStartup is null) throw new TrayActionException("not-installed");
                    if (startupChanged) SetStartup!(preferences.StartAtSignIn);
                    AssetStorageStatus storageStatus;
                    try { storageStatus = await Task.Run(() => assetStorage.Change(before, preferences)); }
                    catch { if (startupChanged) SetStartup!(before.StartAtSignIn); throw; }
                    var settingsResult = PreferenceDocument(preferences);
                    settingsResult["assetStorage"] = storageStatus.Document();
                    return settingsResult;
                case "motion-policy":
                    var policy = JsonContract.String(request, "policy");
                    if (policy is not ("system" or "allow" or "off"))
                        throw new InvalidDataException("움직임 정책 오류");
                    state["motionPolicy"] = policy;
                    Write("library.json", state);
                    return Summary(state);
                case "list":
                    return Summary(state);
                case "read":
                    {
                        var e = Entry();
                        return Revision(e, request["revision"]?.GetValue<int>() ?? e["revision"]!.GetValue<int>());
                    }
                case "import":
                    {
                        var bytes = InputBytes();
                        var package = Package.Read(bytes);
                        foreach (var asset in package.Files.Where(p => p.Key.StartsWith("assets/", StringComparison.Ordinal) || p.Key.StartsWith("preview/", StringComparison.Ordinal)))
                        {
                            await decode(asset.Value, ImageProbe.Mime(asset.Value));
                        }
                        var doc = Document(package);
                        await validate(doc);
                        var id = JsonContract.String(package.Manifest, "id");
                        if (themes[id] is JsonObject existing)
                        {
                            if (existing["packageHash"]?.GetValue<string>() == package.Hash)
                                return new JsonObject { ["duplicate"] = true, ["id"] = id };
                            throw new InvalidDataException("같은 테마 ID의 다른 내용입니다. 복제본으로 가져와 주세요.");
                        }
                        foreach (var asset in package.Files.Where(p => p.Key.StartsWith("assets/", StringComparison.Ordinal) || p.Key.StartsWith("preview/", StringComparison.Ordinal)))
                            StoreAsset(asset.Value);
                        var key = Guid.NewGuid().ToString("N");
                        var e = new JsonObject { ["key"] = key, ["name"] = package.Manifest["name"]!.DeepClone(), ["revision"] = 1, ["packageHash"] = package.Hash };
                        Write($"revision-{key}-1.json", doc);
                        themes[id] = e;
                        Write("library.json", state);
                        return Summary(state);
                    }
                case "seed":
                    {
                        if (state["seedVersion"]?.GetValue<int>() == 3)
                            return Summary(state);
                        var documents = request["documents"]?.AsArray() ?? throw new InvalidDataException("기본 테마 문서가 필요합니다.");
                        if (documents.Count is < 1 or > 8)
                            throw new InvalidDataException("기본 테마 개수 오류");
                        foreach (var node in documents)
                        {
                            var document = node?.AsObject() ?? throw new InvalidDataException("기본 테마 문서 오류");
                            await validate(document);
                            ValidateStoredAssets(document);
                            if (!JsonContract.String(document["manifest"], "id").StartsWith("builtin.", StringComparison.Ordinal))
                                throw new InvalidDataException("기본 테마 ID 오류");
                        }
                        foreach (var node in documents)
                        {
                            var document = node!.AsObject();
                            var id = JsonContract.String(document["manifest"], "id");
                            if (themes[id] is JsonObject existing)
                            {
                                var legacy = request["legacyDocuments"]?.AsArray().FirstOrDefault(candidate => candidate?["manifest"]?["id"]?.GetValue<string>() == id);
                                var revision = existing["revision"]!.GetValue<int>();
                                if (legacy is null || !JsonNode.DeepEquals(Revision(existing, revision), legacy))
                                    continue;
                                Write($"revision-{existing["key"]}-{revision + 1}.json", document);
                                existing["revision"] = revision + 1;
                                continue;
                            }
                            var key = Guid.NewGuid().ToString("N");
                            Write($"revision-{key}-1.json", document);
                            themes[id] = new JsonObject { ["key"] = key, ["name"] = document["manifest"]!["name"]!.DeepClone(), ["revision"] = 1 };
                        }
                        state["seedVersion"] = 3;
                        Write("library.json", state);
                        return Summary(state);
                    }
                case "save":
                case "create":
                    {
                        var doc = request["document"]?.AsObject() ?? throw new InvalidDataException("테마 문서가 필요합니다.");
                        await validate(doc);
                        ValidateStoredAssets(doc);
                        var id = JsonContract.String(doc["manifest"], "id");
                        JsonObject e;
                        int rev;
                        if (op == "create")
                        {
                            if (themes.ContainsKey(id))
                                throw new InvalidDataException("이미 존재하는 테마 ID입니다.");
                            e = new JsonObject { ["key"] = Guid.NewGuid().ToString("N"), ["name"] = doc["manifest"]!["name"]!.DeepClone(), ["revision"] = 0 };
                            rev = 1;
                        }
                        else
                        {
                            e = themes[id]?.AsObject() ?? throw new InvalidDataException("테마를 찾지 못했습니다.");
                            if (request["baseRevision"]?.GetValue<int>() != e["revision"]!.GetValue<int>())
                                throw new InvalidDataException("다른 창에서 저장했습니다. 새 리비전을 읽거나 복제본을 저장하세요.");
                            rev = e["revision"]!.GetValue<int>() + 1;
                        }
                        Write($"revision-{e["key"]}-{rev}.json", doc);
                        e["revision"] = rev;
                        e["name"] = doc["manifest"]!["name"]!.DeepClone();
                        themes[id] = e;
                        Write("library.json", state);
                        return new JsonObject { ["revision"] = rev, ["id"] = id };
                    }
                case "draft":
                    Write("draft.json", request);
                    return new JsonObject { ["saved"] = true };
                case "draft-read":
                    return File.Exists(FilePath("draft.json")) ? JsonContract.Read(File.ReadAllBytes(FilePath("draft.json"))) : new JsonObject();
                case "draft-clear":
                    File.Delete(FilePath("draft.json"));
                    return new JsonObject();
                case "apply":
                    {
                        var previous = Summary(state);
                        var e = Entry();
                        var rev = request["revision"]?.GetValue<int>() ?? e["revision"]!.GetValue<int>();
                        var doc = Revision(e, rev);
                        await validate(doc);
                        ValidateStoredAssets(doc);
                        var profile = request["profile"]?.GetValue<string>() ?? JsonContract.String(doc["manifest"], "defaultProfile");
                        if (!doc["theme"]!["profiles"]!.AsArray().Any(p => p?["id"]?.GetValue<string>() == profile))
                            throw new InvalidDataException("선택한 테마 구성을 찾지 못했습니다.");
                        var scope = Scope(request);
                        state["bindings"]![scope] = new JsonObject { ["id"] = Id(), ["revision"] = rev, ["profile"] = profile };
                        state["enabled"] = true;
                        if (applyPlan is not null)
                            await applyPlan(Summary(state), previous);
                        try
                        {
                            Write("library.json", state);
                        }
                        catch { if (applyPlan is not null) await applyPlan(previous, Summary(state)); throw; }
                        return Summary(state);
                    }
                case "inherit":
                    state["bindings"]!.AsObject().Remove(Scope(request));
                    Write("library.json", state);
                    return Summary(state);
                case "enable":
                case "disable":
                    state["enabled"] = request["op"]!.GetValue<string>() == "enable";
                    Write("library.json", state);
                    return Summary(state);
                case "delete":
                    {
                        var id = Id();
                        var previous = Summary(state);
                        var bindings = state["bindings"]!.AsObject();
                        var associated = bindings.Where(b => b.Value?["id"]?.GetValue<string>() == id).Select(b => b.Key).ToArray();
                        if (associated.Length > 0 && request["releaseBindings"]?.GetValue<bool>() != true)
                            throw new InvalidDataException("적용 중인 테마입니다. 먼저 상속 또는 기본 화면으로 복원하세요.");
                        foreach (var scope in associated)
                            bindings.Remove(scope);
                        themes.Remove(id);
                        ThemeOrganization.DeleteTheme(state, id);
                        if (applyPlan is not null)
                            await applyPlan(Summary(state), previous);
                        Write("library.json", state);
                        return Summary(state);
                    }
                case "export":
                    {
                        var e = Entry();
                        var doc = Revision(e, request["revision"]?.GetValue<int>() ?? e["revision"]!.GetValue<int>());
                        await validate(doc);
                        var assets = doc["assets"]!.AsObject().ToDictionary(p => p.Key, p => ReadAsset(p.Value!.GetValue<string>()));
                        var bytes = Package.Export(doc["manifest"]!.AsObject(), doc["theme"]!.AsObject(), assets);
                        if (request["chunked"]?.GetValue<bool>() == true)
                        {
                            var exportChunkBytes = request["largeChunks"]?.GetValue<bool>() == true ? TransferStore.LargeChunkBytes : TransferStore.ChunkBytes;
                            return new JsonObject { ["token"] = transfers.Stage(bytes, exportChunkBytes), ["length"] = bytes.Length, ["chunkBytes"] = exportChunkBytes };
                        }
                        return new JsonObject { ["data"] = Convert.ToBase64String(bytes) };
                    }
                default:
                    throw new InvalidDataException("지원하지 않는 요청입니다.");
            }
        }
        finally { gate.Release(); }
    }
    private static string Scope(JsonObject request)
    {
        var kind = JsonContract.String(request, "scope");
        if (kind == "global")
            return kind;
        if (kind is not "project" and not "thread")
            throw new InvalidDataException("적용 범위 오류");
        var id = JsonContract.String(request, "contextId");
        if (id.Length is < 1 or > 512 || id.Any(char.IsControl))
            throw new InvalidDataException("안정적인 범위 ID를 확인하지 못했습니다.");
        return kind + ":" + id;
    }
    internal static JsonObject PreferenceDocument(RuntimePreferences value) => new() { ["launchWithCodex"] = value.LaunchWithCodex, ["exitWithCodex"] = value.ExitWithCodex, ["automaticUpdates"] = value.AutomaticUpdates, ["startAtSignIn"] = value.StartAtSignIn, ["assetStoragePath"] = value.AssetStoragePath,
        ["maxConnectedWindows"] = value.MaxConnectedWindows, ["maxPlayingWindows"] = value.MaxPlayingWindows, ["hideStartGreeting"] = value.HideStartGreeting };
    private JsonObject RuntimeSettingsDocument()
    {
        var snapshot = Preferences.Read();
        var result = PreferenceDocument(snapshot);
        result["assetStorage"] = assetStorage.Describe(snapshot).Document();
        return result;
    }
    private async Task<JsonNode> HandleBackgroundExport(JsonObject request)
    {
        var operation = JsonContract.String(request, "op");
        var match = System.Text.RegularExpressions.Regex.Match(request["requestId"]?.GetValue<string>() ?? "", "^([a-f0-9]{32}):[0-9]+$");
        if (!match.Success) throw new InvalidDataException("배경 추출 소유자 계약 오류");
        var owner = match.Groups[1].Value;
        if (operation == "background-export-list") return BackgroundExports.List(request["offset"]?.GetValue<int>() ?? 0);
        if (operation == "background-export-limit") { BackgroundExports.SetConcurrency(request["limit"]?.GetValue<int>() ?? 0); return BackgroundExports.List(0); }
        if (operation == "background-export-queue-cancel") { BackgroundExports.CancelListed(JsonContract.String(request, "jobId")); return new JsonObject { ["ok"] = true }; }
        if (operation == "background-export-retry") { BackgroundExports.Retry(owner, JsonContract.String(request, "jobId")); return new JsonObject { ["ok"] = true }; }
        if (operation == "background-export-clear") { BackgroundExports.ClearFinished(); return new JsonObject { ["ok"] = true }; }
        if (operation == "background-export-status") return BackgroundExports.Status(owner, JsonContract.String(request, "jobId"));
        if (operation == "background-export-cancel") return BackgroundExports.Cancel(owner, JsonContract.String(request, "jobId"));
        if (operation == "background-export-converter-pick")
        {
            if (PickBackgroundConverter is null) throw new InvalidDataException("변환기 선택 창을 사용할 수 없습니다.");
            var path = await Task.Run(PickBackgroundConverter);
            if (path is not null) await BackgroundExports.ConfigureConverter(path);
            return new JsonObject { ["converterAvailable"] = BackgroundExports.FindConverter() is not null };
        }
        JsonObject document;
        await gate.WaitAsync();
        try
        {
            var entry = State()["themes"]?[JsonContract.String(request, "id")]?.AsObject() ?? throw new InvalidDataException("테마를 찾지 못했습니다.");
            var revision = request["revision"]?.GetValue<int>() ?? entry["revision"]!.GetValue<int>();
            if (revision < 1 || revision > entry["revision"]!.GetValue<int>()) throw new InvalidDataException("테마 리비전 오류");
            document = JsonContract.Read(File.ReadAllBytes(FilePath($"revision-{entry["key"]}-{revision}.json")));
        }
        finally { gate.Release(); }
        var asset = BackgroundMediaInfo.ResolveAsset(document, request["profile"]?.GetValue<string>())
            ?? throw new InvalidDataException("이 테마 구성에는 추출할 배경이 없습니다.");
        var source = assetStorage.PathForHash(asset.Hash);
        var metadata = await Task.Run(() => MediaMetadata.Read(source));
        if (operation == "background-export-info") return new JsonObject { ["kind"] = metadata.Kind,
            ["mime"] = metadata.Mime, ["durationSeconds"] = metadata.DurationSeconds,
            ["originalFormat"] = BackgroundExport.Extension("original", metadata.Mime),
            ["converterAvailable"] = BackgroundExports.FindConverter() is not null };
        var options = BackgroundExport.Options.Read(request, metadata);
        if (BackgroundExports.Existing(owner, source, options) is string existing)
            return new JsonObject { ["jobId"] = existing, ["duplicate"] = true };
        if (options.Format != "original" && BackgroundExports.FindConverter() is null)
            throw new InvalidDataException("배경 변환에 사용할 FFmpeg를 먼저 선택해 주세요.");
        if (PickBackgroundExportPath is null) throw new InvalidDataException("배경 저장 창을 사용할 수 없습니다.");
        var extension = BackgroundExport.Extension(options.Format, metadata.Mime);
        var title = document["manifest"]?["name"]?.GetValue<string>() ?? "CoSkin";
        var destination = await Task.Run(() => PickBackgroundExportPath(ExportFilename(title, "background", extension), extension));
        if (destination is null) return new JsonObject { ["canceled"] = true };
        return new JsonObject { ["jobId"] = BackgroundExports.Start(owner, source, metadata, options, destination) };
    }
    private static string ExportFilename(string title, string fallback, string extension)
    {
        var name = string.Concat(title.Take(140).Select(character => Path.GetInvalidFileNameChars().Contains(character) ? '_' : character)).Trim(' ', '.');
        return (name.Length == 0 ? fallback : name) + "." + extension;
    }
    private async Task<JsonNode> HandleThemeExport(JsonObject request, Func<JsonObject, Task> validate)
    {
        var picker = PickThemeExportPath ?? throw new InvalidDataException("테마 저장 창을 사용할 수 없습니다.");
        JsonObject document;
        await gate.WaitAsync();
        try
        {
            var entry = State()["themes"]?[JsonContract.String(request, "id")]?.AsObject() ?? throw new InvalidDataException("테마를 찾지 못했습니다.");
            var revision = request["revision"]?.GetValue<int>() ?? entry["revision"]!.GetValue<int>();
            if (revision < 1 || revision > entry["revision"]!.GetValue<int>()) throw new InvalidDataException("테마 리비전 오류");
            document = JsonContract.Read(File.ReadAllBytes(FilePath($"revision-{entry["key"]}-{revision}.json")));
        }
        finally { gate.Release(); }
        await validate(document);
        var filename = ExportFilename(document["manifest"]?["name"]?.GetValue<string>() ?? "CoSkin", "theme", "coskin");
        var selected = await Task.Run(() => picker(filename));
        if (selected is null) return new JsonObject { ["canceled"] = true };
        var destination = Path.GetFullPath(selected);
        if (!Path.IsPathFullyQualified(selected) || !string.Equals(Path.GetExtension(destination), ".coskin", StringComparison.OrdinalIgnoreCase) ||
            destination.StartsWith(Path.TrimEndingDirectorySeparator(root) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) ||
            !Directory.Exists(Path.GetDirectoryName(destination)))
            throw new InvalidDataException("테마 내보내기 저장 위치를 확인해 주세요.");
        void CheckDestination()
        {
            for (var path = destination; path is not null; path = Path.GetDirectoryName(path))
                if ((Directory.Exists(path) || File.Exists(path)) && File.GetAttributes(path).HasFlag(FileAttributes.ReparsePoint))
                    throw new InvalidDataException("테마 저장 경로에 파일 연결을 사용할 수 없습니다.");
        }
        CheckDestination();
        var bytes = await Task.Run(() => {
            var assets = document["assets"]!.AsObject().ToDictionary(p => p.Key, p => ReadAsset(p.Value!.GetValue<string>()));
            return Package.Export(document["manifest"]!.AsObject(), document["theme"]!.AsObject(), assets);
        });
        var temporary = Path.Combine(Path.GetDirectoryName(destination)!, ".coskin-export-" + Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            await using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1024 * 1024, true))
            {
                await output.WriteAsync(bytes);
                output.Flush(true);
            }
            CheckDestination();
            File.Move(temporary, destination, true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
        return new JsonObject { ["saved"] = true, ["path"] = destination };
    }
    internal static JsonObject UpdateDocument(UpdateResult value) => new() { ["status"] = value.State.ToString().ToLowerInvariant(), ["version"] = value.Update?.Version.ToString() };
    internal async Task<JsonObject> TrayState()
    {
        await gate.WaitAsync();
        try
        {
            var state = State();
            return new JsonObject { ["themes"] = state["themes"]!.DeepClone(), ["bindings"] = state["bindings"]!.DeepClone(), ["enabled"] = state["enabled"]!.DeepClone() };
        }
        finally { gate.Release(); }
    }
    private JsonObject Summary(JsonObject state)
    {
        var result = (JsonObject)state.DeepClone();
        var documents = new JsonObject();
        foreach (var b in state["bindings"]!.AsObject())
        {
            var e = state["themes"]![b.Value!["id"]!.GetValue<string>()]!.AsObject();
            documents[b.Key] = JsonContract.Read(File.ReadAllBytes(FilePath($"revision-{e["key"]}-{b.Value["revision"]}.json")));
        }
        result["documents"] = documents;
        result["runtimeSettingsAvailable"] = true;
        result["startupSettingsAvailable"] = SetStartup is not null;
        result["assetStoragePickerAvailable"] = PickAssetStoragePath is not null;
        result["backgroundExportAvailable"] = PickBackgroundExportPath is not null;
        result["themeExportAvailable"] = PickThemeExportPath is not null;
        return result;
    }
    private static JsonObject Document(ThemePackage p)
    {
        var assets = new JsonObject();
        foreach (var pair in p.Files.Where(p => p.Key.StartsWith("assets/", StringComparison.Ordinal) || p.Key.StartsWith("preview/", StringComparison.Ordinal)))
            assets[pair.Key] = Package.Hash(pair.Value);
        return new JsonObject { ["manifest"] = p.Manifest.DeepClone(), ["theme"] = p.Theme.DeepClone(), ["assets"] = assets };
    }
    private void ValidateStoredAssets(JsonObject document)
    {
        var assets = document["assets"]?.AsObject() ?? throw new InvalidDataException("자산 목록이 필요합니다.");
        long totalBytes = 0;
        foreach (var asset in assets)
        {
            var hash = asset.Value?.GetValue<string>() ?? throw new InvalidDataException("자산 해시가 필요합니다.");
            var bytes = ReadAsset(hash);
            totalBytes += bytes.Length;
            if (bytes.LongLength > MediaLimits.Bytes(ImageProbe.Mime(bytes)) || totalBytes > Package.MaxExpanded)
                throw new InvalidDataException("테마 자산의 총 용량 제한을 초과했습니다.");
            ImageProbe.Validate(asset.Key, bytes);
        }
    }
    private string StoreAsset(byte[] bytes)
    {
        var hash = Package.Hash(bytes);
        var directory = assetStorage.CurrentPath;
        Directory.CreateDirectory(directory);
        var destination = assetStorage.PathForHash(hash);
        if (File.Exists(destination))
        {
            using var existing = new FileStream(destination, FileMode.Open, FileAccess.Read, FileShare.Read);
            if (existing.Length != bytes.LongLength || Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(existing)).ToLowerInvariant() != hash)
                throw new InvalidDataException("같은 자산 주소의 기존 파일이 손상되었습니다. 원본을 보존했습니다.");
        }
        if (!File.Exists(destination))
        {
            var temporary = destination + "." + Guid.NewGuid().ToString("N") + ".tmp";
            File.WriteAllBytes(temporary, bytes);
            File.Move(temporary, destination, false);
        }
        return hash;
    }
    private byte[] ReadAsset(string hash)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(hash, "^[a-f0-9]{64}$"))
            throw new InvalidDataException("자산 해시 오류");
        var path = assetStorage.PathForHash(hash);
        if (new FileInfo(path).Length > MediaLimits.VideoBytes)
            throw new InvalidDataException("미디어 파일 크기 제한을 초과했습니다.");
        var bytes = File.ReadAllBytes(path);
        if (Package.Hash(bytes) != hash)
            throw new InvalidDataException("내부 자산이 손상되었습니다.");
        return bytes;
    }
}






using System.Text.Json.Nodes;
namespace CoSkin;

internal sealed class Library : IDisposable
{
    private readonly TransferStore transfers;
    internal Func<bool, Task<UpdateResult>>? CheckUpdate { get; set; }
    internal Func<Task<UpdateResult>>? ApplyUpdate { get; set; }
    internal Action<bool>? SetStartup { get; set; }
    internal RuntimePreferenceStore Preferences
    {
        get;
    }
    internal event Action<JsonObject>? StateChanged;
    internal string Locale { get; private set; } = UiLocale.Normalize(System.Globalization.CultureInfo.CurrentUICulture.Name);
    internal string StageTransfer(byte[] bytes) => transfers.Stage(bytes);
    internal void CancelTransfer(string token) => transfers.Cancel(token);
    public void Dispose()
    {
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
    }
    private string FilePath(string name) => Path.Combine(root, name);
    private JsonObject State() => File.Exists(FilePath("library.json")) ? JsonContract.Read(File.ReadAllBytes(FilePath("library.json"))) : new JsonObject { ["themes"] = new JsonObject(), ["bindings"] = new JsonObject(), ["enabled"] = true };
    private void Write(string name, JsonObject value)
    {
        var dest = FilePath(name);
        var tmp = dest + "." + Guid.NewGuid().ToString("N") + ".tmp";
        File.WriteAllText(tmp, JsonContract.Serialize(value));
        File.Move(tmp, dest, true);
        if (name == "library.json")
            StateChanged?.Invoke(new JsonObject { ["themes"] = value["themes"]!.DeepClone(), ["bindings"] = value["bindings"]!.DeepClone(), ["enabled"] = value["enabled"]!.DeepClone() });
    }
    internal async Task<JsonNode> Handle(JsonObject request, Func<JsonObject, Task> validate, Func<byte[], string, Task> decode, Func<JsonObject, JsonObject, Task>? applyPlan = null)
    {
        switch (request["op"]?.GetValue<string>())
        {
            case "transfer-begin":
                return new JsonObject { ["token"] = transfers.Begin(request["length"]!.GetValue<long>()) };
            case "transfer-append":
                var encoded = JsonContract.String(request, "data");
                if (encoded.Length > TransferStore.ChunkBytes * 4 / 3)
                    throw new InvalidDataException("전송 조각 크기 제한");
                transfers.Append(JsonContract.String(request, "token"), request["offset"]!.GetValue<long>(), Convert.FromBase64String(encoded));
                return new JsonObject { ["ok"] = true };
            case "transfer-read":
                return new JsonObject { ["data"] = Convert.ToBase64String(transfers.Read(JsonContract.String(request, "token"), request["offset"]!.GetValue<long>())) };
            case "transfer-cancel":
                transfers.Cancel(JsonContract.String(request, "token"));
                return new JsonObject { ["ok"] = true };
        }
        byte[] InputBytes() => request["token"] is not null ? transfers.Consume(JsonContract.String(request, "token")) : Convert.FromBase64String(JsonContract.String(request, "data"));
        if (request["op"]?.GetValue<string>() == "asset-read")
        {
            var data = ReadAsset(JsonContract.String(request, "hash"));
            return new JsonObject { ["token"] = transfers.Stage(data), ["length"] = data.Length, ["mime"] = ImageProbe.Mime(data) };
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
                        if (bytes.Length > 25 * 1024 * 1024)
                            throw new InvalidDataException("이미지 크기 제한을 초과했습니다.");
                        var mime = ImageProbe.Mime(bytes);
                        ImageProbe.Validate("assets/image" + ImageProbe.Extension(mime), bytes);
                        await decode(bytes, mime);
                        var hash = StoreAsset(bytes);
                        return new JsonObject { ["hash"] = hash, ["mime"] = mime, ["extension"] = ImageProbe.Extension(mime) };
                    }
                case "asset-read":
                    {
                        var bytes = ReadAsset(JsonContract.String(request, "hash"));
                        return new JsonObject { ["data"] = Convert.ToBase64String(bytes), ["mime"] = ImageProbe.Mime(bytes) };
                    }
                case "runtime-locale":
                    var locale = JsonContract.String(request, "locale");
                    if (locale is not ("ko" or "en" or "ja" or "zh-CN"))
                        throw new InvalidDataException("지원 언어 설정 오류");
                    Locale = locale;
                    return new JsonObject { ["locale"] = Locale };
                case "runtime-settings-read":
                    return PreferenceDocument(Preferences.Read());
                case "runtime-update-check":
                    return UpdateDocument(CheckUpdate is null ? new(UpdateState.Unavailable) : await CheckUpdate(true));
                case "runtime-update-apply":
                    return UpdateDocument(ApplyUpdate is null ? new(UpdateState.Unavailable) : await ApplyUpdate());
                case "runtime-settings-write":
                    var settings = request["settings"]?.AsObject() ?? throw new InvalidDataException("실행 설정이 필요합니다.");
                    JsonContract.Fields(settings, "launchWithCodex", "exitWithCodex", "automaticUpdates", "startAtSignIn");
                    var before = Preferences.Read();
                    var preferences = new RuntimePreferences(settings["launchWithCodex"]!.GetValue<bool>(), settings["exitWithCodex"]!.GetValue<bool>(), settings["automaticUpdates"]!.GetValue<bool>(), settings["startAtSignIn"]?.GetValue<bool>() ?? before.StartAtSignIn);
                    var startupChanged = before.StartAtSignIn != preferences.StartAtSignIn;
                    if (startupChanged && SetStartup is null) throw new TrayActionException("not-installed");
                    if (startupChanged) SetStartup!(preferences.StartAtSignIn);
                    try { Preferences.Write(preferences); }
                    catch { if (startupChanged) SetStartup!(before.StartAtSignIn); throw; }
                    return PreferenceDocument(preferences);
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
                        return request["chunked"]?.GetValue<bool>() == true ? new JsonObject { ["token"] = transfers.Stage(bytes), ["length"] = bytes.Length } : new JsonObject { ["data"] = Convert.ToBase64String(bytes) };
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
    internal static JsonObject PreferenceDocument(RuntimePreferences value) => new() { ["launchWithCodex"] = value.LaunchWithCodex, ["exitWithCodex"] = value.ExitWithCodex, ["automaticUpdates"] = value.AutomaticUpdates, ["startAtSignIn"] = value.StartAtSignIn };
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
            if (totalBytes > 250L * 1024 * 1024)
                throw new InvalidDataException("테마 자산의 총 용량 제한을 초과했습니다.");
            ImageProbe.Validate(asset.Key, bytes);
        }
    }
    private string StoreAsset(byte[] bytes)
    {
        var hash = Package.Hash(bytes);
        var directory = FilePath("assets");
        Directory.CreateDirectory(directory);
        var destination = Path.Combine(directory, hash + ".bin");
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
        var bytes = File.ReadAllBytes(Path.Combine(FilePath("assets"), hash + ".bin"));
        if (Package.Hash(bytes) != hash)
            throw new InvalidDataException("내부 자산이 손상되었습니다.");
        return bytes;
    }
}






using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using CoSkin;

var scratch = Path.Combine(Path.GetTempPath(), "coskin-asset-storage-tests-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(scratch);
var checks = 0;
void Check(bool value, string message)
{
    if (!value) throw new Exception(message);
    checks++;
}
void Reject(Action action, string message)
{
    try { action(); } catch (Exception error) when (error is InvalidDataException or IOException or UnauthorizedAccessException) { checks++; return; }
    throw new Exception("Unexpected success: " + message);
}
string Hash(byte[] data) => Convert.ToHexString(SHA256.HashData(data)).ToLowerInvariant();
(RuntimePreferenceStore Preferences, AssetStorageLocation Storage, string Root) Fixture(string name)
{
    var root = Path.Combine(scratch, name);
    var preferences = new RuntimePreferenceStore(root);
    return (preferences, new AssetStorageLocation(root, preferences), root);
}
string Asset(AssetStorageLocation storage, string value)
{
    var bytes = Encoding.UTF8.GetBytes(value); var hash = Hash(bytes);
    Directory.CreateDirectory(storage.CurrentPath); File.WriteAllBytes(storage.PathForHash(hash), bytes);
    return hash;
}
try
{
    var legacy = Fixture("legacy");
    File.WriteAllText(Path.Combine(legacy.Root, "runtime-preferences.json"), "{\"formatVersion\":1,\"launchWithCodex\":false,\"exitWithCodex\":true}");
    Check(legacy.Preferences.Read() == new RuntimePreferences(false, true), "legacy settings preserve defaults and the existing assets path");
    Check(legacy.Storage.CurrentPath == Path.Combine(legacy.Root, "assets"), "default remains baseStore/assets");
    Check(legacy.Storage.Describe().UsedBytes == 0, "empty default storage is readable before first import");

    var success = Fixture("success");
    var first = Asset(success.Storage, "first preserved image"); var second = Asset(success.Storage, "second preserved video");
    File.WriteAllText(Path.Combine(success.Storage.CurrentPath, "unrelated-original.txt"), "keep original");
    File.WriteAllText(Path.Combine(success.Root, "library.json"), "unchanged library");
    File.WriteAllText(Path.Combine(success.Root, "revision-test-1.json"), "unchanged revision");
    success.Preferences.Write(new RuntimePreferences(false, true, true));
    var before = success.Preferences.Read(); var original = success.Storage.CurrentPath;
    var destination = Path.Combine(scratch, "shared-themes"); Directory.CreateDirectory(destination);
    File.WriteAllText(Path.Combine(destination, "unrelated-user-file.txt"), "keep destination");
    File.Copy(Path.Combine(original, first + ".bin"), Path.Combine(destination, first.ToUpperInvariant() + ".BIN"));
    var status = success.Storage.Change(before, before with { AssetStoragePath = destination });
    Check(status.CurrentPath == destination && status.AssetCount == 2 && status.UsedBytes > 0, "shared path and usage include both verified assets");
    Check(success.Storage.Describe(before).CurrentPath == original, "read status can use one consistent preference snapshot across a migration commit");
    Check(success.Preferences.Read() == before with { AssetStoragePath = destination }, "path commit preserves lifecycle settings");
    Check(new RuntimePreferenceStore(success.Root).Read().AssetStoragePath == destination, "custom path persists across restart");
    foreach (var hash in new[] { first, second })
    {
        Check(Hash(File.ReadAllBytes(Path.Combine(destination, hash + ".bin"))) == hash, "every copy matches its address");
        Check(Hash(File.ReadAllBytes(Path.Combine(original, hash + ".bin"))) == hash, "original assets remain intact");
        Check(success.Storage.PathForHash(hash) == Path.Combine(destination, hash + ".bin"), "future asset lookup uses the one global path");
    }
    Check(File.ReadAllText(Path.Combine(destination, "unrelated-user-file.txt")) == "keep destination", "foreign destination files are untouched");
    Check(File.ReadAllText(Path.Combine(original, "unrelated-original.txt")) == "keep original", "foreign original files are untouched");
    Check(File.ReadAllText(Path.Combine(success.Root, "library.json")) == "unchanged library" && File.ReadAllText(Path.Combine(success.Root, "revision-test-1.json")) == "unchanged revision", "metadata stays in the base store");
    Reject(() => success.Preferences.Write(before), "direct writes cannot bypass verified migration");
    var custom = success.Preferences.Read();
    success.Preferences.Write(custom with { ExitWithCodex = false });
    Check(success.Preferences.Read().AssetStoragePath == destination, "tray/lifecycle writes preserve the storage pointer");
    custom = success.Preferences.Read();
    success.Storage.Change(custom, custom with { AssetStoragePath = null });
    Check(success.Storage.CurrentPath == original && success.Preferences.Read().AssetStoragePath is null, "return to the default directory is verified");
    Check(File.Exists(Path.Combine(destination, second + ".bin")), "return to default also retains the previous custom copies");

    var collision = Fixture("collision");
    var hashes = new[] { Asset(collision.Storage, "a valid source"), Asset(collision.Storage, "another valid source") }.Order(StringComparer.Ordinal).ToArray();
    collision.Preferences.Write(new()); before = collision.Preferences.Read();
    var preferenceFile = Path.Combine(collision.Root, "runtime-preferences.json"); var preferenceBytes = File.ReadAllBytes(preferenceFile);
    var conflict = Path.Combine(scratch, "conflict-target"); Directory.CreateDirectory(conflict);
    var conflictingFile = Path.Combine(conflict, hashes[1] + ".bin"); File.WriteAllText(conflictingFile, "do not overwrite collision");
    Reject(() => collision.Storage.Change(before, before with { AssetStoragePath = conflict }), "different bytes at the same address block migration");
    Check(File.ReadAllBytes(preferenceFile).SequenceEqual(preferenceBytes) && collision.Storage.CurrentPath == collision.Storage.DefaultPath, "partial copy failure preserves the exact original preferences and path");
    Check(File.ReadAllText(conflictingFile) == "do not overwrite collision", "collision bytes are never overwritten");
    Check(Hash(File.ReadAllBytes(Path.Combine(conflict, hashes[0] + ".bin"))) == hashes[0], "completed verified copies are preserved for retry");
    Check(Directory.GetFiles(conflict, "*.tmp").Length == 0, "only owned temporary copies are cleaned");
    foreach (var hash in hashes) Check(File.Exists(collision.Storage.PathForHash(hash)), "all original files survive partial failure");

    var corrupt = Fixture("corrupt"); var corruptHash = Asset(corrupt.Storage, "expected media");
    var corruptPath = corrupt.Storage.PathForHash(corruptHash); File.WriteAllText(corruptPath, "bad source bytes");
    before = corrupt.Preferences.Read();
    Reject(() => corrupt.Storage.Change(before, before with { AssetStoragePath = Path.Combine(scratch, "corrupt-target") }), "corrupted source is rejected");
    Check(corrupt.Preferences.Read() == before && File.ReadAllText(corruptPath) == "bad source bytes", "corrupt source and original preferences remain unchanged");

    var busy = Fixture("blocked-commit"); var busyHash = Asset(busy.Storage, "good bytes before atomic commit");
    busy.Preferences.Write(new()); before = busy.Preferences.Read(); preferenceFile = Path.Combine(busy.Root, "runtime-preferences.json"); preferenceBytes = File.ReadAllBytes(preferenceFile);
    var copied = Path.Combine(scratch, "blocked-commit-target");
    using (var held = new FileStream(preferenceFile, FileMode.Open, FileAccess.Read, FileShare.Read))
        Reject(() => busy.Storage.Change(before, before with { AssetStoragePath = copied }), "failed preference replacement retains the old pointer");
    Check(File.ReadAllBytes(preferenceFile).SequenceEqual(preferenceBytes), "atomic preference failure leaves exact original bytes");
    Check(Hash(File.ReadAllBytes(Path.Combine(copied, busyHash + ".bin"))) == busyHash && File.Exists(busy.Storage.PathForHash(busyHash)), "successful copies and source are retained when commit fails");
    Check(Directory.GetFiles(busy.Root, "*.tmp").Length == 0, "failed preference write cleans only its temporary file");

    var stale = Fixture("stale"); before = stale.Preferences.Read(); stale.Preferences.Write(before with { AutomaticUpdates = true });
    Reject(() => stale.Storage.Change(before, before with { AssetStoragePath = Path.Combine(scratch, "stale-target") }), "stale settings cannot overwrite a concurrent edit");
    Check(stale.Preferences.Read().AutomaticUpdates && !Directory.Exists(Path.Combine(scratch, "stale-target")), "stale request does not copy or change the path");
    Reject(() => stale.Preferences.CommitAssetStorage(before, before with { AssetStoragePath = Path.Combine(scratch, "stale-target") }), "CAS catches a late preference conflict too");

    var pathTests = Fixture("paths");
    foreach (var path in new[] { "relative-folder", "C:relative", "C:\\media:stream", "\\\\.\\pipe\\CoSkin", "C:\\bad\npath", new string('x', 2049) })
        Reject(() => pathTests.Storage.Normalize(path), "invalid or unsafe path");
    var notDirectory = Path.Combine(scratch, "ordinary-file.txt"); File.WriteAllText(notDirectory, "owned test file");
    Reject(() => pathTests.Storage.Normalize(notDirectory), "existing file cannot become a media directory");
    Reject(() => pathTests.Storage.PathForHash("../runtime-preferences"), "asset addresses cannot escape the chosen directory");
    Check(pathTests.Storage.Normalize(pathTests.Storage.DefaultPath + Path.DirectorySeparatorChar) is null, "default path aliases normalize to the default pointer");
    Check(pathTests.Storage.Normalize(" ") is null, "empty input uses the default directory");

    before = pathTests.Preferences.Read(); var pickedPath = Path.Combine(scratch, "picked-only");
    var read = pathTests.Storage.Handle(new JsonObject { ["op"] = "asset-storage-read" });
    Check(read["currentPath"]!.GetValue<string>() == pathTests.Storage.DefaultPath, "read handler returns the actual global path");
    var pick = pathTests.Storage.Handle(new JsonObject { ["op"] = "asset-storage-pick", ["initialPath"] = null }, initial => { Check(initial == pathTests.Storage.DefaultPath, "picker starts at the resolved directory"); return pickedPath; });
    Check(pick["path"]!.GetValue<string>() == pickedPath && !pick["cancelled"]!.GetValue<bool>(), "picker handler returns a draft selection");
    Check(pathTests.Preferences.Read() == before && !Directory.Exists(pickedPath), "picking neither copies files nor changes preferences");
    var cancelled = pathTests.Storage.Handle(new JsonObject { ["op"] = "asset-storage-pick" }, _ => null);
    Check(cancelled["cancelled"]!.GetValue<bool>() && cancelled["path"] is null, "picker cancellation is non-mutating");
    pathTests.Storage.Handle(new JsonObject { ["op"] = "asset-storage-pick", ["initialPath"] = "unfinished relative input" }, initial => { Check(initial == pathTests.Storage.CurrentPath, "picker recovers from unfinished text input using the current directory"); return null; });
    Reject(() => pathTests.Storage.Handle(new JsonObject { ["op"] = "asset-storage-pick" }, _ => "relative-selection"), "invalid picker output cannot become a selected storage path");
    Reject(() => pathTests.Storage.Handle(new JsonObject { ["op"] = "asset-storage-pick" }), "unavailable native picker reports an error without mutation");
    Reject(() => pathTests.Storage.Handle(new JsonObject { ["op"] = "asset-storage-read", ["path"] = pickedPath }), "read handler rejects unrecognized fields");
    Reject(() => pathTests.Storage.Handle(new JsonObject { ["op"] = "asset-storage-change", ["path"] = pickedPath }), "there is no unverified direct change handler");

    var integration = Fixture("library-handler");
    var libraryFile = Path.Combine(integration.Root, "library.json");
    var revisionFile = Path.Combine(integration.Root, "revision-retained-1.json");
    File.WriteAllText(libraryFile, "{\"themes\":{},\"bindings\":{},\"enabled\":true}");
    File.WriteAllText(revisionFile, "{\"retained\":true}");
    var libraryBytes = File.ReadAllBytes(libraryFile); var revisionBytes = File.ReadAllBytes(revisionFile);
    var png = File.ReadAllBytes(Path.Combine(Environment.CurrentDirectory, "docs/examples/assets/search.png")); var pngHash = Hash(png);
    Directory.CreateDirectory(integration.Storage.DefaultPath);
    File.WriteAllBytes(Path.Combine(integration.Storage.DefaultPath, pngHash + ".bin"), png);
    using (var library = new Library(integration.Root))
    {
        JsonNode Request(JsonObject request) => library.Handle(request, _ => Task.CompletedTask, (_, _) => Task.CompletedTask).GetAwaiter().GetResult();
        var runtime = Request(new JsonObject { ["op"] = "runtime-settings-read" });
        Check(runtime["assetStorage"]!["assetCount"]!.GetValue<int>() == 1, "official runtime read includes real global storage usage");
        var startupCalls = new List<bool>(); library.SetStartup = value => startupCalls.Add(value);
        var movedTo = Path.Combine(scratch, "official-shared-folder");
        var settings = Library.PreferenceDocument(library.Preferences.Read()); settings["assetStoragePath"] = movedTo; settings["startAtSignIn"] = true;
        var moved = Request(new JsonObject { ["op"] = "runtime-settings-write", ["settings"] = settings });
        Check(moved["assetStorage"]!["currentPath"]!.GetValue<string>() == movedTo && library.Preferences.Read().AssetStoragePath == movedTo, "official settings handler commits the verified shared path");
        Check(startupCalls.SequenceEqual(new[] { true }), "combined storage/lifecycle setting calls the startup delegate once");
        Check(File.Exists(Path.Combine(integration.Storage.DefaultPath, pngHash + ".bin")) && Hash(File.ReadAllBytes(Path.Combine(movedTo, pngHash + ".bin"))) == pngHash, "official handler keeps the original asset and exact copy");
        var staged = Request(new JsonObject { ["op"] = "asset-read", ["hash"] = pngHash }); var token = staged["token"]!.GetValue<string>();
        var readChunk = Request(new JsonObject { ["op"] = "transfer-read", ["token"] = token, ["offset"] = 0L });
        Check(Convert.FromBase64String(readChunk["data"]!.GetValue<string>()).SequenceEqual(png), "official asset read and transfer use the selected global folder");
        Request(new JsonObject { ["op"] = "transfer-cancel", ["token"] = token });
        var nextPng = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6bfwAAAAASUVORK5CYII=");
        var uploaded = Request(new JsonObject { ["op"] = "asset-write", ["data"] = Convert.ToBase64String(nextPng) }); var uploadedHash = uploaded["hash"]!.GetValue<string>();
        Check(File.Exists(Path.Combine(movedTo, uploadedHash + ".bin")) && !File.Exists(Path.Combine(integration.Storage.DefaultPath, uploadedHash + ".bin")), "new media writes use the same global folder for every theme");
        var badAsset = Path.Combine(movedTo, uploadedHash + ".bin"); File.WriteAllText(badAsset, "preserve conflicting fixture");
        Reject(() => Request(new JsonObject { ["op"] = "asset-write", ["data"] = Convert.ToBase64String(nextPng) }), "official asset write cannot replace different bytes at an existing hash");
        Check(File.ReadAllText(badAsset) == "preserve conflicting fixture", "official asset collision is not overwritten");
        File.WriteAllBytes(badAsset, nextPng);
        settings = Library.PreferenceDocument(library.Preferences.Read()); settings.Remove("assetStoragePath"); settings["launchWithCodex"] = false;
        Request(new JsonObject { ["op"] = "runtime-settings-write", ["settings"] = settings });
        Check(library.Preferences.Read().AssetStoragePath == movedTo && !library.Preferences.Read().LaunchWithCodex, "legacy lifecycle payload preserves the current storage pointer");
        before = library.Preferences.Read(); preferenceFile = Path.Combine(integration.Root, "runtime-preferences.json"); preferenceBytes = File.ReadAllBytes(preferenceFile);
        var denied = Path.Combine(scratch, "official-collision"); Directory.CreateDirectory(denied); File.WriteAllText(Path.Combine(denied, pngHash + ".bin"), "foreign bytes");
        settings = Library.PreferenceDocument(before); settings["assetStoragePath"] = denied; settings["startAtSignIn"] = false;
        Reject(() => Request(new JsonObject { ["op"] = "runtime-settings-write", ["settings"] = settings }), "official handler rejects a migration collision");
        Check(File.ReadAllBytes(preferenceFile).SequenceEqual(preferenceBytes) && library.Preferences.Read() == before, "official handler failure preserves the exact preferences and path");
        Check(startupCalls.TakeLast(2).SequenceEqual(new[] { false, true }), "combined failure rolls startup back to its previous state");
        Check(File.ReadAllText(Path.Combine(denied, pngHash + ".bin")) == "foreign bytes", "official handler preserves foreign conflicting bytes");
        var draftOnly = Path.Combine(scratch, "official-pick-draft"); library.PickAssetStoragePath = _ => draftOnly;
        var selected = Request(new JsonObject { ["op"] = "asset-storage-pick", ["initialPath"] = movedTo, ["contractVersion"] = 1, ["sessionId"] = "isolated-test", ["requestId"] = "isolated-request" });
        Check(selected["path"]!.GetValue<string>() == draftOnly && !Directory.Exists(draftOnly), "official picker accepts transport fields but changes no files");
        Check(File.ReadAllBytes(preferenceFile).SequenceEqual(preferenceBytes), "official picker does not change preferences");
        Check(Request(new JsonObject { ["op"] = "list" })["assetStoragePickerAvailable"]!.GetValue<bool>(), "official summary exposes picker availability");
        settings = Library.PreferenceDocument(before); settings["themeId"] = "unsupported-per-theme-path";
        Reject(() => Request(new JsonObject { ["op"] = "runtime-settings-write", ["settings"] = settings }), "per-theme storage overrides are not accepted");
        settings = Library.PreferenceDocument(library.Preferences.Read()); settings["assetStoragePath"] = null;
        var restored = Request(new JsonObject { ["op"] = "runtime-settings-write", ["settings"] = settings });
        Check(library.Preferences.Read().AssetStoragePath is null && restored["assetStorage"]!["isDefault"]!.GetValue<bool>(), "official handler returns to the verified default folder");
        Check(Hash(File.ReadAllBytes(Path.Combine(integration.Storage.DefaultPath, uploadedHash + ".bin"))) == uploadedHash && File.Exists(Path.Combine(movedTo, uploadedHash + ".bin")), "default restoration copies later media back and retains the custom copies");
        staged = Request(new JsonObject { ["op"] = "asset-read", ["hash"] = uploadedHash }); token = staged["token"]!.GetValue<string>();
        readChunk = Request(new JsonObject { ["op"] = "transfer-read", ["token"] = token, ["offset"] = 0L });
        Check(Convert.FromBase64String(readChunk["data"]!.GetValue<string>()).SequenceEqual(nextPng), "official asset read works after returning to default");
        Request(new JsonObject { ["op"] = "transfer-cancel", ["token"] = token });
        File.Delete(Path.Combine(integration.Storage.DefaultPath, uploadedHash + ".bin")); // Own temporary fixture only: force a fresh write at the restored location.
        Request(new JsonObject { ["op"] = "asset-write", ["data"] = Convert.ToBase64String(nextPng) });
        Check(File.Exists(Path.Combine(integration.Storage.DefaultPath, uploadedHash + ".bin")), "official asset write uses the restored default folder");
        Check(Request(new JsonObject { ["op"] = "runtime-settings-read" })["assetStorage"]!["currentPath"]!.GetValue<string>() == integration.Storage.DefaultPath, "official runtime read reports the restored location");
        Check(File.ReadAllBytes(libraryFile).SequenceEqual(libraryBytes) && File.ReadAllBytes(revisionFile).SequenceEqual(revisionBytes), "official settings operations preserve all fixture metadata and revisions");
    }

    var link = Path.Combine(scratch, "linked-folder"); var linkTarget = Path.Combine(scratch, "link-target"); Directory.CreateDirectory(linkTarget);
    try
    {
        Directory.CreateSymbolicLink(link, linkTarget);
        Reject(() => pathTests.Storage.Normalize(link), "linked destination is rejected");
    }
    catch (Exception error) when (error is UnauthorizedAccessException or System.ComponentModel.Win32Exception || error is IOException && error.HResult == unchecked((int)0x80070522))
    {
        var command = "New-Item -ItemType Junction -Path '" + link.Replace("'", "''") + "' -Target '" + linkTarget.Replace("'", "''") + "' -ErrorAction Stop | Out-Null";
        var info = new System.Diagnostics.ProcessStartInfo("powershell.exe") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var argument in new[] { "-NoProfile", "-NonInteractive", "-EncodedCommand", Convert.ToBase64String(Encoding.Unicode.GetBytes(command)) }) info.ArgumentList.Add(argument);
        using var process = System.Diagnostics.Process.Start(info) ?? throw new Exception("Could not create the isolated junction test helper.");
        process.WaitForExit();
        if (process.ExitCode != 0) throw new Exception("Could not create the isolated junction fixture: " + process.StandardError.ReadToEnd());
        Reject(() => pathTests.Storage.Normalize(link), "linked destination is rejected without symlink privileges");
    }
    finally
    {
        // Remove only this owned link before recursive fixture cleanup can remove its target.
        if (Directory.Exists(link)) Directory.Delete(link, false);
    }
    Console.WriteLine($"PASS asset storage {checks} checks; only isolated temporary fixtures were modified.");
}
finally
{
    var full = Path.GetFullPath(scratch); var parent = Path.GetFullPath(Path.GetTempPath());
    if (!full.StartsWith(Path.TrimEndingDirectorySeparator(parent) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !Path.GetFileName(full).StartsWith("coskin-asset-storage-tests-", StringComparison.Ordinal))
        throw new Exception("Refusing cleanup outside the isolated test workspace.");
    Directory.Delete(full, true);
}

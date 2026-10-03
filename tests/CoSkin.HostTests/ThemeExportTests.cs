using CoSkin;
using System.Text.Json.Nodes;

internal static class ThemeExportTests
{
    internal static async Task Run(Action<bool, string> check, string scratch)
    {
        var root = Path.Combine(scratch, "theme-native-export");
        var outputRoot = Path.Combine(scratch, "theme-native-export-files");
        Directory.CreateDirectory(root); Directory.CreateDirectory(outputRoot);
        var document = new JsonObject
        {
            ["manifest"] = new JsonObject { ["format"] = "coskin.theme", ["formatVersion"] = 1, ["id"] = "export.native",
                ["name"] = "새 이름: 테마", ["version"] = "1.0.0", ["entry"] = "theme.json", ["defaultProfile"] = "default" },
            ["theme"] = new JsonObject { ["profiles"] = new JsonArray(new JsonObject { ["id"] = "default", ["name"] = "기본", ["rules"] = new JsonArray() }) },
            ["assets"] = new JsonObject()
        };
        var sourceImage = File.ReadAllBytes(Path.Combine(Directory.GetCurrentDirectory(), "docs/examples/assets/search.png"));
        var sourceHash = Package.Hash(sourceImage);
        Directory.CreateDirectory(Path.Combine(root, "assets"));
        var assetPath = Path.Combine(root, "assets", sourceHash + ".bin");
        File.WriteAllBytes(assetPath, sourceImage);
        document["assets"]!["assets/search.png"] = sourceHash;
        var revisionPath = Path.Combine(root, "revision-example-1.json");
        File.WriteAllText(revisionPath, document.ToJsonString());
        File.WriteAllText(Path.Combine(root, "library.json"), """{"themes":{"export.native":{"key":"example","revision":1}},"bindings":{},"enabled":false}""");
        var protectedFiles = Directory.GetFiles(root, "*", SearchOption.AllDirectories).ToDictionary(path => path, File.ReadAllBytes);
        using var library = new Library(root);
        Task<JsonNode> Request(string op) => library.Handle(new JsonObject { ["op"] = op, ["id"] = "export.native", ["revision"] = 1 },
            _ => Task.CompletedTask, (_, _) => Task.CompletedTask);
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var release = new ManualResetEventSlim();
        var destination = Path.Combine(outputRoot, "사용자가 지정한 이름.coskin");
        library.PickThemeExportPath = name =>
        {
            if (name != "새 이름_ 테마.coskin") throw new Exception("Wrong filename suggested by the save dialog");
            entered.TrySetResult(); release.Wait(TimeSpan.FromSeconds(10)); return destination;
        };
        var export = Request("theme-export-save");
        try
        {
            await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
            var list = await Request("list").WaitAsync(TimeSpan.FromSeconds(2));
            check(!export.IsCompleted && list["enabled"]!.GetValue<bool>() == false,
                "테마 저장 창을 열어둔 동안 다른 창의 목록·정지 상태 유지");
        }
        finally { release.Set(); }
        var result = await export;
        var package = Package.Read(File.ReadAllBytes(destination));
        check(result["saved"]!.GetValue<bool>() && result["path"]!.GetValue<string>() == destination && package.Manifest["id"]!.GetValue<string>() == "export.native",
            "테마 내보내기는 사용자가 고른 경로·파일명으로 유효한 coskin을 저장함");
        check(package.Files["assets/search.png"].SequenceEqual(sourceImage), "사용자가 지정한 테마 내보내기 파일은 원본 자산 바이트를 보존함");
        library.PickThemeExportPath = _ => null;
        check((await Request("theme-export-save"))["canceled"]!.GetValue<bool>() && Directory.GetFiles(outputRoot).Length == 1,
            "저장 창 취소는 새 파일·임시 파일을 만들지 않음");
        foreach (var invalid in new[] { Path.Combine(root, "overwrite.coskin"), Path.Combine(outputRoot, "wrong.png") })
        {
            library.PickThemeExportPath = _ => invalid;
            try { await Request("theme-export-save"); throw new Exception("Invalid save path accepted"); }
            catch (InvalidDataException) { check(!File.Exists(invalid), "테마 내보내기는 라이브러리 내부·잘못된 확장자에 저장하지 않음"); }
        }
        check(protectedFiles.All(pair => File.ReadAllBytes(pair.Key).SequenceEqual(pair.Value)),
            "테마 저장·취소·잘못된 위치 거절 후 기존 라이브러리·리비전 보존");
    }
}

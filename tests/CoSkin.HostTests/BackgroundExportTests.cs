using CoSkin;
using System.Buffers.Binary;
using System.Diagnostics;
using System.IO.Compression;
using System.Text;
using System.Text.Json.Nodes;

internal static class BackgroundExportTests
{
    private const string Owner = "0123456789abcdef0123456789abcdef";
    internal static async Task Run(Action<bool, string> check, string scratch)
    {
        var root = Path.Combine(scratch, "background-export");
        var sourceRoot = Path.Combine(root, "assets");
        var outputRoot = Path.Combine(root, "output");
        Directory.CreateDirectory(sourceRoot); Directory.CreateDirectory(outputRoot);
        var first = Png(32, 16, 255, 0, 0);
        var second = Png(32, 16, 0, 0, 255);
        var firstHash = Package.Hash(first); var secondHash = Package.Hash(second);
        var source = Path.Combine(sourceRoot, firstHash + ".bin");
        File.WriteAllBytes(source, first);
        File.WriteAllBytes(Path.Combine(sourceRoot, secondHash + ".bin"), second);
        var document = new JsonObject
        {
            ["manifest"] = new JsonObject { ["name"] = "배경 추출", ["defaultProfile"] = "default" },
            ["assets"] = new JsonObject { ["assets/background.png"] = firstHash, ["assets/override.png"] = secondHash },
            ["theme"] = new JsonObject { ["profiles"] = new JsonArray(new JsonObject
            {
                ["id"] = "default", ["rules"] = new JsonArray(Rule("assets/background.png"))
            }) },
            ["localOverrides"] = new JsonObject { ["default"] = new JsonArray(Rule("assets/override.png")) }
        };
        var libraryPath = Path.Combine(root, "library.json");
        var revisionPath = Path.Combine(root, "revision-example-1.json");
        File.WriteAllText(libraryPath, """{"themes":{"export.example":{"key":"example","revision":1}},"bindings":{},"enabled":false}""");
        File.WriteAllText(revisionPath, document.ToJsonString());
        var protectedLibrary = File.ReadAllBytes(libraryPath); var protectedRevision = File.ReadAllBytes(revisionPath);
        using var library = new Library(root);
        var sequence = 0;
        Task<JsonNode> Request(string op, JsonObject? values = null, string owner = Owner)
        {
            var request = values?.DeepClone().AsObject() ?? new JsonObject();
            request["op"] = op; request["requestId"] = owner + ":" + (++sequence);
            return library.Handle(JsonContract.Read(Encoding.UTF8.GetBytes(request.ToJsonString())), _ => Task.CompletedTask, (_, _) => Task.CompletedTask);
        }
        JsonObject Identity() => new() { ["id"] = "export.example", ["revision"] = 1, ["profile"] = "default" };
        var info = await Request("background-export-info", Identity());
        check(info["kind"]!.GetValue<string>() == "image" && info["originalFormat"]!.GetValue<string>() == "png", "추출 정보는 등록된 프로필의 실제 배경 형식을 읽음");

        using var pickerRelease = new ManualResetEventSlim();
        var pickerEntered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var original = Path.Combine(outputRoot, "원본.png");
        library.PickBackgroundExportPath = (name, extension) =>
        {
            if (name != "배경 추출.png" || extension != "png") throw new Exception("Wrong native save dialog parameters");
            pickerEntered.TrySetResult(); pickerRelease.Wait(TimeSpan.FromSeconds(10)); return original;
        };
        var picking = Request("background-export-start", Identity());
        try
        {
            await pickerEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
            var list = await Request("list").WaitAsync(TimeSpan.FromSeconds(2));
            check(!picking.IsCompleted && list["enabled"]!.GetValue<bool>() == false, "저장 위치를 고르는 동안 다른 창의 목록 요청과 중지 상태가 유지됨");
        }
        finally { pickerRelease.Set(); }
        var start = await picking;
        var jobId = start["jobId"]!.GetValue<string>();
        var copied = await Finish(library.BackgroundExports, jobId);
        check(copied["state"]!.GetValue<string>() == "completed" && File.ReadAllBytes(original).SequenceEqual(second), "원본 추출은 지역 수정 배경을 재압축 없이 바이트 그대로 저장함");
        await Reject(() => Request("background-export-status", new JsonObject { ["jobId"] = jobId }, new string('b', 32)), check, "다른 창은 배경 추출 작업 상태·경로를 읽을 수 없음");
        await Reject(() => Request("background-export-cancel", new JsonObject { ["jobId"] = jobId }, new string('b', 32)), check, "다른 창의 배경 추출 취소를 거부함");
        library.PickBackgroundExportPath = (_, _) => throw new Exception("A duplicate must not show the native save dialog");
        var duplicate = await Request("background-export-start", Identity(), new string('b', 32));
        check(duplicate["duplicate"]!.GetValue<bool>() && duplicate["jobId"]!.GetValue<string>() == jobId &&
            (await Request("background-export-list"))["total"]!.GetValue<int>() == 1, "다른 창에서 같은 원본을 요청해도 저장 창·목록을 중복 생성하지 않음");
        check((await Request("background-export-status", new JsonObject { ["jobId"] = jobId }, new string('b', 32)))["state"]!.GetValue<string>() == "completed", "동일 다운로드를 선택한 창은 기존 완료 항목을 확인할 수 있음");
        await Request("background-export-clear");
        check(File.Exists(original), "다운로드 완료 기록을 지워도 저장한 원본은 유지함");
        library.PickBackgroundExportPath = (_, _) => null;
        check((await Request("background-export-start", Identity()))["canceled"]!.GetValue<bool>(), "저장 창 취소는 추출 작업을 만들지 않음");
        library.PickBackgroundExportPath = (_, _) => Path.Combine(sourceRoot, "forbidden.png");
        await Reject(() => Request("background-export-start", Identity()), check, "테마 보관 폴더에 추출 결과를 덮어쓰지 않음");
        var invalid = Identity(); invalid["format"] = "exe";
        await Reject(() => Request("background-export-start", invalid), check, "선택할 수 없는 확장자 요청을 거부함");
        invalid = Identity(); invalid["format"] = "png"; invalid["resolution"] = "custom"; invalid["width"] = 9000;
        await Reject(() => Request("background-export-start", invalid), check, "과도한 해상도 요청을 변환 전에 거부함");
        var ignored = BackgroundExport.Options.Read(new JsonObject { ["format"] = "original", ["resolution"] = "custom", ["width"] = "invalid", ["timeSeconds"] = -1, ["quality"] = "invalid" }, new("image", "image/png", null));
        check(ignored.Resolution == "original" && ignored.TimeSeconds == 0, "원본 화질 그대로 받기는 비활성 변환 설정과 무관하게 원본을 보존함");
        check(File.ReadAllBytes(libraryPath).SequenceEqual(protectedLibrary) && File.ReadAllBytes(revisionPath).SequenceEqual(protectedRevision) &&
            File.ReadAllBytes(source).SequenceEqual(first), "배경 추출·거부·저장 창 취소 후 라이브러리·리비전·원본을 보존함");

        var converter = Environment.GetEnvironmentVariable("COSKIN_TEST_FFMPEG");
        if (string.IsNullOrEmpty(converter)) return;
        await library.BackgroundExports.ConfigureConverter(converter);
        var fixtures = Path.Combine(root, "fixtures"); Directory.CreateDirectory(fixtures);
        File.WriteAllBytes(Path.Combine(fixtures, "frame-01.png"), first);
        File.WriteAllBytes(Path.Combine(fixtures, "frame-02.png"), second);
        var vp9 = Path.Combine(fixtures, "vp9.webm"); var vp8 = Path.Combine(fixtures, "vp8.webm");
        foreach (var pair in new[] { (vp9, "libvpx-vp9"), (vp8, "libvpx") })
            await Command(converter, ["-v", "error", "-nostdin", "-threads", "2", "-framerate", "1", "-i", Path.Combine(fixtures, "frame-%02d.png"),
                "-r", "30", "-c:v", pair.Item2, "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "200k", "-threads", "2", pair.Item1]);
        check(MediaMetadata.WebmDecoder(vp9) == "libvpx-vp9" && MediaMetadata.WebmDecoder(vp8) == "libvpx", "실제 VP8·VP9 트랙별로 투명도를 읽는 올바른 디코더를 선택함");
        check((await Pixels(converter, vp9, "libvpx-vp9"))[3] == 0 && (await Pixels(converter, vp8, "libvpx"))[3] == 0, "실제 변환 테스트 입력의 투명 픽셀 확인");
        var videoInfo = MediaMetadata.Read(vp9);
        var expectedVideoFrames = await FrameCount(converter, vp9, "libvpx-vp9");
        foreach (var format in new[] { "jpg", "png", "mp4", "webm", "gif" })
        {
            var destination = Path.Combine(outputRoot, "converted." + format);
            var options = BackgroundExport.Options.Read(new JsonObject { ["format"] = format, ["resolution"] = "custom", ["width"] = 48, ["height"] = 48, ["timeSeconds"] = format is "jpg" or "png" ? 1.2 : 0 }, videoInfo);
            var job = library.BackgroundExports.Start(Owner, vp9, videoInfo, options, destination);
            var result = await Finish(library.BackgroundExports, job);
            check(result["state"]!.GetValue<string>() == "completed", "실제 " + format.ToUpperInvariant() + " 변환 완료: " + result["error"]);
            var pixels = await Pixels(converter, destination, format == "webm" ? "libvpx-vp9" : null);
            check(pixels.Length == 48 * 24 * 4, format.ToUpperInvariant() + " 사용자 지정 범위에 원본 2:1 비율을 유지함");
            if (format is "png" or "webm") check(pixels[3] == 0 && pixels[(12 * 48 + 40) * 4 + 3] == 255, format.ToUpperInvariant() + " 투명 영역·불투명 영역을 보존함");
            if (format is "jpg" or "mp4") check(pixels[0] < 12 && pixels[1] < 12 && pixels[2] < 12, format.ToUpperInvariant() + " 투명 영역을 숨겨진 RGB 대신 검정으로 합성함: " + string.Join(',', pixels.Take(4)));
            if (format is "jpg" or "png") check(pixels[(12 * 48 + 40) * 4 + 2] > 180 && pixels[(12 * 48 + 40) * 4] < 40, format.ToUpperInvariant() + " 영상에서 선택한 1.2초의 파란 프레임을 추출함");
            else check(MediaMetadata.Read(destination).Kind != "image", format.ToUpperInvariant() + " 영상·움짤을 한 프레임으로 잘라내지 않음");
            if (format is "mp4" or "webm") check(await FrameCount(converter, destination, format == "webm" ? "libvpx-vp9" : null) == expectedVideoFrames &&
                Math.Abs(MediaMetadata.Read(destination).DurationSeconds!.Value - videoInfo.DurationSeconds!.Value) < .08, format.ToUpperInvariant() + " 전체 프레임 수와 원래 재생 길이를 유지함");
        }
        foreach (var height in new[] { 720, 1080 })
        {
            var destination = Path.Combine(outputRoot, height + ".png");
            var options = BackgroundExport.Options.Read(new JsonObject { ["format"] = "png", ["resolution"] = height.ToString() }, new("image", "image/png", null));
            var job = library.BackgroundExports.Start(Owner, source, new("image", "image/png", null), options, destination);
            var result = await Finish(library.BackgroundExports, job);
            var bytes = File.ReadAllBytes(destination);
            check(result["state"]!.GetValue<string>() == "completed" && BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(16, 4)) == height * 2 &&
                BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(20, 4)) == height, height + "p 프리셋의 실제 크기와 원본 비율 확인");
        }
        var vp8Image = Path.Combine(outputRoot, "vp8.png");
        var vp8Options = BackgroundExport.Options.Read(new JsonObject { ["format"] = "png" }, MediaMetadata.Read(vp8));
        var vp8Job = library.BackgroundExports.Start(Owner, vp8, MediaMetadata.Read(vp8), vp8Options, vp8Image);
        check((await Finish(library.BackgroundExports, vp8Job))["state"]!.GetValue<string>() == "completed" && (await Pixels(converter, vp8Image))[3] == 0, "VP8 WebM도 정지 이미지 변환 시 투명도를 유지함");

        var canceledPath = Path.Combine(outputRoot, "preserved.webm");
        var previous = Encoding.UTF8.GetBytes("preserve existing destination"); File.WriteAllBytes(canceledPath, previous);
        var slow = BackgroundExport.Options.Read(new JsonObject { ["format"] = "webm", ["resolution"] = "1080" }, videoInfo);
        var canceledJob = library.BackgroundExports.Start(Owner, vp9, videoInfo, slow, canceledPath);
        var wait = Stopwatch.StartNew();
        while (library.BackgroundExports.Status(Owner, canceledJob)["progress"] is null && wait.Elapsed < TimeSpan.FromSeconds(10)) await Task.Delay(5);
        check(library.BackgroundExports.Status(Owner, canceledJob)["state"]!.GetValue<string>() == "running", "실제 변환기가 프레임을 처리하는 동안 취소 요청을 검증함");
        library.BackgroundExports.Cancel(Owner, canceledJob);
        var cancellation = await Finish(library.BackgroundExports, canceledJob);
        check(cancellation["state"]!.GetValue<string>() == "canceled" && File.ReadAllBytes(canceledPath).SequenceEqual(previous), "추출 취소는 기존 저장 파일을 덮어쓰지 않음");
        var broken = Path.Combine(fixtures, "broken.jpg"); File.WriteAllBytes(broken, [0xff, 0xd8, 0xff]);
        var failedPath = Path.Combine(outputRoot, "failed.png"); File.WriteAllBytes(failedPath, first);
        var badJob = library.BackgroundExports.Start(Owner, broken, new("image", "image/jpeg", null),
            BackgroundExport.Options.Read(new JsonObject { ["format"] = "png" }, new("image", "image/jpeg", null)), failedPath);
        var failure = await Finish(library.BackgroundExports, badJob);
        check(failure["state"]!.GetValue<string>() == "failed" && File.ReadAllBytes(failedPath).SequenceEqual(first), "변환 실패가 기존 출력 파일과 등록된 원본을 손상하지 않음");
        await Task.Delay(20);
        check(!Directory.EnumerateFiles(outputRoot, ".coskin-export-*").Any(), "완료·취소된 추출의 임시 파일이 남지 않음");
        library.BackgroundExports.Retry(Owner, badJob);
        check((await Finish(library.BackgroundExports, badJob))["state"]!.GetValue<string>() == "failed", "실패 작업을 재시도해도 같은 목록 항목과 저장 위치를 사용함");
        await Queue(library.BackgroundExports, converter, vp9, videoInfo, outputRoot, check);
    }
    private static async Task Queue(BackgroundExport service, string converter, string source, MediaMetadata.Info info, string outputRoot, Action<bool, string> check)
    {
        service.ClearFinished(); service.SetConcurrency(2);
        var keys = new List<string>();
        for (var index = 0; index < 53; index++)
        {
            var request = index < 2 ? new JsonObject { ["format"] = "webm", ["resolution"] = "custom", ["width"] = 1920 + index * 2, ["height"] = 1080, ["quality"] = "high" }
                : new JsonObject { ["format"] = "png", ["resolution"] = "custom", ["width"] = 30 + index * 2, ["height"] = 16 };
            var options = BackgroundExport.Options.Read(request, info);
            keys.Add(service.Start(Owner, source, info, options, Path.Combine(outputRoot, "queue-" + index + "." + options.Format)));
        }
        var list = service.List(0);
        check(list["total"]!.GetValue<int>() == 53 && list["jobs"]!.AsArray().Count == 50 && service.List(50)["jobs"]!.AsArray().Count == 3, "동시 실행 제한과 별개로 53개를 대기 목록에 쌓고 전부 페이지로 관리함");
        check(list["running"]!.GetValue<int>() <= 2 && list["queued"]!.GetValue<int>() > 0 && list["jobs"]![0]!["jobId"]!.GetValue<string>() == keys[0], "실제 FFmpeg 작업은 최대2개이며 목록은 등록 순서를 보존함");
        var firstOptions = BackgroundExport.Options.Read(new JsonObject { ["format"] = "webm", ["resolution"] = "custom", ["width"] = 1920, ["height"] = 1080, ["quality"] = "high" }, info);
        check(service.Start(new string('b', 32), source, info, firstOptions, Path.Combine(outputRoot, "another.webm")) == keys[0] && service.List(0)["total"]!.GetValue<int>() == 53, "대기·진행 중 같은 배경과 설정을 다른 위치로 요청해도 중복 항목이 생기지 않음");
        service.CancelListed(keys[^1]);
        check(service.Status(Owner, keys[^1])["state"]!.GetValue<string>() == "canceled", "대기 항목은 실행 전에 취소할 수 있음");
        service.Retry(Owner, keys[^1]);
        check(service.List(0)["total"]!.GetValue<int>() == 53, "취소 항목의 재시도는 목록을 늘리지 않음");
        service.SetConcurrency(1);
        service.SetConcurrency(4);
        var deadline = Stopwatch.StartNew();
        while (deadline.Elapsed < TimeSpan.FromSeconds(30))
        {
            list = service.List(0);
            check(list["running"]!.GetValue<int>() <= 4, "변경한 동시 실행4개 제한을 실제 작업이 지킴");
            if (list["running"]!.GetValue<int>() == 0 && list["queued"]!.GetValue<int>() == 0) break;
            await Task.Delay(150);
        }
        foreach (var key in keys) check(service.Status(Owner, key)["state"]!.GetValue<string>() == "completed", "실제 대기 다운로드가 순서대로 완료됨: " + key);
        check(!Directory.EnumerateFiles(outputRoot, ".coskin-export-*").Any(), "병렬 처리 종료 후 임시 출력 정리됨");
        service.ClearFinished();
        check(service.List(0)["total"]!.GetValue<int>() == 0 && Directory.EnumerateFiles(outputRoot, "queue-*").Count() == 53, "전체 완료 기록을 지워도 53개 저장 파일을 유지함");
        using var restored = new BackgroundExport(Path.GetDirectoryName(outputRoot)!);
        check(restored.List(0)["maxConcurrent"]!.GetValue<int>() == 4 && restored.FindConverter() == converter, "동시 실행 제한과 선택한 변환기를 다음 실행에도 유지함");
    }
    private static JsonObject Rule(string asset) => new() { ["target"] = "app.background", ["states"] = new JsonObject { ["base"] = new JsonObject { ["style"] = new JsonObject { ["background"] = new JsonObject { ["image"] = asset } } } } };
    private static async Task Reject(Func<Task> operation, Action<bool, string> check, string label)
    {
        try { await operation(); } catch (InvalidDataException) { check(true, label); return; }
        check(false, label);
    }
    private static async Task<JsonObject> Finish(BackgroundExport service, string job)
    {
        var deadline = Stopwatch.StartNew();
        while (deadline.Elapsed < TimeSpan.FromSeconds(30))
        {
            var status = service.Status(Owner, job);
            if (status["state"]!.GetValue<string>() is "completed" or "failed" or "canceled") return status;
            await Task.Delay(10);
        }
        service.Cancel(Owner, job); throw new TimeoutException("Background export did not complete");
    }
    private static async Task<byte[]> Command(string executable, IEnumerable<string> arguments)
    {
        var start = new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        using var process = Process.Start(start)!;
        using var bytes = new MemoryStream();
        var output = process.StandardOutput.BaseStream.CopyToAsync(bytes);
        var error = process.StandardError.ReadToEndAsync();
        try { await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(30)); }
        catch { if (!process.HasExited) process.Kill(true); throw; }
        await output;
        if (process.ExitCode != 0) throw new Exception(await error);
        return bytes.ToArray();
    }
    private static Task<byte[]> Pixels(string converter, string path, string? decoder = null) => Command(converter,
        new[] { "-v", "error", "-nostdin", "-threads", "2" }.Concat(decoder is null ? [] : new[] { "-c:v", decoder }).Concat(["-i", path, "-frames:v", "1", "-pix_fmt", "rgba", "-f", "rawvideo", "pipe:1"]));
    private static async Task<int> FrameCount(string converter, string path, string? decoder) => Encoding.UTF8.GetString(await Command(converter,
        new[] { "-v", "error", "-nostdin", "-threads", "2" }.Concat(decoder is null ? [] : new[] { "-c:v", decoder }).Concat(["-i", path, "-map", "0:v:0", "-fps_mode", "passthrough", "-f", "framemd5", "pipe:1"])))
        .Split('\n', StringSplitOptions.RemoveEmptyEntries).Count(line => !line.StartsWith('#'));
    private static byte[] Png(int width, int height, byte r, byte g, byte b)
    {
        byte[] Chunk(string type, byte[] payload)
        {
            var bytes = new byte[payload.Length + 12];
            BinaryPrimitives.WriteUInt32BigEndian(bytes, (uint)payload.Length);
            Encoding.ASCII.GetBytes(type).CopyTo(bytes, 4); payload.CopyTo(bytes, 8);
            var crc = uint.MaxValue;
            foreach (var value in bytes.AsSpan(4, payload.Length + 4))
            { crc ^= value; for (var bit = 0; bit < 8; bit++) crc = (crc & 1) != 0 ? 0xedb88320U ^ (crc >> 1) : crc >> 1; }
            BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(payload.Length + 8), crc ^ uint.MaxValue);
            return bytes;
        }
        var header = new byte[13]; BinaryPrimitives.WriteInt32BigEndian(header, width); BinaryPrimitives.WriteInt32BigEndian(header.AsSpan(4), height); header[8] = 8; header[9] = 6;
        using var pixels = new MemoryStream();
        using (var compressed = new ZLibStream(pixels, CompressionLevel.SmallestSize, leaveOpen: true))
            for (var y = 0; y < height; y++)
            { compressed.WriteByte(0); for (var x = 0; x < width; x++) compressed.Write([r, g, b, x < width / 2 ? (byte)0 : (byte)255]); }
        return new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }.Concat(Chunk("IHDR", header)).Concat(Chunk("IDAT", pixels.ToArray())).Concat(Chunk("IEND", [])).ToArray();
    }
}

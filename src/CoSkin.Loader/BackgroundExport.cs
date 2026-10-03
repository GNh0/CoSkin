using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using System.Text.Json.Nodes;

namespace CoSkin;

/// <summary>Reads installed assets; streams exports outside the library state lock.</summary>
internal sealed class BackgroundExport(string storePath) : IDisposable
{
    internal sealed record Options(string Format, string Resolution, int Width, int Height, bool KeepAspect, string Quality, double TimeSeconds)
    {
        internal bool Still => Format is "jpg" or "png";
        internal static Options Read(JsonObject request, MediaMetadata.Info source)
        {
            var format = request["format"]?.GetValue<string>() ?? "original";
            var resolution = format == "original" ? "original" : request["resolution"]?.GetValue<string>() ?? "original";
            var quality = format is "jpg" or "mp4" or "webm" ? request["quality"]?.GetValue<string>() ?? "high" : "high";
            var width = resolution == "custom" ? request["width"]?.GetValue<int>() ?? 1920 : 1920;
            var height = resolution == "custom" ? request["height"]?.GetValue<int>() ?? 1080 : 1080;
            var time = (format is "jpg" or "png") && source.Kind != "image" ? request["timeSeconds"]?.GetValue<double>() ?? 0 : 0;
            if (format is not ("original" or "jpg" or "png" or "mp4" or "webm" or "gif") ||
                resolution is not ("original" or "720" or "1080" or "custom") ||
                quality is not ("high" or "standard" or "compact") ||
                width is < 2 or > 8192 || height is < 2 or > 8192 || (long)width * height > 33554432 ||
                !double.IsFinite(time) || time < 0 || time > 604800 ||
                source.DurationSeconds is double duration && time >= duration)
                throw new InvalidDataException("배경 추출 형식·해상도·시점 설정을 확인해 주세요.");
            if (source.Kind == "image" && format is "mp4" or "webm" or "gif")
                throw new InvalidDataException("이미지 배경은 원본·JPG·PNG로 저장할 수 있습니다.");
            return new(format, resolution, width, height, resolution != "custom" || (request["keepAspect"]?.GetValue<bool>() ?? true), quality, time);
        }
    }

    private sealed class Job(long sequence, string owner, string source, MediaMetadata.Info info, Options options, string destination)
    {
        internal readonly long Sequence = sequence;
        internal readonly object Gate = new();
        internal CancellationTokenSource Cancellation = new();
        internal readonly HashSet<string> Owners = [owner];
        internal readonly string Source = source;
        internal readonly MediaMetadata.Info Info = info;
        internal readonly Options Options = options;
        internal readonly string Destination = destination;
        internal string State = "queued";
        internal double? Progress;
        internal string? Path;
        internal string? Error;
    }
    private readonly ConcurrentDictionary<string, Job> jobs = new(StringComparer.Ordinal);
    private readonly Queue<Job> waiting = new();
    private readonly Dictionary<string, string> identities = new(StringComparer.Ordinal);
    private readonly object startGate = new();
    private readonly string configurationPath = System.IO.Path.Combine(storePath, "background-export.json");
    private string? configuredConverter;
    private int maximumConcurrent = ReadConcurrency(System.IO.Path.Combine(storePath, "background-export.json"));
    private int running;
    private long nextSequence;
    private bool disposed;

    internal string? FindConverter()
    {
        if (configuredConverter is not null && File.Exists(configuredConverter)) return configuredConverter;
        try
        {
            if (File.Exists(configurationPath))
            {
                var saved = JsonContract.Read(File.ReadAllBytes(configurationPath), 8192)["converterPath"] as JsonValue;
                if (saved is not null && saved.TryGetValue<string>(out var path) && File.Exists(path)) return configuredConverter = path;
            }
        }
        catch (Exception error) when (error is IOException or InvalidDataException or System.Text.Json.JsonException) { }
        var candidates = new[] { System.IO.Path.Combine(AppContext.BaseDirectory, "tools", "ffmpeg.exe"),
            System.IO.Path.Combine(AppContext.BaseDirectory, "ffmpeg.exe"),
            System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CoSkin", "tools", "ffmpeg.exe") }
            .Concat((Environment.GetEnvironmentVariable("PATH") ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries)
                .Select(folder => System.IO.Path.Combine(folder.Trim('"'), "ffmpeg.exe")));
        return candidates.FirstOrDefault(File.Exists);
    }

    internal async Task ConfigureConverter(string path)
    {
        path = System.IO.Path.GetFullPath(path);
        if (!File.Exists(path) || !string.Equals(System.IO.Path.GetFileName(path), "ffmpeg.exe", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("FFmpeg의 ffmpeg.exe를 선택해 주세요.");
        using var process = new Process { StartInfo = StartInfo(path, ["-version"]) };
        process.Start();
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        try { await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10)); }
        catch { if (!process.HasExited) process.Kill(true); throw; }
        if (process.ExitCode != 0 || !(await output).StartsWith("ffmpeg version ", StringComparison.Ordinal))
            throw new InvalidDataException("FFmpeg 변환기를 확인하지 못했습니다.");
        await error;
        lock (startGate) { configuredConverter = path; SaveConfiguration(); }
    }
    private static int ReadConcurrency(string path)
    {
        try
        {
            if (File.Exists(path) && JsonContract.Read(File.ReadAllBytes(path), 8192)["maxConcurrent"] is JsonValue value &&
                value.TryGetValue<int>(out var limit) && limit is >= 1 and <= 4) return limit;
        }
        catch (Exception error) when (error is IOException or InvalidDataException or System.Text.Json.JsonException) { }
        return 2;
    }
    private void SaveConfiguration()
    {
        var temporary = configurationPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllText(temporary, new JsonObject { ["converterPath"] = configuredConverter ?? FindConverter(), ["maxConcurrent"] = maximumConcurrent }.ToJsonString());
            File.Move(temporary, configurationPath, true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }

    internal static string Extension(string format, string mime) => format == "original" ? mime switch
    {
        "image/png" => "png", "image/jpeg" => "jpg", "image/gif" => "gif",
        "video/mp4" => "mp4", "video/webm" => "webm", _ => throw new InvalidDataException("배경 형식을 확인하지 못했습니다.")
    } : format;

    internal string Start(string owner, string source, MediaMetadata.Info info, Options options, string destination)
    {
        source = System.IO.Path.GetFullPath(source);
        destination = System.IO.Path.GetFullPath(destination);
        var extension = Extension(options.Format, info.Mime);
        if (!string.Equals(System.IO.Path.GetExtension(destination), "." + extension, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(source, destination, StringComparison.OrdinalIgnoreCase) ||
            destination.StartsWith(System.IO.Path.GetDirectoryName(source) + System.IO.Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) ||
            !Directory.Exists(System.IO.Path.GetDirectoryName(destination)))
            throw new InvalidDataException("배경 보관 폴더와 다른 저장 위치 및 선택한 확장자를 사용해 주세요.");
        lock (startGate)
        {
            ObjectDisposedException.ThrowIf(disposed, this);
            if (Existing(owner, source, options) is string duplicate) return duplicate;
            if (options.Format != "original" && FindConverter() is null)
                throw new InvalidDataException("배경 변환에 사용할 FFmpeg를 먼저 선택해 주세요.");
            if (jobs.Values.Any(j => j.Destination.Equals(destination, StringComparison.OrdinalIgnoreCase) && j.State is "queued" or "running"))
                throw new InvalidDataException("이 저장 위치로 받는 작업이 이미 진행 중입니다.");
            var key = Guid.NewGuid().ToString("N");
            var job = new Job(++nextSequence, owner, source, info, options, destination);
            jobs[key] = job;
            identities[Identity(source, options)] = key;
            waiting.Enqueue(job); Dispatch();
            return key;
        }
    }
    private static string Identity(string source, Options options)
    {
        var name = System.IO.Path.GetFileNameWithoutExtension(source);
        var asset = System.Text.RegularExpressions.Regex.IsMatch(name, "^[a-f0-9]{64}$") ? name : System.IO.Path.GetFullPath(source).ToUpperInvariant();
        return asset + ":" + (options.Format == "original" ? "original" : System.Text.Json.JsonSerializer.Serialize(new object?[]
        {
            options.Format, options.Resolution, options.Resolution == "custom" ? options.Width : 0,
            options.Resolution == "custom" ? options.Height : 0, options.Resolution != "custom" || options.KeepAspect,
            options.Format is "png" or "gif" ? "lossless" : options.Quality, options.Still ? options.TimeSeconds : 0
        }));
    }
    internal string? Existing(string owner, string source, Options options)
    {
        lock (startGate)
        {
            if (!identities.TryGetValue(Identity(source, options), out var key) || !jobs.TryGetValue(key, out var job)) return null;
            lock (job.Gate) job.Owners.Add(owner);
            return key;
        }
    }
    private void Dispatch()
    {
        while (!disposed && running < maximumConcurrent && waiting.TryDequeue(out var job))
        {
            lock (job.Gate) { if (job.State != "queued") continue; job.State = "running"; }
            running++;
            _ = Task.Run(async () =>
            {
                try { await Run(job, job.Source, job.Info, job.Options, job.Destination, job.Options.Format == "original" ? null : FindConverter()); }
                finally { lock (startGate) { running--; Dispatch(); } }
            });
        }
    }
    internal JsonObject List(int offset)
    {
        if (offset < 0) throw new InvalidDataException("다운로드 목록 위치 오류");
        lock (startGate)
        {
            var values = jobs.OrderBy(pair => pair.Value.Sequence).ToArray(); var rows = new JsonArray();
            var active = 0; var queued = 0;
            for (var index = 0; index < values.Length; index++)
            {
                var pair = values[index];
                var value = Snapshot(pair.Key, pair.Value);
                if (value["state"]!.GetValue<string>() == "running") active++;
                if (value["state"]!.GetValue<string>() == "queued") queued++;
                if (index < offset || index - offset >= 50) continue;
                value["name"] = System.IO.Path.GetFileName(pair.Value.Destination);
                value["destination"] = pair.Value.Destination;
                value["format"] = pair.Value.Options.Format;
                value["resolution"] = pair.Value.Options.Resolution;
                value["quality"] = pair.Value.Options.Quality;
                value["width"] = pair.Value.Options.Width;
                value["height"] = pair.Value.Options.Height;
                value["timeSeconds"] = pair.Value.Options.TimeSeconds;
                rows.Add(value);
            }
            return new JsonObject { ["jobs"] = rows, ["total"] = values.Length,
                ["running"] = active, ["queued"] = queued,
                ["offset"] = offset, ["maxConcurrent"] = maximumConcurrent, ["converterAvailable"] = FindConverter() is not null };
        }
    }
    internal void SetConcurrency(int limit)
    {
        if (limit is < 1 or > 4) throw new InvalidDataException("동시 다운로드는 1~4개로 설정해 주세요.");
        lock (startGate)
        {
            ObjectDisposedException.ThrowIf(disposed, this);
            var previous = maximumConcurrent;
            maximumConcurrent = limit;
            try { SaveConfiguration(); } catch { maximumConcurrent = previous; throw; }
            Dispatch();
        }
    }
    internal void CancelListed(string key) => CancelJob(jobs.TryGetValue(key, out var job) ? job : throw new InvalidDataException("다운로드 작업을 찾지 못했습니다."));
    internal void Retry(string owner, string key)
    {
        lock (startGate)
        {
            ObjectDisposedException.ThrowIf(disposed, this);
            if (!jobs.TryGetValue(key, out var job)) throw new InvalidDataException("다운로드 작업을 찾지 못했습니다.");
            if (jobs.Values.Any(other => other != job && other.Destination.Equals(job.Destination, StringComparison.OrdinalIgnoreCase) && other.State is "queued" or "running"))
                throw new InvalidDataException("이 저장 위치로 받는 작업이 이미 진행 중입니다.");
            lock (job.Gate)
            {
                if (job.State is not ("failed" or "canceled")) throw new InvalidDataException("실패하거나 취소한 다운로드만 다시 시도할 수 있습니다.");
                if (job.Options.Format != "original" && FindConverter() is null) throw new InvalidDataException("FFmpeg 변환기를 먼저 선택해 주세요.");
                // A retry keeps the same list item and the original native-approved save location.
                job.Cancellation.Dispose(); job.Cancellation = new(); job.Owners.Add(owner);
                job.Progress = null; job.Path = null; job.Error = null; job.State = "queued";
            }
            waiting.Enqueue(job); Dispatch();
        }
    }
    internal void ClearFinished()
    {
        lock (startGate)
            foreach (var pair in jobs.Where(pair => pair.Value.State is "completed" or "failed" or "canceled").ToArray())
                if (jobs.TryRemove(pair.Key, out var job)) { identities.Remove(Identity(job.Source, job.Options)); job.Cancellation.Dispose(); }
    }

    internal JsonObject Status(string owner, string key)
    {
        var job = Owned(owner, key);
        return Snapshot(key, job);
    }
    private static JsonObject Snapshot(string key, Job job)
    {
        lock (job.Gate) return new JsonObject { ["jobId"] = key, ["state"] = job.State, ["progress"] = job.Progress,
            ["path"] = job.Path, ["error"] = job.Error };
    }
    internal JsonObject Cancel(string owner, string key) { CancelJob(Owned(owner, key)); return new JsonObject { ["ok"] = true }; }
    private void CancelJob(Job job)
    {
        lock (startGate)
        {
            lock (job.Gate) { if (job.State is not ("queued" or "running")) return; if (job.State == "queued") job.State = "canceled"; }
            job.Cancellation.Cancel(); Dispatch();
        }
    }
    private Job Owned(string owner, string key)
    {
        if (jobs.TryGetValue(key, out var job)) lock (job.Gate) if (job.Owners.Contains(owner)) return job;
        throw new InvalidDataException("배경 추출 작업을 찾지 못했습니다.");
    }

    private async Task Run(Job job, string source, MediaMetadata.Info info, Options options, string destination, string? converter)
    {
        // The only temporary media is beside the user-selected output, never in the library or C temp.
        var temporary = System.IO.Path.Combine(System.IO.Path.GetDirectoryName(destination)!, ".coskin-export-" + Guid.NewGuid().ToString("N") + "." + Extension(options.Format, info.Mime));
        var token = job.Cancellation.Token;
        var finalState = "completed";
        try
        {
            token.ThrowIfCancellationRequested();
            if (options.Format != "original" && converter is null) throw new InvalidDataException("FFmpeg 변환기를 찾지 못했습니다.");
            if (converter is null)
            {
                await using var input = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.Read, 1048576, true);
                await using var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1048576, true);
                var buffer = new byte[1048576];
                long copied = 0;
                int count;
                while ((count = await input.ReadAsync(buffer, token)) > 0)
                {
                    await output.WriteAsync(buffer.AsMemory(0, count), token);
                    copied += count;
                    lock (job.Gate) job.Progress = copied / (double)input.Length;
                }
                await output.FlushAsync(token);
            }
            else
            {
                using var process = new Process { StartInfo = StartInfo(converter, Arguments(source, temporary, info, options)) };
                process.Start();
                using var kill = token.Register(() => { try { if (!process.HasExited) process.Kill(true); } catch (InvalidOperationException) { } });
                var stderr = ReadError(process.StandardError);
                while (await process.StandardOutput.ReadLineAsync(token) is string line)
                    if (line.StartsWith("out_time_us=", StringComparison.Ordinal) && info.DurationSeconds is double duration &&
                        long.TryParse(line.AsSpan(12), out var microseconds))
                        lock (job.Gate) job.Progress = Math.Clamp(microseconds / (duration * 1000000), 0, .99);
                await process.WaitForExitAsync(token);
                var error = await stderr;
                if (process.ExitCode != 0)
                    throw new InvalidDataException("배경 변환에 실패했습니다. " + error.Trim());
            }
            token.ThrowIfCancellationRequested();
            if (!File.Exists(temporary) || new FileInfo(temporary).Length == 0)
                throw new InvalidDataException("추출된 배경 파일이 비어 있습니다.");
            using (var file = File.OpenRead(temporary))
            {
                var header = new byte[(int)Math.Min(65536, file.Length)]; file.ReadExactly(header);
                if (ImageProbe.Mime(header) != (options.Format == "original" ? info.Mime : options.Format switch
                    { "jpg" => "image/jpeg", "png" => "image/png", "gif" => "image/gif", "mp4" => "video/mp4", "webm" => "video/webm", _ => "" }))
                    throw new InvalidDataException("저장 형식과 결과 파일이 일치하지 않습니다.");
            }
            File.Move(temporary, destination, true);
            lock (job.Gate) { job.Path = destination; job.Progress = 1; }
        }
        catch (OperationCanceledException) { finalState = "canceled"; }
        catch (Exception error) { finalState = "failed"; lock (job.Gate) job.Error = error.Message; }
        finally
        {
            try { if (File.Exists(temporary)) File.Delete(temporary); } catch (IOException) { }
            lock (job.Gate) job.State = finalState;
        }
    }

    private static async Task<string> ReadError(StreamReader reader)
    {
        var text = new System.Text.StringBuilder();
        var buffer = new char[2048]; int count;
        while ((count = await reader.ReadAsync(buffer)) > 0) { text.Append(buffer, 0, count); if (text.Length > 8192) text.Remove(0, text.Length - 8192); }
        return text.ToString();
    }
    private static ProcessStartInfo StartInfo(string executable, IEnumerable<string> arguments)
    {
        var info = new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var argument in arguments) info.ArgumentList.Add(argument);
        return info;
    }
    internal static List<string> Arguments(string source, string destination, MediaMetadata.Info info, Options options)
    {
        var args = new List<string> { "-hide_banner", "-nostdin", "-n", "-v", "error", "-threads", "2" };
        if (info.Mime == "video/webm" && MediaMetadata.WebmDecoder(source) is string decoder)
            args.AddRange(["-c:v", decoder]);
        if (options.Still && options.TimeSeconds > 0) args.AddRange(["-ss", options.TimeSeconds.ToString("R", CultureInfo.InvariantCulture)]);
        args.AddRange(["-i", source, "-map", "0:v:0", "-filter_threads", "1"]);
        var even = options.Format is "mp4" or "webm";
        var filter = options.Resolution switch
        {
            "720" => "scale=-2:720:flags=lanczos", "1080" => "scale=-2:1080:flags=lanczos",
            "custom" when options.KeepAspect => $"scale={options.Width}:{options.Height}:force_original_aspect_ratio=decrease:flags=lanczos" + (even ? ":force_divisible_by=2" : ""),
            "custom" => $"scale={options.Width}:{options.Height}:flags=lanczos",
            _ => "null"
        };
        if (even) filter += ",pad=ceil(iw/2)*2:ceil(ih/2)*2:color=black@0";
        if (options.Format is "jpg" or "mp4")
        {
            // Explicitly flatten alpha over black; dropping alpha alone exposes hidden RGB.
            args.AddRange(["-filter_complex", $"[0:v]{filter},format=rgba,split[fg][bg];[bg]lutrgb=r=0:g=0:b=0,format=rgb24[black];[black][fg]overlay=shortest=1:format=auto[out]", "-map", "-0:v", "-map", "[out]", "-filter_complex_threads", "1"]);
        }
        else args.AddRange(["-vf", filter]);
        if (options.Still)
        {
            args.AddRange(["-frames:v", "1", "-an", "-update", "1"]);
            args.AddRange(options.Format == "jpg" ? ["-q:v", options.Quality == "high" ? "2" : options.Quality == "standard" ? "4" : "7"] : ["-compression_level", "6"]);
        }
        else
        {
            if (options.Format != "gif") args.AddRange(["-map", "0:a?", "-fps_mode", "passthrough", "-enc_time_base:v", "demux"]);
            if (options.Format == "mp4") args.AddRange(["-c:v", "libx264", "-preset", "fast", "-crf", options.Quality == "high" ? "18" : options.Quality == "standard" ? "23" : "28", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart"]);
            else if (options.Format == "webm") args.AddRange(["-c:v", "libvpx-vp9", "-deadline", "good", "-cpu-used", "4", "-b:v", "0", "-crf", options.Quality == "high" ? "20" : options.Quality == "standard" ? "32" : "40", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-c:a", "libopus"]);
            else args.AddRange(["-an", "-loop", "0"]);
        }
        args.AddRange(["-threads", "2", "-progress", "pipe:1", destination]);
        return args;
    }
    public void Dispose()
    {
        lock (startGate) { disposed = true; foreach (var job in jobs.Values) job.Cancellation.Cancel(); }
    }
}

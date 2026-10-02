using CoSkin;
using System.Buffers.Binary;
using System.IO.Compression;
using System.Text;

var scratch = Path.Combine(Path.GetTempPath(), "coskin-poster-cache-tests-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(scratch);
var checks = 0;
var links = new List<string>();
void Check(bool condition, string name) { if (!condition) throw new Exception(name); checks++; Console.WriteLine("PASS " + name); }
void Reject(Action action, string name) { try { action(); throw new Exception("Not rejected: " + name); } catch (InvalidDataException) { Check(true, name); } }
uint Crc(byte[] bytes)
{
    var value = uint.MaxValue;
    foreach (var b in bytes) { value ^= b; for (var bit = 0; bit < 8; bit++) value = (value & 1) != 0 ? 0xedb88320U ^ (value >> 1) : value >> 1; }
    return value ^ uint.MaxValue;
}
byte[] Chunk(string type, byte[] data)
{
    var bytes = new byte[data.Length + 12]; BinaryPrimitives.WriteUInt32BigEndian(bytes, (uint)data.Length);
    Encoding.ASCII.GetBytes(type).CopyTo(bytes, 4); data.CopyTo(bytes, 8);
    BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(bytes.Length - 4), Crc(bytes[4..^4])); return bytes;
}
byte[] Png(int width = 1, int height = 1, byte filter = 0, bool omitPixelRows = false)
{
    byte[] header = new byte[13]; BinaryPrimitives.WriteUInt32BigEndian(header, (uint)width); BinaryPrimitives.WriteUInt32BigEndian(header.AsSpan(4), (uint)height); header[8] = 8; header[9] = 6;
    using var data = new MemoryStream();
    using (var zip = new ZLibStream(data, CompressionLevel.SmallestSize, leaveOpen: true))
        for (var y = 0; y < height; y++) { zip.WriteByte(filter); if (!omitPixelRows) zip.Write(new byte[width * 4]); }
    return new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }.Concat(Chunk("IHDR", header)).Concat(Chunk("IDAT", data.ToArray())).Concat(Chunk("IEND", [])).ToArray();
}
void Junction(string link, string target)
{
    var prefix = Path.TrimEndingDirectorySeparator(Path.GetFullPath(scratch)) + Path.DirectorySeparatorChar;
    if (!Path.GetFullPath(link).StartsWith(prefix, StringComparison.OrdinalIgnoreCase) || !Path.GetFullPath(target).StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        throw new Exception("Junction fixture escaped its own scratch directory");
    try { Directory.CreateSymbolicLink(link, target); }
    catch (Exception error) when (error is UnauthorizedAccessException or System.ComponentModel.Win32Exception || error is IOException && error.HResult == unchecked((int)0x80070522))
    {
        var command = "New-Item -ItemType Junction -Path '" + link.Replace("'", "''") + "' -Target '" + target.Replace("'", "''") + "' -ErrorAction Stop | Out-Null";
        var start = new System.Diagnostics.ProcessStartInfo("powershell.exe") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var argument in new[] { "-NoProfile", "-NonInteractive", "-EncodedCommand", Convert.ToBase64String(Encoding.Unicode.GetBytes(command)) }) start.ArgumentList.Add(argument);
        using var process = System.Diagnostics.Process.Start(start) ?? throw new Exception("Junction fixture process could not start");
        process.WaitForExit(); if (process.ExitCode != 0) throw new Exception(process.StandardError.ReadToEnd());
    }
    links.Add(link);
}
try
{
    var root = Path.Combine(scratch, "assets"); Directory.CreateDirectory(root);
    var a = new string('a', 64); var b = new string('b', 64); var c = new string('c', 64); var png = Png();
    var original = Path.Combine(root, a + ".bin"); File.WriteAllText(original, "original media must survive");
    var library = Path.Combine(scratch, "library.json"); var revision = Path.Combine(scratch, "revision.json");
    File.WriteAllText(library, "library preserved"); File.WriteAllText(revision, "revision preserved");
    var cache = new PosterCache(root, png.Length * 2L);
    var cacheDirectory = Path.Combine(root, PosterCache.DirectoryName);
    Check(cache.Read(a) is null && !Directory.Exists(cacheDirectory), "cache miss does not create directories or read full media");
    Reject(() => cache.Write("../assets", png), "non-SHA traversal key rejected before a write");
    Reject(() => new PosterCache("relative/path"), "nonabsolute cache root rejected");
    Reject(() => cache.Write(a, new byte[PosterCache.MaxPosterBytes + 1]), "oversized cache bytes rejected");
    Reject(() => cache.Write(a, [137, 80, 78, 71]), "fake PNG prefix rejected");
    Reject(() => cache.Write(a, Png(1601, 1)), "oversized actual PNG dimension rejected");
    Reject(() => cache.Write(a, Png(filter: 5)), "invalid decompressed row filter rejected");
    Reject(() => cache.Write(a, Png(omitPixelRows: true)), "PNG with missing actual pixels rejected");
    Check(!Directory.Exists(cacheDirectory), "all invalid admission attempts leave the source folder intact");
    cache.Write(a.ToUpperInvariant(), png);
    Check(cache.Read(a)?.SequenceEqual(png) is true && cache.Read(a.ToUpperInvariant())?.SequenceEqual(png) is true, "real PNG roundtrip and canonical SHA case");
    var cachedA = Path.Combine(cacheDirectory, a + ".png");
    var wrongCrc = png.ToArray(); wrongCrc[29] ^= 1;
    Reject(() => cache.Write(a, wrongCrc), "tampered PNG CRC rejected before replacement");
    Check(File.ReadAllBytes(cachedA).SequenceEqual(png), "invalid replacement preserves completed poster");
    cache.Write(b, png);
    File.SetLastWriteTimeUtc(cachedA, DateTime.UtcNow.AddDays(-10));
    var cachedB = Path.Combine(cacheDirectory, b + ".png"); File.SetLastWriteTimeUtc(cachedB, DateTime.UtcNow.AddDays(-5));
    Check(cache.Read(a)?.SequenceEqual(png) is true, "recent use refreshes old derived poster without altering pixels");
    cache.Write(c, png);
    Check(File.Exists(cachedA) && !File.Exists(cachedB) && File.Exists(Path.Combine(cacheDirectory, c + ".png")), "oldest unused cached poster evicted under total budget");
    Check(Directory.GetFiles(cacheDirectory, "*.png").Sum(p => new FileInfo(p).Length) <= png.Length * 2L, "all persisted posters stay inside the configured test budget");
    Check(PosterCache.MaxCacheBytes == 128L * 1024 * 1024, "production default cache budget is 128MiB");
    Check(!Directory.GetFiles(cacheDirectory, "*.tmp").Any(), "successful atomic writes leave no incomplete cache temp");
    var stale = Path.Combine(cacheDirectory, b + ".poster-" + Guid.NewGuid().ToString("N") + ".tmp"); File.WriteAllText(stale, "stopped cache write"); File.SetLastWriteTimeUtc(stale, DateTime.UtcNow.AddDays(-2));
    var foreign = Path.Combine(cacheDirectory, "user-note.txt"); File.WriteAllText(foreign, "leave unrelated files alone");
    cache.Write(c, png);
    Check(!File.Exists(stale) && File.ReadAllText(foreign) == "leave unrelated files alone", "only stale owned cache temporaries are cleaned");
    File.WriteAllBytes(cachedA, wrongCrc); Check(cache.Read(a) is null, "corrupt derived PNG is a cache miss");
    Check(File.ReadAllBytes(cachedA).SequenceEqual(wrongCrc), "a corrupt cache read does not erase existing bytes");
    Check(File.ReadAllText(original) == "original media must survive" && File.ReadAllText(library) == "library preserved" && File.ReadAllText(revision) == "revision preserved", "cache writes and budget pruning preserve original media and metadata");

    var linkRoot = Path.Combine(scratch, "link-root"); var target = Path.Combine(scratch, "link-target"); Directory.CreateDirectory(linkRoot); Directory.CreateDirectory(target);
    File.WriteAllText(Path.Combine(target, "original.txt"), "target preserved");
    var linkedCache = Path.Combine(linkRoot, PosterCache.DirectoryName); Junction(linkedCache, target);
    Reject(() => new PosterCache(linkRoot), "reparse cache directory rejected");
    var keyedLink = Path.Combine(cacheDirectory, b + ".png"); Junction(keyedLink, target);
    Reject(() => cache.Read(b), "reparse poster path refused on read");
    Reject(() => cache.Write(b, png), "reparse poster path refused on write");
    Check(File.ReadAllText(Path.Combine(target, "original.txt")) == "target preserved", "reparse targets never written or cleaned");
    Console.WriteLine($"PASS {checks} poster-cache checks; no CoSkin/Codex application was launched.");
}
finally
{
    var full = Path.GetFullPath(scratch); var parent = Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath())) + Path.DirectorySeparatorChar;
    if (!full.StartsWith(parent, StringComparison.OrdinalIgnoreCase) || !Path.GetFileName(full).StartsWith("coskin-poster-cache-tests-", StringComparison.Ordinal)) throw new Exception("Unsafe scratch cleanup refused");
    foreach (var link in links) { if (!Path.GetFullPath(link).StartsWith(full + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new Exception("Unsafe link cleanup refused"); if (Directory.Exists(link)) Directory.Delete(link, recursive: false); }
    Directory.Delete(full, recursive: true);
}

using System.Buffers.Binary;
using System.Text;

namespace CoSkin;

/// <summary>Small container metadata reads, without decoding frames or loading whole media files.</summary>
internal static class MediaMetadata
{
    internal sealed record Info(string Kind, string Mime, double? DurationSeconds);
    private sealed record Cached(long Length, long Modified, Info Value);
    private static readonly object CacheLock = new();
    private static readonly Dictionary<string, Cached> Cache = new(StringComparer.Ordinal);
    internal const int MaximumCached = 2048;

    internal static Info Read(string path)
    {
        var file = new FileInfo(path);
        var length = file.Length;
        var modified = file.LastWriteTimeUtc.Ticks;
        lock (CacheLock)
            if (Cache.TryGetValue(path, out var previous) && previous.Length == length && previous.Modified == modified) return previous.Value;
        using var source = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        var value = Read(source);
        lock (CacheLock)
        {
            if (Cache.Count >= MaximumCached) Cache.Clear();
            Cache[path] = new(length, modified, value);
        }
        return value;
    }

    internal static Info Read(Stream source)
    {
        if (!source.CanSeek || source.Length < 4) throw new InvalidDataException("미디어 헤더를 읽지 못했습니다.");
        var header = new byte[(int)Math.Min(64 * 1024, source.Length)];
        source.Position = 0;
        source.ReadExactly(header);
        var mime = ImageProbe.Mime(header);
        source.Position = 0;
        try
        {
            return mime switch
            {
                "video/mp4" => new("video", mime, Duration(Mp4(source))),
                "video/webm" => new("video", mime, Duration(Webm(source))),
                "image/gif" => new(GifAnimated(source) ? "animated" : "image", mime, null),
                _ => new("image", mime, null),
            };
        }
        // A missing/unusual duration is not an invalid background. Never claim 0:00.
        catch (Exception error) when (error is InvalidDataException or EndOfStreamException or OverflowException)
        {
            return new(mime.StartsWith("video/", StringComparison.Ordinal) ? "video" : mime == "image/gif" ? "animated" : "image", mime, null);
        }
    }
    private static double? Duration(double? value) => value is > 0 && double.IsFinite(value.Value) && value <= 604800 ? value : null;
    private static double? Mp4(Stream source)
    {
        var count = 0;
        while (source.Position < source.Length && ++count <= 4096)
        {
            var (type, end) = Box(source, source.Length);
            if (type == "moov")
                while (source.Position < end && ++count <= 4096)
                {
                    var (child, childEnd) = Box(source, end);
                    if (child == "mvhd")
                    {
                        var size = childEnd - source.Position;
                        if (size < 20) return null;
                        var data = new byte[(int)Math.Min(32, size)];
                        source.ReadExactly(data);
                        var version = data[0];
                        if (version > 1 || version == 1 && data.Length < 32) return null;
                        var scale = BinaryPrimitives.ReadUInt32BigEndian(data.AsSpan(version == 0 ? 12 : 20, 4));
                        var duration = version == 0 ? BinaryPrimitives.ReadUInt32BigEndian(data.AsSpan(16, 4)) : BinaryPrimitives.ReadUInt64BigEndian(data.AsSpan(24, 8));
                        if (scale == 0 || version == 0 && duration == uint.MaxValue || duration == ulong.MaxValue) return null;
                        return duration / (double)scale;
                    }
                    source.Position = childEnd;
                }
            source.Position = end;
        }
        return null;
    }
    private static (string Type, long End) Box(Stream source, long parentEnd)
    {
        var start = source.Position;
        if (parentEnd - start < 8) throw new InvalidDataException();
        Span<byte> bytes = stackalloc byte[8]; source.ReadExactly(bytes);
        ulong size = BinaryPrimitives.ReadUInt32BigEndian(bytes[..4]);
        var type = Encoding.ASCII.GetString(bytes[4..]);
        var header = 8;
        if (size == 1) { source.ReadExactly(bytes); size = BinaryPrimitives.ReadUInt64BigEndian(bytes); header = 16; }
        if (size == 0) size = (ulong)(parentEnd - start);
        if (size < (ulong)header || size > (ulong)(parentEnd - start)) throw new InvalidDataException();
        return (type, start + (long)size);
    }
    private static double? Webm(Stream source)
    {
        var count = 0;
        var header = Ebml(source, source.Length);
        if (header.Id != 0x1a45dfa3 || header.Unknown) return null;
        source.Position = header.End;
        var segment = Ebml(source, source.Length);
        if (segment.Id != 0x18538067) return null;
        var segmentEnd = segment.End;
        Span<byte> value = stackalloc byte[8];
        while (source.Position < segmentEnd && ++count <= 4096)
        {
            var element = Ebml(source, segmentEnd);
            if (element.Id == 0x1549a966)
            {
                var infoEnd = element.End;
                ulong scale = 1_000_000;
                double? duration = null;
                while (source.Position < infoEnd && ++count <= 4096)
                {
                    var field = Ebml(source, infoEnd);
                    var size = field.End - source.Position;
                    if (size is > 0 and <= 8 && field.Id is 0x2ad7b1 or 0x4489)
                    {
                        source.ReadExactly(value[..(int)size]);
                        ulong number = 0; foreach (var b in value[..(int)size]) number = (number << 8) | b;
                        if (field.Id == 0x2ad7b1) scale = number;
                        else duration = size switch { 4 => BitConverter.Int32BitsToSingle((int)number), 8 => BitConverter.Int64BitsToDouble((long)number), _ => null };
                    }
                    source.Position = field.End;
                }
                return scale == 0 || duration is null ? null : duration * scale / 1_000_000_000.0;
            }
            if (element.Unknown) return null;
            source.Position = element.End;
        }
        return null;
    }
    private sealed record Element(ulong Id, long End, bool Unknown);
    private static Element Ebml(Stream source, long parentEnd)
    {
        ulong Vint(bool id, out int width)
        {
            if (source.Position >= parentEnd) throw new EndOfStreamException();
            var first = source.ReadByte(); if (first <= 0) throw new InvalidDataException();
            width = 1; var marker = 0x80;
            while ((first & marker) == 0) { width++; marker >>= 1; }
            if (width > (id ? 4 : 8)) throw new InvalidDataException();
            ulong result = (ulong)(id ? first : first & (marker - 1));
            for (var index = 1; index < width; index++) { if (source.Position >= parentEnd) throw new EndOfStreamException(); var b = source.ReadByte(); if (b < 0) throw new EndOfStreamException(); result = (result << 8) | (uint)b; }
            return result;
        }
        var name = Vint(true, out _); var size = Vint(false, out var width);
        var unknown = size == (1UL << (width * 7)) - 1;
        if (!unknown && size > (ulong)(parentEnd - source.Position)) throw new InvalidDataException();
        return new(name, unknown ? parentEnd : source.Position + (long)size, unknown);
    }
    private static bool GifAnimated(Stream source)
    {
        Span<byte> header = stackalloc byte[13]; source.ReadExactly(header);
        if ((header[10] & 0x80) != 0) source.Seek(3 * (1 << ((header[10] & 7) + 1)), SeekOrigin.Current);
        var frames = 0; var blocks = 0;
        Span<byte> descriptor = stackalloc byte[9];
        void SkipSubblocks()
        {
            while (++blocks < 65536)
            {
                var size = source.ReadByte(); if (size < 0) throw new EndOfStreamException(); if (size == 0) return;
                if (source.Length - source.Position < size) throw new EndOfStreamException();
                source.Seek(size, SeekOrigin.Current);
            }
            throw new InvalidDataException();
        }
        while (source.Position < source.Length && ++blocks < 65536)
        {
            switch (source.ReadByte())
            {
                case 0x3b: return false;
                case 0x21: if (source.ReadByte() < 0) throw new EndOfStreamException(); SkipSubblocks(); break;
                case 0x2c:
                    if (++frames > 1) return true;
                    source.ReadExactly(descriptor);
                    if ((descriptor[8] & 0x80) != 0) source.Seek(3 * (1 << ((descriptor[8] & 7) + 1)), SeekOrigin.Current);
                    if (source.ReadByte() < 0) throw new EndOfStreamException(); SkipSubblocks(); break;
                default: throw new InvalidDataException();
            }
        }
        return false;
    }
}

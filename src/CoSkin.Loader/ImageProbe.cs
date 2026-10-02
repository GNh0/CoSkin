namespace CoSkin;
// Byte admission is independent of extensions. Bounded full decoding is performed before commit.
internal static class ImageProbe
{
    internal static void Validate(string path, byte[] bytes)
    {
        var mime = Mime(bytes);
        var extension = Path.GetExtension(path);
        if (mime == "video/mp4" && extension == ".mp4")
        {
            ValidateMp4(bytes);
            return;
        }
        if (mime == "video/webm" && extension == ".webm")
        {
            new WebmReader(bytes).Validate();
            return;
        }
        if (mime == "image/jpeg" && extension is ".jpg" or ".jpeg")
            return;
        if (mime == "image/gif" && extension == ".gif")
        {
            if (bytes.Length < 14)
                throw new InvalidDataException("GIF 헤더 오류");
            var gifWidth = bytes[6] | bytes[7] << 8;
            var gifHeight = bytes[8] | bytes[9] << 8;
            if (gifWidth == 0 || gifHeight == 0 || (long)gifWidth * gifHeight > 32000000)
                throw new InvalidDataException("GIF 해상도 제한");
            return;
        }
        if (!path.EndsWith(".png", StringComparison.Ordinal) || bytes.Length < 33 || !bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }))
            throw new InvalidDataException("현재 검증된 이미지 형식은 정적 PNG입니다.");
        var width = System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(16, 4));
        var height = System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(20, 4));
        if (width == 0 || height == 0 || width > 16384 || height > 16384 || (ulong)width * height > 32000000)
            throw new InvalidDataException("이미지 해상도 제한을 초과했습니다.");
        for (int offset = 8; offset + 12 <= bytes.Length;)
        {
            var length = System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset, 4));
            if (length > bytes.Length - offset - 12)
                throw new InvalidDataException("PNG 청크 오류");
            if (System.Text.Encoding.ASCII.GetString(bytes, offset + 4, 4) == "acTL")
                throw new InvalidDataException("움직이는 PNG는 아직 지원하지 않습니다.");
            offset += checked((int)length + 12);
        }
    }
    internal static string Mime(byte[] bytes)
    {
        if (bytes.Length >= 8 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }))
            return "image/png";
        if (bytes.Length >= 3 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255)
            return "image/jpeg";
        if (bytes.Length >= 6 && System.Text.Encoding.ASCII.GetString(bytes, 0, 6) is "GIF87a" or "GIF89a")
            return "image/gif";
        if (bytes.Length >= 16 && bytes.AsSpan(4, 4).SequenceEqual("ftyp"u8))
            return "video/mp4";
        if (bytes.Length >= 4 && bytes.AsSpan(0, 4).SequenceEqual(new byte[] { 0x1a, 0x45, 0xdf, 0xa3 }))
        {
            new WebmReader(bytes).Header();
            return "video/webm";
        }
        throw new InvalidDataException("PNG·JPEG·GIF·MP4·WebM 바이트 형식을 확인하지 못했습니다.");
    }
    internal static string Extension(string mime) => mime switch { "image/png" => ".png", "image/jpeg" => ".jpg", "image/gif" => ".gif", "video/mp4" => ".mp4", "video/webm" => ".webm", _ => throw new InvalidDataException("미디어 형식 오류") };
    private static void ValidateMp4(byte[] bytes)
    {
        var movie = false;
        var data = false;
        var count = 0;
        for (var offset = 0; offset < bytes.Length;)
        {
            if (++count > 4096 || bytes.Length - offset < 8)
                throw new InvalidDataException("MP4 컨테이너 구조 오류");
            var size = (ulong)System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset, 4));
            var type = System.Text.Encoding.ASCII.GetString(bytes, offset + 4, 4);
            var header = 8;
            if (size == 1)
            {
                if (bytes.Length - offset < 16) throw new InvalidDataException("MP4 컨테이너 구조 오류");
                size = System.Buffers.Binary.BinaryPrimitives.ReadUInt64BigEndian(bytes.AsSpan(offset + 8, 8));
                header = 16;
            }
            else if (size == 0) size = (ulong)(bytes.Length - offset);
            if (size < (ulong)header || size > (ulong)(bytes.Length - offset))
                throw new InvalidDataException("MP4 컨테이너 크기 오류");
            if (offset == 0)
            {
                if (type != "ftyp" || size < (ulong)(header + 8) || (size - (ulong)header) % 4 != 0)
                    throw new InvalidDataException("MP4 형식 선언 오류");
                var brand = System.Text.Encoding.ASCII.GetString(bytes, offset + header, 4);
                if (brand is not ("isom" or "iso2" or "mp41" or "mp42" or "avc1" or "M4V "))
                    throw new InvalidDataException("지원하지 않는 MP4 형식입니다.");
            }
            movie |= type == "moov" && size > (ulong)header;
            data |= type == "mdat" && size > (ulong)header;
            offset += checked((int)size);
        }
        if (!movie || !data) throw new InvalidDataException("MP4 영상 데이터가 없습니다.");
    }

    // Container admission, not codec decoding. Only fixed schema paths are walked, so depth is bounded.
    // RFC 8794 section 6.2: an unknown-sized Cluster ends at a Segment sibling or its parent's end.
    private sealed class WebmReader(byte[] bytes)
    {
        private const uint Ebml = 0x1a45dfa3, Segment = 0x18538067, Info = 0x1549a966,
            Tracks = 0x1654ae6b, Cluster = 0x1f43b675;
        private int maxSizeLength = 8;
        private bool video, blocks;
        private readonly record struct Element(uint Id, int Start, int End, bool Unknown);
        private static InvalidDataException Error() => new("WebM 컨테이너 구조·코덱 오류");

        internal int Header()
        {
            var offset = 0;
            var header = Read(ref offset, bytes.Length);
            if (header.Id != Ebml || header.Unknown) throw Error();
            var docType = false;
            ulong version = 1, readVersion = 1, docVersion = 1, docReadVersion = 1, maxId = 4, maxSize = 8;
            var seen = 0;
            for (offset = header.Start; offset < header.End;)
            {
                var element = Read(ref offset, header.End);
                Finite(element);
                var bit = element.Id switch { 0x4286 => 1, 0x42f7 => 2, 0x42f2 => 4, 0x42f3 => 8, 0x4282 => 16, 0x4287 => 32, 0x4285 => 64, _ => 0 };
                if ((seen & bit) != 0) throw Error();
                seen |= bit;
                switch (element.Id)
                {
                    case 0x4286: version = UInt(element, 1); break;
                    case 0x42f7: readVersion = UInt(element, 1); break;
                    case 0x42f2: maxId = UInt(element, 4); break;
                    case 0x42f3: maxSize = UInt(element, 8); break;
                    case 0x4282: docType = Text(element).SequenceEqual("webm"u8); break;
                    case 0x4287: docVersion = UInt(element, 1); break;
                    case 0x4285: docReadVersion = UInt(element, 1); break;
                }
            }
            if (!docType || version == 0 || readVersion != 1 || maxId != 4 || maxSize is 0 or > 8 ||
                docReadVersion is 0 or > 4 || docReadVersion > docVersion) throw Error();
            maxSizeLength = (int)maxSize;
            return header.End;
        }

        internal void Validate()
        {
            var offset = Header();
            var foundSegment = false;
            while (offset < bytes.Length)
            {
                var element = Read(ref offset, bytes.Length);
                if (element.Id is 0xec or 0xbf) { Finite(element); continue; }
                if (element.Id != Segment || foundSegment) throw Error();
                foundSegment = true;
                SegmentData(element);
            }
            if (!foundSegment || !video || !blocks) throw Error();
        }

        private void SegmentData(Element segment)
        {
            var info = false;
            var tracks = false;
            for (var offset = segment.Start; offset < segment.End;)
            {
                var element = Read(ref offset, segment.End);
                if (element.Id == Cluster) { offset = ClusterData(element); continue; }
                Finite(element);
                switch (element.Id)
                {
                    case Info:
                        if (info || element.Start == element.End) throw Error();
                        info = true;
                        InfoData(element);
                        break;
                    case Tracks:
                        if (tracks) throw Error();
                        tracks = true;
                        TracksData(element);
                        break;
                    case Ebml: case Segment: case 0xa3: case 0xa0: case 0xae: throw Error();
                }
            }
            if (!info || !tracks) throw Error();
        }

        private void InfoData(Element info)
        {
            for (var offset = info.Start; offset < info.End;)
            {
                var element = Read(ref offset, info.End);
                Finite(element);
                if (element.Id == 0x2ad7b1 && UInt(element, 1000000) == 0) throw Error();
                if (element.Id == 0x4489)
                {
                    var duration = (element.End - element.Start) switch
                    {
                        4 => BitConverter.Int32BitsToSingle(System.Buffers.Binary.BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(element.Start, 4))),
                        8 => BitConverter.Int64BitsToDouble(System.Buffers.Binary.BinaryPrimitives.ReadInt64BigEndian(bytes.AsSpan(element.Start, 8))),
                        _ => throw Error()
                    };
                    if (!double.IsFinite(duration) || duration <= 0) throw Error();
                }
            }
        }

        private void TracksData(Element tracks)
        {
            for (var offset = tracks.Start; offset < tracks.End;)
            {
                var entry = Read(ref offset, tracks.End);
                Finite(entry);
                if (entry.Id != 0xae) continue;
                ulong number = 0, uid = 0, type = 0;
                var codec = false;
                var supported = false;
                var dimensions = false;
                var seen = 0;
                for (var at = entry.Start; at < entry.End;)
                {
                    var element = Read(ref at, entry.End);
                    Finite(element);
                    var bit = element.Id switch { 0xd7 => 1, 0x73c5 => 2, 0x83 => 4, 0x86 => 8, 0xe0 => 16, _ => 0 };
                    if ((seen & bit) != 0) throw Error();
                    seen |= bit;
                    switch (element.Id)
                    {
                        case 0xd7: number = UInt(element); break;
                        case 0x73c5: uid = UInt(element); break;
                        case 0x83: type = UInt(element); break;
                        case 0x86:
                            var id = Text(element);
                            codec = !id.IsEmpty;
                            supported = id.SequenceEqual("V_VP8"u8) || id.SequenceEqual("V_VP9"u8) || id.SequenceEqual("V_AV1"u8);
                            break;
                        case 0xe0: dimensions = VideoData(element); break;
                    }
                }
                if (number == 0 || uid == 0 || type == 0 || !codec || type == 1 && (!supported || !dimensions)) throw Error();
                video |= type == 1;
            }
        }

        private bool VideoData(Element videoData)
        {
            ulong width = 0, height = 0;
            var seen = 0;
            for (var offset = videoData.Start; offset < videoData.End;)
            {
                var element = Read(ref offset, videoData.End);
                Finite(element);
                var bit = element.Id switch { 0xb0 => 1, 0xba => 2, 0x53c0 => 4, _ => 0 };
                if ((seen & bit) != 0) throw Error();
                seen |= bit;
                switch (element.Id)
                {
                    case 0xb0: width = UInt(element); break;
                    case 0xba: height = UInt(element); break;
                    case 0x53c0: if (UInt(element) > 1) throw Error(); break;
                }
            }
            return width > 0 && height > 0;
        }

        private int ClusterData(Element cluster)
        {
            var timestamp = false;
            var offset = cluster.Start;
            while (offset < cluster.End)
            {
                var start = offset;
                var element = Read(ref offset, cluster.End);
                if (IsSegmentElement(element.Id) || element.Id is Ebml or Segment)
                {
                    if (!cluster.Unknown) throw Error();
                    offset = start;
                    break;
                }
                Finite(element);
                switch (element.Id)
                {
                    case 0xe7:
                        if (timestamp) throw Error();
                        UInt(element);
                        timestamp = true;
                        break;
                    case 0xa3: Block(element); blocks = true; break;
                    case 0xa0: BlockGroup(element); break;
                }
            }
            if (!timestamp) throw Error();
            return offset;
        }

        private void BlockGroup(Element group)
        {
            var block = false;
            for (var offset = group.Start; offset < group.End;)
            {
                var element = Read(ref offset, group.End);
                Finite(element);
                if (element.Id == 0xa1)
                {
                    if (block) throw Error();
                    Block(element);
                    block = true;
                }
                if (element.Id == 0x75a1) Additions(element);
            }
            if (!block) throw Error();
            blocks = true;
        }

        private void Additions(Element additions)
        {
            for (var offset = additions.Start; offset < additions.End;)
            {
                var more = Read(ref offset, additions.End);
                Finite(more);
                if (more.Id != 0xa6) continue;
                var additional = false;
                var id = false;
                for (var at = more.Start; at < more.End;)
                {
                    var element = Read(ref at, more.End);
                    Finite(element);
                    if (element.Id == 0xee)
                    {
                        if (id || UInt(element, 1) == 0) throw Error();
                        id = true;
                    }
                    if (element.Id == 0xa5)
                    {
                        if (additional || element.Start == element.End) throw Error();
                        additional = true;
                    }
                }
                if (!additional) throw Error();
            }
        }

        private void Block(Element element)
        {
            var offset = element.Start;
            var track = Vint(ref offset, element.End, 8, out _);
            if (track == 0 || element.End - offset < 4) throw Error();
            var lacing = (bytes[offset + 2] >> 1) & 3;
            offset += 3;
            if (lacing == 0) return;
            var frames = bytes[offset++] + 1;
            if (frames < 2 || offset >= element.End) throw Error();
            if (lacing == 2)
            {
                if ((element.End - offset) % frames != 0) throw Error();
                return;
            }
            long previous = 0, total = 0;
            for (var frame = 0; frame < frames - 1; frame++)
            {
                long size;
                if (lacing == 1)
                {
                    size = 0;
                    byte part;
                    do
                    {
                        if (offset >= element.End) throw Error();
                        part = bytes[offset++];
                        size += part;
                    } while (part == 255);
                }
                else
                {
                    var start = offset;
                    size = (long)Vint(ref offset, element.End, 8, out _);
                    if (frame != 0) size = previous + size - ((1L << (7 * (offset - start) - 1)) - 1);
                    previous = size;
                }
                if (size <= 0 || size > element.End - offset - total) throw Error();
                total += size;
            }
            if (total >= element.End - offset) throw Error();
        }

        private Element Read(ref int offset, int end)
        {
            var idStart = offset;
            var idValue = Vint(ref offset, end, 4, out var reserved);
            var idLength = offset - idStart;
            if (reserved || idLength > 1 && idValue < (1UL << (7 * (idLength - 1))) - 1) throw Error();
            uint id = 0;
            for (var at = idStart; at < offset; at++) id = id << 8 | bytes[at];
            var size = Vint(ref offset, end, maxSizeLength, out var unknown);
            if (!unknown && size > (ulong)(end - offset)) throw Error();
            var element = new Element(id, offset, unknown ? end : offset + (int)size, unknown);
            offset = element.End;
            return element;
        }

        private ulong Vint(ref int offset, int end, int maxLength, out bool reserved)
        {
            if (offset >= end || bytes[offset] == 0) throw Error();
            var marker = 0x80;
            var length = 1;
            while ((bytes[offset] & marker) == 0) { marker >>= 1; length++; }
            if (length > maxLength || length > end - offset) throw Error();
            ulong value = (ulong)(bytes[offset++] & (marker - 1));
            for (var index = 1; index < length; index++) value = value << 8 | bytes[offset++];
            reserved = value == (1UL << (7 * length)) - 1;
            return value;
        }

        private ulong UInt(Element element, ulong empty = 0)
        {
            if (element.End - element.Start > 8) throw Error();
            if (element.Start == element.End) return empty;
            ulong value = 0;
            for (var at = element.Start; at < element.End; at++) value = value << 8 | bytes[at];
            return value;
        }
        private ReadOnlySpan<byte> Text(Element element)
        {
            var value = bytes.AsSpan(element.Start, element.End - element.Start);
            var zero = value.IndexOf((byte)0);
            return zero < 0 ? value : value[..zero];
        }
        private static void Finite(Element element) { if (element.Unknown) throw Error(); }
        private static bool IsSegmentElement(uint id) => id is Info or Tracks or Cluster or 0x114d9b74 or 0x1c53bb6b or 0x1941a469 or 0x1043a770 or 0x1254c367;
    }
}

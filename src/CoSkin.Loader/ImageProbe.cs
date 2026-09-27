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
        throw new InvalidDataException("PNG·JPEG·GIF·MP4 바이트 형식을 확인하지 못했습니다.");
    }
    internal static string Extension(string mime) => mime switch { "image/png" => ".png", "image/jpeg" => ".jpg", "image/gif" => ".gif", "video/mp4" => ".mp4", _ => throw new InvalidDataException("미디어 형식 오류") };
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
}

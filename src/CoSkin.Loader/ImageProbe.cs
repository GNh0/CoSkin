namespace CoSkin;
// Byte admission is independent of extensions. Bounded full decoding is performed before commit.
internal static class ImageProbe
{
    internal static void Validate(string path, byte[] bytes)
    {
        var mime = Mime(bytes);
        var extension = Path.GetExtension(path);
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
        throw new InvalidDataException("PNG·JPEG·GIF 바이트 형식을 확인하지 못했습니다.");
    }
    internal static string Extension(string mime) => mime switch { "image/png" => ".png", "image/jpeg" => ".jpg", "image/gif" => ".gif", _ => throw new InvalidDataException("이미지 형식 오류") };
}

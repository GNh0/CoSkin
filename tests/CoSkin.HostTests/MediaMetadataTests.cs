using CoSkin;
using System.Buffers.Binary;
using System.Text;
using System.Text.Json.Nodes;

internal static class MediaMetadataTests
{
    internal static void Run(Action<bool, string> check)
    {
        byte[] Box(string type, byte[] body)
        {
            var result = new byte[8 + body.Length]; BinaryPrimitives.WriteUInt32BigEndian(result, (uint)result.Length);
            Encoding.ASCII.GetBytes(type).CopyTo(result, 4); body.CopyTo(result, 8); return result;
        }
        byte[] Movie(bool versionOne, ulong duration, uint scale = 1000)
        {
            var body = new byte[versionOne ? 32 : 20]; body[0] = versionOne ? (byte)1 : (byte)0;
            BinaryPrimitives.WriteUInt32BigEndian(body.AsSpan(versionOne ? 20 : 12), scale);
            if (versionOne) BinaryPrimitives.WriteUInt64BigEndian(body.AsSpan(24), duration);
            else BinaryPrimitives.WriteUInt32BigEndian(body.AsSpan(16), (uint)duration);
            return Box("ftyp", "isom\0\0\0\0"u8.ToArray()).Concat(Box("mdat", new byte[262144])).Concat(Box("moov", Box("mvhd", body))).ToArray();
        }
        MediaMetadata.Info Read(byte[] bytes) { using var source = new MemoryStream(bytes); return MediaMetadata.Read(source); }
        check(Read(Movie(false, 223567)) is { Kind: "video", Mime: "video/mp4", DurationSeconds: 223.567 }, "MP4 moov가 파일 끝이어도 실제 시간 읽기");
        check(Read(Movie(true, 3_723_500)).DurationSeconds == 3723.5, "MP4 v1 64비트 길이 읽기");
        check(Read(Movie(false, uint.MaxValue)).DurationSeconds is null && Read(Movie(true, ulong.MaxValue)).DurationSeconds is null, "미정 MP4 시간은 0:00으로 표시하지 않음");
        check(Read(Movie(false, 2000, 0)).DurationSeconds is null, "잘못된 MP4 timebase는 알 수 없음 처리");
        byte[] Element(string id, byte[] body) => Convert.FromHexString(id).Concat(new[] { (byte)(0x80 | body.Length) }).Concat(body).ToArray();
        byte[] Webm(byte[] duration, byte[]? scale = null)
        {
            var info = Element("1549a966", Element("2ad7b1", scale ?? [0x0f, 0x42, 0x40]).Concat(Element("4489", duration)).ToArray());
            return Element("1a45dfa3", Element("4282", "webm"u8.ToArray())).Concat(Convert.FromHexString("18538067ff")).Concat(info).ToArray();
        }
        var doubleBytes = new byte[8]; BinaryPrimitives.WriteInt64BigEndian(doubleBytes, BitConverter.DoubleToInt64Bits(237566.7));
        check(Math.Abs(Read(Webm(doubleBytes)).DurationSeconds!.Value - 237.5667) < 0.0001, "WebM unknown segment와 Duration double의 ns scale 계산");
        var singleBytes = new byte[4]; BinaryPrimitives.WriteInt32BigEndian(singleBytes, BitConverter.SingleToInt32Bits(1000));
        check(Read(Webm(singleBytes, [0x1e, 0x84, 0x80])).DurationSeconds == 2, "WebM float 시간과 비기본 TimestampScale 계산");
        BinaryPrimitives.WriteInt64BigEndian(doubleBytes, BitConverter.DoubleToInt64Bits(double.NaN));
        check(Read(Webm(doubleBytes)).DurationSeconds is null, "WebM NaN 길이는 확인 불가 처리");
        var gif = Convert.FromBase64String("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
        var imageAt = Array.IndexOf(gif, (byte)0x2c);
        check(Read(gif).Kind == "image", "GIF 한 프레임은 정적 이미지로 구분");
        check(Read(gif[..^1].Concat(gif[imageAt..]).ToArray()).Kind == "animated", "GIF 여러 프레임은 움짤로 구분");
        var document = JsonNode.Parse("""
        {"manifest":{"defaultProfile":"default"},"assets":{"preview/cover.png":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","assets/background.webm":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"theme":{"profiles":[{"id":"default","rules":[{"target":"app.background","states":{"base":{"style":{"background":{"image":"assets/background.webm"}}}}}]}]}}
        """)!.AsObject();
        var calls = new List<string>();
        var actual = BackgroundMediaInfo.Read(document, null, hash => { calls.Add(hash); return new("video", "video/webm", 223.5667); });
        check(calls.SequenceEqual(new[] { new string('b', 64) }) && actual["kind"]!.GetValue<string>() == "video", "실제 배경을 읽고 표지/아이콘을 읽지 않음");
        document["theme"]!["profiles"]![0]!["rules"] = new JsonArray();
        check(BackgroundMediaInfo.Read(document, null, _ => throw new Exception())["kind"]!.GetValue<string>() == "none", "표지만 있는 테마를 배경 동영상으로 오인하지 않음");
        try { BackgroundMediaInfo.Read(document, "missing", _ => throw new Exception()); throw new Exception("누락 프로필 승인"); }
        catch (InvalidDataException) { check(true, "없는 배경 프로필을 거절"); }
    }
}

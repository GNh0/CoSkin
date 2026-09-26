using System.Text.Json;
using System.Text.Json.Nodes;
namespace CoSkin;

internal static class JsonContract
{
    internal static JsonObject Read(byte[] bytes, int maximumBytes = 2 * 1024 * 1024)
    {
        if (bytes.Length > maximumBytes)
            throw new InvalidDataException("JSON 크기 제한을 초과했습니다.");
        using var doc = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 32 });
        Check(doc.RootElement);
        return JsonNode.Parse(bytes) as JsonObject ?? throw new InvalidDataException("JSON 객체가 필요합니다.");
    }
    private static void Check(JsonElement e)
    {
        if (e.ValueKind == JsonValueKind.Object)
        {
            var keys = new HashSet<string>(StringComparer.Ordinal);
            foreach (var p in e.EnumerateObject())
            {
                if (!keys.Add(p.Name))
                    throw new InvalidDataException("중복 JSON 키: " + p.Name);
                Check(p.Value);
            }
        }
        else if (e.ValueKind == JsonValueKind.Array)
            foreach (var v in e.EnumerateArray())
                Check(v);
    }
    internal static string String(JsonNode? n, string key) => n?[key]?.GetValue<string>() ?? throw new InvalidDataException("필수 문자열: " + key);
    internal static void Fields(JsonObject obj, params string[] fields)
    {
        foreach (var p in obj)
            if (!fields.Contains(p.Key))
                throw new InvalidDataException("알 수 없는 필드: " + p.Key);
    }
    internal static string Serialize(JsonNode node) => node.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
}

using System.Text.Json.Nodes;

namespace CoSkin;

/// <summary>Describes the default background, independently of cover images and other icons.</summary>
internal static class BackgroundMediaInfo
{
    internal static JsonObject Read(JsonObject document, string? profileId, Func<string, MediaMetadata.Info> read)
    {
        profileId ??= document["manifest"]!["defaultProfile"]!.GetValue<string>();
        var profile = document["theme"]!["profiles"]!.AsArray().OfType<JsonObject>()
            .SingleOrDefault(p => p["id"]?.GetValue<string>() == profileId)
            ?? throw new InvalidDataException("배경 프로필을 찾지 못했습니다.");
        var rules = profile["rules"]!.AsArray().OfType<JsonObject>()
            .Concat(document["localOverrides"]?[profileId]?.AsArray().OfType<JsonObject>() ?? []);
        string? Background(string target)
        {
            string? path = null;
            foreach (var rule in rules.Where(r => r["target"]?.GetValue<string>() == target && r["item"] is null))
            {
                var background = rule["states"]?["base"]?["style"]?["background"];
                if (background is JsonObject value && value.ContainsKey("image")) path = value["image"]?.GetValue<string>();
            }
            return path;
        }
        var image = Background("app.background") ?? Background("main.surface");
        var result = new JsonObject { ["kind"] = "none", ["durationSeconds"] = null, ["assetCount"] = document["assets"]!.AsObject().Count };
        if (image is null) return result;
        var hash = document["assets"]?[image]?.GetValue<string>();
        if (hash is null || !System.Text.RegularExpressions.Regex.IsMatch(hash, "^[a-f0-9]{64}$"))
            throw new InvalidDataException("배경 자산 참조를 확인하지 못했습니다.");
        var info = read(hash);
        result["kind"] = info.Kind; result["mime"] = info.Mime; result["durationSeconds"] = info.DurationSeconds;
        return result;
    }
}

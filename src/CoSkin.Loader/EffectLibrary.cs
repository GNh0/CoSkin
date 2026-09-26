using System.Text.Json.Nodes;

namespace CoSkin;

/// <summary>Persists validated definitions; referenced themes own independent copies.</summary>
internal static class EffectLibrary
{
    internal static JsonObject ValidationDocument(JsonArray definitions) => new()
    {
        ["manifest"] = new JsonObject
        {
            ["format"] = "coskin.theme",
            ["formatVersion"] = 1,
            ["id"] = "local.effect-validation",
            ["name"] = "CoSkin",
            ["version"] = "1.0.0",
            ["author"] = new JsonObject { ["name"] = "CoSkin" },
            ["engine"] = new JsonObject { ["minVersion"] = "0.1.0" },
            ["requirements"] = new JsonObject { ["required"] = new JsonArray(), ["optional"] = new JsonArray() },
            ["entry"] = "theme.json",
            ["defaultProfile"] = "default",
            ["files"] = new JsonArray()
        },
        ["theme"] = new JsonObject
        {
            ["profiles"] = new JsonArray(new JsonObject { ["id"] = "default", ["name"] = "CoSkin", ["rules"] = new JsonArray() }),
            ["customEffects"] = definitions.DeepClone()
        },
        ["assets"] = new JsonObject()
    };

    internal static JsonObject Parse(byte[] bytes)
    {
        var file = JsonContract.Read(bytes, 64 * 1024);
        JsonContract.Fields(file, "format", "formatVersion", "definition");
        if (JsonContract.String(file, "format") != "coskin.effect" || file["formatVersion"]?.GetValue<int>() != 1)
            throw new InvalidDataException("사용자 효과 파일 형식 오류");
        return file["definition"]?.DeepClone() as JsonObject ?? throw new InvalidDataException("사용자 효과 정의가 필요합니다.");
    }

    internal static async Task<JsonObject> Register(JsonObject state, JsonObject definition,
        bool replace, string? rename, Func<JsonObject, Task> validate)
    {
        if (rename is not null)
        {
            definition["name"] = rename;
            definition["id"] = "custom.local-" + Guid.NewGuid().ToString("N");
        }
        await validate(ValidationDocument(new JsonArray(definition.DeepClone())));
        var definitions = state["effects"]?.DeepClone() as JsonArray ?? new JsonArray();
        var collision = definitions.FirstOrDefault(existing =>
            existing?["id"]?.GetValue<string>() == JsonContract.String(definition, "id") ||
            string.Equals(existing?["name"]?.GetValue<string>(), JsonContract.String(definition, "name"), StringComparison.OrdinalIgnoreCase));
        if (collision is not null && !replace)
            return new JsonObject { ["conflict"] = true, ["definition"] = definition.DeepClone(), ["existing"] = collision.DeepClone() };
        if (collision is not null)
            definitions.Remove(collision);
        definitions.Add(definition.DeepClone());
        await validate(ValidationDocument(definitions));
        state["effects"] = definitions;
        return new JsonObject { ["ok"] = true };
    }
}

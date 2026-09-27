using System.Text.Json.Nodes;
namespace CoSkin;

// Personal organization belongs to the library, never to exported theme revisions.
internal static class ThemeOrganization
{
    internal static JsonObject State(JsonObject library)
    {
        library["organization"] ??= new JsonObject { ["groups"] = new JsonObject(), ["themes"] = new JsonObject() };
        return library["organization"]!.AsObject();
    }
    private static string Label(string value, int maximum)
    {
        var label = value.Trim();
        if (label.Length is < 1 || label.Length > maximum || label.Any(char.IsControl))
            throw new InvalidDataException("분류 이름의 길이 또는 문자를 확인해 주세요.");
        return label;
    }
    internal static void WriteTheme(JsonObject library, string id, JsonObject input)
    {
        if (library["themes"]?[id] is null) throw new InvalidDataException("테마를 찾지 못했습니다.");
        JsonContract.Fields(input, "favorite", "groupId", "tags");
        var organization = State(library);
        var themes = organization["themes"]!.AsObject();
        var metadata = themes[id]?.DeepClone().AsObject() ?? new JsonObject { ["favorite"] = false, ["tags"] = new JsonArray() };
        if (input.ContainsKey("favorite")) metadata["favorite"] = input["favorite"]!.GetValue<bool>();
        if (input.ContainsKey("groupId"))
        {
            var group = input["groupId"]?.GetValue<string>();
            if (!string.IsNullOrEmpty(group) && organization["groups"]?[group] is null)
                throw new InvalidDataException("그룹을 찾지 못했습니다.");
            metadata["groupId"] = string.IsNullOrEmpty(group) ? null : group;
        }
        if (input.ContainsKey("tags"))
        {
            var tags = input["tags"]?.AsArray() ?? throw new InvalidDataException("태그 목록이 필요합니다.");
            if (tags.Count > 24) throw new InvalidDataException("태그는 24개까지 저장할 수 있습니다.");
            var labels = tags.Select(tag => Label(tag?.GetValue<string>() ?? "", 48)).Distinct(StringComparer.OrdinalIgnoreCase);
            metadata["tags"] = new JsonArray(labels.Select(label => (JsonNode?)JsonValue.Create(label)).ToArray());
        }
        themes[id] = metadata;
    }
    internal static string WriteGroup(JsonObject library, string? id, string name)
    {
        var groups = State(library)["groups"]!.AsObject();
        var label = Label(name, 64);
        if (groups.Any(group => group.Key != id && string.Equals(group.Value?.GetValue<string>(), label, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidDataException("이미 같은 이름의 그룹이 있습니다.");
        if (id is not null && groups[id] is null) throw new InvalidDataException("그룹을 찾지 못했습니다.");
        if (id is null && groups.Count >= 256) throw new InvalidDataException("그룹은 256개까지 만들 수 있습니다.");
        id ??= Guid.NewGuid().ToString("N");
        groups[id] = label;
        return id;
    }
    internal static void DeleteGroup(JsonObject library, string id)
    {
        var organization = State(library);
        if (!organization["groups"]!.AsObject().Remove(id)) throw new InvalidDataException("그룹을 찾지 못했습니다.");
        foreach (var theme in organization["themes"]!.AsObject())
            if (theme.Value?["groupId"]?.GetValue<string>() == id) theme.Value!.AsObject().Remove("groupId");
    }
    internal static void DeleteTheme(JsonObject library, string id) => library["organization"]?["themes"]?.AsObject().Remove(id);
}

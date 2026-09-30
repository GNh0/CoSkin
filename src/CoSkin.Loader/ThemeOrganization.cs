using System.Text.Json.Nodes;
namespace CoSkin;

// Personal organization belongs to the library, never to exported theme revisions.
internal static class ThemeOrganization
{
    internal static JsonObject State(JsonObject library)
    {
        library["organization"] ??= new JsonObject { ["groups"] = new JsonObject(), ["themes"] = new JsonObject() };
        var organization = library["organization"]!.AsObject();
        organization["groupParents"] ??= new JsonObject();
        return organization;
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
    internal static string WriteGroup(JsonObject library, string? id, string name, string? parentId = null, bool updateParent = false)
    {
        var organization = State(library);
        var groups = organization["groups"]!.AsObject();
        var parents = organization["groupParents"]!.AsObject();
        var label = Label(name, 64);
        if (id is not null && groups[id] is null) throw new InvalidDataException("그룹을 찾지 못했습니다.");
        if (id is null && groups.Count >= 4096) throw new InvalidDataException("폴더는 4096개까지 만들 수 있습니다.");
        var parent = updateParent ? parentId : id is null ? null : parents[id]?.GetValue<string>();
        parent = string.IsNullOrEmpty(parent) ? null : parent;
        var visited = new HashSet<string>(StringComparer.Ordinal);
        for (var cursor = parent; cursor is not null; cursor = parents[cursor]?.GetValue<string>())
        {
            if (cursor == id || !visited.Add(cursor))
                throw new InvalidDataException("폴더를 자기 자신이나 하위 폴더 안으로 이동할 수 없습니다.");
            if (groups[cursor] is null) throw new InvalidDataException("상위 폴더를 찾지 못했습니다.");
            if (visited.Count >= 64) throw new InvalidDataException("폴더는 64단계까지 만들 수 있습니다.");
        }
        if (id is not null)
            foreach (var group in groups)
            {
                var trail = new HashSet<string>(StringComparer.Ordinal);
                var distance = 0;
                for (string? cursor = group.Key; cursor is not null && trail.Add(cursor); cursor = parents[cursor]?.GetValue<string>())
                {
                    if (cursor == id)
                    {
                        if (visited.Count + 1 + distance > 64)
                            throw new InvalidDataException("하위 폴더를 포함하여 64단계를 넘도록 이동할 수 없습니다.");
                        break;
                    }
                    distance++;
                }
            }
        if (groups.Any(group => group.Key != id
            && parents[group.Key]?.GetValue<string>() == parent
            && string.Equals(group.Value?.GetValue<string>(), label, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidDataException("같은 상위 폴더에 이미 같은 이름의 폴더가 있습니다.");
        id ??= Guid.NewGuid().ToString("N");
        groups[id] = label;
        if (parent is null) parents.Remove(id);
        else parents[id] = parent;
        return id;
    }
    internal static void DeleteGroup(JsonObject library, string id)
    {
        var organization = State(library);
        if (!organization["groups"]!.AsObject().Remove(id)) throw new InvalidDataException("그룹을 찾지 못했습니다.");
        var parents = organization["groupParents"]!.AsObject();
        var parent = parents[id]?.GetValue<string>();
        parents.Remove(id);
        foreach (var child in parents.Where(entry => entry.Value?.GetValue<string>() == id).Select(entry => entry.Key).ToArray())
        {
            if (parent is null) parents.Remove(child);
            else parents[child] = parent;
        }
        foreach (var theme in organization["themes"]!.AsObject())
            if (theme.Value?["groupId"]?.GetValue<string>() == id) theme.Value!.AsObject().Remove("groupId");
    }
    internal static void DeleteTheme(JsonObject library, string id) => library["organization"]?["themes"]?.AsObject().Remove(id);
}

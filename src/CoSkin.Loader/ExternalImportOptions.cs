using System.Text.Json.Nodes;
namespace CoSkin;

internal static class ExternalImportOptions
{
    internal static bool ShowLibrary(JsonObject command)
    {
        JsonContract.Fields(command, "op", "path", "port", "codexPid", "showLibrary");
        if (!command.ContainsKey("showLibrary")) return true;
        if (command["op"]?.GetValue<string>() != "import" ||
            command["showLibrary"] is not JsonValue value || !value.TryGetValue<bool>(out var show))
            throw new InvalidDataException("화면 표시 옵션은 가져오기 요청의 참·거짓 값이어야 합니다.");
        return show;
    }
}

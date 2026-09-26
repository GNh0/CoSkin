namespace CoSkin;

internal sealed record Failure(string Code, string Message, long? Line = null, long? Column = null)
{
    internal static Failure Describe(Exception exception)
    {
        if (exception is TrayActionException action)
            return new(action.Code, TrayMessages.Error(System.Globalization.CultureInfo.CurrentUICulture.Name, action.Code));
        if (exception is System.Text.Json.JsonException syntax)
            return new("json-syntax", "JSON 문법 오류", syntax.LineNumber + 1, syntax.BytePositionInLine + 1);
        var message = exception.Message;
        if (message.Any(character => character is >= '\uac00' and <= '\ud7a3'))
            return new("validation", message);
        return exception switch
        {
            InvalidDataException or System.Text.Json.JsonException or FormatException => new("invalid-data", "파일 형식이 손상되었거나 지원하지 않는 구조입니다."),
            UnauthorizedAccessException => new("access-denied", "파일 접근 권한을 확인하지 못했습니다."),
            IOException => new("file-error", "파일을 읽거나 저장하지 못했습니다. 원본과 마지막 적용 상태를 보존했습니다."),
            TimeoutException => new("timeout", "연결 응답 시간이 초과되었습니다. 다시 연결해 주세요."),
            _ => new("unexpected", "요청을 처리하지 못했습니다. 진단 기록에서 원인을 확인할 수 있습니다.")
        };
    }
}

namespace CoSkin;

internal static class ImportFile
{
    internal static async Task<byte[]> Read(string path, CancellationToken cancellationToken)
    {
        var absolute = Path.GetFullPath(path);
        if (!Path.GetExtension(absolute).Equals(".coskin", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException(".coskin 테마 파일을 선택해 주세요.");
        for (var current = absolute; current is not null; current = Path.GetDirectoryName(current))
            if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new InvalidDataException("연결된 경로에서는 테마 파일을 가져올 수 없습니다.");
        await using var input = new FileStream(absolute, FileMode.Open, FileAccess.Read, FileShare.Read,
            64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
        if (input.Length is <= 0 or > Package.MaxPackage)
            throw new InvalidDataException("테마 파일의 크기 제한은 100MiB입니다.");
        var bytes = new byte[checked((int)input.Length)];
        await input.ReadExactlyAsync(bytes, cancellationToken);
        return bytes;
    }
}

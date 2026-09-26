namespace CoSkin;

internal interface IUpdateHostLifecycle
{
    Task WaitForExit(int originProcess, CancellationToken cancellationToken);
    // A false result or exception must release the candidate's instance lease.
    // Implementations own only the CoSkin process they started, never Codex.
    Task<bool> StartAndConfirm(string executable, CancellationToken cancellationToken);
}

internal enum UpdateSwitchResult
{
    Applied, RolledBack
}

/// <summary>
/// Runs in a separate update worker after the old host cooperatively releases its
/// library. A successful process launch alone never commits an update.
/// </summary>
internal sealed class UpdateSwitch(InstallationService installation, IUpdateHostLifecycle hosts)
{
    internal async Task<UpdateSwitchResult> Run(string verifiedStage, TrustedUpdate update, int originProcess, CancellationToken cancellationToken)
    {
        var previous = installation.Current();
        var previousDirectory = Path.GetDirectoryName(previous.Executable)!;
        var directoryName = Path.GetFileName(previousDirectory);
        var previousVersion = directoryName[..directoryName.LastIndexOf('-')];
        var association = previous.Registrations.Any(value => value.Key == @"Software\Classes\.coskin");
        await hosts.WaitForExit(originProcess, cancellationToken);
        try
        {
            var next = installation.Install(verifiedStage, association, update.Version.ToString());
            using var readyDeadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            readyDeadline.CancelAfter(TimeSpan.FromSeconds(45));
            if (await hosts.StartAndConfirm(next.Executable, readyDeadline.Token))
                return UpdateSwitchResult.Applied;
        }
        catch (Exception error) when (error is IOException or InvalidDataException or OperationCanceledException or TimeoutException or System.ComponentModel.Win32Exception)
        {
            Console.Error.WriteLine("새 CoSkin 준비 실패, 이전 버전 복구: " + error);
        }
        // Once the former host has exited, user cancellation must not leave it absent.
        using var recoveryDeadline = new CancellationTokenSource(TimeSpan.FromSeconds(45));
        var restored = installation.Install(previousDirectory, association, previousVersion);
        if (!await hosts.StartAndConfirm(restored.Executable, recoveryDeadline.Token))
            throw new IOException("이전 CoSkin 실행 확인을 완료하지 못했습니다. 사용자 테마와 배포 파일은 보존했습니다.");
        return UpdateSwitchResult.RolledBack;
    }
}

using CoSkin;

internal static class TrayIconRecoveryTests
{
    // Exercise the production state machine without creating windows or calling Shell_NotifyIcon.
    internal static void Run(Action<bool, string> check)
    {
        using var initial = new Fake();
        initial.Value.Restore();
        check(initial.Value.Registered && initial.Value.Attempts == 1,
            "tray recovery registers an available icon in one successful attempt");
        check(initial.Operations.SequenceEqual(new[] { (0u, 0u), (4u, 4u) }) && initial.Delays.Count == 0,
            "tray recovery requests V4 callbacks and schedules no timer after success");
        initial.Dispose();
        initial.Dispose();
        check(initial.Operations.Count(c => c.Command == 2) == 1 && !initial.Value.Registered && initial.Cancellations == 2,
            "tray recovery disposes its owned icon and timer exactly once");

        var addCalls = 0;
        using var transient = new Fake((command, _) => command == 0 && ++addCalls <= 2 ? 0 : null);
        transient.Value.Restore();
        check(!transient.Value.Registered && transient.Value.RetryPending && transient.TimerActive,
            "tray recovery treats an unspecified native error zero as a nonfatal failure");
        transient.Value.Restore();
        check(addCalls == 1 && transient.Delays.SequenceEqual(new[] { 500u }),
            "tray recovery coalesces Explorer notifications while a retry is pending");
        transient.Value.Retry();
        transient.Value.Retry();
        check(transient.Value.Registered && addCalls == 3 && transient.Delays.SequenceEqual(new[] { 500u, 1000u }),
            "tray recovery survives two temporary shell failures and succeeds on the third attempt");
        check(!transient.Value.RetryPending && !transient.TimerActive && transient.Cancellations == 3 &&
              transient.Events.Count(e => e.Stage == "tray-icon-ready") == 1,
            "tray recovery cancels timers and records a successful recovery once");

        using var permanent = new Fake((command, _) => command == 0 ? 5 : null);
        permanent.Value.Restore();
        for (var index = 0; index < 8; index++) permanent.Value.Retry();
        check(permanent.Value.Attempts == 6 && permanent.Operations.Count(c => c.Command == 0) == 6,
            "tray recovery bounds permanent shell failures to six attempts");
        check(permanent.Delays.SequenceEqual(new[] { 500u, 1000u, 2000u, 5000u, 10000u }),
            "tray recovery uses finite timer backoff without blocking sleeps");
        check(!permanent.Value.RetryPending && !permanent.TimerActive && permanent.Cancellations == 6 &&
              permanent.Events.Count(e => e.Stage == "tray-icon-retries-exhausted") == 1,
            "tray recovery cancels the final timer and remains dormant after exhaustion");
        check(permanent.Operations.All(c => c.Command != 4),
            "tray recovery never sets a callback version when adding an icon failed");
        permanent.Value.Restore();
        check(permanent.Value.Attempts == 1 && permanent.Value.RetryPending && permanent.TimerActive,
            "tray recovery starts a new bounded round after a later Explorer restart");

        var versionCalls = 0;
        using var version = new Fake((command, _) => command == 4 && ++versionCalls == 1 ? 0 : null);
        version.Value.Restore();
        check(!version.Value.Registered && version.Operations.SequenceEqual(new[] { (0u, 0u), (4u, 4u), (2u, 0u) }),
            "tray recovery removes an incomplete icon when V4 registration fails");
        version.Value.Retry();
        check(version.Value.Registered && version.Operations.Count(c => c.Command == 0) == 2,
            "tray recovery retries an incomplete V4 registration with a new icon");
        version.Value.Restore();
        check(version.Operations.TakeLast(3).SequenceEqual(new[] { (2u, 0u), (0u, 0u), (4u, 4u) }),
            "tray recovery replaces only its currently owned icon on Explorer recreation");

        using var versionPermanent = new Fake((command, _) => command == 4 ? 0 : null);
        versionPermanent.Value.Restore();
        for (var index = 0; index < 8; index++) versionPermanent.Value.Retry();
        check(versionPermanent.Value.Attempts == 6 && versionPermanent.Operations.Count(c => c.Command == 2) == 6 &&
              !versionPermanent.TimerActive,
            "tray recovery bounds permanent V4 failures and cleans every incomplete icon");

        using var scheduleFailure = new Fake((command, _) => command == 0 ? 0 : null) { ScheduleSucceeds = false };
        scheduleFailure.Value.Restore();
        check(!scheduleFailure.Value.RetryPending && !scheduleFailure.TimerActive && scheduleFailure.Cancellations == 1 &&
              scheduleFailure.Events.Any(e => e.Stage == "tray-icon-retry-unavailable"),
            "tray recovery remains nonfatal when scheduling a timer fails");
        var scheduledOperations = scheduleFailure.Operations.Count;
        scheduleFailure.Value.Retry();
        check(scheduleFailure.Operations.Count == scheduledOperations,
            "tray recovery ignores timer callbacks when no retry was scheduled");

        using var canceled = new Fake((command, _) => command == 0 ? 0 : null);
        canceled.Value.Restore();
        canceled.Dispose();
        var before = canceled.Operations.Count;
        canceled.Value.Retry();
        canceled.Value.Restore();
        canceled.Dispose();
        check(!canceled.Value.RetryPending && !canceled.TimerActive && canceled.Cancellations == 1 &&
              canceled.Operations.Count == before,
            "tray recovery cancels a pending timer on disposal and ignores late callbacks");

        var deleteCalls = 0;
        using var incomplete = new Fake((command, _) => command == 4 ? 0 : command == 2 && ++deleteCalls == 1 ? 5 : null);
        incomplete.Value.Restore();
        incomplete.Value.Retry();
        check(incomplete.Operations.Count(c => c.Command == 2) == 3 &&
              incomplete.Operations.TakeLast(4).SequenceEqual(new[] { (2u, 0u), (0u, 0u), (4u, 4u), (2u, 0u) }),
            "tray recovery retains ownership after a failed delete and retries cleanup before adding another icon");
    }

    private sealed class Fake : IDisposable
    {
        internal TrayIconRecovery Value { get; }
        internal List<(uint Command, uint Version)> Operations { get; } = [];
        internal List<uint> Delays { get; } = [];
        internal List<(string Stage, string Reason)> Events { get; } = [];
        internal bool ScheduleSucceeds { get; init; } = true;
        internal bool TimerActive { get; private set; }
        internal int Cancellations { get; private set; }

        internal Fake(Func<uint, uint, int?>? operation = null)
        {
            Value = new TrayIconRecovery(
                (command, version) => { Operations.Add((command, version)); return operation?.Invoke(command, version); },
                delay => { Delays.Add(delay); TimerActive = ScheduleSucceeds; return ScheduleSucceeds; },
                () => { Cancellations++; TimerActive = false; },
                (stage, reason) => Events.Add((stage, reason)));
        }

        public void Dispose() => Value.Dispose();
    }
}

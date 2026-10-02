using System.Collections.Frozen;

namespace CoSkin;

internal sealed record WindowCandidate(string Id, bool Visible, bool Focused, bool Connected, bool Protected, bool Available = true);
internal sealed record WindowCapacityPlan(IReadOnlySet<string> Connected, IReadOnlySet<string> Playing);

internal sealed class WindowCapacity
{
    internal const int Maximum = 10;
    internal const int DefaultConnected = 5;
    internal const int DefaultPlaying = 2;

    private sealed record Activity(bool Focused, long LastActive);
    private readonly Dictionary<string, Activity> activity = new(StringComparer.Ordinal);
    private IReadOnlySet<string> previouslyPlaying = FrozenSet<string>.Empty;
    private long sequence;

    internal WindowCapacityPlan Select(IReadOnlyList<WindowCandidate> windows, int maxConnected, int maxPlaying)
    {
        if (maxConnected is < 1 or > Maximum || maxPlaying is < 1 or > Maximum || maxPlaying > maxConnected)
            throw new InvalidDataException("연결 창 수와 영상 재생 창 수는 1~10이며 재생 창 수는 연결 창 수를 넘을 수 없습니다.");
        ArgumentNullException.ThrowIfNull(windows);
        var present = new HashSet<string>(StringComparer.Ordinal);
        foreach (var window in windows)
            if (string.IsNullOrWhiteSpace(window.Id) || !present.Add(window.Id))
                throw new InvalidDataException("창 ID는 비어 있거나 중복될 수 없습니다.");

        foreach (var missing in activity.Keys.Where(id => !present.Contains(id)).ToArray())
            activity.Remove(missing);
        // Focus changes in the same snapshot receive the same stamp, so input
        // enumeration order cannot decide between otherwise equivalent windows.
        var activated = windows.Any(window => window.Focused &&
            (!activity.TryGetValue(window.Id, out var previous) || !previous.Focused));
        if (activated) sequence++;
        foreach (var window in windows)
        {
            activity.TryGetValue(window.Id, out var previous);
            activity[window.Id] = new(window.Focused,
                window.Focused && previous?.Focused != true ? sequence : previous?.LastActive ?? 0);
        }

        var protectedConnections = windows.Where(window => window.Connected && window.Protected).ToArray();
        IEnumerable<WindowCandidate> selected;
        if (protectedConnections.Length > maxConnected)
        {
            // The host rechecks protection before releasing a real connection.
            // Until then retain only protected existing connections, not newcomers.
            selected = protectedConnections;
        }
        else
        {
            selected = windows.Where(window => window.Available || window.Connected)
                .OrderByDescending(window => window.Connected && window.Protected)
                .ThenByDescending(window => window.Focused)
                .ThenByDescending(window => activity[window.Id].LastActive)
                .ThenByDescending(window => window.Visible)
                .ThenByDescending(window => window.Connected)
                .ThenBy(window => window.Id, StringComparer.Ordinal)
                .Take(maxConnected);
        }
        var connected = selected.Select(window => window.Id).ToFrozenSet(StringComparer.Ordinal);
        var playing = windows.Where(window => connected.Contains(window.Id) && window.Available && window.Visible)
            .OrderByDescending(window => window.Focused)
            .ThenByDescending(window => activity[window.Id].LastActive)
            .ThenByDescending(window => previouslyPlaying.Contains(window.Id))
            .ThenBy(window => window.Id, StringComparer.Ordinal)
            .Take(maxPlaying)
            .Select(window => window.Id)
            .ToFrozenSet(StringComparer.Ordinal);
        previouslyPlaying = playing;
        return new(connected, playing);
    }
}

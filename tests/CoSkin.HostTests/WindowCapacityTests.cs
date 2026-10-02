using CoSkin;

internal static class WindowCapacityTests
{
    internal static void Run(Action<bool, string> check)
    {
        check(WindowCapacity.Maximum == 10 && WindowCapacity.DefaultConnected == 5 && WindowCapacity.DefaultPlaying == 2,
            "창 정책은 기본 5개 연결·2개 재생과 잠정 최대 10개 설정 계약을 공유");
        var empty = new WindowCapacity().Select([], 1, 1);
        check(empty.Connected.Count == 0 && empty.Playing.Count == 0, "창이 없으면 연결과 영상 재생 계획 모두 비어 있음");

        foreach (var count in new[] { 2, 5, 10 })
        {
            var windows = Enumerable.Range(1, count).Select(index => W($"window-{index:D2}")).ToArray();
            var policy = new WindowCapacity();
            var plan = policy.Select(windows, 10, 2);
            check(plan.Connected.Count == count && plan.Playing.SetEquals(["window-01", "window-02"]),
                $"{count}개 후보에서 전체 연결을 허용하면서 영상 재생은 2개로 제한");
            var reordered = policy.Select(windows.Reverse().ToArray(), 10, 2);
            check(reordered.Connected.SetEquals(plan.Connected) && reordered.Playing.SetEquals(plan.Playing),
                $"{count}개 후보의 입력 순서가 뒤집혀도 같은 연결과 영상 선택 유지");
        }
        var partial = new WindowCapacity().Select([W("c"), W("b"), W("a"), W("d"), W("e")], 3, 2);
        check(partial.Connected.SetEquals(["a", "b", "c"]) && partial.Playing.SetEquals(["a", "b"]),
            "5개 창에서 최대 연결 3개와 재생 2개를 독립 적용하며 ordinal ID로 선택");

        var focusPolicy = new WindowCapacity();
        var first = focusPolicy.Select([W("a", focused: true), W("b"), W("c")], 2, 1);
        var moved = focusPolicy.Select([W("a", connected: true), W("b", connected: true), W("c", focused: true)], 2, 1);
        check(first.Playing.SetEquals(["a"]) && moved.Connected.SetEquals(["a", "c"]) && moved.Playing.SetEquals(["c"]),
            "포커스가 새 창으로 이동하면 연결·영상 우선순위를 옮기고 이전 활성 창을 다음으로 유지");
        var unfocused = focusPolicy.Select([W("a"), W("b"), W("c")], 2, 1);
        check(unfocused.Connected.SetEquals(["a", "c"]) && unfocused.Playing.SetEquals(["c"]),
            "포커스를 잃어도 최근 활성 순서는 단조 카운터 기록으로 유지");
        var focusedTie = new WindowCapacity().Select([W("c", focused: true), W("a", focused: true), W("b", focused: true)], 1, 1);
        check(focusedTie.Connected.SetEquals(["a"]) && focusedTie.Playing.SetEquals(["a"]),
            "동일 관측에서 여러 포커스가 표시되면 입력 순서에 의존하지 않고 ordinal ID로 결정");
        var ordinal = new WindowCapacity().Select([W("a"), W("A")], 1, 1);
        check(ordinal.Connected.SetEquals(["A"]), "창 ID 비교는 문화권이나 대소문자 무시 없이 ordinal 기준");

        var visible = new WindowCapacity().Select([W("a", visible: false, connected: true), W("b")], 1, 1);
        check(visible.Connected.SetEquals(["b"]) && visible.Playing.SetEquals(["b"]),
            "활성 기록이 같으면 보이는 창이 숨은 기존 연결보다 우선");
        var existing = new WindowCapacity().Select([W("a"), W("z", connected: true)], 1, 1);
        check(existing.Connected.SetEquals(["z"]), "가시성·포커스·활성 기록이 같으면 기존 연결을 우선 유지");
        var minimized = focusPolicy.Select([W("a"), W("b"), W("c", visible: false, connected: true)], 2, 1);
        check(minimized.Connected.SetEquals(["a", "c"]) && minimized.Playing.SetEquals(["a"]),
            "최근 활성 창이 최소화되어도 연결은 유지할 수 있지만 영상은 보이는 창으로 이동");
        var hidden = new WindowCapacity().Select([W("a", visible: false), W("b", visible: false)], 2, 2);
        check(hidden.Connected.Count == 2 && hidden.Playing.Count == 0,
            "최소화 또는 HWND 미확인으로 Visible=false인 창은 영상 재생하지 않음");
        var unavailable = new WindowCapacity().Select([W("a", focused: true, available: false), W("b")], 2, 2);
        check(unavailable.Connected.SetEquals(["b"]) && unavailable.Playing.SetEquals(["b"]),
            "재시도 대기 또는 unavailable 신규 창은 포커스가 있어도 연결하지 않음");
        var retainedUnavailable = new WindowCapacity().Select([W("a", connected: true, protect: true, available: false), W("b")], 2, 2);
        check(retainedUnavailable.Connected.SetEquals(["a", "b"]) && retainedUnavailable.Playing.SetEquals(["b"]),
            "이미 연결된 보호창은 unavailable이어도 보존하며 해당 창 영상은 재생하지 않음");

        var resizePolicy = new WindowCapacity();
        var five = Enumerable.Range(1, 5).Select(index => W($"window-{index:D2}", connected: true)).ToArray();
        var full = resizePolicy.Select(five, 5, 2);
        var smaller = resizePolicy.Select(five, 2, 1);
        var feedback = five.Select(window => window with { Connected = smaller.Connected.Contains(window.Id) }).ToArray();
        var expanded = resizePolicy.Select(feedback, 5, 2);
        check(full.Connected.Count == 5 && smaller.Connected.SetEquals(["window-01", "window-02"]) && smaller.Playing.Count == 1,
            "연결·재생 한도 축소 시 기존 재생 우선순위를 보존하며 각각 새 한도를 적용");
        check(expanded.Connected.Count == 5 && expanded.Playing.SetEquals(["window-01", "window-02"]),
            "한도 재확대 시 실제 연결 상태 피드백을 받아 빠진 창을 다시 선택");

        var protectionPolicy = new WindowCapacity();
        var protectedPair = protectionPolicy.Select([W("a", connected: true, protect: true), W("b", connected: true, protect: true), W("c", focused: true)], 2, 1);
        check(protectedPair.Connected.SetEquals(["a", "b"]) && !protectedPair.Playing.Contains("c"),
            "편집·초안·미리보기·요청 중 기존 보호창은 새 포커스 창보다 연결 우선 보존");
        var overflowWindows = new[] { W("a", connected: true, protect: true), W("b", connected: true, protect: true),
            W("c", connected: true, protect: true), W("d", connected: true), W("e", focused: true) };
        var overflow = protectionPolicy.Select(overflowWindows, 2, 1);
        check(overflow.Connected.SetEquals(["a", "b", "c"]) && overflow.Playing.Count == 1,
            "한도보다 많은 기존 보호창은 일시 보존하되 비보호 기존 창과 새 연결은 추가하지 않고 재생 한도 유지");
        var released = protectionPolicy.Select(overflowWindows.Select(window => window with { Protected = window.Id == "a" }).ToArray(), 2, 1);
        check(released.Connected.SetEquals(["a", "e"]) && released.Playing.SetEquals(["e"]),
            "보호 상태 종료 후 한도에 맞게 연결을 회수하고 포커스 창을 새로 선택");
        var notConnectedProtection = new WindowCapacity().Select([W("a", protect: true), W("z", connected: true)], 1, 1);
        check(notConnectedProtection.Connected.SetEquals(["z"]), "연결되지 않은 후보의 Protected 표시는 기존 연결 보호로 취급하지 않음");

        var playingPolicy = new WindowCapacity();
        var initialPlaying = playingPolicy.Select([W("a", available: false), W("b")], 2, 1);
        var retainedPlaying = playingPolicy.Select([W("a"), W("b")], 2, 1);
        var focusedPlaying = playingPolicy.Select([W("a", focused: true), W("b")], 2, 1);
        check(initialPlaying.Playing.SetEquals(["b"]) && retainedPlaying.Playing.SetEquals(["b"]) && focusedPlaying.Playing.SetEquals(["a"]),
            "동일 활성 순위에서는 기존 재생 창을 보존하되 새로운 포커스 창은 재생 우선 전환");

        var removalPolicy = new WindowCapacity();
        removalPolicy.Select([W("a"), W("b"), W("z", focused: true)], 1, 1);
        var removed = removalPolicy.Select([W("a"), W("b")], 1, 1);
        var reappeared = removalPolicy.Select([W("a"), W("b"), W("z")], 1, 1);
        check(removed.Connected.SetEquals(["a"]) && reappeared.Connected.SetEquals(["a"]) && reappeared.Playing.SetEquals(["a"]),
            "사라진 창의 활성·재생 기억은 지워져 같은 ID가 다시 나타나도 오래된 우선순위를 되살리지 않음");
        var survivors = new WindowCapacity().Select([W("b", connected: true), W("c", connected: true)], 3, 2);
        check(survivors.Connected.SetEquals(["b", "c"]) && survivors.Playing.SetEquals(["b", "c"]),
            "한 창이 제거된 뒤 남은 창의 연결과 영상 계획은 유지");

        var invalidPolicy = new WindowCapacity();
        invalidPolicy.Select([W("a"), W("z", focused: true)], 1, 1);
        foreach (var limits in new[] { (0, 1), (11, 1), (2, 0), (2, 11), (2, 3), (int.MinValue, 1), (1, int.MaxValue) })
        {
            var rejected = false;
            try { invalidPolicy.Select([], limits.Item1, limits.Item2); }
            catch (InvalidDataException) { rejected = true; }
            check(rejected, $"유효하지 않은 연결/재생 한도 {limits.Item1}/{limits.Item2}는 InvalidDataException으로 거절");
        }
        var afterInvalid = invalidPolicy.Select([W("a"), W("z")], 1, 1);
        check(afterInvalid.Connected.SetEquals(["z"]), "유효하지 않은 설정 거절은 기존 창 활성 기록을 바꾸지 않음");
        foreach (var windows in new[] { new[] { W("a"), W("a") }, new[] { W(" ") } })
        {
            var rejected = false;
            try { new WindowCapacity().Select(windows, 1, 1); }
            catch (InvalidDataException) { rejected = true; }
            check(rejected, "중복되거나 비어 있는 창 ID는 선택 전에 거절");
        }
    }

    private static WindowCandidate W(string id, bool visible = true, bool focused = false, bool connected = false,
        bool protect = false, bool available = true) => new(id, visible, focused, connected, protect, available);
}

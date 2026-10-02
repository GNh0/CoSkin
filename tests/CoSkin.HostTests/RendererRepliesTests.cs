using System.Diagnostics;
using System.Text.Json.Nodes;
using CoSkin;

internal static class RendererRepliesTests
{
    internal static async Task Run(Action<bool, string> check)
    {
        var replies = new RendererReplies();
        var successful = new List<string>();
        replies.Enqueue("a", "same-request", new JsonObject { ["saved"] = true }, null);
        replies.Enqueue("b", "same-request", new JsonObject { ["saved"] = false }, null);
        await Throws<TimeoutException>(() => replies.Deliver("a", (_, _) => throw new TimeoutException("old connection")));
        check(true, "이전 연결 응답 timeout은 호출자에게 전달하면서 미전달 응답을 보존");
        await replies.Deliver("a", (_, arguments) =>
        {
            successful.Add(arguments[0]!.GetValue<string>());
            check(arguments[1]?["saved"]?.GetValue<bool>() == true, "복구된 같은 target의 콜백에 이전 저장 성공 결과를 전달");
            return Ack(true);
        });
        var aCalls = 0;
        await replies.Deliver("a", (_, _) => { aCalls++; return Ack(true); });
        check(successful.SequenceEqual(["same-request"]) && aCalls == 0, "ACK된 응답은 같은 창에 다시 전달하지 않음");
        await replies.Deliver("b", (_, arguments) =>
        {
            check(arguments[1]?["saved"]?.GetValue<bool>() == false, "같은 requestId라도 다른 target의 결과를 섞지 않음");
            return Ack(true);
        });
        await replies.Deliver("missing-target", (_, _) => throw new Exception("no entry"));
        check(true, "보관 응답이 없는 창에는 콜백을 호출하지 않음");

        var input = new JsonObject { ["nested"] = new JsonArray { "original" } };
        var inputError = new JsonObject { ["code"] = "original-error" };
        var owner = new JsonArray { input, inputError };
        replies.Enqueue("clone", "request", input, inputError);
        input["nested"]![0] = "changed by caller";
        inputError["code"] = "changed by caller";
        await replies.Deliver("clone", (_, arguments) =>
        {
            check(arguments[1]?["nested"]?[0]?.GetValue<string>() == "original" &&
                arguments[2]?["code"]?.GetValue<string>() == "original-error", "enqueue가 결과와 오류를 각각 DeepClone하여 호출자 변경과 분리");
            arguments[1]!["nested"]![0] = "changed by callback";
            arguments[2]!["code"] = "changed by callback";
            return Ack(false);
        });
        await replies.Deliver("clone", (_, arguments) =>
        {
            check(arguments[1]?["nested"]?[0]?.GetValue<string>() == "original" &&
                arguments[2]?["code"]?.GetValue<string>() == "original-error", "각 전달 인자를 복제하여 false 응답 뒤 재시도 원본 보존");
            return Ack(true);
        });
        check(ReferenceEquals(input.Parent, owner) && ReferenceEquals(inputError.Parent, owner) && owner.Count == 2,
            "보관과 전달이 입력 JsonNode의 부모 관계를 변경하지 않음");

        replies.Enqueue("not-ready", "first", null, null);
        replies.Enqueue("not-ready", "second", null, null);
        var notReady = 0;
        await replies.Deliver("not-ready", (_, _) => { notReady++; return Ack(false); });
        check(notReady == 1, "Controller 미준비 false 응답은 큐를 보존하고 같은 pass의 후속 호출을 중단");
        var ordered = new List<string>();
        await replies.Deliver("not-ready", (_, arguments) => { ordered.Add(arguments[0]!.GetValue<string>()); return Ack(true); });
        check(ordered.SequenceEqual(["first", "second"]), "Controller가 준비되면 보존된 응답을 enqueue 순서대로 전달");

        replies.Enqueue("malformed", "request", null, null);
        await Throws<InvalidDataException>(() => replies.Deliver("malformed", (_, _) => Task.FromResult<JsonNode?>(new JsonObject())));
        var afterMalformed = 0;
        await replies.Deliver("malformed", (_, _) => { afterMalformed++; return Ack(true); });
        check(afterMalformed == 1, "boolean 이외의 확인 값은 오류를 보고하고 응답을 잃지 않음");

        var concurrent = new RendererReplies();
        concurrent.Enqueue("a", "request", null, null);
        concurrent.Enqueue("b", "request", null, null);
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource<JsonNode?>(TaskCreationOptions.RunContinuationsAsynchronously);
        var firstCalls = 0;
        var first = concurrent.Deliver("a", (_, _) => { firstCalls++; entered.TrySetResult(); return release.Task; });
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(2));
        var duplicateCalls = 0;
        await concurrent.Deliver("a", (_, _) => { duplicateCalls++; return Ack(true); }).WaitAsync(TimeSpan.FromSeconds(1));
        check(duplicateCalls == 0 && !first.IsCompleted, "같은 target의 동시 Deliver는 슬롯을 기다리지 않고 중복 호출을 피함");
        var bCalls = 0;
        await concurrent.Deliver("b", (_, _) => { bCalls++; return Ack(true); });
        check(bCalls == 1 && !first.IsCompleted, "한 창의 느린 전달이 다른 target의 전달을 막지 않음");
        concurrent.Enqueue("a", "request", JsonValue.Create("new result"), null);
        release.SetResult(JsonValue.Create(true));
        await first;
        await concurrent.Deliver("a", (_, arguments) =>
        {
            check(arguments[1]?.GetValue<string>() == "new result", "전송 중 같은 키가 갱신되면 이전 ACK로 새 entry를 제거하지 않음");
            return Ack(true);
        });
        check(firstCalls == 1, "느린 원래 전달은 한 번만 실행");

        var startup = new RendererReplies();
        startup.Enqueue("startup", "list", null, null);
        var startupCalls = new List<string>();
        var skippedConcurrentCalls = 0;
        await startup.Deliver("startup", async (_, arguments) =>
        {
            var id = arguments[0]!.GetValue<string>();
            startupCalls.Add(id);
            var next = id == "list" ? "locale" : id == "locale" ? "settings" : null;
            if (next is not null)
            {
                // Resolving a renderer request starts its next startup request before the native ACK returns.
                startup.Enqueue("startup", next, null, null);
                await startup.Deliver("startup", (_, _) => { skippedConcurrentCalls++; return Ack(true); });
            }
            return JsonValue.Create(true);
        });
        check(startupCalls.SequenceEqual(["list", "locale", "settings"]) && skippedConcurrentCalls == 0,
            "초기화 응답 중 도착한 다음 요청도 같은 제한된 pass에서 전달하여 ready 대기와 교착하지 않음");

        var forgotten = new RendererReplies();
        forgotten.Enqueue("a", "request", JsonValue.Create("old"), null);
        forgotten.Enqueue("a", "not-started", null, null);
        forgotten.Enqueue("b", "request", JsonValue.Create("other"), null);
        var forgetRelease = new TaskCompletionSource<JsonNode?>(TaskCreationOptions.RunContinuationsAsynchronously);
        var old = forgotten.Deliver("a", (_, _) => forgetRelease.Task);
        forgotten.Forget("a");
        forgotten.Forget("a");
        forgotten.Enqueue("a", "request", JsonValue.Create("new generation"), null);
        forgetRelease.SetResult(JsonValue.Create(true));
        await old;
        var afterForget = new List<string>();
        await forgotten.Deliver("a", (_, arguments) => { afterForget.Add(arguments[1]!.GetValue<string>()); return Ack(true); });
        check(afterForget.SequenceEqual(["new generation"]), "Forget 뒤 새 target 세대와 같은 키를 이전 in-flight ACK가 지우지 않음");
        await forgotten.Deliver("b", (_, arguments) =>
        {
            check(arguments[1]?.GetValue<string>() == "other", "Forget는 지정 target만 제거하고 다른 창의 응답을 보존");
            return Ack(true);
        });

        var clock = new ManualTime();
        var expiring = new RendererReplies(clock);
        expiring.Enqueue("a", "request", null, null);
        clock.Advance(RendererReplies.Lifetime - TimeSpan.FromTicks(1));
        var beforeExpiry = 0;
        await expiring.Deliver("a", (_, _) => { beforeExpiry++; return Ack(false); });
        check(beforeExpiry == 1, "응답은 16분 경계 직전까지 보존");
        clock.Advance(TimeSpan.FromTicks(1));
        var expiredCalls = 0;
        await expiring.Deliver("a", (_, _) => { expiredCalls++; return Ack(true); });
        check(expiredCalls == 0, "정확히 16분이 지나면 만료 응답을 전달하지 않음");

        var budgetClock = new ManualTime();
        var bounded = new RendererReplies(budgetClock);
        for (var index = 0; index < RendererReplies.MaximumEntries; index++)
            bounded.Enqueue("target-" + (index % 2), "request-" + index, JsonValue.Create(index), null);
        bounded.Enqueue("target-0", "request-0", JsonValue.Create("updated at capacity"), null);
        await Throws<InvalidDataException>(() => { bounded.Enqueue("new-target", "overflow", null, null); return Task.CompletedTask; });
        check(true, "전체 256개 한도에서는 새 entry를 명시 거부하고 같은 키 갱신은 허용");
        var atCapacity = new List<string>();
        await bounded.Deliver("target-0", (_, arguments) =>
        {
            atCapacity.Add(arguments[0]!.GetValue<string>());
            return Ack(false);
        });
        check(atCapacity.SequenceEqual(["request-2"]), "한도 거부가 기존 활성 응답을 임의로 제거하지 않고 갱신은 큐 뒤로 이동");
        bounded.Forget("target-1");
        bounded.Enqueue("new-target", "after-forget", null, null);
        var afterBudgetRelease = 0;
        await bounded.Deliver("new-target", (_, _) => { afterBudgetRelease++; return Ack(true); });
        check(afterBudgetRelease == 1, "Forget로 회수한 슬롯을 새로운 응답에 재사용");
        budgetClock.Advance(RendererReplies.Lifetime);
        bounded.Enqueue("new-target", "after-expiry", null, null);
        var expiredOld = 0;
        await bounded.Deliver("target-0", (_, _) => { expiredOld++; return Ack(true); });
        check(expiredOld == 0, "enqueue 때 전체 target의 만료 entry를 정리하여 용량 회수");

        var batch = new RendererReplies();
        for (var index = 0; index < RendererReplies.MaximumDeliveryBatch + 3; index++) batch.Enqueue("a", "r" + index, null, null);
        var batchCalls = 0;
        await batch.Deliver("a", (_, _) => { batchCalls++; return Ack(true); });
        check(batchCalls == RendererReplies.MaximumDeliveryBatch, "한 Deliver는 최대 16개만 처리하여 복구 루프 작업을 제한");
        var remaining = 0;
        await batch.Deliver("a", (_, _) => { remaining++; return Ack(true); });
        check(remaining == 3, "batch 제한 뒤 남은 응답은 다음 pass에서 손실 없이 전달");
        var passClock = new ManualTime();
        var pass = new RendererReplies(passClock);
        for (var index = 0; index < 4; index++) pass.Enqueue("a", "r" + index, null, null);
        var timedCalls = 0;
        await pass.Deliver("a", (_, _) => { timedCalls++; passClock.Advance(TimeSpan.FromSeconds(1)); return Ack(true); });
        check(timedCalls == 2, "pass의 누적 시간이 2초에 도달하면 새로운 전달을 시작하지 않음");
        var timedRemaining = 0;
        await pass.Deliver("a", (_, _) => { timedRemaining++; return Ack(true); });
        check(timedRemaining == 2, "시간 예산으로 연기한 응답도 다음 pass에 유지");

        await Throws<InvalidDataException>(() => { replies.Enqueue("", "r", null, null); return Task.CompletedTask; });
        await Throws<InvalidDataException>(() => { replies.Enqueue("a", " ", null, null); return Task.CompletedTask; });
        check(true, "빈 target 또는 request 식별자는 큐 변경 전에 거부");
        await CheckResponseFunction(check);
    }

    private static Task<JsonNode?> Ack(bool value) => Task.FromResult<JsonNode?>(JsonValue.Create(value));

    private static async Task Throws<T>(Func<Task> action) where T : Exception
    {
        try { await action(); }
        catch (T) { return; }
        throw new Exception("Expected " + typeof(T).Name);
    }

    private static async Task CheckResponseFunction(Action<bool, string> check)
    {
        var start = new ProcessStartInfo("node") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        start.ArgumentList.Add("-e");
        start.ArgumentList.Add("const fn=eval('('+process.argv[1]+')');const out={};out.absent=fn.call({},'r',null,null)===false;out.notMap=fn.call({__coskin:{pending:{},response(){throw Error('unexpected')}}},'r',null,null)===false;let calls=[];const c={pending:new Map([['Exact:1',{}]]),response(id,result,error){calls.push({id,result,error});this.pending.delete(id)}};const w={__coskin:c};out.noPending=fn.call(w,'exact:1',null,null)===true&&calls.length===0&&c.pending.size===1;out.delivered=fn.call(w,'Exact:1',{saved:true},null)===true&&calls.length===1&&calls[0].id==='Exact:1'&&calls[0].result.saved===true&&!c.pending.has('Exact:1');out.duplicate=fn.call(w,'Exact:1',null,null)===true&&calls.length===1;c.pending.set('error',{});out.error=fn.call(w,'error',null,{code:'saved-error'})===true&&calls[1].error.code==='saved-error';out.newController=fn.call({__coskin:{pending:new Map(),response(){throw Error('unexpected')}}},'Exact:1',null,null)===true;console.log(JSON.stringify(out));");
        start.ArgumentList.Add(RendererReplies.ResponseFunction);
        using var child = Process.Start(start) ?? throw new Exception("순수 Node 응답 함수 검사를 시작하지 못했습니다.");
        var output = child.StandardOutput.ReadToEndAsync();
        var errors = child.StandardError.ReadToEndAsync();
        try { await child.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10)); }
        catch
        {
            if (!child.HasExited) child.Kill();
            throw;
        }
        var stderr = await errors;
        if (child.ExitCode != 0) throw new Exception("순수 Node 응답 함수 검사: " + stderr);
        var actual = JsonNode.Parse(await output)!.AsObject();
        check(actual["absent"]!.GetValue<bool>() && actual["notMap"]!.GetValue<bool>(), "실제 JS 함수는 Controller 또는 Map 미준비 시 false를 반환");
        check(actual["noPending"]!.GetValue<bool>() && actual["newController"]!.GetValue<bool>(), "실제 JS 함수는 exact pending ID 부재 또는 새 Controller에서 호출 없이 ACK");
        check(actual["delivered"]!.GetValue<bool>() && actual["duplicate"]!.GetValue<bool>() && actual["error"]!.GetValue<bool>(), "실제 JS 함수는 pending ID에 성공·오류를 한 번 전달하고 중복 요청을 무시");
    }

    private sealed class ManualTime : TimeProvider
    {
        private long ticks;
        public override long TimestampFrequency => TimeSpan.TicksPerSecond;
        public override long GetTimestamp() => ticks;
        internal void Advance(TimeSpan duration) => ticks += duration.Ticks;
    }
}

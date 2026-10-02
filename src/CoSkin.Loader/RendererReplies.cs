using System.Text.Json.Nodes;

namespace CoSkin;

/// <summary>Keeps completed responses until the same renderer acknowledges their pending request.</summary>
internal sealed class RendererReplies
{
    internal const int MaximumEntries = 256;
    internal const int MaximumDeliveryBatch = 16;
    internal static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(16);
    internal static readonly TimeSpan DeliveryPassBudget = TimeSpan.FromSeconds(2);
    internal const string ResponseFunction = "function(requestId,result,error){const controller=this.__coskin;if(!controller||!(controller.pending instanceof Map)||typeof controller.response!==\"function\")return false;if(!controller.pending.has(requestId))return true;controller.response(requestId,result,error);return true;}";

    private sealed record Reply(string RequestId, JsonNode? Result, JsonNode? Error, long Created, long Sequence);
    private sealed class Target
    {
        internal readonly Dictionary<string, Reply> Replies = new(StringComparer.Ordinal);
        internal readonly SemaphoreSlim Delivery = new(1, 1);
    }

    private readonly object sync = new();
    private readonly Dictionary<string, Target> targets = new(StringComparer.Ordinal);
    private readonly TimeProvider time;
    private int count;
    private long sequence;

    internal RendererReplies(TimeProvider? time = null) => this.time = time ?? TimeProvider.System;

    internal void Enqueue(string targetId, string requestId, JsonNode? result, JsonNode? error)
    {
        if (!TryEnqueue(targetId, requestId, result, error))
            throw new InvalidDataException("미전달 응답 보관 한도를 초과했습니다. 기존 응답은 보존됩니다.");
    }

    internal bool TryEnqueue(string targetId, string requestId, JsonNode? result, JsonNode? error)
    {
        ValidateId(targetId);
        ValidateId(requestId);
        lock (sync)
        {
            Expire();
            var existing = targets.TryGetValue(targetId, out var target) && target.Replies.ContainsKey(requestId);
            if (!existing && count >= MaximumEntries)
                return false;
            // Clone before changing the queue so a failed clone cannot replace a valid response.
            var reply = new Reply(requestId, result?.DeepClone(), error?.DeepClone(), time.GetTimestamp(), ++sequence);
            if (target is null) targets.Add(targetId, target = new Target());
            target.Replies[requestId] = reply;
            if (!existing) count++;
            return true;
        }
    }

    internal async Task Deliver(string targetId, Func<string, JsonArray, Task<JsonNode?>> invoke)
    {
        ValidateId(targetId);
        ArgumentNullException.ThrowIfNull(invoke);
        Target target;
        lock (sync)
        {
            Expire();
            if (!targets.TryGetValue(targetId, out target!)) return;
            // Acquire under the queue lock: expiry/Forget cannot replace this target in between.
            if (!target.Delivery.Wait(0)) return;
        }
        var released = false;
        void ReleaseDelivery()
        {
            target.Delivery.Release();
            RemoveEmptyTarget(targetId, target);
            released = true;
        }
        try
        {
            var started = time.GetTimestamp();
            var attempted = new HashSet<string>(StringComparer.Ordinal);
            while (attempted.Count < MaximumDeliveryBatch)
            {
                Reply? reply;
                lock (sync)
                {
                    Expire();
                    if (!targets.TryGetValue(targetId, out var currentTarget) || !ReferenceEquals(currentTarget, target)) return;
                    if (attempted.Count > 0 && time.GetElapsedTime(started) >= DeliveryPassBudget) return;
                    // A renderer response can complete its next host request before the native ACK returns.
                    // Refresh the queue while retaining the batch/time bounds and avoiding a second attempt for the same ID.
                    reply = target.Replies.Values.Where(item => !attempted.Contains(item.RequestId)).OrderBy(item => item.Sequence).FirstOrDefault();
                    if (reply is null)
                    {
                        // Release under the same lock as the empty check: a new enqueue must either join this pass
                        // or acquire the gate itself, rather than losing its wake-up between return and finally.
                        ReleaseDelivery();
                        return;
                    }
                }
                attempted.Add(reply.RequestId);
                // Each attempt owns its argument nodes; an invoke callback cannot mutate a retry.
                var acknowledged = await invoke(ResponseFunction,
                    new JsonArray(JsonValue.Create(reply.RequestId), reply.Result?.DeepClone(), reply.Error?.DeepClone()));
                if (acknowledged is not JsonValue value || !value.TryGetValue<bool>(out var accepted))
                    throw new InvalidDataException("미전달 응답 확인 값이 올바르지 않습니다.");
                if (!accepted) return;
                lock (sync)
                {
                    if (targets.TryGetValue(targetId, out var currentTarget) && ReferenceEquals(currentTarget, target) &&
                        target.Replies.TryGetValue(reply.RequestId, out var current) && ReferenceEquals(current, reply))
                    {
                        target.Replies.Remove(reply.RequestId);
                        count--;
                    }
                }
            }
        }
        finally
        {
            lock (sync)
            {
                if (!released) ReleaseDelivery();
            }
        }
    }

    internal void Forget(string targetId)
    {
        ValidateId(targetId);
        lock (sync)
        {
            if (!targets.Remove(targetId, out var target)) return;
            count -= target.Replies.Count;
            target.Replies.Clear();
            // An in-flight Deliver still owns the gate. Let its continuation release it safely.
        }
    }

    private void Expire()
    {
        var now = time.GetTimestamp();
        foreach (var (targetId, target) in targets.ToArray())
        {
            foreach (var reply in target.Replies.Values.ToArray())
                if (time.GetElapsedTime(reply.Created, now) >= Lifetime)
                {
                    target.Replies.Remove(reply.RequestId);
                    count--;
                }
            RemoveEmptyTarget(targetId, target);
        }
    }

    private void RemoveEmptyTarget(string targetId, Target target)
    {
        if (target.Replies.Count == 0 && target.Delivery.CurrentCount == 1 &&
            targets.TryGetValue(targetId, out var current) && ReferenceEquals(current, target))
            targets.Remove(targetId);
    }

    private static void ValidateId(string id)
    {
        if (string.IsNullOrWhiteSpace(id)) throw new InvalidDataException("응답의 창과 요청 식별자가 필요합니다.");
    }
}

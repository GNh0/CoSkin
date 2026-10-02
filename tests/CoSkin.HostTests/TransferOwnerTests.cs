using CoSkin;

internal static class TransferOwnerTests
{
    private const string OwnerA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private const string OwnerB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    internal static async Task Run(Action<bool, string> check, string scratch)
    {
        void Reject(Action operation, string name)
        {
            try { operation(); }
            catch (InvalidDataException) { check(true, name); return; }
            check(false, name);
        }

        var parent = Path.Combine(scratch, "transfer-owner-tests");
        Directory.CreateDirectory(parent);
        using (var store = new TransferStore(parent))
        {
            var a1 = store.Stage([1, 2], owner: OwnerA.ToUpperInvariant());
            var a2 = store.Begin(3, owner: OwnerA);
            var b = store.Stage([4, 5], owner: OwnerB);
            var legacy = store.Stage([6, 7]);
            check(store.CancelOwner(OwnerA) == 2, "창 취소는 대소문자 정규화 후 그 창의 현재 전송만 모두 해제");
            Reject(() => store.Read(a1, 0), "취소 창의 완료 토큰 재사용 거부");
            Reject(() => store.Append(a2, 0, [1]), "취소 창의 진행 중 토큰 재사용 거부");
            check(store.Consume(b).SequenceEqual(new byte[] { 4, 5 }) &&
                  store.Consume(legacy).SequenceEqual(new byte[] { 6, 7 }), "다른 창 및 기존 owner 없는 전송은 취소되지 않음");
            Reject(() => store.Begin(1, owner: OwnerA), "창 취소 이후 늦게 도착한 Begin 예약 거부");
            Reject(() => store.Stage([8], owner: OwnerA), "창 취소 이후 늦게 도착한 Stage 예약 거부");
            using var lateAsset = new BlockingReadStream([8]);
            Reject(() => store.StageAsset(lateAsset, Package.Hash([8]), owner: OwnerA), "창 취소 이후 늦은 StageAsset은 원본 Read 이전 거부");
            check(!lateAsset.ReadEntered.IsSet, "취소된 창의 늦은 자산 전송은 원본 스트림을 읽지 않음");
            foreach (var invalid in new[] { "", "not-a-controller", Guid.NewGuid().ToString("D"), new string('g', 32), new string('0', 31) })
                Reject(() => store.Begin(1, owner: invalid), "32자리 hex가 아닌 전송 창 식별자 거부");
            Reject(() => store.CancelOwner(null!), "owner 없는 기존 전송을 일괄 취소할 수 없음");
        }

        using (var store = new TransferStore(parent))
        using (var staging = new BlockingReadStream(new byte[TransferStore.LargeChunkBytes + 1]))
        {
            var task = Task.Run(() => store.StageAsset(staging, Package.Hash(new byte[TransferStore.LargeChunkBytes + 1]),
                TransferStore.LargeChunkBytes, OwnerA));
            try
            {
                check(staging.ReadEntered.Wait(TimeSpan.FromSeconds(10)), "자산 StageAsset의 원본 Read 중간 지점에 동기화");
                check(store.CancelOwner(OwnerA) == 1, "진행 중 자산 전송을 기다리지 않고 그 창의 예약 취소");
            }
            finally { staging.Release.Set(); }
            try { _ = await task.WaitAsync(TimeSpan.FromSeconds(10)); check(false, "취소 중이던 staging 성공 금지"); }
            catch (InvalidDataException) { check(true, "늦게 끝난 원본 Read는 취소된 토큰을 되살리지 않음"); }
            var slots = Enumerable.Range(0, 8).Select(_ => store.Begin(1, owner: OwnerB)).ToArray();
            check(slots.Length == 8, "staging 취소 race 후 여덟 전송 슬롯과 예약 용량 즉시 재사용");
            foreach (var token in slots) store.Cancel(token);
            var budgetA = store.Begin(Package.MaxPackage, owner: OwnerB);
            var budgetB = store.Begin(Package.MaxPackage, owner: OwnerB);
            check(true, "staging 취소 race 후 두 최대 크기 예약으로 전송 예산 전부 재사용");
            store.Cancel(budgetA); store.Cancel(budgetB);
            check(Directory.GetDirectories(parent, "transfers-*").All(path => !Directory.EnumerateFiles(path).Any()),
                "staging 취소 race 후 파생 임시파일을 남기지 않음");
        }

        using (var store = new TransferStore(parent))
        {
            var payload = new byte[1024 * 1024];
            var token = store.Stage(payload, owner: OwnerA);
            var before = GC.GetAllocatedBytesForCurrentThread();
            Reject(() => store.Consume(token, 16), "완료된 전송도 작업별 소비 제한 초과 시 거부");
            var allocated = GC.GetAllocatedBytesForCurrentThread() - before;
            check(allocated < payload.Length / 2, "소비 제한은 원본 전체 파일 배열을 할당하기 전에 검사");
            Reject(() => store.Read(token, 0), "소비 제한 초과 파일은 토큰과 예약도 함께 취소");
            var incomplete = store.Begin(1024, owner: OwnerB);
            Reject(() => store.Consume(incomplete, 16), "미완료 대형 예약도 파일 읽기 이전 크기 검사로 취소");
            Reject(() => store.Append(incomplete, 0, [1]), "제한으로 취소한 미완료 예약 재사용 거부");
            var exact = store.Stage([1, 2, 3]);
            check(store.Consume(exact, 3).SequenceEqual(new byte[] { 1, 2, 3 }), "소비 한도와 같은 길이는 기존 전체 바이트 보존");
            var slots = Enumerable.Range(0, 8).Select(_ => store.Begin(1)).ToArray();
            check(slots.Length == 8, "소비 제한 거절 이후 동시 전송 슬롯 즉시 재사용");
            foreach (var value in slots) store.Cancel(value);
            var budgetA = store.Begin(Package.MaxPackage);
            var budgetB = store.Begin(Package.MaxPackage);
            check(true, "소비 제한 거절 이후 예약 용량 전부 재사용");
            store.Cancel(budgetA); store.Cancel(budgetB);
        }

        var clock = new ManualTransferTime();
        using (var store = new TransferStore(parent, clock))
        {
            store.CancelOwner(OwnerA);
            check(store.IsOwnerCanceled(OwnerA.ToUpperInvariant()), "창 취소 직후 소유자 취소 상태 조회는 정규화 후 true");
            check(!store.IsOwnerCanceled(OwnerB) && !store.IsOwnerCanceled(null), "다른 창 및 owner 없는 전송은 취소 상태 false");
            clock.Advance(TimeSpan.FromSeconds(119));
            Reject(() => store.Begin(1, owner: OwnerA), "취소 창 봉인은 2분 보관 시간 동안 유지");
            clock.Advance(TimeSpan.FromSeconds(1));
            check(!store.IsOwnerCanceled(OwnerA), "2분 봉인 만료 후 소유자 취소 상태 조회는 false");
            var reopened = store.Begin(1, owner: OwnerA);
            store.Cancel(reopened);
            check(true, "2분이 지난 취소 창 봉인은 만료되어 재사용 가능");
            for (var i = 0; i < TransferStore.MaxOwnerTombstones; i++)
                store.CancelOwner(i.ToString("x32"));
            var boundedOwner = "cccccccccccccccccccccccccccccccc";
            Reject(() => store.CancelOwner(boundedOwner), "취소 창 보관 한도에서 살아있는 봉인을 조기 삭제하지 않음");
            check(store.CancelOwner("00000000000000000000000000000000") == 0, "보관 한도 안의 기존 창은 추가 공간 없이 재봉인 가능");
            Reject(() => store.Begin(1, owner: "00000000000000000000000000000000"), "보관 한도 도달 후에도 최초 취소 창 봉인 보존");
            var other = store.Stage([9], owner: boundedOwner);
            var legacy = store.Stage([10]);
            check(store.Consume(other)[0] == 9 && store.Consume(legacy)[0] == 10, "취소 창 보관 한도는 다른 창과 legacy 전송에 영향 없음");
            clock.Advance(TimeSpan.FromMinutes(2));
            check(store.CancelOwner(boundedOwner) == 0, "만료된 취소 창 기록을 제거해 보관 용량 회복");
        }
    }

    private sealed class ManualTransferTime : TimeProvider
    {
        private DateTimeOffset now = new(2026, 10, 2, 0, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => now;
        internal void Advance(TimeSpan duration) => now += duration;
    }

    private sealed class BlockingReadStream(byte[] bytes) : MemoryStream(bytes, writable: false)
    {
        internal readonly ManualResetEventSlim ReadEntered = new();
        internal readonly ManualResetEventSlim Release = new();
        public override int Read(byte[] buffer, int offset, int count)
        {
            ReadEntered.Set();
            if (!Release.Wait(TimeSpan.FromSeconds(10))) throw new TimeoutException("테스트 staging Read 동기화 시간 초과");
            return base.Read(buffer, offset, count);
        }
        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            if (disposing)
            {
                ReadEntered.Dispose();
                Release.Dispose();
            }
        }
    }
}

using System.Reflection.PortableExecutable;
using System.Text;
namespace CoSkin;

/// <summary>Read-only x64 export-contract probe; does not load or execute chrome.dll.</summary>
internal static class NativeAbi
{
    internal static readonly IReadOnlyList<string> RequiredExports = Array.AsReadOnly(new[]
    {
        "?TryGetCurrent@Isolate@v8@@SAPEAV12@XZ",
        "?GetCurrentContext@Isolate@v8@@QEAA?AV?$Local@VContext@v8@@@2@XZ",
        "??0HandleScope@v8@@QEAA@PEAVIsolate@1@@Z",
        "??1HandleScope@v8@@QEAA@XZ",
        "??0TryCatch@v8@@QEAA@PEAVIsolate@1@@Z",
        "??1TryCatch@v8@@QEAA@XZ",
        "?HasCaught@TryCatch@v8@@QEBA_NXZ",
        "?NewFromUtf8@String@v8@@SA?AV?$MaybeLocal@VString@v8@@@2@PEAVIsolate@2@PEBDW4NewStringType@2@H@Z",
        "?Compile@Script@v8@@SA?AV?$MaybeLocal@VScript@v8@@@2@V?$Local@VContext@v8@@@2@V?$Local@VString@v8@@@2@PEAVScriptOrigin@2@@Z",
        "?Run@Script@v8@@QEAA?AV?$MaybeLocal@VValue@v8@@@2@V?$Local@VContext@v8@@@2@@Z"
    });

    internal static void Verify(string path)
    {
        if (File.GetAttributes(path).HasFlag(FileAttributes.ReparsePoint))
            throw new InvalidDataException("Codex 런타임에 파일 연결을 사용할 수 없습니다.");
        using var input = File.OpenRead(path);
        Verify(input);
    }

    internal static void Verify(Stream input)
    {
        try
        {
            using var pe = new PEReader(input, PEStreamOptions.LeaveOpen);
            var headers = pe.PEHeaders;
            if (headers.CoffHeader.Machine != Machine.Amd64 || headers.PEHeader?.Magic != PEMagic.PE32Plus ||
                !headers.CoffHeader.Characteristics.HasFlag(Characteristics.Dll))
                throw new BadImageFormatException("x64 runtime required");
            var directory = headers.PEHeader.ExportTableDirectory;
            if (directory.RelativeVirtualAddress <= 0 || directory.Size < 40)
                throw new BadImageFormatException("missing runtime exports");
            using var reader = new BinaryReader(input, Encoding.ASCII, leaveOpen: true);
            long Offset(uint rva, long bytes, bool executable = false)
            {
                foreach (var section in headers.SectionHeaders)
                {
                    long relative = (long)rva - section.VirtualAddress;
                    if (relative < 0 || bytes < 0 || relative > section.SizeOfRawData - bytes) continue;
                    if (executable && !section.SectionCharacteristics.HasFlag(SectionCharacteristics.MemExecute)) break;
                    long offset = section.PointerToRawData + relative;
                    if (offset < 0 || offset > input.Length - bytes) break;
                    return offset;
                }
                throw new BadImageFormatException("runtime export outside file section");
            }
            uint U32(uint rva) { input.Position = Offset(rva, 4); return reader.ReadUInt32(); }
            ushort U16(uint rva) { input.Position = Offset(rva, 2); return reader.ReadUInt16(); }
            uint At(uint start, uint index, uint stride) => checked(start + index * stride);
            uint table = (uint)directory.RelativeVirtualAddress;
            uint functions = U32(At(table, 20, 1)), names = U32(At(table, 24, 1));
            uint functionTable = U32(At(table, 28, 1)), nameTable = U32(At(table, 32, 1)), ordinalTable = U32(At(table, 36, 1));
            if (functions == 0 || functions > 100_000 || names == 0 || names > 100_000)
                throw new BadImageFormatException("invalid runtime export count");
            Offset(functionTable, functions * 4L); Offset(nameTable, names * 4L); Offset(ordinalTable, names * 2L);
            var missing = new HashSet<string>(RequiredExports, StringComparer.Ordinal);
            for (uint i = 0; i < names && missing.Count > 0; i++)
            {
                uint nameRva = U32(At(nameTable, i, 4));
                var name = new StringBuilder();
                for (uint j = 0; ; j++)
                {
                    if (j >= 1024) throw new BadImageFormatException("oversized runtime export name");
                    input.Position = Offset(At(nameRva, j, 1), 1);
                    byte value = reader.ReadByte();
                    if (value == 0) break;
                    if (value > 127) throw new BadImageFormatException("non-ASCII runtime export");
                    name.Append((char)value);
                }
                if (!missing.Contains(name.ToString())) continue;
                uint ordinal = U16(At(ordinalTable, i, 2));
                if (ordinal >= functions) throw new BadImageFormatException("invalid runtime export ordinal");
                uint function = U32(At(functionTable, ordinal, 4));
                if (function >= table && function < (long)table + directory.Size)
                    throw new BadImageFormatException("forwarded runtime ABI export");
                Offset(function, 1, executable: true);
                missing.Remove(name.ToString());
            }
            if (missing.Count > 0) throw new BadImageFormatException("required runtime ABI exports unavailable");
        }
        catch (Exception error) when (error is BadImageFormatException or EndOfStreamException or OverflowException)
        {
            throw new TrayActionException("incompatible-runtime");
        }
    }
}

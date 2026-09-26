using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.IO.Compression;
using System.Diagnostics;

const string keyName = "CoSkin.GitHubReleasePublisher.v1";
if (args.Length is not (2 or 5)) throw new InvalidDataException("Usage: initialize PUBLIC-SPKI | sign VERSION ZIP MANIFEST PUBLIC-SPKI");
if (args[0] != "initialize" && args[0] != "sign") throw new InvalidDataException("Unknown publisher command");
var exists = CngKey.Exists(keyName, CngProvider.MicrosoftSoftwareKeyStorageProvider);
if (!exists && args[0] != "initialize") throw new InvalidDataException("Initialize the current user's publisher key first.");
using var key = exists ? CngKey.Open(keyName, CngProvider.MicrosoftSoftwareKeyStorageProvider) : CngKey.Create(CngAlgorithm.ECDsaP256, keyName, new CngKeyCreationParameters { Provider = CngProvider.MicrosoftSoftwareKeyStorageProvider, KeyUsage = CngKeyUsages.Signing, ExportPolicy = CngExportPolicies.None });
using var signer = new ECDsaCng(key);
var publicKey = signer.ExportSubjectPublicKeyInfo();
var publicFile = Path.GetFullPath(args[^1]);
if (File.Exists(publicFile) && !File.ReadAllBytes(publicFile).SequenceEqual(publicKey)) throw new InvalidDataException("This user key does not match the repository publisher. Do not replace an existing publisher key.");
if (args[0] == "initialize")
{
    if (!File.Exists(publicFile)) { using var file = new FileStream(publicFile, FileMode.CreateNew); file.Write(publicKey); }
    Console.WriteLine("Publisher initialized. Private key stays in the current user's Windows key store and cannot be exported.");
    return;
}
if (!File.Exists(publicFile)) throw new InvalidDataException("Publisher SPKI is required.");
var version = args[1];
if (!System.Text.RegularExpressions.Regex.IsMatch(version, @"^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$")) throw new InvalidDataException("Stable SemVer is required.");
var zip = Path.GetFullPath(args[2]);
using (var archive = ZipFile.OpenRead(zip))
{
    if (!archive.Entries.Select(e => e.FullName).Order(StringComparer.Ordinal).SequenceEqual(new[] { "CoSkin.Loader.exe", "THIRD-PARTY-NOTICES.txt", "renderer.js" })) throw new InvalidDataException("Only the three public runtime files belong in a release.");
    var temporary = Path.Combine(Path.GetTempPath(), "coskin-publisher-" + Guid.NewGuid().ToString("N") + ".exe");
    try
    {
        archive.GetEntry("CoSkin.Loader.exe")!.ExtractToFile(temporary);
        if (FileVersionInfo.GetVersionInfo(temporary).ProductVersion?.Split('+')[0] != version) throw new InvalidDataException("Release executable and manifest versions differ.");
    }
    finally { if (File.Exists(temporary)) File.Delete(temporary); }
}
var size = new FileInfo(zip).Length;
if (size is <= 0 or > 200L * 1024 * 1024) throw new InvalidDataException("Release size limit exceeded.");
using var input = File.OpenRead(zip);
var hash = Convert.ToHexString(SHA256.HashData(input)).ToLowerInvariant();
var url = $"https://github.com/GNh0/CoSkin/releases/download/v{version}/coskin-win-x64.zip";
var canonical = Encoding.UTF8.GetBytes($"coskin-update-v1\n{version}\n{url}\n{size}\n{hash}\n");
var signature = signer.SignData(canonical, HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation);
if (!signer.VerifyData(canonical, signature, HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation)) throw new CryptographicException("Signature self-check failed.");
var manifest = new JsonObject { ["formatVersion"] = 1, ["version"] = version, ["payload"] = url, ["bytes"] = size, ["sha256"] = hash, ["signature"] = Convert.ToBase64String(signature) };
using var output = new FileStream(Path.GetFullPath(args[3]), FileMode.CreateNew);
output.Write(Encoding.UTF8.GetBytes(manifest.ToJsonString()));
Console.WriteLine("Signed " + version + " release manifest.");

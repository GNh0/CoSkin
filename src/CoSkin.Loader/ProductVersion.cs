namespace CoSkin;

internal static class ProductVersion
{
    internal static string Display => typeof(ProductVersion).Assembly.GetCustomAttributes(typeof(System.Reflection.AssemblyInformationalVersionAttribute), false)
        .OfType<System.Reflection.AssemblyInformationalVersionAttribute>().FirstOrDefault()?.InformationalVersion.Split('+')[0] ?? "CoSkin";
}

using System;
using System.Collections.Generic;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Wrapped.Core.configuration;

namespace Wrapped.Core;

public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(
        IApplicationPaths applicationPaths,
        IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public static Plugin? Instance { get; private set; }

    public override string Name => "Jelly-Wrapped";

    public override Guid Id =>
        Guid.Parse("5F84D6A7-2C91-47B3-A65E-841E9D42F731");

    public override string Description =>
        "Build beautiful Jelly-Wrapped slides with per-user controls and library statistics.";

    public IEnumerable<PluginPageInfo> GetPages()
    {
        yield return new PluginPageInfo
        {
            Name = "Wrapped",
            DisplayName = "Wrapped",
            EmbeddedResourcePath = "Wrapped.Core.Web.config.html"
        };

        // Jellyfin's plugin-page controller loader resolves
        // data-controller="__plugin/standardcore.js" through this resource.
        yield return new PluginPageInfo
        {
            Name = "standardcore.js",
            EmbeddedResourcePath = "Wrapped.Core.Web.standardcore.js"
        };
    }
}

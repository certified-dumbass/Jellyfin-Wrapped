using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;
using Wrapped.Core.Services;

namespace Wrapped.Core;

/// <summary>
/// Registers the Standard Core services with Jellyfin's
/// dependency injection container.
/// </summary>
public class StandardServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(
        IServiceCollection serviceCollection,
        IServerApplicationHost applicationHost)
    {
        // Keeps track of Standard plugins and their current status.
        serviceCollection.AddSingleton<PluginRegistryService>();

        // Central notification system used by Standard Core
        // and eventually other Standard plugins.
        serviceCollection.AddSingleton<NotificationService>();

        // Main Standard Core service.
        serviceCollection.AddSingleton<StandardService>();
    }
}
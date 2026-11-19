using System;
using System.Collections.Generic;
using Wrapped.Core.Models;

namespace Wrapped.Core.Services;

/// <summary>
/// Central service for Standard Core.
/// Provides access to the plugin registry, notifications,
/// and general Core information.
/// </summary>
public class StandardService
{
    private readonly PluginRegistryService _pluginRegistry;
    private readonly NotificationService _notificationService;

    public StandardService(
        PluginRegistryService pluginRegistry,
        NotificationService notificationService)
    {
        _pluginRegistry = pluginRegistry;
        _notificationService = notificationService;
    }

    /// <summary>
    /// Returns the current Standard Core version.
    /// </summary>
    public string CoreVersion => "1.15.0";

    /// <summary>
    /// Returns whether Standard Core is running.
    /// </summary>
    public bool IsRunning => true;

    /// <summary>
    /// Returns all plugins currently registered with Standard Core.
    /// </summary>
    public IReadOnlyList<StandardPlugin> GetRegisteredPlugins()
    {
        return _pluginRegistry.GetPlugins();
    }

    /// <summary>
    /// Returns the current status of Standard Core.
    /// </summary>
    public ServiceStatus GetCoreStatus()
    {
        return new ServiceStatus
        {
            Name = "standard-core",
            DisplayName = "Standard Core",
            Version = CoreVersion,
            IsAvailable = true,
            IsEnabled = true,
            StatusMessage = "Standard Core is running.",
            LastChecked = DateTime.UtcNow
        };
    }

    /// <summary>
    /// Registers another Standard plugin with Core.
    /// </summary>
    public void RegisterPlugin(StandardPlugin plugin)
    {
        _pluginRegistry.RegisterPlugin(plugin);

        _notificationService.Success(
            "Plugin connected",
            $"{plugin.DisplayName} connected to Standard Core.",
            "Standard Core");
    }

    /// <summary>
    /// Removes a plugin from the Core registry.
    /// </summary>
    public bool UnregisterPlugin(Guid pluginId)
    {
        var plugin = _pluginRegistry.GetPlugin(pluginId);

        if (plugin is null)
        {
            return false;
        }

        var removed = _pluginRegistry.UnregisterPlugin(pluginId);

        if (removed)
        {
            _notificationService.Info(
                "Plugin disconnected",
                $"{plugin.DisplayName} disconnected from Standard Core.",
                "Standard Core");
        }

        return removed;
    }

    /// <summary>
    /// Creates an informational Core notification.
    /// </summary>
    public void Notify(
        string title,
        string message,
        string source = "Standard Core")
    {
        _notificationService.Info(
            title,
            message,
            source);
    }
}
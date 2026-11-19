using System;
using System.Collections.Generic;
using System.Linq;
using Wrapped.Core.Models;

namespace Wrapped.Core.Services;

public class PluginRegistryService
{
    private readonly List<StandardPlugin> _plugins = new();
    private readonly object _lock = new();

    /// <summary>
    /// Registers a plugin with Standard Core.
    /// If the plugin already exists, its information is updated.
    /// </summary>
    public void RegisterPlugin(StandardPlugin plugin)
    {
        ArgumentNullException.ThrowIfNull(plugin);

        lock (_lock)
        {
            var existingPlugin = _plugins.FirstOrDefault(x => x.Id == plugin.Id);

            if (existingPlugin is null)
            {
                plugin.LastChecked = DateTime.UtcNow;
                _plugins.Add(plugin);
                return;
            }

            existingPlugin.Name = plugin.Name;
            existingPlugin.DisplayName = plugin.DisplayName;
            existingPlugin.Version = plugin.Version;
            existingPlugin.Description = plugin.Description;
            existingPlugin.IsAvailable = plugin.IsAvailable;
            existingPlugin.IsEnabled = plugin.IsEnabled;
            existingPlugin.LastChecked = DateTime.UtcNow;
        }
    }

    /// <summary>
    /// Removes a plugin from the registry.
    /// </summary>
    public bool UnregisterPlugin(Guid pluginId)
    {
        lock (_lock)
        {
            var plugin = _plugins.FirstOrDefault(x => x.Id == pluginId);

            if (plugin is null)
            {
                return false;
            }

            return _plugins.Remove(plugin);
        }
    }

    /// <summary>
    /// Returns all registered Standard plugins.
    /// </summary>
    public IReadOnlyList<StandardPlugin> GetPlugins()
    {
        lock (_lock)
        {
            return _plugins
                .Select(ClonePlugin)
                .ToList()
                .AsReadOnly();
        }
    }

    /// <summary>
    /// Returns a specific registered plugin.
    /// </summary>
    public StandardPlugin? GetPlugin(Guid pluginId)
    {
        lock (_lock)
        {
            var plugin = _plugins.FirstOrDefault(x => x.Id == pluginId);

            return plugin is null
                ? null
                : ClonePlugin(plugin);
        }
    }

    /// <summary>
    /// Updates the current status of a registered plugin.
    /// </summary>
    public bool UpdateStatus(
        Guid pluginId,
        bool isAvailable,
        bool isEnabled)
    {
        lock (_lock)
        {
            var plugin = _plugins.FirstOrDefault(x => x.Id == pluginId);

            if (plugin is null)
            {
                return false;
            }

            plugin.IsAvailable = isAvailable;
            plugin.IsEnabled = isEnabled;
            plugin.LastChecked = DateTime.UtcNow;

            return true;
        }
    }

    private static StandardPlugin ClonePlugin(StandardPlugin plugin)
    {
        return new StandardPlugin
        {
            Id = plugin.Id,
            Name = plugin.Name,
            DisplayName = plugin.DisplayName,
            Version = plugin.Version,
            Description = plugin.Description,
            IsAvailable = plugin.IsAvailable,
            IsEnabled = plugin.IsEnabled,
            LastChecked = plugin.LastChecked
        };
    }
}
using System;

namespace Wrapped.Core.Models;

public class StandardPlugin
{
    /// <summary>
    /// Unique ID of the plugin.
    /// </summary>
    public Guid Id { get; set; }

    /// <summary>
    /// Internal plugin name.
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Name displayed in the Standard Core interface.
    /// </summary>
    public string DisplayName { get; set; } = string.Empty;

    /// <summary>
    /// Installed plugin version.
    /// </summary>
    public string Version { get; set; } = string.Empty;

    /// <summary>
    /// Optional description shown in the dashboard.
    /// </summary>
    public string Description { get; set; } = string.Empty;

    /// <summary>
    /// Whether the plugin is currently available.
    /// </summary>
    public bool IsAvailable { get; set; }

    /// <summary>
    /// Whether the plugin is currently enabled.
    /// </summary>
    public bool IsEnabled { get; set; }

    /// <summary>
    /// Last time the plugin status was checked.
    /// </summary>
    public DateTime LastChecked { get; set; } = DateTime.UtcNow;
}
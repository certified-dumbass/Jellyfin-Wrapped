using System;

namespace Wrapped.Core.Models;

public class ServiceStatus
{
    public string Name { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;

    public string Version { get; set; } = string.Empty;

    public bool IsAvailable { get; set; }

    public bool IsEnabled { get; set; }

    public string StatusMessage { get; set; } = string.Empty;

    public DateTime LastChecked { get; set; } = DateTime.UtcNow;
}
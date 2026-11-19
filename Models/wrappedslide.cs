namespace Wrapped.Core.Models;

/// <summary>
/// Defines one slide in a user's Wrapped presentation.
/// </summary>
public class WrappedSlide
{
    /// <summary>
    /// Unique identifier used by the editor.
    /// </summary>
    public string Id { get; set; } = Guid.NewGuid().ToString();

    /// <summary>
    /// Position of the slide in the presentation.
    /// </summary>
    public int Order { get; set; }

    /// <summary>
    /// Determines whether this slide is included.
    /// </summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// Type of statistic/content displayed.
    /// </summary>
    public string Type { get; set; } = "WatchTime";

    /// <summary>
    /// Optional custom title.
    /// </summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// Optional custom subtitle.
    /// </summary>
    public string Subtitle { get; set; } = string.Empty;

    /// <summary>
    /// Animation used when the slide appears.
    /// </summary>
    public string Animation { get; set; } = "Fade";

    /// <summary>
    /// Visual background style.
    /// </summary>
    public string BackgroundStyle { get; set; } = "Dynamic";

    /// <summary>
    /// Show artwork such as a poster or backdrop.
    /// </summary>
    public bool ShowArtwork { get; set; } = true;

    /// <summary>
    /// Show the main statistic/value.
    /// </summary>
    public bool ShowValue { get; set; } = true;

    /// <summary>
    /// Show additional details where supported.
    /// </summary>
    public bool ShowDetails { get; set; } = true;
}
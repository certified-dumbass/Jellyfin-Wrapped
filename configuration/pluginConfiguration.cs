using System.Collections.Generic;
using MediaBrowser.Model.Plugins;
using Wrapped.Core.Models;

namespace Wrapped.Core.configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    public PluginConfiguration()
    {
        WrappedEnabled = true;

        EnableAnimations = true;
        EnableGlowEffects = true;

        AutoAdvance = true;
        SlideDurationSeconds = 8;

        // IMPORTANT: keep this collection empty in the constructor.
        // Jellyfin uses XML deserialization; pre-populating this list causes
        // deserialized slides to be appended to the defaults on every load.
        Slides = new List<WrappedSlide>();
    }

    /// <summary>IDs of Jellyfin users who must not receive Wrapped.</summary>
    public List<string> ExcludedUserIds { get; set; } = new();

    /// <summary>Year used for library addition statistics; 0 = current UTC year.</summary>
    public int ReportYear { get; set; } = 0;

    public string PopupStart { get; set; } = "";
    public string PopupEnd { get; set; } = "";
    public bool AllowReplay { get; set; } = true;
    public int CounterDurationMs { get; set; } = 1100;

    public bool WrappedEnabled { get; set; }

    public bool EnableAnimations { get; set; }

    public bool EnableGlowEffects { get; set; }

    /// <summary>
    /// Automatically advance to the next Wrapped slide.
    /// </summary>
    public bool AutoAdvance { get; set; }

    /// <summary>
    /// Number of seconds before automatically advancing.
    /// </summary>
    public int SlideDurationSeconds { get; set; }

    /// <summary>
    /// Slides configured by the administrator.
    /// </summary>
    public List<WrappedSlide> Slides { get; set; }

    private static List<WrappedSlide> CreateDefaultSlides()
    {
        return new List<WrappedSlide>
        {
            new()
            {
                Order = 0,
                Type = "Intro",
                Title = "Your year on Dreamstreaming",
                Subtitle = "This was your year.",
                Animation = "Cinematic",
                BackgroundStyle = "Dynamic",
                ShowArtwork = false
            },

            new()
            {
                Order = 1,
                Type = "WatchTime",
                Title = "You watched...",
                Animation = "Counter",
                BackgroundStyle = "Gradient"
            },

            new()
            {
                Order = 2,
                Type = "MoviesWatched",
                Title = "Movie nights",
                Animation = "SlideUp",
                BackgroundStyle = "Dynamic"
            },

            new()
            {
                Order = 3,
                Type = "EpisodesWatched",
                Title = "Just one more episode...",
                Animation = "Counter",
                BackgroundStyle = "Dynamic"
            },

            new()
            {
                Order = 4,
                Type = "EpisodesAdded",
                Title = "Fresh episodes this year",
                Animation = "Counter",
                BackgroundStyle = "Gradient"
            },

            new()
            {
                Order = 5,
                Type = "MostUploadsMonth",
                Title = "Your library's busiest month",
                Animation = "Zoom",
                BackgroundStyle = "Gradient"
            },

            new()
            {
                Order = 6,
                Type = "FavoriteMovie",
                Title = "Your movie of the year",
                Animation = "Zoom",
                BackgroundStyle = "Artwork"
            },

            new()
            {
                Order = 7,
                Type = "FavoriteSeries",
                Title = "You couldn't stop watching",
                Animation = "Zoom",
                BackgroundStyle = "Artwork"
            },

            new()
            {
                Order = 8,
                Type = "FavoriteGenre",
                Title = "You had a type...",
                Animation = "Blur",
                BackgroundStyle = "Gradient"
            },

            new()
            {
                Order = 9,
                Type = "LongestBinge",
                Title = "Your longest binge",
                Animation = "Counter",
                BackgroundStyle = "Dynamic"
            },

            new()
            {
                Order = 10,
                Type = "Outro",
                Title = "That's a wrap.",
                Subtitle = "See you next year.",
                Animation = "Cinematic",
                BackgroundStyle = "Gradient",
                ShowArtwork = false
            }
        };
    }
}
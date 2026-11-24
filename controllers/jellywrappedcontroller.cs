using System.Globalization;
using Jellyfin.Database.Implementations.Enums;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using Jellyfin.Data;
using Jellyfin.Data.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;

namespace Wrapped.Core.Controllers;

[ApiController]
[Route("JellyWrapped")]
[Authorize]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class JellyWrappedController(
    IServerApplicationPaths paths, IUserManager users, ILibraryManager library,
    Microsoft.Extensions.Logging.ILogger<JellyWrappedController> logger) : ControllerBase
{
    private Guid Caller => Guid.TryParse(User.FindFirst("Jellyfin-UserId")?.Value, out var id)
        ? id : Guid.Empty;

    [HttpGet("Eligibility")]
    public IActionResult CheckEligibility([FromQuery] Guid? userId = null)
    {
        var target = userId ?? Caller;
        if (!CanQuery(target)) return Forbid();
        return Ok(new { UserId = target, Eligible = Eligible(target) });
    }

    [HttpGet("Presentation")]
    public IActionResult Presentation()
    {
        if (Caller == Guid.Empty) return Forbid();
        var config = Plugin.Instance?.Configuration;
        if (config is null || !Eligible(Caller)) return NoContent();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (!DateOnly.TryParseExact(config.PopupStart, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var start) || today < start)
            return NoContent();

        DateOnly? end = DateOnly.TryParseExact(config.PopupEnd, "yyyy-MM-dd", CultureInfo.InvariantCulture,
            DateTimeStyles.None, out var parsedEnd) ? parsedEnd : null;
        if (end.HasValue && end.Value < start) return NoContent();
        bool popup = !end.HasValue || today <= end.Value;
        if (!popup && !config.AllowReplay) return NoContent();

        var year = ReportYear();
        return Ok(new
        {
            Popup = popup, config.AllowReplay, ReportYear = year,
            Campaign = FormattableString.Invariant($"{year}:{start:yyyy-MM-dd}"),
            config.EnableAnimations, config.EnableGlowEffects, config.AutoAdvance,
            config.SlideDurationSeconds, config.CounterDurationMs, config.SiteName, config.Slides
        });
    }

    [AllowAnonymous]
    [HttpGet("viewer.js")]
    public IActionResult ViewerScript() => File(
        typeof(Plugin).Assembly.GetManifestResourceStream("Wrapped.Core.Web.standardcore.js")!,
        "text/javascript; charset=utf-8");

    [HttpGet("Statistics")]
    public async Task<IActionResult> Statistics([FromQuery] Guid? userId, [FromQuery] int? year,
        CancellationToken cancellationToken)
    {
        var target = userId ?? Caller;
        if (!CanQuery(target) || !Eligible(target)) return Forbid();

        var selectedYear = year ?? ReportYear();
        if (selectedYear is < 2000 or > 2100) return BadRequest("Invalid report year.");
        var libraryTotal = library.GetCount(new InternalItemsQuery
        {
            IncludeItemTypes = [BaseItemKind.Movie, BaseItemKind.Episode],
            Recursive = true
        });

        var entries = new List<PlaybackEntry>();
        var database = Path.Combine(paths.DataPath, "playback_reporting.db");
        if (!System.IO.File.Exists(database))
            return Ok(new { LibraryTotal = libraryTotal, HistoryAvailable = false, Entries = entries });

        try
        {
            await using var connection = new SqliteConnection(new SqliteConnectionStringBuilder
            {
                DataSource = database, Mode = SqliteOpenMode.ReadOnly, DefaultTimeout = 3
            }.ToString());
            await connection.OpenAsync(cancellationToken);
            await using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT ItemId, ItemType, MAX(ItemName), SUM(PlayDuration), COUNT(*)
                FROM PlaybackActivity
                WHERE UserId = @user AND DateCreated >= @start AND DateCreated < @end
                  AND ItemType IN ('Movie', 'Episode') AND PlayDuration > 0
                GROUP BY ItemId, ItemType
                """;
            command.Parameters.AddWithValue("@user", target.ToString("N"));
            command.Parameters.AddWithValue("@start", FormattableString.Invariant($"{selectedYear:0000}-01-01"));
            command.Parameters.AddWithValue("@end", FormattableString.Invariant($"{selectedYear + 1:0000}-01-01"));
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                entries.Add(new(reader.GetString(0), reader.GetString(1),
                    reader.IsDBNull(2) ? "" : reader.GetString(2), reader.GetInt64(3), reader.GetInt64(4)));
        }
        catch (SqliteException exception)
        {
            Microsoft.Extensions.Logging.LoggerExtensions.LogWarning(logger, exception, "Playback Reporting history could not be read");
            return StatusCode(503, "Playback Reporting history could not be read.");
        }

        return Ok(new { LibraryTotal = libraryTotal, HistoryAvailable = true, Entries = entries });
    }

    private bool CanQuery(Guid target) => Caller != Guid.Empty && target != Guid.Empty &&
        (Caller == target || users.GetUserById(Caller)?.HasPermission(PermissionKind.IsAdministrator) == true);

    private bool Eligible(Guid target)
    {
        var config = Plugin.Instance?.Configuration;
        var user = users.GetUserById(target);
        return config?.WrappedEnabled == true && user is not null && !user.HasPermission(PermissionKind.IsDisabled)
            && config.ExcludedUserIds?.Any(id => Guid.TryParse(id, out var parsed) && parsed == target) != true;
    }

    private static int ReportYear()
    {
        var year = Plugin.Instance?.Configuration.ReportYear ?? 0;
        return year is >= 2000 and <= 2100 ? year : DateTime.UtcNow.Year;
    }

    private sealed record PlaybackEntry(string Id, string Type, string Name, long Seconds, long Plays);
}

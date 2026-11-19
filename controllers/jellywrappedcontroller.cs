using System;
using System.Linq;
using MediaBrowser.Common.Api;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Wrapped.Core.Controllers;

/// <summary>
/// Authorization gate for integrations and clients showing a user's Wrapped.
/// A user may check themselves; only Jellyfin administrators may check other users.
/// An API key without an associated user is intentionally rejected.
/// </summary>
[ApiController]
[Route("JellyWrapped")]
[Authorize]
public sealed class JellyWrappedController : ControllerBase
{
    [HttpGet("Eligibility")]
    public IActionResult CheckEligibility([FromQuery] Guid? userId = null)
    {
        var claim = User.Claims.FirstOrDefault(c =>
            string.Equals(c.Type, "Jellyfin-UserId", StringComparison.OrdinalIgnoreCase));

        if (claim is null || !Guid.TryParse(claim.Value, out var callerId) || callerId == Guid.Empty)
        {
            return Forbid();
        }

        var targetId = userId ?? callerId;
        if (targetId == Guid.Empty)
        {
            return BadRequest("UserId must be a valid Jellyfin user ID.");
        }

        if (targetId != callerId && !User.IsInRole("Administrator"))
        {
            return Forbid();
        }

        var config = Plugin.Instance?.Configuration;
        bool enabled = config?.WrappedEnabled == true;
        bool excluded = config?.ExcludedUserIds?.Any(id =>
            Guid.TryParse(id, out var parsed) && parsed == targetId) == true;

        return Ok(new
        {
            UserId = targetId,
            Eligible = enabled && !excluded,
            Reason = !enabled ? "WrappedDisabled" : excluded ? "ExcludedByAdministrator" : "Eligible"
        });
    }
}

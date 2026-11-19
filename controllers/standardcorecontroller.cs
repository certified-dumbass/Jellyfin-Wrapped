using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Authorization;
using MediaBrowser.Common.Api;
using Microsoft.AspNetCore.Mvc;
using Wrapped.Core.Models;
using Wrapped.Core.Services;

namespace Wrapped.Core.Controllers;

[ApiController]
[Route("Standard/Core")]
[Authorize(Policy = Policies.RequiresElevation)]
public class StandardCoreController : ControllerBase
{
    private readonly StandardService _standardService;
    private readonly NotificationService _notificationService;

    public StandardCoreController(
        StandardService standardService,
        NotificationService notificationService)
    {
        _standardService = standardService;
        _notificationService = notificationService;
    }

    /// <summary>
    /// Returns the current status of Standard Core.
    /// </summary>
    [HttpGet("Status")]
    public ActionResult<ServiceStatus> GetStatus()
    {
        return Ok(_standardService.GetCoreStatus());
    }

    /// <summary>
    /// Returns all plugins currently registered with Standard Core.
    /// </summary>
    [HttpGet("Plugins")]
    public ActionResult<IReadOnlyList<StandardPlugin>> GetPlugins()
    {
        return Ok(_standardService.GetRegisteredPlugins());
    }

    /// <summary>
    /// Returns recent Standard Core notifications.
    /// </summary>
    [HttpGet("Notifications")]
    public ActionResult<IReadOnlyList<StandardNotification>> GetNotifications()
    {
        return Ok(_notificationService.GetNotifications());
    }

    /// <summary>
    /// Clears the current notification history.
    /// </summary>
    [HttpPost("Notifications/Clear")]
    public IActionResult ClearNotifications()
    {
        _notificationService.Clear();

        return NoContent();
    }

    /// <summary>
    /// Simple endpoint used to verify that Standard Core
    /// and its API are running correctly.
    /// </summary>
    [HttpGet("Ping")]
    public IActionResult Ping()
    {
        return Ok(new
        {
            Name = "Standard Core",
            Version = _standardService.CoreVersion,
            Status = "Online",
            Timestamp = DateTime.UtcNow
        });
    }
}
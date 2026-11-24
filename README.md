<div align="center">
  <img src="assets/jelly-wrapped-banner.svg" alt="Jelly-Wrapped – your year in stories" width="100%">
  <br>
  <img src="assets/jelly-wrapped-logo.svg" alt="Jelly-Wrapped logo" width="165">
  <h1>🎬 Jelly-Wrapped</h1>
  <p><strong>Your year in stories. Beautifully told.</strong></p>
  <p>A customizable, open-source Wrapped experience for Jellyfin.</p>
  <p>
    <img alt="Jellyfin 12.4" src="https://img.shields.io/badge/Jellyfin-12.4-9956ea">
    <img alt=".NET 10" src="https://img.shields.io/badge/.NET-10-512bd4">
    <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-38cdb5">
  </p>
</div>

---

## ✨ What is Jelly-Wrapped?

**Jelly-Wrapped** transforms your Jellyfin viewing metadata into a cinematic, swipeable slideshow. Admins can customize animations, slide order, titles, artwork and eligible users — without editing code.

This project grew out of Dreamstreaming Wrapped and is now branded independently for the Jellyfin community. 💜

## 🍿 Features

| | Feature |
|---|---|
| 🎞️ | Fullscreen admin preview for a selected eligible viewer, with Replay and keyboard navigation |
| ✨ | Three opening slides, a live library count, and configurable Reveal, Drift and Bouncing Counter animations |
| 🗓️ | Scheduled Jellyfin Web popup with optional Replay after the campaign |
| 🎨 | Visual slide builder: add, edit, reorder, enable/disable and reset slides |
| ⏱️ | Recorded annual watch time, combined movie and episode totals, and top series, movie, film collection and genre |
| 🔒 | **Per-user exclusions**: admins can block selected Jellyfin accounts from receiving a Wrapped; server-side eligibility check |
| 📺 | **Episodes Added**: count of episodes newly registered in the Jellyfin library for a selected calendar year |
| 📅 | **Busiest Additions Month**: which month added the most movies and episodes |
| 🧩 | Jellyfin 12.4 compatibility with .NET 10 |
| 🛠️ | GitHub Actions automated build and release packaging |

**Important distinction:** "Episodes Watched" counts episodes marked as played. "Episodes Added" counts library entries with a `DateCreated` timestamp in the configured year, *even if nobody has watched them*. "Busiest Additions Month" counts movies **and** episodes together. Jellyfin's `DateCreated` is an approximate *library-added date*, **not** a verified file upload or acquisition timestamp; migrating/rebuilding libraries may affect it.

**Viewing history:** install Jellyfin Playback Reporting and keep its retention long enough to cover the report year. Jelly-Wrapped opens its database read-only and totals recorded movie and episode seconds for the chosen viewer. Top series and film collections are ranked by those recorded seconds. A film collection is a Jellyfin collection containing movies. Library totals count all movie and episode entries. History that Playback Reporting never recorded or has already pruned cannot be recovered. When the database is absent, the watch-time slide labels the Jellyfin play-count estimate as lifetime and the combined and collection slides show that history is unavailable.

## 🚀 Installation

### ✅ Install from the Jellyfin plugin repository (after the first successful release)

1. In Jellyfin, open **Dashboard → Plugins → Repositories**.
2. Add **Jelly-Wrapped** with this manifest URL:

   ```text
   https://raw.githubusercontent.com/certified-dumbass/Jellyfin-Wrapped/main/manifest.json
   ```

3. Open **Catalog**, find **Jelly-Wrapped**, install and **restart Jellyfin**.
4. Open the plugin's settings and verify your existing slides and user access choices.

You can also download a release ZIP from **[Releases](https://github.com/certified-dumbass/Jellyfin-Wrapped/releases)** and install the contained DLL and `meta.json` in a Jellyfin plugin folder. **Do not install the GitHub source-code ZIP as a plugin.**

The repository manifest is generated only after a successful CI build. If the URL returns 404, check **[Actions](https://github.com/certified-dumbass/Jellyfin-Wrapped/actions)** first.

### 🧑‍💻 Build from source

**Requirements:** .NET 10 SDK, Jellyfin 12.4 API packages.

```bash
dotnet build standard.csproj -c Release
```

On Windows, you can run:

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

The script packages the compiled DLL and `meta.json` into `release/Jelly-Wrapped-1.17.1.0-Jellyfin12.4.zip`.

## ⚙️ How to configure

1. Go to **Dashboard → Plugins → Jelly-Wrapped → Settings**.
2. Select the **Wrapped report year**, the **Popup start and end dates**, and whether viewers can **Replay**. Dates are UTC and the end date is inclusive. An empty start date disables viewer delivery.
3. Choose which users receive Wrapped under **Who can receive Jelly-Wrapped?**. All enabled accounts are included until excluded.
4. Set **Site or server name** and use `{SiteName}` in slide titles or subtitles. Edit slide titles, order, animations, artwork and timing. Existing layouts are preserved. To use the three opening slides and new statistics, add them in the slide editor or choose **Reset Default Slides** and save.
5. Select an eligible account and click **Preview Wrapped**. Preview works before the scheduled popup. Use **↺** to replay it from the first slide. Save settings to apply access and delivery changes.

### Enable the viewer popup in Jellyfin Web

Install the [JavaScript Injector for Jellyfin 12](https://github.com/n00bcodr/Jellyfin-JavaScript-Injector/releases). In its dashboard, add and enable this inline snippet, then reload Jellyfin Web.

```js
(() => {
    const script = document.createElement("script");
    script.src = new URL("../JellyWrapped/viewer.js", window.location.href).href;
    document.head.append(script);
})();
```

The popup opens on the Jellyfin Web home screen once per browser profile, user and campaign. Replay remains on the home screen after the end date when enabled. Native clients need their own integration. The server checks the signed-in viewer for every presentation and statistics request. Only administrators can request another eligible account's statistics.

## 🧰 Developer notes

- Preserve the plugin GUID `5f84d6a7-2c91-47b3-a65e-841e9d42f731` and assembly name `Wrapped.Core` when upgrading to keep existing Jellyfin configuration compatible.
- `plugin.cs` – plugin registration and embedded web admin page.
- `configuration/pluginConfiguration.cs` – configuration including `ExcludedUserIds` and `ReportYear`.
- `controllers/jellywrappedcontroller.cs` – authenticated access, viewing history, and scheduled presentation endpoints.
- `Web/config.html` – visual editor, recipient access list and settings.
- `Web/standardcore.js` – shared slideshow renderer, admin preview, viewer popup, and Jellyfin collection lookup.
- `Models/`, `Services/` – original support code.

**Privacy:** User choices are stored as Jellyfin plugin configuration. No data is sent to an external server by this plugin. API consumers should not expose another user's viewing information without permission.

## 🤝 Contributing

Contributions, bug reports and ideas are welcome via GitHub Issues and Pull Requests. Please include your Jellyfin version, steps to reproduce and relevant anonymized logs. Be mindful of personal viewing data in screenshots and logs.

## 📄 License

MIT — see [LICENSE](LICENSE). Jelly-Wrapped is a community project and is not an official Jellyfin plugin.

---

<div align="center"><sub>Made for movie nights, binges and those “just one more episode” moments. 🍿</sub></div>

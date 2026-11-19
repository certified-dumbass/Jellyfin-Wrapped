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
| 🎞️ | Fullscreen slideshow preview with animated transitions, artwork, and keyboard navigation |
| 🎨 | Visual slide builder: add, edit, reorder, enable/disable and reset slides |
| ⏱️ | Watch-time estimate, played movies, played episodes, favorite series and favorite genres |
| 🔒 | **Per-user exclusions**: admins can block selected Jellyfin accounts from receiving a Wrapped; server-side eligibility check |
| 📺 | **Episodes Added**: count of episodes newly registered in the Jellyfin library for a selected calendar year |
| 📅 | **Busiest Additions Month**: which month added the most movies and episodes |
| 🧩 | Jellyfin 12.4 compatibility with .NET 10 |
| 🛠️ | GitHub Actions automated build and release packaging |

**Important distinction:** "Episodes Watched" counts episodes marked as played. "Episodes Added" counts library entries with a `DateCreated` timestamp in the configured year, *even if nobody has watched them*. "Busiest Additions Month" counts movies **and** episodes together. Jellyfin's `DateCreated` is an approximate *library-added date*, **not** a verified file upload or acquisition timestamp; migrating/rebuilding libraries may affect it.

**Data accuracy:** Playback-time figures are estimated from play counts and runtime metadata. This is not yet a reliable per-calendar-year playback-event history. Some slides without their own live data use demonstration values in the admin preview.

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

The script packages the compiled DLL and `meta.json` into `release/Jelly-Wrapped-1.16.0.0-Jellyfin12.4.zip`.

## ⚙️ How to configure

1. Go to **Dashboard → Plugins → Jelly-Wrapped → Settings**.
2. Enable Wrapped, set your animation and slide timing preferences.
3. Under **🔒 Who can receive Jelly-Wrapped?**, check any users who should **not** receive Wrapped; then click **Save Settings**.
4. Optionally select a **Library statistics year**. Empty means the current UTC year.
5. Open the slide editor to add **Episodes Added** or **Busiest Additions Month** slides, or choose **Reset Default Slides** to load the new 11-slide default (⚠️ resetting replaces the current layout after saving).
6. Select an eligible Jellyfin user in **Preview for Jellyfin user** and click **Preview Wrapped**.

### 🔐 Exclusion behavior

- All accounts are eligible by default until an admin excludes them.
- The backend `GET /JellyWrapped/Eligibility` endpoint only allows a signed-in user to query their own eligibility; administrators can query others.
- Disabled/blocked users are marked ineligible and blocked from the admin's recipient preview.
- **Current scope:** this plugin currently includes an *admin slide editor and preview*. It does **not** automatically distribute Wrapped to every user or send emails. The eligibility endpoint is provided for integrations that distribute presentations, and those integrations must honor it. This is not a Jellyfin-wide permission setting.

## 🧰 Developer notes

- Preserve the plugin GUID `5f84d6a7-2c91-47b3-a65e-841e9d42f731` and assembly name `Wrapped.Core` when upgrading to keep existing Jellyfin configuration compatible.
- `plugin.cs` – plugin registration and embedded web admin page.
- `configuration/pluginConfiguration.cs` – configuration including `ExcludedUserIds` and `ReportYear`.
- `controllers/jellywrappedcontroller.cs` – authenticated eligibility gate.
- `Web/config.html` – visual editor, recipient access list and settings.
- `Web/standardcore.js` – admin preview and statistics (using Jellyfin `/Items`).
- `Models/`, `Services/` – original support code.

**Privacy:** User choices are stored as Jellyfin plugin configuration. No data is sent to an external server by this plugin. API consumers should not expose another user's viewing information without permission.

## 🤝 Contributing

Contributions, bug reports and ideas are welcome via GitHub Issues and Pull Requests. Please include your Jellyfin version, steps to reproduce and relevant anonymized logs. Be mindful of personal viewing data in screenshots and logs.

## 📄 License

MIT — see [LICENSE](LICENSE). Jelly-Wrapped is a community project and is not an official Jellyfin plugin.

---

<div align="center"><sub>Made for movie nights, binges and those “just one more episode” moments. 🍿</sub></div>

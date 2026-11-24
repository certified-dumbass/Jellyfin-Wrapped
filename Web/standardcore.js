(function () {
    "use strict";

    const pluginId = "5F84D6A7-2C91-47B3-A65E-841E9D42F731";
    const viewerMode = /\/JellyWrapped\/viewer\.js$/i.test(
        new URL(document.currentScript?.src || location.href).pathname
    );
    const pageId = "WrappedConfigPage";

    let configuration = null;
    let slides = [];
    let editingSlideId = null;
    let editingSlideIndex = -1;
    let previewSlides = [];
    let previewIndex = 0;
    let previewTimer = null;
    let dirty = false;
    let livePreviewData = null;
    let jellyfinUsers = [];
    let excludedUserIds = new Set();

    // Critical actions are handled by the page-level delegated handler below.
    // Do not bind them globally: Jellyfin can load this controller more than once,
    // and a global handler can otherwise retain stale slide state from an older instance.

    const slideNames = {
        Intro: "Intro",
        LibraryTotal: "Total Library Media",
        CombinedTotal: "Combined Viewing",
        FavoriteFranchise: "Most Watched Film Collection",
        WatchTime: "Total Watch Time",
        MoviesWatched: "Movies Watched",
        EpisodesWatched: "Episodes Watched",
        EpisodesAdded: "Episodes Added to Library",
        MostUploadsMonth: "Busiest Additions Month",
        SeriesWatched: "Series Watched",
        FavoriteMovie: "Favorite Movie",
        FavoriteSeries: "Favorite Series",
        FavoriteGenre: "Favorite Genre",
        TopMovies: "Top Movies",
        TopSeries: "Top Series",
        TopGenres: "Top Genres",
        LongestBinge: "Longest Binge",
        MostActiveDay: "Most Active Day",
        MostActiveMonth: "Most Active Month",
        LateNightWatching: "Late Night Watching",
        MostUsedDevice: "Most Used Device",
        PlaybackQuality: "Playback Quality",
        Achievements: "Achievements",
        FunFact: "Fun Fact",
        CustomText: "Custom Text",
        Outro: "Outro"
    };

    const slideIcons = {
        Intro: "✦",
        WatchTime: "◷",
        MoviesWatched: "▣",
        EpisodesWatched: "▶",
        EpisodesAdded: "＋",
        MostUploadsMonth: "▦",
        SeriesWatched: "▤",
        FavoriteMovie: "★",
        FavoriteSeries: "◆",
        FavoriteGenre: "♫",
        TopMovies: "01",
        TopSeries: "02",
        TopGenres: "03",
        LongestBinge: "∞",
        MostActiveDay: "☀",
        MostActiveMonth: "◫",
        LateNightWatching: "☾",
        MostUsedDevice: "▰",
        PlaybackQuality: "4K",
        Achievements: "♛",
        FunFact: "!",
        CustomText: "Aa",
        Outro: "✦"
    };

    function tryInitializeWrappedPage() {
    const page = document.getElementById(pageId);

    if (!page) {
        return;
    }

    initialize(page);
}

if (viewerMode) {
    startViewer();
    return;
}

document.addEventListener("pageshow", function (event) {
    const page = event.target;

    if (page && page.id === pageId) {
        initialize(page);
    }
});

// Jellyfin kan dit script laden nadat pageshow al is uitgevoerd.
// Daarom proberen we de pagina ook direct te initialiseren.
if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        tryInitializeWrappedPage
    );
} else {
    tryInitializeWrappedPage();
}

async function initialize(page) {
    if (page.dataset.wrappedInitializing === "true") {
        return;
    }

    page.dataset.wrappedInitializing = "true";

    try {
        Dashboard.showLoadingMsg();

            bindEvents(page);

            configuration =
                await ApiClient.getPluginConfiguration(pluginId);

            configuration = configuration || {};

            slides = Array.isArray(configuration.Slides)
                ? configuration.Slides.map(normalizeSlide)
                : [];
            if (!slides.length) slides = defaultSlides();

            normalizeOrders();
            console.log("[Wrapped] Loaded slides:", slides.length);

            applyConfiguration(page);
            await loadUserAccessControls(page);
            renderSlides(page);
            updateSaveState(page, false);
            applyVisualPreferences(page);
            revealPage(page);

            console.log(
                "[Wrapped] Builder initialized with",
                slides.length,
                "slides."
            );
        } catch (error) {
            console.error(
                "[Wrapped] Failed to initialize:",
                error
            );

            showSaveMessage(
                page,
                "Wrapped could not load its configuration.",
                "error"
            );
        } finally {
    page.dataset.wrappedInitializing = "false";
    Dashboard.hideLoadingMsg();
}
    }

    // =========================================================
    // EVENTS
    // =========================================================

    function bindEvents(page) {
        if (page.dataset.wrappedBound === "true") {
            return;
        }

        page.dataset.wrappedBound = "true";

        // Jellyfin can upgrade/re-render emby-button elements after this
        // controller has initialized. Use one delegated click handler on
        // the page so controls keep working even when their DOM nodes are
        // replaced by Jellyfin.
        page.addEventListener("click", function (event) {
            const target = event.target instanceof Element
                ? event.target.closest("button, [role='button']")
                : null;

            if (!target || !page.contains(target)) {
                return;
            }

            switch (target.id) {
                case "addSlideButton":
                    event.preventDefault();
                    addSlide(page);
                    break;

                case "saveWrappedButton":
                    event.preventDefault();
                    saveConfiguration(page);
                    break;

                case "previewWrappedButton":
                    event.preventDefault();
                    target.disabled = true;
                    openPreview(page).finally(() => { target.disabled = false; });
                    break;

                case "resetSlidesButton":
                    event.preventDefault();
                    resetDefaultSlides(page);
                    break;

                case "closeSlideEditor":
                    event.preventDefault();
                    closeEditor(page);
                    break;

                case "applySlideButton":
                    event.preventDefault();
                    applyEditor(page);
                    break;

                case "deleteSlideButton":
                    event.preventDefault();
                    event.stopPropagation();
                    deleteEditingSlide(page);
                    break;

                case "closeWrappedPreview":
                    event.preventDefault();
                    closePreview(page);
                    break;

                case "previousPreviewSlide":
                    event.preventDefault();
                    previousPreview(page);
                    break;

                case "nextPreviewSlide":
                    event.preventDefault();
                    nextPreview(page);
                    break;
            }
        });

        const editorOverlay = page.querySelector("#slideEditorOverlay");
        editorOverlay?.addEventListener("click", function (event) {
            if (event.target === editorOverlay) {
                closeEditor(page);
            }
        });

        [
            "WrappedEnabled",
            "AutoAdvance",
            "EnableAnimations",
            "EnableGlowEffects"
        ].forEach(function (id) {
            page.querySelector("#" + id)?.addEventListener("change", function () {
                markDirty(page);
                applyVisualPreferences(page);
                updateMasterState(page);
            });
        });

        page.querySelector("#SlideDurationSeconds")?.addEventListener("input", function () {
            markDirty(page);
        });
        for (const id of ["PopupStart", "PopupEnd", "AllowReplay", "CounterDurationMs"]) {
            page.querySelector("#" + id)?.addEventListener("change", () => markDirty(page));
        }
        page.querySelector("#SiteName")?.addEventListener("input", () => markDirty(page));
        page.querySelector("#ReportYear")?.addEventListener("input", function () {
            markDirty(page);
        });

        document.addEventListener("keydown", function wrappedKeyboardHandler(event) {
            if (!document.getElementById(pageId)) {
                return;
            }

            // Preview is portaled to document.body while open, so it is no longer
            // a descendant of the plugin page. Resolve it globally.
            const preview = document.getElementById("wrappedPreviewOverlay");
            const editor = page.querySelector("#slideEditorOverlay");

            if (event.key === "Escape") {
                if (preview?.classList.contains("open")) {
                    closePreview(page);
                    return;
                }

                if (editor?.classList.contains("open")) {
                    closeEditor(page);
                }
            }

            if (preview?.classList.contains("open")) {
                if (event.key === "ArrowRight") {
                    nextPreview(page);
                }

                if (event.key === "ArrowLeft") {
                    previousPreview(page);
                }
            }
        });
    }

    // =========================================================
    // CONFIG
    // =========================================================

    function applyConfiguration(page) {
        setChecked(
            page,
            "WrappedEnabled",
            configuration.WrappedEnabled !== false
        );

        setChecked(
            page,
            "AutoAdvance",
            configuration.AutoAdvance !== false
        );

        setChecked(
            page,
            "EnableAnimations",
            configuration.EnableAnimations !== false
        );

        setChecked(
            page,
            "EnableGlowEffects",
            configuration.EnableGlowEffects !== false
        );

        const duration =
            page.querySelector("#SlideDurationSeconds");

        if (duration) {
            duration.value =
                clampNumber(
                    configuration.SlideDurationSeconds,
                    2,
                    60,
                    8
                );
        }

        setValue(page, "SiteName", normalizedSiteName(configuration.SiteName));
        excludedUserIds = new Set((configuration.ExcludedUserIds || []).map(String));
        const yearInput = page.querySelector("#ReportYear");
        if (yearInput) yearInput.value = Number(configuration.ReportYear) || "";
        for (const id of ["PopupStart", "PopupEnd", "CounterDurationMs"]) {
            page.querySelector("#" + id).value = configuration[id] ?? (id === "CounterDurationMs" ? 1100 : "");
        }
        setChecked(page, "AllowReplay", configuration.AllowReplay !== false);
        updateMasterState(page);
    }

    async function loadUserAccessControls(page) {
        const list = page.querySelector("#wrappedUserAccessList");
        const select = page.querySelector("#WrappedPreviewUser");
        if (!list || !select) return;
        try {
            const users = await ApiClient.ajax({
                type: "GET", url: ApiClient.getUrl("Users"), dataType: "json"
            });
            jellyfinUsers = Array.isArray(users) ? users : [];
            list.replaceChildren();
            select.replaceChildren();
            const currentUser = typeof ApiClient.getCurrentUserId === "function"
                ? ApiClient.getCurrentUserId() : "";
            jellyfinUsers.sort((a, b) => String(a.Name).localeCompare(String(b.Name)));
            for (const user of jellyfinUsers) {
                const id = String(user.Id || "");
                if (!id) continue;
                const label = document.createElement("label");
                label.className = "wrapped-access-row";
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.checked = excludedUserIds.has(id);
                checkbox.setAttribute("aria-label", "Exclude " + String(user.Name || id));
                const text = document.createElement("span");
                text.textContent = String(user.Name || "Unknown user");
                label.append(checkbox, text);
                checkbox.addEventListener("change", function () {
                    if (checkbox.checked) excludedUserIds.add(id);
                    else excludedUserIds.delete(id);
                            refreshPreviewUserOptions(select, currentUser);
                    markDirty(page);
                });
                list.appendChild(label);
            }
            refreshPreviewUserOptions(select, currentUser);
        } catch (error) {
            console.error("[Jelly-Wrapped] Failed to load user access settings", error);
            // Do not accidentally overwrite the saved exclusion list when user loading fails.
            list.textContent = "Could not load users. Existing exclusions are preserved. Check your Jellyfin admin permissions.";
            select.replaceChildren();
        }
    }

    function refreshPreviewUserOptions(select, currentUser) {
        const previous = select.value || currentUser;
        select.replaceChildren();
        for (const user of jellyfinUsers) {
            const id = String(user.Id || "");
            if (!id || excludedUserIds.has(id)) continue;
            const option = document.createElement("option");
            option.value = id;
            option.textContent = String(user.Name || id);
            select.appendChild(option);
        }
        if ([...select.options].some(option => option.value === previous))
            select.value = previous;
    }

    function setChecked(page, id, value) {
        const element = page.querySelector("#" + id);

        if (element) {
            element.checked = value === true;
        }
    }

    async function saveConfiguration(page) {
        try {
            Dashboard.showLoadingMsg();

            configuration.WrappedEnabled =
                page.querySelector("#WrappedEnabled")?.checked === true;

            configuration.AutoAdvance =
                page.querySelector("#AutoAdvance")?.checked === true;

            configuration.EnableAnimations =
                page.querySelector("#EnableAnimations")?.checked === true;

            configuration.EnableGlowEffects =
                page.querySelector("#EnableGlowEffects")?.checked === true;

            const start = page.querySelector("#PopupStart").value;
            const end = page.querySelector("#PopupEnd").value;
            if (start && end && end < start) {
                showSaveMessage(page, "Popup end must be on or after the start date.", "error");
                return;
            }
            configuration.SiteName = normalizedSiteName(page.querySelector("#SiteName").value);
            configuration.PopupStart = start;
            configuration.PopupEnd = end;
            configuration.AllowReplay = page.querySelector("#AllowReplay").checked;
            configuration.CounterDurationMs = clampNumber(page.querySelector("#CounterDurationMs").value, 100, 5000, 1100);
            configuration.ExcludedUserIds = [...excludedUserIds];
            const chosenYear = Number(page.querySelector("#ReportYear")?.value || 0);
            configuration.ReportYear = Number.isInteger(chosenYear) && chosenYear >= 2000 && chosenYear <= 2100 ? chosenYear : 0;

            configuration.SlideDurationSeconds =
                clampNumber(
                    page.querySelector("#SlideDurationSeconds")?.value,
                    2,
                    60,
                    8
                );

            normalizeOrders();

            console.log("[Wrapped] Saving slides:", slides.length);

            configuration.Slides =
                slides.map(function (slide) {
                    return {
                        Id: slide.Id,
                        Order: slide.Order,
                        Enabled: slide.Enabled,
                        Type: slide.Type,
                        Title: slide.Title,
                        Subtitle: slide.Subtitle,
                        Animation: slide.Animation,
                        BackgroundStyle: slide.BackgroundStyle,
                        ShowArtwork: slide.ShowArtwork,
                        ShowValue: slide.ShowValue,
                        ShowDetails: slide.ShowDetails
                    };
                });

            const result =
                await ApiClient.updatePluginConfiguration(
                    pluginId,
                    configuration
                );

            updateSaveState(page, false);

            showSaveMessage(
                page,
                "Changes saved",
                "success"
            );

            if (
                typeof Dashboard.processPluginConfigurationUpdateResult ===
                "function"
            ) {
                Dashboard.processPluginConfigurationUpdateResult(
                    result
                );
            }
        } catch (error) {
            console.error(
                "[Wrapped] Save failed:",
                error
            );

            showSaveMessage(
                page,
                "Could not save changes",
                "error"
            );
        } finally {
            Dashboard.hideLoadingMsg();
        }
    }

    // =========================================================
    // SLIDE MODEL
    // =========================================================

    function normalizeSlide(slide, index) {
        slide = slide || {};

        return {
            Id:
                slide.Id ||
                generateId(),

            Order:
                Number.isFinite(Number(slide.Order))
                    ? Number(slide.Order)
                    : index || 0,

            Enabled:
                slide.Enabled !== false,

            Type:
                slide.Type || "CustomText",

            Title:
                slide.Title || "",

            Subtitle:
                slide.Subtitle || "",

            Animation:
                slide.Animation || "Fade",

            BackgroundStyle:
                slide.BackgroundStyle || "Dynamic",

            ShowArtwork:
                slide.ShowArtwork !== false,

            ShowValue:
                slide.ShowValue !== false,

            ShowDetails:
                slide.ShowDetails !== false
        };
    }

    function normalizeOrders() {
        slides.forEach(function (slide, index) {
            slide.Order = index;
        });
    }

    function generateId() {
        if (
            window.crypto &&
            typeof window.crypto.randomUUID === "function"
        ) {
            return window.crypto.randomUUID();
        }

        return (
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2)
        );
    }

    // =========================================================
    // SLIDE LIST
    // =========================================================

    function renderSlides(page) {
        const list =
            page.querySelector("#slideList");

        const count =
            page.querySelector("#slideCount");

        if (!list || !count) {
            return;
        }

        normalizeOrders();

        count.textContent =
            String(slides.length);

        list.innerHTML = "";

        if (slides.length === 0) {
            const empty =
                document.createElement("div");

            empty.className =
                "wrapped-empty-slides";

            empty.innerHTML = `
                <strong>No slides yet</strong>
                <span>
                    Add your first slide to start building Wrapped.
                </span>
            `;

            list.appendChild(empty);
            return;
        }

        slides.forEach(function (slide, index) {
            list.appendChild(
                createSlideElement(
                    page,
                    slide,
                    index
                )
            );
        });
    }

    function createSlideElement(
        page,
        slide,
        index
    ) {
        const item =
            document.createElement("div");

        item.className =
            "wrapped-slide-item";

        if (!slide.Enabled) {
            item.classList.add(
                "wrapped-slide-disabled"
            );
        }

        const number =
            String(index + 1).padStart(2, "0");

        item.innerHTML = `
            <div class="wrapped-drag"
                 title="Slide controls">
                ⋮⋮
            </div>

            <div class="wrapped-slide-number">
                ${number}
            </div>

            <div class="wrapped-slide-info">

                <span class="wrapped-slide-type">
                    ${escapeHtml(
                        getSlideIcon(slide.Type)
                    )}
                    &nbsp;
                    ${escapeHtml(
                        getSlideName(slide.Type)
                    ).toUpperCase()}
                </span>

                <span class="wrapped-slide-title">
                    ${escapeHtml(
                        slide.Title ||
                        getSlideName(slide.Type)
                    )}
                </span>

            </div>

            <div class="wrapped-slide-controls">

                <button type="button"
                        class="wrapped-icon-button wrapped-up"
                        title="Move up"
                        ${index === 0 ? "disabled" : ""}>
                    ↑
                </button>

                <button type="button"
                        class="wrapped-icon-button wrapped-down"
                        title="Move down"
                        ${
                            index === slides.length - 1
                                ? "disabled"
                                : ""
                        }>
                    ↓
                </button>

                <button type="button"
                        class="wrapped-icon-button wrapped-edit"
                        title="Edit slide">
                    Edit
                </button>

            </div>
        `;

        item
            .querySelector(".wrapped-up")
            ?.addEventListener(
                "click",
                function () {
                    moveSlide(page, index, -1);
                }
            );

        item
            .querySelector(".wrapped-down")
            ?.addEventListener(
                "click",
                function () {
                    moveSlide(page, index, 1);
                }
            );

        item
            .querySelector(".wrapped-edit")
            ?.addEventListener(
                "click",
                function () {
                    openEditor(
                        page,
                        slide.Id
                    );
                }
            );

        return item;
    }

    function moveSlide(
        page,
        index,
        direction
    ) {
        const newIndex =
            index + direction;

        if (
            newIndex < 0 ||
            newIndex >= slides.length
        ) {
            return;
        }

        const temp =
            slides[index];

        slides[index] =
            slides[newIndex];

        slides[newIndex] =
            temp;

        normalizeOrders();
        renderSlides(page);
        markDirty(page);
    }

    function defaultSlides() {
        return [
            { Type: "Intro", Title: "Your year on {SiteName}", Subtitle: "This was your year.", Animation: "Cinematic", BackgroundStyle: "Dynamic", ShowArtwork: false },
            { Type: "LibraryTotal", Title: "A library full of stories", Animation: "CounterBounce", ShowArtwork: false },
            { Type: "CustomText", Title: "Now, your year in stories", Subtitle: "Here’s what you made time for.", Animation: "Reveal", ShowArtwork: false, ShowValue: false },
            { Type: "CombinedTotal", Title: "It all adds up", Animation: "Counter", ShowArtwork: false },
            { Type: "FavoriteFranchise", Title: "One universe wasn’t enough", Animation: "Drift", BackgroundStyle: "Artwork" },
            { Type: "WatchTime", Title: "You watched...", Subtitle: "", Animation: "Counter", BackgroundStyle: "Gradient" },
            { Type: "MoviesWatched", Title: "Movie nights", Subtitle: "", Animation: "SlideUp", BackgroundStyle: "Dynamic" },
            { Type: "EpisodesWatched", Title: "Just one more episode...", Subtitle: "", Animation: "Counter", BackgroundStyle: "Dynamic" },
            { Type: "EpisodesAdded", Title: "Fresh episodes this year", Subtitle: "", Animation: "Counter", BackgroundStyle: "Gradient" },
            { Type: "MostUploadsMonth", Title: "Your library's busiest month", Subtitle: "", Animation: "Zoom", BackgroundStyle: "Gradient" },
            { Type: "FavoriteMovie", Title: "Your movie of the year", Subtitle: "", Animation: "Zoom", BackgroundStyle: "Artwork" },
            { Type: "FavoriteSeries", Title: "You couldn't stop watching", Subtitle: "", Animation: "Zoom", BackgroundStyle: "Artwork" },
            { Type: "FavoriteGenre", Title: "You had a type...", Subtitle: "", Animation: "Blur", BackgroundStyle: "Gradient" },
            { Type: "LongestBinge", Title: "Your longest binge", Subtitle: "", Animation: "Counter", BackgroundStyle: "Dynamic" },
            { Type: "Outro", Title: "That's a wrap.", Subtitle: "See you next year.", Animation: "Cinematic", BackgroundStyle: "Gradient", ShowArtwork: false }
        ].map(function (slide, index) {
            return normalizeSlide(Object.assign({
                Id: generateId(),
                Order: index,
                Enabled: true,
                ShowArtwork: true,
                ShowValue: true,
                ShowDetails: true
            }, slide), index);
        });

    }

    function resetDefaultSlides(page) {
        if (!window.confirm("Reset Jelly-Wrapped to the default slides? Your current layout will be replaced after you save.")) return;
        slides = defaultSlides();
        editingSlideId = null;
        closeEditor(page);
        closePreview(page);
        normalizeOrders();
        renderSlides(page);
        markDirty(page);
        showSaveMessage(page, "Default slides restored — click Save Settings to keep them.", "success");
    }

    // =========================================================
    // ADD SLIDE
    // =========================================================

    function addSlide(page) {
        const slide =
            normalizeSlide(
                {
                    Id: generateId(),
                    Order: slides.length,
                    Enabled: true,
                    Type: "CustomText",
                    Title: "New Wrapped slide",
                    Subtitle: "",
                    Animation: "Fade",
                    BackgroundStyle: "Dynamic",
                    ShowArtwork: true,
                    ShowValue: true,
                    ShowDetails: true
                },
                slides.length
            );

        slides.push(slide);

        renderSlides(page);
        markDirty(page);

        openEditor(
            page,
            slide.Id
        );
    }

    // =========================================================
    // EDITOR
    // =========================================================

    function openEditor(
        page,
        slideId
    ) {
        const slide =
            slides.find(function (item) {
                return item.Id === slideId;
            });

        if (!slide) {
            return;
        }

        editingSlideId =
            slide.Id;

        const index =
            slides.indexOf(slide);

        editingSlideIndex = index;

        const heading =
            page.querySelector(
                "#slideEditorHeading"
            );

        if (heading) {
            heading.textContent =
                "Slide " +
                String(index + 1).padStart(2, "0");
        }

        setValue(
            page,
            "SlideType",
            slide.Type
        );

        setValue(
            page,
            "SlideTitle",
            slide.Title
        );

        setValue(
            page,
            "SlideSubtitle",
            slide.Subtitle
        );

        setValue(
            page,
            "SlideAnimation",
            slide.Animation
        );

        setValue(
            page,
            "SlideBackground",
            slide.BackgroundStyle
        );

        setChecked(
            page,
            "SlideEnabled",
            slide.Enabled
        );

        setChecked(
            page,
            "SlideShowArtwork",
            slide.ShowArtwork
        );

        setChecked(
            page,
            "SlideShowValue",
            slide.ShowValue
        );

        setChecked(
            page,
            "SlideShowDetails",
            slide.ShowDetails
        );

        const overlay =
            page.querySelector(
                "#slideEditorOverlay"
            );

        if (overlay) {
            overlay.dataset.slideId = slide.Id;
            overlay.dataset.slideIndex = String(index);
        overlay.inert = false;
            overlay.removeAttribute("inert");
            overlay.classList.add("open");
            overlay.setAttribute("aria-hidden", "false");
            overlay.style.display = "flex";
        }
    }

    function closeEditor(page) {
        editingSlideId = null;
        editingSlideIndex = -1;

        const overlay = page.querySelector("#slideEditorOverlay");

        if (!overlay) {
            return;
        }

        const focused = document.activeElement;
        if (focused && overlay.contains(focused) && typeof focused.blur === "function") {
            focused.blur();
        }

        overlay.classList.remove("open");
        overlay.setAttribute("aria-hidden", "true");
        overlay.inert = true;
        overlay.setAttribute("inert", "");
        overlay.style.display = "none";
        delete overlay.dataset.slideId;
        delete overlay.dataset.slideIndex;
    }

    function applyEditor(page) {
        const slide =
            slides.find(function (item) {
                return item.Id === editingSlideId;
            });

        if (!slide) {
            closeEditor(page);
            return;
        }

        slide.Type =
            getValue(
                page,
                "SlideType",
                "CustomText"
            );

        slide.Title =
            getValue(
                page,
                "SlideTitle",
                ""
            );

        slide.Subtitle =
            getValue(
                page,
                "SlideSubtitle",
                ""
            );

        slide.Animation =
            getValue(
                page,
                "SlideAnimation",
                "Fade"
            );

        slide.BackgroundStyle =
            getValue(
                page,
                "SlideBackground",
                "Dynamic"
            );

        slide.Enabled =
            page.querySelector(
                "#SlideEnabled"
            )?.checked === true;

        slide.ShowArtwork =
            page.querySelector(
                "#SlideShowArtwork"
            )?.checked === true;

        slide.ShowValue =
            page.querySelector(
                "#SlideShowValue"
            )?.checked === true;

        slide.ShowDetails =
            page.querySelector(
                "#SlideShowDetails"
            )?.checked === true;

        renderSlides(page);
        markDirty(page);
        closeEditor(page);
    }

    function deleteEditingSlide(page) {
        const livePage = document.getElementById(pageId) || page;
        const overlay = document.getElementById("slideEditorOverlay") || livePage.querySelector("#slideEditorOverlay");

        let index = editingSlideIndex;
        if (!Number.isInteger(index) || index < 0 || index >= slides.length) {
            const storedIndex = Number.parseInt(overlay?.dataset.slideIndex ?? "", 10);
            if (Number.isInteger(storedIndex) && storedIndex >= 0 && storedIndex < slides.length) {
                index = storedIndex;
            }
        }

        if ((!Number.isInteger(index) || index < 0 || index >= slides.length) && editingSlideId) {
            index = slides.findIndex(function (item) {
                return item.Id === editingSlideId;
            });
        }

        console.log("[Wrapped] Delete requested for slide index:", index);

        if (!Number.isInteger(index) || index < 0 || index >= slides.length) {
            console.error("[Wrapped] Delete failed: active slide index was not found.");
            showSaveMessage(livePage, "Could not find the slide to delete.", "error");
            return;
        }

        slides.splice(index, 1);
        normalizeOrders();
        renderSlides(livePage);
        markDirty(livePage);
        closeEditor(livePage);
        console.log("[Wrapped] Slide deleted. Remaining slides:", slides.length);
    }

    function setValue(
        page,
        id,
        value
    ) {
        const element =
            page.querySelector("#" + id);

        if (element) {
            element.value =
                value ?? "";
        }
    }

    function getValue(
        page,
        id,
        fallback
    ) {
        const element =
            page.querySelector("#" + id);

        if (!element) {
            return fallback;
        }

        return element.value ?? fallback;
    }

    // =========================================================
    // PREVIEW
    // =========================================================

    function ensureGlobalPreviewStyles() {
        if (document.getElementById("wrappedGlobalPreviewStyles")) {
            return;
        }

        const style = document.createElement("style");
        style.id = "wrappedGlobalPreviewStyles";
        style.textContent = `
#wrappedPreviewOverlay.wrapped-fullscreen-preview {
    position: fixed !important; inset: 0 !important;
    width: 100vw !important; width: 100dvw !important;
    height: 100vh !important; height: 100dvh !important;
    margin: 0 !important; padding: 0 !important;
    display: none !important; overflow: hidden !important;
    background: #070708 !important; z-index: 2147483647 !important;
    box-sizing: border-box !important; color: #fff !important;
}
#wrappedPreviewOverlay.wrapped-fullscreen-preview.open[aria-hidden="false"] { display: block !important; }
#wrappedPreviewOverlay .wrapped-preview-stage {
    --story-ink: #fffaf6;
    --story-accent: #c4a8ff;
    --story-wash: #492b70;
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    display: grid !important;
    align-items: center !important;
    justify-items: center !important;
    overflow: auto !important;
    padding: clamp(3.75rem, 9vh, 7rem) clamp(1.25rem, 7vw, 7rem) clamp(5rem, 10vh, 8rem) !important;
    box-sizing: border-box !important;
    isolation: isolate;
}
#wrappedPreviewOverlay .wrapped-preview-stage::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background: repeating-linear-gradient(120deg, #ffffff08 0 1px, transparent 1px 32px);
    mask-image: linear-gradient(135deg, #000, transparent 65%);
}
#wrappedPreviewOverlay .wrapped-preview-stage[data-story-type="Intro"],
#wrappedPreviewOverlay .wrapped-preview-stage[data-story-type="Outro"] {
    --story-accent: #ffd3a8;
    --story-wash: #713642;
}
#wrappedPreviewOverlay .wrapped-preview-stage[data-story-type="LibraryTotal"],
#wrappedPreviewOverlay .wrapped-preview-stage[data-story-type="WatchTime"],
#wrappedPreviewOverlay .wrapped-preview-stage[data-story-type="CombinedTotal"] {
    --story-accent: #a5f6db;
    --story-wash: #145b58;
}
#wrappedPreviewOverlay .wrapped-story-slide {
    display: grid;
    align-items: center;
    gap: clamp(1.5rem, 4vw, 4rem);
    width: min(100%, 66rem) !important;
    box-sizing: border-box;
    color: var(--story-ink) !important;
    text-align: left !important;
    font-family: system-ui, sans-serif;
}
#wrappedPreviewOverlay .wrapped-story-copy {
    min-width: 0;
    padding-inline-start: clamp(1rem, 3vw, 2.75rem);
    border-inline-start: 2px solid var(--story-accent);
}
#wrappedPreviewOverlay .wrapped-story-eyebrow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .5rem 1rem;
    margin-bottom: clamp(1rem, 3vh, 2rem) !important;
    color: var(--story-accent) !important;
    font-size: .75rem !important;
    font-weight: 750 !important;
    letter-spacing: .12em !important;
    text-transform: uppercase;
}
#wrappedPreviewOverlay .wrapped-story-brand {
    max-width: 100%;
    padding: .35rem .6rem;
    border: 1px solid currentColor;
    border-radius: .4rem;
    overflow-wrap: anywhere;
}
#wrappedPreviewOverlay .wrapped-story-slide h1 {
    max-width: 18ch !important;
    margin: 0 !important;
    color: var(--story-ink) !important;
    font-size: clamp(1.85rem, 5vw, 4.6rem) !important;
    font-weight: 760 !important;
    line-height: 1.06 !important;
    letter-spacing: -.055em;
    overflow-wrap: anywhere;
    text-wrap: balance;
}
#wrappedPreviewOverlay [data-story-type="Intro"] h1 {
    font-size: clamp(2.5rem, 8vw, 7.2rem) !important;
}
#wrappedPreviewOverlay .wrapped-story-value {
    margin-top: .65em !important;
    color: var(--story-accent) !important;
    font-size: clamp(2rem, 6vw, 5rem) !important;
    font-weight: 850 !important;
    font-variant-numeric: tabular-nums;
    line-height: 1.05 !important;
    letter-spacing: -.045em !important;
    overflow-wrap: anywhere;
    text-shadow: 0 0 35px color-mix(in srgb, var(--story-accent) 24%, transparent) !important;
}
#wrappedPreviewOverlay .wrapped-story-value[data-counter]:not([data-counter=""]) {
    font-size: clamp(2.8rem, 10vw, 8rem) !important;
}
#wrappedPreviewOverlay .wrapped-story-subtitle {
    max-width: 48ch !important;
    margin: .85rem 0 0 !important;
    color: #f5edf4dd !important;
    font-size: clamp(.95rem, 2vw, 1.35rem) !important;
    line-height: 1.45 !important;
}
#wrappedPreviewOverlay .wrapped-story-details {
    margin-top: .8rem !important;
    color: var(--story-accent) !important;
    font-size: .9rem !important;
}
#wrappedPreviewOverlay .wrapped-story-artwork {
    width: min(11rem, 42vw) !important;
    aspect-ratio: 2 / 3;
    display: grid !important;
    place-items: center !important;
    margin: 0 !important;
    border: 1px solid #ffffff40 !important;
    border-radius: .8rem !important;
    background: var(--story-wash) !important;
    box-shadow: 0 18px 55px #0008 !important;
    color: var(--story-ink) !important;
    overflow: hidden;
}
#wrappedPreviewOverlay .wrapped-story-artwork img {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
    display: block !important;
}
#wrappedPreviewOverlay .wrapped-story-collage {
    display: grid !important;
    grid-template-columns: repeat(auto-fit, minmax(2.5rem, 1fr));
    gap: .4rem !important;
    width: min(100%, 23rem);
    margin: 0 !important;
}
#wrappedPreviewOverlay .wrapped-story-collage img {
    width: 100% !important;
    min-width: 0;
    aspect-ratio: 2 / 3 !important;
    object-fit: cover !important;
    border: 1px solid #ffffff38 !important;
    border-radius: .45rem !important;
    box-shadow: 0 10px 20px #0006;
}
#wrappedPreviewOverlay .wrapped-preview-close,
#wrappedPreviewOverlay .wrapped-preview-navigation button {
    display: grid !important;
    place-items: center;
    width: 44px !important;
    height: 44px !important;
    flex-shrink: 0;
    padding: 0 !important;
    border: 1px solid #ffffff40 !important;
    border-radius: .6rem !important;
    background: #151021 !important;
    color: #fff !important;
    font: 1.4rem system-ui !important;
    cursor: pointer;
}
#wrappedPreviewOverlay button:focus-visible {
    outline: 2px solid #a5f6db;
    outline-offset: 3px;
}
#wrappedPreviewOverlay .wrapped-preview-close {
    position: absolute !important;
    z-index: 10;
    right: clamp(.8rem, 4vw, 3rem);
    top: clamp(.8rem, 3vh, 2rem);
}
#wrappedPreviewOverlay .wrapped-preview-navigation {
    position: absolute !important;
    z-index: 10;
    inset: auto 0 0;
    display: flex !important;
    align-items: center !important;
    gap: clamp(.35rem, 2vw, 1rem);
    width: auto !important;
    margin: 0 !important;
    padding: .65rem clamp(.8rem, 7vw, 7rem) max(.65rem, env(safe-area-inset-bottom)) !important;
    transform: none !important;
    background: linear-gradient(transparent, #100c18f5 35%);
}
#wrappedPreviewOverlay .wrapped-preview-progress {
    display: flex !important;
    flex: 1;
    gap: .2rem;
}
#wrappedPreviewOverlay .wrapped-preview-progress span {
    height: 4px;
    flex: 1;
    border-radius: 99px;
    background: #ffffff33;
}
#wrappedPreviewOverlay .wrapped-preview-progress span.active { background: #a5f6db !important; }
#wrappedPreviewOverlay .wrapped-bg-dynamic {
    background: radial-gradient(ellipse at 90% 15%, var(--story-wash), transparent 62%), #130e1e !important;
}
#wrappedPreviewOverlay .wrapped-bg-gradient {
    background: linear-gradient(120deg, #140e20 28%, var(--story-wash)) !important;
}
#wrappedPreviewOverlay .wrapped-bg-artwork {
    background-color: #180e23 !important;
    background-position: center !important;
    background-size: cover !important;
}
#wrappedPreviewOverlay .wrapped-bg-dark { background: #0d0a15 !important; }
#wrappedPreviewOverlay .wrapped-bg-minimal { background: #201a29 !important; }
@media (min-width: 760px) {
    #wrappedPreviewOverlay .wrapped-story-has-artwork {
        grid-template-columns: minmax(0, 1fr) minmax(11rem, 28%);
    }
    #wrappedPreviewOverlay .wrapped-story-artwork { width: 100% !important; }
}
@media (max-height: 580px) and (max-width: 759px) {
    #wrappedPreviewOverlay .wrapped-story-slide { gap: .75rem; }
    #wrappedPreviewOverlay .wrapped-story-artwork { width: 5.5rem !important; }
}
#wrappedPreviewOverlay.wrapped-no-glow .wrapped-story-value { text-shadow: none !important; }
#wrappedPreviewOverlay .wrapped-animation-fade { animation: wrappedRevealFade 550ms ease-out both; }
#wrappedPreviewOverlay .wrapped-animation-up { animation: wrappedDrift 650ms ease-out both; }
#wrappedPreviewOverlay .wrapped-animation-left { animation: wrappedSlideLeft 650ms ease-out both; }
#wrappedPreviewOverlay .wrapped-animation-right { animation: wrappedSlideRight 650ms ease-out both; }
#wrappedPreviewOverlay .wrapped-animation-zoom { animation: wrappedZoom 700ms ease-out both; }
#wrappedPreviewOverlay .wrapped-animation-blur { animation: wrappedBlur 700ms ease-out both; }
#wrappedPreviewOverlay .wrapped-animation-cinematic { animation: wrappedZoom 1100ms ease-out both; }
@keyframes wrappedRevealFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes wrappedSlideLeft { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: none; } }
@keyframes wrappedSlideRight { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: none; } }
@keyframes wrappedZoom { from { opacity: 0; transform: scale(.88); } to { opacity: 1; transform: none; } }
@keyframes wrappedBlur { from { opacity: 0; filter: blur(12px); } to { opacity: 1; filter: none; } }
#wrappedPreviewOverlay button[hidden] { display: none !important; }
#wrappedPreviewOverlay .wrapped-animation-reveal { animation: wrappedReveal 700ms ease-out both; }
#wrappedPreviewOverlay .wrapped-animation-drift { animation: wrappedDrift 850ms ease-out both; }
#wrappedPreviewOverlay .wrapped-animation-bounce .wrapped-story-value { animation: wrappedBounce 650ms both; }
@keyframes wrappedReveal { from { opacity: 0; clip-path: inset(0 100% 0 0); } to { opacity: 1; clip-path: inset(0); } }
@keyframes wrappedDrift { from { opacity: 0; transform: translateY(25px) scale(.96); } to { opacity: 1; transform: none; } }
@keyframes wrappedBounce { 0% { transform: scale(.85); } 65% { transform: scale(1.07); } 100% { transform: none; } }
@media (prefers-reduced-motion: reduce) { #wrappedPreviewOverlay * { animation: none !important; transition: none !important; } }

`;
        document.head.appendChild(style);
    }

    async function openPreview(page) {
        const livePage = document.getElementById(pageId) || page;
        const chosenUser = livePage.querySelector("#WrappedPreviewUser")?.value || "";
        if (!configuration || configuration.WrappedEnabled === false) {
            showSaveMessage(livePage, "Jelly-Wrapped is disabled.", "error");
            return;
        }
        if (!chosenUser || excludedUserIds.has(chosenUser)) {
            showSaveMessage(livePage, "Select an eligible user to preview Jelly-Wrapped.", "error");
            return;
        }
        // The server enforces access, rather than trusting only this browser's checkboxes.
        try {
            const access = await ApiClient.ajax({
                type: "GET",
                url: ApiClient.getUrl("JellyWrapped/Eligibility", { userId: chosenUser }),
                dataType: "json"
            });
            if ((access?.Eligible ?? access?.eligible) !== true) {
                showSaveMessage(livePage, "This user is excluded from Jelly-Wrapped. Save settings if you just changed access.", "error");
                return;
            }
        } catch (error) {
            console.error("[Jelly-Wrapped] Eligibility check failed", error);
            showSaveMessage(livePage, "Cannot confirm user eligibility. Save settings and try again.", "error");
            return;
        }

        // Re-read the selected user’s history for each preview.
        try {
            livePreviewData = await loadLivePreviewData(chosenUser);
            Object.assign(livePreviewData, await loadRecordedStatistics(chosenUser,
                Number(livePage.querySelector("#ReportYear")?.value || configuration.ReportYear) || new Date().getUTCFullYear()));
        } catch (error) {
            console.warn("[Wrapped] Could not load live statistics.", error);
            showSaveMessage(livePage, "Could not load the selected viewer’s statistics.", "error");
            return;
        }

        previewSlides = slides.filter(function (slide) {
            return slide.Enabled;
        });

        if (previewSlides.length === 0) {
            showSaveMessage(livePage, "Enable at least one slide to preview Wrapped.", "error");
            return;
        }

        showPresentation(livePage);
    }

    function showPresentation(livePage) {
        previewIndex = 0;

        const overlay = document.getElementById("wrappedPreviewOverlay") || livePage.querySelector("#wrappedPreviewOverlay");
        if (!overlay) {
            console.error("[Wrapped] Preview overlay was not found.");
            return;
        }

        // The preview is portaled to body to escape Jellyfin page clipping.
        // Inject unscoped preview CSS first, because Jellyfin scopes plugin-page styles.
        ensureGlobalPreviewStyles();
        if (overlay.parentNode !== document.body) {
            overlay.__wrappedOriginalParent = overlay.parentNode;
            document.body.appendChild(overlay);
        }

        // The overlay now lives outside #WrappedConfigPage. The page-level
        // delegated click handler therefore cannot see its buttons. Bind one
        // handler directly to the portaled preview and keep it for future opens.
        if (overlay.dataset.wrappedControlsBound !== "true") {
            overlay.dataset.wrappedControlsBound = "true";
            overlay.addEventListener("click", function (event) {
                const button = event.target instanceof Element
                    ? event.target.closest("button")
                    : null;

                if (!button || !overlay.contains(button)) {
                    return;
                }

                switch (button.id) {
                    case "previousPreviewSlide":
                        event.preventDefault();
                        event.stopPropagation();
                        previousPreview(document);
                        break;

                    case "nextPreviewSlide":
                        event.preventDefault();
                        event.stopPropagation();
                        nextPreview(document);
                        break;

                    case "replayPreview":
                        previewIndex = 0;
                        renderPreviewSlide(document);
                        break;

                    case "closeWrappedPreview":
                        event.preventDefault();
                        event.stopPropagation();
                        closePreview(document);
                        break;
                }
            });
        }

        overlay.querySelector("#replayPreview").hidden = viewerMode && configuration.AllowReplay === false;
        const glow = viewerMode ? configuration.EnableGlowEffects !== false
            : document.getElementById("EnableGlowEffects")?.checked !== false;
        overlay.classList.toggle("wrapped-no-glow", !glow);
        overlay.inert = false;
        overlay.removeAttribute("inert");
        overlay.classList.add("open");
        overlay.setAttribute("aria-hidden", "false");
        overlay.style.setProperty("display", "block", "important");
        overlay.style.setProperty("position", "fixed", "important");
        overlay.style.setProperty("inset", "0", "important");
        overlay.style.setProperty("z-index", "2147483647", "important");
        overlay.style.setProperty("visibility", "visible", "important");
        overlay.style.setProperty("opacity", "1", "important");
        overlay.style.setProperty("pointer-events", "auto", "important");

        console.log("[Wrapped] Opening preview with", previewSlides.length, "slides");
        renderPreviewProgress(document);
        renderPreviewSlide(document);
    }

    function closePreview(page) {
        stopPreviewTimer();

        const overlay = document.getElementById("wrappedPreviewOverlay");
        if (!overlay) {
            return;
        }

        const focused = document.activeElement;
        if (focused && overlay.contains(focused) && typeof focused.blur === "function") {
            focused.blur();
        }

        overlay.classList.remove("open");
        overlay.setAttribute("aria-hidden", "true");
        overlay.inert = true;
        overlay.setAttribute("inert", "");
        overlay.style.setProperty("display", "none", "important");

        const originalParent = overlay.__wrappedOriginalParent;
        if (originalParent && originalParent.isConnected) {
            originalParent.appendChild(overlay);
        }
        delete overlay.__wrappedOriginalParent;
    }

    function nextPreview(page) {
        if (previewSlides.length === 0) {
            return;
        }

        if (previewIndex >= previewSlides.length - 1) return;
        previewIndex++;

        renderPreviewSlide(page);
    }

    function previousPreview(page) {
        if (previewSlides.length === 0) {
            return;
        }

        previewIndex--;

        if (previewIndex < 0) {
            previewIndex =
                previewSlides.length - 1;
        }

        renderPreviewSlide(page);
    }

    function renderPreviewProgress(page) {
        const progress =
            page.querySelector(
                "#previewProgress"
            );

        if (!progress) {
            return;
        }

        progress.innerHTML = "";

        previewSlides.forEach(
            function (_, index) {
                const bar =
                    document.createElement("span");

                if (index === previewIndex) {
                    bar.classList.add("active");
                }

                progress.appendChild(bar);
            }
        );
    }

    function normalizedSiteName(value) {
        return String(value ?? "").trim().slice(0, 80) || "Dreamstreaming";
    }

    function formatSlideCopy(value, siteName) {
        return String(value ?? "").replace(/\{SiteName\}/gi, () => siteName);
    }

    function renderPreviewSlide(page) {
        stopPreviewTimer();

        const slide =
            previewSlides[previewIndex];

        const stage =
            page.querySelector(
                "#wrappedPreviewStage"
            );

        if (!slide || !stage) {
            return;
        }

        const preview =
            getPreviewData(slide.Type);

        applyPreviewBackground(
            stage,
            slide.BackgroundStyle,
            preview.backgroundUrl || preview.artworkUrl || ""
        );

        const siteName = normalizedSiteName(viewerMode ? configuration.SiteName
            : document.getElementById("SiteName")?.value ?? configuration?.SiteName);
        const savedTitle = String(slide.Title || "").trim();
        const titleTemplate = slide.Type === "Intro" &&
            /^your year on dreamstreaming$/i.test(savedTitle)
            ? "Your year on {SiteName}"
            : savedTitle || preview.defaultTitle;
        const title = formatSlideCopy(titleTemplate, siteName);
        const subtitle = formatSlideCopy(slide.Subtitle || preview.subtitle, siteName);
        stage.dataset.storyType = slide.Type;
        const hasArtwork = slide.ShowArtwork && Boolean(preview.artworkUrl || preview.artworkLabel || preview.artworkUrls?.length);

        const animationsEnabled = viewerMode ? configuration.EnableAnimations !== false
            : document.getElementById("EnableAnimations")?.checked !== false;
        const animationClass =
            !animationsEnabled
                ? "wrapped-animation-none"
                : getAnimationClass(
                    slide.Animation
                );

        stage.innerHTML = `
            <div class="wrapped-story-slide ${animationClass}${hasArtwork ? " wrapped-story-has-artwork" : ""}">
                <div class="wrapped-story-copy">
                    <div class="wrapped-story-eyebrow">
                        ${slide.Type === "Intro" ? "" : `<span class="wrapped-story-brand">${escapeHtml(siteName)}</span>`}
                        <span>${escapeHtml(preview.eyebrow)}</span>
                    </div>

                    <h1>
                        ${escapeHtml(title)}
                    </h1>

                    ${
                        slide.ShowValue &&
                        preview.value
                            ? `
                                <div class="wrapped-story-value"
                                     data-counter="${escapeHtml(
                                         preview.counter || ""
                                     )}">
                                    ${escapeHtml(formatSlideCopy(preview.value, siteName))}
                                </div>
                              `
                            : ""
                    }

                    ${
                        subtitle
                            ? `
                                <p class="wrapped-story-subtitle">
                                    ${escapeHtml(subtitle)}
                                </p>
                              `
                            : ""
                    }

                    ${
                        slide.ShowDetails &&
                        preview.details
                            ? `
                                <div class="wrapped-story-details">
                                    ${escapeHtml(formatSlideCopy(preview.details, siteName))}
                                </div>
                              `
                            : ""
                    }
                </div>

                ${
                    slide.ShowArtwork && Array.isArray(preview.artworkUrls) && preview.artworkUrls.length
                        ? `<div class="wrapped-story-collage">${preview.artworkUrls.slice(0, 5).map(url => `<img src="${escapeHtml(url)}" alt="" loading="eager" onerror="this.style.display='none'">`).join("")}</div>`
                        : slide.ShowArtwork && preview.artworkUrl
                            ? `<div class="wrapped-story-artwork"><img src="${escapeHtml(preview.artworkUrl)}" alt="" loading="eager" onerror="this.parentElement.innerHTML='<span>ARTWORK</span>'"></div>`
                            : slide.ShowArtwork && preview.artworkLabel
                                ? `<div class="wrapped-story-artwork"><span>${escapeHtml(preview.artworkLabel)}</span></div>`
                                : ""
                }

            </div>
        `;

        renderPreviewProgress(page);

        if (
            ["Counter", "CounterBounce"].includes(slide.Animation) &&
            animationsEnabled
        ) {
            animateCounter(stage, preview);
        }

        scheduleNextPreview(page);
    }

    function scheduleNextPreview(page) {
        if (
            previewIndex >= previewSlides.length - 1 ||
            (viewerMode ? configuration.AutoAdvance === false : page.querySelector("#AutoAdvance")?.checked !== true)
        ) {
            return;
        }

        const seconds =
            clampNumber(
                viewerMode ? configuration.SlideDurationSeconds : page.querySelector("#SlideDurationSeconds")?.value,
                2,
                60,
                8
            );

        previewTimer =
            window.setTimeout(
                function () {
                    nextPreview(page);
                },
                seconds * 1000
            );
    }

    function stopPreviewTimer() {
        if (previewTimer !== null) {
            window.clearTimeout(
                previewTimer
            );

            previewTimer = null;
        }
    }

    function loadLibraryAdditions(userId) {
        return fetchItems({ UserId: userId, Recursive: true, IncludeItemTypes: "Movie,Episode",
            Fields: "DateCreated", EnableUserData: false, EnableImages: false });
    }

    async function loadLivePreviewData(userId) {

        if (!userId) {
            throw new Error("No current Jellyfin user id is available.");
        }

        // Jellyfin 12.4: /Users/{userId}/Items is a legacy compatibility route.
        // Use the supported /Items route with explicit UserId and only valid ItemFields.
        // RunTimeTicks, SeriesId, UserData and image tags are BaseItemDto properties,
        // not ItemFields enum members. EnableUserData requests the play counts.
        const items = await fetchItems({
            UserId: userId, Recursive: true, IsPlayed: true, IncludeItemTypes: "Movie,Episode",
            Fields: "Genres", EnableUserData: true, EnableImages: true
        });
        const movies = items.filter(item => item.Type === "Movie");
        const episodes = items.filter(item => item.Type === "Episode");
        const seriesCounts = new Map();
        const genreCounts = new Map();
        let totalTicks = 0;

        for (const item of items) {
            const playCount = Math.max(1, Number(item.UserData?.PlayCount || 1));
            const runtimeTicks = Math.max(0, Number(item.RunTimeTicks || 0));
            totalTicks += runtimeTicks * playCount;

            for (const genre of (item.Genres || [])) {
                genreCounts.set(genre, (genreCounts.get(genre) || 0) + playCount);
            }

            if (item.Type === "Episode") {
                const seriesName = item.SeriesName || "Unknown series";
                const current = seriesCounts.get(seriesName) || { count: 0, item: item };
                current.count += playCount;
                if (!current.item?.SeriesId && item.SeriesId) current.item = item;
                seriesCounts.set(seriesName, current);
            }
        }

        const favoriteMovie = movies.slice().sort((a, b) =>
            Number(b.UserData?.PlayCount || 1) - Number(a.UserData?.PlayCount || 1)
        )[0] || null;
        const favoriteSeries = [...seriesCounts.entries()].sort((a, b) => b[1].count - a[1].count)[0] || null;
        const favoriteGenre = [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0] || null;
        const hours = Math.round(totalTicks / 10000000 / 3600);

        function jellyfinImageUrl(itemId, imageType, options) {
            if (!itemId) return "";

            const type = imageType || "Primary";
            const imageOptions = Object.assign({
                maxWidth: type === "Backdrop" ? 1920 : 700,
                quality: 90
            }, options || {});

            // Use Jellyfin's image endpoint directly. This is more predictable
            // across Jellyfin Web versions than relying on getImageUrl's option shape.
            const query = {
                maxWidth: imageOptions.maxWidth,
                quality: imageOptions.quality
            };
            if (Number.isInteger(imageOptions.index)) query.index = imageOptions.index;

            return ApiClient.getUrl(
                "Items/" + encodeURIComponent(itemId) + "/Images/" + encodeURIComponent(type),
                query
            );
        }

        function primaryImageUrl(item) {
            if (!item?.Id) return "";
            // ImageTags confirms a primary image for movies. For SeriesId-only
            // references we deliberately allow the endpoint and let <img> fall back.
            if (item.ImageTags && !item.ImageTags.Primary) return "";
            return jellyfinImageUrl(item.Id, "Primary");
        }

        function backdropImageUrl(item) {
            if (!item) return "";
            if (Array.isArray(item.BackdropImageTags) && item.BackdropImageTags.length > 0) {
                return jellyfinImageUrl(item.Id, "Backdrop", { index: 0, maxWidth: 1920 });
            }
            if (item.ParentBackdropItemId && Array.isArray(item.ParentBackdropImageTags) && item.ParentBackdropImageTags.length > 0) {
                return jellyfinImageUrl(item.ParentBackdropItemId, "Backdrop", { index: 0, maxWidth: 1920 });
            }
            return "";
        }

        const moviePosterUrls = movies
            .filter(item => item?.Id && (!item.ImageTags || item.ImageTags.Primary))
            .slice(0, 5)
            .map(item => jellyfinImageUrl(item.Id, "Primary"));

        const seriesPosterUrls = [...seriesCounts.values()]
            .map(entry => entry.item?.SeriesId)
            .filter((id, index, all) => id && all.indexOf(id) === index)
            .slice(0, 5)
            .map(id => jellyfinImageUrl(id, "Primary"));

        // Library additions must not use IsPlayed=true: that would miss uploads
        // for episodes that have not been watched. DateCreated is an estimate of
        // when Jellyfin added the item, not a verifiable file upload event.
        const reportYear = Number((viewerMode ? null : document.getElementById("ReportYear")?.value) || configuration?.ReportYear) || new Date().getUTCFullYear();
        const addedItems = await loadLibraryAdditions(userId);
        const episodesAdded = addedItems.filter(item =>
            item.Type === "Episode" && new Date(item.DateCreated).getUTCFullYear() === reportYear
        );
        const additionsByMonth = new Array(12).fill(0);
        for (const item of addedItems) {
            const date = new Date(item.DateCreated);
            if (!Number.isNaN(date.getTime()) && date.getUTCFullYear() === reportYear)
                additionsByMonth[date.getUTCMonth()]++;
        }
        const mostAdded = Math.max(...additionsByMonth);
        const mostAddedMonth = mostAdded > 0 ? additionsByMonth.indexOf(mostAdded) : -1;
        const mostAddedLabel = mostAddedMonth >= 0
            ? new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(reportYear, mostAddedMonth, 1)))
            : "No uploads found";

        return {
            EpisodesAdded: {
                value: episodesAdded.length.toLocaleString(), counter: String(episodesAdded.length),
                subtitle: `episodes added to the library in ${reportYear}`,
                details: "Based on Jellyfin DateCreated. Includes unwatched episodes."
            },
            MostUploadsMonth: {
                value: mostAddedLabel,
                subtitle: mostAddedMonth >= 0 ? `${mostAdded} movies and episodes added in ${reportYear}` : `No dated additions found for ${reportYear}`,
                details: "Counts new Movie and Episode library entries by DateCreated (UTC)."
            },
            WatchTime: {
                value: hours.toLocaleString(), counter: String(hours),
                subtitle: "estimated lifetime hours", details: "Based on Jellyfin play counts and runtimes."
            },
            MoviesWatched: {
                value: movies.length.toLocaleString(), counter: String(movies.length),
                subtitle: "movies watched", details: "Unique movies marked as played.",
                artworkUrls: moviePosterUrls, artworkLabel: "MOVIES"
            },
            EpisodesWatched: {
                value: episodes.length.toLocaleString(), counter: String(episodes.length),
                subtitle: "episodes watched", details: "Unique episodes marked as played.",
                artworkUrls: seriesPosterUrls, artworkLabel: "SERIES"
            },
            SeriesWatched: {
                value: seriesCounts.size.toLocaleString(), counter: String(seriesCounts.size),
                subtitle: "series watched", details: "Series with at least one played episode.",
                artworkUrls: seriesPosterUrls, artworkLabel: "SERIES"
            },
            FavoriteMovie: favoriteMovie ? {
                value: favoriteMovie.Name || "Unknown movie",
                subtitle: "Your most replayed movie",
                details: "Played " + Math.max(1, Number(favoriteMovie.UserData?.PlayCount || 1)) + " time(s)",
                artworkUrl: jellyfinImageUrl(favoriteMovie.Id, "Primary"),
                backgroundUrl: backdropImageUrl(favoriteMovie),
                artworkLabel: favoriteMovie.Name || "MOVIE"
            } : null,
            FavoriteSeries: favoriteSeries ? {
                value: favoriteSeries[0], subtitle: "Your most watched series",
                details: favoriteSeries[1].count + " episode play(s)",
                artworkUrl: jellyfinImageUrl(favoriteSeries[1].item?.SeriesId || favoriteSeries[1].item?.Id, "Primary"),
                backgroundUrl: favoriteSeries[1].item?.SeriesId
                    ? jellyfinImageUrl(favoriteSeries[1].item.SeriesId, "Backdrop", { index: 0, maxWidth: 1920 })
                    : backdropImageUrl(favoriteSeries[1].item),
                artworkLabel: favoriteSeries[0]
            } : null,
            FavoriteGenre: favoriteGenre ? {
                value: favoriteGenre[0], subtitle: "Your most played genre",
                details: favoriteGenre[1] + " weighted play(s)"
            } : null
        };
    }

    // =========================================================
    // PREVIEW DATA
    // =========================================================

    function getPreviewData(type) {
        const data = {
            Intro: {
                eyebrow: "YOUR YEAR",
                defaultTitle:
                    "Your year on {SiteName}",
                value: "",
                subtitle:
                    "A whole year of movies, series and questionable sleep schedules.",
                details: "",
                artworkLabel: ""
            },

            WatchTime: {
                eyebrow: "TOTAL WATCH TIME",
                defaultTitle:
                    "You watched...",
                value: "428 HOURS",
                counter: "428",
                subtitle:
                    "That's almost 18 full days.",
                details:
                    "You clearly had plans.",
                artworkLabel: ""
            },

            MoviesWatched: {
                eyebrow: "MOVIE NIGHTS",
                defaultTitle:
                    "You watched some movies.",
                value: "197",
                counter: "197",
                subtitle:
                    "movies watched",
                details:
                    "Cinema basically moved into your house.",
                artworkLabel: "MOVIES"
            },

            EpisodesAdded: {
                eyebrow: "NEW EPISODES",
                defaultTitle: "New episodes this year",
                value: "384",
                counter: "384",
                subtitle: "episodes added to the library",
                details: "Uses the Jellyfin library-added timestamp.",
                artworkLabel: ""
            },
            MostUploadsMonth: {
                eyebrow: "BUSIEST MONTH",
                defaultTitle: "Your library's busiest month",
                value: "NOVEMBER",
                subtitle: "92 movies and episodes added",
                details: "Based on when Jellyfin added files to its library.",
                artworkLabel: ""
            },
            EpisodesWatched: {
                eyebrow: "ONE MORE EPISODE",
                defaultTitle:
                    "You said that a lot.",
                value: "612",
                counter: "612",
                subtitle:
                    "episodes watched",
                details:
                    "Sleep was apparently optional.",
                artworkLabel: "SERIES"
            },

            SeriesWatched: {
                eyebrow: "SERIES",
                defaultTitle:
                    "Stories you couldn't leave alone",
                value: "46",
                counter: "46",
                subtitle:
                    "series watched",
                details: "",
                artworkLabel: "SERIES"
            },

            FavoriteMovie: {
                eyebrow: "YOUR MOVIE",
                defaultTitle:
                    "Your movie of the year",
                value: "Interstellar",
                subtitle:
                    "Apparently once wasn't enough.",
                details:
                    "Watched 4 times",
                artworkLabel: "MOVIE POSTER"
            },

            FavoriteSeries: {
                eyebrow: "YOUR SERIES",
                defaultTitle:
                    "You couldn't stop watching",
                value: "Breaking Bad",
                subtitle:
                    "62 episodes later...",
                details:
                    "Your most watched series",
                artworkLabel: "SERIES ARTWORK"
            },

            FavoriteGenre: {
                eyebrow: "YOU HAD A TYPE",
                defaultTitle:
                    "Your favorite genre",
                value: "SCI-FI",
                subtitle:
                    "Space. Robots. Existential dread.",
                details:
                    "31% of your movie watch time",
                artworkLabel: ""
            },

            TopMovies: {
                eyebrow: "TOP 5",
                defaultTitle:
                    "Your top movies",
                value:
                    "1 · Interstellar",
                subtitle:
                    "2 · Dune   3 · The Batman",
                details:
                    "4 · Oppenheimer   5 · Arrival",
                artworkLabel: ""
            },

            TopSeries: {
                eyebrow: "TOP 5",
                defaultTitle:
                    "Your top series",
                value:
                    "1 · Breaking Bad",
                subtitle:
                    "2 · The Last of Us   3 · Arcane",
                details:
                    "4 · Fallout   5 · Dexter",
                artworkLabel: ""
            },

            TopGenres: {
                eyebrow: "YOUR TASTE",
                defaultTitle:
                    "Your top genres",
                value: "SCI-FI",
                subtitle:
                    "Drama · Action · Thriller",
                details: "",
                artworkLabel: ""
            },

            LongestBinge: {
                eyebrow: "NO BRAKES",
                defaultTitle:
                    "Your longest binge",
                value: "9H 43M",
                subtitle:
                    "in one session",
                details:
                    "That next episode button never stood a chance.",
                artworkLabel: ""
            },

            MostActiveDay: {
                eyebrow: "YOUR DAY",
                defaultTitle:
                    "Your favorite day to watch",
                value: "SATURDAY",
                subtitle:
                    "Peak couch activity.",
                details: "",
                artworkLabel: ""
            },

            MostActiveMonth: {
                eyebrow: "PEAK MONTH",
                defaultTitle:
                    "Your biggest month",
                value: "DECEMBER",
                subtitle:
                    "Apparently going outside could wait.",
                details: "",
                artworkLabel: ""
            },

            LateNightWatching: {
                eyebrow: "NIGHT OWL",
                defaultTitle:
                    "After midnight...",
                value: "87 HOURS",
                subtitle:
                    "watched between 00:00 and 05:00",
                details:
                    "Tomorrow-you probably loved that.",
                artworkLabel: ""
            },

            MostUsedDevice: {
                eyebrow: "FAVORITE SCREEN",
                defaultTitle:
                    "Where you watched",
                value: "TV",
                subtitle:
                    "Your most used playback device",
                details:
                    "67% of total playback",
                artworkLabel: ""
            },

            PlaybackQuality: {
                eyebrow: "PIXELS",
                defaultTitle:
                    "Your playback quality",
                value: "4K",
                subtitle:
                    "was your most watched resolution",
                details:
                    "72% Direct Play",
                artworkLabel: ""
            },

            Achievements: {
                eyebrow: "ACHIEVEMENTS",
                defaultTitle:
                    "You unlocked",
                value: "12",
                counter: "12",
                subtitle:
                    "achievements this year",
                details:
                    "Including Midnight Legend",
                artworkLabel: "★"
            },

            FunFact: {
                eyebrow: "FUN FACT",
                defaultTitle:
                    "Here's something ridiculous",
                value: "37 HOURS",
                subtitle:
                    "of intros skipped",
                details:
                    "Modern technology at its finest.",
                artworkLabel: ""
            },

            CustomText: {
                eyebrow: "WRAPPED",
                defaultTitle:
                    "Your custom slide",
                value: "",
                subtitle:
                    "Put whatever you want here.",
                details: "",
                artworkLabel: ""
            },

            Outro: {
                eyebrow: "DREAMSTREAMING",
                defaultTitle:
                    "That's a wrap.",
                value: "2026",
                subtitle:
                    "See you next year.",
                details: "",
                artworkLabel: ""
            }
        };

        const fallback = data[type] || data.CustomText;
        const live = livePreviewData && livePreviewData[type];
        if (live) return Object.assign({}, fallback, {
            value: "", counter: "", details: "", artworkLabel: "", ...live
        });
        if (["Intro", "CustomText", "Outro", "FunFact"].includes(type)) return fallback;
        return {
            eyebrow: getSlideName(type), defaultTitle: getSlideName(type),
            value: "—", subtitle: "No recorded data for this slide."
        };
    }

    // =========================================================
    // PREVIEW VISUALS
    // =========================================================

    function applyPreviewBackground(
        stage,
        style,
        artworkUrl
    ) {
        stage.className =
            "wrapped-preview-stage";

        stage.classList.add(
            "wrapped-bg-" +
            String(style || "Dynamic")
                .toLowerCase()
        );

        // Artwork slides get the real Jellyfin backdrop when one is available.
        // The gradient keeps text readable and also acts as a graceful fallback.
        if (artworkUrl && String(style || "").toLowerCase() === "artwork") {
            const safeUrl = String(artworkUrl).replace(/'/g, "%27");
            stage.style.backgroundImage =
                "linear-gradient(110deg,rgba(13,9,22,.98) 12%,rgba(13,9,22,.76) 55%,rgba(13,9,22,.45)),url('" + safeUrl + "')";
            stage.style.backgroundSize = "cover";
            stage.style.backgroundPosition = "center";
        } else {
            stage.style.backgroundImage = "";
            stage.style.backgroundSize = "";
            stage.style.backgroundPosition = "";
        }
    }

    function getAnimationClass(animation) {
        const classes = {
            Fade:
                "wrapped-animation-fade",

            SlideUp:
                "wrapped-animation-up",

            SlideLeft:
                "wrapped-animation-left",

            SlideRight:
                "wrapped-animation-right",

            Zoom:
                "wrapped-animation-zoom",

            Blur:
                "wrapped-animation-blur",

            Reveal: "wrapped-animation-reveal",
            Drift: "wrapped-animation-drift",
            CounterBounce: "wrapped-animation-bounce",
            Counter:
                "wrapped-animation-fade",

            Cinematic:
                "wrapped-animation-cinematic",

            None:
                "wrapped-animation-none"
        };

        return (
            classes[animation] ||
            classes.Fade
        );
    }

    function animateCounter(stage, preview) {
        if (!preview.counter) {
            return;
        }

        const element =
            stage.querySelector(
                ".wrapped-story-value"
            );

        if (!element) {
            return;
        }

        const target =
            Number(preview.counter);

        if (!Number.isFinite(target)) {
            return;
        }

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const duration = clampNumber(
            (viewerMode ? null : document.getElementById("CounterDurationMs")?.value)
                ?? configuration?.CounterDurationMs, 100, 5000, 1100
        );
        const start =
            performance.now();

        function frame(now) {
            const progress =
                Math.min(
                    (now - start) /
                        duration,
                    1
                );

            const eased =
                1 -
                Math.pow(
                    1 - progress,
                    3
                );

            const value =
                Math.round(
                    target * eased
                );

            if (!element.isConnected) return;
            element.textContent = progress === 1
                ? preview.value
                : value.toLocaleString() + (preview.counterSuffix || "");

            if (progress < 1) {
                requestAnimationFrame(
                    frame
                );
            }
        }

        requestAnimationFrame(frame);
    }

    // =========================================================
    // VISUAL PREFERENCES
    // =========================================================

    function applyVisualPreferences(page) {
        const animations =
            page.querySelector(
                "#EnableAnimations"
            )?.checked !== false;

        const glow =
            page.querySelector(
                "#EnableGlowEffects"
            )?.checked !== false;

        page.classList.toggle(
            "wrapped-no-animation",
            !animations
        );

        page.classList.toggle(
            "wrapped-no-glow",
            !glow
        );
    }

    function revealPage(page) {
        const elements =
            page.querySelectorAll(
                ".wrapped-reveal"
            );

        elements.forEach(
            function (element, index) {
                window.setTimeout(
                    function () {
                        element.classList.add(
                            "visible"
                        );
                    },
                    index * 80
                );
            }
        );
    }

    function updateMasterState(page) {
        const enabled =
            page.querySelector(
                "#WrappedEnabled"
            )?.checked === true;

        const text =
            page.querySelector(
                "#wrappedStateText"
            );

        if (text) {
            text.textContent =
                enabled
                    ? "Enabled"
                    : "Disabled";
        }
    }

    // =========================================================
    // DIRTY STATE
    // =========================================================

    function markDirty(page) {
        updateSaveState(
            page,
            true
        );
    }

    function updateSaveState(
        page,
        isDirty
    ) {
        dirty = isDirty;

        const status =
            page.querySelector(
                "#saveStatus"
            );

        if (!status) {
            return;
        }

        status.classList.remove(
            "unsaved",
            "saved"
        );

        if (dirty) {
            status.textContent =
                "Unsaved changes";

            status.classList.add(
                "unsaved"
            );
        } else {
            status.textContent =
                "No unsaved changes";
        }
    }

    function showSaveMessage(
        page,
        message,
        type
    ) {
        const status =
            page.querySelector(
                "#saveStatus"
            );

        if (!status) {
            return;
        }

        status.textContent =
            message;

        status.classList.remove(
            "unsaved",
            "saved"
        );

        if (type === "success") {
            status.classList.add(
                "saved"
            );
        }

        if (type === "error") {
            status.classList.add(
                "unsaved"
            );
        }
    }

    // =========================================================
    // HELPERS
    // =========================================================

    function getSlideName(type) {
        return (
            slideNames[type] ||
            type ||
            "Slide"
        );
    }

    function getJson(path, query) {
        return ApiClient.ajax({ type: "GET", url: ApiClient.getUrl(path, query), dataType: "json" });
    }

    // Jellyfin releases and reverse-proxy integrations can serialize these DTOs
    // using either PascalCase or camelCase.
    function field(object, name) {
        return object?.[name] ?? object?.[name[0].toLowerCase() + name.slice(1)];
    }

    function itemKey(id) {
        return String(id || "").replaceAll("-", "").toLowerCase();
    }

    async function fetchItems(query) {
        const items = [];
        while (true) {
            const result = await getJson("Items", { ...query, StartIndex: items.length, Limit: 500 });
            const batch = field(result, "Items") || [];
            items.push(...batch);
            if (batch.length < 500 || items.length >= field(result, "TotalRecordCount")) return items;
        }
    }

    function durationLabel(seconds) {
        const total = Math.max(0, Math.floor(Number(seconds) || 0));
        const parts = [
            [Math.floor(total / 86400), "d"],
            [Math.floor(total % 86400 / 3600), "h"],
            [Math.floor(total % 3600 / 60), "m"],
            [total % 60, "s"]
        ];
        return parts.filter(([value]) => value > 0).map(([value, unit]) => value + unit).join(" ") || "0s";
    }

    function countStat(value, subtitle, details = "") {
        return { value: value.toLocaleString(), counter: String(value), subtitle, details };
    }

    function rankedStat(entry, subtitle) {
        if (!entry) return { value: "—", subtitle: "No recorded viewing in this category." };
        return {
            value: entry.name, subtitle,
            details: durationLabel(entry.seconds) + " watched",
            artworkUrl: entry.id ? ApiClient.getUrl("Items/" + encodeURIComponent(entry.id) + "/Images/Primary", { maxWidth: 600 }) : ""
        };
    }

    async function loadRecordedStatistics(userId, year) {
        const payload = await getJson("JellyWrapped/Statistics", { userId, year });
        const libraryTotal = Number(field(payload, "LibraryTotal") || 0);
        const output = {
            LibraryTotal: countStat(libraryTotal, "movies and episodes currently on the server"),
            CombinedTotal: { value: "—", subtitle: "Playback Reporting history is unavailable." },
            FavoriteFranchise: { value: "—", subtitle: "Playback Reporting history is unavailable." }
        };
        if (!field(payload, "HistoryAvailable")) return output;

        const entries = (field(payload, "Entries") || []).map(entry => ({
            id: field(entry, "Id"), name: field(entry, "Name"), type: field(entry, "Type"),
            seconds: Number(field(entry, "Seconds")), plays: Number(field(entry, "Plays"))
        }));
        const watched = new Map(entries.map(entry => [itemKey(entry.id), entry]));
        const movies = entries.filter(entry => entry.type === "Movie");
        const episodes = entries.filter(entry => entry.type === "Episode");
        const seconds = entries.reduce((sum, entry) => sum + entry.seconds, 0);
        const baseQuery = { UserId: userId, Recursive: true, EnableUserData: false, EnableImages: false };
        const series = new Map();
        const genres = new Map();

        if (entries.length) {
            const catalog = await fetchItems({ ...baseQuery, IncludeItemTypes: "Movie,Episode", Fields: "Genres" });
            for (const item of catalog) {
                const entry = watched.get(itemKey(item.Id));
                if (!entry) continue;
                for (const genre of item.Genres || []) genres.set(genre, (genres.get(genre) || 0) + entry.seconds);
                if (!item.SeriesId) continue;
                const group = series.get(item.SeriesId) ?? { id: item.SeriesId, name: item.SeriesName, seconds: 0 };
                group.seconds += entry.seconds;
                series.set(item.SeriesId, group);
            }
        }

        const ranked = entries => [...entries].sort((a, b) => b.seconds - a.seconds || String(a.name).localeCompare(String(b.name)))[0];
        let franchise = null;
        if (movies.length) {
            const collections = await fetchItems({ ...baseQuery, IncludeItemTypes: "BoxSet" });
            for (let offset = 0; offset < collections.length; offset += 5) {
                const batch = await Promise.all(collections.slice(offset, offset + 5).map(async collection => {
                    const members = await fetchItems({ ...baseQuery, ParentId: collection.Id, IncludeItemTypes: "Movie" });
                    const ids = new Set(members.map(item => itemKey(item.Id)));
                    return { id: collection.Id, name: collection.Name,
                        seconds: [...ids].reduce((sum, id) => sum + (watched.get(id)?.seconds || 0), 0) };
                }));
                franchise = ranked([...batch, ...(franchise ? [franchise] : [])].filter(entry => entry.seconds > 0)) || null;
            }
        }

        const topGenre = [...genres.entries()].sort((a, b) => b[1] - a[1])[0];
        return Object.assign(output, {
            WatchTime: { value: durationLabel(seconds), subtitle: "registered watch time in " + year,
                details: seconds.toLocaleString() + " seconds recorded by Playback Reporting" },
            CombinedTotal: countStat(entries.length, "different movies and episodes watched",
                movies.length + " movies + " + episodes.length + " episodes · " + durationLabel(seconds)),
            MoviesWatched: countStat(movies.length, "different movies watched in " + year),
            EpisodesWatched: countStat(episodes.length, "different episodes watched in " + year),
            SeriesWatched: countStat(series.size, "different series watched in " + year),
            FavoriteMovie: rankedStat(ranked(movies), "Your most watched movie"),
            FavoriteSeries: rankedStat(ranked(series.values()), "Your most watched series"),
            FavoriteFranchise: rankedStat(franchise, "Your most watched Jellyfin film collection"),
            FavoriteGenre: topGenre ? { value: topGenre[0], subtitle: "Your most watched genre", details: durationLabel(topGenre[1]) } : null
        });
    }

    function startViewer() {
        if (window.jellyWrappedViewerLoaded) return;
        window.jellyWrappedViewerLoaded = true;

        let loading = false;
        let campaign = "";
        const replay = document.createElement("button");
        replay.type = "button";
        replay.textContent = "Replay Jelly-Wrapped";
        replay.style.cssText = "position:fixed;z-index:1000;right:1rem;bottom:1rem;padding:.7rem 1rem;border:0;border-radius:2rem;background:#45246b;color:white;cursor:pointer";

        function createOverlay() {
            const overlay = document.createElement("div");
            overlay.id = "wrappedPreviewOverlay";
            overlay.className = "wrapped-fullscreen-preview";
            overlay.setAttribute("role", "dialog");
            overlay.setAttribute("aria-label", "Jelly-Wrapped");
            overlay.setAttribute("aria-hidden", "true");
            overlay.innerHTML = `
                <div id="wrappedPreviewStage" class="wrapped-preview-stage"></div>
                <button id="closeWrappedPreview" class="wrapped-preview-close" aria-label="Close">×</button>
                <div class="wrapped-preview-navigation">
                    <button id="previousPreviewSlide" aria-label="Previous slide">‹</button>
                    <div id="previewProgress" class="wrapped-preview-progress"></div>
                    <button id="replayPreview" aria-label="Replay from start">↺</button>
                    <button id="nextPreviewSlide" aria-label="Next slide">›</button>
                </div>`;
            document.body.append(overlay);
            return overlay;
        }

        const home = () => /^(?:#\/?(?:home(?:\.html)?)?(?:[?&].*)?)?$/i.test(location.hash) ||
            /^#\/?home(?:[/?]|$)/i.test(location.hash);
        const currentUser = () => window.ApiClient?.getCurrentUserId?.();

        async function check(force = false) {
            const userId = currentUser();
            if (!home() || !userId) {
                replay.remove();
                const overlay = document.getElementById("wrappedPreviewOverlay");
                if (overlay?.dataset.viewer === "true") {
                    closePreview(document);
                    overlay.remove();
                }
                return;
            }
            if (loading || document.getElementById(pageId)) return;
            loading = true;
            try {
                const payload = await getJson("JellyWrapped/Presentation");
                if (!payload || !home() || userId !== currentUser()) {
                    replay.remove();
                    return;
                }

                configuration = Object.fromEntries([
                    "AllowReplay", "ReportYear", "EnableAnimations", "EnableGlowEffects",
                    "AutoAdvance", "SlideDurationSeconds", "CounterDurationMs", "SiteName"
                ].map(name => [name, field(payload, name)]));

                if (configuration.AllowReplay) document.body.append(replay);
                else replay.remove();

                const key = "jelly-wrapped:" + userId + ":" + field(payload, "Campaign");
                let seen = campaign === key;
                try { seen ||= localStorage.getItem(key) === "seen"; } catch { /* Private browsing. */ }
                if (force ? !configuration.AllowReplay : seen || !field(payload, "Popup")) return;

                const configuredSlides = field(payload, "Slides") || [];
                previewSlides = (configuredSlides.length ? configuredSlides.map((slide, index) =>
                    normalizeSlide(Object.fromEntries(["Id", "Order", "Enabled", "Type", "Title", "Subtitle",
                        "Animation", "BackgroundStyle", "ShowArtwork", "ShowValue", "ShowDetails"]
                        .map(name => [name, field(slide, name)])), index)) : defaultSlides())
                    .filter(slide => slide.Enabled).sort((a, b) => a.Order - b.Order);
                if (!previewSlides.length) return;

                livePreviewData = await loadLivePreviewData(userId);
                Object.assign(livePreviewData, await loadRecordedStatistics(userId, configuration.ReportYear));
                if (!home() || userId !== currentUser()) return;

                const overlay = document.getElementById("wrappedPreviewOverlay") || createOverlay();
                overlay.dataset.viewer = "true";
                showPresentation(document);
                overlay.querySelector("#closeWrappedPreview")?.focus();
                campaign = key;
                try { localStorage.setItem(key, "seen"); } catch { /* Private browsing. */ }
            } catch (error) {
                replay.remove();
                console.warn("[Jelly-Wrapped] Viewer unavailable", error);
            } finally {
                loading = false;
            }
        }

        replay.addEventListener("click", () => check(true));
        window.addEventListener("hashchange", () => check());
        document.addEventListener("keydown", event => {
            const overlay = document.getElementById("wrappedPreviewOverlay");
            if (overlay?.dataset.viewer !== "true" || !overlay.classList.contains("open")) return;
            if (event.key === "Escape") closePreview(document);
            else if (event.key === "ArrowLeft") previousPreview(document);
            else if (event.key === "ArrowRight") nextPreview(document);
            else return;
            event.preventDefault();
            event.stopImmediatePropagation();
        }, true);
        window.setInterval(() => check(), 30000);
        window.setTimeout(() => check(), 1000);
    }

    function getSlideIcon(type) {
        return (
            slideIcons[type] ||
            "◇"
        );
    }

    function clampNumber(
        value,
        min,
        max,
        fallback
    ) {
        const number =
            Number(value);

        if (!Number.isFinite(number)) {
            return fallback;
        }

        return Math.min(
            max,
            Math.max(
                min,
                Math.round(number)
            )
        );
    }

    function escapeHtml(value) {
        if (
            value === null ||
            value === undefined
        ) {
            return "";
        }

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
})();
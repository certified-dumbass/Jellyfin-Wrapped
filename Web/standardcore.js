(function () {
    "use strict";

    const pluginId = "5F84D6A7-2C91-47B3-A65E-841E9D42F731";
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
    let livePreviewDataPromise = null;
    let jellyfinUsers = [];
    let excludedUserIds = new Set();

    // Critical actions are handled by the page-level delegated handler below.
    // Do not bind them globally: Jellyfin can load this controller more than once,
    // and a global handler can otherwise retain stale slide state from an older instance.

    const slideNames = {
        Intro: "Intro",
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
                    openPreview(page);
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
        page.querySelector("#ReportYear")?.addEventListener("input", function () {
            livePreviewDataPromise = null;
            markDirty(page);
        });
        page.querySelector("#WrappedPreviewUser")?.addEventListener("change", function () {
            livePreviewDataPromise = null;
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

        excludedUserIds = new Set((configuration.ExcludedUserIds || []).map(String));
        const yearInput = page.querySelector("#ReportYear");
        if (yearInput) yearInput.value = Number(configuration.ReportYear) || "";
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
                    livePreviewDataPromise = null;
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

    function resetDefaultSlides(page) {
        if (!window.confirm("Reset Jelly-Wrapped to the 11 default slides? Your current slide layout will be replaced after you save.")) {
            return;
        }

        slides = [
            { Type: "Intro", Title: "Your year on Dreamstreaming", Subtitle: "This was your year.", Animation: "Cinematic", BackgroundStyle: "Dynamic", ShowArtwork: false },
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

        console.log("[Wrapped] Reset slides:", slides.length);
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
    position: absolute !important; inset: 0 !important;
    width: 100% !important; height: 100% !important;
    display: flex !important; align-items: center !important; justify-content: center !important;
    padding: 6vw !important; box-sizing: border-box !important;
}
#wrappedPreviewOverlay .wrapped-story-slide { position: relative !important; z-index: 2 !important; width: min(900px, 100%) !important; text-align: center !important; color: #fff !important; }
#wrappedPreviewOverlay .wrapped-story-eyebrow { margin-bottom: 1rem !important; color: #b74bd1 !important; font-size: clamp(.7rem,1.2vw,.9rem) !important; font-weight: 800 !important; letter-spacing: .25em !important; }
#wrappedPreviewOverlay .wrapped-story-slide h1 { max-width: 900px !important; margin: 0 auto !important; color: #fff !important; font-size: clamp(2rem,6vw,5rem) !important; font-weight: 850 !important; line-height: .98 !important; }
#wrappedPreviewOverlay .wrapped-story-value { margin-top: 1.4rem !important; color: #fff !important; font-size: clamp(3rem,10vw,8rem) !important; font-weight: 900 !important; line-height: .95 !important; letter-spacing: -.04em !important; text-shadow: 0 0 50px rgba(183,75,209,.25) !important; }
#wrappedPreviewOverlay .wrapped-story-subtitle { max-width: 700px !important; margin: 1.3rem auto 0 !important; color: rgba(255,255,255,.72) !important; font-size: clamp(1rem,2vw,1.4rem) !important; line-height: 1.5 !important; }
#wrappedPreviewOverlay .wrapped-story-details { margin-top: 1rem !important; color: #b74bd1 !important; font-size: .9rem !important; font-weight: 600 !important; }
#wrappedPreviewOverlay .wrapped-story-artwork { width: 150px !important; height: 210px !important; display: grid !important; place-items: center !important; margin: 2rem auto 0 !important; border: 1px solid rgba(255,255,255,.12) !important; border-radius: 14px !important; background: linear-gradient(145deg,rgba(133,36,153,.4),rgba(255,255,255,.05)) !important; box-shadow: 0 20px 60px rgba(0,0,0,.35) !important; color: rgba(255,255,255,.55) !important; }
#wrappedPreviewOverlay .wrapped-story-artwork img { width: 100% !important; height: 100% !important; object-fit: cover !important; border-radius: inherit !important; display: block !important; }
#wrappedPreviewOverlay .wrapped-story-collage { display: flex !important; justify-content: center !important; align-items: center !important; gap: .8rem !important; margin: 2rem auto 0 !important; max-width: min(760px,90vw) !important; }
#wrappedPreviewOverlay .wrapped-story-collage img { width: clamp(90px,12vw,145px) !important; aspect-ratio: 2/3 !important; object-fit: cover !important; border-radius: 12px !important; border: 1px solid rgba(255,255,255,.12) !important; box-shadow: 0 18px 45px rgba(0,0,0,.42) !important; }
#wrappedPreviewOverlay .wrapped-preview-close { position: absolute !important; z-index: 10 !important; right: 2rem !important; top: 1.5rem !important; width: 44px !important; height: 44px !important; border: 1px solid rgba(255,255,255,.12) !important; border-radius: 50% !important; background: rgba(0,0,0,.35) !important; color: #fff !important; font-size: 1.5rem !important; cursor: pointer !important; }
#wrappedPreviewOverlay .wrapped-preview-navigation { position: absolute !important; z-index: 10 !important; left: 50% !important; bottom: 2rem !important; display: flex !important; align-items: center !important; gap: 1rem !important; width: min(700px,calc(100% - 3rem)) !important; transform: translateX(-50%) !important; }
#wrappedPreviewOverlay .wrapped-preview-navigation button { width: 42px !important; height: 42px !important; flex-shrink: 0 !important; border: 1px solid rgba(255,255,255,.12) !important; border-radius: 50% !important; background: rgba(255,255,255,.06) !important; color: #fff !important; font-size: 1.5rem !important; cursor: pointer !important; }
#wrappedPreviewOverlay .wrapped-preview-progress { display: flex !important; flex: 1 !important; gap: .3rem !important; }
#wrappedPreviewOverlay .wrapped-preview-progress span { height: 3px !important; flex: 1 !important; border-radius: 99px !important; background: rgba(255,255,255,.2) !important; }
#wrappedPreviewOverlay .wrapped-preview-progress span.active { background: #fff !important; }
#wrappedPreviewOverlay .wrapped-bg-dynamic { background: radial-gradient(circle at 20% 20%,rgba(183,75,209,.35),transparent 35%),radial-gradient(circle at 80% 75%,rgba(85,18,103,.45),transparent 40%),#080809 !important; }
#wrappedPreviewOverlay .wrapped-bg-gradient { background: linear-gradient(135deg,#18081d,#080809 55%,#25082d) !important; }
#wrappedPreviewOverlay .wrapped-bg-artwork { background: radial-gradient(circle at center,rgba(133,36,153,.35),transparent 50%),#080809 !important; }
#wrappedPreviewOverlay .wrapped-bg-dark { background: #080809 !important; }
#wrappedPreviewOverlay .wrapped-bg-minimal { background: #111 !important; }
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
            if (!access || access.Eligible !== true) {
                showSaveMessage(livePage, "This user is excluded from Jelly-Wrapped. Save settings if you just changed access.", "error");
                return;
            }
        } catch (error) {
            console.error("[Jelly-Wrapped] Eligibility check failed", error);
            showSaveMessage(livePage, "Cannot confirm user eligibility. Save settings and try again.", "error");
            return;
        }

        // Load real Jellyfin user/library metadata once per page session.
        // This uses played-item metadata (including PlayCount and RuntimeTicks).
        // A dedicated playback-history source can replace this later for exact per-year timing.
        try {
            if (!livePreviewDataPromise) {
                livePreviewDataPromise = loadLivePreviewData(chosenUser);
            }
            livePreviewData = await livePreviewDataPromise;
            console.log("[Wrapped] Live metadata loaded", livePreviewData);
        } catch (error) {
            console.warn("[Wrapped] Could not load live metadata; using preview fallback data.", error);
            livePreviewData = null;
        }

        previewSlides = slides.filter(function (slide) {
            return slide.Enabled;
        });

        if (previewSlides.length === 0) {
            showSaveMessage(livePage, "Enable at least one slide to preview Wrapped.", "error");
            return;
        }

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

                    case "closeWrappedPreview":
                        event.preventDefault();
                        event.stopPropagation();
                        closePreview(document);
                        break;
                }
            });
        }

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

        previewIndex++;

        if (
            previewIndex >=
            previewSlides.length
        ) {
            previewIndex = 0;
        }

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

        const title =
            slide.Title ||
            preview.defaultTitle;

        const subtitle =
            slide.Subtitle ||
            preview.subtitle;

        const animationClass =
            configuration?.EnableAnimations === false
                ? "wrapped-animation-none"
                : getAnimationClass(
                    slide.Animation
                );

        stage.innerHTML = `
            <div class="wrapped-story-slide ${animationClass}">

                <div class="wrapped-story-eyebrow">
                    ${escapeHtml(
                        preview.eyebrow
                    )}
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
                                ${escapeHtml(
                                    preview.value
                                )}
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
                                ${escapeHtml(
                                    preview.details
                                )}
                            </div>
                          `
                        : ""
                }

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
            slide.Animation === "Counter" &&
            configuration?.EnableAnimations !== false
        ) {
            animateCounter(stage, preview);
        }

        scheduleNextPreview(page);
    }

    function scheduleNextPreview(page) {
        if (
            page.querySelector("#AutoAdvance")?.checked !== true
        ) {
            return;
        }

        const seconds =
            clampNumber(
                page.querySelector(
                    "#SlideDurationSeconds"
                )?.value,
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

    async function loadLibraryAdditions(userId) {
        const all = [];
        const pageSize = 500;
        const maxItems = 100000;
        while (all.length < maxItems) {
            const url = ApiClient.getUrl("Items", {
                UserId: userId, Recursive: true,
                IncludeItemTypes: "Movie,Episode",
                Fields: "DateCreated",
                StartIndex: all.length,
                Limit: pageSize,
                EnableUserData: false,
                EnableImages: false
            });
            const response = await ApiClient.ajax({ type: "GET", url, dataType: "json" });
            const batch = Array.isArray(response?.Items) ? response.Items : [];
            all.push(...batch);
            if (batch.length < pageSize || all.length >= Number(response?.TotalRecordCount || 0)) break;
        }
        return all;
    }

    async function loadLivePreviewData(userId) {

        if (!userId) {
            throw new Error("No current Jellyfin user id is available.");
        }

        // Jellyfin 12.4: /Users/{userId}/Items is a legacy compatibility route.
        // Use the supported /Items route with explicit UserId and only valid ItemFields.
        // RunTimeTicks, SeriesId, UserData and image tags are BaseItemDto properties,
        // not ItemFields enum members. EnableUserData requests the play counts.
        const url = ApiClient.getUrl(
            "Items",
            {
                UserId: userId,
                Recursive: true,
                IsPlayed: true,
                IncludeItemTypes: "Movie,Episode",
                Fields: "Genres",
                EnableUserData: true,
                EnableImages: true,
                Limit: 10000
            }
        );

        const response = await ApiClient.ajax({
            type: "GET",
            url: url,
            dataType: "json"
        });

        const items = Array.isArray(response?.Items) ? response.Items : [];
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

        console.log("[Wrapped] Artwork URLs", {
            moviePosters: moviePosterUrls,
            seriesPosters: seriesPosterUrls,
            favoriteMovie: favoriteMovie ? jellyfinImageUrl(favoriteMovie.Id, "Primary") : "",
            favoriteSeries: favoriteSeries ? jellyfinImageUrl(favoriteSeries[1].item?.SeriesId || favoriteSeries[1].item?.Id, "Primary") : ""
        });

        // Library additions must not use IsPlayed=true: that would miss uploads
        // for episodes that have not been watched. DateCreated is an estimate of
        // when Jellyfin added the item, not a verifiable file upload event.
        const reportYear = Number(configuration?.ReportYear) || new Date().getUTCFullYear();
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
                subtitle: "hours watched", details: "Based on your Jellyfin played-item metadata."
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
                    "Your year with Jelly-Wrapped",
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
        return live ? Object.assign({}, fallback, live) : fallback;
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
                "linear-gradient(180deg,rgba(5,5,6,.28),rgba(5,5,6,.88)),url('" + safeUrl + "')";
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

        const suffix =
            preview.value
                .replace(
                    preview.counter,
                    ""
                );

        const duration = 1100;
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

            element.textContent =
                value.toLocaleString() +
                suffix;

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
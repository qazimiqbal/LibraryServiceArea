export const isOtherMapToolActive = (view: __esri.MapView | null) => {
  const container = (view?.container as HTMLElement) || document.body;
  const scope: ParentNode = container || document.body;
  const activeSelectors = [
    ".esri-sketch__button--selected",
    ".esri-sketch__button--active",
    ".esri-sketch__tool-button--selected",
    ".esri-sketch__tool-button--active",
    ".esri-sketch__tool-button[aria-pressed='true']",
    ".esri-sketch__button[aria-pressed='true']",
    ".measure-container .jimu-nav-link.jimu-active",
    ".measure-container .jimu-nav-link.active",
    ".measure-container .esri-distance-measurement-2d",
    ".measure-container .esri-area-measurement-2d",
    ".esri-measurement-widget__button--active",
    ".esri-distance-measurement-2d__button--active",
    ".esri-area-measurement-2d__button--active",
    ".esri-direction-measurement-2d__button--active",
    ".esri-measurement__button--active",
    ".esri-measurement__tool--active",
    ".esri-measurement .esri-widget--button[aria-pressed='true']",
    ".esri-sketch .esri-widget--button[aria-pressed='true']",
    "[class*='measurement'] .esri-widget--button[aria-pressed='true']",
    "[class*='sketch'] .esri-widget--button[aria-pressed='true']",
    ".esri-measurement calcite-action[active]",
    ".esri-measurement calcite-action[aria-pressed='true']",
    ".esri-measurement calcite-action[checked]",
    ".esri-measurement calcite-segmented-control-item[checked]",
    ".esri-distance-measurement-2d calcite-segmented-control-item[checked]",
    ".esri-area-measurement-2d calcite-segmented-control-item[checked]",
    ".esri-measurement calcite-button[aria-pressed='true']",
    ".esri-measurement calcite-button[active]",
  ];

  const activeEls = Array.from(scope.querySelectorAll(activeSelectors.join(", "))) as HTMLElement[];

  const measurePanels = Array.from(
    scope.querySelectorAll(
      ".measure-container .esri-distance-measurement-2d, .measure-container .esri-area-measurement-2d"
    )
  ) as HTMLElement[];

  const isVisible = (el: HTMLElement) => !!(el.offsetParent || el.getClientRects().length);

  if (measurePanels.some(isVisible)) {
    return true;
  }

  const measurePopper = scope.querySelector(
    "#jimu-overlays-container .map-tool-popper .panel-title[title='Measure']"
  ) as HTMLElement | null;

  if (measurePopper) {
    const popper = measurePopper.closest(".map-tool-popper") as HTMLElement | null;
    const popperVisible = popper ? isVisible(popper) : isVisible(measurePopper);
    const referenceHidden = popper?.getAttribute("data-popper-reference-hidden");
    if (popperVisible && referenceHidden !== "true") {
      return true;
    }
  }

  const viewContainer = view?.container as HTMLElement | undefined;
  if (viewContainer) {
    const classList = viewContainer.classList;
    if (
      classList.contains("esri-cursor-crosshair") ||
      classList.contains("esri-cursor-measure") ||
      classList.contains("esri-cursor-draw")
    ) {
      return true;
    }
  }

  if (activeEls.length === 0) {
    return false;
  }

  if (
    activeEls.some((el) => {
      const ariaPressed = el.getAttribute("aria-pressed");
      const ariaChecked = el.getAttribute("aria-checked");
      const dataState = el.getAttribute("data-state");
      const active = el.getAttribute("active");
      return (
        ariaPressed === "true" ||
        ariaChecked === "true" ||
        dataState === "active" ||
        active === ""
      );
    })
  ) {
    return true;
  }

  const measurementHost = scope.querySelector(
    ".esri-measurement, .esri-distance-measurement-2d, .esri-area-measurement-2d"
  ) as HTMLElement | null;

  if (measurementHost) {
    const dataActiveTool = measurementHost.getAttribute("data-active-tool");
    const activeTool = measurementHost.getAttribute("active-tool");
    const dataTool = measurementHost.getAttribute("data-tool");
    const dataMode = measurementHost.getAttribute("data-mode");
    if (dataActiveTool || activeTool || dataTool || dataMode) {
      return true;
    }
  }

  return false;
};

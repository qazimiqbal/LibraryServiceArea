import { React, type AllWidgetProps, appActions, getAppStore, WidgetState } from "jimu-core";

import { JimuMapViewComponent, type JimuMapView } from "jimu-arcgis";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import loadingAnimate from "./images/loading_animated.gif";
import "./widgets.css";
import SearchHeader from "./components/SearchHeader";
import SearchForm from "./components/SearchForm";
import SearchResults from "./components/SearchResults";
import { getAddressVariants as buildAddressVariants } from "./utils/addressVariants";
import { searchAddressInMapService } from "./services/mapSearchService";
import { buildGroupedResultsHtml } from "./utils/resultsRenderer";
import { identifyParcelAndHighlight } from "./services/parcelIdentifyService";
import { isOtherMapToolActive } from "./utils/mapToolState";
import { queryServiceAreaEligibility } from "./services/serviceAreaEligibilityService";
import { queryCommissionerInfo } from "./services/commissionerInfoService";
import { defaultConfig, type IMConfig } from "../config";



// Local widget state model used by Experience Builder runtime for this widget instance.
interface State {
  extent: __esri.Extent | null;
  isIdentifyMode: boolean;
  jimuMapView: JimuMapView | null;
  addressInput: string;
  loading: boolean;
  error: string | null;
  isActive: boolean;  // ✅ Track widget active state
  hasResults: boolean; // Track if results are displayed
}

export default class Widget extends React.PureComponent<
  AllWidgetProps<IMConfig>,
  State
> {
  // ArcGIS map view reference from JimuMapViewComponent.
  view: __esri.MapView | null = null;
  // Click event handler on the map view for identify mode.
  identifyHandler: __esri.Handle | null = null;
  // Graphics layer used to draw identified parcel geometry.
  graphicsLayer: __esri.GraphicsLayer | null = null;
  // DOM observer to track widget visibility/open-state changes.
  observer: MutationObserver | null = null;
  // Polling timer used as fallback for visibility synchronization.
  visibilityCheckInterval: NodeJS.Timeout | null = null;

 
  
  state: State = {
    extent: null,
    isIdentifyMode: true,
    jimuMapView: null,
    addressInput: "",
    loading: false,
    error: null,
    isActive: true, // ✅ Default to inactive 
    hasResults: false, // No results initially
  };

  // References widget configuration in runtime props and validates map binding.
  isConfigured = () => {
    return (
      this.props.useMapWidgetIds && this.props.useMapWidgetIds.length === 1
    );
  };

  // Registers startup hooks: widget visibility sync, DOM observation, and global zoom callback.
  // Also initializes the default message in `resultsDiv`.
  componentDidMount() {
    this.checkWidgetVisibility();
    window.setTimeout(() => {
      this.checkWidgetVisibility();
    }, 0);
    this.observeWidgetChanges();
    this.setupWidgetClickListener();
    // Periodically check widget visibility to catch missed state changes
    this.visibilityCheckInterval = setInterval(() => {
      this.checkWidgetVisibility();
    }, 500); // Check every 500ms
    (window as any).zoomToCoordinates = (x: number, y: number, selectedAddress?: string) => {
      this.zoomToCoordinates(x, y, selectedAddress);
    };
    // Set initial message in resultsDiv
    const resultsDiv = document.getElementById('resultsDiv');
    if (resultsDiv) {
      resultsDiv.innerHTML = '<p style="color: #666; padding: 10px; margin: 5px 0; text-align: center;">Please enter your address above in the input box</p>';
    }
  }

  // Watches Experience Builder widget runtime state and re-syncs focus/identify state.
  componentDidUpdate(prevProps: AllWidgetProps<unknown>) {
    // Detect when widget state changes (e.g., widget becomes active/inactive)
    if (prevProps.state !== this.props.state) {
      this.checkWidgetVisibility();
      // Force re-check after a short delay to ensure state is fully updated
      window.setTimeout(() => {
        this.checkWidgetVisibility();
      }, 100);
    }
  }

  // Cleans up map/DOM resources and releases map auto-control ownership.
  componentWillUnmount() {
    if (this.graphicsLayer) {
      this.graphicsLayer.removeAll();
    }
    if (this.identifyHandler) {
      this.identifyHandler.remove();
      this.identifyHandler = null;
    }
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.visibilityCheckInterval) {
      clearInterval(this.visibilityCheckInterval);
      this.visibilityCheckInterval = null;
    }
    this.setAutoControlMapWidget(false);
  }

  // Simple wrapper that triggers focus-state synchronization.
  checkWidgetVisibility = () => {
    this.syncFocusState();
  };

  // References Experience Builder store (`widgetsRuntimeInfo`, `mapWidgetsInfo`) and widget DOM
  // visibility to determine whether this widget should actively control identify behavior.
  syncFocusState = () => {
    const widgetElement =
      document.getElementById(`widget-${this.props.id}`) ||
      (document.querySelector(`[data-widgetid="${this.props.id}"]`) as HTMLElement | null);
    const isVisible = !!(
      widgetElement &&
      ((widgetElement.offsetParent || widgetElement.getClientRects().length) &&
        (widgetElement.clientWidth > 0 || widgetElement.clientHeight > 0))
    );
    const state = getAppStore().getState() as any;
    const widgetState = state?.widgetsRuntimeInfo?.[this.props.id]?.state;
    const isOpen = widgetState
      ? widgetState === WidgetState.Opened || widgetState === WidgetState.Active
      : true;
    const viewActive = !!this.state.jimuMapView;
    const nextActive = isVisible && isOpen && viewActive;

    const mapWidgetId = this.props.useMapWidgetIds?.[0];
    const autoControlId = mapWidgetId
      ? state?.mapWidgetsInfo?.[mapWidgetId]?.autoControlWidgetId
      : null;

    if (this.state.isActive !== nextActive) {
      this.setState({ isActive: nextActive }, () => {
        this.syncIdentifyHandler();
        if (nextActive && autoControlId !== this.props.id) {
          this.setAutoControlMapWidget(true);
        } else if (!nextActive && autoControlId === this.props.id) {
          this.setAutoControlMapWidget(false);
        }
      });
    } else {
      // Always sync the handler even if isActive didn't change
      // This handles cases where widget was switched but isActive state is same
      this.syncIdentifyHandler();
      if (nextActive && autoControlId !== this.props.id) {
        this.setAutoControlMapWidget(true);
      } else if (!nextActive && autoControlId === this.props.id) {
        this.setAutoControlMapWidget(false);
      }
    }
  };

  // Observes DOM mutations to detect open/close/visibility shifts from controller panels.
  observeWidgetChanges = () => {
    const targetNode = document.body;
    if (!targetNode) return;

    this.observer = new MutationObserver(() => {
      this.checkWidgetVisibility();
    });

    this.observer.observe(targetNode, { childList: true, subtree: true });
  };

  // Adds click listeners on widget shell/header to trigger visibility/focus re-evaluation.
  setupWidgetClickListener = () => {
    // Add click listener to detect when user clicks on this widget
    const checkOnClick = () => {
      window.setTimeout(() => {
        this.checkWidgetVisibility();
      }, 50);
    };
    
    // Listen for clicks on the widget element
    const widgetElement = document.getElementById(`widget-${this.props.id}`) ||
      document.querySelector(`[data-widgetid="${this.props.id}"]`);
    
    if (widgetElement) {
      widgetElement.addEventListener('click', checkOnClick);
    }
    
    // Also check when any widget header is clicked (for controller/panel widgets)
    window.setTimeout(() => {
      const widgetHeaders = document.querySelectorAll(`[data-widgetid="${this.props.id}"] .widget-header, .jimu-widget-header`);
      widgetHeaders.forEach(header => {
        header.addEventListener('click', checkOnClick);
      });
    }, 1000);
  };



  getRuntimeConfig = () => {
    const config = this.props.config;
    return {
      searchServiceUrl: config?.searchServiceUrl || defaultConfig.searchServiceUrl,
      parcelIdentifyUrl: config?.parcelIdentifyUrl || defaultConfig.parcelIdentifyUrl,
      libraryServiceAreaUrl:
        config?.libraryServiceAreaUrl || defaultConfig.libraryServiceAreaUrl,
      commissionerDistrictUrl:
        config?.commissionerDistrictUrl || defaultConfig.commissionerDistrictUrl,
    };
  };

  // Delegates to shared street-suffix normalization utility for address query variants.
  getAddressVariants = (input: string) => {
    return buildAddressVariants(input);
  };

  // Receives the active Jimu map view, initializes map references/graphics layer,
  // and synchronizes identify handler state against active/open widget state.
  onActiveViewChange = (jimuMapView: JimuMapView) => {    
    if (!jimuMapView) {
      this.view = null;
      this.setState({ jimuMapView: null }, () => {
        this.syncFocusState();
      });
      return;
    }

    this.view = jimuMapView.view as __esri.MapView;

      if (this.view) {
        // Capture the initial extent only once
        if (!this.state.extent) {
          this.setState({ extent: this.view.extent.clone() }); // Store the initial extent
          //console.log("TEst");
        }

        // Create the graphics layer if not already created
        if (!this.graphicsLayer) {
          this.graphicsLayer = new GraphicsLayer();
          this.view.map.add(this.graphicsLayer);
        }
        if (this.state.isIdentifyMode && this.state.isActive && !this.identifyHandler) {
          this.identifyHandler = this.view.on(
            "click",
            this.handleMapClick as any
          );
        } else if ((!this.state.isIdentifyMode || !this.state.isActive) && this.identifyHandler) {
          this.identifyHandler.remove();
          this.identifyHandler = null;
        }
      }

    this.setState({ jimuMapView }, () => {
      this.syncFocusState();
      window.setTimeout(() => {
        this.syncFocusState();
      }, 0);
    });
  };

  // Decides whether identify click handling should be enabled based on view/activity state.
  syncIdentifyHandler = () => {
    const viewActive = !!this.state.jimuMapView;
    if (this.view && this.state.isIdentifyMode && viewActive && this.canIdentify()) {
      this.enableIdentify();
    } else {
      this.disableIdentify();
    }
  };

  // References Experience Builder map auto-control ownership to prevent tool conflicts.
  canIdentify = () => {
    const mapWidgetId = this.props.useMapWidgetIds?.[0];
    if (!mapWidgetId) {
      return false;
    }
    const state = getAppStore().getState() as any;
    const autoControlId = state?.mapWidgetsInfo?.[mapWidgetId]?.autoControlWidgetId;
    if (!this.state.isActive) {
      return false;
    }
    return !autoControlId || autoControlId === this.props.id;
  };

  // Requests or releases auto-control of the map widget through Experience Builder actions.
  setAutoControlMapWidget = (shouldControl: boolean) => {
    const mapWidgetId = this.props.useMapWidgetIds?.[0];
    if (!mapWidgetId) {
      return;
    }

    const state = getAppStore().getState() as any;
    const autoControlId = state?.mapWidgetsInfo?.[mapWidgetId]?.autoControlWidgetId;
    if (shouldControl && autoControlId === this.props.id) {
      return;
    }
    if (!shouldControl && autoControlId && autoControlId !== this.props.id) {
      return;
    }

    const action = shouldControl
      ? appActions.requestAutoControlMapWidget(mapWidgetId, this.props.id)
      : appActions.releaseAutoControlMapWidget(mapWidgetId);
    getAppStore().dispatch(action);
  };

  // Removes identify click listener from the current map view.
  disableIdentify = () => {
    if (this.view && this.identifyHandler) {
      this.identifyHandler.remove();
      this.identifyHandler = null;
    }
  };

  // Attaches identify click listener when identify mode and map context are valid.
  enableIdentify = () => {
    if (this.view && this.state.isIdentifyMode && this.state.jimuMapView) {
      if (this.identifyHandler) {
        return;
      }
      this.identifyHandler = this.view.on("click", this.handleMapClick as any);
    }
  };

  // Updates `addressInput` from SearchForm text input.
  handleAddressInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ addressInput: event.target.value });
  };

  // Handles SearchForm submit and delegates to explicit search action.
  handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    this.handleSearchClick();
  };

  // References `resultsDiv` DOM node, validates input, and starts map-service search workflow.
  handleSearchClick = () => {
    const resultsDiv = document.getElementById('resultsDiv');
    if (!resultsDiv) {
      return;
    }
    
    // Check if input is empty
    if (!this.state.addressInput.trim()) {
      resultsDiv.innerHTML = '<p style="color: #d32f2f; padding: 10px; margin: 5px 0;">Please enter an address to search.</p>';
      resultsDiv.style.display = 'block';
      this.setState({ hasResults: false });
      return;
    }
    
    resultsDiv.innerHTML = "";
    resultsDiv.style.display = 'block';
    resultsDiv.style.flex = '1';

    this.getdataFromMapService(this.state.addressInput);
  };

  // Clears UI/data state: resets panel content, removes map graphics, and zooms to initial extent.
  // New clear button function
  handleClearClick = () => {
    const resultsDiv = document.getElementById("resultsDiv");
    if (resultsDiv) {
      resultsDiv.innerHTML = '<p style="color: #666; padding: 10px; margin: 5px 0; text-align: center;">Please enter your address above in the input box</p>';
      resultsDiv.style.display = 'block';
    }

    if (this.graphicsLayer) {
      this.graphicsLayer.removeAll();
    }

    if (this.view && this.state.extent) {
      this.view.goTo(this.state.extent); // Use the stored initial extent
    }
    this.setState({
      addressInput: "", // Clear the addressInput field
      hasResults: false // Hide Clear button
    });
  };

  // Map click entry point for identify mode; guards by tool ownership and active map tools,
  // then routes click coordinates into parcel identify/zoom flow.
  handleMapClick = async (event: __esri.ViewClickEvent) => {
    if (!this.canIdentify()) {
      return;
    }
    if (isOtherMapToolActive(this.view)) {
      return;
    }
    //console.log("Map clicked at screen coordinates: " + event.x + ", " + event.y);
    const resultsDiv = document.getElementById("resultsDiv");
    if (!resultsDiv) {
      return;
    }
    resultsDiv.style.display = 'block';
    
    if (this.view) {
      const screenPoint = { x: event.x, y: event.y };
      const mapPoint = this.view.toMap(screenPoint);
      this.zoomToCoordinates(mapPoint.x, mapPoint.y);
    }
  };

  // Calls shared map search service, then renders grouped HTML into `resultsDiv`.
  // References address variants utility and grouped-results HTML builder.
  // New function to get data from MapService
  getdataFromMapService = async (addressInput: string) => {
    const resultsDiv = document.getElementById("resultsDiv");
    const { searchServiceUrl } = this.getRuntimeConfig();

    if (!addressInput.trim()) {
      return;
    }

    try {
      this.setState({ loading: true, error: null });
      const searchResult = await searchAddressInMapService(
        addressInput,
        this.getAddressVariants,
        searchServiceUrl
      );

      if (!resultsDiv) {
        return;
      }

      if (searchResult.type === "message") {
        resultsDiv.innerHTML = searchResult.message;
        return;
      }

      resultsDiv.innerHTML = buildGroupedResultsHtml(searchResult.groupedData);
      this.setState({ hasResults: true });
    } catch (error) {
      console.error('Error fetching data from MapService:', error);
      this.setState({ error: 'An error occurred. Please try again later.' });
      if (resultsDiv) {
        resultsDiv.innerHTML = 'An error occurred. Please try again later.';
      }
    } finally {
      this.setState({ loading: false });
    }
  };

  // Highlights parcel/point on map, queries Library Service Area and Commissioner
  // District polygon services, then renders eligibility and commissioner messages.
  zoomToCoordinates = async (x: number, y: number, selectedAddress?: string) => {
    const resultsDiv = document.getElementById("resultsDiv");
    const { parcelIdentifyUrl, libraryServiceAreaUrl, commissionerDistrictUrl } =
      this.getRuntimeConfig();

    // Step 1 — highlight parcel or fallback point on map
    let identifyResult: Awaited<ReturnType<typeof identifyParcelAndHighlight>> | null = null;
    try {
      identifyResult = await identifyParcelAndHighlight(x, y, this.graphicsLayer, parcelIdentifyUrl);
    } catch (err) {
      console.error("Parcel identify error:", err);
    }

    const rawAddress = (
      selectedAddress?.trim() ||
      identifyResult?.identifiedAddress?.trim() ||
      "Selected address"
    );
    const displayAddress = rawAddress.toUpperCase();
    const escapedAddress = displayAddress
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
    const encodedAddress = encodeURIComponent(rawAddress);
    const nearestLibraryUrl = `https://fulcolibrary.bibliocommons.com/v2/locations?address=${encodedAddress}`;

    // Step 2 — check Library Service Area
    let isWithinServiceArea = false;
    let serviceAreaName: string | null = null;
    try {
      const eligResult = await queryServiceAreaEligibility(x, y, libraryServiceAreaUrl);
      isWithinServiceArea = eligResult.isWithinServiceArea;
      serviceAreaName = eligResult.serviceAreaName;
    } catch (err) {
      console.error("Library Service Area query error:", err);
    }

    // Step 3 — check Commissioner District
    let isWithinCommissionDistrict = false;
    let district: string | null = null;
    let commissionerName: string | null = null;
    let commissionerQueryRan = false;
    try {
      const commResult = await queryCommissionerInfo(x, y, commissionerDistrictUrl);
      commissionerQueryRan = true;
      isWithinCommissionDistrict = commResult.isWithinCommissionDistrict;
      district = commResult.district;
      commissionerName = commResult.commissionerName;
    } catch (err) {
      console.error("Commissioner District query error:", err);
    }

    // Step 4 — build result HTML and render
    const identifyHtml = identifyResult?.infoHtml || "";

    const eligibilityHtml = isWithinServiceArea
      ? `<div style="margin-top:10px; padding:10px; border-radius:4px; background:#eef9f1; border:1px solid #86c89a; color:#1f5a2d;">
           <strong>"${escapedAddress}"</strong> Address is within Fulton County Library Service Area and qualifies for a free library card.${
             serviceAreaName ? ` <strong>(${serviceAreaName})</strong>` : ""
           }
           <p style="margin:6px 0 0 0;">
             <button type="button" style="padding:6px 12px; border:1px solid #1f5a2d; border-radius:4px; background:#1f5a2d; color:#ffffff; cursor:pointer;" onclick="window.open('https://afpl.ent.sirsi.net/client/en_US/default/search/registration/N/SYMWS/true', '_blank', 'noopener,noreferrer')">Register For Card</button>
           </p>
           <p style="margin:6px 0 0 0;">
             <button type="button" style="padding:6px 12px; border:1px solid #1f5a2d; border-radius:4px; background:#ffffff; color:#1f5a2d; cursor:pointer;" onclick="window.open('${nearestLibraryUrl}', '_blank', 'noopener,noreferrer')">Find Your Nearest Library</button>
           </p>
         </div>`
      : `<div style="margin-top:10px; padding:10px; border-radius:4px; background:#fff3f3; border:1px solid #f0a2a2; color:#8a1f1f;">
           <strong>"${escapedAddress}"</strong> Address is outside Fulton County Library Service Area. Resident does not qualify for a free Fulton County library card.
         </div>`;

    let commissionerHtml = "";
    if (commissionerQueryRan) {
      if (isWithinCommissionDistrict) {
        commissionerHtml = `
          <div style="margin-top:10px;">
            <table class="my-table">
              <thead><tr><th colspan="2">Commission District Information</th></tr></thead>
              <tbody>
                <tr><td>Address</td><td>${escapedAddress}</td></tr>
                <tr><td>Commission District</td><td>${district ?? "N/A"}</td></tr>
                <tr><td>Commissioner</td><td>${commissionerName ?? "N/A"}</td></tr>
              </tbody>
            </table>
          </div>`;
      } else {
        commissionerHtml = `
          <div style="margin-top:10px; padding:10px; border-radius:4px; background:#fff8e8; border:1px solid #e1c26b; color:#6b4d00;">
            <strong>"${escapedAddress}"</strong> This address is outside the Fulton County Commission Districts.
          </div>`;
      }
    }

    if (resultsDiv) {
      resultsDiv.innerHTML = `${identifyHtml}${commissionerHtml}${eligibilityHtml}`;
      this.setState({ hasResults: true });
    }

    if (this.view && identifyResult?.mapPoint) {
      await this.view.goTo({ target: identifyResult.mapPoint, zoom: 9 }).catch((err) => {
        console.error("Error centering map view:", err);
      });
    }
  };

  // Main render tree: map view bridge + search UI + loading/error + details panel.
  render() {
    if (!this.isConfigured()) {
      return "In Widget Configuration, please select a map";
    }
    const { loading, error, addressInput } = this.state;
    return (
      <div
        className="widget-use-map-view">
        <JimuMapViewComponent
          useMapWidgetId={this.props.useMapWidgetIds?.[0]}
          onActiveViewChange={this.onActiveViewChange}
        ></JimuMapViewComponent>
        
        <div style={{ marginLeft: "5px", marginRight: "5px" }}>
          <SearchHeader />
          <SearchForm
            addressInput={addressInput}
            hasResults={this.state.hasResults}
            onSubmit={this.handleFormSubmit}
            onAddressInputChange={this.handleAddressInputChange}
            onSearchClick={this.handleSearchClick}
            onClearClick={this.handleClearClick}
          />
        </div>

        <SearchResults
          loading={loading}
          error={error}
          loadingImage={loadingAnimate}
        />
    </div>
    );
  }
}

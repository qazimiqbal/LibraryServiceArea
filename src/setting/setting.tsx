import { React, Immutable } from "jimu-core";
import { type AllWidgetSettingProps } from "jimu-for-builder";
import { MapWidgetSelector } from "jimu-ui/advanced/setting-components";
import { defaultConfig, type Config, type IMConfig } from "../config";

export default class Setting extends React.PureComponent<
  AllWidgetSettingProps<IMConfig>,
  unknown
> {
  onMapSelected = (useMapWidgetIds: string[]) => {
    this.props.onSettingChange({
      id: this.props.id,
      useMapWidgetIds: useMapWidgetIds,
    });
  };

  onConfigChange = (field: keyof Config, value: string) => {
    const nextConfig = (this.props.config || Immutable(defaultConfig)).set(field, value);

    this.props.onSettingChange({
      id: this.props.id,
      config: nextConfig,
    });
  };

  render() {
    const config = this.props.config;

    return (
      <div className="sample-use-map-view-setting p-2">
        <MapWidgetSelector
          onSelect={this.onMapSelected}
          useMapWidgetIds={this.props.useMapWidgetIds}
        />

        <div className="mt-3">
          <label className="d-block mb-1">Search Service URL</label>
          <input
            className="w-100"
            type="text"
            value={config?.searchServiceUrl || defaultConfig.searchServiceUrl}
            onChange={(event) => this.onConfigChange("searchServiceUrl", event.target.value)}
          />
        </div>

        <div className="mt-3">
          <label className="d-block mb-1">Parcel Identify URL</label>
          <input
            className="w-100"
            type="text"
            value={config?.parcelIdentifyUrl || defaultConfig.parcelIdentifyUrl}
            onChange={(event) => this.onConfigChange("parcelIdentifyUrl", event.target.value)}
          />
        </div>

        <div className="mt-3">
          <label className="d-block mb-1">Library Service Area URL</label>
          <input
            className="w-100"
            type="text"
            value={config?.libraryServiceAreaUrl || defaultConfig.libraryServiceAreaUrl}
            onChange={(event) => this.onConfigChange("libraryServiceAreaUrl", event.target.value)}
          />
        </div>

        <div className="mt-3">
          <label className="d-block mb-1">Commissioner District URL</label>
          <input
            className="w-100"
            type="text"
            value={config?.commissionerDistrictUrl || defaultConfig.commissionerDistrictUrl}
            onChange={(event) => this.onConfigChange("commissionerDistrictUrl", event.target.value)}
          />
        </div>
      </div>
    );
  }
}


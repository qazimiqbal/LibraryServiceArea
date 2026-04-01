export type GroupedSearchResult = Record<
  string,
  Array<{ name: string; labelX: number; labelY: number; attributes: any }>
>;

export type SearchAddressResult =
  | { type: "message"; message: string }
  | { type: "results"; groupedData: GroupedSearchResult };

export const searchAddressInMapService = async (
  addressInput: string,
  variantBuilder: (input: string) => string[],
  layerUrl: string
): Promise<SearchAddressResult> => {
  const queryUrl = `${layerUrl}/query`;

  let displayField = "Name";
  try {
    const metaResp = await fetch(`${layerUrl}?f=json`);
    if (metaResp.ok) {
      const meta = await metaResp.json();
      displayField = meta.displayField || meta.displayFieldName || displayField;
    }
  } catch (e) {
    console.warn("Failed to fetch layer metadata, using fallback display field", e);
  }

  const variants = variantBuilder(addressInput);
  const escapedVariants = variants.map((value) => value.replace(/'/g, "''"));
  const fieldsToSearch = Array.from(new Set(["Name", displayField].filter(Boolean)));
  const whereParts = escapedVariants.map((value) =>
    fieldsToSearch.map((field) => `${field} LIKE '${value}%'`).join(" OR ")
  );

  const params = {
    where: whereParts.length > 0 ? `(${whereParts.join(") OR (")})` : "1=0",
    outFields: "*",
    returnGeometry: true,
    f: "json",
  };

  const queryString = new URLSearchParams(params as any).toString();
  const response = await fetch(`${queryUrl}?${queryString}`);

  if (!response.ok) {
    throw new Error("Network error. Please try again later.");
  }

  const data = await response.json();

  if (!data.features || data.features.length === 0) {
    return { type: "message", message: "No results found for the given address." };
  }
  if (data.features.length > 500) {
    return {
      type: "message",
      message:
        "More than 500 results found for the given address. Please narrow down your search.",
    };
  }

  const groupedData = data.features.reduce((acc: GroupedSearchResult, feature: any) => {
    const featType = feature.attributes?.["FeatType"] || "Result";
    if (!acc[featType]) {
      acc[featType] = [];
    }

    const geometry = feature.geometry || {};
    let labelX = 0;
    let labelY = 0;

    if (typeof geometry.x === "number" && typeof geometry.y === "number") {
      labelX = geometry.x;
      labelY = geometry.y;
    } else if (
      geometry.rings &&
      Array.isArray(geometry.rings) &&
      geometry.rings.length > 0 &&
      Array.isArray(geometry.rings[0]) &&
      geometry.rings[0].length > 0 &&
      Array.isArray(geometry.rings[0][0]) &&
      geometry.rings[0][0].length >= 2
    ) {
      const firstPoint = geometry.rings[0][0];
      labelX = firstPoint[0];
      labelY = firstPoint[1];
    } else if (
      feature.attributes &&
      feature.attributes.LabelX !== undefined &&
      feature.attributes.LabelY !== undefined
    ) {
      labelX = Number(feature.attributes.LabelX) || 0;
      labelY = Number(feature.attributes.LabelY) || 0;
    } else {
      console.warn("Feature missing usable geometry or label attributes", feature);
    }

    const ftLower = (featType || "").toString().toLowerCase();
    let nameVal: string;

    if (ftLower.includes("address")) {
      nameVal =
        feature.attributes?.["Display"] ||
        feature.attributes?.[displayField] ||
        feature.attributes?.["Name"] ||
        feature.attributes?.["Address"] ||
        "Unknown";
    } else if (ftLower.includes("parcel") || ftLower.includes("tax")) {
      const addr = feature.attributes?.["Address"] || feature.attributes?.["ADDR"] || "";
      const pid =
        feature.attributes?.["ParcelID"] ||
        feature.attributes?.["PARCELID"] ||
        feature.attributes?.["PARCEL_ID"] ||
        "";
      if (addr && pid) {
        nameVal = `${addr} (${pid})`;
      } else if (addr) {
        nameVal = addr;
      } else if (pid) {
        nameVal = pid;
      } else {
        nameVal = feature.attributes?.["Name"] || "Parcel";
      }
    } else {
      nameVal =
        feature.attributes?.[displayField] ||
        feature.attributes?.["Name"] ||
        feature.attributes?.["Address"] ||
        "Unknown";
    }

    acc[featType].push({
      name: nameVal,
      labelX,
      labelY,
      attributes: feature.attributes,
    });
    return acc;
  }, {} as GroupedSearchResult);

  return { type: "results", groupedData };
};

import request from "@arcgis/core/request";
import { loadModules } from "esri-loader";

interface IdentifyResult {
  mapPoint: __esri.Point;
  infoHtml: string | null;
  parcelId: string | null;
  identifiedAddress: string | null;
}

const normalizeAddressPart = (value: unknown): string => {
  if (value == null) {
    return "";
  }

  const text = String(value).trim();
  return text;
};

const extractIdentifiedAddress = (attrs: Record<string, any>): string | null => {
  const directAddressFields = [
    "SiteAddress",
    "SITE_ADDRESS",
    "SitusAddress",
    "SITUS_ADDRESS",
    "FullAddress",
    "FULL_ADDRESS",
    "Address",
    "ADDRESS",
    "LocAddress",
    "LOC_ADDRESS",
    "Location",
    "LOCATION",
    "PropAddress",
    "PROP_ADDRESS",
  ];

  for (const field of directAddressFields) {
    const value = normalizeAddressPart(attrs[field]);
    if (value) {
      return value;
    }
  }

  const street = normalizeAddressPart(
    attrs.StreetAddress ?? attrs.STREET_ADDRESS ?? attrs.Street ?? attrs.STREET
  );
  const city = normalizeAddressPart(attrs.City ?? attrs.CITY);
  const zip = normalizeAddressPart(attrs.Zip ?? attrs.ZIP ?? attrs.ZipCode ?? attrs.ZIPCODE);

  const lineParts = [street, city, zip].filter(Boolean);
  if (lineParts.length > 0) {
    return lineParts.join(", ");
  }

  return null;
};

const addFallbackPointGraphic = (
  Graphic: __esri.GraphicConstructor,
  mapPoint: __esri.Point,
  graphicsLayer: __esri.GraphicsLayer | null
) => {
  if (!graphicsLayer) {
    return;
  }

  const pointGraphic = new Graphic({
    geometry: mapPoint,
    symbol: {
      type: "simple-marker",
      style: "circle",
      color: [208, 32, 41, 0.9],
      size: 10,
      outline: {
        color: [255, 255, 255, 1],
        width: 1.5,
      },
    },
  });

  graphicsLayer.add(pointGraphic);
};

export const identifyParcelAndHighlight = async (
  x: number,
  y: number,
  graphicsLayer: __esri.GraphicsLayer | null,
  identifyUrl: string
): Promise<IdentifyResult> => {
  const [Graphic, Polygon, Point] = await loadModules([
    "esri/Graphic",
    "esri/geometry/Polygon",
    "esri/geometry/Point",
  ]);

  const mapPoint = new Point({
    x,
    y,
    spatialReference: { wkid: 2240 },
  });

  if (graphicsLayer) {
    graphicsLayer.removeAll();
  }

  const spatialReferenceWkid = 2240;

  const fetchIdentify = async (tolerance: number, extentPadding: number) => {
    const params = {
      f: "json",
      geometry: JSON.stringify({
        x,
        y,
        spatialReference: {
          wkid: spatialReferenceWkid,
        },
      }),
      geometryType: "esriGeometryPoint",
      sr: spatialReferenceWkid,
      tolerance,
      returnGeometry: true,
      mapExtent: JSON.stringify({
        xmin: x - extentPadding,
        ymin: y - extentPadding,
        xmax: x + extentPadding,
        ymax: y + extentPadding,
        spatialReference: { wkid: spatialReferenceWkid },
      }),
      imageDisplay: [800, 600, 96],
      layers: "all",
    };

    const response = await request(identifyUrl, {
      query: params,
      responseType: "json",
    });

    return response.data;
  };

  let result = await fetchIdentify(10, 1000);
  if (!result?.results || result.results.length === 0) {
    result = await fetchIdentify(50, 3000);
  }

  if (!result?.results || result.results.length === 0) {
    addFallbackPointGraphic(Graphic, mapPoint, graphicsLayer);
    return { mapPoint, infoHtml: null, parcelId: null, identifiedAddress: null };
  }

  const firstResult = result.results[0];
  const features = firstResult?.geometry;

  if (features) {
    const polygon = new Polygon({
      rings: features.rings,
      spatialReference: { wkid: spatialReferenceWkid },
    });

    const polygonGraphic = new Graphic({
      geometry: polygon,
      symbol: {
        type: "simple-fill",
        color: [0, 0, 255, 0.2],
        outline: {
          color: [0, 0, 255, 1],
          width: 2,
        },
      },
    });

    if (graphicsLayer) {
      graphicsLayer.add(polygonGraphic);
    }
  }

  const attrs = firstResult.attributes || {};
  const parcelId = attrs.ParcelID || null;
  const identifiedAddress = extractIdentifiedAddress(attrs);

  return { mapPoint, infoHtml: null, parcelId, identifiedAddress };
};

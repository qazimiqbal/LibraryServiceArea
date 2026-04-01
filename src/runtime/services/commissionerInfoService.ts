export interface CommissionerInfoResult {
  isWithinCommissionDistrict: boolean;
  district: string | null;
  commissionerName: string | null;
}

// Queries the Commissioner District polygon layer via POST to find which
// commission district contains the given point (in SR 2240).
export const queryCommissionerInfo = async (
  x: number,
  y: number,
  queryUrl: string
): Promise<CommissionerInfoResult> => {
  const body = new URLSearchParams({
    f: "json",
    where: "1=1",
    geometry: JSON.stringify({ x, y, spatialReference: { wkid: 2240 } }),
    geometryType: "esriGeometryPoint",
    inSR: "2240",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "District,CommName",
    returnGeometry: "false",
    resultRecordCount: "1",
  });

  const response = await fetch(queryUrl, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  if (!response.ok) {
    throw new Error(`Commissioner District query failed: ${response.status}`);
  }

  const data = await response.json();
  if (data?.error) {
    throw new Error(data.error.message || "Commissioner District query error");
  }

  const feature = data?.features?.[0];
  if (!feature) {
    return { isWithinCommissionDistrict: false, district: null, commissionerName: null };
  }

  const attrs = feature.attributes || {};
  return {
    isWithinCommissionDistrict: true,
    district: attrs.District != null ? String(attrs.District) : null,
    commissionerName: attrs.CommName != null ? String(attrs.CommName) : null,
  };
};



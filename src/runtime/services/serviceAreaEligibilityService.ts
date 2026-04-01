export interface ServiceAreaEligibilityResult {
  isWithinServiceArea: boolean;
  serviceAreaName: string | null;
}

// Queries the Library Service Area polygon layer via POST to determine
// whether the given point (in SR 2240) falls inside the service area.
export const queryServiceAreaEligibility = async (
  x: number,
  y: number,
  queryUrl: string
): Promise<ServiceAreaEligibilityResult> => {
  const body = new URLSearchParams({
    f: "json",
    where: "1=1",
    geometry: JSON.stringify({ x, y, spatialReference: { wkid: 2240 } }),
    geometryType: "esriGeometryPoint",
    inSR: "2240",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "Name",
    returnGeometry: "false",
    resultRecordCount: "1",
  });

  const response = await fetch(queryUrl, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  if (!response.ok) {
    throw new Error(`Library Service Area query failed: ${response.status}`);
  }

  const data = await response.json();
  if (data?.error) {
    throw new Error(data.error.message || "Library Service Area query error");
  }

  const feature = data?.features?.[0];
  const serviceAreaName = (feature?.attributes?.Name as string) || null;

  return {
    isWithinServiceArea: !!feature,
    serviceAreaName,
  };
};

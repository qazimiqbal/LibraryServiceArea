import { GroupedSearchResult } from "../services/mapSearchService";

export const buildGroupedResultsHtml = (groupedData: GroupedSearchResult) => {
  const sortedEntries = Object.entries(groupedData).sort(([typeA], [typeB]) => {
    const aLower = (typeA || "").toLowerCase();
    const bLower = (typeB || "").toLowerCase();

    if (aLower.includes("address")) return -1;
    if (bLower.includes("address")) return 1;
    if (aLower.includes("parcel") || aLower.includes("tax")) return -1;
    if (bLower.includes("parcel") || bLower.includes("tax")) return 1;
    return aLower.localeCompare(bLower);
  });

  const groupedHTML = sortedEntries
    .map(([featType, items]) => {
      const sortedItems = (items as any[]).sort((a: any, b: any) => {
        const nameA = (a.name || "").toLowerCase();
        const nameB = (b.name || "").toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        if ((a.labelX || 0) < (b.labelX || 0)) return -1;
        if ((a.labelX || 0) > (b.labelX || 0)) return 1;
        if ((a.labelY || 0) < (b.labelY || 0)) return -1;
        if ((a.labelY || 0) > (b.labelY || 0)) return 1;
        return 0;
      });

      return `
          <h3>${featType}</h3>
          <ul>
            ${sortedItems
              .map(
                (item) => `
                <li>
                  <a href="#" onclick='window.zoomToCoordinates(${item.labelX}, ${item.labelY}, ${JSON.stringify(item.name || "")}); return false;' style="color: blue; text-decoration: none;" aria-label="Zoom to ${item.name} on map" title="Zoom to ${item.name} on map">
                    ${item.name}
                  </a>
                </li>`
              )
              .join("")}
          </ul>
        `;
    })
    .join("");

  return `
      <p>Found ${Object.values(groupedData).flat().length} results for the given address.</p>
      ${groupedHTML}
    `;
};

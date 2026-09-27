export function filterLibrary(themes, organization = {}, filters = {}) {
  const query = (filters.query || "").trim().toLocaleLowerCase();
  return Object.entries(themes).filter(([id, entry]) => {
    const metadata = organization.themes?.[id] || {};
    const group = organization.groups?.[metadata.groupId] || "";
    const tags = metadata.tags || [];
    return (
      (!query ||
        [entry.name, group, ...tags].some((text) =>
          text.toLocaleLowerCase().includes(query),
        )) &&
      (!filters.favorites || metadata.favorite) &&
      (!filters.group ||
        (filters.group === "ungrouped"
          ? !metadata.groupId
          : metadata.groupId === filters.group)) &&
      (!filters.tag || tags.includes(filters.tag))
    );
  });
}

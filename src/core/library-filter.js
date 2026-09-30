import { folderPaths } from "./library-folders.js";
const compareText = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
}).compare;

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase();
const strings = (value) =>
  (Array.isArray(value) ? value : [value]).filter(
    (text) => typeof text === "string" && text.trim(),
  );
const facetFields = {
  character: ["character", "characters", "characterName"],
  skin: ["skin", "skins", "skinName"],
  type: ["themeType", "type"],
};
const tagFacets = {
  character: ["character", "캐릭터", "キャラクター", "角色"],
  skin: ["skin", "스킨", "スキン", "皮肤"],
  type: ["type", "theme type", "유형", "타입", "種類", "类型"],
};

// A label must be supplied by metadata or an explicit tag. Never guess a
// character, skin, or scene type from a package name or its media.
export function libraryLabels(entry = {}, metadata = {}) {
  const sources = [entry, entry.metadata || {}, metadata];
  const tags = [...new Set(sources.flatMap((source) => strings(source.tags)))];
  const labels = { tags };
  for (const [facet, fields] of Object.entries(facetFields)) {
    const values = sources.flatMap((source) =>
      fields.flatMap((field) => strings(source[field])),
    );
    for (const tag of tags) {
      const match = tag.match(/^([^:：]+)[:：]\s*(.+)$/u);
      if (match && tagFacets[facet].includes(normalize(match[1])))
        values.push(match[2].trim());
    }
    labels[facet] = [...new Set(values.map((value) => value.trim()))];
  }
  return labels;
}

export function libraryFacets(themes, organization = {}) {
  const facets = {
    tags: new Set(),
    character: new Set(),
    skin: new Set(),
    type: new Set(),
  };
  for (const [id, entry] of Object.entries(themes)) {
    const labels = libraryLabels(entry, organization.themes?.[id]);
    for (const key of Object.keys(facets))
      for (const label of labels[key]) facets[key].add(label);
  }
  return Object.fromEntries(
    Object.entries(facets).map(([key, values]) => [
      key,
      [...values].sort(compareText),
    ]),
  );
}

export function filterLibrary(themes, organization = {}, filters = {}) {
  const query = normalize(filters.query);
  const words = [...query.matchAll(/"([^"]+)"|(\S+)/gu)].map(
    (match) => match[1] || match[2],
  );
  const paths = folderPaths(
    organization.groups || {},
    organization.groupParents || {},
  );
  return Object.entries(themes).filter(([id, entry]) => {
    const metadata = organization.themes?.[id] || {};
    const group = (paths[metadata.groupId] || []).join(" / ");
    const labels = libraryLabels(entry, metadata);
    const searchable = [
      entry.name,
      entry.description,
      group,
      ...Object.values(labels).flat(),
    ]
      .filter((value) => typeof value === "string")
      .map(normalize);
    return (
      words.every((word) => searchable.some((text) => text.includes(word))) &&
      (!filters.favorites || metadata.favorite) &&
      (!filters.group ||
        (filters.group === "ungrouped"
          ? !metadata.groupId
          : filters.groupIds
            ? filters.groupIds.has(metadata.groupId)
            : metadata.groupId === filters.group)) &&
      (!filters.tag || labels.tags.includes(filters.tag)) &&
      ["character", "skin", "type"].every(
        (facet) => !filters[facet] || labels[facet].includes(filters[facet]),
      )
    );
  });
}

export function sortLibrary(entries, organization = {}, sort = "library") {
  if (sort === "library") return entries;
  const paths =
    sort === "group"
      ? folderPaths(organization.groups || {}, organization.groupParents || {})
      : {};
  const compare = (a, b) => compareText(String(a), String(b));
  const byName = ([aId, a], [bId, b]) =>
    compare(a.name, b.name) || compare(aId, bId);
  return [...entries].sort((a, b) => {
    if (sort === "name-desc") return -byName(a, b);
    if (sort === "favorites") {
      const favorite =
        Number(!!organization.themes?.[b[0]]?.favorite) -
        Number(!!organization.themes?.[a[0]]?.favorite);
      if (favorite) return favorite;
    }
    if (sort === "group") {
      const groupName = ([id]) =>
        (paths[organization.themes?.[id]?.groupId] || []).join(" / ");
      const group = compare(groupName(a), groupName(b));
      if (group) return group;
    }
    return byName(a, b);
  });
}

import { folderIndex, folderCounts } from "./library-folders.js";

const normalize = (value) =>
  String(value || "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase();

// Folders and files share one result list and one page budget. Building this
// model never changes the library or infers a character from a theme name.
export function explorerContents(themes, organization, options = {}) {
  const groups = organization.groups || {};
  const index = folderIndex(groups, organization.groupParents || {});
  const counts = folderCounts(themes, organization);
  const location =
    options.location === "all" || options.location === "ungrouped"
      ? options.location
      : Object.hasOwn(groups, options.location)
        ? options.location
        : "";
  const entries = options.entries || Object.entries(themes);
  const byFolder = new Map([[null, []]]);
  for (const id of Object.keys(groups)) byFolder.set(id, []);
  const matching = new Set();
  for (const entry of entries) {
    const assigned = organization.themes?.[entry[0]]?.groupId;
    const group = Object.hasOwn(groups, assigned) ? assigned : null;
    byFolder.get(group).push(entry);
    for (let parent = group; parent; parent = index.parents[parent])
      matching.add(parent);
  }
  const words = [...normalize(options.query).matchAll(/"([^"]+)"|(\S+)/gu)].map(
    (match) => match[1] || match[2],
  );
  const paths = {};
  const folderPath = (id) => {
    if (!paths[id]) {
      const parent = index.parents[id];
      paths[id] = [...(parent ? folderPath(parent) : []), groups[id]];
    }
    return paths[id];
  };
  const pathCounts = new Map();
  for (const id of Object.keys(groups)) {
    const key = normalize(folderPath(id).join(" / "));
    pathCounts.set(key, (pathCounts.get(key) || 0) + 1);
  }
  // A matching empty folder must still expose its ancestor path in tree view.
  // Name matches only use stored folder labels, never guessed theme metadata.
  if (!options.faceted && words.length)
    for (const id of Object.keys(groups))
      if (
        words.every((word) =>
          normalize(folderPath(id).join(" / ")).includes(word),
        )
      )
        for (let parent = id; parent; parent = index.parents[parent])
          matching.add(parent);
  const visibleFolder = (id) => !options.filtered || matching.has(id);
  const items = [];
  const pushThemes = (folder, depth) => {
    for (const [id, entry] of byFolder.get(folder) || [])
      items.push({ kind: "theme", id, entry, depth, groupId: folder });
  };
  const tree = options.view === "tree";
  const autoExpand = !!options.filtered || !!options.includeChildren;
  const visit = (id, depth) => {
    if (!visibleFolder(id)) return;
    const children = index.children.get(id);
    const hasContents = children.length > 0 || counts.groups[id] > 0;
    const expanded = hasContents && (autoExpand || !!options.expanded?.has(id));
    items.push({
      kind: "folder",
      id,
      name:
        groups[id] +
        (pathCounts.get(normalize(folderPath(id).join(" / "))) > 1
          ? " · " + id.slice(0, 8)
          : ""),
      depth,
      path: folderPath(id),
      parentId: index.parents[id],
      folders: children.length,
      direct: counts.groups[id],
      total: counts.subtree[id],
      hasContents,
      expanded,
      autoExpanded: autoExpand,
    });
    if (tree && expanded) {
      for (const child of children) visit(child, depth + 1);
      pushThemes(id, depth + 1);
    }
  };
  if (location === "all") {
    for (const [id, entry] of entries)
      items.push({
        kind: "theme",
        id,
        entry,
        depth: 0,
        groupId: organization.themes?.[id]?.groupId,
      });
  } else if (location === "ungrouped") {
    pushThemes(null, 0);
  } else {
    for (const child of index.children.get(location || null)) visit(child, 0);
    pushThemes(location || null, 0);
    if (!tree && location && options.includeChildren) {
      const visitFiles = (id) => {
        pushThemes(id, 0);
        for (const child of index.children.get(id)) visitFiles(child);
      };
      for (const child of index.children.get(location)) visitFiles(child);
    }
  }
  return {
    location,
    items,
    index,
    counts,
    themes: items
      .filter((item) => item.kind === "theme")
      .map(({ id, entry }) => [id, entry]),
    folders: items.filter((item) => item.kind === "folder").length,
  };
}

const historyFields = [
  "groupFilter",
  "page",
  "filter",
  "favoriteFilter",
  "tagFilter",
  "characterFilter",
  "skinFilter",
  "typeFilter",
  "librarySort",
  "libraryPageSize",
  "folderIncludeChildren",
];
const frame = (panel) => ({
  ...Object.fromEntries(historyFields.map((key) => [key, panel[key]])),
  scrollTop: panel.shadow?.querySelector("section")?.scrollTop || 0,
});
const signature = (value) =>
  JSON.stringify(
    historyFields
      .filter((key) => !["groupFilter", "page"].includes(key))
      .map((key) => value[key]),
  );

export function navigateExplorer(panel, location, focus = "explorer-path") {
  location ||= "";
  if ((panel.groupFilter || "") === location) return;
  const current = frame(panel);
  panel.explorerBack ??= [];
  panel.explorerForward = [];
  panel.explorerBack.push(current);
  if (panel.explorerBack.length > 100) panel.explorerBack.shift();
  panel.explorerLocations ??= new Map();
  panel.explorerLocations.set(panel.groupFilter || "", current);
  const remembered = panel.explorerLocations.get(location);
  panel.groupFilter = location;
  const restore = remembered && signature(remembered) === signature(current);
  panel.page = restore ? remembered.page || 0 : 0;
  panel.libraryScrollTop = restore ? remembered.scrollTop : 0;
  panel.libraryFocus = focus;
  panel.explorerSelectedFolder = null;
  panel.render();
}

export function traverseExplorer(panel, direction) {
  const from =
    direction === "back" ? panel.explorerBack : panel.explorerForward;
  if (!from?.length) return;
  const to = direction === "back" ? "explorerForward" : "explorerBack";
  const current = frame(panel);
  panel.explorerLocations ??= new Map();
  panel.explorerLocations.set(panel.groupFilter || "", current);
  (panel[to] ??= []).push(current);
  const saved = from.pop();
  for (const key of historyFields) panel[key] = saved[key];
  panel.libraryScrollTop = saved.scrollTop;
  panel.libraryFocus = "explorer-path";
  panel.explorerSelectedFolder = null;
  panel.render();
}

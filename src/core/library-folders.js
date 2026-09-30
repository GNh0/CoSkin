const compare = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
}).compare;

// Older libraries have only groups:{id:name}. Missing or broken parents
// remain browsable as roots; the host validates writes and prevents cycles.
export function folderIndex(groups = {}, parents = {}) {
  const safeParents = {};
  for (const id of Object.keys(groups)) {
    const parent = parents[id];
    safeParents[id] =
      parent && parent !== id && Object.hasOwn(groups, parent) ? parent : null;
  }
  for (const id of Object.keys(groups)) {
    const seen = new Set([id]);
    let parent = safeParents[id];
    while (parent) {
      if (seen.has(parent)) {
        safeParents[id] = null;
        break;
      }
      seen.add(parent);
      parent = safeParents[parent];
    }
  }
  const children = new Map([[null, []]]);
  for (const id of Object.keys(groups)) children.set(id, []);
  for (const id of Object.keys(groups)) children.get(safeParents[id]).push(id);
  for (const ids of children.values())
    ids.sort((a, b) => compare(groups[a], groups[b]) || compare(a, b));
  return { parents: safeParents, children };
}

export function folderDescendants(
  groups,
  parents,
  id,
  index = folderIndex(groups, parents),
) {
  const { children } = index;
  const result = new Set();
  const visit = (key) => {
    if (!children.has(key) || result.has(key)) return;
    result.add(key);
    for (const child of children.get(key)) visit(child);
  };
  visit(id);
  return result;
}

export function folderPath(groups, parents, id) {
  return folderPaths(groups, parents)[id] || [];
}

export function folderPaths(groups = {}, parents = {}) {
  const index = folderIndex(groups, parents);
  const paths = {};
  const path = (id) => {
    if (paths[id]) return paths[id];
    const parent = index.parents[id];
    paths[id] = [...(parent ? path(parent) : []), groups[id]];
    return paths[id];
  };
  for (const id of Object.keys(groups)) path(id);
  return paths;
}

export function folderOptions(groups = {}, parents = {}, exclude = new Set()) {
  const paths = folderPaths(groups, parents);
  const options = Object.keys(groups)
    .filter((id) => !exclude.has(id))
    .map((id) => [id, paths[id].join(" / ")]);
  const counts = new Map();
  for (const [, label] of options)
    counts.set(label, (counts.get(label) || 0) + 1);
  return options
    .map(([id, label]) => [
      id,
      counts.get(label) > 1 ? label + " · " + id.slice(0, 8) : label,
    ])
    .sort((a, b) => compare(a[1], b[1]) || compare(a[0], b[0]));
}

export function folderRows(
  groups = {},
  parents = {},
  expanded = new Set(),
  query = "",
) {
  const index = folderIndex(groups, parents);
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase();
  let visible;
  if (normalized) {
    visible = new Set();
    for (const [id, label] of Object.entries(groups)) {
      if (!label.normalize("NFKC").toLocaleLowerCase().includes(normalized))
        continue;
      for (let key = id; key; key = index.parents[key]) visible.add(key);
    }
  }
  const rows = [];
  const visit = (id, depth) => {
    if (visible && !visible.has(id)) return;
    rows.push({
      id,
      name: groups[id],
      depth,
      parentId: index.parents[id],
      children: index.children.get(id).length,
      expanded: !!visible || expanded.has(id),
    });
    if (visible || expanded.has(id))
      for (const child of index.children.get(id)) visit(child, depth + 1);
  };
  for (const id of index.children.get(null)) visit(id, 0);
  return rows;
}

export function folderCounts(themes, organization = {}) {
  const counts = {
    total: Object.keys(themes).length,
    ungrouped: 0,
    groups: {},
    subtree: {},
  };
  for (const id of Object.keys(organization.groups || {}))
    counts.groups[id] = 0;
  for (const id of Object.keys(themes)) {
    const group = organization.themes?.[id]?.groupId;
    if (group && Object.hasOwn(counts.groups, group)) counts.groups[group]++;
    else counts.ungrouped++;
  }
  const index = folderIndex(
    organization.groups || {},
    organization.groupParents || {},
  );
  const sum = (id) => {
    const total =
      counts.groups[id] +
      index.children.get(id).reduce((total, child) => total + sum(child), 0);
    counts.subtree[id] = total;
    return total;
  };
  for (const id of index.children.get(null)) sum(id);
  return counts;
}

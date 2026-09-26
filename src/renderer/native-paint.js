const properties = new WeakMap();
const parsers = new WeakMap();
const normalized = (element, property, desired) => {
  const document = element.ownerDocument;
  if (!document?.createElement) return desired;
  let style = parsers.get(document);
  if (!style) {
    style = document.createElement("div").style;
    parsers.set(document, style);
  }
  style.removeProperty(property);
  style.setProperty(property, desired.value, desired.priority);
  return {
    value: style.getPropertyValue(property),
    priority: style.getPropertyPriority(property),
  };
};
const read = (element, property) => ({
  value: element.style.getPropertyValue(property),
  priority: element.style.getPropertyPriority(property),
});
const equal = (left, right) =>
  left.value === right.value && left.priority === right.priority;
const write = (element, property, desired) => {
  if (equal(read(element, property), desired)) return read(element, property);
  if (desired.value)
    element.style.setProperty(property, desired.value, desired.priority);
  else element.style.removeProperty(property);
  return read(element, property);
};

/** Shared ownership prevents overlapping app/main/composer paint from restoring another skin override. */
export class NativePaintScope {
  constructor() {
    this.owner = Symbol("CoSkin native paint");
    this.entries = new Map();
  }
  set(element, property, value, priority = "important") {
    let node = properties.get(element);
    if (!node) {
      node = new Map();
      properties.set(element, node);
    }
    let state = node.get(property);
    const actual = read(element, property);
    if (!state) {
      state = { original: actual, applied: actual, owners: new Map() };
      node.set(property, state);
    } else if (!equal(actual, state.applied)) state.original = actual;
    const desired = normalized(element, property, { value, priority });
    state.owners.delete(this.owner);
    state.owners.set(this.owner, desired);
    state.applied = write(element, property, desired);
    let tracked = this.entries.get(element);
    if (!tracked) {
      tracked = new Set();
      this.entries.set(element, tracked);
    }
    tracked.add(property);
  }
  release(element) {
    const tracked = this.entries.get(element);
    if (!tracked) return;
    const node = properties.get(element);
    for (const property of tracked) {
      const state = node?.get(property);
      if (!state) continue;
      const actual = read(element, property);
      if (!equal(actual, state.applied)) state.original = actual;
      state.owners.delete(this.owner);
      const remaining = [...state.owners.values()];
      state.applied = write(
        element,
        property,
        remaining.at(-1) || state.original,
      );
      if (!remaining.length) node.delete(property);
    }
    if (!node?.size) properties.delete(element);
    this.entries.delete(element);
  }
  dispose() {
    for (const element of this.entries.keys()) this.release(element);
  }
}

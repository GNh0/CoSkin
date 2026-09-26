/** Reserve real layout space for temporary mode controls, then restore exact inline styles. */
export function createModeLayout(doc = document, readStyle = getComputedStyle) {
  let surface;
  let saved;
  return {
    update(active) {
      const next = active
        ? doc.querySelector("[data-app-shell-workspace-row]")
        : null;
      if (surface === next) return;
      if (surface) {
        for (const [property, value, priority] of saved) {
          if (value) surface.style.setProperty(property, value, priority);
          else surface.style.removeProperty(property);
        }
      }
      surface = next;
      if (!surface) return;
      saved = ["padding-top", "box-sizing"].map((property) => [
        property,
        surface.style.getPropertyValue(property),
        surface.style.getPropertyPriority(property),
      ]);
      const top = parseFloat(readStyle(surface).paddingTop) || 0;
      surface.style.setProperty("box-sizing", "border-box", "important");
      surface.style.setProperty("padding-top", `${top + 64}px`, "important");
    },
    dispose() {
      this.update(false);
    },
  };
}

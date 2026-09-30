export function libraryFixture(count = 1200) {
  const themes = {};
  const organization = { groups: {}, themes: {} };
  for (let i = 0; i < 240; i++)
    organization.groups["group." + i] = "Group " + i;
  for (let i = 0; i < count; i++) {
    const id = "theme." + String(i).padStart(4, "0");
    themes[id] = { name: "Theme " + String(i).padStart(4, "0"), revision: 1 };
    organization.themes[id] = {
      favorite: i % 7 === 0,
      ...(i % 4 ? { groupId: "group." + (i % 240) } : {}),
      tags: [
        "character: Character " + (i % 60),
        "skin: Skin " + (i % 12),
        "type: " + (i % 2 ? "Character scene" : "Battle"),
        "Unique tag " + i,
      ],
    };
  }
  return { themes, organization, enabled: true, bindings: {} };
}

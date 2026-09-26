import type { ThemeDocument, StateName, ThemeState } from "./contracts.ts";

export function editableState(
  document: ThemeDocument,
  profileId: string,
  target: string,
  item: string | null,
  state: StateName,
): ThemeState {
  const profile = document.theme.profiles.find(
    (profile) => profile.id === profileId,
  );
  if (!profile) throw new Error("대상 구성 오류");
  let rules = profile.rules;
  if (item) {
    document.localOverrides ??= {};
    rules = document.localOverrides[profileId] ??= [];
  }
  let rule = rules.find(
    (rule) =>
      rule.target === target && (item ? rule.item === item : !rule.item),
  );
  if (!rule) {
    rule = { id: "rule-" + crypto.randomUUID(), target, states: {} };
    if (item) rule.item = item;
    rules.push(rule);
  }
  return (rule.states[state] ??= {});
}

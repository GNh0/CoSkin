import type { ThemeDocument, StateName, Rule } from "./contracts.ts";
import { merge, resolve } from "./engine.ts";

export function defaultTargetSelection(target: string, item: string | null) {
  return {
    pickedItem: item,
    targetItem: ["sidebar.project-row", "sidebar.thread-row"].includes(target)
      ? null
      : item,
  };
}

/** Move one edited state between an individual rule and all matching rows. */
export function moveTargetState(
  document: ThemeDocument,
  profileId: string,
  target: string,
  item: string,
  state: StateName,
  all: boolean,
): void {
  const profile = document.theme.profiles.find(
    (profile) => profile.id === profileId,
  );
  if (!profile || !item) throw new Error("대상 구성 오류");
  document.localOverrides ??= {};
  const local = (document.localOverrides[profileId] ??= []);
  const flags =
    state === "selectedHover"
      ? { selected: true, hover: true }
      : state === "base"
        ? {}
        : { [state]: true };
  const effective = resolve(
    [profile, { id: "local", name: "local", rules: local }],
    target,
    item,
    flags,
  );
  const destination = all ? profile.rules : local;
  let rule = destination.find(
    (rule) => rule.target === target && (all ? !rule.item : rule.item === item),
  );
  if (!rule) {
    rule = {
      id: "rule-" + crypto.randomUUID(),
      target,
      states: {},
    } satisfies Rule;
    if (!all) rule.item = item;
    destination.push(rule);
  }
  rule.states[state] = merge(rule.states[state] || {}, effective);
  if (all) {
    for (const override of local.filter((rule) => rule.target === target))
      delete override.states[state];
    document.localOverrides[profileId] = local.filter(
      (rule) => Object.keys(rule.states).length > 0,
    );
  }
}

import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { messages } from "../src/renderer/messages.js";
import { controlMessages } from "../src/renderer/control-messages.js";
import { panelMessages } from "../src/renderer/panel-messages.js";

test("every literal translation call resolves a real dictionary key", () => {
  for (const name of fs
    .readdirSync("src/renderer")
    .filter((name) => name.endsWith(".js"))) {
    const source = fs.readFileSync("src/renderer/" + name, "utf8");
    const ast = ts.createSourceFile(
      name,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    const keys = [];
    const literals = (node) => {
      if (ts.isStringLiteral(node)) keys.push(node.text);
      else if (ts.isConditionalExpression(node)) {
        literals(node.whenTrue);
        literals(node.whenFalse);
      } else if (ts.isParenthesizedExpression(node)) literals(node.expression);
    };
    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "t" &&
        node.arguments[0]
      )
        literals(node.arguments[0]);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    for (const key of keys) {
      const dictionary = key.startsWith("panel.")
        ? panelMessages.ko
        : key.startsWith("control.")
          ? controlMessages.ko
          : messages.ko;
      const localKey = key.startsWith("panel.")
        ? key.slice(6)
        : key.startsWith("control.")
          ? key.slice(8)
          : key;
      assert.equal(typeof dictionary[localKey], "string", `${name}: ${key}`);
    }
  }
});
import { normalizeLocale, applicationLocale } from "../src/renderer/locale.js";
test("application language precedes OS language and locale regions have explicit fallbacks", () => {
  assert.equal(
    applicationLocale(
      { documentElement: { lang: "ja-JP" } },
      { language: "ko-KR" },
    ),
    "ja",
  );
  assert.equal(
    applicationLocale({ documentElement: { lang: "" } }, { language: "ko-KR" }),
    "ko",
  );
  for (const value of ["zh", "zh-CN", "zh-TW", "zh-HK", "zh-Hans", "zh_Hant"])
    assert.equal(normalizeLocale(value), "zh-CN");
  assert.equal(normalizeLocale("en-GB"), "en");
  assert.equal(normalizeLocale("fr-FR"), "en");
});
test("all supported language dictionaries have identical keys and placeholders", () => {
  const keys = Object.keys(messages.ko).sort();
  const placeholders = (value) =>
    [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [locale, dictionary] of Object.entries(messages)) {
    assert.deepEqual(Object.keys(dictionary).sort(), keys, locale);
    for (const key of keys) {
      assert.equal(typeof dictionary[key], "string");
      assert.deepEqual(
        placeholders(dictionary[key]),
        placeholders(messages.ko[key]),
        locale + ":" + key,
      );
    }
  }
});
import { labelMessages } from "../src/renderer/label-messages.js";
test("target, effect and control labels cover every language without missing keys", () => {
  for (const locale of ["en", "ja", "zh-CN"])
    for (const group of Object.keys(labelMessages.ko))
      assert.deepEqual(
        Object.keys(labelMessages[locale][group]).sort(),
        Object.keys(labelMessages.ko[group]).sort(),
        locale + ":" + group,
      );
});
import { errors } from "../src/renderer/error-messages.js";
test("editor controls and structured errors have complete four-language keys", () => {
  for (const dictionaries of [controlMessages, errors])
    for (const locale of ["en", "ja", "zh-CN"])
      assert.deepEqual(
        Object.keys(dictionaries[locale]).sort(),
        Object.keys(dictionaries.ko).sort(),
      );
});
test("gallery, detail and editor modules contain no Korean UI literals", () => {
  for (const file of [
    "gallery.js",
    "detail.js",
    "editor-context.js",
    "effects-editor.js",
    "previews.js",
    "panel.js",
  ])
    assert.equal(
      /[가-힣]/.test(fs.readFileSync("src/renderer/" + file, "utf8")),
      false,
      file,
    );
});

test("panel menus and status messages cover all languages", () => {
  for (const locale of ["en", "ja", "zh-CN"])
    assert.deepEqual(
      Object.keys(panelMessages[locale]).sort(),
      Object.keys(panelMessages.ko).sort(),
    );
});

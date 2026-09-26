import { applicationLocale } from "./locale.js";
import { labelMessages } from "./label-messages.js";
const labels = (group) =>
  new Proxy(
    {},
    {
      get: (_, key) =>
        labelMessages[applicationLocale(document, navigator)][group][key],
      ownKeys: () => Object.keys(labelMessages.ko[group]),
      getOwnPropertyDescriptor: (_, key) =>
        key in labelMessages.ko[group]
          ? { enumerable: true, configurable: true }
          : undefined,
    },
  );
export const text = labels("text");
export const targetLabels = labels("targetLabels");
export const effectLabels = labels("effectLabels");
export const layerLabels = labels("layerLabels");
export const parameterLabels = labels("parameterLabels");
export const valueLabels = labels("valueLabels");

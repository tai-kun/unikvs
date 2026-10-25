// Vite+ が使用する oxc がデコレーターをサポートするまでの一時的な処置です。
// https://github.com/vitejs/vite/discussions/21891

import babel, { defineRolldownBabelPreset } from "@rolldown/plugin-babel";
import type { PluginOption } from "vite-plus";

function decoratorPreset(
  options: Record<string, unknown>,
): ReturnType<typeof defineRolldownBabelPreset> {
  return defineRolldownBabelPreset({
    preset: () => ({
      plugins: [["@babel/plugin-proposal-decorators", options]],
    }),
    rolldown: {
      filter: {
        code: "@",
      },
    },
  });
}

export default function proposalDecorators(): PluginOption {
  return babel({
    presets: [decoratorPreset({ version: "2023-11" })],
  });
}

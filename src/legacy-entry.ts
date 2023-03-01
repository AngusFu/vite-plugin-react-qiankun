import type { OutputAsset } from "rollup";
import type { Plugin } from "vite";

import { load as loadHTML } from "cheerio";

export default function legacyHTMLEntryPlugin(): Plugin {
  return {
    name: "legacy-html-entry",
    apply: "build",
    enforce: "post",

    generateBundle(_, bundle) {
      Object.keys(bundle)
        .filter((el) => el.endsWith(".html") && !el.endsWith(".legacy.html"))
        .forEach((key) => {
          bundle[key.replace(".html", ".legacy.html")] = processScriptTags(
            bundle[key] as OutputAsset
          );
        });
    },
  };
}

function processScriptTags(asset: OutputAsset) {
  const input = asset.source.toString();
  const $ = loadHTML(input);

  $("script[type=module]").remove();
  $("link[rel=modulepreload]").remove();
  $("script[nomodule]").removeAttr("nomodule");

  const newAsset = Object.create(asset);
  newAsset.source = $.root().html()!;
  newAsset.fileName = asset.fileName.replace(".html", ".legacy.html");

  return newAsset as OutputAsset;
}

import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { load as loadHTML } from "cheerio";
import portfinder from "portfinder";
// @ts-ignore
import deIndent from "de-indent";

import legacyHTMLEntry from "./legacy-html-entry";

export { legacyHTMLEntry };

export function qiankun({
  appName,
  port = 8001,
  legacyEntry = false,
}: {
  appName: string;
  port?: number;
  legacyEntry?: boolean;
}): Plugin[] {
  return [
    {
      name: "change-server-origin",
      async config() {
        const realPort = await portfinder.getPortPromise({ port });

        return {
          base: "/",
          server: {
            port: realPort,
            origin: `http://localhost:${realPort}`,
          },
          optimizeDeps: {
            exclude: ["vite-plugin-react-qiankun"],
          },
        };
      },
    },
    modifyLegacyEntry(),
    injectQiankunPlaceholder(appName),
    rewriteModuleScripts(),
    removePreloadLinks(),

    ...virtualPreambles(),

    legacyEntry && legacyHTMLEntry(),
  ].filter(Boolean) as Plugin[];
}

function rewriteModuleScripts(): Plugin {
  return {
    name: "transform-module-script",

    transformIndexHtml: {
      order: "post",

      handler(html) {
        const $ = loadHTML(html);

        $('script[type="module"]:not([src])').remove();
        $('script[type="module"][src]')
          .toArray()
          .map((el) => [el, $(el).attr("src")])
          .forEach(([el, src]) => {
            $(el).replaceWith(
              str(`
                <script type="module">
                  import(new URL("${src}", window.__INJECTED_PUBLIC_PATH_BY_QIANKUN__).href);
                </script>
              `)
            );
          });

        return $.root().html()!;
      },
    },
  };
}

function injectQiankunPlaceholder(appName: string): Plugin {
  let base = "";
  return {
    name: "inject-qiankun-placeholder",
    enforce: "post",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml(html) {
      const $ = loadHTML(html);

      const tags = [
        {
          tag: "script",
          injectTo: "body" as const,
          children: str(` 
            const createDeffer = (hookName) => {
              const d = new Promise((resolve, reject) => {
                window.proxy && (window.proxy[\`vite$\{hookName}\`] = resolve);
              });
              return (props) => d.then((fn) => fn(props));
            };
            const bootstrap = createDeffer("bootstrap");
            const mount = createDeffer("mount");
            const unmount = createDeffer("unmount");
            const update = createDeffer("update");

            ((global) => {
              global.qiankunName = ${JSON.stringify(appName)};
              global[global.qiankunName] = {
                bootstrap,
                mount,
                unmount,
                update,
              };
            })(window); 
          `),
        },
      ];

      return {
        tags,
        html: $.root().html()!,
      };
    },
  };
}

function removePreloadLinks(): Plugin {
  return {
    name: "remove-preload-links",
    enforce: "post",

    transformIndexHtml(html) {
      const $ = loadHTML(html);

      $("link[rel=preload]").remove();
      $("link[rel=prefetch]").remove();
      $("link[rel=modulepreload]").remove();

      return $.root().html()!;
    },
  };
}

function modifyLegacyEntry(): Plugin {
  return {
    name: "modify-legacy-entry",
    enforce: "post",

    transformIndexHtml(html) {
      const $ = loadHTML(html);
      const $el = $("script[nomodule][data-src]");
      const src = JSON.stringify($el.attr("data-src"));
      $el.removeAttr("data-src");
      $el.html(
        `System.import(new URL(${src}, window.__INJECTED_PUBLIC_PATH_BY_QIANKUN__).href);`
      );

      return $.root().html()!;
    },
  };
}

function virtualPreambles(): Plugin[] {
  const virtualModuleId = "virtual:react-preamble-module";
  const resolvedVirtualModuleId = "\0" + virtualModuleId;

  let base = "";

  return [
    {
      name: "virtual:react-preamble-module-serve",
      apply: "serve",
      resolveId(id) {
        if (id === virtualModuleId) {
          return resolvedVirtualModuleId;
        }
      },
      configResolved(config) {
        base = config.base;
      },
      load(id) {
        if (id === resolvedVirtualModuleId) {
          return react.preambleCode.replace(`__BASE__`, base);
        }
      },
    },
    {
      name: "virtual:react-preamble-module-build",
      apply: "build",
      resolveId(id) {
        if (id === virtualModuleId) {
          return resolvedVirtualModuleId;
        }
      },
      load(id) {
        if (id === resolvedVirtualModuleId) {
          return `export default null;`;
        }
      },
    },
  ];
}

function str(input: string) {
  return deIndent(input).trim();
}

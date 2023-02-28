import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { load as loadHTML } from "cheerio";
import portfinder from "portfinder";
// @ts-ignore
import deIndent from "de-indent";

export function qiankun({
  appName,
  port,
}: {
  appName: string;
  port?: number;
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
        };
      },
    },
    injectQiankunPlaceholder(appName),
    rewriteModuleScripts(),

    ...virtualPreambles(),
  ];
}

function rewriteModuleScripts(): Plugin {
  return {
    name: "transform-module-script",

    transformIndexHtml: {
      order: "post",

      handler(html) {
        const $ = loadHTML(html);

        $('script[type="module"]:not([src])').remove();
        $('script[type="module"][src]').each((_, el) => {
          $(el).replaceWith(
            str(`
              <script>
                import(new URL("${$(el).attr(
                  "src"
                )}", window.__INJECTED_PUBLIC_PATH_BY_QIANKUN__));
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
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml(html) {
      const $ = loadHTML(html);

      $("head").prepend(
        str(`
          <script>
            window.__INJECTED_PUBLIC_PATH_BY_QIANKUN__ = window.__INJECTED_PUBLIC_PATH_BY_QIANKUN__ || \`$\{location.origin}${base}\`;
          </script>
        `)
      );

      $("body").append(
        str(`
          <script>
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
          </script>
        `)
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

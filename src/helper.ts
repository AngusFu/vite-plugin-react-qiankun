// @ts-ignore
import "virtual:react-preamble-module";

export interface QiankunProps {
  container?: HTMLElement;
  [x: string]: any;
}

export type QiankunLifeCycle = {
  bootstrap: () => void | Promise<void>;
  mount: (props: QiankunProps) => void | Promise<void>;
  unmount: (props: QiankunProps) => void | Promise<void>;
  update: (props: QiankunProps) => void | Promise<void>;
};

export interface QiankunWindow {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  __POWERED_BY_QIANKUN__?: boolean;
  [x: string]: any;
}

const globalWindow = window as any;

export const qiankunWindow: QiankunWindow = globalWindow?.proxy || window || {};

export const renderWithQiankun = (lifeCycles: QiankunLifeCycle) => {
  // 函数只有一次执行机会，需要把生命周期赋值给全局
  if (!qiankunWindow?.__POWERED_BY_QIANKUN__) return;

  const appName = qiankunWindow.qiankunName || "__qiankun_app__";
  (globalWindow.qiankunAppLifeCycles ??= {})[appName] = lifeCycles;

  (["bootstrap", "mount", "unmount", "update"] as const).forEach((key) => {
    qiankunWindow?.[`vite${key}`]?.(function (props: any) {
      lifeCycles?.[key]?.(props);
    });
  });
};

export default renderWithQiankun;

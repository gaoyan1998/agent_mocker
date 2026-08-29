import { App } from 'antd';
import { useCallback } from 'react';

/**
 * 「执行异步操作 → 成功提示 / 失败提示」这段样板在工作台的每个按钮上都要写一遍，
 * 统一收敛到这里。失败只弹 message、不往上抛，调用方用返回值判断是否成功。
 */
export function useAsyncAction() {
  const { message } = App.useApp();

  return useCallback(
    async (task: () => Promise<unknown>, successText?: string): Promise<boolean> => {
      try {
        await task();
        if (successText) message.success(successText);
        return true;
      } catch (error) {
        message.error(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [message],
  );
}

import { create } from 'zustand';

interface WorkbenchUiState {
  /** 「接入教程」弹窗。 */
  connectOpen: boolean;
  /** 「规则与场景」弹窗。 */
  bindingOpen: boolean;
  openConnect: () => void;
  closeConnect: () => void;
  openBindings: () => void;
  closeBindings: () => void;
}

/**
 * 工作台的纯 UI 状态。放进 store 是为了让工具栏按钮和弹窗本体解耦，
 * 不必再从页面往下传 open/onClose。弹窗内部的表单状态留在各自组件里。
 */
export const useWorkbenchUiStore = create<WorkbenchUiState>((set) => ({
  connectOpen: false,
  bindingOpen: false,
  openConnect: () => set({ connectOpen: true }),
  closeConnect: () => set({ connectOpen: false }),
  openBindings: () => set({ bindingOpen: true }),
  closeBindings: () => set({ bindingOpen: false }),
}));

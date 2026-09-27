/**
 * 仅用于开发与端到端测试的页面异常探针，用于验证页面级异常状态。
 * 生产构建中 `import.meta.env.DEV` 为 false，该组件不会被路由注册。
 */
export function TestThrowPage(): never {
  throw new Error("端到端测试：模拟页面渲染异常");
}

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * 路由切换后回到页面顶部。
 *
 * 此前从案情输入页提交后，报告页会继承输入页的滚动位置，直接落在报告中部；
 * 这里只在 pathname 变化时复位，不干扰报告内 `#report-module-*` 锚点跳转。
 */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

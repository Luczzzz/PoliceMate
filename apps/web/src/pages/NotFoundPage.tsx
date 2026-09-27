import { Link } from "react-router-dom";
import { StatusPanel } from "../components/StatusPanel";

export function NotFoundPage() {
  return (
    <div className="page">
      <StatusPanel
        variant="not_found"
        title="页面不存在"
        impact="当前地址没有对应页面，可能链接已失效或输入有误。"
        nextStep="请返回首页，从主要入口重新进入。"
        testId="not-found"
        action={
          <Link className="button button--primary" to="/">
            返回首页
          </Link>
        }
      />
    </div>
  );
}

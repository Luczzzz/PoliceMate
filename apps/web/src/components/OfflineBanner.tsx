import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { Icon } from "./Icon";

/**
 * 无网络时就地提示。文案只说明通用影响和下一步，不包含任何案情内容。
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="offline-banner" role="alert" data-testid="offline-banner">
      <span className="offline-banner__symbol" aria-hidden="true">
        <Icon name="wifiOff" size={20} />
      </span>
      <span>
        <strong>当前无网络连接。</strong>已加载的页面仍可查看，但提交、检索和报告生成会失败；请恢复网络后重试。
      </span>
    </div>
  );
}

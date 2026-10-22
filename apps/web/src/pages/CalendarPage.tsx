import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthContext";
import { getCalendar } from "../api/calendar";
import type { CalendarItem, CalendarResponse } from "@policymate/contracts";

type ViewMode = "deadlines" | "schedules";

export function CalendarPage() {
  const { isAuthenticated, username, logout } = useAuth();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>("deadlines");
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [calendarData, setCalendarData] = useState<CalendarResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 如果未登录，跳转到登录页
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, navigate]);

  // 加载日历数据
  useEffect(() => {
    if (!isAuthenticated) return;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await getCalendar(currentMonth, viewMode);
        setCalendarData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [isAuthenticated, currentMonth, viewMode]);

  const handlePrevMonth = () => {
    const [year, month] = currentMonth.split("-").map(Number);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    setCurrentMonth(`${prevYear}-${String(prevMonth).padStart(2, "0")}`);
  };

  const handleNextMonth = () => {
    const [year, month] = currentMonth.split("-").map(Number);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    setCurrentMonth(`${nextYear}-${String(nextMonth).padStart(2, "0")}`);
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const getUrgencyColor = (urgency: string | undefined): string => {
    switch (urgency) {
      case "overdue":
        return "#dc2626"; // 深红色
      case "urgent":
        return "#ef4444"; // 红色
      case "warning":
        return "#f59e0b"; // 黄色
      default:
        return "#10b981"; // 绿色
    }
  };

  const getScheduleTypeText = (type: string | undefined): string => {
    switch (type) {
      case "full_day":
        return "全天";
      case "morning":
        return "上午";
      case "afternoon":
        return "下午";
      case "custom":
        return "自定义";
      default:
        return "";
    }
  };

  // 渲染日历格子
  const renderCalendar = () => {
    if (!calendarData) return null;

    const [year, month] = currentMonth.split("-").map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const firstDayOfWeek = firstDay.getDay();

    // 按日期分组
    const itemsByDate = new Map<string, CalendarItem[]>();
    for (const item of calendarData.items) {
      const items = itemsByDate.get(item.date) || [];
      items.push(item);
      itemsByDate.set(item.date, items);
    }

    const weeks: React.ReactElement[] = [];
    let days: React.ReactElement[] = [];

    // 空白格（月初之前）
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day calendar-day-empty" />);
    }

    // 日历格子
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const items = itemsByDate.get(dateStr) || [];
      const isToday =
        new Date().toISOString().split("T")[0] === dateStr;

      days.push(
        <div
          key={day}
          className={`calendar-day ${isToday ? "calendar-day-today" : ""}`}
        >
          <div className="calendar-day-number">{day}</div>
          <div className="calendar-day-items">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="calendar-item"
                style={{
                  backgroundColor:
                    item.type === "deadline"
                      ? getUrgencyColor(item.urgency)
                      : "#3b82f6",
                  color: "white",
                  padding: "2px 4px",
                  borderRadius: "2px",
                  fontSize: "0.75rem",
                  marginBottom: "2px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.type === "deadline" ? (
                  <span title={`${item.caseId}: ${item.stageName} (剩${item.daysRemaining}天)`}>
                    {item.stageName}
                  </span>
                ) : (
                  <span title={`${getScheduleTypeText(item.scheduleType)} ${item.note || ""}`}>
                    {getScheduleTypeText(item.scheduleType)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>,
      );

      if ((firstDayOfWeek + day) % 7 === 0 || day === daysInMonth) {
        weeks.push(<div key={`week-${weeks.length}`} className="calendar-week">{days}</div>);
        days = [];
      }
    }

    return weeks;
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">日历</h1>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span style={{ color: "#666", fontSize: "0.875rem" }}>
            {username}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleLogout}
          >
            退出
          </button>
        </div>
      </div>

      <div className="page-content">
        {/* 视图切换 */}
        <div className="button-group" style={{ marginBottom: "1rem" }}>
          <button
            type="button"
            className={`btn ${viewMode === "deadlines" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setViewMode("deadlines")}
          >
            办案期限
          </button>
          <button
            type="button"
            className={`btn ${viewMode === "schedules" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setViewMode("schedules")}
          >
            值班日历
          </button>
        </div>

        {/* 月份导航 */}
        <div className="calendar-nav" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handlePrevMonth}
            disabled={isLoading}
          >
            上个月
          </button>
          <h2 style={{ margin: 0, fontSize: "1.25rem" }}>{currentMonth}</h2>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleNextMonth}
            disabled={isLoading}
          >
            下个月
          </button>
        </div>

        {/* 加载状态 */}
        {isLoading && (
          <div className="alert alert-info">加载中...</div>
        )}

        {/* 错误信息 */}
        {error && (
          <div className="alert alert-error">{error}</div>
        )}

        {/* 日历网格 */}
        {!isLoading && !error && calendarData && (
          <div className="calendar-grid">
            {/* 星期标题 */}
            <div className="calendar-week calendar-header">
              {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
                <div key={day} className="calendar-day-header">
                  {day}
                </div>
              ))}
            </div>

            {/* 日期格子 */}
            {renderCalendar()}
          </div>
        )}

        {/* 图例 */}
        {viewMode === "deadlines" && !isLoading && (
          <div className="calendar-legend" style={{ marginTop: "1.5rem", fontSize: "0.875rem" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>紧急程度</h3>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ display: "inline-block", width: "16px", height: "16px", backgroundColor: "#10b981" }} />
                <span>正常 (&gt;7天)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ display: "inline-block", width: "16px", height: "16px", backgroundColor: "#f59e0b" }} />
                <span>提醒 (3-7天)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ display: "inline-block", width: "16px", height: "16px", backgroundColor: "#ef4444" }} />
                <span>紧急 (1-3天)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ display: "inline-block", width: "16px", height: "16px", backgroundColor: "#dc2626" }} />
                <span>已过期 (≤0天)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

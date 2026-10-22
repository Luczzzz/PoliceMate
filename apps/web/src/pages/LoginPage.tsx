import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthContext";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError("请输入用户名");
      return;
    }

    if (username.length < 2 || username.length > 50) {
      setError("用户名长度应为2-50个字符");
      return;
    }

    setIsLoading(true);

    try {
      await login(username.trim());
      navigate("/calendar");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">登录</h1>
      </div>

      <div className="page-content">
        <div className="card" style={{ maxWidth: "400px", margin: "0 auto" }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="username" className="form-label">
                用户名
              </label>
              <input
                type="text"
                id="username"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入您的姓名或工号"
                disabled={isLoading}
                autoFocus
              />
              <div className="form-help">
                支持2-50个字符：中文、字母、数字、下划线、中划线
              </div>
            </div>

            {error && (
              <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={isLoading}
            >
              {isLoading ? "登录中..." : "登录"}
            </button>
          </form>

          <div className="card-footer" style={{ marginTop: "1.5rem", fontSize: "0.875rem", color: "#666" }}>
            <p>
              本系统采用轻量级用户名登录，无需密码。相同用户名可在多个设备登录。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

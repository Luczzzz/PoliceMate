import type {
  ClaimIdentityResponse,
  CreateCaseDeadlineRequest,
  UpdateScheduleRequest,
  CalendarResponse,
  ApiError,
} from "@policymate/contracts";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const TOKEN_STORAGE_KEY = "pm-auth-token";
const USER_ID_STORAGE_KEY = "pm-user-id";
const USERNAME_STORAGE_KEY = "pm-username";

/** 从localStorage获取保存的令牌 */
export function getSavedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** 从localStorage获取保存的userId */
export function getSavedUserId(): string | null {
  try {
    return localStorage.getItem(USER_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** 从localStorage获取保存的用户名 */
export function getSavedUsername(): string | null {
  try {
    return localStorage.getItem(USERNAME_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** 清除保存的身份信息 */
export function clearSavedIdentity(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_ID_STORAGE_KEY);
    localStorage.removeItem(USERNAME_STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = `${API_BASE}/api/v1${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // 添加认证令牌
  const token = options.token ?? getSavedToken();
  if (token) {
    headers["x-pm-anonymous-token"] = token;
  }

  const fetchOptions: RequestInit = {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers,
  };

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

// ===== 认证 =====

export async function claimIdentity(username: string): Promise<ClaimIdentityResponse> {
  const response = await request<ClaimIdentityResponse>("/auth/claim-identity", {
    body: { username },
  });

  // 保存到localStorage
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, response.token);
    localStorage.setItem(USER_ID_STORAGE_KEY, response.userId);
    localStorage.setItem(USERNAME_STORAGE_KEY, username);
  } catch {
    // ignore storage errors
  }

  return response;
}

// ===== 案件期限 =====

export async function createCaseDeadline(
  caseId: string,
  data: CreateCaseDeadlineRequest,
  token?: string | null,
): Promise<void> {
  await request<void>(`/cases/${caseId}/deadlines`, {
    body: data,
    token,
  });
}

export async function getCaseDeadline(
  caseId: string,
  token?: string | null,
): Promise<any> {
  return request<any>(`/cases/${caseId}/deadlines`, { token });
}

export async function getMyDeadlines(
  month: string,
  token?: string | null,
): Promise<CalendarResponse> {
  return request<CalendarResponse>(`/my/deadlines?month=${month}`, { token });
}

// ===== 排班 =====

export async function setSchedule(
  data: UpdateScheduleRequest,
  token?: string | null,
): Promise<void> {
  await request<void>("/my/schedule", {
    body: data,
    token,
  });
}

export async function deleteSchedule(
  date: string,
  token?: string | null,
): Promise<void> {
  await request<void>(`/my/schedule/${date}`, {
    method: "DELETE",
    token,
  });
}

export async function getMySchedule(
  month: string,
  token?: string | null,
): Promise<CalendarResponse> {
  return request<CalendarResponse>(`/my/schedule?month=${month}`, { token });
}

// ===== 日历 =====

export async function getCalendar(
  month: string,
  view: "deadlines" | "schedules",
  token?: string | null,
): Promise<CalendarResponse> {
  return request<CalendarResponse>(
    `/calendar?month=${month}&view=${view}`,
    { token },
  );
}

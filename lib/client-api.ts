import type { BootstrapPayload, Role } from "@/types/pairnest";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text || response.statusText;
    try {
      const data = JSON.parse(text) as { message?: string; detail?: string };
      message = data.detail ? `${data.message} ${data.detail}` : data.message || response.statusText;
    } catch {
      message = text || response.statusText;
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export const api = {
  bootstrap(coupleId: string) {
    return request<BootstrapPayload>(`/api/bootstrap?coupleId=${encodeURIComponent(coupleId)}`);
  },
  saveSettings(coupleId: string, payload: Record<string, unknown>) {
    return request("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ coupleId, ...payload })
    });
  },
  addWishlist(coupleId: string, payload: Record<string, unknown>) {
    return request("/api/wishlist", {
      method: "POST",
      body: JSON.stringify({ coupleId, ...payload })
    });
  },
  removeWishlist(coupleId: string, id: string) {
    return request<{ ok: boolean }>("/api/wishlist", {
      method: "DELETE",
      body: JSON.stringify({ coupleId, id })
    });
  },
  addGoal(coupleId: string, payload: Record<string, unknown>) {
    return request("/api/goals", {
      method: "POST",
      body: JSON.stringify({ coupleId, ...payload })
    });
  },
  removeGoal(coupleId: string, id: string) {
    return request<{ ok: boolean }>("/api/goals", {
      method: "DELETE",
      body: JSON.stringify({ coupleId, id })
    });
  },
  addEvent(coupleId: string, payload: Record<string, unknown>) {
    return request("/api/events", {
      method: "POST",
      body: JSON.stringify({ coupleId, ...payload })
    });
  },
  removeEvent(coupleId: string, id: string) {
    return request<{ ok: boolean }>("/api/events", {
      method: "DELETE",
      body: JSON.stringify({ coupleId, id })
    });
  },
  connectCalendar(coupleId: string, role: Role, calendarId: string) {
    return request<{ ok: boolean }>("/api/calendar-links", {
      method: "POST",
      body: JSON.stringify({ coupleId, role, calendarId })
    });
  },
  disconnectCalendar(coupleId: string, role: Role) {
    return request<{ ok: boolean }>("/api/calendar-links", {
      method: "DELETE",
      body: JSON.stringify({ coupleId, role })
    });
  },
  refreshCalendar(coupleId: string) {
    return request<{ ok: boolean; message?: string }>("/api/calendar-links", {
      method: "PUT",
      body: JSON.stringify({ coupleId })
    });
  }
};

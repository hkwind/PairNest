import type { BootstrapPayload, CustomEventItem, GoalItem, MemoryEntry, Role, WishlistItem, WorkspaceSettings } from "@/types/pairnest";

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
    return request<{ ok: boolean; settings: WorkspaceSettings }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ coupleId, ...payload })
    });
  },
  addWishlist(coupleId: string, payload: Record<string, unknown>) {
    return request<WishlistItem>("/api/wishlist", {
      method: "POST",
      body: JSON.stringify({ coupleId, ...payload })
    });
  },
  updateWishlist(coupleId: string, id: string, payload: Record<string, unknown>) {
    return request<WishlistItem>("/api/wishlist", {
      method: "PUT",
      body: JSON.stringify({ coupleId, id, ...payload })
    });
  },
  removeWishlist(coupleId: string, id: string) {
    return request<{ ok: boolean }>("/api/wishlist", {
      method: "DELETE",
      body: JSON.stringify({ coupleId, id })
    });
  },
  addGoal(coupleId: string, payload: Record<string, unknown>) {
    return request<GoalItem>("/api/goals", {
      method: "POST",
      body: JSON.stringify({ coupleId, ...payload })
    });
  },
  updateGoal(coupleId: string, id: string, payload: Record<string, unknown>) {
    return request<GoalItem>("/api/goals", {
      method: "PUT",
      body: JSON.stringify({ coupleId, id, ...payload })
    });
  },
  removeGoal(coupleId: string, id: string) {
    return request<{ ok: boolean }>("/api/goals", {
      method: "DELETE",
      body: JSON.stringify({ coupleId, id })
    });
  },
  addEvent(coupleId: string, payload: Record<string, unknown>) {
    return request<CustomEventItem>("/api/events", {
      method: "POST",
      body: JSON.stringify({ coupleId, ...payload })
    });
  },
  updateEvent(coupleId: string, id: string, payload: Record<string, unknown>) {
    return request<CustomEventItem>("/api/events", {
      method: "PUT",
      body: JSON.stringify({ coupleId, id, ...payload })
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
  getGoogleCalendars() {
    return request<{ calendars: { id: string; name: string; primary: boolean }[] }>("/api/google/calendars");
  },
  selectGoogleCalendar(calendarId: string) {
    return request<{ ok: boolean; calendarName: string }>("/api/google/calendars", {
      method: "POST",
      body: JSON.stringify({ calendarId })
    });
  },
  refreshCalendar(coupleId: string) {
    return request<{ ok: boolean; message?: string }>("/api/calendar-links", {
      method: "PUT",
      body: JSON.stringify({ coupleId })
    });
  },
  saveMemory(coupleId: string, payload: Record<string, unknown>) {
    return request<MemoryEntry>("/api/memories", {
      method: "PUT",
      body: JSON.stringify({ coupleId, ...payload })
    });
  }
};

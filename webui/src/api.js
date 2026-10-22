// Thin API client for the MockMan FastAPI backend.

const BASE = "/api";

async function req(path, options = {}) {
  const res = await fetch(BASE + path, options);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  health: () => req("/health"),
  sessions: () => req("/sessions"),
  personas: () => req("/personas"),

  startInterview: ({ role, itype, context, persona }) =>
    req("/interview/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, itype, context, persona }),
    }),

  sendAnswer: (interviewId, wavBlob) => {
    const form = new FormData();
    form.append("audio", wavBlob, "answer.wav");
    return req(`/interview/${interviewId}/answer`, {
      method: "POST",
      body: form,
    });
  },

  endInterview: (interviewId) =>
    req(`/interview/${interviewId}/end`, { method: "POST" }),

  sendChat: (interviewId, message) =>
    req(`/interview/${interviewId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }),

  interviewAudioUrl: (interviewId, name) =>
    `${BASE}/interview/${interviewId}/audio/${name}`,

  session: (day, sid) => req(`/sessions/${day}/${sid}`),
  sessionAudioUrl: (day, sid, name) =>
    `${BASE}/sessions/${day}/${sid}/audio/${name}`,

  persona: (id) => req(`/personas/${id}`),
  updatePersona: (id, content) =>
    req(`/personas/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),
  deletePersona: (id) => req(`/personas/${id}`, { method: "DELETE" }),

  profile: () => req("/profile"),
  updateProfile: (resume) =>
    req("/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume }),
    }),
};

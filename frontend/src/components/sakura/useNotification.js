import { useState, useCallback } from "react";

// Returns [notifications, push]
// Each notification: { id, type: 'success'|'error', message, leaving? }
let _id = 0;
const SHOW_MS = 4000;
const EXIT_MS = 200;

export default function useNotification() {
  const [notifications, setNotifications] = useState([]);

  const push = useCallback((message, type = "success") => {
    const id = ++_id;
    setNotifications((n) => [...n, { id, type, message, leaving: false }]);
    // Mark as leaving just before removal so the exit animation has time to play.
    setTimeout(() => {
      setNotifications((n) => n.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    }, SHOW_MS - EXIT_MS);
    setTimeout(() => setNotifications((n) => n.filter((x) => x.id !== id)), SHOW_MS);
  }, []);

  return [notifications, push];
}

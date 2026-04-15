import { useState, useCallback } from "react";

// Returns [notifications, push]
// Each notification: { id, type: 'success'|'error', message }
let _id = 0;

export default function useNotification() {
  const [notifications, setNotifications] = useState([]);

  const push = useCallback((message, type = "success") => {
    const id = ++_id;
    setNotifications((n) => [...n, { id, type, message }]);
    setTimeout(() => setNotifications((n) => n.filter((x) => x.id !== id)), 4000);
  }, []);

  return [notifications, push];
}

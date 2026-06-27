import React, { createContext, useContext } from "react";
import useNotification from "./useNotification";

const NotifCtx = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, push] = useNotification();
  return (
    <NotifCtx.Provider value={push}>
      {children}
      <div className="skr-notification-stack">
        {notifications.map((n) => (
          <div key={n.id} className={`skr-notification ${n.type}${n.leaving ? " is-leaving" : ""}`}>
            {n.message}
          </div>
        ))}
      </div>
    </NotifCtx.Provider>
  );
}

export function useNotify() {
  return useContext(NotifCtx);
}

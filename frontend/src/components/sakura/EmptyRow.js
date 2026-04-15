import React from "react";

export default function EmptyRow({ message, action }) {
  return (
    <div className="skr-empty-row">
      <p style={{ margin: "0 0 8px" }}>{message}</p>
      {action}
    </div>
  );
}

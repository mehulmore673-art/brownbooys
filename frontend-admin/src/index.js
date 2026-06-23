// src/index.js — Admin panel entry point
import React    from "react";
import ReactDOM from "react-dom/client";
import AdminPanel from "./AdminPanel";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <AdminPanel />
  </React.StrictMode>
);

import React, { useEffect, useState } from "react";
import { X, Users, CheckCircle, Tv, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { getSupabase } from "../lib/supabase";

async function getFunctionErrorMessage(error, fallback) {
  const response = error?.context;
  if (response?.clone) {
    try {
      const body = await response.clone().json();
      if (body?.details) return `${body.error || fallback}: ${body.details}`;
      if (body?.error) return body.error;
    } catch {
      try {
        const text = await response.clone().text();
        if (text) return text;
      } catch {
        /* ignore */
      }
    }
  }
  return error?.message || fallback;
}

export default function AdminPanel({ onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const sp = getSupabase();
      const { data, error } = await sp.functions.invoke("get-admin-data");
      if (error) throw new Error(await getFunctionErrorMessage(error, "Failed to load admin data"));
      setUsers(data.users || []);
    } catch (e) {
      setError(e.message || "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }

  async function togglePaidStatus(user) {
    const newStatus = !user.is_paid;
    if (!window.confirm(`Set ${user.email} to ${newStatus ? "PAID" : "FREE"}?`)) return;
    setUpdating(user.id);
    try {
      const sp = getSupabase();
      const { error } = await sp.functions.invoke("get-admin-data", {
        body: { user_id: user.id, is_paid: newStatus },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, "Failed to update"));
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_paid: newStatus } : u));
    } catch (e) {
      alert("Failed to update: " + (e.message || "Unknown error"));
    } finally {
      setUpdating(null);
    }
  }

  async function deleteUser(user) {
    if (!window.confirm(`PERMANENTLY DELETE ${user.email}?\n\nThis will delete their account, library data, and profile. This cannot be undone.`)) return;
    setDeleting(user.id);
    try {
      const sp = getSupabase();
      const { error } = await sp.functions.invoke("get-admin-data", {
        body: { action: "delete", user_id: user.id },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, "Failed to delete"));
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (e) {
      alert("Failed to delete: " + (e.message || "Unknown error"));
    } finally {
      setDeleting(null);
    }
  }

  const filtered = users.filter((u) => u.email.toLowerCase().includes(search.toLowerCase()));
  const totalPaid = users.filter((u) => u.is_paid).length;
  const totalFree = users.filter((u) => !u.is_paid).length;

  function fmt(dateStr) {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center bg-black/80 p-4 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-bold text-white">Admin Panel</h2>
            <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">Private</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={loadUsers} className="text-xs text-zinc-400 hover:text-white px-3 py-1 bg-zinc-800 rounded-lg">Refresh</button>
            <button onClick={onClose} className="text-zinc-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-zinc-800">
          <div className="bg-zinc-800 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-white">{users.length}</p>
            <p className="text-xs text-zinc-400 mt-0.5">Total Users</p>
          </div>
          <div className="bg-green-900/40 rounded-lg p-3 text-center border border-green-700/30">
            <p className="text-2xl font-bold text-green-400">{totalPaid}</p>
            <p className="text-xs text-zinc-400 mt-0.5">Paid</p>
          </div>
          <div className="bg-zinc-800 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-zinc-300">{totalFree}</p>
            <p className="text-xs text-zinc-400 mt-0.5">Free</p>
          </div>
        </div>

        <div className="px-6 py-3 border-b border-zinc-800">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by email..."
            className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>

        <div className="px-6 py-4">
          {loading && <div className="text-center py-12 text-zinc-400">Loading users...</div>}
          {error && <div className="text-center py-12 text-red-400">{error}</div>}
          {!loading && !error && (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-3 py-1 text-xs text-zinc-500 font-semibold uppercase tracking-wider">
                <div className="col-span-4">Email</div>
                <div className="col-span-2 text-center">Status</div>
                <div className="col-span-1 text-center">Shows</div>
                <div className="col-span-2 text-center">Joined</div>
                <div className="col-span-1 text-center">Last Seen</div>
                <div className="col-span-1 text-center">Toggle</div>
                <div className="col-span-1 text-center">Del</div>
              </div>
              {filtered.map((u) => (
                <div key={u.id} className={`grid grid-cols-12 gap-2 items-center px-3 py-3 rounded-lg border transition-colors ${u.is_paid ? "bg-green-900/20 border-green-800/30" : "bg-zinc-800/50 border-zinc-700/30"}`}>
                  <div className="col-span-4 flex items-center gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${u.is_paid ? "bg-green-400" : "bg-zinc-500"}`} />
                    <span className="text-sm text-white truncate" title={u.email}>{u.email}</span>
                  </div>
                  <div className="col-span-2 flex justify-center">
                    {u.is_paid ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-green-700/60 text-green-300 text-xs rounded-full font-semibold">
                        <CheckCircle className="w-3 h-3" />Paid
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-zinc-700/60 text-zinc-400 text-xs rounded-full">Free</span>
                    )}
                  </div>
                  <div className="col-span-1 flex justify-center items-center gap-1 text-sm text-zinc-300">
                    <Tv className="w-3 h-3 text-zinc-500" />{u.show_count}
                  </div>
                  <div className="col-span-2 text-center text-xs text-zinc-400">{fmt(u.created_at)}</div>
                  <div className="col-span-1 text-center text-xs text-zinc-400">{fmt(u.last_sign_in_at)}</div>
                  <div className="col-span-1 flex justify-center">
                    <button onClick={() => togglePaidStatus(u)} disabled={updating === u.id} title={u.is_paid ? "Set Free" : "Set Paid"} className="transition-opacity disabled:opacity-40">
                      {updating === u.id ? <span className="text-xs text-zinc-500">...</span>
                        : u.is_paid ? <ToggleRight className="w-6 h-6 text-green-400 hover:text-green-300" />
                        : <ToggleLeft className="w-6 h-6 text-zinc-500 hover:text-purple-400" />}
                    </button>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <button onClick={() => deleteUser(u)} disabled={deleting === u.id} title="Delete account" className="transition-opacity disabled:opacity-40 text-zinc-600 hover:text-red-400">
                      {deleting === u.id ? <span className="text-xs text-zinc-500">...</span>
                        : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="text-center py-8 text-zinc-500 text-sm">No users match your search.</div>}
            </div>
          )}
        </div>
        <div className="px-6 py-3 border-t border-zinc-800 text-xs text-zinc-600 text-center">
          This panel is only visible to you. Deletions are permanent and cannot be undone.
        </div>
      </div>
    </div>
  );
}

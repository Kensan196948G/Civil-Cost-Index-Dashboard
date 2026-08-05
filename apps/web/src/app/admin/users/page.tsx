"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { loadPrefs } from "@/lib/utils";
import type { Role, User } from "@/types/api";

const ALL_ROLES: Array<{ value: Role; label: string }> = [
  { value: "viewer", label: "閲覧者" },
  { value: "data_ingester", label: "データ取込担当" },
  { value: "data_approver", label: "データ承認者" },
  { value: "estimator", label: "積算担当" },
  { value: "estimating_manager", label: "積算責任者" },
  { value: "auditor", label: "監査者" },
  { value: "system_admin", label: "システム管理者" },
];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roles, setRoles] = useState<Role[]>(["viewer"]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.users();
      setUsers(res.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setAdminKey(loadPrefs().adminKey ?? "");
  }, []);

  useEffect(() => { if (adminKey) void load(); }, [adminKey, load]);

  const create = async () => {
    setNotice(null);
    try {
      await api.createUser({ email, display_name: displayName || undefined, roles });
      setNotice("ユーザーを登録しました。");
      setEmail(""); setDisplayName("");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "登録に失敗しました");
    }
  };

  const toggleRole = (r: Role) => {
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  const patch = async (u: User, next: Partial<User>) => {
    setNotice(null);
    try {
      await api.patchUser(u.id, next);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "更新に失敗しました");
    }
  };

  const remove = async (u: User) => {
    if (!window.confirm(`${u.email} を削除しますか？`)) return;
    try {
      await api.deleteUser(u.id);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const inputCls = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">ユーザー管理（RBAC）</h1>
      <p className="text-sm text-gray-600">
        Cloudflare Access のメールアドレスと紐づけて役割を付与します。API は X-Admin-Key を保持する管理者が操作できます。
      </p>
      {notice && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">{notice}</div>}
      {error && <ErrorMessage message={error} onRetry={() => void load()} />}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-base font-semibold">ユーザー一覧</h2>
        <div className="mb-3">
          <label className={labelCls}>管理者キー（X-Admin-Key）</label>
          <input type="password" className={inputCls} value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
        </div>
        {loading && <LoadingState />}
        {!loading && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-600">
                <th className="py-2">メール</th>
                <th>表示名</th>
                <th>役割</th>
                <th>状態</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-100">
                  <td className="py-2">{u.email}</td>
                  <td className="py-2">{u.display_name ?? "—"}</td>
                  <td className="py-2 text-xs">{u.roles.map((r) => ALL_ROLES.find((x) => x.value === r)?.label ?? r).join(", ")}</td>
                  <td className="py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${u.is_active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>
                      {u.is_active ? "有効" : "無効"}
                    </span>
                  </td>
                  <td className="py-2">
                    <button onClick={() => void patch(u, { is_active: !u.is_active })} className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">
                      {u.is_active ? "無効化" : "有効化"}
                    </button>
                    <button onClick={() => void remove(u)} className="ml-2 rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50">削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-base font-semibold">新規ユーザー登録</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className={labelCls}>メールアドレス*</label>
            <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@mirai-const.co.jp" />
          </div>
          <div>
            <label className={labelCls}>表示名</label>
            <input className={inputCls} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <label className={labelCls}>役割</label>
          <div className="flex flex-wrap gap-2">
            {ALL_ROLES.map((r) => (
              <button
                key={r.value}
                onClick={() => toggleRole(r.value)}
                className={`rounded border px-2 py-1 text-xs ${roles.includes(r.value) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => void create()} className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
          登録
        </button>
      </div>
    </div>
  );
}

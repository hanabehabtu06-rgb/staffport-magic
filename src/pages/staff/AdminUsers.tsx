import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Plus, Trash2, Shield, Mail, Edit2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StaffLayout from "@/components/staff/StaffLayout";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/supabase";
import type { AppRole } from "@/lib/supabase";
import { Navigate } from "react-router-dom";

const ALL_ROLES: AppRole[] = ["ceo", "cto", "coo", "cio", "hr", "sysadmin", "finance_manager", "bd_head", "network_engineer", "support_tech", "staff"];

export default function AdminUsers() {
  const { roles } = useAuth();
  const isCeo = roles.includes("ceo");
  const [profiles, setProfiles] = useState<any[]>([]);
  const [userRoles, setUserRoles] = useState<Record<string, AppRole[]>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ full_name: "", email: "", position: "", role: "staff" as AppRole });
  const [loading, setLoading] = useState(true);
  const [editingRole, setEditingRole] = useState<string | null>(null);

  // ALL hooks must come before any conditional returns
  useEffect(() => { loadUsers(); }, []);

  if (!isCeo) return <Navigate to="/staff/dashboard" replace />;

  const loadUsers = async () => {
    const [{ data: profilesData }, { data: rolesData }] = await Promise.all([
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const roleMap: Record<string, AppRole[]> = {};
    for (const r of rolesData || []) {
      if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
      roleMap[r.user_id].push(r.role as AppRole);
    }
    setProfiles(profilesData || []);
    setUserRoles(roleMap);
    setLoading(false);
  };

  const createUser = async () => {
    if (!newUser.full_name || !newUser.email) return;
    setCreating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await supabase.functions.invoke("create-single-staff", {
        body: {
          full_name: newUser.full_name,
          email: newUser.email,
          position: newUser.position,
          department: "",
          role: newUser.role,
        },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.error || res.data?.error) {
        alert("Error: " + (res.data?.error || res.error?.message));
        setCreating(false);
        return;
      }
      setNewUser({ full_name: "", email: "", position: "", role: "staff" });
      setShowCreate(false);
      loadUsers();
    } catch (e: any) {
      alert("Error: " + e.message);
    }
    setCreating(false);
  };

  const updateRole = async (userId: string, newRole: AppRole) => {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
    setEditingRole(null);
    loadUsers();
  };

  const deactivateUser = async (userId: string) => {
    if (!confirm("Are you sure you want to remove this user?")) return;
    await supabase.from("profiles").delete().eq("user_id", userId);
    loadUsers();
  };

  return (
    <StaffLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" />User Management
            </h1>
            <p className="text-muted-foreground text-sm">Create and manage staff accounts</p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gradient-brand text-primary-foreground font-heading gap-2 shadow-glow">
            <Plus className="w-4 h-4" />Add Staff
          </Button>
        </div>

        <AnimatePresence>
          {showCreate && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <Card className="border-primary/30 shadow-card">
                <CardHeader className="pb-3">
                  <CardTitle className="font-heading text-base flex items-center justify-between">
                    Create New Staff Account
                    <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium font-heading text-foreground">Full Name</label>
                      <Input placeholder="e.g. Fikadu Alemayehu" value={newUser.full_name} onChange={(e) => setNewUser((f) => ({ ...f, full_name: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium font-heading text-foreground">Company Email</label>
                      <Input placeholder="firstname@netlink-gs.com" value={newUser.email} onChange={(e) => setNewUser((f) => ({ ...f, email: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium font-heading text-foreground">Position / Title</label>
                      <Input placeholder="e.g. Network Engineer" value={newUser.position} onChange={(e) => setNewUser((f) => ({ ...f, position: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium font-heading text-foreground">Role</label>
                      <select value={newUser.role} onChange={(e) => setNewUser((f) => ({ ...f, role: e.target.value as AppRole }))}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                        {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-muted rounded-lg text-xs text-muted-foreground">
                    <Shield className="w-3.5 h-3.5 inline mr-1.5" />
                    Default password: <strong className="font-mono text-foreground">netlink123</strong> — user must change it on first login.
                  </div>
                  <div className="flex gap-3 mt-4">
                    <Button variant="outline" onClick={() => setShowCreate(false)} className="flex-1">Cancel</Button>
                    <Button onClick={createUser} disabled={creating} className="flex-1 gradient-brand text-primary-foreground font-heading">
                      {creating ? "Creating…" : "Create Account"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-3">{[1,2,3,4,5].map((i) => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left text-xs font-heading font-semibold text-muted-foreground px-5 py-3 uppercase tracking-wider">Staff Member</th>
                      <th className="text-left text-xs font-heading font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider hidden sm:table-cell">Position</th>
                      <th className="text-left text-xs font-heading font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider">Role</th>
                      <th className="text-left text-xs font-heading font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider hidden md:table-cell">Outlook Email</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {profiles.map((p, i) => {
                      const roles = userRoles[p.user_id] || ["staff"];
                      const primaryRole = roles[0] as AppRole;
                      return (
                        <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                          className="hover:bg-muted/30 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full gradient-brand flex items-center justify-center text-primary-foreground font-bold text-sm flex-shrink-0">
                                {p.full_name?.charAt(0)}
                              </div>
                              <div>
                                <div className="text-sm font-semibold font-heading text-foreground">{p.full_name}</div>
                                <div className="text-xs text-muted-foreground hidden sm:block">{p.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 hidden sm:table-cell">
                            <span className="text-sm text-foreground">{p.position || "—"}</span>
                          </td>
                          <td className="px-4 py-4">
                            {editingRole === p.user_id ? (
                              <div className="flex items-center gap-1.5">
                                <select defaultValue={primaryRole} onChange={(e) => updateRole(p.user_id, e.target.value as AppRole)}
                                  className="text-xs rounded border border-input bg-background px-2 py-1">
                                  {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                </select>
                                <button onClick={() => setEditingRole(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-heading font-semibold ${ROLE_COLORS[primaryRole]}`}>
                                  {ROLE_LABELS[primaryRole]}
                                </span>
                                <button onClick={() => setEditingRole(p.user_id)} className="text-muted-foreground hover:text-primary transition-colors">
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 hidden md:table-cell">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Mail className="w-3.5 h-3.5 text-cyan-brand flex-shrink-0" />
                              <span className="font-mono">{p.email}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <button onClick={() => deactivateUser(p.user_id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
                {profiles.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="font-heading">No staff accounts yet. Create the first one!</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </StaffLayout>
  );
}

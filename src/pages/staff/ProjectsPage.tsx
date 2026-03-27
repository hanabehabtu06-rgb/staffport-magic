import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, FolderKanban, Users, Circle, Clock, Check, ChevronRight, MessageSquare, BarChart3, CalendarIcon, Target, AlertTriangle, CheckCircle, Flag, Send, Trash2, Paperclip, File } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import StaffLayout from "@/components/staff/StaffLayout";
import TeamChat from "@/components/staff/TeamChat";
import ProjectFileUpload from "@/components/staff/ProjectFileUpload";

const STATUS_CONFIG = {
  todo: { label: "To Do", icon: Circle, color: "text-muted-foreground" },
  in_progress: { label: "In Progress", icon: Clock, color: "text-primary" },
  done: { label: "Done", icon: Check, color: "text-green-600" },
};

const MILESTONE_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-muted-foreground", bg: "bg-muted" },
  on_track: { label: "On Track", color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/30" },
  at_risk: { label: "At Risk", color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900/30" },
  failed: { label: "Failed", color: "text-destructive", bg: "bg-destructive/10" },
  completed: { label: "Completed", color: "text-green-700", bg: "bg-green-200 dark:bg-green-800/40" },
};

export default function ProjectsPage() {
  const { user, isCeo, isExecutive } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [groupForm, setGroupForm] = useState({ name: "", description: "", member_ids: [] as string[], start_date: undefined as Date | undefined, end_date: undefined as Date | undefined });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", assigned_to: "", status: "todo", attachments: [] as string[] });
  const [milestoneForm, setMilestoneForm] = useState({ target_percentage: 25, target_date: undefined as Date | undefined });
  const [reviewForm, setReviewForm] = useState({ milestone_id: "", status: "on_track", notes: "", action_items: "" });
  const [showReview, setShowReview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("tasks");

  useEffect(() => {
    loadGroups();
    loadProfiles();

    const channel = supabase
      .channel("projects-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "project_comments" }, () => {
        if (selectedGroup) loadComments(selectedGroup.id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "project_milestones" }, () => {
        if (selectedGroup) loadMilestones(selectedGroup.id);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadGroups = async () => {
    const { data } = await supabase.from("project_groups").select("*").order("created_at", { ascending: false });
    setGroups(data || []);
    setLoading(false);
  };

  const loadProfiles = async () => {
    const { data } = await supabase.from("profiles").select("user_id, full_name, position");
    setProfiles(data || []);
  };

  const loadTasks = async (groupId: string) => {
    const { data } = await supabase.from("project_tasks").select("*, assignee:profiles!project_tasks_assigned_to_fkey(full_name), creator:profiles!project_tasks_created_by_fkey(full_name)").eq("group_id", groupId).order("created_at");
    setTasks(data || []);
  };

  const loadMilestones = async (groupId: string) => {
    const { data } = await supabase.from("project_milestones").select("*").eq("group_id", groupId).order("target_percentage");
    setMilestones(data || []);
  };

  const loadComments = async (groupId: string) => {
    const { data } = await supabase.from("project_comments").select("*").eq("group_id", groupId).order("created_at", { ascending: false });
    setComments(data || []);
  };

  const selectGroup = (group: any) => {
    setSelectedGroup(group);
    loadTasks(group.id);
    loadMilestones(group.id);
    loadComments(group.id);
    setShowChat(false);
    setActiveTab("tasks");
  };

  const createGroup = async () => {
    if (!groupForm.name.trim()) return;
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const memberIds = [...new Set([authUser.id, ...groupForm.member_ids])];
    await supabase.from("project_groups").insert({
      name: groupForm.name,
      description: groupForm.description,
      created_by: authUser.id,
      member_ids: memberIds,
      start_date: groupForm.start_date ? format(groupForm.start_date, "yyyy-MM-dd") : null,
      end_date: groupForm.end_date ? format(groupForm.end_date, "yyyy-MM-dd") : null,
    });
    setGroupForm({ name: "", description: "", member_ids: [], start_date: undefined, end_date: undefined });
    setShowNewGroup(false);
    loadGroups();
  };

  const createTask = async () => {
    if (!taskForm.title.trim() || !selectedGroup) return;
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    await supabase.from("project_tasks").insert({
      group_id: selectedGroup.id,
      title: taskForm.title,
      description: taskForm.description,
      assigned_to: taskForm.assigned_to || null,
      status: taskForm.status,
      created_by: authUser.id,
      attachments: taskForm.attachments.length > 0 ? taskForm.attachments : null,
    });
    if (taskForm.assigned_to) {
      await supabase.from("notifications").insert({
        user_id: taskForm.assigned_to,
        type: "task",
        title: "New task assigned to you",
        message: taskForm.title,
        related_id: selectedGroup.id,
      });
    }
    setTaskForm({ title: "", description: "", assigned_to: "", status: "todo", attachments: [] });
    setShowNewTask(false);
    loadTasks(selectedGroup.id);
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    await supabase.from("project_tasks").update({ status }).eq("id", taskId);
    if (selectedGroup) loadTasks(selectedGroup.id);
  };

  const addMilestone = async () => {
    if (!milestoneForm.target_date || !selectedGroup) return;
    await supabase.from("project_milestones").insert({
      group_id: selectedGroup.id,
      target_percentage: milestoneForm.target_percentage,
      target_date: format(milestoneForm.target_date, "yyyy-MM-dd"),
    });
    setMilestoneForm({ target_percentage: 25, target_date: undefined });
    setShowAddMilestone(false);
    loadMilestones(selectedGroup.id);
  };

  const submitReview = async (milestoneId: string) => {
    if (!user) return;
    await supabase.from("project_milestones").update({
      status: reviewForm.status,
      reviewer_id: user.id,
      reviewer_notes: reviewForm.notes,
      action_items: reviewForm.action_items,
      actual_date: reviewForm.status === "completed" ? new Date().toISOString().split("T")[0] : null,
    }).eq("id", milestoneId);

    // Notify team members
    if (selectedGroup?.member_ids && reviewForm.status !== "on_track") {
      const notifications = selectedGroup.member_ids
        .filter((id: string) => id !== user.id)
        .map((memberId: string) => ({
          user_id: memberId,
          type: "task",
          title: `Milestone ${reviewForm.status === "failed" ? "failed" : "review"}: ${selectedGroup.name}`,
          message: reviewForm.notes || `Milestone reviewed as ${MILESTONE_STATUS_CONFIG[reviewForm.status]?.label}`,
          related_id: selectedGroup.id,
        }));
      if (notifications.length > 0) await supabase.from("notifications").insert(notifications);
    }

    setShowReview(null);
    setReviewForm({ milestone_id: "", status: "on_track", notes: "", action_items: "" });
    loadMilestones(selectedGroup!.id);
  };

  const addComment = async () => {
    if (!newComment.trim() || !selectedGroup || !user) return;
    await supabase.from("project_comments").insert({
      group_id: selectedGroup.id,
      author_id: user.id,
      content: newComment,
    });
    setNewComment("");
    loadComments(selectedGroup.id);
  };

  const deleteComment = async (commentId: string) => {
    await supabase.from("project_comments").delete().eq("id", commentId);
    if (selectedGroup) loadComments(selectedGroup.id);
  };

  const isMember = selectedGroup?.member_ids?.includes(user?.id) || isCeo || isExecutive;

  return (
    <StaffLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Projects</h1>
            <p className="text-muted-foreground text-sm">Collaborate on projects and track milestones</p>
          </div>
          <Button onClick={() => setShowNewGroup(true)} className="gradient-brand text-primary-foreground font-heading gap-2 shadow-glow">
            <Plus className="w-4 h-4" />New Project
          </Button>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Groups List */}
          <div className="lg:col-span-1 space-y-3">
            <h2 className="text-sm font-heading font-bold text-muted-foreground uppercase tracking-widest">Projects ({groups.length})</h2>

            <AnimatePresence>
              {showNewGroup && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  <Card className="border-primary/30">
                    <CardContent className="p-4 space-y-3">
                      <Input placeholder="Project name" value={groupForm.name} onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))} />
                      <Input placeholder="Description (optional)" value={groupForm.description} onChange={(e) => setGroupForm((f) => ({ ...f, description: e.target.value }))} />
                      <div className="grid grid-cols-2 gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("justify-start text-left text-xs", !groupForm.start_date && "text-muted-foreground")}>
                              <CalendarIcon className="w-3 h-3 mr-1" />
                              {groupForm.start_date ? format(groupForm.start_date, "MMM d, yyyy") : "Start date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={groupForm.start_date} onSelect={(d) => setGroupForm((f) => ({ ...f, start_date: d }))} className={cn("p-3 pointer-events-auto")} />
                          </PopoverContent>
                        </Popover>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("justify-start text-left text-xs", !groupForm.end_date && "text-muted-foreground")}>
                              <CalendarIcon className="w-3 h-3 mr-1" />
                              {groupForm.end_date ? format(groupForm.end_date, "MMM d, yyyy") : "Submission date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={groupForm.end_date} onSelect={(d) => setGroupForm((f) => ({ ...f, end_date: d }))} className={cn("p-3 pointer-events-auto")} />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5">Add members:</p>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {profiles.map((p) => (
                            <label key={p.user_id} className="flex items-center gap-2 cursor-pointer hover:bg-muted rounded p-1">
                              <input type="checkbox" checked={groupForm.member_ids.includes(p.user_id)} onChange={(e) => {
                                setGroupForm((f) => ({ ...f, member_ids: e.target.checked ? [...f.member_ids, p.user_id] : f.member_ids.filter((id) => id !== p.user_id) }));
                              }} className="rounded" />
                              <span className="text-sm text-foreground">{p.full_name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setShowNewGroup(false)} className="flex-1">Cancel</Button>
                        <Button size="sm" onClick={createGroup} className="flex-1 gradient-brand text-primary-foreground font-heading">Create</Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {loading ? [1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />) :
              groups.map((g) => (
                <Card key={g.id} onClick={() => selectGroup(g)} className={`cursor-pointer transition-all hover:shadow-card ${selectedGroup?.id === g.id ? "border-primary shadow-card ring-1 ring-primary/30" : ""}`}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl gradient-brand flex items-center justify-center text-primary-foreground flex-shrink-0">
                      <FolderKanban className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-heading font-semibold text-sm text-foreground truncate">{g.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {g.member_ids?.length || 0} members
                        {g.end_date && <span className="ml-2">· Due {format(new Date(g.end_date), "MMM d")}</span>}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              ))
            }
          </div>

          {/* Detail Panel */}
          <div className="lg:col-span-2">
            {!selectedGroup ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground rounded-2xl border-2 border-dashed border-border">
                <div className="text-center">
                  <FolderKanban className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-heading">Select a project to view details</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-heading font-bold text-foreground">{selectedGroup.name}</h2>
                    {selectedGroup.description && <p className="text-muted-foreground text-sm">{selectedGroup.description}</p>}
                    <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                      {selectedGroup.start_date && <span>Start: {format(new Date(selectedGroup.start_date), "MMM d, yyyy")}</span>}
                      {selectedGroup.end_date && <span>Due: {format(new Date(selectedGroup.end_date), "MMM d, yyyy")}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => setShowChat(true)} size="sm" variant="outline" className="gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" />Chat
                    </Button>
                  </div>
                </div>

                {/* Progress Summary */}
                {tasks.length > 0 && (() => {
                  const done = tasks.filter(t => t.status === "done").length;
                  const pct = Math.round((done / tasks.length) * 100);
                  return (
                    <Card className="border-primary/10">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-heading font-semibold text-muted-foreground flex items-center gap-1.5">
                            <BarChart3 className="w-3.5 h-3.5" />Task Progress
                          </span>
                          <span className="text-xs font-heading font-bold text-primary">{pct}%</span>
                        </div>
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full gradient-brand rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
                          <span>To Do: {tasks.filter(t => t.status === "todo").length}</span>
                          <span>In Progress: {tasks.filter(t => t.status === "in_progress").length}</span>
                          <span>Done: {done}</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Members */}
                <Card className="border-border/50">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-heading font-semibold text-muted-foreground">Members ({selectedGroup.member_ids?.length || 0})</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(selectedGroup.member_ids || []).map((memberId: string) => {
                        const p = profiles.find((pr: any) => pr.user_id === memberId);
                        if (!p) return null;
                        return (
                          <div key={memberId} className="flex items-center gap-1.5 bg-muted rounded-full px-2 py-1">
                            <div className="w-5 h-5 rounded-full gradient-brand flex items-center justify-center text-[8px] text-primary-foreground font-bold">
                              {p.full_name?.charAt(0)}
                            </div>
                            <span className="text-[10px] font-heading text-foreground">{p.full_name}</span>
                            {memberId !== user?.id && (
                              <button onClick={() => navigate(`/staff/messages?partner=${memberId}`)} className="text-muted-foreground hover:text-primary transition-colors" title="Send message">
                                <MessageSquare className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Tabs: Tasks / Milestones / Comments */}
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="w-full">
                    <TabsTrigger value="tasks" className="flex-1 gap-1"><Circle className="w-3 h-3" />Tasks</TabsTrigger>
                    <TabsTrigger value="milestones" className="flex-1 gap-1"><Target className="w-3 h-3" />Milestones</TabsTrigger>
                    <TabsTrigger value="comments" className="flex-1 gap-1"><MessageSquare className="w-3 h-3" />Comments</TabsTrigger>
                  </TabsList>

                  {/* TASKS TAB */}
                  <TabsContent value="tasks" className="space-y-3">
                    {isMember && (
                      <div className="flex justify-end">
                        <Button onClick={() => setShowNewTask(true)} size="sm" className="gradient-brand text-primary-foreground font-heading gap-1.5">
                          <Plus className="w-3.5 h-3.5" />Add Task
                        </Button>
                      </div>
                    )}

                    <AnimatePresence>
                      {showNewTask && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                          <Card className="border-primary/30">
                            <CardContent className="p-4 space-y-3">
                              <Input placeholder="Task title" value={taskForm.title} onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))} />
                              <Input placeholder="Description (optional)" value={taskForm.description} onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))} />
                              <div className="grid grid-cols-2 gap-2">
                                <select value={taskForm.assigned_to} onChange={(e) => setTaskForm((f) => ({ ...f, assigned_to: e.target.value }))}
                                  className="rounded-md border border-input bg-background px-3 py-2 text-sm">
                                  <option value="">Unassigned</option>
                                  {profiles.filter((p) => selectedGroup.member_ids?.includes(p.user_id)).map((p) => (
                                    <option key={p.user_id} value={p.user_id}>{p.full_name}</option>
                                  ))}
                                </select>
                                <select value={taskForm.status} onChange={(e) => setTaskForm((f) => ({ ...f, status: e.target.value }))}
                                  className="rounded-md border border-input bg-background px-3 py-2 text-sm">
                                  <option value="todo">To Do</option>
                                  <option value="in_progress">In Progress</option>
                                  <option value="done">Done</option>
                                </select>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => setShowNewTask(false)} className="flex-1">Cancel</Button>
                                <Button size="sm" onClick={createTask} className="flex-1 gradient-brand text-primary-foreground font-heading">Add Task</Button>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Kanban Columns */}
                    <div className="grid grid-cols-3 gap-3">
                      {(["todo", "in_progress", "done"] as const).map((status) => {
                        const cfg = STATUS_CONFIG[status];
                        const columnTasks = tasks.filter((t) => t.status === status);
                        return (
                          <div key={status} className="space-y-2">
                            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted ${cfg.color}`}>
                              <cfg.icon className="w-3.5 h-3.5" />
                              <span className="text-xs font-heading font-semibold">{cfg.label}</span>
                              <span className="ml-auto text-xs bg-background rounded-full w-5 h-5 flex items-center justify-center font-bold">{columnTasks.length}</span>
                            </div>
                            {columnTasks.map((task) => (
                              <Card key={task.id} className="shadow-sm">
                                <CardContent className="p-3">
                                  <div className="font-heading font-semibold text-xs text-foreground">{task.title}</div>
                                  {task.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>}
                                  {task.assignee && (
                                    <div className="flex items-center gap-1 mt-2">
                                      <div className="w-4 h-4 rounded-full gradient-brand flex items-center justify-center text-[8px] text-primary-foreground font-bold">{task.assignee.full_name.charAt(0)}</div>
                                      <span className="text-[10px] text-muted-foreground">{task.assignee.full_name}</span>
                                    </div>
                                  )}
                                  {isMember && (
                                    <div className="flex gap-1 mt-2">
                                      {Object.keys(STATUS_CONFIG).filter((s) => s !== status).map((s) => (
                                        <button key={s} onClick={() => updateTaskStatus(task.id, s)} className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors font-heading">
                                          → {STATUS_CONFIG[s as keyof typeof STATUS_CONFIG].label}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>

                  {/* MILESTONES TAB */}
                  <TabsContent value="milestones" className="space-y-3">
                    {isExecutive && (
                      <div className="flex justify-end">
                        <Button onClick={() => setShowAddMilestone(true)} size="sm" className="gradient-brand text-primary-foreground font-heading gap-1.5">
                          <Plus className="w-3.5 h-3.5" />Add Milestone
                        </Button>
                      </div>
                    )}

                    <AnimatePresence>
                      {showAddMilestone && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                          <Card className="border-primary/30">
                            <CardContent className="p-4 space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-xs font-heading font-medium text-foreground">Target %</label>
                                  <select value={milestoneForm.target_percentage} onChange={(e) => setMilestoneForm(f => ({ ...f, target_percentage: Number(e.target.value) }))}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                    <option value={25}>25%</option>
                                    <option value={50}>50%</option>
                                    <option value={75}>75%</option>
                                    <option value={100}>100%</option>
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-heading font-medium text-foreground">Target Date</label>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button variant="outline" className={cn("w-full justify-start text-left text-xs", !milestoneForm.target_date && "text-muted-foreground")}>
                                        <CalendarIcon className="w-3 h-3 mr-1" />
                                        {milestoneForm.target_date ? format(milestoneForm.target_date, "MMM d, yyyy") : "Select date"}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                      <Calendar mode="single" selected={milestoneForm.target_date} onSelect={(d) => setMilestoneForm(f => ({ ...f, target_date: d }))} className={cn("p-3 pointer-events-auto")} />
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => setShowAddMilestone(false)} className="flex-1">Cancel</Button>
                                <Button size="sm" onClick={addMilestone} className="flex-1 gradient-brand text-primary-foreground font-heading">Add</Button>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {milestones.length === 0 ? (
                      <div className="py-8 text-center text-muted-foreground">
                        <Target className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm font-heading">No milestones set yet</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Milestone Timeline */}
                        <div className="relative">
                          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                          {milestones.map((m) => {
                            const cfg = MILESTONE_STATUS_CONFIG[m.status] || MILESTONE_STATUS_CONFIG.pending;
                            const isOverdue = m.status === "pending" && new Date(m.target_date) < new Date();
                            const reviewerProfile = m.reviewer_id ? profiles.find(p => p.user_id === m.reviewer_id) : null;
                            return (
                              <div key={m.id} className="relative pl-10 pb-4">
                                <div className={`absolute left-2.5 w-3 h-3 rounded-full border-2 border-background ${isOverdue ? "bg-destructive" : m.status === "completed" ? "bg-green-600" : m.status === "failed" ? "bg-destructive" : "bg-muted-foreground"}`} />
                                <Card className={`${isOverdue && m.status === "pending" ? "border-destructive/50" : ""}`}>
                                  <CardContent className="p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-heading font-bold text-foreground">{m.target_percentage}%</span>
                                        <Badge className={`text-[10px] ${cfg.bg} ${cfg.color} border-0`}>{cfg.label}</Badge>
                                        {isOverdue && m.status === "pending" && <Badge variant="destructive" className="text-[10px]">Overdue</Badge>}
                                      </div>
                                      <span className="text-xs text-muted-foreground">{format(new Date(m.target_date), "MMM d, yyyy")}</span>
                                    </div>

                                    {m.actual_date && (
                                      <p className="text-xs text-muted-foreground">Completed: {format(new Date(m.actual_date), "MMM d, yyyy")}</p>
                                    )}

                                    {m.reviewer_notes && (
                                      <div className="p-2 bg-muted/50 rounded-lg">
                                        <div className="text-[10px] font-heading font-semibold text-muted-foreground mb-0.5">
                                          Review by {reviewerProfile?.full_name || "Reviewer"}
                                        </div>
                                        <p className="text-xs text-foreground">{m.reviewer_notes}</p>
                                        {m.action_items && (
                                          <div className="mt-1">
                                            <span className="text-[10px] font-heading font-semibold text-destructive">Action Items:</span>
                                            <p className="text-xs text-foreground">{m.action_items}</p>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Review button for CEO/Exec */}
                                    {(isCeo || isExecutive) && m.status !== "completed" && (
                                      <>
                                        {showReview === m.id ? (
                                          <div className="space-y-2 p-2 border border-primary/20 rounded-lg">
                                            <select value={reviewForm.status} onChange={(e) => setReviewForm(f => ({ ...f, status: e.target.value }))}
                                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                              <option value="on_track">On Track</option>
                                              <option value="at_risk">At Risk</option>
                                              <option value="failed">Failed</option>
                                              <option value="completed">Completed</option>
                                            </select>
                                            <Textarea placeholder="Review notes..." rows={2} value={reviewForm.notes} onChange={(e) => setReviewForm(f => ({ ...f, notes: e.target.value }))} />
                                            <Textarea placeholder="Action items (if any)..." rows={2} value={reviewForm.action_items} onChange={(e) => setReviewForm(f => ({ ...f, action_items: e.target.value }))} />
                                            <div className="flex gap-2">
                                              <Button size="sm" variant="outline" onClick={() => setShowReview(null)} className="flex-1">Cancel</Button>
                                              <Button size="sm" onClick={() => submitReview(m.id)} className="flex-1 gradient-brand text-primary-foreground font-heading">Submit Review</Button>
                                            </div>
                                          </div>
                                        ) : (
                                          <Button size="sm" variant="outline" onClick={() => { setShowReview(m.id); setReviewForm({ milestone_id: m.id, status: m.status === "pending" ? "on_track" : m.status, notes: "", action_items: "" }); }} className="gap-1 text-xs">
                                            <Flag className="w-3 h-3" />Review Milestone
                                          </Button>
                                        )}
                                      </>
                                    )}
                                  </CardContent>
                                </Card>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  {/* COMMENTS TAB */}
                  <TabsContent value="comments" className="space-y-3">
                    <div className="flex gap-2">
                      <Input placeholder="Add a comment..." value={newComment} onChange={(e) => setNewComment(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addComment()} />
                      <Button size="sm" onClick={addComment} className="gradient-brand text-primary-foreground">
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {comments.length === 0 ? (
                        <p className="text-center text-sm text-muted-foreground py-6">No comments yet. Be the first to comment!</p>
                      ) : comments.map((c) => {
                        const author = profiles.find(p => p.user_id === c.author_id);
                        return (
                          <div key={c.id} className="p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full gradient-brand flex items-center justify-center text-[8px] text-primary-foreground font-bold">
                                  {author?.full_name?.charAt(0) || "?"}
                                </div>
                                <span className="text-xs font-heading font-semibold text-foreground">{author?.full_name || "Unknown"}</span>
                                <span className="text-[10px] text-muted-foreground">{format(new Date(c.created_at), "MMM d, h:mm a")}</span>
                              </div>
                              {(c.author_id === user?.id || isExecutive) && (
                                <button onClick={() => deleteComment(c.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            <p className="text-sm text-foreground pl-7">{c.content}</p>
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Team Chat Modal */}
      <AnimatePresence>
        {showChat && selectedGroup && (
          <TeamChat groupId={selectedGroup.id} groupName={selectedGroup.name} onClose={() => setShowChat(false)} />
        )}
      </AnimatePresence>
    </StaffLayout>
  );
}

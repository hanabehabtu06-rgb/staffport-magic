import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet, Plus, Save, Trash2, Calendar, Clock, User, ChevronDown,
  DollarSign, CheckCircle, AlertTriangle, FileText, Calculator, Edit2, X
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import StaffLayout from "@/components/staff/StaffLayout";
import { format, differenceInCalendarDays, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval } from "date-fns";

const PAYMENT_TYPES = [
  { value: "hourly", label: "Hourly", unit: "hour" },
  { value: "daily", label: "Daily", unit: "day" },
  { value: "weekly", label: "Weekly", unit: "week" },
  { value: "monthly", label: "Monthly", unit: "month" },
];

interface Profile {
  user_id: string;
  full_name: string;
  position: string | null;
  avatar_url: string | null;
  email: string;
}

interface SalaryConfig {
  id: string;
  staff_id: string;
  payment_type: string;
  amount: number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

interface AttendanceRecord {
  id: string;
  user_id: string;
  clock_in: string;
  clock_out: string | null;
  work_hours: number | null;
  overtime_hours: number | null;
}

interface CalculatedSalary {
  staffId: string;
  periodStart: string;
  periodEnd: string;
  regularHours: number;
  overtimeHours: number;
  daysWorked: number;
  configs: { config: SalaryConfig; units: number; amount: number }[];
  grossSalary: number;
  overtimePay: number;
  totalSalary: number;
}

const OVERTIME_MULTIPLIER = 2;

export default function SalaryPage() {
  const { user, isExecutive, isCeo, profile } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [configs, setConfigs] = useState<SalaryConfig[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "configure" | "calculate">("overview");

  // Config form
  const [selectedStaff, setSelectedStaff] = useState("");
  const [configForm, setConfigForm] = useState({
    payment_type: "monthly",
    amount: "",
    effective_from: format(new Date(), "yyyy-MM-dd"),
    effective_to: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Calculation
  const [calcStaff, setCalcStaff] = useState("");
  const [calcMonth, setCalcMonth] = useState(format(new Date(), "yyyy-MM"));
  const [calcResult, setCalcResult] = useState<CalculatedSalary | null>(null);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [profilesRes, configsRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, position, avatar_url, email"),
      supabase.from("salary_configs").select("*").order("effective_from", { ascending: false }),
    ]);
    setProfiles(profilesRes.data || []);
    setConfigs(configsRes.data || []);
    setLoading(false);
  };

  const profileMap = useMemo(() => {
    const m: Record<string, Profile> = {};
    profiles.forEach(p => { m[p.user_id] = p; });
    return m;
  }, [profiles]);

  const staffConfigs = useMemo(() => {
    if (!selectedStaff) return [];
    return configs.filter(c => c.staff_id === selectedStaff);
  }, [configs, selectedStaff]);

  // Save / update salary config
  const saveConfig = async () => {
    if (!user || !selectedStaff || !configForm.amount) return;
    setSaving(true);

    const payload = {
      staff_id: selectedStaff,
      payment_type: configForm.payment_type,
      amount: parseFloat(configForm.amount),
      effective_from: configForm.effective_from,
      effective_to: configForm.effective_to || null,
      notes: configForm.notes || null,
      created_by: user.id,
    };

    if (editingId) {
      await supabase.from("salary_configs").update(payload).eq("id", editingId);
    } else {
      await supabase.from("salary_configs").insert(payload);
    }

    setConfigForm({ payment_type: "monthly", amount: "", effective_from: format(new Date(), "yyyy-MM-dd"), effective_to: "", notes: "" });
    setEditingId(null);
    await loadData();
    setSaving(false);
  };

  const deleteConfig = async (id: string) => {
    await supabase.from("salary_configs").delete().eq("id", id);
    await loadData();
  };

  const startEdit = (c: SalaryConfig) => {
    setEditingId(c.id);
    setSelectedStaff(c.staff_id);
    setConfigForm({
      payment_type: c.payment_type,
      amount: String(c.amount),
      effective_from: c.effective_from,
      effective_to: c.effective_to || "",
      notes: c.notes || "",
    });
    setActiveTab("configure");
  };

  // Calculate salary from attendance
  const calculateSalary = async () => {
    if (!calcStaff || !calcMonth) return;
    setCalculating(true);

    const periodStart = `${calcMonth}-01`;
    const periodEndDate = endOfMonth(parseISO(periodStart));
    const periodEnd = format(periodEndDate, "yyyy-MM-dd");

    // Fetch attendance for staff in the period
    const { data: attendanceData } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", calcStaff)
      .gte("clock_in", `${periodStart}T00:00:00`)
      .lte("clock_in", `${periodEnd}T23:59:59`)
      .order("clock_in");

    const records = attendanceData || [];

    // Get salary configs active during this period
    const staffSalaryConfigs = configs.filter(c => {
      if (c.staff_id !== calcStaff) return false;
      const cfgStart = parseISO(c.effective_from);
      const cfgEnd = c.effective_to ? parseISO(c.effective_to) : new Date("2099-12-31");
      const pStart = parseISO(periodStart);
      const pEnd = periodEndDate;
      return cfgStart <= pEnd && cfgEnd >= pStart;
    });

    // Aggregate attendance
    let totalRegularHours = 0;
    let totalOvertimeHours = 0;
    const workedDates = new Set<string>();

    records.forEach(r => {
      if (r.work_hours) totalRegularHours += Number(r.work_hours);
      if (r.overtime_hours) totalOvertimeHours += Number(r.overtime_hours);
      workedDates.add(r.clock_in.slice(0, 10));
    });

    const daysWorked = workedDates.size;
    const totalHoursWorked = totalRegularHours + totalOvertimeHours;

    // Calculate per-config contributions
    const configContributions: { config: SalaryConfig; units: number; amount: number }[] = [];
    let grossSalary = 0;

    if (staffSalaryConfigs.length === 0) {
      // No config
    } else if (staffSalaryConfigs.length === 1) {
      const cfg = staffSalaryConfigs[0];
      const units = getUnits(cfg.payment_type, totalRegularHours, daysWorked, periodStart, periodEnd);
      const amount = units * cfg.amount;
      configContributions.push({ config: cfg, units, amount });
      grossSalary = amount;
    } else {
      // Multiple configs with different periods — split days across configs
      const allDays = eachDayOfInterval({ start: parseISO(periodStart), end: periodEndDate });

      for (const cfg of staffSalaryConfigs) {
        const cfgStart = parseISO(cfg.effective_from);
        const cfgEnd = cfg.effective_to ? parseISO(cfg.effective_to) : new Date("2099-12-31");

        // Find attendance records falling within this config's period
        const cfgRecords = records.filter(r => {
          const d = parseISO(r.clock_in.slice(0, 10));
          return d >= cfgStart && d <= cfgEnd;
        });

        let cfgRegularHours = 0;
        const cfgWorkedDates = new Set<string>();
        cfgRecords.forEach(r => {
          if (r.work_hours) cfgRegularHours += Number(r.work_hours);
          cfgWorkedDates.add(r.clock_in.slice(0, 10));
        });

        const cfgDaysWorked = cfgWorkedDates.size;
        const cfgDaysInPeriod = allDays.filter(d => d >= cfgStart && d <= cfgEnd).length;
        const cfgWeeks = cfgDaysInPeriod / 7;
        const cfgMonths = cfgDaysInPeriod / allDays.length;

        let units: number;
        switch (cfg.payment_type) {
          case "hourly": units = cfgRegularHours; break;
          case "daily": units = cfgDaysWorked; break;
          case "weekly": units = cfgWeeks; break;
          case "monthly": units = cfgMonths; break;
          default: units = 0;
        }

        const amount = units * cfg.amount;
        configContributions.push({ config: cfg, units: parseFloat(units.toFixed(2)), amount: parseFloat(amount.toFixed(2)) });
        grossSalary += amount;
      }
    }

    // Overtime pay: use highest hourly rate equivalent
    let hourlyRate = 0;
    for (const cfg of staffSalaryConfigs) {
      let hr = 0;
      switch (cfg.payment_type) {
        case "hourly": hr = cfg.amount; break;
        case "daily": hr = cfg.amount / 8; break;
        case "weekly": hr = cfg.amount / 40; break;
        case "monthly": hr = cfg.amount / 176; break;
      }
      if (hr > hourlyRate) hourlyRate = hr;
    }
    const overtimePay = parseFloat((totalOvertimeHours * hourlyRate * OVERTIME_MULTIPLIER).toFixed(2));

    setCalcResult({
      staffId: calcStaff,
      periodStart,
      periodEnd,
      regularHours: parseFloat(totalRegularHours.toFixed(2)),
      overtimeHours: parseFloat(totalOvertimeHours.toFixed(2)),
      daysWorked,
      configs: configContributions,
      grossSalary: parseFloat(grossSalary.toFixed(2)),
      overtimePay,
      totalSalary: parseFloat((grossSalary + overtimePay).toFixed(2)),
    });
    setCalculating(false);
  };

  function getUnits(paymentType: string, regularHours: number, daysWorked: number, periodStart: string, periodEnd: string): number {
    switch (paymentType) {
      case "hourly": return regularHours;
      case "daily": return daysWorked;
      case "weekly": return parseFloat((differenceInCalendarDays(parseISO(periodEnd), parseISO(periodStart)) / 7).toFixed(2));
      case "monthly": return 1;
      default: return 0;
    }
  }

  const tabs = isExecutive
    ? [
        { key: "overview" as const, label: "Overview", icon: Wallet },
        { key: "configure" as const, label: "Configure Rates", icon: Edit2 },
        { key: "calculate" as const, label: "Calculate Salary", icon: Calculator },
      ]
    : [{ key: "overview" as const, label: "My Salary", icon: Wallet }];

  return (
    <StaffLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" /> Salary Management
          </h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-heading font-medium transition-colors ${
                activeTab === t.key
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* ===== OVERVIEW TAB ===== */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            {isExecutive ? (
              // Executive: see all staff salary configs
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="font-heading text-lg">All Salary Configurations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {configs.length === 0 ? (
                      <p className="text-muted-foreground text-sm py-8 text-center">No salary configurations yet. Go to "Configure Rates" to set up.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-left">
                              <th className="pb-3 font-heading font-semibold text-muted-foreground">Staff</th>
                              <th className="pb-3 font-heading font-semibold text-muted-foreground">Type</th>
                              <th className="pb-3 font-heading font-semibold text-muted-foreground">Amount (ETB)</th>
                              <th className="pb-3 font-heading font-semibold text-muted-foreground">Effective From</th>
                              <th className="pb-3 font-heading font-semibold text-muted-foreground">Effective To</th>
                              <th className="pb-3 font-heading font-semibold text-muted-foreground">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {configs.map(c => (
                              <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30">
                                <td className="py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
                                      {profileMap[c.staff_id]?.avatar_url ? (
                                        <img src={profileMap[c.staff_id].avatar_url!} className="w-full h-full object-cover" />
                                      ) : (
                                        <div className="w-full h-full gradient-brand flex items-center justify-center text-primary-foreground text-xs font-bold">
                                          {profileMap[c.staff_id]?.full_name?.charAt(0) || "?"}
                                        </div>
                                      )}
                                    </div>
                                    <span className="font-medium text-foreground">{profileMap[c.staff_id]?.full_name || "Unknown"}</span>
                                  </div>
                                </td>
                                <td className="py-3">
                                  <Badge variant="secondary" className="font-heading capitalize">{c.payment_type}</Badge>
                                </td>
                                <td className="py-3 font-semibold text-foreground">{Number(c.amount).toLocaleString()}</td>
                                <td className="py-3 text-muted-foreground">{c.effective_from}</td>
                                <td className="py-3 text-muted-foreground">{c.effective_to || <span className="text-primary text-xs">Current</span>}</td>
                                <td className="py-3">
                                  <div className="flex gap-1">
                                    <Button size="sm" variant="ghost" onClick={() => startEdit(c)}>
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteConfig(c.id)}>
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              // Regular staff: see own salary configs
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="font-heading text-lg">My Salary Structure</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {configs.filter(c => c.staff_id === user?.id).length === 0 ? (
                      <p className="text-muted-foreground text-sm py-8 text-center">No salary configuration set yet. Contact your administrator.</p>
                    ) : (
                      <div className="space-y-3">
                        {configs.filter(c => c.staff_id === user?.id).map(c => (
                          <div key={c.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/20">
                            <div>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="capitalize font-heading">{c.payment_type}</Badge>
                                <span className="font-heading font-bold text-lg text-foreground">
                                  ETB {Number(c.amount).toLocaleString()}
                                </span>
                                <span className="text-muted-foreground text-sm">/ {PAYMENT_TYPES.find(p => p.value === c.payment_type)?.unit}</span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {c.effective_from} → {c.effective_to || "Present"}
                              </div>
                              {c.notes && <p className="text-xs text-muted-foreground mt-1">{c.notes}</p>}
                            </div>
                            {!c.effective_to && (
                              <Badge className="bg-primary/10 text-primary border-primary/20">Active</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* ===== CONFIGURE TAB (Executives only) ===== */}
        {activeTab === "configure" && isExecutive && (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Form */}
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  {editingId ? "Edit Rate" : "Add Salary Rate"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Staff selector */}
                <div>
                  <label className="text-sm font-medium font-heading text-foreground">Staff Member</label>
                  <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select staff..." /></SelectTrigger>
                    <SelectContent>
                      {profiles.map(p => (
                        <SelectItem key={p.user_id} value={p.user_id}>
                          <div className="flex items-center gap-2">
                            <span>{p.full_name}</span>
                            {p.position && <span className="text-muted-foreground text-xs">({p.position})</span>}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Staff preview */}
                {selectedStaff && profileMap[selectedStaff] && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
                    <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                      {profileMap[selectedStaff]?.avatar_url ? (
                        <img src={profileMap[selectedStaff].avatar_url!} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full gradient-brand flex items-center justify-center text-primary-foreground font-bold">
                          {profileMap[selectedStaff]?.full_name?.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="font-heading font-semibold text-foreground">{profileMap[selectedStaff]?.full_name}</div>
                      <div className="text-xs text-muted-foreground">{profileMap[selectedStaff]?.position || "No position"}</div>
                    </div>
                  </div>
                )}

                {/* Payment type */}
                <div>
                  <label className="text-sm font-medium font-heading text-foreground">Payment Type</label>
                  <Select value={configForm.payment_type} onValueChange={v => setConfigForm(f => ({ ...f, payment_type: v }))}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label} (per {t.unit})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Amount */}
                <div>
                  <label className="text-sm font-medium font-heading text-foreground">
                    Amount (ETB per {PAYMENT_TYPES.find(p => p.value === configForm.payment_type)?.unit})
                  </label>
                  <Input
                    type="number"
                    className="mt-1.5"
                    placeholder="e.g. 15000"
                    value={configForm.amount}
                    onChange={e => setConfigForm(f => ({ ...f, amount: e.target.value }))}
                  />
                </div>

                {/* Date range */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium font-heading text-foreground">Effective From</label>
                    <Input
                      type="date"
                      className="mt-1.5"
                      value={configForm.effective_from}
                      onChange={e => setConfigForm(f => ({ ...f, effective_from: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium font-heading text-foreground">Effective To</label>
                    <Input
                      type="date"
                      className="mt-1.5"
                      value={configForm.effective_to}
                      onChange={e => setConfigForm(f => ({ ...f, effective_to: e.target.value }))}
                      placeholder="Leave empty for current"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Leave empty if rate is still active</p>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-sm font-medium font-heading text-foreground">Notes</label>
                  <Input
                    className="mt-1.5"
                    placeholder="e.g. Promotion raise, probation rate..."
                    value={configForm.notes}
                    onChange={e => setConfigForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>

                <div className="flex gap-2">
                  <Button onClick={saveConfig} disabled={saving || !selectedStaff || !configForm.amount} className="gradient-brand text-primary-foreground font-heading gap-2 shadow-glow">
                    <Save className="w-4 h-4" />
                    {saving ? "Saving..." : editingId ? "Update Rate" : "Save Rate"}
                  </Button>
                  {editingId && (
                    <Button variant="outline" onClick={() => {
                      setEditingId(null);
                      setConfigForm({ payment_type: "monthly", amount: "", effective_from: format(new Date(), "yyyy-MM-dd"), effective_to: "", notes: "" });
                    }}>
                      <X className="w-4 h-4 mr-1" /> Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Current configs for selected staff */}
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg">
                  {selectedStaff ? `Rate History — ${profileMap[selectedStaff]?.full_name}` : "Select a Staff Member"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedStaff ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">Select a staff member to view their salary rate history.</p>
                ) : staffConfigs.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">No rates configured for this staff member yet.</p>
                ) : (
                  <div className="space-y-3">
                    {staffConfigs.map((c, i) => (
                      <motion.div
                        key={c.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`p-4 rounded-xl border ${!c.effective_to ? "border-primary/30 bg-primary/5" : "border-border bg-muted/20"}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="capitalize font-heading">{c.payment_type}</Badge>
                            {!c.effective_to && <Badge className="bg-primary/10 text-primary text-[10px]">Active</Badge>}
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => startEdit(c)}>
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteConfig(c.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="font-heading font-bold text-xl text-foreground">
                          ETB {Number(c.amount).toLocaleString()}
                          <span className="text-sm font-normal text-muted-foreground ml-1">
                            / {PAYMENT_TYPES.find(p => p.value === c.payment_type)?.unit}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {c.effective_from} → {c.effective_to || "Present"}
                        </div>
                        {c.notes && <p className="text-xs text-muted-foreground mt-1 italic">{c.notes}</p>}
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ===== CALCULATE TAB (Executives only) ===== */}
        {activeTab === "calculate" && isExecutive && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-primary" />
                  Calculate Salary from Attendance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium font-heading text-foreground">Staff Member</label>
                    <Select value={calcStaff} onValueChange={setCalcStaff}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select staff..." /></SelectTrigger>
                      <SelectContent>
                        {profiles.map(p => (
                          <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium font-heading text-foreground">Month</label>
                    <Input
                      type="month"
                      className="mt-1.5"
                      value={calcMonth}
                      onChange={e => setCalcMonth(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={calculateSalary} disabled={calculating || !calcStaff} className="gradient-brand text-primary-foreground font-heading gap-2 shadow-glow w-full">
                      <Calculator className="w-4 h-4" />
                      {calculating ? "Calculating..." : "Calculate"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Results */}
            <AnimatePresence>
              {calcResult && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  {/* Staff header */}
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4 mb-6 pb-4 border-b border-border">
                        <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0">
                          {profileMap[calcResult.staffId]?.avatar_url ? (
                            <img src={profileMap[calcResult.staffId].avatar_url!} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full gradient-brand flex items-center justify-center text-primary-foreground font-bold text-xl">
                              {profileMap[calcResult.staffId]?.full_name?.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div>
                          <h3 className="font-heading font-bold text-xl text-foreground">{profileMap[calcResult.staffId]?.full_name}</h3>
                          <p className="text-sm text-muted-foreground">{profileMap[calcResult.staffId]?.position || "Staff"}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Period: {calcResult.periodStart} to {calcResult.periodEnd}
                          </p>
                        </div>
                      </div>

                      {/* Attendance summary */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                        <div className="p-3 rounded-xl bg-muted/40 text-center">
                          <div className="text-xs text-muted-foreground font-heading">Days Worked</div>
                          <div className="font-heading font-bold text-xl text-foreground">{calcResult.daysWorked}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-muted/40 text-center">
                          <div className="text-xs text-muted-foreground font-heading">Regular Hours</div>
                          <div className="font-heading font-bold text-xl text-foreground">{calcResult.regularHours}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-muted/40 text-center">
                          <div className="text-xs text-muted-foreground font-heading">Overtime Hours</div>
                          <div className="font-heading font-bold text-xl text-primary">{calcResult.overtimeHours}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-muted/40 text-center">
                          <div className="text-xs text-muted-foreground font-heading">Total Hours</div>
                          <div className="font-heading font-bold text-xl text-foreground">
                            {(calcResult.regularHours + calcResult.overtimeHours).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Rate breakdown */}
                      {calcResult.configs.length > 0 && (
                        <div className="mb-6">
                          <h4 className="font-heading font-semibold text-sm text-muted-foreground mb-3">Rate Breakdown</h4>
                          <div className="space-y-2">
                            {calcResult.configs.map((cc, i) => (
                              <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card">
                                <div>
                                  <Badge variant="secondary" className="capitalize font-heading mr-2">{cc.config.payment_type}</Badge>
                                  <span className="text-sm text-muted-foreground">
                                    ETB {Number(cc.config.amount).toLocaleString()} × {cc.units} {PAYMENT_TYPES.find(p => p.value === cc.config.payment_type)?.unit}(s)
                                  </span>
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {cc.config.effective_from} → {cc.config.effective_to || "Present"}
                                  </div>
                                </div>
                                <span className="font-heading font-bold text-foreground">ETB {cc.amount.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {calcResult.configs.length === 0 && (
                        <div className="flex items-center gap-2 p-4 rounded-xl bg-destructive/10 border border-destructive/20 mb-6">
                          <AlertTriangle className="w-5 h-5 text-destructive" />
                          <p className="text-sm text-destructive">No salary rate configured for this staff member during this period.</p>
                        </div>
                      )}

                      {/* Total */}
                      <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <div className="text-xs text-muted-foreground font-heading">Gross Salary</div>
                            <div className="font-heading font-bold text-lg text-foreground">ETB {calcResult.grossSalary.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground font-heading">Overtime Pay (2×)</div>
                            <div className="font-heading font-bold text-lg text-primary">ETB {calcResult.overtimePay.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground font-heading">Total Salary</div>
                            <div className="font-heading font-bold text-2xl text-primary">
                              ETB {calcResult.totalSalary.toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </StaffLayout>
  );
}

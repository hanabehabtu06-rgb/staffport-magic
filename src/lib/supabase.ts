import { supabase } from "@/integrations/supabase/client";
export { supabase };

export type AppRole = 'ceo' | 'cto' | 'coo' | 'cio' | 'hr' | 'sysadmin' | 'staff' | 'finance_manager' | 'bd_head' | 'network_engineer' | 'support_tech';

export const EXECUTIVE_ROLES: AppRole[] = ['ceo', 'cto', 'coo', 'cio', 'hr', 'sysadmin', 'finance_manager', 'bd_head'];

export const ROLE_LABELS: Record<AppRole, string> = {
  ceo: 'CEO',
  cto: 'CTO',
  coo: 'COO',
  cio: 'CIO',
  hr: 'HR Manager',
  sysadmin: 'System Administrator',
  finance_manager: 'Finance Manager',
  bd_head: 'Head of Business Dev',
  network_engineer: 'Network Engineer',
  support_tech: 'Support Technician',
  staff: 'Staff',
};

export const ROLE_COLORS: Record<AppRole, string> = {
  ceo: 'bg-primary text-primary-foreground',
  cto: 'bg-accent text-accent-foreground',
  coo: 'bg-secondary text-secondary-foreground',
  cio: 'bg-primary/80 text-primary-foreground',
  hr: 'bg-muted text-muted-foreground border border-border',
  sysadmin: 'bg-navy text-primary-foreground',
  finance_manager: 'bg-secondary text-secondary-foreground border border-border',
  bd_head: 'bg-accent/80 text-accent-foreground',
  network_engineer: 'bg-primary/20 text-primary',
  support_tech: 'bg-muted text-foreground border border-border',
  staff: 'bg-muted text-muted-foreground',
};

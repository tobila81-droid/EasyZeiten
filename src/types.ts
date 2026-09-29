export type Role = 'ADMIN' | 'EMPLOYEE';

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  active: boolean;
}

export interface Customer {
  id: string;
  name: string;
  active: boolean;
}

export interface Activity {
  id: string;
  customer_id: string;
  name: string;
  description: string;
  active: boolean;
  customers?: Customer;
}

export interface Pause {
  id: string;
  time_entry_id: string;
  started_at: string;
  ended_at: string | null;
}

export interface TimeEntry {
  id: string;
  user_id: string;
  activity_id: string | null;
  activity_name: string;
  customer_id: string | null;
  description: string;
  participant_count: number | null;
  started_at: string;
  stopped_at: string | null;
  activities?: Activity;
  customers?: Customer;
  time_entry_pauses?: Pause[];
}

export interface User {
  id: number;
  name: string;
  employee_code: string;
  department: string | null;
  department_id: number | null;
  role: 'admin' | 'employee';
}

export interface Department {
  id: number;
  name: string;
  channel_id: number | null;
}

export interface Channel {
  id: number;
  name: string;
  type: 'general' | 'private' | 'emergency';
  occupied_by?: number | null;
}

export interface ChannelPermission {
  user_id: number;
  channel_id: number;
  can_listen: boolean;
  can_transmit: boolean;
}

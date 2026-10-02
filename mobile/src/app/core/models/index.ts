export interface User {
  id: number;
  name: string;
  email: string;
  department_id: number | null;
  status: 'available' | 'busy' | 'offline' | 'emergency';
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




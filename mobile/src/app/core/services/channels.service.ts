import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { environment } from '@env/environment';

export interface ChannelDto {
  id: number;
  name: string;
  type: 'general' | 'private' | 'emergency';
  occupied_by: number | null;
  occupier_name: string | null;
  floor_expires_at: string | null;
  status: 'free' | 'busy';
}

@Injectable({ providedIn: 'root' })
export class ChannelsService {
  channels$ = new BehaviorSubject<ChannelDto[]>([]);
  private timer: any;

  constructor(private http: HttpClient) {}

  startPolling(intervalMs = 4000) {
    this.refresh();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.refresh(), intervalMs);
  }

  stopPolling() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  refresh() {
    this.http.get<ChannelDto[]>(`${environment.apiUrl}/channels`).subscribe({
      next: (channels) => this.channels$.next(channels),
      error: () => {},
    });
  }
}

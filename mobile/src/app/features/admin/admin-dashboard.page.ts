import { Component, OnDestroy, OnInit, AfterViewInit, inject } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environment';
import { IonHeader, IonToolbar, IonContent, IonIcon, IonMenu, IonMenuButton, IonButtons } from '@ionic/angular';
import { ChannelsService, ChannelDto } from '@core/services/channels.service';
import { AuthService } from '@core/services/auth.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, IonHeader, IonToolbar, IonContent, IonIcon, IonMenu, IonMenuButton, IonButtons],
  templateUrl: './admin-dashboard.page.html',
  styleUrls: ['./admin-dashboard.page.scss'],
})
export class AdminDashboardPage implements OnInit, OnDestroy, AfterViewInit {
  private channelsService = inject(ChannelsService);
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  channels$!: Observable<ChannelDto[]>;
  events$!: Observable<any[]>;
  private statusChart?: Chart;
  private eventsChart?: Chart;

  constructor() {
    Chart.register(...registerables);
  }

  logout() {
    this.auth.logout();
  }

  ngAfterViewInit() {
    this.channels$.subscribe(c => this.updateStatusChart(c));
    this.events$.subscribe(ev => this.updateEventsChart(ev));
  }

  private updateStatusChart(channels: ChannelDto[]) {
    const busy = this.busy(channels);
    const free = this.freeCount(channels);
    const emergency = this.emergency(channels);
    const el = document.getElementById('statusChart') as HTMLCanvasElement;
    if (!el) return;
    if (this.statusChart) {
      this.statusChart.data.datasets[0].data = [busy, free, emergency];
      this.statusChart.update();
      return;
    }
    this.statusChart = new Chart(el, {
      type: 'doughnut',
      data: {
        labels: ['En vivo', 'Libres', 'Emergencia'],
        datasets: [{ data: [busy, free, emergency], backgroundColor: ['#EF4444', '#10B981', '#F59E0B'], borderWidth: 0 }],
      },
      options: { responsive: true, plugins: { legend: { labels: { color: '#cbd5e1' } } } },
    });
  }

  private updateEventsChart(events: any[]) {
    const grouped = this.eventsByType(events);
    const el = document.getElementById('eventsChart') as HTMLCanvasElement;
    if (!el) return;
    if (this.eventsChart) {
      this.eventsChart.data.labels = grouped.map(g => g.label);
      this.eventsChart.data.datasets[0].data = grouped.map(g => g.count);
      (this.eventsChart.data.datasets[0] as any).backgroundColor = grouped.map(g => g.color);
      this.eventsChart.update();
      return;
    }
    this.eventsChart = new Chart(el, {
      type: 'bar',
      data: {
        labels: grouped.map(g => g.label),
        datasets: [{ data: grouped.map(g => g.count), backgroundColor: grouped.map(g => g.color), borderRadius: 8 }],
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#cbd5e1' } }, y: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(255,255,255,0.08)' } } } },
    });
  }

  ngOnInit() {
    this.channelsService.useAdminApi(); // dashboard: vista global con token de admin
    this.channelsService.startPolling();
    this.channels$ = this.channelsService.channels$;
    this.events$ = this.http.get<any[]>(`${environment.apiUrl}/admin/events`);
  }

  ngOnDestroy() {
    this.channelsService.stopPolling();
    this.channelsService.useDeviceApi();
  }

  total(channels: ChannelDto[]) { return channels.length; }
  busy(channels: ChannelDto[]) { return channels.filter(c => c.status === 'busy').length; }
  emergency(channels: ChannelDto[]) { return channels.filter(c => c.type === 'emergency').length; }

  pct(part: number, total: number): string {
    if (!total) return '0%';
    return Math.round((part / total) * 100) + '%';
  }

  freeCount(channels: ChannelDto[]) { return channels.filter(c => c.status !== 'busy').length; }
  busyPct(channels: ChannelDto[]) { return this.pct(this.busy(channels), this.total(channels)); }
  freePct(channels: ChannelDto[]) { return this.pct(this.freeCount(channels), this.total(channels)); }

  eventsByType(events: any[]): { label: string; count: number; color: string; w: string }[] {
    const colors: Record<string, string> = {
      floor_acquired: '#10B981',
      floor_released: '#2D6BFF',
      denied: '#F59E0B',
      floor_expired: '#EF4444',
    };
    const map = new Map<string, number>();
    (events ?? []).forEach(e => map.set(e.event, (map.get(e.event) ?? 0) + 1));
    const max = Math.max(1, ...map.values());
    return [...map.entries()].map(([label, count]) => ({
      label, count,
      color: colors[label] ?? '#14B8A6',
      w: Math.round((count / max) * 100) + '%',
    }));
  }
}

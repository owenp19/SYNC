import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonIcon, IonMenu, IonMenuButton, IonButtons, IonRefresher, IonRefresherContent } from '@ionic/angular';
import { ChannelsService, ChannelDto } from '@core/services/channels.service';
import { Subscription } from 'rxjs';

interface ChannelCard extends ChannelDto {
  description: string;
  icon: string;
  color: string;
}

const META: Record<string, { description: string; icon: string; color: string }> = {
  'Recepción': { description: 'Atención al cliente y check-in', icon: 'business', color: '#0EA5E9' },
  'Mantenimiento': { description: 'Servicios técnicos y reparaciones', icon: 'construct', color: '#F59E0B' },
  'Seguridad': { description: 'Vigilancia y monitoreo', icon: 'shield-checkmark', color: '#EF4444' },
  'Ama de llaves': { description: 'Gestión de habitaciones', icon: 'bed', color: '#14B8A6' },
  'Emergencias': { description: 'Canal prioritario 24/7', icon: 'warning', color: '#DC2626' },
  'General': { description: 'Comunicación abierta del equipo', icon: 'globe', color: '#8B5CF6' },
};

@Component({
  selector: 'app-channels',
  standalone: true,
  imports: [CommonModule, IonHeader, IonToolbar, IonTitle, IonContent, IonIcon, IonMenu, IonMenuButton, IonButtons, IonRefresher, IonRefresherContent],
  templateUrl: './channels.page.html',
  styleUrls: ['./channels.page.scss']
})
export class ChannelsPage implements OnInit, OnDestroy {
  channels: ChannelCard[] = [];
  private sub?: Subscription;

  constructor(private router: Router, private channelsService: ChannelsService) {}

  ngOnInit() {
    this.channelsService.startPolling();
    this.sub = this.channelsService.channels$.subscribe(list => {
      this.channels = list.map(c => ({ ...c, ...(META[c.name] ?? { description: '', icon: 'globe', color: '#64748B' }) }));
    });
  }

  ngOnDestroy() {
    this.channelsService.stopPolling();
    this.sub?.unsubscribe();
  }

  open(c: ChannelCard) {
    this.router.navigate(['/talk', c.id]);
  }

  statusLabel(c: ChannelCard): string {
    if (c.type === 'emergency') return 'Prioritario';
    return c.status === 'busy' ? 'Ocupado' : 'Disponible';
  }

  doRefresh(ev: any) {
    this.channelsService.refresh();
    setTimeout(() => ev.target.complete(), 600);
  }
}

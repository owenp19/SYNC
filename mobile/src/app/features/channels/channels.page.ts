import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonHeader, IonToolbar, IonContent, IonIcon, IonMenu, IonMenuButton, IonButtons, IonButton, IonRefresher, IonRefresherContent } from '@ionic/angular';
import { ChannelsService, ChannelDto } from '@core/services/channels.service';
import { DeviceService } from '@core/services/device.service';
import { Subscription, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface ChannelCard extends ChannelDto {
  description: string;
  icon: string;
  color: string;
}

const META: Record<string, { description: string; icon: string; color: string }> = {
  'Recepción': { description: 'Atención al cliente y check-in', icon: 'business', color: '#0EA5E9' },
  'Mantenimiento': { description: 'Servicios técnicos y reparaciones', icon: 'construct', color: '#F59E0B' },
  'Seguridad Interna': { description: 'Vigilancia y monitoreo', icon: 'shield-checkmark', color: '#EF4444' },
  'Ama de Llaves': { description: 'Gestión de habitaciones', icon: 'bed', color: '#14B8A6' },
  'Emergencias': { description: 'Canal prioritario 24/7', icon: 'warning', color: '#DC2626' },
  'General': { description: 'Comunicación abierta del equipo', icon: 'globe', color: '#8B5CF6' },
};

@Component({
  selector: 'app-channels',
  standalone: true,
  imports: [CommonModule, IonHeader, IonToolbar, IonContent, IonIcon, IonMenu, IonMenuButton, IonButtons, IonButton, IonRefresher, IonRefresherContent],
  templateUrl: './channels.page.html',
  styleUrls: ['./channels.page.scss']
})
export class ChannelsPage implements OnInit, OnDestroy {
  private router = inject(Router);
  private channelsService = inject(ChannelsService);
  device = inject(DeviceService);

  channels$!: Observable<ChannelCard[]>;
  loadError$!: Observable<string | null>;
  private sub?: Subscription;

  ngOnInit() {
    this.channelsService.startPolling();
    this.channels$ = this.channelsService.channels$.pipe(
      map(list => list.map(c => ({ ...c, ...(META[c.name] ?? { description: '', icon: 'globe', color: '#64748B' }) })))
    );
    this.loadError$ = this.channelsService.loadError$;
  }

  ngOnDestroy() {
    this.channelsService.stopPolling();
    this.sub?.unsubscribe();
  }

  open(c: ChannelCard) {
    (document.activeElement as HTMLElement | null)?.blur();
    this.router.navigate(['/talk', c.id]);
  }

  changeOperator() {
    this.router.navigateByUrl('/operator');
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

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonIcon, IonBadge, IonList } from '@ionic/angular';

interface ChannelCard {
  id: number;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: 'free' | 'busy' | 'emergency';
}

@Component({
  selector: 'app-channels',
  standalone: true,
  imports: [CommonModule, IonHeader, IonToolbar, IonTitle, IonContent, IonIcon, IonBadge, IonList],
  templateUrl: './channels.page.html',
  styleUrls: ['./channels.page.scss']
})
export class ChannelsPage {
  channels: ChannelCard[] = [
    { id: 1, name: 'Recepción', description: 'Atención al cliente y check-in', icon: 'business', color: '#0EA5E9', status: 'free' },
    { id: 2, name: 'Mantenimiento', description: 'Servicios técnicos y reparaciones', icon: 'construct', color: '#F59E0B', status: 'busy' },
    { id: 3, name: 'Seguridad', description: 'Vigilancia y monitoreo', icon: 'shield-checkmark', color: '#EF4444', status: 'free' },
    { id: 4, name: 'Ama de llaves', description: 'Gestión de habitaciones', icon: 'bed', color: '#14B8A6', status: 'free' },
    { id: 5, name: 'Emergencias', description: 'Canal prioritario 24/7', icon: 'warning', color: '#DC2626', status: 'emergency' },
    { id: 6, name: 'General', description: 'Comunicación abierta del equipo', icon: 'globe', color: '#8B5CF6', status: 'free' },
  ];

  constructor(private router: Router) {}

  open(c: ChannelCard) {
    this.router.navigate(['/talk', c.id]);
  }

  statusLabel(c: ChannelCard): string {
    if (c.status === 'busy') return 'Ocupado';
    if (c.status === 'emergency') return 'Prioritario';
    return 'Disponible';
  }
}

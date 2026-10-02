import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-preloader',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="preloader">
      <img src="assets/branding/logos/sync_logo_horizontal_primary.png" alt="SYNC">
      <div class="pulse-dot"></div>
      <p>Cargando SYNC...</p>
    </div>
  `,
  styles: [`
    .preloader {
      position: fixed; inset: 0; z-index: 9999;
      background: #071525;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px;
      animation: fade-in .25s ease-out;
    }
    img { width: 180px; border-radius: 16px; }
    .pulse-dot {
      width: 14px; height: 14px; border-radius: 50%;
      background: #14b8a6;
      animation: pulse 1s ease-in-out infinite;
    }
    p { color: #94a3b8; font-family: 'Roboto', sans-serif; font-size: 14px; letter-spacing: 1px; }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.8); opacity: .5; }
    }
    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `]
})
export class PreloaderComponent {}


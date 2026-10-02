import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { PreloaderComponent } from './shared/components/preloader.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, IonApp, IonRouterOutlet, PreloaderComponent],
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
      <app-preloader *ngIf="loading()"></app-preloader>
    </ion-app>
  `
})
export class AppComponent implements OnInit {
  loading = signal(true);

  ngOnInit() {
    setTimeout(() => this.loading.set(false), 1500);
  }
}
